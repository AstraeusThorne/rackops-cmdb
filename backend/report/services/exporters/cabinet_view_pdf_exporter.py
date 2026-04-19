"""
机柜视图 PDF 导出器。
"""
from __future__ import annotations

from datetime import date
from io import BytesIO
from typing import Any

from .base import BaseReportExporter
from .pdf_utils import get_pdf_font_name, safe_str

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.units import cm
    from reportlab.platypus import Flowable, PageBreak, SimpleDocTemplate
    _REPORTLAB_AVAILABLE = True
except ImportError:
    colors = None
    A4 = None
    landscape = None
    cm = None
    SimpleDocTemplate = None
    PageBreak = None
    Flowable = object
    _REPORTLAB_AVAILABLE = False

TOTAL_RACK_UNITS = 42
OUTER_PADDING = 0.24 * cm if cm else 0

DEVICE_COLORS = {
    'server': colors.HexColor('#CDEBFF') if colors else None,
    'switch': colors.HexColor('#DDF5D7') if colors else None,
    'router': colors.HexColor('#FFE7C2') if colors else None,
    'firewall': colors.HexColor('#FFD8D8') if colors else None,
    'storage': colors.HexColor('#E6D9FF') if colors else None,
    'ups': colors.HexColor('#FFF1B8') if colors else None,
    'pdu': colors.HexColor('#D6F5F3') if colors else None,
    'other': colors.HexColor('#E5E7EB') if colors else None,
}


def _truncate_text(canvas_obj, text: str, max_width: float, font_name: str, font_size: int) -> str:
    """根据实际宽度裁剪文本，避免绘制溢出。"""
    text = safe_str(text)
    if not text:
        return ''
    if canvas_obj.stringWidth(text, font_name, font_size) <= max_width:
        return text

    suffix = '...'
    trimmed = text
    while trimmed and canvas_obj.stringWidth(trimmed + suffix, font_name, font_size) > max_width:
        trimmed = trimmed[:-1]
    return (trimmed + suffix) if trimmed else suffix


def _draw_panel(canvas_obj, x: float, y: float, width: float, height: float, *, fill_color, stroke_color, radius: float = 12, line_width: float = 0.8) -> None:
    """绘制带圆角的面板。"""
    canvas_obj.saveState()
    canvas_obj.setFillColor(fill_color)
    canvas_obj.setStrokeColor(stroke_color)
    canvas_obj.setLineWidth(line_width)
    canvas_obj.roundRect(x, y, width, height, radius, stroke=1, fill=1)
    canvas_obj.restoreState()


def _draw_stat_card(
    canvas_obj,
    *,
    x: float,
    y: float,
    width: float,
    height: float,
    label: str,
    value: str,
    font_name: str,
    fill_color,
    accent_color,
) -> None:
    """绘制顶部统计卡片。"""
    _draw_panel(
        canvas_obj,
        x,
        y,
        width,
        height,
        fill_color=fill_color,
        stroke_color=colors.HexColor('#D8E3F0'),
        radius=10,
        line_width=0.7,
    )
    canvas_obj.setFillColor(colors.HexColor('#5B6B82'))
    canvas_obj.setFont(font_name, 8)
    canvas_obj.drawString(x + 0.28 * cm, y + height - 0.46 * cm, label)

    canvas_obj.setFillColor(accent_color)
    canvas_obj.setFont(font_name, 13)
    canvas_obj.drawString(x + 0.28 * cm, y + 0.38 * cm, value)


def _draw_footer(canvas_obj, *, width: float, font_name: str, footer_text: str, page_text: str) -> None:
    """绘制页脚。"""
    footer_y = 0.48 * cm
    canvas_obj.setStrokeColor(colors.HexColor('#D8E3F0'))
    canvas_obj.setLineWidth(0.6)
    canvas_obj.line(OUTER_PADDING, footer_y + 0.22 * cm, width - OUTER_PADDING, footer_y + 0.22 * cm)

    canvas_obj.setFillColor(colors.HexColor('#7B8794'))
    canvas_obj.setFont(font_name, 7)
    canvas_obj.drawString(OUTER_PADDING, footer_y, footer_text)
    canvas_obj.drawRightString(width - OUTER_PADDING, footer_y, page_text)


def _draw_color_chip(canvas_obj, x: float, y: float, label: str, chip_color, font_name: str) -> float:
    """绘制图例色块并返回下一个 x 坐标。"""
    chip_width = 0.22 * cm
    chip_height = 0.22 * cm
    canvas_obj.setFillColor(chip_color)
    canvas_obj.setStrokeColor(colors.HexColor('#9AA7B8'))
    canvas_obj.rect(x, y - 0.14 * cm, chip_width, chip_height, fill=1, stroke=1)
    canvas_obj.setFillColor(colors.HexColor('#52606D'))
    canvas_obj.setFont(font_name, 7)
    canvas_obj.drawString(x + 0.32 * cm, y - 0.09 * cm, label)
    return x + 0.32 * cm + canvas_obj.stringWidth(label, font_name, 7) + 0.5 * cm


def _rack_slot_y(rack_y: float, unit_height: float, u_number: int) -> float:
    """返回指定 U 位格子的底部坐标，按现场习惯让 42U 位于顶部。"""
    normalized_u = max(1, min(int(u_number), TOTAL_RACK_UNITS))
    return rack_y + (normalized_u - 1) * unit_height


def _build_overview_context(data: dict[str, Any]) -> dict[str, Any]:
    """构建总览页所需统计。"""
    cabinet_views = data.get('cabinetViews') or []
    meta = data.get('meta') or {}
    scope = meta.get('scope') or {}

    client_names = sorted(
        {
            safe_str(item.get('clientName'))
            for item in cabinet_views
            if safe_str(item.get('clientName')) not in ('', '-')
        }
    )
    room_names = sorted(
        {
            safe_str(item.get('roomName'))
            for item in cabinet_views
            if safe_str(item.get('roomName')) not in ('', '-')
        }
    )
    total_units = sum(int(item.get('totalUnits') or TOTAL_RACK_UNITS) for item in cabinet_views)
    used_units = sum(int(item.get('usedUnits') or 0) for item in cabinet_views)
    total_devices = sum(len(item.get('devices') or []) for item in cabinet_views)
    empty_cabinet_count = sum(1 for item in cabinet_views if not (item.get('devices') or []))

    if scope.get('clientId'):
        selection_mode = '按客户筛选'
    elif scope.get('cabinetIds'):
        selection_mode = '指定机柜'
    else:
        selection_mode = '全部机柜'

    return {
        'clientLabel': safe_str(scope.get('clientName')) or (client_names[0] if len(client_names) == 1 else ('多个客户' if client_names else '未绑定客户')),
        'roomCount': len(room_names),
        'cabinetCount': len(cabinet_views),
        'deviceCount': total_devices,
        'usedUnits': used_units,
        'totalUnits': total_units,
        'availableUnits': max(total_units - used_units, 0),
        'utilizationRate': round((used_units / total_units) * 100, 1) if total_units else 0,
        'emptyCabinetCount': empty_cabinet_count,
        'selectionMode': selection_mode,
        'generatedAt': safe_str(meta.get('generatedAt')),
        'cabinetViews': cabinet_views,
    }


class OverviewPageFlowable(Flowable):
    """多机柜导出时的总览页。"""

    def __init__(
        self,
        *,
        overview: dict[str, Any],
        font_name: str,
        width: float,
        height: float,
        page_number: int,
        page_total: int,
    ) -> None:
        super().__init__()
        self.overview = overview
        self.font_name = font_name
        self.width = width
        self.height = height
        self.page_number = page_number
        self.page_total = page_total

    def wrap(self, availWidth: float, availHeight: float) -> tuple[float, float]:
        self.width = max(availWidth - 1, 1)
        self.height = max(availHeight - 1, 1)
        return self.width, self.height

    def draw(self) -> None:
        canvas_obj = self.canv
        font_name = self.font_name
        width = self.width
        height = self.height

        canvas_obj.saveState()
        canvas_obj.setFillColor(colors.white)
        canvas_obj.rect(0, 0, width, height, stroke=0, fill=1)
        canvas_obj.restoreState()

        header_height = 2.8 * cm
        stats_height = 1.7 * cm
        section_gap = 0.34 * cm
        content_y = 0.95 * cm
        content_height = height - header_height - stats_height - section_gap * 3 - content_y
        inner_width = width - OUTER_PADDING * 2

        header_y = height - header_height
        _draw_panel(
            canvas_obj,
            OUTER_PADDING,
            header_y,
            inner_width,
            header_height,
            fill_color=colors.HexColor('#F5F9FF'),
            stroke_color=colors.HexColor('#D8E3F0'),
            radius=14,
        )

        title_x = OUTER_PADDING + 0.45 * cm
        title_y = header_y + header_height - 0.8 * cm
        canvas_obj.setFillColor(colors.HexColor('#16324F'))
        canvas_obj.setFont(font_name, 19)
        canvas_obj.drawString(title_x, title_y, '机柜视图导出报告')

        canvas_obj.setFillColor(colors.HexColor('#5B6B82'))
        canvas_obj.setFont(font_name, 10)
        canvas_obj.drawString(
            title_x,
            title_y - 0.58 * cm,
            f"导出范围：{safe_str(self.overview.get('selectionMode'))}    客户：{safe_str(self.overview.get('clientLabel'))}",
        )

        canvas_obj.setFillColor(colors.HexColor('#52606D'))
        canvas_obj.setFont(font_name, 9)
        canvas_obj.drawRightString(width - OUTER_PADDING - 0.45 * cm, title_y + 0.04 * cm, f"生成时间：{safe_str(self.overview.get('generatedAt'))}")
        canvas_obj.drawRightString(width - OUTER_PADDING - 0.45 * cm, title_y - 0.54 * cm, f"第 {self.page_number}/{self.page_total} 页")

        stats_y = header_y - section_gap - stats_height
        stats_gap = 0.24 * cm
        stat_card_width = (inner_width - stats_gap * 4) / 5
        stat_defs = [
            ('客户', safe_str(self.overview.get('clientLabel')), colors.HexColor('#F7FBFF'), colors.HexColor('#1D4ED8')),
            ('机房数', safe_str(self.overview.get('roomCount')), colors.HexColor('#F6FFFB'), colors.HexColor('#047857')),
            ('机柜数', safe_str(self.overview.get('cabinetCount')), colors.HexColor('#FFFDF5'), colors.HexColor('#B45309')),
            ('设备数', safe_str(self.overview.get('deviceCount')), colors.HexColor('#FFF7FB'), colors.HexColor('#B83280')),
            ('总体利用率', f"{safe_str(self.overview.get('utilizationRate'))}%", colors.HexColor('#F7F5FF'), colors.HexColor('#6D28D9')),
        ]
        for index, (label, value, fill_color, accent_color) in enumerate(stat_defs):
            _draw_stat_card(
                canvas_obj,
                x=OUTER_PADDING + index * (stat_card_width + stats_gap),
                y=stats_y,
                width=stat_card_width,
                height=stats_height,
                label=label,
                value=value,
                font_name=font_name,
                fill_color=fill_color,
                accent_color=accent_color,
            )

        left_panel_width = min(8.2 * cm, inner_width * 0.34)
        right_panel_x = OUTER_PADDING + left_panel_width + section_gap
        right_panel_width = width - OUTER_PADDING - right_panel_x

        _draw_panel(
            canvas_obj,
            OUTER_PADDING,
            content_y,
            left_panel_width,
            content_height,
            fill_color=colors.HexColor('#FBFDFF'),
            stroke_color=colors.HexColor('#D8E3F0'),
            radius=12,
        )
        _draw_panel(
            canvas_obj,
            right_panel_x,
            content_y,
            right_panel_width,
            content_height,
            fill_color=colors.white,
            stroke_color=colors.HexColor('#D8E3F0'),
            radius=12,
        )

        left_x = OUTER_PADDING + 0.38 * cm
        top_y = content_y + content_height - 0.72 * cm
        canvas_obj.setFillColor(colors.HexColor('#243B53'))
        canvas_obj.setFont(font_name, 11)
        canvas_obj.drawString(left_x, top_y, '导出摘要')

        detail_lines = [
            ('覆盖机柜', f"{safe_str(self.overview.get('cabinetCount'))} 个"),
            ('空机柜', f"{safe_str(self.overview.get('emptyCabinetCount'))} 个"),
            ('总设备数', f"{safe_str(self.overview.get('deviceCount'))} 台"),
            ('已用 U 位', f"{safe_str(self.overview.get('usedUnits'))}/{safe_str(self.overview.get('totalUnits'))}"),
            ('空闲 U 位', safe_str(self.overview.get('availableUnits'))),
            ('说明', '后续每个机柜单独占一页，适合打印或留档。'),
        ]
        line_y = top_y - 0.8 * cm
        for label, value in detail_lines:
            canvas_obj.setFillColor(colors.HexColor('#52606D'))
            canvas_obj.setFont(font_name, 8)
            canvas_obj.drawString(left_x, line_y, label)
            canvas_obj.setFillColor(colors.HexColor('#102A43'))
            canvas_obj.setFont(font_name, 9)
            canvas_obj.drawString(left_x + 2.2 * cm, line_y, _truncate_text(canvas_obj, value, left_panel_width - 2.9 * cm, font_name, 9))
            line_y -= 0.7 * cm

        canvas_obj.setFillColor(colors.HexColor('#243B53'))
        canvas_obj.setFont(font_name, 11)
        canvas_obj.drawString(right_panel_x + 0.38 * cm, top_y, '机柜清单')
        canvas_obj.setFillColor(colors.HexColor('#7B8794'))
        canvas_obj.setFont(font_name, 7)
        canvas_obj.drawString(right_panel_x + 0.38 * cm, top_y - 0.38 * cm, '按当前导出顺序展示')

        table_x = right_panel_x + 0.38 * cm
        table_width = right_panel_width - 0.76 * cm
        table_top = top_y - 0.72 * cm
        header_row_height = 0.62 * cm
        row_height = 0.56 * cm
        col_widths = [2.3 * cm, 2.1 * cm, 2.1 * cm, 1.6 * cm, 1.6 * cm, 1.8 * cm]
        headers = ['机房', '机柜', '客户', '设备数', '已用U', '利用率']

        canvas_obj.setFillColor(colors.HexColor('#EAF2FB'))
        canvas_obj.setStrokeColor(colors.HexColor('#C9D7E6'))
        canvas_obj.roundRect(table_x, table_top - header_row_height, table_width, header_row_height, 4, stroke=1, fill=1)
        cursor_x = table_x + 0.16 * cm
        canvas_obj.setFillColor(colors.HexColor('#243B53'))
        canvas_obj.setFont(font_name, 8)
        for header, col_width in zip(headers, col_widths):
            canvas_obj.drawString(cursor_x, table_top - 0.42 * cm, header)
            cursor_x += col_width

        available_height = table_top - header_row_height - (content_y + 0.48 * cm)
        max_rows = max(int(available_height / row_height), 1)
        cabinet_views = self.overview.get('cabinetViews') or []
        canvas_obj.setFont(font_name, 7)

        for row_index, cabinet_view in enumerate(cabinet_views[:max_rows]):
            row_top = table_top - header_row_height - row_index * row_height
            row_y = row_top - row_height
            fill = colors.white if row_index % 2 == 0 else colors.HexColor('#F8FBFE')
            canvas_obj.setFillColor(fill)
            canvas_obj.setStrokeColor(colors.HexColor('#E6EDF4'))
            canvas_obj.rect(table_x, row_y, table_width, row_height, stroke=1, fill=1)

            row_values = [
                safe_str(cabinet_view.get('roomName')),
                safe_str(cabinet_view.get('cabinetName')),
                safe_str(cabinet_view.get('clientName')),
                safe_str(len(cabinet_view.get('devices') or [])),
                f"{safe_str(cabinet_view.get('usedUnits'))}/{safe_str(cabinet_view.get('totalUnits'))}",
                f"{safe_str(cabinet_view.get('utilizationRate'))}%",
            ]
            cursor_x = table_x + 0.16 * cm
            canvas_obj.setFillColor(colors.HexColor('#334E68'))
            for value, col_width in zip(row_values, col_widths):
                text = _truncate_text(canvas_obj, value, col_width - 0.28 * cm, font_name, 7)
                canvas_obj.drawString(cursor_x, row_y + 0.18 * cm, text)
                cursor_x += col_width

        if len(cabinet_views) > max_rows:
            canvas_obj.setFillColor(colors.HexColor('#7B8794'))
            canvas_obj.setFont(font_name, 7)
            canvas_obj.drawString(table_x, content_y + 0.2 * cm, f"其余 {len(cabinet_views) - max_rows} 个机柜请查看后续分页。")

        _draw_footer(
            canvas_obj,
            width=width,
            font_name=font_name,
            footer_text='说明：机柜视图按 rack_position 起始 U 位与 u_size 共同计算占用范围。',
            page_text=f"第 {self.page_number}/{self.page_total} 页",
        )


class CabinetRackFlowable(Flowable):
    """单个机柜页面的绘制组件。"""

    def __init__(
        self,
        cabinet_view: dict[str, Any],
        generated_at: str,
        cabinet_index: int,
        cabinet_total: int,
        font_name: str,
        width: float,
        height: float,
        page_number: int,
        page_total: int,
    ) -> None:
        super().__init__()
        self.cabinet_view = cabinet_view
        self.generated_at = generated_at
        self.cabinet_index = cabinet_index
        self.cabinet_total = cabinet_total
        self.font_name = font_name
        self.width = width
        self.height = height
        self.page_number = page_number
        self.page_total = page_total

    def wrap(self, availWidth: float, availHeight: float) -> tuple[float, float]:
        self.width = max(availWidth - 1, 1)
        self.height = max(availHeight - 1, 1)
        return self.width, self.height

    def draw(self) -> None:
        canvas_obj = self.canv
        font_name = self.font_name
        width = self.width
        height = self.height

        canvas_obj.saveState()
        canvas_obj.setFillColor(colors.white)
        canvas_obj.rect(0, 0, width, height, stroke=0, fill=1)
        canvas_obj.restoreState()

        header_height = 2.55 * cm
        stats_height = 1.7 * cm
        section_gap = 0.34 * cm
        footer_reserved = 0.95 * cm

        header_y = height - header_height
        inner_width = width - OUTER_PADDING * 2
        _draw_panel(
            canvas_obj,
            OUTER_PADDING,
            header_y,
            inner_width,
            header_height,
            fill_color=colors.HexColor('#F5F9FF'),
            stroke_color=colors.HexColor('#D8E3F0'),
            radius=14,
        )

        title_x = OUTER_PADDING + 0.45 * cm
        title_y = header_y + header_height - 0.78 * cm
        canvas_obj.setFillColor(colors.HexColor('#16324F'))
        canvas_obj.setFont(font_name, 18)
        canvas_obj.drawString(title_x, title_y, '机柜视图导出')

        subtitle = f"{safe_str(self.cabinet_view.get('roomName'))} / {safe_str(self.cabinet_view.get('cabinetName'))}    客户：{safe_str(self.cabinet_view.get('clientName'))}"
        canvas_obj.setFillColor(colors.HexColor('#5B6B82'))
        canvas_obj.setFont(font_name, 10)
        canvas_obj.drawString(title_x, title_y - 0.58 * cm, subtitle)

        canvas_obj.setFillColor(colors.HexColor('#52606D'))
        canvas_obj.setFont(font_name, 9)
        canvas_obj.drawRightString(width - OUTER_PADDING - 0.45 * cm, title_y + 0.05 * cm, f"第 {self.cabinet_index}/{self.cabinet_total} 个机柜")
        canvas_obj.drawRightString(width - OUTER_PADDING - 0.45 * cm, title_y - 0.25 * cm, f"导出时间：{safe_str(self.generated_at)}")
        canvas_obj.drawRightString(width - OUTER_PADDING - 0.45 * cm, title_y - 0.55 * cm, f"第 {self.page_number}/{self.page_total} 页")

        stats_y = header_y - section_gap - stats_height
        stats_gap = 0.24 * cm
        stat_card_width = (inner_width - stats_gap * 3) / 4
        stat_defs = [
            ('设备数量', safe_str(len(self.cabinet_view.get('devices', []))), colors.HexColor('#F7FBFF'), colors.HexColor('#1D4ED8')),
            ('已用 U 位', f"{safe_str(self.cabinet_view.get('usedUnits'))}/{safe_str(self.cabinet_view.get('totalUnits'))}", colors.HexColor('#F6FFFB'), colors.HexColor('#047857')),
            ('空闲 U 位', safe_str(self.cabinet_view.get('availableUnits')), colors.HexColor('#FFFDF5'), colors.HexColor('#B45309')),
            ('空间利用率', f"{safe_str(self.cabinet_view.get('utilizationRate'))}%", colors.HexColor('#FFF7FB'), colors.HexColor('#B83280')),
        ]
        for index, (label, value, fill_color, accent_color) in enumerate(stat_defs):
            _draw_stat_card(
                canvas_obj,
                x=OUTER_PADDING + index * (stat_card_width + stats_gap),
                y=stats_y,
                width=stat_card_width,
                height=stats_height,
                label=label,
                value=value,
                font_name=font_name,
                fill_color=fill_color,
                accent_color=accent_color,
            )

        main_y = footer_reserved
        main_height = stats_y - section_gap - main_y
        left_panel_width = min(11.4 * cm, inner_width * 0.41)
        right_panel_x = OUTER_PADDING + left_panel_width + section_gap
        right_panel_width = width - OUTER_PADDING - right_panel_x

        _draw_panel(
            canvas_obj,
            OUTER_PADDING,
            main_y,
            left_panel_width,
            main_height,
            fill_color=colors.HexColor('#FBFDFF'),
            stroke_color=colors.HexColor('#D8E3F0'),
            radius=12,
        )
        _draw_panel(
            canvas_obj,
            right_panel_x,
            main_y,
            right_panel_width,
            main_height,
            fill_color=colors.white,
            stroke_color=colors.HexColor('#D8E3F0'),
            radius=12,
        )

        panel_title_y = main_y + main_height - 0.7 * cm
        canvas_obj.setFillColor(colors.HexColor('#243B53'))
        canvas_obj.setFont(font_name, 11)
        canvas_obj.drawString(OUTER_PADDING + 0.38 * cm, panel_title_y, 'U 位布局')
        canvas_obj.drawString(right_panel_x + 0.38 * cm, panel_title_y, '设备清单')
        canvas_obj.setFillColor(colors.HexColor('#7B8794'))
        canvas_obj.setFont(font_name, 7)
        canvas_obj.drawString(OUTER_PADDING + 0.38 * cm, panel_title_y - 0.38 * cm, '按机柜正视图展示设备占用范围')
        canvas_obj.drawString(right_panel_x + 0.38 * cm, panel_title_y - 0.38 * cm, '按 U 位从高到低排序')

        rack_label_width = 0.95 * cm
        rack_inner_padding = 0.42 * cm
        rack_top_offset = 1.2 * cm
        rack_bottom_offset = 0.9 * cm
        rack_x = OUTER_PADDING + rack_inner_padding + rack_label_width
        rack_y = main_y + rack_bottom_offset
        rack_width = left_panel_width - rack_inner_padding * 2 - rack_label_width - 0.2 * cm
        rack_height = main_height - rack_top_offset - rack_bottom_offset
        unit_height = rack_height / TOTAL_RACK_UNITS
        devices = self.cabinet_view.get('devices') or []

        canvas_obj.setFillColor(colors.HexColor('#0F172A'))
        canvas_obj.setStrokeColor(colors.HexColor('#0F172A'))
        canvas_obj.setLineWidth(1.2)
        canvas_obj.roundRect(rack_x, rack_y, rack_width, rack_height, 6, stroke=1, fill=0)

        canvas_obj.setFillColor(colors.HexColor('#CBD5E1'))
        canvas_obj.rect(rack_x, rack_y + rack_height - 0.22 * cm, rack_width, 0.22 * cm, stroke=0, fill=1)
        canvas_obj.setFillColor(colors.HexColor('#94A3B8'))
        canvas_obj.rect(rack_x, rack_y, rack_width, 0.22 * cm, stroke=0, fill=1)

        canvas_obj.setFont(font_name, 7)
        for u_number in range(TOTAL_RACK_UNITS, 0, -1):
            slot_y = _rack_slot_y(rack_y, unit_height, u_number)
            slot_fill = colors.HexColor('#F8FAFC') if u_number % 2 == 0 else colors.white
            canvas_obj.setFillColor(slot_fill)
            canvas_obj.setStrokeColor(colors.HexColor('#E5EAF0'))
            canvas_obj.rect(rack_x + 0.02 * cm, slot_y, rack_width - 0.04 * cm, unit_height, stroke=1, fill=1)
            if u_number % 5 == 0:
                canvas_obj.setStrokeColor(colors.HexColor('#CBD5E1'))
                canvas_obj.setLineWidth(0.9)
                canvas_obj.line(rack_x, slot_y, rack_x + rack_width, slot_y)
            canvas_obj.setFillColor(colors.HexColor('#52606D'))
            canvas_obj.drawRightString(rack_x - 0.16 * cm, slot_y + (unit_height * 0.24), f"U{u_number:02d}")

        for device in devices:
            start_u = int(device.get('startU') or 1)
            end_u = int(device.get('endU') or start_u)
            block_height = max((end_u - start_u + 1) * unit_height, unit_height)
            block_y = _rack_slot_y(rack_y, unit_height, start_u)
            background = DEVICE_COLORS.get(device.get('deviceType'), DEVICE_COLORS['other'])

            canvas_obj.setFillColor(background)
            canvas_obj.setStrokeColor(colors.HexColor('#52606D'))
            canvas_obj.roundRect(
                rack_x + 0.08 * cm,
                block_y + 0.04 * cm,
                rack_width - 0.16 * cm,
                max(block_height - 0.08 * cm, 0.18 * cm),
                3,
                stroke=1,
                fill=1,
            )

            canvas_obj.setFillColor(colors.HexColor('#0F172A'))
            inner_x = rack_x + 0.18 * cm
            inner_width = rack_width - 0.36 * cm
            device_label = safe_str(device.get('deviceName'))
            position_label = safe_str(device.get('positionLabel'))
            meta_label = f"{safe_str(device.get('deviceTypeLabel'))}  {position_label}"

            if block_height >= 1.18 * cm:
                canvas_obj.setFont(font_name, 8)
                canvas_obj.drawString(inner_x, block_y + block_height - 0.34 * cm, _truncate_text(canvas_obj, device_label, inner_width, font_name, 8))
                canvas_obj.setFont(font_name, 6)
                canvas_obj.drawString(inner_x, block_y + 0.36 * cm, _truncate_text(canvas_obj, meta_label, inner_width, font_name, 6))
            elif block_height >= 0.55 * cm:
                canvas_obj.setFont(font_name, 6)
                canvas_obj.drawString(inner_x, block_y + block_height / 2 - 0.02 * cm, _truncate_text(canvas_obj, device_label, inner_width, font_name, 6))
            else:
                canvas_obj.setFont(font_name, 5)
                canvas_obj.drawString(inner_x, block_y + block_height / 2 - 0.03 * cm, _truncate_text(canvas_obj, position_label, inner_width, font_name, 5))

        if not devices:
            empty_box_width = rack_width - 1.1 * cm
            empty_box_height = 1.3 * cm
            empty_x = rack_x + (rack_width - empty_box_width) / 2
            empty_y = rack_y + (rack_height - empty_box_height) / 2
            canvas_obj.setStrokeColor(colors.HexColor('#C9D7E6'))
            canvas_obj.setFillColor(colors.HexColor('#F8FBFE'))
            canvas_obj.roundRect(empty_x, empty_y, empty_box_width, empty_box_height, 5, stroke=1, fill=1)
            canvas_obj.setFillColor(colors.HexColor('#7B8794'))
            canvas_obj.setFont(font_name, 11)
            canvas_obj.drawCentredString(rack_x + rack_width / 2, empty_y + 0.78 * cm, '空机柜')
            canvas_obj.setFont(font_name, 7)
            canvas_obj.drawCentredString(rack_x + rack_width / 2, empty_y + 0.42 * cm, '当前未检测到设备占用')

        table_x = right_panel_x + 0.38 * cm
        table_y = main_y + 0.52 * cm
        table_width = right_panel_width - 0.76 * cm
        legend_y = table_y + 0.18 * cm
        next_chip_x = table_x
        for label, device_type in [('服务器', 'server'), ('交换机', 'switch'), ('存储/其他', 'other')]:
            next_chip_x = _draw_color_chip(canvas_obj, next_chip_x, legend_y, label, DEVICE_COLORS.get(device_type, DEVICE_COLORS['other']), font_name)

        table_top = main_y + main_height - 1.38 * cm
        row_height = 0.56 * cm
        header_row_height = 0.62 * cm
        col_widths = [1.85 * cm, table_width - 7.45 * cm, 2.65 * cm, 2.0 * cm, 1.95 * cm]
        headers = ['U位', '设备', 'SN', '类型', '电源']

        canvas_obj.setFillColor(colors.HexColor('#EAF2FB'))
        canvas_obj.setStrokeColor(colors.HexColor('#C9D7E6'))
        canvas_obj.roundRect(table_x, table_top - header_row_height, table_width, header_row_height, 4, stroke=1, fill=1)
        cursor_x = table_x + 0.16 * cm
        canvas_obj.setFillColor(colors.HexColor('#243B53'))
        canvas_obj.setFont(font_name, 8)
        for header, col_width in zip(headers, col_widths):
            canvas_obj.drawString(cursor_x, table_top - 0.42 * cm, header)
            cursor_x += col_width

        available_table_height = table_top - header_row_height - (table_y + 0.42 * cm)
        max_rows = max(int(available_table_height / row_height), 1)
        canvas_obj.setFont(font_name, 7)
        if devices:
            for row_index, device in enumerate(devices[:max_rows]):
                row_top = table_top - header_row_height - row_index * row_height
                row_y = row_top - row_height
                fill = colors.white if row_index % 2 == 0 else colors.HexColor('#F8FBFE')
                canvas_obj.setFillColor(fill)
                canvas_obj.setStrokeColor(colors.HexColor('#E6EDF4'))
                canvas_obj.rect(table_x, row_y, table_width, row_height, stroke=1, fill=1)

                row_values = [
                    safe_str(device.get('positionLabel')),
                    safe_str(device.get('deviceName')),
                    safe_str(device.get('sn')),
                    safe_str(device.get('deviceTypeLabel')),
                    safe_str(device.get('powerTypeLabel')),
                ]
                cursor_x = table_x + 0.16 * cm
                canvas_obj.setFillColor(colors.HexColor('#334E68'))
                for value, col_width in zip(row_values, col_widths):
                    text = _truncate_text(canvas_obj, value, col_width - 0.28 * cm, font_name, 7)
                    canvas_obj.drawString(cursor_x, row_y + 0.18 * cm, text)
                    cursor_x += col_width

            if len(devices) > max_rows:
                canvas_obj.setFillColor(colors.HexColor('#7B8794'))
                canvas_obj.setFont(font_name, 7)
                canvas_obj.drawString(table_x, table_y, f"其余 {len(devices) - max_rows} 台设备未展开显示，可结合左侧机柜图查看完整布局。")
        else:
            empty_y = table_top - 1.6 * cm
            canvas_obj.setFillColor(colors.HexColor('#7B8794'))
            canvas_obj.setFont(font_name, 9)
            canvas_obj.drawString(table_x, empty_y, '当前机柜暂无设备。')

        _draw_footer(
            canvas_obj,
            width=width,
            font_name=font_name,
            footer_text='说明：rack_position 按起始 U 位处理，并结合 u_size 计算设备占用范围；多机柜导出时每个机柜单独分页。',
            page_text=f"第 {self.page_number}/{self.page_total} 页",
        )


class CabinetViewPDFExporter(BaseReportExporter):
    """多机柜机柜视图 PDF 导出器。"""

    def export(
        self,
        data: dict[str, Any],
        period_type: str,
        start_date: date,
        end_date: date,
    ) -> tuple[str, BytesIO]:
        if not _REPORTLAB_AVAILABLE:
            raise RuntimeError('reportlab is required for PDF export. pip install reportlab')

        cabinet_views = data.get('cabinetViews') or []
        if not cabinet_views:
            raise ValueError('未找到可导出的机柜视图数据。')

        overview = _build_overview_context(data)
        show_overview_page = len(cabinet_views) > 1 or bool((data.get('meta') or {}).get('scope', {}).get('clientId'))

        font_name = get_pdf_font_name()
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=landscape(A4),
            leftMargin=0.8 * cm,
            rightMargin=0.8 * cm,
            topMargin=0.8 * cm,
            bottomMargin=0.8 * cm,
        )

        story = []
        generated_at = safe_str((data.get('meta') or {}).get('generatedAt'))
        page_width, page_height = landscape(A4)
        flowable_width = page_width - doc.leftMargin - doc.rightMargin
        flowable_height = page_height - doc.topMargin - doc.bottomMargin
        page_total = len(cabinet_views) + (1 if show_overview_page else 0)

        if show_overview_page:
            story.append(
                OverviewPageFlowable(
                    overview=overview,
                    font_name=font_name,
                    width=flowable_width,
                    height=flowable_height,
                    page_number=1,
                    page_total=page_total,
                )
            )
            story.append(PageBreak())

        page_offset = 1 if show_overview_page else 0
        for index, cabinet_view in enumerate(cabinet_views, start=1):
            story.append(
                CabinetRackFlowable(
                    cabinet_view=cabinet_view,
                    generated_at=generated_at,
                    cabinet_index=index,
                    cabinet_total=len(cabinet_views),
                    font_name=font_name,
                    width=flowable_width,
                    height=flowable_height,
                    page_number=index + page_offset,
                    page_total=page_total,
                )
            )
            if index < len(cabinet_views):
                story.append(PageBreak())

        doc.build(story)
        buffer.seek(0)
        filename = f"机柜视图_{start_date.isoformat()}_{end_date.isoformat()}.pdf"
        return filename, buffer
