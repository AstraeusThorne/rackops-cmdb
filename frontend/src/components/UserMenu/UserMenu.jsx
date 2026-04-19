import React from 'react';
import { Dropdown, Avatar, Space } from 'antd';
import { UserOutlined, LogoutOutlined, SettingOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import './UserMenu.css';

/**
 * 用户菜单组件，显示在导航栏右侧
 * @returns {JSX.Element} 用户菜单组件
 */
const UserMenu = () => {
  const { user, logout } = useAuth();

  // 用户未登录时不显示
  if (!user) return null;

  // 用户菜单项
  const menuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: <Link to="/profile">个人资料</Link>,
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: <Link to="/settings">设置</Link>,
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: logout,
    },
  ];

  return (
    <Dropdown 
      menu={{ items: menuItems }} 
      trigger={['click']} 
      placement="bottomRight"
    >
      <div className="user-menu-trigger">
        <Space>
          <Avatar
            src={user.avatar}
            icon={!user.avatar && <UserOutlined />}
            size="small"
          />
          <span className="user-menu-name">{user.username}</span>
        </Space>
      </div>
    </Dropdown>
  );
};

export default UserMenu; 