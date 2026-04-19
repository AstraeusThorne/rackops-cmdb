"""
弱电资源管理月度报告 Excel 导出器：五 Sheet（资源总览、趋势分析、资源分布、风险分析、改进建议）。
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
    """从 sections 列表中按 id 取 section。"""
    for s in sections:
        if s.get('id') == section_id:
            return s
    return {}


class PduMonthlyExcelExporter(BaseReportExporter):
    """弱电资源管理月度报告 Excel 导出器：五 Sheet。"""

    def export(
        self,
        data: dict,
        period_type: str,
        start_date: date,
        end_date: date,
    ) -> tuple:
        wb = Workbook()
        meta = data.get('meta', {})
        sections = data.get('sections', [])

        # Sheet1：资源总览
        ws1 = wb.active
        ws1.title = '资源总览'
        row = 1
        title_suffix = {'power_daily': '日报', 'power_monthly': '月报', 'power_yearly': '年报'}.get(period_type, '月报')
        ws1.cell(row=row, column=1, value='数据中心机柜弱电资源管理' + title_suffix)
        apply_title_style(ws1.cell(row=row, column=1))
        row += 1
        ws1.cell(row=row, column=1, value='统计周期：{} 至 {}'.format(
            meta.get('startDate', ''), meta.get('endDate', '')))
        row += 1
        ws1.cell(row=row, column=1, value='生成时间：{}'.format(meta.get('generatedAt', '')))
        apply_metadata_block_style(ws1, 2, row)
        row += 2
        sec = _get_section_by_id(sections, 'pdu_overview')
        if sec and sec.get('tables'):
            tbl = sec['tables'][0]
            row = write_table(ws1, row, tbl.get('headers', []), tbl.get('rows', []))

        # Sheet2：趋势分析（百分比列：电流利用率趋势为 2、3 列；电流/电量趋势的环比为字符串已带%）
        ws2 = wb.create_sheet(title='趋势分析')
        r = 1
        trend_percent_cols = {
            'pdu_trend_current_util': {2, 3},   # 平均电流利用率(%)、最大电流利用率(%)
            'pdu_trend_current': None,
            'pdu_trend_energy': None,
        }
        for sid, title in [
            ('pdu_trend_current_util', '电流利用率趋势'),
            ('pdu_trend_current', '电流增长趋势'),
            ('pdu_trend_energy', '电量增长趋势'),
        ]:
            sec = _get_section_by_id(sections, sid)
            if sec and sec.get('tables'):
                ws2.cell(row=r, column=1, value=title).font = FONT_SECTION
                r += 1
                tbl = sec['tables'][0]
                r = write_table(
                    ws2, r, tbl.get('headers', []), tbl.get('rows', []),
                    column_percent_cols=trend_percent_cols.get(sid),
                )

        # Sheet3：资源分布（机房汇总：电流/空间利用率 第5、6列；机柜两路电流：电流利用率 第6列）
        ws3 = wb.create_sheet(title='资源分布')
        r = 1
        sec = _get_section_by_id(sections, 'pdu_distribution_room')
        distribution_titles = ['机房分布', '机柜两路电流']
        distribution_percent_cols = [{5, 6}, {6}]  # 电流利用率(%)、空间利用率(%)；电流利用率(%)
        if sec and sec.get('tables'):
            for idx, tbl in enumerate(sec['tables']):
                title = distribution_titles[idx] if idx < len(distribution_titles) else '表{}'.format(idx + 1)
                ws3.cell(row=r, column=1, value=title).font = FONT_SECTION
                r += 1
                pct_cols = distribution_percent_cols[idx] if idx < len(distribution_percent_cols) else None
                r = write_table(
                    ws3, r, tbl.get('headers', []), tbl.get('rows', []),
                    column_percent_cols=pct_cols,
                )

        # Sheet4：风险分析（高利用率：空间利用率 第5列；电流预警：电流利用率 第7列）
        ws4 = wb.create_sheet(title='风险分析')
        r = 1
        risk_percent_cols = {
            'pdu_risk_high_util': {5},      # 空间利用率(%)
            # 电流预警列顺序：机柜、机房、A、B、总电流、额定、电流利用率、预警说明
            'pdu_risk_current_warning': {7}, # 电流利用率(%)
            'pdu_risk_redundancy': None,
        }
        for sid, title in [
            ('pdu_risk_high_util', '高利用率机柜'),
            ('pdu_risk_current_warning', '电流预警'),
            ('pdu_risk_redundancy', '冗余不足机柜'),
        ]:
            sec = _get_section_by_id(sections, sid)
            if sec and sec.get('tables'):
                ws4.cell(row=r, column=1, value=title).font = FONT_SECTION
                r += 1
                r = write_table(
                    ws4, r, sec['tables'][0].get('headers', []), sec['tables'][0].get('rows', []),
                    column_percent_cols=risk_percent_cols.get(sid),
                )

        # Sheet5：改进建议
        ws5 = wb.create_sheet(title='改进建议')
        r = 1
        for sid, title in [
            ('pdu_recommendations_expand', '扩容建议'),
            ('pdu_recommendations_optimize', '资源优化建议'),
            ('pdu_recommendations_cable', '弱电整理建议'),
        ]:
            sec = _get_section_by_id(sections, sid)
            if sec and sec.get('tables'):
                ws5.cell(row=r, column=1, value=title).font = FONT_SECTION
                r += 1
                r = write_table(ws5, r, sec['tables'][0].get('headers', []), sec['tables'][0].get('rows', []))

        for ws in wb.worksheets:
            set_sheet_print_options(ws)
        buffer = BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        # 按周期类型命名：弱电资源管理日报/月报/年报_起止日期.xlsx
        name_map = {'power_daily': '弱电资源管理日报', 'power_monthly': '弱电资源管理月报', 'power_yearly': '弱电资源管理年报'}
        name = name_map.get(period_type, '弱电资源管理月报')
        filename = '机柜{}_{}_{}.xlsx'.format(
            name, start_date.isoformat(), end_date.isoformat())
        return filename, buffer
