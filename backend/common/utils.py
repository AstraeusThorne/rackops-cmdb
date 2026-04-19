import json
from django.apps import apps
from django.utils import timezone
from django.db import transaction
from django.db.models import Q
from django.core.exceptions import FieldDoesNotExist
from .models import ModelHistory, Notification, DutyPersonnel
from users.models import User


class HistoryTracker:
    """历史记录追踪器"""

    @staticmethod
    def _delete_related_notifications(content_type, object_id):
        """删除与指定对象关联的通知，避免对象回退后残留站内消息。"""
        Notification.objects.filter(
            related_content_type=content_type,
            related_object_id=object_id,
        ).delete()

    @staticmethod
    def _get_model_class_from_history(history):
        """根据历史记录解析模型类。"""
        content_type_parts = history.content_type.split('.')
        if len(content_type_parts) == 2:
            return apps.get_model(*content_type_parts)

        model_name = history.content_type
        for app_label in ['events', 'devices', 'common']:
            try:
                model_class = apps.get_model(app_label, model_name)
                if model_class:
                    return model_class
            except LookupError:
                continue
        raise ValueError(f"无法找到模型: {history.content_type}。请检查 content_type 格式是否正确。")

    @staticmethod
    def _parse_reason_metadata(history):
        """解析 reason 中保存的结构化元数据。"""
        if not history.reason:
            return {}
        try:
            data = json.loads(history.reason)
        except (TypeError, ValueError, json.JSONDecodeError):
            return {}
        return data if isinstance(data, dict) else {}

    @staticmethod
    def _find_paired_decommission_history(history):
        """
        为设备下架/回退查找成对历史记录。
        优先使用 reason 中的 paired_history_id；旧数据回退到按 SN + 时间窗口匹配。
        """
        metadata = HistoryTracker._parse_reason_metadata(history)
        paired_history_id = metadata.get('paired_history_id')
        if paired_history_id:
            return ModelHistory.objects.filter(id=paired_history_id).first()

        sn = None
        if history.content_type == 'devices.Device' and history.action == 'delete':
            sn = (history.old_data or {}).get('sn')
            target_content_type = 'devices.DecommissionedDevice'
            target_action = 'create'
        elif history.content_type == 'devices.DecommissionedDevice' and history.action == 'create':
            sn = (history.new_data or {}).get('sn')
            target_content_type = 'devices.Device'
            target_action = 'delete'
        else:
            return None

        if not sn:
            return None

        from datetime import timedelta

        window_start = history.changed_at - timedelta(minutes=5)
        window_end = history.changed_at + timedelta(minutes=5)
        candidates = ModelHistory.objects.filter(
            content_type=target_content_type,
            action=target_action,
            changed_at__gte=window_start,
            changed_at__lte=window_end,
        ).exclude(id=history.id).order_by('changed_at')

        if history.changed_by_id:
            candidates = candidates.filter(changed_by_id=history.changed_by_id)

        for candidate in candidates:
            payload = candidate.old_data if target_action == 'delete' else candidate.new_data
            if (payload or {}).get('sn') == sn:
                return candidate
        return None

    @staticmethod
    def _mark_history_reverted(history, user, is_reverting=True):
        history.reverted = is_reverting
        history.reverted_by = user if is_reverting else None
        history.reverted_at = timezone.now() if is_reverting else None
        history.save(update_fields=['reverted', 'reverted_by', 'reverted_at'])
    
    @staticmethod
    def get_field_label(model_class, field_name):
        """获取字段中文名称"""
        try:
            field = model_class._meta.get_field(field_name)
            return field.verbose_name or field_name
        except:
            return field_name
    
    @staticmethod
    def get_model_data(instance):
        """获取模型实例的数据字典（排除敏感字段）"""
        from django.db import models
        
        data = {}
        for field in instance._meta.fields:
            if field.name in ['id', 'password']:  # 跳过敏感字段
                continue
            value = getattr(instance, field.name, None)
            
            # 先处理日期时间字段（DateField, DateTimeField, TimeField）
            if isinstance(field, (models.DateField, models.DateTimeField, models.TimeField)):
                if value:
                    data[field.name] = value.isoformat()
                else:
                    data[field.name] = None
            # 处理外键字段（ForeignKey, OneToOneField）
            elif isinstance(field, (models.ForeignKey, models.OneToOneField)):
                if value:
                    data[field.name] = value.id
                else:
                    data[field.name] = None
            # 处理其他字段
            else:
                data[field.name] = value
        return data
    
    @staticmethod
    def get_changed_fields(old_data, new_data):
        """获取变更的字段列表"""
        changed = []
        all_keys = set(old_data.keys()) | set(new_data.keys())
        for key in all_keys:
            old_value = old_data.get(key)
            new_value = new_data.get(key)
            if old_value != new_value:
                changed.append(key)
        return changed
    
    @staticmethod
    def get_m2m_changes(old_instance, new_instance, m2m_fields):
        """检测多对多关系变更"""
        m2m_changes = {}
        for field_name in m2m_fields:
            try:
                old_field = getattr(old_instance, field_name)
                new_field = getattr(new_instance, field_name)
                old_ids = list(old_field.all().values_list('id', flat=True))
                new_ids = list(new_field.all().values_list('id', flat=True))
                
                # 只记录有变更的字段
                if set(old_ids) != set(new_ids):
                    m2m_changes[field_name] = {
                        'old_ids': sorted(old_ids),
                        'new_ids': sorted(new_ids)
                    }
            except Exception as e:
                # 如果字段不存在或无法访问，跳过
                continue
        return m2m_changes if m2m_changes else None
    
    @staticmethod
    def get_field_labels(model_class, field_names):
        """获取字段中文名称映射"""
        labels = {}
        for field_name in field_names:
            labels[field_name] = HistoryTracker.get_field_label(model_class, field_name)
        return labels
    
    @staticmethod
    def record_change(instance, action, user, old_instance=None, reason=None):
        """记录模型变更"""
        # 判断操作者类型
        is_admin = user and (user.is_staff or user.is_superuser)
        
        # 获取值班人员信息
        duty_personnel = None
        if user and hasattr(user, 'duty_personnel_profile'):
            duty_personnel = user.duty_personnel_profile
        
        # 获取模型类名（使用完整的 app_label.model_name 格式）
        content_type = instance._meta.label  # 如: 'events.Event'
        object_id = instance.pk
        
        old_data = None
        new_data = None
        changed_fields = []
        m2m_changes = None
        field_labels = None
        
        if action == 'create':
            # 创建操作：只记录新数据
            new_data = HistoryTracker.get_model_data(instance)
            changed_fields = list(new_data.keys())
            field_labels = HistoryTracker.get_field_labels(instance.__class__, changed_fields)
            
            # 记录多对多关系
            m2m_fields = [f.name for f in instance._meta.many_to_many]
            if m2m_fields:
                # 创建时，old_ids 为空
                m2m_changes = {}
                for field_name in m2m_fields:
                    field = getattr(instance, field_name)
                    new_ids = list(field.all().values_list('id', flat=True))
                    if new_ids:
                        m2m_changes[field_name] = {
                            'old_ids': [],
                            'new_ids': sorted(new_ids)
                        }
                m2m_changes = m2m_changes if m2m_changes else None
            
        elif action == 'update' and old_instance:
            # 更新操作：记录变更的字段
            old_data_dict = HistoryTracker.get_model_data(old_instance)
            new_data_dict = HistoryTracker.get_model_data(instance)
            
            changed_fields = HistoryTracker.get_changed_fields(old_data_dict, new_data_dict)
            
            if changed_fields:
                # 只记录变更的字段
                old_data = {k: old_data_dict[k] for k in changed_fields}
                new_data = {k: new_data_dict[k] for k in changed_fields}
                field_labels = HistoryTracker.get_field_labels(instance.__class__, changed_fields)
            
            # 检测多对多关系变更
            m2m_fields = [f.name for f in instance._meta.many_to_many]
            if m2m_fields:
                m2m_changes = HistoryTracker.get_m2m_changes(old_instance, instance, m2m_fields)
            
        elif action == 'delete':
            # 删除操作：记录完整数据（用于恢复）
            old_data = HistoryTracker.get_model_data(instance)
            changed_fields = list(old_data.keys())
            field_labels = HistoryTracker.get_field_labels(instance.__class__, changed_fields)
            
            # 记录所有多对多关系（用于恢复）
            m2m_fields = [f.name for f in instance._meta.many_to_many]
            if m2m_fields:
                m2m_changes = {}
                for field_name in m2m_fields:
                    field = getattr(instance, field_name)
                    old_ids = list(field.all().values_list('id', flat=True))
                    if old_ids:
                        m2m_changes[field_name] = {
                            'old_ids': sorted(old_ids),
                            'new_ids': []
                        }
                m2m_changes = m2m_changes if m2m_changes else None
        
        # 创建历史记录
        history = ModelHistory.objects.create(
            content_type=content_type,
            object_id=object_id,
            action=action,
            changed_by=user,
            duty_personnel=duty_personnel,
            is_admin_action=is_admin,
            old_data=old_data,
            new_data=new_data,
            changed_fields=changed_fields,
            m2m_changes=m2m_changes,
            field_labels=field_labels,
            reason=reason
        )
        return history
    
    @staticmethod
    @transaction.atomic
    def revert_to_history(history_id, user, processed_history_ids=None):
        """回退到指定的历史版本（仅管理员）"""
        if not (user.is_staff or user.is_superuser):
            raise PermissionError("只有管理员可以执行回退操作")

        if processed_history_ids is None:
            processed_history_ids = set()
        if history_id in processed_history_ids:
            return ModelHistory.objects.get(id=history_id)
        processed_history_ids.add(history_id)

        history = ModelHistory.objects.select_for_update().get(id=history_id)
        model_class = HistoryTracker._get_model_class_from_history(history)
        
        # 判断是否已回退
        is_reverting = not history.reverted
        
        if is_reverting:
            # 回退：恢复到 old_data
            restore_data = history.old_data
            restore_m2m = history.m2m_changes
        else:
            # 回退的回退：恢复到 new_data
            restore_data = history.new_data
            restore_m2m = {}
            if history.m2m_changes:
                # 反转多对多关系
                for field_name, changes in history.m2m_changes.items():
                    restore_m2m[field_name] = {
                        'old_ids': changes['new_ids'],
                        'new_ids': changes['old_ids']
                    }
        
        def _resolve_field(model_cls, key):
            """将历史数据中的键解析为当前模型的字段。兼容历史中存储的 attname（如 sn_id）。"""
            try:
                return model_cls._meta.get_field(key)
            except FieldDoesNotExist:
                if key.endswith('_id'):
                    try:
                        return model_cls._meta.get_field(key[:-3])
                    except FieldDoesNotExist:
                        pass
            return None

        if history.action == 'delete' and is_reverting:
            paired_history = HistoryTracker._find_paired_decommission_history(history)
            if (
                paired_history
                and paired_history.id not in processed_history_ids
                and not paired_history.reverted
                and paired_history.content_type == 'devices.DecommissionedDevice'
                and paired_history.action == 'create'
            ):
                paired_model_class = HistoryTracker._get_model_class_from_history(paired_history)
                try:
                    paired_instance = paired_model_class.objects.get(id=paired_history.object_id)
                    paired_instance.delete()
                except paired_model_class.DoesNotExist:
                    pass
                HistoryTracker._delete_related_notifications(
                    paired_history.content_type,
                    paired_history.object_id,
                )
                HistoryTracker._mark_history_reverted(paired_history, user, True)

            # 删除操作的回退：恢复对象
            if restore_data:
                # 创建新实例：仅使用当前模型接受的字段名（FK 用 attname，其余用 field.name）
                instance_data = {}
                for field_name, value in restore_data.items():
                    field = _resolve_field(model_class, field_name)
                    if field is None:
                        continue
                    if hasattr(field, 'related_model'):
                        if value is not None:
                            instance_data[field.attname] = value
                    elif hasattr(value, 'isoformat'):
                        from django.utils.dateparse import parse_datetime, parse_date, parse_time
                        parsed = parse_datetime(value) or parse_date(value) or parse_time(value)
                        instance_data[field.name] = parsed
                    else:
                        instance_data[field.name] = value

                pk_name = model_class._meta.pk.attname
                if model_class.objects.filter(pk=history.object_id).exists():
                    raise ValueError(
                        f"对象 {history.content_type}#{history.object_id} 已存在，无法按原主键恢复"
                    )
                instance_data[pk_name] = history.object_id
                instance = model_class(**instance_data)
                instance.save(force_insert=True)
                
                # 恢复多对多关系
                if restore_m2m:
                    for field_name, changes in restore_m2m.items():
                        if is_reverting:
                            ids_to_restore = changes['old_ids']
                        else:
                            ids_to_restore = changes['new_ids']
                        field = getattr(instance, field_name)
                        field.set(ids_to_restore)
                
        elif history.action == 'create' and is_reverting:
            paired_history = HistoryTracker._find_paired_decommission_history(history)
            if (
                paired_history
                and paired_history.id not in processed_history_ids
                and not paired_history.reverted
                and history.content_type == 'devices.DecommissionedDevice'
            ):
                HistoryTracker.revert_to_history(
                    paired_history.id,
                    user,
                    processed_history_ids=processed_history_ids,
                )
            # 创建操作的回退：删除对象
            try:
                instance = model_class.objects.get(id=history.object_id)
                instance.delete()
                HistoryTracker._delete_related_notifications(
                    history.content_type,
                    history.object_id,
                )
            except model_class.DoesNotExist:
                # 对象已被删除，无需操作
                HistoryTracker._delete_related_notifications(
                    history.content_type,
                    history.object_id,
                )
                
        elif restore_data:
            # 更新操作的回退：恢复字段值（兼容历史中的 sn_id 等键名）
            try:
                instance = model_class.objects.get(id=history.object_id)
                
                for field_name, value in restore_data.items():
                    field = _resolve_field(model_class, field_name)
                    if field is None or not hasattr(instance, field.name):
                        continue
                    attr_name = field.attname if hasattr(field, 'related_model') else field.name
                    if hasattr(field, 'related_model'):
                        if value is not None:
                            setattr(instance, attr_name, value)
                        else:
                            setattr(instance, field.name, None)
                    elif hasattr(value, 'isoformat'):
                        from django.utils.dateparse import parse_datetime, parse_date, parse_time
                        parsed = parse_datetime(value) or parse_date(value) or parse_time(value)
                        setattr(instance, attr_name, parsed)
                    else:
                        setattr(instance, attr_name, value)
                
                instance.save()
                
                # 恢复多对多关系
                if restore_m2m:
                    for field_name, changes in restore_m2m.items():
                        if is_reverting:
                            ids_to_restore = changes['old_ids']
                        else:
                            ids_to_restore = changes['new_ids']
                        field = getattr(instance, field_name)
                        field.set(ids_to_restore)
                        
            except model_class.DoesNotExist:
                raise ValueError(f"对象 {history.content_type}#{history.object_id} 不存在")
        
        # 更新回退标记
        HistoryTracker._mark_history_reverted(history, user, is_reverting)
        
        return history
    
    @staticmethod
    def batch_revert(history_ids, user):
        """批量回退"""
        results = {'success': 0, 'failed': 0, 'details': []}
        for history_id in history_ids:
            try:
                HistoryTracker.revert_to_history(history_id, user)
                results['success'] += 1
                results['details'].append({'id': history_id, 'status': 'success'})
            except Exception as e:
                results['failed'] += 1
                results['details'].append({
                    'id': history_id,
                    'status': 'failed',
                    'error': str(e)
                })
        return results


class NotificationHelper:
    """通知辅助类"""
    
    @staticmethod
    def notify_all_duty_personnel(notification_type, title, content, related_content_type=None, related_object_id=None):
        """
        向所有已审核通过的值班人员和管理员发送通知
        
        Args:
            notification_type: 通知类型（如：'new_event', 'new_alert', 'event_updated'）
            title: 通知标题
            content: 通知内容
            related_content_type: 关联模型类型（可选）
            related_object_id: 关联对象ID（可选）
        """
        # 获取所有已审核通过且有用户账户的值班人员
        duty_personnel_list = DutyPersonnel.objects.filter(
            account_status='approved',
            user__isnull=False
        ).select_related('user')
        
        # 获取所有管理员用户（is_staff=True 或 is_superuser=True）
        admin_users = User.objects.filter(
            is_active=True
        ).filter(
            Q(is_staff=True) | Q(is_superuser=True)
        )
        
        # 收集所有需要通知的用户ID，避免重复
        notified_user_ids = set()
        notifications = []
        
        # 添加值班人员
        for duty_personnel in duty_personnel_list:
            if duty_personnel.user and duty_personnel.user.is_active:
                user_id = duty_personnel.user.id
                if user_id not in notified_user_ids:
                    notifications.append(
                        Notification(
                            recipient=duty_personnel.user,
                            notification_type=notification_type,
                            title=title,
                            content=content,
                            related_content_type=related_content_type,
                            related_object_id=related_object_id
                        )
                    )
                    notified_user_ids.add(user_id)
        
        # 添加管理员（排除已经是值班人员的用户，避免重复）
        for admin_user in admin_users:
            if admin_user.id not in notified_user_ids:
                notifications.append(
                    Notification(
                        recipient=admin_user,
                        notification_type=notification_type,
                        title=title,
                        content=content,
                        related_content_type=related_content_type,
                        related_object_id=related_object_id
                    )
                )
                notified_user_ids.add(admin_user.id)
        
        # 批量插入
        if notifications:
            Notification.objects.bulk_create(notifications)
        
        return len(notifications)
