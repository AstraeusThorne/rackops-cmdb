"""
报表服务门面：按报表类型与时间范围驱动聚合，并支持导出为 Excel/PDF/JSON。
"""
from datetime import date
from typing import Optional

from report.schemas.report_schema import REPORT_PERIOD_TYPES, REPORT_FORMATS
from .aggregators.base import BaseReportAggregator
from .aggregators.daily import DailyReportAggregator
from .aggregators.weekly import WeeklyReportAggregator
from .aggregators.monthly import MonthlyReportAggregator
from .aggregators.yearly import YearlyReportAggregator
from .aggregators.cabinet import CabinetReportAggregator
from .aggregators.cabinet_view import CabinetViewReportAggregator
from .aggregators.client_report_aggregator import ClientReportAggregator
from .aggregators.pdu_monthly_aggregator import PduMonthlyReportAggregator
from .exporters.base import BaseReportExporter
from .exporters.cabinet_view_pdf_exporter import CabinetViewPDFExporter
from .exporters.client_excel_exporter import ClientReportExcelExporter
from .exporters.excel_exporter import ExcelReportExporter
from .exporters.pdu_excel_exporter import PduMonthlyExcelExporter
from .exporters.pdf_exporter import PDFReportExporter


class ReportService:
    """
    报表服务：聚合 + 导出。

    统计逻辑在 aggregators 中，与 Dashboard 前端解耦；
    支持 BI 仅消费 JSON（get_report_data），或导出 Excel/PDF。
    """

    def __init__(self) -> None:
        self._aggregators: dict[str, BaseReportAggregator] = {}
        self._exporters: dict[str, BaseReportExporter] = {}
        self._register_builtin_aggregators()
        self._register_builtin_exporters()

    def _register_builtin_aggregators(self) -> None:
        """注册内置周期聚合器。"""
        self._aggregators['daily'] = DailyReportAggregator()
        self._aggregators['weekly'] = WeeklyReportAggregator()
        self._aggregators['monthly'] = MonthlyReportAggregator()
        self._aggregators['yearly'] = YearlyReportAggregator()
        self._aggregators['cabinet'] = CabinetReportAggregator()
        self._aggregators['cabinet_view'] = CabinetViewReportAggregator()
        self._aggregators['client_report'] = ClientReportAggregator()
        self._aggregators['power_daily'] = PduMonthlyReportAggregator(period_type='power_daily')
        self._aggregators['power_monthly'] = PduMonthlyReportAggregator(period_type='power_monthly')
        self._aggregators['power_yearly'] = PduMonthlyReportAggregator(period_type='power_yearly')

    def _register_builtin_exporters(self) -> None:
        """注册内置导出器。"""
        self._exporters['excel'] = ExcelReportExporter()
        self._exporters['pdf'] = PDFReportExporter()

    def get_report_data(
        self,
        period_type: str,
        start_date: date,
        end_date: date,
        client_id: Optional[int] = None,
        cabinet_id: Optional[int] = None,
        cabinet_ids: Optional[list[int]] = None,
    ) -> dict:
        """
        返回符合 ReportData Schema 的 dict，供导出或 BI 使用。

        Args:
            period_type: daily | weekly | monthly | yearly | cabinet
            start_date: 统计开始日期
            end_date: 统计结束日期
            client_id: 可选客户 ID
            cabinet_id: 可选机柜 ID

        Returns:
            ReportData 字典

        Raises:
            ValueError: period_type 不支持时
        """
        aggregator = self._aggregators.get(period_type)
        if not aggregator:
            raise ValueError(f"Unknown period_type: {period_type}. Valid: {list(self._aggregators)}")
        if period_type == 'cabinet_view':
            return aggregator.aggregate(
                start_date=start_date,
                end_date=end_date,
                client_id=client_id,
                cabinet_id=cabinet_id,
                cabinet_ids=cabinet_ids,
            )
        return aggregator.aggregate(
            start_date=start_date,
            end_date=end_date,
            client_id=client_id,
            cabinet_id=cabinet_id,
        )

    def export(
        self,
        period_type: str,
        start_date: date,
        end_date: date,
        format: str,
        client_id: Optional[int] = None,
        cabinet_id: Optional[int] = None,
        cabinet_ids: Optional[list[int]] = None,
    ):
        """
        生成报表并返回文件流（HttpResponse 或 (filename, file_like)）。

        Args:
            period_type: daily | weekly | monthly | yearly | cabinet
            start_date: 统计开始日期
            end_date: 统计结束日期
            format: json | excel | pdf
            client_id: 可选客户 ID
            cabinet_id: 可选机柜 ID

        Returns:
            format=json 时返回 dict；
            excel/pdf 时返回 (filename, BytesIO) 供 HttpResponse 使用。

        Raises:
            ValueError: period_type 或 format 不支持时
        """
        data = self.get_report_data(
            period_type=period_type,
            start_date=start_date,
            end_date=end_date,
            client_id=client_id,
            cabinet_id=cabinet_id,
            cabinet_ids=cabinet_ids,
        )
        if format == 'json':
            return data
        if format == 'pdf' and period_type == 'cabinet_view':
            exporter = CabinetViewPDFExporter()
        elif format == 'excel' and period_type == 'client_report':
            exporter = ClientReportExcelExporter()
        elif format == 'excel' and period_type in ('power_daily', 'power_monthly', 'power_yearly'):
            exporter = PduMonthlyExcelExporter()
        else:
            exporter = self._exporters.get(format)
        if not exporter:
            raise ValueError(f"Unsupported format: {format}. Valid: {list(self._exporters)}")
        return exporter.export(
            data,
            period_type=period_type,
            start_date=start_date,
            end_date=end_date,
        )
