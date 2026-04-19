"""
URL configuration for cmdb_project project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/4.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from rest_framework.routers import DefaultRouter
from django.urls import path, include

# Import ViewSets from all apps
from devices.views import (
    RoomViewSet, CabinetViewSet, DeviceViewSet, 
    DecommissionedDeviceViewSet, DeviceAlertViewSet,
    PDUDeviceViewSet, PDUPortViewSet, CabinetPDUDataViewSet,
    WarehouseDeviceViewSet, WarehouseDeviceHistoryViewSet
)
from events.views import (
    EventViewSet, EntryPersonnelViewSet, EventEntryPersonnelViewSet,
    EventDeviceViewSet, EventDecommissionedDeviceViewSet,
    EventWarehouseDeviceViewSet, OperationStoryImportViewSet,
    DataExportViewSet
)
from users.views import UserViewSet
from common.views import (
    ClientViewSet, AuthorizedOrgViewSet, DutyPersonnelViewSet,
    SystemConfigViewSet, ModelHistoryViewSet, NotificationViewSet, health_check
)
from report.views import ReportViewSet

# Create auth router for custom auth endpoints
auth_router = DefaultRouter()
auth_router.register(r'', UserViewSet, basename='auth')

# Create router and register viewsets
router = DefaultRouter()

# Devices app routes
router.register(r'rooms', RoomViewSet)
router.register(r'cabinets', CabinetViewSet)
router.register(r'devices', DeviceViewSet)
router.register(r'decommissioned-devices', DecommissionedDeviceViewSet)
router.register(r'device-alerts', DeviceAlertViewSet)
router.register(r'warehouse-devices', WarehouseDeviceViewSet)
router.register(r'warehouse-device-history', WarehouseDeviceHistoryViewSet)

# PDU app routes
router.register(r'pdu-devices', PDUDeviceViewSet)
router.register(r'pdu-ports', PDUPortViewSet)
router.register(r'cabinet-pdu-data', CabinetPDUDataViewSet)

# Events app routes
router.register(r'events', EventViewSet)
router.register(r'entry-personnel', EntryPersonnelViewSet)
router.register(r'event-entry-personnel', EventEntryPersonnelViewSet)
router.register(r'event-devices', EventDeviceViewSet)
router.register(r'event-decommissioned-devices', EventDecommissionedDeviceViewSet)
router.register(r'event-warehouse-devices', EventWarehouseDeviceViewSet)
router.register(r'operation-story-import', OperationStoryImportViewSet, basename='operation-story-import')
router.register(r'data-export', DataExportViewSet, basename='data-export')

# Users app routes
router.register(r'users', UserViewSet)

# Common app routes
router.register(r'clients', ClientViewSet)
router.register(r'authorized-orgs', AuthorizedOrgViewSet)
router.register(r'duty-personnel', DutyPersonnelViewSet)
router.register(r'config', SystemConfigViewSet, basename='config')
router.register(r'history', ModelHistoryViewSet, basename='history')
router.register(r'notifications', NotificationViewSet, basename='notification')
router.register(r'reports', ReportViewSet, basename='report')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/health/', health_check, name='health_check'),
    path('api/', include(router.urls)),
    path('api/auth/', include(auth_router.urls)),
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
]
