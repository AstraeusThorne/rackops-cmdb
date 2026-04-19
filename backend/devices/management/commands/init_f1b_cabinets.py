"""
初始化F1B机房机柜的管理命令
创建F1B-02-01至F1B-02-08共8个机柜
"""

from django.core.management.base import BaseCommand
from devices.models import Room, Cabinet


class Command(BaseCommand):
    help = '初始化F1B机房的8个机柜：F1B-02-01至F1B-02-08'

    def handle(self, *args, **options):
        self.stdout.write('开始初始化F1B机房机柜...')
        
        # 1. 获取或创建F1B机房（在cheshi数据库中）
        room, created = Room.objects.using('default').get_or_create(
            name='F1B',
            defaults={'name': 'F1B'}
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f'✓ 创建机房: {room.name} (ID: {room.id}) [cheshi数据库]'))
        else:
            self.stdout.write(f'✓ 使用现有机房: {room.name} (ID: {room.id}) [cheshi数据库]')
        
        # 2. 创建8个机柜（F1B-02-01至F1B-02-08）
        created_count = 0
        existing_count = 0
        
        for i in range(1, 9):
            # 机柜名称格式：02-01, 02-02等（不带机房前缀，通过room外键区分）
            cabinet_name = f'02-{i:02d}'
            
            # 创建或获取机柜（在cheshi数据库中）
            cabinet, created = Cabinet.objects.using('default').get_or_create(
                name=cabinet_name,
                room=room,
                defaults={
                    'name': cabinet_name,
                    'room': room
                }
            )
            
            if created:
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f'✓ 创建机柜: {cabinet_name} (ID: {cabinet.id})'))
            else:
                existing_count += 1
                self.stdout.write(f'  - 已存在: {cabinet_name} (ID: {cabinet.id})')
        
        # 输出总结
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('=' * 60))
        self.stdout.write(self.style.SUCCESS('F1B机房机柜初始化完成！'))
        self.stdout.write(self.style.SUCCESS('=' * 60))
        self.stdout.write(f'机房: {room.name} (ID: {room.id})')
        self.stdout.write(f'新建机柜: {created_count} 个')
        self.stdout.write(f'已有机柜: {existing_count} 个')
        self.stdout.write(f'总计: {created_count + existing_count} 个机柜')
        self.stdout.write('')

