# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('common', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='SystemConfig',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(max_length=100, unique=True, verbose_name='配置键')),
                ('value', models.TextField(verbose_name='配置值（JSON格式）')),
                ('category', models.CharField(choices=[('alert_thresholds', '告警阈值'), ('display_settings', '显示配置')], max_length=50, verbose_name='配置分类')),
                ('description', models.TextField(blank=True, null=True, verbose_name='描述')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
            ],
            options={
                'verbose_name': '系统配置',
                'verbose_name_plural': '系统配置',
                'db_table': 'system_config',
                'ordering': ['category', 'key'],
            },
        ),
    ]
