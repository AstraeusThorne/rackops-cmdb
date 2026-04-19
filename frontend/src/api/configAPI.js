/**
 * 系统配置API
 * 提供系统配置的获取、更新等API方法
 */

import request from './axios';

/**
 * 系统配置API
 */
const configAPI = {
  /**
   * 获取所有配置
   * @returns {Promise} 配置列表Promise
   */
  getAllConfigs: () => {
    return request.get('/config/');
  },

  /**
   * 根据key获取单个配置
   * @param {string} key - 配置键
   * @returns {Promise} 配置Promise
   */
  getConfig: (key) => {
    return request.get(`/config/${key}/`);
  },

  /**
   * 按分类获取配置
   * @param {string} category - 配置分类（'alert_thresholds' 或 'display_settings'）
   * @returns {Promise} 配置对象Promise
   */
  getConfigByCategory: (category) => {
    return request.get(`/config/get_by_category/?category=${category}`);
  },

  /**
   * 获取所有配置（按分类组织）
   * @returns {Promise} 包含所有分类配置的对象Promise
   */
  getAllConfigsByCategory: async () => {
    try {
      const [alertThresholds, displaySettings] = await Promise.all([
        configAPI.getConfigByCategory('alert_thresholds'),
        configAPI.getConfigByCategory('display_settings')
      ]);

      return {
        alertThresholds: alertThresholds.data || {},
        displaySettings: displaySettings.data || {}
      };
    } catch (error) {
      console.error('获取配置失败:', error);
      return {
        alertThresholds: {},
        displaySettings: {}
      };
    }
  },

  /**
   * 创建配置
   * @param {Object} configData - 配置数据
   * @param {string} configData.key - 配置键
   * @param {string|Object} configData.value - 配置值（可以是JSON字符串或对象）
   * @param {string} configData.category - 配置分类
   * @param {string} configData.description - 描述（可选）
   * @returns {Promise} 创建结果Promise
   */
  createConfig: (configData) => {
    // 如果value是对象，转换为JSON字符串
    const data = {
      ...configData,
      value: typeof configData.value === 'object' 
        ? JSON.stringify(configData.value) 
        : configData.value
    };
    return request.post('/config/', data);
  },

  /**
   * 更新配置
   * @param {string} key - 配置键
   * @param {Object} configData - 配置数据
   * @returns {Promise} 更新结果Promise
   */
  updateConfig: (key, configData) => {
    // 如果value是对象，转换为JSON字符串
    const data = {
      ...configData,
      value: typeof configData.value === 'object' 
        ? JSON.stringify(configData.value) 
        : configData.value
    };
    return request.put(`/config/${key}/`, data);
  },

  /**
   * 批量更新配置
   * @param {Array<Object>} configs - 配置数组
   * @returns {Promise} 批量更新结果Promise
   */
  bulkUpdateConfigs: (configs) => {
    // 转换配置数组，将value对象转换为JSON字符串
    const processedConfigs = configs.map(config => ({
      ...config,
      value: typeof config.value === 'object' 
        ? JSON.stringify(config.value) 
        : config.value
    }));

    return request.post('/config/bulk_update/', {
      configs: processedConfigs
    });
  },

  /**
   * 删除配置
   * @param {string} key - 配置键
   * @returns {Promise} 删除结果Promise
   */
  deleteConfig: (key) => {
    return request.delete(`/config/${key}/`);
  },

  /**
   * 保存完整配置（批量更新）
   * @param {Object} config - 完整配置对象
   * @param {Object} config.alertThresholds - 告警阈值配置
   * @param {Object} config.displaySettings - 显示配置
   * @returns {Promise} 保存结果Promise
   */
  saveFullConfig: async (config) => {
    const configs = [];

    // 处理告警阈值配置
    if (config.alertThresholds) {
      Object.keys(config.alertThresholds).forEach(key => {
        configs.push({
          key: `alert_thresholds.${key}`,
          value: config.alertThresholds[key],
          category: 'alert_thresholds',
          description: `告警阈值配置: ${key}`
        });
      });
    }

    // 处理显示配置
    if (config.displaySettings) {
      Object.keys(config.displaySettings).forEach(key => {
        configs.push({
          key: `display_settings.${key}`,
          value: config.displaySettings[key],
          category: 'display_settings',
          description: `显示配置: ${key}`
        });
      });
    }

    return configAPI.bulkUpdateConfigs(configs);
  }
};

export default configAPI;
