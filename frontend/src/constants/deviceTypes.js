import { DesktopOutlined, ThunderboltOutlined } from '@ant-design/icons';

/**
 * 设备类型映射配置
 * 提取到常量文件中，避免每次渲染都重新创建
 */
export const DEVICE_TYPE_MAP = {
  'server': { label: '服务器', color: 'blue', icon: <DesktopOutlined /> },
  'switch': { label: '交换机', color: 'green', icon: <DesktopOutlined /> },
  'router': { label: '路由器', color: 'orange', icon: <DesktopOutlined /> },
  'firewall': { label: '防火墙', color: 'red', icon: <DesktopOutlined /> },
  'storage': { label: '存储设备', color: 'purple', icon: <DesktopOutlined /> },
  'ups': { label: 'UPS', color: 'gold', icon: <ThunderboltOutlined /> },
  'pdu': { label: 'PDU', color: 'cyan', icon: <ThunderboltOutlined /> },
  'other': { label: '其他', color: 'default', icon: <DesktopOutlined /> }
};

/**
 * 设备类型选项数组
 * 用于表单选择器
 */
export const DEVICE_TYPE_OPTIONS = Object.entries(DEVICE_TYPE_MAP).map(([key, value]) => ({
  value: key,
  label: value.label,
  icon: value.icon
})); 