from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("devices", "0020_remove_decommission_time_from_decommissioneddevice"),
    ]

    operations = [
        migrations.AlterField(
            model_name="decommissioneddevice",
            name="sn",
            field=models.CharField(db_index=True, max_length=100, verbose_name="SN"),
        ),
    ]
