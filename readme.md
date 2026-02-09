# 📱 随身AI助手

> 一个真正懂你的 AI 助手 —— 一切皆历史，本地化存储，跨会话记忆

## ✨ 核心特性

| 特性 | 说明 |
|------|------|
| 🧠 一切皆历史 | 所有聊天对话自动存入 RAG 知识库，跨会话记忆不遗忘 |
| 🔒 本地化存储 | 所有数据存储于手机本地 SQLite，隐私有保障 |
| 🎤 多模态输入 | 支持文字、语音、图片多种输入方式 |
| 💬 双模式聊天 | 文本对话 + 语音对话两种模式自由切换 |
| 📚 知识库管理 | 上传 Markdown 文件构建个人知识库 |
| 💰 节省成本 | 已 Embedding 的数据增量追加，无需重复计算 |
| 📤 数据自由 | 支持导出/导入全部聊天和 RAG 数据 |
| 🌓 主题切换 | 深色/浅色/跟随系统 三种主题 |

## 🏗️ 技术架构

```
React Native (Expo) + TypeScript
├── 对话引擎: DeepSeek API (流式输出)
├── 向量嵌入: 阿里云 DashScope text-embedding-v3
├── 语音识别: 阿里云 DashScope ASR
├── 本地存储: expo-sqlite (SQLite)
├── RAG 引擎: 本地余弦相似度搜索
├── 状态管理: Zustand
└── 路由导航: Expo Router
```

## 📁 项目结构

```
telephone_ai_anywhere/
├── app/                        # Expo Router 页面
│   ├── _layout.tsx            # 根布局
│   ├── index.tsx              # 主聊天页
│   ├── settings.tsx           # 设置页
│   └── rag.tsx                # 知识库管理页
├── src/
│   ├── types/index.ts         # TypeScript 类型定义
│   ├── constants/theme.ts     # 主题颜色常量
│   ├── hooks/useTheme.ts      # 主题 Hook
│   ├── store/index.ts         # Zustand 状态管理
│   ├── services/
│   │   ├── database.ts        # SQLite 数据库操作
│   │   ├── deepseek.ts        # DeepSeek 对话 API
│   │   ├── embedding.ts       # 阿里云向量嵌入 API
│   │   ├── rag.ts             # RAG 检索增强服务
│   │   └── voice.ts           # 语音录制/识别/合成
│   ├── components/
│   │   ├── MessageBubble.tsx   # 消息气泡 (Markdown渲染)
│   │   ├── ChatInput.tsx       # 输入框 (文字/录音/图片)
│   │   └── ConversationDrawer.tsx  # 对话列表抽屉
│   └── utils/
│       ├── vectorSearch.ts    # 余弦相似度搜索
│       ├── markdown.ts        # Markdown 分块工具
│       └── fileUtils.ts       # 文件操作工具
├── assets/                     # 图标和启动图
├── app.json                    # Expo 配置
├── eas.json                    # EAS Build 配置
├── package.json
├── tsconfig.json
└── babel.config.js
```

## 🚀 快速开始

### 环境要求

- **Node.js** >= 18
- **npm** 或 **yarn**
- **Expo CLI**: `npm install -g expo-cli`
- **EAS CLI**: `npm install -g eas-cli` (用于构建 APK)
- **Android Studio** (可选，用于本地构建)

### 安装运行

```bash
# 1. 安装依赖
cd telephone_ai_anywhere
npm install

# 2. 启动开发服务器
npx expo start

# 3. 在手机上安装 Expo Go 扫码预览
#    或使用 Android 模拟器
```

### 构建 APK（vivo 等安卓手机可安装）

**推荐：EAS 云构建（免费档可用）**

1) 注册/登录 Expo 账号（免费）
2) 运行云构建命令（输出 APK）

说明：EAS 云构建对 Android APK 提供免费额度（以 Expo 官方为准）。

**不再推荐本地构建**（需要完整 Android 环境 + Java 17 + SDK，配置成本更高）。

### 预览与调试（不需要反复安装 APK）

**方式一：Expo Go（最快速预览）**

1) 手机上安装 Expo Go
2) 电脑启动开发服务器（`npx expo start`）
3) 手机扫码即可实时预览，改代码自动刷新

**方式二：Development Build（功能更完整）**

如果你的项目使用了原生模块或需要更完整的功能，可用 EAS 云构建 Development Build。
之后手机只需安装一次开发版 App，改代码后不用反复卸载重装。

### API 配置

打开应用后进入 **设置** 页面：

1. **DeepSeek API Key** — 用于 AI 对话（[获取地址](https://platform.deepseek.com/)）
2. **阿里云 DashScope API Key** — 用于文本向量化和语音识别（[获取地址](https://dashscope.console.aliyun.com/)）

## 🔧 VS Code 推荐插件

开发此项目时，建议安装以下 VS Code 插件：

| 插件 | 说明 |
|------|------|
| **ES7+ React/Redux/React-Native Snippets** | React Native 代码片段 |
| **Expo Tools** | Expo 项目支持 |
| **TypeScript Importer** | 自动导入 TypeScript 模块 |
| **Prettier** | 代码格式化 |
| **ESLint** | 代码检查 |
| **React Native Tools** | React Native 调试工具 |
| **Android iOS Emulator** | 快速启动模拟器 |
| **Color Highlight** | 颜色值预览 |

## 📝 使用说明

1. **聊天** — 打开即用，类似 DeepSeek 界面，支持 Markdown 渲染
2. **语音** — 点击 🎤 按钮录音，自动识别为文字发送
3. **图片** — 点击 📷 按钮选择图片，AI 会分析图片内容
4. **知识库** — 上传 .md 文件，所有对话自动存入 RAG
5. **导出** — 设置页可导出/导入全部数据（JSON 格式）
6. **长按 AI 回复** — 语音播放 AI 的回复

## 📄 License

MIT 