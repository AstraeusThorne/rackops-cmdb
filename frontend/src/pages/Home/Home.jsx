import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Row, 
  Col, 
  Statistic, 
  Button, 
  Spin, 
  Progress, 
  List, 
  Table, 
  Tag, 
  Modal, 
  Descriptions,
  message
} from 'antd';
import { 
  DesktopOutlined, 
  CalendarOutlined, 
  BankOutlined, 
  AlertOutlined,
  UserOutlined,
  ArrowDownOutlined,
  EyeOutlined,
  HddOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { 
  deviceAPI, 
  eventAPI, 
  roomAPI, 
  clientAPI, 
  decommissionedDeviceAPI, 
  deviceAlertAPI 
} from '../../api';
import styles from './Home.module.css';

/**
 * 首页组件
 * @returns {JSX.Element} 首页组件
 */
const Home = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  
  // 统计数据状态
  const [stats, setStats] = useState({
    devices: 0,
    events: 0,
    rooms: 0,
    clients: 0,
    cabinets: 0,
    alerts: 0,
    decommissioned: 0
  });
  
  // 最近事件状态
  const [events, setEvents] = useState([]);
  
  // 机房使用情况状态
  const [rooms, setRooms] = useState([]);
  
  // 事件详情弹窗状态
  const [eventDetailVisible, setEventDetailVisible] = useState(false);
  const [currentEvent, setCurrentEvent] = useState(null);

  // 获取首页数据（优化：用后端机房统计接口 + 最近事件仅拉 5 条，避免全量拉取导致慢且统计不全）
  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        // 并行请求：不再使用 getAllEvents / getAllCabinets，改用 usage-stats 与分页事件
        const [
          devicesRes,
          eventsRes,
          roomsRes,
          roomUsageRes,
          clientsRes,
          decommissionedRes,
          alertsRes
        ] = await Promise.all([
          deviceAPI.getDevices({ page_size: 1 }),
          eventAPI.getEvents({ page_size: 5, ordering: '-date' }),
          roomAPI.getRooms(),
          roomAPI.getRoomUsageStats(),
          clientAPI.getClients(),
          decommissionedDeviceAPI.getDecommissionedDevices(),
          deviceAlertAPI.getDeviceAlerts()
        ]);

        // 筛选出活跃的告警（未处理的告警）
        const alertsData = alertsRes.data.results || alertsRes.data || [];
        const activeAlerts = alertsData.filter(alert =>
          alert.status === 'active' || alert.status === 'acknowledged'
        );

        // 事件：本次只拉 5 条，总数用后端 count
        const eventsList = eventsRes.data.results || eventsRes.data || [];
        const eventsTotalCount = eventsRes.data.count ?? eventsList.length;

        // 机柜总数：由机房使用情况汇总得出，避免全量拉取机柜列表
        const roomUsageList = Array.isArray(roomUsageRes.data) ? roomUsageRes.data : [];
        const totalCabinets = roomUsageList.reduce((sum, r) => sum + (r.cabinetCount || 0), 0);

        const devicesList = devicesRes.data.results || devicesRes.data || [];
        const decommissionedList = decommissionedRes.data.results || decommissionedRes.data || [];
        setStats({
          devices: devicesRes.data.count ?? devicesList.length,
          events: eventsTotalCount,
          rooms: (roomsRes.data.results || roomsRes.data || []).length,
          clients: (clientsRes.data.results || clientsRes.data || []).length,
          cabinets: totalCabinets,
          alerts: activeAlerts.length,
          decommissioned: decommissionedRes.data.count ?? decommissionedList.length
        });

        setEvents(eventsList);

        // 机房使用情况：直接使用后端聚合结果（统计全量，字段已统一为 camelCase）
        const roomsWithDetails = roomUsageList.map(r => ({
          id: r.id,
          name: r.name,
          cabinetCount: r.cabinetCount ?? 0,
          usedCabinetsCount: r.usedCabinetsCount ?? 0,
          deviceCount: r.deviceCount ?? 0,
          usageRate: r.usageRate ?? 0
        }));
        setRooms(roomsWithDetails);
      } catch (error) {
        console.error("获取首页数据失败:", error);
        message.error("获取首页数据失败，请刷新页面重试");
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  // 加载事件详情数据
  const handleViewEventDetail = async (event) => {
    try {
      // 如果需要获取事件的更多详情，可以调用API
      const eventDetailRes = await eventAPI.getEvent(event.id);
      setCurrentEvent(eventDetailRes.data);
      setEventDetailVisible(true);
    } catch (error) {
      console.error("获取事件详情失败:", error);
      message.error("获取事件详情失败");
    }
  };

  // 最近事件的列定义
  const eventColumns = [
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      width: 120,
    },
    {
      title: '订单号',
      dataIndex: 'order_number',
      key: 'order_number',
      width: 150,
      render: text => text || '无订单号'
    },
    {
      title: '时间段',
      key: 'time',
      width: 150,
      render: (_, record) => `${record.start_time} - ${record.end_time}`
    },
    {
      title: '状态',
      dataIndex: 'completion_status',
      key: 'status',
      width: 100,
      render: status => (
        <Tag color={status ? 'success' : 'processing'}>
          {status ? '已完成' : '进行中'}
        </Tag>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Button 
          type="link" 
          icon={<EyeOutlined />}
          onClick={() => handleViewEventDetail(record)}
        >
          查看详情
        </Button>
      )
    }
  ];

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Spin size="large" />
        <p>加载中...</p>
      </div>
    );
  }

  return (
    <div className={styles.homeContainer}>
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <div className={styles.welcome}>
            <h1>CMDB系统</h1>
            <p>欢迎使用配置管理数据库系统，您可以在此管理设备、事件、机房等资源。</p>
          </div>
        </Col>
      </Row>

      {/* 快捷操作区域 */}
      <Row gutter={[16, 16]} style={{ marginBottom: '16px' }}>
        <Col span={24}>
          <Card 
            title="快捷操作"
            className={styles.shortcutCard}
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12} md={6}>
                <div 
                  className={styles.shortcutItem} 
                  onClick={() => navigate('/event/create')}
                  style={{ background: 'linear-gradient(135deg, #1890ff, #096dd9)' }}
                >
                  <div className={styles.shortcutIcon}>
                    <CalendarOutlined />
                  </div>
                  <div className={styles.shortcutContent}>
                    <div className={styles.shortcutTitle}>新增事件</div>
                    <div className={styles.shortcutDesc}>创建新的进出事件记录</div>
                  </div>
                </div>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <div 
                  className={styles.shortcutItem}
                  onClick={() => navigate('/device')}
                  style={{ background: 'linear-gradient(135deg, #52c41a, #389e0d)' }}
                >
                  <div className={styles.shortcutIcon}>
                    <DesktopOutlined />
                  </div>
                  <div className={styles.shortcutContent}>
                    <div className={styles.shortcutTitle}>管理设备</div>
                    <div className={styles.shortcutDesc}>查看和管理在用设备</div>
                  </div>
                </div>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <div 
                  className={styles.shortcutItem}
                  onClick={() => navigate('/event/entry-personnel')}
                  style={{ background: 'linear-gradient(135deg, #722ed1, #531dab)' }}
                >
                  <div className={styles.shortcutIcon}>
                    <UserOutlined />
                  </div>
                  <div className={styles.shortcutContent}>
                    <div className={styles.shortcutTitle}>进场人员</div>
                    <div className={styles.shortcutDesc}>管理人员进出记录</div>
                  </div>
                </div>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <div 
                  className={styles.shortcutItem}
                  onClick={() => navigate('/backoffice')}
                  style={{ background: 'linear-gradient(135deg, #fa8c16, #d46b08)' }}
                >
                  <div className={styles.shortcutIcon}>
                    <BankOutlined />
                  </div>
                  <div className={styles.shortcutContent}>
                    <div className={styles.shortcutTitle}>系统管理</div>
                    <div className={styles.shortcutDesc}>基础配置与系统设置</div>
                  </div>
                </div>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
      
      {/* 统计卡片 */}
      <Row gutter={[16, 16]} className={styles.statsRow}>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card className={styles.statCard}>
            <Statistic 
              title="设备总数" 
              value={stats.devices} 
              prefix={<DesktopOutlined />} 
              valueStyle={{ color: '#3f8600' }}
            />
            <div className={styles.cardFooter}>
              <Button type="link" onClick={() => navigate('/device')}>
                查看详情
              </Button>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card className={styles.statCard}>
            <Statistic 
              title="下架设备" 
              value={stats.decommissioned} 
              prefix={<ArrowDownOutlined />}
              valueStyle={{ color: '#cf1322' }}
            />
            <div className={styles.cardFooter}>
              <Button type="link" onClick={() => navigate('/decommissioned-device')}>
                查看详情
              </Button>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card className={styles.statCard}>
            <Statistic 
              title="告警数量" 
              value={stats.alerts} 
              prefix={<AlertOutlined />}
              valueStyle={{ color: '#cf1322' }}
            />
            <div className={styles.cardFooter}>
              <Button type="link" onClick={() => navigate('/device-alert')}>
                查看详情
              </Button>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card className={styles.statCard}>
            <Statistic 
              title="事件数量" 
              value={stats.events} 
              prefix={<CalendarOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
            <div className={styles.cardFooter}>
              <Button type="link" onClick={() => navigate('/event/list')}>
                查看详情
              </Button>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card className={styles.statCard}>
            <Statistic 
              title="机柜数量" 
              value={stats.cabinets} 
              prefix={<HddOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
            <div className={styles.cardFooter}>
              <Button type="link" onClick={() => navigate('/backoffice/cabinet')}>
                查看详情
              </Button>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <Card className={styles.statCard}>
            <Statistic 
              title="机房数量" 
              value={stats.rooms} 
              prefix={<BankOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
            <div className={styles.cardFooter}>
              <Button type="link" onClick={() => navigate('/backoffice/room')}>
                查看详情
              </Button>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: '16px' }}>
        {/* 机房使用情况 */}
        <Col xs={24} lg={12}>
          <Card 
            title={
              <div className={styles.cardTitle}>
                <BankOutlined /> 机房使用情况
              </div>
            }
            className={styles.roomCard}
          >
            {rooms.length > 0 ? (
              <List
                dataSource={rooms}
                renderItem={room => (
                  <List.Item key={room.id}>
                    <List.Item.Meta
                      title={room.name}
                      description={
                        <div>
                          机柜状态: {room.usedCabinetsCount} / {room.cabinetCount} (使用/总数) | 
                          设备数量: {room.deviceCount}
                        </div>
                      }
                    />
                    <div>
                      <Progress 
                        percent={Math.round(room.usageRate)} 
                        size="small" 
                        status={
                          room.usageRate < 50 
                            ? "normal" 
                            : room.usageRate < 80 
                              ? "active" 
                              : "exception"
                        }
                        format={percent => `${percent}% 已使用`}
                      />
                    </div>
                  </List.Item>
                )}
              />
            ) : (
              <div className={styles.emptyData}>暂无机房数据</div>
            )}
            <div className={styles.cardFooter} style={{ marginTop: '16px' }}>
              <Button 
                type="primary" 
                onClick={() => navigate('/backoffice/room')}
                disabled={rooms.length === 0}
              >
                查看机房详情
              </Button>
            </div>
          </Card>
        </Col>

        {/* 最近事件 */}
        <Col xs={24} lg={12}>
          <Card 
            title={
              <div className={styles.cardTitle}>
                <CalendarOutlined /> 最近事件
              </div>
            }
            className={styles.eventsCard}
          >
            <Table 
              dataSource={events} 
              columns={eventColumns}
              rowKey="id"
              pagination={false}
              size="small"
              locale={{ emptyText: '暂无事件数据' }}
            />
            <div className={styles.cardFooter} style={{ marginTop: '16px' }}>
              <Button 
                type="primary" 
                onClick={() => navigate('/event/list')}
                disabled={events.length === 0}
              >
                查看所有事件
              </Button>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 事件详情弹窗 */}
      <Modal
        title="事件详情"
        open={eventDetailVisible}
        onCancel={() => setEventDetailVisible(false)}
        footer={[
          <Button key="close" onClick={() => setEventDetailVisible(false)}>
            关闭
          </Button>,
          <Button 
            key="edit" 
            type="primary" 
            onClick={() => {
              setEventDetailVisible(false);
              navigate(`/event/edit/${currentEvent?.id}`);
            }}
          >
            编辑事件
          </Button>
        ]}
        width={700}
        className={styles.eventDetailModal}
      >
        {currentEvent && (
          <Descriptions bordered column={2}>
            <Descriptions.Item label="订单号" span={2}>
              {currentEvent.order_number || '无订单号'}
            </Descriptions.Item>
            <Descriptions.Item label="日期">
              {currentEvent.date}
            </Descriptions.Item>
            <Descriptions.Item label="时间">
              {`${currentEvent.start_time} - ${currentEvent.end_time}`}
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={currentEvent.completion_status ? 'success' : 'processing'}>
                {currentEvent.completion_status ? '已完成' : '进行中'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="描述" span={2}>
              {currentEvent.description || '无描述'}
            </Descriptions.Item>
            <Descriptions.Item label="相关客户" span={2}>
              {currentEvent.clients && currentEvent.clients.length > 0 
                ? currentEvent.clients.map(client => client.name || client).join(', ') 
                : '无相关客户'}
            </Descriptions.Item>
            <Descriptions.Item label="相关房间" span={2}>
              {currentEvent.rooms && currentEvent.rooms.length > 0 
                ? currentEvent.rooms.map(room => room.name || room).join(', ') 
                : '无相关房间'}
            </Descriptions.Item>
            <Descriptions.Item label="授权单位" span={2}>
              {currentEvent.authorized_orgs && currentEvent.authorized_orgs.length > 0 
                ? currentEvent.authorized_orgs.map(org => org.name || org).join(', ') 
                : '无授权单位'}
            </Descriptions.Item>
            <Descriptions.Item label="值班人员" span={2}>
              {currentEvent.duty_personnel && currentEvent.duty_personnel.length > 0 
                ? currentEvent.duty_personnel.map(person => person.name || person).join(', ') 
                : '无值班人员'}
            </Descriptions.Item>
            <Descriptions.Item label="进场人员" span={2}>
              {currentEvent.entry_personnel && currentEvent.entry_personnel.length > 0 
                ? currentEvent.entry_personnel.map(person => person.name || person).join(', ') 
                : '无进场人员'}
            </Descriptions.Item>
            <Descriptions.Item label="设备数量" span={2}>
              {currentEvent.devices ? currentEvent.devices.length : 0} 台
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export default Home;