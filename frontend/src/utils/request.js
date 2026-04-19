/**
 * 请求工具库
 * 封装fetch请求，提供统一的错误处理和响应格式
 */

import {
  buildApiUrl,
  handleApiError,
  getAuthHeaders,
  DEFAULT_REQUEST_CONFIG,
  handleApiResponse
} from '../api/config';

/**
 * 基础请求函数
 * @param {string} endpoint - API端点
 * @param {Object} options - 请求选项
 * @returns {Promise} 请求结果
 */
const baseRequest = async (endpoint, options = {}) => {
  try {
    // 构建完整URL
    const url = buildApiUrl(endpoint);
    
    // 合并请求配置
    const config = {
      ...DEFAULT_REQUEST_CONFIG,
      ...options,
      headers: {
        ...DEFAULT_REQUEST_CONFIG.headers,
        ...getAuthHeaders(),
        ...options.headers,
      },
    };

    // 发起请求
    const response = await fetch(url, config);
    
    // 处理响应
    const data = await handleApiResponse(response);
    
    return {
      success: true,
      data,
    };
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * GET请求
 * @param {string} endpoint - API端点
 * @param {Object} params - 查询参数
 * @param {Object} options - 请求选项
 */
export const get = async (endpoint, params = {}, options = {}) => {
  // 处理查询参数
  const searchParams = new URLSearchParams();
  Object.keys(params).forEach(key => {
    if (params[key] !== undefined && params[key] !== null) {
      searchParams.append(key, params[key]);
    }
  });
  
  const queryString = searchParams.toString();
  const url = queryString ? `${endpoint}?${queryString}` : endpoint;
  
  return baseRequest(url, {
    method: 'GET',
    ...options,
  });
};

/**
 * POST请求
 * @param {string} endpoint - API端点
 * @param {Object} data - 请求数据
 * @param {Object} options - 请求选项
 */
export const post = async (endpoint, data = {}, options = {}) => {
  return baseRequest(endpoint, {
    method: 'POST',
    body: JSON.stringify(data),
    ...options,
  });
};

/**
 * PUT请求
 * @param {string} endpoint - API端点
 * @param {Object} data - 请求数据
 * @param {Object} options - 请求选项
 */
export const put = async (endpoint, data = {}, options = {}) => {
  return baseRequest(endpoint, {
    method: 'PUT',
    body: JSON.stringify(data),
    ...options,
  });
};

/**
 * PATCH请求
 * @param {string} endpoint - API端点
 * @param {Object} data - 请求数据
 * @param {Object} options - 请求选项
 */
export const patch = async (endpoint, data = {}, options = {}) => {
  return baseRequest(endpoint, {
    method: 'PATCH',
    body: JSON.stringify(data),
    ...options,
  });
};

/**
 * DELETE请求
 * @param {string} endpoint - API端点
 * @param {Object} options - 请求选项
 */
export const del = async (endpoint, options = {}) => {
  return baseRequest(endpoint, {
    method: 'DELETE',
    ...options,
  });
};

/**
 * 批量请求
 * @param {Array} requests - 请求数组
 * @returns {Promise} 所有请求的结果
 */
export const batchRequest = async (requests) => {
  try {
    const promises = requests.map(request => {
      const { method, endpoint, data, options } = request;
      
      switch (method.toLowerCase()) {
        case 'get':
          return get(endpoint, data, options);
        case 'post':
          return post(endpoint, data, options);
        case 'put':
          return put(endpoint, data, options);
        case 'patch':
          return patch(endpoint, data, options);
        case 'delete':
          return del(endpoint, options);
        default:
          throw new Error(`Unsupported method: ${method}`);
      }
    });
    
    const results = await Promise.allSettled(promises);
    
    return {
      success: true,
      data: results.map(result => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            success: false,
            error: result.reason.message,
          };
        }
      }),
    };
  } catch (error) {
    return handleApiError(error);
  }
};

/**
 * 文件上传请求
 * @param {string} endpoint - API端点
 * @param {FormData} formData - 表单数据
 * @param {Object} options - 请求选项
 */
export const uploadFile = async (endpoint, formData, options = {}) => {
  try {
    const url = buildApiUrl(endpoint);
    
    const config = {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        // 不设置Content-Type，让浏览器自动设置boundary
      },
      body: formData,
      ...options,
    };

    const response = await fetch(url, config);
    const data = await handleApiResponse(response);
    
    return {
      success: true,
      data,
    };
  } catch (error) {
    return handleApiError(error);
  }
};

// 导出默认请求对象
const requestUtils = {
  get,
  post,
  put,
  patch,
  delete: del,
  batch: batchRequest,
  upload: uploadFile,
};

export default requestUtils;