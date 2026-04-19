/**
 * 上架设备模态框组件
 * 用于从仓库选择设备并上架到机柜
 * 
 * @param {Object} props - 组件属性
 * @param {boolean} props.visible - 是否显示模态框
 * @param {Object} props.warehouseDevice - 要上架的仓库设备（可选，如果提供则直接使用）
 * @param {Function} props.onFinish - 上架成功的回调
 * @param {Function} props.onCancel - 取消操作的回调
 * @returns {React.ReactElement} 上架设备模态框组件
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Form, Select, Input, DatePicker, TimePicker, Button, message, Row, Col } from 'antd';
import dayjs from 'dayjs';
import { deviceAPI } from '../../api';
import { warehouseDeviceAPI } from '../../api/warehouseDeviceAPI';
import {
  filterCabinetsByRoomIds,
  useCabinetOptions,
  useEventOptions,
  useRoomOptions,
} from '../../hooks/useSelectOptions';

const { Option } = Select;
const { TextArea } = Input;

const InstallDeviceModal = ({ visible, warehouseDevice, onFinish, onCancel }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [selectedCabinet, setSelectedCabinet] = useState(null);
  const [cabinetDevices, setCabinetDevices] = useState([]);
  const [warehouseDevices, setWarehouseDevices] = useState([]);
  const { items: rooms, options: roomOptions } = useRoomOptions({ enabled: visible });
  const { items: allCabinets } = useCabinetOptions({ enabled: visible });
  const { options: eventOptions } = useEventOptions({ enabled: visible, immediate: true });
  const cabinets = useMemo(
    () => filterCabinetsByRoomIds(allCabinets, selectedRoom ? [selectedRoom] : []),
    [allCabinets, selectedRoom]
  );
  const roomNameById = useMemo(
    () => new Map(rooms.map((room) => [Number.parseInt(room.id, 10), room.name || ''])),
    [rooms]
  );

  // 获取机房列表
  useEffect(() => {
    if (visible) {
      fetchWarehouseDevices();
    }
  }, [visible]);

  // 如果提供了warehouseDevice，设置表单值
  useEffect(() => {
    if (visible && warehouseDevice) {
      form.setFieldsValue({
        warehouse_device_id: warehouseDevice.id,
        action_date: dayjs(),
        action_time: dayjs()
      });
    } else if (visible) {
      form.setFieldsValue({
        action_date: dayjs(),
        action_time: dayjs()
      });
    }
  }, [visible, warehouseDevice, form]);

  // 当机柜变化时，清空机架位置
  useEffect(() => {
    if (selectedCabinet) {
      form.setFieldsValue({ rack_position: undefined });
    }
  }, [selectedCabinet, form]);

  /**
   * 获取仓库设备列表（仅显示在库的设备）
   */
  const fetchWarehouseDevices = async () => {
    try {
      const response = await warehouseDeviceAPI.getWarehouseDevices({ status: 'in_warehouse' });
      setWarehouseDevices(response.data.results || response.data || []);
    } catch (error) {
      message.error('获取仓库设备列表失败');
    }
  };

  /**
   * 处理机房选择变化
   * @param {number} roomId - 机房ID
   */
  const handleRoomChange = (roomId) => {
    const nextRoomId = roomId != null ? Number.parseInt(roomId, 10) : null;
    setSelectedRoom(Number.isNaN(nextRoomId) ? null : nextRoomId);
    form.setFieldsValue({ cabinet_id: undefined });
    setSelectedCabinet(null);
    setCabinetDevices([]);
  };

  /**
   * 获取机柜中的设备列表
   * @param {number} cabinetId - 机柜ID
   */
  const fetchCabinetDevices = async (cabinetId) => {
    try {
      const cabinetIdNum = Number.parseInt(cabinetId, 10);
      const pageSize = 200;
      let page = 1;
      let total = 0;
      let fetchedCount = 0;
      const devices = [];

      do {
        const response = await deviceAPI.getDevices({
          cabinet: cabinetIdNum,
          page,
          page_size: pageSize,
        });
        const data = response.data || {};
        const results = data.results || (Array.isArray(data) ? data : []);
        fetchedCount = results.length;
        devices.push(...results);
        total = typeof data.count === 'number' ? data.count : devices.length;
        page += 1;
      } while (fetchedCount === pageSize && devices.length < total);

      setCabinetDevices(devices);
      return devices;
    } catch (error) {
      console.error('获取机柜设备失败:', error);
      message.error('获取机柜设备数据失败');
      return [];
    }
  };

  /**
   * 检查设备位置是否冲突
   * @param {number} cabinetId - 机柜ID
   * @param {number} position - 起始位置
   * @param {number} uSize - U数
   * @returns {boolean} 是否有冲突
   */
  const checkDevicePositionConflict = (cabinetId, position, uSize) => {
    if (!cabinetId || !position || !uSize) {
      return false;
    }
    
    const cabinetIdNum = parseInt(cabinetId, 10);
    const positionNum = parseInt(position, 10);
    const uSizeNum = parseInt(uSize, 10);
    
    // 检查U数限制
    if (positionNum + uSizeNum - 1 > 42) {
      return true;
    }
    
    // 当前设备的U位范围
    const currentRange = Array.from({ length: uSizeNum }, (_, i) => positionNum + i);
    
    // 检查冲突
    const hasConflict = cabinetDevices.some(device => {
      const deviceCabinetId = parseInt(device.cabinet_id || device.cabinet, 10);
      if (deviceCabinetId !== cabinetIdNum) {
        return false;
      }
      
      const devicePosition = parseInt(device.rack_position, 10);
      const deviceUSize = parseInt(device.u_size, 10);
      
      if (isNaN(devicePosition) || isNaN(deviceUSize)) {
        return false;
      }
      
      const deviceRange = Array.from(
        { length: deviceUSize }, 
        (_, i) => devicePosition + i
      );
      
      return currentRange.some(pos => deviceRange.includes(pos));
    });
    
    return hasConflict;
  };

  /**
   * 处理机柜选择变化
   * @param {number} cabinetId - 机柜ID
   */
  const handleCabinetChange = async (cabinetId) => {
    const cabinet = cabinets.find(c => c.id === cabinetId);
    if (cabinet) {
      setSelectedCabinet(cabinet);
      const cabinetRoomId = typeof cabinet.room === 'object' && cabinet.room !== null
        ? Number.parseInt(cabinet.room.id ?? cabinet.room, 10)
        : Number.parseInt(cabinet.room_id ?? cabinet.room, 10);
      const roomName = cabinet.room_name || roomNameById.get(cabinetRoomId);
      if (roomName && cabinet) {
        // 自动生成上架位置，格式：F1D-07-10
        const installLocation = `${roomName}-${cabinet.name}`;
        form.setFieldsValue({ install_location: installLocation });
      }
      // 获取机柜中的设备列表用于位置检测
      await fetchCabinetDevices(cabinetId);
    } else {
      setSelectedCabinet(null);
      setCabinetDevices([]);
    }
  };

  /**
   * 表单提交处理
   * @param {Object} values - 表单值
   */
  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      const warehouseDeviceId = values.warehouse_device_id || warehouseDevice?.id;
      
      if (!warehouseDeviceId) {
        message.error('请选择要上架的仓库设备');
        setLoading(false);
        return;
      }

      const installData = {
        cabinet_id: values.cabinet_id,
        install_location: values.install_location,
        rack_position: values.rack_position,
        action_date: values.action_date ? values.action_date.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        action_time: values.action_time ? values.action_time.format('HH:mm:ss') : null,
        event_id: values.event_id,
        notes: values.notes
      };

      await warehouseDeviceAPI.installDevice(warehouseDeviceId, installData);
      message.success('设备上架成功');
      form.resetFields();
      onFinish && onFinish();
    } catch (error) {
      console.error('设备上架失败:', error);
      message.error('设备上架失败: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  /**
   * 处理取消操作
   */
  const handleCancel = () => {
    form.resetFields();
    setSelectedRoom(null);
    setSelectedCabinet(null);
    setCabinetDevices([]);
    onCancel && onCancel();
  };

  return (
    <Modal
      title="上架设备"
      open={visible}
      onCancel={handleCancel}
      footer={null}
      width={800}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
      >
        {!warehouseDevice && (
          <Form.Item
            name="warehouse_device_id"
            label="选择仓库设备"
            rules={[{ required: true, message: '请选择要上架的仓库设备' }]}
          >
            <Select
              placeholder="请选择仓库设备"
              showSearch
              optionFilterProp="label"
              filterOption={(input, option) =>
                (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
              }
            >
              {warehouseDevices.map(device => (
                <Option key={device.id} value={device.id}>
                  {device.brand} {device.model} (SN: {device.sn})
                </Option>
              ))}
            </Select>
          </Form.Item>
        )}

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="room_id"
              label="选择机房"
              rules={[{ required: true, message: '请选择机房' }]}
            >
              <Select
                placeholder="请选择机房"
                onChange={handleRoomChange}
                showSearch
                optionFilterProp="label"
                options={roomOptions}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="cabinet_id"
              label="选择机柜"
              rules={[{ required: true, message: '请选择机柜' }]}
            >
              <Select
                placeholder="请先选择机房"
                disabled={!selectedRoom}
                onChange={handleCabinetChange}
                showSearch
                optionFilterProp="label"
                options={cabinets.map((cabinet) => {
                  const cabinetRoomId = typeof cabinet.room === 'object' && cabinet.room !== null
                    ? Number.parseInt(cabinet.room.id ?? cabinet.room, 10)
                    : Number.parseInt(cabinet.room_id ?? cabinet.room, 10);
                  const roomName = cabinet.room_name || roomNameById.get(cabinetRoomId);
                  return {
                    value: cabinet.id,
                    label: roomName ? `${roomName}-${cabinet.name}` : (cabinet.name || '-'),
                  };
                })}
              />
            </Form.Item>
          </Col>
        </Row>

        {/* 上架位置字段 - 当选择了机柜后自动填充，不显示 */}
        <Form.Item
          name="install_location"
          hidden
        >
          <Input />
        </Form.Item>

        <Form.Item
          name="rack_position"
          label="机架位置（起始U位）"
          rules={[
            { required: true, message: '请输入机架位置' },
            {
              validator: (_, value) => {
                if (!value) {
                  return Promise.resolve();
                }
                
                // 验证格式：必须是正整数
                const position = parseInt(value, 10);
                if (isNaN(position) || !Number.isInteger(position) || position <= 0) {
                  return Promise.reject(new Error('机架位置必须是正整数'));
                }
                
                // 验证数字范围
                if (position < 1 || position > 42) {
                  return Promise.reject(new Error('机架位置必须在1-42之间'));
                }
                
                // 位置冲突检查
                const cabinetId = form.getFieldValue('cabinet_id');
                const warehouseDeviceId = form.getFieldValue('warehouse_device_id') || warehouseDevice?.id;
                
                if (cabinetId) {
                  // 获取设备U数
                  let uSize = warehouseDevice?.u_size;
                  if (!uSize && warehouseDeviceId) {
                    const selectedDevice = warehouseDevices.find(d => d.id === warehouseDeviceId);
                    uSize = selectedDevice?.u_size;
                  }
                  
                  if (uSize) {
                    // 检查位置范围是否超出机柜限制
                    const positionNum = parseInt(position, 10);
                    const uSizeNum = parseInt(uSize, 10);
                    if (positionNum + uSizeNum - 1 > 42) {
                      return Promise.reject(new Error(`位置(${positionNum})加上U数(${uSizeNum})超出机柜42U限制`));
                    }
                    
                    // 检查位置冲突
                    if (checkDevicePositionConflict(cabinetId, position, uSize)) {
                      return Promise.reject(new Error('该位置已被占用或与现有设备冲突，请选择其他位置'));
                    }
                  }
                }
                
                return Promise.resolve();
              }
            }
          ]}
          tooltip="请输入起始U位（1-42），系统会自动检测位置是否可用"
        >
          <Input 
            placeholder="请输入起始U位，如：17" 
            type="number"
            min={1}
            max={42}
          />
        </Form.Item>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="action_date"
              label="上架日期"
              rules={[{ required: true, message: '请选择上架日期' }]}
            >
              <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="action_time"
              label="上架时间"
            >
              <TimePicker style={{ width: '100%' }} format="HH:mm:ss" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name="event_id"
          label="关联事件（可选）"
        >
          <Select
            placeholder="请选择关联事件（可选）"
            allowClear
            showSearch
            optionFilterProp="label"
            options={eventOptions}
          />
        </Form.Item>

        <Form.Item
          name="notes"
          label="备注"
        >
          <TextArea rows={3} placeholder="请输入备注信息" />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} style={{ marginRight: 8 }}>
            确认上架
          </Button>
          <Button onClick={handleCancel}>
            取消
          </Button>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default InstallDeviceModal;
