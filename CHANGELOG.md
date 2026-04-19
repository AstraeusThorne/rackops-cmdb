# 更新日志

本文档用于记录 RackOps CMDB 仓库在 GitHub 公开整理后的关键变更。

记录方式参考 Keep a Changelog 思路，但会更偏向当前仓库的实际维护节奏。

## [Unreleased]

### Changed

- 暂无未发布变更

## [2026-04-19]

### Added

- 建立 GitHub 可公开维护的仓库结构，整理前后端代码目录
- 补充项目总览文档、数据库设计文档与 API 说明文档
- 增加 `.env.example`、仓库级 `.gitignore` 与 README
- 增加贡献指南、Issue 模板、PR 模板、安全策略、行为准则和 `CODEOWNERS`
- 增加基础 GitHub Actions CI 工作流

### Changed

- 清理前后端目录中的冗余 Markdown、测试文件、调试页和离线导出脚本
- 收敛前端 ESLint warning，并将 CI 调整为严格构建校验
- 升级 GitHub Actions 官方 action 版本，兼容 Node 24 运行时

### Security

- 将硬编码敏感配置替换为环境变量或更安全的输入方式
- 补充仓库安全提交流程与公开披露约束

## 说明

- 目前该仓库尚未按正式版本号发布，因此先以日期记录公开整理过程
- 如果后续开始按版本发布，可以将条目调整为 `## [v1.0.0] - YYYY-MM-DD` 形式
