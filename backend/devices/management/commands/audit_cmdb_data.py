from django.core.management.base import BaseCommand
from django.db.models import Count

from devices.models import DecommissionedDevice, Device, WarehouseDevice


class Command(BaseCommand):
    help = '巡检 CMDB 核心数据一致性，输出需要人工关注的异常数据。'

    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING('开始巡检 CMDB 数据一致性...'))

        unlinked_decommissioned = (
            DecommissionedDevice.objects
            .filter(events__isnull=True)
            .select_related('cabinet', 'cabinet__room')
            .order_by('-id')
        )
        duplicate_active_sn = (
            Device.objects
            .values('sn')
            .annotate(device_count=Count('id'))
            .filter(device_count__gt=1)
            .order_by('-device_count', 'sn')
        )
        inconsistent_warehouse = (
            WarehouseDevice.objects
            .filter(status='installed', events__isnull=True)
            .order_by('-id')
        )

        self.stdout.write('')
        self.stdout.write(self.style.HTTP_INFO(f'1. 未关联事件的下架设备: {unlinked_decommissioned.count()} 条'))
        for device in unlinked_decommissioned[:20]:
            room_name = device.cabinet.room.name if device.cabinet and device.cabinet.room_id else '-'
            cabinet_name = device.cabinet.name if device.cabinet_id else '-'
            self.stdout.write(
                f'  - ID={device.id} SN={device.sn} 位置={room_name}/{cabinet_name} 原因={(device.decommission_reason or "")[:40]}'
            )

        self.stdout.write('')
        self.stdout.write(self.style.HTTP_INFO(f'2. 重复 SN 的在架设备: {duplicate_active_sn.count()} 组'))
        for row in duplicate_active_sn[:20]:
            self.stdout.write(f'  - SN={row["sn"]} 重复数量={row["device_count"]}')

        self.stdout.write('')
        self.stdout.write(self.style.HTTP_INFO(f'3. 状态为已上架但未关联事件的仓库设备: {inconsistent_warehouse.count()} 条'))
        for device in inconsistent_warehouse[:20]:
            self.stdout.write(
                f'  - ID={device.id} SN={device.sn} 状态={device.status} 位置={(device.warehouse_location or "-")}'
            )

        total_issues = (
            unlinked_decommissioned.count()
            + duplicate_active_sn.count()
            + inconsistent_warehouse.count()
        )
        self.stdout.write('')
        if total_issues == 0:
            self.stdout.write(self.style.SUCCESS('巡检完成，未发现异常数据。'))
        else:
            self.stdout.write(self.style.WARNING(f'巡检完成，共发现 {total_issues} 项异常，请按上面的分类逐项处理。'))
