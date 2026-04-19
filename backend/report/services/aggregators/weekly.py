"""
周报聚合器：按周统计。
"""
from datetime import date
from typing import Optional

from report.schemas.report_schema import build_report_meta, build_report_data
from .base import BaseReportAggregator
from .aggregation_helpers import get_report_summary_and_sections


class WeeklyReportAggregator(BaseReportAggregator):
    """周报聚合器"""

    period_type = 'weekly'

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
            self.period_type,
            start_date,
            end_date,
            client_id=client_id,
            cabinet_id=cabinet_id,
            client_name=client_name,
            cabinet_name=cabinet_name,
        )
        return build_report_data(meta, summary, sections)
