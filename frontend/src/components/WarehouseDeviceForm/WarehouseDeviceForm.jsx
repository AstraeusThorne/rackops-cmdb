/**
 * 仓库设备表单组件
 * 用于添加或编辑仓库设备信息
 * 
 * @param {Object} props - 组件属性
 * @param {Object} props.initialValues - 初始表单值（编辑时使用）
 * @param {Function} props.onFinish - 表单提交成功的回调
 * @param {Function} props.onCancel - 取消操作的回调
 * @param {boolean} props.isEdit - 是否为编辑模式
 * @returns {React.ReactElement} 仓库设备表单组件
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Form, Input, InputNumber, Select, DatePicker, Button, message, Row, Col, Space } from 'antd';
import { DesktopOutlined, ThunderboltOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { warehouseDeviceAPI } from '../../api/warehouseDeviceAPI';
import { useClientOptions } from '../../hooks/useSelectOptions';

const { TextArea } = Input;
const { Option } = Select;

const WarehouseDeviceForm = ({ initialValues = {}, onFinish, onCancel, isEdit = false }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const { items: clients, loading: clientsLoading } = useClientOptions();
  const supplierOptions = useMemo(
    () => clients.map((client) => ({ value: client.name, label: client.name || '-' })),
    [clients]
  );

  // 设备类型选项
  const deviceTypeOptions = [
    { value: 'server', label: '服务器', icon: <DesktopOutlined /> },
    { value: 'switch', label: '交换机', icon: <DesktopOutlined /> },
    { value: 'router', label: '路由器', icon: <DesktopOutlined /> },
    { value: 'firewall', label: '防火墙', icon: <DesktopOutlined /> },
    { value: 'storage', label: '存储设备', icon: <DesktopOutlined /> },
    { value: 'ups', label: 'UPS', icon: <ThunderboltOutlined /> },
    { value: 'pdu', label: 'PDU', icon: <ThunderboltOutlined /> },
    { value: 'other', label: '其他', icon: <DesktopOutlined /> }
  ];

  // 电源类型选项
  const powerTypeOptions = [
    { value: 'single', label: '单电源' },
    { value: 'dual', label: '双电源' }
  ];

  // 初始化表单值
  useEffect(() => {
    if (initialValues && Object.keys(initialValues).length > 0) {
      const formValues = {
        ...initialValues,
        collection_time: initialValues.collection_time 
          ? dayjs(initialValues.collection_time) 
          : dayjs()
      };
      form.setFieldsValue(formValues);
    } else if (!isEdit) {
      // 新建时设置默认值
      form.setFieldsValue({
        device_type: 'other',
        power_type: 'single',
        collection_time: dayjs(),
        status: 'in_warehouse'
      });
    }
  }, [initialValues, isEdit, form]);

  /**
   * 表单提交处理
   * @param {Object} values - 表单值
   */
  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      // 处理日期字段
      const submitData = {
        ...values,
        collection_time: values.collection_time 
          ? values.collection_time.format('YYYY-MM-DD HH:mm:ss')
          : new Date().toISOString()
      };

      if (isEdit) {
        await warehouseDeviceAPI.updateWarehouseDevice(initialValues.id, submitData);
        message.success('仓库设备更新成功');
      } else {
        await warehouseDeviceAPI.createWarehouseDevice(submitData);
        message.success('仓库设备添加成功');
      }

      // 成功后重置表单状态
      form.resetFields();
      onFinish && onFinish();
    } catch (error) {
      console.error('仓库设备保存失败:', error);
      message.error('仓库设备保存失败: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  /**
   * 处理取消操作
   */
  const handleCancel = () => {
    form.resetFields();
    onCancel && onCancel();
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
      initialValues={{
        device_type: 'other',
        power_type: 'single',
        status: 'in_warehouse',
        collection_time: dayjs()
      }}
    >
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="brand"
            label="品牌"
            rules={[{ required: true, message: '请输入品牌' }]}
          >
            <Input placeholder="请输入品牌" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="model"
            label="型号"
            rules={[{ required: true, message: '请输入型号' }]}
          >
            <Input placeholder="请输入型号" />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="sn"
            label="序列号"
            rules={[{ required: true, message: '请输入序列号' }]}
          >
            <Input placeholder="请输入序列号" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="u_size"
            label="U数"
            rules={[{ required: true, message: '请输入U数' }]}
          >
            <InputNumber min={1} max={42} style={{ width: '100%' }} placeholder="请输入U数" />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="power_type"
            label="单/双电源"
            rules={[{ required: true, message: '请选择电源类型' }]}
          >
            <Select placeholder="请选择电源类型">
              {powerTypeOptions.map(option => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="device_type"
            label="设备类型"
            rules={[{ required: true, message: '请选择设备类型' }]}
          >
            <Select placeholder="请选择设备类型">
              {deviceTypeOptions.map(option => (
                <Option key={option.value} value={option.value}>
                  {option.icon} {option.label}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="power_wattage"
            label="电源瓦数(W)"
          >
            <InputNumber 
              min={1} 
              max={50000} 
              style={{ width: '100%' }} 
              placeholder="请输入电源瓦数"
              formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={value => value.replace(/\$\s?|(,*)/g, '')}
            />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="supplier"
            label="供货方（客户）"
          >
            <Select 
              placeholder="请选择客户" 
              showSearch
              allowClear
              optionFilterProp="label"
              loading={clientsLoading}
              options={supplierOptions}
              filterOption={(input, option) =>
                (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="collection_time"
            label="代收时间"
            rules={[{ required: true, message: '请选择代收时间' }]}
          >
            <DatePicker 
              showTime 
              format="YYYY-MM-DD HH:mm:ss" 
              style={{ width: '100%' }} 
              placeholder="请选择代收时间"
            />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="warehouse_location"
            label="仓库位置"
          >
            <Input placeholder="如：机房楼1楼仓库" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="status"
            label="状态"
            rules={[{ required: true, message: '请选择状态' }]}
          >
            <Select placeholder="请选择状态">
              <Option value="in_warehouse">在库</Option>
              <Option value="installed">已上架</Option>
              <Option value="out_of_warehouse">已出库</Option>
            </Select>
          </Form.Item>
        </Col>
      </Row>

      <Form.Item
        name="notes"
        label="备注"
      >
        <TextArea rows={4} placeholder="请输入备注信息" />
      </Form.Item>

      <Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" loading={loading}>
            {isEdit ? '更新' : '创建'}
          </Button>
          <Button onClick={handleCancel}>
            取消
          </Button>
        </Space>
      </Form.Item>
    </Form>
  );
};

export default WarehouseDeviceForm;
