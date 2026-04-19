import React, { useState, useEffect } from 'react';
import { Tooltip, Card, Tag } from 'antd';
import { DesktopOutlined, ThunderboltOutlined } from '@ant-design/icons';
import './RackVisualization.css';

/**
 * 机架位置可视化组件
 * @param {Object} props
 * @param {Array} props.devices - 机柜中的设备列表
 * @param {number} props.selectedPosition - 当前选中的起始位置
 * @param {number} props.selectedUSize - 当前选中的U数
 * @param {Function} props.onPositionSelect - 位置选择回调
 * @param {string} props.cabinetName - 机柜名称
 * @param {boolean} props.readonly - 是否只读模式
 * @param {number} props.currentDeviceId - 当前编辑的设备ID（编辑模式下排除自己）
 */
const RackVisualization = ({ 
  devices = [], 
  selectedPosition, 
  selectedUSize = 1, 
  onPositionSelect,
  cabinetName = '机柜',
  readonly = false,
  currentDeviceId = null
}) => {
  const [occupiedPositions, setOccupiedPositions] = useState(new Map());

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

  // 计算设备占用的位置
  useEffect(() => {
    const occupied = new Map();
    
    devices.forEach(device => {
      // 编辑模式下排除当前设备 - 确保数据类型一致
      if (currentDeviceId && parseInt(device.id, 10) === parseInt(currentDeviceId, 10)) {
        return;
      }

      const position = parseInt(device.rack_position, 10);
      const uSize = parseInt(device.u_size, 10);
      
      if (!isNaN(position) && !isNaN(uSize)) {
        for (let i = 0; i < uSize; i++) {
          const uPosition = position + i;
          if (uPosition >= 1 && uPosition <= 42) {
            occupied.set(uPosition, {
              device,
              isStart: i === 0,
              isEnd: i === uSize - 1,
              partIndex: i + 1,
              totalParts: uSize
            });
          }
        }
      }
    });
    
    setOccupiedPositions(occupied);
  }, [devices, currentDeviceId]);

  // 检查位置是否可选
  const isPositionSelectable = (position) => {
    if (readonly) return false;
    
    // 确保selectedUSize是数字类型
    const selectedSize = selectedUSize ? parseInt(selectedUSize, 10) : 1;
    
    // 检查选中的U数是否会超出边界（例：U42选择2U会超出范围）
    if (position + selectedSize - 1 > 42) return false;
    
    // 检查是否与已占用位置冲突
    // 例：选择U8且selectedSize=2时，需要检查U8和U9是否都空闲
    for (let i = 0; i < selectedSize; i++) {
      if (occupiedPositions.has(position + i)) {
        return false; // 如果任何一个位置被占用，则该起始位置不可选
      }
    }
    
    return true;
  };

  // 获取位置状态
  const getPositionStatus = (position) => {
    const isOccupied = occupiedPositions.has(position);
    
    // 确保selectedPosition和selectedUSize是数字类型
    const selectedPos = selectedPosition ? parseInt(selectedPosition, 10) : null;
    const selectedSize = selectedUSize ? parseInt(selectedUSize, 10) : 1;
    
    const isSelected = selectedPos && position >= selectedPos && position < selectedPos + selectedSize;
    const isConflict = selectedPos && position >= selectedPos && position < selectedPos + selectedSize && isOccupied;
    
    // 修复可选性判断逻辑
    let isSelectable = false;
    if (!readonly && !isOccupied && selectedPos !== position) {
      // 检查从当前位置开始是否有足够的连续空间
      isSelectable = isPositionSelectable(position);
    }

    return {
      isOccupied,
      isSelected,
      isSelectable,
      isConflict,
      device: occupiedPositions.get(position)
    };
  };

  // 处理位置点击
  const handlePositionClick = (position) => {
    if (readonly) return;
    
    if (isPositionSelectable(position)) {
      onPositionSelect && onPositionSelect(position);
    }
  };

  // 渲染单个U位
  const renderUPosition = (uNumber) => {
    const status = getPositionStatus(uNumber);
    const { isOccupied, isSelected, isSelectable, isConflict, device } = status;
    
    let className = 'rack-u-position';
    let content = uNumber;
    let backgroundColor = '#f5f5f5';
    
    if (isOccupied && device) {
      const deviceInfo = device.device;
      const typeInfo = deviceTypeMap[deviceInfo.device_type] || deviceTypeMap['other'];
      className += ' occupied';
      backgroundColor = typeInfo.color === 'default' ? '#d9d9d9' : `var(--ant-${typeInfo.color}-2)`;
      
      // 只在设备的起始位置显示设备信息
      if (device.isStart) {
        content = (
          <div className="device-info">
            <div className="device-icon">{typeInfo.icon}</div>
            <div className="device-name">{deviceInfo.brand}</div>
            <div className="device-model">{deviceInfo.model}</div>
          </div>
        );
      } else {
        content = null; // 非起始位置不显示内容
      }
    } else if (isSelected) {
      className += ' selected';
      backgroundColor = '#1890ff';
      // 修复选中状态的内容显示逻辑
      const selectedPos = selectedPosition ? parseInt(selectedPosition, 10) : null;
      const selectedSize = selectedUSize ? parseInt(selectedUSize, 10) : 1;
      const currentIndex = uNumber - selectedPos;
      
      if (currentIndex === 0) {
        // 起始位置显示"选中"
        content = '选中';
      } else if (currentIndex === selectedSize - 1) {
        // 结束位置显示"结束"
        content = '结束';
      } else {
        // 中间位置显示位置信息
        content = `${currentIndex + 1}/${selectedSize}`;
      }
    } else if (isConflict) {
      className += ' conflict';
      backgroundColor = '#ff4d4f';
    } else if (isSelectable) {
      className += ' selectable';
      backgroundColor = '#52c41a';
    }

    const uPosition = (
      <div
        key={uNumber}
        className={className}
        style={{ 
          backgroundColor,
          color: isSelected || isConflict ? '#fff' : '#000',
          cursor: isSelectable ? 'pointer' : 'default'
        }}
        onClick={() => handlePositionClick(uNumber)}
      >
        <span className="u-number">U{uNumber}</span>
        {content && <div className="u-content">{content}</div>}
      </div>
    );

    // 如果有设备占用，添加 Tooltip 显示详细信息
    if (isOccupied && device && device.isStart) {
      const deviceInfo = device.device;
      const typeInfo = deviceTypeMap[deviceInfo.device_type] || deviceTypeMap['other'];
      
      return (
        <Tooltip
          key={uNumber}
          title={
            <div>
              <div><strong>{deviceInfo.brand} {deviceInfo.model}</strong></div>
              <div>SN: {deviceInfo.sn}</div>
              <div>类型: {typeInfo.label}</div>
              <div>位置: U{deviceInfo.rack_position} ({deviceInfo.u_size}U)</div>
              <div>功率: {deviceInfo.power_wattage}W</div>
              <div>电源: {deviceInfo.power_type === 'single' ? '单电源' : deviceInfo.power_type === 'dual' ? '双电源' : '-'}</div>
            </div>
          }
          placement="right"
        >
          {uPosition}
        </Tooltip>
      );
    }

    return uPosition;
  };

  return (
    <Card 
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{cabinetName}</span>
          <div className="status-indicators">
            <Tag color="green">可选</Tag>
            <Tag color="blue">已选</Tag>
            <Tag color="default">已占用</Tag>
            <Tag color="red">冲突</Tag>
          </div>
        </div>
      }
      size="small"
      className="rack-visualization"
    >
      <div className="rack-container">
        <div className="rack-units">
          {/* 左列：U42-U22 */}
          <div className="rack-column">
            {Array.from({ length: 21 }, (_, index) => 42 - index).map(uNumber => 
              renderUPosition(uNumber)
            )}
          </div>
          
          {/* 右列：U21-U1 */}
          <div className="rack-column">
            {Array.from({ length: 21 }, (_, index) => 21 - index).map(uNumber => 
              renderUPosition(uNumber)
            )}
          </div>
        </div>
      </div>
      
      {selectedPosition && selectedUSize && (
        <div className="selection-info">
          {(() => {
            const selectedPos = parseInt(selectedPosition, 10);
            const selectedSize = parseInt(selectedUSize, 10);
            const endPos = selectedPos + selectedSize - 1;
            return `当前选择: U${selectedPos} - U${endPos} (${selectedSize}U)`;
          })()}
        </div>
      )}
    </Card>
  );
};

export default RackVisualization; 