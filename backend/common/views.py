from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.db import connections
from django.db.utils import OperationalError
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.utils.dateparse import parse_datetime
from .models import Client, AuthorizedOrg, DutyPersonnel, SystemConfig, Notification, ModelHistory
from .serializers import (
    ClientSerializer, AuthorizedOrgSerializer, DutyPersonnelSerializer,
    SystemConfigSerializer, DutyPersonnelRegistrationSerializer,
    ModelHistorySerializer, NotificationSerializer
)
from .utils import HistoryTracker

User = get_user_model()


@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    """基础健康检查接口，便于快速判断服务和数据库是否可用。"""
    db_status = {}
    overall_ok = True

    for alias in ('default', 'pdu'):
        try:
            connections[alias].ensure_connection()
            db_status[alias] = 'ok'
        except OperationalError as exc:
            db_status[alias] = f'error: {exc}'
            overall_ok = False

    payload = {
        'status': 'ok' if overall_ok else 'degraded',
        'timestamp': timezone.now().isoformat(),
        'databases': db_status,
        'summary': {}
    }

    if db_status.get('default') == 'ok':
        from devices.models import Room, Device, DecommissionedDevice
        from events.models import Event

        payload['summary'].update({
            'rooms': Room.objects.count(),
            'clients': Client.objects.count(),
            'duty_personnel': DutyPersonnel.objects.count(),
            'devices': Device.objects.count(),
            'decommissioned_devices': DecommissionedDevice.objects.count(),
            'events': Event.objects.count(),
            'notifications_unread': Notification.objects.filter(is_read=False).count(),
        })

    return Response(payload, status=status.HTTP_200_OK if overall_ok else status.HTTP_503_SERVICE_UNAVAILABLE)


class ClientViewSet(viewsets.ModelViewSet):
    queryset = Client.objects.all()
    serializer_class = ClientSerializer
    
    def get_permissions(self):
        """
        为不同的操作设置不同的权限
        GET操作允许匿名访问，其他操作需要认证
        """
        if self.action in ['list', 'retrieve']:
            permission_classes = [AllowAny]
        else:
            permission_classes = [IsAuthenticated]
        return [permission() for permission in permission_classes]
    
    def perform_create(self, serializer):
        """创建时记录历史"""
        instance = serializer.save()
        HistoryTracker.record_change(
            instance=instance,
            action='create',
            user=self.request.user
        )
    
    def perform_update(self, serializer):
        """更新时记录历史"""
        old_instance = self.get_object()
        instance = serializer.save()
        HistoryTracker.record_change(
            instance=instance,
            action='update',
            user=self.request.user,
            old_instance=old_instance
        )
    
    def perform_destroy(self, instance):
        """删除时记录历史"""
        HistoryTracker.record_change(
            instance=instance,
            action='delete',
            user=self.request.user
        )
        instance.delete()


class AuthorizedOrgViewSet(viewsets.ModelViewSet):
    queryset = AuthorizedOrg.objects.all()
    serializer_class = AuthorizedOrgSerializer
    
    def get_permissions(self):
        """
        为不同的操作设置不同的权限
        GET操作允许匿名访问，其他操作需要认证
        """
        if self.action in ['list', 'retrieve']:
            permission_classes = [AllowAny]
        else:
            permission_classes = [IsAuthenticated]
        return [permission() for permission in permission_classes]
    
    def perform_create(self, serializer):
        """创建时记录历史"""
        instance = serializer.save()
        HistoryTracker.record_change(
            instance=instance,
            action='create',
            user=self.request.user
        )
    
    def perform_update(self, serializer):
        """更新时记录历史"""
        old_instance = self.get_object()
        instance = serializer.save()
        HistoryTracker.record_change(
            instance=instance,
            action='update',
            user=self.request.user,
            old_instance=old_instance
        )
    
    def perform_destroy(self, instance):
        """删除时记录历史"""
        HistoryTracker.record_change(
            instance=instance,
            action='delete',
            user=self.request.user
        )
        instance.delete()


class DutyPersonnelViewSet(viewsets.ModelViewSet):
    queryset = DutyPersonnel.objects.all()
    serializer_class = DutyPersonnelSerializer
    
    def get_permissions(self):
        """
        为不同的操作设置不同的权限
        GET操作允许匿名访问，其他操作需要认证
        """
        if self.action == 'register':
            permission_classes = [AllowAny]
        elif self.action in ['pending_approvals', 'approve', 'reject']:
            permission_classes = [IsAuthenticated]  # 需要管理员权限检查
        elif self.action in ['list', 'retrieve']:
            permission_classes = [AllowAny]
        else:
            permission_classes = [IsAuthenticated]
        return [permission() for permission in permission_classes]
    
    def get_serializer_class(self):
        """根据操作选择不同的序列化器"""
        if self.action == 'register':
            return DutyPersonnelRegistrationSerializer
        return DutyPersonnelSerializer
    
    @action(detail=False, methods=['post'], permission_classes=[AllowAny])
    def register(self, request):
        """值班人员注册"""
        serializer = self.get_serializer(data=request.data)
        if serializer.is_valid():
            duty_personnel = serializer.save()
            
            # 发送通知给所有管理员
            admins = User.objects.filter(is_staff=True) | User.objects.filter(is_superuser=True)
            for admin in admins:
                Notification.objects.create(
                    recipient=admin,
                    notification_type='account_pending',
                    title='新的值班人员注册申请',
                    content=f'值班人员 {duty_personnel.name}（员工ID: {duty_personnel.employee_id}）提交了注册申请，请及时审核。',
                    related_content_type='DutyPersonnel',
                    related_object_id=duty_personnel.id
                )
            
            return Response(
                {
                    'message': '注册成功，请等待管理员审核',
                    'duty_personnel': DutyPersonnelSerializer(duty_personnel).data
                },
                status=status.HTTP_201_CREATED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['get'])
    def pending_approvals(self, request):
        """获取待审核列表（仅管理员）"""
        if not (request.user.is_staff or request.user.is_superuser):
            return Response(
                {'error': '权限不足，只有管理员可以查看待审核列表'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        pending_list = self.queryset.filter(account_status='pending')
        serializer = self.get_serializer(pending_list, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """审核通过（仅管理员）"""
        if not (request.user.is_staff or request.user.is_superuser):
            return Response(
                {'error': '权限不足，只有管理员可以审核'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        duty_personnel = self.get_object()
        
        if duty_personnel.account_status != 'pending':
            return Response(
                {'error': '该申请已被处理'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # 审核通过
        duty_personnel.account_status = 'approved'
        duty_personnel.approved_by = request.user
        duty_personnel.approved_at = timezone.now()
        duty_personnel.save()
        
        # 激活用户账户
        if duty_personnel.user:
            duty_personnel.user.is_active = True
            duty_personnel.user.save()
        
        # 发送通知给申请人
        if duty_personnel.user:
            Notification.objects.create(
                recipient=duty_personnel.user,
                notification_type='account_approved',
                title='账户审核通过',
                content=f'您的账户审核已通过，现在可以正常登录使用系统。',
                related_content_type='DutyPersonnel',
                related_object_id=duty_personnel.id
            )
        
        return Response({
            'message': '审核通过',
            'duty_personnel': self.get_serializer(duty_personnel).data
        })
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """审核拒绝（仅管理员）"""
        if not (request.user.is_staff or request.user.is_superuser):
            return Response(
                {'error': '权限不足，只有管理员可以审核'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        duty_personnel = self.get_object()
        
        if duty_personnel.account_status != 'pending':
            return Response(
                {'error': '该申请已被处理'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        rejection_reason = request.data.get('rejection_reason', '')
        if not rejection_reason:
            return Response(
                {'error': '请提供拒绝原因'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # 审核拒绝
        duty_personnel.account_status = 'rejected'
        duty_personnel.approved_by = request.user
        duty_personnel.approved_at = timezone.now()
        duty_personnel.rejection_reason = rejection_reason
        duty_personnel.save()
        
        # 发送通知给申请人
        if duty_personnel.user:
            Notification.objects.create(
                recipient=duty_personnel.user,
                notification_type='account_rejected',
                title='账户审核未通过',
                content=f'很抱歉，您的账户审核未通过。拒绝原因：{rejection_reason}',
                related_content_type='DutyPersonnel',
                related_object_id=duty_personnel.id
            )
        
        return Response({
            'message': '审核已拒绝',
            'duty_personnel': self.get_serializer(duty_personnel).data
        })


class SystemConfigViewSet(viewsets.ModelViewSet):
    """系统配置视图集"""
    queryset = SystemConfig.objects.all()
    serializer_class = SystemConfigSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = 'key'

    def get_permissions(self):
        """
        为不同的操作设置不同的权限
        GET操作允许匿名访问，其他操作需要认证
        """
        if self.action in ['list', 'retrieve', 'get_by_category']:
            permission_classes = [AllowAny]
        else:
            permission_classes = [IsAuthenticated]
        return [permission() for permission in permission_classes]

    @action(detail=False, methods=['get'])
    def get_by_category(self, request):
        """按分类获取配置"""
        category = request.query_params.get('category')
        if not category:
            return Response(
                {'error': 'category参数是必需的'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        configs = self.queryset.filter(category=category)
        serializer = self.get_serializer(configs, many=True)
        
        # 将配置转换为字典格式，key作为键
        result = {}
        for config in serializer.data:
            result[config['key']] = config['parsed_value']
        
        return Response(result)

    @action(detail=False, methods=['post'])
    def bulk_update(self, request):
        """批量更新配置"""
        configs_data = request.data.get('configs', [])
        if not isinstance(configs_data, list):
            return Response(
                {'error': 'configs必须是数组'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        updated = []
        created = []
        errors = []
        
        for config_data in configs_data:
            key = config_data.get('key')
            if not key:
                errors.append({'error': '配置项缺少key字段'})
                continue
            
            try:
                config, created_flag = SystemConfig.objects.update_or_create(
                    key=key,
                    defaults={
                        'value': config_data.get('value'),
                        'category': config_data.get('category'),
                        'description': config_data.get('description', '')
                    }
                )
                
                if created_flag:
                    created.append(key)
                else:
                    updated.append(key)
            except Exception as e:
                errors.append({'key': key, 'error': str(e)})
        
        return Response({
            'updated': updated,
            'created': created,
            'errors': errors
        })


class ModelHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    """模型历史记录视图集（只读）"""
    queryset = ModelHistory.objects.all()
    serializer_class = ModelHistorySerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        # 只有管理员可以查看
        if not (self.request.user.is_staff or self.request.user.is_superuser):
            return ModelHistory.objects.none()
        
        queryset = super().get_queryset()
        
        # 筛选参数
        content_type = self.request.query_params.get('content_type')
        object_id = self.request.query_params.get('object_id')
        is_admin_action = self.request.query_params.get('is_admin_action')
        action = self.request.query_params.get('action')
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        reverted = self.request.query_params.get('reverted')
        
        if content_type:
            queryset = queryset.filter(content_type=content_type)
        
        if object_id:
            queryset = queryset.filter(object_id=object_id)
        
        if is_admin_action is not None:
            queryset = queryset.filter(is_admin_action=is_admin_action.lower() == 'true')
        
        if action:
            queryset = queryset.filter(action=action)
        
        if start_date:
            start_datetime = parse_datetime(start_date)
            if start_datetime:
                queryset = queryset.filter(changed_at__gte=start_datetime)
        
        if end_date:
            end_datetime = parse_datetime(end_date)
            if end_datetime:
                queryset = queryset.filter(changed_at__lte=end_datetime)
        
        if reverted is not None:
            queryset = queryset.filter(reverted=reverted.lower() == 'true')
        
        return queryset.order_by('-changed_at')
    
    @action(detail=False, methods=['get'])
    def duty_personnel_stats(self, request):
        """获取值班人员操作记录详情"""
        # 只有管理员可以查看
        if not (request.user.is_staff or request.user.is_superuser):
            return Response(
                {'error': '权限不足'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        from django.utils import timezone
        from datetime import timedelta
        
        # 获取时间范围参数（默认最近30天）
        days = int(request.query_params.get('days', 30))
        start_date = timezone.now() - timedelta(days=days)
        
        # 获取操作类型筛选（可选：create, update, delete）
        action_filter = request.query_params.get('action')
        
        # 获取内容类型筛选（可选：events.Event, devices.Device, devices.DeviceAlert, events.EntryPersonnel）
        content_type_filter = request.query_params.get('content_type')
        
        # 查询值班人员的操作记录（排除管理员操作）
        queryset = ModelHistory.objects.filter(
            duty_personnel__isnull=False,
            is_admin_action=False,
            changed_at__gte=start_date
        ).select_related('duty_personnel').order_by('-changed_at')
        
        # 应用筛选
        if action_filter:
            queryset = queryset.filter(action=action_filter)
        
        if content_type_filter:
            queryset = queryset.filter(content_type=content_type_filter)
        
        # 序列化数据
        serializer = ModelHistorySerializer(queryset, many=True)
        
        return Response({
            'records': serializer.data,
            'period_days': days,
            'start_date': start_date,
            'total_count': queryset.count()
        })
    
    @action(detail=True, methods=['post'])
    def revert(self, request, pk=None):
        """回退到该历史版本（仅管理员）"""
        if not (request.user.is_staff or request.user.is_superuser):
            return Response(
                {'error': '权限不足，只有管理员可以执行回退操作'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            history = self.get_object()
            HistoryTracker.revert_to_history(history.id, request.user)
            return Response({
                'message': '回退成功',
                'history': ModelHistorySerializer(history).data
            })
        except PermissionError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_403_FORBIDDEN
            )
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['post'])
    def batch_revert(self, request):
        """批量回退（仅管理员）"""
        if not (request.user.is_staff or request.user.is_superuser):
            return Response(
                {'error': '权限不足，只有管理员可以执行回退操作'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        history_ids = request.data.get('history_ids', [])
        if not history_ids or not isinstance(history_ids, list):
            return Response(
                {'error': 'history_ids 必须是包含历史记录ID的数组'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            results = HistoryTracker.batch_revert(history_ids, request.user)
            return Response(results)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


class NotificationViewSet(viewsets.ModelViewSet):
    """站内消息视图集"""
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return Notification.objects.filter(recipient=self.request.user)
    
    @action(detail=False, methods=['get'])
    def unread_count(self, request):
        """获取未读消息数量"""
        count = self.get_queryset().filter(is_read=False).count()
        return Response({'count': count})
    
    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        """标记为已读"""
        notification = self.get_object()
        notification.is_read = True
        notification.read_at = timezone.now()
        notification.save()
        return Response({'message': '已标记为已读'})
    
    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        """标记所有消息为已读"""
        self.get_queryset().filter(is_read=False).update(
            is_read=True,
            read_at=timezone.now()
        )
        return Response({'message': '已全部标记为已读'})
