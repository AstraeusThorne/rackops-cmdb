"""
客户报表 Excel 导出器：企业级面向客户的四 Sheet 报告。

Sheet：总览、机房事件统计、设备告警统计、设备托管情况。
"""
from datetime import date
from io import BytesIO
from typing import List

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
    """从 sections 中按 id 取 section。"""
    for s in sections:
        if s.get('id') == section_id:
            return s
    return {}


class ClientReportExcelExporter(BaseReportExporter):
    """客户报表 Excel 导出器：四 Sheet，企业级格式。"""

    def export(
        self,
        data: dict,
        period_type: str,
        start_date: date,
        end_date: date,
    ) -> tuple:
        wb = Workbook()
        meta = data.get('meta', {})
        scope = meta.get('scope', {})
        sections = data.get('sections', [])
        client_name = scope.get('clientName') or ('客户#%s' % scope.get('clientId', ''))

        # 各 Sheet 共用的报告标题与元数据块
        def write_report_header(ws, row_start: int, sheet_title: str) -> int:
            r = row_start
            ws.cell(row=r, column=1, value='客户托管服务报告')
            apply_title_style(ws.cell(row=r, column=1))
            r += 1
            ws.cell(row=r, column=1, value='客户名称：{}'.format(client_name))
            r += 1
            ws.cell(row=r, column=1, value='统计周期：{} 至 {}'.format(
                meta.get('startDate', ''), meta.get('endDate', '')))
            r += 1
            ws.cell(row=r, column=1, value='生成时间：{}'.format(meta.get('generatedAt', '')))
            r += 1
            ws.cell(row=r, column=1, value='本页：{}'.format(sheet_title))
            r += 1
            apply_metadata_block_style(ws, row_start + 1, r)
            r += 2
            return r

        # Sheet1：总览
        ws1 = wb.active
        ws1.title = '总览'
        r = write_report_header(ws1, 1, '总览')
        sec_overview = _get_section_by_id(sections, 'client_overview')
        if sec_overview and sec_overview.get('tables'):
            r = write_table(ws1, r, sec_overview['tables'][0].get('headers', []), sec_overview['tables'][0].get('rows', []))

        # Sheet2：机房事件统计（按机房汇总 + 事件明细）
        ws2 = wb.create_sheet(title='机房事件统计')
        r = write_report_header(ws2, 1, '机房事件统计')
        sec_events = _get_section_by_id(sections, 'client_events_by_room')
        if sec_events and sec_events.get('tables'):
            tbl = sec_events['tables'][0]
            r = write_table(
                ws2, r, tbl.get('headers', []), tbl.get('rows', []),
                column_percent_cols={5},
            )
            if len(sec_events['tables']) > 1:
                r += 1
                ws2.cell(row=r, column=1, value='事件明细').font = FONT_SECTION
                r += 1
                tbl1 = sec_events['tables'][1]
                r = write_table(ws2, r, tbl1.get('headers', []), tbl1.get('rows', []))

        # Sheet3：设备告警统计
        ws3 = wb.create_sheet(title='设备告警统计')
        r = write_report_header(ws3, 1, '设备告警统计')
        sec_alerts = _get_section_by_id(sections, 'alerts')
        if sec_alerts and sec_alerts.get('tables'):
            for tbl in sec_alerts['tables']:
                headers = tbl.get('headers', [])
                rows = tbl.get('rows', [])
                if '占比(%)' in headers:
                    pct_col = headers.index('占比(%)') + 1
                    r = write_table(ws3, r, headers, rows, column_percent_cols={pct_col})
                else:
                    r = write_table(ws3, r, headers, rows)

        # Sheet4：设备托管情况（客户设备规模、设备分布、设备明细、设备稳定性、机柜U位使用情况）
        ws4 = wb.create_sheet(title='设备托管情况')
        r = write_report_header(ws4, 1, '设备托管情况')
        sec_hosting = _get_section_by_id(sections, 'client_hosting')
        subsection_titles = [
            '客户设备规模',
            '设备分布情况',
            '设备明细',
            '设备稳定性',
            '机柜U位使用情况',
        ]
        if sec_hosting and sec_hosting.get('tables'):
            idx = 0
            while idx < len(sec_hosting['tables']):
                tbl = sec_hosting['tables'][idx]
                title = subsection_titles[idx] if idx < len(subsection_titles) else '表%d' % (idx + 1)
                ws4.cell(row=r, column=1, value=title).font = FONT_SECTION
                # 设备分布情况与设备明细并排：左侧 A 列起，右侧 G 列起；设备稳定性、机柜U位使用情况紧接在设备分布情况下方（左侧），避免中间空一大截
                if idx == 1 and idx + 1 < len(sec_hosting['tables']):
                    ws4.cell(row=r, column=7, value=subsection_titles[2]).font = FONT_SECTION
                    r += 1
                    tbl2 = sec_hosting['tables'][idx + 1]
                    h1, rows1 = tbl.get('headers', []), tbl.get('rows', [])
                    h2, rows2 = tbl2.get('headers', []), tbl2.get('rows', [])
                    r1 = write_table(ws4, r, h1, rows1, start_col=1)
                    write_table(ws4, r, h2, rows2, start_col=7)
                    r = r1  # 下一块从左侧表下方开始，设备稳定性、机柜U位使用情况排在此处
                    idx += 2
                    continue
                r += 1
                headers = tbl.get('headers', [])
                rows = tbl.get('rows', [])
                pct_cols = set()
                if '利用率(%)' in headers:
                    pct_cols.add(headers.index('利用率(%)') + 1)
                if '电流利用率(%)' in headers:
                    pct_cols.add(headers.index('电流利用率(%)') + 1)
                if '占比(%)' in headers:
                    pct_cols.add(headers.index('占比(%)') + 1)
                r = write_table(
                    ws4, r, headers, rows,
                    column_percent_cols=pct_cols if pct_cols else None,
                )
                r += 1
                idx += 1

        # Sheet5：机柜弱电信息（独立 Sheet）
        ws5 = wb.create_sheet(title='机柜弱电信息')
        r = write_report_header(ws5, 1, '机柜弱电信息')
        sec_pdu = _get_section_by_id(sections, 'client_hosting_pdu')
        if sec_pdu and sec_pdu.get('tables'):
            for tbl in sec_pdu['tables']:
                headers = tbl.get('headers', [])
                rows = tbl.get('rows', [])
                pct_cols = set()
                if '电流利用率(%)' in headers:
                    pct_cols.add(headers.index('电流利用率(%)') + 1)
                r = write_table(
                    ws5, r, headers, rows,
                    column_percent_cols=pct_cols if pct_cols else None,
                )

        for ws in wb.worksheets:
            set_sheet_print_options(ws)
        buffer = BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        filename = '客户报表_{}_{}_{}.xlsx'.format(
            (client_name or '客户').replace('/', '-')[:20],
            start_date.isoformat(),
            end_date.isoformat(),
        )
        return filename, buffer
