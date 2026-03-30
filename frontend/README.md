# 文心识典·论语专版

一个面向《论语》学习与研究的全栈应用，集成了检索、OCR、译注、异体字查询、文本修复、知识图谱与社区互动等能力。

- 前端：React + Vite + TypeScript
- 后端：FastAPI + SQLAlchemy + SQLite
- AI 能力：可选接入 SiliconFlow（Embedding / Chat / OCR）

## 功能概览

- 经典检索：语义检索与片段返回
- OCR 识别：上传图片后进行文字提取
- 译注阅读：按章节浏览《论语》译文与段落
- 文字修复：对上传文本进行修复与整理
- 异体字查询：查看字词异体与释义信息
- 知识图谱：展示人物、概念与关系
- 数字展陈：按专题浏览内容板块
- 社区模块：发布笔记、点赞、收藏
- 用户中心：登录后查看个人摘要

## 项目结构

```text
.
├─ src/                 # React 前端
├─ backend/
│  ├─ app/              # FastAPI 应用代码
│  ├─ data/             # SQLite / 向量数据
│  └─ storage/uploads/  # 上传文件目录
├─ data/                # 向量库数据（项目根目录）
└─ package.json
```

## 环境要求

- Node.js 18+
- Python 3.10+
- npm 或 pnpm（本文使用 npm）

## 快速开始

### 1. 安装前端依赖

```bash
npm install
```

### 2. 安装后端依赖

建议先创建并激活虚拟环境，再安装依赖：

```bash
pip install -r backend/requirements.txt
```

### 3. 配置环境变量（可选但推荐）

在项目根目录创建 `.env.local`（或 `.env`）：

```env
# 后端通用
APP_NAME=文心识典·论语专版 API
API_PREFIX=/api
DEBUG=true
SECRET_KEY=replace-this-in-production
ACCESS_TOKEN_EXPIRE_MINUTES=10080
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# SiliconFlow（按需填写）
SILICONFLOW_API_KEY=
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
SILICONFLOW_CHAT_MODEL=Qwen/Qwen2.5-72B-Instruct
SILICONFLOW_EMBEDDING_MODEL=BAAI/bge-large-zh-v1.5
SILICONFLOW_OCR_MODEL=Pro/deepseek-ai/DeepSeek-OCR

# 前端（可选）
VITE_API_BASE_URL=/api
```

> 不配置 SiliconFlow API Key 时，涉及外部模型能力的接口可能不可用或降级。

### 4. 启动后端

```bash
npm run backend:dev
```

默认监听：`http://127.0.0.1:8000`

### 5. 启动前端

新开一个终端执行：

```bash
npm run dev
```

默认地址：`http://localhost:3000`

前端开发服务器已内置 `/api` 代理到后端 `8000` 端口。

## 默认演示账号

后端首次启动会自动初始化演示用户：

- 邮箱：`demo@lunyu.local`
- 密码：`demo1234`

## 常用脚本

```bash
npm run dev          # 启动前端开发环境
npm run backend:dev  # 启动 FastAPI 开发服务
npm run build        # 构建前端
npm run preview      # 预览构建产物
npm run lint         # TypeScript 类型检查
npm run typecheck    # TypeScript 类型检查
npm run clean        # 清理 dist
```

## 主要 API 路由（前缀 `/api`）

- 健康检查：`GET /health`
- 门户：`GET /portal/overview`
- 认证：`POST /auth/register`、`POST /auth/login`、`GET /auth/me`
- 上传：`POST /uploads`、`GET /uploads`、`GET /uploads/{upload_id}/content`
- OCR：`POST /ocr/{upload_id}`
- 搜索：`POST /search`
- 修复：`POST /restore`
- 译注：`GET /translation/chapters`、`GET /translation/chapters/{chapter_id}`
- 展陈：`GET /exhibition/sections`
- 异体字：`GET /variants`、`GET /variants/{word}`
- 图谱：`GET /graph`
- 社区：`GET /community/notes`、`POST /community/notes`
- 个人中心：`GET /profile/summary`

## FAQ

### 1) 前端请求 404 或跨域错误

- 确认后端已在 `8000` 端口启动
- 确认前端通过 `npm run dev` 启动（已配置代理）
- 若自定义端口，更新 `VITE_API_BASE_URL` 与后端 `CORS_ORIGINS`

### 2) OCR / 检索结果为空

- 确认上传内容有效
- 确认外部模型配置（如 SiliconFlow API Key）是否正确
- 查看后端日志定位调用失败原因

## 许可证

当前仓库未声明开源许可证。如需开源发布，请补充 `LICENSE` 文件并在 README 中声明。
