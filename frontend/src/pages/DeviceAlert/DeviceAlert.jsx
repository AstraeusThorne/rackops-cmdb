import React, { useState, useEffect, useRef } from 'react';
import { Table, Card, Input, Space, Tag, Button, message, Select, Badge } from 'antd';
import { SearchOutlined, CheckCircleOutlined, ExclamationCircleOutlined, CloseCircleOutlined, UploadOutlined, DownloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import * as deviceAlertAPI from '../../api/deviceAlertAPI';
import { dutyPersonnelAPI } from '../../api';
import ResolveAlertModal from './components/ResolveAlertModal';
import BatchImportAlertModal from './components/BatchImportAlertModal';
import './style.css';

const { Option } = Select;

/**
 * 设备告警管理组件
 * @returns {React.ReactElement} 设备告警管理界面
 */
const DeviceAlert = () => {
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [searchText, setSearchText] = useState('');
  const searchDebounceRef = useRef(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [dutyPersonnel, setDutyPersonnel] = useState([]);
  const [isResolveModalVisible, setIsResolveModalVisible] = useState(false);
  const [isBatchImportModalVisible, setIsBatchImportModalVisible] = useState(false);
  const [currentAlert, setCurrentAlert] = useState(null);
  const navigate = useNavigate();

  /**
   * 获取告警列表（支持后端搜索与状态筛选）
   * 全部状态时请求较大 page_size，避免分页只返回第一页导致只看到「已确认」
   */
  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const params = { _t: Date.now() };
      if ((searchText || '').trim()) params.search = searchText.trim();
      if (statusFilter && statusFilter !== 'all') {
        params.status = statusFilter;
      } else {
        // 全部状态时拉取更多条，避免默认 20 条恰好都是已确认
        params.page_size = 200;
      }
      const response = await deviceAlertAPI.getDeviceAlerts(params);
      setAlerts(response.data.results || response.data || []);
    } catch (error) {
      message.error('获取告警列表失败');
      console.error('获取告警列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 加载告警数据：初始及搜索/状态变化时请求（搜索 300ms 防抖）
  useEffect(() => {
    fetchDutyPersonnel();
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [searchText, statusFilter]);

  /**
   * 获取值班人员列表
   */
  const fetchDutyPersonnel = async () => {
    try {
      const response = await dutyPersonnelAPI.getDutyPersonnel();
      const personnelData = response.data?.results || response.data || [];
      setDutyPersonnel(Array.isArray(personnelData) ? personnelData : []);
    } catch (error) {
      console.error('获取值班人员列表失败:', error);
      message.error('获取值班人员列表失败');
      setDutyPersonnel([]);
    }
  };

  /**
   * 确认告警
   * @param {number} id - 告警ID
   */
  const handleAcknowledge = async (id) => {
    try {
      await deviceAlertAPI.acknowledgeAlert(id);
      message.success('告警已确认');
      // 刷新列表：按当前筛选重新拉取，保证与后端一致
      fetchAlerts();
    } catch (error) {
      message.error('确认告警失败');
    }
  };

  /**
   * 打开解决告警模态框
   * @param {Object} alert - 当前告警对象
   */
  const showResolveModal = (alert) => {
    setCurrentAlert(alert);
    setIsResolveModalVisible(true);
  };

  /**
   * 关闭解决告警模态框
   */
  const handleResolveModalCancel = () => {
    setIsResolveModalVisible(false);
    setCurrentAlert(null);
  };

  /**
   * 解决告警成功回调
   */
  const handleResolveSuccess = () => {
    setIsResolveModalVisible(false);
    setCurrentAlert(null);
    fetchAlerts();
  };

  /**
   * 导出当前告警列表为 Excel（按当前搜索与状态筛选）
   */
  const handleExport = async () => {
    try {
      const params = {};
      if ((searchText || '').trim()) params.search = searchText.trim();
      if (statusFilter && statusFilter !== 'all') params.status = statusFilter;
      const res = await deviceAlertAPI.exportDeviceAlerts(params);
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '设备告警导出.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch (error) {
      message.error('导出失败');
      console.error('导出告警失败:', error);
    }
  };

  /**
   * 关闭告警
   * @param {number} id - 告警ID
   */
  const handleClose = async (id) => {
    try {
      await deviceAlertAPI.closeAlert(id);
      message.success('告警已关闭');
      // 刷新告警列表
      fetchAlerts();
    } catch (error) {
      message.error('关闭告警失败');
    }
  };

  /**
   * 搜索输入变更（300ms 防抖后请求后端）
   */
  const onSearchInputChange = (e) => {
    const v = e.target.value || '';
    setSearchInput(v);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setSearchText(v), 300);
  };

  /**
   * 筛选告警状态（受控，后端筛选）
   */
  const handleStatusFilter = (value) => {
    setStatusFilter(value ?? 'all');
  };

  /**
   * 创建新告警
   */
  const handleCreateAlert = () => {
    navigate('/device-alert/create');
  };

  /**
   * 格式化日期（精确到日）
   * @param {string} dateTimeStr - 日期时间字符串
   * @returns {string} 格式化后的日期，如 2025/2/21
   */
  const formatDate = (dateTimeStr) => {
    if (!dateTimeStr) return '-';
    const date = new Date(dateTimeStr);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric'
    });
  };

  // 获取告警级别对应的颜色
  const getLevelColor = (level) => {
    switch (level) {
      case 'info': return 'blue';
      case 'warning': return 'orange';
      case 'critical': return 'red';
      case 'emergency': return 'purple';
      default: return 'default';
    }
  };

  // 获取告警状态对应的颜色和文字
  const getStatusBadge = (status) => {
    switch (status) {
      case 'active':
        return <Badge status="error" text="新增" />;
      case 'acknowledged':
        return <Badge status="processing" text="已确认" />;
      case 'resolved':
        return <Badge status="success" text="已解除" />;
      case 'closed':
        return <Badge status="default" text="已关闭" />;
      default:
        return <Badge status="default" text={status} />;
    }
  };

  // 表格列定义
  const columns = [
    {
      title: '告警标题',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: '级别',
      dataIndex: 'level',
      key: 'level',
      render: (level) => (
        <Tag color={getLevelColor(level)}>
          {level === 'info' && '提示'}
          {level === 'warning' && '警告'}
          {level === 'critical' && '严重'}
          {level === 'emergency' && '紧急'}
        </Tag>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status) => getStatusBadge(status)
    },
    {
      title: '发现时间',
      dataIndex: 'discovered_at',
      key: 'discovered_at',
      render: (discovered_at) => formatDate(discovered_at)
    },
    {
      title: '设备',
      key: 'device',
      render: (_, record) => (
        record.device_info ? 
        <span>
          {record.device_info}
        </span> : 
        (record.device_brand && record.device_model ? 
          <span>
            {record.device_brand} {record.device_model}
            <br />
            <small>SN: {record.device_sn}</small>
          </span> : '无'
        )
      )
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => {
        if (record.status === 'active') {
          return (
            <Space size="small">
              <Button 
                type="primary" 
                size="small"
                onClick={() => handleAcknowledge(record.id)}
              >
                确认
              </Button>
              <Button 
                type="primary" 
                danger
                size="small"
                onClick={() => showResolveModal(record)}
              >
                解除
              </Button>
            </Space>
          );
        } else if (record.status === 'acknowledged') {
          return (
            <Button 
              type="primary" 
              icon={<CheckCircleOutlined />}
              size="small"
              onClick={() => showResolveModal(record)}
            >
              解除告警
            </Button>
          );
        } else if (record.status === 'resolved') {
          return (
            <Button 
              type="default" 
              icon={<CloseCircleOutlined />}
              size="small"
              onClick={() => handleClose(record.id)}
            >
              关闭告警
            </Button>
          );
        } else {
          return (
            <Button 
              type="default" 
              size="small"
              disabled
            >
              已处理
            </Button>
          );
        }
      },
    },
  ];

  return (
    <div className="device-alert-container">
      <Card
        title="设备告警管理"
        extra={
          <Space>
            <Select
              value={statusFilter}
              style={{ width: 120 }}
              onChange={handleStatusFilter}
            >
              <Option value="all">全部状态</Option>
              <Option value="active">新增</Option>
              <Option value="acknowledged">已确认</Option>
              <Option value="resolved">已解除</Option>
              <Option value="closed">已关闭</Option>
            </Select>
            <Input
              placeholder="搜索告警（标题/描述/设备SN）..."
              prefix={<SearchOutlined />}
              value={searchInput}
              onChange={onSearchInputChange}
              allowClear
              style={{ width: 220 }}
            />
            <Button 
              type="primary" 
              icon={<ExclamationCircleOutlined />}
              onClick={handleCreateAlert}
            >
              创建告警
            </Button>
            <Button
              icon={<UploadOutlined />}
              onClick={() => setIsBatchImportModalVisible(true)}
            >
              批量导入
            </Button>
            <Button
              icon={<DownloadOutlined />}
              onClick={handleExport}
            >
              导出
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={alerts}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          expandable={{
            expandedRowRender: (record) => (
              <div>
                <p><strong>告警ID:</strong> {record.id}</p>
                <p><strong>告警描述:</strong> {record.description}</p>
                <p><strong>发现时间:</strong> {formatDate(record.discovered_at)}</p>
                {record.resolved_at && (
                  <p><strong>解决时间:</strong> {formatDate(record.resolved_at)}</p>
                )}
                {record.resolution_notes && (
                  <p><strong>解决方案:</strong> {record.resolution_notes}</p>
                )}
                {record.duty_personnel_name && (
                  <p><strong>值班人员:</strong> {record.duty_personnel_name}</p>
                )}
              </div>
            ),
          }}
        />
      </Card>

      {/* 解决告警模态框 */}
      <ResolveAlertModal
        visible={isResolveModalVisible}
        onCancel={handleResolveModalCancel}
        onSuccess={handleResolveSuccess}
        alert={currentAlert}
        dutyPersonnel={dutyPersonnel}
      />

      {/* 批量导入告警模态框 */}
      <BatchImportAlertModal
        visible={isBatchImportModalVisible}
        onCancel={() => setIsBatchImportModalVisible(false)}
        onSuccess={fetchAlerts}
      />
    </div>
  );
};

export default DeviceAlert;