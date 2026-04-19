import React, { useState, useMemo, useCallback } from 'react';
import { 
  Card, 
  Row, 
  Col, 
  Badge, 
  Tooltip, 
  Pagination, 
  Select, 
  Input, 
  Button, 
  Space,
  Tag,
  Empty,
  Spin
} from 'antd';
import { 
  SearchOutlined, 
  FilterOutlined, 
  ReloadOutlined,
  InfoCircleOutlined,
  ThunderboltOutlined,
  WarningOutlined
} from '@ant-design/icons';
import './CabinetGridView.css';

const { Option } = Select;
const { Search } = Input;

const CabinetGridView = ({ 
  cabinets = [], 
  rooms = [],
  onCabinetClick,
  loading = false,
  pageSize = 24 
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchText, setSearchText] = useState('');
  const [selectedRoom, setSelectedRoom] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('cabinetId');

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

  // 过滤和排序机柜数据
  const filteredAndSortedCabinets = useMemo(() => {
    let filtered = cabinets.filter(cabinet => {
      const matchesSearch = cabinet.cabinetName.toLowerCase().includes(searchText.toLowerCase()) ||
                           cabinet.cabinetId.toLowerCase().includes(searchText.toLowerCase()) ||
                           cabinet.location.toLowerCase().includes(searchText.toLowerCase());
      
      const matchesRoom = selectedRoom === 'all' || cabinet.room === selectedRoom;
      const matchesStatus = statusFilter === 'all' || cabinet.status === statusFilter;
      
      return matchesSearch && matchesRoom && matchesStatus;
    });

    // 排序
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'cabinetId':
          return a.cabinetId.localeCompare(b.cabinetId);
        case 'cabinetName':
          return a.cabinetName.localeCompare(b.cabinetName);
        case 'status':
          return a.status.localeCompare(b.status);
        case 'power':
          return b.total.power - a.total.power;
        case 'current':
          return b.total.current - a.total.current;
        case 'room':
          return a.room.localeCompare(b.room);
        default:
          return 0;
      }
    });

    return filtered;
  }, [cabinets, searchText, selectedRoom, statusFilter, sortBy]);

  // 分页数据
  const paginatedCabinets = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredAndSortedCabinets.slice(startIndex, endIndex);
  }, [filteredAndSortedCabinets, currentPage, pageSize]);

  // 处理搜索
  const handleSearch = useCallback((value) => {
    setSearchText(value);
    setCurrentPage(1);
  }, []);

  // 处理筛选变化
  const handleFilterChange = useCallback((type, value) => {
    if (type === 'room') {
      setSelectedRoom(value);
    } else if (type === 'status') {
      setStatusFilter(value);
    } else if (type === 'sort') {
      setSortBy(value);
    }
    setCurrentPage(1);
  }, []);

  // 重置筛选
  const handleReset = useCallback(() => {
    setSearchText('');
    setSelectedRoom('all');
    setStatusFilter('all');
    setSortBy('cabinetId');
    setCurrentPage(1);
  }, []);

  // 获取机柜状态文本
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

  // 渲染机柜卡片
  const renderCabinetCard = (cabinet) => (
    <Col xs={24} sm={12} md={8} lg={6} xl={4} key={cabinet.cabinetId}>
      <Card
        className={`cabinet-grid-card cabinet-status-${cabinet.status}`}
        hoverable
        onClick={() => onCabinetClick && onCabinetClick(cabinet)}
        size="small"
      >
        <div className="cabinet-card-header">
          <div className="cabinet-id">
            <Badge 
              status={cabinet.status === 'normal' ? 'success' : 
                     cabinet.status === 'warning' ? 'warning' :
                     cabinet.status === 'critical' ? 'error' : 'default'}
              text={cabinet.cabinetId}
            />
          </div>
          <div className="cabinet-status">
            <Tooltip title={`状态: ${getStatusText(cabinet.status)}`}>
              <Tag 
                color={statusColors[cabinet.status]}
                icon={statusIcons[cabinet.status]}
                className="status-tag"
              >
                {getStatusText(cabinet.status)}
              </Tag>
            </Tooltip>
          </div>
        </div>

        <div className="cabinet-card-content">
          <div className="cabinet-name">
            <Tooltip title={cabinet.cabinetName}>
              <span className="cabinet-name-text">{cabinet.cabinetName}</span>
            </Tooltip>
          </div>
          
          <div className="cabinet-location">
            <span className="room-tag">{getRoomName(cabinet.room)}</span>
            <span className="location-text">{cabinet.location}</span>
          </div>

          <div className="cabinet-metrics">
            <div className="metric-item">
              <span className="metric-label">功率:</span>
              <span className="metric-value">{cabinet.total.power.toFixed(1)}kW</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">电流:</span>
              <span className="metric-value">{cabinet.total.current.toFixed(1)}A</span>
            </div>
          </div>

          <div className="cabinet-circuits">
            <div className="circuit-status">
              <span className="circuit-label">A路:</span>
              <Badge 
                status={cabinet.circuitA.status === 'normal' ? 'success' : 'error'}
                text={`${cabinet.circuitA.voltage}V`}
              />
            </div>
            <div className="circuit-status">
              <span className="circuit-label">B路:</span>
              <Badge 
                status={cabinet.circuitB.status === 'normal' ? 'success' : 'error'}
                text={`${cabinet.circuitB.voltage}V`}
              />
            </div>
          </div>
        </div>

        <div className="cabinet-card-footer">
          <span className="last-update">
            更新: {new Date(cabinet.lastUpdate).toLocaleTimeString()}
          </span>
        </div>
      </Card>
    </Col>
  );

  return (
    <div className="cabinet-grid-view">
      {/* 控制栏 */}
      <div className="grid-controls">
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

              <Select
                value={sortBy}
                onChange={(value) => handleFilterChange('sort', value)}
                style={{ width: 120 }}
                size="middle"
              >
                <Option value="cabinetId">机柜ID</Option>
                <Option value="cabinetName">机柜名称</Option>
                <Option value="room">机房</Option>
                <Option value="status">状态</Option>
                <Option value="power">功率</Option>
                <Option value="current">电流</Option>
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
      <div className="grid-stats">
        <Space size="large">
          <span>总计: {filteredAndSortedCabinets.length} 个机柜</span>
          <span>当前页: {paginatedCabinets.length} 个</span>
          <span>正常: {filteredAndSortedCabinets.filter(c => c.status === 'normal').length}</span>
          <span>告警: {filteredAndSortedCabinets.filter(c => c.status === 'warning').length}</span>
          <span>严重: {filteredAndSortedCabinets.filter(c => c.status === 'critical').length}</span>
          <span>离线: {filteredAndSortedCabinets.filter(c => c.status === 'offline').length}</span>
        </Space>
      </div>

      {/* 机柜网格 */}
      <Spin spinning={loading}>
        <div className="cabinet-grid">
          {paginatedCabinets.length > 0 ? (
            <Row gutter={[16, 16]}>
              {paginatedCabinets.map(renderCabinetCard)}
            </Row>
          ) : (
            <Empty 
              description="没有找到匹配的机柜"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}
        </div>
      </Spin>

      {/* 分页 */}
      {filteredAndSortedCabinets.length > pageSize && (
        <div className="grid-pagination">
          <Pagination
            current={currentPage}
            total={filteredAndSortedCabinets.length}
            pageSize={pageSize}
            showSizeChanger
            showQuickJumper
            showTotal={(total, range) => 
              `第 ${range[0]}-${range[1]} 项，共 ${total} 项`
            }
            onChange={(page, size) => {
              setCurrentPage(page);
              if (size !== pageSize) {
                // 如果页面大小改变，重新计算当前页
                setCurrentPage(1);
              }
            }}
            onShowSizeChange={(current, size) => {
              setCurrentPage(1);
            }}
            pageSizeOptions={['12', '24', '48', '96']}
          />
        </div>
      )}
    </div>
  );
};

export default CabinetGridView;

