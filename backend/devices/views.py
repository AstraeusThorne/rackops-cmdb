import os
import tempfile
import json
from datetime import datetime
from urllib.parse import quote
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.db.models import Sum, Max, Min, Q, Count
from django.db.models.functions import Coalesce
from django.http import HttpResponse
from decimal import Decimal
from .models import Room, Cabinet, Device, DecommissionedDevice, DeviceAlert, PDUDevice, PDUPort, CabinetPDUData, WarehouseDevice, WarehouseDeviceHistory
from .serializers import (
    RoomSerializer, CabinetSerializer, CabinetRoomListSerializer,
    DeviceSerializer, DeviceListSerializer,
    DecommissionedDeviceSerializer, DeviceAlertSerializer,
    PDUDeviceSerializer, PDUPortSerializer, CabinetPDUDataSerializer,
    WarehouseDeviceSerializer, WarehouseDeviceHistorySerializer
)
from django.utils.dateparse import parse_datetime
from common.models import DutyPersonnel
from common.utils import HistoryTracker, NotificationHelper
from .services import (
    DeviceDecommissionError,
    WarehouseInstallError,
    WarehouseOutOfStockError,
    decommission_device,
    install_warehouse_device,
    out_of_warehouse_device,
)


class RoomViewSet(viewsets.ModelViewSet):
    queryset = Room.objects.all()
    serializer_class = RoomSerializer
    
    def get_permissions(self):
        """
        为不同的操作设置不同的权限
        GET操作允许匿名访问，其他操作需要认证
        """
        if self.action in ['list', 'retrieve', 'usage_stats', 'cabinets_with_stats', 'cabinet_counts']:
            permission_classes = [AllowAny]
        else:
            permission_classes = [IsAuthenticated]
        return [permission() for permission in permission_classes]

    @action(detail=True, methods=['get'], url_path='cabinets-with-stats')
    def cabinets_with_stats(self, request, pk=None):
        """
        返回指定机房的机柜列表及每个机柜的设备数，供 F1B/F1D 机房页一次拉取，避免前端分页拉全量设备。
        """
        room = self.get_object()
        cabinets_qs = (
            Cabinet.objects.filter(room_id=room.id)
            .select_related('room', 'client')
            .annotate(device_count=Count('devices'))
            .order_by('id')
        )
        serializer = CabinetRoomListSerializer(cabinets_qs, many=True)
        return Response(serializer.data)
    
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

    @action(detail=False, methods=['get'], url_path='cabinet-counts')
    def cabinet_counts(self, request):
        """
        按机房统计机柜数（按 room_id 聚合），用于核对 F1D/F1B 等机房的机柜归属是否正确。
        GET /api/rooms/cabinet-counts/
        """
        from django.db.models import Count
        rows = (
            Room.objects.annotate(cabinet_count=Count('cabinets'))
            .values('id', 'name', 'cabinet_count')
            .order_by('id')
        )
        result = [{'room_id': r['id'], 'room_name': r['name'], 'cabinet_count': r['cabinet_count']} for r in rows]
        return Response(result)

    @action(detail=False, methods=['get'], url_path='usage-stats')
    def usage_stats(self, request):
        """
        首页机房使用情况：按机房聚合机柜数、已用机柜数、设备数、使用率。
        使用数据库聚合保证统计完整，避免前端分页导致统计不全。
        """
        queryset = (
            Room.objects.annotate(
                cabinet_count=Count('cabinets', distinct=True),
                device_count=Count('cabinets__devices'),
                used_cabinet_count=Count(
                    'cabinets',
                    distinct=True,
                    filter=Q(cabinets__devices__isnull=False),
                ),
            )
            .order_by('id')
        )
        result = []
        for room in queryset:
            usage_rate = (
                (room.used_cabinet_count / room.cabinet_count * 100)
                if room.cabinet_count else 0
            )
            result.append({
                'id': room.id,
                'name': room.name,
                'cabinetCount': room.cabinet_count,
                'usedCabinetsCount': room.used_cabinet_count,
                'deviceCount': room.device_count,
                'usageRate': round(usage_rate, 2),
            })
        return Response(result)


class CabinetViewSet(viewsets.ModelViewSet):
    queryset = Cabinet.objects.all()
    serializer_class = CabinetSerializer

    def get_queryset(self):
        """预加载 room、client，支持按 client、room 查询参数过滤；列表按 id 升序保证分页顺序一致"""
        queryset = Cabinet.objects.select_related('room', 'client').order_by('id')
        client_id = self.request.query_params.get('client')
        if client_id is not None:
            try:
                client_id_int = int(client_id)
                queryset = queryset.filter(client_id=client_id_int)
            except (ValueError, TypeError):
                pass
        room_id = self.request.query_params.get('room')
        if room_id is not None:
            try:
                room_id_int = int(room_id)
                queryset = queryset.filter(room_id=room_id_int)
            except (ValueError, TypeError):
                pass
        return queryset

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


class DeviceViewSet(viewsets.ModelViewSet):
    queryset = Device.objects.all()
    serializer_class = DeviceSerializer

    def get_serializer_class(self):
        """列表接口使用 DeviceListSerializer，含 event_details 便于在用设备页直接渲染"""
        if self.action == 'list':
            return DeviceListSerializer
        return DeviceSerializer


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
    
    def get_queryset(self):
        """支持按机房、机柜过滤，以及关键词搜索（跨页）"""
        queryset = Device.objects.select_related('cabinet', 'cabinet__room', 'cabinet__client').all()
        if self.action == 'list':
            queryset = queryset.prefetch_related('events', 'events__clients', 'events__authorized_orgs')

        # 关键词搜索：品牌、型号、SN、机架位置、机柜名、机房名、客户名、事件订单号（OR 条件，支持跨页）
        search = (self.request.query_params.get('search') or '').strip()
        if search and self.action == 'list':
            q = (
                Q(brand__icontains=search) |
                Q(model__icontains=search) |
                Q(sn__icontains=search) |
                Q(rack_position__icontains=search) |
                Q(cabinet__name__icontains=search) |
                Q(cabinet__room__name__icontains=search) |
                Q(cabinet__client__name__icontains=search) |
                Q(events__order_number__icontains=search)
            )
            queryset = queryset.filter(q).distinct()

        # 按机房过滤（通过机柜关联）
        room_id = self.request.query_params.get('room')
        if room_id:
            try:
                room_id_int = int(room_id)
                queryset = queryset.filter(cabinet__room_id=room_id_int)
            except (ValueError, TypeError):
                pass

        # 按机柜过滤
        cabinet_id = self.request.query_params.get('cabinet')
        if cabinet_id:
            try:
                cabinet_id_int = int(cabinet_id)
                queryset = queryset.filter(cabinet_id=cabinet_id_int)
            except (ValueError, TypeError):
                pass

        # 按客户过滤：机柜所属客户 或 事件关联客户（与列表展示的「客户」一致，支持事件客户）
        client_id = self.request.query_params.get('client')
        if client_id:
            try:
                client_id_int = int(client_id)
                queryset = queryset.filter(
                    Q(cabinet__client_id=client_id_int) | Q(events__clients=client_id_int)
                ).distinct()
            except (ValueError, TypeError):
                pass

        # 按设备类型过滤
        device_type = (self.request.query_params.get('device_type') or '').strip()
        if device_type and self.action == 'list':
            queryset = queryset.filter(device_type=device_type)

        # 列表支持按上架时间排序（上架时间取关联事件中最晚日期）
        if self.action == 'list':
            ordering = (self.request.query_params.get('ordering') or '').strip()
            if ordering in ('-installation_date', '-event_date'):
                queryset = queryset.annotate(
                    latest_event_date=Max('events__date')
                ).order_by('-latest_event_date', '-id')
            elif ordering in ('installation_date', 'event_date'):
                queryset = queryset.annotate(
                    latest_event_date=Max('events__date')
                ).order_by('latest_event_date', 'id')

        return queryset
    
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

    @action(detail=True, methods=['post'])
    def decommission(self, request, pk=None):
        """
        设备下架操作
        保存设备下架前的机柜信息到下架设备记录中
        """
        # 使用 select_related 预加载机柜信息，避免额外的数据库查询
        device = self.get_queryset().select_related('cabinet', 'cabinet__room').get(pk=pk)
        try:
            decommissioned_device = decommission_device(
                device=device,
                decommission_reason=request.data.get('decommission_reason', ''),
                status=request.data.get('status', 'decommissioned'),
                event_id=request.data.get('event_id'),
                user=request.user,
            )
        except DeviceDecommissionError as exc:
            return Response(
                {'error': str(exc)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as exc:
            return Response(
                {'error': f'设备下架失败: {str(exc)}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = DecommissionedDeviceSerializer(decommissioned_device)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def events(self, request, pk=None):
        """
        获取设备关联的事件列表，使用事件摘要序列化器
        """
        device = self.get_object()
        from events.models import EventDevice
        from events.serializers import EventSummarySerializer

        event_devices = EventDevice.objects.filter(device=device).select_related(
            'event'
        ).prefetch_related('event__clients', 'event__authorized_orgs')
        events = [ed.event for ed in event_devices]

        serializer = EventSummarySerializer(events, many=True)
        return Response(serializer.data)


class DecommissionedDeviceViewSet(viewsets.ModelViewSet):
    queryset = DecommissionedDevice.objects.all()
    serializer_class = DecommissionedDeviceSerializer

    def get_queryset(self):
        """支持关键词搜索与下架日期范围过滤（跨页）"""
        queryset = DecommissionedDevice.objects.select_related(
            'cabinet', 'cabinet__room'
        ).prefetch_related('events', 'events__clients', 'events__authorized_orgs').all()
        if self.action != 'list':
            return queryset
        params = self.request.query_params
        # 关键词搜索
        search = (params.get('search') or '').strip()
        if search:
            q = (
                Q(sn__icontains=search) |
                Q(brand__icontains=search) |
                Q(model__icontains=search) |
                Q(rack_position__icontains=search) |
                Q(decommission_reason__icontains=search) |
                Q(cabinet__name__icontains=search) |
                Q(cabinet__room__name__icontains=search) |
                Q(events__order_number__icontains=search) |
                Q(events__clients__name__icontains=search)
            )
            queryset = queryset.filter(q).distinct()
        # 下架日期范围（从关联事件获取）
        start_date = params.get('start_date')
        end_date = params.get('end_date')
        if start_date:
            queryset = queryset.filter(events__date__gte=start_date).distinct()
        if end_date:
            queryset = queryset.filter(events__date__lte=end_date).distinct()
        # 按客户过滤：机柜所属客户 或 事件关联客户（与在用设备一致）
        client_id = params.get('client')
        if client_id:
            try:
                client_id_int = int(client_id)
                queryset = queryset.filter(
                    Q(cabinet__client_id=client_id_int) | Q(events__clients=client_id_int)
                ).distinct()
            except (ValueError, TypeError):
                pass
        # 支持下架时间排序（按关联事件最早日期，与 decommission_time 属性一致）
        ordering = (params.get('ordering') or '').strip()
        if ordering == '-decommission_time':
            queryset = queryset.annotate(first_event_date=Min('events__date')).order_by('-first_event_date', '-id')
        elif ordering == 'decommission_time':
            queryset = queryset.annotate(first_event_date=Min('events__date')).order_by('first_event_date', 'id')
        return queryset

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


class DeviceAlertViewSet(viewsets.ModelViewSet):
    queryset = DeviceAlert.objects.all()
    serializer_class = DeviceAlertSerializer

    def get_queryset(self):
        """支持按关键词搜索与状态过滤（跨页）"""
        queryset = DeviceAlert.objects.select_related('device').all()
        if self.action != 'list':
            return queryset
        params = self.request.query_params
        search = (params.get('search') or '').strip()
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search) |
                Q(description__icontains=search) |
                Q(device__sn__icontains=search)
            )
        status_param = (params.get('status') or '').strip()
        if status_param and status_param != 'all':
            queryset = queryset.filter(status=status_param)
        else:
            # 全部状态时按状态排序（active 在前），再按发现时间倒序，避免首屏全是已确认
            queryset = queryset.order_by('status', '-discovered_at')
        return queryset

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
        """创建时记录历史并发送通知"""
        instance = serializer.save()
        HistoryTracker.record_change(
            instance=instance,
            action='create',
            user=self.request.user
        )
        
        # 发送通知给所有值班人员
        alert_title = instance.title or '设备告警'
        alert_level = instance.get_level_display() if hasattr(instance, 'get_level_display') else '未知级别'
        alert_description = instance.description or '无描述'
        device_name = f"设备 #{instance.device.id}" if instance.device else '未关联设备'
        
        title = f'新增告警：{alert_title}'
        content = f'告警级别：{alert_level}\n告警设备：{device_name}\n告警描述：{alert_description}\n请及时查看和处理。'
        
        NotificationHelper.notify_all_duty_personnel(
            notification_type='new_alert',
            title=title,
            content=content,
            related_content_type='devices.DeviceAlert',
            related_object_id=instance.id
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

    @staticmethod
    def _parse_discovered_at(value):
        """
        解析发现时间：支持 Excel 返回的 datetime、或字符串如 2025-02-21 10:00:00 / 2025-02-21
        未明确指定几点时（仅日期或时间为 0:00:00）统一设为 9:00
        """
        if value is None:
            return None
        if hasattr(value, 'year'):  # datetime 或 date
            if hasattr(value, 'hour'):
                # 已有具体时间则保留，否则设为 9:00
                if value.hour == 0 and value.minute == 0 and value.second == 0:
                    return datetime(value.year, value.month, value.day, 9, 0, 0)
                return value
            return datetime(value.year, value.month, value.day, 9, 0, 0)
        s = str(value).strip()
        if not s:
            return None
        dt = parse_datetime(s)
        if dt is not None:
            if dt.hour == 0 and dt.minute == 0 and dt.second == 0 and ':' not in s:
                dt = dt.replace(hour=9, minute=0, second=0)
            return dt
        date_only_fmts = ('%Y-%m-%d', '%Y/%m/%d')
        time_fmts = ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M', '%Y/%m/%d %H:%M:%S')
        for fmt in time_fmts:
            try:
                return datetime.strptime(s, fmt)
            except ValueError:
                continue
        for fmt in date_only_fmts:
            try:
                return datetime.strptime(s, fmt).replace(hour=9, minute=0, second=0)
            except ValueError:
                continue
        return None

    @action(detail=False, methods=['get'], url_path='download-import-template')
    def download_import_template(self, request):
        """
        下载设备告警批量导入 Excel 模板
        GET /api/device-alerts/download-import-template/
        """
        try:
            from openpyxl import Workbook
            from openpyxl.styles import Font, Alignment
            from openpyxl.utils import get_column_letter
        except ImportError as e:
            return Response(
                {'error': f'缺少依赖库: {str(e)}。请确保已安装 openpyxl'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        wb = Workbook()
        ws = wb.active
        ws.title = '设备告警'
        headers = ['告警标题', '告警描述', '告警级别', '状态', '发现时间', '值班人员', '设备SN']
        for col_idx, header in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col_idx, value=header)
            cell.font = Font(bold=True)
            cell.alignment = Alignment(horizontal='center', wrap_text=True)
        ws.column_dimensions[get_column_letter(1)].width = 25
        ws.column_dimensions[get_column_letter(2)].width = 40
        ws.column_dimensions[get_column_letter(3)].width = 12
        ws.column_dimensions[get_column_letter(4)].width = 12
        ws.column_dimensions[get_column_letter(5)].width = 20
        ws.column_dimensions[get_column_letter(6)].width = 14
        ws.column_dimensions[get_column_letter(7)].width = 20
        # 示例行（告警级别、状态可填中文或英文；值班人员填姓名；设备SN须在设备表中存在）
        ws.append(['CPU使用率过高', '服务器CPU使用率持续超过90%', '警告', '新增', '2025-02-21 10:00:00', '张三', ''])
        ws.append(['磁盘空间不足', '根分区剩余空间小于10%', '严重', '新增', '', '', 'SN123456'])
        from io import BytesIO
        buffer = BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        response = HttpResponse(
            buffer.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        filename_cn = '设备告警导入模板.xlsx'
        response['Content-Disposition'] = (
            'attachment; filename="device_alert_import_template.xlsx"; '
            'filename*=UTF-8\'\'' + quote(filename_cn, safe='')
        )
        return response

    @action(detail=False, methods=['get'], url_path='export')
    def export(self, request):
        """
        导出设备告警列表为 Excel（支持与列表相同的 search、status 筛选）
        GET /api/device-alerts/export/?search=xxx&status=active
        """
        try:
            from openpyxl import Workbook
            from openpyxl.styles import Font, Alignment
            from openpyxl.utils import get_column_letter
        except ImportError as e:
            return Response(
                {'error': f'缺少依赖库: {str(e)}。请确保已安装 openpyxl'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        params = request.query_params
        search = (params.get('search') or '').strip()
        status_param = (params.get('status') or '').strip()
        queryset = DeviceAlert.objects.select_related(
            'device', 'device__cabinet', 'device__cabinet__room', 'duty_personnel'
        ).all()
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search) |
                Q(description__icontains=search) |
                Q(device__sn__icontains=search)
            )
        if status_param and status_param != 'all':
            queryset = queryset.filter(status=status_param)
        else:
            queryset = queryset.order_by('status', '-discovered_at')
        wb = Workbook()
        ws = wb.active
        ws.title = '设备告警'
        headers = [
            '告警标题', '告警描述', '告警级别', '状态', '发现时间', '值班人员', '设备SN',
            '机房', '机柜', 'U位',
            '解决时间', '解决备注'
        ]
        for col_idx, header in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col_idx, value=header)
            cell.font = Font(bold=True)
            cell.alignment = Alignment(horizontal='center', wrap_text=True)
        for idx in range(1, len(headers) + 1):
            # 告警标题/描述/解决备注略宽，设备SN 列放宽以便长序列号完整显示
            if idx in (1, 2, 12):
                w = 18
            elif idx == 7:  # 设备SN
                w = 28
            else:
                w = 14
            ws.column_dimensions[get_column_letter(idx)].width = w
        def _fmt_dt(dt):
            if dt is None:
                return ''
            if hasattr(dt, 'strftime'):
                return dt.strftime('%Y-%m-%d %H:%M')
            return str(dt)
        for row_idx, alert in enumerate(queryset, start=2):
            device = alert.device
            room_name = ''
            cabinet_name = ''
            u_position = ''
            if device:
                if device.cabinet:
                    cabinet_name = device.cabinet.name or ''
                    if device.cabinet.room:
                        room_name = device.cabinet.room.name or ''
                u_position = device.rack_position or ''
                if device.u_size and not u_position:
                    u_position = str(device.u_size) + 'U'
                elif device.u_size and u_position:
                    u_position = f"{u_position} ({device.u_size}U)"
            ws.append([
                alert.title or '',
                alert.description or '',
                alert.get_level_display() if hasattr(alert, 'get_level_display') else alert.level or '',
                alert.get_status_display() if hasattr(alert, 'get_status_display') else alert.status or '',
                _fmt_dt(alert.discovered_at),
                alert.duty_personnel.name if alert.duty_personnel else '',
                device.sn if device else '',
                room_name,
                cabinet_name,
                u_position,
                _fmt_dt(alert.resolved_at),
                alert.resolution_notes or '',
            ])
        from io import BytesIO
        buffer = BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        response = HttpResponse(
            buffer.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        filename_cn = '设备告警导出.xlsx'
        response['Content-Disposition'] = (
            'attachment; filename="device_alerts_export.xlsx"; '
            'filename*=UTF-8\'\'' + quote(filename_cn, safe='')
        )
        return response

    @action(detail=False, methods=['post'], url_path='batch-import')
    def batch_import(self, request):
        """
        批量导入设备告警（Excel）
        POST /api/device-alerts/batch-import/
        表单字段: file (Excel 文件)
        Excel 列: 告警标题, 告警描述, 告警级别, 状态(可选), 发现时间(可选), 值班人员(可选,填姓名), 设备SN(可选,须在设备表中存在)
        告警级别: 中文(提示/警告/严重/紧急)或英文(info/warning/critical/emergency)
        状态: 中文(新增/已确认/已解除/已关闭)或英文(active/acknowledged/resolved/closed)
        """
        if 'file' not in request.FILES:
            return Response(
                {'error': '未上传文件', 'detail': '请选择 Excel 文件后重试'},
                status=status.HTTP_400_BAD_REQUEST
            )
        file = request.FILES['file']
        if not file.name.endswith(('.xlsx', '.xls')):
            return Response(
                {'error': '文件格式不支持，请上传 .xlsx 或 .xls 文件'},
                status=status.HTTP_400_BAD_REQUEST
            )
        try:
            from openpyxl import load_workbook
        except ImportError:
            return Response(
                {'error': '服务端未安装 openpyxl，无法解析 Excel'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx')
        try:
            for chunk in file.chunks():
                temp_file.write(chunk)
            temp_file.close()
            wb = load_workbook(temp_file.name, data_only=True)
            if '设备告警' not in wb.sheetnames:
                ws = wb.active
            else:
                ws = wb['设备告警']
            rows = list(ws.iter_rows(min_row=1, values_only=True))
            if not rows:
                return Response(
                    {'error': '文件中没有数据'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            header_row = [str(c).strip() if c is not None else '' for c in rows[0]]
            title_idx = next((i for i, h in enumerate(header_row) if '告警标题' in h or h == '告警标题'), None)
            desc_idx = next((i for i, h in enumerate(header_row) if '告警描述' in h or h == '告警描述'), None)
            level_idx = next((i for i, h in enumerate(header_row) if '告警级别' in h or h == '告警级别'), None)
            status_idx = next((i for i, h in enumerate(header_row) if '状态' in h or h == '状态'), None)
            discovered_idx = next((i for i, h in enumerate(header_row) if '发现时间' in h or h == '发现时间'), None)
            duty_idx = next((i for i, h in enumerate(header_row) if '值班人员' in h or h == '值班人员'), None)
            sn_idx = next((i for i, h in enumerate(header_row) if '设备SN' in h or h == '设备SN'), None)
            if title_idx is None or desc_idx is None or level_idx is None:
                return Response(
                    {'error': '表头必须包含：告警标题、告警描述、告警级别'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            # 告警级别：英文或中文 -> 英文 code
            LEVEL_MAP = {
                'info': 'info', 'warning': 'warning', 'critical': 'critical', 'emergency': 'emergency',
                '提示': 'info', '警告': 'warning', '严重': 'critical', '紧急': 'emergency',
            }
            # 状态：英文或中文 -> 英文 code
            STATUS_MAP = {
                'active': 'active', 'acknowledged': 'acknowledged', 'resolved': 'resolved', 'closed': 'closed',
                '新增': 'active', '已确认': 'acknowledged', '已解除': 'resolved', '已关闭': 'closed',
            }
            created = 0
            errors = []
            serializer_class = self.get_serializer_class()
            for row_idx, row in enumerate(rows[1:], start=2):
                try:
                    title = str(row[title_idx]).strip() if title_idx < len(row) and row[title_idx] is not None else ''
                    desc = str(row[desc_idx]).strip() if desc_idx < len(row) and row[desc_idx] is not None else ''
                    level_raw = str(row[level_idx]).strip() if level_idx < len(row) and row[level_idx] is not None else 'warning'
                    level = LEVEL_MAP.get(level_raw) or LEVEL_MAP.get(level_raw.strip().lower()) or 'warning'
                    status_raw = ''
                    if status_idx is not None and status_idx < len(row) and row[status_idx] is not None:
                        status_raw = str(row[status_idx]).strip()
                    alert_status = STATUS_MAP.get(status_raw) or STATUS_MAP.get(status_raw.lower()) or 'active'
                    discovered_at_parsed = None
                    if discovered_idx is not None and discovered_idx < len(row) and row[discovered_idx] is not None:
                        discovered_at_parsed = self._parse_discovered_at(row[discovered_idx])
                    duty_name = ''
                    if duty_idx is not None and duty_idx < len(row) and row[duty_idx] is not None:
                        duty_name = str(row[duty_idx]).strip()
                    device_sn = str(row[sn_idx]).strip() if sn_idx is not None and sn_idx < len(row) and row[sn_idx] is not None else ''
                    if not title or not desc:
                        errors.append({'row': row_idx, 'message': '告警标题和告警描述不能为空'})
                        continue
                    # 设备SN：若填写则必须在设备表中存在
                    device = None
                    if device_sn:
                        device = Device.objects.filter(sn=device_sn).first()
                        if not device:
                            errors.append({'row': row_idx, 'message': f'设备表中不存在该SN：{device_sn!r}'})
                            continue
                    # 值班人员：若填写则按姓名匹配，不存在则报错
                    duty_personnel = None
                    if duty_name:
                        duty_personnel = DutyPersonnel.objects.filter(name=duty_name).first()
                        if not duty_personnel:
                            errors.append({'row': row_idx, 'message': f'值班人员不存在：{duty_name!r}'})
                            continue
                    data = {
                        'title': title[:200],
                        'description': desc,
                        'level': level,
                        'status': alert_status,
                        'device': device.id if device else None,
                        'duty_personnel': duty_personnel.id if duty_personnel else None,
                    }
                    serializer = serializer_class(data=data, context={'request': request})
                    if not serializer.is_valid():
                        errors.append({'row': row_idx, 'message': serializer.errors})
                        continue
                    instance = serializer.save()
                    if discovered_at_parsed is not None:
                        instance.discovered_at = discovered_at_parsed
                        instance.save(update_fields=['discovered_at'])
                    HistoryTracker.record_change(
                        instance=instance,
                        action='create',
                        user=request.user
                    )
                    alert_title = instance.title or '设备告警'
                    alert_level = instance.get_level_display() if hasattr(instance, 'get_level_display') else '未知级别'
                    alert_description = instance.description or '无描述'
                    device_name = f"设备 #{instance.device.id}" if instance.device else '未关联设备'
                    NotificationHelper.notify_all_duty_personnel(
                        notification_type='new_alert',
                        title=f'新增告警：{alert_title}',
                        content=f'告警级别：{alert_level}\n告警设备：{device_name}\n告警描述：{alert_description}\n请及时查看和处理。',
                        related_content_type='devices.DeviceAlert',
                        related_object_id=instance.id
                    )
                    created += 1
                except Exception as e:
                    errors.append({'row': row_idx, 'message': str(e)})
            return Response({
                'success': True,
                'created': created,
                'failed': len(errors),
                'errors': errors[:50],
            }, status=status.HTTP_200_OK)
        finally:
            if os.path.exists(temp_file.name):
                try:
                    os.unlink(temp_file.name)
                except OSError:
                    pass


class PDUDeviceViewSet(viewsets.ModelViewSet):
    """PDU设备视图集"""
    queryset = PDUDevice.objects.all()
    serializer_class = PDUDeviceSerializer
    
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
    
    def get_queryset(self):
        """支持按机房和电路类型过滤"""
        queryset = PDUDevice.objects.all()
        room_id = self.request.query_params.get('room')
        circuit_type = self.request.query_params.get('circuit_type')
        
        if room_id:
            queryset = queryset.filter(room_id=room_id)
        if circuit_type:
            queryset = queryset.filter(circuit_type=circuit_type)
        
        return queryset


class PDUPortViewSet(viewsets.ModelViewSet):
    """PDU端口视图集"""
    queryset = PDUPort.objects.all()
    serializer_class = PDUPortSerializer
    
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
    
    def get_queryset(self):
        """支持按PDU设备和机柜过滤"""
        queryset = PDUPort.objects.all()
        pdu_device_id = self.request.query_params.get('pdu_device')
        cabinet_id = self.request.query_params.get('cabinet')
        
        if pdu_device_id:
            queryset = queryset.filter(pdu_device_id=pdu_device_id)
        if cabinet_id:
            queryset = queryset.filter(cabinet_id=cabinet_id)
        
        return queryset.select_related('pdu_device')
    
    @action(detail=False, methods=['get'])
    def batch_by_cabinets(self, request):
        """
        批量获取多个机柜的PDU端口
        
        查询参数:
        - cabinet_ids: 机柜ID列表，逗号分隔（如: ?cabinet_ids=1,2,3）
        - group_by_cabinet: 是否按机柜分组（默认: true）
          如果为true，返回格式为 { cabinet_1: [...], cabinet_2: [...] }
          如果为false，返回所有端口的扁平数组
        
        返回格式（group_by_cabinet=true）:
        {
            "cabinet_1": [
                {
                    "id": 1,
                    "pdu_device": 1,
                    "pdu_device_name": "F1D-PDUA-1",
                    "port_number": "01",
                    "port_identifier": "F1D-PDUA-1-01",
                    "cabinet_id": 1,
                    "cabinet_name": "08-01",
                    "status": "active"
                },
                ...
            ],
            "cabinet_2": [...]
        }
        
        返回格式（group_by_cabinet=false）:
        [
            {
                "id": 1,
                "pdu_device": 1,
                "pdu_device_name": "F1D-PDUA-1",
                "port_number": "01",
                "port_identifier": "F1D-PDUA-1-01",
                "cabinet_id": 1,
                "cabinet_name": "08-01",
                "status": "active"
            },
            ...
        ]
        """
        cabinet_ids_param = request.query_params.get('cabinet_ids')
        group_by_cabinet = request.query_params.get('group_by_cabinet', 'true').lower() == 'true'
        
        if not cabinet_ids_param:
            return Response(
                {'error': '需要提供cabinet_ids参数（机柜ID列表，逗号分隔）'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # 解析机柜ID列表
        try:
            cabinet_ids = [int(id.strip()) for id in cabinet_ids_param.split(',') if id.strip()]
        except ValueError:
            return Response(
                {'error': 'cabinet_ids参数格式错误，应为逗号分隔的数字列表'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not cabinet_ids:
            return Response(
                {'error': 'cabinet_ids参数不能为空'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # 批量获取这些机柜的所有PDU端口
            ports = PDUPort.objects.filter(
                cabinet_id__in=cabinet_ids
            ).select_related('pdu_device').order_by('cabinet_id', 'port_number')
            
            if not ports.exists():
                return Response({} if group_by_cabinet else [])
            
            # 序列化数据
            serializer = self.get_serializer(ports, many=True)
            port_data = serializer.data
            
            if group_by_cabinet:
                # 按机柜分组
                result = {}
                for port in port_data:
                    cabinet_id = port.get('cabinet_id') or port.get('cabinet')
                    if cabinet_id is None:
                        continue
                    
                    cabinet_key = f"cabinet_{cabinet_id}"
                    if cabinet_key not in result:
                        result[cabinet_key] = []
                    
                    result[cabinet_key].append(port)
                
                return Response(result)
            else:
                # 返回扁平数组
                return Response(port_data)
                
        except Exception as e:
            return Response(
                {'error': f'获取端口数据时发生错误: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class CabinetPDUDataViewSet(viewsets.ModelViewSet):
    """PDU数据视图集"""
    queryset = CabinetPDUData.objects.all()
    serializer_class = CabinetPDUDataSerializer
    pagination_class = None  # 禁用分页，历史数据查询需要返回所有数据
    
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
    
    def get_queryset(self):
        """支持多种过滤条件"""
        queryset = CabinetPDUData.objects.all()
        
        # 按PDU端口过滤
        pdu_port_id = self.request.query_params.get('pdu_port')
        if pdu_port_id:
            queryset = queryset.filter(pdu_port_id=pdu_port_id)
        
        # 按数据类型过滤
        data_type = self.request.query_params.get('data_type')
        if data_type:
            queryset = queryset.filter(data_type=data_type)
        
        # 按时间范围过滤
        start_time = self.request.query_params.get('start_time')
        end_time = self.request.query_params.get('end_time')
        if start_time:
            queryset = queryset.filter(timestamp__gte=start_time)
        if end_time:
            queryset = queryset.filter(timestamp__lte=end_time)
        
        # 按数据来源过滤
        source = self.request.query_params.get('source')
        if source:
            queryset = queryset.filter(source=source)
        
        # 按导入批次过滤
        import_batch = self.request.query_params.get('import_batch')
        if import_batch:
            queryset = queryset.filter(import_batch=import_batch)
        
        return queryset.select_related('pdu_port__pdu_device')
    
    @action(detail=False, methods=['get'])
    def latest(self, request):
        """获取最新数据"""
        pdu_port_id = request.query_params.get('pdu_port')
        if not pdu_port_id:
            return Response(
                {'error': '需要提供pdu_port参数'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # 获取每个数据类型的最新一条数据
        data_types = ['current', 'power', 'energy', 'thd_current', 'switch_status']
        latest_data = []
        
        for data_type in data_types:
            latest = CabinetPDUData.objects.filter(
                pdu_port_id=pdu_port_id,
                data_type=data_type
            ).order_by('-timestamp').first()
            
            if latest:
                serializer = self.get_serializer(latest)
                latest_data.append(serializer.data)
        
        return Response(latest_data)
    
    @action(detail=False, methods=['get'])
    def batch_latest_by_cabinets(self, request):
        """
        批量获取多个机柜的最新PDU数据（按机柜聚合）
        
        查询参数:
        - cabinet_ids: 机柜ID列表，逗号分隔（如: ?cabinet_ids=1,2,3）
        - data_type: 数据类型（可选，默认: power）
          可选值: current, power, energy, thd_current, switch_status
        - aggregate: 是否按机柜聚合（默认: true）
          如果为true，返回每个机柜的总值；如果为false，返回每个端口的详细数据
        
        返回格式:
        {
            "cabinet_1": {
                "total_power": 1500.0,  // 单位: W
                "unit": "W",
                "port_count": 2,
                "last_update": "2025-12-02T10:00:00Z"
            },
            "cabinet_2": {
                "total_power": 2300.0,
                "unit": "W",
                "port_count": 3,
                "last_update": "2025-12-02T10:00:00Z"
            }
        }
        """
        cabinet_ids_param = request.query_params.get('cabinet_ids')
        data_type = request.query_params.get('data_type', 'power')
        aggregate = request.query_params.get('aggregate', 'true').lower() == 'true'
        
        if not cabinet_ids_param:
            return Response(
                {'error': '需要提供cabinet_ids参数（机柜ID列表，逗号分隔）'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # 解析机柜ID列表
        try:
            cabinet_ids = [int(id.strip()) for id in cabinet_ids_param.split(',') if id.strip()]
        except ValueError:
            return Response(
                {'error': 'cabinet_ids参数格式错误，应为逗号分隔的数字列表'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not cabinet_ids:
            return Response(
                {'error': 'cabinet_ids参数不能为空'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # 验证数据类型
        valid_data_types = ['current', 'power', 'energy', 'thd_current', 'switch_status']
        if data_type not in valid_data_types:
            return Response(
                {'error': f'data_type参数无效，可选值: {", ".join(valid_data_types)}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # 获取这些机柜的所有PDU端口（使用select_related优化查询）
            ports = PDUPort.objects.filter(
                cabinet_id__in=cabinet_ids
            ).select_related('pdu_device').order_by('cabinet_id', 'port_number')
            
            if not ports.exists():
                return Response({})
            
            port_ids = list(ports.values_list('id', flat=True))
            # 创建端口ID到机柜ID的映射
            port_to_cabinet = {port.id: port.cabinet_id for port in ports}
            
            # 获取每个端口的最新数据
            # 使用更高效的方式：先获取每个端口的最大时间戳，然后获取对应的数据
            from django.db.models import OuterRef, Subquery
            
            # 为每个端口获取最新时间戳
            max_timestamps = CabinetPDUData.objects.filter(
                pdu_port_id__in=port_ids,
                data_type=data_type
            ).values('pdu_port_id').annotate(
                max_timestamp=Max('timestamp')
            )
            
            # 如果没有数据，返回空结果
            if not max_timestamps.exists():
                if aggregate:
                    # 返回空对象，但包含所有机柜（值为0）
                    result = {}
                    for cabinet_id in cabinet_ids:
                        result[f"cabinet_{cabinet_id}"] = {
                            'cabinet_id': cabinet_id,
                            'total_value': 0.0,
                            'unit': 'W' if data_type == 'power' else 'A',
                            'port_count': 0,
                            'last_update': None
                        }
                    return Response(result)
                else:
                    return Response([])
            
            # 构建查询条件：获取每个端口在最大时间戳的数据
            port_latest_map = {}
            for item in max_timestamps:
                port_id = item['pdu_port_id']
                max_ts = item['max_timestamp']
                
                if max_ts is None:
                    continue
                
                # 获取该端口在最大时间戳的数据（可能有多个，取第一个）
                latest = CabinetPDUData.objects.filter(
                    pdu_port_id=port_id,
                    data_type=data_type,
                    timestamp=max_ts
                ).select_related('pdu_port').first()
                
                if latest:
                    port_latest_map[port_id] = latest
            
            if aggregate:
                # 按机柜聚合数据（使用已创建的映射）
                result = {}
                
                # 先初始化所有机柜（即使没有数据也返回0）
                for cabinet_id in cabinet_ids:
                    result[f"cabinet_{cabinet_id}"] = {
                        'cabinet_id': cabinet_id,
                        'total_value': Decimal('0'),
                        'unit': 'W' if data_type == 'power' else 'A',
                        'port_count': 0,
                        'last_update': None
                    }
                
                # 处理有数据的端口
                for port_id, data in port_latest_map.items():
                    cabinet_id = port_to_cabinet.get(port_id)
                    if cabinet_id is None:
                        continue
                    
                    cabinet_key = f"cabinet_{cabinet_id}"
                    if cabinet_key not in result:
                        result[cabinet_key] = {
                            'cabinet_id': cabinet_id,
                            'total_value': Decimal('0'),
                            'unit': data.unit if data.unit else ('W' if data_type == 'power' else 'A'),
                            'port_count': 0,
                            'last_update': None
                        }
                    
                    # 转换单位到标准单位（W）
                    try:
                        value = Decimal(str(data.value)) if data.value is not None else Decimal('0')
                        if data.unit == 'kW':
                            value = value * Decimal('1000')  # 转换为W
                        elif data.unit == 'mW':
                            value = value / Decimal('1000')  # 转换为W
                        
                        result[cabinet_key]['total_value'] += value
                        result[cabinet_key]['port_count'] += 1
                        
                        # 更新单位（使用第一个有效数据的单位）
                        if result[cabinet_key]['port_count'] == 1 and data.unit:
                            result[cabinet_key]['unit'] = data.unit
                        
                        # 更新最后更新时间
                        if data.timestamp:
                            if (result[cabinet_key]['last_update'] is None or 
                                data.timestamp > result[cabinet_key]['last_update']):
                                result[cabinet_key]['last_update'] = data.timestamp
                    except (ValueError, TypeError) as e:
                        print(f"处理端口 {port_id} 数据时出错: {e}, value: {data.value}, unit: {data.unit}")
                        continue
                
                # 转换Decimal为float，格式化输出
                formatted_result = {}
                for key, value in result.items():
                    try:
                        formatted_result[key] = {
                            'cabinet_id': value['cabinet_id'],
                            'total_value': float(value['total_value']),
                            'unit': 'W' if data_type == 'power' else (value.get('unit', 'A')),
                            'port_count': value['port_count'],
                            'last_update': value['last_update'].isoformat() if value['last_update'] else None
                        }
                    except Exception as e:
                        print(f"格式化机柜 {key} 数据时出错: {e}")
                        continue
                
                return Response(formatted_result)
            else:
                # 返回每个端口的详细数据
                result = []
                for port_id, data in port_latest_map.items():
                    port = next((p for p in ports if p.id == port_id), None)
                    if port:
                        serializer = self.get_serializer(data)
                        result.append(serializer.data)
                
                return Response(result)
                
        except Exception as e:
            import traceback
            error_detail = traceback.format_exc()
            print(f"批量查询PDU数据错误: {str(e)}")
            print(f"错误详情: {error_detail}")
            return Response(
                {'error': f'获取数据时发生错误: {str(e)}', 'detail': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['get'], url_path='download-import-template')
    def download_import_template(self, request):
        """
        下载弱电数据导入 Excel 模板。
        GET /api/cabinet-pdu-data/download-import-template/
        模板列：时间, 端口标识, 数据类型, 数值, 单位
        """
        try:
            from openpyxl import Workbook
            from openpyxl.styles import Font, Alignment
        except ImportError:
            return Response(
                {'error': '服务端未安装 openpyxl，无法生成模板'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        from io import BytesIO
        wb = Workbook()
        ws = wb.active
        ws.title = '弱电数据'
        headers = ['时间', '端口标识', '数据类型', '数值', '单位']
        for col, h in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col, value=h)
            cell.font = Font(bold=True)
        # 示例行：按小时
        from datetime import datetime, timedelta
        base = datetime(2026, 2, 25, 0, 0)
        for row in range(24):
            t = base + timedelta(hours=row)
            ws.cell(row=row + 2, column=1, value=t.strftime('%Y-%m-%d %H:%M'))
            ws.cell(row=row + 2, column=2, value='F1D-PDUA-1-01')
            ws.cell(row=row + 2, column=3, value='power')
            ws.cell(row=row + 2, column=4, value=100.0 + row * 2)
            ws.cell(row=row + 2, column=5, value='W')
        from openpyxl.utils import get_column_letter
        for col in range(1, 6):
            ws.column_dimensions[get_column_letter(col)].width = 18
        buffer = BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        filename = '弱电数据导入模板.xlsx'
        response = HttpResponse(
            buffer.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = f'attachment; filename="{quote(filename)}"'
        return response

    @action(detail=False, methods=['post'], url_path='batch-import')
    def batch_import(self, request):
        """
        批量导入弱电数据（Excel 或 JSON）。

        - POST /api/cabinet-pdu-data/batch-import/
        - 表单字段: file

        支持两种格式：
        1. Excel：列为「时间, 端口标识, 数据类型, 数值, 单位(可选)」
        2. JSON：结构为
           {
             "date": "2026-02-25",
             "rows": [
               {
                 "date": "2026-02-25",
                 "hour": 0,
                 "room": "F1D",
                 "device_name": "F1D-PDUA-1",
                 "port_identifier": "F1D-PDUA-1-01",
                 "cabinet_name": "08-01",
                 "current": 2.87,
                 "power": 0.63,
                 "energy": 16838.84,
                 "thd_current": 0.0,
                 "switch_status": "开启"
               },
               ...
             ]
           }
        """
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response(
                {'error': '未上传文件', 'detail': '请选择文件后重试'},
                status=status.HTTP_400_BAD_REQUEST
            )
        from django.utils.dateparse import parse_datetime
        import re
        created = 0
        failed = 0
        errors = []
        max_errors = 50
        data_type_choices = {'current', 'power', 'energy', 'thd_current', 'switch_status'}
        # 默认单位
        default_unit = {'current': 'A', 'power': 'W', 'energy': 'kWh', 'thd_current': '%', 'switch_status': '1'}
        import_batch = datetime.now().strftime('%Y%m%d%H%M')

        # ---------- JSON 导入（PDU 导出 JSON 文件） ----------
        filename = getattr(file_obj, 'name', '') or ''
        content_type = getattr(file_obj, 'content_type', '') or ''
        if filename.lower().endswith('.json') or 'json' in (content_type or '').lower():
            rows = []
            try:
                raw = file_obj.read()
                text = raw.decode('utf-8') if isinstance(raw, bytes) else str(raw)
                payload = json.loads(text)
                rows = payload.get('rows') or []
            except Exception as e:
                return Response(
                    {
                        'created': 0,
                        'failed': 0,
                        'errors': [{'row': '-', 'message': f'JSON 解析失败: {e}'}],
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if not isinstance(rows, list):
                return Response(
                    {
                        'created': 0,
                        'failed': 0,
                        'errors': [{'row': '-', 'message': 'JSON 中 rows 字段必须为数组'}],
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            metric_fields = [
                ('current', 'current'),
                ('power', 'power'),
                ('energy', 'energy'),
                ('thd_current', 'thd_current'),
                ('switch_status', 'switch_status'),
            ]

            for row_idx, item in enumerate(rows, start=1):
                if len(errors) >= max_errors:
                    break
                try:
                    date_str = str(item.get('date') or '').strip()
                    hour_val = item.get('hour')
                    port_identifier = str(item.get('port_identifier') or '').strip()

                    # 空行直接跳过
                    if not date_str and hour_val is None and not port_identifier:
                        continue

                    if not date_str or hour_val is None or not port_identifier:
                        errors.append({'row': row_idx, 'message': 'date/hour/port_identifier 不能为空'})
                        failed += 1
                        continue

                    try:
                        hour_int = int(hour_val)
                        if not (0 <= hour_int <= 23):
                            raise ValueError
                    except Exception:
                        errors.append({'row': row_idx, 'message': 'hour 必须是 0-23 的整数'})
                        failed += 1
                        continue

                    try:
                        ts = datetime.strptime(f'{date_str} {hour_int:02d}:00', '%Y-%m-%d %H:%M')
                    except Exception:
                        errors.append(
                            {'row': row_idx, 'message': 'date/hour 时间格式错误，应为 YYYY-MM-DD + 小时(0-23)'}
                        )
                        failed += 1
                        continue

                    port = PDUPort.objects.filter(port_identifier=port_identifier).first()
                    if not port:
                        errors.append({'row': row_idx, 'message': f'未找到端口标识: {port_identifier}'})
                        failed += 1
                        continue

                    # 展开 current / power / energy / thd_current / switch_status 为多条记录
                    for field_name, data_type in metric_fields:
                        raw_val = item.get(field_name)
                        if raw_val is None or raw_val == '':
                            continue

                        if data_type == 'switch_status':
                            # 支持「开启/关闭」等中文，转换为 1/0
                            try:
                                if isinstance(raw_val, str):
                                    v = raw_val.strip().lower()
                                    if v in ('开启', '开', 'on', '1', 'true', '是', 'y', 'yes'):
                                        value_num = Decimal('1')
                                    elif v in ('关闭', '关', 'off', '0', 'false', '否', 'n', 'no'):
                                        value_num = Decimal('0')
                                    else:
                                        value_num = Decimal('0')
                                        errors.append(
                                            {
                                                'row': row_idx,
                                                'message': f'switch_status 值未识别: {raw_val}，按 0 处理',
                                            }
                                        )
                                        if len(errors) >= max_errors:
                                            break
                                else:
                                    value_num = Decimal(str(raw_val))
                                unit = '1'
                            except Exception:
                                failed += 1
                                errors.append({'row': row_idx, 'message': f'switch_status 数值格式错误: {raw_val}'})
                                if len(errors) >= max_errors:
                                    break
                                continue
                        else:
                            try:
                                value_num = Decimal(str(raw_val))
                            except Exception:
                                failed += 1
                                errors.append({'row': row_idx, 'message': f'{field_name} 数值格式错误'})
                                if len(errors) >= max_errors:
                                    break
                                continue
                            unit = default_unit.get(data_type, 'W')

                        # 幂等导入：同一 (端口, 类型, 时间, source) 已存在时执行更新
                        obj, created_flag = CabinetPDUData.objects.update_or_create(
                            pdu_port_id=port.id,
                            data_type=data_type,
                            timestamp=ts,
                            source='manual_import',
                            defaults={
                                'value': value_num,
                                'unit': unit,
                                'import_batch': import_batch,
                            },
                        )
                        if created_flag:
                            created += 1
                except Exception as e:
                    failed += 1
                    errors.append({'row': row_idx, 'message': str(e)})

            return Response({'created': created, 'failed': failed, 'errors': errors[:max_errors]})

        # ---------- Excel 导入（原有逻辑） ----------
        try:
            from openpyxl import load_workbook
        except ImportError:
            return Response(
                {'error': '服务端未安装 openpyxl，无法解析 Excel'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        try:
            wb = load_workbook(filename=file_obj, read_only=True, data_only=True)
            ws = wb.active
            if not ws:
                return Response({'created': 0, 'failed': 0, 'errors': [{'row': '-', 'message': 'Excel 无有效 Sheet'}]})
            rows = list(ws.iter_rows(min_row=1, values_only=True))
            if not rows:
                return Response({'created': 0, 'failed': 0, 'errors': [{'row': 1, 'message': '无表头行'}]})
            header_row = [str(c).strip() if c is not None else '' for c in rows[0]]
            if '时间' not in header_row or '端口标识' not in header_row or '数据类型' not in header_row or '数值' not in header_row:
                return Response({
                    'created': 0, 'failed': 0,
                    'errors': [{'row': 1, 'message': '表头须包含：时间、端口标识、数据类型、数值'}]})
            col_time = header_row.index('时间')
            col_port = header_row.index('端口标识')
            col_type = header_row.index('数据类型')
            col_value = header_row.index('数值')
            col_unit = header_row.index('单位') if '单位' in header_row else -1
            for row_idx, row in enumerate(rows[1:], start=2):
                if len(errors) >= max_errors:
                    break
                try:
                    time_val = row[col_time] if col_time < len(row) else None
                    port_val = row[col_port] if col_port < len(row) else None
                    type_val = row[col_type] if col_type < len(row) else None
                    value_val = row[col_value] if col_value < len(row) else None
                    unit_val = row[col_unit] if col_unit >= 0 and col_unit < len(row) else None
                    if time_val is None and port_val is None and type_val is None and value_val is None:
                        continue
                    if not port_val or not type_val or value_val is None:
                        errors.append({'row': row_idx, 'message': '端口标识/数据类型/数值不能为空'})
                        failed += 1
                        continue
                    port_identifier = str(port_val).strip()
                    data_type = str(type_val).strip().lower()
                    if data_type not in data_type_choices:
                        errors.append({'row': row_idx, 'message': f'数据类型须为: {", ".join(data_type_choices)}'})
                        failed += 1
                        continue
                    try:
                        value_num = Decimal(str(value_val))
                    except Exception:
                        errors.append({'row': row_idx, 'message': '数值格式错误'})
                        failed += 1
                        continue
                    if unit_val is None or str(unit_val).strip() == '':
                        unit = default_unit.get(data_type, 'W')
                    else:
                        unit = str(unit_val).strip() or default_unit.get(data_type, 'W')
                    ts = None
                    if time_val is not None:
                        if hasattr(time_val, 'strftime'):
                            ts = time_val
                        else:
                            ts = parse_datetime(str(time_val))
                        if ts is None and re.match(r'^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}', str(time_val)):
                            ts = parse_datetime(str(time_val))
                    if ts is None:
                        errors.append({'row': row_idx, 'message': '时间格式须为 YYYY-MM-DD HH:MM'})
                        failed += 1
                        continue
                    port = PDUPort.objects.filter(port_identifier=port_identifier).first()
                    if not port:
                        errors.append({'row': row_idx, 'message': f'未找到端口标识: {port_identifier}'})
                        failed += 1
                        continue
                    CabinetPDUData.objects.create(
                        pdu_port_id=port.id,
                        data_type=data_type,
                        value=value_num,
                        unit=unit,
                        timestamp=ts,
                        source='manual_import',
                        import_batch=import_batch,
                    )
                    created += 1
                except Exception as e:
                    failed += 1
                    errors.append({'row': row_idx, 'message': str(e)})
            wb.close()
        except Exception as e:
            return Response({
                'created': created, 'failed': failed,
                'errors': errors + [{'row': '-', 'message': str(e)}]
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        return Response({'created': created, 'failed': failed, 'errors': errors[:max_errors]})


class WarehouseDeviceViewSet(viewsets.ModelViewSet):
    """仓库设备视图集"""
    queryset = WarehouseDevice.objects.all()
    serializer_class = WarehouseDeviceSerializer
    
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
    
    def get_queryset(self):
        """支持按状态过滤与关键词搜索（跨页）"""
        queryset = WarehouseDevice.objects.all()
        params = self.request.query_params
        status_param = params.get('status')
        if status_param:
            queryset = queryset.filter(status=status_param)
        search = (params.get('search') or '').strip()
        if search and self.action == 'list':
            q = (
                Q(brand__icontains=search) |
                Q(model__icontains=search) |
                Q(sn__icontains=search) |
                Q(supplier__icontains=search)
            )
            queryset = queryset.filter(q)
        return queryset
    
    def perform_create(self, serializer):
        """创建时记录历史"""
        instance = serializer.save()
        HistoryTracker.record_change(
            instance=instance,
            action='create',
            user=self.request.user
        )
        
        # 创建入库历史记录
        from datetime import date, time
        from django.utils.dateparse import parse_date, parse_time
        
        # 从请求数据中获取操作日期和时间
        action_date = self.request.data.get('action_date')
        if action_date:
            if isinstance(action_date, str):
                action_date = parse_date(action_date)
        if not action_date:
            # 如果没有提供日期，尝试从collection_time中提取
            collection_time = self.request.data.get('collection_time')
            if collection_time:
                try:
                    from django.utils.dateparse import parse_datetime
                    dt = parse_datetime(collection_time)
                    if dt:
                        action_date = dt.date()
                except:
                    pass
        if not action_date:
            action_date = date.today()
        
        # 从请求数据中获取操作时间
        action_time = self.request.data.get('action_time')
        if action_time:
            if isinstance(action_time, str):
                action_time = parse_time(action_time)
        if not action_time:
            # 如果没有提供时间，尝试从collection_time中提取
            collection_time = self.request.data.get('collection_time')
            if collection_time:
                try:
                    from django.utils.dateparse import parse_datetime
                    dt = parse_datetime(collection_time)
                    if dt:
                        action_time = dt.time()
                except:
                    pass
        
        # 获取事件ID（如果是从事件创建的）
        event_id = self.request.data.get('event_id')
        
        WarehouseDeviceHistory.objects.create(
            warehouse_device=instance,
            action='in',
            action_date=action_date,
            action_time=action_time,
            event_id=event_id,
            notes='设备入库',
            operator=getattr(self.request.user, 'username', None) if hasattr(self.request, 'user') else None
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
        
        # 创建更新历史记录
        from datetime import date
        WarehouseDeviceHistory.objects.create(
            warehouse_device=instance,
            action='update',
            action_date=date.today(),
            notes='设备信息更新',
            operator=getattr(self.request.user, 'username', None) if hasattr(self.request, 'user') else None
        )
    
    def perform_destroy(self, instance):
        """删除时记录历史"""
        HistoryTracker.record_change(
            instance=instance,
            action='delete',
            user=self.request.user
        )
        instance.delete()
    
    @action(detail=True, methods=['post'])
    def install(self, request, pk=None):
        """设备上架操作 - 从仓库上架到机柜"""
        warehouse_device = self.get_object()
        cabinet_id = request.data.get('cabinet_id')
        if not cabinet_id:
            return Response(
                {'error': 'cabinet_id 是必需的'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            device = install_warehouse_device(
                warehouse_device=warehouse_device,
                cabinet_id=cabinet_id,
                rack_position=request.data.get('rack_position'),
                install_location=request.data.get('install_location'),
                action_date=request.data.get('action_date'),
                action_time=request.data.get('action_time'),
                event_id=request.data.get('event_id'),
                notes=request.data.get('notes', ''),
                operator=getattr(request.user, 'username', None) if hasattr(request, 'user') else None,
            )
        except WarehouseInstallError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({'error': f'设备上架失败: {str(exc)}'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = DeviceSerializer(device)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    
    @action(detail=True, methods=['post'])
    def out_of_warehouse(self, request, pk=None):
        """设备出库操作"""
        warehouse_device = self.get_object()

        try:
            warehouse_device = out_of_warehouse_device(
                warehouse_device=warehouse_device,
                action_date=request.data.get('action_date'),
                action_time=request.data.get('action_time'),
                event_id=request.data.get('event_id'),
                notes=request.data.get('notes', ''),
                operator=getattr(request.user, 'username', None) if hasattr(request, 'user') else None,
            )
        except WarehouseOutOfStockError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({'error': f'设备出库失败: {str(exc)}'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = WarehouseDeviceSerializer(warehouse_device)
        return Response(serializer.data, status=status.HTTP_200_OK)


class WarehouseDeviceHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    """仓库设备历史记录视图集"""
    queryset = WarehouseDeviceHistory.objects.all()
    serializer_class = WarehouseDeviceHistorySerializer
    
    def get_permissions(self):
        """
        为不同的操作设置不同的权限
        GET操作允许匿名访问
        """
        if self.action in ['list', 'retrieve']:
            permission_classes = [AllowAny]
        else:
            permission_classes = [IsAuthenticated]
        return [permission() for permission in permission_classes]
    
    def get_queryset(self):
        """支持按warehouse_device过滤查询"""
        queryset = WarehouseDeviceHistory.objects.all()
        warehouse_device_id = self.request.query_params.get('warehouse_device')
        
        if warehouse_device_id:
            queryset = queryset.filter(warehouse_device_id=warehouse_device_id)
        
        return queryset.select_related('warehouse_device', 'cabinet', 'event')
