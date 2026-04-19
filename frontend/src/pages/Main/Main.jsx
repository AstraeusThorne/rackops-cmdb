import React from 'react';
import { Outlet } from "react-router-dom";
import { Layout } from 'antd';
import CommonAside from '../../components/CommonAside/CommonAside';
import CommonHeader from '../../components/CommonHeader/CommonHeader';
import styles from './Main.module.css';

const { Content } = Layout;

/**
 * 主布局组件
 * 包含侧边栏、顶部导航和内容区
 */
const Main = () => {
  return (
    <Layout className={styles.mainLayout}>
      <CommonAside />
      <Layout className={styles.siteLayout}>
        <CommonHeader />
        <Content
          className={styles.siteLayoutBackground}
          style={{
            margin: '24px 16px',
            padding: 24,
            minHeight: 280,
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default Main; 