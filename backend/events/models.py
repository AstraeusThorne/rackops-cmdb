from django.db import models


class Event(models.Model):
    """事件模型"""
    date = models.DateField(verbose_name="日期", db_index=True)
    start_time = models.TimeField(verbose_name="开始时间")
    end_time = models.TimeField(verbose_name="结束时间")
    completion_status = models.BooleanField(default=False, verbose_name="完成状态")
    order_number = models.CharField(max_length=100, null=True, blank=True, verbose_name="订单号", db_index=True)
    description = models.TextField(null=True, blank=True, verbose_name="事件描述")
    
    # 多对多关系
    rooms = models.ManyToManyField(
        'devices.Room', 
        through='RoomEvent',
        through_fields=('event', 'room'),
        related_name='events', 
        verbose_name="相关机房"
    )
    duty_personnel = models.ManyToManyField(
        'common.DutyPersonnel',
        through='EventDutyPersonnel',
        through_fields=('event', 'duty_personnel'),
        related_name='events',
        verbose_name="值班人员"
    )
    clients = models.ManyToManyField(
        'common.Client',
        through='EventClient',
        through_fields=('event', 'client'),
        related_name='events',
        verbose_name="相关客户"
    )
    authorized_orgs = models.ManyToManyField(
        'common.AuthorizedOrg',
        through='EventAuthorizedOrg',
        through_fields=('event', 'authorized_org'),
        related_name='events',
        verbose_name="授权单位"
    )
    entry_personnel = models.ManyToManyField(
        'EntryPersonnel',
        through='EventEntryPersonnel',
        through_fields=('event', 'entry_personnel'),
        related_name='events',
        verbose_name="进场人员"
    )
    devices = models.ManyToManyField(
        'devices.Device',
        through='EventDevice',
        through_fields=('event', 'device'),
        related_name='related_events',
        verbose_name="关联设备"
    )
    warehouse_devices = models.ManyToManyField(
        'devices.WarehouseDevice',
        through='EventWarehouseDevice',
        through_fields=('event', 'warehouse_device'),
        related_name='related_events',
        verbose_name="关联仓库设备"
    )

    def __str__(self):
        return f"Event on {self.date} from {self.start_time} to {self.end_time}"

    class Meta:
        db_table = 'event'
        verbose_name = "事件"
        verbose_name_plural = "事件"


class EntryPersonnel(models.Model):
    """进场人员模型"""
    name = models.CharField(max_length=100, verbose_name="姓名")
    id_card = models.CharField(max_length=18, verbose_name="身份证号")
    contact_info = models.CharField(max_length=100, verbose_name="联系方式")

    def __str__(self):
        return self.name

    class Meta:
        db_table = 'entry_personnel'
        verbose_name = "进场人员"
        verbose_name_plural = "进场人员"


# 中间表模型
class RoomEvent(models.Model):
    """机房事件关联表"""
    id = models.AutoField(primary_key=True)
    room = models.ForeignKey('devices.Room', on_delete=models.CASCADE)
    event = models.ForeignKey(Event, on_delete=models.CASCADE)

    class Meta:
        db_table = 'room_event'
        unique_together = (('room', 'event'),)


class EventDutyPersonnel(models.Model):
    """事件值班人员关联表"""
    id = models.AutoField(primary_key=True)
    event = models.ForeignKey(Event, on_delete=models.CASCADE)
    duty_personnel = models.ForeignKey('common.DutyPersonnel', on_delete=models.CASCADE)

    class Meta:
        db_table = 'event_duty_personnel'
        unique_together = (('event', 'duty_personnel'),)


class EventClient(models.Model):
    """事件客户关联表"""
    id = models.AutoField(primary_key=True)
    event = models.ForeignKey(Event, on_delete=models.CASCADE)
    client = models.ForeignKey('common.Client', on_delete=models.CASCADE)

    class Meta:
        db_table = 'event_client'
        unique_together = (('event', 'client'),)


class EventAuthorizedOrg(models.Model):
    """事件授权单位关联表"""
    id = models.AutoField(primary_key=True)
    event = models.ForeignKey(Event, on_delete=models.CASCADE)
    authorized_org = models.ForeignKey('common.AuthorizedOrg', on_delete=models.CASCADE, default=1)

    class Meta:
        db_table = 'event_authorized_org'
        unique_together = (('event', 'authorized_org'),)


class EventEntryPersonnel(models.Model):
    """事件进场人员关联表"""
    id = models.AutoField(primary_key=True)
    event = models.ForeignKey(Event, on_delete=models.CASCADE)
    entry_personnel = models.ForeignKey(EntryPersonnel, on_delete=models.CASCADE)

    class Meta:
        db_table = 'event_entry_personnel'
        unique_together = (('event', 'entry_personnel'),)
        managed = True

    def __str__(self):
        return f"{self.event} - {self.entry_personnel}"


class EventDevice(models.Model):
    """事件设备关联表（多对多关系表，仅用于关联）"""
    event = models.ForeignKey(Event, on_delete=models.CASCADE, verbose_name="关联事件")
    device = models.ForeignKey('devices.Device', on_delete=models.CASCADE, verbose_name="关联设备")

    class Meta:
        db_table = 'event_device'
        unique_together = (('event', 'device'),)
        verbose_name = "事件设备关联"
        verbose_name_plural = "事件设备关联"

    def __str__(self):
        return f"{self.event} - {self.device}"


class EventDecommissionedDevice(models.Model):
    """事件下架设备关联表（多对多关系表，仅用于关联）"""
    id = models.AutoField(primary_key=True)
    event = models.ForeignKey(Event, on_delete=models.CASCADE, verbose_name="关联事件")
    decommissioned_device = models.ForeignKey(
        'devices.DecommissionedDevice', 
        on_delete=models.CASCADE, 
        verbose_name="关联下架设备"
    )

    class Meta:
        db_table = 'event_decommissioned_device'
        unique_together = (('event', 'decommissioned_device'),)
        verbose_name = "事件下架设备关联"
        verbose_name_plural = "事件下架设备关联"

    def __str__(self):
        return f"{self.event} - {self.decommissioned_device}"


class EventWarehouseDevice(models.Model):
    """事件仓库设备关联表（多对多关系表，仅用于关联）"""
    id = models.AutoField(primary_key=True)
    event = models.ForeignKey(Event, on_delete=models.CASCADE, verbose_name="关联事件")
    warehouse_device = models.ForeignKey(
        'devices.WarehouseDevice', 
        on_delete=models.CASCADE, 
        verbose_name="关联仓库设备"
    )

    class Meta:
        db_table = 'event_warehouse_device'
        unique_together = (('event', 'warehouse_device'),)
        verbose_name = "事件仓库设备关联"
        verbose_name_plural = "事件仓库设备关联"

    def __str__(self):
        return f"{self.event} - {self.warehouse_device}"


class OperationStoryImport(models.Model):
    """运维故事导入历史记录模型"""
    batch_id = models.CharField(max_length=100, unique=True, verbose_name="批次ID")
    import_time = models.DateTimeField(auto_now_add=True, verbose_name="导入时间")
    imported_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='import_records',
        verbose_name="导入用户"
    )
    
    # 导入统计信息
    event_count = models.IntegerField(default=0, verbose_name="创建事件数")
    device_count = models.IntegerField(default=0, verbose_name="处理设备数")
    skipped_events = models.IntegerField(default=0, verbose_name="跳过事件数")
    skipped_devices = models.IntegerField(default=0, verbose_name="跳过设备数")
    
    # 导入选项
    incremental = models.BooleanField(default=False, verbose_name="增量导入")
    personnel_sheet = models.CharField(max_length=100, verbose_name="人员进出表Sheet名称")
    install_sheet = models.CharField(max_length=100, verbose_name="上架汇总表Sheet名称")
    decommission_sheet = models.CharField(max_length=100, verbose_name="下架汇总表Sheet名称")
    
    # 导入结果详情（JSON格式）
    summary = models.JSONField(null=True, blank=True, verbose_name="导入摘要")
    event_ids = models.JSONField(default=list, verbose_name="创建的事件ID列表")
    device_sns = models.JSONField(default=list, verbose_name="处理的设备序列号列表")
    
    # 回滚信息
    rolled_back = models.BooleanField(default=False, verbose_name="是否已回滚")
    rolled_back_at = models.DateTimeField(null=True, blank=True, verbose_name="回滚时间")
    rolled_back_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='rollback_records',
        verbose_name="回滚用户"
    )
    
    class Meta:
        db_table = 'operation_story_import'
        verbose_name = "运维故事导入记录"
        verbose_name_plural = "运维故事导入记录"
        ordering = ['-import_time']
        indexes = [
            models.Index(fields=['batch_id']),
            models.Index(fields=['import_time']),
            models.Index(fields=['imported_by', 'import_time']),
            models.Index(fields=['rolled_back']),
        ]
    
    def __str__(self):
        return f"{self.batch_id} - {self.import_time.strftime('%Y-%m-%d %H:%M:%S')}"
