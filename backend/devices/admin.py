from django.contrib import admin
from .models import Device, Room, Cabinet, DecommissionedDevice

@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ('name',)
    search_fields = ('name',)

@admin.register(Cabinet)
class CabinetAdmin(admin.ModelAdmin):
    list_display = ('name', 'room')
    list_filter = ('room',)
    search_fields = ('name',)

@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display = ('brand', 'model', 'sn', 'device_type', 'power_wattage', 'cabinet')
    list_filter = ('brand', 'device_type', 'cabinet')
    search_fields = ('brand', 'model', 'sn')

@admin.register(DecommissionedDevice)
class DecommissionedDeviceAdmin(admin.ModelAdmin):
    list_display = ['sn', 'brand', 'model', 'status', 'get_decommission_time_display']
    list_filter = ['status']
    search_fields = ['sn', 'brand', 'model']

    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related('events')

    def get_decommission_time_display(self, obj):
        """下架时间来自关联事件"""
        dt = obj.decommission_time
        return dt.strftime('%Y-%m-%d %H:%M') if dt else '-'

    get_decommission_time_display.short_description = '下架时间'
