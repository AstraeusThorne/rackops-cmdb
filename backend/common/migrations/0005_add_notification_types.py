# Generated manually
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('common', '0004_sync_client_authorized_person'),
    ]

    operations = [
        migrations.AlterField(
            model_name='notification',
            name='notification_type',
            field=models.CharField(
                choices=[
                    ('account_approved', '账户审核通过'),
                    ('account_rejected', '账户审核拒绝'),
                    ('account_pending', '账户待审核'),
                    ('new_event', '新增事件'),
                    ('new_alert', '新增告警'),
                    ('system', '系统通知'),
                ],
                max_length=50,
                verbose_name='消息类型'
            ),
        ),
    ]

