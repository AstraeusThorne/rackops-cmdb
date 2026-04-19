import React, { useState, useEffect, useRef } from 'react';
import { Table, Button, Space, message, Card, Input, Modal, Form, Select, Tooltip, Descriptions, Tag } from 'antd';
import { PlusOutlined, SearchOutlined, DeleteOutlined, EditOutlined, DownOutlined, EyeOutlined, ReloadOutlined, ThunderboltOutlined, DesktopOutlined, CaretDownOutlined, CaretUpOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import './style.css';
import api from '../../api'; // 使用统一API服务
import DeviceForm from '../../components/DeviceForm'; // 导入DeviceForm组件
import { useCabinetOptions, useClientOptions, useEventOptions } from '../../hooks/useSelectOptions';
import { buildDeviceListParams, normalizeDeviceList } from './deviceListUtils';

/**
 * 设备管理组件
 * @returns {React.ReactElement} 设备管理界面
 */
const Device = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState([]);
  const [searchText, setSearchText] = useState('');
  const searchDebounceRef = useRef(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [editingDevice, setEditingDevice] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [decommissionModalVisible, setDecommissionModalVisible] = useState(false);
  const [decommissionForm] = Form.useForm();
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 15,
    total: 0,
  });
  /** 机柜筛选：选中的机柜 ID，空表示不限 */
  const [cabinetFilter, setCabinetFilter] = useState(null);
  /** 客户筛选：选中的客户 ID，空表示不限 */
  const [clientFilter, setClientFilter] = useState(null);
  /** 上架时间列排序：仅两态切换 'ascend' | 'descend'（后端排序，跨页生效），默认降序最新在前 */
  const [installDateSortOrder, setInstallDateSortOrder] = useState('descend');
  /** 设备类型筛选：选中的类型，空表示全部（后端筛选，跨页生效） */
  const [deviceTypeFilter, setDeviceTypeFilter] = useState(null);
  const currentPage = pagination.current;
  const currentPageSize = pagination.pageSize;
  const { options: cabinetOptions } = useCabinetOptions();
  const { items: clients, options: clientOptions } = useClientOptions();
  const {
    options: decommissionEventOptions,
    ensureLoaded: ensureDecommissionEventsLoaded,
  } = useEventOptions();

  // 设备类型映射和颜色配置
  const deviceTypeMap = {
    'server': { label: '服务器', color: 'blue', icon: <DesktopOutlined /> },
    'switch': { label: '交换机', color: 'green', icon: <DesktopOutlined /> },
    'router': { label: '路由器', color: 'orange', icon: <DesktopOutlined /> },
    'firewall': { label: '防火墙', color: 'red', icon: <DesktopOutlined /> },
    'storage': { label: '存储设备', color: 'purple', icon: <DesktopOutlined /> },
    'ups': { label: 'UPS', color: 'gold', icon: <ThunderboltOutlined /> },
    'pdu': { label: 'PDU', color: 'cyan', icon: <ThunderboltOutlined /> },
    'other': { label: '其他', color: 'default', icon: <DesktopOutlined /> }
  };

  // 加载设备数据：分页、搜索、机柜/客户/设备类型筛选、上架时间排序变化时请求当前页（走后端，支持跨页）
  useEffect(() => {
    fetchData(currentPage, currentPageSize, searchText, cabinetFilter, clientFilter, installDateSortOrder, deviceTypeFilter);
  }, [currentPage, currentPageSize, searchText, cabinetFilter, clientFilter, installDateSortOrder, deviceTypeFilter]);

  /**
   * 获取设备数据（支持分页、后端搜索、机柜与客户筛选、上架时间排序）
   * 设备列表接口已返回 event_details（事件摘要），无需再请求 getAllEvents。
   *
   * @param {number} [page=1] - 页码
   * @param {number} [pageSize=15] - 每页条数
   * @param {string} [search] - 搜索关键词，传后端做跨页筛选
   * @param {number|null} [cabinet] - 机柜 ID，传后端按机柜筛选
   * @param {number|null} [client] - 客户 ID，传后端按客户筛选（机柜所属客户）
   * @param {string|null} [installSortOrder] - 上架时间排序：'ascend' | 'descend' | null
   * @param {string|null} [deviceType] - 设备类型筛选，传后端跨页筛选
   */
  const fetchData = async (page = 1, pageSize = 15, search = '', cabinet = null, client = null, installSortOrder = null, deviceType = null) => {
    setLoading(true);
    try {
      const params = buildDeviceListParams({
        page,
        pageSize,
        searchText: search,
        cabinetId: cabinet,
        clientId: client,
        installDateSortOrder: installSortOrder,
        deviceType,
      });
      const devicesRes = await api.getDevices(params);
      const devicesData = devicesRes.data.results || devicesRes.data || [];
      const total = devicesRes.data.count ?? devicesData.length;
      setPagination(prev => ({ ...prev, total }));
      setDevices(normalizeDeviceList(devicesData));
    } catch (error) {
      console.error('获取数据失败:', error);
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 获取设备列表（触发当前页数据刷新）
   */
  const fetchDevices = async () => {
    await fetchData(pagination.current, pagination.pageSize, searchText, cabinetFilter, clientFilter, installDateSortOrder, deviceTypeFilter);
  };

  /**
   * 删除设备
   * @param {number} id - 设备ID
   */
  const handleDelete = async (id) => {
    try {
      await api.deleteDevice(id);
      await fetchData(pagination.current, pagination.pageSize, searchText, cabinetFilter, clientFilter, installDateSortOrder, deviceTypeFilter);
      message.success('设备删除成功');
    } catch (error) {
      console.error('设备删除失败:', error);
      message.error('设备删除失败');
    }
  };

  /**
   * 打开下架设备模态框
   * @param {object} record - 设备记录
   */
  const handleDecommission = (record) => {
    setEditingDevice(record);
    decommissionForm.resetFields();
    setDecommissionModalVisible(true);
    ensureDecommissionEventsLoaded().catch(() => {});
  };

  /**
   * 提交下架设备
   */
  const handleDecommissionSubmit = async () => {
    try {
      const values = await decommissionForm.validateFields();
      setConfirmLoading(true);
      
      // 准备下架数据
      const decommissionData = {
        decommission_reason: values.reason,
        status: values.status
      };
      
      // 如果选择了事件，添加到请求中
      if (values.event_id) {
        decommissionData.event_id = values.event_id;
      }
      
      await api.decommissionDevice(editingDevice.id, decommissionData);
      
      message.success('设备已成功下架');
      setDecommissionModalVisible(false);
      fetchDevices(); // 刷新设备列表
    } catch (error) {
      console.error('设备下架失败:', error);
      message.error('设备下架失败: ' + (error.response?.data?.error || error.message));
    } finally {
      setConfirmLoading(false);
    }
  };

  /**
   * 编辑设备：先拉取设备详情（含 room 等），再打开弹窗以便表单正确回填
   * @param {object} record - 表格行设备记录
   */
  const handleEdit = async (record) => {
    setModalTitle('编辑设备');
    setIsModalVisible(true);
    setEditingDevice(record);
    try {
      const res = await api.getDevice(record.id);
      setEditingDevice(res.data || record);
    } catch (err) {
      console.error('获取设备详情失败:', err);
      message.error('获取设备详情失败，请重试');
    }
  };

  /**
   * 处理模态框取消
   */
  const handleCancel = () => {
    setIsModalVisible(false);
  };

  /**
   * 处理设备表单提交成功
   */
  const handleFormFinish = () => {
    setIsModalVisible(false);
    fetchDevices(); // 刷新设备列表
  };

  /**
   * 格式化电源瓦数显示
   * @param {number} wattage - 瓦数
   * @returns {string} 格式化后的字符串
   */
  const formatPowerWattage = (wattage) => {
    if (!wattage || wattage === 0) return '-';
    if (wattage >= 1000) {
      return `${(wattage / 1000).toFixed(1)}kW`;
    }
    return `${wattage}W`;
  };

  /**
   * 查看设备详情
   * @param {object} record - 设备记录
   */
  const handleViewDetails = (record) => {
    const deviceTypeInfo = deviceTypeMap[record.device_type] || deviceTypeMap['other'];
    
    // 优先显示事件信息，如果没有事件则显示设备信息
    const displayOrderNumber = record.event_order_number || record.order_number || '-';
    const displayInstallationDate = record.event_date ? 
      dayjs(record.event_date).format('YYYY-MM-DD') : 
      (record.installation_date || '-');
    const displayClient = record.event_client_name || record.client_name || '-';
    const displayAuthorizedPerson = record.event_client_name ? 
      (record.event_client_authorized_person || '-') : 
      (record.client_authorized_person || '-');
    const displayAuthorizedOrg = record.event_authorized_org_name || record.authorized_org_name || '-';
    const displayEventType = record.event_description || '设备上架';
    
    Modal.info({
      title: '设备详情',
      width: 700,
      content: (
        <div className="device-detail-modal">
          <Descriptions column={2} bordered>
            <Descriptions.Item label="订单号" span={1}>{displayOrderNumber}</Descriptions.Item>
            <Descriptions.Item label="上架时间" span={1}>{displayInstallationDate}</Descriptions.Item>
            <Descriptions.Item label="事件类型" span={2}>
              <Tag color="blue">{displayEventType}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="品牌" span={1}>{record.brand}</Descriptions.Item>
            <Descriptions.Item label="型号" span={1}>{record.model}</Descriptions.Item>
            <Descriptions.Item label="SN" span={2}>{record.sn}</Descriptions.Item>
            <Descriptions.Item label="设备类型" span={1}>
              <Tag color={deviceTypeInfo.color} icon={deviceTypeInfo.icon}>
                {deviceTypeInfo.label}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="电源瓦数" span={1}>
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <ThunderboltOutlined style={{ color: '#faad14', marginRight: 4 }} />
                {formatPowerWattage(record.power_wattage)}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="U数" span={1}>{record.u_size}</Descriptions.Item>
            <Descriptions.Item label="电源" span={1}>{record.power_type === 'single' ? '单电源' : record.power_type === 'dual' ? '双电源' : '-'}</Descriptions.Item>
            <Descriptions.Item label="机架位置" span={2}>{record.rack_position || '-'}</Descriptions.Item>
            <Descriptions.Item label="机房" span={1}>{record.room_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="机柜" span={1}>{record.cabinet_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="客户" span={1}>{displayClient}</Descriptions.Item>
            <Descriptions.Item label="客户授权人" span={1}>{displayAuthorizedPerson}</Descriptions.Item>
            <Descriptions.Item label="授权单位" span={2}>{displayAuthorizedOrg}</Descriptions.Item>
          </Descriptions>
        </div>
      ),
      okText: '关闭',
    });
  };

  /** 搜索框受控值（立即更新）；searchText 为实际请求参数（300ms 防抖） */
  const [searchInput, setSearchInput] = useState('');

  /**
   * 搜索设备（后端筛选，支持跨页；300ms 防抖减少请求）
   * @param {React.ChangeEvent<HTMLInputElement>} e - 输入事件
   */
  const onSearchInputChange = (e) => {
    const v = e.target.value || '';
    setSearchInput(v);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setSearchText(v);
      setPagination(prev => ({ ...prev, current: 1 }));
    }, 300);
  };

  /**
   * 机柜筛选变更，重置到第一页
   * @param {number|null} cabinetId - 机柜 ID，null 表示不限
   */
  const onCabinetFilterChange = (cabinetId) => {
    setCabinetFilter(cabinetId || null);
    setPagination(prev => ({ ...prev, current: 1 }));
  };

  /**
   * 客户筛选变更，重置到第一页
   * @param {number|null} clientId - 客户 ID，null 表示不限
   */
  const onClientFilterChange = (clientId) => {
    setClientFilter(clientId || null);
    setPagination(prev => ({ ...prev, current: 1 }));
  };

  /**
   * 刷新设备列表数据
   */
  const handleRefresh = () => {
    fetchDevices();
    message.success('设备数据已刷新');
  };

  /**
   * 通过事件添加设备
   */
  const handleAddViaEvent = () => {
    navigate('/event/create');
  };

  /**
   * 获取用于显示和筛选的客户名称
   *
   * @param {object} record - 设备记录
   * @returns {string} 客户名称，优先使用事件客户，其次设备客户
   */
  const getDisplayClientName = (record) => {
    if (record?.event_client_name) {
      return record.event_client_name;
    }
    if (typeof record?.client_name === 'string' && record.client_name) {
      return record.client_name;
    }
    if (record?.client_name && typeof record.client_name.name === 'string') {
      return record.client_name.name;
    }
    return '-';
  };

  // 表格列定义
  const columns = [
    {
      title: 'SN',
      dataIndex: 'sn',
      key: 'sn',
      width: 220,
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
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          上架时间
          <Space size={0}>
            <Tooltip title="最新在前">
              <Button
                type={installDateSortOrder === 'descend' ? 'primary' : 'text'}
                size="small"
                icon={<CaretDownOutlined />}
                style={{ minWidth: 24, padding: '0 4px' }}
                onClick={() => {
                  setInstallDateSortOrder('descend');
                  setPagination(prev => ({ ...prev, current: 1 }));
                }}
              />
            </Tooltip>
            <Tooltip title="最早在前">
              <Button
                type={installDateSortOrder === 'ascend' ? 'primary' : 'text'}
                size="small"
                icon={<CaretUpOutlined />}
                style={{ minWidth: 24, padding: '0 4px' }}
                onClick={() => {
                  setInstallDateSortOrder('ascend');
                  setPagination(prev => ({ ...prev, current: 1 }));
                }}
              />
            </Tooltip>
          </Space>
        </span>
      ),
      dataIndex: 'installation_date',
      key: 'installation_date',
      width: 140,
      align: 'center',
      render: (text, record) => {
        // 优先显示事件日期，如果没有则显示设备上架时间
        const eventDetails = record.event_details;
        if (eventDetails && eventDetails.length > 0) {
          const event = eventDetails[0]; // 取第一个事件的日期
          return event.date ? dayjs(event.date).format('YYYY-MM-DD') : (text ? dayjs(text).format('YYYY-MM-DD') : '-');
        }
        return text ? dayjs(text).format('YYYY-MM-DD') : '-';
      }
    },
    {
      title: '设备类型',
      dataIndex: 'device_type',
      key: 'device_type',
      width: 100,
      align: 'center',
      filters: Object.entries(deviceTypeMap).map(([key, value]) => ({
        text: value.label,
        value: key,
      })),
      filteredValue: deviceTypeFilter ? [deviceTypeFilter] : [],
      onFilter: () => true,
      render: (deviceType) => {
        const typeInfo = deviceTypeMap[deviceType] || deviceTypeMap['other'];
        return (
          <Tag color={typeInfo.color} icon={typeInfo.icon}>
            {typeInfo.label}
          </Tag>
        );
      }
    },
    {
      title: '客户',
      key: 'client',
      dataIndex: 'client_name',
      width: 100,
      align: 'center',
      filters: clients.map((c) => ({ text: c.name || '-', value: c.id })),
      filteredValue: clientFilter != null ? [clientFilter] : [],
      onFilter: () => true,
      render: (_, record) => {
        const name = getDisplayClientName(record);
        if (!name || name === '-') {
          return '-';
        }

        const tooltipContent = (
          <div>
            {record.event_client_name ? (
              <div><strong>事件客户：</strong>{record.event_client_name}</div>
            ) : (
              <>
                <div><strong>客户：</strong>{record.client_name || '-'}</div>
                <div><strong>授权人：</strong>{record.client_authorized_person || '无'}</div>
              </>
            )}
          </div>
        );
        
        return (
          <Tooltip title={tooltipContent}>
            {name}
          </Tooltip>
        );
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 130,
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
          <Tooltip title="编辑设备">
            <Button 
              type="primary"
              size="small"
              icon={<EditOutlined />}
              className="action-button edit-button"
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Tooltip title="下架设备">
            <Button 
              type="default"
              size="small"
              icon={<DownOutlined />}
              className="action-button decommission-button"
              onClick={() => handleDecommission(record)}
            />
          </Tooltip>
          <Tooltip title="删除设备">
            <Button 
              type="primary"
              size="small"
              danger
              icon={<DeleteOutlined />}
              className="action-button delete-button"
              onClick={() => handleDelete(record.id)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div className="device-container">
      {/* 页面头部 */}
      <div className="page-header">
        <div className="header-left">
          <h2 className="page-title">设备管理</h2>
          <div className="page-stats">
            <span className="stats-item">
              <DesktopOutlined style={{ marginRight: 4 }} />
              共 {pagination.total} 台设备
            </span>
            <span className="stats-divider">|</span>
            <span className="stats-item">
              <ThunderboltOutlined style={{ marginRight: 4, color: '#faad14' }} />
              当前页总功率: {devices.reduce((sum, device) => sum + (device.power_wattage || 0), 0)}W
            </span>
          </div>
        </div>
        <div className="header-right">
          <div className="header-filters">
            <Space size="middle" wrap>
              <Select
                placeholder="筛选机柜"
                allowClear
                style={{ width: 200 }}
                value={cabinetFilter ?? undefined}
                onChange={onCabinetFilterChange}
                showSearch
                optionFilterProp="label"
                options={cabinetOptions}
              />
              <Select
                placeholder="筛选客户"
                allowClear
                style={{ width: 180 }}
                value={clientFilter ?? undefined}
                onChange={onClientFilterChange}
                showSearch
                optionFilterProp="label"
                options={clientOptions}
              />
              <Input
                placeholder="搜索设备（品牌/型号/SN/机柜/机房/客户/订单号）..."
                prefix={<SearchOutlined />}
                value={searchInput}
                onChange={onSearchInputChange}
                style={{ width: 300 }}
                allowClear
              />
            </Space>
          </div>
          <div className="header-actions">
            <Space size="middle">
              <Button
                icon={<ReloadOutlined />}
                onClick={handleRefresh}
                title="刷新数据"
              >
                刷新
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAddViaEvent}
                size="default"
              >
                新增事件
              </Button>
            </Space>
          </div>
        </div>
      </div>

      {/* 表格卡片 */}
      <Card
        className="table-card"
        styles={{ body: { padding: 0 } }}
      >
        <Table
          columns={columns}
          dataSource={devices}
          rowKey="id"
          loading={{ spinning: loading, indicator: <div /> }}
          onChange={(_pag, filters, _sorter, extra) => {
            if (extra?.action !== 'filter') return;
            if (filters?.device_type != null) {
              const next = Array.isArray(filters.device_type) && filters.device_type.length > 0
                ? filters.device_type[0]
                : null;
              setDeviceTypeFilter(next);
              setPagination(prev => ({ ...prev, current: 1 }));
            }
            if (filters?.client != null) {
              const next = Array.isArray(filters.client) && filters.client.length > 0
                ? filters.client[0]
                : null;
              setClientFilter(next);
              setPagination(prev => ({ ...prev, current: 1 }));
            }
          }}
          pagination={{ 
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条记录`,
            showSizeChanger: true,
            showQuickJumper: true,
            pageSizeOptions: ['10', '15', '20', '50', '100'],
            size: 'default',
            responsive: true,
            onChange: (page, pageSize) => {
              setPagination(prev => ({ ...prev, current: page, pageSize: pageSize || prev.pageSize }));
            },
            onShowSizeChange: (current, size) => {
              setPagination(prev => ({ ...prev, current: 1, pageSize: size }));
            }
          }}
          size="middle"
          scroll={{ x: 670, y: 'calc(100vh - 350px)' }}
          className="device-table"
        />
      </Card>

      {/* 添加/编辑设备模态框 */}
      <Modal
        title={modalTitle}
        open={isModalVisible}
        onCancel={handleCancel}
        footer={null}
        width={1100}
      >
        <DeviceForm 
          initialValues={editingDevice}
          onFinish={handleFormFinish}
          onCancel={handleCancel}
          isEdit={!!editingDevice}
        />
      </Modal>

      {/* 设备下架模态框 */}
      <Modal
        title="设备下架"
        open={decommissionModalVisible}
        onOk={handleDecommissionSubmit}
        onCancel={() => setDecommissionModalVisible(false)}
        confirmLoading={confirmLoading}
        okText="确认下架"
        cancelText="取消"
      >
        <Form
          form={decommissionForm}
          layout="vertical"
          name="decommissionForm"
        >
          <Form.Item
            name="reason"
            label="下架原因"
            rules={[{ required: true, message: '请输入下架原因' }]}
          >
            <Input.TextArea rows={4} placeholder="请输入下架原因" />
          </Form.Item>
          <Form.Item
            name="status"
            label="状态"
            initialValue="decommissioned"
            rules={[{ required: true, message: '请选择状态' }]}
          >
            <Select>
              <Select.Option value="decommissioned">已下架</Select.Option>
              <Select.Option value="scrapped">已报废</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="event_id"
            label="关联事件"
            tooltip="选择关联事件可以自动记录与事件的关联信息"
          >
            <Select
              placeholder="选择一个关联事件（可选）"
              allowClear
              showSearch
              optionFilterProp="label"
              options={decommissionEventOptions}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Device;
