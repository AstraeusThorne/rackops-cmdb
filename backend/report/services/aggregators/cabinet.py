"""
按机柜/客户维度的报表聚合器。

与周期聚合器共用同一套 summary/sections 逻辑，仅 scope 不同；
此处复用 get_report_summary_and_sections(client_id/cabinet_id)，使用 period_type=monthly 的 meta 展示。
"""
from datetime import date
from typing import Optional

from report.schemas.report_schema import build_report_meta, build_report_data
from .base import BaseReportAggregator
from .aggregation_helpers import get_report_summary_and_sections


class CabinetReportAggregator(BaseReportAggregator):
    """
    按客户或机柜维度的报表聚合器。

    使用 period_type='monthly' 的 meta 展示，实际维度由 client_id/cabinet_id 决定。
    用于“指定客户机柜报告”等扩展场景。
    """

    period_type = 'monthly'

    def aggregate(
        self,
        start_date: date,
        end_date: date,
        client_id: Optional[int] = None,
        cabinet_id: Optional[int] = None,
    ) -> dict:
        summary, sections = get_report_summary_and_sections(
            start_date, end_date, client_id=client_id, cabinet_id=cabinet_id
        )
        client_name = None
        cabinet_name = None
        if cabinet_id:
            from devices.models import Cabinet
            cab = Cabinet.objects.filter(id=cabinet_id).select_related('client').first()
            if cab:
                cabinet_name = cab.name
                client_name = cab.client.name if cab.client else None
        elif client_id:
            from common.models import Client
            c = Client.objects.filter(id=client_id).first()
            if c:
                client_name = c.name

        meta = build_report_meta(
            'monthly',
            start_date,
            end_date,
            client_id=client_id,
            cabinet_id=cabinet_id,
            client_name=client_name,
            cabinet_name=cabinet_name,
        )
        return build_report_data(meta, summary, sections)
