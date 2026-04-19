from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny, IsAdminUser
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.db.models import Count, Prefetch
from django.core.management import call_command
from django.core.management.base import CommandError
from django.core.files.uploadedfile import InMemoryUploadedFile
from django.core.files.base import ContentFile
from django.http import HttpResponse
from io import BytesIO, StringIO
from django.utils import timezone
import tempfile
import os
from datetime import datetime
from .models import (
    Event, EntryPersonnel, EventEntryPersonnel, EventDevice,
    EventDecommissionedDevice, EventWarehouseDevice, OperationStoryImport,
    RoomEvent, EventClient, EventAuthorizedOrg, EventDutyPersonnel
)
from devices.models import Room, Cabinet, Device, DecommissionedDevice
from common.models import Client
from .serializers import (
    EventSerializer, EventSummarySerializer,
    EntryPersonnelSerializer, EventEntryPersonnelSerializer,
    EventEntryPersonnelListSerializer,
    EventDeviceSerializer, EventDecommissionedDeviceSerializer,
    EventWarehouseDeviceSerializer,
    OperationStoryImportSerializer, ImportPreviewSerializer, ImportResultSerializer,
    OperationStoryImportHistorySerializer
)
from common.utils import HistoryTracker, NotificationHelper
from devices.models import Room


class EventViewSet(viewsets.ModelViewSet):
    queryset = Event.objects.all()  # 保留queryset属性供路由器使用
    serializer_class = EventSerializer

    def get_serializer_class(self):
        """列表接口使用事件摘要序列化器，减轻响应体积"""
        if self.action == 'list':
            return EventSummarySerializer
        return EventSerializer

    def get_queryset(self):
        """优化查询，预加载rooms的cabinets关系并计算机柜数量；支持列表搜索过滤。"""
        queryset = super().get_queryset()
        # 列表接口：根据 query_params 过滤
        if self.action == 'list':
            params = self.request.query_params
            if params.get('start_date'):
                queryset = queryset.filter(date__gte=params['start_date'])
            if params.get('end_date'):
                queryset = queryset.filter(date__lte=params['end_date'])
            if params.get('client'):
                queryset = queryset.filter(clients=params['client'])
            if params.get('room'):
                queryset = queryset.filter(rooms=params['room'])
            if params.get('order_number', '').strip():
                queryset = queryset.filter(order_number__icontains=params['order_number'].strip())
            if params.get('completion_status') not in (None, ''):
                # 支持 'true'/'false' 字符串与布尔值
                val = params['completion_status']
                if isinstance(val, str):
                    status = val.lower() == 'true'
                else:
                    status = bool(val)
                queryset = queryset.filter(completion_status=status)
            # 支持排序；默认按日期降序（最新在前），与事件列表需求一致
            ordering = params.get('ordering', '').strip()
            if ordering == '-date' or ordering == '':
                queryset = queryset.order_by('-date', '-id')
            elif ordering == 'date':
                queryset = queryset.order_by('date', 'id')
        # 使用annotate预计算机柜数量，避免N+1查询
        rooms_with_cabinet_count = Room.objects.annotate(
            cabinet_count=Count('cabinets')
        )
        queryset = queryset.prefetch_related(
            Prefetch('rooms', queryset=rooms_with_cabinet_count),
            'clients',  # 列表使用 EventSummarySerializer 时需要 clients
            'authorized_orgs',  # 事件摘要中展示授权单位
        )
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
        # 数据库触发器可能在 INSERT 时自动生成订单号，需从 DB 刷新后再用于通知
        instance.refresh_from_db()
        HistoryTracker.record_change(
            instance=instance,
            action='create',
            user=self.request.user
        )
        
        # 发送通知给所有值班人员
        event_date = instance.date.strftime('%Y-%m-%d') if instance.date else ''
        event_description = instance.description or '无描述'
        order_number = instance.order_number or '无订单号'
        
        title = f'新增事件：{order_number}'
        content = f'事件日期：{event_date}\n事件描述：{event_description}\n请及时查看和处理。'
        
        NotificationHelper.notify_all_duty_personnel(
            notification_type='new_event',
            title=title,
            content=content,
            related_content_type='events.Event',
            related_object_id=instance.id
        )
    
    def perform_update(self, serializer):
        """更新时记录历史并发送通知"""
        old_instance = self.get_object()
        instance = serializer.save()
        # 确保从 DB 读取最新字段（如订单号）后再用于通知
        instance.refresh_from_db()
        HistoryTracker.record_change(
            instance=instance,
            action='update',
            user=self.request.user,
            old_instance=old_instance
        )
        
        # 发送通知给所有值班人员
        event_date = instance.date.strftime('%Y-%m-%d') if instance.date else ''
        event_description = instance.description or '无描述'
        order_number = instance.order_number or '无订单号'
        
        title = f'事件更新：{order_number}'
        content = f'事件日期：{event_date}\n事件描述：{event_description}\n事件信息已更新，请及时查看。'
        
        NotificationHelper.notify_all_duty_personnel(
            notification_type='event_updated',
            title=title,
            content=content,
            related_content_type='events.Event',
            related_object_id=instance.id
        )
    
    def perform_destroy(self, instance):
        """删除时记录历史"""
        HistoryTracker.record_change(
            instance=instance,
            action='delete',
            user=self.request.user
        )
        instance.delete()


class EntryPersonnelViewSet(viewsets.ModelViewSet):
    queryset = EntryPersonnel.objects.all()
    serializer_class = EntryPersonnelSerializer
    
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


class EventEntryPersonnelViewSet(viewsets.ModelViewSet):
    queryset = EventEntryPersonnel.objects.all().select_related(
        'event', 'entry_personnel'
    ).prefetch_related('event__clients').order_by('-event__date', '-event__start_time', '-id')
    serializer_class = EventEntryPersonnelSerializer

    def get_serializer_class(self):
        if self.action == 'list':
            return EventEntryPersonnelListSerializer
        return EventEntryPersonnelSerializer

    @action(detail=False, methods=['post'])
    def batch_create(self, request):
        """批量创建事件与进场人员的关联"""
        event_id = request.data.get('event_id')
        entry_personnel_ids = request.data.get('entry_personnel_ids', [])
        
        if not event_id:
            return Response(
                {'error': 'event_id 是必需的'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not entry_personnel_ids:
            return Response(
                {'error': 'entry_personnel_ids 是必需的'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            event = Event.objects.get(id=event_id)
        except Event.DoesNotExist:
            return Response(
                {'error': f'事件 {event_id} 不存在'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        created = []
        errors = []
        
        for personnel_id in entry_personnel_ids:
            try:
                personnel = EntryPersonnel.objects.get(id=personnel_id)
                relation, created_flag = EventEntryPersonnel.objects.get_or_create(
                    event=event,
                    entry_personnel=personnel
                )
                if created_flag:
                    created.append(relation.id)
            except EntryPersonnel.DoesNotExist:
                errors.append(f'进场人员 {personnel_id} 不存在')
            except Exception as e:
                errors.append(f'创建关联失败: {str(e)}')
        
        return Response({
            'created': created,
            'errors': errors,
            'message': f'成功创建 {len(created)} 个关联，失败 {len(errors)} 个'
        }, status=status.HTTP_201_CREATED if created else status.HTTP_400_BAD_REQUEST)


class EventDeviceViewSet(viewsets.ModelViewSet):
    queryset = EventDevice.objects.all()
    serializer_class = EventDeviceSerializer
    
    @action(detail=False, methods=['post'])
    def batch_create(self, request):
        """批量创建事件与设备的关联"""
        event_id = request.data.get('event_id')
        device_ids = request.data.get('device_ids', [])
        
        if not event_id:
            return Response(
                {'error': 'event_id 是必需的'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not device_ids:
            return Response(
                {'error': 'device_ids 是必需的'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            event = Event.objects.get(id=event_id)
        except Event.DoesNotExist:
            return Response(
                {'error': f'事件 {event_id} 不存在'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        created = []
        errors = []
        already_exists = []  # 记录已存在的关联
        
        for device_id in device_ids:
            try:
                from devices.models import Device
                device = Device.objects.get(id=device_id)
                relation, created_flag = EventDevice.objects.get_or_create(
                    event=event,
                    device=device
                )
                if created_flag:
                    created.append(relation.id)
                else:
                    # 关联已存在，不算错误
                    already_exists.append(device_id)
            except Device.DoesNotExist:
                errors.append(f'设备 {device_id} 不存在')
            except Exception as e:
                errors.append(f'设备 {device_id}: {str(e)}')
        
        # 如果没有错误，即使没有创建新关联（已存在），也返回成功
        if errors:
            return Response({
                'created': created,
                'errors': errors,
                'already_exists': already_exists,
                'message': f'成功创建 {len(created)} 个关联，失败 {len(errors)} 个，已存在 {len(already_exists)} 个'
            }, status=status.HTTP_400_BAD_REQUEST)
        else:
            # 有创建新关联返回 201，仅已存在返回 200
            status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
            return Response({
                'created': created,
                'errors': errors,
                'already_exists': already_exists,
                'message': f'成功创建 {len(created)} 个关联，失败 {len(errors)} 个，已存在 {len(already_exists)} 个'
            }, status=status_code)


class EventDecommissionedDeviceViewSet(viewsets.ModelViewSet):
    queryset = EventDecommissionedDevice.objects.all()
    serializer_class = EventDecommissionedDeviceSerializer
    
    @action(detail=False, methods=['post'])
    def batch_create(self, request):
        """批量创建事件与下架设备的关联"""
        event_id = request.data.get('event_id')
        decommissioned_device_ids = request.data.get('decommissioned_device_ids', [])
        
        if not event_id:
            return Response(
                {'error': 'event_id 是必需的'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not decommissioned_device_ids:
            return Response(
                {'error': 'decommissioned_device_ids 是必需的'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            event = Event.objects.get(id=event_id)
        except Event.DoesNotExist:
            return Response(
                {'error': f'事件 {event_id} 不存在'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        created = []
        errors = []
        
        for decommissioned_device_id in decommissioned_device_ids:
            try:
                from devices.models import DecommissionedDevice
                try:
                    decommissioned_device = DecommissionedDevice.objects.get(id=decommissioned_device_id)
                except DecommissionedDevice.DoesNotExist:
                    errors.append(f'下架设备 {decommissioned_device_id} 不存在')
                    continue
                
                relation, created_flag = EventDecommissionedDevice.objects.get_or_create(
                    event=event,
                    decommissioned_device=decommissioned_device
                )
                if created_flag:
                    created.append(relation.id)
                else:
                    # 关联已存在，不算错误，但也不计入created
                    pass
            except Exception as e:
                import traceback
                error_detail = traceback.format_exc()
                errors.append(f'下架设备 {decommissioned_device_id}: {str(e)}')
                print(f"关联下架设备失败: {error_detail}")
        
        # 返回结果：如果有成功的，返回201；如果全部失败，返回400；如果部分成功部分失败，返回201但包含错误信息
        if created:
            # 有成功的，返回201，即使有部分错误
            return Response({
                'created': created,
                'errors': errors,
                'message': f'成功创建 {len(created)} 个关联' + (f'，失败 {len(errors)} 个' if errors else '')
            }, status=status.HTTP_201_CREATED)
        elif errors:
            # 全部失败，返回400
            return Response({
                'created': created,
                'errors': errors,
                'message': f'所有关联都失败，共 {len(errors)} 个错误'
            }, status=status.HTTP_400_BAD_REQUEST)
        else:
            # 没有成功也没有错误（可能是关联已存在），返回200
            return Response({
                'created': created,
                'errors': errors,
                'message': '没有需要创建的关联（可能已存在）'
            }, status=status.HTTP_200_OK)


class EventWarehouseDeviceViewSet(viewsets.ModelViewSet):
    queryset = EventWarehouseDevice.objects.all()
    serializer_class = EventWarehouseDeviceSerializer
    
    @action(detail=False, methods=['post'])
    def batch_create(self, request):
        """批量创建事件与仓库设备的关联"""
        event_id = request.data.get('event_id')
        warehouse_device_ids = request.data.get('warehouse_device_ids', [])
        
        if not event_id:
            return Response(
                {'error': 'event_id 是必需的'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not warehouse_device_ids:
            return Response(
                {'error': 'warehouse_device_ids 是必需的'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            event = Event.objects.get(id=event_id)
        except Event.DoesNotExist:
            return Response(
                {'error': f'事件 {event_id} 不存在'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        created = []
        errors = []
        
        for warehouse_device_id in warehouse_device_ids:
            try:
                from devices.models import WarehouseDevice, WarehouseDeviceHistory
                warehouse_device = WarehouseDevice.objects.get(id=warehouse_device_id)
                relation, created_flag = EventWarehouseDevice.objects.get_or_create(
                    event=event,
                    warehouse_device=warehouse_device
                )
                if created_flag:
                    created.append(relation.id)
                    
                    # 更新入库历史记录中的 event_id（如果历史记录存在且 event_id 为空）
                    # 只更新最新的入库记录（action='in'）
                    latest_in_history = WarehouseDeviceHistory.objects.filter(
                        warehouse_device=warehouse_device,
                        action='in',
                        event__isnull=True
                    ).order_by('-action_date', '-action_time', '-created_at').first()
                    
                    if latest_in_history:
                        latest_in_history.event = event
                        latest_in_history.save()
            except Exception as e:
                errors.append(f'仓库设备 {warehouse_device_id}: {str(e)}')
        
        return Response({
            'created': created,
            'errors': errors,
            'message': f'成功创建 {len(created)} 个关联，失败 {len(errors)} 个'
        }, status=status.HTTP_201_CREATED if created else status.HTTP_400_BAD_REQUEST)


class OperationStoryImportViewSet(viewsets.ViewSet):
    """
    Excel运维故事导入ViewSet
    支持文件上传、预览、导入、回滚等功能
    仅管理员可访问
    """
    permission_classes = [IsAdminUser]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    @action(detail=False, methods=['get'])
    def download_template(self, request):
        """
        下载Excel导入模板
        GET /api/operation-story-import/download_template/
        """
        try:
            from openpyxl import Workbook
            from openpyxl.styles import Font, PatternFill, Alignment
            from openpyxl.utils import get_column_letter
            
            # 创建工作簿
            wb = Workbook()
            
            # 删除默认sheet
            default_sheet = wb.active
            if default_sheet.title == 'Sheet':
                wb.remove(default_sheet)
            
            # ========== 创建"人员进出"Sheet ==========
            personnel_sheet = wb.create_sheet('人员进出')
            
            # 设置表头（与导入一致，含值班人员）
            personnel_headers = [
                '日期', '姓名', '身份证号', '联系方式',
                '进场时间', '离场时间', '工作描述',
                '客户', '授权单位', '机房', '值班人员'
            ]
            personnel_sheet.append(personnel_headers)
            
            # 设置表头样式
            header_fill = PatternFill(start_color='366092', end_color='366092', fill_type='solid')
            header_font = Font(bold=True, color='FFFFFF')
            for cell in personnel_sheet[1]:
                cell.fill = header_fill
                cell.font = header_font
                cell.alignment = Alignment(horizontal='center', vertical='center')
            
            # 添加示例数据
            example_data = [
                ['2024-01-15', '张三', '110101199001011234', '13800138000',
                 '09:00', '18:00', '设备上架维护',
                 '国泰君安', '华通云', 'F1D', '王值班'],
                ['2024-01-16', '李四', '110101199002021234', '13900139000',
                 '10:00', '17:00', '设备巡检',
                 '招商银行', '华通云', 'F1B', '王值班'],
            ]
            for row in example_data:
                personnel_sheet.append(row)
            
            # 设置列宽（增加值班人员列宽）
            personnel_column_widths = [12, 10, 18, 15, 12, 12, 20, 15, 15, 10, 12]
            for idx, width in enumerate(personnel_column_widths, 1):
                personnel_sheet.column_dimensions[get_column_letter(idx)].width = width
            
            # ========== 创建"上架/下架汇总"Sheet ==========
            device_sheet = wb.create_sheet('上架/下架汇总')
            
            # 设置表头（上架/下架由工作表区分，含值班人员）
            device_headers = [
                '日期', '客户代表', '品牌', '型号', '序列号', 'U数',
                '机架位置', '机柜名称', '机房',
                '电源类型', '电源瓦数', '设备类型', '值班人员'
            ]
            device_sheet.append(device_headers)
            
            # 设置表头样式
            for cell in device_sheet[1]:
                cell.fill = header_fill
                cell.font = header_font
                cell.alignment = Alignment(horizontal='center', vertical='center')
            
            # 添加示例数据
            device_example_data = [
                ['2024-01-15', '张三', 'Dell', 'PowerEdge R740', 'SN123456789', '2',
                 '10-11', '08-01', 'F1D',
                 '双电源', '750', '服务器', '王值班'],
                ['2024-01-15', '张三', 'Huawei', 'CE6851', 'SN987654321', '1',
                 '12', '08-01', 'F1D',
                 '单电源', '500', '交换机', '王值班'],
                ['2024-01-16', '李四', 'Dell', 'PowerEdge R730', 'SN111222333', '2',
                 '15-16', '09-02', 'F1B',
                 '双电源', '650', '服务器', '王值班'],
            ]
            for row in device_example_data:
                device_sheet.append(row)
            
            # 设置列宽（含值班人员列）
            device_column_widths = [12, 12, 10, 20, 15, 8, 12, 12, 10, 10, 10, 10, 12]
            for idx, width in enumerate(device_column_widths, 1):
                device_sheet.column_dimensions[get_column_letter(idx)].width = width
            
            # 生成Excel文件
            output = BytesIO()
            wb.save(output)
            output.seek(0)
            
            # 创建HTTP响应
            response = HttpResponse(
                output.getvalue(),
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            # 设置文件名
            filename = 'operation_story_import_template.xlsx'
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            
            return response
            
        except ImportError as e:
            return Response(
                {'error': f'缺少依赖库: {str(e)}。请确保已安装 openpyxl'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as e:
            import traceback
            error_detail = traceback.format_exc()
            # 记录错误日志
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f'生成模板失败: {str(e)}\n{error_detail}')
            return Response(
                {'error': f'生成模板失败: {str(e)}', 'detail': error_detail},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['post'])
    def upload(self, request):
        """
        上传Excel文件并预览
        POST /api/operation-story-import/upload/
        """
        if 'file' not in request.FILES:
            return Response(
                {'error': '未上传文件', 'detail': '请选择Excel文件后重试'},
                status=status.HTTP_400_BAD_REQUEST
            )

        file = request.FILES['file']
        options = request.data.get('options') or request.POST.get('options')
        if not options:
            options = {}
        elif isinstance(options, str):
            import json
            try:
                options = json.loads(options)
            except json.JSONDecodeError:
                options = {}
        
        # 验证文件类型
        if not file.name.endswith(('.xlsx', '.xls')):
            return Response(
                {'error': '文件格式不支持，请上传Excel文件（.xlsx或.xls）'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 保存临时文件
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx')
        try:
            for chunk in file.chunks():
                temp_file.write(chunk)
            temp_file.close()

            # 调用管理命令进行预览
            from io import StringIO
            import sys

            batch_id = options.get('batch_id', f"BATCH_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
            
            try:
                call_command(
                    'import_operation_story',
                    temp_file.name,
                    '--preview',
                    '--personnel-sheet', options.get('personnel_sheet', '人员进出'),
                    '--install-sheet', options.get('install_sheet', '上架汇总'),
                    '--decommission-sheet', options.get('decommission_sheet', '下架汇总'),
                    '--batch-id', batch_id,
                )
            except CommandError as e:
                return Response(
                    {'error': str(e), 'error_type': 'ValidationError', 'message': '表头或数据校验未通过'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            except Exception as e:
                import traceback
                return Response(
                    {'error': str(e), 'error_type': type(e).__name__, 'detail': traceback.format_exc()},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            # 读取预览报告
            report_file = f'import_preview_{batch_id}.json'
            
            if os.path.exists(report_file):
                import json
                with open(report_file, 'r', encoding='utf-8') as f:
                    report_data = json.load(f)
                
                # 删除临时文件
                os.unlink(temp_file.name)
                os.unlink(report_file)
                
                return Response(report_data, status=status.HTTP_200_OK)
            else:
                return Response(
                    {'error': '预览失败，请检查文件格式'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        except Exception as e:
            import traceback
            error_detail = traceback.format_exc()
            return Response(
                {'error': str(e), 'error_type': type(e).__name__, 'detail': error_detail},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        finally:
            if os.path.exists(temp_file.name):
                try:
                    os.unlink(temp_file.name)
                except:
                    pass

    @action(detail=False, methods=['post'])
    def import_data(self, request):
        """
        执行导入
        POST /api/operation-story-import/import_data/
        """
        if 'file' not in request.FILES:
            return Response(
                {'error': '未上传文件', 'detail': '请选择Excel文件后重试'},
                status=status.HTTP_400_BAD_REQUEST
            )

        file = request.FILES['file']
        options = request.data.get('options') or request.POST.get('options')
        if not options:
            options = {}
        elif isinstance(options, str):
            import json
            try:
                options = json.loads(options)
            except json.JSONDecodeError:
                options = {}
        
        # 验证文件类型
        if not file.name.endswith(('.xlsx', '.xls')):
            return Response(
                {'error': '文件格式不支持，请上传Excel文件（.xlsx或.xls）'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 保存临时文件
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx')
        try:
            for chunk in file.chunks():
                temp_file.write(chunk)
            temp_file.close()

            batch_id = options.get('batch_id', f"BATCH_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
            
            try:
                command_args = [
                    'import_operation_story',
                    temp_file.name,
                    '--personnel-sheet', options.get('personnel_sheet', '人员进出'),
                    '--install-sheet', options.get('install_sheet', '上架汇总'),
                    '--decommission-sheet', options.get('decommission_sheet', '下架汇总'),
                    '--batch-id', batch_id,
                ]
                
                if options.get('incremental', False):
                    command_args.append('--incremental')
                
                if options.get('max_rows'):
                    command_args.extend(['--max-rows', str(options['max_rows'])])

                call_command(*command_args)
            except CommandError as e:
                return Response(
                    {'error': str(e), 'error_type': 'ValidationError', 'message': '表头或数据校验未通过'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            except Exception as e:
                import traceback
                return Response(
                    {'error': str(e), 'error_type': type(e).__name__, 'detail': traceback.format_exc()},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            # 从数据库读取导入记录
            try:
                import_record = OperationStoryImport.objects.get(batch_id=batch_id)
                # 删除临时文件
                if os.path.exists(temp_file.name):
                    os.unlink(temp_file.name)
                
                # 更新导入用户
                if request.user.is_authenticated:
                    import_record.imported_by = request.user
                    import_record.save()
                
                summary = {
                    'event_count': import_record.event_count,
                    'device_count': import_record.device_count,
                }
                if getattr(import_record, 'summary', None) and isinstance(import_record.summary, dict):
                    if import_record.summary.get('events', {}).get('skip_reasons'):
                        summary['events_skip_reasons'] = import_record.summary['events']['skip_reasons']
                    if import_record.summary.get('devices', {}).get('skip_reasons'):
                        summary['devices_skip_reasons'] = import_record.summary['devices']['skip_reasons']
                return Response({
                    'batch_id': batch_id,
                    'success': True,
                    'message': '导入成功',
                    'summary': summary,
                    'record': {
                        'batch_id': import_record.batch_id,
                        'import_time': import_record.import_time,
                        'event_ids': import_record.event_ids,
                        'device_sns': import_record.device_sns,
                    }
                }, status=status.HTTP_200_OK)
            except OperationStoryImport.DoesNotExist:
                # 如果数据库中没有记录，尝试从JSON文件读取（向后兼容）
                record_file = f'import_record_{batch_id}.json'
                if os.path.exists(record_file):
                    import json
                    with open(record_file, 'r', encoding='utf-8') as f:
                        record_data = json.load(f)
                    
                    # 删除临时文件
                    if os.path.exists(temp_file.name):
                        os.unlink(temp_file.name)
                    
                    return Response({
                        'batch_id': batch_id,
                        'success': True,
                        'message': '导入成功',
                        'summary': {
                            'event_count': len(record_data.get('event_ids', [])),
                            'device_count': len(record_data.get('device_sns', [])),
                        },
                        'record': record_data
                    }, status=status.HTTP_200_OK)
                else:
                    return Response(
                        {'error': '导入失败，请检查文件格式和数据'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

        except Exception as e:
            import traceback
            error_detail = traceback.format_exc()
            return Response(
                {'error': str(e), 'error_type': type(e).__name__, 'detail': error_detail},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        finally:
            if os.path.exists(temp_file.name):
                try:
                    os.unlink(temp_file.name)
                except:
                    pass

    @action(detail=False, methods=['post'])
    def rollback(self, request):
        """
        回滚导入
        POST /api/operation-story-import/rollback/
        """
        batch_id = request.data.get('batch_id')
        
        if not batch_id:
            return Response(
                {'error': 'batch_id 是必需的'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # 检查导入记录是否存在
            try:
                import_record = OperationStoryImport.objects.get(batch_id=batch_id)
                if import_record.rolled_back:
                    return Response({
                        'success': False,
                        'error': f'批次 {batch_id} 已经回滚过了'
                    }, status=status.HTTP_400_BAD_REQUEST)
            except OperationStoryImport.DoesNotExist:
                pass  # 如果数据库中没有记录，继续使用JSON文件回滚（向后兼容）
            
            # 使用一个虚拟文件路径，因为回滚模式不需要实际文件
            call_command('import_operation_story', 'dummy.xlsx', '--rollback', batch_id)
            
            # 更新数据库记录
            try:
                import_record = OperationStoryImport.objects.get(batch_id=batch_id)
                import_record.rolled_back = True
                import_record.rolled_back_at = timezone.now()
                if request.user.is_authenticated:
                    import_record.rolled_back_by = request.user
                import_record.save()
            except OperationStoryImport.DoesNotExist:
                pass  # 如果数据库中没有记录，跳过更新
            
            return Response({
                'success': True,
                'message': f'批次 {batch_id} 回滚成功'
            }, status=status.HTTP_200_OK)

        except Exception as e:
            import traceback
            error_detail = traceback.format_exc()
            return Response(
                {'error': str(e), 'error_type': type(e).__name__, 'detail': error_detail},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'])
    def import_history(self, request):
        """
        查询导入历史记录
        GET /api/operation-story-import/import_history/
        """
        queryset = OperationStoryImport.objects.all().order_by('-import_time')
        
        # 支持分页
        page = request.query_params.get('page', 1)
        page_size = request.query_params.get('page_size', 20)
        
        try:
            page = int(page)
            page_size = int(page_size)
        except (ValueError, TypeError):
            page = 1
            page_size = 20
        
        # 计算分页
        start = (page - 1) * page_size
        end = start + page_size
        
        total = queryset.count()
        records = queryset[start:end]
        
        serializer = OperationStoryImportHistorySerializer(records, many=True)
        
        return Response({
            'count': total,
            'page': page,
            'page_size': page_size,
            'results': serializer.data
        }, status=status.HTTP_200_OK)


class DataExportViewSet(viewsets.ViewSet):
    """
    数据导出：事件汇总、人员进出、上架汇总、下架汇总，导出为 Excel。
    仅管理员可访问。支持 query_params: date_from, date_to (YYYY-MM-DD)。
    """
    permission_classes = [IsAdminUser]

    def _get_event_queryset(self, request):
        """按日期范围过滤事件"""
        qs = Event.objects.all().order_by('date', 'id')
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        if date_from:
            qs = qs.filter(date__gte=date_from)
        if date_to:
            qs = qs.filter(date__lte=date_to)
        return qs.prefetch_related(
            'rooms', 'clients', 'authorized_orgs', 'duty_personnel', 'entry_personnel',
            Prefetch('devices', queryset=Device.objects.select_related('cabinet', 'cabinet__room')),
            Prefetch('decommissioned_devices', queryset=DecommissionedDevice.objects.select_related('cabinet', 'cabinet__room')),
        )

    @staticmethod
    def _event_customer_representative(ev):
        """事件对应的客户代表（导入模板中 客户代表 = 客户的授权人），用于导出再导入时匹配"""
        first_client = ev.clients.first()
        if not first_client:
            return ''
        return (getattr(first_client, 'authorized_person', None) or '').strip()

    @action(detail=False, methods=['get'], url_path='events')
    def export_events(self, request):
        """导出事件汇总 Excel"""
        try:
            from openpyxl import Workbook
            from openpyxl.styles import Font, PatternFill, Alignment
            from openpyxl.utils import get_column_letter
        except ImportError:
            return Response(
                {'error': '缺少 openpyxl，请安装后重试'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        qs = self._get_event_queryset(request)
        wb = Workbook()
        ws = wb.active
        ws.title = '事件汇总'
        headers = ['日期', '订单号', '开始时间', '结束时间', '描述', '机房', '客户', '授权单位', '值班人员', '进场人员', '完成状态']
        ws.append(headers)
        for ev in qs:
            rooms = ', '.join(r.name for r in ev.rooms.all()) or ''
            clients = ', '.join(c.name for c in ev.clients.all()) or ''
            orgs = ', '.join(a.name for a in ev.authorized_orgs.all()) or ''
            duty = ', '.join(d.name for d in ev.duty_personnel.all()) or ''
            entry = ', '.join(e.name for e in ev.entry_personnel.all()) or ''
            ws.append([
                ev.date.strftime('%Y-%m-%d') if ev.date else '',
                ev.order_number or '',
                ev.start_time.strftime('%H:%M') if ev.start_time else '',
                ev.end_time.strftime('%H:%M') if ev.end_time else '',
                (ev.description or '')[:500],
                rooms, clients, orgs, duty, entry,
                '是' if ev.completion_status else '否'
            ])
        _set_header_style(ws)
        buf = _workbook_to_response(wb, '事件汇总.xlsx')
        return buf

    @action(detail=False, methods=['get'], url_path='personnel')
    def export_personnel(self, request):
        """导出人员进出 Excel（每行：事件日期 + 进场人员）"""
        try:
            from openpyxl import Workbook
        except ImportError:
            return Response(
                {'error': '缺少 openpyxl，请安装后重试'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        qs = self._get_event_queryset(request)
        wb = Workbook()
        ws = wb.active
        ws.title = '人员进出'
        # 与导入模板一致（含值班人员）
        headers = ['日期', '姓名', '身份证号', '联系方式', '进场时间', '离场时间', '工作描述', '客户', '授权单位', '机房', '值班人员']
        ws.append(headers)
        for ev in qs:
            rooms = ', '.join(r.name for r in ev.rooms.all()) or ''
            clients = ', '.join(c.name for c in ev.clients.all()) or ''
            orgs = ', '.join(a.name for a in ev.authorized_orgs.all()) or ''
            duty = ', '.join(d.name for d in ev.duty_personnel.all()) or ''
            for ep in ev.entry_personnel.all():
                ws.append([
                    ev.date.strftime('%Y-%m-%d') if ev.date else '',
                    ep.name, ep.id_card, ep.contact_info or '',
                    ev.start_time.strftime('%H:%M') if ev.start_time else '',
                    ev.end_time.strftime('%H:%M') if ev.end_time else '',
                    (ev.description or '')[:500],
                    clients, orgs, rooms, duty
                ])
        _set_header_style(ws)
        buf = _workbook_to_response(wb, '人员进出.xlsx')
        return buf

    @action(detail=False, methods=['get'], url_path='install')
    def export_install(self, request):
        """导出上架汇总 Excel（关联事件的设备）"""
        try:
            from openpyxl import Workbook
        except ImportError:
            return Response(
                {'error': '缺少 openpyxl，请安装后重试'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        qs = self._get_event_queryset(request)
        wb = Workbook()
        ws = wb.active
        ws.title = '上架汇总'
        # 与导入模板一致（含值班人员）
        headers = ['日期', '客户代表', '品牌', '型号', '序列号', 'U数', '机架位置', '机柜名称', '机房', '电源类型', '电源瓦数', '设备类型', '值班人员']
        ws.append(headers)
        power_display = {'single': '单电源', 'dual': '双电源'}
        device_type_display = dict(Device.DEVICE_TYPE_CHOICES)
        for ev in qs:
            customer_rep = self._event_customer_representative(ev)
            duty = ', '.join(d.name for d in ev.duty_personnel.all()) or ''
            for ed in ev.devices.all():
                cab = ed.cabinet
                room_name = cab.room.name if cab and cab.room else ''
                cab_name = cab.name if cab else ''
                ws.append([
                    ev.date.strftime('%Y-%m-%d') if ev.date else '',
                    customer_rep,
                    ed.brand, ed.model, ed.sn, ed.u_size or '', ed.rack_position or '',
                    cab_name, room_name,
                    power_display.get(ed.power_type, ed.power_type or ''),
                    ed.power_wattage or '',
                    device_type_display.get(ed.device_type, ed.device_type or ''),
                    duty
                ])
        _set_header_style(ws)
        buf = _workbook_to_response(wb, '上架汇总.xlsx')
        return buf

    @action(detail=False, methods=['get'], url_path='decommission')
    def export_decommission(self, request):
        """导出下架汇总 Excel"""
        try:
            from openpyxl import Workbook
        except ImportError:
            return Response(
                {'error': '缺少 openpyxl，请安装后重试'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        qs = self._get_event_queryset(request)
        wb = Workbook()
        ws = wb.active
        ws.title = '下架汇总'
        # 与导入模板一致（含值班人员）：设备 12 列 + 下架原因, 状态, 值班人员
        headers = ['日期', '客户代表', '品牌', '型号', '序列号', 'U数', '机架位置', '机柜名称', '机房', '电源类型', '电源瓦数', '设备类型', '下架原因', '状态', '值班人员']
        ws.append(headers)
        power_display = {'single': '单电源', 'dual': '双电源'}
        status_display = {'decommissioned': '已下架', 'scrapped': '已报废'}
        for ev in qs:
            customer_rep = self._event_customer_representative(ev)
            duty = ', '.join(d.name for d in ev.duty_personnel.all()) or ''
            for dec in ev.decommissioned_devices.all():
                cab = dec.cabinet
                room_name = cab.room.name if cab and cab.room else ''
                cab_name = cab.name if cab else ''
                ws.append([
                    ev.date.strftime('%Y-%m-%d') if ev.date else '',
                    customer_rep,
                    dec.brand, dec.model, dec.sn, dec.u_size or '', dec.rack_position or '',
                    cab_name, room_name,
                    power_display.get(dec.power_type, dec.power_type or ''),
                    dec.power_wattage if hasattr(dec, 'power_wattage') else '',
                    getattr(dec, 'device_type', '') or '',
                    dec.decommission_reason or '',
                    status_display.get(dec.status, dec.status or ''),
                    duty
                ])
        _set_header_style(ws)
        buf = _workbook_to_response(wb, '下架汇总.xlsx')
        return buf

    @action(detail=False, methods=['get'], url_path='all')
    def export_all(self, request):
        """导出一个 Excel 文件，包含 4 个 Sheet：事件汇总、人员进出、上架汇总、下架汇总"""
        try:
            from openpyxl import Workbook
        except ImportError:
            return Response(
                {'error': '缺少 openpyxl，请安装后重试'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        qs = self._get_event_queryset(request)
        qs_list = list(qs)  # 只查一次，四个 sheet 共用
        power_display = {'single': '单电源', 'dual': '双电源'}
        device_type_display = dict(Device.DEVICE_TYPE_CHOICES)
        status_display = {'decommissioned': '已下架', 'scrapped': '已报废'}

        wb = Workbook()
        # Sheet 1: 事件汇总
        ws1 = wb.active
        ws1.title = '事件汇总'
        headers1 = ['日期', '订单号', '开始时间', '结束时间', '描述', '机房', '客户', '授权单位', '值班人员', '进场人员', '完成状态']
        ws1.append(headers1)
        for ev in qs_list:
            rooms = ', '.join(r.name for r in ev.rooms.all()) or ''
            clients = ', '.join(c.name for c in ev.clients.all()) or ''
            orgs = ', '.join(a.name for a in ev.authorized_orgs.all()) or ''
            duty = ', '.join(d.name for d in ev.duty_personnel.all()) or ''
            entry = ', '.join(e.name for e in ev.entry_personnel.all()) or ''
            ws1.append([
                ev.date.strftime('%Y-%m-%d') if ev.date else '',
                ev.order_number or '',
                ev.start_time.strftime('%H:%M') if ev.start_time else '',
                ev.end_time.strftime('%H:%M') if ev.end_time else '',
                (ev.description or '')[:500],
                rooms, clients, orgs, duty, entry,
                '是' if ev.completion_status else '否'
            ])
        _set_header_style(ws1)

        # Sheet 2: 人员进出（与导入模板一致，含值班人员）
        ws2 = wb.create_sheet('人员进出')
        headers2 = ['日期', '姓名', '身份证号', '联系方式', '进场时间', '离场时间', '工作描述', '客户', '授权单位', '机房', '值班人员']
        ws2.append(headers2)
        for ev in qs_list:
            rooms = ', '.join(r.name for r in ev.rooms.all()) or ''
            clients = ', '.join(c.name for c in ev.clients.all()) or ''
            orgs = ', '.join(a.name for a in ev.authorized_orgs.all()) or ''
            duty = ', '.join(d.name for d in ev.duty_personnel.all()) or ''
            for ep in ev.entry_personnel.all():
                ws2.append([
                    ev.date.strftime('%Y-%m-%d') if ev.date else '',
                    ep.name, ep.id_card, ep.contact_info or '',
                    ev.start_time.strftime('%H:%M') if ev.start_time else '',
                    ev.end_time.strftime('%H:%M') if ev.end_time else '',
                    (ev.description or '')[:500],
                    clients, orgs, rooms, duty
                ])
        _set_header_style(ws2)

        # Sheet 3: 上架汇总（与导入模板一致，含值班人员）
        ws3 = wb.create_sheet('上架汇总')
        headers3 = ['日期', '客户代表', '品牌', '型号', '序列号', 'U数', '机架位置', '机柜名称', '机房', '电源类型', '电源瓦数', '设备类型', '值班人员']
        ws3.append(headers3)
        for ev in qs_list:
            customer_rep = self._event_customer_representative(ev)
            duty = ', '.join(d.name for d in ev.duty_personnel.all()) or ''
            for ed in ev.devices.all():
                cab = ed.cabinet
                room_name = cab.room.name if cab and cab.room else ''
                cab_name = cab.name if cab else ''
                ws3.append([
                    ev.date.strftime('%Y-%m-%d') if ev.date else '',
                    customer_rep,
                    ed.brand, ed.model, ed.sn, ed.u_size or '', ed.rack_position or '',
                    cab_name, room_name,
                    power_display.get(ed.power_type, ed.power_type or ''),
                    ed.power_wattage or '',
                    device_type_display.get(ed.device_type, ed.device_type or ''),
                    duty
                ])
        _set_header_style(ws3)

        # Sheet 4: 下架汇总（与导入模板一致，含值班人员）
        ws4 = wb.create_sheet('下架汇总')
        headers4 = ['日期', '客户代表', '品牌', '型号', '序列号', 'U数', '机架位置', '机柜名称', '机房', '电源类型', '电源瓦数', '设备类型', '下架原因', '状态', '值班人员']
        ws4.append(headers4)
        for ev in qs_list:
            customer_rep = self._event_customer_representative(ev)
            duty = ', '.join(d.name for d in ev.duty_personnel.all()) or ''
            for dec in ev.decommissioned_devices.all():
                cab = dec.cabinet
                room_name = cab.room.name if cab and cab.room else ''
                cab_name = cab.name if cab else ''
                ws4.append([
                    ev.date.strftime('%Y-%m-%d') if ev.date else '',
                    customer_rep,
                    dec.brand, dec.model, dec.sn, dec.u_size or '', dec.rack_position or '',
                    cab_name, room_name,
                    power_display.get(dec.power_type, dec.power_type or ''),
                    dec.power_wattage if hasattr(dec, 'power_wattage') else '',
                    getattr(dec, 'device_type', '') or '',
                    dec.decommission_reason or '',
                    status_display.get(dec.status, dec.status or ''),
                    duty
                ])
        _set_header_style(ws4)

        filename = '数据导出_事件与设备汇总.xlsx'
        return _workbook_to_response(wb, filename)


def _set_header_style(ws):
    """表头样式"""
    from openpyxl.styles import Font, PatternFill, Alignment
    fill = PatternFill(start_color='366092', end_color='366092', fill_type='solid')
    font = Font(bold=True, color='FFFFFF')
    for cell in ws[1]:
        cell.fill = fill
        cell.font = font
        cell.alignment = Alignment(horizontal='center', vertical='center')


def _workbook_to_response(wb, filename):
    """将 Workbook 转为 HttpResponse（xlsx）"""
    from io import BytesIO
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    resp = HttpResponse(
        buf.getvalue(),
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    resp['Content-Disposition'] = f'attachment; filename="{filename}"'
    return resp