# 文心识典 - 论语专版

一个面向《论语》学习与展示的本地化系统，包含前后端两部分：
- 前端：React + TypeScript + Vite
- 后端：FastAPI + MySQL + Chroma

项目支持上传卷页、OCR 识文、问义检索、残篇补阙、个人配置与展厅浏览等功能。

## 主要功能简介

1. 用户登录与注册
2. 卷页上传（支持 PDF / TXT / PNG）
3. OCR 识文
	- 文本层 PDF：直接提取文本
	- 图片型 PDF：自动按页渲染进行OCR识别
	- 图片：OCR识别
	- TXT：直接读取文本入库
4. 知识入库与向量检索（Chroma + 向量模型）
5. 问义（RAG + 大模型 API）
6. 残篇补阙
7. 配置与展厅浏览

## 项目结构（简版）

```
WenXinClassics/
├─ backend/
│  ├─ main.py
│  ├─ api/
│  ├─ services/
│  ├─ config/
│  └─ requirements.txt
└─ frontend/
	├─ src/
	├─ package.json
	└─ vite.config.ts
```


## 本地化快速部署与启动

### 0) 配置说明

后端配置在 `backend/.env`：
- MySQL数据库本地连接配置(需在数据库中新建wenxin_classics_db)
- JWT 参数
- 大模型 API（Key、Base URL、Model）
- OCR 尺寸阈值 等环境配置

### 1) 启动后端

在 `backend` 目录下执行：

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

### 2) 启动前端

在 `frontend` 目录下执行：

```powershell
npm install
npm run dev
```

默认开发地址：
- 访问网页 ：http://127.0.0.1:8000/
