/**
 * 仓库设备管理页面
 * 提供仓库设备的列表、筛选、搜索、编辑、删除、上架、出库等功能
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Table, Button, Space, Popconfirm, message, Card, Input, Modal, 
  Select, Tag, Drawer, Row, Col, Statistic 
} from 'antd';
import { 
  SearchOutlined, DeleteOutlined, EditOutlined,
  EyeOutlined, ReloadOutlined, ThunderboltOutlined, DesktopOutlined,
  HistoryOutlined, CalendarOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { warehouseDeviceAPI } from '../../api/warehouseDeviceAPI';
import WarehouseDeviceForm from '../../components/WarehouseDeviceForm/WarehouseDeviceForm';
import InstallDeviceModal from '../../components/InstallDeviceModal/InstallDeviceModal';
import OutOfWarehouseModal from '../../components/OutOfWarehouseModal/OutOfWarehouseModal';
import WarehouseDeviceHistory from '../../components/WarehouseDeviceHistory/WarehouseDeviceHistory';
import './WarehouseDevice.css';

const { Option } = Select;

const WarehouseDevice = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const searchDebounceRef = useRef(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [editingDevice, setEditingDevice] = useState(null);
  const [installModalVisible, setInstallModalVisible] = useState(false);
  const [outModalVisible, setOutModalVisible] = useState(false);
  const [historyDrawerVisible, setHistoryDrawerVisible] = useState(false);
  const [selectedDeviceForHistory, setSelectedDeviceForHistory] = useState(null);
  const [selectedDeviceForInstall, setSelectedDeviceForInstall] = useState(null);
  const [selectedDeviceForOut, setSelectedDeviceForOut] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedDeviceForDetail, setSelectedDeviceForDetail] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [deviceTypeFilter, setDeviceTypeFilter] = useState('all');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [suppliers, setSuppliers] = useState([]);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 15,
    total: 0
  });
  const { current, pageSize } = pagination;

  // 设备类型映射
  const deviceTypeMap = {
    'server': { label: '服务器', color: 'blue', icon: <DesktopOutlined /> },
    'switch': { label: '交换机', color: 'green', icon: <DesktopOutlined /> },
    'router': { label: '路由器', color: 'orange', icon: <DesktopOutlined /> },
    'firewall': { label: '防火墙', color: 'red', icon: <DesktopOutlined /> },
    'storage': { label: '存储设备', color: 'purple', icon: <DesktopOutlined /> },
    'ups': { label: 'UPS', color: 'gold', icon: <ThunderboltOutlined /> },
    'pdu': { label: 'PDU', color: 'cyan', icon: <ThunderboltOutlined /> },
    'other': { label: '其他', color: 'default', icon: <DesktopOutlined /> }
  };

  // 状态映射
  const statusMap = {
    'in_warehouse': { label: '在库', color: 'blue' },
    'installed': { label: '已上架', color: 'green' },
    'out_of_warehouse': { label: '已出库', color: 'orange' }
  };

  /**
   * 获取仓库设备数据（支持后端搜索，跨页）
   */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: current,
        page_size: pageSize
      };

      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }

      if (deviceTypeFilter !== 'all') {
        params.device_type = deviceTypeFilter;
      }

      if (supplierFilter !== 'all') {
        params.supplier = supplierFilter;
      }

      if ((searchText || '').trim()) {
        params.search = searchText.trim();
      }

      const response = await warehouseDeviceAPI.getWarehouseDevices(params);
      const data = response.data.results || response.data || [];
      
      setDevices(data);
      setPagination(prev => ({
        ...prev,
        total: response.data.count || data.length
      }));

      // 提取供货方列表（当前结果中的供货方，用于筛选下拉）
      const uniqueSuppliers = [...new Set(data.map(d => d.supplier).filter(Boolean))];
      setSuppliers(uniqueSuppliers);
    } catch (error) {
      message.error('获取仓库设备列表失败');
    } finally {
      setLoading(false);
    }
  }, [
    current,
    deviceTypeFilter,
    pageSize,
    searchText,
    statusFilter,
    supplierFilter,
  ]);

  // 加载数据（分页、筛选、搜索变化时请求，搜索走后端跨页）
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /**
   * 搜索输入（300ms 防抖，后端筛选跨页）
   * @param {React.ChangeEvent<HTMLInputElement>} e
   */
  const onSearchInputChange = (e) => {
    const v = e.target.value || '';
    setSearchInput(v);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setSearchText(v);
      setPagination(prev => ({ ...prev, current: 1 }));
    }, 300);
  };

  /**
   * 跳转到新增事件页面（设备入库）
   */
  const handleAddEvent = () => {
    // 跳转到事件创建页面，并传递事件类型参数
    navigate('/event/create?event_type=device_to_warehouse');
  };

  /**
   * 打开编辑设备模态框
   * @param {Object} record - 设备记录
   */
  const handleEdit = (record) => {
    setEditingDevice(record);
    setModalTitle('编辑仓库设备');
    setIsModalVisible(true);
  };

  /**
   * 删除设备
   * @param {number} id - 设备ID
   */
  const handleDelete = async (id) => {
    try {
      await warehouseDeviceAPI.deleteWarehouseDevice(id);
      message.success('设备删除成功');
      fetchData();
    } catch (error) {
      message.error('设备删除失败');
    }
  };

  /**
   * 打开上架模态框
   * @param {Object} record - 设备记录
   */
  const handleInstall = (record) => {
    if (record.status !== 'in_warehouse') {
      message.warning('该设备不在仓库中，无法上架');
      return;
    }
    setSelectedDeviceForInstall(record);
    setInstallModalVisible(true);
  };

  /**
   * 打开出库模态框
   * @param {Object} record - 设备记录
   */
  const handleOut = (record) => {
    if (record.status !== 'in_warehouse') {
      message.warning('该设备不在仓库中，无法出库');
      return;
    }
    setSelectedDeviceForOut(record);
    setOutModalVisible(true);
  };

  /**
   * 查看历史记录
   * @param {Object} record - 设备记录
   */
  const handleViewHistory = (record) => {
    setSelectedDeviceForHistory(record);
    setHistoryDrawerVisible(true);
  };

  /**
   * 打开详情弹窗
   */
  const handleViewDetail = (record) => {
    setSelectedDeviceForDetail(record);
    setDetailModalVisible(true);
  };

  /**
   * 表格列定义
   */
  const columns = [
    {
      title: '设备类型',
      dataIndex: 'device_type',
      key: 'device_type',
      width: 130,
      render: (type) => {
        const typeInfo = deviceTypeMap[type] || deviceTypeMap['other'];
        return (
          <Tag color={typeInfo.color}>
            {typeInfo.icon} {typeInfo.label}
          </Tag>
        );
      }
    },
    {
      title: '序列号',
      dataIndex: 'sn',
      key: 'sn',
      width: 170,
      ellipsis: {
        showTitle: false,
      },
      render: (text) => (
        <span title={text}>{text}</span>
      )
    },
    {
      title: '供货方',
      dataIndex: 'supplier',
      key: 'supplier',
      width: 180,
      ellipsis: {
        showTitle: false,
      },
      render: (text) => (
        <span title={text || '-'}>{text || '-'}</span>
      )
    },
    {
      title: '代收事件',
      key: 'events',
      width: 220,
      ellipsis: {
        showTitle: false,
      },
      render: (_, record) => {
        // 从related_events获取事件详情（包含订单号）
        const events = record.related_events || [];
        // 从events字段获取关联事件ID（备用）
        const eventIds = record.events || [];
        
        // 优先使用related_events，如果为空则使用eventIds
        let displayText = '-';
        if (events.length > 0) {
          // 显示第一个事件的订单号
          const firstEvent = events[0];
          const orderNumber = firstEvent.order_number || firstEvent.id || '-';
          if (events.length === 1) {
            displayText = orderNumber;
          } else {
            displayText = `${orderNumber} (共${events.length}个事件)`;
          }
        } else if (eventIds.length > 0) {
          // 如果只有事件ID，尝试显示ID（临时方案，应该通过API获取详情）
          displayText = eventIds[0] || `已关联${eventIds.length}个事件`;
        }
        
        return (
          <span title={displayText}>{displayText}</span>
        );
      }
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right',
      width: 110,
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => handleViewDetail(record)}
        >
          详细信息
        </Button>
      )
    }
  ];

  // 统计数据
  const stats = {
    total: devices.length,
    inWarehouse: devices.filter(d => d.status === 'in_warehouse').length,
    installed: devices.filter(d => d.status === 'installed').length,
    outOfWarehouse: devices.filter(d => d.status === 'out_of_warehouse').length
  };

  return (
    <div className="warehouse-device-page">
      <Card>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Statistic title="总设备数" value={stats.total} />
          </Col>
          <Col span={6}>
            <Statistic title="在库" value={stats.inWarehouse} valueStyle={{ color: '#1890ff' }} />
          </Col>
          <Col span={6}>
            <Statistic title="已上架" value={stats.installed} valueStyle={{ color: '#52c41a' }} />
          </Col>
          <Col span={6}>
            <Statistic title="已出库" value={stats.outOfWarehouse} valueStyle={{ color: '#faad14' }} />
          </Col>
        </Row>

        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Input
              placeholder="搜索品牌、型号、SN、供货方（跨页）"
              prefix={<SearchOutlined />}
              value={searchInput}
              onChange={onSearchInputChange}
              allowClear
            />
          </Col>
          <Col span={4}>
            <Select
              placeholder="筛选状态"
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: '100%' }}
              allowClear
            >
              <Option value="all">全部状态</Option>
              <Option value="in_warehouse">在库</Option>
              <Option value="installed">已上架</Option>
              <Option value="out_of_warehouse">已出库</Option>
            </Select>
          </Col>
          <Col span={4}>
            <Select
              placeholder="筛选设备类型"
              value={deviceTypeFilter}
              onChange={setDeviceTypeFilter}
              style={{ width: '100%' }}
              allowClear
            >
              <Option value="all">全部类型</Option>
              {Object.entries(deviceTypeMap).map(([value, info]) => (
                <Option key={value} value={value}>
                  {info.label}
                </Option>
              ))}
            </Select>
          </Col>
          <Col span={4}>
            <Select
              placeholder="筛选供货方"
              value={supplierFilter}
              onChange={setSupplierFilter}
              style={{ width: '100%' }}
              allowClear
            >
              <Option value="all">全部供货方</Option>
              {suppliers.map(supplier => (
                <Option key={supplier} value={supplier}>
                  {supplier}
                </Option>
              ))}
            </Select>
          </Col>
          <Col span={6}>
            <Space>
              <Button
                type="primary"
                icon={<CalendarOutlined />}
                onClick={handleAddEvent}
              >
                新增事件
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={fetchData}
              >
                刷新
              </Button>
            </Space>
          </Col>
        </Row>

        <Table
          columns={columns}
          dataSource={devices}
          loading={loading}
          rowKey="id"
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条记录`,
            onChange: (page, pageSize) => {
              setPagination(prev => ({
                ...prev,
                current: page,
                pageSize: pageSize
              }));
            }
          }}
          scroll={{ x: 810 }}
        />
      </Card>

      {/* 添加/编辑设备模态框 */}
      <Modal
        title={modalTitle}
        open={isModalVisible}
        onCancel={() => {
          setIsModalVisible(false);
          setEditingDevice(null);
        }}
        footer={null}
        width={800}
      >
        <WarehouseDeviceForm
          initialValues={editingDevice}
          isEdit={!!editingDevice}
          onFinish={() => {
            setIsModalVisible(false);
            setEditingDevice(null);
            fetchData();
          }}
          onCancel={() => {
            setIsModalVisible(false);
            setEditingDevice(null);
          }}
        />
      </Modal>

      {/* 上架设备模态框 */}
      <InstallDeviceModal
        visible={installModalVisible}
        warehouseDevice={selectedDeviceForInstall}
        onFinish={() => {
          setInstallModalVisible(false);
          setSelectedDeviceForInstall(null);
          fetchData();
        }}
        onCancel={() => {
          setInstallModalVisible(false);
          setSelectedDeviceForInstall(null);
        }}
      />

      {/* 出库设备模态框 */}
      <OutOfWarehouseModal
        visible={outModalVisible}
        warehouseDevice={selectedDeviceForOut}
        onFinish={() => {
          setOutModalVisible(false);
          setSelectedDeviceForOut(null);
          fetchData();
        }}
        onCancel={() => {
          setOutModalVisible(false);
          setSelectedDeviceForOut(null);
        }}
      />

      {/* 历史记录抽屉 */}
      <Drawer
        title="设备历史记录"
        placement="right"
        width={800}
        open={historyDrawerVisible}
        onClose={() => {
          setHistoryDrawerVisible(false);
          setSelectedDeviceForHistory(null);
        }}
      >
        {selectedDeviceForHistory && (
          <WarehouseDeviceHistory warehouseDeviceId={selectedDeviceForHistory.id} />
        )}
      </Drawer>

      {/* 详细信息弹窗 */}
      <Modal
        title="设备详细信息"
        open={detailModalVisible}
        onCancel={() => {
          setDetailModalVisible(false);
          setSelectedDeviceForDetail(null);
        }}
        footer={null}
        width={680}
      >
        {selectedDeviceForDetail && (
          <div>
            <Row gutter={[16, 12]}>
              <Col span={12}>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ color: '#666', fontSize: '12px', marginBottom: 4 }}>品牌</div>
                  <div style={{ fontSize: '14px' }}>{selectedDeviceForDetail.brand || '-'}</div>
                </div>
              </Col>
              <Col span={12}>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ color: '#666', fontSize: '12px', marginBottom: 4 }}>型号</div>
                  <div style={{ fontSize: '14px' }}>{selectedDeviceForDetail.model || '-'}</div>
                </div>
              </Col>
              <Col span={12}>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ color: '#666', fontSize: '12px', marginBottom: 4 }}>序列号</div>
                  <div style={{ fontSize: '14px' }}>{selectedDeviceForDetail.sn || '-'}</div>
                </div>
              </Col>
              <Col span={12}>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ color: '#666', fontSize: '12px', marginBottom: 4 }}>U数</div>
                  <div style={{ fontSize: '14px' }}>{selectedDeviceForDetail.u_size || '-'}</div>
                </div>
              </Col>
              <Col span={12}>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ color: '#666', fontSize: '12px', marginBottom: 4 }}>电源类型</div>
                  <div style={{ fontSize: '14px' }}>{selectedDeviceForDetail.power_type === 'single' ? '单电源' : '双电源'}</div>
                </div>
              </Col>
              <Col span={12}>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ color: '#666', fontSize: '12px', marginBottom: 4 }}>电源瓦数</div>
                  <div style={{ fontSize: '14px' }}>{selectedDeviceForDetail.power_wattage ? `${selectedDeviceForDetail.power_wattage}W` : '-'}</div>
                </div>
              </Col>
              <Col span={12}>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ color: '#666', fontSize: '12px', marginBottom: 4 }}>设备类型</div>
                  <div style={{ fontSize: '14px' }}>
                    {(() => {
                      const typeInfo = deviceTypeMap[selectedDeviceForDetail.device_type] || deviceTypeMap['other'];
                      return (
                        <Tag color={typeInfo.color}>
                          {typeInfo.icon} {typeInfo.label}
                        </Tag>
                      );
                    })()}
                  </div>
                </div>
              </Col>
              <Col span={12}>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ color: '#666', fontSize: '12px', marginBottom: 4 }}>供货方</div>
                  <div style={{ fontSize: '14px' }}>{selectedDeviceForDetail.supplier || '-'}</div>
                </div>
              </Col>
              <Col span={12}>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ color: '#666', fontSize: '12px', marginBottom: 4 }}>入库时间</div>
                  <div style={{ fontSize: '14px' }}>{selectedDeviceForDetail.collection_time ? dayjs(selectedDeviceForDetail.collection_time).format('YYYY-MM-DD HH:mm:ss') : '-'}</div>
                </div>
              </Col>
              <Col span={12}>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ color: '#666', fontSize: '12px', marginBottom: 4 }}>仓库位置</div>
                  <div style={{ fontSize: '14px' }}>{selectedDeviceForDetail.warehouse_location || '-'}</div>
                </div>
              </Col>
              <Col span={12}>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ color: '#666', fontSize: '12px', marginBottom: 4 }}>状态</div>
                  <div style={{ fontSize: '14px' }}>
                    {(() => {
                      const statusInfo = statusMap[selectedDeviceForDetail.status] || statusMap['in_warehouse'];
                      return <Tag color={statusInfo.color}>{statusInfo.label}</Tag>;
                    })()}
                  </div>
                </div>
              </Col>
              <Col span={24}>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ color: '#666', fontSize: '12px', marginBottom: 4 }}>代收事件</div>
                  <div style={{ fontSize: '14px' }}>
                    {(() => {
                      const events = selectedDeviceForDetail.related_events || [];
                      const eventIds = selectedDeviceForDetail.events || [];
                      
                      if (events.length === 0 && eventIds.length === 0) {
                        return '-';
                      }
                      
                      if (events.length > 0) {
                        return (
                          <div style={{ marginTop: 4 }}>
                            {events.map((event, index) => (
                              <Tag key={event.id || index} style={{ marginBottom: 4, marginRight: 4 }}>
                                {event.order_number || event.id || '-'}
                              </Tag>
                            ))}
                          </div>
                        );
                      }
                      
                      // 如果只有事件ID，显示ID列表
                      if (eventIds.length > 0) {
                        return (
                          <div style={{ marginTop: 4 }}>
                            {eventIds.map((eventId, index) => (
                              <Tag key={eventId || index} style={{ marginBottom: 4, marginRight: 4 }}>
                                事件ID: {eventId}
                              </Tag>
                            ))}
                          </div>
                        );
                      }
                      
                      return '-';
                    })()}
                  </div>
                </div>
              </Col>
              <Col span={24}>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ color: '#666', fontSize: '12px', marginBottom: 4 }}>备注</div>
                  <div style={{ marginTop: 4, padding: 12, background: '#f5f5f5', borderRadius: 4, minHeight: 50, fontSize: '14px', lineHeight: '1.6' }}>
                    {selectedDeviceForDetail.notes || '-'}
                  </div>
                </div>
              </Col>
            </Row>
            
            {/* 操作按钮区域 */}
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
              <Space size="small" wrap>
                <Button
                  size="small"
                  icon={<HistoryOutlined />}
                  onClick={() => {
                    setDetailModalVisible(false);
                    handleViewHistory(selectedDeviceForDetail);
                  }}
                >
                  历史
                </Button>
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => {
                    setDetailModalVisible(false);
                    handleEdit(selectedDeviceForDetail);
                  }}
                >
                  编辑
                </Button>
                {selectedDeviceForDetail.status === 'in_warehouse' && (
                  <>
                    <Button
                      size="small"
                      type="primary"
                      onClick={() => {
                        setDetailModalVisible(false);
                        handleInstall(selectedDeviceForDetail);
                      }}
                    >
                      上架
                    </Button>
                    <Button
                      size="small"
                      danger
                      onClick={() => {
                        setDetailModalVisible(false);
                        handleOut(selectedDeviceForDetail);
                      }}
                    >
                      出库
                    </Button>
                  </>
                )}
                <Popconfirm
                  title="确定要删除这个设备吗？"
                  onConfirm={() => {
                    handleDelete(selectedDeviceForDetail.id);
                    setDetailModalVisible(false);
                    setSelectedDeviceForDetail(null);
                  }}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                  >
                    删除
                  </Button>
                </Popconfirm>
                <Button
                  size="small"
                  onClick={() => {
                    setDetailModalVisible(false);
                    setSelectedDeviceForDetail(null);
                  }}
                >
                  关闭
                </Button>
              </Space>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default WarehouseDevice;
