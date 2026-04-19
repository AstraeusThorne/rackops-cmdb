"""
更新F1D机房机柜名称的管理命令
将F1D-01-01格式改为01-01格式（去掉机房前缀）
"""

from django.core.management.base import BaseCommand
from devices.models import Room, Cabinet, PDUPort


class Command(BaseCommand):
    help = '更新F1D机房机柜名称：将F1D-XX-YY格式改为XX-YY格式'

    def handle(self, *args, **options):
        self.stdout.write('开始更新F1D机房机柜名称...')
        
        # 1. 获取F1D机房
        try:
            room = Room.objects.using('default').get(name='F1D')
        except Room.DoesNotExist:
            self.stdout.write(self.style.ERROR('✗ F1D机房不存在'))
            return
        
        self.stdout.write(f'✓ 找到机房: {room.name} (ID: {room.id})')
        
        # 2. 查找所有带前缀的F1D机柜
        cabinets = Cabinet.objects.using('default').filter(
            room=room,
            name__startswith='F1D-'
        ).order_by('name')
        
        total_count = cabinets.count()
        self.stdout.write(f'找到 {total_count} 个需要更新的机柜')
        self.stdout.write('')
        
        if total_count == 0:
            self.stdout.write('没有需要更新的机柜')
            return
        
        updated_count = 0
        error_count = 0
        
        # 3. 批量更新机柜名称
        for cabinet in cabinets:
            old_name = cabinet.name
            
            # 提取新名称（去掉F1D-前缀）
            if old_name.startswith('F1D-'):
                new_name = old_name[4:]  # 去掉"F1D-"前缀
            else:
                self.stdout.write(f'  ⚠ 跳过: {old_name} (格式不符合)')
                continue
            
            # 检查新名称是否已存在
            existing = Cabinet.objects.using('default').filter(
                name=new_name,
                room=room
            ).exclude(id=cabinet.id).first()
            
            if existing:
                self.stdout.write(self.style.WARNING(f'  ⚠ 跳过: {old_name} -> {new_name} (新名称已存在，ID: {existing.id})'))
                error_count += 1
                continue
            
            try:
                # 更新机柜名称
                cabinet.name = new_name
                cabinet.save(using='default')
                updated_count += 1
                
                # 更新PDU端口关联中的机柜名称（在PDU数据库中）
                PDUPort.objects.using('pdu').filter(
                    cabinet_id=cabinet.id
                ).update(cabinet_name=new_name)
                
                if updated_count <= 10:  # 只显示前10个
                    self.stdout.write(self.style.SUCCESS(f'  ✓ {old_name} -> {new_name}'))
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'  ✗ 更新失败: {old_name} - {str(e)}'))
                error_count += 1
        
        # 输出总结
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('=' * 60))
        self.stdout.write(self.style.SUCCESS('F1D机房机柜名称更新完成！'))
        self.stdout.write(self.style.SUCCESS('=' * 60))
        self.stdout.write(f'总机柜数: {total_count} 个')
        self.stdout.write(f'成功更新: {updated_count} 个')
        self.stdout.write(f'更新失败: {error_count} 个')
        self.stdout.write('')
        
        # 验证更新结果
        remaining = Cabinet.objects.using('default').filter(
            room=room,
            name__startswith='F1D-'
        ).count()
        
        if remaining > 0:
            self.stdout.write(self.style.WARNING(f'⚠ 仍有 {remaining} 个机柜使用旧格式'))
        else:
            self.stdout.write(self.style.SUCCESS('✓ 所有机柜已更新为新格式'))

