import React, { useState, useEffect } from 'react';
import { Card, Table, Tag, Statistic, Row, Col, Select, Spin, message, Tooltip } from 'antd';
import { EditOutlined, ClockCircleOutlined, PlusOutlined, EditFilled, DeleteOutlined } from '@ant-design/icons';
import { historyAPI } from '../../../../api';
import dayjs from 'dayjs';
import './DutyPersonnelStats.css';

/**
 * 值班人员操作记录组件
 * 显示值班人员的详细操作记录（创建事件、告警、设备、人员等）
 */
const DutyPersonnelStats = () => {
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [periodDays, setPeriodDays] = useState(30);
  const [actionFilter, setActionFilter] = useState('');
  const [contentTypeFilter, setContentTypeFilter] = useState('');
  const [totalCount, setTotalCount] = useState(0);

  // 内容类型映射
  const contentTypeMap = {
    'events.Event': '事件',
    'devices.Device': '设备',
    'devices.DeviceAlert': '设备告警',
    'events.EntryPersonnel': '进场人员',
    'common.Client': '客户',
    'common.AuthorizedOrg': '授权单位',
    'devices.Cabinet': '机柜',
    'devices.Room': '机房',
  };

  // 操作类型映射
  const actionMap = {
    'create': { text: '创建', color: 'green', icon: <PlusOutlined /> },
    'update': { text: '更新', color: 'blue', icon: <EditFilled /> },
    'delete': { text: '删除', color: 'red', icon: <DeleteOutlined /> },
  };

  // 获取操作记录
  const fetchRecords = async (days = 30, action = '', contentType = '') => {
    setLoading(true);
    try {
      const params = { days };
      if (action) params.action = action;
      if (contentType) params.content_type = contentType;
      
      const response = await historyAPI.getDutyPersonnelStats(days, action, contentType);
      const data = response.data;
      setRecords(data.records || []);
      setTotalCount(data.total_count || 0);
    } catch (error) {
      console.error('获取值班人员操作记录失败:', error);
      message.error('获取操作记录失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords(periodDays, actionFilter, contentTypeFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodDays, actionFilter, contentTypeFilter]);

  // 表格列定义
  const columns = [
    {
      title: '操作时间',
      dataIndex: 'changed_at',
      key: 'changed_at',
      width: 180,
      fixed: 'left',
      render: (time) => time ? dayjs(time).format('YYYY-MM-DD HH:mm:ss') : '-',
      sorter: (a, b) => dayjs(a.changed_at).unix() - dayjs(b.changed_at).unix(),
    },
    {
      title: '值班人员',
      dataIndex: 'duty_personnel_name',
      key: 'duty_personnel_name',
      width: 120,
      render: (name) => name || '-',
    },
    {
      title: '操作类型',
      dataIndex: 'action',
      key: 'action',
      width: 100,
      filters: [
        { text: '创建', value: 'create' },
        { text: '更新', value: 'update' },
        { text: '删除', value: 'delete' },
      ],
      onFilter: (value, record) => record.action === value,
      render: (action) => {
        const actionInfo = actionMap[action] || { text: action, color: 'default', icon: null };
        return (
          <Tag color={actionInfo.color} icon={actionInfo.icon}>
            {actionInfo.text}
          </Tag>
        );
      },
    },
    {
      title: '操作对象',
      dataIndex: 'content_type',
      key: 'content_type',
      width: 120,
      filters: [
        { text: '事件', value: 'events.Event' },
        { text: '设备', value: 'devices.Device' },
        { text: '设备告警', value: 'devices.DeviceAlert' },
        { text: '进场人员', value: 'events.EntryPersonnel' },
        { text: '客户', value: 'common.Client' },
        { text: '授权单位', value: 'common.AuthorizedOrg' },
      ],
      onFilter: (value, record) => record.content_type === value,
      render: (contentType) => {
        const typeName = contentTypeMap[contentType] || contentType;
        return <Tag>{typeName}</Tag>;
      },
    },
    {
      title: '对象ID',
      dataIndex: 'object_id',
      key: 'object_id',
      width: 100,
      render: (id) => `#${id}`,
    },
    {
      title: '操作详情',
      key: 'details',
      width: 200,
      render: (_, record) => {
        if (record.action === 'create') {
          const fields = record.changed_fields || [];
          return (
            <Tooltip title={`创建了 ${fields.length} 个字段`}>
              <span>创建了 {fields.length} 个字段</span>
            </Tooltip>
          );
        } else if (record.action === 'update') {
          const fields = record.changed_fields || [];
          return (
            <Tooltip title={`更新了 ${fields.length} 个字段`}>
              <span>更新了 {fields.length} 个字段</span>
            </Tooltip>
          );
        } else if (record.action === 'delete') {
          return <Tag color="red">已删除</Tag>;
        }
        return '-';
      },
    },
  ];

  // 统计信息
  const createCount = records.filter(r => r.action === 'create').length;
  const updateCount = records.filter(r => r.action === 'update').length;
  const deleteCount = records.filter(r => r.action === 'delete').length;

  return (
    <Card
      className="duty-personnel-stats-card"
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span>
            <EditOutlined style={{ marginRight: 8 }} />
            值班人员操作记录
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Select
              value={periodDays}
              onChange={(value) => setPeriodDays(value)}
              style={{ width: 120 }}
            >
              <Select.Option value={7}>最近7天</Select.Option>
              <Select.Option value={30}>最近30天</Select.Option>
              <Select.Option value={90}>最近90天</Select.Option>
              <Select.Option value={180}>最近180天</Select.Option>
            </Select>
            <Select
              value={actionFilter}
              onChange={(value) => setActionFilter(value)}
              placeholder="操作类型"
              allowClear
              style={{ width: 120 }}
            >
              <Select.Option value="create">创建</Select.Option>
              <Select.Option value="update">更新</Select.Option>
              <Select.Option value="delete">删除</Select.Option>
            </Select>
            <Select
              value={contentTypeFilter}
              onChange={(value) => setContentTypeFilter(value)}
              placeholder="对象类型"
              allowClear
              style={{ width: 140 }}
            >
              <Select.Option value="events.Event">事件</Select.Option>
              <Select.Option value="devices.Device">设备</Select.Option>
              <Select.Option value="devices.DeviceAlert">设备告警</Select.Option>
              <Select.Option value="events.EntryPersonnel">进场人员</Select.Option>
              <Select.Option value="common.Client">客户</Select.Option>
              <Select.Option value="common.AuthorizedOrg">授权单位</Select.Option>
            </Select>
          </div>
        </div>
      }
    >
      <Spin spinning={loading}>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Statistic
              title="总操作数"
              value={totalCount}
              prefix={<EditOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="创建操作"
              value={createCount}
              prefix={<PlusOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="更新操作"
              value={updateCount}
              prefix={<EditFilled />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="删除操作"
              value={deleteCount}
              prefix={<DeleteOutlined />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Col>
        </Row>
        <Table
          columns={columns}
          dataSource={records}
          rowKey="id"
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条记录`,
          }}
          size="middle"
          scroll={{ x: 900 }}
        />
      </Spin>
    </Card>
  );
};

export default DutyPersonnelStats;

