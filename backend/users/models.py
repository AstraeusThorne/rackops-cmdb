from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """自定义用户模型"""
    username = models.CharField(max_length=150, unique=True, verbose_name="用户名")
    email = models.EmailField(unique=True, verbose_name="邮箱")
    first_name = models.CharField(max_length=30, verbose_name="名字")
    last_name = models.CharField(max_length=30, verbose_name="姓氏")
    is_active = models.BooleanField(default=True, verbose_name="是否激活")
    is_staff = models.BooleanField(default=False, verbose_name="是否为员工")
    is_superuser = models.BooleanField(default=False, verbose_name="是否为超级用户")
    date_joined = models.DateTimeField(auto_now_add=True, verbose_name="注册时间")
    last_login = models.DateTimeField(null=True, blank=True, verbose_name="最后登录时间")

    USERNAME_FIELD = 'username'
    REQUIRED_FIELDS = ['email']

    def __str__(self):
        return self.username

    class Meta:
        db_table = 'auth_user'
        verbose_name = "用户"
        verbose_name_plural = "用户"
