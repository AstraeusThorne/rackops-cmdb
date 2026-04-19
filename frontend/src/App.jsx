import React, { Suspense } from 'react';
import { RouterProvider } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import Loading from './components/Loading/Loading';
import router from './router';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { AppProvider } from './contexts/AppContext';
import { ConfigProvider as SystemConfigProvider } from './contexts/ConfigContext';
import './App.css';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';

// 设置语言
dayjs.locale('zh-cn');

/**
 * 应用根组件
 * 集成了全局状态管理、认证、主题、国际化等功能
 */
const App = () => {
  return (
    <ErrorBoundary>
      <ConfigProvider locale={zhCN}>
        <ThemeProvider>
          <AuthProvider>
            <SystemConfigProvider>
              <AppProvider>
                <Suspense fallback={<Loading />}>
                  <RouterProvider router={router} />
                </Suspense>
              </AppProvider>
            </SystemConfigProvider>
          </AuthProvider>
        </ThemeProvider>
      </ConfigProvider>
    </ErrorBoundary>
  );
};

export default App; 