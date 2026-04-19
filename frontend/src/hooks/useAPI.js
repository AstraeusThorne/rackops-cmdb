import { useState, useEffect, useCallback, useRef } from 'react';
import { message } from 'antd';

/**
 * 通用API钩子
 * 提供缓存、错误处理、加载状态管理等功能
 * @param {Function} apiFunction - API函数
 * @param {Object} options - 配置选项
 */
export const useAPI = (apiFunction, options = {}) => {
  const {
    immediate = true,
    cache = false,
    cacheKey = '',
    cacheDuration = 5 * 60 * 1000, // 默认5分钟缓存
    onSuccess,
    onError,
    dependencies = []
  } = options;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);

  /**
   * 检查缓存是否有效
   */
  const checkCache = useCallback(() => {
    if (!cache || !cacheKey) return null;
    
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { data: cachedData, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < cacheDuration) {
          return cachedData;
        }
      }
    } catch (err) {
      console.warn('缓存解析失败:', err);
      sessionStorage.removeItem(cacheKey);
    }
    
    return null;
  }, [cache, cacheKey, cacheDuration]);

  /**
   * 设置缓存
   */
  const setCache = useCallback((data) => {
    if (!cache || !cacheKey) return;
    
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (err) {
      console.warn('缓存设置失败:', err);
    }
  }, [cache, cacheKey]);

  /**
   * 执行API请求
   */
  const execute = useCallback(async (...params) => {
    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // 检查缓存
    const cachedData = checkCache();
    if (cachedData) {
      setData(cachedData);
      onSuccess?.(cachedData);
      return cachedData;
    }

    // 创建新的AbortController
    abortControllerRef.current = new AbortController();
    
    setLoading(true);
    setError(null);

    try {
      const response = await apiFunction(...params, {
        signal: abortControllerRef.current.signal
      });
      
      const responseData = response.data;
      
      setData(responseData);
      setCache(responseData);
      onSuccess?.(responseData);
      
      return responseData;
    } catch (err) {
      // 如果是取消请求，不处理错误
      if (err.name === 'AbortError') {
        return;
      }
      
      setError(err);
      onError?.(err);
      
      // 统一错误处理
      const errorMessage = err.response?.data?.message || 
                          err.response?.data?.error || 
                          err.message || 
                          '请求失败';
      message.error(errorMessage);
      
      throw err;
    } finally {
      setLoading(false);
    }
  }, [apiFunction, checkCache, setCache, onSuccess, onError]);

  /**
   * 重新执行请求
   */
  const refetch = useCallback(() => {
    return execute();
  }, [execute]);

  /**
   * 清除缓存
   */
  const clearCache = useCallback(() => {
    if (cache && cacheKey) {
      sessionStorage.removeItem(cacheKey);
    }
  }, [cache, cacheKey]);

  // 自动执行
  useEffect(() => {
    if (immediate) {
      execute();
    }
    
    // 清理函数：取消请求
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [immediate, ...dependencies]);

  return { 
    data, 
    loading, 
    error, 
    execute, 
    refetch, 
    clearCache 
  };
};

/**
 * 分页钩子
 * 管理分页状态和参数
 */
export const usePagination = (initialPageSize = 20) => {
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: initialPageSize,
    total: 0,
  });

  const handleChange = useCallback((page, pageSize) => {
    setPagination(prev => ({
      ...prev,
      current: page,
      pageSize,
    }));
  }, []);

  const setTotal = useCallback((total) => {
    setPagination(prev => ({ 
      ...prev, 
      total 
    }));
  }, []);

  const reset = useCallback(() => {
    setPagination({
      current: 1,
      pageSize: initialPageSize,
      total: 0,
    });
  }, [initialPageSize]);

  return {
    pagination,
    handleChange,
    setTotal,
    reset,
  };
};

/**
 * 搜索钩子
 * 管理搜索状态和防抖
 */
export const useSearch = (onSearch, delay = 300) => {
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);

  const handleSearch = useCallback((value) => {
    setSearchText(value);
    
    // 清除之前的定时器
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    
    // 设置新的定时器
    timerRef.current = setTimeout(() => {
      setLoading(true);
      onSearch?.(value).finally(() => {
        setLoading(false);
      });
    }, delay);
  }, [onSearch, delay]);

  const clearSearch = useCallback(() => {
    setSearchText('');
    onSearch?.('');
  }, [onSearch]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return {
    searchText,
    loading,
    handleSearch,
    clearSearch,
  };
};

/**
 * 列表数据钩子
 * 整合API请求、分页、搜索功能
 */
export const useListData = (apiFunction, options = {}) => {
  const {
    pageSize = 20,
    searchDelay = 300,
    ...apiOptions
  } = options;

  const [filters, setFilters] = useState({});
  const { pagination, handleChange, setTotal, reset } = usePagination(pageSize);
  
  // API请求参数
  const apiParams = {
    page: pagination.current,
    page_size: pagination.pageSize,
    ...filters,
  };

  const {
    data: response,
    loading,
    error,
    refetch
  } = useAPI(
    () => apiFunction(apiParams),
    {
      ...apiOptions,
      dependencies: [pagination.current, pagination.pageSize, filters]
    }
  );

  // 处理搜索
  const handleSearch = useCallback(async (searchText) => {
    const newFilters = { ...filters, search: searchText };
    setFilters(newFilters);
    reset(); // 重置分页到第一页
  }, [filters, reset]);

  const { handleSearch: debouncedSearch } = useSearch(handleSearch, searchDelay);

  // 处理筛选
  const handleFilter = useCallback((key, value) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    reset(); // 重置分页到第一页
  }, [filters, reset]);

  // 更新总数
  useEffect(() => {
    if (response?.pagination?.total) {
      setTotal(response.pagination.total);
    }
  }, [response, setTotal]);

  return {
    // 数据
    data: response?.results || [],
    pagination,
    loading,
    error,
    
    // 操作方法
    handlePageChange: handleChange,
    handleSearch: debouncedSearch,
    handleFilter,
    refetch,
    
    // 状态
    filters,
  };
}; 