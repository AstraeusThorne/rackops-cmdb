import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import useAuth from '../../hooks/useAuth';

/**
 * 受保护路由组件，用于保护需要登录的路由
 * @param {Object} props - 组件属性
 * @param {ReactNode} props.children - 子组件
 * @returns {JSX.Element} 路由组件
 */
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  // 如果正在加载用户信息，显示加载状态
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin 
          size="large" 
          tip="加载中..." 
          // 使用wrapperClassName并设置为nest模式以修复警告
          wrapperClassName="custom-loading-wrapper"
        >
          <div className="content-placeholder" style={{ padding: '50px', textAlign: 'center' }}></div>
        </Spin>
      </div>
    );
  }

  // 如果用户未登录，重定向到登录页面，并记录原始请求URL
  if (!isAuthenticated()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 用户已登录，渲染受保护的组件
  return children;
};

export default ProtectedRoute; 