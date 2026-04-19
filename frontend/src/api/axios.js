import axios from 'axios';
import { message } from 'antd';
import { getApiBaseUrl } from './config';

/**
 * 创建API请求实例（baseURL 随当前访问 host 解析，内网多 IP 无需重新构建）
 */
const request = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  }
});

// 请求拦截器 - 添加认证令牌
request.interceptors.request.use(
  config => {
    const token = localStorage.getItem('accessToken');
    
    if (token) {
      // 确保令牌格式正确：Bearer {token}
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// 响应拦截器
request.interceptors.response.use(
  response => {
    return response;
  },
  async error => {
    const originalRequest = error.config;
    
    // 如果是401错误且没有重试过，尝试刷新令牌
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = localStorage.getItem('refreshToken');
      
      if (refreshToken) {
        try {
          // 直接使用axios而不是request，避免循环依赖
          const response = await axios.post(`${getApiBaseUrl()}/auth/refresh/`, {
            refresh: refreshToken
          });
          
          const { access } = response.data;
          localStorage.setItem('accessToken', access);
          
          // 更新原始请求的认证头
          originalRequest.headers['Authorization'] = `Bearer ${access}`;
          return axios(originalRequest);
        } catch (err) {
          // 刷新令牌失败，清除登录信息并重定向到登录页
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('user');
          
          // 如果不在登录页，重定向到登录页
          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
        }
      }
    }
    
    // 当请求使用 responseType: 'blob' 时，5xx 返回的 JSON 错误体在 data 里是 Blob，需解析后再取 detail
    if (error.response?.data instanceof Blob && error.response.data.type?.includes('application/json')) {
      try {
        const text = await error.response.data.text();
        const parsed = JSON.parse(text);
        error.response.data = parsed;
      } catch (_) {
        // 解析失败则保持原 Blob，后续按原逻辑处理
      }
    }

    // 增强错误日志记录
    console.error('API Error:', error);
    console.error('Request URL:', originalRequest?.url);
    console.error('Request Method:', originalRequest?.method);
    console.error('Request Data:', originalRequest?.data);
    console.error('Response Status:', error.response?.status);
    console.error('Response Data:', error.response?.data);
    
    // 更全面的错误消息提取
    let errorMessage = '请求失败';
    if (error.response?.data) {
      if (typeof error.response.data === 'string') {
        errorMessage = error.response.data;
      } else if (error.response.data.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.response.data.error) {
        errorMessage = error.response.data.error;
      } else if (error.response.data.message) {
        errorMessage = error.response.data.message;
      } else if (typeof error.response.data === 'object' && !(error.response.data instanceof Blob)) {
        // 处理多字段错误（排除 Blob，因上面已把 JSON blob 转成对象）
        errorMessage = Object.entries(error.response.data)
          .filter(([k]) => k !== 'traceback')
          .map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`)
          .join('\n') || error.response.data.detail || errorMessage;
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    message.error(errorMessage);
    return Promise.reject(error);
  }
);

export default request; 