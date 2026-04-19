import React from 'react';
import { Layout, Button, Space } from 'antd';
import UserMenu from '../UserMenu';
import NotificationBell from '../Notification/NotificationBell';
import useAuth from '../../hooks/useAuth';
import { Link } from 'react-router-dom';
import styles from './CommonHeader.module.css';

const { Header } = Layout;

/**
 * 顶部导航组件
 */
const CommonHeader = () => {
  const { isAuthenticated } = useAuth();

  return (
    <Header className={styles.header}>
      <div className={styles.headerRight}>
        <Space size="large">
          {isAuthenticated() ? (
            <>
              <NotificationBell />
              <UserMenu />
            </>
          ) : (
            <Space>
              <Link to="/login">
                <Button type="primary">登录</Button>
              </Link>
              <Link to="/register">
                <Button>注册</Button>
              </Link>
            </Space>
          )}
        </Space>
      </div>
    </Header>
  );
};

export default CommonHeader; 