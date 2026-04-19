import React, { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import Loading from '../components/Loading/Loading';
import ProtectedRoute from '../components/ProtectedRoute';
import AdminRoute from '../components/ProtectedRoute/AdminRoute';

// 懒加载组件
const Main = lazy(() => import('../pages/Main/Main'));
const Home = lazy(() => import('../pages/Home/Home'));
const Dashboard = lazy(() => import('../pages/Dashboard/Dashboard'));
const Device = lazy(() => import('../pages/Device'));
const DecommissionedDevice = lazy(() => import('../pages/DecommissionedDevice'));
const WarehouseDevice = lazy(() => import('../pages/WarehouseDevice'));
const Cabinet = lazy(() => import('../components/Cabinet/Cabinet'));
const Event = lazy(() => import('../pages/Event/Event'));
const EventForm = lazy(() => import('../pages/Event/components/EventForm/EventForm'));
const EventEntryPersonnel = lazy(() => import('../pages/Event/components/EventEntryPersonnel/EventEntryPersonnel'));
const F1B = lazy(() => import('../pages/Room/F1B/F1B'));
const F1D = lazy(() => import('../pages/Room/F1D/F1D'));
const BackOffice = lazy(() => import('../pages/Backoffice/Backoffice'));
const BackOfficeRoom = lazy(() => import('../pages/Backoffice/components/Room/Room'));
const BackOfficeCabinet = lazy(() => import('../pages/Backoffice/components/Cabinet/Cabinet'));
const BackOfficeDutyPersonnel = lazy(() => import('../pages/Backoffice/components/DutyPersonnel/DutyPersonnel'));
const BackOfficeClient = lazy(() => import('../pages/Backoffice/components/Client/Client'));
const BackOfficeAuthorizedOrg = lazy(() => import('../pages/Backoffice/components/AuthorizedOrg/AuthorizedOrg'));
const DutyPersonnelOperations = lazy(() => import('../pages/Backoffice/components/DutyPersonnelOperations/DutyPersonnelOperations'));
const NotificationList = lazy(() => import('../pages/Notification/NotificationList'));
const DeviceAlert = lazy(() => import('../pages/DeviceAlert'));
const CreateDeviceAlert = lazy(() => import('../pages/DeviceAlert/components/CreateAlert/CreateAlert'));
const SystemConfig = lazy(() => import('../pages/SystemConfig/SystemConfig'));
const Login = lazy(() => import('../pages/Login/Login'));
const Register = lazy(() => import('../pages/Register/Register'));
const RegisterDutyPersonnel = lazy(() => import('../pages/Auth/RegisterDutyPersonnel'));
const Profile = lazy(() => import('../pages/Profile/Profile'));
const NotFound = lazy(() => import('../pages/NotFound/NotFound'));
const DutyPersonnelApproval = lazy(() => import('../pages/Backoffice/DutyPersonnelApproval'));
const HistoryViewer = lazy(() => import('../pages/Backoffice/HistoryViewer'));
const DataImport = lazy(() => import('../pages/Backoffice/components/DataImport/DataImport'));
const DataExport = lazy(() => import('../pages/Backoffice/components/DataExport/DataExport'));
const ReportManagement = lazy(() => import('../pages/ReportManagement/ReportManagement'));

// 包装组件，添加Suspense
const withSuspense = (Component) => (
  <Suspense fallback={<Loading />}>
    <Component />
  </Suspense>
);

// 包装需要认证的组件
const withAuth = (Component) => (
  <ProtectedRoute>
    {withSuspense(Component)}
  </ProtectedRoute>
);

// 包装需要管理员权限的组件
const withAdminAuth = (Component) => (
  <ProtectedRoute>
    <AdminRoute>
      {withSuspense(Component)}
    </AdminRoute>
  </ProtectedRoute>
);

const router = createBrowserRouter(
  [
  // 登录与注册路由
  {
    path: '/login',
    element: withSuspense(Login)
  },
  {
    path: '/register',
    element: withSuspense(Register)
  },
  {
    path: '/register-duty-personnel',
    element: withSuspense(RegisterDutyPersonnel)
  },
  // 主应用路由
  {
    path: '/',
    element: withAuth(Main),
    children: [
      {
        path: '/',
        element: withSuspense(Home)
      },
      {
        path: '/dashboard',
        element: withSuspense(Dashboard)
      },
      {
        path: '/report-management',
        element: withAuth(ReportManagement)
      },
      {
        path: '/device',
        element: withSuspense(Device)
      },
      {
        path: '/profile',
        element: withSuspense(Profile)
      },
      {
        path: '/decommissioned-device',
        element: withSuspense(DecommissionedDevice)
      },
      {
        path: '/warehouse-devices',
        element: withAuth(WarehouseDevice)
      },
      {
        path: '/cabinet/:id',
        element: withSuspense(Cabinet)
      },
      {
        path: '/cabinet',
        element: <Navigate to="/room/F1B" replace />
      },
      {
        path: '/event',
        children: [
          {
            path: '',
            element: <Navigate to="/event/list" replace />
          },
          {
            path: 'list',
            element: withSuspense(Event)
          },
          {
            path: 'create',
            element: withSuspense(EventForm)
          },
          {
            path: 'edit/:id',
            element: withSuspense(EventForm)
          },
          {
            path: 'entry-personnel',
            element: withSuspense(EventEntryPersonnel)
          }
        ]
      },
      {
        path: '/room',
        children: [
          {
            path: '',
            element: <Navigate to="/room/F1B" replace />
          },
          {
            path: 'F1B',
            element: withSuspense(F1B)
          },
          {
            path: 'f1b',
            element: <Navigate to="/room/F1B" replace />
          },
          {
            path: 'F1D',
            element: withSuspense(F1D)
          },
          {
            path: 'f1d',
            element: <Navigate to="/room/F1D" replace />
          }
        ]
      },
      {
        path: '/backoffice',
        children: [
          {
            path: '',
            element: withAdminAuth(BackOffice)
          },
          {
            path: 'room',
            element: withSuspense(BackOfficeRoom)
          },
          {
            path: 'cabinet',
            element: withSuspense(BackOfficeCabinet)
          },
          {
            path: 'duty-personnel',
            element: withSuspense(BackOfficeDutyPersonnel)
          },
          {
            path: 'client',
            element: withSuspense(BackOfficeClient)
          },
          {
            path: 'authorized-org',
            element: withSuspense(BackOfficeAuthorizedOrg)
          },
          {
            path: 'duty-personnel-approval',
            element: withAdminAuth(DutyPersonnelApproval)
          },
          {
            path: 'history',
            element: withAdminAuth(HistoryViewer)
          },
          {
            path: 'duty-personnel-operations',
            element: withAdminAuth(DutyPersonnelOperations)
          },
          {
            path: 'data-import',
            element: withAdminAuth(DataImport)
          },
          {
            path: 'data-export',
            element: withAdminAuth(DataExport)
          },
          {
            path: 'device',
            element: withSuspense(Device)
          },
          {
            path: 'decommissioned-device',
            element: withSuspense(DecommissionedDevice)
          },
          {
            path: 'device-alert',
            element: withSuspense(DeviceAlert)
          }
        ]
      },
      {
        path: '/device-alert',
        children: [
          {
            path: '',
            element: withSuspense(DeviceAlert)
          },
          {
            path: 'create',
            element: withSuspense(CreateDeviceAlert)
          }
        ]
      },
      {
        path: '/system-config',
        element: withAuth(SystemConfig)
      },
      {
        path: '/notifications',
        element: withAuth(NotificationList)
      },
      {
        path: '*',
        element: withSuspense(NotFound)
      }
    ]
  }
  ],
  {
    future: {
      v7_startTransition: true,
      v7_relativeSplatPath: true
    }
  }
);

export default router; 
