import { useState, useEffect, useCallback, useRef } from 'react';
import { message } from 'antd';
import { eventAPI } from '../api';
import dayjs from 'dayjs';

/**
 * 事件管理自定义Hook（支持服务端分页）
 * @returns {Object} 事件状态和操作方法
 */
const useEvents = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({});
  /** 用于分页时读取当前搜索条件，避免 searchParams 变化触发重复请求 */
  const searchParamsRef = useRef({});
  /** 标记是否为首次挂载，避免与初始化 useEffect 重复请求 */
  const isInitialMount = useRef(true);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });
  const { current, pageSize } = pagination;

  /**
   * 获取事件列表（支持分页）
   * @param {number} [page=1] - 页码
   * @param {number} [pageSize=10] - 每页条数
   */
  const fetchEvents = useCallback(async (page = 1, pageSize = 10) => {
    try {
      setLoading(true);
      const response = await eventAPI.getEvents({
        page,
        page_size: pageSize,
        ordering: '-date'
      });
      const eventsData = response.data.results || response.data || [];
      const total = response.data.count ?? eventsData.length;
      setPagination(prev => ({ ...prev, total }));
      // 前端再按日期+时间降序，保证同一天内按开始时间排序（最新在前）
      const sortedEvents = eventsData.sort((a, b) => {
        const dateA = new Date(a.date + ' ' + (a.start_time || '00:00'));
        const dateB = new Date(b.date + ' ' + (b.start_time || '00:00'));
        return dateB - dateA;
      });
      setEvents(sortedEvents);
    } catch (error) {
      console.error('获取事件列表失败', error);
      message.error('获取事件列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * 搜索事件（支持服务端分页）
   * @param {Object} params 搜索参数
   * @param {number} [page=1] - 页码
   * @param {number} [pageSize=10] - 每页条数
   */
  const searchEvents = useCallback(async (params, page = 1, pageSize = 10) => {
    try {
      setLoading(true);
      const nextParams = params ?? {};
      setSearchParams(nextParams);
      searchParamsRef.current = nextParams;

      // 构建查询参数（默认按日期降序，最新在前）
      const queryParams = { page, page_size: pageSize, ordering: '-date' };
      
      // 按日期范围筛选
      if (nextParams.dateRange && nextParams.dateRange.length === 2) {
        queryParams.start_date = dayjs(nextParams.dateRange[0]).format('YYYY-MM-DD');
        queryParams.end_date = dayjs(nextParams.dateRange[1]).format('YYYY-MM-DD');
      }

      // 按客户筛选（统一为数字传给后端）
      const clientId = nextParams.clientId != null && nextParams.clientId !== '' ? Number(nextParams.clientId) : null;
      if (clientId != null && !Number.isNaN(clientId)) {
        queryParams.client = clientId;
      }

      // 按机房筛选（统一为数字传给后端）
      const roomId = nextParams.roomId != null && nextParams.roomId !== '' ? Number(nextParams.roomId) : null;
      if (roomId != null && !Number.isNaN(roomId)) {
        queryParams.room = roomId;
      }

      // 按订单号筛选（去除首尾空格）
      const orderNumber = typeof nextParams.orderNumber === 'string' ? nextParams.orderNumber.trim() : nextParams.orderNumber;
      if (orderNumber) {
        queryParams.order_number = orderNumber;
      }

      // 按完成状态筛选（表单为 'true'/'false' 字符串，后端接受布尔或字符串）
      const compStatus = nextParams.completion_status;
      if (compStatus !== undefined && compStatus !== null && compStatus !== '') {
        queryParams.completion_status = compStatus === true || compStatus === 'true';
      }

      const response = await eventAPI.getEvents(queryParams);
      const eventsData = response.data.results || response.data || [];
      const total = response.data.count ?? eventsData.length;
      setPagination(prev => ({ ...prev, total }));
      
      // 前端再按日期+时间降序，保证同一天内按开始时间排序（最新在前）
      const sortedEvents = eventsData.sort((a, b) => {
        const dateA = new Date(a.date + ' ' + (a.start_time || '00:00'));
        const dateB = new Date(b.date + ' ' + (b.start_time || '00:00'));
        return dateB - dateA;
      });
      
      setEvents(sortedEvents);
    } catch (error) {
      console.error('搜索事件失败', error);
      message.error('搜索事件失败');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * 删除事件
   * @param {number} id 事件ID
   * @returns {Promise<boolean>} 是否删除成功
   */
  const deleteEvent = useCallback(async (id) => {
    try {
      setLoading(true);
      await eventAPI.deleteEvent(id);
      message.success('事件已成功删除');
      await fetchEvents(current, pageSize);
      return true;
    } catch (error) {
      console.error('删除事件失败', error);
      message.error('删除事件失败');
      return false;
    } finally {
      setLoading(false);
    }
  }, [current, fetchEvents, pageSize]);

  // 初始化加载事件列表（仅在组件挂载时加载第一页）
  useEffect(() => {
    fetchEvents(1, 10);
  }, [fetchEvents]);

  // 分页变化时重新加载数据（仅依赖页码与每页条数，避免搜索后 searchParams 更新导致重复请求）
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (current <= 0 || pageSize <= 0) return;
    const params = searchParamsRef.current;
    const hasSearchParams = params && (
      (params.dateRange && params.dateRange.length === 2) ||
      (params.clientId != null && params.clientId !== '') ||
      (params.roomId != null && params.roomId !== '') ||
      (typeof params.orderNumber === 'string' && params.orderNumber.trim() !== '') ||
      (params.completion_status !== undefined && params.completion_status !== null && params.completion_status !== '')
    );
    if (hasSearchParams) {
      searchEvents(params, current, pageSize);
    } else {
      fetchEvents(current, pageSize);
    }
  }, [current, fetchEvents, pageSize, searchEvents]);

  return {
    events,
    loading,
    searchParams,
    pagination,
    setPagination,
    fetchEvents,
    searchEvents,
    deleteEvent
  };
};

export default useEvents;
