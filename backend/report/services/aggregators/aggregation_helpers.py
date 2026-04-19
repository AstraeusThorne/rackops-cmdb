"""
报表聚合公共逻辑：按时间范围与可选 client/cabinet 过滤，生成 summary 与 sections。

供各周期聚合器复用，统计逻辑仅在此处与 ORM 交互。
"""
from datetime import date, datetime, timedelta
from typing import Tuple, Optional, List

from django.db.models import Count, Sum, Q, Case, When, IntegerField
from django.utils import timezone as django_tz
from django.db.models.functions import Coalesce

from report.schemas.report_schema import ReportSummary, ReportSection


def _device_queryset(client_id: Optional[int], cabinet_id: Optional[int]):
    """根据 client_id / cabinet_id 返回 Device 过滤 QuerySet（不执行）。"""
    from devices.models import Device
    qs = Device.objects.select_related('cabinet', 'cabinet__room', 'cabinet__client').all()
    if cabinet_id is not None:
        qs = qs.filter(cabinet_id=cabinet_id)
    elif client_id is not None:
        qs = qs.filter(cabinet__client_id=client_id)
    return qs


def _cabinet_queryset(client_id: Optional[int], cabinet_id: Optional[int]):
    """根据 client_id / cabinet_id 返回 Cabinet 过滤 QuerySet。"""
    from devices.models import Cabinet
    qs = Cabinet.objects.select_related('room', 'client').all()
    if cabinet_id is not None:
        qs = qs.filter(id=cabinet_id)
    elif client_id is not None:
        qs = qs.filter(client_id=client_id)
    return qs


def get_report_summary_and_sections(
    start_date: date,
    end_date: date,
    client_id: Optional[int] = None,
    cabinet_id: Optional[int] = None,
    *,
    build_sections: bool = True,
) -> Tuple[ReportSummary, List[ReportSection]]:
    """
    在给定时间范围内聚合数据，返回 summary 与 sections。
    统计逻辑仅在此处，与 Dashboard 前端解耦。

    Args:
        start_date: 统计开始日期
        end_date: 统计结束日期
        client_id: 可选客户 ID
        cabinet_id: 可选机柜 ID
        build_sections: 是否构建 sections（告警列表等）；年报调用时可传 False 仅取 summary。

    Returns:
        (summary_dict, sections_list)；build_sections=False 时 sections_list 为空。
    """
    from devices.models import (
        Device,
        DecommissionedDevice,
        DeviceAlert,
        WarehouseDevice,
        WarehouseDeviceHistory,
        Room,
        Cabinet,
    )
    from events.models import Event, EventDevice, EventDecommissionedDevice

    # 设备：当前在架数量、下架数量、类型分布、总功耗（按 scope 过滤）
    device_qs = _device_queryset(client_id, cabinet_id)
    device_count = device_qs.count()
    type_agg = (
        device_qs.values('device_type')
        .annotate(cnt=Count('id'))
        .order_by('-cnt')
    )
    device_type_dist = [
        {'name': dict(Device.DEVICE_TYPE_CHOICES).get(t['device_type'], t['device_type']), 'value': t['cnt']}
        for t in type_agg
    ]
    total_power = device_qs.aggregate(s=Coalesce(Sum('power_wattage'), 0))['s'] or 0
    total_power_kw = round(float(total_power) / 1000, 2)

    # 下架设备：全量或按 cabinet 过滤（下架前机柜）
    dec_qs = DecommissionedDevice.objects.all()
    if cabinet_id is not None:
        dec_qs = dec_qs.filter(cabinet_id=cabinet_id)
    elif client_id is not None:
        dec_qs = dec_qs.filter(cabinet__client_id=client_id)
    decommissioned_count = dec_qs.count()

    # 事件：时间范围内；客户报表时仅统计该客户关联的事件（Event.clients M2M）
    event_qs = Event.objects.filter(
        date__gte=start_date,
        date__lte=end_date,
    )
    if client_id is not None:
        event_qs = event_qs.filter(clients__id=client_id).distinct()
    event_count = event_qs.count()
    event_completed = event_qs.filter(completion_status=True).count()
    event_pending = event_count - event_completed

    # 告警：周期内发现的告警 OR 周期结束时仍存在的告警（状态为 active/acknowledged）
    # 使用本地时区、左闭右开 [start_date 00:00, end_date+1 00:00)，避免漏掉当天最后一刻的告警
    alert_start_naive = datetime.combine(start_date, datetime.min.time())
    alert_end_excl_naive = datetime.combine(end_date + timedelta(days=1), datetime.min.time())
    tz = django_tz.get_current_timezone()
    alert_start = django_tz.make_aware(alert_start_naive, tz)
    alert_end_excl = django_tz.make_aware(alert_end_excl_naive, tz)
    alert_qs = DeviceAlert.objects.filter(
        Q(discovered_at__gte=alert_start, discovered_at__lt=alert_end_excl) |
        Q(status__in=('active', 'acknowledged'), discovered_at__lt=alert_end_excl)
    )
    if cabinet_id is not None:
        alert_qs = alert_qs.filter(device__cabinet_id=cabinet_id)
    elif client_id is not None:
        alert_qs = alert_qs.filter(device__cabinet__client_id=client_id)

    alert_count = alert_qs.count()
    alert_active = alert_qs.filter(status__in=('active', 'acknowledged')).count()
    alert_resolved = alert_qs.filter(status__in=('resolved', 'closed')).count()
    alert_by_level = dict(
        alert_qs.values('level').annotate(cnt=Count('id')).values_list('level', 'cnt')
    )
    alert_by_status = dict(
        alert_qs.values('status').annotate(cnt=Count('id')).values_list('status', 'cnt')
    )

    # 告警处理及时率与平均处理时长（24h 内解决占比、已解决告警平均时长）
    alert_resolved_qs = alert_qs.filter(
        status__in=('resolved', 'closed'),
        resolved_at__isnull=False,
    )
    total_hours = 0.0
    resolved_count = 0
    resolved_in_24h = 0
    for a in alert_resolved_qs.values_list('discovered_at', 'resolved_at', flat=False):
        if a[1] is None:
            continue
        delta = (a[1] - a[0]).total_seconds() / 3600.0
        total_hours += delta
        resolved_count += 1
        if delta <= 24.0:
            resolved_in_24h += 1
    alert_avg_hours = round(total_hours / resolved_count, 1) if resolved_count else 0.0
    response_rate = round(resolved_in_24h / resolved_count * 100, 1) if resolved_count else 0.0

    # 事件完成率
    event_completion_rate = round(event_completed / event_count * 100, 1) if event_count else 0.0

    # 周期内事件 ID（供新增设备、下架设备按事件关联使用）
    event_ids_in_period = list(event_qs.values_list('id', flat=True))

    # 本期下架设备：按事件关联（周期内事件 → EventDecommissionedDevice → DecommissionedDevice）
    if event_ids_in_period:
        dec_ids_in_period = list(
            EventDecommissionedDevice.objects.filter(event_id__in=event_ids_in_period)
            .values_list('decommissioned_device_id', flat=True)
            .distinct()
        )
        dec_in_period_qs = DecommissionedDevice.objects.filter(id__in=dec_ids_in_period)
        if cabinet_id is not None:
            dec_in_period_qs = dec_in_period_qs.filter(cabinet_id=cabinet_id)
        elif client_id is not None:
            dec_in_period_qs = dec_in_period_qs.filter(cabinet__client_id=client_id)
    else:
        dec_in_period_qs = DecommissionedDevice.objects.none()
    device_decommissioned_in_period = dec_in_period_qs.count()

    # 本期新增设备：按事件关联（周期内事件 → EventDevice → Device），与事件/人员口径一致
    if event_ids_in_period:
        device_new_ids = list(
            EventDevice.objects.filter(event_id__in=event_ids_in_period)
            .values_list('device_id', flat=True)
            .distinct()
        )
        # 按报表范围过滤设备（机柜/客户）
        if cabinet_id is not None:
            device_new_ids = list(
                Device.objects.filter(id__in=device_new_ids, cabinet_id=cabinet_id).values_list('id', flat=True)
            )
        elif client_id is not None:
            device_new_ids = list(
                Device.objects.filter(id__in=device_new_ids, cabinet__client_id=client_id).values_list('id', flat=True)
            )
    else:
        device_new_ids = []
    device_new_in_period = len(device_new_ids)

    # 仓库操作：action_date 在范围内
    wh_qs = WarehouseDeviceHistory.objects.filter(
        action_date__gte=start_date,
        action_date__lte=end_date,
    )
    if cabinet_id is not None:
        wh_qs = wh_qs.filter(cabinet_id=cabinet_id)
    elif client_id is not None:
        wh_qs = wh_qs.filter(cabinet__client_id=client_id)

    wh_in = wh_qs.filter(action='in').count()
    wh_install = wh_qs.filter(action='install').count()
    wh_out = wh_qs.filter(action='out').count()
    wh_update = wh_qs.filter(action='update').count()

    # 机房/机柜数（按 scope）
    cabinet_qs = _cabinet_queryset(client_id, cabinet_id)
    cabinet_count = cabinet_qs.count()
    room_ids = cabinet_qs.values_list('room_id', flat=True).distinct()
    room_count = Room.objects.filter(id__in=room_ids).count() if room_ids else 0

    summary: ReportSummary = {
        'deviceCount': device_count,
        'decommissionedCount': decommissioned_count,
        'deviceTypeDistribution': device_type_dist,
        'totalPowerWattage': int(total_power),
        'totalPowerKw': total_power_kw,
        'deviceNewInPeriod': device_new_in_period,
        'deviceDecommissionedInPeriod': device_decommissioned_in_period,
        'eventCount': event_count,
        'eventCompletedCount': event_completed,
        'eventPendingCount': event_pending,
        'eventCompletionRate': event_completion_rate,
        'alertCount': alert_count,
        'alertActiveCount': alert_active,
        'alertResolvedCount': alert_resolved,
        'alertByLevel': alert_by_level,
        'alertByStatus': alert_by_status,
        'responseRate': response_rate,
        'alertAvgResolutionHours': alert_avg_hours,
        'alertResolvedIn24hCount': resolved_in_24h,
        'warehouseInCount': wh_in,
        'warehouseInstallCount': wh_install,
        'warehouseOutCount': wh_out,
        'warehouseUpdateCount': wh_update,
        'roomCount': room_count,
        'cabinetCount': cabinet_count,
    }

    if not build_sections:
        return summary, []

    # Section: 设备概览（机房/机柜/设备数/功耗）
    device_overview_qs = (
        device_qs.values('cabinet__room__name', 'cabinet__name')
        .annotate(
            device_count=Count('id'),
            power_sum=Coalesce(Sum('power_wattage'), 0),
        )
        .order_by('cabinet__room__name', 'cabinet__name')
    )
    device_overview_rows = [
        [
            row['cabinet__room__name'] or '-',
            row['cabinet__name'] or '-',
            row['device_count'],
            int(row['power_sum']),
        ]
        for row in device_overview_qs
    ]
    section_device: ReportSection = {
        'id': 'device_overview',
        'title': '设备概览',
        'tables': [{
            'headers': ['机房', '机柜', '设备数', '功耗(W)'],
            'rows': device_overview_rows,
        }],
    }

    # Section: 事件列表（时间范围内，简要）
    event_list = event_qs.order_by('-date', '-start_time')[:100].values(
        'id', 'date', 'start_time', 'end_time', 'completion_status', 'order_number'
    )
    event_rows = [
        [
            e['date'].isoformat() if e['date'] else '-',
            str(e['start_time']) if e['start_time'] else '-',
            str(e['end_time']) if e['end_time'] else '-',
            '是' if e['completion_status'] else '否',
            e['order_number'] or '-',
        ]
        for e in event_list
    ]
    section_events: ReportSection = {
        'id': 'events',
        'title': '事件列表',
        'tables': [{
            'headers': ['日期', '开始时间', '结束时间', '已完成', '订单号'],
            'rows': event_rows,
        }],
    }

    # 告警级别/状态中文映射
    level_display = {'info': '提示', 'warning': '警告', 'critical': '严重', 'emergency': '紧急'}
    status_display = {'active': '新增', 'acknowledged': '已确认', 'resolved': '已解除', 'closed': '已关闭'}
    alert_level_total = sum(alert_by_level.values()) or 1
    alert_status_total = sum(alert_by_status.values()) or 1
    alert_level_rows = [
        [level_display.get(k, k), v, round(v / alert_level_total * 100, 1)]
        for k, v in alert_by_level.items()
    ]
    alert_status_rows = [
        [status_display.get(k, k), v, round(v / alert_status_total * 100, 1)]
        for k, v in alert_by_status.items()
    ]
    # 告警发生率与发生情况类统计（仅保留在架设备数、告警发生率、未解除数、严重及以上数）
    alert_rate_per_100 = round(alert_count / device_count * 100, 1) if device_count else 0  # 每百台设备告警数
    critical_above = alert_by_level.get('critical', 0) + alert_by_level.get('emergency', 0)
    alerts_summary_rows = [
        ['在架设备数(台)', device_count],
        ['告警发生率(每百台设备)', alert_rate_per_100],
        ['当前未解除告警数', alert_active],
        ['严重及以上告警数', critical_above],
    ]
    # 告警列表：统计范围内所有告警明细（设备、机柜、级别、状态、发现时间、解决时间）
    alert_list_rows = []
    for idx, a in enumerate(
        alert_qs.select_related('device', 'device__cabinet', 'device__cabinet__room')
        .order_by('-discovered_at'),
        1,
    ):
        device_name = str(a.device) if a.device else '-'
        cabinet_name = (a.device.cabinet.name if a.device and a.device.cabinet else '') or '-'
        room_name = (
            (a.device.cabinet.room.name if a.device and a.device.cabinet and a.device.cabinet.room else '')
        ) or '-'
        level_str = level_display.get(a.level, a.level)
        status_str = status_display.get(a.status, a.status)
        # 导出运维报告时发现时间、解决时间仅显示到日
        discovered_str = a.discovered_at.strftime('%Y-%m-%d') if a.discovered_at else '-'
        resolved_str = a.resolved_at.strftime('%Y-%m-%d') if a.resolved_at else '-'
        alert_list_rows.append([
            idx,
            (a.title or '')[:50],
            device_name,
            room_name,
            cabinet_name,
            level_str,
            status_str,
            discovered_str,
            resolved_str,
        ])
    section_alerts: ReportSection = {
        'id': 'alerts',
        'title': '告警统计',
        'tables': [
            {'headers': ['告警级别', '数量', '占比(%)'], 'rows': alert_level_rows},
            {'headers': ['告警状态', '数量', '占比(%)'], 'rows': alert_status_rows},
            {'headers': ['统计项', '数值'], 'rows': alerts_summary_rows},
            {
                'headers': [
                    '序号', '告警标题', '设备', '机房', '机柜', '级别', '状态', '发现时间', '解决时间',
                ],
                'rows': alert_list_rows,
            },
        ],
    }

    # Section: 仓库变动（增加备注列以符合运维月报模板）
    section_warehouse: ReportSection = {
        'id': 'warehouse',
        'title': '仓库变动',
        'tables': [{
            'headers': ['操作类型', '笔数', '备注'],
            'rows': [
                ['入库', wh_in, ''],
                ['上架', wh_install, ''],
                ['出库', wh_out, ''],
                ['更新', wh_update, ''],
            ],
        }],
    }

    # Section: 事件按日期统计
    events_by_date_qs = (
        event_qs.values('date')
        .annotate(
            total=Count('id'),
            completed=Count(Case(When(completion_status=True, then=1), output_field=IntegerField())),
        )
        .order_by('date')
    )
    # 按日期汇总事件描述（同一天多件用 / 分隔）
    date_descriptions = {}
    for e in event_qs.values('date', 'description').order_by('date'):
        d = e['date']
        if d not in date_descriptions:
            date_descriptions[d] = []
        desc = (e.get('description') or '').strip()
        if desc:
            date_descriptions[d].append(desc)
    events_by_date_rows = []
    for r in events_by_date_qs:
        total = r['total']
        completed = r['completed']
        pending = total - completed
        rate = round(completed / total * 100, 1) if total else 0
        desc_list = date_descriptions.get(r['date']) or []
        desc_str = ' / '.join(desc_list) if desc_list else '-'
        events_by_date_rows.append([
            r['date'].isoformat() if r['date'] else '-',
            total,
            completed,
            pending,
            rate,
            desc_str,
        ])
    section_events_by_date: ReportSection = {
        'id': 'events_by_date',
        'title': '按日期统计',
        'tables': [{
            'headers': ['日期', '事件数', '已完成', '未完成', '完成率(%)', '事件描述'],
            'rows': events_by_date_rows,
        }],
    }

    # Section: 事件按客户统计
    from events.models import EventClient
    events_by_client_qs = (
        EventClient.objects.filter(
            event__date__gte=start_date,
            event__date__lte=end_date,
        )
        .values('client__name')
        .annotate(
            total=Count('event_id'),
            completed=Count(Case(When(event__completion_status=True, then=1), output_field=IntegerField())),
        )
        .order_by('-total')
    )
    events_by_client_rows = []
    for r in events_by_client_qs:
        total = r['total']
        completed = r['completed']
        pending = total - completed
        rate = round(completed / total * 100, 1) if total else 0
        events_by_client_rows.append([
            r['client__name'] or '-',
            total,
            completed,
            pending,
            rate,
        ])
    section_events_by_client: ReportSection = {
        'id': 'events_by_client',
        'title': '按客户统计',
        'tables': [{
            'headers': ['客户名称', '事件数', '已完成', '未完成', '完成率(%)'],
            'rows': events_by_client_rows,
        }],
    }

    # Section: 事件按机房统计
    from events.models import RoomEvent
    events_by_room_qs = (
        RoomEvent.objects.filter(
            event__date__gte=start_date,
            event__date__lte=end_date,
        )
        .values('room__name')
        .annotate(
            total=Count('event_id'),
            completed=Count(Case(When(event__completion_status=True, then=1), output_field=IntegerField())),
        )
        .order_by('-total')
    )
    events_by_room_rows = []
    for r in events_by_room_qs:
        total = r['total']
        completed = r['completed']
        pending = total - completed
        rate = round(completed / total * 100, 1) if total else 0
        events_by_room_rows.append([
            r['room__name'] or '-',
            total,
            completed,
            pending,
            rate,
        ])
    section_events_by_room: ReportSection = {
        'id': 'events_by_room',
        'title': '按机房统计',
        'tables': [{
            'headers': ['机房名称', '事件数', '已完成', '未完成', '完成率(%)'],
            'rows': events_by_room_rows,
        }],
    }

    # Section: 本期新增设备列表（本期事件涉及设备，参与时间取首次关联事件日期）
    device_new_list_rows = []
    if device_new_ids and event_ids_in_period:
        new_devices_qs = Device.objects.filter(id__in=device_new_ids).select_related('cabinet', 'cabinet__room')
        new_devices = new_devices_qs.order_by('id')
        # 每个设备在周期内首次关联的事件（用于“上架时间”列：非自动创建事件用开始-结束时间）
        first_event_per_device = {}
        for ed in (
            EventDevice.objects.filter(
                event_id__in=event_ids_in_period,
                device_id__in=device_new_ids,
            )
            .select_related('event')
            .order_by('event__date', 'event__start_time')
        ):
            if ed.device_id not in first_event_per_device and ed.event:
                first_event_per_device[ed.device_id] = ed.event
        for idx, d in enumerate(new_devices, 1):
            room_name = (d.cabinet.room.name if d.cabinet and d.cabinet.room else '') or '-'
            cabinet_name = d.cabinet.name if d.cabinet else '-'
            ev = first_event_per_device.get(d.id)
            if ev:
                date_str = ev.date.strftime('%Y-%m-%d') if ev.date else ''
                desc = (ev.description or '')
                is_auto_created = '自动生成事件' in desc
                if is_auto_created:
                    # 自动创建事件：仅显示开始时间（默认 15:30）
                    t_str = ev.start_time.strftime('%H:%M') if ev.start_time else '-'
                    created_at = f"{date_str} {t_str}" if date_str else t_str
                else:
                    # 非自动创建：取事件的开始、结束时间
                    start_str = ev.start_time.strftime('%H:%M') if ev.start_time else '-'
                    end_str = ev.end_time.strftime('%H:%M') if ev.end_time else '-'
                    created_at = f"{date_str} {start_str}-{end_str}" if date_str else f"{start_str}-{end_str}"
            else:
                created_at = '-'
            device_new_list_rows.append([idx, d.brand, d.model, d.sn, room_name, cabinet_name, created_at])
    section_device_new: ReportSection = {
        'id': 'device_new_list',
        'title': '本期新增设备',
        'tables': [{
            'headers': ['序号', '品牌', '型号', 'SN', '机房', '机柜', '上架时间'],
            'rows': device_new_list_rows,
        }],
    }

    # Section: 本期下架设备列表（下架时间从关联事件获取）
    from django.db.models import Min
    dec_list = (
        dec_in_period_qs.select_related('cabinet', 'cabinet__room')
        .prefetch_related('events')
        .annotate(first_event_date=Min('events__date'))
        .order_by('first_event_date', 'id')
    )
    device_decommissioned_list_rows = []
    for idx, d in enumerate(dec_list, 1):
        room_name = (d.cabinet.room.name if d.cabinet and d.cabinet.room else '') or '-'
        cabinet_name = d.cabinet.name if d.cabinet else '-'
        dt = d.decommission_time.strftime('%Y-%m-%d %H:%M') if d.decommission_time else '-'
        device_decommissioned_list_rows.append([
            idx, d.brand, d.model, d.sn, room_name, cabinet_name, dt,
            (d.decommission_reason or '')[:100],
        ])
    section_device_decommissioned: ReportSection = {
        'id': 'device_decommissioned_list',
        'title': '本期下架设备',
        'tables': [{
            'headers': ['序号', '品牌', '型号', 'SN', '机房', '下架前机柜', '下架时间', '下架原因'],
            'rows': device_decommissioned_list_rows,
        }],
    }

    # Section: 机房设备数量变化（各机房：变化前、本期新增、本期下架、净变动、变化后）
    room_ids = list(cabinet_qs.values_list('room_id', flat=True).distinct())
    rooms_ordered = list(
        Room.objects.filter(id__in=room_ids).order_by('name').values('id', 'name')
    )
    current_by_room = dict(
        device_qs.values('cabinet__room_id')
        .annotate(cnt=Count('id'))
        .values_list('cabinet__room_id', 'cnt')
    )
    new_by_room = {}
    if device_new_ids:
        new_by_room = dict(
            Device.objects.filter(id__in=device_new_ids)
            .values('cabinet__room_id')
            .annotate(cnt=Count('id'))
            .values_list('cabinet__room_id', 'cnt')
        )
    dec_by_room = dict(
        dec_in_period_qs.values('cabinet__room_id')
        .annotate(cnt=Count('id'))
        .values_list('cabinet__room_id', 'cnt')
    )
    device_change_by_room_rows = []
    for room in rooms_ordered:
        rid, rname = room['id'], (room['name'] or '—')
        current = current_by_room.get(rid, 0)
        new_cnt = new_by_room.get(rid, 0)
        dec_cnt = dec_by_room.get(rid, 0)
        before = current - new_cnt + dec_cnt  # 变化前
        net = new_cnt - dec_cnt  # 净变动
        device_change_by_room_rows.append([rname, before, new_cnt, dec_cnt, net, current])
    section_device_change_by_room: ReportSection = {
        'id': 'device_change_by_room',
        'title': '机房设备数量变化',
        'tables': [{
            'headers': ['机房名称', '变化前(台)', '本期新增(台)', '本期下架(台)', '净变动(台)', '变化后(台)'],
            'rows': device_change_by_room_rows,
        }],
    }

    # Section: 值班人员参与次数（通过周期内事件关联获取）
    from events.models import EventDutyPersonnel
    if event_ids_in_period:
        duty_agg = (
            EventDutyPersonnel.objects.filter(event_id__in=event_ids_in_period)
            .values('duty_personnel_id', 'duty_personnel__name')
            .annotate(participations=Count('event_id'))
            .order_by('-participations')
        )
    else:
        duty_agg = []
    duty_total = sum(r['participations'] for r in duty_agg)
    personnel_duty_rows = []
    for rank, r in enumerate(duty_agg, 1):
        pct = round(r['participations'] / duty_total * 100, 1) if duty_total else 0
        personnel_duty_rows.append([
            r['duty_personnel__name'] or '-',
            r['participations'],
            pct,
            rank,
        ])
    section_personnel_duty: ReportSection = {
        'id': 'personnel_duty',
        'title': '值班人员参与次数',
        'tables': [{
            'headers': ['姓名', '参与事件数', '占比(%)', '排名'],
            'rows': personnel_duty_rows,
        }],
    }

    # Section: 操作次数排行（ModelHistory 按 duty_personnel 或 changed_by 聚合，取前20）
    from common.models import ModelHistory
    mh_start = datetime.combine(start_date, datetime.min.time())
    mh_end = datetime.combine(end_date, datetime.max.time())
    op_agg = (
        ModelHistory.objects.filter(
            changed_at__gte=mh_start,
            changed_at__lte=mh_end,
            reverted=False,
        )
        .values('duty_personnel__name')
        .annotate(op_count=Count('id'))
        .order_by('-op_count')[:20]
    )
    # 补充 changed_by 无 duty_personnel 的记录
    op_agg_by_user = (
        ModelHistory.objects.filter(
            changed_at__gte=mh_start,
            changed_at__lte=mh_end,
            reverted=False,
            duty_personnel__isnull=True,
        )
        .values('changed_by__username')
        .annotate(op_count=Count('id'))
        .order_by('-op_count')[:20]
    )
    op_rows = []
    seen = {}
    for r in op_agg:
        name = r['duty_personnel__name'] or '-'
        if name == '-':
            continue
        key = ('duty', name)
        if key not in seen:
            seen[key] = r['op_count']
    for r in op_agg_by_user:
        name = r['changed_by__username'] or '-'
        key = ('user', name)
        if key not in seen:
            seen[key] = r['op_count']
    sorted_ops = sorted(seen.items(), key=lambda x: -x[1])[:20]
    op_total = sum(c for _, c in sorted_ops) or 1
    for rank, (key, count) in enumerate(sorted_ops, 1):
        name = key[1]
        pct = round(count / op_total * 100, 1)
        op_rows.append([rank, name, count, pct])
    section_personnel_ops: ReportSection = {
        'id': 'personnel_operations',
        'title': '操作次数排行',
        'tables': [{
            'headers': ['排名', '操作人', '操作次数', '占比(%)'],
            'rows': op_rows,
        }],
    }

    # Section: 进出人员统计（表1：按事件；表2：人员明细）— 均通过周期内事件关联获取
    from events.models import EventEntryPersonnel, EntryPersonnel
    if event_ids_in_period:
        entry_agg = (
            EventEntryPersonnel.objects.filter(event_id__in=event_ids_in_period)
            .values('event__date', 'event__order_number', 'event__description')
            .annotate(entry_count=Count('entry_personnel_id'))
            .order_by('event__date', 'event__order_number')
        )
    else:
        entry_agg = []
    personnel_entry_rows = []
    for r in entry_agg:
        personnel_entry_rows.append([
            r['event__date'].isoformat() if r.get('event__date') else '-',
            r.get('event__order_number') or '-',
            (r.get('event__description') or '').strip() or '-',
            r['entry_count'],
        ])
    # 进出人员明细：通过事件关联（EventEntryPersonnel）获取周期内涉及的人员
    if event_ids_in_period:
        personnel_detail_agg = (
            EntryPersonnel.objects.filter(
                evententrypersonnel__event_id__in=event_ids_in_period,
            )
            .annotate(event_count=Count('evententrypersonnel__event', distinct=True))
            .order_by('-event_count', 'name')
        )
    else:
        personnel_detail_agg = []
    personnel_detail_rows = []
    for idx, p in enumerate(personnel_detail_agg, 1):
        personnel_detail_rows.append([
            idx,
            p.name or '-',
            p.id_card or '-',
            p.contact_info or '-',
            p.event_count,
        ])
    section_personnel_entry: ReportSection = {
        'id': 'personnel_entry',
        'title': '进出人员统计',
        'tables': [
            {'headers': ['事件日期', '订单号', '事件描述', '进场人数'], 'rows': personnel_entry_rows},
            {'headers': ['序号', '姓名', '身份证号', '联系方式', '参与事件数'], 'rows': personnel_detail_rows},
        ],
    }

    sections = [
        section_device,
        section_events,
        section_alerts,
        section_warehouse,
        section_events_by_date,
        section_events_by_client,
        section_events_by_room,
        section_device_change_by_room,
        section_device_new,
        section_device_decommissioned,
        section_personnel_duty,
        section_personnel_ops,
        section_personnel_entry,
    ]
    return summary, sections


def get_yearly_report_summary_and_sections(
    start_date: date,
    end_date: date,
    client_id: Optional[int] = None,
    cabinet_id: Optional[int] = None,
) -> Tuple[ReportSummary, List[ReportSection]]:
    """
    年度运营分析报告（8 Sheet）：封面与执行摘要、年度事件分析、告警年度分析、
    资产与设备分析、机柜与容量分析、运维工作量分析、风险与预警、年度改进与规划。
    数据由后端自动填充，无逐条明细。
    """
    summary, _ = get_report_summary_and_sections(
        start_date, end_date, client_id=client_id, cabinet_id=cabinet_id,
        build_sections=False,
    )
    from events.models import Event, EventClient, RoomEvent
    from devices.models import Device, DeviceAlert, Cabinet
    from common.models import ModelHistory
    from django.db.models.functions import TruncMonth

    event_count = summary.get('eventCount') or 0
    event_completed = summary.get('eventCompletedCount') or 0
    event_completion_rate = summary.get('eventCompletionRate') or 0
    # 年报告警仅统计「本报告年内发现」的告警，避免混入往年未关闭告警导致月度趋势出现 2023/2024 等；使用本地时区、左闭右开
    tz = django_tz.get_current_timezone()
    _alert_start = django_tz.make_aware(datetime.combine(start_date, datetime.min.time()), tz)
    _alert_end_excl = django_tz.make_aware(datetime.combine(end_date + timedelta(days=1), datetime.min.time()), tz)
    alert_qs_in_period = DeviceAlert.objects.filter(
        discovered_at__gte=_alert_start,
        discovered_at__lt=_alert_end_excl,
    )
    if cabinet_id is not None:
        alert_qs_in_period = alert_qs_in_period.filter(device__cabinet_id=cabinet_id)
    elif client_id is not None:
        alert_qs_in_period = alert_qs_in_period.filter(device__cabinet__client_id=client_id)
    alert_count = alert_qs_in_period.count()
    alert_by_status_period = dict(
        alert_qs_in_period.values('status').annotate(cnt=Count('id')).values_list('status', 'cnt')
    )
    alert_confirmed = (alert_by_status_period.get('acknowledged') or 0) + (alert_by_status_period.get('resolved') or 0) + (alert_by_status_period.get('closed') or 0)
    alert_confirmation_rate = round(alert_confirmed / alert_count * 100, 1) if alert_count else 0

    alert_resolved = summary.get('alertResolvedCount') or 0
    alert_by_status = summary.get('alertByStatus') or {}
    device_count = summary.get('deviceCount') or 0
    device_new_in_period = summary.get('deviceNewInPeriod') or 0
    device_decommissioned_in_period = summary.get('deviceDecommissionedInPeriod') or 0
    device_at_start = device_count - device_new_in_period + device_decommissioned_in_period
    device_growth_rate = round((device_count - device_at_start) / device_at_start * 100, 1) if device_at_start else 0

    # 去年同期（同比）：上年同一天到同一天（闰年 2/29 时取上年 2/28）
    def _same_day_last_year(d):
        if not d:
            return None
        try:
            return date(d.year - 1, d.month, d.day)
        except ValueError:
            return date(d.year - 1, d.month, 28)
    start_date_ly = _same_day_last_year(start_date)
    end_date_ly = _same_day_last_year(end_date)
    summary_ly = None
    if start_date_ly and end_date_ly and start_date_ly <= end_date_ly:
        summary_ly, _ = get_report_summary_and_sections(
            start_date_ly, end_date_ly, client_id=client_id, cabinet_id=cabinet_id
        )

    # 去年同期告警也仅按「去年内发现」统计，与本年口径一致，保证同比正确；使用本地时区、左闭右开
    alert_count_ly = None
    alert_confirmation_rate_ly = None
    if start_date_ly and end_date_ly:
        _alert_start_ly = django_tz.make_aware(datetime.combine(start_date_ly, datetime.min.time()), tz)
        _alert_end_ly_excl = django_tz.make_aware(datetime.combine(end_date_ly + timedelta(days=1), datetime.min.time()), tz)
        alert_qs_ly = DeviceAlert.objects.filter(
            discovered_at__gte=_alert_start_ly,
            discovered_at__lt=_alert_end_ly_excl,
        )
        if cabinet_id is not None:
            alert_qs_ly = alert_qs_ly.filter(device__cabinet_id=cabinet_id)
        elif client_id is not None:
            alert_qs_ly = alert_qs_ly.filter(device__cabinet__client_id=client_id)
        alert_count_ly = alert_qs_ly.count()
        alert_by_status_ly_period = dict(
            alert_qs_ly.values('status').annotate(cnt=Count('id')).values_list('status', 'cnt')
        )
        alert_confirmed_ly = (alert_by_status_ly_period.get('acknowledged') or 0) + (alert_by_status_ly_period.get('resolved') or 0) + (alert_by_status_ly_period.get('closed') or 0)
        alert_confirmation_rate_ly = round(alert_confirmed_ly / alert_count_ly * 100, 1) if alert_count_ly else None

    def _yoy(current_val, last_year_val, is_pct=False):
        """同比文案：较上年+X% / 较上年-X% / 较上年持平 / 新增 / —（无去年数据）；is_pct=True 时为百分点(pp)"""
        if summary_ly is None or last_year_val is None:
            return '—'
        if current_val is None:
            current_val = 0
        if is_pct:
            # 完成率、确认率等：用百分点差，如 90% vs 85% -> 较上年+5.0pp
            delta_pp = current_val - last_year_val
            if abs(delta_pp) < 0.1:
                return '较上年持平'
            return '较上年{:+.1f}pp'.format(delta_pp)
        if last_year_val == 0:
            return '新增' if current_val > 0 else '持平'
        delta_pct = (current_val - last_year_val) / last_year_val * 100
        if abs(delta_pct) < 0.1:
            return '较上年持平'
        return '较上年{:+.1f}%'.format(delta_pct)

    event_count_ly = summary_ly.get('eventCount') if summary_ly else None
    event_completion_rate_ly = summary_ly.get('eventCompletionRate') if summary_ly else None
    # alert_count_ly、alert_confirmation_rate_ly 已由上文「去年同期告警」按年内发现口径计算
    device_count_ly = summary_ly.get('deviceCount') if summary_ly else None
    device_new_ly = summary_ly.get('deviceNewInPeriod') or 0
    device_dec_ly = summary_ly.get('deviceDecommissionedInPeriod') or 0
    device_at_start_ly = (device_count_ly - device_new_ly + device_dec_ly) if device_count_ly is not None else None
    device_growth_rate_ly = round((device_count_ly - device_at_start_ly) / device_at_start_ly * 100, 1) if summary_ly and device_at_start_ly else None

    cabinet_qs = _cabinet_queryset(client_id, cabinet_id)
    from report.constants import get_pdu_report_config
    config = get_pdu_report_config()
    cabinet_u_capacity = config.get('cabinet_u_capacity', 42)

    # ---------- Sheet1：封面 & 执行摘要（含去年同比；机柜利用率无快照故不入执行摘要） ----------
    kpi_rows = [
        ['事件总数', event_count, _yoy(event_count, event_count_ly), '达标' if event_completion_rate >= 90 else '良好' if event_completion_rate >= 80 else '待改进'],
        ['事件完成率(%)', event_completion_rate, _yoy(event_completion_rate, event_completion_rate_ly, is_pct=True), ''],
        ['告警总数', alert_count, _yoy(alert_count, alert_count_ly), ''],
        ['告警确认率(%)', alert_confirmation_rate, _yoy(alert_confirmation_rate, alert_confirmation_rate_ly, is_pct=True), ''],
        ['年末设备总量', device_count, _yoy(device_count, device_count_ly), ''],
        ['设备增长率(%)', device_growth_rate, _yoy(device_growth_rate, device_growth_rate_ly, is_pct=True), ''],
    ]
    section_cover: ReportSection = {
        'id': 'yearly_cover',
        'title': '封面 & 执行摘要',
        'tables': [{'headers': ['指标名称', '本期数值', '同比(可选)', '评价'], 'rows': kpi_rows}],
    }

    # ---------- Sheet2：年度事件分析 ----------
    event_qs = Event.objects.filter(date__gte=start_date, date__lte=end_date)
    if client_id is not None:
        event_qs = event_qs.filter(eventclient__client_id=client_id).distinct()
    event_by_month = (
        event_qs.values('date__year', 'date__month')
        .annotate(
            total=Count('id'),
            completed=Count(Case(When(completion_status=True, then=1), output_field=IntegerField())),
        )
        .order_by('date__year', 'date__month')
    )
    events_trend_rows = []
    for r in event_by_month:
        y, m = r['date__year'], r['date__month']
        month_str = f'{y}-{m:02d}' if y and m else '-'
        total = r['total'] or 0
        completed = r['completed'] or 0
        rate = round(completed / total * 100, 1) if total else 0
        events_trend_rows.append([month_str, total, completed, total - completed, rate])
    event_type_rows = [['综合', event_count, round(100.0, 1)]] if event_count else []
    events_by_client = (
        EventClient.objects.filter(event__date__gte=start_date, event__date__lte=end_date)
        .values('client__name')
        .annotate(total=Count('event_id'))
        .order_by('-total')
    )
    client_total = sum(r['total'] for r in events_by_client)
    client_rows = [[r['client__name'] or '-', r['total'], round(r['total'] / client_total * 100, 1) if client_total else 0] for r in events_by_client]
    events_by_room = (
        RoomEvent.objects.filter(event__date__gte=start_date, event__date__lte=end_date)
        .values('room__name')
        .annotate(total=Count('event_id'))
        .order_by('-total')
    )
    room_total = sum(r['total'] for r in events_by_room)
    room_rows = [[r['room__name'] or '-', r['total'], round(r['total'] / room_total * 100, 1) if room_total else 0] for r in events_by_room]
    section_events_yearly: ReportSection = {
        'id': 'yearly_events',
        'title': '年度事件分析',
        'tables': [
            {'headers': ['月份', '事件总数', '已完成', '未完成', '完成率(%)'], 'rows': events_trend_rows},
            {'headers': ['类型', '数量', '占比(%)'], 'rows': event_type_rows},
            {'headers': ['客户', '事件数', '占比(%)'], 'rows': client_rows},
            {'headers': ['机房', '事件数', '占比(%)'], 'rows': room_rows},
        ],
    }

    # ---------- Sheet3：告警年度分析（仅本报告年内发现的告警，与执行摘要口径一致） ----------
    level_display = {'info': '提示', 'warning': '警告', 'critical': '严重', 'emergency': '紧急'}
    alert_by_month = (
        alert_qs_in_period.annotate(month=TruncMonth('discovered_at'))
        .values('month')
        .annotate(
            total=Count('id'),
            confirmed=Count(Case(When(status__in=('acknowledged', 'resolved', 'closed'), then=1), output_field=IntegerField())),
            resolved=Count(Case(When(status__in=('resolved', 'closed'), then=1), output_field=IntegerField())),
        )
        .order_by('month')
    )
    alert_trend_rows = []
    for r in alert_by_month:
        month_val = r.get('month')
        month_str = month_val.strftime('%Y-%m') if month_val else '-'
        total = r.get('total') or 0
        confirmed = r.get('confirmed') or 0
        resolved = r.get('resolved') or 0
        alert_trend_rows.append([month_str, total, confirmed, resolved])
    alert_level_agg = list(alert_qs_in_period.values('level').annotate(cnt=Count('id')).order_by('-cnt'))
    total_alerts = sum(r['cnt'] for r in alert_level_agg)
    alert_level_rows = [[level_display.get(r['level'], r['level']), r['cnt'], round(r['cnt'] / total_alerts * 100, 1) if total_alerts else 0] for r in alert_level_agg]
    alert_by_device_type = (
        alert_qs_in_period.filter(device__isnull=False)
        .values('device__device_type')
        .annotate(cnt=Count('id'))
        .order_by('-cnt')
    )
    type_total = sum(r['cnt'] for r in alert_by_device_type)
    type_display = dict(Device.DEVICE_TYPE_CHOICES)
    alert_source_rows = [[type_display.get(r['device__device_type'], r['device__device_type'] or '-'), r['cnt'], round(r['cnt'] / type_total * 100, 1) if type_total else 0] for r in alert_by_device_type]
    section_alerts_yearly: ReportSection = {
        'id': 'yearly_alerts',
        'title': '告警年度分析',
        'tables': [
            {'headers': ['月份', '告警总数', '已确认', '已解决'], 'rows': alert_trend_rows},
            {'headers': ['级别', '数量', '占比(%)'], 'rows': alert_level_rows if alert_level_rows else [['-', 0, 0]]},
            {'headers': ['设备类型', '告警数量', '占比(%)'], 'rows': alert_source_rows},
        ],
    }

    # ---------- Sheet4：资产与设备分析 ----------
    device_change_rows = [
        ['年初设备', device_at_start],
        ['年度新增', device_new_in_period],
        ['年度下架', device_decommissioned_in_period],
        ['年末设备', device_count],
    ]
    brand_agg = list(Device.objects.filter(cabinet__in=cabinet_qs).values('brand').annotate(cnt=Count('id')).order_by('-cnt'))
    brand_total = sum(r['cnt'] for r in brand_agg)
    brand_rows = [[r['brand'] or '-', r['cnt'], round(r['cnt'] / brand_total * 100, 1) if brand_total else 0] for r in brand_agg]
    room_asset = (
        Device.objects.filter(cabinet__in=cabinet_qs)
        .values('cabinet__room__name')
        .annotate(cnt=Count('id'))
        .order_by('-cnt')
    )
    room_asset_total = sum(r['cnt'] for r in room_asset)
    room_asset_rows = [[r['cabinet__room__name'] or '-', r['cnt'], round(r['cnt'] / room_asset_total * 100, 1) if room_asset_total else 0] for r in room_asset]
    section_assets: ReportSection = {
        'id': 'yearly_assets',
        'title': '资产与设备分析',
        'tables': [
            {'headers': ['指标', '数值'], 'rows': device_change_rows},
            {'headers': ['品牌', '数量', '占比(%)'], 'rows': brand_rows},
            {'headers': ['机房', '数量', '占比(%)'], 'rows': room_asset_rows},
        ],
    }

    # ---------- Sheet5：机柜与容量分析（含无设备机柜，已使用=0） ----------
    used_by_cabinet = dict(
        Device.objects.filter(cabinet__in=cabinet_qs)
        .values('cabinet_id')
        .annotate(used=Coalesce(Sum('u_size'), 0))
        .values_list('cabinet_id', 'used')
    )
    cabinet_util_rows = []
    for cab in cabinet_qs.order_by('name'):
        used = int(used_by_cabinet.get(cab.id, 0) or 0)
        util = round(used / cabinet_u_capacity * 100, 1) if cabinet_u_capacity else 0
        status = '饱和' if util >= 90 else ('预警' if util >= 80 else '正常')
        cabinet_util_rows.append([cab.name or '-', cabinet_u_capacity, used, util, status])
    section_cabinet: ReportSection = {
        'id': 'yearly_cabinet',
        'title': '机柜与容量分析',
        'tables': [{'headers': ['机柜编号', '总容量(U)', '已使用(U)', '利用率(%)', '状态'], 'rows': cabinet_util_rows}],
    }

    # ---------- Sheet6：运维工作量分析 ----------
    mh_start = datetime.combine(start_date, datetime.min.time())
    mh_end = datetime.combine(end_date, datetime.max.time())
    mh_qs = ModelHistory.objects.filter(changed_at__gte=mh_start, changed_at__lte=mh_end, reverted=False)
    op_by_month = (
        mh_qs.annotate(month=TruncMonth('changed_at'))
        .values('month')
        .annotate(op_count=Count('id'))
        .order_by('month')
    )
    op_trend_rows = [[r['month'].strftime('%Y-%m') if r.get('month') else '-', r.get('op_count') or 0] for r in op_by_month]
    op_agg_duty = mh_qs.values('duty_personnel__name').annotate(op_count=Count('id')).order_by('-op_count')
    op_agg_user = mh_qs.filter(duty_personnel__isnull=True).values('changed_by__username').annotate(op_count=Count('id')).order_by('-op_count')
    op_person_seen = {}
    for r in op_agg_duty:
        name = r.get('duty_personnel__name') or '-'
        if name != '-':
            op_person_seen[('duty', name)] = op_person_seen.get(('duty', name), 0) + (r['op_count'] or 0)
    for r in op_agg_user:
        name = r.get('changed_by__username') or '-'
        if name != '-':
            op_person_seen[('user', name)] = op_person_seen.get(('user', name), 0) + (r['op_count'] or 0)
    sorted_ops = sorted(op_person_seen.items(), key=lambda x: -x[1])
    total_ops = sum(c for _, c in sorted_ops) or 1
    op_person_rows = [[name, cnt, round(cnt / total_ops * 100, 1)] for (_, name), cnt in sorted_ops]
    section_workload: ReportSection = {
        'id': 'yearly_workload',
        'title': '运维工作量分析',
        'tables': [
            {'headers': ['月份', '操作次数'], 'rows': op_trend_rows},
            {'headers': ['运维人员', '操作次数', '占比(%)'], 'rows': op_person_rows},
        ],
    }

    # ---------- Sheet7：风险与预警 ----------
    risk_rows = []
    for cab_row in cabinet_util_rows:
        if cab_row[3] >= 90:
            risk_rows.append(['机柜利用率>90%', f'机柜{cab_row[0]}利用率{cab_row[3]}%', cab_row[0], '建议扩容或迁移设备'])
    if not risk_rows:
        risk_rows = [
            ['机柜利用率>90%', '当前无单柜利用率>90%', '-', '持续监控'],
            ['单运营商依赖', '需结合网络拓扑评估', '网络出口', '建议双线或冗余'],
            ['带宽冗余不足', '需结合流量数据评估', '出口带宽', '建议扩容或限流'],
        ]
    section_risk: ReportSection = {
        'id': 'yearly_risk',
        'title': '风险与预警',
        'tables': [{'headers': ['风险类型', '描述', '影响范围', '建议'], 'rows': risk_rows}],
    }

    # ---------- Sheet8：年度改进与规划 ----------
    next_year = end_date.year + 1 if end_date else 2026
    improve_rows = [
        ['事件完成率提升', '已完成' if event_completion_rate >= 80 else '进行中', f'当前{event_completion_rate}%'],
        ['告警响应改善', '已完成' if summary.get('responseRate', 0) >= 80 else '进行中', '见告警分析'],
    ]
    plan_rows = [
        ['扩容建议', '根据机柜利用率与业务增长制定扩容计划'],
        ['人力建议', '根据运维工作量峰值配置值班与人力'],
        ['容量规划', '结合设备趋势制定U位与电力容量规划'],
        ['预算方向', '将扩容、人力、容量纳入下年度预算'],
    ]
    section_plan: ReportSection = {
        'id': 'yearly_plan',
        'title': '年度改进与规划',
        'tables': [
            {'headers': ['改进项', '完成情况', '效果'], 'rows': improve_rows},
            {'headers': ['项目', '建议方向'], 'rows': plan_rows},
        ],
    }

    yearly_sections = [
        section_cover,
        section_events_yearly,
        section_alerts_yearly,
        section_assets,
        section_cabinet,
        section_workload,
        section_risk,
        section_plan,
    ]
    return summary, yearly_sections
