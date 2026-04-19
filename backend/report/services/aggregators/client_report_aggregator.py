"""
客户报表聚合器：面向单一客户的企业级报表，必填 client_id。

产出 4 个 section：总览、机房事件统计、设备告警统计、设备托管情况（含机柜弱电信息）。
"""
from datetime import date, datetime
from typing import Optional, List, Any
from collections import defaultdict

from django.db.models import Count, Q, Sum, Case, When, IntegerField

from report.schemas.report_schema import build_report_meta, build_report_data, ReportSection
from .base import BaseReportAggregator
from .aggregation_helpers import get_report_summary_and_sections, _device_queryset, _cabinet_queryset


def _build_client_cabinet_pdu_table(
    cabinet_qs,
    start_date: date,
    end_date: date,
    config: dict,
) -> dict:
    """
    按客户机柜汇总 PDU 弱电数据（A/B 路电流、功率、电流利用率、预警、两路均衡判断），供客户报表「机柜弱电信息」使用。
    若 PDU 库不可用或无数据，返回空表。
    """
    headers = ['机柜编号', '机房', 'A路电流(A)', 'B路电流(A)', '总电流(A)', '额定电流(A)', '电流利用率(%)', '当前功率(kW)', '预警说明', '电流分析建议']
    try:
        from devices.models import PDUPort, CabinetPDUData
    except Exception:
        return {'headers': headers, 'rows': []}
    start_dt = datetime.combine(start_date, datetime.min.time())
    end_dt = datetime.combine(end_date, datetime.max.time())
    client_cabinet_ids = list(cabinet_qs.values_list('id', flat=True))
    if not client_cabinet_ids:
        return {'headers': headers, 'rows': []}
    rated_current = config.get('rated_current_per_circuit') or 32
    if rated_current <= 0:
        rated_current = 32
    circuits_per_cabinet = 2
    rated_per_cabinet = circuits_per_cabinet * rated_current
    high_threshold = config.get('high_utilization_threshold') or 80
    warning_threshold = config.get('current_warning_threshold', 60)
    imbalance_ratio = config.get('redundancy_imbalance_ratio') or 0.5  # B路 < A路*ratio 视为不均衡

    try:
        port_list = list(
            PDUPort.objects.using('pdu')
            .filter(cabinet_id__in=client_cabinet_ids)
            .select_related('pdu_device')
        )
    except Exception:
        return {'headers': headers, 'rows': []}
    port_ids = [p.id for p in port_list]
    current_by_cabinet: dict = defaultdict(float)
    current_A_by_cabinet: dict = defaultdict(float)
    current_B_by_cabinet: dict = defaultdict(float)
    power_by_cabinet: dict = defaultdict(float)
    cabinet_room: dict = {}
    for p in port_list:
        cabinet_room[p.cabinet_id] = getattr(p.pdu_device, 'room_name', None) or ''

    def _fill_current(queryset):
        seen = set()
        for row in queryset:
            pid = row['pdu_port_id']
            if pid in seen:
                continue
            seen.add(pid)
            cid = row.get('pdu_port__cabinet_id')
            if cid is None:
                continue
            try:
                current_by_cabinet[cid] += float(row.get('value') or 0)
            except (ValueError, TypeError):
                pass
        return seen

    def _fill_current_AB(queryset):
        """按 A/B 路分柜汇总（每端口保留最新一条）。"""
        seen = set()
        for row in queryset:
            pid = row['pdu_port_id']
            if pid in seen:
                continue
            seen.add(pid)
            cid = row.get('pdu_port__cabinet_id')
            if cid is None:
                continue
            circuit = (row.get('pdu_port__pdu_device__circuit_type') or '').strip().upper()
            try:
                val = float(row.get('value') or 0)
            except (ValueError, TypeError):
                continue
            if circuit == 'A':
                current_A_by_cabinet[cid] += val
            elif circuit == 'B':
                current_B_by_cabinet[cid] += val
        return seen

    def _fill_power(queryset):
        seen = set()
        for row in queryset:
            pid = row['pdu_port_id']
            if pid in seen:
                continue
            seen.add(pid)
            cid = row.get('pdu_port__cabinet_id')
            if cid is None:
                continue
            try:
                power_by_cabinet[cid] += float(row.get('value') or 0)
            except (ValueError, TypeError):
                pass
        return seen

    try:
        if port_ids:
            current_data = (
                CabinetPDUData.objects.using('pdu')
                .filter(
                    data_type='current',
                    pdu_port_id__in=port_ids,
                    timestamp__gte=start_dt,
                    timestamp__lte=end_dt,
                )
                .values('pdu_port_id', 'pdu_port__cabinet_id', 'value')
                .order_by('pdu_port_id', '-timestamp', '-id')
            )
            seen_current = _fill_current(current_data)
            missing = [pid for pid in port_ids if pid not in seen_current]
            if missing:
                latest = (
                    CabinetPDUData.objects.using('pdu')
                    .filter(data_type='current', pdu_port_id__in=missing)
                    .values('pdu_port_id', 'pdu_port__cabinet_id', 'value')
                    .order_by('pdu_port_id', '-timestamp', '-id')
                )
                _fill_current(latest)
            # A/B 路分柜汇总
            current_data_ab = (
                CabinetPDUData.objects.using('pdu')
                .filter(
                    data_type='current',
                    pdu_port_id__in=port_ids,
                    timestamp__gte=start_dt,
                    timestamp__lte=end_dt,
                )
                .values(
                    'pdu_port_id', 'pdu_port__cabinet_id',
                    'pdu_port__pdu_device__circuit_type', 'value',
                )
                .order_by('pdu_port_id', '-timestamp', '-id')
            )
            _fill_current_AB(current_data_ab)
            if not current_A_by_cabinet and not current_B_by_cabinet and port_ids:
                latest_ab = (
                    CabinetPDUData.objects.using('pdu')
                    .filter(data_type='current', pdu_port_id__in=port_ids)
                    .values(
                        'pdu_port_id', 'pdu_port__cabinet_id',
                        'pdu_port__pdu_device__circuit_type', 'value',
                    )
                    .order_by('pdu_port_id', '-timestamp', '-id')
                )
                _fill_current_AB(latest_ab)
            power_data = (
                CabinetPDUData.objects.using('pdu')
                .filter(
                    data_type='power',
                    pdu_port_id__in=port_ids,
                    timestamp__gte=start_dt,
                    timestamp__lte=end_dt,
                )
                .values('pdu_port_id', 'pdu_port__cabinet_id', 'value')
                .order_by('pdu_port_id', '-timestamp', '-id')
            )
            seen_power = _fill_power(power_data)
            missing_p = [pid for pid in port_ids if pid not in seen_power]
            if missing_p:
                latest_p = (
                    CabinetPDUData.objects.using('pdu')
                    .filter(data_type='power', pdu_port_id__in=missing_p)
                    .values('pdu_port_id', 'pdu_port__cabinet_id', 'value')
                    .order_by('pdu_port_id', '-timestamp', '-id')
                )
                _fill_power(latest_p)
    except Exception:
        pass

    cab_info = {}
    for cab in cabinet_qs.select_related('room').order_by('name'):
        rn = cab.room.name if cab.room else '未分类'
        cab_info[cab.id] = (cab.name or '-', rn)
    # 有 PDU 数据的机柜 + 客户下无 PDU 的机柜（显示 0）
    all_cab_ids = set(cab_info.keys())
    all_cab_ids.update(current_by_cabinet.keys())
    rows = []
    for cid in sorted(all_cab_ids, key=lambda x: (cab_info.get(x, ('', ''))[1], cab_info.get(x, ('', ''))[0])):
        name, room = cab_info.get(cid, (str(cid), '未分类'))
        cur_a = round(current_A_by_cabinet.get(cid, 0), 2)
        cur_b = round(current_B_by_cabinet.get(cid, 0), 2)
        cur_total = cur_a + cur_b
        if cur_total <= 0:
            cur_total = round(current_by_cabinet.get(cid, 0), 2)
        pwr = round(power_by_cabinet.get(cid, 0), 2)
        util = round(cur_total / rated_per_cabinet * 100, 1) if rated_per_cabinet else 0
        if util >= high_threshold:
            note = '高负载，建议关注'
            advice = '高负载，建议尽快制定扩容或迁移方案，避免过载风险。'
        elif util >= warning_threshold:
            note = '已达{}%，建议关注'.format(warning_threshold)
            advice = '建议关注负载变化并预留扩容空间，可评估分流或新增回路。'
        else:
            note = '正常'
            advice = ''
        # 两路均衡判断：无论负载是否正常，不均衡或仅单路时都显示建议；正常且两路均衡时建议保持为空
        if cur_a > 0 or cur_b > 0:
            if cur_a > 0 and cur_b > 0:
                if cur_b < cur_a * imbalance_ratio or cur_a < cur_b * imbalance_ratio:
                    advice += (' ' if advice else '') + 'A/B路负载不均衡，建议关注分流或调整。'
            else:
                advice += (' ' if advice else '') + '仅单路有数据，建议确认另一路监测。'
        rows.append([name, room, cur_a, cur_b, cur_total, rated_per_cabinet, util, pwr, note, advice])
    return {'headers': headers, 'rows': rows}


class ClientReportAggregator(BaseReportAggregator):
    """
    客户报表聚合器：必须指定 client_id，产出总览、机房事件统计、设备告警统计、设备托管情况。
    """

    period_type = 'client_report'

    def aggregate(
        self,
        start_date: date,
        end_date: date,
        client_id: Optional[int] = None,
        cabinet_id: Optional[int] = None,
    ) -> dict:
        if client_id is None:
            raise ValueError('客户报表必须指定 client_id')
        summary, sections = get_report_summary_and_sections(
            start_date, end_date, client_id=client_id, cabinet_id=None
        )
        from common.models import Client
        client = Client.objects.filter(id=client_id).first()
        client_name = (client.name if client else '') or ('客户#%s' % client_id)

        # 1) 总览
        device_count = summary.get('deviceCount') or 0
        cabinet_count = summary.get('cabinetCount') or 0
        room_count = summary.get('roomCount') or 0
        event_count = summary.get('eventCount') or 0
        alert_count = summary.get('alertCount') or 0
        alert_active = summary.get('alertActiveCount') or 0
        alert_by_level = summary.get('alertByLevel') or {}
        critical_above = alert_by_level.get('critical', 0) + alert_by_level.get('emergency', 0)
        alert_rate = round(alert_count / device_count * 100, 1) if device_count else 0
        overview_rows = [
            ['客户名称', client_name],
            ['统计周期', '{} 至 {}'.format(start_date.isoformat(), end_date.isoformat())],
            ['在架设备数(台)', device_count],
            ['占用机柜数', cabinet_count],
            ['涉及机房数', room_count],
            ['本期机房事件数', event_count],
            ['本期告警总数', alert_count],
            ['告警发生率(每百台设备)', alert_rate],
            ['当前未解除告警数', alert_active],
            ['严重及以上告警数', critical_above],
        ]
        section_overview: ReportSection = {
            'id': 'client_overview',
            'title': '总览',
            'tables': [{'headers': ['项目', '数值'], 'rows': overview_rows}],
        }

        # 2) 机房事件统计（该客户在统计周期内按机房的事件数、已完成、未完成、完成率）
        from events.models import RoomEvent
        events_by_room_qs = (
            RoomEvent.objects.filter(
                event__clients__id=client_id,
                event__date__gte=start_date,
                event__date__lte=end_date,
            )
            .values('room__name')
            .annotate(
                total=Count('event_id', distinct=True),
                completed=Count('event_id', distinct=True, filter=Q(event__completion_status=True)),
            )
            .order_by('-total')
        )
        events_by_room_rows = []
        for r in events_by_room_qs:
            total = r['total'] or 0
            completed = r['completed'] or 0
            pending = total - completed
            rate = round(completed / total * 100, 1) if total else 0
            events_by_room_rows.append([
                r['room__name'] or '-',
                total,
                completed,
                pending,
                rate,
            ])
        # 事件明细：该客户周期内事件列表（含人员信息）；面向客户不体现「自动生成」
        from events.models import Event
        event_detail_rows = []
        try:
            event_list_qs = (
                Event.objects.filter(
                    clients__id=client_id,
                    date__gte=start_date,
                    date__lte=end_date,
                )
                .distinct()
                .prefetch_related('rooms', 'duty_personnel', 'entry_personnel')
                .order_by('-date', 'id')
            )
            for ev in event_list_qs:
                rooms_list = list(ev.rooms.all()[:6])
                room_names = ', '.join((r.name or '') for r in rooms_list[:5])
                if len(rooms_list) > 5:
                    room_names += '…'
                desc = str(ev.description or '').strip()
                # 客户报表中不体现「自动生成事件」，仅保留后续描述或中性表述
                if '自动生成事件' in desc:
                    desc = desc.replace('自动生成事件：', '').replace('自动生成事件', '').strip()
                desc = desc or '运维操作'
                desc = desc[:80]
                if len(str(ev.description or '')) > 80:
                    desc += '…'
                duty_names = ', '.join((p.name or '').strip() for p in ev.duty_personnel.all()[:20] if getattr(p, 'name', None))
                entry_names = ', '.join((p.name or '').strip() for p in ev.entry_personnel.all()[:20] if getattr(p, 'name', None))
                event_detail_rows.append([
                    ev.order_number or '-',
                    ev.date.isoformat() if ev.date else '-',
                    desc or '-',
                    room_names or '-',
                    duty_names or '-',
                    entry_names or '-',
                    '已完成' if ev.completion_status else '未完成',
                ])
        except Exception:
            pass
        section_events_by_room: ReportSection = {
            'id': 'client_events_by_room',
            'title': '机房事件统计',
            'tables': [
                {
                    'headers': ['机房名称', '事件数', '已完成', '未完成', '完成率(%)'],
                    'rows': events_by_room_rows,
                },
                {
                    'headers': ['工单号', '日期', '事件摘要', '涉及机房', '值班人员', '进场人员', '完成状态'],
                    'rows': event_detail_rows,
                },
            ],
        }

        # 3) 设备告警统计（复用 summary 的告警 section）
        section_alerts = next((s for s in sections if s.get('id') == 'alerts'), None)
        if not section_alerts:
            level_display = {'info': '提示', 'warning': '警告', 'critical': '严重', 'emergency': '紧急'}
            status_display = {'active': '新增', 'acknowledged': '已确认', 'resolved': '已解除', 'closed': '已关闭'}
            alert_by_level = summary.get('alertByLevel') or {}
            alert_by_status = summary.get('alertByStatus') or {}
            section_alerts = {
                'id': 'alerts',
                'title': '设备告警统计',
                'tables': [
                    {'headers': ['告警级别', '数量', '占比(%)'], 'rows': [
                        [level_display.get(k, k), v, round(v / (sum(alert_by_level.values()) or 1) * 100, 1)]
                        for k, v in alert_by_level.items()
                    ]},
                    {'headers': ['告警状态', '数量', '占比(%)'], 'rows': [
                        [status_display.get(k, k), v, round(v / (sum(alert_by_status.values()) or 1) * 100, 1)]
                        for k, v in alert_by_status.items()
                    ]},
                    {'headers': ['统计项', '数值'], 'rows': [
                        ['在架设备数(台)', device_count],
                        ['告警发生率(每百台设备)', alert_rate],
                        ['当前未解除告警数', alert_active],
                        ['严重及以上告警数', critical_above],
                    ]},
                    {'headers': ['序号', '告警标题', '设备', '机房', '机柜', '级别', '状态', '发现时间', '解决时间'], 'rows': []},
                ],
            }

        # 4) 设备托管情况：客户设备规模、设备分布情况、设备稳定性、机柜U位使用情况
        device_qs = _device_queryset(client_id, None)
        cabinet_qs = _cabinet_queryset(client_id, None)
        # 4.1 客户设备规模
        from devices.models import Device
        type_dist = list(
            device_qs.values('device_type').annotate(cnt=Count('id')).order_by('-cnt')
        )
        type_display = {'server': '服务器', 'switch': '交换机', 'router': '路由器', 'firewall': '防火墙',
                       'storage': '存储设备', 'ups': 'UPS', 'pdu': 'PDU', 'other': '其他'}
        total_u = device_qs.aggregate(s=Sum('u_size'))
        total_u_val = int(total_u['s'] or 0)
        scale_rows = [
            ['在架设备总数(台)', device_count],
            ['设备占用U位合计', total_u_val],
        ]
        scale_rows += [[type_display.get(r['device_type'], r['device_type'] or '-'), r['cnt']] for r in type_dist]
        section_scale: ReportSection = {
            'id': 'client_hosting_scale',
            'title': '客户设备规模',
            'tables': [{'headers': ['项目', '数值'], 'rows': scale_rows}],
        }
        # 4.2 设备分布情况（按机房、机柜、设备数）+ 设备明细（单独表，逐台设备一行）
        dist_qs = list(
            device_qs.values('cabinet__room__name', 'cabinet__name', 'cabinet_id')
            .annotate(device_count=Count('id'))
            .order_by('cabinet__room__name', 'cabinet__name')
        )
        dist_rows = [
            [r['cabinet__room__name'] or '-', r['cabinet__name'] or '-', r['device_count']]
            for r in dist_qs
        ]
        device_detail_rows = []
        dev_list = list(
            device_qs.select_related('cabinet', 'cabinet__room')
            .order_by('cabinet__room__name', 'cabinet__name', 'id')
        )
        type_display = {'server': '服务器', 'switch': '交换机', 'router': '路由器', 'firewall': '防火墙',
                       'storage': '存储设备', 'ups': 'UPS', 'pdu': 'PDU', 'other': '其他'}
        for d in dev_list:
            room_name = (d.cabinet.room.name if d.cabinet and d.cabinet.room else None) or '-'
            cab_name = (d.cabinet.name if d.cabinet else None) or '-'
            device_detail_rows.append([
                room_name,
                cab_name,
                (d.rack_position or '').strip() or '-',
                (d.brand or '').strip() or '-',
                (d.model or '').strip() or '-',
                (d.sn or '').strip() or '-',
                type_display.get(d.device_type, d.device_type or '-'),
                d.u_size or 0,
            ])
        section_dist: ReportSection = {
            'id': 'client_hosting_dist',
            'title': '设备分布情况',
            'tables': [
                {'headers': ['机房', '机柜', '设备数'], 'rows': dist_rows},
                {'headers': ['机房', '机柜', '机架位置', '品牌', '型号', '序列号', '设备类型', 'U数'], 'rows': device_detail_rows},
            ],
        }
        # 4.3 设备稳定性
        stability_rows = [
            ['在架设备数(台)', device_count],
            ['告警发生率(每百台设备)', alert_rate],
            ['当前未解除告警数', alert_active],
            ['严重及以上告警数', critical_above],
        ]
        section_stability: ReportSection = {
            'id': 'client_hosting_stability',
            'title': '设备稳定性',
            'tables': [{'headers': ['指标', '数值'], 'rows': stability_rows}],
        }
        # 4.4 机柜U位使用情况（机柜、总U、已用U、利用率、状态）
        from report.constants import get_pdu_report_config
        config = get_pdu_report_config()
        cabinet_u_capacity = config.get('cabinet_u_capacity') or 42
        from django.db.models.functions import Coalesce
        used_by_cabinet = dict(
            Device.objects.filter(cabinet__in=cabinet_qs)
            .values('cabinet_id')
            .annotate(used=Coalesce(Sum('u_size'), 0))
            .values_list('cabinet_id', 'used')
        )
        cabinet_rows = []
        for cab in cabinet_qs.order_by('name'):
            used = int(used_by_cabinet.get(cab.id, 0) or 0)
            util = round(used / cabinet_u_capacity * 100, 1) if cabinet_u_capacity else 0
            status = '饱和' if util >= 90 else ('预警' if util >= 80 else '正常')
            cabinet_rows.append([cab.name or '-', cabinet_u_capacity, used, util, status])
        section_cabinet: ReportSection = {
            'id': 'client_hosting_cabinet',
            'title': '机柜U位使用情况',
            'tables': [{
                'headers': ['机柜编号', '总容量(U)', '已使用(U)', '利用率(%)', '状态'],
                'rows': cabinet_rows,
            }],
        }

        # 4.5 机柜弱电信息（该客户机柜的 PDU 电流、功率、电流利用率、预警说明）
        pdu_table = _build_client_cabinet_pdu_table(
            cabinet_qs, start_date, end_date, config
        )
        section_pdu: ReportSection = {
            'id': 'client_hosting_pdu',
            'title': '机柜弱电信息',
            'tables': [pdu_table],
        }

        sections_client: List[ReportSection] = [
            section_overview,
            section_events_by_room,
            section_alerts,
            {
                'id': 'client_hosting',
                'title': '设备托管情况',
                'tables': (
                    section_scale['tables'] + section_dist['tables']
                    + section_stability['tables'] + section_cabinet['tables']
                ),
            },
            section_pdu,
        ]

        meta = build_report_meta(
            'client_report',
            start_date,
            end_date,
            client_id=client_id,
            cabinet_id=None,
            client_name=client_name,
            cabinet_name=None,
        )
        return build_report_data(meta, summary, sections_client)
