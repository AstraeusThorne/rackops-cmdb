# 下架时间从关联事件获取，删除冗余数据列以统一逻辑

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("devices", "0019_add_indexes_for_performance"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="decommissioneddevice",
            name="decommission_time",
        ),
    ]
