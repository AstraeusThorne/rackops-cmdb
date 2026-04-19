# 数据迁移：向 system_config 表写入弱电报表默认配置项（缺失则添加）
# 仅在有 system_config 的数据库（通常为 default）上执行，另一库（如 pdu）跳过

from django.db import migrations


def seed_pdu_report_config(apps, schema_editor):
    """仅在 default 库执行：插入弱电报表相关配置键，若已存在则跳过。"""
    db_alias = schema_editor.connection.alias
    if db_alias != 'default':
        return
    SystemConfig = apps.get_model('common', 'SystemConfig')
    defaults = [
        ('pdu_rated_current_per_circuit', '32', '单路额定电流(A)，默认32'),
        ('cabinet_u_capacity', '42', '单机柜总U数，默认42'),
        ('pdu_high_utilization_threshold', '80', '高利用率阈值(%)，默认80'),
        ('pdu_current_warning_threshold', '60', '电流预警阈值(%)，默认60；达到此值未达高利用率时记为电流预警'),
        ('pdu_redundancy_imbalance_ratio', '0.5', 'B路低于A路比例视为不均衡，默认0.5'),
    ]
    for key, value, desc in defaults:
        if not SystemConfig.objects.using(db_alias).filter(key=key).exists():
            SystemConfig.objects.using(db_alias).create(
                key=key,
                value=value,
                category='pdu_report',
                description=desc,
            )


def reverse_seed(apps, schema_editor):
    """仅在 default 库执行：删除本次添加的弱电报表配置。"""
    db_alias = schema_editor.connection.alias
    if db_alias != 'default':
        return
    SystemConfig = apps.get_model('common', 'SystemConfig')
    keys = [
        'pdu_rated_current_per_circuit',
        'cabinet_u_capacity',
        'pdu_high_utilization_threshold',
        'pdu_current_warning_threshold',
        'pdu_redundancy_imbalance_ratio',
    ]
    SystemConfig.objects.using(db_alias).filter(key__in=keys, category='pdu_report').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('common', '0006_cabinet_add_client'),
    ]

    operations = [
        migrations.RunPython(seed_pdu_report_config, reverse_seed),
    ]
