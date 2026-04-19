"""
报表聚合器抽象基类。

所有周期/维度的聚合器继承此类，实现 aggregate()，返回符合 ReportData 的 dict。
"""
from abc import ABC, abstractmethod
from datetime import date
from typing import Any, Optional, Dict


class BaseReportAggregator(ABC):
    """报表聚合器基类"""

    period_type: str = ''
    """报表周期类型：daily | weekly | monthly | yearly"""

    @abstractmethod
    def aggregate(
        self,
        start_date: date,
        end_date: date,
        client_id: Optional[int] = None,
        cabinet_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        在给定时间范围和可选维度下聚合数据，返回符合 ReportData 的字典。

        Args:
            start_date: 统计开始日期
            end_date: 统计结束日期
            client_id: 可选，按客户过滤
            cabinet_id: 可选，按机柜过滤

        Returns:
            包含 meta、summary、sections 的 ReportData 字典
        """
        pass
