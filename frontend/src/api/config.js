/**
 * 统一API配置文件
 * 整合所有API相关的配置、常量和工具函数
 */

/**
 * 获取 API 基础 URL（运行时）
 * 构建时未设置 REACT_APP_API_BASE_URL 时，使用当前页面 host + 端口 8000，便于内网多 IP 访问
 */
export function getApiBaseUrl() {
  if (process.env.REACT_APP_API_BASE_URL) return process.env.REACT_APP_API_BASE_URL;
  if (typeof window !== 'undefined' && window.location?.hostname)
    return `http://${window.location.hostname}:8000/api`;
  return 'http://localhost:8000/api';
}

// API基础URL - 从环境变量或当前 host 解析（同 host 端口 8000）
export const API_BASE_URL = getApiBaseUrl();

// 环境类型
export const ENV = process.env.REACT_APP_ENV || 'development';

// 缓存时间（分钟）
export const CACHE_TIME = parseInt(process.env.REACT_APP_CACHE_TIME) || 5;

// API端点配置
export const API_ENDPOINTS = {
  // 认证相关
  AUTH: {
    LOGIN: '/auth/login/',
    REFRESH: '/auth/refresh/',
    REGISTER: '/auth/register/',
  },
  
  // 基础数据
  ROOMS: '/rooms/',
  CLIENTS: '/clients/',
  AUTHORIZED_ORGS: '/authorized-orgs/',
  CABINETS: '/cabinets/',
  DUTY_PERSONNEL: '/duty-personnel/',
  USERS: '/users/',
  
  // 设备相关
  DEVICES: '/devices/',
  DECOMMISSIONED_DEVICES: '/decommissioned-devices/',
  DEVICE_ALERTS: '/device-alerts/',
  
  // PDU相关
  PDU_DEVICES: '/pdu-devices/',
  PDU_PORTS: '/pdu-ports/',
  CABINET_PDU_DATA: '/cabinet-pdu-data/',
  
  // 事件相关
  EVENTS: '/events/',
  ENTRY_PERSONNEL: '/entry-personnel/',
  EVENT_ENTRY_PERSONNEL: '/event-entry-personnel/',
  EVENT_DEVICE: '/event-devices/',
  EVENT_DECOMMISSIONED_DEVICE: '/event-decommissioned-devices/',
};

// HTTP方法常量
export const HTTP_METHODS = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
};

// 响应状态码
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
};

// 默认请求配置
export const DEFAULT_REQUEST_CONFIG = {
  timeout: 15000, // 15秒超时
  headers: {
    'Content-Type': 'application/json',
  },
};

/**
 * 获取认证头
 */
export const getAuthHeaders = () => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    return {
      'Authorization': `Bearer ${token}`,
    };
  }
  return {};
};

/**
 * 构建完整的API URL
 */
/**
 * 开发环境下使用相对路径，请求会走当前域名（如 3000）再由 setupProxy 转发到后端，避免跨域。
 * 生产环境使用完整 API_BASE_URL。
 */
export const buildApiUrl = (endpoint) => {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (ENV === 'development' && typeof window !== 'undefined') {
    return `/api${path}`;
  }
  const base = API_BASE_URL.replace(/\/$/, '');
  return `${base}${path}`;
};

/**
 * 处理API响应
 */
export const handleApiResponse = async (response) => {
  if (!response.ok) {
    let errorData = {};
    try {
      errorData = await response.json();
    } catch (e) {
      // 如果无法解析JSON，使用默认错误信息
      errorData = { message: `HTTP Error: ${response.status}` };
    }
    
    throw new Error(errorData.message || errorData.detail || `HTTP Error: ${response.status}`);
  }
  
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return await response.json();
  }
  
  return response;
};

/**
 * 处理API错误
 */
export const handleApiError = (error) => {
  console.error('API Error:', error);
  
  if (error.message.includes('401') || error.message.includes('Unauthorized')) {
    // 处理认证失败
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    
    // 在开发环境下显示更详细的错误信息
    if (ENV === 'development') {
      console.warn('认证失败，已清除本地令牌');
    }
    
    // 可以在这里添加重定向到登录页的逻辑
    // window.location.href = '/login';
  }
  
  return {
    success: false,
    error: error.message || '请求失败',
  };
};

/**
 * 日志工具函数
 */
export const logApiCall = (endpoint, method, data = null) => {
  if (ENV === 'development') {
    console.log(`[API] ${method} ${endpoint}`, data ? { data } : '');
  }
};

/**
 * 检查网络连接
 */
export const checkNetworkStatus = () => {
  return navigator.onLine;
};

/**
 * 重试机制配置
 */
export const RETRY_CONFIG = {
  maxRetries: 3,
  retryDelay: 1000, // 1秒
  retryCondition: (error) => {
    // 网络错误或5xx服务器错误时重试
    return !error.response || (error.response.status >= 500 && error.response.status < 600);
  },
};