"""
机柜视图报表聚合器。

将多个机柜的当前设备占用布局整理为可导出 PDF 的结构。
"""
from __future__ import annotations

from datetime import date
from typing import Any, Iterable, Optional

from django.db.models import Prefetch

from devices.models import Cabinet, Device
from report.schemas.report_schema import build_report_data, build_report_meta
from .base import BaseReportAggregator

TOTAL_RACK_UNITS = 42

DEVICE_TYPE_LABELS = {
    'server': '服务器',
    'switch': '交换机',
    'router': '路由器',
    'firewall': '防火墙',
    'storage': '存储设备',
    'ups': 'UPS',
    'pdu': 'PDU',
    'other': '其他',
}

POWER_TYPE_LABELS = {
    'single': '单电源',
    'dual': '双电源',
}


def _normalize_cabinet_ids(
    cabinet_ids: Optional[Iterable[Any]] = None,
    cabinet_id: Optional[int] = None,
) -> list[int]:
    """去重并保留用户选择顺序。"""
    normalized: list[int] = []
    seen: set[int] = set()
    values = list(cabinet_ids or [])
    if not values and cabinet_id:
        values = [cabinet_id]

    for raw_value in values:
        try:
            value = int(raw_value)
        except (TypeError, ValueError):
            continue
        if value <= 0 or value in seen:
            continue
        seen.add(value)
        normalized.append(value)
    return normalized


def _parse_start_u(rack_position: Any) -> Optional[int]:
    """rack_position 视为起始 U 位，兼容 '10' / '10-11' 等格式。"""
    if rack_position in (None, ''):
        return None

    raw_text = str(rack_position).strip()
    if not raw_text:
        return None

    start_text = raw_text.split('-', 1)[0].strip()
    try:
        start_u = int(start_text)
    except (TypeError, ValueError):
        return None

    if start_u < 1 or start_u > TOTAL_RACK_UNITS:
        return None
    return start_u


def _normalize_u_size(value: Any) -> int:
    try:
        return max(int(value), 1)
    except (TypeError, ValueError):
        return 1


class CabinetViewReportAggregator(BaseReportAggregator):
    """机柜视图导出聚合器。"""

    period_type = 'cabinet_view'

    def aggregate(
        self,
        start_date: date,
        end_date: date,
        client_id: Optional[int] = None,
        cabinet_id: Optional[int] = None,
        cabinet_ids: Optional[Iterable[Any]] = None,
    ) -> dict:
        selected_ids = _normalize_cabinet_ids(cabinet_ids=cabinet_ids, cabinet_id=cabinet_id)
        if not selected_ids and client_id:
            selected_ids = list(
                Cabinet.objects.filter(client_id=client_id)
                .select_related('room')
                .order_by('room__name', 'name', 'id')
                .values_list('id', flat=True)
            )
        if not selected_ids:
            raise ValueError('机柜视图至少需要选择一个机柜，或先选择客户。')

        cabinets_qs = (
            Cabinet.objects.filter(id__in=selected_ids)
            .select_related('room', 'client')
            .prefetch_related(
                Prefetch(
                    'devices',
                    queryset=Device.objects.order_by('rack_position', 'id'),
                )
            )
        )
        cabinet_map = {cab.id: cab for cab in cabinets_qs}

        missing_ids = [cab_id for cab_id in selected_ids if cab_id not in cabinet_map]
        if missing_ids:
            raise ValueError(f"未找到以下机柜：{', '.join(map(str, missing_ids))}")

        cabinet_views: list[dict[str, Any]] = []
        sections: list[dict[str, Any]] = []
        cabinet_names: list[str] = []
        total_device_count = 0
        total_used_units = 0
        unique_client_names: set[str] = set()

        for cab_id in selected_ids:
            cabinet = cabinet_map[cab_id]
            room_name = cabinet.room.name if cabinet.room else ''
            client_name = cabinet.client.name if cabinet.client else ''
            if client_name:
                unique_client_names.add(client_name)

            serialized_devices: list[dict[str, Any]] = []
            occupied_units: set[int] = set()

            for device in cabinet.devices.all():
                start_u = _parse_start_u(device.rack_position)
                if start_u is None:
                    continue

                u_size = _normalize_u_size(device.u_size)
                end_u = min(TOTAL_RACK_UNITS, start_u + u_size - 1)
                occupied_units.update(range(start_u, end_u + 1))

                serialized_devices.append({
                    'id': device.id,
                    'brand': device.brand or '',
                    'model': device.model or '',
                    'deviceName': ' '.join(part for part in [device.brand, device.model] if part) or '未命名设备',
                    'sn': device.sn or '-',
                    'deviceType': device.device_type or 'other',
                    'deviceTypeLabel': DEVICE_TYPE_LABELS.get(device.device_type, '其他'),
                    'powerType': device.power_type or '',
                    'powerTypeLabel': POWER_TYPE_LABELS.get(device.power_type, '-'),
                    'startU': start_u,
                    'endU': end_u,
                    'uSize': max(end_u - start_u + 1, 1),
                    'rackPosition': device.rack_position or '',
                    'positionLabel': f"U{start_u}" if start_u == end_u else f"U{start_u}-U{end_u}",
                })

            serialized_devices.sort(key=lambda item: (-item['endU'], -item['startU'], item['deviceName'], item['sn']))

            used_units = len(occupied_units)
            available_units = max(TOTAL_RACK_UNITS - used_units, 0)
            utilization_rate = round((used_units / TOTAL_RACK_UNITS) * 100, 1) if TOTAL_RACK_UNITS else 0
            cabinet_name = cabinet.name or f'机柜{cabinet.id}'
            cabinet_names.append(cabinet_name)
            total_device_count += len(serialized_devices)
            total_used_units += used_units

            cabinet_views.append({
                'cabinetId': cabinet.id,
                'cabinetName': cabinet_name,
                'roomName': room_name or '-',
                'clientName': client_name or '-',
                'totalUnits': TOTAL_RACK_UNITS,
                'usedUnits': used_units,
                'availableUnits': available_units,
                'utilizationRate': utilization_rate,
                'devices': serialized_devices,
            })

            rows = [
                [item['positionLabel'], item['deviceName'], item['sn'], item['deviceTypeLabel'], item['powerTypeLabel']]
                for item in serialized_devices
            ] or [['-', '暂无设备', '-', '-', '-']]
            sections.append({
                'id': f'cabinet_view_{cabinet.id}',
                'title': f"{room_name or '-'} / {cabinet_name}",
                'tables': [
                    {
                        'headers': ['U位范围', '设备', 'SN', '类型', '电源'],
                        'rows': rows,
                    }
                ],
            })

        meta = build_report_meta(
            'cabinet_view',
            start_date,
            end_date,
            client_id=client_id,
            cabinet_id=selected_ids[0] if len(selected_ids) == 1 else None,
            client_name=next(iter(unique_client_names)) if len(unique_client_names) == 1 else None,
            cabinet_name=cabinet_names[0] if len(cabinet_names) == 1 else None,
            cabinet_ids=selected_ids,
            cabinet_names=cabinet_names,
        )
        summary = {
            'cabinetCount': len(cabinet_views),
            'deviceCount': total_device_count,
            'occupiedUnits': total_used_units,
            'availableUnits': max(len(cabinet_views) * TOTAL_RACK_UNITS - total_used_units, 0),
        }

        data = build_report_data(meta, summary, sections)
        data['cabinetViews'] = cabinet_views
        return data
