"""
初始化F1D机房机柜的管理命令
根据机柜布局图，将F1D机房的所有机柜添加到数据库
A01 -> F1D-01-01, B01 -> F1D-02-01, 以此类推
"""

from django.core.management.base import BaseCommand
from devices.models import Room, Cabinet


class Command(BaseCommand):
    help = '初始化F1D机房的所有机柜：A01->F1D-01-01, B01->F1D-02-01, 以此类推'

    def handle(self, *args, **options):
        self.stdout.write('开始初始化F1D机房机柜...')
        
        # 1. 获取或创建F1D机房（在cheshi数据库中）
        room, created = Room.objects.using('default').get_or_create(
            name='F1D',
            defaults={'name': 'F1D'}
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f'✓ 创建机房: {room.name} (ID: {room.id}) [cheshi数据库]'))
        else:
            self.stdout.write(f'✓ 使用现有机房: {room.name} (ID: {room.id}) [cheshi数据库]')
        
        # 2. 定义机柜布局
        # 列映射：A->01, B->02, C->03, D->04, E->05, F->06, G->07, H->08
        column_mapping = {
            'A': '01',
            'B': '02',
            'C': '03',
            'D': '04',
            'E': '05',
            'F': '06',
            'G': '07',
            'H': '08'
        }
        
        # 根据图片描述，定义哪些机柜存在（跳过用/表示的空位置）
        # 从描述看，大部分机柜都存在，只有部分位置是空的
        # C15, C16, C17, F15, F16, F17, G17, H17 是空的
        empty_cabinets = {
            'C15', 'C16', 'C17',
            'F15', 'F16', 'F17',
            'G17', 'H17'
        }
        
        # 生成所有机柜标识
        created_count = 0
        existing_count = 0
        skipped_count = 0
        
        for column_letter in 'ABCDEFGH':
            column_num = column_mapping[column_letter]
            
            # 每列最多到17号（根据图片描述）
            max_row = 17 if column_letter in ['D', 'E'] else 16
            
            for row_num in range(1, max_row + 1):
                # 构建机柜标识（如 A01）
                cabinet_id = f"{column_letter}{row_num:02d}"
                
                # 检查是否为空位置
                if cabinet_id in empty_cabinets:
                    skipped_count += 1
                    continue
                
                # 构建机柜名称（如 F1D-01-01）
                cabinet_name = f"F1D-{column_num}-{row_num:02d}"
                
                # 先检查是否存在新格式的机柜
                existing_cabinet = Cabinet.objects.using('default').filter(
                    name=cabinet_name,
                    room=room
                ).first()
                
                if existing_cabinet:
                    # 新格式已存在
                    existing_count += 1
                    if existing_count <= 5:  # 只显示前5个已存在的
                        self.stdout.write(f'  - 已存在: {cabinet_name} ({cabinet_id})')
                else:
                    # 检查是否存在旧格式的机柜（如 08-01 对应 F1D-08-01）
                    old_format_name = f"{column_num}-{row_num:02d}"
                    old_cabinet = Cabinet.objects.using('default').filter(
                        name=old_format_name,
                        room=room
                    ).first()
                    
                    if old_cabinet:
                        # 如果存在旧格式，更新为新格式
                        old_cabinet.name = cabinet_name
                        old_cabinet.save(using='default')
                        existing_count += 1
                        self.stdout.write(self.style.SUCCESS(f'✓ 更新机柜名称: {old_format_name} -> {cabinet_name} ({cabinet_id})'))
                    else:
                        # 创建新机柜（在cheshi数据库中）
                        cabinet = Cabinet.objects.using('default').create(
                            name=cabinet_name,
                            room=room
                        )
                        created_count += 1
                        self.stdout.write(self.style.SUCCESS(f'✓ 创建机柜: {cabinet_name} ({cabinet_id})'))
        
        # 输出总结
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('=' * 60))
        self.stdout.write(self.style.SUCCESS('F1D机房机柜初始化完成！'))
        self.stdout.write(self.style.SUCCESS('=' * 60))
        self.stdout.write(f'机房: {room.name} (ID: {room.id})')
        self.stdout.write(f'新建机柜: {created_count} 个')
        self.stdout.write(f'已有机柜: {existing_count} 个')
        self.stdout.write(f'跳过空位: {skipped_count} 个')
        self.stdout.write(f'总计: {created_count + existing_count} 个机柜')
        self.stdout.write('')

