"""
初始化PDU测试数据的管理命令
用于创建测试用的机房、机柜、PDU设备和端口
"""

from django.core.management.base import BaseCommand
from django.utils import timezone
from devices.models import Room, Cabinet, PDUDevice, PDUPort


class Command(BaseCommand):
    help = '初始化PDU测试数据：创建F1D机房、08-01机柜、F1D-PDUA-1设备和Q01端口'

    def handle(self, *args, **options):
        self.stdout.write('开始初始化PDU测试数据...')
        
        # 1. 创建或获取F1D机房（在cheshi数据库中，使用default数据库连接）
        # Room和Cabinet模型存储在cheshi数据库中
        room, created = Room.objects.using('default').get_or_create(
            name='F1D',
            defaults={'name': 'F1D'}
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f'✓ 创建机房: {room.name} (ID: {room.id}) [cheshi数据库]'))
        else:
            self.stdout.write(f'✓ 使用现有机房: {room.name} (ID: {room.id}) [cheshi数据库]')
        
        # 2. 创建测试机柜（08-01，在cheshi数据库中，使用default数据库连接）
        # Cabinet模型存储在cheshi数据库中
        # 使用name和room同时作为查询条件，避免重复
        cabinet, created = Cabinet.objects.using('default').get_or_create(
            name='08-01',
            room=room,
            defaults={
                'name': '08-01',
                'room': room
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f'✓ 创建机柜: {cabinet.name} (ID: {cabinet.id}) [cheshi数据库]'))
        else:
            self.stdout.write(f'✓ 使用现有机柜: {cabinet.name} (ID: {cabinet.id}) [cheshi数据库]')
        
        # 3. 创建PDU设备（F1D-PDUA-1，在PDU数据库中）
        # PDUDevice、PDUPort、CabinetPDUData模型存储在PDU数据库中
        pdu_device, created = PDUDevice.objects.using('pdu').get_or_create(
            device_id='56.F1-D-HTY-PDU-01',
            defaults={
                'device_name': 'F1D-PDUA-1',
                'circuit_type': 'A',
                'room_id': room.id,  # 使用room_id而不是room外键
                'room_name': room.name,  # 冗余字段
                'total_ports': 38,
                'auto_collect_enabled': False,
                'collect_interval': 60,
                'notes': '测试PDU设备'
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f'✓ 创建PDU设备: {pdu_device.device_name} (ID: {pdu_device.device_id}) [PDU数据库]'))
        else:
            self.stdout.write(f'✓ 使用现有PDU设备: {pdu_device.device_name} (ID: {pdu_device.device_id}) [PDU数据库]')
        
        # 4. 创建PDU端口（Q01，关联到08-01机柜，在PDU数据库中）
        # 注意：使用room_id和cabinet_id存储关联关系，避免跨数据库外键约束
        port_identifier = f'{pdu_device.device_name}-Q01'
        pdu_port, created = PDUPort.objects.using('pdu').get_or_create(
            port_identifier=port_identifier,
            defaults={
                'pdu_device': pdu_device,
                'port_number': 'Q01',
                'cabinet_id': cabinet.id,  # 使用cabinet_id而不是cabinet外键
                'cabinet_name': cabinet.name,  # 冗余字段
                'status': 'active',
                'notes': '测试端口，关联到08-01机柜'
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f'✓ 创建PDU端口: {pdu_port.port_identifier} [PDU数据库]'))
        else:
            self.stdout.write(f'✓ 使用现有PDU端口: {pdu_port.port_identifier} [PDU数据库]')
        
        # 输出总结信息
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('=' * 50))
        self.stdout.write(self.style.SUCCESS('PDU测试数据初始化完成！'))
        self.stdout.write(self.style.SUCCESS('=' * 50))
        self.stdout.write(f'机房: {room.name} (ID: {room.id})')
        self.stdout.write(f'机柜: {cabinet.name} (ID: {cabinet.id})')
        self.stdout.write(f'PDU设备: {pdu_device.device_name} (ID: {pdu_device.id})')
        self.stdout.write(f'PDU端口: {pdu_port.port_identifier} (ID: {pdu_port.id})')
        self.stdout.write('')
        self.stdout.write('可以使用以下信息进行API测试：')
        self.stdout.write(f'  - PDU设备ID: {pdu_device.device_id}')
        self.stdout.write(f'  - PDU端口标识: {pdu_port.port_identifier}')
        self.stdout.write(f'  - 机柜ID: {cabinet.id}')

