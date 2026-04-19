import React, { useState, useEffect } from 'react';
import { Table, Button, Tag, Modal, Form, Input, message, Descriptions, Space } from 'antd';
import { CheckOutlined, CloseOutlined, EyeOutlined } from '@ant-design/icons';
import { dutyPersonnelAPI } from '../../api';
import dayjs from 'dayjs';

/**
 * 值班人员审核管理页面（仅管理员）
 */
const DutyPersonnelApproval = () => {
  const [pendingList, setPendingList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [rejectVisible, setRejectVisible] = useState(false);
  const [currentRecord, setCurrentRecord] = useState(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchPendingApprovals();
  }, []);

  const fetchPendingApprovals = async () => {
    setLoading(true);
    try {
      const response = await dutyPersonnelAPI.pendingApprovals();
      setPendingList(response.data.results || response.data || []);
    } catch (error) {
      if (error.response?.status === 403) {
        message.error('权限不足，只有管理员可以访问此页面');
      } else {
        message.error('获取待审核列表失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (record) => {
    Modal.confirm({
      title: '确认审核通过',
      content: `确定要审核通过 ${record.name} 的注册申请吗？`,
      onOk: async () => {
        try {
          await dutyPersonnelAPI.approve(record.id);
          message.success('审核通过');
          fetchPendingApprovals();
        } catch (error) {
          message.error('审核失败：' + (error.response?.data?.error || error.message));
        }
      }
    });
  };

  const handleReject = (record) => {
    setCurrentRecord(record);
    setRejectVisible(true);
    form.resetFields();
  };

  const handleRejectSubmit = async () => {
    try {
      const values = await form.validateFields();
      await dutyPersonnelAPI.reject(currentRecord.id, values.rejection_reason);
      message.success('已拒绝该申请');
      setRejectVisible(false);
      fetchPendingApprovals();
    } catch (error) {
      if (error.errorFields) {
        return; // 表单验证错误
      }
      message.error('操作失败：' + (error.response?.data?.error || error.message));
    }
  };

  const showDetail = (record) => {
    setCurrentRecord(record);
    setDetailVisible(true);
  };

  const columns = [
    {
      title: '员工ID',
      dataIndex: 'employee_id',
      key: 'employee_id',
      width: 120,
    },
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      width: 120,
    },
    {
      title: '身份证号',
      dataIndex: 'id_card',
      key: 'id_card',
      width: 180,
    },
    {
      title: '电话',
      dataIndex: 'phone',
      key: 'phone',
      width: 120,
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
    },
    {
      title: '状态',
      dataIndex: 'account_status',
      key: 'account_status',
      width: 100,
      render: (status) => {
        const statusMap = {
          pending: { color: 'orange', text: '待审核' },
          approved: { color: 'green', text: '已审核' },
          rejected: { color: 'red', text: '已拒绝' },
        };
        const statusInfo = statusMap[status] || { color: 'default', text: status };
        return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
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
          <Button
            type="link"
            danger
            icon={<CloseOutlined />}
            onClick={() => handleReject(record)}
            size="small"
          >
            拒绝
          </Button>
          <Button
            type="link"
            icon={<CheckOutlined />}
            onClick={() => handleApprove(record)}
            size="small"
          >
            通过
          </Button>
        </Space>
      )
    }
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Table
        columns={columns}
        dataSource={pendingList}
        loading={loading}
        rowKey="id"
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
        }}
      />

      <Modal
        title="注册详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={600}
      >
        {currentRecord && (
          <Descriptions bordered column={1}>
            <Descriptions.Item label="员工ID">{currentRecord.employee_id}</Descriptions.Item>
            <Descriptions.Item label="姓名">{currentRecord.name}</Descriptions.Item>
            <Descriptions.Item label="身份证号">{currentRecord.id_card}</Descriptions.Item>
            <Descriptions.Item label="电话">{currentRecord.phone}</Descriptions.Item>
            <Descriptions.Item label="类型">{currentRecord.type}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={currentRecord.account_status === 'pending' ? 'orange' : 'default'}>
                {currentRecord.account_status === 'pending' ? '待审核' : currentRecord.account_status}
              </Tag>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      <Modal
        title="拒绝申请"
        open={rejectVisible}
        onOk={handleRejectSubmit}
        onCancel={() => setRejectVisible(false)}
        okText="确认拒绝"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="rejection_reason"
            label="拒绝原因"
            rules={[{ required: true, message: '请输入拒绝原因' }]}
          >
            <Input.TextArea
              rows={4}
              placeholder="请输入拒绝原因"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default DutyPersonnelApproval;

