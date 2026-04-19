from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import User


@receiver(post_save, sender=User)
def sync_duty_personnel_name(sender, instance, **kwargs):
    """同步更新 DutyPersonnel.name 当 User.username 变更时"""
    if hasattr(instance, 'duty_personnel_profile'):
        duty_personnel = instance.duty_personnel_profile
        if duty_personnel.name != instance.username:
            duty_personnel.name = instance.username
            duty_personnel.save(update_fields=['name'])

