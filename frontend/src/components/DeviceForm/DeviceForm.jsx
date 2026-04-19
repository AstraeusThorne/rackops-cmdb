import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Form, Input, InputNumber, Select, Button, message, Space, Row, Col } from 'antd';
import { ThunderboltOutlined, DesktopOutlined, CalendarOutlined } from '@ant-design/icons';
import api from '../../api';
import RackVisualization from '../RackVisualization';
import {
  filterCabinetsByRoomIds,
  useCabinetOptions,
  useEventOptions,
  useRoomOptions,
} from '../../hooks/useSelectOptions';

/**
 * 设备表单组件
 * 用于添加或编辑设备信息
 * 
 * @param {Object} props - 组件属性
 * @param {Object} props.initialValues - 初始表单值（编辑时使用）
 * @param {Function} props.onFinish - 表单提交成功的回调
 * @param {Function} props.onCancel - 取消操作的回调
 * @param {boolean} props.isEdit - 是否为编辑模式
 * @returns {React.ReactElement} 设备表单组件
 */
const DeviceForm = ({ initialValues = {}, onFinish, onCancel, isEdit = false }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [selectedCabinet, setSelectedCabinet] = useState(null);
  const [deviceEvents, setDeviceEvents] = useState([]);
  const [cabinetDevices, setCabinetDevices] = useState({}); // 存储机柜中的设备列表
  const { items: rooms, options: roomOptions, loading: roomsLoading } = useRoomOptions();
  const { items: allCabinets, loading: cabinetsLoading } = useCabinetOptions();
  const { items: events } = useEventOptions({ immediate: true });
  const cabinets = useMemo(
    () => filterCabinetsByRoomIds(allCabinets, selectedRoom ? [selectedRoom] : []),
    [allCabinets, selectedRoom]
  );
  const roomNameById = useMemo(
    () => new Map(rooms.map((room) => [Number.parseInt(room.id, 10), room.name || ''])),
    [rooms]
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

  /**
   * 获取设备关联的事件列表
   * @param {number} deviceId - 设备ID
   */
  const fetchDeviceEvents = useCallback(async (deviceId) => {
    if (!deviceId) return;
    
    try {
      const res = await api.getDeviceEvents(deviceId);
      setDeviceEvents(res.data || []);
      
      // 如果有关联事件，设置表单中的事件选择（接口返回事件对象含 id，非 event_id）
      if (res.data && res.data.length > 0) {
        const latestEvent = res.data[0];
        const eventId = latestEvent.id ?? latestEvent.event_id;
        if (eventId != null) {
          form.setFieldsValue({ event_id: eventId });
        }
      }
    } catch (error) {
      // 这里不显示错误消息，因为可能设备没有关联事件是正常的
    }
  }, [form]);

  // 获取机柜中的设备信息（分页拉全量，避免只取第一页导致冲突检测不全）
  const fetchCabinetDevices = useCallback(async (cabinetId) => {
    try {
      const cabinetIdNum = parseInt(cabinetId, 10);
      const pageSize = 200;
      let page = 1;
      let total = 0;
      const list = [];
      let fetchedCount;
      do {
        const res = await api.getDevices({ cabinet: cabinetIdNum, page, page_size: pageSize });
        const data = res.data || {};
        const results = data.results || (Array.isArray(data) ? data : []);
        fetchedCount = results.length;
        list.push(...results);
        total = typeof data.count === 'number' ? data.count : list.length;
        page += 1;
      } while (fetchedCount === pageSize && list.length < total);
      return list;
    } catch (error) {
      message.error('获取机柜设备数据失败');
      return [];
    }
  }, []);

  // 检查设备位置是否冲突
  const checkDevicePositionConflict = useCallback((cabinetId, position, uSize) => {
    // 验证参数
    if (!cabinetId || !position || !uSize) {
      return false;
    }
    
    // 强制转换类型
    const cabinetIdNum = parseInt(cabinetId, 10);
    const positionNum = parseInt(position, 10);
    const uSizeNum = parseInt(uSize, 10);
    
    // 获取指定机柜的设备
    const devices = cabinetDevices[cabinetIdNum] || [];
    
    // 检查U数限制
    if (positionNum + uSizeNum - 1 > 42) {
      return true;
    }
    
    // 当前设备的U位范围
    const currentRange = Array.from({ length: uSizeNum }, (_, i) => positionNum + i);
    
    // 检查冲突
    const hasConflict = devices.some(device => {
      // 如果是编辑模式，排除当前设备自己
      if (isEdit && initialValues.id && device.id === initialValues.id) {
        return false;
      }
      
      // 检查设备是否在同一机柜
      const deviceCabinetId = parseInt(device.cabinet_id || device.cabinet, 10);
      if (deviceCabinetId !== cabinetIdNum) {
        return false;
      }
      
      // 解析位置和U数
      const devicePosition = parseInt(device.rack_position, 10);
      const deviceUSize = parseInt(device.u_size, 10);
      
      // 验证数据有效性
      if (isNaN(devicePosition) || isNaN(deviceUSize)) {
        return false;
      }
      
      // 计算设备占用范围
      const deviceRange = Array.from(
        { length: deviceUSize }, 
        (_, i) => devicePosition + i
      );
      
      // 检查范围是否有重叠
      const conflict = currentRange.some(pos => deviceRange.includes(pos));
      return conflict;
    });
    
    return hasConflict;
  }, [cabinetDevices, isEdit, initialValues.id]);

  // 监听cabinets变化，在编辑模式下设置选中的机柜
  useEffect(() => {
    if (isEdit && initialValues.cabinet && cabinets.length > 0 && !selectedCabinet) {
      const cabinetId = typeof initialValues.cabinet === 'object' ? initialValues.cabinet.id : initialValues.cabinet;
      const cabinetIdNum = parseInt(cabinetId, 10);
      
      // 从cabinets列表中找到对应的机柜
      const selectedCabinetInfo = cabinets.find(c => c.id === cabinetId) || 
                                 cabinets.find(c => c.id === cabinetIdNum);
      
      if (selectedCabinetInfo) {
        setSelectedCabinet(selectedCabinetInfo);
        
        // 获取机柜设备列表
        fetchCabinetDevices(cabinetIdNum).then(devicesList => {
          setCabinetDevices(prev => ({
            ...prev,
            [cabinetIdNum]: devicesList
          }));
        }).catch(console.error);
      }
    }
  }, [cabinets, isEdit, initialValues.cabinet, selectedCabinet, fetchCabinetDevices]);

  // 监听initialValues变化，重置表单数据
  useEffect(() => {
    if (initialValues && Object.keys(initialValues).length > 0) {
      const cabinetId = typeof initialValues.cabinet === 'object' ? initialValues.cabinet?.id : initialValues.cabinet;
      const roomIdFromValues = initialValues.room != null && initialValues.room !== ''
        ? (typeof initialValues.room === 'object' ? initialValues.room.id : initialValues.room)
        : null;
      const matchedCabinet = cabinetId != null
        ? allCabinets.find((cabinet) => Number.parseInt(cabinet.id, 10) === Number.parseInt(cabinetId, 10))
        : null;
      const derivedRoomId = roomIdFromValues != null
        ? Number.parseInt(roomIdFromValues, 10)
        : matchedCabinet
          ? (typeof matchedCabinet.room === 'object' && matchedCabinet.room !== null
            ? Number.parseInt(matchedCabinet.room.id ?? matchedCabinet.room, 10)
            : Number.parseInt(matchedCabinet.room, 10))
          : null;
      // 电源类型：后端为 power_type(single/dual)，表单为 power(单电源/双电源)，需映射
      const powerTypeToLabel = { single: '单电源', dual: '双电源' };
      const formValues = {
        device_type: initialValues.device_type ?? 'other',
        brand: initialValues.brand,
        model: initialValues.model,
        sn: initialValues.sn,
        u_size: initialValues.u_size,
        rack_position: initialValues.rack_position,
        power_type: initialValues.power_type,
        power_wattage: initialValues.power_wattage,
        power: powerTypeToLabel[initialValues.power_type] ?? initialValues.power_type ?? '单电源',
        cabinet: cabinetId,
        room: derivedRoomId != null && !Number.isNaN(derivedRoomId) ? derivedRoomId : undefined
      };

      if (isEdit) {
        if (initialValues.id) {
          fetchDeviceEvents(initialValues.id);
        }
        setSelectedRoom(derivedRoomId != null && !Number.isNaN(derivedRoomId) ? derivedRoomId : null);
        form.setFieldsValue(formValues);
      } else {
        // 新增模式，重置相关状态
        setSelectedRoom(null);
        setSelectedCabinet(null);
        setDeviceEvents([]);
        setCabinetDevices({});
        
        // 重置表单
        form.resetFields();
        form.setFieldsValue({
          device_type: 'other'
        });
      }
    } else {
      // 如果没有初始值，重置表单
      form.resetFields();
      form.setFieldsValue({
        device_type: 'other'
      });
      setSelectedRoom(null);
      setSelectedCabinet(null);
      setDeviceEvents([]);
      setCabinetDevices({});
    }
  }, [initialValues, isEdit, form, fetchDeviceEvents, allCabinets]);

  /**
   * 机房选择变更处理
   * @param {number} roomId - 机房ID
   */
  const handleRoomChange = (roomId) => {
    const nextRoomId = roomId != null ? Number.parseInt(roomId, 10) : null;
    setSelectedRoom(Number.isNaN(nextRoomId) ? null : nextRoomId);
    // 清空已选机柜
    form.setFieldsValue({ cabinet: undefined });
    setSelectedCabinet(null);
  };

  /**
   * 表单提交处理
   * @param {Object} values - 表单值
   */
  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      // 提取事件ID，准备设备数据
      const { event_id, ...deviceData } = values;
      
      // 表单「电源类型」为 power(单电源/双电源)，提交时转成 power_type(single/dual)
      const powerLabelToType = { '单电源': 'single', '双电源': 'dual' };
      deviceData.power_type = powerLabelToType[deviceData.power] ?? deviceData.power_type ?? 'single';
      delete deviceData.power;
      
      let deviceResponse;
      if (isEdit) {
        deviceResponse = await api.updateDevice(initialValues.id, deviceData);
        message.success('设备更新成功');
      } else {
        deviceResponse = await api.createDevice(deviceData);
        message.success('设备添加成功');
      }
      
      // 如果选择了事件，则创建设备与事件的关联
      if (event_id) {
        try {
          const deviceId = isEdit ? initialValues.id : deviceResponse.data.id;
          const res = await api.batchAssociateDevices({
            event_id: event_id,
            device_ids: [deviceId]
          });
          // 后端返回：created（新创建）、already_exists（已存在）、errors（错误）
          const result = res.data || {};
          if (result.errors && result.errors.length > 0) {
            message.warning(`设备保存成功，但关联事件失败: ${result.errors.join(', ')}`);
          } else if (result.already_exists && result.already_exists.length > 0) {
            message.success('设备已关联到该事件');
          } else {
            message.success('设备已成功关联到事件');
          }
        } catch (associationError) {
          const errorMsg = associationError.response?.data?.message || associationError.message || '未知错误';
          message.warning(`设备保存成功，但关联事件失败: ${errorMsg}`);
        }
      }
      
      // 成功后重置表单状态，确保下次打开时是干净的
      form.resetFields();
      setSelectedRoom(null);
      setSelectedCabinet(null);
      
      onFinish && onFinish();
    } catch (error) {
      message.error('设备保存失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 处理取消操作
   */
  const handleCancel = () => {
    // 重置表单状态
    form.resetFields();
    setSelectedRoom(null);
    setSelectedCabinet(null);
    
    // 调用父组件的取消回调
    onCancel && onCancel();
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
    >
      <Row gutter={24}>
        {/* 左列：表单字段 */}
        <Col span={selectedCabinet ? 16 : 24}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="brand"
                label="品牌"
                rules={[{ required: true, message: '请输入设备品牌' }]}
              >
                <Input placeholder="请输入设备品牌" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="model"
                label="型号"
                rules={[{ required: true, message: '请输入设备型号' }]}
              >
                <Input placeholder="请输入设备型号" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="sn"
                label="SN码"
                rules={[{ required: true, message: '请输入设备SN码' }]}
              >
                <Input placeholder="请输入设备SN码" />
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
                    <Select.Option key={option.value} value={option.value}>
                      <Space>
                        {option.icon}
                        {option.label}
                      </Space>
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="power_wattage"
                label="电源瓦数"
                rules={[
                  { required: true, message: '请输入电源瓦数' },
                  { type: 'number', min: 1, max: 50000, message: '电源瓦数必须在1-50000W之间' },
                  {
                    validator: (_, value) => {
                      if (value && (!Number.isInteger(value) || value <= 0)) {
                        return Promise.reject(new Error('电源瓦数必须是正整数'));
                      }
                      return Promise.resolve();
                    }
                  }
                ]}
              >
                <InputNumber
                  min={1}
                  max={50000}
                  precision={0}
                  style={{ width: '100%' }}
                  placeholder="请输入电源瓦数"
                  addonAfter="W"
                  formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={value => value.replace(/\$\s?|(,*)/g, '')}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="power"
                label="电源类型"
                rules={[{ required: true, message: '请输入电源类型' }]}
                tooltip="例如：单电源、双电源、AC220V等"
              >
                <Select placeholder="请选择电源类型" mode="tags" maxTagCount={3}>
                  <Select.Option value="单电源">单电源</Select.Option>
                  <Select.Option value="双电源">双电源</Select.Option>
                  <Select.Option value="AC220V">AC220V</Select.Option>
                  <Select.Option value="AC380V">AC380V</Select.Option>
                  <Select.Option value="DC48V">DC48V</Select.Option>
                  <Select.Option value="POE供电">POE供电</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="room"
                label="机房"
                rules={[{ required: true, message: '请选择机房' }]}
              >
                <Select
                  placeholder="请选择机房"
                  onChange={handleRoomChange}
                  loading={roomsLoading}
                  showSearch
                  optionFilterProp="label"
                  options={roomOptions}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="cabinet"
                label="机柜"
                rules={[{ required: true, message: '请选择机柜' }]}
              >
                <Select
                  placeholder={selectedRoom ? "请选择机柜" : "请先选择机房"}
                  disabled={!selectedRoom}
                  loading={cabinetsLoading}
                  showSearch
                  optionFilterProp="label"
                  onChange={async (cabinetId) => {
                    // 获取选中机柜的设备列表
                    if (cabinetId) {
                      const cabinetIdNum = parseInt(cabinetId, 10);
                      try {
                        const devicesList = await fetchCabinetDevices(cabinetIdNum);
                        setCabinetDevices(prev => ({
                          ...prev,
                          [cabinetIdNum]: devicesList
                        }));
                        
                        // 保存选中的机柜信息
                        const selectedCabinetInfo = cabinets.find(c => Number.parseInt(c.id, 10) === cabinetIdNum);
                        setSelectedCabinet(selectedCabinetInfo);
                      } catch (error) {
                        // 错误已在fetchCabinetDevices中处理
                      }
                    } else {
                      setSelectedCabinet(null);
                    }
                    
                    // 清空机架位置，因为换了机柜需要重新选择位置
                    form.setFieldsValue({
                      rack_position: undefined
                    });
                  }}
                  options={cabinets.map((cabinet) => {
                    const cabinetRoomId = typeof cabinet.room === 'object' && cabinet.room !== null
                      ? Number.parseInt(cabinet.room.id ?? cabinet.room, 10)
                      : Number.parseInt(cabinet.room, 10);
                    const roomName = cabinet.room_name || roomNameById.get(cabinetRoomId) || '';
                    return {
                      value: cabinet.id,
                      label: roomName ? `${roomName}-${cabinet.name}` : (cabinet.name || '-'),
                    };
                  })}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="rack_position"
                label="机架位置"
                rules={[
                  { required: true, message: '请输入机架位置' },
                  {
                    validator: (_, value) => {
                      if (!value) {
                        return Promise.resolve(); // 空值由required规则处理，避免重复提示
                      }
                      
                      // 只支持单个数字格式
                      const position = parseInt(value, 10);
                      
                      if (isNaN(position) || !Number.isInteger(position) || position <= 0) {
                        return Promise.reject(new Error('机架位置必须是正整数'));
                      }
                      
                      // 验证数字范围
                      if (position < 1 || position > 42) {
                        return Promise.reject(new Error('机架位置必须在1-42之间'));
                      }

                      // 位置冲突检查
                      const cabinetId = form.getFieldValue('cabinet');
                      const uSize = form.getFieldValue('u_size');
                      
                      if (cabinetId && uSize) {
                        if (checkDevicePositionConflict(cabinetId, position, uSize)) {
                          return Promise.reject(new Error('该位置已被占用或与现有设备冲突，请选择其他位置'));
                        }
                        
                        // 检查位置范围是否超出机柜限制
                        const positionNum = parseInt(position, 10);
                        const uSizeNum = parseInt(uSize, 10);
                        if (positionNum + uSizeNum - 1 > 42) {
                          return Promise.reject(new Error(`位置(${positionNum})加上U数(${uSizeNum})超出机柜42U限制`));
                        }
                      }
                      
                      return Promise.resolve();
                    }
                  }
                ]}
              >
                <Input 
                  placeholder="请输入机架起始位置 (如: 5)" 
                  maxLength={2}
                  onChange={(e) => {
                    // 当机架位置改变时，重新验证U数字段
                    const uSize = form.getFieldValue('u_size');
                    if (uSize) {
                      form.validateFields(['u_size']);
                    }
                    // 强制触发表单重新渲染，确保RackVisualization组件更新
                    form.setFieldsValue({ rack_position: e.target.value });
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="u_size"
                label="U数"
                rules={[
                  { required: true, message: '请输入设备U数' },
                  { type: 'number', min: 1, max: 42, message: 'U数必须在1-42之间' },
                  {
                    validator: (_, value) => {
                      if (value && (!Number.isInteger(value) || value <= 0)) {
                        return Promise.reject(new Error('U数必须是正整数'));
                      }

                      // 位置冲突检查
                      const cabinetId = form.getFieldValue('cabinet');
                      const rackPosition = form.getFieldValue('rack_position');
                      
                      if (cabinetId && rackPosition && value) {
                        if (checkDevicePositionConflict(cabinetId, rackPosition, value)) {
                          return Promise.reject(new Error('当前U数设置会与已有设备冲突'));
                        }
                        
                        // 检查U数是否超出机柜限制
                        const positionNum = parseInt(rackPosition, 10);
                        const uSizeNum = parseInt(value, 10);
                        if (positionNum + uSizeNum - 1 > 42) {
                          return Promise.reject(new Error(`位置(${positionNum})加上U数(${uSizeNum})超出机柜42U限制`));
                        }
                      }
                      
                      return Promise.resolve();
                    }
                  }
                ]}
              >
                <InputNumber 
                  min={1} 
                  max={42} 
                  precision={0}
                  style={{ width: '100%' }} 
                  placeholder="请输入设备U数"
                  onChange={(value) => {
                    // 当U数改变时，重新验证机架位置字段
                    const rackPosition = form.getFieldValue('rack_position');
                    if (rackPosition) {
                      form.validateFields(['rack_position']);
                    }
                    // 强制触发表单重新渲染，确保RackVisualization组件更新
                    if (value !== null && value !== undefined) {
                      form.setFieldsValue({ u_size: value });
                    }
                  }}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="event_id"
            label={
              <Space>
                <span>关联事件</span>
                {isEdit && deviceEvents.length > 0 && (
                  <span style={{ fontSize: '12px', color: '#666', fontWeight: 'normal' }}>
                    (当前已关联 {deviceEvents.length} 个事件)
                  </span>
                )}
              </Space>
            }
            tooltip={
              isEdit && deviceEvents.length > 0 
                ? `当前设备已关联的事件: ${deviceEvents.map(de => de.order_number || `事件#${de.id ?? de.event_id}`).join(', ')}` 
                : "选择一个事件来关联此设备（可选）"
            }
          >
            <Select
              placeholder="请选择要关联的事件（可选）"
              allowClear
              showSearch
              suffixIcon={<CalendarOutlined />}
              filterOption={(input, option) =>
                (option.children || '').toString().toLowerCase().includes(input.toLowerCase())
              }
            >
              {/* 显示当前设备已关联的事件 */}
              {isEdit && deviceEvents.length > 0 && (
                <Select.OptGroup label="当前设备已关联的事件">
                  {deviceEvents.map(deviceEvent => {
                    const eid = deviceEvent.id ?? deviceEvent.event_id;
                    return (
                      <Select.Option 
                        key={`current-${eid}`} 
                        value={eid}
                        style={{ backgroundColor: '#f0f8ff' }}
                      >
                        <Space>
                          <span style={{ color: '#1890ff' }}>✓</span>
                          {deviceEvent.order_number 
                            ? `${deviceEvent.order_number} - ${deviceEvent.date}` 
                            : `事件 #${eid} - ${deviceEvent.date}`
                          }
                        </Space>
                      </Select.Option>
                    );
                  })}
                </Select.OptGroup>
              )}
              
              {/* 显示所有可用事件 */}
              <Select.OptGroup label={isEdit && deviceEvents.length > 0 ? "其他可选事件" : "可选事件"}>
                {events
                  .filter(event => 
                    !isEdit || 
                    deviceEvents.length === 0 || 
                    !deviceEvents.some(de => (de.id ?? de.event_id) === event.id)
                  )
                  .map(event => (
                    <Select.Option key={event.id} value={event.id}>
                      {event.order_number 
                        ? `${event.order_number} - ${event.date}` 
                        : `事件 #${event.id} - ${event.date}`
                      }
                    </Select.Option>
                  ))
                }
              </Select.OptGroup>
            </Select>
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={loading}>
                {isEdit ? '更新' : '添加'}
              </Button>
              <Button onClick={handleCancel}>取消</Button>
            </Space>
          </Form.Item>
        </Col>
        
        {/* 右列：机架可视化 */}
        {selectedCabinet && (
          <Col span={8}>
            <Form.Item
              shouldUpdate={(prevValues, currentValues) => 
                prevValues.rack_position !== currentValues.rack_position ||
                prevValues.u_size !== currentValues.u_size
              }
              noStyle
            >
              {({ getFieldValue }) => (
                <RackVisualization
                  devices={cabinetDevices[selectedCabinet.id] || []}
                  selectedPosition={getFieldValue('rack_position')}
                  selectedUSize={getFieldValue('u_size') || 1}
                  onPositionSelect={(position) => {
                    form.setFieldsValue({ rack_position: position });
                    // 触发验证
                    form.validateFields(['rack_position', 'u_size']);
                  }}
                  cabinetName={(() => {
                    const cabinetRoomId = typeof selectedCabinet.room === 'object' && selectedCabinet.room !== null
                      ? Number.parseInt(selectedCabinet.room.id ?? selectedCabinet.room, 10)
                      : Number.parseInt(selectedCabinet.room, 10);
                    const roomName = selectedCabinet.room_name || roomNameById.get(cabinetRoomId) || '';
                    return roomName ? `${roomName}-${selectedCabinet.name}` : selectedCabinet.name;
                  })()}
                  currentDeviceId={isEdit ? initialValues.id : null}
                />
              )}
            </Form.Item>
          </Col>
        )}
      </Row>
    </Form>
  );
};

export default DeviceForm;
