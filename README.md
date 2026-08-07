# An-movie

## 项目简介

An-movie 是一个面向“电影推荐”的 AI 智能体项目。用户可以用自然语言描述类型、心情、演员、时长、评分和剧情偏好，系统会自动分析需求、调用 TMDB 搜索能力，并给出结构化的推荐结果。

项目同时支持上传图片，让系统在一定程度上结合视觉信息做更自然的理解与推荐。

## 核心能力

- 文本聊天式电影推荐
- 可选图片输入，辅助理解偏好
- 用户注册、登录与 JWT 鉴权
- 多阶段智能体工作流：偏好解析 -> 搜索 -> 监督汇总
- 接入 LangSmith 追踪与 TMDB 搜索能力

## 系统架构

```text
┌─────────────────────────────┐
│      React + Vite Client    │
│   轻量前端界面 / 聊天交互    │
└──────────────┬──────────────┘
               │ HTTP
┌──────────────▼──────────────┐
│      NestJS Backend         │
├──────────────┬──────────────┤
│ auth-service │ movie-service │
│  登录鉴权     │ 推荐工作流     │
└───────┬──────┬───────────────┘
        │      │
        │      ├──────────────► TMDB Search
        │      ├──────────────► LangSmith / LLM
        │      └──────────────► Auth gRPC
        │
        └──────────────► PostgreSQL
```

## 项目结构

```text
an-movie/
├── backend/
│   ├── auth-service/
│   │   ├── src/
│   │   │   ├── auth/
│   │   │   └── main.ts
│   │   └── package.json
│   └── movie-service/
│       ├── src/
│       │   ├── model/
│       │   ├── movie/
│       │   └── main.ts
│       └── package.json
├── client/
│   ├── src/
│   │   ├── components/
│   │   ├── store/
│   │   └── App.tsx
│   └── package.json
├── docker-compose.yml
└── README.md
```

## 快速运行

```bash
docker compose up --build
```

服务入口如下：

- 前端: http://localhost
- 电影服务: http://localhost:3001
- 认证服务: http://localhost:3002
- Portainer: http://localhost:9000
