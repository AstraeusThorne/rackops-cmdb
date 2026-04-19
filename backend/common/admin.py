from django.contrib import admin
from .models import Client, AuthorizedOrg, DutyPersonnel

@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ['name', 'authorized_person']
    search_fields = ['name', 'authorized_person']

@admin.register(AuthorizedOrg)
class AuthorizedOrgAdmin(admin.ModelAdmin):
    list_display = ['name']
    search_fields = ['name']

@admin.register(DutyPersonnel)
class DutyPersonnelAdmin(admin.ModelAdmin):
    list_display = ['employee_id', 'name', 'phone', 'type']
    search_fields = ['employee_id', 'name', 'phone', 'type']
    list_filter = ['type']
