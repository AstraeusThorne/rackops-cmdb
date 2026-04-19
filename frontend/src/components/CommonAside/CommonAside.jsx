import React, { useState, useCallback, useMemo } from 'react';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  HomeOutlined,
  DesktopOutlined,
  CalendarOutlined,
  SettingOutlined,
  BankOutlined,
  DashboardOutlined,
  ApiOutlined,
  ToolOutlined,
  UserOutlined,
  HistoryOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import { Layout, Menu, Tooltip } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import styles from './CommonAside.module.css';

const { Sider } = Layout;

/**
 * 侧边栏菜单配置
 */
const getMenuItems = (isAdmin = false) => [
  {
    key: 'home',
    icon: <HomeOutlined />,
    label: '首页',
    path: '/'
  },
  {
    key: 'dashboard',
    icon: <DashboardOutlined />,
    label: '数据仪表板',
    path: '/dashboard'
  },
  {
    key: 'device',
    icon: <DesktopOutlined />,
    label: '设备管理',
    children: [
      {
        key: 'device_list',
        label: '在用设备',
        path: '/device'
      },
      {
        key: 'warehouse_device',
        label: '仓库设备',
        path: '/warehouse-devices'
      },
      {
        key: 'decommissioned_device',
        label: '下架设备',
        path: '/decommissioned-device'
      },
      {
        key: 'device_alert',
        label: '设备告警',
        path: '/device-alert'
      }
    ]
  },
  {
    key: 'event',
    icon: <CalendarOutlined />,
    label: '事件管理',
    children: [
      {
        key: 'event_list',
        label: '事件列表',
        path: '/event/list'
      },
      {
        key: 'event_entry_personnel',
        label: '进场人员',
        path: '/event/entry-personnel'
      }
    ]
  },
  {
    key: 'room',
    icon: <BankOutlined />,
    label: '机房管理',
    children: [
      {
        key: 'room_f1b',
        label: 'F1B机房',
        path: '/room/F1B'
      },
      {
        key: 'room_f1d',
        label: 'F1D机房',
        path: '/room/F1D'
      }
    ]
  },
  {
    key: 'report_management',
    icon: <FileTextOutlined />,
    label: '报表管理',
    path: '/report-management'
  },
  {
    key: 'backoffice',
    icon: <SettingOutlined />,
    label: '后台管理',
    children: [
      {
        key: 'backoffice_main',
    label: '后台管理',
    path: '/backoffice'
      },
      ...(isAdmin ? [
        {
          key: 'duty_personnel_approval',
          icon: <UserOutlined />,
          label: '值班人员审核',
          path: '/backoffice/duty-personnel-approval'
        },
        {
          key: 'history',
          icon: <HistoryOutlined />,
          label: '历史记录',
          path: '/backoffice/history'
        }
      ] : [])
    ]
  },
  {
    key: 'system_config',
    icon: <ToolOutlined />,
    label: '系统配置',
    path: '/system-config'
  },
  {
    key: 'api_test',
    icon: <ApiOutlined />,
    label: 'API测试',
    path: '/api-test'
  }
];

/**
 * 侧边栏组件
 */
const CommonAside = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // 判断是否为管理员
  const isAdmin = user && (user.is_staff === true || user.is_superuser === true);

  // 菜单项配置，使用useMemo避免重复计算
  const menuItems = useMemo(() => getMenuItems(isAdmin), [isAdmin]);

  /**
   * 切换侧边栏收缩状态
   */
  const toggleCollapsed = useCallback(() => {
    setCollapsed(prev => !prev);
  }, []);

  /**
   * 处理菜单点击
   */
  const handleMenuClick = useCallback((e) => {
    // 查找被点击的菜单项
    const findMenuPath = (items, key) => {
      for (const item of items) {
        if (item.key === key) {
          return item.path || item.key;
        }
        if (item.children) {
          const path = findMenuPath(item.children, key);
          if (path) return path;
        }
      }
      return null;
    };

    const path = findMenuPath(menuItems, e.key);
    if (path) {
      navigate(path);
    }
  }, [menuItems, navigate]);

  /**
   * 获取当前打开的子菜单
   */
  const getOpenKeys = useCallback(() => {
    const findParentKey = (items, path) => {
      for (const item of items) {
        if (item.path === path) {
          return item.key;
        }
        if (item.children) {
          for (const child of item.children) {
            if (child.path === path) {
              return item.key;
            }
          }
        }
      }
      return null;
    };

    const parentKey = findParentKey(menuItems, location.pathname);
    return parentKey ? [parentKey] : [];
  }, [menuItems, location.pathname]);

  /**
   * 获取当前选中的菜单项
   */
  const getSelectedKey = useCallback(() => {
    const findMenuKey = (items, path) => {
      for (const item of items) {
        if (item.path === path) {
          return item.key;
        }
        if (item.children) {
          for (const child of item.children) {
            if (child.path === path) {
              return child.key;
            }
          }
        }
      }
      return null;
    };

    const key = findMenuKey(menuItems, location.pathname);
    return key ? [key] : [];
  }, [menuItems, location.pathname]);

  return (
    <Sider 
      trigger={null} 
      collapsible 
      collapsed={collapsed}
      width={220}
    >
      <div className={styles.logoContainer}>
        <h3 className={styles.appName}>{!collapsed && 'CMDB'}</h3>
      </div>
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={getSelectedKey()}
        defaultOpenKeys={getOpenKeys()}
        items={menuItems}
        onClick={handleMenuClick}
      />
      <Tooltip 
        title={collapsed ? '展开菜单' : '收起菜单'} 
        placement="right"
      >
        <div className={styles.collapseButton} onClick={toggleCollapsed}>
          {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        </div>
      </Tooltip>
    </Sider>
  );
};

export default CommonAside; 