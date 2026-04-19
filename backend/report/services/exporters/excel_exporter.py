"""
Excel 报表导出器：生成数据中心运维月报五 Sheet 结构（总览、事件统计、告警统计、设备变化、人员统计）。
"""
from datetime import date
from io import BytesIO
from typing import Any, List

from openpyxl import Workbook

from .base import BaseReportExporter
from .excel_styles import (
    FONT_SECTION,
    apply_metadata_block_style,
    apply_title_style,
    set_sheet_print_options,
    write_table,
)


def _get_section_by_id(sections: List[dict], section_id: str) -> dict:
    """从 sections 列表中按 id 取 section，不存在则返回空 dict。"""
    for s in sections:
        if s.get('id') == section_id:
            return s
    return {}


class ExcelReportExporter(BaseReportExporter):
    """Excel 导出器：日报/月报五 Sheet；年报为《数据中心年度运营分析报告》八 Sheet。"""

    def export(
        self,
        data: dict,
        period_type: str,
        start_date: date,
        end_date: date,
    ) -> tuple:
        wb = Workbook()
        meta = data.get('meta', {})
        summary = data.get('summary', {})
        scope = meta.get('scope', {})
        sections = data.get('sections', [])
        title_label = meta.get('periodLabel') or period_type

        if period_type == 'yearly':
            return self._export_yearly(wb, meta, scope, sections, start_date, end_date, title_label)
        return self._export_daily_monthly(
            wb,
            period_type,
            meta,
            summary,
            scope,
            sections,
            start_date,
            end_date,
            title_label,
        )

    def _export_yearly(
        self, wb, meta: dict, scope: dict, sections: List[dict],
        start_date: date, end_date: date, title_label: str,
    ) -> tuple:
        """年报：八 Sheet（封面与执行摘要、年度事件分析、告警年度分析、资产与设备分析、机柜与容量分析、运维工作量分析、风险与预警、年度改进与规划）。"""
        sheet_config = [
            ('yearly_cover', '封面与执行摘要'),
            ('yearly_events', '年度事件分析'),
            ('yearly_alerts', '告警年度分析'),
            ('yearly_assets', '资产与设备分析'),
            ('yearly_cabinet', '机柜与容量分析'),
            ('yearly_workload', '运维工作量分析'),
            ('yearly_risk', '风险与预警'),
            ('yearly_plan', '年度改进与规划'),
        ]
        for idx, (sid, sheet_title) in enumerate(sheet_config):
            ws = wb.active if idx == 0 else wb.create_sheet(title=sheet_title[:31])
            if idx > 0:
                ws = wb.worksheets[idx]
            ws.title = sheet_title[:31]
            row = 1
            ws.cell(row=row, column=1, value='数据中心年度运营分析报告')
            apply_title_style(ws.cell(row=row, column=1))
            row += 1
            ws.cell(row=row, column=1, value='报告周期：{} 至 {}'.format(
                meta.get('startDate', ''), meta.get('endDate', '')))
            row += 1
            ws.cell(row=row, column=1, value='数据中心名称：{}'.format(meta.get('datacenterName') or '—'))
            row += 1
            ws.cell(row=row, column=1, value='生成时间：{}'.format(meta.get('generatedAt', '')))
            row += 1
            if scope.get('clientId') or scope.get('clientName'):
                ws.cell(row=row, column=1, value='客户：{}'.format(scope.get('clientName') or scope.get('clientId')))
                row += 1
            if scope.get('cabinetId') or scope.get('cabinetName'):
                ws.cell(row=row, column=1, value='机柜：{}'.format(scope.get('cabinetName') or scope.get('cabinetId')))
                row += 1
            apply_metadata_block_style(ws, 2, row)
            row += 1
            sec = _get_section_by_id(sections, sid)
            if sec and sec.get('tables'):
                for tbl in sec['tables']:
                    row = write_table(ws, row, tbl.get('headers', []), tbl.get('rows', []))
            set_sheet_print_options(ws)
        buffer = BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        filename = '{}_{}_{}.xlsx'.format(title_label, start_date.isoformat(), end_date.isoformat())
        return filename, buffer

    def _export_daily_monthly(
        self,
        wb,
        period_type: str,
        meta: dict,
        summary: dict,
        scope: dict,
        sections: List[dict],
        start_date: date,
        end_date: date,
        title_label: str,
    ) -> tuple:
        """日报/月报：五 Sheet（总览、事件统计、告警统计、设备变化、人员统计）。"""
        ws1 = wb.active
        ws1.title = '总览'
        row = 1
        ws1.cell(row=row, column=1, value='数据中心运维' + str(title_label))
        apply_title_style(ws1.cell(row=row, column=1))
        row += 1
        ws1.cell(row=row, column=1, value='统计周期：{} 至 {}'.format(
            meta.get('startDate', ''), meta.get('endDate', '')))
        row += 1
        ws1.cell(row=row, column=1, value='生成时间：{}'.format(meta.get('generatedAt', '')))
        row += 1
        if scope.get('clientId') or scope.get('clientName'):
            ws1.cell(row=row, column=1, value='客户：{}'.format(scope.get('clientName') or scope.get('clientId')))
            row += 1
        if scope.get('cabinetId') or scope.get('cabinetName'):
            ws1.cell(row=row, column=1, value='机柜：{}'.format(scope.get('cabinetName') or scope.get('cabinetId')))
            row += 1
        apply_metadata_block_style(ws1, 2, row)
        row += 1
        kpi_headers = ['指标名称', '本期数值']
        kpi_rows = [
            ['事件总数', summary.get('eventCount', 0)],
            ['告警总数', summary.get('alertCount', 0)],
            ['本期新增设备', summary.get('deviceNewInPeriod', 0)],
            ['本期下架设备', summary.get('deviceDecommissionedInPeriod', 0)],
            ['设备净变动', (summary.get('deviceNewInPeriod', 0) or 0) - (summary.get('deviceDecommissionedInPeriod', 0) or 0)],
            ['事件完成率(%)', summary.get('eventCompletionRate', 0)],
            ['仓库入库笔数', summary.get('warehouseInCount', 0)],
            ['仓库上架笔数', summary.get('warehouseInstallCount', 0)],
            ['仓库出库笔数', summary.get('warehouseOutCount', 0)],
        ]
        row = write_table(ws1, row, kpi_headers, kpi_rows)

        ws2 = wb.create_sheet(title='事件统计')
        r = 1
        for sid, title in [('events_by_date', '按日期统计'), ('events_by_client', '按客户统计'), ('events_by_room', '按机房统计')]:
            sec = _get_section_by_id(sections, sid)
            if sec and sec.get('tables'):
                tbl = sec['tables'][0]
                ws2.cell(row=r, column=1, value=title).font = FONT_SECTION
                r += 1
                r = write_table(ws2, r, tbl.get('headers', []), tbl.get('rows', []))

        ws3 = wb.create_sheet(title='告警统计')
        sec_alerts = _get_section_by_id(sections, 'alerts')
        r = 1
        if sec_alerts.get('tables'):
            for tbl in sec_alerts['tables']:
                r = write_table(ws3, r, tbl.get('headers', []), tbl.get('rows', []))

        ws4 = wb.create_sheet(title='设备变化')
        r = 1
        for sid, title in [
            ('device_change_by_room', '机房设备数量变化'),
            ('device_new_list', '本期新增设备'),
            ('device_decommissioned_list', '本期下架设备'),
            ('warehouse', '仓库流转情况'),
        ]:
            sec = _get_section_by_id(sections, sid)
            if sec and sec.get('tables'):
                tbl = sec['tables'][0]
                ws4.cell(row=r, column=1, value=title).font = FONT_SECTION
                r += 1
                r = write_table(ws4, r, tbl.get('headers', []), tbl.get('rows', []))

        ws5 = wb.create_sheet(title='人员统计')
        r = 1
        for sid, title in [('personnel_duty', '值班人员参与次数'), ('personnel_operations', '操作次数排行'), ('personnel_entry', '进出人员统计')]:
            sec = _get_section_by_id(sections, sid)
            if sec and sec.get('tables'):
                ws5.cell(row=r, column=1, value=title).font = FONT_SECTION
                r += 1
                for tbl in sec['tables']:
                    r = write_table(ws5, r, tbl.get('headers', []), tbl.get('rows', []))

        # Sheet6：弱电风险分析（仅运维日报），复用弱电资源管理报表中的风险三块
        if period_type == 'daily':
            ws6 = wb.create_sheet(title='风险分析')
            r = 1
            risk_percent_cols = {
                'pdu_risk_high_util': {5},       # 空间利用率(%)
                # 电流预警列顺序：机柜、机房、A、B、总电流、额定、电流利用率、预警说明
                'pdu_risk_current_warning': {7},  # 电流利用率(%)
                'pdu_risk_redundancy': None,
            }
            for sid, title in [
                ('pdu_risk_high_util', '高利用率机柜'),
                ('pdu_risk_current_warning', '电流预警'),
                ('pdu_risk_redundancy', '冗余不足机柜'),
            ]:
                sec = _get_section_by_id(sections, sid)
                if sec and sec.get('tables'):
                    ws6.cell(row=r, column=1, value=title).font = FONT_SECTION
                    r += 1
                    tbl = sec['tables'][0]
                    r = write_table(
                        ws6,
                        r,
                        tbl.get('headers', []),
                        tbl.get('rows', []),
                        column_percent_cols=risk_percent_cols.get(sid),
                    )

        for ws in wb.worksheets:
            set_sheet_print_options(ws)
        buffer = BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        filename = '{}_{}_{}.xlsx'.format(title_label, start_date.isoformat(), end_date.isoformat())
        return filename, buffer
