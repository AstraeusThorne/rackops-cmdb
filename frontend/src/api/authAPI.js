import request from './axios';

/**
 * 用户登录
 * @param {Object} data - 包含用户名和密码的对象
 * @returns {Promise} - 返回登录结果
 */
export const login = (data) => {
  return request({
    url: '/auth/login/',
    method: 'post',
    data: {
      username: data.username,
      password: data.password
    }
  });
};

/**
 * 用户注册
 * @param {Object} data - 包含用户注册信息的对象
 * @returns {Promise} - 返回注册结果
 */
export const register = (data) => {
  return request({
    url: '/auth/register/',
    method: 'post',
    data
  });
};

/**
 * 刷新令牌
 * @param {string} refreshToken - 刷新令牌
 * @returns {Promise} - 返回新的访问令牌
 */
export const refreshToken = (refreshToken) => {
  return request({
    url: '/auth/refresh/',
    method: 'post',
    data: { refresh: refreshToken }
  });
};

/**
 * 获取当前用户信息
 * @returns {Promise} - 返回用户信息
 */
export const getCurrentUser = () => {
  return request({
    url: '/users/me/',
    method: 'get'
  });
};

/**
 * 修改密码
 * @param {Object} data - 包含旧密码和新密码的对象
 * @returns {Promise} - 返回修改结果
 */
export const changePassword = (data) => {
  return request({
    url: '/users/change_password/',
    method: 'put',
    data
  });
};

/**
 * 更新用户资料
 * @param {Object} data - 包含用户资料的对象
 * @returns {Promise} - 返回更新结果
 */
export const updateProfile = (data) => {
  return request({
    url: '/users/update_profile/',
    method: 'put',
    data
  });
}; 