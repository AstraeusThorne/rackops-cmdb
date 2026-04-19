# Generated manually to merge 0002_initial and 0003_add_pdu_models
# This merge migration is needed for the pdu database where 0003_add_pdu_models
# is applied independently without going through 0002_initial

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('devices', '0002_initial'),
        ('devices', '0003_add_pdu_models'),
    ]

    operations = [
        # Empty migration - just merges the two branches
    ]

