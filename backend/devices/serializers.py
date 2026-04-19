from rest_framework import serializers
from django.db.models import Count
from .models import Room, Cabinet, Device, DecommissionedDevice, DeviceAlert, PDUDevice, PDUPort, CabinetPDUData, WarehouseDevice, WarehouseDeviceHistory
from common.serializers import EventRelatedFieldsMixin


class RoomSerializer(serializers.ModelSerializer):
    # 添加机柜数量（通过 related_name='cabinets' 计算）
    cabinet_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Room
        fields = '__all__'
    
    def get_cabinet_count(self, obj):
        """获取机房的机柜数量"""
        # 如果对象已经有cabinet_count属性（通过annotate添加），直接使用
        if hasattr(obj, 'cabinet_count'):
            return obj.cabinet_count
        # 否则通过related manager查询
        if hasattr(obj, 'cabinets'):
            return obj.cabinets.count()
        return 0


class CabinetSerializer(serializers.ModelSerializer):
    room_name = serializers.CharField(source='room.name', read_only=True)
    client_name = serializers.SerializerMethodField()

    class Meta:
        model = Cabinet
        fields = '__all__'

    def get_client_name(self, obj):
        """所属客户名称，无客户时返回空字符串"""
        return obj.client.name if obj.client else ''


class CabinetRoomListSerializer(serializers.ModelSerializer):
    """机房页用机柜列表序列化器，含 device_count（由 view 层 annotate 注入）"""

    room_name = serializers.CharField(source='room.name', read_only=True)
    client_name = serializers.SerializerMethodField()
    device_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Cabinet
        fields = ('id', 'name', 'room', 'room_name', 'client', 'client_name', 'device_count')

    def get_client_name(self, obj):
        return obj.client.name if obj.client else ''


class DeviceSerializer(EventRelatedFieldsMixin, serializers.ModelSerializer):
    cabinet_name = serializers.CharField(source='cabinet.name', read_only=True)
    room_name = serializers.CharField(source='cabinet.room.name', read_only=True)
    # 编辑时表单需要机房 ID（机柜所属机房），用于回填机房/机柜下拉
    room = serializers.SerializerMethodField()

    # 添加事件相关的客户和授权单位信息
    client_authorized_person = serializers.SerializerMethodField()
    authorized_org_name = serializers.SerializerMethodField()

    # 确保 events 字段返回事件ID列表（多对多关系默认返回主键列表）
    events = serializers.PrimaryKeyRelatedField(many=True, read_only=True)

    def get_room(self, obj):
        """返回机柜所属机房 ID，供前端编辑表单回填"""
        return obj.cabinet.room_id if obj.cabinet else None

    class Meta:
        model = Device
        fields = (
            'id', 'brand', 'model', 'sn', 'u_size', 'rack_position',
            'power_type', 'power_wattage', 'device_type', 'cabinet', 'events',
            'cabinet_name', 'room_name', 'room',
            'client_authorized_person', 'authorized_org_name'
        )


class DeviceListSerializer(DeviceSerializer):
    """设备列表序列化器，含 event_details 便于在用设备页直接渲染"""

    event_details = serializers.SerializerMethodField()

    class Meta(DeviceSerializer.Meta):
        fields = (
            'id', 'brand', 'model', 'sn', 'u_size', 'rack_position',
            'power_type', 'power_wattage', 'device_type', 'cabinet',
            'events', 'cabinet_name', 'room_name', 'room',
            'client_authorized_person', 'authorized_org_name', 'event_details'
        )

    def get_event_details(self, obj):
        """返回关联事件摘要列表，供在用设备页表格直接使用"""
        from events.serializers import EventSummarySerializer
        events = obj.events.all()
        return EventSummarySerializer(events, many=True).data


class DecommissionedDeviceSerializer(EventRelatedFieldsMixin, serializers.ModelSerializer):
    # 添加事件相关的客户和授权单位信息
    client_authorized_person = serializers.SerializerMethodField()
    authorized_org_name = serializers.SerializerMethodField()
    # 添加关联事件摘要
    related_events = serializers.SerializerMethodField()
    # 添加机房信息
    room_name = serializers.SerializerMethodField()
    # 添加机柜信息
    cabinet_name = serializers.SerializerMethodField()
    # 下架时间从关联事件获取（只读）
    decommission_time = serializers.SerializerMethodField()
    # 确保 events 字段返回事件ID列表（多对多关系默认返回主键列表）
    events = serializers.PrimaryKeyRelatedField(many=True, read_only=True)

    class Meta:
        model = DecommissionedDevice
        fields = (
            'id', 'sn', 'brand', 'model', 'u_size', 'rack_position', 'power_type',
            'cabinet', 'decommission_reason', 'status', 'events',
            'client_authorized_person', 'authorized_org_name', 'related_events',
            'room_name', 'cabinet_name', 'decommission_time',
        )

    def get_decommission_time(self, obj):
        dt = obj.decommission_time
        return dt.isoformat() if dt else None
    
    def get_related_events(self, obj):
        """获取关联事件摘要（使用 EventSummarySerializer）"""
        from events.serializers import EventSummarySerializer
        events = obj.events.all()
        return EventSummarySerializer(events, many=True).data
    
    def get_room_name(self, obj):
        """从关联事件中获取机房名称，如果设备有机柜则从机柜获取"""
        # 优先从机柜获取机房信息
        if obj.cabinet and obj.cabinet.room:
            return obj.cabinet.room.name
        # 如果没有机柜信息，从关联事件中获取
        events = obj.events.all().order_by('-date', '-start_time')
        if events.exists():
            latest_event = events.first()
            # 从事件的rooms中获取第一个机房
            rooms = latest_event.rooms.all()
            if rooms.exists():
                return rooms.first().name
        return None
    
    def get_cabinet_name(self, obj):
        """获取机柜名称"""
        if obj.cabinet:
            return obj.cabinet.name
        return None


class DeviceAlertSerializer(serializers.ModelSerializer):
    device_info = serializers.SerializerMethodField()
    device_brand = serializers.CharField(source='device.brand', read_only=True)
    device_model = serializers.CharField(source='device.model', read_only=True)
    device_sn = serializers.CharField(source='device.sn', read_only=True)

    class Meta:
        model = DeviceAlert
        fields = '__all__'
    
    def get_device_info(self, obj):
        """获取设备完整信息"""
        if obj.device:
            return f"{obj.device.brand} {obj.device.model} (SN: {obj.device.sn})"
        return None


class PDUDeviceSerializer(serializers.ModelSerializer):
    """PDU设备序列化器"""
    # room_name已经是模型字段，不需要source
    
    class Meta:
        model = PDUDevice
        fields = '__all__'


class PDUPortSerializer(serializers.ModelSerializer):
    """PDU端口序列化器"""
    pdu_device_name = serializers.CharField(source='pdu_device.device_name', read_only=True)
    # cabinet_name已经是模型字段，不需要source
    
    class Meta:
        model = PDUPort
        fields = '__all__'


class CabinetPDUDataSerializer(serializers.ModelSerializer):
    """PDU数据序列化器"""
    pdu_port_identifier = serializers.CharField(source='pdu_port.port_identifier', read_only=True)
    pdu_device_name = serializers.CharField(source='pdu_port.pdu_device.device_name', read_only=True)
    cabinet_name = serializers.CharField(source='pdu_port.cabinet_name', read_only=True, allow_null=True)
    
    class Meta:
        model = CabinetPDUData
        fields = '__all__'


class WarehouseDeviceHistorySerializer(serializers.ModelSerializer):
    """仓库设备历史记录序列化器"""
    warehouse_device_name = serializers.CharField(source='warehouse_device.__str__', read_only=True)
    cabinet_name = serializers.CharField(source='cabinet.name', read_only=True, allow_null=True)
    event_date = serializers.CharField(source='event.date', read_only=True, allow_null=True)
    
    class Meta:
        model = WarehouseDeviceHistory
        fields = '__all__'


class WarehouseDeviceSerializer(EventRelatedFieldsMixin, serializers.ModelSerializer):
    """仓库设备序列化器"""
    client_authorized_person = serializers.SerializerMethodField()
    authorized_org_name = serializers.SerializerMethodField()
    # 添加历史记录
    history_records = serializers.SerializerMethodField()
    # 添加关联事件摘要
    related_events = serializers.SerializerMethodField()
    
    class Meta:
        model = WarehouseDevice
        fields = '__all__'
    
    def get_history_records(self, obj):
        """获取最近的历史记录"""
        records = obj.history_records.all()[:10]  # 最近10条
        return WarehouseDeviceHistorySerializer(records, many=True).data
    
    def get_related_events(self, obj):
        """获取关联事件摘要（使用 EventSummarySerializer）"""
        from events.serializers import EventSummarySerializer
        events = obj.events.all()
        return EventSummarySerializer(events, many=True).data