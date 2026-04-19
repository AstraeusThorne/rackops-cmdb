from collections import OrderedDict

from django.core.paginator import Paginator
from rest_framework.exceptions import NotFound
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class DefaultPagination(PageNumberPagination):
    """
    默认分页器
    支持通过 `page_size` 查询参数调整每页数量，默认为 20 条。
    当请求的页码超出范围时返回 200 + 空 results，不再返回 404，便于前端分页与筛选联动。
    """

    # 默认每页条数
    page_size = 20
    # 允许前端通过 ?page_size=xx 控制每页条数
    page_size_query_param = "page_size"
    # 每页最大条数，防止一次性请求过多数据
    max_page_size = 200

    def paginate_queryset(self, queryset, request, view=None):
        """页码超出范围时返回空列表并保留 count，不抛 404。"""
        try:
            return super().paginate_queryset(queryset, request, view=view)
        except NotFound:
            page_size = self.get_page_size(request)
            paginator = Paginator(queryset, page_size)
            page_number = int(request.query_params.get(self.page_query_param, 1))
            if paginator.num_pages == 0:
                self._out_of_range_page = None
                return []
            # 构造一个「空页」对象，用于 get_paginated_response 中的 count/next/previous
            self._out_of_range_page = _EmptyPage(page_number, paginator)
            return []

    def get_paginated_response(self, data):
        """若当前为超出范围页，使用 _out_of_range_page 生成响应。"""
        if getattr(self, "_out_of_range_page", None) is not None:
            page = self._out_of_range_page
            self._out_of_range_page = None
            self.page = page  # 供 get_next_link / get_previous_link 使用
            return Response(
                OrderedDict([
                    ("count", page.paginator.count),
                    ("next", self.get_next_link()),
                    ("previous", self.get_previous_link()),
                    ("results", data),
                ])
            )
        return super().get_paginated_response(data)


class _EmptyPage:
    """用于「页码超出范围」时的占位页，仅提供分页响应所需属性。"""

    def __init__(self, number, paginator):
        self.number = number
        self.paginator = paginator
        self.object_list = []

    def has_previous(self):
        return self.number > 1

    def has_next(self):
        return self.number < self.paginator.num_pages

    def previous_page_number(self):
        return self.number - 1

    def next_page_number(self):
        return self.number + 1

