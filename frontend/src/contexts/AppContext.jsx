import React, { createContext, useContext, useReducer, useCallback } from 'react';
import { message } from 'antd';
import api from '../api';

/**
 * 应用全局状态上下文
 */
const AppContext = createContext();

/**
 * 初始状态
 */
const initialState = {
  // 数据状态
  devices: [],
  rooms: [],
  events: [],
  cabinets: [],
  
  // 加载状态
  loading: {
    devices: false,
    rooms: false,
    events: false,
    cabinets: false,
  },
  
  // 过滤条件
  filters: {
    searchText: '',
    deviceType: '',
    room: '',
    cabinet: '',
  },
  
  // 缓存信息
  cache: {
    devices: { data: null, timestamp: 0 },
    rooms: { data: null, timestamp: 0 },
    events: { data: null, timestamp: 0 },
    cabinets: { data: null, timestamp: 0 },
  },
  
  // UI状态
  ui: {
    sidebarCollapsed: false,
    theme: 'light',
  }
};

/**
 * 状态管理Reducer
 */
function appReducer(state, action) {
  switch (action.type) {
    case 'SET_DATA':
      return {
        ...state,
        [action.key]: action.payload,
        cache: {
          ...state.cache,
          [action.key]: {
            data: action.payload,
            timestamp: Date.now()
          }
        }
      };
      
    case 'SET_LOADING':
      return {
        ...state,
        loading: {
          ...state.loading,
          [action.key]: action.value
        }
      };
      
    case 'SET_FILTER':
      return {
        ...state,
        filters: {
          ...state.filters,
          [action.key]: action.value
        }
      };
      
    case 'SET_UI':
      return {
        ...state,
        ui: {
          ...state.ui,
          [action.key]: action.value
        }
      };
      
    case 'CLEAR_CACHE':
      return {
        ...state,
        cache: initialState.cache
      };
      
    case 'UPDATE_ITEM':
      return {
        ...state,
        [action.dataType]: state[action.dataType].map(item =>
          item.id === action.item.id ? { ...item, ...action.item } : item
        )
      };
      
    case 'ADD_ITEM':
      return {
        ...state,
        [action.dataType]: [...state[action.dataType], action.item]
      };
      
    case 'REMOVE_ITEM':
      return {
        ...state,
        [action.dataType]: state[action.dataType].filter(item => item.id !== action.id)
      };
      
    default:
      return state;
  }
}

/**
 * 应用状态提供者
 */
export const AppProvider = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  /**
   * 检查缓存是否有效（5分钟内）
   */
  const isCacheValid = useCallback((cacheKey) => {
    const cacheData = state.cache[cacheKey];
    return cacheData.data && (Date.now() - cacheData.timestamp < 5 * 60 * 1000);
  }, [state.cache]);

  /**
   * 通用数据获取函数
   */
  const fetchData = useCallback(async (dataType, apiFunction, useCache = true) => {
    // 检查缓存
    if (useCache && isCacheValid(dataType)) {
      return state.cache[dataType].data;
    }

    dispatch({ type: 'SET_LOADING', key: dataType, value: true });
    
    try {
      const response = await apiFunction();
      // 处理API响应数据，支持分页和直接数组格式
      const data = response.data.results || response.data || [];
      
      dispatch({ type: 'SET_DATA', key: dataType, payload: data });
      return data;
    } catch (error) {
      console.error(`获取${dataType}失败:`, error);
      message.error(`获取${dataType}失败`);
      throw error;
    } finally {
      dispatch({ type: 'SET_LOADING', key: dataType, value: false });
    }
  }, [isCacheValid, state.cache]);

  /**
   * 获取设备列表
   */
  const fetchDevices = useCallback(async (useCache = true) => {
    return fetchData('devices', api.getDevices, useCache);
  }, [fetchData]);

  /**
   * 获取机房列表
   */
  const fetchRooms = useCallback(async (useCache = true) => {
    return fetchData('rooms', api.getRooms, useCache);
  }, [fetchData]);

  /**
   * 获取事件列表
   */
  const fetchEvents = useCallback(async (useCache = true) => {
    return fetchData('events', api.getEvents, useCache);
  }, [fetchData]);

  /**
   * 获取机柜列表
   */
  const fetchCabinets = useCallback(async (useCache = true) => {
    return fetchData('cabinets', api.getCabinets, useCache);
  }, [fetchData]);

  /**
   * 添加项目
   */
  const addItem = useCallback((dataType, item) => {
    dispatch({ type: 'ADD_ITEM', dataType, item });
  }, []);

  /**
   * 更新项目
   */
  const updateItem = useCallback((dataType, item) => {
    dispatch({ type: 'UPDATE_ITEM', dataType, item });
  }, []);

  /**
   * 删除项目
   */
  const removeItem = useCallback((dataType, id) => {
    dispatch({ type: 'REMOVE_ITEM', dataType, id });
  }, []);

  /**
   * 设置加载状态
   */
  const setLoading = useCallback((key, value) => {
    dispatch({ type: 'SET_LOADING', key, value });
  }, []);

  /**
   * 设置过滤条件
   */
  const setFilter = useCallback((key, value) => {
    dispatch({ type: 'SET_FILTER', key, value });
  }, []);

  /**
   * 设置UI状态
   */
  const setUI = useCallback((key, value) => {
    dispatch({ type: 'SET_UI', key, value });
  }, []);

  /**
   * 清除缓存
   */
  const clearCache = useCallback(() => {
    dispatch({ type: 'CLEAR_CACHE' });
  }, []);

  /**
   * 刷新所有数据
   */
  const refreshAllData = useCallback(async () => {
    clearCache();
    await Promise.all([
      fetchDevices(false),
      fetchRooms(false),
      fetchEvents(false),
      fetchCabinets(false)
    ]);
  }, [clearCache, fetchDevices, fetchRooms, fetchEvents, fetchCabinets]);

  const value = {
    // 状态
    state,
    
    // 数据获取方法
    fetchDevices,
    fetchRooms,
    fetchEvents,
    fetchCabinets,
    
    // 数据操作方法
    addItem,
    updateItem,
    removeItem,
    
    // UI控制方法
    setLoading,
    setFilter,
    setUI,
    
    // 缓存管理
    clearCache,
    refreshAllData,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

/**
 * 使用应用状态的Hook
 */
export const useApp = () => {
  const context = useContext(AppContext);
  
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  
  return context;
};

/**
 * 使用设备数据的Hook
 */
export const useDevices = () => {
  const { state, fetchDevices, addItem, updateItem, removeItem } = useApp();
  
  return {
    devices: state.devices,
    loading: state.loading.devices,
    fetchDevices,
    addDevice: (device) => addItem('devices', device),
    updateDevice: (device) => updateItem('devices', device),
    removeDevice: (id) => removeItem('devices', id),
  };
};

/**
 * 使用事件数据的Hook
 */
export const useEvents = () => {
  const { state, fetchEvents, addItem, updateItem, removeItem } = useApp();
  
  return {
    events: state.events,
    loading: state.loading.events,
    fetchEvents,
    addEvent: (event) => addItem('events', event),
    updateEvent: (event) => updateItem('events', event),
    removeEvent: (id) => removeItem('events', id),
  };
};

/**
 * 使用机房数据的Hook
 */
export const useRooms = () => {
  const { state, fetchRooms, addItem, updateItem, removeItem } = useApp();
  
  return {
    rooms: state.rooms,
    loading: state.loading.rooms,
    fetchRooms,
    addRoom: (room) => addItem('rooms', room),
    updateRoom: (room) => updateItem('rooms', room),
    removeRoom: (id) => removeItem('rooms', id),
  };
};