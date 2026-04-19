"""
报表请求/响应序列化：时间范围、报表类型、格式等。
"""
from rest_framework import serializers
from datetime import date


class ReportGenerateSerializer(serializers.Serializer):
    """生成报表请求参数"""

    period_type = serializers.ChoiceField(
        choices=['daily', 'weekly', 'monthly', 'yearly', 'cabinet', 'client_report', 'power_daily', 'power_monthly', 'power_yearly', 'cabinet_view'],
        help_text='报表周期：daily=运维日报, weekly=周报, monthly=运维月报, yearly=运维年报, cabinet=按机柜/客户, client_report=客户报表(须填client_id), power_daily/power_monthly/power_yearly=弱电资源日报/月报/年报, cabinet_view=机柜视图PDF',
    )
    start_date = serializers.DateField(help_text='统计开始日期')
    end_date = serializers.DateField(help_text='统计结束日期')
    format = serializers.ChoiceField(
        choices=['json', 'excel', 'pdf'],
        default='json',
        help_text='输出格式：json=仅数据, excel=Excel 文件, pdf=PDF 文件',
    )
    client_id = serializers.IntegerField(required=False, allow_null=True, help_text='可选，按客户过滤；客户报表(client_report)时必填')
    cabinet_id = serializers.IntegerField(required=False, allow_null=True, help_text='可选，按机柜过滤')
    cabinet_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False,
        allow_empty=False,
        help_text='可选，按多个机柜过滤；机柜视图(cabinet_view)时优先使用',
    )

    def validate(self, attrs):
        start = attrs['start_date']
        end = attrs['end_date']
        if start > end:
            raise serializers.ValidationError({'end_date': '结束日期不能早于开始日期。'})
        if attrs.get('period_type') == 'client_report' and not attrs.get('client_id'):
            raise serializers.ValidationError({'client_id': '客户报表必须指定客户(client_id)。'})
        if attrs.get('period_type') == 'cabinet_view':
            cabinet_ids = attrs.get('cabinet_ids') or []
            if not cabinet_ids and attrs.get('cabinet_id'):
                cabinet_ids = [attrs['cabinet_id']]
                attrs['cabinet_ids'] = cabinet_ids
            if not cabinet_ids and not attrs.get('client_id'):
                raise serializers.ValidationError({'cabinet_ids': '机柜视图至少需要选择一个机柜，或先选择客户。'})
            if attrs.get('format') != 'pdf':
                raise serializers.ValidationError({'format': '机柜视图仅支持 PDF 导出。'})
        return attrs
