from rest_framework import serializers
from .models import (
    Event, EntryPersonnel, EventEntryPersonnel, EventDevice, 
    EventDecommissionedDevice, EventWarehouseDevice, OperationStoryImport
)
from common.serializers import ClientSerializer, ClientMinimalSerializer, AuthorizedOrgSerializer, DutyPersonnelSerializer
from devices.serializers import RoomSerializer, DeviceSerializer


class EventSummarySerializer(serializers.ModelSerializer):
    """事件摘要序列化器，用于列表和关联事件嵌套，仅包含展示所需字段"""

    clients = ClientMinimalSerializer(many=True, read_only=True)
    authorized_orgs = AuthorizedOrgSerializer(many=True, read_only=True)
    rooms = RoomSerializer(many=True, read_only=True)

    class Meta:
        model = Event
        fields = [
            'id', 'order_number', 'date', 'start_time', 'end_time',
            'description', 'completion_status', 'clients', 'authorized_orgs', 'rooms'
        ]
        read_only_fields = fields


class EntryPersonnelSerializer(serializers.ModelSerializer):
    # 添加关联事件信息
    event_info = serializers.SerializerMethodField()
    
    class Meta:
        model = EntryPersonnel
        fields = '__all__'
    
    def get_event_info(self, obj):
        """获取关联的事件信息（包含客户信息）"""
        from common.serializers import ClientSerializer
        event_entries = EventEntryPersonnel.objects.filter(entry_personnel=obj).select_related('event').prefetch_related('event__clients')
        events_data = []
        for entry in event_entries:
            event = entry.event
            # 获取事件的客户信息
            clients_data = []
            for client in event.clients.all():
                clients_data.append({
                    'id': client.id,
                    'name': client.name
                })
            events_data.append({
                'id': event.id,
                'order_number': event.order_number,
                'date': event.date,
                'start_time': event.start_time,
                'end_time': event.end_time,
                'description': event.description,
                'completion_status': event.completion_status,
                'clients': clients_data,  # 包含客户信息
            })
        return events_data

    def create(self, validated_data):
        """
        按身份证号复用已有记录，避免同一人员被重复创建（如重复提交、表单重复行）。
        若已存在则更新姓名、联系方式后返回该条记录；不存在则新建。
        （id_card 未设 DB 唯一约束，故用 filter().first() 避免 MultipleObjectsReturned）
        """
        id_card = (validated_data.get('id_card') or '').strip().upper()
        name = (validated_data.get('name') or '').strip()
        contact_info = (validated_data.get('contact_info') or '').strip()
        instance = EntryPersonnel.objects.filter(id_card=id_card).first()
        if instance:
            if instance.name != name or instance.contact_info != contact_info:
                instance.name = name
                instance.contact_info = contact_info
                instance.save(update_fields=['name', 'contact_info'])
            return instance
        return EntryPersonnel.objects.create(
            id_card=id_card, name=name, contact_info=contact_info
        )


class EventSerializer(serializers.ModelSerializer):
    # 嵌套序列化多对多关系字段，用于读取时返回完整对象信息
    clients = ClientSerializer(many=True, read_only=True)
    rooms = RoomSerializer(many=True, read_only=True)
    authorized_orgs = AuthorizedOrgSerializer(many=True, read_only=True)
    duty_personnel = DutyPersonnelSerializer(many=True, read_only=True)
    entry_personnel = EntryPersonnelSerializer(many=True, read_only=True)
    devices = DeviceSerializer(many=True, read_only=True)
    
    # 用于写入时接收ID列表
    client_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False
    )
    room_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False
    )
    authorized_org_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False
    )
    duty_personnel_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False
    )
    entry_personnel_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False
    )
    device_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False
    )

    class Meta:
        model = Event
        fields = '__all__'
        
    def create(self, validated_data):
        # 提取多对多关系的ID列表
        client_ids = validated_data.pop('client_ids', [])
        room_ids = validated_data.pop('room_ids', [])
        authorized_org_ids = validated_data.pop('authorized_org_ids', [])
        duty_personnel_ids = validated_data.pop('duty_personnel_ids', [])
        entry_personnel_ids = validated_data.pop('entry_personnel_ids', [])
        device_ids = validated_data.pop('device_ids', [])
        
        # 创建事件实例
        event = Event.objects.create(**validated_data)
        
        # 设置多对多关系
        if client_ids:
            event.clients.set(client_ids)
        if room_ids:
            event.rooms.set(room_ids)
        if authorized_org_ids:
            event.authorized_orgs.set(authorized_org_ids)
        if duty_personnel_ids:
            event.duty_personnel.set(duty_personnel_ids)
        if entry_personnel_ids:
            event.entry_personnel.set(entry_personnel_ids)
        if device_ids:
            event.devices.set(device_ids)
            
        return event
        
    def update(self, instance, validated_data):
        # 提取多对多关系的ID列表
        client_ids = validated_data.pop('client_ids', None)
        room_ids = validated_data.pop('room_ids', None)
        authorized_org_ids = validated_data.pop('authorized_org_ids', None)
        duty_personnel_ids = validated_data.pop('duty_personnel_ids', None)
        entry_personnel_ids = validated_data.pop('entry_personnel_ids', None)
        device_ids = validated_data.pop('device_ids', None)
        
        # 更新基本字段
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # 更新多对多关系
        if client_ids is not None:
            instance.clients.set(client_ids)
        if room_ids is not None:
            instance.rooms.set(room_ids)
        if authorized_org_ids is not None:
            instance.authorized_orgs.set(authorized_org_ids)
        if duty_personnel_ids is not None:
            instance.duty_personnel.set(duty_personnel_ids)
        if entry_personnel_ids is not None:
            instance.entry_personnel.set(entry_personnel_ids)
        if device_ids is not None:
            instance.devices.set(device_ids)
            
        return instance


class EventEntryPersonnelSerializer(serializers.ModelSerializer):
    event_date = serializers.CharField(source='event.date', read_only=True)
    personnel_name = serializers.CharField(source='entry_personnel.name', read_only=True)

    class Meta:
        model = EventEntryPersonnel
        fields = '__all__'


class EventEntryPersonnelListSerializer(serializers.ModelSerializer):
    """
    进场记录列表序列化器：每条记录为「某人在某次事件进场」一条，用于进场人员页面按条展示。
    包含人员信息及该次事件信息。
    """
    event_date = serializers.CharField(source='event.date', read_only=True)
    personnel_name = serializers.CharField(source='entry_personnel.name', read_only=True)
    # 人员信息（同一条人员可对应多条进场记录）
    person = serializers.SerializerMethodField()
    # 该次进场对应的事件信息（含客户）
    event_info = serializers.SerializerMethodField()

    class Meta:
        model = EventEntryPersonnel
        fields = '__all__'

    def get_person(self, obj):
        p = obj.entry_personnel
        if not p:
            return None
        return {
            'id': p.id,
            'name': p.name,
            'id_card': p.id_card,
            'contact_info': getattr(p, 'contact_info', ''),
        }

    def get_event_info(self, obj):
        event = obj.event
        if not event:
            return None
        clients_data = []
        for c in event.clients.all():
            clients_data.append({'id': c.id, 'name': c.name})
        return {
            'id': event.id,
            'order_number': event.order_number,
            'date': event.date,
            'start_time': event.start_time,
            'end_time': event.end_time,
            'description': event.description or '',
            'clients': clients_data,
        }


class EventDeviceSerializer(serializers.ModelSerializer):
    event_date = serializers.CharField(source='event.date', read_only=True)
    device_name = serializers.SerializerMethodField()

    class Meta:
        model = EventDevice
        fields = '__all__'
    
    def get_device_name(self, obj):
        """获取设备名称（品牌 + 型号）"""
        if obj.device:
            return f"{obj.device.brand} {obj.device.model}"
        return None


class EventDecommissionedDeviceSerializer(serializers.ModelSerializer):
    event_date = serializers.CharField(source='event.date', read_only=True)
    device_name = serializers.SerializerMethodField()

    class Meta:
        model = EventDecommissionedDevice
        fields = '__all__'
    
    def get_device_name(self, obj):
        """获取下架设备名称（品牌 + 型号）"""
        if obj.decommissioned_device:
            return f"{obj.decommissioned_device.brand} {obj.decommissioned_device.model}"
        return None


class EventWarehouseDeviceSerializer(serializers.ModelSerializer):
    """事件仓库设备关联序列化器"""
    event_date = serializers.CharField(source='event.date', read_only=True)
    device_name = serializers.CharField(source='warehouse_device.__str__', read_only=True)

    class Meta:
        model = EventWarehouseDevice
        fields = '__all__'


# ========== Excel运维故事导入相关序列化器 ==========

class OperationStoryImportSerializer(serializers.Serializer):
    """运维故事导入参数序列化器"""
    preview = serializers.BooleanField(default=False, help_text='预览模式：只解析数据，不写入数据库')
    incremental = serializers.BooleanField(default=False, help_text='增量导入模式：跳过已存在的订单号')
    batch_id = serializers.CharField(required=False, allow_blank=True, help_text='批次ID：用于标识本次导入')
    max_rows = serializers.IntegerField(required=False, allow_null=True, help_text='最大处理行数（用于测试）')
    personnel_sheet = serializers.CharField(default='人员进出', help_text='人员进出表Sheet名称')
    device_sheet = serializers.CharField(default='上架/下架汇总', help_text='设备上下架表Sheet名称')


class ImportPreviewSerializer(serializers.Serializer):
    """导入预览结果序列化器"""
    batch_id = serializers.CharField(help_text='批次ID')
    timestamp = serializers.DateTimeField(help_text='预览时间')
    summary = serializers.DictField(help_text='预览摘要')
    events = serializers.ListField(help_text='事件列表')
    devices = serializers.ListField(help_text='设备列表')


class ImportResultSerializer(serializers.Serializer):
    """导入结果序列化器"""
    batch_id = serializers.CharField(help_text='批次ID')
    success = serializers.BooleanField(help_text='是否成功')
    message = serializers.CharField(help_text='结果消息')
    summary = serializers.DictField(help_text='导入摘要')
    errors = serializers.ListField(required=False, help_text='错误列表')


class OperationStoryImportHistorySerializer(serializers.ModelSerializer):
    """运维故事导入历史记录序列化器"""
    imported_by_username = serializers.CharField(source='imported_by.username', read_only=True)
    rolled_back_by_username = serializers.CharField(source='rolled_back_by.username', read_only=True)
    
    class Meta:
        model = OperationStoryImport
        fields = '__all__'
        read_only_fields = ['import_time', 'rolled_back_at']