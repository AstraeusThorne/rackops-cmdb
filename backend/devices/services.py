import json
from datetime import date

from django.db import transaction
from django.utils.dateparse import parse_date, parse_time

from common.utils import HistoryTracker
from devices.models import Cabinet, DecommissionedDevice, Device, WarehouseDevice, WarehouseDeviceHistory


class WarehouseInstallError(Exception):
    """仓库设备上架业务错误。"""


class WarehouseOutOfStockError(Exception):
    """仓库设备出库业务错误。"""


class DeviceDecommissionError(Exception):
    """设备下架业务错误。"""


class DeviceImportError(Exception):
    """导入链路中的设备业务错误。"""


def _parse_action_date(raw_action_date):
    if raw_action_date:
        if isinstance(raw_action_date, str):
            parsed = parse_date(raw_action_date)
            if parsed:
                return parsed
        return raw_action_date
    return date.today()


def _parse_action_time(raw_action_time):
    if raw_action_time and isinstance(raw_action_time, str):
        parsed = parse_time(raw_action_time)
        if parsed:
            return parsed
    return raw_action_time


def _get_event_or_raise(event_id, error_cls, missing_message):
    if not event_id:
        return None

    from events.models import Event

    try:
        return Event.objects.get(id=event_id)
    except Event.DoesNotExist as exc:
        raise error_cls(missing_message.format(event_id=event_id)) from exc


def _resolve_event(event=None, event_id=None, *, error_cls=DeviceImportError, missing_message='事件 {event_id} 不存在'):
    if event is not None:
        return event
    return _get_event_or_raise(event_id, error_cls, missing_message)


@transaction.atomic
def install_warehouse_device(*, warehouse_device, cabinet_id, rack_position='', install_location='', action_date=None, action_time=None, event_id=None, notes='', operator=None):
    """
    将仓库设备上架到机柜，并在同一事务内完成：
    1. 校验仓库设备状态、机柜、事件
    2. 创建在架设备
    3. 更新仓库设备状态与备注
    4. 记录仓库设备上架历史
    5. 建立事件与设备关联
    """
    if warehouse_device.status != 'in_warehouse':
        raise WarehouseInstallError('该设备不在仓库中，无法上架')

    try:
        cabinet = Cabinet.objects.select_related('room').get(id=cabinet_id)
    except Cabinet.DoesNotExist as exc:
        raise WarehouseInstallError(f'机柜 {cabinet_id} 不存在') from exc

    event = _get_event_or_raise(
        event_id,
        WarehouseInstallError,
        '事件 {event_id} 不存在，仓库设备未上架',
    )

    parsed_action_date = _parse_action_date(action_date)
    parsed_action_time = _parse_action_time(action_time)
    resolved_install_location = install_location or f"{cabinet.room.name}-{cabinet.name}"

    device = Device.objects.create(
        brand=warehouse_device.brand,
        model=warehouse_device.model,
        sn=warehouse_device.sn,
        u_size=warehouse_device.u_size,
        rack_position=rack_position or '',
        power_type=warehouse_device.power_type,
        power_wattage=warehouse_device.power_wattage,
        device_type=warehouse_device.device_type,
        cabinet=cabinet,
    )

    warehouse_device.status = 'installed'
    history_note = f"{parsed_action_date} 上架到 {resolved_install_location}"
    if rack_position:
        history_note += f" ({rack_position})"
    warehouse_device.notes = (
        f"{warehouse_device.notes}\n{history_note}"
        if warehouse_device.notes
        else history_note
    )
    warehouse_device.save(update_fields=['status', 'notes'])

    WarehouseDeviceHistory.objects.create(
        warehouse_device=warehouse_device,
        action='install',
        action_date=parsed_action_date,
        action_time=parsed_action_time,
        install_location=resolved_install_location,
        install_rack_position=rack_position,
        cabinet=cabinet,
        event=event,
        notes=notes,
        operator=operator,
    )

    if event is not None:
        from events.models import EventDevice

        EventDevice.objects.get_or_create(
            event=event,
            device=device,
        )

    return device


@transaction.atomic
def out_of_warehouse_device(*, warehouse_device, action_date=None, action_time=None, event_id=None, notes='', operator=None):
    """将仓库设备标记为已出库，并记录出库历史。"""
    if warehouse_device.status != 'in_warehouse':
        raise WarehouseOutOfStockError('该设备不在仓库中，无法出库')

    event = _get_event_or_raise(
        event_id,
        WarehouseOutOfStockError,
        '事件 {event_id} 不存在，仓库设备未出库',
    )
    parsed_action_date = _parse_action_date(action_date)
    parsed_action_time = _parse_action_time(action_time)

    warehouse_device.status = 'out_of_warehouse'
    if parsed_action_time:
        datetime_str = f"{parsed_action_date} {parsed_action_time.strftime('%H:%M:%S')}"
    else:
        datetime_str = str(parsed_action_date)

    history_note = f"{datetime_str} 已出库"
    if notes:
        history_note += f" - {notes}"

    warehouse_device.notes = (
        f"{warehouse_device.notes}\n{history_note}"
        if warehouse_device.notes
        else history_note
    )
    warehouse_device.save(update_fields=['status', 'notes'])

    WarehouseDeviceHistory.objects.create(
        warehouse_device=warehouse_device,
        action='out',
        action_date=parsed_action_date,
        action_time=parsed_action_time,
        event=event,
        notes=notes,
        operator=operator,
    )

    return warehouse_device


@transaction.atomic
def decommission_device(*, device, decommission_reason='', status='decommissioned', event_id=None, user=None):
    """将在架设备下架并建立事件关联。"""
    event = _get_event_or_raise(
        event_id,
        DeviceDecommissionError,
        '事件 {event_id} 不存在，设备未下架',
    )

    device_delete_history = None
    if user is not None:
        device_delete_history = HistoryTracker.record_change(
            instance=device,
            action='delete',
            user=user,
            reason='设备下架回退配对历史',
        )

    decommissioned_device = DecommissionedDevice.objects.create(
        sn=device.sn,
        brand=device.brand,
        model=device.model,
        u_size=device.u_size,
        rack_position=device.rack_position,
        power_type=device.power_type,
        cabinet=device.cabinet,
        decommission_reason=decommission_reason,
        status=status,
    )

    if event is not None:
        from events.models import EventDecommissionedDevice

        EventDecommissionedDevice.objects.get_or_create(
            event=event,
            decommissioned_device=decommissioned_device,
        )

    device.delete()

    if user is not None:
        decommission_history = HistoryTracker.record_change(
            instance=decommissioned_device,
            action='create',
            user=user,
            reason='设备下架回退配对历史',
        )
        if device_delete_history:
            device_delete_history.reason = json.dumps({
                'pair_type': 'device_decommission',
                'paired_history_id': decommission_history.id,
                'sn': device.sn,
            }, ensure_ascii=False)
            device_delete_history.save(update_fields=['reason'])
            decommission_history.reason = json.dumps({
                'pair_type': 'device_decommission',
                'paired_history_id': device_delete_history.id,
                'sn': device.sn,
            }, ensure_ascii=False)
            decommission_history.save(update_fields=['reason'])
    return decommissioned_device


@transaction.atomic
def upsert_installed_device_for_event(*, sn, brand, model, u_size, rack_position='', power_type='single', power_wattage=None, device_type='other', cabinet, event):
    """导入链路复用：创建或更新在架设备，并建立事件关联。"""
    if cabinet is None:
        raise DeviceImportError('机柜不能为空')
    if event is None:
        raise DeviceImportError('事件不能为空')

    device = Device.objects.filter(sn=sn).first()
    created = device is None

    if created:
        device = Device.objects.create(
            sn=sn,
            brand=brand,
            model=model,
            u_size=u_size,
            rack_position=rack_position or '',
            power_type=power_type,
            power_wattage=power_wattage,
            device_type=device_type,
            cabinet=cabinet,
        )
    else:
        device.brand = brand
        device.model = model
        device.u_size = u_size
        device.rack_position = rack_position or ''
        device.power_type = power_type
        device.power_wattage = power_wattage
        device.device_type = device_type
        device.cabinet = cabinet
        device.save()

    from events.models import EventDevice

    EventDevice.objects.get_or_create(event=event, device=device)
    return device, created


@transaction.atomic
def create_or_reuse_decommissioned_device_for_event(*, sn, brand, model, u_size, rack_position='', power_type='single', cabinet=None, decommission_reason='', status='decommissioned', event):
    """导入链路复用：同一事件下复用已有关联下架记录，否则创建并建立关联。"""
    if event is None:
        raise DeviceImportError('事件不能为空')

    from events.models import EventDecommissionedDevice

    decommissioned_device = (
        DecommissionedDevice.objects
        .filter(sn=sn, events=event)
        .first()
    )
    created = decommissioned_device is None

    if created:
        decommissioned_device = DecommissionedDevice.objects.create(
            sn=sn,
            brand=brand,
            model=model,
            u_size=u_size,
            rack_position=rack_position or '',
            power_type=power_type,
            decommission_reason=decommission_reason,
            status=status,
            cabinet=cabinet,
        )
    else:
        update_fields = []
        if status and decommissioned_device.status != status:
            decommissioned_device.status = status
            update_fields.append('status')
        if update_fields:
            decommissioned_device.save(update_fields=update_fields)

    EventDecommissionedDevice.objects.get_or_create(
        event=event,
        decommissioned_device=decommissioned_device,
    )
    return decommissioned_device, created
