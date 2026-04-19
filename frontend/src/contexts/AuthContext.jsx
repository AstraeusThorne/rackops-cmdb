import React, { createContext, useEffect, useState } from 'react';
import { login as loginApi, getCurrentUser } from '../api/authAPI';

/**
 * 认证上下文
 */
export const AuthContext = createContext();

/**
 * 认证上下文提供者
 * @param {Object} props - 组件props
 * @returns {JSX.Element} 认证上下文提供者组件
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 初始化用户状态
  useEffect(() => {
    const initializeUser = async () => {
      const storedUser = localStorage.getItem('user');
      const token = localStorage.getItem('accessToken');

      if (storedUser && token) {
        try {
          setUser(JSON.parse(storedUser));
          
          // 验证token有效性并获取最新用户信息
          const response = await getCurrentUser();
          // axios 返回的数据在 response.data 中
          const userData = response.data || response;
          setUser(userData);
          localStorage.setItem('user', JSON.stringify(userData));
        } catch (err) {
          // 出错时清除本地存储
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('user');
          setUser(null);
        }
      } else {
        // 未找到登录信息，用户需要登录
      }
      setLoading(false);
    };

    initializeUser();
  }, []);

  /**
   * 用户登录
   * @param {Object} credentials - 登录凭证
   * @returns {Promise} 登录结果
   */
  const login = async (credentials) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await loginApi(credentials);
      // axios 返回的数据在 response.data 中
      const data = response.data || response;
      
      // 检查响应中是否包含访问令牌
      if (!data.access || !data.refresh) {
        throw new Error('登录成功但未返回有效的认证令牌');
      }
      
      // 保存令牌和用户信息
      localStorage.setItem('accessToken', data.access);
      localStorage.setItem('refreshToken', data.refresh);
      
      // 移除令牌字段后保存用户信息
      const { user: userInfo } = data;
      if (userInfo) {
      localStorage.setItem('user', JSON.stringify(userInfo));
      setUser(userInfo);
      } else {
        // 如果没有user字段，尝试从data中提取其他字段
        const rest = Object.fromEntries(
          Object.entries(data).filter(([key]) => key !== 'access' && key !== 'refresh')
        );
        localStorage.setItem('user', JSON.stringify(rest));
        setUser(rest);
      }
      
      return data;
    } catch (err) {
      if (err.response) {
        setError(err.response.data);
      }
      
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * 用户登出
   */
  const logout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    setUser(null);
  };

  /**
   * 检查用户是否已认证
   * @returns {boolean} 是否已认证
   */
  const isAuthenticated = () => {
    const isAuth = !!user && !!localStorage.getItem('accessToken');
    return isAuth;
  };

  const value = {
    user,
    loading,
    error,
    login,
    logout,
    isAuthenticated
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
