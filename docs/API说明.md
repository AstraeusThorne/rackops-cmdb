# API说明

## 1. 基本约定

## 1.1 Base URL

开发环境默认：

```text
http://127.0.0.1:8000/api/
```

健康检查：

```text
GET /api/health/
```

## 1.2 认证方式

项目采用 JWT。

请求头格式：

```http
Authorization: Bearer <access_token>
```

登录后会得到：

- `access`
- `refresh`
- `user`

刷新 Token：

```http
POST /api/token/refresh/
```

## 1.3 分页规则

大多数列表接口使用统一分页器：

- 默认 `page_size=20`
- 最大 `page_size=200`
- 支持 `?page=`、`?page_size=`
- 页码超范围时返回 `200` 和空 `results`，不返回 `404`

典型分页响应：

```json
{
  "count": 125,
  "next": "http://127.0.0.1:8000/api/devices/?page=2",
  "previous": null,
  "results": []
}
```

例外：

- `cabinet-pdu-data` 禁用分页，历史数据查询直接返回完整结果

## 1.4 权限约定

整体规则：

- 大部分基础资源 `list` / `retrieve` 允许匿名读取
- 写操作默认需要登录
- 部分管理接口仅管理员可访问

重点管理员接口：

- `operation-story-import/*`
- `data-export/*`
- `history/*`
- `duty-personnel/pending_approvals`
- `duty-personnel/{id}/approve`
- `duty-personnel/{id}/reject`

## 2. 认证接口

## 2.1 注册

```http
POST /api/auth/register/
```

请求体：

```json
{
  "username": "admin",
  "email": "admin@example.com",
  "first_name": "Rack",
  "last_name": "Ops",
  "password": "password123",
  "password_confirm": "password123"
}
```

## 2.2 登录

```http
POST /api/auth/login/
```

请求体：

```json
{
  "username": "admin",
  "password": "password123"
}
```

响应示例：

```json
{
  "refresh": "jwt-refresh-token",
  "access": "jwt-access-token",
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@example.com"
  }
}
```

## 2.3 获取当前用户

```http
GET /api/auth/me/
GET /api/auth/profile/
```

## 2.4 修改密码

```http
POST /api/auth/change_password/
```

请求体：

```json
{
  "old_password": "old-pass",
  "new_password": "new-pass-123",
  "new_password_confirm": "new-pass-123"
}
```

## 3. 公共与系统接口

## 3.1 健康检查

```http
GET /api/health/
```

用途：

- 服务存活检查
- `default` / `pdu` 数据库连通性检查
- 返回部分摘要统计

## 3.2 客户 / 授权单位

```http
GET    /api/clients/
POST   /api/clients/
GET    /api/clients/{id}/
PUT    /api/clients/{id}/
DELETE /api/clients/{id}/

GET    /api/authorized-orgs/
POST   /api/authorized-orgs/
GET    /api/authorized-orgs/{id}/
PUT    /api/authorized-orgs/{id}/
DELETE /api/authorized-orgs/{id}/
```

## 3.3 值班人员

```http
GET  /api/duty-personnel/
GET  /api/duty-personnel/{id}/
POST /api/duty-personnel/register/
GET  /api/duty-personnel/pending_approvals/
POST /api/duty-personnel/{id}/approve/
POST /api/duty-personnel/{id}/reject/
```

`register` 请求体示例：

```json
{
  "employee_id": "A001",
  "name": "张三",
  "id_card": "110101199001011234",
  "phone": "13800138000",
  "type": "运维",
  "password": "password123",
  "email": "zhangsan@example.com"
}
```

## 3.4 系统配置

```http
GET    /api/config/
GET    /api/config/{key}/
POST   /api/config/
PUT    /api/config/{key}/
DELETE /api/config/{key}/
GET    /api/config/get_by_category/?category=pdu_report
POST   /api/config/bulk_update/
```

配置分类：

- `alert_thresholds`
- `display_settings`
- `pdu_report`

`bulk_update` 请求体：

```json
{
  "configs": [
    {
      "key": "pdu_high_utilization_threshold",
      "value": 80,
      "category": "pdu_report",
      "description": "PDU高利用率阈值"
    }
  ]
}
```

## 3.5 历史与通知

### 变更历史

```http
GET  /api/history/
GET  /api/history/?content_type=devices.Device&object_id=12
GET  /api/history/duty_personnel_stats/?days=30
POST /api/history/{id}/revert/
POST /api/history/batch_revert/
```

筛选参数：

- `content_type`
- `object_id`
- `action`
- `is_admin_action`
- `start_date`
- `end_date`
- `reverted`

### 通知

```http
GET  /api/notifications/
GET  /api/notifications/unread_count/
POST /api/notifications/{id}/mark_read/
POST /api/notifications/mark_all_read/
```

## 4. 资产管理接口

## 4.1 机房

```http
GET /api/rooms/
GET /api/rooms/{id}/
GET /api/rooms/{id}/cabinets-with-stats/
GET /api/rooms/cabinet-counts/
GET /api/rooms/usage-stats/
```

说明：

- `cabinets-with-stats`：返回某机房下机柜及设备数
- `cabinet-counts`：按机房统计机柜数量
- `usage-stats`：首页机房使用率统计

## 4.2 机柜

```http
GET /api/cabinets/
GET /api/cabinets/{id}/
```

常用筛选：

- `?room=1`
- `?client=3`

## 4.3 在用设备

```http
GET    /api/devices/
POST   /api/devices/
GET    /api/devices/{id}/
PUT    /api/devices/{id}/
DELETE /api/devices/{id}/
POST   /api/devices/{id}/decommission/
GET    /api/devices/{id}/events/
```

常用筛选：

- `search`
- `room`
- `cabinet`
- `client`
- `device_type`
- `ordering=installation_date`
- `ordering=-installation_date`

`decommission` 请求体示例：

```json
{
  "decommission_reason": "设备替换",
  "status": "decommissioned",
  "event_id": 15
}
```

## 4.4 下架设备

```http
GET /api/decommissioned-devices/
GET /api/decommissioned-devices/{id}/
```

常用筛选：

- `search`
- `start_date`
- `end_date`
- `client`

## 4.5 设备告警

```http
GET  /api/device-alerts/
POST /api/device-alerts/
GET  /api/device-alerts/{id}/
PUT  /api/device-alerts/{id}/
GET  /api/device-alerts/download-import-template/
GET  /api/device-alerts/export/
POST /api/device-alerts/batch-import/
```

说明：

- 支持按 `search`、`status` 导出 Excel
- `batch-import` 使用 `multipart/form-data` 上传 Excel

## 4.6 仓库设备

```http
GET    /api/warehouse-devices/
POST   /api/warehouse-devices/
GET    /api/warehouse-devices/{id}/
PUT    /api/warehouse-devices/{id}/
DELETE /api/warehouse-devices/{id}/
POST   /api/warehouse-devices/{id}/install/
POST   /api/warehouse-devices/{id}/out_of_warehouse/
GET    /api/warehouse-device-history/
```

常用筛选：

- `warehouse-devices?status=in_warehouse`
- `warehouse-devices?search=SN123`
- `warehouse-device-history?warehouse_device=10`

`install` 请求体示例：

```json
{
  "cabinet_id": 8,
  "rack_position": "10-11",
  "install_location": "F1D-08-01",
  "action_date": "2026-04-19",
  "action_time": "14:30:00",
  "event_id": 25,
  "notes": "从仓库上架到目标机柜"
}
```

## 5. 事件管理接口

## 5.1 事件主表

```http
GET    /api/events/
POST   /api/events/
GET    /api/events/{id}/
PUT    /api/events/{id}/
DELETE /api/events/{id}/
```

常用筛选：

- `start_date`
- `end_date`
- `client`
- `room`
- `order_number`
- `completion_status`
- `ordering=date`
- `ordering=-date`

创建事件示例：

```json
{
  "date": "2026-04-19",
  "start_time": "09:00:00",
  "end_time": "11:00:00",
  "completion_status": false,
  "description": "机柜设备上架",
  "client_ids": [1],
  "room_ids": [2],
  "authorized_org_ids": [1],
  "duty_personnel_ids": [3],
  "entry_personnel_ids": [5],
  "device_ids": [10, 11]
}
```

## 5.2 进场人员

```http
GET    /api/entry-personnel/
POST   /api/entry-personnel/
GET    /api/entry-personnel/{id}/
PUT    /api/entry-personnel/{id}/
DELETE /api/entry-personnel/{id}/
```

## 5.3 事件关联表

### 事件 - 进场人员

```http
GET  /api/event-entry-personnel/
POST /api/event-entry-personnel/
POST /api/event-entry-personnel/batch_create/
```

请求体：

```json
{
  "event_id": 1,
  "entry_personnel_ids": [2, 3, 4]
}
```

### 事件 - 在用设备

```http
GET  /api/event-devices/
POST /api/event-devices/
POST /api/event-devices/batch_create/
```

请求体：

```json
{
  "event_id": 1,
  "device_ids": [11, 12]
}
```

### 事件 - 下架设备

```http
GET  /api/event-decommissioned-devices/
POST /api/event-decommissioned-devices/
POST /api/event-decommissioned-devices/batch_create/
```

### 事件 - 仓库设备

```http
GET  /api/event-warehouse-devices/
POST /api/event-warehouse-devices/
POST /api/event-warehouse-devices/batch_create/
```

## 6. PDU 与弱电接口

说明：

- `pdu-devices`、`pdu-ports`、`cabinet-pdu-data` 的基础 `list/retrieve` 读取能力可匿名访问
- PDU 相关自定义聚合、模板下载、批量导入等 action 需要登录

## 6.1 PDU 设备

```http
GET /api/pdu-devices/
GET /api/pdu-devices/{id}/
```

常用筛选：

- `room`
- `circuit_type`

## 6.2 PDU 端口

```http
GET /api/pdu-ports/
GET /api/pdu-ports/{id}/
GET /api/pdu-ports/batch_by_cabinets/?cabinet_ids=1,2,3
```

常用筛选：

- `pdu_device`
- `cabinet`

`batch_by_cabinets` 参数：

- `cabinet_ids`：逗号分隔
- `group_by_cabinet=true|false`

## 6.3 PDU 数据

```http
GET  /api/cabinet-pdu-data/
POST /api/cabinet-pdu-data/
GET  /api/cabinet-pdu-data/latest/?pdu_port=10
GET  /api/cabinet-pdu-data/batch_latest_by_cabinets/?cabinet_ids=1,2,3
GET  /api/cabinet-pdu-data/download-import-template/
POST /api/cabinet-pdu-data/batch-import/
```

常用筛选：

- `pdu_port`
- `data_type`
- `start_time`
- `end_time`
- `source`
- `import_batch`

特殊说明：

- `latest`：返回单端口各数据类型最新值
- `batch_latest_by_cabinets`：按机柜批量聚合最新弱电数据
- `batch-import`：支持 Excel 和 JSON 两种格式

`batch-import` JSON 结构示例：

```json
{
  "date": "2026-02-25",
  "rows": [
    {
      "date": "2026-02-25",
      "hour": 0,
      "port_identifier": "F1D-PDUA-1-01",
      "current": 2.87,
      "power": 630,
      "energy": 16838.84,
      "thd_current": 0,
      "switch_status": "开启"
    }
  ]
}
```

## 7. 运维故事导入与数据导出

## 7.1 运维故事导入

仅管理员可访问。

```http
GET  /api/operation-story-import/download_template/
POST /api/operation-story-import/upload/
POST /api/operation-story-import/import_data/
POST /api/operation-story-import/rollback/
GET  /api/operation-story-import/import_history/
```

用途：

- 下载标准 Excel 模板
- 上传后预览
- 执行正式导入
- 按 `batch_id` 回滚
- 查看导入历史

`upload` / `import_data`：

- 使用 `multipart/form-data`
- 文件字段名：`file`
- 可传 `options`

`options` 示例：

```json
{
  "batch_id": "BATCH_20260419_100000",
  "incremental": true,
  "personnel_sheet": "人员进出",
  "install_sheet": "上架汇总",
  "decommission_sheet": "下架汇总"
}
```

## 7.2 数据导出

仅管理员可访问。

```http
GET /api/data-export/events/
GET /api/data-export/personnel/
GET /api/data-export/install/
GET /api/data-export/decommission/
GET /api/data-export/all/
```

公共筛选参数：

- `date_from=YYYY-MM-DD`
- `date_to=YYYY-MM-DD`

## 8. 报表接口

```http
GET  /api/reports/generate/
POST /api/reports/generate/
```

需要登录。

请求参数：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `period_type` | 是 | `daily`、`weekly`、`monthly`、`yearly`、`cabinet`、`client_report`、`power_daily`、`power_monthly`、`power_yearly`、`cabinet_view` |
| `start_date` | 是 | 开始日期 |
| `end_date` | 是 | 结束日期 |
| `format` | 否 | `json`、`excel`、`pdf` |
| `client_id` | 否 | 客户过滤；`client_report` 时必填 |
| `cabinet_id` | 否 | 单机柜过滤 |
| `cabinet_ids` | 否 | 多机柜过滤；`cabinet_view` 优先使用 |

示例：

```json
{
  "period_type": "monthly",
  "start_date": "2026-04-01",
  "end_date": "2026-04-30",
  "format": "excel",
  "client_id": 3
}
```

特殊规则：

- `cabinet_view` 仅支持 `pdf`
- `client_report` 必须传 `client_id`

## 9. 常见调用示例

## 9.1 登录并调用受保护接口

```bash
curl -X POST http://127.0.0.1:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password123"}'
```

```bash
curl http://127.0.0.1:8000/api/notifications/ \
  -H "Authorization: Bearer <access_token>"
```

## 9.2 查询设备

```bash
curl "http://127.0.0.1:8000/api/devices/?search=R740&room=2&page=1&page_size=20"
```

## 9.3 设备下架

```bash
curl -X POST http://127.0.0.1:8000/api/devices/12/decommission/ \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"decommission_reason":"硬件故障","status":"decommissioned","event_id":15}'
```

## 9.4 生成报表

```bash
curl -X POST http://127.0.0.1:8000/api/reports/generate/ \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"period_type":"power_monthly","start_date":"2026-04-01","end_date":"2026-04-30","format":"json"}'
```

## 10. 文档维护建议

新增或调整接口时，建议同步更新以下内容：

- 是否匿名可读 / 是否需要认证
- 是否分页
- 是否支持筛选参数
- 是否有自定义 action
- 是否有导入导出模板或文件流返回
