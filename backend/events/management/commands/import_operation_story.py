"""
运维故事导入管理命令 - 完整版
支持：预览、增量导入、回滚、小规模测试
将分散的Excel数据重新组装成完整的"运维故事"
"""

import os
import re
import json
from datetime import datetime, date, time
from collections import defaultdict, Counter
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
import openpyxl
from openpyxl import load_workbook

from events.models import (
    Event, EntryPersonnel, EventEntryPersonnel, EventDevice,
    RoomEvent, EventClient, EventAuthorizedOrg, OperationStoryImport,
    EventDecommissionedDevice
)
from devices.models import Room, Cabinet, Device, DecommissionedDevice
from devices.services import (
    create_or_reuse_decommissioned_device_for_event,
    upsert_installed_device_for_event,
)
from common.models import Client, AuthorizedOrg

# 与 download_template 接口一致的模板列（用于导入前校验）
PERSONNEL_TEMPLATE_HEADERS = [
    '日期', '姓名', '身份证号', '联系方式', '进场时间', '离场时间',
    '工作描述', '客户', '授权单位', '机房'
]
PERSONNEL_ALLOWED_EXTRA_HEADERS = [
    '客户代表', '客户代表姓名', '值班人员', '身份证', '电话', '开始时间', '结束时间', '描述', '客户名称'
]
# 上架/下架由工作表区分，模板不再包含「操作类型」列
DEVICE_TEMPLATE_HEADERS = [
    '日期', '客户代表', '品牌', '型号', '序列号', 'U数', '机架位置', '机柜名称', '机房',
    '电源类型', '电源瓦数', '设备类型'
]
DEVICE_ALLOWED_EXTRA_HEADERS = [
    '操作日期', '姓名', '客户', '客户名称', '授权单位', '机柜', '值班人员', '类型', 'SN',
    '操作类型',  # 兼容旧模板，上架/下架由工作表区分即可
    '使用说明', '备注', '说明', '下架原因', '原因', '状态'
]
U_POSITION_MIN, U_POSITION_MAX = 1, 42  # 设备位置 U 位有效范围 1U～42U


class Command(BaseCommand):
    help = '从Excel文件导入运维故事：将人员进出和设备上下架数据组装成完整事件'

    def add_arguments(self, parser):
        parser.add_argument(
            'excel_file',
            type=str,
            help='Excel文件路径（包含人员进出表和设备上下架表）'
        )
        parser.add_argument(
            '--personnel-sheet',
            type=str,
            default='人员进出',
            help='人员进出表Sheet名称（默认：人员进出）'
        )
        parser.add_argument(
            '--install-sheet',
            type=str,
            default='上架汇总',
            help='设备上架表Sheet名称（默认：上架汇总）'
        )
        parser.add_argument(
            '--decommission-sheet',
            type=str,
            default='下架汇总',
            help='设备下架表Sheet名称（默认：下架汇总）'
        )
        parser.add_argument(
            '--preview',
            action='store_true',
            help='预览模式：只解析数据，不写入数据库，生成预览报告'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='试运行模式：模拟导入过程，不实际写入数据库'
        )
        parser.add_argument(
            '--incremental',
            action='store_true',
            help='增量导入模式：跳过已存在的订单号，只导入新数据'
        )
        parser.add_argument(
            '--batch-id',
            type=str,
            help='批次ID：用于标识本次导入，支持回滚'
        )
        parser.add_argument(
            '--max-rows',
            type=int,
            help='最大处理行数（用于小规模测试）'
        )
        parser.add_argument(
            '--rollback',
            type=str,
            help='回滚指定批次ID的导入数据'
        )

    def handle(self, *args, **options):
        # 回滚模式
        if options['rollback']:
            self._rollback_import(options['rollback'])
            return

        excel_file = options['excel_file']
        personnel_sheet = options['personnel_sheet']
        install_sheet = options.get('install_sheet', '上架汇总')
        decommission_sheet = options.get('decommission_sheet', '下架汇总')
        preview_mode = options['preview']
        dry_run = options['dry_run']
        incremental = options['incremental']
        batch_id = options.get('batch_id') or f"BATCH_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        max_rows = options.get('max_rows')

        if not os.path.exists(excel_file):
            self.stdout.write(self.style.ERROR(f'✗ Excel文件不存在: {excel_file}'))
            return

        self.stdout.write('=' * 60)
        self.stdout.write(self.style.SUCCESS('开始导入运维故事数据'))
        self.stdout.write('=' * 60)
        self.stdout.write(f'Excel文件: {excel_file}')
        self.stdout.write(f'批次ID: {batch_id}')
        self.stdout.write(f'人员进出表: {personnel_sheet}')
        self.stdout.write(f'设备上架表: {install_sheet}')
        self.stdout.write(f'设备下架表: {decommission_sheet}')
        
        if preview_mode:
            self.stdout.write(self.style.WARNING('⚠ 预览模式：只解析数据，不写入数据库'))
        elif dry_run:
            self.stdout.write(self.style.WARNING('⚠ 试运行模式：模拟导入过程'))
        elif incremental:
            self.stdout.write(self.style.WARNING('⚠ 增量导入模式：跳过已存在的订单号'))
        
        if max_rows:
            self.stdout.write(self.style.WARNING(f'⚠ 测试模式：最多处理 {max_rows} 行数据'))
        
        self.stdout.write('')

        try:
            # 加载Excel文件
            workbook = load_workbook(excel_file, data_only=True)

            # 第一阶段：基础设施准备
            self.stdout.write(self.style.SUCCESS('[第一阶段] 基础设施准备'))
            self.stdout.write('-' * 60)
            dict_data = self._prepare_infrastructure(workbook, preview_mode)
            self.stdout.write('')

            # 第二阶段：构建事件容器（处理人员进出表）
            self.stdout.write(self.style.SUCCESS('[第二阶段] 构建事件容器（人员进出表）'))
            self.stdout.write('-' * 60)
            event_cache, personnel_results = self._process_personnel_sheet(
                workbook, personnel_sheet, dict_data, 
                preview_mode, dry_run, incremental, batch_id, max_rows
            )
            self.stdout.write('')

            # 第三阶段：填充设备详情（处理设备上架表）
            self.stdout.write(self.style.SUCCESS('[第三阶段] 填充设备详情（设备上架表）'))
            self.stdout.write('-' * 60)
            install_results = self._process_device_sheet(
                workbook, install_sheet, dict_data, event_cache,
                preview_mode, dry_run, incremental, batch_id, max_rows, is_decommission=False
            )
            self.stdout.write('')
            
            # 第四阶段：填充设备详情（处理设备下架表）
            self.stdout.write(self.style.SUCCESS('[第四阶段] 填充设备详情（设备下架表）'))
            self.stdout.write('-' * 60)
            decommission_results = self._process_device_sheet(
                workbook, decommission_sheet, dict_data, event_cache,
                preview_mode, dry_run, incremental, batch_id, max_rows, is_decommission=True
            )
            self.stdout.write('')
            
            # 合并设备结果（相同跳过原因合并计数；自动创建事件ID需合并供回滚使用）
            inst_skip = install_results.get('skip_reasons', {})
            dec_skip = decommission_results.get('skip_reasons', {})
            merged_skip = dict(Counter(inst_skip) + Counter(dec_skip))
            device_results = {
                'created': install_results['created'] + decommission_results['created'],
                'updated': install_results['updated'] + decommission_results['updated'],
                'matched': install_results['matched'] + decommission_results['matched'],
                'unmatched': install_results['unmatched'] + decommission_results['unmatched'],
                'devices': install_results['devices'] + decommission_results['devices'],
                'skip_reasons': merged_skip,
                'auto_created_event_ids': (
                    list(install_results.get('auto_created_event_ids') or []) +
                    list(decommission_results.get('auto_created_event_ids') or [])
                ),
            }

            # 生成预览报告或完成报告
            if preview_mode:
                self._generate_preview_report(personnel_results, device_results, batch_id)
            else:
                # 保存导入记录（用于回滚）
                if not dry_run:
                    # 获取导入选项
                    options = {
                        'incremental': incremental,
                        'personnel_sheet': personnel_sheet,
                        'install_sheet': install_sheet,
                        'decommission_sheet': decommission_sheet,
                    }
                    self._save_import_record(batch_id, personnel_results, device_results, options)
                
                # 完成
                self.stdout.write('=' * 60)
                self.stdout.write(self.style.SUCCESS('✓ 导入完成！'))
                self.stdout.write('=' * 60)
                self._print_summary(personnel_results, device_results, batch_id)

        except Exception as e:
            self.stdout.write(self.style.ERROR(f'✗ 导入失败: {str(e)}'))
            import traceback
            self.stdout.write(traceback.format_exc())
            
            # 如果已开始导入，尝试回滚
            if not preview_mode and not dry_run and batch_id:
                self.stdout.write(self.style.WARNING(f'⚠ 尝试回滚批次: {batch_id}'))
                self._rollback_import(batch_id)

    # ========== 第一阶段：基础设施准备 ==========
    
    def _prepare_infrastructure(self, workbook, preview_mode):
        """第一阶段：基础设施准备"""
        dict_data = {
            'rooms': set(),
            'authorized_orgs': set(),
            'clients': set(),
        }

        # 扫描所有Sheet，提取字典数据
        for sheet_name in workbook.sheetnames:
            sheet = workbook[sheet_name]
            
            # 读取表头
            headers = self._read_headers(sheet)
            
            # 读取数据行
            for row_idx, row in enumerate(sheet.iter_rows(min_row=2, values_only=False), 2):
                # 提取机房名称
                if '机房' in headers:
                    room_name = self._get_cell_value(row, headers['机房'])
                    if room_name:
                        dict_data['rooms'].add(str(room_name).strip())

                # 提取授权单位
                if '授权单位' in headers:
                    org_name = self._get_cell_value(row, headers['授权单位'])
                    if org_name:
                        dict_data['authorized_orgs'].add(str(org_name).strip())

                # 提取客户名称
                if '客户' in headers or '客户名称' in headers:
                    client_key = '客户' if '客户' in headers else '客户名称'
                    client_name = self._get_cell_value(row, headers[client_key])
                    if client_name:
                        dict_data['clients'].add(str(client_name).strip())

        # 创建字典数据（只创建机房，客户和授权单位不自动创建，需要在验证时存在）
        if not preview_mode:
            created_count = 0
            for room_name in dict_data['rooms']:
                room, created = Room.objects.get_or_create(name=room_name)
                if created:
                    created_count += 1
                    self.stdout.write(f'  ✓ 创建机房: {room_name}')

            # 注意：授权单位和客户不在第一阶段自动创建，需要在处理数据时验证是否存在
            # 如果授权单位或客户不存在，将跳过该行数据
            if dict_data['authorized_orgs']:
                self.stdout.write(f'  提示: 发现 {len(dict_data["authorized_orgs"])} 个授权单位，将在数据验证时检查是否存在')
            if dict_data['clients']:
                self.stdout.write(f'  提示: 发现 {len(dict_data["clients"])} 个客户，将在数据验证时检查是否存在')

            self.stdout.write(f'  总计: 创建 {created_count} 条字典数据')
        else:
            self.stdout.write(f'  预览: 发现 {len(dict_data["rooms"])} 个机房, '
                            f'{len(dict_data["authorized_orgs"])} 个授权单位, '
                            f'{len(dict_data["clients"])} 个客户')
            if dict_data['authorized_orgs']:
                self.stdout.write(f'  提示: 将在数据验证时检查授权单位是否存在，不存在的授权单位将跳过')
            if dict_data['clients']:
                self.stdout.write(f'  提示: 将在数据验证时检查客户是否存在，不存在的客户将跳过')

        return dict_data

    # ========== 第二阶段：构建事件容器 ==========
    
    def _process_personnel_sheet(self, workbook, sheet_name, dict_data, 
                                 preview_mode, dry_run, incremental, batch_id, max_rows):
        """第二阶段：构建事件容器（处理人员进出表）"""
        if sheet_name not in workbook.sheetnames:
            self.stdout.write(self.style.WARNING(f'  ⚠ Sheet "{sheet_name}" 不存在，跳过'))
            return {}, {'created': 0, 'skipped': 0, 'updated': 0, 'events': [], 'skip_reasons': defaultdict(int), 'sheet_name': sheet_name}

        sheet = workbook[sheet_name]
        # 解析后表头校验（与其他检测逻辑一起）
        ok, err_msg = self._validate_personnel_sheet_headers(sheet, sheet_name)
        if not ok:
            self.stdout.write(self.style.WARNING(f'  ⚠ [{sheet_name}] 表头与模板不一致，跳过该表: {err_msg}'))
            reason = f'[{sheet_name}] 表头与模板不一致: {err_msg}'
            results = {'created': 0, 'skipped': 0, 'updated': 0, 'events': [], 'skip_reasons': defaultdict(int), 'sheet_name': sheet_name}
            results['skip_reasons'][reason] = 1
            return {}, results

        headers = self._read_headers(sheet)
        
        # 事件缓存：同一客户同一天共用一个订单号（日期_客户 为 key，供本表复用及上下架匹配）
        event_cache = {}
        event_counter = defaultdict(int)
        
        # 已存在的订单号（增量导入时使用）
        existing_orders = set()
        if incremental:
            existing_orders = set(
                Event.objects.values_list('order_number', flat=True)
                .exclude(order_number__isnull=True)
            )

        results = {
            'created': 0,
            'skipped': 0,
            'updated': 0,
            'events': [],
            'skip_reasons': defaultdict(int),  # 记录跳过原因统计
            'sheet_name': sheet_name  # 记录sheet名称
        }

        # 读取数据行
        row_count = 0
        for row_idx, row in enumerate(sheet.iter_rows(min_row=2, values_only=False), 2):
            if max_rows and row_count >= max_rows:
                break
            
            try:
                # 提取字段（支持多种可能的表头名称，使用辅助函数）
                date_str = self._find_header_value(row, headers, ['日期', '进出日期', 'date', '进出日期', '操作日期'])
                name = self._find_header_value(row, headers, ['姓名', '客户代表', 'name', '客户代表姓名', '人员姓名'])
                id_card = (self._get_cell_value(row, headers.get('身份证号')) or 
                          self._get_cell_value(row, headers.get('身份证')))
                contact = (self._get_cell_value(row, headers.get('联系方式')) or 
                          self._get_cell_value(row, headers.get('电话')))
                start_time_str = (self._get_cell_value(row, headers.get('进场时间')) or 
                                 self._get_cell_value(row, headers.get('开始时间')))
                end_time_str = (self._get_cell_value(row, headers.get('离场时间')) or 
                               self._get_cell_value(row, headers.get('结束时间')))
                description = (self._get_cell_value(row, headers.get('工作描述')) or 
                              self._get_cell_value(row, headers.get('描述')))
                client_name = (self._get_cell_value(row, headers.get('客户')) or 
                              self._get_cell_value(row, headers.get('客户名称')))
                # 客户代表字段（必填）：代表客户公司的授权人
                customer_representative_name = (self._get_cell_value(row, headers.get('客户代表')) or 
                                               self._get_cell_value(row, headers.get('客户代表姓名')))
                org_name = self._get_cell_value(row, headers.get('授权单位'))
                room_name = self._get_cell_value(row, headers.get('机房'))
                duty_personnel_name = self._get_cell_value(row, headers.get('值班人员'))

                # 验证必填字段（日期、姓名、客户、客户代表都是必填）
                if not date_str or not name:
                    skip_reason = f'[{sheet_name}] 第{row_idx}行 必填字段为空 (日期: {date_str or "空"}, 姓名: {name or "空"})'
                    results['skipped'] += 1
                    results['skip_reasons'][skip_reason] += 1
                    continue
                
                # 验证客户和客户代表是否填写（必填字段）
                if not client_name:
                    skip_reason = f'[{sheet_name}] 第{row_idx}行 客户字段为空，人员进出记录必须指定客户'
                    results['skipped'] += 1
                    results['skip_reasons'][skip_reason] += 1
                    continue
                
                # 验证客户代表是否填写（必填字段）
                if not customer_representative_name:
                    skip_reason = f'[{sheet_name}] 第{row_idx}行 客户代表字段为空，人员进出记录必须指定客户代表'
                    results['skipped'] += 1
                    results['skip_reasons'][skip_reason] += 1
                    continue

                # 解析日期和时间
                event_date = self._parse_date(date_str)
                start_time = self._parse_time(start_time_str) if start_time_str else time(15, 30)
                end_time = self._parse_time(end_time_str) if end_time_str else time(21, 0)

                if not event_date:
                    skip_reason = f'[{sheet_name}] 第{row_idx}行 日期解析失败 (原始值: {date_str!r}, 类型: {type(date_str).__name__})'
                    results['skipped'] += 1
                    results['skip_reasons'][skip_reason] += 1
                    continue
                
                # 验证进场时间：开始时间必须小于结束时间
                if start_time and end_time:
                    # 将时间转换为datetime进行比较（使用事件日期）
                    start_dt = datetime.combine(event_date, start_time)
                    end_dt = datetime.combine(event_date, end_time)
                    if start_dt >= end_dt:
                        skip_reason = f'[{sheet_name}] 第{row_idx}行 进场时间错误：开始时间({start_time_str})必须小于结束时间({end_time_str})'
                        results['skipped'] += 1
                        results['skip_reasons'][skip_reason] += 1
                        continue
                
                # 检查客户是否存在，并验证客户代表是否匹配
                client = None
                try:
                    client = Client.objects.get(name=str(client_name).strip())
                except Client.DoesNotExist:
                    skip_reason = f'[{sheet_name}] 第{row_idx}行 客户不存在: {client_name!r}'
                    results['skipped'] += 1
                    results['skip_reasons'][skip_reason] += 1
                    continue
                
                # 检查客户代表是否与客户表中的authorized_person字段匹配（必填字段）
                if customer_representative_name:
                    # 获取客户的authorized_person字段
                    client_authorized_person = getattr(client, 'authorized_person', None)
                    if client_authorized_person:
                        # 比较客户代表名称是否匹配
                        if str(client_authorized_person).strip() != str(customer_representative_name).strip():
                            skip_reason = f'[{sheet_name}] 第{row_idx}行 客户代表不匹配: 客户"{client_name}"的授权人是"{client_authorized_person}"，但提供的是"{customer_representative_name}"'
                            results['skipped'] += 1
                            results['skip_reasons'][skip_reason] += 1
                            continue
                    else:
                        # 如果客户没有设置authorized_person，则跳过验证（允许为空的情况）
                        pass
                
                # 注意：人员（EntryPersonnel）不需要预先检测是否存在
                # 如果人员已存在（基于身份证号），会复用现有记录；如果不存在，会自动创建
                # 只需要检测客户和客户代表（这些是不会变动的）
                
                # 检查值班人员是否存在，并保留对象供后续关联到事件
                duty_personnel_obj = None
                if duty_personnel_name:
                    try:
                        from common.models import DutyPersonnel
                        duty_personnel_obj = DutyPersonnel.objects.filter(
                            name=str(duty_personnel_name).strip()
                        ).first()
                        if not duty_personnel_obj:
                            skip_reason = f'[{sheet_name}] 第{row_idx}行 值班人员不存在: {duty_personnel_name!r}'
                            results['skipped'] += 1
                            results['skip_reasons'][skip_reason] += 1
                            continue
                    except Exception as e:
                        skip_reason = f'[{sheet_name}] 第{row_idx}行 值班人员检查失败: {duty_personnel_name!r} ({type(e).__name__}: {e})'
                        results['skipped'] += 1
                        results['skip_reasons'][skip_reason] += 1
                        continue

                # 同一客户同一天共用一个订单号：按 (日期, 客户) 复用事件
                entrant_name = str(name).strip() if name else str(customer_representative_name).strip()
                rep_name_display = str(customer_representative_name).strip()
                client_name_stripped = str(client_name).strip() if client_name else ''
                cache_key_client = f"{event_date.strftime('%Y-%m-%d')}_{client_name_stripped}"
                cache_key_rep = f"{event_date.strftime('%Y-%m-%d')}_{rep_name_display}"

                existing_event_data = event_cache.get(cache_key_client)
                if existing_event_data:
                    # 已有该客户当天的订单，只追加进场人员到同一事件
                    event_obj = existing_event_data.get('event')
                    order_number = existing_event_data.get('order_number', '')
                    event_data = {
                        'order_number': order_number,
                        'name': entrant_name,
                        'date': event_date,
                        'start_time': start_time,
                        'end_time': end_time,
                        'description': str(description).strip() if description else '',
                        'client_name': str(client_name).strip() if client_name else None,
                        'org_name': str(org_name).strip() if org_name else None,
                        'room_name': str(room_name).strip() if room_name else None,
                        'id_card': str(id_card).strip() if id_card else None,
                        'contact': str(contact).strip() if contact else None,
                    }
                    if not preview_mode and not dry_run and event_obj:
                        try:
                            with transaction.atomic():
                                id_card_value = id_card or f'UNKNOWN_{row_idx}_{batch_id}'
                                try:
                                    entry_personnel = EntryPersonnel.objects.get(id_card=id_card_value)
                                    if entry_personnel.name != entrant_name:
                                        entry_personnel.name = entrant_name
                                        entry_personnel.save(update_fields=['name'])
                                    if contact and entry_personnel.contact_info != str(contact).strip():
                                        entry_personnel.contact_info = str(contact).strip()
                                        entry_personnel.save(update_fields=['contact_info'])
                                except EntryPersonnel.DoesNotExist:
                                    entry_personnel = EntryPersonnel.objects.create(
                                        id_card=id_card_value,
                                        name=entrant_name,
                                        contact_info=str(contact).strip() if contact else '',
                                    )
                                except EntryPersonnel.MultipleObjectsReturned:
                                    entry_personnel = EntryPersonnel.objects.filter(id_card=id_card_value).first()
                                    if entry_personnel.name != entrant_name:
                                        entry_personnel.name = entrant_name
                                        entry_personnel.save(update_fields=['name'])
                                EventEntryPersonnel.objects.get_or_create(
                                    event=event_obj,
                                    entry_personnel=entry_personnel
                                )
                                if duty_personnel_obj:
                                    from events.models import EventDutyPersonnel
                                    EventDutyPersonnel.objects.get_or_create(
                                        event=event_obj,
                                        duty_personnel=duty_personnel_obj
                                    )
                        except Exception as e:
                            skip_reason = f'[{sheet_name}] 第{row_idx}行 关联进场人员失败: {type(e).__name__}: {e}'
                            results['skipped'] += 1
                            results['skip_reasons'][skip_reason] = results['skip_reasons'].get(skip_reason, 0) + 1
                            continue
                    self.stdout.write(f'  ✓ [{order_number}] +进场人 {entrant_name}（同一订单）')
                    row_count += 1
                    continue

                # 该客户当天尚无订单，创建新事件并生成订单号
                date_key = event_date.strftime('%Y%m%d')
                event_counter[date_key] += 1
                order_number = f'HT-{event_date.strftime("%Y%m%d")}-{event_counter[date_key]:03d}'

                if incremental and order_number in existing_orders:
                    skip_reason = f'[{sheet_name}] 第{row_idx}行 订单号已存在: {order_number}'
                    results['skipped'] += 1
                    results['skip_reasons'][skip_reason] += 1
                    continue

                event_data = {
                    'order_number': order_number,
                    'name': entrant_name,
                    'date': event_date,
                    'start_time': start_time,
                    'end_time': end_time,
                    'description': str(description).strip() if description else '',
                    'client_name': str(client_name).strip() if client_name else None,
                    'org_name': str(org_name).strip() if org_name else None,
                    'room_name': str(room_name).strip() if room_name else None,
                    'id_card': str(id_card).strip() if id_card else None,
                    'contact': str(contact).strip() if contact else None,
                }

                event_obj = None
                if not preview_mode and not dry_run:
                    try:
                        with transaction.atomic():
                            id_card_value = id_card or f'UNKNOWN_{row_idx}_{batch_id}'
                            try:
                                entry_personnel = EntryPersonnel.objects.get(id_card=id_card_value)
                                if entry_personnel.name != entrant_name:
                                    entry_personnel.name = entrant_name
                                    entry_personnel.save(update_fields=['name'])
                                if contact and entry_personnel.contact_info != str(contact).strip():
                                    entry_personnel.contact_info = str(contact).strip()
                                    entry_personnel.save(update_fields=['contact_info'])
                            except EntryPersonnel.DoesNotExist:
                                entry_personnel = EntryPersonnel.objects.create(
                                    id_card=id_card_value,
                                    name=entrant_name,
                                    contact_info=str(contact).strip() if contact else '',
                                )
                            except EntryPersonnel.MultipleObjectsReturned:
                                entry_personnel = EntryPersonnel.objects.filter(id_card=id_card_value).first()
                                if entry_personnel.name != entrant_name:
                                    entry_personnel.name = entrant_name
                                    entry_personnel.save(update_fields=['name'])
                                self.stdout.write(self.style.WARNING(
                                    f'  ⚠ 发现多个相同身份证（{id_card_value}），使用第一条（ID: {entry_personnel.id}）'
                                ))

                            event_obj = Event.objects.create(
                                date=event_date,
                                start_time=start_time,
                                end_time=end_time,
                                order_number=order_number,
                                description=event_data['description'],
                                completion_status=True,
                            )

                            EventEntryPersonnel.objects.get_or_create(
                                event=event_obj,
                                entry_personnel=entry_personnel
                            )
                            EventClient.objects.get_or_create(event=event_obj, client=client)
                            if org_name:
                                try:
                                    org = AuthorizedOrg.objects.get(name=str(org_name).strip())
                                    EventAuthorizedOrg.objects.get_or_create(event=event_obj, authorized_org=org)
                                except AuthorizedOrg.DoesNotExist:
                                    pass
                            if room_name:
                                try:
                                    room = Room.objects.get(name=str(room_name).strip())
                                    RoomEvent.objects.get_or_create(event=event_obj, room=room)
                                except Room.DoesNotExist:
                                    pass
                            if duty_personnel_obj:
                                from events.models import EventDutyPersonnel
                                EventDutyPersonnel.objects.get_or_create(
                                    event=event_obj,
                                    duty_personnel=duty_personnel_obj
                                )

                            event_data['event_id'] = event_obj.id
                            event_data['batch_id'] = batch_id
                    except Exception as e:
                        skip_reason = f'[{sheet_name}] 第{row_idx}行 创建事件失败: {type(e).__name__}: {e}'
                        results['skipped'] += 1
                        results['skip_reasons'][skip_reason] = results['skip_reasons'].get(skip_reason, 0) + 1
                        continue

                event_client = None
                event_client_name = client_name if client_name else None
                if event_obj:
                    event_clients = event_obj.clients.all() if hasattr(event_obj, 'clients') else []
                    event_client = event_clients[0] if event_clients else None
                    event_client_name = event_client.name if event_client else event_client_name

                event_data_for_cache = {
                    'event': event_obj,
                    'order_number': order_number,
                    'name': rep_name_display,
                    'date': event_date,
                    'event_id': event_obj.id if event_obj else None,
                    'client': event_client,
                    'client_name': event_client_name or client_name_stripped,
                }
                event_cache[cache_key_client] = event_data_for_cache
                event_cache[cache_key_rep] = event_data_for_cache

                results['created'] += 1
                results['events'].append(event_data)
                self.stdout.write(f'  ✓ [{order_number}] {entrant_name}（客户代表: {rep_name_display}） - {event_date}')
                row_count += 1

            except Exception as e:
                self.stdout.write(self.style.WARNING(f'  ⚠ 第{row_idx}行处理失败: {str(e)}'))
                results['skipped'] += 1

        self.stdout.write(f'  总计: 创建 {results["created"]} 个事件，跳过 {results["skipped"]} 条记录')
        
        # 显示跳过原因统计（过滤掉空白行相关的跳过原因）
        if results['skip_reasons']:
            filtered_reasons = {}
            for reason, count in results['skip_reasons'].items():
                # 过滤掉空白行相关的跳过原因
                if '必填字段为空' in reason and ('日期: 空' in reason or '姓名: 空' in reason):
                    # 检查是否真的是空白行（日期和姓名都为空）
                    if '日期: 空' in reason and '姓名: 空' in reason:
                        continue  # 跳过空白行的统计
                filtered_reasons[reason] = count
            
            if filtered_reasons:
                self.stdout.write('  跳过原因统计:')
                for reason, count in sorted(filtered_reasons.items(), key=lambda x: x[1], reverse=True):
                    self.stdout.write(f'    - {reason}: {count} 条')
        
        return event_cache, results

    # ========== 第三阶段：填充设备详情 ==========
    
    def _process_device_sheet(self, workbook, sheet_name, dict_data, event_cache,
                             preview_mode, dry_run, incremental, batch_id, max_rows, is_decommission=False):
        """第三阶段/第四阶段：填充设备详情（处理设备上下架表）"""
        if sheet_name not in workbook.sheetnames:
            self.stdout.write(self.style.WARNING(f'  ⚠ Sheet "{sheet_name}" 不存在，跳过'))
            return {'created': 0, 'updated': 0, 'matched': 0, 'unmatched': 0, 'devices': [], 'skip_reasons': defaultdict(int), 'conflicts': [], 'sheet_name': sheet_name, 'auto_created_event_ids': []}

        sheet = workbook[sheet_name]
        # 解析后表头校验（与其他检测逻辑一起）
        label = '下架' if is_decommission else '上架'
        ok, err_msg = self._validate_device_sheet_headers(sheet, sheet_name, label)
        if not ok:
            self.stdout.write(self.style.WARNING(f'  ⚠ [{sheet_name}]（{label}）表头与模板不一致，跳过该表: {err_msg}'))
            reason = f'[{sheet_name}]（{label}）表头与模板不一致: {err_msg}'
            results = {'created': 0, 'updated': 0, 'matched': 0, 'unmatched': 0, 'devices': [], 'skip_reasons': defaultdict(int), 'conflicts': [], 'sheet_name': sheet_name, 'auto_created_event_ids': []}
            results['skip_reasons'][reason] = 1
            return results

        headers = self._read_headers(sheet)

        results = {
            'created': 0,
            'updated': 0,
            'matched': 0,
            'unmatched': 0,
            'devices': [],
            'skip_reasons': defaultdict(int),  # 记录跳过原因统计
            'conflicts': [],  # 记录冲突信息
            'sheet_name': sheet_name,  # 记录sheet名称
            'auto_created_event_ids': [],  # 记录自动创建的事件ID（用于回滚）
        }
        
        # 用于跟踪当前批次内已处理的设备（用于检测同一批次内的冲突）
        processed_devices = {}  # key: sn, value: {room, cabinet, rack_position, u_size, row}
        processed_positions = {}  # key: (room, cabinet, start_pos, end_pos), value: {sn, row}

        row_count = 0
        for row_idx, row in enumerate(sheet.iter_rows(min_row=2, values_only=False), 2):
            if max_rows and row_count >= max_rows:
                break
            
            try:
                # 提取字段
                date_str = self._get_cell_value(row, headers.get('日期') or headers.get('操作日期'))
                customer_name = self._get_cell_value(row, headers.get('客户代表') or headers.get('姓名'))
                client_name = self._get_cell_value(row, headers.get('客户') or headers.get('客户名称'))
                org_name = self._get_cell_value(row, headers.get('授权单位'))
                brand = self._get_cell_value(row, headers.get('品牌'))
                model = self._get_cell_value(row, headers.get('型号'))
                sn = self._get_cell_value(row, headers.get('序列号') or headers.get('SN'))
                u_size = self._get_cell_value(row, headers.get('U数'))
                rack_position = self._get_cell_value(row, headers.get('机架位置'))
                cabinet_name_raw = self._get_cell_value(row, headers.get('机柜名称') or headers.get('机柜'))
                # 标准化机柜名称（将字母转换为数字，如D01->04-01）
                cabinet_name = self._normalize_cabinet_name(cabinet_name_raw) if cabinet_name_raw else None
                room_name = self._get_cell_value(row, headers.get('机房'))
                duty_personnel_name = self._get_cell_value(row, headers.get('值班人员'))
                # 如果是下架表，不需要操作类型字段（默认为下架）
                # 如果是上架表，可以读取操作类型，但通常上架表不需要这个字段
                operation_type = None
                if not is_decommission:
                    operation_type = self._get_cell_value(row, headers.get('操作类型') or headers.get('类型'))
                power_type = self._get_cell_value(row, headers.get('电源类型'))
                power_wattage = self._get_cell_value(row, headers.get('电源瓦数'))
                device_type = self._get_cell_value(row, headers.get('设备类型'))
                # EventDevice关联字段（时间来源于事件，不需要单独字段）
                usage_notes = self._get_cell_value(row, headers.get('使用说明') or headers.get('备注') or headers.get('说明'))
                decommission_reason = None
                decommission_status = None
                if is_decommission:
                    decommission_reason = self._get_cell_value(row, headers.get('下架原因') or headers.get('原因'))
                    decommission_status = self._get_cell_value(row, headers.get('状态'))

                # 验证必填字段
                if not date_str or not sn:
                    skip_reason = f'[{sheet_name}] 第{row_idx}行 必填字段为空 (日期: {date_str or "空"}, 序列号: {sn or "空"})'
                    results['unmatched'] += 1
                    results['skip_reasons'][skip_reason] += 1
                    continue

                # 解析日期
                event_date = self._parse_date(date_str)
                if not event_date:
                    skip_reason = f'[{sheet_name}] 第{row_idx}行 日期解析失败 (原始值: {date_str!r}, 类型: {type(date_str).__name__})'
                    results['unmatched'] += 1
                    results['skip_reasons'][skip_reason] += 1
                    continue

                # 设备位置 U 位校验：U数、机架位置必须在 1U～42U 范围内
                u_validation_error = self._validate_device_u_position(u_size, rack_position, sheet_name, row_idx)
                if u_validation_error:
                    results['unmatched'] += 1
                    results['skip_reasons'][u_validation_error] += 1
                    continue

                # 寻找匹配的Event（增强匹配逻辑，支持通过客户匹配）
                matched_event = self._find_matching_event(
                    event_date, customer_name, room_name, event_cache, client_name
                )
                order_number = matched_event['order_number'] if matched_event else None

                if not matched_event:
                    # 匹配失败：自动创建事件（无论是否预览模式都创建，预览模式下只记录）
                    results['unmatched'] += 1
                    
                    # 生成订单号（与正常事件格式相同，遇到重复时递增）
                    date_key = event_date.strftime('%Y%m%d')
                    
                    # 查找当天已有的订单号，找到最大的序号（预览模式和实际模式都需要）
                    existing_orders = Event.objects.filter(
                        order_number__startswith=f'HT-{date_key}-'
                    ).values_list('order_number', flat=True)
                    
                    # 同时检查event_cache中当天已创建的事件（预览模式下可能还没有写入数据库）
                    cache_orders = []
                    for cache_key, cache_value in event_cache.items():
                        if cache_value.get('date') and cache_value['date'].strftime('%Y%m%d') == date_key:
                            cache_order = cache_value.get('order_number')
                            if cache_order:
                                cache_orders.append(cache_order)
                    
                    # 合并所有订单号（数据库中的和缓存中的）
                    all_orders = list(existing_orders) + cache_orders
                    
                    # 提取所有序号，找到最大的序号
                    max_counter = 0
                    for order in all_orders:
                        if order:
                            # 格式：HT-YYYYMMDD-XXX
                            parts = order.split('-')
                            if len(parts) >= 3:
                                try:
                                    counter = int(parts[2])
                                    max_counter = max(max_counter, counter)
                                except ValueError:
                                    pass
                    
                    # 从最大序号+1开始，检查是否已存在，如果存在则继续递增
                    counter = max_counter + 1
                    if not preview_mode and not dry_run:
                        # 实际模式下，检查数据库
                        while Event.objects.filter(order_number=f'HT-{date_key}-{counter:03d}').exists():
                            counter += 1
                    else:
                        # 预览模式下，检查缓存
                        while f'HT-{date_key}-{counter:03d}' in all_orders:
                            counter += 1
                    
                    order_number = f'HT-{date_key}-{counter:03d}'

                    if not preview_mode and not dry_run:
                        # 先进行验证（在事务外），如果验证失败，直接跳过
                        client_obj = None
                        if client_name:
                            try:
                                client_obj = Client.objects.get(name=str(client_name).strip())
                            except Client.DoesNotExist:
                                skip_reason = f'[{sheet_name}] 第{row_idx}行 客户不存在: {client_name!r}'
                                results['unmatched'] += 1
                                results['skip_reasons'][skip_reason] += 1
                                row_count += 1
                                continue
                        
                        # 客户代表 = 客户表中的授权人：仅校验授权人与Excel一致，不要求 EntryPersonnel 预先存在
                        if customer_name and client_obj:
                            client_authorized_person = getattr(client_obj, 'authorized_person', None) or ''
                            if str(client_authorized_person).strip() != str(customer_name).strip():
                                skip_reason = f'[{sheet_name}] 第{row_idx}行 客户代表与客户授权人不一致: 客户"{client_name}"的授权人是"{client_authorized_person or "(未设置)"}"，Excel中为"{customer_name}"'
                                results['unmatched'] += 1
                                results['skip_reasons'][skip_reason] += 1
                                row_count += 1
                                continue
                        
                        # 检查授权单位是否存在（如果填写了授权单位）
                        org_obj = None
                        if org_name:
                            try:
                                org_obj = AuthorizedOrg.objects.get(name=str(org_name).strip())
                            except AuthorizedOrg.DoesNotExist:
                                skip_reason = f'[{sheet_name}] 第{row_idx}行 授权单位不存在: {org_name!r}'
                                results['unmatched'] += 1
                                results['skip_reasons'][skip_reason] += 1
                                row_count += 1
                                continue
                        
                        # 检查值班人员是否存在（如果填写了值班人员）
                        duty_personnel_obj = None
                        if duty_personnel_name:
                            try:
                                from common.models import DutyPersonnel
                                duty_personnel_obj = DutyPersonnel.objects.filter(
                                    name=str(duty_personnel_name).strip()
                                ).first()
                                if not duty_personnel_obj:
                                    skip_reason = f'[{sheet_name}] 第{row_idx}行 值班人员不存在: {duty_personnel_name!r}'
                                    results['unmatched'] += 1
                                    results['skip_reasons'][skip_reason] += 1
                                    row_count += 1
                                    continue
                            except Exception as e:
                                skip_reason = f'[{sheet_name}] 第{row_idx}行 值班人员检查失败: {duty_personnel_name!r} ({type(e).__name__}: {e})'
                                results['unmatched'] += 1
                                results['skip_reasons'][skip_reason] += 1
                                row_count += 1
                                continue
                        
                        # 设备表自动创建的事件不绑定进场人员（客户代表仅用于区分客户，不生成 EntryPersonnel）
                        # 验证通过后，在事务中创建事件和关联
                        try:
                            with transaction.atomic():
                                # 创建补充Event（使用默认时间15:30-21:00）
                                matched_event_obj = Event.objects.create(
                                    date=event_date,
                                    start_time=time(15, 30),  # 默认开始时间
                                    end_time=time(21, 0),     # 默认结束时间
                                    order_number=order_number,
                                    description=f'自动生成事件：设备{operation_type or ("下架" if is_decommission else "上架")}，客户代表：{customer_name or "未知"}',
                                    completion_status=True,
                                )
                                
                                # 保存自动创建的事件ID（用于回滚）
                                results['auto_created_event_ids'].append(matched_event_obj.id)
                                
                                # 关联机房
                                if room_name:
                                    try:
                                        room_obj = Room.objects.get(name=str(room_name).strip())
                                        RoomEvent.objects.get_or_create(event=matched_event_obj, room=room_obj)
                                    except Room.DoesNotExist:
                                        pass
                                
                                # 关联客户（如果存在）
                                if client_obj:
                                    from events.models import EventClient
                                    EventClient.objects.get_or_create(event=matched_event_obj, client=client_obj)
                                
                                # 关联授权单位（如果存在，已在前面验证过）
                                if org_obj:
                                    from events.models import EventAuthorizedOrg
                                    EventAuthorizedOrg.objects.get_or_create(event=matched_event_obj, authorized_org=org_obj)
                                
                                # 关联值班人员（如果存在，已在前面验证过）
                                if duty_personnel_obj:
                                    from events.models import EventDutyPersonnel
                                    EventDutyPersonnel.objects.get_or_create(event=matched_event_obj, duty_personnel=duty_personnel_obj)
                        except Exception as e:
                            # 如果事务中任何操作失败，整个事务会回滚
                            skip_reason = f'[{sheet_name}] 第{row_idx}行 自动创建事件失败: {type(e).__name__}: {e}'
                            results['unmatched'] += 1
                            results['skip_reasons'][skip_reason] = results['skip_reasons'].get(skip_reason, 0) + 1
                            row_count += 1
                            continue
                        
                        matched_event = {
                            'event': matched_event_obj,
                            'order_number': order_number,
                            'event_id': matched_event_obj.id,
                            'date': event_date,
                            'name': customer_name or '未知',
                            'client': client_obj,  # 保存客户对象，用于匹配
                            'client_name': client_name or (client_obj.name if client_obj else None),  # 保存客户名称
                        }
                        
                        # 将自动创建的事件也加入缓存（用于后续匹配）
                        cache_key = f"{event_date.strftime('%Y-%m-%d')}_{str(customer_name or '未知').strip()}"
                        event_cache[cache_key] = matched_event
                        
                        self.stdout.write(self.style.SUCCESS(
                            f'  ✓ 自动创建事件 [{order_number}] - {event_date} (客户代表: {customer_name or "未知"}, 客户: {client_name or (client_obj.name if client_obj else "未知")}, 默认时间: 15:30-21:00)'
                        ))
                    else:
                        # 预览模式下，先检查客户和客户代表是否存在
                        preview_client_check = True
                        preview_entry_personnel_check = True
                        
                        if client_name:
                            try:
                                Client.objects.get(name=str(client_name).strip())
                            except Client.DoesNotExist:
                                preview_client_check = False
                                skip_reason = f'[{sheet_name}] 第{row_idx}行 客户不存在: {client_name!r}'
                                results['unmatched'] += 1
                                results['skip_reasons'][skip_reason] += 1
                                self.stdout.write(self.style.ERROR(
                                    f'  ✗ 第{row_idx}行跳过: {skip_reason}'
                                ))
                        
                        # 客户代表 = 客户表中的授权人：仅校验 Excel 客户代表与客户授权人一致
                        if customer_name and preview_client_check:
                            try:
                                preview_client_obj = Client.objects.get(name=str(client_name).strip())
                                client_authorized_person = (getattr(preview_client_obj, 'authorized_person', None) or '').strip()
                                if not client_authorized_person:
                                    preview_entry_personnel_check = False
                                    skip_reason = f'[{sheet_name}] 第{row_idx}行 客户未设置授权人: {client_name!r}，无法校验客户代表'
                                    results['unmatched'] += 1
                                    results['skip_reasons'][skip_reason] += 1
                                    self.stdout.write(self.style.ERROR(
                                        f'  ✗ 第{row_idx}行跳过: {skip_reason}'
                                    ))
                                elif str(client_authorized_person) != str(customer_name).strip():
                                    preview_entry_personnel_check = False
                                    skip_reason = f'[{sheet_name}] 第{row_idx}行 客户代表与客户授权人不一致: 客户"{client_name}"的授权人是"{client_authorized_person}"，Excel中为"{customer_name}"'
                                    results['unmatched'] += 1
                                    results['skip_reasons'][skip_reason] += 1
                                    self.stdout.write(self.style.ERROR(
                                        f'  ✗ 第{row_idx}行跳过: {skip_reason}'
                                    ))
                            except Exception:
                                preview_entry_personnel_check = False
                                skip_reason = f'[{sheet_name}] 第{row_idx}行 客户代表检查失败: {customer_name!r}'
                                results['unmatched'] += 1
                                results['skip_reasons'][skip_reason] += 1
                                self.stdout.write(self.style.ERROR(
                                    f'  ✗ 第{row_idx}行跳过: {skip_reason}'
                                ))
                        
                        if not preview_client_check or not preview_entry_personnel_check:
                            # 如果检查失败，跳过该设备（device_data还未定义，不需要添加到结果中）
                            row_count += 1
                            continue
                        
                        # 预览模式与正式导入使用相同校验，确保预览数量与导入结果一致
                        # 检查授权单位是否存在（如果填写了授权单位）
                        if org_name:
                            try:
                                AuthorizedOrg.objects.get(name=str(org_name).strip())
                            except AuthorizedOrg.DoesNotExist:
                                skip_reason = f'[{sheet_name}] 第{row_idx}行 授权单位不存在: {org_name!r}'
                                results['unmatched'] += 1
                                results['skip_reasons'][skip_reason] += 1
                                row_count += 1
                                continue
                        
                        # 检查值班人员是否存在（如果填写了值班人员）
                        if duty_personnel_name:
                            try:
                                from common.models import DutyPersonnel
                                duty_exists = DutyPersonnel.objects.filter(
                                    name=str(duty_personnel_name).strip()
                                ).exists()
                                if not duty_exists:
                                    skip_reason = f'[{sheet_name}] 第{row_idx}行 值班人员不存在: {duty_personnel_name!r}'
                                    results['unmatched'] += 1
                                    results['skip_reasons'][skip_reason] += 1
                                    row_count += 1
                                    continue
                            except Exception as e:
                                skip_reason = f'[{sheet_name}] 第{row_idx}行 值班人员检查失败: {duty_personnel_name!r} ({type(e).__name__}: {e})'
                                results['unmatched'] += 1
                                results['skip_reasons'][skip_reason] += 1
                                row_count += 1
                                continue
                        
                        # 客户代表 = 客户表授权人，不要求 EntryPersonnel 预先存在（与正式导入一致）
                        
                        # 预览模式下，创建虚拟事件对象用于后续处理
                        # 获取客户对象（用于预览模式下的匹配）
                        preview_client_obj = None
                        preview_client_name = None
                        if client_name:
                            preview_client_name = client_name
                            # 尝试从数据库查找
                            try:
                                preview_client_obj = Client.objects.get(name=str(client_name).strip())
                            except Client.DoesNotExist:
                                pass
                        
                        matched_event = {
                            'event': None,
                            'order_number': order_number,
                            'event_id': None,
                            'date': event_date,
                            'name': customer_name or '未知',
                            'client': preview_client_obj,  # 预览模式下也保存客户信息
                            'client_name': preview_client_name,  # 保存客户名称
                        }
                        
                        # 将自动创建的事件也加入缓存（用于后续匹配）
                        cache_key = f"{event_date.strftime('%Y-%m-%d')}_{str(customer_name or '未知').strip()}"
                        event_cache[cache_key] = matched_event
                        
                        self.stdout.write(self.style.WARNING(
                            f'  ⚠ [预览] 将自动创建事件 [{order_number}] - {event_date} (客户代表: {customer_name or "未知"}, 客户: {preview_client_name or "未知"}, 默认时间: 15:30-21:00)'
                        ))

                if matched_event:
                    results['matched'] += 1

                device_data = {
                    'sn': str(sn).strip(),
                    'brand': str(brand).strip() if brand else 'Unknown',
                    'model': str(model).strip() if model else 'Unknown',
                    'order_number': order_number,
                    'operation_type': '下架' if is_decommission else (str(operation_type).strip() if operation_type else '上架'),
                    'batch_id': batch_id,
                    'u_size': int(u_size) if u_size else 1,
                    'rack_position': str(rack_position).strip() if rack_position else '',
                    'cabinet_name': str(cabinet_name).strip() if cabinet_name else '',
                    'room_name': str(room_name).strip() if room_name else '',
                    'power_type': str(power_type).strip() if power_type else '单电源',
                    'power_wattage': int(power_wattage) if power_wattage else None,
                    'device_type': str(device_type).strip() if device_type else 'other',
                    'decommission_reason': str(decommission_reason).strip() if decommission_reason else None,
                    # EventDevice关联字段（时间来源于事件，不需要单独字段）
                    'usage_notes': usage_notes,
                    'decommission_status': decommission_status,
                }

                # 无论是否预览模式，只要有匹配的事件（包括自动创建的），都处理设备
                if matched_event:
                    # 先进行冲突检查（预览模式和实际模式都需要，只对上架设备）
                    if not is_decommission:
                        has_conflict, conflicts = self._check_device_conflicts(
                            sn, room_name, cabinet_name, rack_position, u_size, is_decommission,
                            processed_devices, processed_positions  # 传入当前批次已处理的设备
                        )
                        
                        if has_conflict:
                            # 记录冲突信息
                            conflict_msg = f'[{sheet_name}] 第{row_idx}行 设备冲突 (序列号: {sn!r}): {"; ".join(conflicts)}'
                            results['conflicts'].append({
                                'sn': sn,
                                'order_number': order_number,
                                'conflicts': conflicts,
                                'row': row_idx
                            })
                            results['unmatched'] += 1
                            results['skip_reasons'][conflict_msg] += 1
                            self.stdout.write(self.style.ERROR(
                                f'    ✗ 设备冲突: {sn} -> [{order_number}]'
                            ))
                            for conflict in conflicts:
                                self.stdout.write(self.style.ERROR(f'      - {conflict}'))
                            # 跳过的设备不添加到设备列表中
                            row_count += 1
                            continue
                        
                        # 如果没有冲突，将当前设备添加到已处理列表（用于后续冲突检测）
                        processed_devices[sn] = {
                            'room': room_name,
                            'cabinet': cabinet_name,
                            'rack_position': rack_position,
                            'u_size': u_size,
                            'row': row_idx
                        }
                        
                        # 记录位置信息（用于位置冲突检测）
                        if room_name and cabinet_name and rack_position and u_size:
                            try:
                                start_pos = int(str(rack_position).strip().split('-')[0])
                                end_pos = start_pos + int(u_size) - 1
                                position_key = (str(room_name).strip(), str(cabinet_name).strip(), start_pos, end_pos)
                                processed_positions[position_key] = {
                                    'sn': sn,
                                    'row': row_idx
                                }
                            except (ValueError, AttributeError):
                                pass
                    
                    if not preview_mode and not dry_run:
                        # 创建或更新设备
                        created, device_conflicts = self._create_or_update_device(
                            device_data, matched_event, room_name, cabinet_name,
                            u_size, rack_position, power_type, power_wattage, device_type, is_decommission
                        )
                        
                        if device_conflicts:
                            # 如果创建时仍有冲突（可能是并发问题），记录并跳过
                            results['conflicts'].append({
                                'sn': sn,
                                'order_number': order_number,
                                'conflicts': device_conflicts,
                                'row': row_idx
                            })
                            results['unmatched'] += 1
                            conflict_msg = f'[{sheet_name}] 第{row_idx}行 设备冲突 (序列号: {sn!r}): {"; ".join(device_conflicts)}'
                            results['skip_reasons'][conflict_msg] += 1
                            self.stdout.write(self.style.ERROR(
                                f'    ✗ 第{row_idx}行 设备冲突: {sn} -> [{order_number}]'
                            ))
                            for conflict in device_conflicts:
                                self.stdout.write(self.style.ERROR(f'      - {conflict}'))
                            # 跳过的设备不添加到设备列表中
                            row_count += 1
                            continue
                        elif created:
                            results['created'] += 1
                            self.stdout.write(f'    ✓ 创建设备: {sn} -> [{order_number}]')
                        else:
                            results['updated'] += 1
                            self.stdout.write(f'    → 更新设备: {sn} -> [{order_number}]')
                    else:
                        # 预览模式下，只记录设备信息，不实际创建
                        results['created'] += 1  # 预览模式下统计为"将创建"
                        self.stdout.write(f'    [预览] 将创建设备: {sn} -> [{order_number}]')

                # 只有成功处理的设备才添加到列表中
                results['devices'].append(device_data)
                row_count += 1

            except Exception as e:
                skip_reason = f'[{sheet_name}] 第{row_idx}行 处理失败: {type(e).__name__}: {e}'
                results['unmatched'] += 1
                results['skip_reasons'][skip_reason] += 1
                self.stdout.write(self.style.WARNING(f'  ⚠ 第{row_idx}行处理失败: {type(e).__name__}: {e}'))

        self.stdout.write(f'  总计: 创建 {results["created"]} 个设备，更新 {results["updated"]} 个设备')
        self.stdout.write(f'  匹配: {results["matched"]} 条记录找到对应事件，{results["unmatched"]} 条记录创建补充事件')
        
        # 显示冲突信息
        if results.get('conflicts'):
            self.stdout.write(f'  冲突: {len(results["conflicts"])} 条记录存在冲突')
            for conflict_info in results['conflicts'][:5]:  # 只显示前5个冲突
                self.stdout.write(self.style.ERROR(
                    f'    ✗ SN {conflict_info["sn"]} (第{conflict_info["row"]}行): {"; ".join(conflict_info["conflicts"][:2])}'
                ))
            if len(results['conflicts']) > 5:
                self.stdout.write(f'    ... 还有 {len(results["conflicts"]) - 5} 个冲突未显示')
        
        # 显示跳过原因统计（过滤掉空白行相关的跳过原因）
        if results['skip_reasons']:
            filtered_reasons = {}
            for reason, count in results['skip_reasons'].items():
                # 过滤掉空白行相关的跳过原因
                if '必填字段为空' in reason and ('日期: 空' in reason or '姓名: 空' in reason or '序列号: 空' in reason):
                    # 检查是否真的是空白行（日期和姓名/序列号都为空）
                    if (('日期: 空' in reason and '姓名: 空' in reason) or 
                        ('日期: 空' in reason and '序列号: 空' in reason)):
                        continue  # 跳过空白行的统计
                filtered_reasons[reason] = count
            
            if filtered_reasons:
                self.stdout.write('  跳过原因统计:')
                for reason, count in sorted(filtered_reasons.items(), key=lambda x: x[1], reverse=True):
                    self.stdout.write(f'    - {reason}: {count} 条')
        return results

    # ========== 增强匹配逻辑 ==========
    
    def _find_matching_event(self, event_date, customer_name, room_name, event_cache, client_name=None):
        """
        多维度匹配Event
        支持通过客户名称关联匹配（即使姓名不同，也可以通过相同客户关联到同一事件）
        """
        # 1. 精确匹配：日期 + 姓名
        if customer_name:
            cache_key = f"{event_date.strftime('%Y-%m-%d')}_{str(customer_name).strip()}"
            if cache_key in event_cache:
                return event_cache[cache_key]

        # 2. 模糊匹配：处理姓名变体（空格、全角半角）
        if customer_name:
            normalized_name = self._normalize_name(customer_name)
            for key, event_data in event_cache.items():
                if event_data['date'] == event_date:
                    if self._normalize_name(event_data['name']) == normalized_name:
                        return event_data

        # 3. 通过客户名称匹配：日期 + 客户（即使姓名不同，也可以通过相同客户关联）
        if client_name:
            client_name_normalized = str(client_name).strip()
            for key, event_data in event_cache.items():
                if event_data['date'] == event_date:
                    # 检查事件的客户是否匹配
                    event_client_name = event_data.get('client_name')
                    event_client = event_data.get('client')
                    
                    # 比较客户名称（字符串）
                    if event_client_name and str(event_client_name).strip() == client_name_normalized:
                        return event_data
                    
                    # 如果是客户对象，比较名称
                    if event_client:
                        if isinstance(event_client, str):
                            if str(event_client).strip() == client_name_normalized:
                                return event_data
                        else:
                            # 如果是对象，比较名称
                            if hasattr(event_client, 'name') and str(event_client.name).strip() == client_name_normalized:
                                return event_data

        # 4. 机房辅助匹配：日期 + 姓名 + 机房
        if room_name and customer_name:
            normalized_name = self._normalize_name(customer_name)
            for key, event_data in event_cache.items():
                if (event_data['date'] == event_date and
                    self._normalize_name(event_data['name']) == normalized_name):
                    # 可以进一步检查机房匹配
                    return event_data

        return None

    def _normalize_name(self, name):
        """标准化姓名：去除空格、统一全角半角"""
        if not name:
            return ''
        return str(name).strip().replace(' ', '').replace('　', '')
    
    def _normalize_cabinet_name(self, cabinet_name):
        """
        标准化机柜名称：将字母转换为数字
        例如：D01 -> 04-01, H01 -> 08-01
        字母映射规则：A=01, B=02, C=03, D=04, E=05, F=06, G=07, H=08, I=09, J=10, ...
        """
        if not cabinet_name:
            return None
        
        cabinet_name = str(cabinet_name).strip()
        
        # 如果已经是数字格式（如 04-01），直接返回
        if re.match(r'^\d{2}-\d{2}$', cabinet_name):
            return cabinet_name
        
        # 匹配字母+数字格式（如 D01, H01）
        match = re.match(r'^([A-Z])(\d{2})$', cabinet_name.upper())
        if match:
            letter = match.group(1)
            number = match.group(2)
            # 将字母转换为数字：A=01, B=02, C=03, D=04, ...
            letter_num = ord(letter) - ord('A') + 1
            # 格式化为两位数字
            letter_str = f'{letter_num:02d}'
            return f'{letter_str}-{number}'
        
        # 如果格式不匹配，返回原始值
        return cabinet_name
    
    def _filter_skip_reasons(self, skip_reasons):
        """
        过滤跳过原因，移除空白行相关的跳过原因
        返回过滤后的字典
        """
        if not skip_reasons:
            return {}
        
        # 如果是defaultdict，需要转换为普通dict
        if isinstance(skip_reasons, defaultdict):
            skip_reasons = dict(skip_reasons)
        
        filtered_reasons = {}
        for reason, count in skip_reasons.items():
            # 过滤掉空白行相关的跳过原因
            if '必填字段为空' in reason:
                # 检查是否真的是空白行（日期和姓名/序列号都为空）
                if (('日期: 空' in reason and '姓名: 空' in reason) or 
                    ('日期: 空' in reason and '序列号: 空' in reason)):
                    continue  # 跳过空白行的统计
            filtered_reasons[reason] = count
        
        return filtered_reasons

    # ========== 预览功能 ==========
    
    def _generate_preview_report(self, personnel_results, device_results, batch_id):
        """生成预览报告"""
        report_file = f'import_preview_{batch_id}.json'
        
        report = {
            'batch_id': batch_id,
            'timestamp': datetime.now().isoformat(),
            'summary': {
                'events': {
                    'total': personnel_results['created'],
                    'skipped': personnel_results['skipped'],
                    'skip_reasons': self._filter_skip_reasons(personnel_results.get('skip_reasons', {})),
                    'sheet_name': personnel_results.get('sheet_name', ''),
                },
            'devices': {
                'total': len(device_results['devices']),
                'matched': device_results['matched'],
                'unmatched': device_results['unmatched'],
                'conflicts': len(device_results.get('conflicts', [])),
                'skip_reasons': self._filter_skip_reasons(device_results.get('skip_reasons', {})),
                'sheet_name': device_results.get('sheet_name', ''),
            }
            },
            'events': personnel_results['events'],
            'devices': device_results['devices'],
        }

        with open(report_file, 'w', encoding='utf-8') as f:
            json.dump(report, f, ensure_ascii=False, indent=2, default=str)

        self.stdout.write('')
        self.stdout.write('=' * 60)
        self.stdout.write(self.style.SUCCESS('✓ 预览报告已生成'))
        self.stdout.write('=' * 60)
        self.stdout.write(f'报告文件: {report_file}')
        self.stdout.write(f'事件总数: {personnel_results["created"]}')
        self.stdout.write(f'设备总数: {len(device_results["devices"])}')
        self.stdout.write(f'匹配成功: {device_results["matched"]}')
        self.stdout.write(f'匹配失败: {device_results["unmatched"]}')

    # ========== 回滚功能 ==========
    
    def _save_import_record(self, batch_id, personnel_results, device_results, options=None):
        """保存导入记录到数据库和JSON文件（用于回滚）"""
        # 保存到JSON文件（向后兼容）
        record_file = f'import_record_{batch_id}.json'
        
        # 收集所有事件ID：包括人员进出表创建的事件和自动创建的事件
        event_ids = [e.get('event_id') for e in personnel_results['events'] if e.get('event_id')]
        # 添加自动创建的事件ID（从设备表中自动创建的事件）
        auto_created_event_ids = device_results.get('auto_created_event_ids', [])
        event_ids.extend(auto_created_event_ids)
        device_sns = [d['sn'] for d in device_results['devices']]
        
        record = {
            'batch_id': batch_id,
            'timestamp': datetime.now().isoformat(),
            'event_ids': event_ids,
            'device_sns': device_sns,
        }

        with open(record_file, 'w', encoding='utf-8') as f:
            json.dump(record, f, ensure_ascii=False, indent=2)
        
        # 保存到数据库
        try:
            import_record, created = OperationStoryImport.objects.update_or_create(
                batch_id=batch_id,
                defaults={
                    'event_count': personnel_results.get('created', 0),
                    'device_count': len(device_results.get('devices', [])),
                    'skipped_events': personnel_results.get('skipped', 0),
                    'skipped_devices': device_results.get('unmatched', 0),
                    'incremental': options.get('incremental', False) if options else False,
                    'personnel_sheet': options.get('personnel_sheet', '人员进出') if options else '人员进出',
                    'install_sheet': options.get('install_sheet', '上架汇总') if options else '上架汇总',
                    'decommission_sheet': options.get('decommission_sheet', '下架汇总') if options else '下架汇总',
                    'summary': {
                        'events': {
                            'total': personnel_results.get('created', 0),
                            'skipped': personnel_results.get('skipped', 0),
                            'skip_reasons': self._filter_skip_reasons(personnel_results.get('skip_reasons', {})),
                        },
                        'devices': {
                            'total': len(device_results.get('devices', [])),
                            'created': device_results.get('created', 0),
                            'updated': device_results.get('updated', 0),
                            'matched': device_results.get('matched', 0),
                            'unmatched': device_results.get('unmatched', 0),
                            'skip_reasons': self._filter_skip_reasons(device_results.get('skip_reasons', {})),
                        }
                    },
                    'event_ids': event_ids,
                    'device_sns': device_sns,
                }
            )
            self.stdout.write(f'  ✓ 导入记录已保存到数据库: {batch_id}')
        except Exception as e:
            self.stdout.write(self.style.WARNING(f'  ⚠ 保存导入记录到数据库失败: {str(e)}'))

    def _rollback_import(self, batch_id):
        """回滚指定批次的导入数据"""
        self.stdout.write(f'开始回滚批次: {batch_id}')
        
        try:
            # 从数据库读取导入记录
            try:
                import_record = OperationStoryImport.objects.get(batch_id=batch_id)
            except OperationStoryImport.DoesNotExist:
                # 向后兼容：尝试从JSON文件读取
                record_file = f'import_record_{batch_id}.json'
                if os.path.exists(record_file):
                    self.stdout.write(self.style.WARNING(f'⚠ 数据库中没有记录，尝试从JSON文件读取: {record_file}'))
                    with open(record_file, 'r', encoding='utf-8') as f:
                        record = json.load(f)
                    event_ids = record.get('event_ids', [])
                    device_sns = record.get('device_sns', [])
                else:
                    self.stdout.write(self.style.ERROR(f'✗ 找不到批次ID为 {batch_id} 的导入记录（数据库和JSON文件都不存在）'))
                    return
            else:
                # 从数据库读取
                event_ids = import_record.event_ids if import_record.event_ids else []
                device_sns = import_record.device_sns if import_record.device_sns else []
                
                # 检查是否已经回滚过
                if import_record.rolled_back:
                    self.stdout.write(self.style.WARNING(f'⚠ 批次 {batch_id} 已回滚过，无需重复操作'))
                    return

            if not event_ids and not device_sns:
                self.stdout.write(self.style.WARNING(f'⚠ 批次 {batch_id} 没有可回滚的数据'))
                return

            with transaction.atomic():
                deleted_counts = {
                    'events': 0,
                    'devices': 0,
                    'decommissioned_devices': 0,
                    'entry_personnel': 0,
                }

                # 1. 收集所有需要删除的事件ID
                # 注意：event_ids 已经包含了自动创建的事件ID（在保存导入记录时已合并）
                all_event_ids = set(event_ids) if event_ids else set()
                
                # 如果导入记录中没有事件ID，尝试查找自动创建的事件（向后兼容旧数据）
                if not all_event_ids:
                    try:
                        date_part = batch_id.split('_')[1] if '_' in batch_id else batch_id[-8:]
                        # 匹配格式：HT-20260201-XXX
                        auto_events = Event.objects.filter(
                            description__contains='自动生成事件',
                            order_number__startswith=f'HT-{date_part}'
                        )
                        auto_event_ids = list(auto_events.values_list('id', flat=True))
                        all_event_ids.update(auto_event_ids)
                        if auto_event_ids:
                            self.stdout.write(f'  ⚠ 从数据库查找自动创建的事件: {len(auto_event_ids)} 个（建议更新导入记录）')
                    except Exception as e:
                        self.stdout.write(self.style.WARNING(f'  ⚠ 查找自动创建事件时出错: {str(e)}'))
                
                if all_event_ids:
                    self.stdout.write(f'  准备删除 {len(all_event_ids)} 个事件')

                # 1.5. 在删除事件之前，先收集所有关联的进场人员ID
                # 因为删除事件会级联删除EventEntryPersonnel，导致无法找到关联的人员
                entry_personnel_ids_before_delete = set()
                if all_event_ids:
                    entry_personnel_ids_before_delete = set(
                        EventEntryPersonnel.objects.filter(
                            event_id__in=all_event_ids
                        ).values_list('entry_personnel_id', flat=True).distinct()
                    )

                # 2. 删除事件（级联删除关联的EventDevice、EventEntryPersonnel等）
                if all_event_ids:
                    deleted_events = Event.objects.filter(id__in=all_event_ids).delete()
                    deleted_counts['events'] = deleted_events[0]
                    self.stdout.write(f'  ✓ 删除 {deleted_counts["events"]} 个事件（包括关联关系）')

                # 3. 删除设备（Device）
                if device_sns:
                    # 先查找这些设备是否还与其他事件关联
                    devices_to_delete = []
                    for sn in device_sns:
                        device = Device.objects.filter(sn=sn).first()
                        if device:
                            # 检查设备是否还与其他事件关联（除了已删除的事件）
                            remaining_events = EventDevice.objects.filter(
                                device=device
                            ).exclude(event_id__in=all_event_ids).exists()
                            
                            if not remaining_events:
                                # 设备只与本次导入的事件关联，可以删除
                                devices_to_delete.append(device.id)
                            else:
                                self.stdout.write(f'  ⚠ 设备 {sn} 还与其他事件关联，跳过删除')
                    
                    if devices_to_delete:
                        deleted_devices = Device.objects.filter(id__in=devices_to_delete).delete()
                        deleted_counts['devices'] = deleted_devices[0]
                        self.stdout.write(f'  ✓ 删除 {deleted_counts["devices"]} 个设备')

                # 4. 删除下架设备（DecommissionedDevice）
                if device_sns:
                    # 查找下架设备
                    decommissioned_devices_to_delete = []
                    for sn in device_sns:
                        decommissioned_devices = DecommissionedDevice.objects.filter(sn=sn)
                        for decommissioned_device in decommissioned_devices:
                            # 检查下架设备是否还与其他事件关联
                            from events.models import EventDecommissionedDevice
                            remaining_events = EventDecommissionedDevice.objects.filter(
                                decommissioned_device=decommissioned_device
                            ).exclude(event_id__in=all_event_ids).exists()

                            if not remaining_events:
                                # 下架设备只与本次导入的事件关联，可以删除
                                decommissioned_devices_to_delete.append(decommissioned_device.id)
                    
                    if decommissioned_devices_to_delete:
                        deleted_decommissioned = DecommissionedDevice.objects.filter(
                            id__in=decommissioned_devices_to_delete
                        ).delete()
                        deleted_counts['decommissioned_devices'] = deleted_decommissioned[0]
                        self.stdout.write(f'  ✓ 删除 {deleted_counts["decommissioned_devices"]} 个下架设备')

                # 5. 删除只与本次导入事件关联的EntryPersonnel（可选）
                # 注意：如果人员还与其他事件关联，则不删除
                # 使用之前收集的人员ID列表（在删除事件之前收集的）
                if entry_personnel_ids_before_delete:
                    personnel_to_delete = []
                    for personnel_id in entry_personnel_ids_before_delete:
                        # 检查该人员是否还与其他事件关联（排除已删除的事件）
                        remaining_events = EventEntryPersonnel.objects.filter(
                            entry_personnel_id=personnel_id
                        ).exclude(event_id__in=all_event_ids).exists()
                        
                        if not remaining_events:
                            # 人员只与本次导入的事件关联，可以删除
                            personnel_to_delete.append(personnel_id)
                    
                    if personnel_to_delete:
                        deleted_personnel = EntryPersonnel.objects.filter(
                            id__in=personnel_to_delete
                        ).delete()
                        deleted_counts['entry_personnel'] = deleted_personnel[0]
                        self.stdout.write(f'  ✓ 删除 {deleted_counts["entry_personnel"]} 个进场人员（仅与本次导入事件关联）')
                    else:
                        self.stdout.write(f'  ⚠ 所有进场人员还与其他事件关联，未删除任何人员')

                # 6. 更新导入记录状态（如果存在）
                try:
                    import_record = OperationStoryImport.objects.get(batch_id=batch_id)
                    import_record.rolled_back = True
                    import_record.rolled_back_at = timezone.now()
                    import_record.save()
                except OperationStoryImport.DoesNotExist:
                    pass  # 如果是从JSON文件回滚，数据库中没有记录

                # 输出回滚摘要
                total_deleted = sum(deleted_counts.values())
                self.stdout.write('')
                self.stdout.write(f'  回滚摘要:')
                self.stdout.write(f'    - 事件: {deleted_counts["events"]} 个')
                self.stdout.write(f'    - 设备: {deleted_counts["devices"]} 个')
                self.stdout.write(f'    - 下架设备: {deleted_counts["decommissioned_devices"]} 个')
                self.stdout.write(f'    - 进场人员: {deleted_counts["entry_personnel"]} 个')
                self.stdout.write(f'    总计: {total_deleted} 条记录')
                
                self.stdout.write(self.style.SUCCESS(f'✓ 回滚完成: {batch_id}'))
                
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'✗ 回滚失败: {str(e)}'))
            import traceback
            self.stdout.write(traceback.format_exc())
            raise  # 重新抛出异常，以便ViewSet捕获

    # ========== 辅助方法 ==========

    def _get_sheet_header_names(self, sheet):
        """获取 Sheet 第一行表头名称列表（保持列顺序）。"""
        names = []
        for cell in sheet[1]:
            if cell.value is not None:
                s = str(cell.value).strip()
                if s:
                    names.append(s)
        return names

    def _validate_device_u_position(self, u_size, rack_position, sheet_name, row_idx=None):
        """
        校验设备位置 U 数/机架位置在 1U～42U 范围内。
        返回 None 表示通过；否则返回用于 skip_reasons 的字符串。
        row_idx: Excel 行号（表头为第1行，数据从第2行起），用于报错信息。
        """
        row_prefix = f'第{row_idx}行 ' if row_idx is not None else ''
        if u_size is not None and str(u_size).strip():
            try:
                u_val = int(float(str(u_size).strip()))
                if u_val < U_POSITION_MIN or u_val > U_POSITION_MAX:
                    return (
                        f'[{sheet_name}] {row_prefix}设备位置无效: U数 "{u_size}" 超出有效范围 '
                        f'（有效范围 {U_POSITION_MIN}U～{U_POSITION_MAX}U）'
                    )
            except (ValueError, TypeError):
                return f'[{sheet_name}] {row_prefix}设备位置无效: U数 "{u_size}" 无法解析为数字'
        if rack_position is not None and str(rack_position).strip():
            rp_str = str(rack_position).strip()
            parts = rp_str.split('-')
            try:
                if len(parts) == 1:
                    pos = int(float(parts[0].strip()))
                    if pos < U_POSITION_MIN or pos > U_POSITION_MAX:
                        return (
                            f'[{sheet_name}] {row_prefix}设备位置无效: 机架位置 "{rack_position}" 超出有效范围 '
                            f'（有效范围 {U_POSITION_MIN}U～{U_POSITION_MAX}U）'
                        )
                else:
                    start = int(float(parts[0].strip()))
                    end = int(float(parts[-1].strip()))
                    if start < U_POSITION_MIN or start > U_POSITION_MAX:
                        return (
                            f'[{sheet_name}] {row_prefix}设备位置无效: 机架位置 "{rack_position}" 起始U位 '
                            f'超出有效范围（{U_POSITION_MIN}U～{U_POSITION_MAX}U）'
                        )
                    if end < U_POSITION_MIN or end > U_POSITION_MAX:
                        return (
                            f'[{sheet_name}] {row_prefix}设备位置无效: 机架位置 "{rack_position}" 结束U位 '
                            f'超出有效范围（{U_POSITION_MIN}U～{U_POSITION_MAX}U）'
                        )
                    if start > end:
                        return f'[{sheet_name}] {row_prefix}设备位置无效: 机架位置 "{rack_position}" 起始U位不能大于结束U位'
            except (ValueError, TypeError, IndexError):
                return f'[{sheet_name}] {row_prefix}设备位置无效: 机架位置 "{rack_position}" 无法解析'
        return None

    def _validate_personnel_sheet_headers(self, sheet, sheet_name):
        """
        校验人员表表头与模板一致（列顺序可不同，只校验列名）。
        返回 (True, None) 通过；(False, "错误描述") 不通过。
        """
        personnel_required = set(PERSONNEL_TEMPLATE_HEADERS)
        personnel_allowed = personnel_required | set(PERSONNEL_ALLOWED_EXTRA_HEADERS)
        actual = self._get_sheet_header_names(sheet)
        actual_set = set(actual)
        missing = personnel_required - actual_set
        if missing:
            return False, f'缺少模板列: {", ".join(sorted(missing))}'
        extra = actual_set - personnel_allowed
        if extra:
            return False, f'存在非模板列: {", ".join(sorted(extra))}，请与模板保持一致'
        return True, None

    def _validate_device_sheet_headers(self, sheet, sheet_name, label=''):
        """
        校验设备表表头与模板一致（列顺序可不同，只校验列名）。
        返回 (True, None) 通过；(False, "错误描述") 不通过。
        """
        device_required = set(DEVICE_TEMPLATE_HEADERS)
        device_allowed = device_required | set(DEVICE_ALLOWED_EXTRA_HEADERS)
        actual = self._get_sheet_header_names(sheet)
        actual_set = set(actual)
        missing = device_required - actual_set
        if missing:
            return False, f'缺少模板列: {", ".join(sorted(missing))}'
        extra = actual_set - device_allowed
        if extra:
            return False, f'存在非模板列: {", ".join(sorted(extra))}，请与模板保持一致'
        return True, None

    def _read_headers(self, sheet):
        """读取表头"""
        headers = {}
        # 读取第一行作为表头
        for col_idx, cell in enumerate(sheet[1], 1):
            if cell.value is not None:
                header = str(cell.value).strip()
                if header:  # 确保不是空字符串
                    headers[header] = col_idx
                    # 同时存储去除空格和大小写的版本，用于模糊匹配
                    header_no_space = header.replace(' ', '').replace('　', '')
                    if header_no_space != header:
                        headers[header_no_space] = col_idx
                    header_lower = header.lower()
                    if header_lower != header:
                        headers[header_lower] = col_idx
        return headers

    def _get_cell_value(self, row, col_idx):
        """获取单元格值"""
        if not col_idx:
            return None
        try:
            cell = row[col_idx - 1]
            value = cell.value
            
            # 处理None值
            if value is None:
                return None
            
            # 处理日期时间类型（openpyxl可能返回datetime对象）
            if isinstance(value, (datetime, date)):
                return value.strftime('%Y-%m-%d') if isinstance(value, date) else value.strftime('%Y-%m-%d %H:%M:%S')
            
            # 处理时间类型
            if isinstance(value, time):
                return value.strftime('%H:%M:%S')
            
            # 转换为字符串并去除首尾空格
            value_str = str(value).strip()
            
            # 如果去除空格后为空，返回None
            if not value_str or value_str == 'None':
                return None
            
            return value_str
        except (IndexError, AttributeError) as e:
            return None
    
    def _find_header_value(self, row, headers, possible_names):
        """查找表头值（支持多种可能的表头名称）"""
        for name in possible_names:
            # 精确匹配
            col_idx = headers.get(name)
            if col_idx:
                value = self._get_cell_value(row, col_idx)
                if value is not None and str(value).strip():
                    return value
            
            # 去除空格匹配
            name_no_space = name.replace(' ', '').replace('　', '')
            if name_no_space != name:
                col_idx = headers.get(name_no_space)
                if col_idx:
                    value = self._get_cell_value(row, col_idx)
                    if value is not None and str(value).strip():
                        return value
            
            # 小写匹配
            name_lower = name.lower()
            if name_lower != name:
                col_idx = headers.get(name_lower)
                if col_idx:
                    value = self._get_cell_value(row, col_idx)
                    if value is not None and str(value).strip():
                        return value
            
            # 模糊匹配：遍历所有表头，查找包含关键字的
            # 但只匹配原始表头（不匹配规范化后的版本）
            for header_name, col_idx in headers.items():
                # 只匹配原始表头，避免重复匹配
                if len(header_name) > 2 and (name in str(header_name) or str(header_name) in name):
                    # 确保不是规范化后的表头（去除空格或小写）
                    if header_name == header_name.replace(' ', '').replace('　', '') and header_name == header_name.lower():
                        value = self._get_cell_value(row, col_idx)
                        if value is not None and str(value).strip():
                            return value
        
        return None

    def _parse_date(self, date_str):
        """解析日期字符串"""
        if not date_str:
            return None
        
        # 如果已经是date或datetime对象，直接返回
        if isinstance(date_str, datetime):
            return date_str.date()
        if isinstance(date_str, date):
            return date_str
        
        # 尝试解析为字符串
        date_str = str(date_str).strip()
        
        # 处理Excel日期格式（可能是数字格式，如44927表示2023-01-01）
        # 但openpyxl的data_only=True应该已经转换了
        
        # 尝试多种日期格式
        formats = [
            '%Y-%m-%d', 
            '%Y/%m/%d', 
            '%Y年%m月%d日', 
            '%m/%d/%Y', 
            '%d/%m/%Y',
            '%Y.%m.%d',
            '%m-%d-%Y',
            '%d-%m-%Y',
        ]
        
        for fmt in formats:
            try:
                return datetime.strptime(date_str, fmt).date()
            except ValueError:
                continue
        
        # 如果所有格式都失败，尝试使用dateutil（如果可用）
        try:
            from dateutil import parser
            return parser.parse(date_str).date()
        except (ImportError, ValueError, TypeError):
            pass
        
        return None

    def _parse_time(self, time_str):
        """解析时间字符串（清洗格式）"""
        if not time_str:
            return None
        
        if isinstance(time_str, time):
            return time_str
        if isinstance(time_str, datetime):
            return time_str.time()
        
        time_str = str(time_str).strip().replace('：', ':').replace('\n', '').replace('\r', '')
        formats = ['%H:%M:%S', '%H:%M', '%H时%M分']
        
        for fmt in formats:
            try:
                return datetime.strptime(time_str, fmt).time()
            except ValueError:
                continue
        
        return None
    
    def _parse_datetime(self, datetime_str, default_date=None):
        """
        解析日期时间字符串
        如果只有时间，使用default_date作为日期部分
        """
        if not datetime_str:
            return None
        
        if isinstance(datetime_str, datetime):
            return datetime_str
        
        datetime_str = str(datetime_str).strip().replace('：', ':').replace('\n', '').replace('\r', '')
        
        # 尝试解析完整的日期时间
        formats = [
            '%Y-%m-%d %H:%M:%S',
            '%Y-%m-%d %H:%M',
            '%Y/%m/%d %H:%M:%S',
            '%Y/%m/%d %H:%M',
            '%Y年%m月%d日 %H:%M:%S',
            '%Y年%m月%d日 %H:%M',
        ]
        
        for fmt in formats:
            try:
                return datetime.strptime(datetime_str, fmt)
            except ValueError:
                continue
        
        # 如果只有时间，使用default_date
        if default_date:
            time_obj = self._parse_time(datetime_str)
            if time_obj:
                return datetime.combine(default_date, time_obj)
        
        return None

    def _parse_power_type(self, power_str):
        """解析电源类型"""
        if not power_str:
            return 'single'
        power_str = str(power_str).strip().lower()
        return 'dual' if ('双' in power_str or 'dual' in power_str) else 'single'

    def _parse_device_type(self, device_type_str):
        """解析设备类型"""
        if not device_type_str:
            return 'other'
        
        device_type_str = str(device_type_str).strip().lower()
        type_mapping = {
            '服务器': 'server', 'server': 'server',
            '交换机': 'switch', 'switch': 'switch',
            '路由器': 'router', 'router': 'router',
            '防火墙': 'firewall', 'firewall': 'firewall',
            '存储': 'storage', 'storage': 'storage',
            'ups': 'ups', 'pdu': 'pdu',
        }
        return type_mapping.get(device_type_str, 'other')

    def _check_device_conflicts(self, sn, room_name, cabinet_name, rack_position, u_size, is_decommission=False,
                                processed_devices=None, processed_positions=None):
        """
        检查设备冲突
        返回: (has_conflict, conflict_messages)
        
        Args:
            sn: 设备序列号
            room_name: 机房名称
            cabinet_name: 机柜名称
            rack_position: 机架位置
            u_size: U数
            is_decommission: 是否下架
            processed_devices: 当前批次已处理的设备字典 {sn: {room, cabinet, rack_position, u_size, row}}
            processed_positions: 当前批次已处理的位置字典 {(room, cabinet, start, end): {sn, row}}
        """
        conflicts = []
        processed_devices = processed_devices or {}
        processed_positions = processed_positions or {}
        
        # 只对上架设备进行冲突检查
        if is_decommission:
            return False, []
        
        # 1. 检查相同SN的设备是否已存在（在Device表中）
        existing_device_by_sn = Device.objects.filter(sn=sn).first()
        if existing_device_by_sn:
            conflicts.append(f'SN {sn} 的设备已存在（ID: {existing_device_by_sn.id}, 机柜: {existing_device_by_sn.cabinet.name if existing_device_by_sn.cabinet else "未知"}）')
        
        # 2. 检查当前批次内是否有相同SN的设备
        if sn in processed_devices:
            prev_device = processed_devices[sn]
            conflicts.append(f'SN {sn} 在当前批次中重复（第{prev_device["row"]}行已处理）')
        
        # 3. 检查相同机房、机柜、机架位置的设备冲突（数据库中的设备）
        if room_name and cabinet_name and rack_position and u_size:
            try:
                room = Room.objects.get(name=str(room_name).strip())
                cabinet = Cabinet.objects.filter(
                    name=str(cabinet_name).strip(),
                    room=room
                ).first()
                
                if cabinet:
                    # 解析机架位置（起始位置）
                    try:
                        start_pos = int(str(rack_position).strip().split('-')[0])
                        # 计算占用的U位范围
                        end_pos = start_pos + int(u_size) - 1
                        
                        # 查找该机柜中占用相同U位的设备（数据库中的）
                        conflicting_devices = Device.objects.filter(
                            cabinet=cabinet
                        ).exclude(sn=sn)  # 排除自己（如果是更新操作）
                        
                        for device in conflicting_devices:
                            try:
                                device_start = int(str(device.rack_position).strip().split('-')[0])
                                device_end = device_start + device.u_size - 1
                                
                                # 检查U位是否重叠
                                if not (end_pos < device_start or start_pos > device_end):
                                    conflicts.append(
                                        f'机柜位置冲突：{room_name}/{cabinet_name} 位置 {rack_position} '
                                        f'（占用U{start_pos}-{end_pos}）与数据库中的设备 {device.sn} '
                                        f'（位置 {device.rack_position}，占用U{device_start}-{device_end}）冲突'
                                    )
                            except (ValueError, AttributeError):
                                # 如果无法解析设备位置，跳过
                                pass
                        
                        # 4. 检查当前批次内是否有位置冲突
                        position_key = (str(room_name).strip(), str(cabinet_name).strip(), start_pos, end_pos)
                        if position_key in processed_positions:
                            prev_pos = processed_positions[position_key]
                            conflicts.append(
                                f'机柜位置冲突：{room_name}/{cabinet_name} 位置 {rack_position} '
                                f'（占用U{start_pos}-{end_pos}）与当前批次第{prev_pos["row"]}行的设备 {prev_pos["sn"]} 冲突'
                            )
                        
                        # 5. 检查当前批次内是否有U位重叠（更精确的检查）
                        for pos_key, pos_info in processed_positions.items():
                            prev_room, prev_cabinet, prev_start, prev_end = pos_key
                            if (prev_room == str(room_name).strip() and 
                                prev_cabinet == str(cabinet_name).strip() and
                                pos_info['sn'] != sn):  # 排除自己
                                # 检查U位是否重叠
                                if not (end_pos < prev_start or start_pos > prev_end):
                                    conflicts.append(
                                        f'机柜位置冲突：{room_name}/{cabinet_name} 位置 {rack_position} '
                                        f'（占用U{start_pos}-{end_pos}）与当前批次第{pos_info["row"]}行的设备 {pos_info["sn"]} '
                                        f'（占用U{prev_start}-{prev_end}）冲突'
                                    )
                    except (ValueError, AttributeError):
                        # 如果无法解析机架位置，跳过位置冲突检查
                        pass
            except Room.DoesNotExist:
                pass
            except Exception:
                pass
        
        return len(conflicts) > 0, conflicts

    def _create_or_update_device(self, device_data, matched_event, room_name, cabinet_name,
                                 u_size, rack_position, power_type, power_wattage, device_type, is_decommission=False):
        """创建或更新设备"""
        try:
            event_obj = matched_event.get('event')
            if not event_obj:
                return False

            # 获取机柜
            cabinet = None
            if cabinet_name and room_name:
                try:
                    room = Room.objects.get(name=str(room_name).strip())
                    cabinet, _ = Cabinet.objects.get_or_create(
                        name=str(cabinet_name).strip(),
                        room=room,
                        defaults={'name': str(cabinet_name).strip(), 'room': room}
                    )
                except Exception:
                    pass

            if not cabinet:
                return False, []

            # 判断是上架还是下架（通过is_decommission参数或operation_type）
            operation_type = device_data.get('operation_type', '上架')
            is_decommission = is_decommission or '下架' in str(operation_type)

            if is_decommission:
                # 下架设备
                # 解析状态（已下架/已报废）
                decommission_status_value = 'decommissioned'  # 默认值
                decommission_status_from_data = device_data.get('decommission_status')
                if decommission_status_from_data:
                    status_str = str(decommission_status_from_data).strip().lower()
                    if '报废' in status_str or 'scrapped' in status_str:
                        decommission_status_value = 'scrapped'
                    else:
                        decommission_status_value = 'decommissioned'
                
                decommissioned_device, created = create_or_reuse_decommissioned_device_for_event(
                    sn=device_data['sn'],
                    brand=device_data['brand'],
                    model=device_data['model'],
                    u_size=int(u_size) if u_size else 1,
                    rack_position=str(rack_position).strip() if rack_position else '',
                    power_type=self._parse_power_type(power_type),
                    decommission_reason=device_data.get('decommission_reason') or f'从Excel导入，订单号：{matched_event["order_number"]}',
                    status=decommission_status_value,
                    cabinet=cabinet,
                    event=event_obj,
                )

                return created, []
            else:
                # 上架设备
                device, created = upsert_installed_device_for_event(
                    sn=device_data['sn'],
                    brand=device_data['brand'],
                    model=device_data['model'],
                    u_size=int(u_size) if u_size else 1,
                    rack_position=str(rack_position).strip() if rack_position else '',
                    power_type=self._parse_power_type(power_type),
                    power_wattage=int(power_wattage) if power_wattage else None,
                    device_type=self._parse_device_type(device_type),
                    cabinet=cabinet,
                    event=event_obj,
                )

                return created, []

        except Exception as e:
            self.stdout.write(self.style.WARNING(f'    创建设备失败: {str(e)}'))
            return False, []

    def _print_summary(self, personnel_results, device_results, batch_id):
        """打印导入摘要（含跳过原因统计，便于排查导入数量少于表格行数）"""
        self.stdout.write(f'批次ID: {batch_id}')
        self.stdout.write(f'事件: 创建 {personnel_results["created"]} 个, 跳过 {personnel_results.get("skipped", 0)} 条')
        self.stdout.write(f'设备: 上架+下架共 创建 {device_results["created"]} 个, 更新 {device_results["updated"]} 个')
        self.stdout.write(f'匹配: {device_results["matched"]} 条匹配到事件, {device_results["unmatched"]} 条通过自动创建事件关联')
        # 人员表跳过原因
        personnel_skip = self._filter_skip_reasons(personnel_results.get('skip_reasons', {}))
        if personnel_skip:
            self.stdout.write(self.style.WARNING('  人员表跳过原因:'))
            for reason, count in sorted(personnel_skip.items(), key=lambda x: -x[1]):
                self.stdout.write(self.style.WARNING(f'    - {reason}: {count} 条'))
        # 设备表跳过原因（多数“导入数量少于表格”由此导致）
        device_skip = self._filter_skip_reasons(device_results.get('skip_reasons', {}))
        if device_skip:
            self.stdout.write(self.style.WARNING('  设备表跳过原因（上架+下架合计）:'))
            for reason, count in sorted(device_skip.items(), key=lambda x: -x[1]):
                self.stdout.write(self.style.WARNING(f'    - {reason}: {count} 条'))
