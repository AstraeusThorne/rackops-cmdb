from django.contrib import admin
from .models import Event, EntryPersonnel, EventEntryPersonnel
from devices.models import DeviceAlert

@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ('date', 'start_time', 'end_time', 'completion_status', 'order_number')
    list_filter = ('date', 'completion_status')
    search_fields = ('order_number', 'description')

@admin.register(EntryPersonnel)
class EntryPersonnelAdmin(admin.ModelAdmin):
    list_display = ('name', 'id_card', 'contact_info')
    search_fields = ('name', 'id_card', 'contact_info')

@admin.register(EventEntryPersonnel)
class EventEntryPersonnelAdmin(admin.ModelAdmin):
    list_display = ('event', 'entry_personnel')
    list_filter = ('event',)

@admin.register(DeviceAlert)
class DeviceAlertAdmin(admin.ModelAdmin):
    list_display = ('title', 'level', 'status', 'discovered_at', 'duty_personnel', 'get_device_info')
    list_filter = ('level', 'status')
    search_fields = ('title', 'description')
    date_hierarchy = 'discovered_at'
    
    def get_device_info(self, obj):
        if obj.device:
            return f"{obj.device.brand} {obj.device.model} (SN: {obj.device.sn})"
        return "-"
    get_device_info.short_description = '关联设备'
