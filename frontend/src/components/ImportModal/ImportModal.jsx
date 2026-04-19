import React, { useState } from 'react';
import { Modal, Upload, Button, message, Typography, Alert, Tabs, Space } from 'antd';
import { InboxOutlined, DownloadOutlined, FileExcelOutlined, UserOutlined, DesktopOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';

const { Dragger } = Upload;
const { Paragraph, Text } = Typography;

/**
 * 根据机柜名称从列表中解析出机柜 ID
 * @param {string} cabinetName - 用户填写的机柜名称（如 F1B-01-01 或 01-01）
 * @param {Array} cabinets - 机柜列表，每项含 id, name, room（或 room_id）, room_name（可选）
 * @param {Array} rooms - 机房列表，每项含 id, name
 * @returns {number|undefined} 匹配的机柜 id，未匹配则 undefined
 */
function resolveCabinetId(cabinetName, cabinets = [], rooms = []) {
  const name = String(cabinetName || '').trim();
  if (!name || !cabinets.length) return undefined;
  const roomIdOf = (cabinet) => {
    const r = cabinet.room;
    if (r != null && typeof r === 'object') return r.id;
    if (cabinet.room_id != null) return cabinet.room_id;
    return r;
  };
  for (const cabinet of cabinets) {
    const rid = roomIdOf(cabinet);
    const room = rooms.find(r => Number(r.id) === Number(rid));
    const roomName = room ? (room.name || '') : (cabinet.room_name || '');
    const displayName = roomName ? `${roomName}-${cabinet.name}` : cabinet.name;
    const normalizedInput = name.replace(/\s+/g, '');
    const normalizedDisplay = displayName.replace(/\s+/g, '');
    const normalizedCabinetName = String(cabinet.name || '').replace(/\s+/g, '');
    if (
      displayName === name ||
      cabinet.name === name ||
      normalizedDisplay === normalizedInput ||
      normalizedCabinetName === normalizedInput
    ) {
      return cabinet.id;
    }
  }
  return undefined;
}

/**
 * 批量导入模态框组件 - 支持三Sheet Excel模板
 * @param {boolean} visible - 是否显示模态框
 * @param {function} onCancel - 取消回调
 * @param {function} onImport - 导入回调，接收 { personnel: [], devices: [], warehouseDevices: [] }
 * @param {string} importType - 导入类型 ('personnel' | 'devices' | 'both' | 'all')
 * @param {Array} cabinets - 可选，机柜列表，用于按名称解析机柜 ID
 * @param {Array} rooms - 可选，机房列表，用于机柜显示名匹配
 */
const ImportModal = ({ visible, onCancel, onImport, importType = 'both', cabinets = [], rooms = [] }) => {
  const [fileList, setFileList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);

  // 进场人员模板数据 - 只包含表头，示例数据放在列名中
  const personnelTemplate = [
    { 
      '姓名(例:张三)': '', 
      '身份证号(例:11010119900101001X)': '', 
      '联系方式(例:13800138000)': ''
    }
  ];

  // 设备上架模板数据 - 只包含表头，示例数据放在列名中
  const deviceTemplate = [
    {
      '品牌(例:Dell)': '',
      '型号(例:PowerEdge R730)': '',
      '序列号(例:ABC123456)': '',
      '设备类型(例:服务器)': '',
      '电源瓦数(例:750)': '',
      'U数(例:2)': '',
      '机架位置(例:1)': '',
      '电源类型(例:双电源)': '',
      '机柜名称(例:F1B-01-01)': ''
    }
  ];

  // 入库设备模板数据 - 只包含表头，示例数据放在列名中
  const warehouseDeviceTemplate = [
    {
      '品牌(例:Dell)': '',
      '型号(例:PowerEdge R730)': '',
      '序列号(例:ABC123456)': '',
      'U数(例:2)': '',
      '设备类型(例:服务器)': '',
      '电源类型(例:单电源)': '',
      '电源瓦数(例:750)': '',
      '仓库位置(例:机房楼1楼仓库)': '',
      '备注(例:新采购设备)': ''
    }
  ];

  /**
   * 下载包含三个Sheet的Excel模板
   */
  const downloadTemplate = () => {
    try {
      setDownloadLoading(true);
      
      // 创建工作簿
      const wb = XLSX.utils.book_new();
      
      // 创建进场人员Sheet
      const personnelWS = XLSX.utils.json_to_sheet(personnelTemplate);
      XLSX.utils.book_append_sheet(wb, personnelWS, '进场人员');
      
      // 创建设备上架Sheet
      const deviceWS = XLSX.utils.json_to_sheet(deviceTemplate);
      XLSX.utils.book_append_sheet(wb, deviceWS, '设备上架');
      
      // 创建入库设备Sheet
      const warehouseDeviceWS = XLSX.utils.json_to_sheet(warehouseDeviceTemplate);
      XLSX.utils.book_append_sheet(wb, warehouseDeviceWS, '入库设备');
      
      // 生成文件名
      const fileName = '批量导入模板_进场人员_设备上架_入库设备.xlsx';
      
      // 下载文件
      XLSX.writeFile(wb, fileName);
      
      message.success('模板文件下载成功！');
    } catch (error) {
      console.error('下载模板失败:', error);
      message.error('模板文件下载失败: ' + error.message);
    } finally {
      setDownloadLoading(false);
    }
  };

  /**
   * 处理文件上传和解析
   */
  const handleUpload = async ({ file }) => {
    if (!file) return;

    setLoading(true);
    try {
      const fileData = await readFileAsArrayBuffer(file);
      const workbook = XLSX.read(fileData, { type: 'array' });
      
      let personnelData = [];
      let deviceData = [];
      let warehouseDeviceData = [];
      
      // 解析进场人员Sheet
      if (workbook.SheetNames.includes('进场人员')) {
        const personnelWS = workbook.Sheets['进场人员'];
        const rawPersonnelData = XLSX.utils.sheet_to_json(personnelWS);
        personnelData = validatePersonnelData(rawPersonnelData);
      }
      
      // 解析设备上架Sheet
      if (workbook.SheetNames.includes('设备上架')) {
        const deviceWS = workbook.Sheets['设备上架'];
        const rawDeviceData = XLSX.utils.sheet_to_json(deviceWS);
        deviceData = validateDeviceData(rawDeviceData);
      }
      
      // 解析入库设备Sheet
      if (workbook.SheetNames.includes('入库设备')) {
        const warehouseDeviceWS = workbook.Sheets['入库设备'];
        const rawWarehouseDeviceData = XLSX.utils.sheet_to_json(warehouseDeviceWS);
        warehouseDeviceData = validateWarehouseDeviceData(rawWarehouseDeviceData);
      }
      
      // 检查是否有有效数据
      if (personnelData.length === 0 && deviceData.length === 0 && warehouseDeviceData.length === 0) {
        message.error('文件中没有有效数据，请检查Sheet名称和数据格式');
        setLoading(false);
        return;
      }
      
      // 显示解析结果
      const resultMessage = [];
      if (personnelData.length > 0) {
        resultMessage.push(`解析到 ${personnelData.length} 条进场人员记录`);
      }
      if (deviceData.length > 0) {
        resultMessage.push(`解析到 ${deviceData.length} 条设备上架记录`);
      }
      if (warehouseDeviceData.length > 0) {
        resultMessage.push(`解析到 ${warehouseDeviceData.length} 条入库设备记录`);
      }
      
      message.success(resultMessage.join('，'));
      
      // 调用导入回调
      await onImport({
        personnel: personnelData,
        devices: deviceData,
        warehouseDevices: warehouseDeviceData
      });
      
      // 清理状态
      setFileList([]);
      setLoading(false);
      
    } catch (error) {
      console.error('导入失败:', error);
      message.error('文件解析失败，请检查文件格式');
      setLoading(false);
    }
  };

  /**
   * 读取文件为ArrayBuffer
   */
  const readFileAsArrayBuffer = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  /**
   * 验证进场人员数据
   * 处理可能带有示例括号的列名
   */
  const validatePersonnelData = (data) => {
    return data.filter(item => {
      // 尝试不同可能的列名格式（带括号和不带括号）
      const name = item['姓名'] || item['姓名(例:张三)'] || '';
      const idCard = item['身份证号'] || item['身份证号(例:11010119900101001X)'] || '';
      const contact = item['联系方式'] || item['联系方式(例:13800138000)'] || '';
      
      return name && idCard && contact;
    }).map(item => {
      // 尝试不同可能的列名格式
      const name = item['姓名'] || item['姓名(例:张三)'] || '';
      const idCard = item['身份证号'] || item['身份证号(例:11010119900101001X)'] || '';
      const contact = item['联系方式'] || item['联系方式(例:13800138000)'] || '';
      
      return {
        name: String(name).trim(),
        id_card: String(idCard).trim(),
        contact_info: String(contact).trim()
      };
    });
  };

  /**
   * 验证设备数据
   * 处理可能带有示例括号的列名
   */
  const validateDeviceData = (data) => {
    return data.filter(item => {
      // 尝试不同可能的列名格式（带括号和不带括号）
      const brand = item['品牌'] || item['品牌(例:Dell)'] || '';
      const model = item['型号'] || item['型号(例:PowerEdge R730)'] || '';
      const sn = item['序列号'] || item['序列号(例:ABC123456)'] || '';
      
      return brand && model && sn;
    }).map(item => {
      // 尝试不同可能的列名格式
      const brand = item['品牌'] || item['品牌(例:Dell)'] || '';
      const model = item['型号'] || item['型号(例:PowerEdge R730)'] || '';
      const sn = item['序列号'] || item['序列号(例:ABC123456)'] || '';
      const deviceType = item['设备类型'] || item['设备类型(例:服务器)'] || item['设备类型(例:server)'] || 'other';
      const powerWattage = item['电源瓦数'] || item['电源瓦数(例:750)'] || 0;
      const uSize = item['U数'] || item['U数(例:2)'] || 1;
      const rackPosition = item['机架位置'] || item['机架位置(例:1)'] || 1;
      const powerTypeText = String(item['电源类型'] ?? item['电源类型(例:双电源)'] ?? '单电源').trim();
      // 将电源类型文本转换为代码（支持：双电源、dual、单电源、single 及含「双」的表述）
      let powerType = 'single';
      let powerLabel = '单电源';
      if (powerTypeText === '双电源' || powerTypeText === 'dual' || powerTypeText.includes('双')) {
        powerType = 'dual';
        powerLabel = '双电源';
      } else if (powerTypeText === '单电源' || powerTypeText === 'single') {
        powerType = 'single';
        powerLabel = '单电源';
      }
      const cabinetName = item['机柜名称'] || item['机柜名称(例:F1B-01-01)'] || '';
      // 根据机柜名称解析机柜 ID，若未传入 cabinets 或未匹配则不填，由用户在表单中再选
      const cabinetId = resolveCabinetId(cabinetName, cabinets, rooms);
      
      // 设备类型转换，如果是中文描述，转为对应的英文代码
      let deviceTypeCode = deviceType;
      if (deviceType === '服务器') {
        deviceTypeCode = 'server';
      } else if (deviceType === '交换机') {
        deviceTypeCode = 'switch';
      } else if (deviceType === '路由器') {
        deviceTypeCode = 'router';
      } else if (deviceType === '防火墙') {
        deviceTypeCode = 'firewall';
      } else if (deviceType === '存储设备') {
        deviceTypeCode = 'storage';
      } else if (deviceType === 'UPS') {
        deviceTypeCode = 'ups';
      } else if (deviceType === 'PDU') {
        deviceTypeCode = 'pdu';
      }
      
      return {
        brand: String(brand).trim(),
        model: String(model).trim(),
        sn: String(sn).trim(),
        device_type: deviceTypeCode,
        power_wattage: Number(powerWattage) || 0,
        u_size: Number(uSize) || 1,
        rack_position: Number(rackPosition) || 1,
        power_type: powerType,
        power: powerLabel,
        cabinet: cabinetId != null ? Number(cabinetId) : undefined,
        cabinet_name: String(cabinetName).trim()
      };
    });
  };

  /**
   * 验证入库设备数据
   * 处理可能带有示例括号的列名
   */
  const validateWarehouseDeviceData = (data) => {
    return data.filter(item => {
      // 尝试不同可能的列名格式（带括号和不带括号）
      const brand = item['品牌'] || item['品牌(例:Dell)'] || '';
      const model = item['型号'] || item['型号(例:PowerEdge R730)'] || '';
      const sn = item['序列号'] || item['序列号(例:ABC123456)'] || '';
      
      return brand && model && sn;
    }).map(item => {
      // 尝试不同可能的列名格式
      const brand = item['品牌'] || item['品牌(例:Dell)'] || '';
      const model = item['型号'] || item['型号(例:PowerEdge R730)'] || '';
      const sn = item['序列号'] || item['序列号(例:ABC123456)'] || '';
      const uSize = item['U数'] || item['U数(例:2)'] || 1;
      const deviceType = item['设备类型'] || item['设备类型(例:服务器)'] || item['设备类型(例:server)'] || 'other';
      const powerType = item['电源类型'] || item['电源类型(例:单电源)'] || 'single';
      const powerWattage = item['电源瓦数'] || item['电源瓦数(例:750)'] || null;
      const warehouseLocation = item['仓库位置'] || item['仓库位置(例:机房楼1楼仓库)'] || '';
      const notes = item['备注'] || item['备注(例:新采购设备)'] || '';
      
      // 设备类型转换，如果是中文描述，转为对应的英文代码
      let deviceTypeCode = deviceType;
      if (deviceType === '服务器') {
        deviceTypeCode = 'server';
      } else if (deviceType === '交换机') {
        deviceTypeCode = 'switch';
      } else if (deviceType === '路由器') {
        deviceTypeCode = 'router';
      } else if (deviceType === '防火墙') {
        deviceTypeCode = 'firewall';
      } else if (deviceType === '存储设备') {
        deviceTypeCode = 'storage';
      } else if (deviceType === 'UPS') {
        deviceTypeCode = 'ups';
      } else if (deviceType === 'PDU') {
        deviceTypeCode = 'pdu';
      }
      
      // 电源类型转换
      let powerTypeCode = powerType;
      if (powerType === '单电源' || powerType === 'single') {
        powerTypeCode = 'single';
      } else if (powerType === '双电源' || powerType === 'dual') {
        powerTypeCode = 'dual';
      }
      
      return {
        brand: String(brand).trim(),
        model: String(model).trim(),
        sn: String(sn).trim(),
        u_size: Number(uSize) || 1,
        device_type: deviceTypeCode,
        power_type: powerTypeCode,
        power_wattage: powerWattage ? Number(powerWattage) : null,
        warehouse_location: String(warehouseLocation).trim() || null,
        notes: String(notes).trim() || null
      };
    });
  };

  /**
   * 处理模态框关闭
   */
  const handleCancel = () => {
    setFileList([]);
    setLoading(false);
    onCancel();
  };

  const uploadProps = {
    name: 'file',
    multiple: false,
    fileList,
    customRequest: handleUpload,
    onChange: ({ fileList: newFileList }) => setFileList(newFileList),
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
      return true;
    }
  };

  return (
    <Modal
      title={
        <Space>
          <FileExcelOutlined />
          批量导入 - 进场人员、设备上架与入库设备
        </Space>
      }
      open={visible}
      onCancel={handleCancel}
      footer={[
        <Button key="cancel" onClick={handleCancel} disabled={loading || downloadLoading}>
          取消
        </Button>,
        <Button 
          key="download" 
          type="primary"
          icon={<DownloadOutlined />} 
          onClick={downloadTemplate}
          loading={downloadLoading}
          disabled={loading}
        >
          下载模板
        </Button>
      ]}
      width={700}
    >
      <div style={{ marginBottom: 16 }}>
        <Alert
          message="三Sheet Excel模板"
          description="此功能支持在一个Excel文件中同时导入进场人员、设备上架和入库设备信息，包含三个工作表：「进场人员」、「设备上架」和「入库设备」"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        
        <Button 
          type="primary" 
          ghost 
          icon={<DownloadOutlined />} 
          onClick={downloadTemplate}
          style={{ marginBottom: 16 }}
          size="large"
          block
          loading={downloadLoading}
        >
          📥 下载三Sheet模板（进场人员 + 设备上架 + 入库设备）
        </Button>
      </div>

      <Tabs 
        defaultActiveKey="upload"
        items={[
          {
            key: 'upload',
            label: (
              <Space>
                <InboxOutlined />
                文件上传
              </Space>
            ),
            children: (
              <div>
                <Dragger {...uploadProps} style={{ marginBottom: 16 }}>
                  <p className="ant-upload-drag-icon">
                    <InboxOutlined />
                  </p>
                  <p className="ant-upload-text">点击或拖拽Excel文件到此区域上传</p>
                  <p className="ant-upload-hint">
                    支持 .xlsx 和 .xls 格式，文件大小不超过10MB
                  </p>
                </Dragger>

                {loading && (
                  <Alert
                    message="正在处理文件..."
                    description="正在解析Excel文件中的进场人员、设备上架和入库设备信息，请稍候"
                    type="info"
                    showIcon
                  />
                )}
              </div>
            )
          },
          {
            key: 'template',
            label: (
              <Space>
                <FileExcelOutlined />
                模板说明
              </Space>
            ),
            children: (
              <div>
                <Paragraph>
                  <Text strong>模板包含三个工作表（Sheet）：</Text>
                </Paragraph>
                
                <div style={{ marginBottom: 16 }}>
                  <Text strong>
                    <UserOutlined style={{ marginRight: 8 }} />
                    工作表1：「进场人员」
                  </Text>
                  <ul style={{ marginTop: 8, marginLeft: 16 }}>
                    <li><Text code>姓名(例:张三)</Text> - 必填，进场人员姓名</li>
                    <li><Text code>身份证号(例:11010119900101001X)</Text> - 必填，18位身份证号码</li>
                    <li><Text code>联系方式(例:13800138000)</Text> - 必填，手机号码</li>
                  </ul>
                </div>
                
                <div style={{ marginBottom: 16 }}>
                  <Text strong>
                    <DesktopOutlined style={{ marginRight: 8 }} />
                    工作表2：「设备上架」
                  </Text>
                  <ul style={{ marginTop: 8, marginLeft: 16 }}>
                    <li><Text code>品牌(例:Dell)</Text> - 必填，设备品牌</li>
                    <li><Text code>型号(例:PowerEdge R730)</Text> - 必填，设备型号</li>
                    <li><Text code>序列号(例:ABC123456)</Text> - 必填，设备SN</li>
                    <li><Text code>设备类型(例:服务器)</Text> - 可选，如：服务器、交换机等</li>
                    <li><Text code>电源瓦数(例:750)</Text> - 可选，设备功耗（数字）</li>
                    <li><Text code>U数(例:2)</Text> - 可选，占用机架U数（数字）</li>
                    <li><Text code>机架位置(例:1)</Text> - 可选，起始U位（数字）</li>
                    <li><Text code>电源类型(例:双电源)</Text> - 可选，如：单电源、双电源</li>
                    <li><Text code>机柜名称(例:F1B-01-01)</Text> - 可选，机柜标识，如：F1B-01-01</li>
                  </ul>
                </div>
                
                <div style={{ marginBottom: 16 }}>
                  <Text strong>
                    <InboxOutlined style={{ marginRight: 8 }} />
                    工作表3：「入库设备」
                  </Text>
                  <ul style={{ marginTop: 8, marginLeft: 16 }}>
                    <li><Text code>品牌(例:Dell)</Text> - 必填，设备品牌</li>
                    <li><Text code>型号(例:PowerEdge R730)</Text> - 必填，设备型号</li>
                    <li><Text code>序列号(例:ABC123456)</Text> - 必填，设备SN</li>
                    <li><Text code>U数(例:2)</Text> - 必填，占用机架U数（数字）</li>
                    <li><Text code>设备类型(例:服务器)</Text> - 可选，如：服务器、交换机等</li>
                    <li><Text code>电源类型(例:单电源)</Text> - 可选，如：单电源、双电源</li>
                    <li><Text code>电源瓦数(例:750)</Text> - 可选，设备功耗（数字）</li>
                    <li><Text code>仓库位置(例:机房楼1楼仓库)</Text> - 可选，设备在仓库中的存储位置</li>
                    <li><Text code>备注(例:新采购设备)</Text> - 可选，备注信息</li>
                  </ul>
                </div>
                
                <Alert
                  message="注意事项"
                  description={
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      <li>Excel文件必须包含「进场人员」、「设备上架」和「入库设备」三个工作表</li>
                      <li>表头中已包含示例数据，括号中的内容仅作参考</li>
                      <li>可以只填写其中一个或几个表，其他表可以为空</li>
                      <li>建议先下载模板，在模板基础上填写数据</li>
                    </ul>
                  }
                  type="warning"
                  showIcon
                />
              </div>
            )
          }
        ]}
      />
    </Modal>
  );
};

export default ImportModal; 