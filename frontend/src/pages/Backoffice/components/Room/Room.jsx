import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Popconfirm, message, Card, Input, Modal, Form } from 'antd';
import { PlusOutlined, SearchOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { roomAPI } from '../../../../api';
import './Room.css';

/**
 * 机房管理后台组件
 * @returns {React.ReactElement} 机房管理界面
 */
const Room = () => {
  const [loading, setLoading] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [form] = Form.useForm();

  // 加载机房数据
  useEffect(() => {
    fetchRooms();
  }, []);

  /**
   * 获取机房列表
   */
  const fetchRooms = async () => {
    setLoading(true);
    try {
      const response = await roomAPI.getRooms();
      // 处理API响应数据，支持分页和直接数组格式
      const roomsData = response.data.results || response.data || [];
      setRooms(Array.isArray(roomsData) ? roomsData : []);
      setLoading(false);
    } catch (error) {
      console.error('获取机房列表失败:', error);
      message.error('获取机房列表失败');
      setRooms([]); // 确保 rooms 始终是数组
      setLoading(false);
    }
  };

  /**
   * 删除机房
   * @param {number} id - 机房ID
   */
  const handleDelete = async (id) => {
    try {
      await roomAPI.deleteRoom(id);
      setRooms(Array.isArray(rooms) ? rooms.filter(room => room.id !== id) : []);
      message.success('机房删除成功');
    } catch (error) {
      console.error('删除机房失败:', error);
      message.error('机房删除失败');
    }
  };

  /**
   * 编辑机房
   * @param {object} record - 机房记录
   */
  const handleEdit = (record) => {
    setEditingRoom(record);
    form.setFieldsValue({
      name: record.name
    });
    setIsModalVisible(true);
  };

  /**
   * 添加新机房
   */
  const handleAdd = () => {
    setEditingRoom(null);
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
   * 保存机房数据
   */
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      
      if (editingRoom) {
        // 编辑现有机房
        await roomAPI.updateRoom(editingRoom.id, values);
        setRooms(Array.isArray(rooms) ? rooms.map(room => 
          room.id === editingRoom.id 
          ? { ...room, ...values } 
          : room
        ) : []);
        message.success('机房信息更新成功');
      } else {
        // 添加新机房
        const response = await roomAPI.createRoom(values);
        const newRoom = response.data;
        setRooms(Array.isArray(rooms) ? [...rooms, newRoom] : [newRoom]);
        message.success('机房添加成功');
      }
      
      setIsModalVisible(false);
    } catch (error) {
      message.error('保存失败，请检查输入');
    }
  };

  /**
   * 搜索机房
   * @param {string} value - 搜索文本
   */
  const handleSearch = (value) => {
    setSearchText(value);
  };

  // 过滤机房
  const filteredRooms = Array.isArray(rooms) ? rooms.filter(room => 
    room?.name?.toLowerCase().includes(searchText.toLowerCase())
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
      title: '机房名称',
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
            title="确定要删除此机房吗?"
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
    <div className="room-management">
      <Card
        title="机房管理"
        extra={
          <Space>
            <Input
              placeholder="搜索机房..."
              prefix={<SearchOutlined />}
              onChange={(e) => handleSearch(e.target.value)}
              style={{ width: 200 }}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAdd}
            >
              添加机房
            </Button>
          </Space>
        }
      >
        <Table
          loading={loading}
          columns={columns}
          dataSource={filteredRooms}
          rowKey="id"
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title={editingRoom ? "编辑机房" : "添加机房"}
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
            label="机房名称"
            rules={[{ required: true, message: '请输入机房名称!' }]}
          >
            <Input placeholder="请输入机房名称" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Room; 