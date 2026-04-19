"""
PDF 报表导出器：使用 reportlab 生成 PDF。
"""
from datetime import date
from io import BytesIO
from typing import Any

from .base import BaseReportExporter
from .pdf_utils import get_pdf_font_name, safe_str

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
    _REPORTLAB_AVAILABLE = True
except ImportError:
    _REPORTLAB_AVAILABLE = False


class PDFReportExporter(BaseReportExporter):
    """PDF 导出器：第 1 页 meta + summary，后续每 section 一块表格。"""

    def export(
        self,
        data: dict[str, Any],
        period_type: str,
        start_date: date,
        end_date: date,
    ) -> tuple[str, BytesIO]:
        if not _REPORTLAB_AVAILABLE:
            raise RuntimeError("reportlab is required for PDF export. pip install reportlab")

        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=1.5 * cm,
            rightMargin=1.5 * cm,
            topMargin=1.5 * cm,
            bottomMargin=1.5 * cm,
        )
        styles = getSampleStyleSheet()
        font_name = get_pdf_font_name()
        title_style = ParagraphStyle(
            'ReportTitle',
            parent=styles['Heading1'],
            fontSize=16,
            spaceAfter=12,
            fontName=font_name,
        )
        heading_style = ParagraphStyle(
            'ReportHeading',
            parent=styles['Heading2'],
            fontName=font_name,
        )
        story = []

        meta = data.get('meta', {})
        summary = data.get('summary', {})
        scope = meta.get('scope', {})

        # 标题
        story.append(Paragraph(safe_str(meta.get('periodLabel', period_type)) + ' - CMDB', title_style))
        story.append(Spacer(1, 0.5 * cm))

        # Meta 表格
        meta_rows = [
            ['报表类型', safe_str(meta.get('periodLabel'))],
            ['开始日期', safe_str(meta.get('startDate'))],
            ['结束日期', safe_str(meta.get('endDate'))],
            ['生成时间', safe_str(meta.get('generatedAt'))],
        ]
        if scope.get('clientId') or scope.get('clientName'):
            meta_rows.append(['客户', safe_str(scope.get('clientName') or scope.get('clientId'))])
        if scope.get('cabinetId') or scope.get('cabinetName'):
            meta_rows.append(['机柜', safe_str(scope.get('cabinetName') or scope.get('cabinetId'))])
        t_meta = Table(meta_rows, colWidths=[4 * cm, 10 * cm])
        t_meta.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), font_name),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#E8E8E8')),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ]))
        story.append(t_meta)
        story.append(Spacer(1, 0.8 * cm))

        # 摘要（键值对，跳过复杂类型）
        story.append(Paragraph('摘要指标', heading_style))
        story.append(Spacer(1, 0.3 * cm))
        sum_rows = [['指标', '数值']]
        for k, v in summary.items():
            if k == 'deviceTypeDistribution' or isinstance(v, (dict, list)):
                continue
            sum_rows.append([safe_str(k), safe_str(v)])
        if len(sum_rows) > 1:
            t_sum = Table(sum_rows, colWidths=[5 * cm, 4 * cm])
            t_sum.setStyle(TableStyle([
                ('FONTNAME', (0, 0), (-1, -1), font_name),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#D0D0D0')),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ]))
            story.append(t_sum)
        story.append(Spacer(1, 0.8 * cm))

        # Sections
        sections = data.get('sections', [])
        for idx, section in enumerate(sections):
            if idx > 0:
                story.append(PageBreak())
            story.append(Paragraph(safe_str(section.get('title', 'Section')), heading_style))
            story.append(Spacer(1, 0.3 * cm))
            tables = section.get('tables', [])
            for tbl in tables:
                headers = tbl.get('headers', [])
                rows = tbl.get('rows', [])
                if not headers and not rows:
                    continue
                table_data = [headers] + [[safe_str(cell) for cell in row] for row in rows]
                col_count = len(headers) or (len(rows[0]) if rows else 0)
                col_width = 16 * cm / max(col_count, 1)
                t = Table(table_data, colWidths=[col_width] * col_count)
                t.setStyle(TableStyle([
                    ('FONTNAME', (0, 0), (-1, -1), font_name),
                    ('FONTSIZE', (0, 0), (-1, -1), 8),
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#D0D0D0')),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ]))
                story.append(t)
                story.append(Spacer(1, 0.5 * cm))

        doc.build(story)
        buffer.seek(0)
        # 文件名使用 periodLabel，如：运维日报_2026-02-01_2026-02-28.pdf
        period_label = (data.get('meta') or {}).get('periodLabel', period_type)
        filename = f"{period_label}_{start_date.isoformat()}_{end_date.isoformat()}.pdf"
        return filename, buffer
