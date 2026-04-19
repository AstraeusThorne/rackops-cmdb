import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Popconfirm, message, Card, Input, Modal, Form } from 'antd';
import { PlusOutlined, SearchOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { authorizedOrgAPI } from '../../../../api';
import './AuthorizedOrg.css';

/**
 * 授权单位管理后台组件
 * @returns {React.ReactElement} 授权单位管理界面
 */
const AuthorizedOrg = () => {
  const [loading, setLoading] = useState(false);
  const [orgs, setOrgs] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingOrg, setEditingOrg] = useState(null);
  const [form] = Form.useForm();

  // 加载授权单位数据
  useEffect(() => {
    fetchOrgs();
  }, []);

  /**
   * 获取授权单位列表
   */
  const fetchOrgs = async () => {
    setLoading(true);
    try {
      const response = await authorizedOrgAPI.getAuthorizedOrgs();
      // 处理API响应数据，支持分页和直接数组格式
      const orgsData = response.data.results || response.data || [];
      setOrgs(Array.isArray(orgsData) ? orgsData : []);
      setLoading(false);
    } catch (error) {
      console.error('获取授权单位列表失败:', error);
      message.error('获取授权单位列表失败');
      setOrgs([]); // 确保 orgs 始终是数组
      setLoading(false);
    }
  };

  /**
   * 删除授权单位
   * @param {number} id - 授权单位ID
   */
  const handleDelete = async (id) => {
    try {
      await authorizedOrgAPI.deleteAuthorizedOrg(id);
      setOrgs(Array.isArray(orgs) ? orgs.filter(org => org.id !== id) : []);
      message.success('授权单位删除成功');
    } catch (error) {
      console.error('删除授权单位失败:', error);
      message.error('授权单位删除失败');
    }
  };

  /**
   * 编辑授权单位
   * @param {object} record - 授权单位记录
   */
  const handleEdit = (record) => {
    setEditingOrg(record);
    form.setFieldsValue({
      name: record.name
    });
    setIsModalVisible(true);
  };

  /**
   * 添加新授权单位
   */
  const handleAdd = () => {
    setEditingOrg(null);
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
   * 保存授权单位数据
   */
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      
      if (editingOrg) {
        // 编辑现有授权单位
        await authorizedOrgAPI.updateAuthorizedOrg(editingOrg.id, values);
        setOrgs(Array.isArray(orgs) ? orgs.map(org => 
          org.id === editingOrg.id 
          ? { ...org, ...values } 
          : org
        ) : []);
        message.success('授权单位信息更新成功');
      } else {
        // 添加新授权单位
        const response = await authorizedOrgAPI.createAuthorizedOrg(values);
        const newOrg = response.data;
        setOrgs(Array.isArray(orgs) ? [...orgs, newOrg] : [newOrg]);
        message.success('授权单位添加成功');
      }
      
      setIsModalVisible(false);
    } catch (error) {
      message.error('保存失败，请检查输入');
    }
  };

  /**
   * 搜索授权单位
   * @param {string} value - 搜索文本
   */
  const handleSearch = (value) => {
    setSearchText(value);
  };

  // 过滤授权单位
  const filteredOrgs = Array.isArray(orgs) ? orgs.filter(org => 
    org?.name?.toLowerCase().includes(searchText.toLowerCase())
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
      title: '单位名称',
      dataIndex: 'name',
      key: 'name',
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
            title="确定要删除此授权单位吗?"
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
    <div className="authorized-org-management">
      <Card
        title="授权单位管理"
        extra={
          <Space>
            <Input
              placeholder="搜索授权单位..."
              prefix={<SearchOutlined />}
              onChange={(e) => handleSearch(e.target.value)}
              style={{ width: 200 }}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAdd}
            >
              添加授权单位
            </Button>
          </Space>
        }
      >
        <Table
          loading={loading}
          columns={columns}
          dataSource={filteredOrgs}
          rowKey="id"
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title={editingOrg ? "编辑授权单位" : "添加授权单位"}
        open={isModalVisible}
        onOk={handleSave}
        onCancel={handleCancel}
        okText="保存"
        cancelText="取消"
        maskClosable={false}
      >
        <Form
          form={form}
          layout="vertical"
        >
          <Form.Item
            name="name"
            label="单位名称"
            rules={[{ required: true, message: '请输入单位名称!' }]}
          >
            <Input placeholder="请输入单位名称" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AuthorizedOrg;