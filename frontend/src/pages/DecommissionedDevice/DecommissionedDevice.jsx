import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Table, Button, Space, message, Card, Input, DatePicker, Row, Col, Modal, Tooltip, Tag, Descriptions, Select } from 'antd';
import { SearchOutlined, DeleteOutlined, EyeOutlined, ReloadOutlined, CaretDownOutlined, CaretUpOutlined } from '@ant-design/icons';
import { decommissionedDeviceAPI } from '../../api';
import { useClientOptions } from '../../hooks/useSelectOptions';
import dayjs from 'dayjs';
import './style.css';
import {
  buildDecommissionedDeviceListParams,
  normalizeDecommissionedDeviceList,
} from './decommissionedDeviceListUtils';

const { RangePicker } = DatePicker;

/**
 * 下架设备管理组件
 * 筛选方式与事件列表一致：搜索框、日期范围、客户下拉（后端筛选，跨页生效）
 * @returns {React.ReactElement} 下架设备管理界面
 */
const DecommissionedDevice = () => {
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const searchDebounceRef = useRef(null);
  const [dateRange, setDateRange] = useState(null);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });
  /** 下架时间列排序：'ascend' 最早在前，'descend' 最新在前（后端排序，跨页生效） */
  const [decommissionTimeSortOrder, setDecommissionTimeSortOrder] = useState('descend');
  /** 客户筛选：选中的客户 ID，空表示全部（后端筛选，跨页生效），与事件列表客户筛选一致 */
  const [clientFilter, setClientFilter] = useState(null);
  const currentPage = pagination.current;
  const currentPageSize = pagination.pageSize;
  const {
    items: clients,
    options: clientOptions,
    loading: clientsLoading,
  } = useClientOptions();

  // 预设时间范围
  const presetRanges = {
    '今天': [dayjs().startOf('day'), dayjs().endOf('day')],
    '最近7天': [dayjs().subtract(6, 'day').startOf('day'), dayjs().endOf('day')],
    '最近30天': [dayjs().subtract(29, 'day').startOf('day'), dayjs().endOf('day')],
    '本月': [dayjs().startOf('month'), dayjs().endOf('month')]
  };

  /**
   * 加载下架设备数据（支持分页与后端搜索、日期范围）
   * 搜索与日期筛选由后端完成，支持跨页。
   *
   * @param {number} [page=1] - 页码
   * @param {number} [pageSize=10] - 每页条数
   * @param {string} [search] - 搜索关键词
   * @param {Array} [range] - 日期范围 [dayjs, dayjs] 或 null
   */
  const fetchDevices = useCallback(async (page = 1, pageSize = 10, search = '', range = null, sortOrder = 'descend', client = null) => {
    setLoading(true);
    try {
      const params = buildDecommissionedDeviceListParams({
        page,
        pageSize,
        searchText: search,
        dateRange: range,
        sortOrder,
        clientId: client,
      });
      const devicesRes = await decommissionedDeviceAPI.getDecommissionedDevices(params);
      const decommissionedData = devicesRes.data.results || devicesRes.data || [];
      const total = devicesRes.data.count ?? decommissionedData.length;
      setPagination(prev => ({ ...prev, total }));
      setDevices(normalizeDecommissionedDeviceList(decommissionedData));
    } catch (error) {
      console.error('获取下架设备列表失败:', error);
      message.error('获取下架设备列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 分页或搜索/日期/客户筛选或下架时间排序变化时请求当前页（后端筛选，跨页）
  useEffect(() => {
    fetchDevices(currentPage, currentPageSize, searchText, dateRange, decommissionTimeSortOrder, clientFilter);
  }, [currentPage, currentPageSize, searchText, dateRange, decommissionTimeSortOrder, clientFilter, fetchDevices]);

  /**
   * 搜索输入（300ms 防抖，后端筛选）
   * @param {React.ChangeEvent<HTMLInputElement>} e
   */
  const onSearchInputChange = useCallback((e) => {
    const v = e.target.value || '';
    setSearchInput(v);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setSearchText(v);
      setPagination(prev => ({ ...prev, current: 1 }));
    }, 300);
  }, []);

  /**
   * 日期范围变化（后端筛选，重置到第 1 页）
   * @param {Array} dates
   */
  const handleDateChange = useCallback((dates) => {
    setDateRange(dates && dates.length === 2 ? dates : null);
    setPagination(prev => ({ ...prev, current: 1 }));
  }, []);

  /**
   * 客户筛选变化（与事件列表一致，后端筛选，重置到第 1 页）
   * @param {number|null} clientId
   */
  const handleClientChange = useCallback((clientId) => {
    const next = clientId != null && clientId !== '' ? Number(clientId) : null;
    setClientFilter(Number.isNaN(next) ? null : next);
    setPagination(prev => ({ ...prev, current: 1 }));
  }, []);

  /**
   * 删除下架设备
   * @param {Object} record - 设备记录
   */
  const handleDelete = (record) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除设备 ${record.sn} 吗？`,
      okText: '确认',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await decommissionedDeviceAPI.deleteDecommissionedDevice(record.id);
          message.success('设备已删除');
          fetchDevices(pagination.current, pagination.pageSize, searchText, dateRange, decommissionTimeSortOrder, clientFilter);
        } catch (error) {
          console.error('删除设备失败:', error);
          message.error('删除设备失败');
        }
      }
    });
  };

  /**
   * 查看详情
   * @param {Object} record - 设备记录
   */
  const handleViewDetails = (record) => {
    // 优先显示事件信息，如果没有事件则显示设备信息
    const displayOrderNumber = record.event_order_number || record.order_number || '-';
    const displayDecommissionTime = record.event_date ? 
      dayjs(record.event_date).format('YYYY-MM-DD') : 
      dayjs(record.decommission_time).format('YYYY-MM-DD');
    const displayClient = record.event_client_name || record.client_name || '-';
    const displayAuthorizedPerson = record.event_client_name ? 
      (record.event_client_authorized_person || '-') : 
      (record.client_authorized_person || '-');
    const displayAuthorizedOrg = record.event_authorized_org_name || record.authorized_org_name || '-';
    const displayEventType = record.event_description || '设备下架';
    
    Modal.info({
      title: '设备详情',
      width: 700,
      content: (
        <div className="device-detail-modal">
          <Descriptions column={2} bordered>
            <Descriptions.Item label="订单号" span={1}>{displayOrderNumber}</Descriptions.Item>
            <Descriptions.Item label="下架时间" span={1}>{displayDecommissionTime}</Descriptions.Item>
            <Descriptions.Item label="事件类型" span={2}>
              <Tag color="orange">{displayEventType}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="客户" span={1}>{displayClient}</Descriptions.Item>
            <Descriptions.Item label="客户授权人" span={1}>{displayAuthorizedPerson}</Descriptions.Item>
            <Descriptions.Item label="状态" span={1}>
              <Tag color={record.status === 'scrapped' ? 'red' : 'orange'}>
                {record.status === 'scrapped' ? '已报废' : '已下架'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="SN" span={1}>{record.sn}</Descriptions.Item>
            <Descriptions.Item label="品牌" span={1}>{record.brand}</Descriptions.Item>
            <Descriptions.Item label="型号" span={1}>{record.model}</Descriptions.Item>
            <Descriptions.Item label="U数" span={1}>{record.u_size}</Descriptions.Item>
            <Descriptions.Item label="机架位置" span={1}>{record.rack_position}</Descriptions.Item>
            <Descriptions.Item label="机房" span={1}>{record.room_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="机柜" span={1}>{record.cabinet_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="授权单位" span={2}>{displayAuthorizedOrg}</Descriptions.Item>
            <Descriptions.Item label="下架原因" span={2}>
              <div style={{ marginTop: 8, padding: 8, background: '#f5f5f5', borderRadius: 4 }}>
                {record.decommission_reason}
              </div>
            </Descriptions.Item>
          </Descriptions>
        </div>
      ),
      okText: '关闭'
    });
  };

  /**
   * 刷新数据（保留当前搜索与日期条件）
   */
  const handleRefresh = () => {
    fetchDevices(pagination.current, pagination.pageSize, searchText, dateRange, decommissionTimeSortOrder, clientFilter);
    message.success('数据已刷新');
  };

  // 表格列定义
  const columns = [
    {
      title: '订单号',
      dataIndex: 'order_number',
      key: 'order_number',
      width: 158,
      align: 'center',
      render: (text, record) => {
        // 优先显示事件订单号，如果没有则显示设备订单号
        const eventDetails = record.event_details;
        if (eventDetails && eventDetails.length > 0) {
          const event = eventDetails[0]; // 取第一个事件的订单号
          return event.order_number || text || '-';
        }
        return text || '-';
      }
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          下架时间
          <Space size={0}>
            <Tooltip title="最新在前">
              <Button
                type={decommissionTimeSortOrder === 'descend' ? 'primary' : 'text'}
                size="small"
                icon={<CaretDownOutlined />}
                style={{ minWidth: 24, padding: '0 4px' }}
                onClick={() => {
                  setDecommissionTimeSortOrder('descend');
                  setPagination(prev => ({ ...prev, current: 1 }));
                }}
              />
            </Tooltip>
            <Tooltip title="最早在前">
              <Button
                type={decommissionTimeSortOrder === 'ascend' ? 'primary' : 'text'}
                size="small"
                icon={<CaretUpOutlined />}
                style={{ minWidth: 24, padding: '0 4px' }}
                onClick={() => {
                  setDecommissionTimeSortOrder('ascend');
                  setPagination(prev => ({ ...prev, current: 1 }));
                }}
              />
            </Tooltip>
          </Space>
        </span>
      ),
      dataIndex: 'decommission_time',
      key: 'decommission_time',
      width: 200,
      align: 'center',
      render: (text, record) => {
        // 优先显示事件日期，如果没有则显示下架时间（仅年月日）
        const eventDetails = record.event_details;
        if (eventDetails && eventDetails.length > 0) {
          const event = eventDetails[0]; // 取第一个事件的日期
          return event.date ? dayjs(event.date).format('YYYY-MM-DD') : dayjs(text).format('YYYY-MM-DD');
        }
        return dayjs(text).format('YYYY-MM-DD');
      }
    },
    {
      title: '客户',
      dataIndex: 'client_name',
      key: 'client',
      width: 120,
      align: 'center',
      filters: clients.map((c) => ({ text: c.name || '-', value: c.id })),
      filteredValue: clientFilter != null ? [clientFilter] : [],
      onFilter: () => true,
      render: (text, record) => {
        // 优先显示事件客户，如果没有则显示设备客户
        const eventDetails = record.event_details;
        if (eventDetails && eventDetails.length > 0) {
          const event = eventDetails[0]; // 取第一个事件的客户
          if (event.clients && event.clients.length > 0) {
            const eventClientNames = event.clients.map(c => c.name).join(', ');
            return eventClientNames || text || '-';
          }
        }
        return text || '-';
      }
    },
    {
      title: 'SN',
      dataIndex: 'sn',
      key: 'sn',
      width: 150,
      align: 'center',
      ellipsis: {
        showTitle: false,
      },
      render: (text) => (
        <Tooltip placement="topLeft" title={text}>
          {text}
        </Tooltip>
      ),
    },
    {
      title: '详细信息',
      key: 'device_info',
      width: 200,
      render: (_, record) => (
        <div style={{ textAlign: 'left' }}>
          <p><strong>品牌/型号：</strong>{record.brand} {record.model}</p>
          <p><strong>机房/机柜：</strong>{record.room_name || '-'}/{record.cabinet_name || '-'}</p>
          <p>
            <strong>状态：</strong>
            <Tag color={record.status === 'scrapped' ? 'red' : 'orange'}>
              {record.status === 'scrapped' ? '已报废' : '已下架'}
            </Tag>
          </p>
        </div>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right',
      align: 'center',
      render: (_, record) => (
        <Space size={2} className="action-buttons">
          <Tooltip title="查看详情">
            <Button 
              type="link"
              size="small"
              icon={<EyeOutlined />}
              className="action-button view-button"
              onClick={() => handleViewDetails(record)}
            />
          </Tooltip>
          <Tooltip title="删除设备">
            <Button 
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              className="action-button delete-button"
              onClick={() => handleDelete(record)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div className="decommissioned-device-container">
      <Card 
        title="下架设备管理"
        variant="borderless"
        extra={
          <Button 
            type="primary" 
            icon={<ReloadOutlined />} 
            onClick={handleRefresh}
          >
            刷新
          </Button>
        }
      >
        <div className="filter-section">
          <Row gutter={[16, 16]} style={{ width: '100%' }}>
            <Col xs={24} sm={24} md={8} lg={6}>
              <Input
                placeholder="搜索 SN、品牌、型号、机柜、订单号、客户等（跨页）"
                allowClear
                prefix={<SearchOutlined />}
                value={searchInput}
                onChange={onSearchInputChange}
                style={{ width: '100%' }}
              />
            </Col>
            <Col xs={24} sm={24} md={8} lg={6}>
              <RangePicker
                style={{ width: '100%' }}
                value={dateRange}
                placeholder={['开始日期', '结束日期']}
                onChange={handleDateChange}
                presets={presetRanges}
                allowClear
                format="YYYY-MM-DD"
              />
            </Col>
            <Col xs={24} sm={24} md={8} lg={6}>
              <Select
                placeholder="请选择客户"
                allowClear
                showSearch
                filterOption={(input, option) =>
                  (option?.label ?? '').toString().toLowerCase().includes((input || '').toLowerCase())
                }
                loading={clientsLoading}
                options={clientOptions}
                value={clientFilter != null && clientFilter !== '' ? clientFilter : undefined}
                onChange={handleClientChange}
                style={{ width: '100%' }}
              />
            </Col>
          </Row>
        </div>

        <Table
          variant="borderless"
          columns={columns}
          dataSource={devices}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1238 }}
          onChange={(_pag, filters, _sorter, extra) => {
            if (extra?.action === 'filter' && 'client' in (filters || {})) {
              const raw = Array.isArray(filters.client) && filters.client.length > 0 ? filters.client[0] : null;
              const next = raw != null && raw !== '' ? Number(raw) : null;
              setClientFilter(Number.isNaN(next) ? null : next);
              setPagination(prev => ({ ...prev, current: 1 }));
            }
          }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条记录`,
            pageSizeOptions: ['10', '20', '50', '100'],
            onChange: (page, pageSize) => {
              setPagination(prev => ({ ...prev, current: page, pageSize: pageSize || prev.pageSize }));
            },
            onShowSizeChange: (current, size) => {
              setPagination(prev => ({ ...prev, current: 1, pageSize: size }));
            }
          }}
        />
      </Card>
    </div>
  );
};

export default DecommissionedDevice;
