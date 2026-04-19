import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { message } from 'antd';
import useAuth from '../../hooks/useAuth';

/**
 * 管理员权限路由守卫
 * 只有管理员可以访问
 */
const AdminRoute = ({ children }) => {
  const { user } = useAuth();

  useEffect(() => {
    // 如果用户已登录但不是管理员，显示提示
    if (user && !user.is_staff && !user.is_superuser) {
      message.warning('权限不足：只有管理员可以访问此页面');
    }
  }, [user]);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!user.is_staff && !user.is_superuser) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default AdminRoute;

