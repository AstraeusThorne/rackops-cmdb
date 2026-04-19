"""
报表数据结构与 JSON Schema 定义。

统一报表数据根结构，供导出（Excel/PDF）与 BI 接口共用。
"""
from __future__ import annotations

from datetime import date
from typing import Any, TypedDict, Optional, List

from django.utils import timezone

# 报表周期类型
REPORT_PERIOD_TYPES = ('daily', 'weekly', 'monthly', 'yearly', 'cabinet', 'client_report', 'power_daily', 'power_monthly', 'power_yearly', 'cabinet_view')
PERIOD_LABELS = {
    'daily': '运维日报',
    'weekly': '周报',
    'monthly': '运维月报',
    'yearly': '运维年报',
    'cabinet': '按机柜/客户',
    'client_report': '客户报表',
    'power_daily': '弱电资源日报',
    'power_monthly': '弱电资源月报',
    'power_yearly': '弱电资源年报',
    'cabinet_view': '机柜视图',
}

# 导出格式
REPORT_FORMATS = ('json', 'excel', 'pdf')


class ReportScope(TypedDict, total=False):
    """报表范围（客户/机柜等）"""
    clientId: Optional[int]
    cabinetId: Optional[int]
    cabinetIds: List[int]
    clientName: Optional[str]
    cabinetName: Optional[str]
    cabinetNames: List[str]


class ReportMeta(TypedDict):
    """报表元信息"""
    reportType: str
    periodLabel: str
    startDate: str
    endDate: str
    generatedAt: str
    scope: ReportScope


class ReportSummary(TypedDict, total=False):
    """报表摘要指标（与现有模型对应）"""
    # 设备
    deviceCount: int
    decommissionedCount: int
    deviceTypeDistribution: List[dict]
    totalPowerWattage: int
    totalPowerKw: float
    deviceNewInPeriod: int
    deviceDecommissionedInPeriod: int
    # 事件
    eventCount: int
    eventCompletedCount: int
    eventPendingCount: int
    eventCompletionRate: float
    # 告警
    alertCount: int
    alertActiveCount: int
    alertResolvedCount: int
    alertByLevel: dict
    alertByStatus: dict
    responseRate: float
    alertAvgResolutionHours: float
    alertResolvedIn24hCount: int
    # 仓库
    warehouseInCount: int
    warehouseInstallCount: int
    warehouseOutCount: int
    warehouseUpdateCount: int
    # 机房/机柜
    roomCount: int
    cabinetCount: int


class ReportTable(TypedDict):
    """报表中的表格块"""
    headers: List[str]
    rows: List[List[Any]]


class ReportSection(TypedDict, total=False):
    """报表中的一个 section"""
    id: str
    title: str
    tables: List[ReportTable]
    metrics: List[dict]


class ReportData(TypedDict):
    """报表数据根结构"""
    meta: ReportMeta
    summary: ReportSummary
    sections: List[ReportSection]


def build_report_meta(
    period_type: str,
    start_date: date,
    end_date: date,
    client_id: Optional[int] = None,
    cabinet_id: Optional[int] = None,
    client_name: Optional[str] = None,
    cabinet_name: Optional[str] = None,
    cabinet_ids: Optional[List[int]] = None,
    cabinet_names: Optional[List[str]] = None,
) -> ReportMeta:
    """
    构建报表 meta 字典。

    Args:
        period_type: daily | weekly | monthly | yearly
        start_date: 统计开始日期
        end_date: 统计结束日期
        client_id: 可选客户 ID
        cabinet_id: 可选机柜 ID
        client_name: 可选客户名称
        cabinet_name: 可选机柜名称

    Returns:
        符合 ReportMeta 的字典
    """
    scope: ReportScope = {
        'clientId': client_id,
        'cabinetId': cabinet_id,
    }
    if cabinet_ids:
        scope['cabinetIds'] = cabinet_ids
    if client_name is not None:
        scope['clientName'] = client_name
    if cabinet_name is not None:
        scope['cabinetName'] = cabinet_name
    if cabinet_names:
        scope['cabinetNames'] = cabinet_names

    local_now = timezone.localtime(timezone.now())
    return {
        'reportType': period_type,
        'periodLabel': PERIOD_LABELS.get(period_type, period_type),
        'startDate': start_date.isoformat(),
        'endDate': end_date.isoformat(),
        # 使用本地时区时间，格式为 YYYY-MM-DD HH:MM:SS，避免与实际报表生成时间相差 8 小时
        'generatedAt': local_now.strftime('%Y-%m-%d %H:%M:%S'),
        'scope': scope,
    }


def build_report_data(
    meta: ReportMeta,
    summary: ReportSummary,
    sections: List[ReportSection],
) -> ReportData:
    """
    构建完整 ReportData。

    Args:
        meta: 元信息
        summary: 摘要指标
        sections: 各 section 列表

    Returns:
        符合 ReportData 的字典
    """
    return {
        'meta': meta,
        'summary': summary,
        'sections': sections,
    }


def report_data_json_schema() -> dict:
    """
    返回 ReportData 的 JSON Schema，用于文档与校验。

    Returns:
        JSON Schema 字典
    """
    return {
        '$schema': 'http://json-schema.org/draft-07/schema#',
        'title': 'CMDB Report Data',
        'description': '报表数据根结构，供导出与 BI 共用',
        'type': 'object',
        'required': ['meta', 'summary', 'sections'],
        'properties': {
            'meta': {
                'type': 'object',
                'required': ['reportType', 'periodLabel', 'startDate', 'endDate', 'generatedAt', 'scope'],
                'properties': {
                    'reportType': {'type': 'string', 'enum': list(REPORT_PERIOD_TYPES)},
                    'periodLabel': {'type': 'string'},
                    'startDate': {'type': 'string', 'format': 'date'},
                    'endDate': {'type': 'string', 'format': 'date'},
                    'generatedAt': {'type': 'string', 'format': 'date-time'},
                    'scope': {
                        'type': 'object',
                        'properties': {
                            'clientId': {'type': ['integer', 'null']},
                            'cabinetId': {'type': ['integer', 'null']},
                            'cabinetIds': {'type': 'array', 'items': {'type': 'integer'}},
                            'clientName': {'type': ['string', 'null']},
                            'cabinetName': {'type': ['string', 'null']},
                            'cabinetNames': {'type': 'array', 'items': {'type': 'string'}},
                        },
                    },
                },
            },
            'summary': {
                'type': 'object',
                'properties': {
                    'deviceCount': {'type': 'integer'},
                    'decommissionedCount': {'type': 'integer'},
                    'eventCount': {'type': 'integer'},
                    'eventCompletedCount': {'type': 'integer'},
                    'eventPendingCount': {'type': 'integer'},
                    'alertCount': {'type': 'integer'},
                    'alertActiveCount': {'type': 'integer'},
                    'alertResolvedCount': {'type': 'integer'},
                    'alertByLevel': {'type': 'object', 'additionalProperties': {'type': 'integer'}},
                    'alertByStatus': {'type': 'object', 'additionalProperties': {'type': 'integer'}},
                    'warehouseInCount': {'type': 'integer'},
                    'warehouseInstallCount': {'type': 'integer'},
                    'warehouseOutCount': {'type': 'integer'},
                    'warehouseUpdateCount': {'type': 'integer'},
                    'roomCount': {'type': 'integer'},
                    'cabinetCount': {'type': 'integer'},
                    'occupiedUnits': {'type': 'integer'},
                    'availableUnits': {'type': 'integer'},
                    'totalPowerWattage': {'type': 'integer'},
                    'totalPowerKw': {'type': 'number'},
                    'deviceTypeDistribution': {
                        'type': 'array',
                        'items': {'type': 'object', 'properties': {'name': {}, 'value': {}}},
                    },
                },
            },
            'sections': {
                'type': 'array',
                'items': {
                    'type': 'object',
                    'properties': {
                        'id': {'type': 'string'},
                        'title': {'type': 'string'},
                        'tables': {
                            'type': 'array',
                            'items': {
                                'type': 'object',
                                'required': ['headers', 'rows'],
                                'properties': {
                                    'headers': {'type': 'array', 'items': {'type': 'string'}},
                                    'rows': {'type': 'array', 'items': {'type': 'array'}},
                                },
                            },
                        },
                        'metrics': {'type': 'array'},
                    },
                },
            },
        },
    }
