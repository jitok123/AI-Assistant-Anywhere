# 随身AI助手 (Telephone AI Anywhere)

> 一个全功能 AI 助手应用 — 多层记忆 · 联网搜索 · AI绘图 · 语音通话

---

## 功能概览

| 功能 | 说明 |
|------|------|
| AI 对话 | 流式响应，支持 DeepSeek / 通义千问 / Kimi / GLM / GPT 等所有兼容 OpenAI 格式的模型 |
| 语音通话 | 类似豆包电话功能，按住说话，AI 自动语音回复，全屏通话界面 |
| 多层 RAG 记忆 | 感性层（情感分析）+ 理性层（用户画像）+ 历史层（对话记忆）+ 通用知识库 |
| 联网搜索 | Agent 自主判断是否需要搜索，使用 DashScope Qwen `enable_search` 获取实时信息 |
| AI 绘图 | Agent 自主判断是否需要画图，阿里云 DashScope 文生图 |
| 出图提示词优化 | 生图前先由 LLM 自动优化提示词，不再直接转发用户原话 |
| 语音输入 | 阿里云 Paraformer ASR 语音识别 |
| 图片理解 | 支持多模态模型（通义千问 VL / GPT-4o），发送图片给 AI 分析 |
| 文件附件对话 | 聊天输入支持图片 + 文件附件（文本文件自动提取节选用于上下文） |
| 图片+联网同回合 | 图片理解与联网搜索可在同一轮自动串联（先看图，再检索，再综合回答） |
| 时间工具 | 内置时间函数（当前时间/日期/星期/时间戳），并为模型注入“当前时间锚点” |
| 知识库管理 | 上传 Markdown 文件构建本地知识库，支持向量检索 |
| 数据导入导出 | 完整的对话、知识库备份与恢复 |
| 会话批量删除 | 侧栏支持编辑模式、多选/全选后批量删除 |
| 统一错误处理 | 全局 ErrorHandler 统一日志结构（预留 Sentry 接入） |
| API 版本配置 | 统一维护 API 版本和端点路径构造 |
| 暗色主题 | 自动跟随系统或手动切换 |

---

## 项目架构

```
telephone_ai_anywhere/
├── app/                          # Expo Router 页面层
│   ├── _layout.tsx               # 根布局（Stack 导航）
│   ├── index.tsx                 # 主聊天页面
│   ├── call.tsx                  # 语音通话页面（类似豆包打电话）
│   ├── settings.tsx              # 设置页面
│   └── rag.tsx                   # 知识库管理页面
│
├── src/                          # 核心代码层
│   ├── components/               # UI 组件
│   │   ├── MessageBubble.tsx     # 消息气泡（Markdown / 图片 / 搜索引用 / 工具调用）
│   │   ├── ChatInput.tsx         # 输入框（文本 / 图片 / 文件附件）
│   │   └── ConversationDrawer.tsx # 对话列表侧边栏
│   │
│   ├── services/                 # 后端服务层
│   │   ├── deepseek.ts           # LLM API 调用（XHR 流式 + 自动重试）
│   │   ├── agent.ts              # AI Agent 引擎（LLM 路由优先 + 规则兜底）
│   │   ├── ragSpecialist.ts      # 多层 RAG 记忆管理（感性/理性/历史层）
│   │   ├── rag.ts                # 通用 RAG（知识库检索）
│   │   ├── embedding.ts          # 文本向量化（DashScope Embedding）
│   │   ├── voice.ts              # 语音服务（ASR + TTS + 超时处理）
│   │   ├── webSearch.ts          # 联网搜索（百度千帆）
│   │   ├── imageGen.ts           # AI 绘图（DashScope wanx）
│   │   ├── errorHandler.ts       # 统一错误处理（可扩展 Sentry）
│   │   └── database.ts           # SQLite 本地数据库
│   │
│   ├── store/                    # 全局状态
│   │   └── index.ts              # Zustand Store（消息流 + RAG + Agent 编排）
│   │
│   ├── types/                    # TypeScript 类型定义
│   │   └── index.ts              # 所有接口和类型
│   │
│   ├── config/                   # 配置管理
│   │   ├── models.ts             # AI 模型预设（对话模型 + Embedding 模型）
│   │   └── api.ts                # API 版本与端点配置
│   │
│   ├── constants/                # 常量
│   │   └── theme.ts              # 主题配色（亮色 / 暗色）
│   │
│   ├── hooks/                    # React Hooks
│   │   └── useTheme.ts           # 主题 Hook
│   │
│   └── utils/                    # 工具函数
│       ├── fileUtils.ts          # 文件操作（导入导出 / 图片保存）
│       ├── markdown.ts           # Markdown 分块处理
│       └── vectorSearch.ts       # 余弦相似度向量检索
│
├── android/                      # Android 原生代码
├── assets/                       # 静态资源
├── package.json
├── tsconfig.json
├── app.json                      # Expo 配置
└── eas.json                      # EAS Build 配置
```

---

## 核心架构

```
用户输入（文字 / 语音 / 图片 / 通话）
              │
              ▼
  ┌───────────────────────────────────┐
  │          Zustand Store            │
  │   消息管理 · 状态编排 · 持久化      │
  └──────────┬────────────────────────┘
             │
    ┌────────┴────────┐
    ▼                 ▼
 RAG 专员          AI Agent
(多层记忆检索)    (工具调度引擎)
    │                 │
    │           ┌─────┼─────┐
    │           ▼     ▼     ▼
    │       联网搜索  绘图   直接回复
    │       (百度)  (阿里云)
    │                 │
    └────────┬────────┘
             ▼
      DeepSeek / 其他 LLM
      (流式输出 · XHR · 自动重试)
             │
             ▼
       消息气泡渲染
  (Markdown · 图片 · 搜索引用)
```

### 多层 RAG 记忆系统

| 层级 | 说明 | 更新策略 |
|------|------|---------|
| 感性层 (emotional) | 分析用户情感状态和态度 | 每次对话后更新，滚动保留最近 10 条 |
| 理性层 (rational) | 构建用户画像（兴趣/专业/风格） | 累积足够消息后整体重写 |
| 历史层 (historical) | 所有对话的长期记忆 | 每次对话后追加 |
| 通用层 (general) | 用户上传的知识库文档 | 手动上传 Markdown |

### AI Agent 工具链

Agent 使用“LLM 路由优先 + 规则兜底”机制自主决策：

1. **web_search** — 需要实时信息、新闻、不确定事实时触发
2. **image_gen** — 用户明确要求画图时触发
3. **time_now** — 询问当前时间/日期/星期/时间戳时触发本地时间函数
4. **直接回复** — 不需要工具时直接流式回答

> 说明：图片消息在需要时可进入“视觉识别 → 联网检索 → LLM 综合回答”的组合链路。

### 网络容错机制

- API 请求自动重试（最多 2 次，间隔 1.5s）
- 4xx 客户端错误不重试（如 401/429）
- XHR 流式传输 120s 超时保护
- 语音识别 30s 超时 + 多方案降级
- 用户友好的错误提示（中文）

---

## 技术栈

| 领域 | 技术方案 |
|------|---------|
| 框架 | React Native (Expo SDK 52) |
| 导航 | Expo Router 4 |
| 状态管理 | Zustand |
| 数据库 | expo-sqlite (SQLite) |
| LLM | DeepSeek V3 / 通义千问 / Kimi / GLM / GPT (OpenAI 格式) |
| Embedding | 阿里云 DashScope text-embedding-v3 |
| ASR | 阿里云 Paraformer v2 (FormData 上传) |
| TTS | expo-speech (系统原生) |
| 联网搜索 | DashScope Qwen enable_search |
| AI 绘图 | 阿里云 DashScope wanx-v1 |
| 流式传输 | XMLHttpRequest SSE (React Native 兼容) |
| Markdown | react-native-markdown-display |

---

## 快速开始

### 环境要求

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- Android Studio (用于 Android 构建) 或 iOS 开发环境

### 安装和运行

```bash
# 克隆项目
git clone <repo-url>
cd telephone_ai_anywhere

# 安装依赖
npm install

# 启动开发服务器
npx expo start

# 运行 Android
npx expo run:android
```

### API 配置

在应用的 **设置** 页面中配置：

1. **对话模型 API Key**（必需）— 支持 DeepSeek / 通义千问 / Kimi / GLM / OpenAI
2. **阿里云 DashScope API Key** — 用于 Embedding(RAG)、语音识别、图片生成
3. **百度千帆 API Key** — 预留字段（当前默认不使用）

> 说明：当前联网搜索默认走 DashScope（与 Embedding/生图复用同一 Key）。

---

## 语音通话功能

类似豆包电话功能，全屏通话界面：

- 点击通话按钮进入通话模式
- **按住说话**：按住大圆按钮录音，松开自动识别并发送
- AI 回复后自动 TTS 朗读
- 通话中拥有完整的 RAG 记忆上下文
- 通话记录自动保存到当前对话中

---

## 构建发布

```bash
# 本地 debug APK
npm run build:apk:debug

# 本地 release APK
npm run build:apk:local

# EAS 云端构建
npm run build:apk:eas

# 生产 AAB（Google Play）
npm run build:aab
```

---
## 项目架构文档

- [architecture_overview.md](架构文档/log7_architecture_overview.md)
- [message_pipeline.md](架构文档/log8_message_pipeline.md)
- [agent_routing.md](架构文档/log9_agent_routing.md)
- [rag_architecture.md](架构文档/log10_rag_architecture.md)
- [streaming_state.md](架构文档/log11_streaming_state.md)
- [dataflow_errors.md](架构文档/log12_dataflow_errors.md)
## 许可证

MIT License