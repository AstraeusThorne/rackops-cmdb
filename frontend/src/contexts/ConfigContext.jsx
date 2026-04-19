import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import configAPI from '../api/configAPI';
import {
  defaultConfig,
  getConfigFromStorage,
  saveConfigToStorage,
  mergeConfig
} from '../config/systemConfig';

/**
 * 配置上下文
 */
export const ConfigContext = createContext();

/**
 * 配置上下文提供者
 * @param {Object} props - 组件props
 * @returns {JSX.Element} 配置上下文提供者组件
 */
export const ConfigProvider = ({ children }) => {
  const [config, setConfig] = useState(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * 从API加载配置
   */
  const loadConfigFromAPI = useCallback(async () => {
    try {
      setError(null);
      const apiConfig = await configAPI.getAllConfigsByCategory();
      
      // 合并配置：API配置 > 缓存配置 > 默认配置
      const cachedConfig = getConfigFromStorage();
      const mergedConfig = mergeConfig(apiConfig, cachedConfig);
      
      setConfig(mergedConfig);
      saveConfigToStorage(mergedConfig);
      
      return mergedConfig;
    } catch (err) {
      console.error('从API加载配置失败:', err);
      setError(err.message || '加载配置失败');
      
      // API失败时使用缓存或默认配置
      const cachedConfig = getConfigFromStorage();
      if (cachedConfig) {
        const mergedConfig = mergeConfig({}, cachedConfig);
        setConfig(mergedConfig);
        return mergedConfig;
      }
      
      // 使用默认配置
      setConfig(defaultConfig);
      return defaultConfig;
    }
  }, []);

  /**
   * 初始化配置
   */
  useEffect(() => {
    const initializeConfig = async () => {
      setLoading(true);
      
      // 先使用缓存配置快速显示
      const cachedConfig = getConfigFromStorage();
      if (cachedConfig) {
        const mergedConfig = mergeConfig({}, cachedConfig);
        setConfig(mergedConfig);
      }
      
      // 然后从API加载最新配置
      await loadConfigFromAPI();
      setLoading(false);
    };

    initializeConfig();
  }, [loadConfigFromAPI]);

  /**
   * 更新配置
   * @param {Object} newConfig - 新配置对象
   * @param {boolean} saveToAPI - 是否保存到API，默认true
   */
  const updateConfig = useCallback(async (newConfig, saveToAPI = true) => {
    try {
      setError(null);
      
      // 合并新配置
      const mergedConfig = mergeConfig(newConfig, config);
      setConfig(mergedConfig);
      
      // 保存到本地缓存
      saveConfigToStorage(mergedConfig);
      
      // 保存到API
      if (saveToAPI) {
        await configAPI.saveFullConfig(mergedConfig);
      }
      
      return mergedConfig;
    } catch (err) {
      console.error('更新配置失败:', err);
      setError(err.message || '更新配置失败');
      throw err;
    }
  }, [config]);

  /**
   * 刷新配置（从API重新加载）
   */
  const refreshConfig = useCallback(async () => {
    setLoading(true);
    try {
      const newConfig = await loadConfigFromAPI();
      setLoading(false);
      return newConfig;
    } catch (err) {
      setLoading(false);
      throw err;
    }
  }, [loadConfigFromAPI]);

  /**
   * 重置配置为默认值
   */
  const resetConfig = useCallback(async () => {
    try {
      setConfig(defaultConfig);
      saveConfigToStorage(defaultConfig);
      await configAPI.saveFullConfig(defaultConfig);
    } catch (err) {
      console.error('重置配置失败:', err);
      setError(err.message || '重置配置失败');
    }
  }, []);

  /**
   * 获取告警阈值配置
   */
  const getAlertThresholds = useCallback(() => {
    return config.alertThresholds || defaultConfig.alertThresholds;
  }, [config]);

  /**
   * 获取显示配置
   */
  const getDisplaySettings = useCallback(() => {
    return config.displaySettings || defaultConfig.displaySettings;
  }, [config]);

  const value = {
    config,
    loading,
    error,
    updateConfig,
    refreshConfig,
    resetConfig,
    getAlertThresholds,
    getDisplaySettings
  };

  return (
    <ConfigContext.Provider value={value}>
      {children}
    </ConfigContext.Provider>
  );
};

/**
 * 使用配置上下文的Hook
 * @returns {Object} 配置上下文值
 */
export const useConfig = () => {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error('useConfig必须在ConfigProvider内部使用');
  }
  return context;
};

export default ConfigContext;
