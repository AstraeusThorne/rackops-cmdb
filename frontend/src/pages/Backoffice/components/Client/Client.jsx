import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Popconfirm, message, Card, Input, Modal, Form } from 'antd';
import { PlusOutlined, SearchOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { clientAPI } from '../../../../api';
import './Client.css';

/**
 * 客户管理后台组件
 * @returns {React.ReactElement} 客户管理界面
 */
const Client = () => {
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [form] = Form.useForm();

  // 加载客户数据
  useEffect(() => {
    fetchClients();
  }, []);

  /**
   * 获取客户列表
   */
  const fetchClients = async () => {
    setLoading(true);
    try {
      const response = await clientAPI.getClients();
      // 处理API响应数据，支持分页和直接数组格式
      const clientsData = response.data.results || response.data || [];
      setClients(Array.isArray(clientsData) ? clientsData : []);
      setLoading(false);
    } catch (error) {
      console.error('获取客户列表失败:', error);
      message.error('获取客户列表失败');
      setClients([]); // 确保 clients 始终是数组
      setLoading(false);
    }
  };

  /**
   * 删除客户
   * @param {number} id - 客户ID
   */
  const handleDelete = async (id) => {
    try {
      await clientAPI.deleteClient(id);
      setClients(Array.isArray(clients) ? clients.filter(client => client.id !== id) : []);
      message.success('客户删除成功');
    } catch (error) {
      console.error('删除客户失败:', error);
      message.error('客户删除失败');
    }
  };

  /**
   * 编辑客户
   * @param {object} record - 客户记录
   */
  const handleEdit = (record) => {
    setEditingClient(record);
    form.setFieldsValue({
      name: record.name,
      authorized_person: record.authorized_person
    });
    setIsModalVisible(true);
  };

  /**
   * 添加新客户
   */
  const handleAdd = () => {
    setEditingClient(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  /**
   * 关闭模态框
   */
  const handleCancel = () => {
    setIsModalVisible(false);
  };

  /**
   * 保存客户数据
   */
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      
      if (editingClient) {
        // 编辑现有客户
        await clientAPI.updateClient(editingClient.id, values);
        setClients(Array.isArray(clients) ? clients.map(client => 
          client.id === editingClient.id 
          ? { ...client, ...values } 
          : client
        ) : []);
        message.success('客户信息更新成功');
      } else {
        // 添加新客户
        const response = await clientAPI.createClient(values);
        const newClient = response.data;
        setClients(Array.isArray(clients) ? [...clients, newClient] : [newClient]);
        message.success('客户添加成功');
      }
      
      setIsModalVisible(false);
    } catch (error) {
      message.error('保存失败，请检查输入');
    }
  };

  /**
   * 搜索客户
   * @param {string} value - 搜索文本
   */
  const handleSearch = (value) => {
    setSearchText(value);
  };

  // 过滤客户
  const filteredClients = Array.isArray(clients) ? clients.filter(client => 
    client?.name?.toLowerCase().includes(searchText.toLowerCase()) ||
    client?.authorized_person?.toLowerCase().includes(searchText.toLowerCase())
  ) : [];

  // 表格列定义
  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80
    },
    {
      title: '客户名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '授权人',
      dataIndex: 'authorized_person',
      key: 'authorized_person',
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space size="middle">
          <Button 
            type="primary" 
            icon={<EditOutlined />} 
            size="small"
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除此客户吗?"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button 
              danger 
              icon={<DeleteOutlined />} 
              size="small"
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="client-management">
      <Card
        title="客户管理"
        extra={
          <Space>
            <Input
              placeholder="搜索客户..."
              prefix={<SearchOutlined />}
              onChange={(e) => handleSearch(e.target.value)}
              style={{ width: 200 }}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAdd}
            >
              添加客户
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={filteredClients}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* 添加/编辑客户模态框 */}
      <Modal
        title={editingClient ? "编辑客户" : "添加客户"}
        open={isModalVisible}
        onOk={handleSave}
        onCancel={handleCancel}
        okText="保存"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
        >
          <Form.Item
            name="name"
            label="客户名称"
            rules={[
              { 
                required: true, 
                message: '请输入客户名称' 
              }
            ]}
          >
            <Input placeholder="请输入客户名称" />
          </Form.Item>
          <Form.Item
            name="authorized_person"
            label="授权人"
            rules={[
              { 
                required: true, 
                message: '请输入授权人' 
              }
            ]}
          >
            <Input placeholder="请输入授权人" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Client; 