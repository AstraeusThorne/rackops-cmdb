import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Popconfirm, message, Card, Input, Modal, Form } from 'antd';
import { PlusOutlined, SearchOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { dutyPersonnelAPI } from '../../../../api';
import './DutyPersonnel.css';

/**
 * 值班人员管理后台组件
 * @returns {React.ReactElement} 值班人员管理界面
 */
const DutyPersonnel = () => {
  const [loading, setLoading] = useState(false);
  const [personnel, setPersonnel] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingPersonnel, setEditingPersonnel] = useState(null);
  const [form] = Form.useForm();

  // 加载值班人员数据
  useEffect(() => {
    fetchPersonnel();
  }, []);

  /**
   * 获取值班人员列表
   */
  const fetchPersonnel = async () => {
    setLoading(true);
    try {
      const response = await dutyPersonnelAPI.getDutyPersonnel();
      // 处理API响应数据，支持分页和直接数组格式
      const personnelData = response.data.results || response.data || [];
      const personnelArray = Array.isArray(personnelData) ? personnelData : [];
      setPersonnel(personnelArray);
      setLoading(false);
      
      // 如果没有值班人员数据，显示提示信息
      if (personnelArray.length === 0) {
        message.info('当前没有值班人员数据，请添加');
      }
    } catch (error) {
      console.error('获取值班人员列表失败:', error);
      message.error('获取值班人员列表失败: ' + (error.response?.data?.detail || error.message || '未知错误'));
      setPersonnel([]); // 确保 personnel 始终是数组
      setLoading(false);
    }
  };

  /**
   * 删除值班人员
   * @param {number} id - 值班人员ID
   */
  const handleDelete = async (id) => {
    try {
      await dutyPersonnelAPI.deleteDutyPersonnel(id);
      setPersonnel(Array.isArray(personnel) ? personnel.filter(person => person.id !== id) : []);
      message.success('值班人员删除成功');
    } catch (error) {
      console.error('删除值班人员失败:', error);
      message.error('值班人员删除失败');
    }
  };

  /**
   * 编辑值班人员
   * @param {object} record - 值班人员记录
   */
  const handleEdit = (record) => {
    setEditingPersonnel(record);
    form.setFieldsValue({
      name: record.name,
      employee_id: record.employee_id,
      id_card: record.id_card,
      phone: record.phone,
      type: record.type
    });
    setIsModalVisible(true);
  };

  /**
   * 添加新值班人员
   */
  const handleAdd = () => {
    setEditingPersonnel(null);
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
   * 保存值班人员数据
   */
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      
      if (editingPersonnel) {
        // 编辑现有值班人员
        await dutyPersonnelAPI.updateDutyPersonnel(editingPersonnel.id, values);
        setPersonnel(Array.isArray(personnel) ? personnel.map(person => 
          person.id === editingPersonnel.id 
          ? { ...person, ...values } 
          : person
        ) : []);
        message.success('值班人员信息更新成功');
      } else {
        // 添加新值班人员
        const response = await dutyPersonnelAPI.createDutyPersonnel(values);
        const newPerson = response.data;
        setPersonnel(Array.isArray(personnel) ? [...personnel, newPerson] : [newPerson]);
        message.success('值班人员添加成功');
      }
      
      setIsModalVisible(false);
    } catch (error) {
      message.error('保存失败，请检查输入');
    }
  };

  /**
   * 搜索值班人员
   * @param {string} value - 搜索文本
   */
  const handleSearch = (value) => {
    setSearchText(value);
  };

  // 过滤值班人员
  const filteredPersonnel = Array.isArray(personnel) ? personnel.filter(person => 
    person?.name?.toLowerCase().includes(searchText.toLowerCase()) ||
    (person?.employee_id && person.employee_id.includes(searchText)) ||
    (person?.phone && person.phone.includes(searchText)) ||
    (person?.id_card && person.id_card.includes(searchText)) ||
    (person?.type && person.type.toLowerCase().includes(searchText.toLowerCase()))
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
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '员工ID',
      dataIndex: 'employee_id',
      key: 'employee_id',
    },
    {
      title: '身份证',
      dataIndex: 'id_card',
      key: 'id_card',
    },
    {
      title: '电话',
      dataIndex: 'phone',
      key: 'phone',
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
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
            title="确定要删除此值班人员吗?"
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
    <div className="duty-personnel-management">
      <Card
        title="值班人员管理"
        extra={
          <Space>
            <Input
              placeholder="搜索值班人员..."
              prefix={<SearchOutlined />}
              onChange={(e) => handleSearch(e.target.value)}
              style={{ width: 200 }}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAdd}
            >
              添加值班人员
            </Button>
          </Space>
        }
      >
        <Table
          loading={loading}
          columns={columns}
          dataSource={filteredPersonnel}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          locale={{
            emptyText: '暂无值班人员数据，请点击上方"添加值班人员"按钮创建'
          }}
        />
      </Card>

      <Modal
        title={editingPersonnel ? "编辑值班人员" : "添加值班人员"}
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
            label="姓名"
            rules={[{ required: true, message: '请输入姓名!' }]}
          >
            <Input placeholder="请输入姓名" />
          </Form.Item>
          
          <Form.Item
            name="employee_id"
            label="员工ID"
            rules={[{ required: true, message: '请输入员工ID!' }]}
          >
            <Input placeholder="请输入员工ID" />
          </Form.Item>
          
          <Form.Item
            name="id_card"
            label="身份证"
            rules={[
              { required: true, message: '请输入身份证号码!' },
              { pattern: /(^\d{15}$)|(^\d{18}$)|(^\d{17}(\d|X|x)$)/, message: '请输入有效的身份证号码!' }
            ]}
          >
            <Input placeholder="请输入身份证号码" />
          </Form.Item>
          
          <Form.Item
            name="phone"
            label="电话"
            rules={[
              { required: true, message: '请输入电话号码!' },
              { pattern: /^1[3-9]\d{9}$/, message: '请输入有效的手机号码!' }
            ]}
          >
            <Input placeholder="请输入电话号码" />
          </Form.Item>
          
          <Form.Item
            name="type"
            label="类型"
            rules={[{ required: true, message: '请输入类型!' }]}
          >
            <Input placeholder="请输入类型" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default DutyPersonnel; 