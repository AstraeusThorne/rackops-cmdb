import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Form, Select, Button, message, Space, Alert, Spin } from 'antd';
import api from '../../api';
import { eventAPI } from '../../api';
import dayjs from 'dayjs';

const SEARCH_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * 下架设备表单组件
 * 用于快速下架在用设备
 * @param {Object} props - 组件属性
 * @param {Object} props.initialValues - 初始表单值（编辑时使用）
 * @param {Function} props.onFinish - 表单提交成功的回调
 * @param {Function} props.onCancel - 取消操作的回调
 * @param {boolean} props.isEdit - 是否为编辑模式
 * @returns {React.ReactElement} 下架设备表单组件
 */
const DecommissionedDeviceForm = ({ initialValues = {}, onFinish, onCancel, isEdit = false }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState([]);
  const [inUseDevices, setInUseDevices] = useState([]);
  const [deviceSearching, setDeviceSearching] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [isFetching, setIsFetching] = useState(true);
  const dataFetchedRef = useRef(false);
  const searchTimerRef = useRef(null);

  /** 远程搜索设备（后端 search 支持 SN/品牌/型号，避免全量拉取） */
  const searchDevices = useCallback(async (keyword) => {
    setDeviceSearching(true);
    try {
      const res = await api.getDevices({
        search: (keyword || '').trim(),
        page_size: SEARCH_PAGE_SIZE,
        page: 1
      });
      const data = res.data || {};
      const list = data.results || (Array.isArray(data) ? data : []);
      setInUseDevices(Array.isArray(list) ? list : []);
    } catch (error) {
      message.error('获取设备列表失败');
      setInUseDevices([]);
    } finally {
      setDeviceSearching(false);
    }
  }, []);

  const handleDeviceSearch = useCallback((value) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      searchDevices(value);
    }, SEARCH_DEBOUNCE_MS);
  }, [searchDevices]);

  const handleDeviceDropdownVisibleChange = useCallback((open) => {
    if (open && inUseDevices.length === 0 && !deviceSearching) {
      searchDevices('');
    }
  }, [inUseDevices.length, deviceSearching, searchDevices]);

  // 仅拉取事件列表；设备列表改为下拉内远程搜索
  const fetchData = useCallback(async () => {
    if (dataFetchedRef.current) return;
    setIsFetching(true);
    try {
      const eventsRes = await eventAPI.getAllEvents();
      const eventsData = Array.isArray(eventsRes.data) ? eventsRes.data : (eventsRes.data.results || eventsRes.data || []);
      setEvents(eventsData);
      dataFetchedRef.current = true;
    } catch (error) {
      console.error('获取数据失败:', error);
      message.error('获取数据失败');
    } finally {
      setIsFetching(false);
    }
  }, []);

  // 页面加载时获取事件列表和在用设备列表
  useEffect(() => {
    // 只在组件挂载时获取数据一次
    if (!dataFetchedRef.current) {
      fetchData();
    }
    
    // 如果是编辑模式，设置表单初始值
    if (isEdit && initialValues) {
      // 格式化日期时间
      const formValues = {
        ...initialValues,
        decommission_time: initialValues.decommission_time ? dayjs(initialValues.decommission_time) : null
      };
      form.setFieldsValue(formValues);
    }
    
    // 组件卸载时的清理
    return () => {
      dataFetchedRef.current = false;
    };
  }, []); // 仅在组件挂载时执行一次

  /**
   * 处理设备选择变化
   * @param {number} deviceId - 选择的设备ID
   */
  const handleDeviceChange = useCallback((deviceId) => {
    if (!deviceId) {
      setSelectedDevice(null);
      return;
    }

    const device = inUseDevices.find(d => d.id === deviceId);
    if (device) {
      setSelectedDevice(device);
    }
  }, [inUseDevices]);

  /**
   * 表单提交处理
   * @param {Object} values - 表单值
   */
  const handleSubmit = async (values) => {
    if (!values.selected_device_id) {
      message.error('请选择要下架的设备');
      return;
    }
    
    setLoading(true);
    try {
      // 处理选中的在用设备进行下架
      await api.decommissionDevice(values.selected_device_id, {
        decommission_reason: values.decommission_reason,
        status: values.status || 'decommissioned',
        event_id: values.event_ids && values.event_ids.length > 0 ? values.event_ids[0] : undefined
      });
      message.success('设备已成功下架');
      onFinish && onFinish();
    } catch (error) {
      console.error('下架设备失败:', error);
      message.error('下架设备失败: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  // 使用useMemo缓存选项，避免不必要的重渲染
  const deviceOptions = useMemo(() => {
    return inUseDevices.map(device => ({
      label: `${device.brand} ${device.model} | SN: ${device.sn} | ${device.room_name || '-'}/${device.cabinet_name || '-'}`,
      value: device.id,
      title: `${device.brand} ${device.model} (${device.sn})`
    }));
  }, [inUseDevices]);

  const eventOptions = useMemo(() => {
    return events.map(event => ({
      label: event.order_number ? `${event.order_number} (${event.date})` : `事件 #${event.id} (${event.date})`,
      value: event.id
    }));
  }, [events]);

  const reasonOptions = [
    { label: '设备故障', value: '设备故障' },
    { label: '设备更新换代', value: '设备更新换代' },
    { label: '业务调整', value: '业务调整' },
    { label: '合同终止', value: '合同终止' },
    { label: '安全风险', value: '安全风险' }
  ];

  if (isFetching) {
    return (
      <div style={{ textAlign: 'center', padding: '30px' }}>
        <Spin>
          <div style={{ padding: '30px', backgroundColor: 'transparent' }}>
            加载数据中...
          </div>
        </Spin>
      </div>
    );
  }

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={initialValues}
      onFinish={handleSubmit}
    >
      <Alert
        message="快速下架设备"
        description="从下拉列表中选择一个在用设备，填写下架原因后可直接下架该设备。"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
      
      <Form.Item
        name="selected_device_id"
        label="选择要下架的设备"
        rules={[{ required: true, message: '请选择要下架的设备' }]}
      >
        <Select
          placeholder="输入 SN / 品牌 / 型号 搜索设备"
          onChange={handleDeviceChange}
          allowClear
          showSearch
          filterOption={false}
          onSearch={handleDeviceSearch}
          onDropdownVisibleChange={handleDeviceDropdownVisibleChange}
          loading={deviceSearching}
          notFoundContent={deviceSearching ? '搜索中...' : '输入关键词搜索或展开下拉加载'}
          options={deviceOptions}
        />
      </Form.Item>

      <Form.Item
        name="status"
        label="下架后状态"
        initialValue="decommissioned"
        rules={[{ required: true, message: '请选择状态' }]}
      >
        <Select placeholder="请选择状态">
          <Select.Option value="decommissioned">已下架</Select.Option>
          <Select.Option value="scrapped">已报废</Select.Option>
        </Select>
      </Form.Item>

      <Form.Item
        name="decommission_reason"
        label="下架原因"
        rules={[{ required: true, message: '请输入下架原因' }]}
      >
        <Select
          placeholder="请选择下架原因"
          allowClear
          showSearch
          mode="tags"
          options={reasonOptions}
        />
      </Form.Item>

      <Form.Item
        name="event_ids"
        label="关联事件"
      >
        <Select
          mode="multiple"
          placeholder="请选择关联事件"
          allowClear
          options={eventOptions}
        />
      </Form.Item>

      <Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" loading={loading}>
            {selectedDevice ? '下架选中设备' : '下架设备'}
          </Button>
          <Button onClick={onCancel}>取消</Button>
        </Space>
      </Form.Item>
    </Form>
  );
};

// 使用React.memo包装组件，避免不必要的重渲染
export default React.memo(DecommissionedDeviceForm);