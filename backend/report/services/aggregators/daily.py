"""
日报聚合器：按单日统计。
"""
from datetime import date
from typing import Optional

from report.schemas.report_schema import build_report_meta, build_report_data
from .base import BaseReportAggregator
from .aggregation_helpers import get_report_summary_and_sections


class DailyReportAggregator(BaseReportAggregator):
    """日报聚合器"""

    period_type = 'daily'

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

        # 弱电管理风险分析：复用 PDU 弱电聚合器的风险相关 section（高利用率机柜、电流预警、冗余不足机柜）
        # 仅在聚合成功时追加；PDU 库不可用或查询失败时忽略，不影响运维日报主体生成。
        try:
            from report.services.aggregators.pdu_monthly_aggregator import (
                PduMonthlyReportAggregator,
            )

            pdu_aggregator = PduMonthlyReportAggregator(period_type='power_daily')
            pdu_data = pdu_aggregator.aggregate(
                start_date,
                end_date,
                client_id=client_id,
                cabinet_id=cabinet_id,
            )
            pdu_sections = pdu_data.get('sections') or []
            risk_ids = {
                'pdu_risk_high_util',
                'pdu_risk_current_warning',
                'pdu_risk_redundancy',
            }
            risk_sections = [s for s in pdu_sections if s.get('id') in risk_ids]
            if risk_sections:
                sections = list(sections) + risk_sections
        except Exception:
            # 弱电数据缺失或 PDU 库不可用时，忽略风险分析 section
            pass

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
