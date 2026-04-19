import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Popconfirm, message, Card, Input, Modal, Form, Select } from 'antd';
import { PlusOutlined, SearchOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { cabinetAPI } from '../../../../api';
import { useClientOptions, useRoomOptions } from '../../../../hooks/useSelectOptions';
import './Cabinet.css';

/**
 * 机柜管理后台组件
 * @returns {React.ReactElement} 机柜管理界面
 */
const Cabinet = () => {
  const [loading, setLoading] = useState(false);
  const [cabinets, setCabinets] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [filterClientId, setFilterClientId] = useState(undefined);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingCabinet, setEditingCabinet] = useState(null);
  const [form] = Form.useForm();
  const { items: rooms, options: roomOptions } = useRoomOptions();
  const { items: clients, options: clientOptions } = useClientOptions();

  // 加载机柜、机房、客户数据
  useEffect(() => {
    fetchCabinets();
  }, []);

  /**
   * 获取机柜列表
   */
  const fetchCabinets = async () => {
    setLoading(true);
    try {
      // 使用 getAllCabinets 获取所有机柜数据（处理分页）
      const response = await cabinetAPI.getAllCabinets();
      // getAllCabinets 返回的格式是 { data: allCabinets }
      const cabinetsData = response.data || [];
      setCabinets(Array.isArray(cabinetsData) ? cabinetsData : []);
      setLoading(false);
    } catch (error) {
      console.error('获取机柜列表失败:', error);
      message.error('获取机柜列表失败');
      setCabinets([]); // 确保 cabinets 始终是数组
      setLoading(false);
    }
  };

  /**
   * 删除机柜
   * @param {number} id - 机柜ID
   */
  const handleDelete = async (id) => {
    try {
      await cabinetAPI.deleteCabinet(id);
      setCabinets(Array.isArray(cabinets) ? cabinets.filter(cabinet => cabinet.id !== id) : []);
      message.success('机柜删除成功');
    } catch (error) {
      console.error('删除机柜失败:', error);
      message.error('机柜删除失败');
    }
  };

  /**
   * 编辑机柜
   * @param {object} record - 机柜记录
   */
  const handleEdit = (record) => {
    setEditingCabinet(record);
    const clientId = record.client ?? record.client_id ?? null;
    form.setFieldsValue({
      name: record.name,
      room: record.room,
      client: clientId || undefined
    });
    setIsModalVisible(true);
  };

  /**
   * 添加新机柜
   */
  const handleAdd = () => {
    setEditingCabinet(null);
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
   * 保存机柜数据
   */
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const payload = { ...values };
      if (payload.client === undefined || payload.client === null) {
        payload.client = null;
      }
      const selectedRoom = rooms.find(room => room.id === payload.room);
      const roomName = selectedRoom ? selectedRoom.name : '';
      const selectedClient = payload.client ? clients.find(c => c.id === payload.client) : null;
      const clientName = selectedClient ? selectedClient.name : '';

      if (editingCabinet) {
        await cabinetAPI.updateCabinet(editingCabinet.id, payload);
        setCabinets(Array.isArray(cabinets) ? cabinets.map(cabinet =>
          cabinet.id === editingCabinet.id
            ? { ...cabinet, ...payload, room_name: roomName, client_name: clientName }
            : cabinet
        ) : []);
        message.success('机柜信息更新成功');
      } else {
        const response = await cabinetAPI.createCabinet(payload);
        const newCabinet = response.data;
        setCabinets(Array.isArray(cabinets) ? [...cabinets, { ...newCabinet, room_name: roomName, client_name: clientName }] : [{ ...newCabinet, room_name: roomName, client_name: clientName }]);
        message.success('机柜添加成功');
      }

      setIsModalVisible(false);
    } catch (error) {
      message.error('保存失败，请检查输入');
    }
  };

  /**
   * 搜索机柜
   * @param {string} value - 搜索文本
   */
  const handleSearch = (value) => {
    setSearchText(value);
  };

  // 过滤机柜（按搜索文本与按客户筛选）
  const filteredCabinets = Array.isArray(cabinets) ? cabinets.filter(cabinet => {
    const nameMatch = cabinet.name?.toLowerCase().includes(searchText.toLowerCase()) || false;
    const roomMatch = cabinet.room_name?.toLowerCase().includes(searchText.toLowerCase()) || false;
    const clientMatch = (cabinet.client_name || '').toLowerCase().includes(searchText.toLowerCase()) || false;
    const textMatch = nameMatch || roomMatch || clientMatch;
    const clientId = cabinet.client ?? cabinet.client_id;
    const clientFilterMatch = filterClientId == null || filterClientId === '' || clientId === filterClientId;
    return textMatch && clientFilterMatch;
  }) : [];

  // 表格列定义
  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80
    },
    {
      title: '机柜名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '所在机房',
      dataIndex: 'room_name',
      key: 'room_name',
    },
    {
      title: '所属客户',
      dataIndex: 'client_name',
      key: 'client_name',
      width: 120,
      ellipsis: true,
      render: (name, record) => name ?? (record.client?.name ?? '-'),
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
            title="确定要删除此机柜吗?"
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
    <div className="cabinet-management">
      <Card
        title="机柜管理"
        extra={
          <Space>
            <Select
              placeholder="按客户筛选"
              allowClear
              style={{ width: 160 }}
              value={filterClientId}
              onChange={(v) => setFilterClientId(v)}
              showSearch
              optionFilterProp="label"
              options={clientOptions}
            />
            <Input
              placeholder="搜索机柜..."
              prefix={<SearchOutlined />}
              onChange={(e) => handleSearch(e.target.value)}
              style={{ width: 200 }}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAdd}
            >
              添加机柜
            </Button>
          </Space>
        }
      >
        <Table
          loading={loading}
          columns={columns}
          dataSource={filteredCabinets}
          rowKey={(record) => `${record?.id ?? 'row'}-${record?.name ?? ''}`}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      <Modal
        title={editingCabinet ? "编辑机柜" : "添加机柜"}
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
            label="机柜名称"
            rules={[{ required: true, message: '请输入机柜名称!' }]}
          >
            <Input placeholder="请输入机柜名称" />
          </Form.Item>
          
          <Form.Item
            name="room"
            label="所在机房"
            rules={[{ required: true, message: '请选择机房!' }]}
          >
            <Select placeholder="请选择机房" showSearch optionFilterProp="label" options={roomOptions} />
          </Form.Item>
          <Form.Item name="client" label="所属客户">
            <Select placeholder="请选择客户（可选）" allowClear showSearch optionFilterProp="label" options={clientOptions} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Cabinet; 
