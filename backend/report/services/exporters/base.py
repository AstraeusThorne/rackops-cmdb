"""
报表导出器抽象基类。
"""
from abc import ABC, abstractmethod
from datetime import date
from typing import Any


class BaseReportExporter(ABC):
    """报表导出器基类"""

    @abstractmethod
    def export(
        self,
        data: dict[str, Any],
        period_type: str,
        start_date: date,
        end_date: date,
    ) -> tuple[str, Any]:
        """
        将 ReportData 导出为文件，返回 (文件名, 文件流)。

        Args:
            data: 符合 ReportData 的字典
            period_type: 报表类型
            start_date: 开始日期
            end_date: 结束日期

        Returns:
            (filename, file_like) 如 ("report_2026-02.xlsx", BytesIO())
        """
        pass
