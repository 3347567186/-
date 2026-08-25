# 针韵智绣官网

React + Vite 前端与 Node.js API 服务组成的绣花装备、民族刺绣纹样库和 AI 设计展示网站。

## 目录

- `src/`：React 页面、组件、样式和种子数据
- `server/`：生产 HTTP 服务、资产持久化、上传和 AI API
- `public/`：静态媒体资源
- `data/assets.json`：用户资产索引（应纳入版本管理）
- `data/uploads/`：用户上传文件，仅保存在本地，不纳入 Git
- `deploy/nginx.conf`：Nginx 反代参考配置
- `docs/`：项目结构和维护说明

## 本地开发

环境要求：Node.js 20+、npm 10+。

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

开发服务器默认由 Vite 提供，访问 `http://localhost:5173`。Vite 配置同时挂载了资产和 AI API。

## 构建与生产运行

```powershell
npm run check:server
npm run lint
npm run build
npm run start
```

生产服务默认监听 `5184`，读取 `dist/` 并提供 API。正式部署时建议由 Nginx 反代到该端口，再由 PM2 管理 `server/serve.mjs`。

## 环境变量

真实密钥只放在本地 `.env` 或服务器 Secret 管理中，不要提交到 Git。模板见 [.env.example](.env.example)。AI 生图、文本分析、视觉打标和图片搜索功能分别依赖对应的 DashScope/SerpAPI 配置；未配置时，网站基础展示和本地资产功能仍可运行，但相关 AI 功能会失败或降级。

## 数据与备份

`data/uploads/` 目前来自线上快照，体积较大且包含业务素材，已通过 `.gitignore` 排除。需要迁移数据时单独备份该目录和 `server/data/assets.json`，不要把整个线上备份 ZIP 或 `node_modules` 放入源码仓库。

原始备份位于 `D:\AI项目\绣花\绣花机网页网站备份`，其中的 README 和状态文件是备份说明资料，不是项目运行时配置。
