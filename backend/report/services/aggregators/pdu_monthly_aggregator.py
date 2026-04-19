"""
弱电资源管理月报聚合器：查询 PDU 库与默认库，产出资源总览、趋势、分布、风险、改进建议。
"""
from datetime import date, datetime, timedelta
from typing import Optional, Dict, Any, List
from collections import defaultdict
from decimal import Decimal

from django.db.models import Sum, Count, Max, Avg
from django.db.models.functions import TruncDate, Coalesce  # noqa: F401 - TruncDate used in trend queries

from report.schemas.report_schema import (
    build_report_meta,
    build_report_data,
    ReportSummary,
    ReportSection,
)
from report.constants import get_pdu_report_config


class PduMonthlyReportAggregator:
    """弱电资源管理聚合器，支持 power_daily / power_monthly / power_yearly。"""

    def __init__(self, period_type: str = 'power_monthly'):
        self.period_type = period_type

    def aggregate(
        self,
        start_date: date,
        end_date: date,
        client_id: Optional[int] = None,
        cabinet_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        config = get_pdu_report_config()
        rated_current = config['rated_current_per_circuit']
        cabinet_u = config['cabinet_u_capacity']
        high_threshold = config['high_utilization_threshold']
        warning_threshold = config.get('current_warning_threshold', 60)
        imbalance_ratio = config['redundancy_imbalance_ratio']

        start_dt = datetime.combine(start_date, datetime.min.time())
        end_dt = datetime.combine(end_date, datetime.max.time())

        from devices.models import PDUDevice, PDUPort, CabinetPDUData
        from devices.models import Room, Cabinet, Device

        # ------ 默认库：机柜、机房、设备 U 位 ------
        cabinet_qs = Cabinet.objects.select_related('room').all()
        if cabinet_id is not None:
            cabinet_qs = cabinet_qs.filter(id=cabinet_id)
        elif client_id is not None:
            cabinet_qs = cabinet_qs.filter(client_id=client_id)
        cabinet_count = cabinet_qs.count()
        room_ids = list(cabinet_qs.values_list('room_id', flat=True).distinct())
        room_count = Room.objects.filter(id__in=room_ids).count() if room_ids else 0

        # 已用 U：按 cabinet 汇总 Device.u_size（空间利用率 = 已用U/单柜总U×100%，单柜总U 来自配置 cabinet_u_capacity）
        device_u = (
            Device.objects.filter(cabinet__in=cabinet_qs)
            .values('cabinet_id')
            .annotate(used_u=Coalesce(Sum('u_size'), 0))
            .order_by()
        )
        used_u_by_cabinet = {r['cabinet_id']: int(r['used_u'] or 0) for r in device_u}
        total_used_u = sum(used_u_by_cabinet.values())
        total_u_capacity = cabinet_count * cabinet_u
        space_util = round(total_used_u / total_u_capacity * 100, 1) if total_u_capacity else 0.0

        # ------ PDU 库：设备、端口、数据（.using('pdu')）------
        client_cabinet_ids = list(cabinet_qs.values_list('id', flat=True)) if client_id is not None else None
        try:
            pdu_devices = PDUDevice.objects.using('pdu').all()
            pdu_device_count = pdu_devices.count()
            ports = PDUPort.objects.using('pdu').select_related('pdu_device').filter(
                cabinet_id__isnull=False
            )
            if cabinet_id is not None:
                ports = ports.filter(cabinet_id=cabinet_id)
            elif client_cabinet_ids is not None:
                ports = ports.filter(cabinet_id__in=client_cabinet_ids)
            port_list = list(ports)
            port_ids = [p.id for p in port_list]
            port_count = len(port_list)
            monitored_cabinet_ids = list(set(p.cabinet_id for p in port_list))
            monitored_cabinet_count = len(monitored_cabinet_ids)
        except Exception:
            pdu_device_count = 0
            port_count = 0
            monitored_cabinet_count = 0
            port_list = []
            port_ids = []
            monitored_cabinet_ids = []

        # 当前电流：周期内每个端口取最新一条，再按柜汇总；并按 A/B 路分柜汇总供资源分布两路电流表用
        current_by_cabinet: Dict[int, float] = defaultdict(float)
        current_A_by_cabinet: Dict[int, float] = defaultdict(float)
        current_B_by_cabinet: Dict[int, float] = defaultdict(float)
        current_by_cabinet_room: Dict[int, str] = {}
        port_to_cabinet = {}
        port_to_room = {}
        for p in port_list:
            port_to_cabinet[p.id] = p.cabinet_id
            port_to_room[p.id] = getattr(p.pdu_device, 'room_name', None) or ''
            current_by_cabinet_room[p.cabinet_id] = port_to_room[p.id]

        def _fill_current_by_cabinet(queryset):
            """从电流查询结果填充 current_by_cabinet（每个端口保留最新一条）。返回本批中已出现的端口 id 集合。"""
            seen_port = set()
            for row in queryset:
                pid = row['pdu_port_id']
                if pid in seen_port:
                    continue
                seen_port.add(pid)
                cid = row['pdu_port__cabinet_id']
                if cid is None:
                    continue
                try:
                    val = float(row['value'] or 0)
                    current_by_cabinet[cid] += val
                except (ValueError, TypeError):
                    continue
            return seen_port

        def _fill_power_by_cabinet(queryset):
            """从功率查询结果填充 power_by_cabinet（每个端口保留最新一条），与电流逻辑一致。返回本批中已出现的端口 id 集合。"""
            seen_port = set()
            for row in queryset:
                pid = row['pdu_port_id']
                if pid in seen_port:
                    continue
                seen_port.add(pid)
                cid = row['pdu_port__cabinet_id']
                if cid is None:
                    continue
                try:
                    val = float(row['value'] or 0)
                    power_by_cabinet[cid] += val
                except (ValueError, TypeError):
                    continue
            return seen_port

        def _fill_current_AB_by_cabinet(queryset):
            """从带 circuit_type 的电流查询结果填充 A/B 路按柜汇总（每端口保留最新一条）。"""
            seen_port = set()
            for row in queryset:
                pid = row['pdu_port_id']
                if pid in seen_port:
                    continue
                seen_port.add(pid)
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

        try:
            # 优先：统计周期内的电流数据，仅针对已有端口（port_list），每端口取最新一条
            if port_ids:
                current_data = (
                    CabinetPDUData.objects.using('pdu')
                    .filter(
                        data_type='current',
                        pdu_port_id__in=port_ids,
                        timestamp__gte=start_dt,
                        timestamp__lte=end_dt,
                    )
                    .values('pdu_port_id', 'pdu_port__cabinet_id', 'value', 'timestamp')
                    .order_by('pdu_port_id', '-timestamp', '-id')
                )
                seen_port_current = _fill_current_by_cabinet(current_data)
                # 对周期内无电流数据的端口，用该端口全表最新一条电流（与功率回退一致）
                missing_port_ids = [pid for pid in port_ids if pid not in seen_port_current]
                if missing_port_ids:
                    latest_current = (
                        CabinetPDUData.objects.using('pdu')
                        .filter(data_type='current', pdu_port_id__in=missing_port_ids)
                        .values('pdu_port_id', 'pdu_port__cabinet_id', 'value', 'timestamp')
                        .order_by('pdu_port_id', '-timestamp', '-id')
                    )
                    _fill_current_by_cabinet(latest_current)
        except Exception:
            pass

        try:
            # 按 A/B 路分柜汇总（用于资源分布「机柜两路电流」表）；筛选客户时仅该客户机柜端口
            current_data_ab = (
                CabinetPDUData.objects.using('pdu')
                .filter(
                    data_type='current',
                    timestamp__gte=start_dt,
                    timestamp__lte=end_dt,
                )
            )
            if client_id is not None:
                if port_ids:
                    current_data_ab = current_data_ab.filter(pdu_port_id__in=port_ids)
                else:
                    current_data_ab = current_data_ab.none()
            current_data_ab = current_data_ab.values(
                'pdu_port_id', 'pdu_port__cabinet_id',
                'pdu_port__pdu_device__circuit_type', 'value', 'timestamp',
            ).order_by('pdu_port_id', '-timestamp')
            _fill_current_AB_by_cabinet(current_data_ab)
            if not current_A_by_cabinet and not current_B_by_cabinet and port_list:
                latest_ab_qs = CabinetPDUData.objects.using('pdu').filter(data_type='current')
                if client_id is not None:
                    if port_ids:
                        latest_ab_qs = latest_ab_qs.filter(pdu_port_id__in=port_ids)
                    else:
                        latest_ab_qs = latest_ab_qs.none()
                latest_ab = latest_ab_qs.values(
                    'pdu_port_id', 'pdu_port__cabinet_id',
                    'pdu_port__pdu_device__circuit_type', 'value', 'timestamp',
                ).order_by('pdu_port_id', '-timestamp')
                _fill_current_AB_by_cabinet(latest_ab)
        except Exception:
            pass

        # 额定电流：每柜假设 A+B 两路，每路 rated_current
        circuits_per_cabinet = 2  # A路+B路
        # 确保 rated_current 有效
        if not rated_current or rated_current <= 0:
            rated_current = 32  # 默认32A
        rated_total = monitored_cabinet_count * circuits_per_cabinet * rated_current if monitored_cabinet_count else 1
        total_current = sum(current_by_cabinet.values())
        current_util = round(total_current / rated_total * 100, 1) if rated_total else 0.0

        # 按机柜的额定（用于风险）
        rated_per_cabinet = circuits_per_cabinet * rated_current

        meta = build_report_meta(
            self.period_type,
            start_date,
            end_date,
            client_id=client_id,
            cabinet_id=cabinet_id,
        )
        summary: ReportSummary = {
            'cabinetCount': cabinet_count,
            'roomCount': room_count,
        }
        summary_extra = {
            'pdu_cabinet_count': cabinet_count,
            'pdu_monitored_cabinet_count': monitored_cabinet_count,
            'pdu_room_count': room_count,
            'pdu_device_count': pdu_device_count,
            'pdu_port_count': port_count,
            'pdu_current_utilization': current_util,
            'pdu_total_current': round(total_current, 2),
            'pdu_rated_total_current': rated_total,
            'pdu_space_utilization': space_util,
            'pdu_used_u': total_used_u,
            'pdu_total_u': total_u_capacity,
        }
        summary.update(summary_extra)

        sections: List[ReportSection] = []

        # Sheet1 总览表
        overview_rows = [
            ['机柜总数', cabinet_count, ''],
            ['有PDU监测的机柜数', monitored_cabinet_count, ''],
            ['机房数', room_count, ''],
            ['PDU设备数', pdu_device_count, ''],
            ['监测端口数', port_count, ''],
            ['整体电流利用率', str(current_util) + '%', '当前总电流/额定总电流'],
            ['整体机柜空间利用率', str(space_util) + '%', '已用U/总U'],
        ]
        sections.append({
            'id': 'pdu_overview',
            'title': '资源总览',
            'tables': [{'headers': ['指标名称', '数值', '单位/备注'], 'rows': overview_rows}],
        })

        # 趋势：按日聚合电流（按端口取当日最大/平均再汇总）、电量（累加值按日前一天差算消耗）
        # 电流查询含「报表起始日的前一天」，用于单日报表也能算环比（当日 vs 前一日）
        start_dt_prev_current = start_dt - timedelta(days=1)
        try:
            # 电流：按(日, 端口)取当日 Max 与 Avg，再按日汇总，避免“当日所有采样点直接 Sum”导致利用率>100%
            port_day_current_qs = (
                CabinetPDUData.objects.using('pdu')
                .filter(
                    data_type='current',
                    timestamp__gte=start_dt_prev_current,
                    timestamp__lte=end_dt,
                )
            )
            # 仅当按客户筛选时限制为该国客户机柜端口，避免未选客户时用巨大 IN 列表且逻辑与「全部」一致
            if client_id is not None:
                if port_ids:
                    port_day_current_qs = port_day_current_qs.filter(pdu_port_id__in=port_ids)
                else:
                    port_day_current_qs = port_day_current_qs.none()
            port_day_current = (
                port_day_current_qs
                .annotate(day=TruncDate('timestamp'))
                .values('day', 'pdu_port_id')
                .annotate(max_val=Max('value'), avg_val=Avg('value'))
                .order_by('day')
            )
            day_total_avg: Dict[date, float] = defaultdict(float)
            day_total_max: Dict[date, float] = defaultdict(float)
            for r in port_day_current:
                d = r['day']
                if d is None:
                    continue
                day_total_avg[d] += float(r['avg_val'] or 0)
                day_total_max[d] += float(r['max_val'] or 0)
            # 只对报表周期内的日期输出行；前一日仅用于计算环比
            days_sorted = sorted(d for d in day_total_avg.keys() if d >= start_date)
        except Exception:
            days_sorted = []
            day_total_avg = {}
            day_total_max = {}

        trend_current_rows = []
        for d in days_sorted:
            day_str = d.isoformat() if d else '-'
            total = round(day_total_avg.get(d, 0), 2)
            prev_day_total = day_total_avg.get(d - timedelta(days=1))
            if prev_day_total is None:
                pct_str = '-'
            elif prev_day_total == 0:
                pct_str = '0%' if total == 0 else '—'
            else:
                pct_val = round((total - prev_day_total) / prev_day_total * 100, 1)
                pct_str = str(pct_val) + '%'
            trend_current_rows.append([day_str, total, pct_str])
        sections.append({
            'id': 'pdu_trend_current',
            'title': '电流增长趋势',
            'tables': [{'headers': ['日期', '总电流(A)', '环比(%)'], 'rows': trend_current_rows}],
        })

        # 电量：为累加值，按日取各端口当日末累计值汇总，再与前一天末做差得到当日消耗量
        # 电量环比需连续 3 天末累计：当日消耗 = 当日末 - 前一日末（需 2 天）；环比 = 当日消耗 vs 前一日消耗，前一日消耗 = 前一日末 - 前两日末（再需 1 天）。故查询从「报表起始日的前两天」起。
        start_dt_prev = start_dt - timedelta(days=2)
        try:
            energy_qs = (
                CabinetPDUData.objects.using('pdu')
                .filter(
                    data_type='energy',
                    timestamp__gte=start_dt_prev,
                    timestamp__lte=end_dt,
                )
            )
            if client_id is not None:
                if port_ids:
                    energy_qs = energy_qs.filter(pdu_port_id__in=port_ids)
                else:
                    energy_qs = energy_qs.none()
            energy_rows_raw = energy_qs.annotate(day=TruncDate('timestamp')).values(
                'day', 'pdu_port_id', 'value', 'timestamp'
            ).order_by('day', 'pdu_port_id', '-timestamp')
            # 按 (日, 端口) 保留当日最新一条（末累计）；因已按 day, port, -timestamp 排序，首次出现的即当日末
            port_day_latest: Dict[tuple, float] = {}
            for row in energy_rows_raw:
                day = row.get('day')
                if day is None:
                    continue
                # 统一为 date，避免 datetime 与 date 混用导致 get(d - timedelta) 取不到
                day_norm = day.date() if isinstance(day, datetime) else day
                key = (day_norm, row['pdu_port_id'])
                if key not in port_day_latest:
                    port_day_latest[key] = float(row.get('value') or 0)
            cumulative_by_day: Dict[date, float] = defaultdict(float)
            for (day, _), val in port_day_latest.items():
                cumulative_by_day[day] += val
            # 只对报表周期内的日期输出行；前一日/前两日仅用于计算消耗与环比
            energy_days_sorted = sorted(d for d in cumulative_by_day.keys() if d >= start_date)
        except Exception:
            energy_days_sorted = []
            cumulative_by_day = {}

        trend_energy_rows = []
        for d in energy_days_sorted:
            d_date = d.date() if isinstance(d, datetime) else d  # 保证为 date 便于做日期间隔
            day_str = d_date.isoformat() if d_date else '-'
            cumul = cumulative_by_day.get(d_date, 0)
            prev_cumulative = cumulative_by_day.get(d_date - timedelta(days=1))
            if prev_cumulative is not None:
                consumption = round(cumul - prev_cumulative, 2)
                # 环比 = 当日消耗相对「前一日消耗」的变化；前一日消耗 = 前一日末累计 - 前两日末累计
                prev_cumulative_2 = cumulative_by_day.get(d_date - timedelta(days=2))
                if prev_cumulative_2 is not None:
                    prev_consumption = round(prev_cumulative - prev_cumulative_2, 2)
                    if prev_consumption == 0:
                        pct_str = '0%' if consumption == 0 else '—'
                    else:
                        pct_val = round((consumption - prev_consumption) / prev_consumption * 100, 1)
                        pct_str = str(pct_val) + '%'
                else:
                    pct_str = '-'  # 前两日无累计时无法算前一日消耗，环比不计算
                trend_energy_rows.append([day_str, consumption, pct_str])
            else:
                trend_energy_rows.append([day_str, '-', '-'])  # 前一日无累计数据时无法算消耗
        sections.append({
            'id': 'pdu_trend_energy',
            'title': '电量增长趋势',
            'tables': [{'headers': ['日期', '当日消耗电量(kWh)', '环比(%)'], 'rows': trend_energy_rows}],
        })

        # 电流利用率趋势：按日总电流（端口当日平均/最大汇总）/ 额定总电流 * 100
        trend_util_rows = []
        for d in days_sorted:
            day_str = d.isoformat() if d else '-'
            total_avg = day_total_avg.get(d, 0)
            total_max = day_total_max.get(d, 0)
            util_avg = round(total_avg / rated_total * 100, 1) if rated_total else 0
            util_max = round(total_max / rated_total * 100, 1) if rated_total else 0
            trend_util_rows.append([day_str, util_avg, util_max])
        sections.append({
            'id': 'pdu_trend_current_util',
            'title': '电流利用率趋势',
            'tables': [{'headers': ['日期', '平均电流利用率(%)', '最大电流利用率(%)'], 'rows': trend_util_rows}],
        })

        # 机房分布：按 room 汇总机柜数、总电流、总功率、空间利用率
        room_cabinets: Dict[str, List[int]] = defaultdict(list)
        for p in port_list:
            rn = getattr(p.pdu_device, 'room_name', None) or '未分类'
            room_cabinets[rn].append(p.cabinet_id)
        for cid in current_by_cabinet:
            rn = current_by_cabinet_room.get(cid, '未分类')
            room_cabinets[rn].append(cid)

        distribution_rows = []
        power_by_cabinet: Dict[int, float] = defaultdict(float)
        try:
            # 总功率(kW)：与电流同一套逻辑——仅统计 port_list 内端口，周期内每端口取最新一条，按柜汇总
            port_ids = [p.id for p in port_list]
            if port_ids:
                power_data = (
                    CabinetPDUData.objects.using('pdu')
                    .filter(
                        data_type='power',
                        pdu_port_id__in=port_ids,
                        timestamp__gte=start_dt,
                        timestamp__lte=end_dt,
                    )
                    .values('pdu_port_id', 'pdu_port__cabinet_id', 'value', 'timestamp')
                    .order_by('pdu_port_id', '-timestamp', '-id')
                )
                seen_port_power = _fill_power_by_cabinet(power_data)
                # 周期内无功率的端口用该端口全表最新一条（与电流回退一致）
                missing_port_ids = [pid for pid in port_ids if pid not in seen_port_power]
                if missing_port_ids:
                    latest_power = (
                        CabinetPDUData.objects.using('pdu')
                        .filter(data_type='power', pdu_port_id__in=missing_port_ids)
                        .values('pdu_port_id', 'pdu_port__cabinet_id', 'value', 'timestamp')
                        .order_by('pdu_port_id', '-timestamp', '-id')
                    )
                    _fill_power_by_cabinet(latest_power)
            # 无功率数据但有电流的机柜：用 220V×电流(A) 估算功率(kW)，避免误显示 0
            VOLTAGE_ESTIMATE_KW_PER_A = 220.0 / 1000.0  # 约 0.22 kW / A
            all_cab_ids = set()
            for cids in room_cabinets.values():
                all_cab_ids.update(cids)
            for cid in all_cab_ids:
                if power_by_cabinet.get(cid, 0) <= 0 and current_by_cabinet.get(cid, 0) > 0:
                    power_by_cabinet[cid] = VOLTAGE_ESTIMATE_KW_PER_A * current_by_cabinet[cid]
        except Exception:
            power_by_cabinet = defaultdict(float)

        room_used_u: Dict[str, int] = defaultdict(int)
        room_total_u: Dict[str, int] = defaultdict(int)
        for cab in cabinet_qs.select_related('room'):
            rn = cab.room.name if cab.room else '未分类'
            room_total_u[rn] += cabinet_u
            room_used_u[rn] += used_u_by_cabinet.get(cab.id, 0)

        for rn in sorted(room_cabinets.keys()):
            cab_ids = list(set(room_cabinets[rn]))
            cab_count = len(cab_ids)
            room_current = sum(current_by_cabinet.get(cid, 0) for cid in cab_ids)
            # power_by_cabinet 中按 kW 汇总（PDU 原始 power 字段即为 kW）
            room_power = sum(power_by_cabinet.get(cid, 0) for cid in cab_ids)  # kW
            room_rated = cab_count * circuits_per_cabinet * rated_current or 1
            room_util = round(room_current / room_rated * 100, 1) if room_rated else 0
            used = room_used_u.get(rn, 0)
            total = room_total_u.get(rn, 1)
            space_util_r = round(used / total * 100, 1) if total else 0
            distribution_rows.append([
                rn, cab_count, round(room_current, 2), round(room_power, 2),
                room_util, space_util_r, ''
            ])

        # 两个机房所有有 PDU 监控的机柜两路电流（A路、B路）
        cab_id_to_name = {}
        if monitored_cabinet_ids:
            for row in Cabinet.objects.filter(id__in=monitored_cabinet_ids).values('id', 'name'):
                cab_id_to_name[row['id']] = row['name'] or str(row['id'])
        cabinet_two_circuit_rows = []
        for cid in monitored_cabinet_ids:
            rn = current_by_cabinet_room.get(cid, '未分类')
            cab_name = cab_id_to_name.get(cid, str(cid))
            cur_a = round(current_A_by_cabinet.get(cid, 0), 2)
            cur_b = round(current_B_by_cabinet.get(cid, 0), 2)
            total_cur = cur_a + cur_b
            util = round(total_cur / rated_per_cabinet * 100, 1) if rated_per_cabinet else 0
            cabinet_two_circuit_rows.append((rn, cab_name, cur_a, cur_b, total_cur, util))
        cabinet_two_circuit_rows.sort(key=lambda x: (x[0], x[1]))
        cabinet_two_circuit_rows = [
            [rn, cab_name, cur_a, cur_b, total_cur, util]
            for rn, cab_name, cur_a, cur_b, total_cur, util in cabinet_two_circuit_rows
        ]

        sections.append({
            'id': 'pdu_distribution_room',
            'title': '机房分布',
            'tables': [
                {
                    'headers': ['机房名称', '机柜数', '总电流(A)', '总功率(kW)', '电流利用率(%)', '空间利用率(%)', '备注'],
                    'rows': distribution_rows,
                },
                {
                    'headers': ['机房名称', '机柜名称', 'A路电流(A)', 'B路电流(A)', '总电流(A)', '电流利用率(%)'],
                    'rows': cabinet_two_circuit_rows,
                },
            ],
        })

        # 风险：高利用率机柜（按空间利用率/U位利用率）
        high_util_rows = []
        # 获取机柜名称、机房名称，及展示用「机房-机柜名」（两机房可有同名机柜）
        cabinet_info = {}
        for cab in cabinet_qs.select_related('room'):
            room_name = cab.room.name if cab.room else '未分类'
            cab_name = cab.name or str(cab.id)
            cabinet_info[cab.id] = {
                'name': cab_name,
                'room': room_name,
                'display_name': '{}-[{}]'.format(room_name, cab_name),
            }
        # 遍历所有机柜，计算空间利用率；高利用率机柜阈值 60%（总U 为配置值，若未配置则按 1 避免除零）
        high_util_cabinet_threshold = 60
        total_u_per_cabinet = max(1, int(cabinet_u or 0))
        for cid in cabinet_info.keys():
            used_u = used_u_by_cabinet.get(cid, 0)
            space_util = round(used_u / total_u_per_cabinet * 100, 1)
            if space_util >= high_util_cabinet_threshold:
                info = cabinet_info[cid]
                level = '高' if space_util >= 90 else '中'
                high_util_rows.append([
                    info['display_name'],
                    info['room'],
                    used_u,
                    total_u_per_cabinet,
                    space_util,
                    level,
                ])
        sections.append({
            'id': 'pdu_risk_high_util',
            'title': '高利用率机柜',
            'tables': [{
                'headers': ['机柜名称', '机房', '已用U', '总U', '空间利用率(%)', '风险等级'],
                'rows': high_util_rows,
            }],
        })

        # 电流预警：仅列出有预警的机柜（利用率≥预警阈值），正常机柜不显示；按 A/B 路与总电流拆分展示
        current_warning_rows = []
        cabinet_names_from_ports = {p.cabinet_id: (p.cabinet_name or '') for p in port_list}
        if rated_per_cabinet > 0:
            for cid, cur in current_by_cabinet.items():
                util = round(cur / rated_per_cabinet * 100, 1)
                if util < warning_threshold:
                    continue
                rn = current_by_cabinet_room.get(cid, '')
                if cid in cabinet_info:
                    display_name = cabinet_info[cid]['display_name']
                else:
                    base_name = cabinet_names_from_ports.get(cid, '') or str(cid)
                    display_name = '{}-[{}]'.format(rn, base_name) if rn else base_name
                a_val = current_A_by_cabinet.get(cid, 0)
                b_val = current_B_by_cabinet.get(cid, 0)
                # 若 A/B 汇总为 0 但总电流有值，则用总电流回填 A 路，避免出现全 0
                if a_val == 0 and b_val == 0 and cur:
                    a_val = cur
                if util >= high_threshold:
                    note = '高负载，建议关注'
                else:
                    note = '已达{}%，建议关注'.format(warning_threshold)
                current_warning_rows.append([
                    display_name,
                    rn,
                    round(a_val, 2),
                    round(b_val, 2),
                    round(cur, 2),
                    rated_per_cabinet,
                    util,
                    note,
                ])
            # 按电流利用率从高到低排序（第 7 列）
            current_warning_rows.sort(key=lambda r: r[6], reverse=True)
        sections.append({
            'id': 'pdu_risk_current_warning',
            'title': '电流预警',
            'tables': [{
                'headers': ['机柜名称', '机房', 'A路电流(A)', 'B路电流(A)', '总电流(A)', '额定电流(A)', '电流利用率(%)', '预警说明'],
                'rows': current_warning_rows,
            }],
        })

        # 冗余不足：按柜 A/B 路电流；筛选客户时仅该客户机柜端口
        try:
            circuit_current: Dict[int, Dict[str, float]] = defaultdict(lambda: {'A': 0.0, 'B': 0.0})
            current_with_circuit_qs = (
                CabinetPDUData.objects.using('pdu')
                .filter(
                    data_type='current',
                    timestamp__gte=start_dt,
                    timestamp__lte=end_dt,
                )
                .select_related('pdu_port', 'pdu_port__pdu_device')
            )
            if client_id is not None:
                if port_ids:
                    current_with_circuit_qs = current_with_circuit_qs.filter(pdu_port_id__in=port_ids)
                else:
                    current_with_circuit_qs = current_with_circuit_qs.none()
            current_with_circuit = current_with_circuit_qs.order_by('pdu_port_id', '-timestamp')
            seen_p = set()
            for d in current_with_circuit:
                if d.pdu_port_id in seen_p:
                    continue
                seen_p.add(d.pdu_port_id)
                cid = d.pdu_port.cabinet_id
                if not cid:
                    continue
                circ = getattr(d.pdu_port.pdu_device, 'circuit_type', None) or 'A'
                circuit_current[cid][circ] += float(d.value or 0)
        except Exception:
            circuit_current = {}

        redundancy_rows = []
        for cid, circs in circuit_current.items():
            a_val = circs.get('A', 0)
            b_val = circs.get('B', 0)
            # 优先从cabinet_info获取（展示 机房-机柜名），否则从port_list获取
            if cid in cabinet_info:
                display_name = cabinet_info[cid]['display_name']
                rn = cabinet_info[cid]['room']
            else:
                base_name = cabinet_names_from_ports.get(cid, '') or str(cid)
                rn = current_by_cabinet_room.get(cid, '')
                display_name = '{}-[{}]'.format(rn, base_name) if rn else base_name
            if b_val == 0 and a_val > 0:
                redundancy_rows.append([display_name, rn, round(a_val, 2), round(b_val, 2), '单路供电'])
            elif a_val == 0 and b_val > 0:
                redundancy_rows.append([display_name, rn, round(a_val, 2), round(b_val, 2), '仅B路'])
            elif a_val > 0 and b_val > 0 and (b_val < a_val * imbalance_ratio or a_val < b_val * imbalance_ratio):
                redundancy_rows.append([display_name, rn, round(a_val, 2), round(b_val, 2), '双路不均衡'])
        sections.append({
            'id': 'pdu_risk_redundancy',
            'title': '冗余不足机柜',
            'tables': [{
                'headers': ['机柜名称', '机房', 'A路电流(A)', 'B路电流(A)', '说明'],
                'rows': redundancy_rows,
            }],
        })

        # 改进建议
        expand_rows = []
        # 扩容建议：基于空间利用率（与高利用率机柜使用相同 total_u）
        for cid in cabinet_info.keys():
            used_u = used_u_by_cabinet.get(cid, 0)
            space_util = round(used_u / total_u_per_cabinet * 100, 1)
            if space_util >= 90:
                info = cabinet_info[cid]
                expand_rows.append([
                    info['display_name'],
                    '{}U/{}U'.format(used_u, total_u_per_cabinet),
                    '建议扩容',
                    '空间利用率≥90%',
                    '高',
                ])
            elif space_util >= high_threshold:
                info = cabinet_info[cid]
                expand_rows.append([
                    info['display_name'],
                    '{}U/{}U'.format(used_u, total_u_per_cabinet),
                    '关注扩容',
                    '空间利用率≥{}%'.format(high_threshold),
                    '中',
                ])
        # 冗余不足建议
        for row in redundancy_rows:
            expand_rows.append([row[0], '-', '双路改造或均衡', row[4], '中'])

        sections.append({
            'id': 'pdu_recommendations_expand',
            'title': '扩容建议',
            'tables': [{
                'headers': ['机柜/机房', '当前容量', '建议扩容量', '理由', '优先级'],
                'rows': expand_rows,
            }],
        })

        optimize_rows = []
        # 资源优化建议：基于空间利用率
        for cid in cabinet_info.keys():
            used_u = used_u_by_cabinet.get(cid, 0)
            space_util = round(used_u / total_u_per_cabinet * 100, 1)
            if 0 < space_util < 30:
                info = cabinet_info[cid]
                optimize_rows.append([info['display_name'] + ' 低空间利用率', '可考虑合并负载或迁机', '低'])
        if not optimize_rows:
            optimize_rows.append(['暂无', '-', '-'])
        sections.append({
            'id': 'pdu_recommendations_optimize',
            'title': '资源优化建议',
            'tables': [{'headers': ['建议项', '说明', '优先级'], 'rows': optimize_rows}],
        })

        sections.append({
            'id': 'pdu_recommendations_cable',
            'title': '弱电整理建议',
            'tables': [{'headers': ['建议项', '说明', '优先级'], 'rows': [['请根据现场巡检填写', '', '-']]}],
        })

        return build_report_data(meta, summary, sections)
