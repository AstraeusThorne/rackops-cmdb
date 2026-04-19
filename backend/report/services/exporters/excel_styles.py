"""
报表 Excel 统一格式：字体、对齐、边框、填充、数字格式等可复用样式，使报告更贴近企业级呈现。
供 excel_exporter、pdu_excel_exporter 等导出器共用。
"""
from typing import Any, List, Optional, Set

from openpyxl.utils import get_column_letter
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.worksheet import Worksheet


# ---------- 字体 ----------
FONT_TITLE = Font(bold=True, size=14)
FONT_HEADER = Font(bold=True, size=11)
FONT_BODY = Font(size=11)
FONT_SECTION = Font(bold=True, size=11)
FONT_METADATA = Font(size=10, color='404040')

# ---------- 对齐 ----------
ALIGNMENT_CENTER = Alignment(horizontal='center', vertical='center')
ALIGNMENT_LEFT = Alignment(horizontal='left', vertical='center')

# ---------- 边框（表格用） ----------
_SIDE_THIN = Side(border_style='thin', color='000000')
BORDER_TABLE = Border(
    left=_SIDE_THIN, right=_SIDE_THIN, top=_SIDE_THIN, bottom=_SIDE_THIN,
)
_SIDE_HAIR = Side(border_style='hair', color='CCCCCC')
BORDER_METADATA_BOTTOM = Border(bottom=_SIDE_THIN, left=_SIDE_HAIR, right=_SIDE_HAIR, top=_SIDE_HAIR)

# ---------- 填充 ----------
FILL_HEADER = PatternFill(fill_type='solid', start_color='E2E2E2', end_color='E2E2E2')
FILL_ROW_ALT = PatternFill(fill_type='solid', start_color='F8F8F8', end_color='F8F8F8')

# ---------- 数字格式 ----------
NUMBER_FORMAT_PERCENT = '0.0"%"'
NUMBER_FORMAT_INT = '0'
NUMBER_FORMAT_INT_THOUSANDS = '#,##0'
NUMBER_FORMAT_FLOAT = '0.00'


def set_cell_style(
    cell,
    font: Optional[Font] = None,
    alignment: Optional[Alignment] = None,
    number_format: Optional[str] = None,
    border: Optional[Border] = None,
    fill: Optional[PatternFill] = None,
) -> None:
    """
    对单个单元格应用字体、对齐、数字格式、边框、填充（不覆盖未传入的项）。
    """
    if font is not None:
        cell.font = font
    if alignment is not None:
        cell.alignment = alignment
    if number_format is not None:
        cell.number_format = number_format
    if border is not None:
        cell.border = border
    if fill is not None:
        cell.fill = fill


def apply_title_style(cell) -> None:
    """对标题单元格应用统一标题样式（加粗、14 号）。"""
    set_cell_style(cell, font=FONT_TITLE)


def apply_metadata_block_style(
    ws: Worksheet,
    start_row: int,
    end_row: int,
    *,
    num_cols: int = 1,
    border_bottom: bool = True,
) -> None:
    """
    对报告元数据区块（报告周期、生成时间等）应用企业级样式：左对齐、小号字、可选底部分隔线。
    :param ws: 工作表
    :param start_row: 起始行（1-based）
    :param end_row: 结束行（含）
    :param num_cols: 合并样式列数（通常为 1，仅第一列有内容）
    :param border_bottom: 是否在 end_row 下方画细线，与正文分隔
    """
    for r in range(start_row, end_row + 1):
        for c in range(1, num_cols + 1):
            cell = ws.cell(row=r, column=c)
            cell.font = FONT_METADATA
            cell.alignment = ALIGNMENT_LEFT
            if border_bottom and r == end_row:
                cell.border = BORDER_METADATA_BOTTOM
    if border_bottom and num_cols > 1:
        for c in range(2, num_cols + 1):
            ws.cell(row=end_row, column=c).border = BORDER_METADATA_BOTTOM


def auto_column_widths(
    ws: Worksheet,
    start_row: int,
    end_row: int,
    num_cols: int,
    *,
    start_col: int = 1,
    min_width: float = 10,
    max_width: float = 55,
    padding: float = 2,
) -> None:
    """
    按内容自动调整列宽，避免 SN、描述等长文本被截断。
    对指定范围内的每一列取单元格内容最大显示长度，设置列宽为 min(max_width, max(min_width, max_len + padding))。
    :param ws: 工作表
    :param start_row: 起始行（1-based，含表头）
    :param end_row: 结束行（含）
    :param num_cols: 列数
    :param start_col: 起始列（1-based），默认 1
    :param min_width: 最小列宽
    :param max_width: 最大列宽（避免单列过宽）
    :param padding: 在最大长度基础上增加的宽度
    """
    for c in range(1, num_cols + 1):
        col_idx = start_col + c - 1
        max_len = 0
        for r in range(start_row, end_row + 1):
            cell = ws.cell(row=r, column=col_idx)
            val = cell.value
            if val is not None and val != '':
                s = str(val).strip()
                # 英数 1 单位/字，中文约 2 单位；取加权和以便长 SN 与中文列都能适配
                length = sum(2 if '\u4e00' <= ch <= '\u9fff' else 1 for ch in s)
                max_len = max(max_len, length)
        if max_len > 0:
            w = min(max_width, max(min_width, max_len + padding))
            try:
                col_letter = get_column_letter(col_idx)
                current = ws.column_dimensions[col_letter].width
                if current is None:
                    current = 0
                ws.column_dimensions[col_letter].width = round(max(current, w), 1)
            except Exception:
                pass
    return None


def freeze_panes(ws: Worksheet, cell_ref: str) -> None:
    """
    冻结窗格，便于长表时保留表头可见。例如 freeze_panes(ws, 'A2') 冻结首行。
    :param ws: 工作表
    :param cell_ref: 冻结位置单元格引用，如 'A2' 表示冻结首行后从 A2 开始滚动
    """
    ws.freeze_panes = cell_ref


def set_sheet_print_options(
    ws: Worksheet,
    *,
    fit_to_width: int = 1,
    orientation: str = 'portrait',
    left_margin: float = 0.7,
    right_margin: float = 0.7,
    top_margin: float = 0.75,
    bottom_margin: float = 0.75,
) -> None:
    """
    设置工作表打印选项，使导出报告打印时更规整（适应宽度、页边距等）。
    :param ws: 工作表
    :param fit_to_width: 打印时缩放到多少页宽（1 表示一页宽）
    :param orientation: 'portrait' 纵向 / 'landscape' 横向
    :param left_margin, right_margin, top_margin, bottom_margin: 页边距（英寸）
    """
    ws.page_setup.orientation = orientation
    ws.page_setup.fitToWidth = fit_to_width
    ws.page_setup.fitToHeight = 0  # 高度不限制，按内容
    try:
        ws.sheet_properties.fitToPage = True
    except Exception:
        pass
    ws.page_margins.left = left_margin
    ws.page_margins.right = right_margin
    ws.page_margins.top = top_margin
    ws.page_margins.bottom = bottom_margin


def write_table(
    ws: Worksheet,
    start_row: int,
    headers: List[str],
    rows: List[List[Any]],
    *,
    start_col: int = 1,
    bold_header: bool = True,
    center: bool = True,
    body_font: Optional[Font] = None,
    column_percent_cols: Optional[Set[int]] = None,
    gap_after: int = 2,
    use_borders: bool = True,
    use_header_fill: bool = True,
    stripe_rows: bool = True,
    auto_width: bool = True,
) -> int:
    """
    写入一张表（表头 + 数据行），应用企业级格式：表头加粗、浅灰底、细边框；
    数据行居中对齐、细边框，可选斑马纹（隔行浅灰）；可选列按百分比显示。
    可选按内容自动调整列宽，避免 SN、描述等长文本被截断。

    :param ws: 目标工作表
    :param start_row: 起始行（1-based）
    :param headers: 表头列表
    :param rows: 数据行列表
    :param start_col: 起始列（1-based），默认 1，用于并排多表时从 E 列等开始
    :param bold_header: 表头是否加粗
    :param center: 是否居中对齐
    :param body_font: 数据行字体，默认 FONT_BODY
    :param column_percent_cols: 需要按百分比显示的列（1-based 列号集合），如 {2, 5}
    :param gap_after: 表结束后空几行再留给下一块
    :param use_borders: 是否为表头与数据单元格添加细边框
    :param use_header_fill: 是否为表头行添加浅灰背景
    :param stripe_rows: 是否为数据行隔行添加浅灰背景（斑马纹）
    :param auto_width: 是否按内容自动调整列宽（推荐开启，避免长 SN 等被截断）
    :return: 下一张表建议起始行（表结束行 + gap_after）
    """
    alignment = ALIGNMENT_CENTER if center else ALIGNMENT_LEFT
    body_font = body_font or FONT_BODY
    column_percent_cols = column_percent_cols or set()
    border = BORDER_TABLE if use_borders else None
    header_fill = FILL_HEADER if use_header_fill else None
    table_start_row = start_row

    for c, h in enumerate(headers, 1):
        cell = ws.cell(row=start_row, column=start_col + c - 1, value=h)
        if bold_header:
            cell.font = FONT_HEADER
        cell.alignment = alignment
        if border:
            cell.border = border
        if header_fill:
            cell.fill = header_fill
    start_row += 1

    for row_idx, r in enumerate(rows):
        row_fill = (FILL_ROW_ALT if stripe_rows and row_idx % 2 == 1 else None)
        for c, val in enumerate(r, 1):
            cell = ws.cell(row=start_row, column=start_col + c - 1, value=val)
            cell.font = body_font
            cell.alignment = alignment
            if border:
                cell.border = border
            if row_fill:
                cell.fill = row_fill
            if c in column_percent_cols and val is not None and val != '':
                cell.number_format = NUMBER_FORMAT_PERCENT
        start_row += 1

    if auto_width and len(headers) > 0 and (start_row - 1) >= table_start_row:
        auto_column_widths(
            ws, table_start_row, start_row - 1, len(headers),
            start_col=start_col, min_width=10, max_width=55, padding=2,
        )
    return start_row + gap_after
