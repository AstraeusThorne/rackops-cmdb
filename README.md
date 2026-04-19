# RackOps CMDB

[![CI](https://github.com/AstraeusThorne/rackops-cmdb/actions/workflows/ci.yml/badge.svg)](https://github.com/AstraeusThorne/rackops-cmdb/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

RackOps CMDB 是一个面向机房运维场景的配置管理平台，覆盖机房、机柜、在用设备、下架设备、仓库设备、事件流转、值班人员、PDU 弱电数据与报表输出等核心能力。

项目当前采用前后端分离架构：

- `frontend/`：React 18 + Ant Design 前端
- `backend/`：Django 4 + Django REST Framework 后端

## 项目能力

- 机房、机柜、设备、仓库设备的全生命周期管理
- 事件管理与进场人员、客户、授权单位、值班人员联动
- 设备下架、仓库入库、上架、出库等业务闭环
- PDU 端口与弱电数据采集、导入、聚合查询
- 模型变更历史、消息通知、系统配置管理
- 运营日报 / 月报 / 年报、客户报表、弱电报表生成与导出

## 技术栈

### 前端

- React 18
- React Router 6
- Ant Design 5
- Axios
- ECharts / Recharts

### 后端

- Django 4.2
- Django REST Framework
- Simple JWT
- PostgreSQL
- OpenPyXL / ReportLab

## 仓库结构

```text
rackops-cmdb/
├── backend/                 Django 后端
│   ├── cmdb_project/        项目配置、路由、分页、数据库路由
│   ├── common/              公共主数据、系统配置、历史、通知
│   ├── devices/             机房/机柜/设备/PDU/仓库设备
│   ├── events/              事件、进场人员、导入导出
│   ├── report/              报表生成与导出
│   └── users/               用户与认证
├── frontend/                React 前端
└── docs/                    项目文档
```

## 快速启动

### 1. 启动后端

```bash
cd backend
cp .env.example .env
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py runserver
```

后端默认地址：`http://127.0.0.1:8000`

### 2. 启动前端

```bash
cd frontend
cp .env.example .env
npm install
npm start
```

前端默认地址：`http://127.0.0.1:3000`

## 环境变量

后端需要重点配置：

- `SECRET_KEY`
- `DEBUG`
- `ALLOWED_HOSTS`
- `DB_DEFAULT_*`
- `DB_PDU_*`
- `PDU_API_BASE_URL`
- `PDU_API_USERNAME`
- `PDU_API_PASSWORD`

前端常用配置：

- `REACT_APP_API_BASE_URL`
- `REACT_APP_ENV`
- `REACT_APP_CACHE_TIME`

参考文件：

- [backend/.env.example](./backend/.env.example)
- [frontend/.env.example](./frontend/.env.example)

## 数据库说明

项目使用双数据库设计：

- `default`：承载用户、事件、机房、机柜、设备、仓库、消息、配置等核心业务数据
- `pdu`：承载 `PDUDevice`、`PDUPort`、`CabinetPDUData` 三张弱电数据表

PDU 相关模型通过数据库路由自动读写到 `pdu` 数据库，和主业务库之间通过 `room_id`、`cabinet_id` 等逻辑字段关联，而不是直接建跨库外键。

## 文档导航

- [数据库设计](./docs/数据库设计.md)
- [API说明](./docs/API说明.md)
- [贡献指南](./CONTRIBUTING.md)

## API 概览

后端统一以 `/api/` 为前缀，典型能力包括：

- 认证：`/api/auth/login/`、`/api/auth/register/`、`/api/auth/me/`
- 基础资源：`/api/rooms/`、`/api/cabinets/`、`/api/devices/`、`/api/events/`
- PDU：`/api/pdu-devices/`、`/api/pdu-ports/`、`/api/cabinet-pdu-data/`
- 报表：`/api/reports/generate/`
- 导入导出：`/api/operation-story-import/*`、`/api/data-export/*`

详细参数、权限和示例见 [API说明](./docs/API说明.md)。

## 开发说明

- 大部分基础资源接口支持匿名读取，写操作需要登录
- 默认分页每页 `20` 条，可通过 `?page_size=` 调整，最大 `200`
- 超出页码范围时返回 `200 + 空 results`，便于前端筛选联动
- 报表生成、历史回退、运维故事导入导出等能力带有更严格的权限要求

## 推送到 GitHub 前建议

1. 检查 `backend/.env` 是否已经替换为真实配置。
2. 确认没有将数据库备份、Excel 临时文件、导入记录等本地数据放入仓库。
3. 在仓库根目录执行：

```bash
git init
git add .
git commit -m "Initial import"
```
