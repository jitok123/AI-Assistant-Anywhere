# 🛡️ 数据流、错误处理与控制策略

> 全链路数据流转 + 错误恢复 + 降级策略

---

## 1. 端到端数据流总览

```mermaid
flowchart TB
    subgraph User["👤 用户输入"]
        TXT["文本消息"]
        IMG["图片附件"]
    end

    subgraph UI_Layer["📱 UI 层"]
        CI["ChatInput 组件<br/>handleSend()"]
        IDX["index.tsx<br/>sendMessage()"]
    end

    subgraph Store_Layer["🧠 Zustand Store"]
        SM["sendMessage 方法"]
        MS["messages 状态数组"]
        SC["streamingContent"]
        IL["isLoading 标志"]
    end

    subgraph RAG_Layer["📚 RAG 检索"]
        MLS["multiLayerSearch"]
        BRC["buildRagContext"]
    end

    subgraph Agent_Layer["🤖 Agent 路由"]
        DII["detectImageGenIntent"]
        DWS["detectWebSearchIntent"]
        AP["agentProcess"]
    end

    subgraph External["🌐 外部 API"]
        DS_API["DeepSeek API<br/>(主对话)"]
        QW_SEARCH["DashScope Qwen<br/>(联网搜索)"]
        QW_IMAGE["DashScope<br/>qwen-image-max<br/>(文生图)"]
        QW_VISION["DashScope<br/>qwen-vl-max<br/>(图片理解)"]
        QW_EMB["DashScope<br/>text-embedding-v3<br/>(嵌入)"]
    end

    subgraph DB_Layer["💾 持久化"]
        SQLite["expo-sqlite<br/>conversations<br/>messages<br/>rag_entries"]
    end

    TXT --> CI --> IDX --> SM
    IMG --> CI

    SM --> MLS -->|"ragResults"| BRC -->|"ragContext"| SM
    MLS --> QW_EMB
    MLS --> SQLite

    SM --> AP
    AP --> DII
    AP --> DWS

    DII -->|"图片路由"| QW_IMAGE -->|"imageUrl"| AP
    DWS -->|"搜索路由"| QW_SEARCH -->|"searchFacts"| AP
    AP -->|"注入搜索上下文"| DS_API
    AP -->|"普通路由"| DS_API

    IMG -.->|"图片消息"| QW_VISION

    DS_API -->|"SSE chunks"| SM
    SM -->|"streamCallback"| SC
    SM -->|"更新"| MS
    SM -->|"控制"| IL

    MS --> IDX -->|"FlatList"| UI_Render["消息列表渲染"]
    IL --> IDX -->|"ActivityIndicator"| Loading["加载指示器"]

    SM -->|"最终结果"| SQLite

    style User fill:#E3F2FD
    style External fill:#E8F5E9
    style Store_Layer fill:#FFF3E0
    style Agent_Layer fill:#F3E5F5
    style RAG_Layer fill:#FCE4EC
    style DB_Layer fill:#ECEFF1
```

---

## 2. 错误处理与降级策略

```mermaid
flowchart TD
    subgraph Errors["可能的错误源"]
        E1["网络断开<br/>Network Error"]
        E2["API 超时<br/>120s Timeout"]
        E3["API Key 无效<br/>401 Unauthorized"]
        E4["频率限制<br/>429 Rate Limit"]
        E5["服务不可用<br/>500/502/503"]
        E6["用户取消<br/>AbortError"]
        E7["未知错误"]
    end

    subgraph Detection["错误检测层"]
        D1["deepseek.ts<br/>XHR onerror/ontimeout"]
        D2["agent.ts<br/>try-catch per route"]
        D3["store/index.ts<br/>外层 try-catch"]
    end

    subgraph Retry["重试策略"]
        R1["deepseek.ts 内部重试<br/>非 4xx 错误: 最多 2 次<br/>指数退避: 1s → 2s"]
    end

    subgraph Degradation["降级策略"]
        DG1["图片生成失败<br/>→ 降级到联网搜索检查"]
        DG2["联网搜索失败<br/>→ 降级到普通对话"]
        DG3["RAG 检索失败<br/>→ 跳过 RAG，继续对话"]
    end

    subgraph UserFacing["用户可见的错误提示"]
        UF1["网络连接失败，请检查网络后重试"]
        UF2["请求超时，请检查网络或稍后重试"]
        UF3["API Key 无效，请在设置中检查"]
        UF4["请求过于频繁，请稍后重试"]
        UF5["AI 服务暂时不可用，请稍后重试"]
        UF6["(无提示，保留已生成内容)"]
        UF7["出错了：{message前200字}"]
    end

    E1 --> D1 --> R1
    E2 --> D1 --> R1
    E3 --> D1 -->|"4xx 不重试"| D3
    E4 --> D1 --> R1
    E5 --> D1 --> R1
    E6 --> D3
    E7 --> D1 --> R1

    R1 -->|"重试仍失败"| D2
    D2 --> DG1
    D2 --> DG2
    D2 --> DG3
    DG1 --> D3
    DG2 --> D3
    D3 --> UF1
    D3 --> UF2
    D3 --> UF3
    D3 --> UF4
    D3 --> UF5
    E6 --> UF6
    D3 --> UF7

    style Errors fill:#FFCDD2
    style Retry fill:#FFF9C4
    style Degradation fill:#FFE0B2
    style UserFacing fill:#C8E6C9
```

---

## 3. Agent 路由降级链

```mermaid
flowchart LR
    A["🎨 路由1: 图片生成"] -->|"失败"| B["🔍 路由2: 联网搜索"]
    B -->|"失败"| C["💬 路由3: 普通对话"]
    C -->|"失败"| D["❌ 错误消息<br/>显示到 UI"]

    A -->|"成功"| OK1(["✅ 返回图片"])
    B -->|"成功"| OK2(["✅ 搜索增强回复"])
    C -->|"成功"| OK3(["✅ 普通回复"])

    style A fill:#FCE4EC
    style B fill:#E8F5E9
    style C fill:#E3F2FD
    style D fill:#FFCDD2
```

---

## 4. 后台任务错误隔离

```mermaid
flowchart TD
    MAIN["主消息流完成<br/>UI 已更新<br/>isLoading=false"] --> BG["后台异步任务"]

    BG --> T1["generateTitle()"]
    BG --> T2["addChatToRag()"]
    BG --> T3["postConversationUpdate()"]
    BG --> T4["refreshRagStats()"]

    T1 -->|".then(rename).catch()"| ISO1["错误被 .catch 吞没<br/>仅 console.warn"]
    T2 -->|".catch()"| ISO2["错误被 .catch 吞没<br/>仅 console.warn"]
    T3 -->|".catch()"| ISO3["错误被 .catch 吞没<br/>仅 console.warn"]
    T4 -->|".catch()"| ISO4["静默失败"]

    ISO1 -.- NOTE1["🔑 关键修复:<br/>之前无 .catch 导致<br/>uncaught promise rejection<br/>→ 白屏重启"]

    style MAIN fill:#C8E6C9
    style BG fill:#FFF3E0
    style ISO1 fill:#FFECB3
    style NOTE1 fill:#FFCDD2,stroke-dasharray: 5 5
```

---

## 5. ErrorBoundary 防御层

```mermaid
flowchart TD
    subgraph App["应用层级"]
        LAYOUT["_layout.tsx<br/>Stack Navigator"] --> EB["ErrorBoundary 组件"]
        EB --> PAGES["子页面<br/>index / settings / rag / call"]
    end

    subgraph ErrorCatch["渲染错误捕获"]
        RE["React 组件渲染异常<br/>componentDidCatch"]
        RE --> FALLBACK["降级 UI:<br/>显示错误信息<br/>+ 重试按钮"]
        FALLBACK --> RETRY["用户点击重试<br/>→ resetError()"]
        RETRY --> PAGES
    end

    PAGES -->|"抛出渲染错误"| RE

    style EB fill:#FCE4EC,stroke:#C62828
    style FALLBACK fill:#FFECB3
```

---

## 6. 数据库迁移策略

```mermaid
flowchart TD
    INIT["数据库初始化<br/>initDatabase()"] --> V1["版本1: 基础表<br/>conversations<br/>messages<br/>rag_entries"]
    V1 --> M1["迁移1: tool_calls 列<br/>ALTER TABLE messages<br/>ADD COLUMN tool_calls TEXT"]
    M1 --> M2["迁移2: search_results 列<br/>ALTER TABLE messages<br/>ADD COLUMN search_results TEXT"]
    M2 --> M3["迁移3: generated_image_url 列<br/>ALTER TABLE messages<br/>ADD COLUMN generated_image_url TEXT"]

    M1 -->|"列已存在"| SKIP1["catch → 跳过"]
    M2 -->|"列已存在"| SKIP2["catch → 跳过"]
    M3 -->|"列已存在"| SKIP3["catch → 跳过"]

    style INIT fill:#E3F2FD
    style SKIP1 fill:#E8F5E9
    style SKIP2 fill:#E8F5E9
    style SKIP3 fill:#E8F5E9
```

---

## 7. API 调用矩阵

| 操作 | 服务 | 端点 | 模型 | 流式 | 重试 |
|------|------|------|------|------|------|
| 主对话 | DeepSeek | /chat/completions | deepseek-chat/reasoner | ✅ SSE | 2次 |
| 标题生成 | DeepSeek | /chat/completions | deepseek-chat | ❌ | 0次 |
| 联网搜索 | DashScope | /compatible-mode/v1/chat/completions | qwen-plus | ❌ | 0次 |
| 图片生成 | DashScope | /api/v1/services/aigc/multimodal-generation/generation | qwen-image-max | ❌ | 0次(有轮询) |
| 图片理解 | DashScope | /compatible-mode/v1/chat/completions | qwen-vl-max | ✅ SSE | 0次 |
| 文本嵌入 | DashScope | /compatible-mode/v1/embeddings | text-embedding-v3 | ❌ | 0次 |
| RAG分析 | DeepSeek | /chat/completions | deepseek-chat | ❌ | 0次 |
