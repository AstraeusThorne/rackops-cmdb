import React, { useState, useEffect, useCallback } from 'react';
import { 
  Table, Button, Tag, Modal, Descriptions, message, 
  Select, DatePicker, Space, Row, Col
} from 'antd';
import { RollbackOutlined, EyeOutlined } from '@ant-design/icons';
import { historyAPI } from '../../api';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Option } = Select;

/**
 * 历史记录查看页面（仅管理员）
 */
const HistoryViewer = ({ contentType, objectId, onRevert }) => {
  const [histories, setHistories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  
  // 筛选条件
  const [filters, setFilters] = useState({
    content_type: contentType || '',
    object_id: objectId || '',
    is_admin_action: '',
    action: '',
    start_date: '',
    end_date: '',
    reverted: '',
  });

  const fetchHistories = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.content_type) params.content_type = filters.content_type;
      if (filters.object_id) params.object_id = filters.object_id;
      if (filters.is_admin_action !== '') params.is_admin_action = filters.is_admin_action;
      if (filters.action) params.action = filters.action;
      if (filters.start_date) params.start_date = filters.start_date;
      if (filters.end_date) params.end_date = filters.end_date;
      if (filters.reverted !== '') params.reverted = filters.reverted;

      const response = await historyAPI.list(params);
      setHistories(response.data.results || response.data || []);
    } catch (error) {
      if (error.response?.status === 403) {
        message.error('权限不足，只有管理员可以查看历史记录');
      } else {
        message.error('获取历史记录失败');
      }
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchHistories();
  }, [fetchHistories]);

  const handleRevert = async (historyId) => {
    Modal.confirm({
      title: '确认回退',
      content: '确定要回退到此版本吗？此操作将覆盖当前数据。',
      onOk: async () => {
        try {
          await historyAPI.revert(historyId);
          message.success('回退成功');
          fetchHistories();
          if (onRevert) {
            onRevert();
          }
        } catch (error) {
          message.error('回退失败：' + (error.response?.data?.error || error.message));
        }
      }
    });
  };

  const handleBatchRevert = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择要回退的记录');
      return;
    }

    Modal.confirm({
      title: '确认批量回退',
      width: 600,
      content: (
        <div>
          <p>确定要回退以下 {selectedRowKeys.length} 条记录吗？</p>
          <ul style={{ maxHeight: 200, overflow: 'auto' }}>
            {histories
              .filter(h => selectedRowKeys.includes(h.id))
              .map(h => (
                <li key={h.id}>
                  {h.content_type}#{h.object_id} - {h.action_display} by {h.operator_name}
                </li>
              ))}
          </ul>
        </div>
      ),
      onOk: async () => {
        try {
          const response = await historyAPI.batchRevert(selectedRowKeys);
          message.success(`批量回退完成：成功 ${response.data.success} 条，失败 ${response.data.failed} 条`);
          setSelectedRowKeys([]);
          fetchHistories();
          if (onRevert) {
            onRevert();
          }
        } catch (error) {
          message.error('批量回退失败：' + (error.response?.data?.error || error.message));
        }
      }
    });
  };

  const showDetail = (history) => {
    setSelectedHistory(history);
    setDetailVisible(true);
  };

  const handleDateRangeChange = (dates) => {
    if (dates && dates.length === 2) {
      setFilters({
        ...filters,
        start_date: dates[0].startOf('day').toISOString(),
        end_date: dates[1].endOf('day').toISOString(),
      });
    } else {
      setFilters({
        ...filters,
        start_date: '',
        end_date: '',
      });
    }
  };

  const columns = [
    {
      title: '操作类型',
      dataIndex: 'action',
      key: 'action',
      width: 100,
      render: (action) => {
        const colors = {
          create: 'green',
          update: 'blue',
          delete: 'red'
        };
        const labels = {
          create: '创建',
          update: '更新',
          delete: '删除'
        };
        return <Tag color={colors[action]}>{labels[action]}</Tag>;
      }
    },
    {
      title: '操作者',
      dataIndex: 'operator_name',
      key: 'operator_name',
      width: 150,
    },
    {
      title: '模型类型',
      dataIndex: 'content_type',
      key: 'content_type',
      width: 120,
    },
    {
      title: '对象ID',
      dataIndex: 'object_id',
      key: 'object_id',
      width: 100,
    },
    {
      title: '操作时间',
      dataIndex: 'changed_at',
      key: 'changed_at',
      width: 180,
      render: (text) => dayjs(text).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '变更字段',
      dataIndex: 'changed_fields',
      key: 'changed_fields',
      render: (fields, record) => {
        if (!fields || fields.length === 0) return '-';
        const fieldLabels = record.field_labels || {};
        return fields.map(field => (
          <Tag key={field} style={{ marginBottom: 4 }}>
            {fieldLabels[field] || field}
          </Tag>
        ));
      }
    },
    {
      title: '状态',
      dataIndex: 'reverted',
      key: 'reverted',
      width: 100,
      render: (reverted) => (
        reverted ? <Tag color="orange">已回退</Tag> : <Tag color="green">有效</Tag>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => showDetail(record)}
            size="small"
          >
            详情
          </Button>
          {!record.reverted && (
            <Button
              type="link"
              danger
              icon={<RollbackOutlined />}
              onClick={() => handleRevert(record.id)}
              size="small"
            >
              回退
            </Button>
          )}
        </Space>
      )
    }
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: setSelectedRowKeys,
    getCheckboxProps: (record) => ({
      disabled: record.reverted === false, // 已回退的记录不能再次回退
    }),
  };

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={6}>
            <Select
              placeholder="操作者类型"
              allowClear
              style={{ width: '100%' }}
              value={filters.is_admin_action}
              onChange={(value) => setFilters({ ...filters, is_admin_action: value || '' })}
            >
              <Option value="true">管理员</Option>
              <Option value="false">非管理员</Option>
            </Select>
          </Col>
          <Col span={6}>
            <Select
              placeholder="操作类型"
              allowClear
              style={{ width: '100%' }}
              value={filters.action}
              onChange={(value) => setFilters({ ...filters, action: value || '' })}
            >
              <Option value="create">创建</Option>
              <Option value="update">更新</Option>
              <Option value="delete">删除</Option>
            </Select>
          </Col>
          <Col span={6}>
            <Select
              placeholder="是否已回退"
              allowClear
              style={{ width: '100%' }}
              value={filters.reverted}
              onChange={(value) => setFilters({ ...filters, reverted: value || '' })}
            >
              <Option value="true">已回退</Option>
              <Option value="false">未回退</Option>
            </Select>
          </Col>
          <Col span={6}>
            <RangePicker
              style={{ width: '100%' }}
              onChange={handleDateRangeChange}
              showTime
            />
          </Col>
        </Row>
        <Row style={{ marginTop: 16 }}>
          <Col>
            <Button
              type="primary"
              danger
              icon={<RollbackOutlined />}
              onClick={handleBatchRevert}
              disabled={selectedRowKeys.length === 0}
            >
              批量回退 ({selectedRowKeys.length})
            </Button>
          </Col>
        </Row>
      </div>

      <Table
        columns={columns}
        dataSource={histories}
        loading={loading}
        rowKey="id"
        rowSelection={rowSelection}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
        }}
      />
      
      <Modal
        title="历史记录详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={800}
      >
        {selectedHistory && (
          <Descriptions bordered column={2}>
            <Descriptions.Item label="操作类型" span={2}>
              <Tag color={selectedHistory.action === 'create' ? 'green' : selectedHistory.action === 'update' ? 'blue' : 'red'}>
                {selectedHistory.action_display}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="操作者">
              {selectedHistory.operator_name}
            </Descriptions.Item>
            <Descriptions.Item label="操作时间">
              {dayjs(selectedHistory.changed_at).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
            <Descriptions.Item label="模型类型">
              {selectedHistory.content_type}
            </Descriptions.Item>
            <Descriptions.Item label="对象ID">
              {selectedHistory.object_id}
            </Descriptions.Item>
            {selectedHistory.old_data && (
              <Descriptions.Item label="变更前数据" span={2}>
                <pre style={{ maxHeight: 200, overflow: 'auto', background: '#f5f5f5', padding: '8px' }}>
                  {JSON.stringify(selectedHistory.old_data, null, 2)}
                </pre>
              </Descriptions.Item>
            )}
            {selectedHistory.new_data && (
              <Descriptions.Item label="变更后数据" span={2}>
                <pre style={{ maxHeight: 200, overflow: 'auto', background: '#f5f5f5', padding: '8px' }}>
                  {JSON.stringify(selectedHistory.new_data, null, 2)}
                </pre>
              </Descriptions.Item>
            )}
            {selectedHistory.m2m_changes && (
              <Descriptions.Item label="多对多关系变更" span={2}>
                <pre style={{ maxHeight: 200, overflow: 'auto', background: '#f5f5f5', padding: '8px' }}>
                  {JSON.stringify(selectedHistory.m2m_changes, null, 2)}
                </pre>
              </Descriptions.Item>
            )}
            {selectedHistory.changed_fields && selectedHistory.changed_fields.length > 0 && (
              <Descriptions.Item label="变更字段" span={2}>
                {selectedHistory.changed_fields.map(field => {
                  const fieldLabel = selectedHistory.field_labels?.[field] || field;
                  return <Tag key={field} style={{ marginBottom: 4 }}>{fieldLabel}</Tag>;
                })}
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export default HistoryViewer;
