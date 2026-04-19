from django.db import models
import json


class Client(models.Model):
    """客户模型"""
    name = models.CharField(max_length=100, verbose_name="客户名称")
    authorized_person = models.CharField(max_length=100, verbose_name="授权人", default='', blank=True)

    def __str__(self):
        return self.name

    class Meta:
        db_table = 'client'
        verbose_name = "客户"
        verbose_name_plural = "客户"


class AuthorizedOrg(models.Model):
    """授权单位模型"""
    name = models.CharField(max_length=100, verbose_name="单位名称")

    def __str__(self):
        return self.name

    class Meta:
        db_table = 'authorized_org'
        verbose_name = "授权单位"
        verbose_name_plural = "授权单位"


class DutyPersonnel(models.Model):
    """值班人员模型"""
    ACCOUNT_STATUS_CHOICES = [
        ('pending', '待审核'),
        ('approved', '已审核'),
        ('rejected', '已拒绝'),
    ]
    
    employee_id = models.CharField(max_length=50, verbose_name="员工ID", default='', blank=True)
    name = models.CharField(max_length=100, verbose_name="姓名")
    id_card = models.CharField(max_length=18, verbose_name="身份证号", default='', blank=True)
    phone = models.CharField(max_length=20, verbose_name="电话", default='', blank=True)
    type = models.CharField(max_length=50, verbose_name="类型", default='', blank=True)
    
    # 关联用户账户
    user = models.OneToOneField(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='duty_personnel_profile',
        verbose_name="关联用户账户"
    )
    
    # 审核状态
    account_status = models.CharField(
        max_length=20,
        choices=ACCOUNT_STATUS_CHOICES,
        default='pending',
        verbose_name="账户状态"
    )
    approved_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_duty_personnel',
        verbose_name="审核人"
    )
    approved_at = models.DateTimeField(null=True, blank=True, verbose_name="审核时间")
    rejection_reason = models.TextField(null=True, blank=True, verbose_name="拒绝原因")

    def save(self, *args, **kwargs):
        # 同步更新 User.username
        if self.user and self.user.username != self.name:
            self.user.username = self.name
            self.user.save(update_fields=['username'])
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

    class Meta:
        db_table = 'duty_personnel'
        verbose_name = "值班人员"
        verbose_name_plural = "值班人员"


class SystemConfig(models.Model):
    """系统配置模型"""
    CATEGORY_CHOICES = [
        ('alert_thresholds', '告警阈值'),
        ('display_settings', '显示配置'),
        ('pdu_report', '弱电报表'),
    ]
    
    key = models.CharField(max_length=100, unique=True, verbose_name="配置键")
    value = models.TextField(verbose_name="配置值（JSON格式）")
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES, verbose_name="配置分类")
    description = models.TextField(blank=True, null=True, verbose_name="描述")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="更新时间")

    def get_value(self):
        """获取解析后的JSON值"""
        try:
            return json.loads(self.value)
        except (json.JSONDecodeError, TypeError):
            return self.value

    def set_value(self, value):
        """设置JSON值"""
        if isinstance(value, (dict, list)):
            self.value = json.dumps(value, ensure_ascii=False)
        else:
            self.value = str(value)

    def __str__(self):
        return f"{self.key} ({self.category})"

    class Meta:
        db_table = 'system_config'
        verbose_name = "系统配置"
        verbose_name_plural = "系统配置"
        ordering = ['category', 'key']


class ModelHistory(models.Model):
    """模型变更历史记录"""
    ACTION_CHOICES = [
        ('create', '创建'),
        ('update', '更新'),
        ('delete', '删除'),
    ]
    
    # 关联到具体的模型实例
    content_type = models.CharField(max_length=100, verbose_name="模型类型")
    object_id = models.BigIntegerField(verbose_name="对象ID")
    
    # 操作信息
    action = models.CharField(max_length=20, choices=ACTION_CHOICES, verbose_name="操作类型")
    changed_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='model_changes',
        verbose_name="操作者"
    )
    duty_personnel = models.ForeignKey(
        'DutyPersonnel',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='history_records',
        verbose_name="值班人员"
    )
    is_admin_action = models.BooleanField(default=False, verbose_name="是否管理员操作")
    changed_at = models.DateTimeField(auto_now_add=True, verbose_name="操作时间")
    
    # 字段级变更数据（只包含变更的字段）
    old_data = models.JSONField(null=True, blank=True, verbose_name="变更前数据")
    new_data = models.JSONField(null=True, blank=True, verbose_name="变更后数据")
    changed_fields = models.JSONField(null=True, blank=True, verbose_name="变更字段列表")
    
    # 多对多关系变更
    m2m_changes = models.JSONField(null=True, blank=True, verbose_name="多对多关系变更")
    # 格式: {"clients": {"old_ids": [1,2], "new_ids": [1,3]}, "rooms": {...}}
    
    # 字段中文名称映射（用于前端显示）
    field_labels = models.JSONField(null=True, blank=True, verbose_name="字段中文名称")
    # 格式: {"description": "事件描述", "completion_status": "完成状态"}
    
    # 备注信息
    reason = models.TextField(null=True, blank=True, verbose_name="变更原因")
    
    # 回退信息
    reverted = models.BooleanField(default=False, verbose_name="是否已回退")
    reverted_by = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reverted_changes',
        verbose_name="回退操作者"
    )
    reverted_at = models.DateTimeField(null=True, blank=True, verbose_name="回退时间")
    
    class Meta:
        db_table = 'model_history'
        verbose_name = "模型变更历史"
        verbose_name_plural = "模型变更历史"
        ordering = ['-changed_at']
        indexes = [
            models.Index(fields=['content_type', 'object_id']),
            models.Index(fields=['changed_by', 'changed_at']),
            models.Index(fields=['duty_personnel', 'changed_at']),
            models.Index(fields=['is_admin_action', 'changed_at']),
            models.Index(fields=['reverted']),
        ]
    
    def __str__(self):
        operator = self.duty_personnel.name if self.duty_personnel else (self.changed_by.username if self.changed_by else '未知')
        return f"{self.content_type}#{self.object_id} - {self.get_action_display()} by {operator}"


class Notification(models.Model):
    """站内消息模型"""
    TYPE_CHOICES = [
        ('account_approved', '账户审核通过'),
        ('account_rejected', '账户审核拒绝'),
        ('account_pending', '账户待审核'),
        ('new_event', '新增事件'),
        ('event_updated', '事件更新'),
        ('new_alert', '新增告警'),
        ('system', '系统通知'),
    ]
    
    recipient = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        related_name='notifications',
        verbose_name="接收者"
    )
    notification_type = models.CharField(
        max_length=50,
        choices=TYPE_CHOICES,
        verbose_name="消息类型"
    )
    title = models.CharField(max_length=200, verbose_name="标题")
    content = models.TextField(verbose_name="内容")
    is_read = models.BooleanField(default=False, verbose_name="是否已读")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")
    read_at = models.DateTimeField(null=True, blank=True, verbose_name="阅读时间")
    
    # 关联到相关对象（可选）
    related_content_type = models.CharField(max_length=100, null=True, blank=True, verbose_name="关联模型类型")
    related_object_id = models.BigIntegerField(null=True, blank=True, verbose_name="关联对象ID")
    
    class Meta:
        db_table = 'notification'
        verbose_name = "站内消息"
        verbose_name_plural = "站内消息"
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['recipient', 'is_read']),
            models.Index(fields=['notification_type', 'created_at']),
        ]
    
    def __str__(self):
        return f"{self.title} - {self.recipient.username}"
