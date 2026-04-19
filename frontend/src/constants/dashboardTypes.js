/**
 * 仪表板常量定义
 */

/**
 * 时间范围选项
 */
export const TIME_RANGE_OPTIONS = [
  { value: 'day', label: '日', format: 'YYYY-MM-DD' },
  { value: 'week', label: '周', format: 'YYYY-[W]ww' },
  { value: 'month', label: '月', format: 'YYYY-MM' },
  { value: 'quarter', label: '季度', format: 'YYYY-[Q]Q' },
  { value: 'year', label: '年', format: 'YYYY' }
];

/**
 * 图表颜色配置
 */
export const CHART_COLORS = {
  primary: ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16'],
  gradient: [
    ['#667eea', '#764ba2'],
    ['#f093fb', '#f5576c'],
    ['#4facfe', '#00f2fe'],
    ['#43e97b', '#38f9d7'],
    ['#fa709a', '#fee140'],
    ['#a8edea', '#fed6e3'],
    ['#ff9a9e', '#fecfef'],
    ['#ffecd2', '#fcb69f']
  ],
  status: {
    success: '#52c41a',
    warning: '#faad14',
    error: '#f5222d',
    info: '#1890ff'
  }
};

/**
 * 卡片指标配置
 */
export const DASHBOARD_METRICS = [
  {
    key: 'decommissionedDevices',
    title: '下架设备',
    icon: 'DesktopOutlined',
    color: '#f5222d',
    suffix: '台'
  },
  {
    key: 'activeDevices',
    title: '在用设备',
    icon: 'CheckCircleOutlined',
    color: '#52c41a',
    suffix: '台'
  },
  {
    key: 'totalRooms',
    title: '机房总数',
    icon: 'BankOutlined',
    color: '#722ed1',
    suffix: '个'
  },
  {
    key: 'totalEvents',
    title: '今日事件',
    icon: 'CalendarOutlined',
    color: '#faad14',
    suffix: '件'
  },
  {
    key: 'powerConsumption',
    title: '总功耗',
    icon: 'ThunderboltOutlined',
    color: '#ff7875',
    suffix: 'kW'
  },
  {
    key: 'utilizationRate',
    title: '利用率',
    icon: 'PieChartOutlined',
    color: '#13c2c2',
    suffix: '%'
  }
];

/**
 * 图表类型配置
 */
export const CHART_TYPES = {
  line: 'line',
  bar: 'bar',
  pie: 'pie',
  scatter: 'scatter',
  heatmap: 'heatmap'
}; 