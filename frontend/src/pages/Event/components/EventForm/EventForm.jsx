import React, { useState, useEffect, useCallback, useMemo, useTransition, useRef } from 'react';
import { 
  Card, 
  Form, 
  Input, 
  Button, 
  DatePicker, 
  TimePicker, 
  Select, 
  message, 
  Space,
  Switch,
  Row,
  Col,
  Radio,
  Spin,
  InputNumber
} from 'antd';
import { ArrowLeftOutlined, SaveOutlined, PlusOutlined, MinusCircleOutlined, ThunderboltOutlined, DesktopOutlined, ImportOutlined } from '@ant-design/icons';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { 
  eventAPI, 
  dutyPersonnelAPI, 
  authorizedOrgAPI, 
  deviceAPI, 
  decommissionedDeviceAPI,
  entryPersonnelAPI,
  warehouseDeviceAPI
} from '../../../../api';
import dayjs from 'dayjs';
import ImportModal from '../../../../components/ImportModal';
import styles from './EventForm.module.css';
import {
  filterCabinetsByRoomIds,
  useCabinetOptions,
  useClientOptions,
  useRoomOptions,
} from '../../../../hooks/useSelectOptions';

const { Option } = Select;
const { TextArea } = Input;
const DEVICE_EVENT_TYPES = ['device_install', 'device_remove', 'device_to_warehouse', 'device_from_warehouse', 'device_out_of_warehouse'];

/**
 * 事件表单组件
 * 用于创建和编辑事件
 */
const EventForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [orgs, setOrgs] = useState([]);
  const [dutyPersonnel, setDutyPersonnel] = useState([]);
  const [devices, setDevices] = useState([]);
  const [selectedRoomIds, setSelectedRoomIds] = useState([]);
  const [cabinetDevices, setCabinetDevices] = useState({});
  const [warehouseDevices, setWarehouseDevices] = useState([]);
  const isEditing = !!id;
  const [isPending] = useTransition();
  const [eventType, setEventType] = useState('personnel_entry');
  
  // 导入功能相关状态
  const [importModalVisible, setImportModalVisible] = useState(false);
  /** 下架设备远程搜索加载中 */
  const [deviceRemoveSearching, setDeviceRemoveSearching] = useState(false);
  const deviceRemoveSearchTimerRef = useRef(null);
  const { items: clients, options: clientOptions } = useClientOptions();
  const { items: rooms, options: roomOptions } = useRoomOptions();
  const { items: allCabinets } = useCabinetOptions();
  const cabinets = useMemo(
    () => filterCabinetsByRoomIds(allCabinets, selectedRoomIds),
    [allCabinets, selectedRoomIds]
  );
  const roomNameById = useMemo(
    () =>
      new Map(
        rooms.map((room) => [Number.parseInt(room.id, 10), room.name || ''])
      ),
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

  // 获取机柜中的设备信息（分页拉全量，便于按 SN 等搜索）
  const fetchCabinetDevices = useCallback(async (cabinetId) => {
    try {
      const cabinetIdNum = parseInt(cabinetId, 10);
      const pageSize = 200;
      let page = 1;
      let total = 0;
      const list = [];
      let fetchedCount;
      do {
        const res = await deviceAPI.getDevices({ cabinet: cabinetIdNum, page, page_size: pageSize });
        const data = res.data || {};
        const results = data.results || (Array.isArray(data) ? data : []);
        fetchedCount = results.length;
        list.push(...results);
        total = typeof data.count === 'number' ? data.count : list.length;
        page += 1;
      } while (fetchedCount === pageSize && list.length < total);
      return list;
    } catch (error) {
      console.error('获取机柜设备失败:', error);
      message.error('获取机柜设备数据失败');
      return [];
    }
  }, []);

  /** 下架设备：按选中机房 + 关键词远程搜索（后端 search 支持 SN/品牌/型号，避免全量拉取） */
  const searchDevicesByRooms = useCallback(async (keyword) => {
    if (selectedRoomIds.length === 0) {
      setDevices([]);
      return;
    }
    setDeviceRemoveSearching(true);
    try {
      const promises = selectedRoomIds.map(roomId =>
        deviceAPI.getDevices({
          room: roomId,
          search: (keyword || '').trim(),
          page_size: 50,
          page: 1
        })
      );
      const results = await Promise.all(promises);
      const byId = new Map();
      results.forEach(res => {
        const data = res.data || {};
        const list = data.results || (Array.isArray(data) ? data : []);
        list.forEach(d => byId.set(d.id, d));
      });
      setDevices(Array.from(byId.values()));
    } catch (error) {
      console.error('获取设备数据失败:', error);
      message.error('获取设备数据失败');
      setDevices([]);
    } finally {
      setDeviceRemoveSearching(false);
    }
  }, [selectedRoomIds]);

  const DEVICE_REMOVE_SEARCH_DEBOUNCE_MS = 300;
  const handleDeviceRemoveSearch = useCallback((value) => {
    if (deviceRemoveSearchTimerRef.current) clearTimeout(deviceRemoveSearchTimerRef.current);
    deviceRemoveSearchTimerRef.current = setTimeout(() => {
      searchDevicesByRooms(value);
    }, DEVICE_REMOVE_SEARCH_DEBOUNCE_MS);
  }, [searchDevicesByRooms]);

  const handleDeviceRemoveDropdownVisibleChange = useCallback((open) => {
    if (open && devices.length === 0 && selectedRoomIds.length > 0 && !deviceRemoveSearching) {
      searchDevicesByRooms('');
    }
  }, [devices.length, selectedRoomIds.length, deviceRemoveSearching, searchDevicesByRooms]);

  // 获取仓库设备列表（仅显示在库的设备）
  const fetchWarehouseDevices = useCallback(async () => {
    try {
      const response = await warehouseDeviceAPI.getWarehouseDevices({ status: 'in_warehouse' });
      const devices = response.data.results || response.data || [];
      // 双重过滤，确保只显示在库的设备
      const inWarehouseDevices = devices.filter(device => device.status === 'in_warehouse');
      setWarehouseDevices(inWarehouseDevices);
    } catch (error) {
      console.error('获取仓库设备列表失败:', error);
      message.error('获取仓库设备列表失败');
    }
  }, []);

  // 监听事件类型变化，如果是设备出库上架或设备出库，获取仓库设备列表
  useEffect(() => {
    if (eventType === 'device_from_warehouse' || eventType === 'device_out_of_warehouse') {
      fetchWarehouseDevices();
    }
  }, [eventType, fetchWarehouseDevices]);

  // 监听机房选择变化，eventType作为参数传递
  const handleRoomChange = useCallback((roomIds, type = eventType) => {
    setSelectedRoomIds(Array.isArray(roomIds) ? roomIds : []);
    setCabinetDevices({});
    if (!Array.isArray(roomIds) || roomIds.length === 0 || type === 'device_remove') {
      setDevices([]);
    }
  }, [eventType]);

  // 加载表单数据
  useEffect(() => {
    const fetchData = async () => {
      try {
        setInitialLoading(true);
        // 获取下拉选项数据
        const [orgsRes, dutyPersonnelRes] = await Promise.all([
          authorizedOrgAPI.getAuthorizedOrgs(), // 授权单位API
          dutyPersonnelAPI.getDutyPersonnel() // 值班人员API
        ]);

        setOrgs(orgsRes.data.results || orgsRes.data || []); // 授权单位列表
        setDutyPersonnel(dutyPersonnelRes.data.results || dutyPersonnelRes.data || []); // 值班人员列表
        
        // 如果是编辑模式，加载事件数据
        if (isEditing) {
          const eventRes = await eventAPI.getEvent(id);
          const eventData = eventRes.data;
          // 只用setEventType同步类型
          setEventType(eventData.event_type || 'personnel_entry');
          form.setFieldsValue({
            date: eventData.date ? dayjs(eventData.date) : null,
            start_time: eventData.start_time ? dayjs(`2000-01-01 ${eventData.start_time}`) : null,
            end_time: eventData.end_time ? dayjs(`2000-01-01 ${eventData.end_time}`) : null,
            order_number: eventData.order_number,
            completion_status: eventData.completion_status || false,
            client_ids: eventData.clients?.map(client => client.id),
            room_ids: eventData.rooms?.map(room => room.id),
            authorized_org_ids: eventData.authorized_orgs?.map(org => org.id),
            duty_personnel_ids: eventData.duty_personnel?.map(person => person.id),
            description: eventData.description,
            // 进场人员数据
            entry_personnel: eventData.entry_personnel && eventData.entry_personnel.length > 0 
              ? eventData.entry_personnel 
              : [{}],
            // 设备数据
            devices: eventData.devices && eventData.devices.length > 0 
              ? eventData.devices 
              : [{}]
          });
          // 同步机房和设备类型
          if (eventData.rooms && eventData.rooms.length > 0) {
            const roomIds = eventData.rooms.map(room => room.id);
            setSelectedRoomIds(roomIds);
            handleRoomChange(roomIds, eventData.event_type || 'personnel_entry');
          }
        } else {
          // 新建事件的默认值
          // 从URL参数中读取event_type，如果没有则使用默认值
          const urlEventType = searchParams.get('event_type');
          const defaultEventType = urlEventType || 'personnel_entry';
          setEventType(defaultEventType);
          form.resetFields();
          form.setFieldsValue({
            completion_status: false,
            event_type: defaultEventType,
            entry_personnel: [{}],
            devices: [{}]
          });
          setSelectedRoomIds([]);
        }
      } catch (error) {
        console.error('获取数据失败:', error);
        message.error('获取数据失败');
      } finally {
        setInitialLoading(false);
      }
    };
    
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEditing, form]);

  // 初始化时同步eventType到form
  useEffect(() => {
    form.setFieldsValue({ event_type: eventType });
  }, [eventType, form]);

  // 监听事件类型变化
  const handleEventTypeChange = useCallback((e) => {
    const newEventType = e.target.value;
    setEventType(newEventType);
    setDevices([]);
    // 切换到任一设备类型时，将设备列表重置为一条空行，避免上架填的 N 条在下架里变成 N 条空行、或下架新增的在上架里多出空行
    if (DEVICE_EVENT_TYPES.includes(newEventType)) {
      form.setFieldsValue({ devices: [{}] });
    }
  }, [form]);

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
    
    // 当前设备表单
    const formDevices = form.getFieldValue('devices') || [];
    
    // 正在编辑的设备ID列表
    const editingIds = formDevices
      .filter(d => d && d.id)
      .map(d => d.id);
    
    // 检查U数限制
    if (positionNum + uSizeNum - 1 > 42) {
      return true;
    }
    
    // 当前设备的U位范围
    const currentRange = Array.from({ length: uSizeNum }, (_, i) => positionNum + i);
    
    // 检查冲突
    const hasConflict = devices.some(device => {
      // 如果是正在编辑的设备，跳过冲突检测
      if (device.id && editingIds.includes(device.id)) {
        return false;
      }
      
      // 检查设备是否在同一机柜
      const deviceCabinetId = parseInt(device.cabinet, 10);
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
  }, [cabinetDevices, form]);

  // 表单提交
  const handleSubmit = useCallback(async (values) => {
    setSubmitting(true);
    try {
      const { entry_personnel, devices, ...eventData } = values;
      
      // 格式化日期和时间
      const formattedEventData = {
        ...eventData,
        date: eventData.date.format('YYYY-MM-DD'),
        start_time: eventData.start_time.format('HH:mm:ss'),
        end_time: eventData.end_time.format('HH:mm:ss')
      };
      
      // 处理多对多关系字段，将选中的ID转换为对应的ID数组
      if (eventData.client_ids) {
        formattedEventData.client_ids = eventData.client_ids;
      }
      if (eventData.room_ids) {
        formattedEventData.room_ids = eventData.room_ids;
      }
      if (eventData.authorized_org_ids) {
        formattedEventData.authorized_org_ids = eventData.authorized_org_ids;
      }
      if (eventData.duty_personnel_ids) {
        formattedEventData.duty_personnel_ids = eventData.duty_personnel_ids;
      }
      
      // 添加进场人员信息（按身份证号去重，避免同一人员被创建两次并重复关联到事件）
      if (Array.isArray(entry_personnel) && entry_personnel.length > 0) {
        const validPersonnel = entry_personnel.filter(person =>
          person && person.name && person.id_card && person.contact_info
        );
        if (validPersonnel.length > 0) {
          const seenIdCards = new Set();
          formattedEventData.entry_personnel = validPersonnel
            .map(person => ({
              name: (person.name || '').trim(),
              id_card: (person.id_card || '').trim().toUpperCase(),
              contact_info: (person.contact_info || '').trim()
            }))
            .filter(person => {
              const key = person.id_card;
              if (seenIdCards.has(key)) return false;
              seenIdCards.add(key);
              return true;
            });
        }
      }
      
      let eventResponse;
      if (isEditing) {
        // 更新事件 - 先处理设备/人员操作，成功后再更新事件
        let operationSuccess = true;
        let operationErrors = [];
        let personnelIds = [];
        let deviceIds = [];
        let warehouseDeviceIds = [];
        let decommissionedDeviceIds = [];
        
        // 1. 先处理进场人员信息
        if (formattedEventData.entry_personnel && formattedEventData.entry_personnel.length > 0) {
          try {
            const personnelResponses = await Promise.all(
              formattedEventData.entry_personnel.map(person => 
                eventAPI.createSingleEntryPersonnel({
                  name: person.name,
                  id_card: person.id_card,
                  contact_info: person.contact_info
                })
              )
            );
            
            personnelIds = personnelResponses
              .filter(response => response.data && response.data.id)
              .map(response => response.data.id);
            
            if (personnelIds.length !== formattedEventData.entry_personnel.length) {
              operationSuccess = false;
              operationErrors.push('部分进场人员创建失败');
            }
          } catch (error) {
            console.error('更新进场人员失败:', error);
            operationSuccess = false;
            operationErrors.push(`更新进场人员信息失败: ${error.response?.data?.error || error.message}`);
          }
        }
        
        // 2. 处理设备操作（在更新事件之前）
        if (Array.isArray(devices) && devices.length > 0 && (eventType === 'device_install' || eventType === 'device_remove' || eventType === 'device_to_warehouse' || eventType === 'device_from_warehouse' || eventType === 'device_out_of_warehouse')) {
          if (eventType === 'device_install') {
            const deviceResults = await Promise.allSettled(
              devices
                .filter(device => device.brand && device.model && device.sn)
                .map(async (device) => {
                  try {
                    const deviceData = { ...device };
                    // 移除power字段，只使用power_type
                    delete deviceData.power;
                    
                    if (device.id) {
                      await deviceAPI.updateDevice(device.id, deviceData);
                      return device.id;
                    } else {
                      const response = await deviceAPI.createDevice(deviceData);
                      if (response?.data?.id) {
                        return response.data.id;
                      }
                      throw new Error('设备创建失败：未返回ID');
                    }
                  } catch (error) {
                    console.error(`处理设备 ${device.brand} ${device.model} 失败:`, error);
                    throw error;
                  }
                })
            );
            
            deviceIds = deviceResults
              .filter(result => result.status === 'fulfilled' && result.value != null && !Number.isNaN(Number(result.value)))
              .map(result => Number(result.value));
            
            const failedDevices = deviceResults.filter(result => result.status === 'rejected');
            if (failedDevices.length > 0) {
              operationSuccess = false;
              operationErrors.push(`${failedDevices.length} 个设备处理失败`);
            }
            // 将本轮回写的设备 id 写回表单，重试时已有 id 的会走更新，不重复创建
            let editResultIdx = 0;
            const editDevicesWithIds = devices.map(d => {
              if (!d.brand || !d.model || !d.sn) return d;
              const res = deviceResults[editResultIdx];
              editResultIdx += 1;
              if (res?.status === 'fulfilled' && res.value != null) return { ...d, id: res.value };
              return d;
            });
            form.setFieldsValue({ devices: editDevicesWithIds });
          } else if (eventType === 'device_remove') {
            // 设备下架
            const decommissionResults = await Promise.allSettled(
              devices
                .filter(device => device.id)
                .map(async (device) => {
                  try {
                    const response = await deviceAPI.decommissionDevice(device.id, {
                      decommission_reason: eventData.description || '通过事件下架',
                      status: 'decommissioned'
                    });
                    // 返回下架设备的ID
                    return response?.data?.id || null;
                  } catch (error) {
                    console.error(`下架设备失败:`, error);
                    throw error;
                  }
                })
            );
            
            // 收集下架设备ID
            decommissionedDeviceIds = decommissionResults
              .filter(result => result.status === 'fulfilled' && result.value)
              .map(result => result.value);
            
            const failedDecommissions = decommissionResults.filter(result => result.status === 'rejected');
            if (failedDecommissions.length > 0) {
              operationSuccess = false;
              operationErrors.push(`${failedDecommissions.length} 个设备下架失败`);
            }
            
            if (decommissionedDeviceIds.length === 0 && devices.length > 0) {
              operationSuccess = false;
              operationErrors.push('所有设备下架失败');
            }
          } else if (eventType === 'device_to_warehouse') {
            const selectedClientIds = eventData.client_ids || [];
            const selectedClients = clients.filter(client => selectedClientIds.includes(client.id));
            const supplierName = selectedClients.length > 0 ? selectedClients[0].name : '';
            
            const warehouseDeviceResults = await Promise.allSettled(
              devices
                .filter(device => device.brand && device.model && device.sn)
                .map(async (device) => {
                  try {
                    const warehouseDeviceData = {
                      brand: device.brand,
                      model: device.model,
                      sn: device.sn,
                      u_size: device.u_size,
                      power_type: device.power_type || 'single',
                      power_wattage: device.power_wattage,
                      device_type: device.device_type || 'other',
                      supplier: supplierName,
                      collection_time: eventData.date ? `${eventData.date} ${eventData.start_time || '00:00:00'}` : new Date().toISOString(),
                      warehouse_location: device.warehouse_location,
                      notes: device.notes,
                      status: 'in_warehouse',
                      // 传递操作时间和日期，用于历史记录
                      action_date: eventData.date || new Date().toISOString().split('T')[0],
                      action_time: eventData.start_time || null
                    };
                    
                    const response = await warehouseDeviceAPI.createWarehouseDevice(warehouseDeviceData);
                    if (response?.data?.id) {
                      return response.data.id;
                    }
                    throw new Error('仓库设备创建失败：未返回ID');
                  } catch (error) {
                    console.error(`处理仓库设备失败:`, error);
                    throw error;
                  }
                })
            );
            
            warehouseDeviceIds = warehouseDeviceResults
              .filter(result => result.status === 'fulfilled' && result.value)
              .map(result => result.value);
            
            const failedDevices = warehouseDeviceResults.filter(result => result.status === 'rejected');
            if (failedDevices.length > 0) {
              operationSuccess = false;
              operationErrors.push(`${failedDevices.length} 个仓库设备创建失败`);
            }
            
            if (warehouseDeviceIds.length === 0 && devices.length > 0) {
              operationSuccess = false;
              operationErrors.push('所有仓库设备创建失败');
            }
          } else if (eventType === 'device_from_warehouse') {
            const installResults = await Promise.allSettled(
              devices
                .filter(device => device.warehouse_device_id && device.cabinet_id)
                .map(async (device) => {
                  try {
                    const installData = {
                      cabinet_id: device.cabinet_id,
                      install_location: device.install_location,
                      rack_position: device.rack_position,
                      action_date: eventData.date || new Date().toISOString().split('T')[0],
                      action_time: eventData.start_time || null,
                      event_id: id, // 更新事件时，事件已存在，可以传event_id
                      notes: device.notes
                    };
                    
                    const response = await warehouseDeviceAPI.installDevice(device.warehouse_device_id, installData);
                    // 返回新创建的设备ID和仓库设备ID
                    return {
                      deviceId: response?.data?.id, // 新创建的Device的ID
                      warehouseDeviceId: device.warehouse_device_id // 仓库设备ID
                    };
                  } catch (error) {
                    console.error(`上架设备失败:`, error);
                    throw error;
                  }
                })
            );
            
            // 收集成功上架的新设备ID和仓库设备ID
            const successfulInstalls = installResults
              .filter(result => result.status === 'fulfilled' && result.value)
              .map(result => result.value);
            
            deviceIds = successfulInstalls
              .filter(item => item.deviceId)
              .map(item => item.deviceId);
            
            warehouseDeviceIds = successfulInstalls
              .filter(item => item.warehouseDeviceId)
              .map(item => item.warehouseDeviceId);
            
            const failedInstalls = installResults.filter(result => result.status === 'rejected');
            if (failedInstalls.length > 0) {
              operationSuccess = false;
              operationErrors.push(`${failedInstalls.length} 个设备上架失败`);
            }
            
            if (installResults.length > 0 && installResults.every(result => result.status === 'rejected')) {
              operationSuccess = false;
              operationErrors.push('所有设备上架失败');
            }
          } else if (eventType === 'device_out_of_warehouse') {
            // 设备出库（不上架）
            const outResults = await Promise.allSettled(
              devices
                .filter(device => device.warehouse_device_id)
                .map(async (device) => {
                  try {
                    const outData = {
                      action_date: eventData.date || new Date().toISOString().split('T')[0],
                      action_time: eventData.start_time || null,
                      notes: device.notes || '',
                      event_id: id, // 更新事件时，事件已存在，可以传event_id
                    };
                    
                    await warehouseDeviceAPI.outOfWarehouse(device.warehouse_device_id, outData);
                    // 返回仓库设备ID
                    return device.warehouse_device_id;
                  } catch (error) {
                    console.error(`出库设备失败:`, error);
                    throw error;
                  }
                })
            );
            
            // 收集成功出库的仓库设备ID
            warehouseDeviceIds = outResults
              .filter(result => result.status === 'fulfilled' && result.value)
              .map(result => result.value);
            
            const failedOuts = outResults.filter(result => result.status === 'rejected');
            if (failedOuts.length > 0) {
              operationSuccess = false;
              operationErrors.push(`${failedOuts.length} 个设备出库失败`);
            }
            
            if (outResults.length > 0 && outResults.every(result => result.status === 'rejected')) {
              operationSuccess = false;
              operationErrors.push('所有设备出库失败');
            }
          }
        }
        
        // 3. 如果操作失败，不更新事件并提示错误
        if (!operationSuccess) {
          message.error(`操作失败，事件未更新：${operationErrors.join('; ')}`);
          setSubmitting(false);
          return;
        }
        
        // 4. 所有操作成功，更新事件
        eventResponse = await eventAPI.updateEvent(id, formattedEventData);
        
        // 5. 关联进场人员到事件
        if (personnelIds.length > 0) {
          try {
            await entryPersonnelAPI.batchAssociateEntryPersonnel({
              event_id: id,
              entry_personnel_ids: personnelIds
            });
            message.success(`成功关联 ${personnelIds.length} 个进场人员到事件`);
          } catch (error) {
            console.error('关联进场人员到事件失败:', error);
            message.warning(`事件已更新，但关联进场人员失败: ${error.response?.data?.error || error.message}`);
          }
        }
        
        // 6. 关联设备到事件（仅传有效数字 ID）
        const updateDeviceIdsToAssociate = (deviceIds || []).filter(id => id != null && !Number.isNaN(Number(id)));
        if (updateDeviceIdsToAssociate.length > 0) {
          try {
            const associateResponse = await deviceAPI.batchAssociateDevices({
              event_id: id,
              device_ids: updateDeviceIdsToAssociate
            });
            if (associateResponse.data.errors && associateResponse.data.errors.length > 0) {
              message.warning(`事件已更新，但部分设备关联失败: ${associateResponse.data.errors.join(', ')}`);
            } else {
              message.success(`成功关联 ${updateDeviceIdsToAssociate.length} 个设备到事件`);
            }
          } catch (error) {
            console.error('关联设备到事件失败:', error);
            message.warning(`事件已更新，但关联设备失败: ${error.response?.data?.error || error.message}`);
          }
        }
        
        // 7. 关联仓库设备到事件（包括入库和出库上架的设备）
        if (warehouseDeviceIds.length > 0) {
          try {
            await warehouseDeviceAPI.batchAssociateWarehouseDevices({
              event_id: id,
              warehouse_device_ids: warehouseDeviceIds
            });
            message.success(`成功关联 ${warehouseDeviceIds.length} 个仓库设备到事件`);
          } catch (error) {
            console.error('关联仓库设备到事件失败:', error);
            message.warning(`事件已更新，但关联仓库设备失败: ${error.response?.data?.error || error.message}`);
          }
        }
        
        // 8. 关联下架设备到事件
        if (decommissionedDeviceIds.length > 0) {
          try {
            const response = await decommissionedDeviceAPI.batchAssociateDecommissionedDevices({
              event_id: id,
              decommissioned_device_ids: decommissionedDeviceIds
            });
            // 检查响应中的错误信息
            if (response?.data?.errors && response.data.errors.length > 0) {
              const errorMessages = response.data.errors.join('; ');
              message.warning(`事件已更新，但部分下架设备关联失败: ${errorMessages}`);
            } else if (response?.data?.created && response.data.created.length > 0) {
              message.success(`成功关联 ${response.data.created.length} 个下架设备到事件`);
            } else {
              message.warning(`事件已更新，但下架设备关联失败: ${response?.data?.message || '未知错误'}`);
            }
          } catch (error) {
            console.error('关联下架设备到事件失败:', error);
            console.error('错误响应数据:', error.response?.data);
            // 优先显示errors数组中的详细错误信息
            let errorMessage = '未知错误';
            if (error.response?.data?.errors && Array.isArray(error.response.data.errors) && error.response.data.errors.length > 0) {
              errorMessage = error.response.data.errors.join('; ');
            } else if (error.response?.data?.error) {
              errorMessage = error.response.data.error;
            } else if (error.response?.data?.message) {
              errorMessage = error.response.data.message;
            } else if (error.message) {
              errorMessage = error.message;
            }
            message.warning(`事件已更新，但关联下架设备失败: ${errorMessage}`);
          }
        }
        
        message.success('更新成功');
      } else {
        // 创建新事件 - 先处理设备/人员操作，成功后再创建事件
        let operationSuccess = true;
        let operationErrors = [];
        let personnelIds = [];
        let deviceIds = [];
        let warehouseDeviceIds = [];
        let decommissionedDeviceIds = [];
        
        // 1. 先处理进场人员信息
        if (formattedEventData.entry_personnel && formattedEventData.entry_personnel.length > 0) {
          try {
            // 创建所有进场人员记录
            const personnelResponses = await Promise.all(
              formattedEventData.entry_personnel.map(person => 
                eventAPI.createSingleEntryPersonnel({
                  name: person.name,
                  id_card: person.id_card,
                  contact_info: person.contact_info
                })
              )
            );
            
            // 收集创建成功的进场人员ID
            personnelIds = personnelResponses
              .filter(response => response.data && response.data.id)
              .map(response => response.data.id);
            
            if (personnelIds.length !== formattedEventData.entry_personnel.length) {
              operationSuccess = false;
              operationErrors.push('部分进场人员创建失败');
            }
          } catch (error) {
            console.error('添加进场人员失败:', error);
            operationSuccess = false;
            operationErrors.push(`添加进场人员信息失败: ${error.response?.data?.error || error.message}`);
          }
        }
        
        // 2. 处理设备操作（在创建事件之前）
        if (Array.isArray(devices) && devices.length > 0 && (eventType === 'device_install' || eventType === 'device_to_warehouse' || eventType === 'device_from_warehouse' || eventType === 'device_out_of_warehouse' || eventType === 'device_remove')) {
          if (eventType === 'device_install') {
            // 设备上架（有 id 则更新避免重复，无 id 则创建；重试时已创建的不会再次 create）
            const deviceResults = await Promise.allSettled(
              devices
                .filter(device => device.brand && device.model && device.sn)
                .map(async (device) => {
                  try {
                    const deviceData = { ...device };
                    delete deviceData.power;
                    if (device.id) {
                      await deviceAPI.updateDevice(device.id, deviceData);
                      return device.id;
                    }
                    const response = await deviceAPI.createDevice(deviceData);
                    if (response?.data?.id) return response.data.id;
                    throw new Error('设备创建失败：未返回ID');
                  } catch (error) {
                    console.error(`处理设备 ${device.brand} ${device.model} 失败:`, error);
                    throw error;
                  }
                })
            );
            
            deviceIds = deviceResults
              .filter(result => result.status === 'fulfilled' && result.value != null && !Number.isNaN(Number(result.value)))
              .map(result => Number(result.value));
            
            const failedDevices = deviceResults.filter(result => result.status === 'rejected');
            if (failedDevices.length > 0) {
              operationSuccess = false;
              operationErrors.push(`${failedDevices.length} 个设备处理失败`);
            }
            if (deviceIds.length === 0 && devices.length > 0) {
              operationSuccess = false;
              operationErrors.push('所有设备创建失败');
            }
            // 将本轮回写的设备 id 写回表单，重试时已有 id 的会走更新，不重复创建
            let resultIdx = 0;
            const devicesWithIds = devices.map(d => {
              if (!d.brand || !d.model || !d.sn) return d;
              const res = deviceResults[resultIdx];
              resultIdx += 1;
              if (res?.status === 'fulfilled' && res.value != null) return { ...d, id: res.value };
              return d;
            });
            form.setFieldsValue({ devices: devicesWithIds });
          } else if (eventType === 'device_to_warehouse') {
            // 设备入库
            const selectedClientIds = formattedEventData.client_ids || [];
            const selectedClients = clients.filter(client => selectedClientIds.includes(client.id));
            const supplierName = selectedClients.length > 0 ? selectedClients[0].name : '';
            
            const warehouseDeviceResults = await Promise.allSettled(
              devices
                .filter(device => device.brand && device.model && device.sn)
                .map(async (device) => {
                  try {
                    const warehouseDeviceData = {
                      brand: device.brand,
                      model: device.model,
                      sn: device.sn,
                      u_size: device.u_size,
                      power_type: device.power_type || 'single',
                      power_wattage: device.power_wattage,
                      device_type: device.device_type || 'other',
                      supplier: supplierName,
                      collection_time: formattedEventData.date ? `${formattedEventData.date} ${formattedEventData.start_time || '00:00:00'}` : new Date().toISOString(),
                      warehouse_location: device.warehouse_location,
                      notes: device.notes,
                      status: 'in_warehouse',
                      // 传递操作时间和日期，用于历史记录
                      action_date: formattedEventData.date || new Date().toISOString().split('T')[0],
                      action_time: formattedEventData.start_time || null
                    };
                    
                    const response = await warehouseDeviceAPI.createWarehouseDevice(warehouseDeviceData);
                    if (response?.data?.id) {
                      return response.data.id;
                    }
                    throw new Error('仓库设备创建失败：未返回ID');
                  } catch (error) {
                    console.error(`处理仓库设备失败:`, error);
                    throw error;
                  }
                })
            );
            
            warehouseDeviceIds = warehouseDeviceResults
              .filter(result => result.status === 'fulfilled' && result.value)
              .map(result => result.value);
            
            const failedDevices = warehouseDeviceResults.filter(result => result.status === 'rejected');
            if (failedDevices.length > 0) {
              operationSuccess = false;
              operationErrors.push(`${failedDevices.length} 个仓库设备创建失败`);
            }
            
            if (warehouseDeviceIds.length === 0 && devices.length > 0) {
              operationSuccess = false;
              operationErrors.push('所有仓库设备创建失败');
            }
          } else if (eventType === 'device_from_warehouse') {
            // 设备出库上架（注意：此时事件还未创建，所以不传event_id）
            const installResults = await Promise.allSettled(
              devices
                .filter(device => device.warehouse_device_id && device.cabinet_id)
                .map(async (device) => {
                  try {
                    const installData = {
                      cabinet_id: device.cabinet_id,
                      install_location: device.install_location,
                      rack_position: device.rack_position,
                      action_date: formattedEventData.date || new Date().toISOString().split('T')[0],
                      action_time: formattedEventData.start_time || null,
                      // 注意：此时事件还未创建，所以不传event_id，上架操作会在事件创建后通过关联关系建立
                      notes: device.notes
                    };
                    
                    const response = await warehouseDeviceAPI.installDevice(device.warehouse_device_id, installData);
                    // 返回新创建的设备ID和仓库设备ID
                    return {
                      deviceId: response?.data?.id, // 新创建的Device的ID
                      warehouseDeviceId: device.warehouse_device_id // 仓库设备ID
                    };
                  } catch (error) {
                    console.error(`上架设备失败:`, error);
                    throw error;
                  }
                })
            );
            
            // 收集成功上架的新设备ID和仓库设备ID
            const successfulInstalls = installResults
              .filter(result => result.status === 'fulfilled' && result.value)
              .map(result => result.value);
            
            deviceIds = successfulInstalls
              .filter(item => item.deviceId)
              .map(item => item.deviceId);
            
            warehouseDeviceIds = successfulInstalls
              .filter(item => item.warehouseDeviceId)
              .map(item => item.warehouseDeviceId);
            
            const failedInstalls = installResults.filter(result => result.status === 'rejected');
            if (failedInstalls.length > 0) {
              operationSuccess = false;
              operationErrors.push(`${failedInstalls.length} 个设备上架失败`);
            }
            
            if (installResults.length > 0 && installResults.every(result => result.status === 'rejected')) {
              operationSuccess = false;
              operationErrors.push('所有设备上架失败');
            }
          } else if (eventType === 'device_out_of_warehouse') {
            // 设备出库（不上架）
            const outResults = await Promise.allSettled(
              devices
                .filter(device => device.warehouse_device_id)
                .map(async (device) => {
                  try {
                    const outData = {
                      action_date: formattedEventData.date || new Date().toISOString().split('T')[0],
                      action_time: formattedEventData.start_time || null,
                      notes: device.notes || '',
                      // 注意：此时事件还未创建，所以不传event_id，出库操作会在事件创建后通过关联关系建立
                    };
                    
                    await warehouseDeviceAPI.outOfWarehouse(device.warehouse_device_id, outData);
                    // 返回仓库设备ID
                    return device.warehouse_device_id;
                  } catch (error) {
                    console.error(`出库设备失败:`, error);
                    throw error;
                  }
                })
            );
            
            // 收集成功出库的仓库设备ID
            warehouseDeviceIds = outResults
              .filter(result => result.status === 'fulfilled' && result.value)
              .map(result => result.value);
            
            const failedOuts = outResults.filter(result => result.status === 'rejected');
            if (failedOuts.length > 0) {
              operationSuccess = false;
              operationErrors.push(`${failedOuts.length} 个设备出库失败`);
            }
            
            if (outResults.length > 0 && outResults.every(result => result.status === 'rejected')) {
              operationSuccess = false;
              operationErrors.push('所有设备出库失败');
            }
          } else if (eventType === 'device_remove') {
            // 设备下架
            const decommissionResults = await Promise.allSettled(
              devices
                .filter(device => device.id)
                .map(async (device) => {
                  try {
                    const response = await deviceAPI.decommissionDevice(device.id, {
                      decommission_reason: eventData.description || '通过事件下架',
                      status: 'decommissioned'
                    });
                    // 返回下架设备的ID
                    return response?.data?.id || null;
                  } catch (error) {
                    console.error(`下架设备失败:`, error);
                    throw error;
                  }
                })
            );
            
            // 收集下架设备ID
            decommissionedDeviceIds = decommissionResults
              .filter(result => result.status === 'fulfilled' && result.value)
              .map(result => result.value);
            
            const failedDecommissions = decommissionResults.filter(result => result.status === 'rejected');
            if (failedDecommissions.length > 0) {
              operationSuccess = false;
              operationErrors.push(`${failedDecommissions.length} 个设备下架失败`);
            }
            
            if (decommissionedDeviceIds.length === 0 && devices.length > 0) {
              operationSuccess = false;
              operationErrors.push('所有设备下架失败');
            }
          }
        }
        
        // 3. 如果操作失败，不创建事件并提示错误
        if (!operationSuccess) {
          message.error(`操作失败，事件未创建：${operationErrors.join('; ')}`);
          setSubmitting(false);
          return;
        }
        
        // 4. 所有操作成功，创建事件（设备上架时把 device_ids 一并传入，后端在 create 时建立事件-设备关联）
        if (deviceIds.length > 0) {
          formattedEventData.device_ids = deviceIds;
        }
        eventResponse = await eventAPI.createEvent(formattedEventData);
        const eventId = eventResponse.data.id;
        if (formattedEventData.device_ids?.length > 0) {
          message.success(`成功关联 ${formattedEventData.device_ids.length} 个设备到事件`);
        }
        
        // 5. 关联进场人员到事件
        if (personnelIds.length > 0) {
          try {
            await entryPersonnelAPI.batchAssociateEntryPersonnel({
              event_id: eventId,
              entry_personnel_ids: personnelIds
            });
            message.success(`成功关联 ${personnelIds.length} 个进场人员到事件`);
          } catch (error) {
            console.error('关联进场人员到事件失败:', error);
            message.warning(`事件已创建，但关联进场人员失败: ${error.response?.data?.error || error.message}`);
          }
        }
        
        // 6. 关联设备到事件（新建时已在 create 请求中传 device_ids，此处仅作兜底；若未传过则再调批量关联）
        const deviceIdsToAssociate = (deviceIds || []).filter(id => id != null && !Number.isNaN(Number(id)));
        if (deviceIdsToAssociate.length > 0) {
          try {
            const associateResponse = await deviceAPI.batchAssociateDevices({
              event_id: eventId,
              device_ids: deviceIdsToAssociate
            });
            if (associateResponse.data.errors && associateResponse.data.errors.length > 0) {
              message.warning(`事件已创建，但部分设备关联失败: ${associateResponse.data.errors.join(', ')}`);
            } else if (!formattedEventData.device_ids || formattedEventData.device_ids.length === 0) {
              message.success(`成功关联 ${deviceIdsToAssociate.length} 个设备到事件`);
            }
          } catch (error) {
            console.error('关联设备到事件失败:', error);
            message.warning(`事件已创建，但关联设备失败: ${error.response?.data?.error || error.message}`);
          }
        }
        
        // 7. 关联仓库设备到事件（包括入库和出库上架的设备）
        if (warehouseDeviceIds.length > 0) {
          try {
            await warehouseDeviceAPI.batchAssociateWarehouseDevices({
              event_id: eventId,
              warehouse_device_ids: warehouseDeviceIds
            });
            message.success(`成功关联 ${warehouseDeviceIds.length} 个仓库设备到事件`);
          } catch (error) {
            console.error('关联仓库设备到事件失败:', error);
            message.warning(`事件已创建，但关联仓库设备失败: ${error.response?.data?.error || error.message}`);
          }
        }
        
        // 8. 关联下架设备到事件
        if (decommissionedDeviceIds.length > 0) {
          try {
            const response = await decommissionedDeviceAPI.batchAssociateDecommissionedDevices({
              event_id: eventId,
              decommissioned_device_ids: decommissionedDeviceIds
            });
            // 检查响应中的错误信息
            if (response?.data?.errors && response.data.errors.length > 0) {
              const errorMessages = response.data.errors.join('; ');
              message.warning(`事件已创建，但部分下架设备关联失败: ${errorMessages}`);
            } else if (response?.data?.created && response.data.created.length > 0) {
              message.success(`成功关联 ${response.data.created.length} 个下架设备到事件`);
            } else {
              message.warning(`事件已创建，但下架设备关联失败: ${response?.data?.message || '未知错误'}`);
            }
          } catch (error) {
            console.error('关联下架设备到事件失败:', error);
            console.error('错误响应数据:', error.response?.data);
            // 优先显示errors数组中的详细错误信息
            let errorMessage = '未知错误';
            if (error.response?.data?.errors && Array.isArray(error.response.data.errors) && error.response.data.errors.length > 0) {
              errorMessage = error.response.data.errors.join('; ');
            } else if (error.response?.data?.error) {
              errorMessage = error.response.data.error;
            } else if (error.response?.data?.message) {
              errorMessage = error.response.data.message;
            } else if (error.message) {
              errorMessage = error.message;
            }
            message.warning(`事件已创建，但关联下架设备失败: ${errorMessage}`);
          }
        }
        
        message.success('创建成功');
      }
      
      // 返回列表页
      navigate('/event/list');
    } catch (error) {
      console.error('提交失败:', error);
      message.error(isEditing ? '更新失败' : '创建失败');
    } finally {
      setSubmitting(false);
    }
  }, [clients, eventType, form, id, isEditing, navigate]);

  // 返回列表页
  const handleBack = useCallback(() => {
    navigate('/event/list');
  }, [navigate]);

  /**
   * 打开导入模态框
   */
  const handleOpenImport = () => {
    setImportModalVisible(true);
  };

  /**
   * 处理批量导入
   * @param {Object} data - 导入的数据，包含 { personnel: [], devices: [], warehouseDevices: [] }
   */
  const handleImport = useCallback(async (data) => {
    try {
      let importCount = 0;
      const messages = [];

      // 处理进场人员数据
      if (data.personnel && data.personnel.length > 0) {
        const currentPersonnel = form.getFieldValue('entry_personnel') || [];
        // 过滤掉空的默认记录
        const validCurrentPersonnel = currentPersonnel.filter(p => p.name || p.id_card || p.contact_info);
        const newPersonnel = [...validCurrentPersonnel, ...data.personnel];
        form.setFieldsValue({ entry_personnel: newPersonnel });
        importCount += data.personnel.length;
        messages.push(`${data.personnel.length} 条进场人员记录`);
      }

      // 处理设备数据（仅在设备上架模式下）
      if (data.devices && data.devices.length > 0 && eventType === 'device_install') {
        const currentDevices = form.getFieldValue('devices') || [];
        // 过滤掉空的默认记录
        const validCurrentDevices = currentDevices.filter(d => d.brand || d.model || d.sn);
        const newDevices = [...validCurrentDevices, ...data.devices];
        form.setFieldsValue({ devices: newDevices });
        importCount += data.devices.length;
        messages.push(`${data.devices.length} 条设备记录`);
      }

      // 处理入库设备数据（仅在设备入库模式下）
      if (data.warehouseDevices && data.warehouseDevices.length > 0 && eventType === 'device_to_warehouse') {
        const currentDevices = form.getFieldValue('devices') || [];
        // 过滤掉空的默认记录
        const validCurrentDevices = currentDevices.filter(d => d.brand || d.model || d.sn);
        const newDevices = [...validCurrentDevices, ...data.warehouseDevices];
        form.setFieldsValue({ devices: newDevices });
        importCount += data.warehouseDevices.length;
        messages.push(`${data.warehouseDevices.length} 条入库设备记录`);
      }

      if (importCount > 0) {
        message.success(`成功导入 ${messages.join('、')}，共 ${importCount} 条记录`);
      } else {
        message.warning('没有导入任何数据，请检查文件内容和当前事件类型');
      }
      
      setImportModalVisible(false);
    } catch (error) {
      console.error('导入失败:', error);
      message.error('导入失败，请重试');
      throw error;
    }
  }, [form, eventType]);

  /**
   * 关闭导入模态框
   */
  const handleCloseImport = () => {
    setImportModalVisible(false);
  };

  return (
    <div className={styles.eventForm}>
      <Spin spinning={initialLoading}>
      <Card
          title={
            <div style={{ display: 'flex', alignItems: 'center' }}>
          <Button
                type="link"
            icon={<ArrowLeftOutlined />}
            onClick={handleBack}
                style={{ marginRight: 16, padding: 0 }}
              />
              <span>{isEditing ? '编辑事件' : '新建事件'}</span>
            </div>
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
            disabled={initialLoading}
          className={styles.form}
            initialValues={{
              completion_status: false,
              event_type: 'personnel_entry',
              entry_personnel: [{}],
              devices: [{}]
            }}
          >
            <Row gutter={16} style={{ marginBottom: 24 }}>
              <Col span={24}>
            <Form.Item
                  name="event_type"
                  label="事件类型"
                  rules={[{ required: true, message: '请选择事件类型' }]}
                >
                  <Radio.Group 
                    value={eventType}
                    onChange={handleEventTypeChange}
                    optionType="button"
                  >
                    <Radio.Button value="personnel_entry">人员进场</Radio.Button>
                    <Radio.Button value="device_install">设备上架</Radio.Button>
                    <Radio.Button value="device_remove">设备下架</Radio.Button>
                    <Radio.Button value="device_to_warehouse">设备入库</Radio.Button>
                    <Radio.Button value="device_from_warehouse">设备出库上架</Radio.Button>
                    <Radio.Button value="device_out_of_warehouse">设备出库</Radio.Button>
                  </Radio.Group>
            </Form.Item>
              </Col>
            </Row>
            
            <Row gutter={16}>
              <Col span={8}>
            <Form.Item
              name="date"
              label="日期"
              rules={[{ required: true, message: '请选择日期' }]}
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
              </Col>
              <Col span={8}>
            <Form.Item
              name="start_time"
              label="开始时间"
              dependencies={['end_time']}
              rules={[
                { required: true, message: '请选择开始时间' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value) {
                      return Promise.resolve();
                    }
                    const endTime = getFieldValue('end_time');
                    if (endTime && value && dayjs(value).isAfter(dayjs(endTime))) {
                      return Promise.reject(new Error('开始时间不能大于结束时间'));
                    }
                    return Promise.resolve();
                  },
                }),
              ]}
            >
                  <TimePicker style={{ width: '100%' }} format="HH:mm" />
            </Form.Item>
              </Col>
              <Col span={8}>
            <Form.Item
              name="end_time"
              label="结束时间"
              dependencies={['start_time']}
              rules={[
                { required: true, message: '请选择结束时间' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value) {
                      return Promise.resolve();
                    }
                    const startTime = getFieldValue('start_time');
                    if (startTime && value && dayjs(value).isBefore(dayjs(startTime))) {
                      return Promise.reject(new Error('结束时间不能小于开始时间'));
                    }
                    return Promise.resolve();
                  },
                }),
              ]}
                >
                  <TimePicker style={{ width: '100%' }} format="HH:mm" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              {isEditing && (
                <Col span={12}>
                  <Form.Item
                    name="order_number"
                    label="订单号"
                  >
                    <Input placeholder="订单号" disabled />
                  </Form.Item>
                </Col>
              )}
              <Col span={isEditing ? 12 : 24}>
                <Form.Item
                  name="completion_status"
                  label="完成状态"
                  valuePropName="checked"
                >
                  <Switch checkedChildren="已完成" unCheckedChildren="未完成" />
                </Form.Item>
              </Col>
            </Row>

            {/* 设备入库和设备出库时不需要选择机房 */}
            {eventType !== 'device_to_warehouse' && eventType !== 'device_out_of_warehouse' && (
              <Row gutter={16}>
                <Col span={24}>
                  <Form.Item
                    name="room_ids"
                    label="机房"
                    rules={[
                      { 
                        required: eventType !== 'device_to_warehouse' && eventType !== 'device_out_of_warehouse', 
                        message: '请选择机房' 
                      }
                    ]}
                  >
                    <Select
                      mode="multiple"
                      placeholder="请选择机房"
                      style={{ width: '100%' }}
                      showSearch
                      optionFilterProp="label"
                      options={roomOptions}
                      onChange={(roomIds) => handleRoomChange(roomIds, eventType)}
                    />
                  </Form.Item>
                </Col>
              </Row>
            )}

            <Row gutter={16}>
              <Col span={24}>
                <Form.Item
                  name="duty_personnel_ids"
                  label="值班人员"
                  rules={[{ required: true, message: '请选择值班人员' }]}
                >
                  <Select
                    mode="multiple"
                    placeholder="请选择值班人员"
                    style={{ width: '100%' }}
                    showSearch
                    optionFilterProp="children"
                  >
                    {dutyPersonnel.map(person => (
                      <Option key={person.id} value={person.id}>{person.name}</Option>
                    ))}
                  </Select>
            </Form.Item>
              </Col>
            </Row>
          
            <Row gutter={16}>
              <Col span={12}>
            <Form.Item
              name="client_ids"
              label="客户"
              rules={[{ required: true, message: '请选择客户' }]}
            >
              <Select 
                mode="multiple" 
                placeholder="请选择客户"
                allowClear
                style={{ width: '100%' }}
                showSearch
                optionFilterProp="label"
                options={clientOptions}
              />
            </Form.Item>
              </Col>
              <Col span={12}>
            <Form.Item
                  name="authorized_org_ids"
              label="授权单位"
            >
              <Select 
                mode="multiple" 
                placeholder="请选择授权单位"
                    allowClear
                    style={{ width: '100%' }}
                    showSearch
                optionFilterProp="children"
              >
                {orgs.map(org => (
                  <Option key={org.id} value={org.id}>{org.name}</Option>
                ))}
              </Select>
            </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={24}>
          <Form.Item
            name="description"
            label="事件描述"
            rules={[{ required: true, message: '请输入事件描述' }]}
          >
                  <TextArea rows={4} placeholder="请输入事件描述" maxLength={500} showCount />
                </Form.Item>
              </Col>
            </Row>

            {/* 进场人员表单列表 */}
            <Form.List name="entry_personnel">
              {(fields, { add, remove }) => (
                <>
                  <div className={styles.formSectionTitle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>进场人员信息</span>
                    <Button 
                      type="primary" 
                      ghost 
                      size="small"
                      icon={<ImportOutlined />}
                      onClick={handleOpenImport}
                    >
                      批量导入
                    </Button>
                  </div>
                  <p style={{ marginBottom: 16 }}>（进场人员信息将与事件一同保存）</p>
                  {fields.map(({ key, name, ...restField }) => (
                    <Row gutter={16} key={key} style={{ marginBottom: 16 }}>
                      <Col span={7}>
                        <Form.Item
                          {...restField}
                          name={[name, 'name']}
                          rules={[{ required: true, message: '请输入姓名' }]}
                        >
                          <Input placeholder="姓名" />
                        </Form.Item>
                      </Col>
                      <Col span={7}>
                        <Form.Item
                          {...restField}
                          name={[name, 'id_card']}
                          rules={[
                            { required: true, message: '请输入身份证号' },
                            { 
                              len: 18, 
                              message: '身份证号必须为18位' 
                            },
                            {
                              pattern: /^[0-9X]{18}$/,
                              message: '身份证号格式不正确'
                            }
                          ]}
                        >
                          <Input placeholder="身份证号" maxLength={18} />
                        </Form.Item>
                      </Col>
                      <Col span={7}>
                        <Form.Item
                          {...restField}
                          name={[name, 'contact_info']}
                          rules={[
                            { required: true, message: '请输入联系方式' },
                            {
                              pattern: /^1[3-9]\d{9}$/,
                              message: '请输入正确的手机号'
                            }
                          ]}
                        >
                          <Input placeholder="联系方式" maxLength={11} />
                        </Form.Item>
                      </Col>
                      <Col span={3}>
                        <Button 
                          type="link" 
                          danger
                          icon={<MinusCircleOutlined />} 
                          onClick={() => remove(name)}
                          style={{ marginTop: 8 }}
                        />
                      </Col>
                    </Row>
                  ))}
                  <Form.Item>
                    <Button 
                      type="dashed" 
                      onClick={() => add()} 
                      block 
                      icon={<PlusOutlined />}
                      style={{ marginTop: 8 }}
                    >
                      添加进场人员
                    </Button>
                  </Form.Item>
                </>
              )}
            </Form.List>

            {/* 设备表单列表 */}
            {(eventType === 'device_install' || eventType === 'device_remove' || eventType === 'device_to_warehouse' || eventType === 'device_from_warehouse' || eventType === 'device_out_of_warehouse') && (
              <Form.List name="devices">
                {(fields, { add, remove }) => (
                  <>
                    <div className={styles.formSectionTitle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>
                        {eventType === 'device_install' ? '上架设备信息' : 
                         eventType === 'device_to_warehouse' ? '入库设备信息' : 
                         eventType === 'device_from_warehouse' ? '仓库设备信息' :
                         eventType === 'device_out_of_warehouse' ? '出库设备信息' :
                         '下架设备信息'}
                      </span>
                      {eventType === 'device_install' && (
                        <Button 
                          type="primary" 
                          ghost 
                          size="small"
                          icon={<ImportOutlined />}
                          onClick={handleOpenImport}
                        >
                          批量导入
                        </Button>
                      )}
                    </div>
                    {isPending && (
                      <div style={{ textAlign: 'center', margin: '16px 0' }}>
                        <Spin size="small">
                          <div style={{ padding: '20px' }}>加载设备中...</div>
                        </Spin>
                      </div>
                    )}
                    {fields.map(({ key, name, ...restField }) => (
                      <div key={key} className={eventType === 'device_install' ? styles.deviceRowGroup : ''} style={{ marginBottom: 16 }}>
                        {eventType === 'device_install' ? (
                          // 设备上架表单 - 多行布局
                          <>
                            {/* 第一行：基本信息 */}
                            <Row gutter={8} style={{ marginBottom: 8 }}>
                              <Col span={1} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#666' }}>#{name + 1}</span>
                              </Col>
                              <Col span={4}>
                                <div className={styles.deviceRowLabel}>品牌</div>
                                <Form.Item
                                  {...restField}
                                  name={[name, 'brand']}
                                  rules={[{ required: true, message: '请输入品牌' }]}
                                >
                                  <Input placeholder="请输入品牌" size="small" />
                                </Form.Item>
                              </Col>
                              <Col span={4}>
                                <div className={styles.deviceRowLabel}>型号</div>
                                <Form.Item
                                  {...restField}
                                  name={[name, 'model']}
                                  rules={[{ required: true, message: '请输入型号' }]}
                                >
                                  <Input placeholder="请输入型号" size="small" />
                                </Form.Item>
                              </Col>
                              <Col span={5}>
                                <div className={styles.deviceRowLabel}>SN序列号</div>
                                <Form.Item
                                  {...restField}
                                  name={[name, 'sn']}
                                  rules={[{ required: true, message: '请输入SN' }]}
                                >
                                  <Input placeholder="请输入SN" size="small" />
                                </Form.Item>
                              </Col>
                              <Col span={4}>
                                <div className={styles.deviceRowLabel}>设备类型</div>
                                <Form.Item
                                  {...restField}
                                  name={[name, 'device_type']}
                                  rules={[{ required: true, message: '请选择设备类型' }]}
                                  initialValue="other"
                                >
                                  <Select placeholder="设备类型" size="small">
                                    {deviceTypeOptions.map(option => (
                                      <Option key={option.value} value={option.value}>
                                        <Space size={4}>
                                          <span className={styles.deviceTypeIcon}>{option.icon}</span>
                                          {option.label}
                                        </Space>
                                      </Option>
                                    ))}
                                  </Select>
                                </Form.Item>
                              </Col>
                              <Col span={4}>
                                <div className={styles.deviceRowLabel}>电源瓦数</div>
                                <Form.Item
                                  {...restField}
                                  name={[name, 'power_wattage']}
                                  rules={[
                                    { required: true, message: '请输入电源瓦数' },
                                    { type: 'number', min: 1, message: '电源瓦数必须大于0' }
                                  ]}
                                >
                                  <InputNumber
                                    placeholder="电源瓦数"
                                    size="small"
                                    min={1}
                                    max={50000}
                                    style={{ width: '100%' }}
                                    addonAfter="W"
                                    formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                    parser={value => value.replace(/\$\s?|(,*)/g, '')}
                                    className={styles.powerWattageInput}
                                  />
                                </Form.Item>
                              </Col>
                              <Col span={2} style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                                <Button 
                                  type="link" 
                                  danger
                                  icon={<MinusCircleOutlined />} 
                                  onClick={() => remove(name)}
                                  size="small"
                                  title="删除此设备"
                                />
                              </Col>
                            </Row>
                            {/* 第二行：位置和机柜信息 */}
                            <Row gutter={8}>
                              <Col span={1}></Col>
                              <Col span={3}>
                                <div className={styles.deviceRowLabel}>U数</div>
                                <Form.Item
                                  {...restField}
                                  name={[name, 'u_size']}
                                  rules={[
                                    { required: true, message: '请输入U数' },
                                    ({ getFieldValue }) => ({
                                      validator(_, value) {
                                        if (!value) return Promise.resolve();
                                        
                                        const cabinetId = getFieldValue(['devices', name, 'cabinet']);
                                        const position = getFieldValue(['devices', name, 'rack_position']);
                                        
                                        if (!cabinetId || !position) return Promise.resolve();
                                        
                                        const positionNum = parseInt(position, 10);
                                        const uSizeNum = parseInt(value, 10);
                                        
                                        if (positionNum + uSizeNum - 1 > 42) {
                                          return Promise.reject(new Error(`设备位置(${positionNum})加上U数(${uSizeNum})超出机柜42U限制`));
                                        }
                                        
                                        if (checkDevicePositionConflict(cabinetId, position, value)) {
                                          return Promise.reject(new Error('当前U数设置会与已有设备冲突'));
                                        }
                                        
                                        return Promise.resolve();
                                      },
                                    }),
                                  ]}
                                >
                                  <InputNumber 
                                    placeholder="U数" 
                                    size="small"
                                    min={1} 
                                    max={42}
                                    style={{ width: '100%' }}
                                    onChange={() => {
                                      const position = form.getFieldValue(['devices', name, 'rack_position']);
                                      if (position) form.validateFields([[`devices`, name, `rack_position`]]);
                                    }} 
                                  />
                                </Form.Item>
                              </Col>
                              <Col span={4}>
                                <div className={styles.deviceRowLabel}>机架位置（起始U位）</div>
                                <Form.Item
                                  {...restField}
                                  name={[name, 'rack_position']}
                                  rules={[
                                    { required: true, message: '请输入机架位置' },
                                    ({ getFieldValue }) => ({
                                      validator(_, value) {
                                        if (!value) return Promise.resolve();
                                        
                                        const cabinetId = getFieldValue(['devices', name, 'cabinet']);
                                        const uSize = getFieldValue(['devices', name, 'u_size']);
                                        
                                        if (!cabinetId || !uSize) return Promise.resolve();
                                        
                                        const positionNum = parseInt(value, 10);
                                        const uSizeNum = parseInt(uSize, 10);
                                        
                                        if (positionNum + uSizeNum - 1 > 42) {
                                          return Promise.reject(new Error(`设备位置(${positionNum})加上U数(${uSizeNum})超出机柜42U限制`));
                                        }
                                        
                                        if (checkDevicePositionConflict(cabinetId, value, uSize)) {
                                          return Promise.reject(new Error('该位置已被占用，请选择其他位置'));
                                        }
                                        
                                        return Promise.resolve();
                                      },
                                    }),
                                  ]}
                                >
                                  <InputNumber 
                                    placeholder="起始U位" 
                                    size="small"
                                    min={1}
                                    max={42}
                                    style={{ width: '100%' }}
                                    onChange={() => {
                                      const uSize = form.getFieldValue(['devices', name, 'u_size']);
                                      if (uSize) form.validateFields([[`devices`, name, `u_size`]]);
                                    }} 
                                  />
                                </Form.Item>
                              </Col>
                              <Col span={5}>
                                <div className={styles.deviceRowLabel}>电源类型</div>
                                <Form.Item
                                  {...restField}
                                  name={[name, 'power']}
                                  rules={[{ required: true, message: '请选择电源类型' }]}
                                >
                                  <Select 
                                    placeholder="选择电源类型" 
                                    size="small"
                                    mode="tags" 
                                    maxTagCount={2}
                                  >
                                    <Option value="单电源">单电源</Option>
                                    <Option value="双电源">双电源</Option>
                                    <Option value="AC220V">AC220V</Option>
                                    <Option value="AC380V">AC380V</Option>
                                    <Option value="DC48V">DC48V</Option>
                                    <Option value="POE供电">POE供电</Option>
                                  </Select>
                                </Form.Item>
                              </Col>
                              <Col span={5}>
                                <div className={styles.deviceRowLabel}>机柜</div>
                                <Form.Item
                                  {...restField}
                                  name={[name, 'cabinet']}
                                  rules={[{ required: true, message: '请选择机柜' }]}
                                >
                                  <Select
                                    placeholder="请选择机柜"
                                    size="small"
                                    showSearch
                                    optionFilterProp="children"
                                    disabled={!selectedRoomIds.length}
                                    onChange={(cabinetId) => {
                                      // 转换为数字ID确保一致性
                                      const cabinetIdNum = parseInt(cabinetId, 10);
                                      
                                      // 重新获取该机柜的设备信息（用于位置冲突校验）
                                      const updateCabinetDevices = async () => {
                                        try {
                                          const devicesList = await fetchCabinetDevices(cabinetIdNum);
                                          
                                          // 只更新当前机柜的设备数据，确保使用数字ID作为键
                                          setCabinetDevices(prev => ({
                                            ...prev,
                                            [cabinetIdNum]: devicesList
                                          }));
                                        } catch (error) {
                                          console.error('更新机柜设备失败:', error);
                                        }
                                      };
                                      
                                      updateCabinetDevices();
                                      // 不再清除机架位置和U数，保留用户已填或导入的值
                                    }}
                                  >
                                    {cabinets.map(cabinet => {
                                      const cabinetRoomId = typeof cabinet.room === 'object' && cabinet.room !== null
                                        ? Number.parseInt(cabinet.room.id ?? cabinet.room, 10)
                                        : Number.parseInt(cabinet.room, 10);
                                      const roomName = cabinet.room_name || roomNameById.get(cabinetRoomId) || '';
                                      const displayName = roomName ? `${roomName}-${cabinet.name}` : cabinet.name;
                                      
                                      return (
                                        <Option key={cabinet.id} value={cabinet.id}>
                                          {displayName}
                                        </Option>
                                      );
                                    })}
                                  </Select>
                                </Form.Item>
                              </Col>
                            </Row>
                          </>
                        ) : eventType === 'device_to_warehouse' ? (
                          // 设备入库表单 - 简单表单，不需要机柜和位置信息
                          <>
                          <Row gutter={16}>
                            <Col span={1}>
                              <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#666', lineHeight: '32px' }}>#{name + 1}</span>
                            </Col>
                            <Col span={3}>
                              <Form.Item
                                {...restField}
                                name={[name, 'brand']}
                                rules={[{ required: true, message: '请输入品牌' }]}
                              >
                                <Input placeholder="品牌" />
                              </Form.Item>
                            </Col>
                            <Col span={3}>
                              <Form.Item
                                {...restField}
                                name={[name, 'model']}
                                rules={[{ required: true, message: '请输入型号' }]}
                              >
                                <Input placeholder="型号" />
                              </Form.Item>
                            </Col>
                            <Col span={3}>
                              <Form.Item
                                {...restField}
                                name={[name, 'sn']}
                                rules={[{ required: true, message: '请输入序列号' }]}
                              >
                                <Input placeholder="序列号" />
                              </Form.Item>
                            </Col>
                            <Col span={2}>
                              <Form.Item
                                {...restField}
                                name={[name, 'u_size']}
                                rules={[{ required: true, message: '请输入U数' }]}
                              >
                                <InputNumber placeholder="U数" min={1} max={42} style={{ width: '100%' }} />
                              </Form.Item>
                            </Col>
                            <Col span={3}>
                              <Form.Item
                                {...restField}
                                name={[name, 'device_type']}
                                rules={[{ required: true, message: '请选择设备类型' }]}
                                initialValue="other"
                              >
                                <Select placeholder="设备类型">
                                  {deviceTypeOptions.map(option => (
                                    <Option key={option.value} value={option.value}>
                                      {option.icon} {option.label}
                                    </Option>
                                  ))}
                                </Select>
                              </Form.Item>
                            </Col>
                            <Col span={3}>
                              <Form.Item
                                {...restField}
                                name={[name, 'power_type']}
                                initialValue="single"
                              >
                                <Select placeholder="电源类型">
                                  <Option value="single">单电源</Option>
                                  <Option value="dual">双电源</Option>
                                </Select>
                              </Form.Item>
                            </Col>
                            <Col span={2}>
                              <Button 
                                type="link" 
                                danger
                                icon={<MinusCircleOutlined />} 
                                onClick={() => remove(name)}
                                style={{ marginTop: 8 }}
                              />
                            </Col>
                          </Row>
                          <Row gutter={16}>
                            <Col span={1}></Col>
                            <Col span={3}>
                              <Form.Item
                                {...restField}
                                name={[name, 'power_wattage']}
                                label="电源瓦数(W)"
                              >
                                <InputNumber 
                                  placeholder="电源瓦数" 
                                  min={1} 
                                  max={50000} 
                                  style={{ width: '100%' }}
                                  formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                  parser={value => value.replace(/\$\s?|(,*)/g, '')}
                                />
                              </Form.Item>
                            </Col>
                            <Col span={6}>
                              <Form.Item
                                {...restField}
                                name={[name, 'warehouse_location']}
                                label="仓库位置"
                              >
                                <Input placeholder="如：机房楼1楼仓库" />
                              </Form.Item>
                            </Col>
                          </Row>
                          <Row gutter={16}>
                            <Col span={1}></Col>
                            <Col span={22}>
                              <Form.Item
                                {...restField}
                                name={[name, 'notes']}
                                label="备注"
                              >
                                <Input.TextArea 
                                  placeholder="请输入备注信息" 
                                  rows={2}
                                  maxLength={500}
                                  showCount
                                />
                              </Form.Item>
                            </Col>
                          </Row>
                          </>
                        ) : eventType === 'device_from_warehouse' ? (
                          // 设备出库上架表单 - 从仓库选择设备并上架
                          <>
                            <Row gutter={16} style={{ marginBottom: 16 }}>
                              <Col span={23}>
                                <Form.Item
                                  {...restField}
                                  name={[name, 'warehouse_device_id']}
                                  label="选择仓库设备"
                                  rules={[{ required: true, message: '请选择仓库设备' }]}
                                >
                                  <Select
                                    placeholder="请选择要上架的仓库设备"
                                    showSearch
                                    optionFilterProp="children"
                                    style={{ width: '100%' }}
                                    filterOption={(input, option) =>
                                      (option?.children ?? '').toLowerCase().includes(input.toLowerCase())
                                    }
                                    onChange={(warehouseDeviceId) => {
                                      // 当选择仓库设备时，自动填充设备信息
                                      const selectedDevice = warehouseDevices.find(d => d.id === warehouseDeviceId);
                                      if (selectedDevice) {
                                        form.setFieldsValue({
                                          devices: {
                                            [name]: {
                                              u_size: selectedDevice.u_size,
                                              device_type: selectedDevice.device_type
                                            }
                                          }
                                        });
                                      }
                                    }}
                                  >
                                    {warehouseDevices.map(device => (
                                      <Option key={device.id} value={device.id}>
                                        {`${device.brand} ${device.model} (SN: ${device.sn}) - ${device.u_size}U`}
                                      </Option>
                                    ))}
                                  </Select>
                                </Form.Item>
                              </Col>
                              <Col span={1}>
                                <Button 
                                  type="link" 
                                  danger
                                  icon={<MinusCircleOutlined />} 
                                  onClick={() => remove(name)}
                                  style={{ marginTop: 32 }}
                                />
                              </Col>
                            </Row>
                            <Row gutter={16}>
                              <Col span={8}>
                                <Form.Item
                                  {...restField}
                                  name={[name, 'cabinet_id']}
                                  label="选择机柜"
                                  rules={[{ required: true, message: '请选择机柜' }]}
                                >
                                  <Select
                                    placeholder="请选择机柜"
                                    showSearch
                                    optionFilterProp="children"
                                    disabled={!selectedRoomIds.length}
                                    onChange={async (cabinetId) => {
                                      // 转换为数字ID确保一致性
                                      const cabinetIdNum = parseInt(cabinetId, 10);
                                      
                                      // 重新获取该机柜的设备信息用于位置检测
                                      const updateCabinetDevices = async () => {
                                        try {
                                          const devicesList = await fetchCabinetDevices(cabinetIdNum);
                                          
                                          // 只更新当前机柜的设备数据，确保使用数字ID作为键
                                          setCabinetDevices(prev => ({
                                            ...prev,
                                            [cabinetIdNum]: devicesList
                                          }));
                                        } catch (error) {
                                          console.error('更新机柜设备失败:', error);
                                        }
                                      };
                                      
                                      await updateCabinetDevices();
                                      
                                      // 自动生成上架位置
                                      const cabinet = cabinets.find(c => c.id === cabinetIdNum);
                                      if (cabinet) {
                                        const cabinetRoomId = typeof cabinet.room === 'object' && cabinet.room !== null
                                          ? Number.parseInt(cabinet.room.id ?? cabinet.room, 10)
                                          : Number.parseInt(cabinet.room, 10);
                                        const roomName = cabinet.room_name || roomNameById.get(cabinetRoomId);
                                        if (roomName) {
                                          const installLocation = `${roomName}-${cabinet.name}`;
                                          form.setFieldsValue({
                                            devices: {
                                              [name]: {
                                                install_location: installLocation
                                              }
                                            }
                                          });
                                        }
                                      }
                                      
                                      // 清除机架位置
                                      form.setFieldsValue({
                                        devices: {
                                          [name]: {
                                            rack_position: undefined
                                          }
                                        }
                                      });
                                    }}
                                  >
                                    {cabinets.map(cabinet => {
                                      const cabinetRoomId = typeof cabinet.room === 'object' && cabinet.room !== null
                                        ? Number.parseInt(cabinet.room.id ?? cabinet.room, 10)
                                        : Number.parseInt(cabinet.room, 10);
                                      const roomName = cabinet.room_name || roomNameById.get(cabinetRoomId) || '';
                                      const displayName = roomName ? `${roomName}-${cabinet.name}` : cabinet.name;
                                      return (
                                        <Option key={cabinet.id} value={cabinet.id}>
                                          {displayName}
                                        </Option>
                                      );
                                    })}
                                  </Select>
                                </Form.Item>
                              </Col>
                              <Col span={8}>
                                <Form.Item
                                  {...restField}
                                  name={[name, 'rack_position']}
                                  label="机架位置（起始U位）"
                                  rules={[
                                    { required: true, message: '请输入机架位置' },
                                    {
                                      validator: async (_, value) => {
                                        if (!value) return Promise.resolve();
                                        
                                        const position = parseInt(value, 10);
                                        if (isNaN(position) || !Number.isInteger(position) || position <= 0) {
                                          return Promise.reject(new Error('机架位置必须是正整数'));
                                        }
                                        
                                        if (position < 1 || position > 42) {
                                          return Promise.reject(new Error('机架位置必须在1-42之间'));
                                        }
                                        
                                        const cabinetId = form.getFieldValue(['devices', name, 'cabinet_id']);
                                        const warehouseDeviceId = form.getFieldValue(['devices', name, 'warehouse_device_id']);
                                        
                                        if (cabinetId && warehouseDeviceId) {
                                          const selectedDevice = warehouseDevices.find(d => d.id === warehouseDeviceId);
                                          if (selectedDevice && selectedDevice.u_size) {
                                            const positionNum = parseInt(position, 10);
                                            const uSizeNum = parseInt(selectedDevice.u_size, 10);
                                            if (positionNum + uSizeNum - 1 > 42) {
                                              return Promise.reject(new Error(`位置(${positionNum})加上U数(${uSizeNum})超出机柜42U限制`));
                                            }
                                            
                                            // 检查位置冲突
                                            const cabinetIdNum = parseInt(cabinetId, 10);
                                            let devicesInCabinet = cabinetDevices[cabinetIdNum] || [];
                                            
                                            // 如果没有获取到机柜设备列表，先获取（异步等待）
                                            if (devicesInCabinet.length === 0) {
                                              try {
                                                const devices = await fetchCabinetDevices(cabinetIdNum);
                                                setCabinetDevices(prev => ({
                                                  ...prev,
                                                  [cabinetIdNum]: devices
                                                }));
                                                devicesInCabinet = devices;
                                              } catch (error) {
                                                console.error('获取机柜设备失败:', error);
                                                // 如果获取失败，暂时不检查冲突，避免误报
                                                return Promise.resolve();
                                              }
                                            }
                                            
                                            const currentRange = Array.from({ length: uSizeNum }, (_, i) => positionNum + i);
                                            
                                            const hasConflict = devicesInCabinet.some(device => {
                                              // 检查设备是否在同一机柜（支持cabinet和cabinet_id两种字段，以及cabinet可能是对象的情况）
                                              let deviceCabinetId;
                                              if (device.cabinet_id) {
                                                deviceCabinetId = parseInt(device.cabinet_id, 10);
                                              } else if (device.cabinet) {
                                                // cabinet可能是对象或数字
                                                if (typeof device.cabinet === 'object' && device.cabinet !== null) {
                                                  deviceCabinetId = parseInt(device.cabinet.id || device.cabinet, 10);
                                                } else {
                                                  deviceCabinetId = parseInt(device.cabinet, 10);
                                                }
                                              } else {
                                                return false; // 没有机柜信息，跳过
                                              }
                                              
                                              if (isNaN(deviceCabinetId) || deviceCabinetId !== cabinetIdNum) {
                                                return false;
                                              }
                                              
                                              // 只检查有有效rack_position和u_size的设备
                                              if (!device.rack_position || !device.u_size) {
                                                return false;
                                              }
                                              
                                              // rack_position可能是字符串（如"10-11"）或数字，需要提取起始位置
                                              let devicePosition;
                                              if (typeof device.rack_position === 'string' && device.rack_position.includes('-')) {
                                                // 如果是范围格式（如"10-11"），取第一个数字
                                                devicePosition = parseInt(device.rack_position.split('-')[0], 10);
                                              } else {
                                                devicePosition = parseInt(device.rack_position, 10);
                                              }
                                              
                                              const deviceUSize = parseInt(device.u_size, 10);
                                              
                                              // 验证数据有效性
                                              if (isNaN(devicePosition) || isNaN(deviceUSize) || devicePosition <= 0 || deviceUSize <= 0) {
                                                return false;
                                              }
                                              
                                              const deviceRange = Array.from(
                                                { length: deviceUSize }, 
                                                (_, i) => devicePosition + i
                                              );
                                              
                                              return currentRange.some(pos => deviceRange.includes(pos));
                                            });
                                            
                                            if (hasConflict) {
                                              return Promise.reject(new Error('该位置已被占用或与现有设备冲突，请选择其他位置'));
                                            }
                                          }
                                        }
                                        
                                        return Promise.resolve();
                                      }
                                    }
                                  ]}
                                >
                                  <InputNumber 
                                    placeholder="请输入起始U位" 
                                    min={1}
                                    max={42}
                                    style={{ width: '100%' }}
                                  />
                                </Form.Item>
                              </Col>
                              <Col span={8}>
                                <Form.Item
                                  {...restField}
                                  name={[name, 'install_location']}
                                  label="上架位置"
                                  rules={[{ required: true, message: '请输入上架位置' }]}
                                >
                                  <Input placeholder="如：F1D-07-10" />
                                </Form.Item>
                              </Col>
                            </Row>
                          </>
                        ) : eventType === 'device_out_of_warehouse' ? (
                          // 设备出库表单 - 从仓库选择设备并出库（不上架）
                          <>
                            <Row gutter={16} style={{ marginBottom: 16 }}>
                              <Col span={23}>
                                <Form.Item
                                  {...restField}
                                  name={[name, 'warehouse_device_id']}
                                  label="选择仓库设备"
                                  rules={[{ required: true, message: '请选择仓库设备' }]}
                                >
                                  <Select
                                    placeholder="请选择要出库的仓库设备"
                                    showSearch
                                    optionFilterProp="children"
                                    style={{ width: '100%' }}
                                    filterOption={(input, option) =>
                                      (option?.children ?? '').toLowerCase().includes(input.toLowerCase())
                                    }
                                  >
                                    {warehouseDevices.map(device => (
                                      <Option key={device.id} value={device.id}>
                                        {`${device.brand} ${device.model} (SN: ${device.sn}) - ${device.u_size}U`}
                                      </Option>
                                    ))}
                                  </Select>
                                </Form.Item>
                              </Col>
                              <Col span={1}>
                                <Button 
                                  type="link" 
                                  danger
                                  icon={<MinusCircleOutlined />} 
                                  onClick={() => remove(name)}
                                  style={{ marginTop: 32 }}
                                />
                              </Col>
                            </Row>
                          </>
                        ) : (
                          // 设备下架表单
                          <Row gutter={16}>
                            <Col span={23}>
                              <Form.Item
                                {...restField}
                                name={[name, 'id']}
                                rules={[{ required: true, message: '请选择要下架的设备' }]}
                              >
                                <Select
                                  placeholder="输入 SN / 品牌 / 型号 搜索（先选机房）"
                                  showSearch
                                  filterOption={false}
                                  onSearch={handleDeviceRemoveSearch}
                                  onDropdownVisibleChange={handleDeviceRemoveDropdownVisibleChange}
                                  loading={deviceRemoveSearching}
                                  notFoundContent={deviceRemoveSearching ? '搜索中...' : (selectedRoomIds.length === 0 ? '请先选择机房' : '输入关键词搜索或展开下拉加载')}
                                  style={{ width: '100%' }}
                                >
                                  {devices.map(device => {
                                    const label = `${device.brand || ''} ${device.model || ''} (SN: ${device.sn || ''}) - ${device.room_name || ''} ${device.cabinet_name || ''} ${device.u_size || ''}U`;
                                    return (
                                      <Option key={device.id} value={device.id} label={label}>
                                        {label}
                                      </Option>
                                    );
                                  })}
                                </Select>
                              </Form.Item>
                            </Col>
                            <Col span={1}>
                              <Button 
                                type="link" 
                                danger
                                icon={<MinusCircleOutlined />} 
                                onClick={() => remove(name)}
                                style={{ marginTop: 8 }}
                              />
                            </Col>
                          </Row>
                        )}
                      </div>
                    ))}
                    <Form.Item>
                      <Button 
                        type="dashed" 
                        onClick={() => add()} 
                        block 
                        icon={<PlusOutlined />}
                        style={{ marginTop: 8 }}
                      >
                        添加{
                          eventType === 'device_install' ? '上架' : 
                          eventType === 'device_to_warehouse' ? '入库' : 
                          eventType === 'device_from_warehouse' ? '仓库' :
                          eventType === 'device_out_of_warehouse' ? '出库' :
                          '下架'
                        }设备
                      </Button>
          </Form.Item>
                  </>
                )}
              </Form.List>
            )}
          
          <Form.Item className={styles.submitItem}>
            <Space>
              <Button type="default" onClick={handleBack}>
                取消
              </Button>
              <Button 
                type="primary" 
                htmlType="submit" 
                loading={submitting}
                disabled={submitting}
                icon={<SaveOutlined />}
              >
                保存
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
      </Spin>
      
      {/* 批量导入模态框：传入机柜与机房列表，用于按机柜名称解析机柜 ID */}
      <ImportModal
        visible={importModalVisible}
        onCancel={handleCloseImport}
        onImport={handleImport}
        cabinets={cabinets}
        rooms={rooms}
      />
    </div>
  );
};

export default EventForm;
