import React, { useState, useMemo, useCallback } from 'react';
import { 
  Card, 
  Row, 
  Col, 
  Badge, 
  Tooltip, 
  Select, 
  Input, 
  Button, 
  Space,
  Tag,
  Empty,
  Spin,
  Divider,
  Typography
} from 'antd';
import { 
  SearchOutlined, 
  FilterOutlined, 
  ReloadOutlined,
  InfoCircleOutlined,
  ThunderboltOutlined,
  WarningOutlined,
  LayoutOutlined
} from '@ant-design/icons';
import './RoomLayoutView.css';

const { Option } = Select;
const { Search } = Input;
const { Title } = Typography;

const RoomLayoutView = ({ 
  cabinets = [], 
  rooms = [],
  onCabinetClick,
  loading = false
}) => {
  const [searchText, setSearchText] = useState('');
  const [selectedRoom, setSelectedRoom] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState('layout'); // 'layout' 或 'grid'

  // 状态颜色映射
  const statusColors = {
    normal: '#52c41a',
    warning: '#faad14',
    critical: '#ff4d4f',
    offline: '#d9d9d9'
  };

  // 状态图标映射
  const statusIcons = {
    normal: <ThunderboltOutlined />,
    warning: <WarningOutlined />,
    critical: <WarningOutlined />,
    offline: <InfoCircleOutlined />
  };

  // 过滤机柜数据
  const filteredCabinets = useMemo(() => {
    return cabinets.filter(cabinet => {
      const matchesSearch = cabinet.cabinetName.toLowerCase().includes(searchText.toLowerCase()) ||
                           cabinet.cabinetId.toLowerCase().includes(searchText.toLowerCase()) ||
                           cabinet.location.toLowerCase().includes(searchText.toLowerCase());
      
      const matchesRoom = selectedRoom === 'all' || cabinet.room === selectedRoom;
      const matchesStatus = statusFilter === 'all' || cabinet.status === statusFilter;
      
      return matchesSearch && matchesRoom && matchesStatus;
    });
  }, [cabinets, searchText, selectedRoom, statusFilter]);

  // 按机房分组机柜数据
  const groupedCabinets = useMemo(() => {
    const groups = {};
    
    filteredCabinets.forEach(cabinet => {
      if (!groups[cabinet.room]) {
        groups[cabinet.room] = [];
      }
      groups[cabinet.room].push(cabinet);
    });

    // 对每个机房的机柜按ID排序
    Object.keys(groups).forEach(roomId => {
      groups[roomId].sort((a, b) => a.cabinetId.localeCompare(b.cabinetId));
    });

    return groups;
  }, [filteredCabinets]);

  // 按行分组机柜（假设机柜ID格式为 XX-YY，XX为行号，YY为列号）
  const getRowGroupedCabinets = (cabinets) => {
    const rows = {};
    
    cabinets.forEach(cabinet => {
      // 提取行号（格式为 F1B-A01, F1D-B02 等）
      // 从location字段提取排号，格式为 "A区第1排"
      let rowNum = '00'; // 默认排号
      
      if (cabinet.location) {
        const locationMatch = cabinet.location.match(/第(\d+)排/);
        if (locationMatch) {
          rowNum = locationMatch[1].padStart(2, '0');
        }
      }
      
      // 如果location没有排号信息，尝试从cabinetId解析
      if (rowNum === '00') {
        // 尝试匹配 roomId-AreaNumber 格式，如 F1B-A01
        const idMatch = cabinet.cabinetId.match(/^[^-]+-([A-Z])(\d+)$/);
        if (idMatch) {
          const area = idMatch[1];
          const number = parseInt(idMatch[2]);
          // 每6个机柜一排
          rowNum = String(Math.floor((number - 1) / 6) + 1).padStart(2, '0');
        }
      }
      
      if (!rows[rowNum]) {
        rows[rowNum] = [];
      }
      rows[rowNum].push(cabinet);
    });

    // 对每行的机柜按列号排序
    Object.keys(rows).forEach(rowNum => {
      rows[rowNum].sort((a, b) => {
        // 优先按区域排序，然后按编号排序
        const aMatch = a.cabinetId.match(/^[^-]+-([A-Z])(\d+)$/);
        const bMatch = b.cabinetId.match(/^[^-]+-([A-Z])(\d+)$/);
        
        if (aMatch && bMatch) {
          // 先按区域排序
          if (aMatch[1] !== bMatch[1]) {
            return aMatch[1].localeCompare(bMatch[1]);
          }
          // 再按编号排序
          return parseInt(aMatch[2]) - parseInt(bMatch[2]);
        }
        return a.cabinetId.localeCompare(b.cabinetId);
      });
    });

    return rows;
  };

  // 处理搜索
  const handleSearch = useCallback((value) => {
    setSearchText(value);
  }, []);

  // 处理筛选变化
  const handleFilterChange = useCallback((type, value) => {
    if (type === 'room') {
      setSelectedRoom(value);
    } else if (type === 'status') {
      setStatusFilter(value);
    }
  }, []);

  // 重置筛选
  const handleReset = useCallback(() => {
    setSearchText('');
    setSelectedRoom('all');
    setStatusFilter('all');
  }, []);

  // 获取状态文本
  const getStatusText = (status) => {
    const statusMap = {
      normal: '正常',
      warning: '告警',
      critical: '严重',
      offline: '离线'
    };
    return statusMap[status] || status;
  };

  // 获取机房名称
  const getRoomName = (roomId) => {
    const room = rooms.find(r => r.roomId === roomId);
    return room ? room.roomName : roomId;
  };

  // 渲染超小型机柜卡片
  const renderMiniCabinetCard = (cabinet) => (
    <div
      key={cabinet.cabinetId}
      className={`mini-cabinet-card cabinet-status-${cabinet.status}`}
      onClick={() => onCabinetClick && onCabinetClick(cabinet)}
    >
      <Tooltip
        title={
          <div className="cabinet-tooltip">
            <div className="tooltip-header">
              <strong>{cabinet.cabinetName}</strong>
              <Tag 
                color={cabinet.status === 'normal' ? 'green' : 
                       cabinet.status === 'warning' ? 'orange' :
                       cabinet.status === 'critical' ? 'red' : 'default'}
              >
                {getStatusText(cabinet.status)}
              </Tag>
            </div>
            <div className="tooltip-content">
              <div>机柜编号: {cabinet.cabinetId}</div>
              <div>位置: {cabinet.location}</div>
              <div>总功率: {cabinet.total.power.toFixed(1)}kW</div>
              <div>总电流: {cabinet.total.current.toFixed(1)}A</div>
              <div>A路电压: {cabinet.circuitA.voltage}V ({cabinet.circuitA.current.toFixed(1)}A)</div>
              <div>B路电压: {cabinet.circuitB.voltage}V ({cabinet.circuitB.current.toFixed(1)}A)</div>
              <div>更新时间: {cabinet.lastUpdate}</div>
            </div>
          </div>
        }
        placement="top"
        classNames={{ root: "cabinet-detail-tooltip" }}
      >
        <div className="mini-cabinet-content">
          <Badge 
            status={cabinet.status === 'normal' ? 'success' : 
                   cabinet.status === 'warning' ? 'warning' :
                   cabinet.status === 'critical' ? 'error' : 'default'}
            className="cabinet-status-badge"
          />
        </div>
      </Tooltip>
    </div>
  );

  // 渲染机房布局
  const renderRoomLayout = (roomId, cabinets) => {
    const rowGroups = getRowGroupedCabinets(cabinets);
    const sortedRows = Object.keys(rowGroups).sort();

    return (
      <Card 
        key={roomId}
        title={
          <div className="room-header">
            <LayoutOutlined />
            <span className="room-name">{getRoomName(roomId)}</span>
            <Tag color="blue">{cabinets.length} 个机柜</Tag>
          </div>
        }
        className="room-layout-card"
        size="small"
      >
        <div className="room-layout">
          {sortedRows.map(rowNum => (
            <div key={rowNum} className="cabinet-row">
              <div className="row-label">
                第 {parseInt(rowNum) || '其他'} 排
              </div>
              <div className="row-cabinets">
                {rowGroups[rowNum].map(cabinet => renderMiniCabinetCard(cabinet))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  };

  return (
    <div className="room-layout-view">
      {/* 控制栏 */}
      <div className="layout-controls">
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={8}>
            <Search
              placeholder="搜索机柜ID、名称或位置"
              allowClear
              enterButton={<SearchOutlined />}
              size="middle"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onSearch={handleSearch}
            />
          </Col>
          
          <Col xs={24} sm={12} md={16}>
            <Space wrap>
              <Select
                value={selectedRoom}
                onChange={(value) => handleFilterChange('room', value)}
                style={{ width: 120 }}
                size="middle"
              >
                <Option value="all">全部机房</Option>
                {rooms.map(room => (
                  <Option key={room.roomId} value={room.roomId}>
                    {room.roomName}
                  </Option>
                ))}
              </Select>

              <Select
                value={statusFilter}
                onChange={(value) => handleFilterChange('status', value)}
                style={{ width: 100 }}
                size="middle"
              >
                <Option value="all">全部状态</Option>
                <Option value="normal">正常</Option>
                <Option value="warning">告警</Option>
                <Option value="critical">严重</Option>
                <Option value="offline">离线</Option>
              </Select>

              <Button 
                icon={<FilterOutlined />} 
                onClick={handleReset}
                size="middle"
              >
                重置
              </Button>

              <Button 
                icon={<ReloadOutlined />} 
                onClick={() => window.location.reload()}
                size="middle"
              >
                刷新
              </Button>
            </Space>
          </Col>
        </Row>
      </div>

      {/* 统计信息 */}
      <div className="layout-stats">
        <Row gutter={[16, 8]} align="middle">
          <Col xs={12} sm={8} md={4}>
            <div className="stat-item">
              <div className="stat-number">{filteredCabinets.length}</div>
              <div className="stat-label">总机柜</div>
            </div>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <div className="stat-item">
              <div className="stat-number">{Object.keys(groupedCabinets).length}</div>
              <div className="stat-label">机房数</div>
            </div>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <div className="stat-item stat-normal">
              <div className="stat-number">{filteredCabinets.filter(c => c.status === 'normal').length}</div>
              <div className="stat-label">正常</div>
            </div>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <div className="stat-item stat-warning">
              <div className="stat-number">{filteredCabinets.filter(c => c.status === 'warning').length}</div>
              <div className="stat-label">告警</div>
            </div>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <div className="stat-item stat-critical">
              <div className="stat-number">{filteredCabinets.filter(c => c.status === 'critical').length}</div>
              <div className="stat-label">严重</div>
            </div>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <div className="stat-item stat-offline">
              <div className="stat-number">{filteredCabinets.filter(c => c.status === 'offline').length}</div>
              <div className="stat-label">离线</div>
            </div>
          </Col>
        </Row>
      </div>

      {/* 机房布局 */}
      <Spin spinning={loading}>
        <div className="rooms-layout">
          {Object.keys(groupedCabinets).length > 0 ? (
            <div className="rooms-grid">
              {Object.entries(groupedCabinets).map(([roomId, cabinets]) => 
                renderRoomLayout(roomId, cabinets)
              )}
            </div>
          ) : (
            <Empty 
              description="没有找到匹配的机柜"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}
        </div>
      </Spin>
    </div>
  );
};

export default RoomLayoutView;

