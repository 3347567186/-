# ADR 0001：源码项目边界

- 状态：已接受
- 日期：2026-08-25

## 决策

将 `src/`、`server/`、`public/`、`data/assets.json`、配置模板和部署参考文件作为源码项目的一部分；将真实 `.env`、`data/uploads/`、`node_modules/`、`dist/`、日志和备份压缩包排除出 Git 版本边界。

## 原因

- 密钥和线上上传数据不应进入源码仓库。
- 依赖和构建产物可由 `package-lock.json` 和构建命令重建。
- 资产索引需要保留，才能让网站恢复已有业务内容。

## 影响

首次运行需要执行 `npm install`；如果需要完整恢复线上内容，需要另外备份 `data/uploads/`。本地验证过程中生成的 `node_modules/` 和 `dist/` 当前仍存在于工作区，但已被 `.gitignore` 排除，之后可安全重建。
