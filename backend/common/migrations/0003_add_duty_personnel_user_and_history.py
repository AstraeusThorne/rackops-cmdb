# Generated manually

from django.conf import settings
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('common', '0002_systemconfig'),
    ]

    operations = [
        # Add fields to DutyPersonnel
        migrations.AddField(
            model_name='dutypersonnel',
            name='account_status',
            field=models.CharField(choices=[('pending', '待审核'), ('approved', '已审核'), ('rejected', '已拒绝')], default='pending', max_length=20, verbose_name='账户状态'),
        ),
        migrations.AddField(
            model_name='dutypersonnel',
            name='approved_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='审核时间'),
        ),
        migrations.AddField(
            model_name='dutypersonnel',
            name='approved_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='approved_duty_personnel', to=settings.AUTH_USER_MODEL, verbose_name='审核人'),
        ),
        migrations.AddField(
            model_name='dutypersonnel',
            name='rejection_reason',
            field=models.TextField(blank=True, null=True, verbose_name='拒绝原因'),
        ),
        migrations.AddField(
            model_name='dutypersonnel',
            name='user',
            field=models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='duty_personnel_profile', to=settings.AUTH_USER_MODEL, verbose_name='关联用户账户'),
        ),
        # Create ModelHistory model
        migrations.CreateModel(
            name='ModelHistory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('content_type', models.CharField(max_length=100, verbose_name='模型类型')),
                ('object_id', models.BigIntegerField(verbose_name='对象ID')),
                ('action', models.CharField(choices=[('create', '创建'), ('update', '更新'), ('delete', '删除')], max_length=20, verbose_name='操作类型')),
                ('is_admin_action', models.BooleanField(default=False, verbose_name='是否管理员操作')),
                ('changed_at', models.DateTimeField(auto_now_add=True, verbose_name='操作时间')),
                ('old_data', models.JSONField(blank=True, null=True, verbose_name='变更前数据')),
                ('new_data', models.JSONField(blank=True, null=True, verbose_name='变更后数据')),
                ('changed_fields', models.JSONField(blank=True, null=True, verbose_name='变更字段列表')),
                ('m2m_changes', models.JSONField(blank=True, null=True, verbose_name='多对多关系变更')),
                ('field_labels', models.JSONField(blank=True, null=True, verbose_name='字段中文名称')),
                ('reason', models.TextField(blank=True, null=True, verbose_name='变更原因')),
                ('reverted', models.BooleanField(default=False, verbose_name='是否已回退')),
                ('reverted_at', models.DateTimeField(blank=True, null=True, verbose_name='回退时间')),
                ('changed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='model_changes', to=settings.AUTH_USER_MODEL, verbose_name='操作者')),
                ('duty_personnel', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='history_records', to='common.dutypersonnel', verbose_name='值班人员')),
                ('reverted_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='reverted_changes', to=settings.AUTH_USER_MODEL, verbose_name='回退操作者')),
            ],
            options={
                'verbose_name': '模型变更历史',
                'verbose_name_plural': '模型变更历史',
                'db_table': 'model_history',
                'ordering': ['-changed_at'],
            },
        ),
        # Create Notification model
        migrations.CreateModel(
            name='Notification',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('notification_type', models.CharField(choices=[('account_approved', '账户审核通过'), ('account_rejected', '账户审核拒绝'), ('account_pending', '账户待审核'), ('system', '系统通知')], max_length=50, verbose_name='消息类型')),
                ('title', models.CharField(max_length=200, verbose_name='标题')),
                ('content', models.TextField(verbose_name='内容')),
                ('is_read', models.BooleanField(default=False, verbose_name='是否已读')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('read_at', models.DateTimeField(blank=True, null=True, verbose_name='阅读时间')),
                ('related_content_type', models.CharField(blank=True, max_length=100, null=True, verbose_name='关联模型类型')),
                ('related_object_id', models.BigIntegerField(blank=True, null=True, verbose_name='关联对象ID')),
                ('recipient', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='notifications', to=settings.AUTH_USER_MODEL, verbose_name='接收者')),
            ],
            options={
                'verbose_name': '站内消息',
                'verbose_name_plural': '站内消息',
                'db_table': 'notification',
                'ordering': ['-created_at'],
            },
        ),
        # Add indexes
        migrations.AddIndex(
            model_name='modelhistory',
            index=models.Index(fields=['content_type', 'object_id'], name='model_hist_content_idx'),
        ),
        migrations.AddIndex(
            model_name='modelhistory',
            index=models.Index(fields=['changed_by', 'changed_at'], name='model_hist_changed_idx'),
        ),
        migrations.AddIndex(
            model_name='modelhistory',
            index=models.Index(fields=['duty_personnel', 'changed_at'], name='model_hist_duty_idx'),
        ),
        migrations.AddIndex(
            model_name='modelhistory',
            index=models.Index(fields=['is_admin_action', 'changed_at'], name='model_hist_admin_idx'),
        ),
        migrations.AddIndex(
            model_name='modelhistory',
            index=models.Index(fields=['reverted'], name='model_hist_revert_idx'),
        ),
        migrations.AddIndex(
            model_name='notification',
            index=models.Index(fields=['recipient', 'is_read'], name='notificatio_recipie_idx'),
        ),
        migrations.AddIndex(
            model_name='notification',
            index=models.Index(fields=['notification_type', 'created_at'], name='notificatio_notific_idx'),
        ),
    ]

