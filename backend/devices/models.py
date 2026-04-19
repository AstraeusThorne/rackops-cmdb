from django.db import models


class Room(models.Model):
    """机房模型"""
    name = models.CharField(max_length=100, verbose_name="机房名称")

    def __str__(self):
        return self.name

    class Meta:
        db_table = 'room'
        verbose_name = "机房"
        verbose_name_plural = "机房"


class Cabinet(models.Model):
    """机柜模型"""
    name = models.CharField(max_length=100, verbose_name="机柜名称")
    room = models.ForeignKey(
        'Room',
        on_delete=models.PROTECT,
        verbose_name="所在机房",
        related_name='cabinets'
    )
    client = models.ForeignKey(
        'common.Client',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="所属客户",
        related_name='cabinets'
    )

    def __str__(self):
        return self.name

    class Meta:
        db_table = 'cabinet'
        verbose_name = "机柜"
        verbose_name_plural = "机柜"


class Device(models.Model):
    """设备模型"""
    DEVICE_TYPE_CHOICES = [
        ('server', '服务器'),
        ('switch', '交换机'),
        ('router', '路由器'),
        ('firewall', '防火墙'),
        ('storage', '存储设备'),
        ('ups', 'UPS'),
        ('pdu', 'PDU'),
        ('other', '其他'),
    ]
    
    brand = models.CharField(max_length=100, verbose_name="品牌")
    model = models.CharField(max_length=100, verbose_name="型号")
    sn = models.CharField(max_length=100, verbose_name="SN", db_index=True)
    u_size = models.IntegerField(verbose_name="U数")
    rack_position = models.CharField(max_length=100, verbose_name="机架位置")
    power_type = models.CharField(
        max_length=20,
        choices=[
            ('single', '单电源'),
            ('dual', '双电源'),
        ],
        default='single',
        verbose_name="单/双电源"
    )
    power_wattage = models.IntegerField(
        verbose_name="电源瓦数", 
        help_text="设备的电源功率，单位：瓦特(W)", 
        null=True, 
        blank=True
    )
    device_type = models.CharField(
        max_length=20, 
        choices=DEVICE_TYPE_CHOICES, 
        verbose_name="设备类型", 
        default='other'
    )
    cabinet = models.ForeignKey(
        'Cabinet', 
        on_delete=models.PROTECT, 
        verbose_name="所在机柜", 
        related_name='devices'
    )
    
    # 关联事件的多对多关系
    events = models.ManyToManyField(
        'events.Event',
        through='events.EventDevice',
        through_fields=('device', 'event'),
        related_name='related_devices',
        verbose_name="关联事件"
    )

    class Meta:
        db_table = 'device'
        verbose_name = "设备"
        verbose_name_plural = "设备"

    def __str__(self):
        return f"{self.brand} {self.model} ({self.sn})"


class DecommissionedDevice(models.Model):
    """下架设备模型"""
    sn = models.CharField(max_length=100, db_index=True, verbose_name="SN")
    brand = models.CharField(max_length=100, verbose_name="品牌")
    model = models.CharField(max_length=100, verbose_name="型号")
    u_size = models.IntegerField(verbose_name="U数")
    rack_position = models.CharField(max_length=100, verbose_name="机架位置")
    power_type = models.CharField(
        max_length=20,
        choices=[
            ('single', '单电源'),
            ('dual', '双电源'),
        ],
        default='single',
        verbose_name="单/双电源"
    )
    # 下架前的机柜位置（用于记录设备下架前的机柜信息）
    cabinet = models.ForeignKey(
        'Cabinet',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="下架前所在机柜",
        related_name='decommissioned_devices',
        help_text="记录设备下架前的机柜位置"
    )
    decommission_reason = models.TextField(verbose_name="下架原因")
    status = models.CharField(
        max_length=20,
        choices=[
            ('decommissioned', '已下架'),
            ('scrapped', '已报废')
        ],
        default='decommissioned',
        verbose_name="状态"
    )
    
    # 关联事件的多对多关系
    events = models.ManyToManyField(
        'events.Event',
        through='events.EventDecommissionedDevice',
        through_fields=('decommissioned_device', 'event'),
        related_name='decommissioned_devices',
        verbose_name="关联事件"
    )

    def __str__(self):
        return f"{self.brand} {self.model} ({self.sn})"

    @property
    def decommission_time(self):
        """从首个关联事件的日期+开始时间获取下架时间（逻辑统一：时间来自事件）"""
        from django.utils import timezone as tz
        from datetime import datetime, time
        event = self.events.order_by('date', 'start_time').first()
        if not event:
            return None
        dt = datetime.combine(event.date, event.start_time or time(0, 0))
        if tz.is_naive(dt):
            dt = tz.make_aware(dt)
        return dt

    class Meta:
        db_table = 'decommissioned_device'
        verbose_name = "下架设备"
        verbose_name_plural = "下架设备"


class DeviceAlert(models.Model):
    """设备告警模型"""
    LEVEL_CHOICES = [
        ('info', '提示'),
        ('warning', '警告'),
        ('critical', '严重'),
        ('emergency', '紧急'),
    ]
    STATUS_CHOICES = [
        ('active', '新增'),
        ('acknowledged', '已确认'),
        ('resolved', '已解除'),
        ('closed', '已关闭'),
    ]
    
    title = models.CharField(max_length=200, verbose_name="告警标题")
    description = models.TextField(verbose_name="告警描述")
    level = models.CharField(
        max_length=20, 
        choices=LEVEL_CHOICES, 
        default='warning', 
        verbose_name="告警级别"
    )
    status = models.CharField(
        max_length=20, 
        choices=STATUS_CHOICES, 
        default='active', 
        verbose_name="告警状态"
    )
    discovered_at = models.DateTimeField(auto_now_add=True, verbose_name="发现时间")
    duty_personnel = models.ForeignKey(
        'common.DutyPersonnel', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        verbose_name="值班人员"
    )
    resolved_at = models.DateTimeField(null=True, blank=True, verbose_name="解决时间")
    resolution_notes = models.TextField(null=True, blank=True, verbose_name="解决备注")
    device = models.ForeignKey(
        'Device', 
        on_delete=models.CASCADE, 
        related_name='alerts', 
        verbose_name="关联设备", 
        null=True, 
        blank=True
    )

    def __str__(self):
        return f"{self.title} - {self.get_level_display()}"

    class Meta:
        db_table = 'device_alert'
        verbose_name = "设备告警"
        verbose_name_plural = "设备告警"
        ordering = ['-discovered_at']


class PDUDevice(models.Model):
    """PDU设备表 - 存储PDU设备基本信息"""
    
    # PDU设备标识（API中的objectId）
    device_id = models.CharField(
        max_length=100,
        unique=True,
        verbose_name="PDU设备ID",
        help_text="API中的objectId，如: 56.F1-D-HTY-PDU-01",
        db_index=True
    )
    
    # PDU设备名称
    device_name = models.CharField(
        max_length=100,
        unique=True,
        verbose_name="PDU设备名称",
        help_text="如: F1D-PDUA-1, F1D-PDUB-1",
        db_index=True
    )
    
    # 电路类型
    circuit_type = models.CharField(
        max_length=10,
        choices=[
            ('A', 'A路'),
            ('B', 'B路'),
        ],
        verbose_name="电路类型",
        db_index=True
    )
    
    # 所在机房ID（关联cheshi数据库的Room表，不建立外键约束）
    room_id = models.BigIntegerField(
        verbose_name="所在机房ID",
        help_text="关联cheshi数据库中Room表的ID"
    )
    
    # 机房名称（冗余字段，便于查询和显示）
    room_name = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        verbose_name="机房名称",
        help_text="冗余字段，便于查询"
    )
    
    # 端口总数
    total_ports = models.IntegerField(
        default=0,
        verbose_name="端口总数",
        help_text="该PDU设备管理的端口总数，如: 38"
    )
    
    # 是否启用自动采集
    auto_collect_enabled = models.BooleanField(
        default=False,
        verbose_name="启用自动采集"
    )
    
    # 采集间隔（分钟）
    collect_interval = models.IntegerField(
        default=60,
        verbose_name="采集间隔（分钟）"
    )
    
    # 备注
    notes = models.TextField(
        null=True,
        blank=True,
        verbose_name="备注"
    )
    
    class Meta:
        db_table = 'pdu_device'
        verbose_name = "PDU设备"
        verbose_name_plural = "PDU设备"
        indexes = [
            models.Index(fields=['room_id', 'circuit_type']),
            models.Index(fields=['device_name']),
        ]
    
    def __str__(self):
        return f"{self.device_name} ({self.get_circuit_type_display()})"


class PDUPort(models.Model):
    """PDU端口表 - 存储每个PDU设备的端口信息"""
    
    # 关联PDU设备
    pdu_device = models.ForeignKey(
        'PDUDevice',
        on_delete=models.CASCADE,
        related_name='ports',
        verbose_name="PDU设备",
        db_index=True
    )
    
    # 端口号（如: 01, 02, ..., 38）
    port_number = models.CharField(
        max_length=10,
        verbose_name="端口号",
        help_text="如: Q01, Q02, 或 01, 02",
        db_index=True
    )
    
    # 完整端口标识（用于查询和显示）
    port_identifier = models.CharField(
        max_length=150,
        verbose_name="端口标识",
        help_text="如: F1D-PDUA-1-Q01, F1D-PDUA-1-01",
        db_index=True,
        unique=True  # 确保唯一性
    )
    
    # 关联机柜ID（关联cheshi数据库的Cabinet表，不建立外键约束）
    cabinet_id = models.BigIntegerField(
        null=True,
        blank=True,
        verbose_name="关联机柜ID",
        help_text="关联cheshi数据库中Cabinet表的ID"
    )
    
    # 机柜名称（冗余字段，便于查询和显示）
    cabinet_name = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        verbose_name="机柜名称",
        help_text="冗余字段，便于查询"
    )
    
    # 端口状态
    status = models.CharField(
        max_length=20,
        choices=[
            ('active', '启用'),
            ('inactive', '停用'),
            ('maintenance', '维护中'),
        ],
        default='active',
        verbose_name="端口状态"
    )
    
    # 备注
    notes = models.TextField(
        null=True,
        blank=True,
        verbose_name="备注"
    )
    
    class Meta:
        db_table = 'pdu_port'
        verbose_name = "PDU端口"
        verbose_name_plural = "PDU端口"
        unique_together = [
            ('pdu_device', 'port_number'),  # 同一PDU设备端口号唯一
        ]
        indexes = [
            models.Index(fields=['pdu_device', 'port_number']),
            models.Index(fields=['port_identifier']),
            models.Index(fields=['cabinet_id']),
        ]
    
    def __str__(self):
        return f"{self.port_identifier}"


class CabinetPDUData(models.Model):
    """机柜PDU弱电数据表 - 基于PDU端口存储数据"""
    
    # === 关联字段（改为关联PDU端口）===
    pdu_port = models.ForeignKey(
        'PDUPort',
        on_delete=models.CASCADE,
        related_name='data',
        verbose_name="PDU端口",
        db_index=True
    )
    
    # === 数据类型字段 ===
    data_type = models.CharField(
        max_length=20,
        choices=[
            ('current', '电流数据'),      # PDU_I01
            ('power', '功率数据'),        # PDU_P01
            ('energy', '电能数据'),       # PDU_WH01
            ('thd_current', '电流谐波失真'), # PDU_ThdI01
            ('switch_status', '开关状态'),  # PDU_SW01
        ],
        verbose_name="数据类型",
        db_index=True
    )
    
    # === 数据值字段 ===
    value = models.DecimalField(
        max_digits=15,
        decimal_places=4,
        verbose_name="数据值"
    )
    
    unit = models.CharField(
        max_length=20,
        default='A',
        verbose_name="单位",
        help_text="如: A(安培), kW(千瓦), kWh(千瓦时), %(百分比), 1(开关状态)"
    )
    
    # === 时间字段 ===
    timestamp = models.DateTimeField(
        verbose_name="采集时间",
        db_index=True
    )
    
    # === 数据来源字段 ===
    source = models.CharField(
        max_length=20,
        choices=[
            ('manual_import', '人工导入'),
            ('api_collect', 'API自动采集'),
        ],
        default='manual_import',
        verbose_name="数据来源",
        db_index=True
    )
    
    # === 导入批次字段 ===
    import_batch = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        verbose_name="导入批次",
        help_text="Excel导入批次标识，如: 20251128",
        db_index=True
    )
    
    # === Excel相关字段 ===
    excel_column_structure = models.CharField(
        max_length=50,
        null=True,
        blank=True,
        verbose_name="Excel列结构",
        help_text="如: 08+07列",
        db_index=True
    )
    
    excel_row_number = models.IntegerField(
        null=True,
        blank=True,
        verbose_name="Excel行号"
    )
    
    # === 数据质量字段 ===
    quality = models.CharField(
        max_length=20,
        choices=[
            ('good', '良好'),
            ('warning', '警告'),
            ('error', '错误'),
        ],
        default='good',
        verbose_name="数据质量"
    )
    
    # === 备注字段 ===
    notes = models.TextField(
        null=True,
        blank=True,
        verbose_name="备注"
    )
    
    # === 元数据字段 ===
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="创建时间"
    )
    
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name="更新时间"
    )
    
    class Meta:
        db_table = 'cabinet_pdu_data'
        verbose_name = "PDU数据"
        verbose_name_plural = "PDU数据"
        
        indexes = [
            # 核心查询索引
            models.Index(fields=['pdu_port', 'timestamp']),
            
            # 数据类型查询索引
            models.Index(fields=['pdu_port', 'data_type', 'timestamp']),
            
            # 批次查询索引
            models.Index(fields=['import_batch', 'timestamp']),
            
            # 时间范围查询索引
            models.Index(fields=['timestamp', 'data_type']),
            
            # 数据来源查询索引
            models.Index(fields=['source', 'timestamp']),
        ]
        
        # === 唯一约束（防止重复数据）===
        unique_together = [
            ('pdu_port', 'data_type', 'timestamp', 'source'),
        ]
        
        ordering = ['-timestamp']
    
    def __str__(self):
        return f"{self.pdu_port.port_identifier} - {self.get_data_type_display()} - {self.timestamp}"


class WarehouseDevice(models.Model):
    """仓库设备模型 - 基于设备代收登记表设计"""
    # 基本信息
    brand = models.CharField(max_length=100, verbose_name="品牌")
    model = models.CharField(max_length=100, verbose_name="型号")
    sn = models.CharField(max_length=100, unique=True, verbose_name="序列号")
    u_size = models.IntegerField(verbose_name="U数")
    
    # 电源类型（单/双电源）
    power_type = models.CharField(
        max_length=20,
        choices=[
            ('single', '单电源'),
            ('dual', '双电源'),
        ],
        default='single',
        verbose_name="单/双电源"
    )
    
    # 备用字段（保留用于后期扩展需求）
    reserved_field_1 = models.CharField(max_length=100, verbose_name="备用字段1", null=True, blank=True, help_text="备用字段，用于后期扩展需求")
    power_wattage = models.IntegerField(
        verbose_name="电源瓦数", 
        help_text="设备的电源功率，单位：瓦特(W)", 
        null=True, 
        blank=True
    )
    
    # 设备类型
    device_type = models.CharField(
        max_length=20, 
        choices=Device.DEVICE_TYPE_CHOICES, 
        verbose_name="设备类型", 
        default='other'
    )
    
    # 供货方信息
    supplier = models.CharField(max_length=200, verbose_name="供货方", null=True, blank=True)
    
    # 代收时间（入库时间）
    collection_time = models.DateTimeField(verbose_name="代收时间", auto_now_add=True)
    
    # 仓库位置（仓库内的存储位置，不是机架位置）
    warehouse_location = models.CharField(
        max_length=200, 
        verbose_name="仓库位置", 
        null=True, 
        blank=True,
        help_text="设备在仓库中的存储位置，如：A区-01号货架"
    )
    
    # 状态
    status = models.CharField(
        max_length=20,
        choices=[
            ('in_warehouse', '在库'),
            ('installed', '已上架'),
            ('out_of_warehouse', '已出库'),
        ],
        default='in_warehouse',
        verbose_name="状态"
    )
    
    # 备注（用于记录上架/出库历史）
    notes = models.TextField(null=True, blank=True, verbose_name="备注")
    
    # 关联事件的多对多关系
    events = models.ManyToManyField(
        'events.Event',
        through='events.EventWarehouseDevice',
        through_fields=('warehouse_device', 'event'),
        related_name='warehouse_device_events',
        verbose_name="关联事件"
    )

    def __str__(self):
        return f"{self.brand} {self.model} (SN: {self.sn})"

    class Meta:
        db_table = 'warehouse_device'
        verbose_name = "仓库设备"
        verbose_name_plural = "仓库设备"
        ordering = ['-collection_time']


class WarehouseDeviceHistory(models.Model):
    """仓库设备操作历史记录表"""
    ACTION_CHOICES = [
        ('in', '入库'),
        ('install', '上架'),
        ('out', '出库'),
        ('update', '更新'),
    ]
    
    warehouse_device = models.ForeignKey(
        'WarehouseDevice',
        on_delete=models.CASCADE,
        related_name='history_records',
        verbose_name="仓库设备"
    )
    action = models.CharField(
        max_length=20,
        choices=ACTION_CHOICES,
        verbose_name="操作类型"
    )
    action_date = models.DateField(verbose_name="操作日期")
    action_time = models.TimeField(verbose_name="操作时间", null=True, blank=True)
    
    # 上架相关信息（仅当action='install'时使用）
    install_location = models.CharField(
        max_length=200,
        verbose_name="上架位置",
        null=True,
        blank=True,
        help_text="上架到的机柜位置，如：F1D-07-10"
    )
    install_rack_position = models.CharField(
        max_length=100,
        verbose_name="机架位置",
        null=True,
        blank=True,
        help_text="机架U位，如：17-18"
    )
    cabinet = models.ForeignKey(
        'Cabinet',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="机柜",
        related_name='warehouse_install_history'
    )
    
    # 关联事件
    event = models.ForeignKey(
        'events.Event',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="关联事件"
    )
    
    # 备注
    notes = models.TextField(null=True, blank=True, verbose_name="备注")
    
    # 操作人员（如果系统有用户信息）
    operator = models.CharField(max_length=100, verbose_name="操作人员", null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="记录创建时间")

    class Meta:
        db_table = 'warehouse_device_history'
        verbose_name = "仓库设备历史记录"
        verbose_name_plural = "仓库设备历史记录"
        ordering = ['-action_date', '-action_time', '-created_at']
        indexes = [
            models.Index(fields=['warehouse_device', '-action_date']),
            models.Index(fields=['action', '-action_date']),
        ]

    def __str__(self):
        action_display = self.get_action_display()
        return f"{self.warehouse_device} - {action_display} - {self.action_date}"
