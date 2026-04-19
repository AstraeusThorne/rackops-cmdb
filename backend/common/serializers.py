from rest_framework import serializers
from .models import Client, AuthorizedOrg, DutyPersonnel, SystemConfig, ModelHistory, Notification


class ClientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = '__all__'


class ClientMinimalSerializer(serializers.ModelSerializer):
    """客户简版序列化器，用于事件摘要等嵌套场景"""

    class Meta:
        model = Client
        fields = ['id', 'name', 'authorized_person']


class AuthorizedOrgSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuthorizedOrg
        fields = '__all__'


class DutyPersonnelSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    user_username = serializers.CharField(source='user.username', read_only=True)
    approved_by_username = serializers.CharField(source='approved_by.username', read_only=True)
    account_status_display = serializers.CharField(source='get_account_status_display', read_only=True)
    
    class Meta:
        model = DutyPersonnel
        fields = '__all__'
        read_only_fields = ['user', 'approved_by', 'approved_at']


class DutyPersonnelRegistrationSerializer(serializers.Serializer):
    """值班人员注册序列化器"""
    employee_id = serializers.CharField(max_length=50)
    name = serializers.CharField(max_length=100)
    id_card = serializers.CharField(max_length=18)
    phone = serializers.CharField(max_length=20)
    type = serializers.CharField(max_length=50)
    password = serializers.CharField(write_only=True, min_length=6)
    email = serializers.EmailField(required=False, allow_blank=True)
    
    def validate_email(self, value):
        """邮箱非必填，但如果提供则必须唯一"""
        if value:
            from users.models import User
            if User.objects.filter(email=value).exists():
                raise serializers.ValidationError("该邮箱已被使用")
        return value
    
    def validate_id_card(self, value):
        """验证身份证号唯一性"""
        if DutyPersonnel.objects.filter(id_card=value).exists():
            raise serializers.ValidationError("该身份证号已被注册")
        return value
    
    def create(self, validated_data):
        """创建用户和值班人员记录"""
        from users.models import User
        from django.utils import timezone
        
        password = validated_data.pop('password')
        email = validated_data.pop('email', None)
        
        # 创建用户账户（待审核状态）
        username = validated_data['name']  # 使用姓名作为用户名
        user = User.objects.create_user(
            username=username,
            email=email or f"{username}@temp.com",  # 如果没有邮箱，使用临时邮箱
            password=password,
            is_active=False  # 待审核
        )
        
        # 创建值班人员记录
        duty_personnel = DutyPersonnel.objects.create(
            user=user,
            account_status='pending',
            **validated_data
        )
        
        return duty_personnel


class EventRelatedFieldsMixin:
    """事件相关字段的混入类，提供通用的事件关联字段方法"""
    
    def get_client_authorized_person(self, obj):
        """通过事件获取客户授权人"""
        event = obj.events.first()
        if event and event.clients.first():
            return event.clients.first().authorized_person
        return None

    def get_authorized_org_name(self, obj):
        """通过事件获取授权单位名称"""
        event = obj.events.first()
        if event and event.authorized_orgs.first():
            return event.authorized_orgs.first().name
        return None


class SystemConfigSerializer(serializers.ModelSerializer):
    """系统配置序列化器"""
    parsed_value = serializers.SerializerMethodField()

    class Meta:
        model = SystemConfig
        fields = ['id', 'key', 'value', 'parsed_value', 'category', 'description', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_parsed_value(self, obj):
        """返回解析后的JSON值"""
        return obj.get_value()

    def validate_value(self, value):
        """验证JSON格式"""
        import json
        try:
            if isinstance(value, str):
                json.loads(value)
        except json.JSONDecodeError:
            raise serializers.ValidationError("配置值必须是有效的JSON格式")
        return value

    def create(self, validated_data):
        """创建配置时，如果value是dict/list，自动转换为JSON字符串"""
        value = validated_data.get('value')
        if isinstance(value, (dict, list)):
            import json
            validated_data['value'] = json.dumps(value, ensure_ascii=False)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        """更新配置时，如果value是dict/list，自动转换为JSON字符串"""
        value = validated_data.get('value', instance.value)
        if isinstance(value, (dict, list)):
            import json
            validated_data['value'] = json.dumps(value, ensure_ascii=False)
        return super().update(instance, validated_data)


class ModelHistorySerializer(serializers.ModelSerializer):
    """模型历史记录序列化器"""
    changed_by_username = serializers.CharField(source='changed_by.username', read_only=True)
    duty_personnel_name = serializers.CharField(source='duty_personnel.name', read_only=True)
    reverted_by_username = serializers.CharField(source='reverted_by.username', read_only=True)
    action_display = serializers.CharField(source='get_action_display', read_only=True)
    
    # 操作者显示名称（优先显示值班人员姓名）
    operator_name = serializers.SerializerMethodField()
    
    class Meta:
        model = ModelHistory
        fields = '__all__'
        read_only_fields = ['changed_at', 'reverted_at']
    
    def get_operator_name(self, obj):
        """获取操作者显示名称（优先显示值班人员姓名）"""
        if obj.duty_personnel:
            return f"{obj.duty_personnel.name}（值班人员）"
        elif obj.changed_by:
            if obj.is_admin_action:
                return f"{obj.changed_by.username}（管理员）"
            else:
                return obj.changed_by.username
        return "未知"


class NotificationSerializer(serializers.ModelSerializer):
    """站内消息序列化器"""
    notification_type_display = serializers.CharField(source='get_notification_type_display', read_only=True)
    
    class Meta:
        model = Notification
        fields = '__all__'
        read_only_fields = ['created_at', 'read_at']