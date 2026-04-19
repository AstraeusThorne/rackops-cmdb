/**
 * Excel运维故事导入组件
 * 支持文件上传、预览、导入、回滚等功能
 */

import React, { useState, useCallback } from 'react';
import {
  Card,
  Upload,
  Button,
  Form,
  Input,
  Switch,
  InputNumber,
  message,
  Table,
  Space,
  Alert,
  Steps,
  Descriptions,
  Modal,
  Typography,
  Divider,
  Tag,
  Select,
  Tooltip
} from 'antd';
import * as XLSX from 'xlsx';
import {
  EyeOutlined,
  PlayCircleOutlined,
  RollbackOutlined,
  FileExcelOutlined,
  InfoCircleOutlined,
  DownloadOutlined
} from '@ant-design/icons';
import operationStoryImportAPI from '../../../../api/operationStoryImportAPI';
import { roomAPI, clientAPI, authorizedOrgAPI, dutyPersonnelAPI } from '../../../../api';
import './DataImport.css';

const { Dragger } = Upload;
const { Text } = Typography;
const { Step } = Steps;

/**
 * 数据导入页面组件
 * @returns {React.ReactElement} 数据导入页面
 */
const DataImport = () => {
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [previewData, setPreviewData] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [batchId, setBatchId] = useState('');
  const [rooms, setRooms] = useState([]);
  const [clients, setClients] = useState([]);
  const [authorizedOrgs, setAuthorizedOrgs] = useState([]);
  const [dutyPersonnel, setDutyPersonnel] = useState([]);
  const [templateDataLoading, setTemplateDataLoading] = useState(false);
  const [rollbackBatchId, setRollbackBatchId] = useState('');
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [importHistory, setImportHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPagination, setHistoryPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });
  const [historyFilter, setHistoryFilter] = useState({
    incremental: undefined, // undefined表示全部，true表示增量导入，false表示全量导入
  });

  /**
   * 生成批次ID
   */
  const generateBatchId = useCallback(() => {
    const now = new Date();
    return `BATCH_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  }, []);

  /**
   * 处理文件上传
   */
  const handleFileChange = ({ fileList: newFileList }) => {
    setFileList(newFileList);
    if (newFileList.length > 0 && !batchId) {
      const newBatchId = generateBatchId();
      setBatchId(newBatchId);
      form.setFieldsValue({ batch_id: newBatchId });
    }
  };

  /**
   * 预览文件
   */
  const handlePreview = async () => {
    if (fileList.length === 0) {
      message.warning('请先上传Excel文件');
      return;
    }

    const file = fileList[0].originFileObj;
    if (!file) {
      message.warning('文件无效');
      return;
    }

    setPreviewLoading(true);
    try {
      const formValues = form.getFieldsValue();
      const options = {
        personnel_sheet: formValues.personnel_sheet || '人员进出',
        install_sheet: formValues.install_sheet || '上架汇总',
        decommission_sheet: formValues.decommission_sheet || '下架汇总',
        batch_id: formValues.batch_id || generateBatchId(),
      };

      const result = await operationStoryImportAPI.uploadFile(file, options);
      
      if (result.success && result.data) {
        setPreviewData(result.data);
        setCurrentStep(1);
        message.success('预览成功');
      } else {
        const err = result.error || '预览失败';
        if (result.errorType === 'ValidationError' || err.length > 80) {
          Modal.error({ title: '预览失败', content: err, width: 560 });
        } else {
          message.error(err);
        }
      }
    } catch (error) {
      console.error('预览失败:', error);
      message.error('预览失败: ' + (error.message || '未知错误'));
    } finally {
      setPreviewLoading(false);
    }
  };

  /**
   * 执行导入
   */
  const handleImport = async () => {
    if (fileList.length === 0) {
      message.warning('请先上传Excel文件');
      return;
    }

    const file = fileList[0].originFileObj;
    if (!file) {
      message.warning('文件无效');
      return;
    }

    setImportLoading(true);
    try {
      const formValues = form.getFieldsValue();
      const options = {
        incremental: formValues.incremental || false,
        personnel_sheet: formValues.personnel_sheet || '人员进出',
        install_sheet: formValues.install_sheet || '上架汇总',
        decommission_sheet: formValues.decommission_sheet || '下架汇总',
        batch_id: formValues.batch_id || generateBatchId(),
        max_rows: formValues.max_rows || null,
      };

      const result = await operationStoryImportAPI.importData(file, options);
      
      if (result.success && result.data) {
        setImportResult(result.data);
        setBatchId(result.data.batch_id || options.batch_id);
        setCurrentStep(2);
        message.success('导入成功');
        // 刷新导入历史
        loadImportHistory(historyPagination.current, historyPagination.pageSize, historyFilter);
      } else {
        const err = result.error || '导入失败';
        if (result.errorType === 'ValidationError' || err.length > 80) {
          Modal.error({ title: '导入失败', content: err, width: 560 });
        } else {
          message.error(err);
        }
      }
    } catch (error) {
      console.error('导入失败:', error);
      message.error('导入失败: ' + (error.message || '未知错误'));
    } finally {
      setImportLoading(false);
    }
  };

  /**
   * 回滚导入（使用当前批次ID）
   */
  const handleRollback = () => {
    if (!batchId) {
      message.warning('没有可回滚的批次ID');
      return;
    }

    Modal.confirm({
      title: '确认回滚',
      content: `确定要回滚批次 ${batchId} 的导入数据吗？此操作不可恢复！`,
      okText: '确认',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        try {
          const result = await operationStoryImportAPI.rollbackImport(batchId);
          if (result.success || result.data?.success) {
            message.success('回滚成功');
            setImportResult(null);
            setPreviewData(null);
            setCurrentStep(0);
            setBatchId('');
            form.resetFields();
            setFileList([]);
          } else {
            message.error(result.error || '回滚失败');
          }
        } catch (error) {
          console.error('回滚失败:', error);
          message.error('回滚失败: ' + (error.message || '未知错误'));
        }
      }
    });
  };

  /**
   * 回滚历史导入（通过输入批次ID）
   */
  const handleRollbackHistory = () => {
    if (!rollbackBatchId || !rollbackBatchId.trim()) {
      message.warning('请输入要回滚的批次ID');
      return;
    }

    Modal.confirm({
      title: '确认回滚历史导入',
      content: (
        <div>
          <p>确定要回滚批次 <strong>{rollbackBatchId}</strong> 的导入数据吗？</p>
          <p style={{ color: '#ff4d4f', marginTop: 8, marginBottom: 0 }}>
            <strong>警告：</strong>此操作将删除该批次导入的所有数据，包括事件记录、设备记录及其关联关系。此操作不可恢复！
          </p>
        </div>
      ),
      okText: '确认回滚',
      cancelText: '取消',
      okType: 'danger',
      width: 500,
      onOk: async () => {
        setRollbackLoading(true);
        try {
          const result = await operationStoryImportAPI.rollbackImport(rollbackBatchId.trim());
          if (result.success || result.data?.success) {
            message.success(`批次 ${rollbackBatchId} 回滚成功`);
            setRollbackBatchId('');
          } else {
            message.error(result.error || result.data?.error || '回滚失败');
          }
        } catch (error) {
          console.error('回滚失败:', error);
          message.error('回滚失败: ' + (error.message || '未知错误'));
        } finally {
          setRollbackLoading(false);
          // 刷新导入历史
          loadImportHistory(historyPagination.current, historyPagination.pageSize, historyFilter);
        }
      }
    });
  };

  /**
   * 重置表单
   */
  const handleReset = () => {
    setCurrentStep(0);
    setPreviewData(null);
    setImportResult(null);
    setBatchId('');
    form.resetFields();
    setFileList([]);
  };

  /**
   * 加载导入历史记录
   */
  const loadImportHistory = useCallback(async (page = 1, pageSize = 10, filter = historyFilter) => {
    setHistoryLoading(true);
    try {
      const params = {
        page,
        page_size: pageSize,
      };
      
      // 添加筛选条件
      if (filter.incremental !== undefined) {
        params.incremental = filter.incremental;
      }
      
      const result = await operationStoryImportAPI.getImportHistory(params);
      if (result.success && result.data) {
        setImportHistory(result.data.results || []);
        setHistoryPagination({
          current: result.data.page || 1,
          pageSize: result.data.page_size || 10,
          total: result.data.count || 0,
        });
      }
    } catch (error) {
      console.error('加载导入历史失败:', error);
    } finally {
      setHistoryLoading(false);
    }
  }, [historyFilter]);

  /**
   * 加载模板所需的数据（机房、客户、授权单位）
   */
  const loadTemplateData = useCallback(async () => {
    try {
      setTemplateDataLoading(true);
      
      // 并行获取所有数据
      const [roomsRes, clientsRes, orgsRes, dutyPersonnelRes] = await Promise.all([
        roomAPI.getRooms().catch(() => ({ data: { results: [] } })),
        clientAPI.getClients().catch(() => ({ data: { results: [] } })),
        authorizedOrgAPI.getAuthorizedOrgs().catch(() => ({ data: { results: [] } })),
        dutyPersonnelAPI.getDutyPersonnel().catch(() => ({ data: { results: [] } }))
      ]);
      
      setRooms(roomsRes.data?.results || roomsRes.data || []);
      setClients(clientsRes.data?.results || clientsRes.data || []);
      setAuthorizedOrgs(orgsRes.data?.results || orgsRes.data || []);
      setDutyPersonnel(dutyPersonnelRes.data?.results || dutyPersonnelRes.data || []);
    } catch (error) {
      console.error('加载模板数据失败:', error);
      // 即使失败也继续，使用空数组
      setRooms([]);
      setClients([]);
      setAuthorizedOrgs([]);
    } finally {
      setTemplateDataLoading(false);
    }
  }, []);

  /**
   * 下载Excel模板（前端生成，结合数据库数据）
   */
  const handleDownloadTemplate = async () => {
    try {
      // 先加载数据
      await loadTemplateData();
      
      // 获取示例数据（优先使用数据库中的数据）
      const sampleRoom = rooms.length > 0 ? rooms[0].name : 'F1D';
      const sampleClient = clients.length > 0 ? clients[0] : null;
      const sampleClientName = sampleClient ? sampleClient.name : '国泰君安';
      const sampleClientAuthorizedPerson = sampleClient && sampleClient.authorized_person ? sampleClient.authorized_person : '张三';
      const sampleClient2 = clients.length > 1 ? clients[1] : null;
      const sampleClient2Name = sampleClient2 ? sampleClient2.name : '招商银行';
      const sampleClient2AuthorizedPerson = sampleClient2 && sampleClient2.authorized_person ? sampleClient2.authorized_person : '李四';
      const sampleOrg = authorizedOrgs.length > 0 ? authorizedOrgs[0].name : '华通云';
      const sampleDutyPersonnel = dutyPersonnel.length > 0 ? dutyPersonnel[0].name : '王五';
      
      // 人员进出表模板数据
      const personnelTemplate = [
        {
          '日期': '2024-01-15',
          '姓名': '张三',
          '身份证号': '110101199001011234',
          '联系方式': '13800138000',
          '进场时间': '09:00',
          '离场时间': '18:00',
          '工作描述': '设备上架维护',
          '客户': sampleClientName, // 必填：客户公司
          '客户代表': sampleClientAuthorizedPerson, // 必填：代表客户公司的授权人（来自客户表的authorized_person字段）
          '授权单位': sampleOrg,
          '机房': sampleRoom,
          '值班人员': '' // 可选：值班人员姓名或员工ID
        },
        {
          '日期': '2024-01-16',
          '姓名': '李四',
          '身份证号': '110101199002021234',
          '联系方式': '13900139000',
          '进场时间': '10:00',
          '离场时间': '17:00',
          '工作描述': '设备巡检',
          '客户': sampleClient2Name, // 必填：客户公司
          '客户代表': sampleClient2AuthorizedPerson, // 必填：代表客户公司的授权人（来自客户表的authorized_person字段）
          '授权单位': sampleOrg,
          '机房': rooms.length > 1 ? rooms[1].name : 'F1B',
          '值班人员': '' // 可选：值班人员姓名或员工ID
        }
      ];

      // 上架汇总表模板数据
      const installTemplate = [
        {
          '日期': '2024-01-15',
          '客户代表': '张三',
          '客户': sampleClient,
          '授权单位': sampleOrg,
          '品牌': 'Dell',
          '型号': 'PowerEdge R740',
          '序列号': 'SN123456789',
          'U数': '2',
          '机架位置': '10',
          '机柜名称': 'D01', // 示例：D01会自动转换为04-01
          '机房': sampleRoom,
          '电源类型': '双电源',
          '电源瓦数': '750',
          '设备类型': '服务器',
          '使用说明': '', // 可选：设备使用说明或备注
          '值班人员': sampleDutyPersonnel // 可选：值班人员姓名
        },
        {
          '日期': '2024-01-15',
          '客户代表': '张三',
          '客户': sampleClient,
          '授权单位': sampleOrg,
          '品牌': 'Huawei',
          '型号': 'CE6851',
          '序列号': 'SN987654321',
          'U数': '1',
          '机架位置': '12',
          '机柜名称': 'H01', // 示例：H01会自动转换为08-01
          '机房': sampleRoom,
          '电源类型': '单电源',
          '电源瓦数': '500',
          '设备类型': '交换机',
          '使用说明': '', // 可选：设备使用说明或备注
          '值班人员': sampleDutyPersonnel // 可选：值班人员姓名
        }
      ];

      // 下架汇总表模板数据
      const decommissionTemplate = [
        {
          '日期': '2024-01-16',
          '客户代表': '李四',
          '客户': clients.length > 1 ? clients[1].name : '招商银行',
          '授权单位': sampleOrg,
          '品牌': 'Dell',
          '型号': 'PowerEdge R730',
          '序列号': 'SN111222333',
          'U数': '2',
          '机架位置': '15',
          '机柜名称': 'D02', // 示例：D02会自动转换为04-02
          '机房': rooms.length > 1 ? rooms[1].name : 'F1B',
          '电源类型': '双电源',
          '电源瓦数': '650',
          '设备类型': '服务器',
          '下架原因': '设备故障',
          '状态': '已下架', // 可选：已下架/已报废，默认为"已下架"
          '值班人员': sampleDutyPersonnel // 可选：值班人员姓名
        }
      ];

      // 创建工作簿
      const wb = XLSX.utils.book_new();
      
      // 创建人员进出Sheet
      const personnelWS = XLSX.utils.json_to_sheet(personnelTemplate);
      XLSX.utils.book_append_sheet(wb, personnelWS, '人员进出');
      
      // 创建上架汇总Sheet
      const installWS = XLSX.utils.json_to_sheet(installTemplate);
      XLSX.utils.book_append_sheet(wb, installWS, '上架汇总');
      
      // 创建下架汇总Sheet
      const decommissionWS = XLSX.utils.json_to_sheet(decommissionTemplate);
      XLSX.utils.book_append_sheet(wb, decommissionWS, '下架汇总');
      
      // 生成文件名
      const fileName = '运维故事导入模板.xlsx';
      
      // 下载文件
      XLSX.writeFile(wb, fileName);
      
      message.success('模板文件下载成功！');
    } catch (error) {
      console.error('下载模板失败:', error);
      message.error('模板文件下载失败: ' + (error.message || '未知错误'));
    }
  };

  // 预览表格列定义
  const previewEventColumns = [
    {
      title: '订单号',
      dataIndex: 'order_number',
      key: 'order_number',
    },
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      render: (date) => date ? new Date(date).toLocaleDateString() : '-',
    },
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '客户',
      dataIndex: 'client_name',
      key: 'client_name',
    },
    {
      title: '授权单位',
      dataIndex: 'org_name',
      key: 'org_name',
    },
  ];

  const previewDeviceColumns = [
    {
      title: '序列号',
      dataIndex: 'sn',
      key: 'sn',
    },
    {
      title: '品牌',
      dataIndex: 'brand',
      key: 'brand',
    },
    {
      title: '型号',
      dataIndex: 'model',
      key: 'model',
    },
    {
      title: '操作类型',
      dataIndex: 'operation_type',
      key: 'operation_type',
      render: (type) => {
        const color = type && type.includes('下架') ? 'red' : 'green';
        return <Tag color={color}>{type || '上架'}</Tag>;
      },
    },
    {
      title: '订单号',
      dataIndex: 'order_number',
      key: 'order_number',
    },
  ];

  const uploadProps = {
    name: 'file',
    multiple: false,
    fileList,
    onChange: handleFileChange,
    accept: '.xlsx,.xls',
    beforeUpload: (file) => {
      const isExcel = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
                     file.type === 'application/vnd.ms-excel';
      if (!isExcel) {
        message.error('只能上传 Excel 文件!');
        return false;
      }
      const isLt10M = file.size / 1024 / 1024 < 10;
      if (!isLt10M) {
        message.error('文件大小不能超过 10MB!');
        return false;
      }
      return false; // 阻止自动上传
    }
  };

  // 组件挂载时加载模板数据和导入历史
  React.useEffect(() => {
    loadTemplateData();
    loadImportHistory();
  }, [loadTemplateData, loadImportHistory]);

  return (
    <div className="data-import-container">
      <Card title="Excel运维故事导入" className="import-card">
        <Steps current={currentStep} className="import-steps">
          <Step title="上传文件" description="选择Excel文件并配置选项" />
          <Step title="预览数据" description="查看匹配结果" />
          <Step title="导入完成" description="查看导入结果" />
        </Steps>

        <Divider />

        {/* 第一步：文件上传和配置 */}
        {currentStep === 0 && (
          <div className="upload-section">
            {/* 导入历史记录 */}
            <Card 
              title={
                <Space>
                  <InfoCircleOutlined />
                  <span>导入历史记录</span>
                </Space>
              }
              style={{ marginBottom: 16 }}
              extra={
                <Space>
                  <Select
                    style={{ width: 150 }}
                    placeholder="导入选项"
                    allowClear
                    value={historyFilter.incremental}
                    onChange={(value) => {
                      const newFilter = {
                        ...historyFilter,
                        incremental: value,
                      };
                      setHistoryFilter(newFilter);
                      loadImportHistory(1, historyPagination.pageSize, newFilter);
                    }}
                  >
                    <Select.Option value={true}>增量导入</Select.Option>
                    <Select.Option value={false}>全量导入</Select.Option>
                  </Select>
                  <Button 
                    size="small" 
                    icon={<InfoCircleOutlined />}
                    onClick={() => loadImportHistory(historyPagination.current, historyPagination.pageSize, historyFilter)}
                  >
                    刷新
                  </Button>
                </Space>
              }
            >
              <Table
                columns={[
                  {
                    title: '批次ID',
                    dataIndex: 'batch_id',
                    key: 'batch_id',
                    render: (text) => <Text copyable code>{text}</Text>,
                  },
                  {
                    title: '导入时间',
                    dataIndex: 'import_time',
                    key: 'import_time',
                    render: (text) => text ? new Date(text).toLocaleString('zh-CN') : '-',
                  },
                  {
                    title: '导入用户',
                    dataIndex: 'imported_by_username',
                    key: 'imported_by_username',
                    render: (text) => text || '-',
                  },
                  {
                    title: '事件数',
                    dataIndex: 'event_count',
                    key: 'event_count',
                    align: 'right',
                  },
                  {
                    title: '设备数',
                    dataIndex: 'device_count',
                    key: 'device_count',
                    align: 'right',
                  },
                  {
                    title: '导入选项',
                    dataIndex: 'incremental',
                    key: 'incremental',
                    render: (incremental) => (
                      incremental ? (
                        <Tag color="blue">增量导入</Tag>
                      ) : (
                        <Tag color="default">全量导入</Tag>
                      )
                    ),
                  },
                  {
                    title: '状态',
                    key: 'status',
                    render: (_, record) => (
                      record.rolled_back ? (
                        <Tag color="red">已回滚</Tag>
                      ) : (
                        <Tag color="green">已导入</Tag>
                      )
                    ),
                  },
                  {
                    title: '操作',
                    key: 'action',
                    render: (_, record) => (
                      <Space>
                        <Button
                          size="small"
                          onClick={() => {
                            setRollbackBatchId(record.batch_id);
                            setTimeout(() => {
                              handleRollbackHistory();
                            }, 100);
                          }}
                          danger
                          disabled={record.rolled_back}
                          icon={<RollbackOutlined />}
                        >
                          回滚
                        </Button>
                      </Space>
                    ),
                  },
                ]}
                dataSource={importHistory}
                rowKey="batch_id"
                loading={historyLoading}
                pagination={{
                  current: historyPagination.current,
                  pageSize: historyPagination.pageSize,
                  total: historyPagination.total,
                  showSizeChanger: true,
                  showTotal: (total) => `共 ${total} 条记录`,
                  onChange: (page, pageSize) => {
                    loadImportHistory(page, pageSize, historyFilter);
                  },
                  onShowSizeChange: (current, size) => {
                    loadImportHistory(current, size, historyFilter);
                  },
                }}
                size="small"
              />
            </Card>

            {/* 回滚历史导入功能 */}
            <Card 
              title={
                <Space>
                  <RollbackOutlined style={{ color: '#ff4d4f' }} />
                  <span>回滚历史导入</span>
                </Space>
              }
              style={{ marginBottom: 16 }}
              headStyle={{ backgroundColor: '#fff2f0', borderBottom: '1px solid #ffccc7' }}
            >
              <Alert
                message="回滚说明"
                description="如果您需要回滚之前的导入数据，请输入对应的批次ID。回滚操作将删除该批次导入的所有数据，此操作不可恢复！"
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
              />
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <Space style={{ width: '100%' }}>
                  <Input
                    placeholder="请输入要回滚的批次ID（例如：BATCH_20260131_224245）"
                    value={rollbackBatchId}
                    onChange={(e) => setRollbackBatchId(e.target.value)}
                    style={{ flex: 1 }}
                    onPressEnter={handleRollbackHistory}
                  />
                  <Button
                    danger
                    type="primary"
                    icon={<RollbackOutlined />}
                    onClick={handleRollbackHistory}
                    loading={rollbackLoading}
                    disabled={!rollbackBatchId || !rollbackBatchId.trim()}
                  >
                    回滚
                  </Button>
                </Space>
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  提示：批次ID通常在导入完成时会显示，请复制保存以便后续回滚使用
                </Text>
              </Space>
            </Card>

            <Alert
              message="导入说明"
              description={
                <div>
                  <p>1. 请先下载Excel模板，按照模板格式填写数据</p>
                  <p>2. Excel文件需包含"人员进出"、"上架汇总"和"下架汇总"三个Sheet</p>
                  <p>3. 必填字段：日期、姓名、客户、客户代表（人员进出表）；日期、序列号（设备上下架表）</p>
                  <p>4. 日期格式支持：YYYY-MM-DD、YYYY/MM/DD、YYYY年MM月DD日等</p>
                </div>
              }
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              action={
                <Button
                  type="primary"
                  icon={<DownloadOutlined />}
                  onClick={handleDownloadTemplate}
                  loading={templateDataLoading}
                >
                  下载模板
                </Button>
              }
            />

            <Form
              form={form}
              layout="vertical"
              initialValues={{
                personnel_sheet: '人员进出',
                install_sheet: '上架汇总',
                decommission_sheet: '下架汇总',
                incremental: false,
                batch_id: generateBatchId(),
              }}
            >
              <Form.Item
                label="Excel文件"
                required
              >
                <Dragger {...uploadProps}>
                  <p className="ant-upload-drag-icon">
                    <FileExcelOutlined />
                  </p>
                  <p className="ant-upload-text">点击或拖拽Excel文件到此区域上传</p>
                  <p className="ant-upload-hint">
                    支持 .xlsx 和 .xls 格式，文件大小不超过10MB
                  </p>
                </Dragger>
              </Form.Item>

              <Form.Item
                label="人员进出表Sheet名称"
                name="personnel_sheet"
                tooltip="Excel文件中人员进出表的Sheet名称"
              >
                <Input placeholder="默认：人员进出" />
              </Form.Item>

              <Form.Item
                label="上架汇总表Sheet名称"
                name="install_sheet"
                tooltip="Excel文件中设备上架表的Sheet名称"
              >
                <Input placeholder="默认：上架汇总" />
              </Form.Item>

              <Form.Item
                label="下架汇总表Sheet名称"
                name="decommission_sheet"
                tooltip="Excel文件中设备下架表的Sheet名称"
              >
                <Input placeholder="默认：下架汇总" />
              </Form.Item>

              <Form.Item
                label="批次ID"
                name="batch_id"
                tooltip="用于标识本次导入，支持回滚"
              >
                <Input placeholder="自动生成" />
              </Form.Item>

              <Form.Item
                label="导入选项"
              >
                <Space direction="vertical">
                  <Form.Item
                    name="incremental"
                    valuePropName="checked"
                    noStyle
                  >
                    <Switch checkedChildren="增量导入" unCheckedChildren="全量导入" />
                  </Form.Item>
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    增量导入：跳过已存在的订单号
                  </Text>
                </Space>
              </Form.Item>

              <Form.Item
                label="最大处理行数（测试用）"
                name="max_rows"
                tooltip="限制处理行数，用于小规模测试"
              >
                <InputNumber min={1} placeholder="留空表示处理全部" style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item>
                <Space>
                  <Button
                    type="primary"
                    icon={<EyeOutlined />}
                    onClick={handlePreview}
                    loading={previewLoading}
                    disabled={fileList.length === 0}
                  >
                    预览数据
                  </Button>
                  <Button
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    onClick={handleImport}
                    loading={importLoading}
                    disabled={fileList.length === 0}
                  >
                    直接导入
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </div>
        )}

        {/* 第二步：预览结果 */}
        {currentStep === 1 && previewData && (
          <div className="preview-section">
            <Alert
              message="预览模式"
              description="以下为预览结果，数据尚未写入数据库。确认无误后可以执行导入。"
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />

            <Descriptions title="预览摘要" bordered column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="批次ID">{previewData.batch_id}</Descriptions.Item>
              <Descriptions.Item label="预览时间">
                {new Date(previewData.timestamp).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="事件总数">
                {previewData.summary?.events?.total || 0}
              </Descriptions.Item>
              <Descriptions.Item label="跳过事件">
                <Text type="warning">{previewData.summary?.events?.skipped || 0}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="设备总数">
                {previewData.summary?.devices?.total || 0}
              </Descriptions.Item>
              <Descriptions.Item label="跳过（未导入）">
                <Text type="warning">
                  {Object.values(previewData.summary?.devices?.skip_reasons || {}).reduce((a, b) => a + b, 0) || 0}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="匹配成功">
                {previewData.summary?.devices?.matched || 0}
              </Descriptions.Item>
              <Descriptions.Item
                label={
                  <Tooltip title="未在人员进出表中找到对应事件，已通过自动创建新事件并关联设备（这些设备已成功导入）">
                    <span>未匹配（已自动创建事件） <InfoCircleOutlined style={{ marginLeft: 4, color: '#1890ff' }} /></span>
                  </Tooltip>
                }
              >
                {previewData.summary?.devices?.unmatched || 0}
              </Descriptions.Item>
            </Descriptions>

            {/* 未匹配说明：当存在“未匹配（已自动创建事件）”时显示原因 */}
            {(previewData.summary?.devices?.unmatched || 0) > 0 && (
              <Alert
                message="关于“未匹配”的说明"
                description={
                  <>
                    <p style={{ marginBottom: 8 }}>
                      <strong>未匹配到已有事件（已自动创建新事件并关联）：{previewData.summary?.devices?.unmatched || 0} 条。</strong>
                    </p>
                    <p style={{ margin: 0, color: '#666' }}>
                      这些设备在人员进出表中未找到相同日期+客户代表的记录，系统已为每条自动创建新事件并完成关联，设备已成功导入，无需处理。
                    </p>
                  </>
                }
                type="info"
                showIcon
                icon={<InfoCircleOutlined />}
                style={{ marginBottom: 16 }}
              />
            )}

            {/* 事件跳过原因统计 */}
            {previewData.summary?.events?.skip_reasons && 
             Object.keys(previewData.summary.events.skip_reasons).length > 0 && (
              <Card 
                title={
                  <Space>
                    <InfoCircleOutlined style={{ color: '#faad14' }} />
                    <span>事件跳过原因统计</span>
                    {previewData.summary?.events?.sheet_name && (
                      <Tag color="blue">Sheet: {previewData.summary.events.sheet_name}</Tag>
                    )}
                  </Space>
                } 
                style={{ marginBottom: 16 }}
                type="inner"
              >
                <Table
                  columns={[
                    {
                      title: '跳过原因',
                      dataIndex: 'reason',
                      key: 'reason',
                      ellipsis: { showTitle: true },
                      render: (text) => <Text style={{ wordBreak: 'break-word' }}>{text}</Text>,
                    },
                    {
                      title: '数量',
                      dataIndex: 'count',
                      key: 'count',
                      width: 100,
                      align: 'right',
                      render: (count) => <Text type="warning" strong>{count}</Text>,
                    },
                    {
                      title: '占比',
                      key: 'percentage',
                      width: 100,
                      align: 'right',
                      render: (_, record) => {
                        const total = previewData.summary?.events?.skipped || 1;
                        const percentage = ((record.count / total) * 100).toFixed(1);
                        return <Text type="secondary">{percentage}%</Text>;
                      },
                    },
                  ]}
                  dataSource={Object.entries(previewData.summary.events.skip_reasons)
                    .map(([reason, count]) => ({ reason, count, key: reason }))
                    .sort((a, b) => b.count - a.count)}
                  pagination={false}
                  size="small"
                />
              </Card>
            )}

            {/* 设备跳过原因统计 */}
            {previewData.summary?.devices?.skip_reasons && 
             Object.keys(previewData.summary.devices.skip_reasons).length > 0 && (
              <Card 
                title={
                  <Space>
                    <InfoCircleOutlined style={{ color: '#faad14' }} />
                    <span>设备跳过原因统计</span>
                    {previewData.summary?.devices?.sheet_name && (
                      <Tag color="blue">Sheet: {previewData.summary.devices.sheet_name}</Tag>
                    )}
                  </Space>
                } 
                style={{ marginBottom: 16 }}
                type="inner"
              >
                <Table
                  columns={[
                    {
                      title: '跳过原因',
                      dataIndex: 'reason',
                      key: 'reason',
                      ellipsis: { showTitle: true },
                      render: (text) => <Text style={{ wordBreak: 'break-word' }}>{text}</Text>,
                    },
                    {
                      title: '数量',
                      dataIndex: 'count',
                      key: 'count',
                      width: 100,
                      align: 'right',
                      render: (count) => <Text type="warning" strong>{count}</Text>,
                    },
                    {
                      title: '占比',
                      key: 'percentage',
                      width: 100,
                      align: 'right',
                      render: (_, record) => {
                        const total = Object.values(previewData.summary?.devices?.skip_reasons || {}).reduce((a, b) => a + b, 0) || 1;
                        const percentage = ((record.count / total) * 100).toFixed(1);
                        return <Text type="secondary">{percentage}%</Text>;
                      },
                    },
                  ]}
                  dataSource={Object.entries(previewData.summary.devices.skip_reasons)
                    .map(([reason, count]) => ({ reason, count, key: reason }))
                    .sort((a, b) => b.count - a.count)}
                  pagination={false}
                  size="small"
                />
              </Card>
            )}

            <Card title="事件列表" style={{ marginBottom: 16 }}>
              <Table
                columns={previewEventColumns}
                dataSource={previewData.events || []}
                rowKey={(record) => record.order_number || `event-${record.date}-${record.name}`}
                pagination={{ pageSize: 10 }}
                size="small"
              />
            </Card>

            <Card title="设备列表">
              <Table
                columns={previewDeviceColumns}
                dataSource={previewData.devices || []}
                rowKey={(record) => record.sn || `device-${record.brand}-${record.model}`}
                pagination={{ pageSize: 10 }}
                size="small"
              />
            </Card>

            <Divider />

            <Space>
              <Button onClick={() => setCurrentStep(0)}>返回修改</Button>
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handleImport}
                loading={importLoading}
              >
                确认导入
              </Button>
            </Space>
          </div>
        )}

        {/* 第三步：导入结果 */}
        {currentStep === 2 && importResult && (
          <div className="result-section">
            <Alert
              message="导入完成"
              description="数据已成功导入到数据库"
              type="success"
              showIcon
              style={{ marginBottom: 16 }}
            />

            <Descriptions title="导入结果" bordered column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="批次ID">
                <Text copyable>{importResult.batch_id}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="导入状态">
                <Tag color="success">成功</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="创建事件数">
                {importResult.summary?.event_count || 0}
              </Descriptions.Item>
              <Descriptions.Item label="处理设备数">
                {importResult.summary?.device_count || 0}
              </Descriptions.Item>
            </Descriptions>

            <Alert
              message="导入完成"
              description={
                <div>
                  <p><strong>批次ID:</strong> <Text copyable code>{importResult.batch_id}</Text></p>
                  <p style={{ marginTop: 8, marginBottom: 0 }}>
                    <strong>重要提示：</strong>如需回滚本次导入的数据，请点击下方的"回滚导入"按钮。
                    回滚操作将删除本次导入的所有事件和设备数据，此操作不可恢复！
                  </p>
                </div>
              }
              type="success"
              showIcon
              style={{ marginBottom: 16 }}
            />

            <Card 
              title={
                <Space>
                  <RollbackOutlined style={{ color: '#ff4d4f' }} />
                  <span>回滚操作</span>
                </Space>
              }
              style={{ marginBottom: 16 }}
              headStyle={{ backgroundColor: '#fff2f0', borderBottom: '1px solid #ffccc7' }}
            >
              <Alert
                message="危险操作"
                description="回滚操作将删除本次导入的所有数据，包括：事件记录、设备记录及其关联关系。此操作不可恢复，请谨慎操作！"
                type="error"
                showIcon
                style={{ marginBottom: 16 }}
              />
              <Space>
                <Button onClick={handleReset}>重新导入</Button>
                <Button
                  danger
                  type="primary"
                  size="large"
                  icon={<RollbackOutlined />}
                  onClick={handleRollback}
                >
                  回滚本次导入
                </Button>
              </Space>
            </Card>
          </div>
        )}
      </Card>
    </div>
  );
};

export default DataImport;
