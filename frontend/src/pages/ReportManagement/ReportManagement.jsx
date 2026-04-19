/**
 * 报表管理页面（运维日报/月报/年报、弱电资源日报/月报/年报）
 * 导出设置、配置管理、定时任务（界面）
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card,
  Tabs,
  Form,
  DatePicker,
  Select,
  Button,
  Table,
  Space,
  message,
  Modal,
  Input,
  Switch,
  Popconfirm,
  Upload,
  Alert,
  List,
} from 'antd';
import {
  DownloadOutlined,
  SaveOutlined,
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
  InboxOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { reportAPI, pduDataAPI } from '../../api';
import { mapCabinetOption, useCabinetOptions, useClientOptions } from '../../hooks/useSelectOptions';
import {
  getExportConfigs,
  saveExportConfig,
  deleteExportConfig,
  getScheduledTasks,
  saveScheduledTask,
  updateScheduledTask,
  deleteScheduledTask,
} from '../../utils/reportConfigStorage';
import { downloadFile } from '../../utils/fileDownload';
import './ReportManagement.css';

const { RangePicker } = DatePicker;
const { Option } = Select;

/**
 * 年报显示年份选择器，月报显示月份选择器，日报等显示日期范围选择器
 * @param {Object} props
 * @param {string} props.periodType - 报表类型
 * @param {[dayjs,dayjs]|undefined} props.value - Form 传入的 dateRange
 * @param {Function} props.onChange - Form 传入的 onChange
 */
const DateRangeOrYearPicker = ({ periodType, value, onChange }) => {
  const isYearPicker = periodType === 'yearly' || periodType === 'power_yearly';
  const isMonthPicker = periodType === 'monthly' || periodType === 'power_monthly';
  if (isYearPicker) {
    return (
      <DatePicker
        picker="year"
        style={{ width: 200 }}
        placeholder="选择年份"
        value={value?.[0]}
        onChange={(date) => onChange(date ? [date.startOf('year'), date.endOf('year')] : undefined)}
      />
    );
  }
  if (isMonthPicker) {
    return (
      <DatePicker
        picker="month"
        style={{ width: 200 }}
        placeholder="选择月份"
        value={value?.[0]}
        onChange={(date) => onChange(date ? [date.startOf('month'), date.endOf('month')] : undefined)}
      />
    );
  }
  return <RangePicker style={{ width: 260 }} value={value} onChange={onChange} />;
};

/** 从 Content-Disposition 解析文件名 */
const getFilenameFromDisposition = (contentDisposition) => {
  if (!contentDisposition) return null;
  const match = contentDisposition.match(/filename[*]?=['"]?(?:UTF-8'')?([^;\n"']+)['"]?/i)
    || contentDisposition.match(/filename=(.+)/i);
  if (match && match[1]) {
    return match[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
};

/**
 * 报表管理（运维报表与弱电资源报表）
 * @returns {React.ReactElement}
 */
const ReportManagement = () => {
  const [form] = Form.useForm();
  const periodType = Form.useWatch('period_type', form) || 'daily';
  const isCabinetView = periodType === 'cabinet_view';
  const selectedClientId = Form.useWatch('client_id', form);
  const watchedCabinetIds = Form.useWatch('cabinet_ids', form);
  const selectedCabinetIds = useMemo(() => watchedCabinetIds || [], [watchedCabinetIds]);
  const [activeTab, setActiveTab] = useState('export');
  const [exporting, setExporting] = useState(false);
  const [configs, setConfigs] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [saveConfigModalVisible, setSaveConfigModalVisible] = useState(false);
  const [configName, setConfigName] = useState('');
  const [taskModalVisible, setTaskModalVisible] = useState(false);
  const [taskForm] = Form.useForm();
  /** 弱电数据导入 */
  const [pduImportFileList, setPduImportFileList] = useState([]);
  const [pduImporting, setPduImporting] = useState(false);
  const [pduImportResult, setPduImportResult] = useState(null);
  const { options: clientOptions } = useClientOptions();
  const { options: allCabinetOptions, items: cabinetItems } = useCabinetOptions();

  const cabinetOptions = useMemo(() => {
    if (!isCabinetView || !selectedClientId) {
      return allCabinetOptions;
    }
    const clientId = Number.parseInt(selectedClientId, 10);
    if (Number.isNaN(clientId)) {
      return allCabinetOptions;
    }
    return cabinetItems
      .filter((cabinet) => Number.parseInt(cabinet?.client, 10) === clientId)
      .map(mapCabinetOption);
  }, [allCabinetOptions, cabinetItems, isCabinetView, selectedClientId]);

  const loadConfigs = useCallback(() => {
    setConfigs(getExportConfigs());
  }, []);

  const loadTasks = useCallback(() => {
    setTasks(getScheduledTasks());
  }, []);

  useEffect(() => {
    loadConfigs();
    loadTasks();
  }, [loadConfigs, loadTasks]);

  useEffect(() => {
    if (isCabinetView && form.getFieldValue('format') !== 'pdf') {
      form.setFieldValue('format', 'pdf');
    }
  }, [form, isCabinetView]);

  useEffect(() => {
    if (!isCabinetView || !Array.isArray(selectedCabinetIds) || selectedCabinetIds.length === 0) {
      return;
    }
    const validCabinetIds = new Set(cabinetOptions.map((option) => option.value));
    const nextSelectedIds = selectedCabinetIds.filter((id) => validCabinetIds.has(id));
    if (nextSelectedIds.length !== selectedCabinetIds.length) {
      form.setFieldValue('cabinet_ids', nextSelectedIds);
    }
  }, [cabinetOptions, form, isCabinetView, selectedCabinetIds]);

  const handleSelectVisibleCabinets = useCallback(() => {
    if (!cabinetOptions.length) {
      message.warning(selectedClientId ? '当前客户下暂无机柜' : '暂无可选机柜');
      return;
    }
    form.setFieldValue('cabinet_ids', cabinetOptions.map((option) => option.value));
  }, [cabinetOptions, form, selectedClientId]);

  const handleClearSelectedCabinets = useCallback(() => {
    form.setFieldValue('cabinet_ids', []);
  }, [form]);

  /** 立即导出 */
  const handleExport = async () => {
    try {
      const values = await form.validateFields();
      if (isCabinetView && !(values.client_id || (Array.isArray(values.cabinet_ids) && values.cabinet_ids.length > 0))) {
        message.warning('请选择至少一个机柜，或先选择客户');
        return;
      }
      const start = isCabinetView
        ? dayjs().format('YYYY-MM-DD')
        : (values.dateRange?.[0] ? dayjs(values.dateRange[0]).format('YYYY-MM-DD') : null);
      const end = isCabinetView
        ? dayjs().format('YYYY-MM-DD')
        : (values.dateRange?.[1] ? dayjs(values.dateRange[1]).format('YYYY-MM-DD') : null);
      if (!start || !end) {
        message.warning('请选择日期范围');
        return;
      }
      const params = {
        period_type: values.period_type || 'daily',
        start_date: start,
        end_date: end,
        format: isCabinetView ? 'pdf' : (values.format || 'excel'),
        client_id: values.client_id || undefined,
        cabinet_id: isCabinetView ? undefined : (values.cabinet_id || undefined),
        cabinet_ids: isCabinetView && Array.isArray(values.cabinet_ids) && values.cabinet_ids.length > 0
          ? values.cabinet_ids
          : undefined,
      };
      setExporting(true);
      const response = await reportAPI.generateReport(params);
      if (params.format === 'json') {
        message.success('报表数据已返回（JSON）');
        return;
      }
      const blob = response.data;
      const defaultNames = {
        daily: '运维日报',
        monthly: '运维月报',
        yearly: '运维年报',
        client_report: '客户报表',
        power_daily: '弱电资源管理日报',
        power_monthly: '弱电资源管理月报',
        power_yearly: '弱电资源管理年报',
        cabinet_view: '机柜视图',
      };
      const prefix = defaultNames[params.period_type] || params.period_type;
      const ext = params.format === 'excel' ? 'xlsx' : 'pdf';
      const filename = getFilenameFromDisposition(response.headers?.['content-disposition'])
        || (params.period_type?.startsWith('power_')
          ? `机柜${prefix}_${params.start_date}_${params.end_date}.${ext}`
          : `${prefix}_${params.start_date}_${params.end_date}.${ext}`);
      downloadFile(blob, filename);
      message.success('导出成功');
    } catch (err) {
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const json = JSON.parse(text);
          message.error(json.detail || '导出失败');
        } catch {
          message.error('导出失败');
        }
      } else {
        message.error(err.response?.data?.detail || err.message || '导出失败');
      }
    } finally {
      setExporting(false);
    }
  };

  /** 打开保存配置弹窗 */
  const handleOpenSaveConfig = () => {
    form.validateFields().then(() => {
      setConfigName('');
      setSaveConfigModalVisible(true);
    }).catch(() => {});
  };

  /** 保存配置 */
  const handleSaveConfig = () => {
    if (!configName.trim()) {
      message.warning('请输入配置名称');
      return;
    }
    try {
      const values = form.getFieldsValue();
      const isCabinetViewConfig = values.period_type === 'cabinet_view';
      const start = isCabinetViewConfig
        ? dayjs().format('YYYY-MM-DD')
        : (values.dateRange?.[0] ? dayjs(values.dateRange[0]).format('YYYY-MM-DD') : null);
      const end = isCabinetViewConfig
        ? dayjs().format('YYYY-MM-DD')
        : (values.dateRange?.[1] ? dayjs(values.dateRange[1]).format('YYYY-MM-DD') : null);
      if (!start || !end) {
        message.warning('请先选择日期范围');
        return;
      }
      saveExportConfig({
        name: configName.trim(),
        period_type: values.period_type || 'daily',
        start_date: start,
        end_date: end,
        format: isCabinetViewConfig ? 'pdf' : (values.format || 'excel'),
        client_id: values.client_id ?? null,
        cabinet_id: isCabinetViewConfig ? null : (values.cabinet_id ?? null),
        cabinet_ids: isCabinetViewConfig ? (values.cabinet_ids ?? []) : [],
      });
      message.success('配置已保存');
      setSaveConfigModalVisible(false);
      loadConfigs();
    } catch (e) {
      message.error('保存失败');
    }
  };

  /** 下载弱电数据导入模板 */
  const handleDownloadPduTemplate = async () => {
    try {
      const res = await pduDataAPI.downloadPduDataImportTemplate();
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '弱电数据导入模板.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
      message.success('模板已下载');
    } catch (err) {
      message.error('下载模板失败');
      console.error(err);
    }
  };

  /** 执行弱电数据批量导入 */
  const handlePduImport = async () => {
    if (pduImportFileList.length === 0) {
      message.warning('请先选择要导入的文件（JSON 或 Excel）');
      return;
    }
    const file = pduImportFileList[0].originFileObj || pduImportFileList[0];
    if (!file) {
      message.warning('文件无效');
      return;
    }
    setPduImporting(true);
    setPduImportResult(null);
    try {
      const res = await pduDataAPI.batchImportPduData(file);
      const data = res.data || res;
      setPduImportResult({
        created: data.created ?? 0,
        failed: data.failed ?? 0,
        errors: data.errors ?? [],
      });
      if (data.created > 0) {
        message.success(`成功导入 ${data.created} 条弱电数据`);
      }
      if (data.failed > 0 && data.created === 0) {
        message.warning(`有 ${data.failed} 条导入失败，请查看下方错误详情`);
      }
    } catch (err) {
      const detail = err.response?.data?.error || err.response?.data?.detail || err.message || '导入失败';
      message.error(typeof detail === 'string' ? detail : '导入失败');
      setPduImportResult({ created: 0, failed: 0, errors: [{ row: '-', message: String(detail) }] });
    } finally {
      setPduImporting(false);
    }
  };

  /** 加载配置到表单 */
  const handleLoadConfig = (record) => {
    form.setFieldsValue({
      period_type: record.period_type || 'daily',
      dateRange: record.start_date && record.end_date
        ? [dayjs(record.start_date), dayjs(record.end_date)]
        : undefined,
      format: record.format || 'excel',
      client_id: record.client_id ?? undefined,
      cabinet_id: record.cabinet_id ?? undefined,
      cabinet_ids: record.cabinet_ids ?? [],
    });
    setActiveTab('export');
    message.success('已加载配置');
  };

  /** 删除配置 */
  const handleDeleteConfig = (id) => {
    deleteExportConfig(id);
    loadConfigs();
    message.success('已删除');
  };

  /** 创建/编辑定时任务 */
  const handleOpenTaskModal = (record) => {
    if (record) {
      taskForm.setFieldsValue({
        name: record.name,
        configId: record.configId || undefined,
        cronExpression: record.cronExpression || '',
        enabled: record.enabled !== false,
      });
      taskForm.setFieldValue('_id', record.id);
    } else {
      taskForm.resetFields();
      taskForm.setFieldValue('_id', undefined);
    }
    setTaskModalVisible(true);
  };

  const handleSaveTask = () => {
    taskForm.validateFields().then((values) => {
      const id = taskForm.getFieldValue('_id');
      saveScheduledTask({
        id: id || undefined,
        name: values.name,
        configId: values.configId || null,
        cronExpression: values.cronExpression || '',
        enabled: values.enabled !== false,
      });
      message.success(id ? '任务已更新' : '任务已创建');
      setTaskModalVisible(false);
      loadTasks();
    }).catch(() => {});
  };

  const handleTaskEnabledChange = (checked, record) => {
    updateScheduledTask(record.id, { enabled: checked });
    loadTasks();
    message.success(checked ? '已启用' : '已禁用');
  };

  const handleDeleteTask = (id) => {
    deleteScheduledTask(id);
    loadTasks();
    message.success('已删除');
  };

  const configColumns = [
    { title: '名称', dataIndex: 'name', key: 'name', ellipsis: true },
    { title: '报表类型', dataIndex: 'period_type', key: 'period_type', width: 90 },
    { title: '开始日期', dataIndex: 'start_date', key: 'start_date', width: 110 },
    { title: '结束日期', dataIndex: 'end_date', key: 'end_date', width: 110 },
    { title: '格式', dataIndex: 'format', key: 'format', width: 80 },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" onClick={() => handleLoadConfig(record)}>
            加载
          </Button>
          <Popconfirm title="确定删除此配置？" onConfirm={() => handleDeleteConfig(record.id)} okText="确定" cancelText="取消">
            <Button type="link" danger size="small">删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const taskColumns = [
    { title: '任务名称', dataIndex: 'name', key: 'name', ellipsis: true },
    { title: '关联配置', dataIndex: 'configId', key: 'configId', width: 100, render: (id) => id || '-' },
    { title: '执行时间', dataIndex: 'cronExpression', key: 'cronExpression', width: 120, render: (v) => v || '待后端支持' },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 80,
      render: (enabled, record) => (
        <Switch checked={enabled} onChange={(c) => handleTaskEnabledChange(c, record)} />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_, record) => (
        <Popconfirm title="确定删除此任务？" onConfirm={() => handleDeleteTask(record.id)} okText="确定" cancelText="取消">
          <Button type="link" danger size="small" icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div className="report-management">
      <Card title="报表管理">
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'export',
              label: '导出设置',
              children: (
                <div className="export-form">
                  <Form
                    form={form}
                    layout="vertical"
                    initialValues={{
                      period_type: 'daily',
                      format: 'excel',
                      dateRange: [dayjs().subtract(1, 'day'), dayjs().subtract(1, 'day')],
                    }}
                  >
                    <Form.Item name="period_type" label="报表类型" rules={[{ required: true }]}>
                      <Select style={{ width: 200 }}>
                        <Option value="daily">运维日报</Option>
                        <Option value="monthly">运维月报</Option>
                        <Option value="yearly">运维年报</Option>
                        <Option value="cabinet">按机柜/客户</Option>
                        <Option value="cabinet_view">机柜视图</Option>
                        <Option value="client_report">客户报表</Option>
                        <Option value="power_daily">弱电资源日报</Option>
                        <Option value="power_monthly">弱电资源月报</Option>
                        <Option value="power_yearly">弱电资源年报</Option>
                      </Select>
                    </Form.Item>
                    {!isCabinetView ? (
                      <Form.Item
                        name="dateRange"
                        label={periodType === 'yearly' || periodType === 'power_yearly' ? '选择年份' : periodType === 'monthly' || periodType === 'power_monthly' ? '选择月份' : '日期范围'}
                        rules={[{ required: true, message: periodType === 'yearly' || periodType === 'power_yearly' ? '请选择年份' : periodType === 'monthly' || periodType === 'power_monthly' ? '请选择月份' : '请选择日期范围' }]}
                      >
                        <DateRangeOrYearPicker periodType={periodType} />
                      </Form.Item>
                    ) : (
                      <Alert
                        type="info"
                        showIcon
                        style={{ marginBottom: 16, maxWidth: 560 }}
                        message="机柜视图导出说明"
                        description="机柜视图导出按当前机柜设备布局生成 PDF，不依赖日期范围；可先按客户筛选机柜，再多选导出，也可以只选择客户直接导出该客户全部机柜。"
                      />
                    )}
                    <Form.Item name="format" label="输出格式" rules={[{ required: true }]}>
                      <Select style={{ width: 120 }} disabled={isCabinetView}>
                        {!isCabinetView && <Option value="json">JSON</Option>}
                        {!isCabinetView && <Option value="excel">Excel</Option>}
                        <Option value="pdf">PDF</Option>
                      </Select>
                    </Form.Item>
                    <Form.Item
                      name="client_id"
                      label="客户筛选"
                      rules={periodType === 'client_report' ? [{ required: true, message: '客户报表请选择客户' }] : undefined}
                    >
                      <Select
                        allowClear
                        placeholder={periodType === 'client_report' ? '请选择客户' : (isCabinetView ? '可先按客户筛选机柜' : '全部客户')}
                        style={{ width: isCabinetView ? 280 : 200, maxWidth: '100%' }}
                        showSearch
                        optionFilterProp="label"
                        options={clientOptions}
                      />
                    </Form.Item>
                    {isCabinetView ? (
                      <>
                        <Form.Item
                          name="cabinet_ids"
                          label="机柜选择"
                          dependencies={['client_id']}
                          rules={[
                            ({ getFieldValue }) => ({
                              validator(_, value) {
                                const hasClient = !!getFieldValue('client_id');
                                if (hasClient || (Array.isArray(value) && value.length > 0)) {
                                  return Promise.resolve();
                                }
                                return Promise.reject(new Error('请选择至少一个机柜，或先选择客户'));
                              },
                            }),
                          ]}
                        >
                          <Select
                            mode="multiple"
                            allowClear
                            placeholder={selectedClientId ? '可留空，导出该客户全部机柜；也可继续多选指定机柜' : '请选择一个或多个机柜'}
                            style={{ width: 520, maxWidth: '100%' }}
                            showSearch
                            optionFilterProp="label"
                            options={cabinetOptions}
                            maxTagCount="responsive"
                          />
                        </Form.Item>
                        <Space wrap size={[8, 8]} style={{ marginTop: -8, marginBottom: 16 }}>
                          <Button size="small" onClick={handleSelectVisibleCabinets} disabled={cabinetOptions.length === 0}>
                            全选当前列表{cabinetOptions.length ? `（${cabinetOptions.length}个）` : ''}
                          </Button>
                          <Button size="small" onClick={handleClearSelectedCabinets} disabled={selectedCabinetIds.length === 0}>
                            清空已选
                          </Button>
                          <span style={{ color: '#667085' }}>
                            当前可选 {cabinetOptions.length} 个机柜，已选 {selectedCabinetIds.length} 个
                          </span>
                        </Space>
                      </>
                    ) : (
                      <Form.Item name="cabinet_id" label="机柜筛选">
                        <Select
                          allowClear
                          placeholder="全部机柜"
                          style={{ width: 200 }}
                          showSearch
                          optionFilterProp="label"
                          options={cabinetOptions}
                        />
                      </Form.Item>
                    )}
                    <Form.Item>
                      <Space>
                        <Button type="primary" icon={<DownloadOutlined />} loading={exporting} onClick={handleExport}>
                          立即导出
                        </Button>
                        <Button icon={<SaveOutlined />} onClick={handleOpenSaveConfig}>
                          保存为配置
                        </Button>
                      </Space>
                    </Form.Item>
                  </Form>
                </div>
              ),
            },
            {
              key: 'pdu-import',
              label: (
                <span>
                  <ThunderboltOutlined style={{ marginRight: 6 }} />
                  弱电数据导入
                </span>
              ),
              children: (
                <div className="export-form" style={{ maxWidth: 560 }}>
                  <Alert
                    message="导入说明"
                    description={
                      <span>
                        推荐直接上传 <strong>PDU 导出 JSON</strong> 文件（例如：PDU导出_20260225.json）；也支持按模板填写 Excel：<strong>时间</strong>（YYYY-MM-DD HH:MM）、<strong>端口标识</strong>、<strong>数据类型</strong>（current/power/energy/thd_current/switch_status）、<strong>数值</strong>、<strong>单位</strong>（可选）。端口标识须与系统中 PDU 端口一致。
                      </span>
                    }
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                  />
                  <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    <Button icon={<DownloadOutlined />} onClick={handleDownloadPduTemplate}>
                      下载导入模板
                    </Button>
                    <Upload
                      name="file"
                      accept=".json,.xlsx,.xls"
                      fileList={pduImportFileList}
                      beforeUpload={(file) => {
                        setPduImportFileList([{ uid: file.uid, name: file.name, status: 'done', originFileObj: file }]);
                        return false;
                      }}
                      onRemove={() => setPduImportFileList([])}
                      maxCount={1}
                    >
                      <Button icon={<InboxOutlined />}>选择 JSON 或 Excel 文件</Button>
                    </Upload>
                    <Button type="primary" loading={pduImporting} onClick={handlePduImport}>
                      开始导入
                    </Button>
                  </Space>
                  {pduImportResult && (
                    <div style={{ marginTop: 24 }}>
                      <p>
                        成功 <strong>{pduImportResult.created}</strong> 条，失败 <strong>{pduImportResult.failed}</strong> 条
                      </p>
                      {pduImportResult.errors?.length > 0 && (
                        <List
                          size="small"
                          dataSource={pduImportResult.errors}
                          renderItem={(item, idx) => (
                            <List.Item key={idx}>
                              第 {item.row} 行：{item.message}
                            </List.Item>
                          )}
                        />
                      )}
                    </div>
                  )}
                </div>
              ),
            },
            {
              key: 'configs',
              label: '配置管理',
              children: (
                <>
                  <div className="config-actions">
                    <Button icon={<ReloadOutlined />} onClick={loadConfigs}>刷新</Button>
                  </div>
                  <Table
                    rowKey="id"
                    columns={configColumns}
                    dataSource={configs}
                    pagination={{ pageSize: 10 }}
                    size="small"
                  />
                </>
              ),
            },
            {
              key: 'schedule',
              label: '定时任务',
              children: (
                <>
                  <div className="config-actions">
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenTaskModal()}>
                      创建任务
                    </Button>
                    <Button icon={<ReloadOutlined />} onClick={loadTasks}>刷新</Button>
                  </div>
                  <p className="schedule-tip">
                    定时执行需后端支持（如 Celery/cron），当前仅保存任务配置与启用状态。
                  </p>
                  <Table
                    rowKey="id"
                    columns={taskColumns}
                    dataSource={tasks}
                    pagination={{ pageSize: 10 }}
                    size="small"
                  />
                </>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="保存配置"
        open={saveConfigModalVisible}
        onOk={handleSaveConfig}
        onCancel={() => setSaveConfigModalVisible(false)}
        okText="保存"
        cancelText="取消"
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <span>配置名称：</span>
          <Input
            placeholder="请输入配置名称"
            value={configName}
            onChange={(e) => setConfigName(e.target.value)}
          />
        </Space>
      </Modal>

      <Modal
        title="创建定时任务"
        open={taskModalVisible}
        onOk={handleSaveTask}
        onCancel={() => setTaskModalVisible(false)}
        okText="保存"
        cancelText="取消"
      >
        <Form form={taskForm} layout="vertical" initialValues={{ enabled: true }}>
          <Form.Item name="_id" hidden />
          <Form.Item name="name" label="任务名称" rules={[{ required: true, message: '请输入任务名称' }]}>
            <Input placeholder="例如：每日日报导出" />
          </Form.Item>
          <Form.Item name="configId" label="关联导出配置">
            <Select allowClear placeholder="选择已保存的配置（可选）">
              {configs.map((c) => (
                <Option key={c.id} value={c.id}>{c.name}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="cronExpression" label="执行时间">
            <Input placeholder="待后端支持，如 0 9 * * *（每天9点）" />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ReportManagement;
