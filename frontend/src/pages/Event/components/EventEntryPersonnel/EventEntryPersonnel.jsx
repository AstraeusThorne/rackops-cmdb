import React, { useState, useEffect, useCallback } from 'react';
import { 
  Card, 
  Table, 
  Button, 
  Space, 
  Modal, 
  Form, 
  Input, 
  message,
  Tooltip,
  Tag 
} from 'antd';
import { 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined, 
  ExclamationCircleOutlined,
  CalendarOutlined,
  UserOutlined,
  ReloadOutlined 
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { entryPersonnelAPI } from '../../../../api';
import { isValidIdCard } from '../../../../utils/validators';
import styles from './EventEntryPersonnel.module.css';

/**
 * 进场人员组件
 */
const EventEntryPersonnel = () => {
  const navigate = useNavigate();
  const [entryPersonnel, setEntryPersonnel] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [form] = Form.useForm();
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });

  /**
   * 加载进场记录（每条为「某人在某次事件进场」一条，同一人多次进场显示多条）
   * @param {number} [page=1] - 页码
   * @param {number} [pageSize=10] - 每页条数
   */
  const fetchData = useCallback(async (page = 1, pageSize = 10) => {
    try {
      setLoading(true);
      const res = await entryPersonnelAPI.getEntryRecords({ page, page_size: pageSize });
      const list = res.data.results || res.data || [];
      const total = res.data.count ?? list.length;
      setPagination(prev => ({ ...prev, total }));
      setEntryPersonnel(list);
    } catch (error) {
      console.error('Error fetching data:', error);
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 页面加载及分页变化时请求当前页数据
  useEffect(() => {
    fetchData(pagination.current, pagination.pageSize);
  }, [pagination.current, pagination.pageSize]);

  // 显示编辑人员对话框（每条记录对应一人，编辑该人员信息）
  const showModal = (record = null) => {
    setEditingRecord(record);
    
    if (record && record.person) {
      form.setFieldsValue({
        name: record.person.name,
        id_card: record.person.id_card,
        contact_info: record.person.contact_info,
        organization: record.organization
      });
    } else {
      form.resetFields();
    }
    
    setModalVisible(true);
  };

  // 关闭对话框
  const handleCancel = () => {
    setModalVisible(false);
    setEditingRecord(null);
    form.resetFields();
  };

  // 提交表单（仅支持编辑该人员信息，会同步到该人员所有进场记录）
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      if (editingRecord && editingRecord.entry_personnel) {
        await entryPersonnelAPI.updateEntryPerson(editingRecord.entry_personnel, {
          name: values.name,
          id_card: values.id_card,
          contact_info: values.contact_info
        });
        message.success('更新成功');
        setModalVisible(false);
        setEditingRecord(null);
        form.resetFields();
        fetchData(pagination.current, pagination.pageSize);
      }
    } catch (error) {
      console.error('Form validation failed:', error);
    }
  };

  // 删除本条进场记录（仅删除该次事件与人员的关联，不删除人员本身）
  const handleDelete = async (record) => {
    const name = record.person?.name || record.personnel_name || '该人员';
    Modal.confirm({
      title: '确认删除',
      icon: <ExclamationCircleOutlined />,
      content: `确定要删除${name}的这条进场记录吗？（仅删除与当前事件的关联，不删除人员信息）`,
      okText: '确认',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          setLoading(true);
          await entryPersonnelAPI.deleteEntryRecord(record.id);
          message.success('删除成功');
          await fetchData(pagination.current, pagination.pageSize);
        } catch (error) {
          console.error('删除失败:', error);
          message.error('删除失败: ' + (error.response?.data?.detail || error.message || '未知错误'));
        } finally {
          setLoading(false);
        }
      }
    });
  };

  // 跳转到创建事件页面
  const handleAddViaEvent = () => {
    navigate('/event/create');
  };

  // 刷新数据
  const handleRefresh = () => {
    fetchData(pagination.current, pagination.pageSize);
    message.success('数据已刷新');
  };

  // 表格列定义（每条记录为「某人在某次事件进场」一条）
  const columns = [
    {
      title: '姓名',
      key: 'name',
      width: 120,
      render: (_, record) => record.person?.name ?? record.personnel_name ?? '-',
    },
    {
      title: '身份证号',
      key: 'id_card',
      width: 180,
      render: (_, record) => {
        const text = record.person?.id_card;
        const maskedIdCard = text ? text.replace(/^(.{6})(.*)(.{4})$/, '$1******$3') : '-';
        return (
          <Tooltip title={text}>
            {maskedIdCard}
          </Tooltip>
        );
      }
    },
    {
      title: '联系方式',
      key: 'contact_info',
      width: 150,
      render: (_, record) => {
        const text = record.person?.contact_info;
        const maskedPhone = text ? text.replace(/^(.{3})(.*)(.{4})$/, '$1****$3') : '-';
        return (
          <Tooltip title={text}>
            {maskedPhone}
          </Tooltip>
        );
      }
    },
    {
      title: '所属客户',
      key: 'client_info',
      render: (_, record) => {
        const clients = record.event_info?.clients;
        if (!clients || !clients.length) return '-';
        const displayClients = clients.slice(0, 2);
        const remainingCount = clients.length - 2;
        return (
          <div>
            {displayClients.map((client, index) => (
              <Tag icon={<UserOutlined />} color="green" key={index}>
                {client.name}
              </Tag>
            ))}
            {remainingCount > 0 && (
              <Tooltip title={clients.slice(2).map(c => c.name).join(', ')}>
                <Tag color="blue">+{remainingCount}</Tag>
              </Tooltip>
            )}
          </div>
        );
      }
    },
    {
      title: '关联事件',
      key: 'event_info',
      render: (_, record) => {
        const ev = record.event_info;
        if (!ev) return '-';
        return (
          <Tag icon={<CalendarOutlined />} color="blue">
            {ev.order_number || '未知事件'} ({ev.date} {ev.start_time}-{ev.end_time})
          </Tag>
        );
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Space size="small">
          <Button 
            type="link" 
            icon={<EditOutlined />} 
            onClick={() => showModal(record)}
            className={styles.editButton}
          />
          <Button 
            type="link" 
            icon={<DeleteOutlined />} 
            onClick={() => handleDelete(record)}
            className={styles.deleteButton}
          />
        </Space>
      ),
    },
  ];

  return (
    <div className={styles.entryPersonnelPage}>
      <Card
        title="进场人员管理"
        extra={
          <Space>
            <Button 
              onClick={handleRefresh} 
              icon={<ReloadOutlined />}
              title="刷新数据"
            >
              刷新
            </Button>
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={handleAddViaEvent}
            >
              新增事件
            </Button>
          </Space>
        }
      >
        <Table 
          dataSource={entryPersonnel} 
          columns={columns}
          rowKey="id"
          loading={loading}
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
      
      <Modal
        title={editingRecord ? '编辑人员信息' : '添加人员'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={handleCancel}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input placeholder="请输入姓名" />
          </Form.Item>
          
          <Form.Item
            name="id_card"
            label="身份证号"
            rules={[
              { required: true, message: '请输入身份证号' },
              { 
                validator: (_, value) => {
                  if (!value || isValidIdCard(value)) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('身份证号格式不正确'));
                }
              }
            ]}
          >
            <Input placeholder="请输入身份证号" />
          </Form.Item>
          
          <Form.Item
            name="contact_info"
            label="联系方式"
            rules={[
              { required: true, message: '请输入联系方式' },
              { pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确' }
            ]}
          >
            <Input placeholder="请输入联系方式" />
          </Form.Item>
          
          {/* 注意：后端没有 organization 字段，这里暂时保留但应该在后续更新中移除或调整 */}
          <Form.Item
            name="organization"
            label="所属单位"
          >
            <Input placeholder="请输入所属单位" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default EventEntryPersonnel;