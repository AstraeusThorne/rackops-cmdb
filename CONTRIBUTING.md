# 贡献指南

感谢你关注 RackOps CMDB。

这份仓库当前以“稳定交付、清晰协作、避免泄露环境信息”为优先原则。提交代码前，建议先通读本文档，再开始分支开发或提交 Pull Request。

## 开发环境

### 后端

```bash
cd backend
cp .env.example .env
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py runserver
```

### 前端

```bash
cd frontend
cp .env.example .env
npm ci
npm start
```

## 分支与提交建议

- 默认分支为 `main`
- 新功能建议从 `main` 拉出独立分支，例如 `feat/device-export`
- 缺陷修复建议使用清晰短分支名，例如 `fix/pdu-switch-status`

提交信息建议保持简洁，并使用统一前缀：

- `feat:` 新功能
- `fix:` 缺陷修复
- `docs:` 文档变更
- `refactor:` 重构
- `chore:` 杂项维护
- `test:` 测试相关

示例：

```text
feat: add warehouse device export filter
fix: correct cabinet pdu offline status handling
chore: clear frontend warnings and tighten ci
```

## 提交前检查

提交前请至少完成以下检查：

```bash
python3 -m compileall backend
cd frontend && npx eslint src --ext .js,.jsx
cd frontend && npm run build
```

如果你的改动涉及接口、文档、环境变量或仓库结构，请同步更新相关说明文件。

## Pull Request 约定

请在 PR 中说明以下内容：

- 改了什么
- 为什么要改
- 影响范围
- 如何验证
- 是否包含截图或录屏

对于前端页面、表单、图表或交互改动，建议附上截图。

对于数据库、配置或权限改动，建议明确说明：

- 是否需要新增环境变量
- 是否需要执行迁移
- 是否影响历史数据或现网行为

## 敏感信息与仓库卫生

请不要提交以下内容：

- 真实密钥、Token、账号口令
- 本地 `.env`
- 数据库备份、导入导出结果、Excel 临时文件
- `node_modules`、`build`、`dist`、Python 缓存文件
- 含内网地址、客户敏感信息、设备敏感标识的临时文件

如果你发现潜在敏感信息已经进入版本历史，请不要在 Issue 中直接公开内容，优先联系仓库维护者处理。

## 文档同步

以下情况下请同步更新文档：

- 新增或删除 API：更新 `docs/API说明.md`
- 调整模型或数据关系：更新 `docs/数据库设计.md`
- 调整启动方式、目录结构、依赖或仓库说明：更新 `README.md`

## Issue 建议

提交 Issue 时，请尽量提供：

- 复现步骤
- 预期结果
- 实际结果
- 浏览器 / 系统环境
- 关键报错日志或截图

这样能显著降低排查成本，也更方便后续协作。
