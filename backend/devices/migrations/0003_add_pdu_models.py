# Generated manually for PDU models

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('devices', '0002_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='PDUDevice',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('device_id', models.CharField(db_index=True, help_text='API中的objectId，如: 56.F1-D-HTY-PDU-01', max_length=100, unique=True, verbose_name='PDU设备ID')),
                ('device_name', models.CharField(db_index=True, help_text='如: F1D-PDUA-1, F1D-PDUB-1', max_length=100, unique=True, verbose_name='PDU设备名称')),
                ('circuit_type', models.CharField(choices=[('A', 'A路'), ('B', 'B路')], db_index=True, max_length=10, verbose_name='电路类型')),
                ('total_ports', models.IntegerField(default=0, help_text='该PDU设备管理的端口总数，如: 38', verbose_name='端口总数')),
                ('auto_collect_enabled', models.BooleanField(default=False, verbose_name='启用自动采集')),
                ('collect_interval', models.IntegerField(default=60, verbose_name='采集间隔（分钟）')),
                ('notes', models.TextField(blank=True, null=True, verbose_name='备注')),
                ('room_id', models.BigIntegerField(help_text='关联cheshi数据库中Room表的ID', verbose_name='所在机房ID')),
                ('room_name', models.CharField(blank=True, help_text='冗余字段，便于查询', max_length=100, null=True, verbose_name='机房名称')),
            ],
            options={
                'verbose_name': 'PDU设备',
                'verbose_name_plural': 'PDU设备',
                'db_table': 'pdu_device',
            },
        ),
        migrations.CreateModel(
            name='PDUPort',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('port_number', models.CharField(db_index=True, help_text='如: Q01, Q02, 或 01, 02', max_length=10, verbose_name='端口号')),
                ('port_identifier', models.CharField(db_index=True, help_text='如: F1D-PDUA-1-Q01, F1D-PDUA-1-01', max_length=150, unique=True, verbose_name='端口标识')),
                ('status', models.CharField(choices=[('active', '启用'), ('inactive', '停用'), ('maintenance', '维护中')], default='active', max_length=20, verbose_name='端口状态')),
                ('notes', models.TextField(blank=True, null=True, verbose_name='备注')),
                ('cabinet_id', models.BigIntegerField(blank=True, help_text='关联cheshi数据库中Cabinet表的ID', null=True, verbose_name='关联机柜ID')),
                ('cabinet_name', models.CharField(blank=True, help_text='冗余字段，便于查询', max_length=100, null=True, verbose_name='机柜名称')),
                ('pdu_device', models.ForeignKey(db_index=True, on_delete=django.db.models.deletion.CASCADE, related_name='ports', to='devices.pdudevice', verbose_name='PDU设备')),
            ],
            options={
                'verbose_name': 'PDU端口',
                'verbose_name_plural': 'PDU端口',
                'db_table': 'pdu_port',
                'unique_together': {('pdu_device', 'port_number')},
            },
        ),
        migrations.CreateModel(
            name='CabinetPDUData',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('data_type', models.CharField(choices=[('current', '电流数据'), ('power', '功率数据'), ('energy', '电能数据'), ('thd_current', '电流谐波失真'), ('switch_status', '开关状态')], db_index=True, max_length=20, verbose_name='数据类型')),
                ('value', models.DecimalField(decimal_places=4, max_digits=15, verbose_name='数据值')),
                ('unit', models.CharField(default='A', help_text='如: A(安培), kW(千瓦), kWh(千瓦时), %(百分比), 1(开关状态)', max_length=20, verbose_name='单位')),
                ('timestamp', models.DateTimeField(db_index=True, verbose_name='采集时间')),
                ('source', models.CharField(choices=[('manual_import', '人工导入'), ('api_collect', 'API自动采集')], db_index=True, default='manual_import', max_length=20, verbose_name='数据来源')),
                ('import_batch', models.CharField(blank=True, db_index=True, help_text='Excel导入批次标识，如: 20251128', max_length=100, null=True, verbose_name='导入批次')),
                ('excel_column_structure', models.CharField(blank=True, db_index=True, help_text='如: 08+07列', max_length=50, null=True, verbose_name='Excel列结构')),
                ('excel_row_number', models.IntegerField(blank=True, null=True, verbose_name='Excel行号')),
                ('quality', models.CharField(choices=[('good', '良好'), ('warning', '警告'), ('error', '错误')], default='good', max_length=20, verbose_name='数据质量')),
                ('notes', models.TextField(blank=True, null=True, verbose_name='备注')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('pdu_port', models.ForeignKey(db_index=True, on_delete=django.db.models.deletion.CASCADE, related_name='data', to='devices.pduport', verbose_name='PDU端口')),
            ],
            options={
                'verbose_name': 'PDU数据',
                'verbose_name_plural': 'PDU数据',
                'db_table': 'cabinet_pdu_data',
                'ordering': ['-timestamp'],
                'unique_together': {('pdu_port', 'data_type', 'timestamp', 'source')},
            },
        ),
        migrations.AddIndex(
            model_name='pdudevice',
            index=models.Index(fields=['room_id', 'circuit_type'], name='pdu_device_room_id_circuit_idx'),
        ),
        migrations.AddIndex(
            model_name='pdudevice',
            index=models.Index(fields=['device_name'], name='pdu_device_device_name_idx'),
        ),
        migrations.AddIndex(
            model_name='pduport',
            index=models.Index(fields=['pdu_device', 'port_number'], name='pdu_port_pdu_device_port_idx'),
        ),
        migrations.AddIndex(
            model_name='pduport',
            index=models.Index(fields=['port_identifier'], name='pdu_port_port_identifier_idx'),
        ),
        migrations.AddIndex(
            model_name='pduport',
            index=models.Index(fields=['cabinet_id'], name='pdu_port_cabinet_id_idx'),
        ),
        migrations.AddIndex(
            model_name='cabinetpdudata',
            index=models.Index(fields=['pdu_port', 'timestamp'], name='cabinet_pdu_data_pdu_port_timestamp_idx'),
        ),
        migrations.AddIndex(
            model_name='cabinetpdudata',
            index=models.Index(fields=['pdu_port', 'data_type', 'timestamp'], name='cabinet_pdu_data_pdu_port_data_type_timestamp_idx'),
        ),
        migrations.AddIndex(
            model_name='cabinetpdudata',
            index=models.Index(fields=['import_batch', 'timestamp'], name='cabinet_pdu_data_import_batch_timestamp_idx'),
        ),
        migrations.AddIndex(
            model_name='cabinetpdudata',
            index=models.Index(fields=['timestamp', 'data_type'], name='cabinet_pdu_data_timestamp_data_type_idx'),
        ),
        migrations.AddIndex(
            model_name='cabinetpdudata',
            index=models.Index(fields=['source', 'timestamp'], name='cabinet_pdu_data_source_timestamp_idx'),
        ),
    ]

