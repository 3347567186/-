# 项目维护说明

## 运行链路

开发环境使用 Vite，`vite.config.js` 负责挂载上传、资产和 AI 中间件；生产环境使用 `server/serve.mjs`，优先读取 `dist/`，再读取 `public/`，最后对前端路由回退到 `dist/index.html`。

```text
浏览器
  └─ Nginx（可选，80/443）
      └─ Node.js server/serve.mjs（5184）
          ├─ dist/ 静态构建产物
          ├─ public/ 原始媒体资源
          ├─ server/data/assets.json 资产索引
          └─ data/uploads/ 用户上传文件
```

## 数据边界

- 种子资产在 `src/data/constants.js`，随源码发布。
- 用户资产在 `server/data/assets.json`，需要备份但不应存放密钥。
- 上传图片在 `data/uploads/`，属于运行数据，不纳入 Git。
- `.env` 只在本地或服务器存在；`.env.example` 只保存变量名和示例值。

## 日常变更原则

1. 页面和交互优先修改 `src/`，不要直接修改 `dist/`。
2. API 逻辑同时检查 `vite.config.js` 的开发中间件和 `server/serve.mjs` 的生产路由，避免开发环境与生产环境行为漂移。
3. 修改数据结构时同步检查 `server/data-store.mjs`、`src/utils/asset-utils.js` 和 `server/data/assets.json`。
4. 提交前执行 `npm run check:server`、`npm run lint` 和 `npm run build`。
