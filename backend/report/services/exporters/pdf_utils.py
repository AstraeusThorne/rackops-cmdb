"""
PDF 导出公共工具。
"""
from __future__ import annotations

from typing import Any

_REGISTERED_FONT_NAME: str | None = None


def safe_str(value: Any) -> str:
    """转为字符串，避免 None 或其他异常值。"""
    if value is None:
        return ''
    return str(value)


def get_pdf_font_name() -> str:
    """优先使用支持中文的内置字体，失败时回退 Helvetica。"""
    global _REGISTERED_FONT_NAME
    if _REGISTERED_FONT_NAME:
        return _REGISTERED_FONT_NAME

    try:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.cidfonts import UnicodeCIDFont

        font_name = 'STSong-Light'
        if font_name not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(UnicodeCIDFont(font_name))
        _REGISTERED_FONT_NAME = font_name
    except Exception:
        _REGISTERED_FONT_NAME = 'Helvetica'

    return _REGISTERED_FONT_NAME
