"""
报表 ViewSet：生成报表（JSON）或导出文件（Excel/PDF）。
"""
import logging
from typing import Optional

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.http import HttpResponse
from django.conf import settings

from .serializers import ReportGenerateSerializer
from .services.report_service import ReportService

logger = logging.getLogger(__name__)


class ReportViewSet(viewsets.ViewSet):
    """
    报表生成与导出。

    - POST/GET /api/reports/generate/：生成报表，返回 JSON 或触发文件下载。
      参数：period_type, start_date, end_date, format, client_id?, cabinet_id?, cabinet_ids?
    """

    permission_classes = [IsAuthenticated]
    _service: Optional[ReportService] = None

    @property
    def service(self) -> ReportService:
        if self._service is None:
            ReportViewSet._service = ReportService()
        return ReportViewSet._service

    def _get_params(self, request):
        """从 GET query 或 POST body 取参数，供 generate 使用。"""
        if request.method == 'GET':
            data = {
                'period_type': request.query_params.get('period_type'),
                'start_date': request.query_params.get('start_date'),
                'end_date': request.query_params.get('end_date'),
                'format': request.query_params.get('format', 'json'),
                'client_id': request.query_params.get('client_id'),
                'cabinet_id': request.query_params.get('cabinet_id'),
                'cabinet_ids': request.query_params.getlist('cabinet_ids'),
            }
            # 去掉空字符串，让 serializer 用 default
            for k in list(data):
                if data[k] in (None, '', []):
                    del data[k]
            return data
        return request.data

    @action(detail=False, methods=['get', 'post'], url_path='generate')
    def generate(self, request):
        """
        生成报表。GET/POST 均可，参数一致。

        - format=json：返回 ReportData JSON（供 BI 或前端使用）。
        - format=excel：返回 .xlsx 文件流。
        - format=pdf：返回 .pdf 文件流。
        """
        params = self._get_params(request)
        serializer = ReportGenerateSerializer(data=params)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        period_type = data['period_type']
        start_date = data['start_date']
        end_date = data['end_date']
        fmt = data['format']
        client_id = data.get('client_id')
        cabinet_id = data.get('cabinet_id')
        cabinet_ids = data.get('cabinet_ids')

        try:
            result = self.service.export(
                period_type=period_type,
                start_date=start_date,
                end_date=end_date,
                format=fmt,
                client_id=client_id,
                cabinet_id=cabinet_id,
                cabinet_ids=cabinet_ids,
            )
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except RuntimeError as e:
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            logger.exception('报表生成失败: %s', e)
            body = {'detail': str(e)}
            if getattr(settings, 'DEBUG', False):
                import traceback
                body['traceback'] = traceback.format_exc()
            return Response(body, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        if fmt == 'json':
            return Response(result, status=status.HTTP_200_OK)

        filename, file_io = result
        content_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' if fmt == 'excel' else 'application/pdf'
        response = HttpResponse(file_io.read(), content_type=content_type)
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
