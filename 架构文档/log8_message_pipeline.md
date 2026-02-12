# 🔄 消息处理管线 (Message Processing Pipeline)

> 从用户输入到 AI 回复完整落盘的全链路

---

## 1. 完整消息生命周期

```mermaid
sequenceDiagram
    participant U as 👤 用户
    participant UI as 📱 index.tsx
    participant S as 🧠 Store (Zustand)
    participant RAG as 📚 RAG 专员
    participant AG as 🤖 Agent
    participant DS as 🌐 DeepSeek API
    participant DB as 💾 SQLite

    U->>UI: 输入文字 / 选择图片
    UI->>S: sendMessage(content, imageUri?)
    
    Note over S: 创建 userMsg + aiMsg(空)<br/>set isLoading=true<br/>启动 120s 安全超时

    S->>DB: 确保会话存在 (getOrCreate)
    S->>DB: 保存 userMsg (addMessage)
    
    rect rgb(252, 228, 236)
        Note over S,RAG: 步骤1: 多层 RAG 检索
        S->>RAG: multiLayerSearch(content, settings)
        RAG->>RAG: 感性层 + 理性层 + 历史层 + 通用层
        RAG-->>S: ragResults[]
        S->>S: buildRagContext(ragResults)
    end

    rect rgb(232, 245, 233)
        Note over S,AG: 步骤2: 构建 API 消息上下文
        S->>DB: getRecentMessages(convId, 10)
        DB-->>S: recentMessages[]
        S->>S: 组装 apiMessages[]<br/>[system+RAG, history..., user]
    end

    rect rgb(243, 229, 245)
        Note over S,DS: 步骤3: Agent 处理 + 流式回复
        S->>AG: agentProcess(apiMessages, settings, streamCallback)
        AG->>AG: 意图路由(画图/搜索/普通)
        AG->>DS: chatCompletion(流式)
        
        loop SSE 流式
            DS-->>AG: chunk
            AG-->>S: streamCallback(chunk, false)
            S->>S: set streamingContent<br/>更新 messages[]
            S-->>UI: React 重渲染
            UI-->>U: 逐字显示
        end
        
        DS-->>AG: [DONE]
        AG-->>S: streamCallback(finalContent, true)
        Note over S: ⚡ done=true → 立即 isLoading=false
    end

    rect rgb(236, 239, 241)
        Note over S,DB: 步骤4: 保存结果
        S->>S: 合并 agentResult 到 aiMsg
        S->>DB: addMessage(aiMsg)
        S->>S: set isLoading=false (再次确认)
    end

    rect rgb(255, 253, 231)
        Note over S,RAG: 步骤5: 后台异步任务 (不阻塞 UI)
        S-->>S: generateTitle() (首条消息时)
        S-->>RAG: addChatToRag() (通用层)
        S-->>RAG: postConversationUpdate() (感性/理性/历史层)
        S-->>S: refreshRagStats()
    end

    Note over S: finally: clearTimeout<br/>set isLoading=false (终极保险)
```

---

## 2. API 消息组装详情

```mermaid
graph TD
    subgraph Input["输入源"]
        SP["系统提示词<br/>settings.systemPrompt"]
        RC["RAG 上下文<br/>多层记忆检索结果"]
        HM["历史消息<br/>最近 10 条"]
        UM["用户当前消息<br/>文字 / 文字+图片"]
    end

    subgraph Assembly["apiMessages[] 组装"]
        SYS["role: system<br/>systemPrompt + RAG上下文"]
        H1["role: user/assistant<br/>历史消息1"]
        H2["role: user/assistant<br/>历史消息2"]
        HN["..."]
        USR["role: user<br/>当前消息<br/>text 或 [text, image_url]"]
    end

    SP --> SYS
    RC -->|追加到 system| SYS
    HM --> H1
    HM --> H2
    HM --> HN
    UM --> USR

    SYS --> Final["最终 apiMessages[]"]
    H1 --> Final
    H2 --> Final
    HN --> Final
    USR --> Final

    style Input fill:#E3F2FD
    style Assembly fill:#FFF3E0
```

---

## 3. 图片消息特殊处理流程

```mermaid
graph TD
    IMG["用户发送图片"] --> B64["imageToBase64(uri)"]
    B64 --> MC["构建 multimodal content:<br/>[{type:'text', text}, {type:'image_url', url:base64}]"]
    MC --> VIS["直接调用 DashScope<br/>qwen-vl-max<br/>(绕过 Agent)"]
    VIS --> RES["视觉模型回复"]
    RES --> SAVE["保存到 DB + 更新 UI"]

    style IMG fill:#FCE4EC
    style VIS fill:#E8F5E9
    style SAVE fill:#ECEFF1
```

---

## 6. 2026-02 增量更新（文件附件 + 聊天交互）

### 6.1 输入能力升级

- `ChatInput` 从“仅图片”扩展为“图片 + 文件附件”。
- 文件附件会在本地保存，并尝试读取文本内容节选（txt/md/json/csv/log/xml/yaml 等）。
- `sendMessage` 新增 `type='file'` 与 `fileAttachment` 参数，文件信息会注入 `apiMessages`。

### 6.2 数据模型与持久化升级

- `Message` 新增字段：`fileUri` / `fileName` / `fileMimeType`。
- `messages` 表新增列（向后兼容迁移，`ALTER TABLE ... try/catch`）：
    - `file_uri`
    - `file_name`
    - `file_mime_type`

### 6.3 聊天页交互改进

- 修复消息区与输入区之间的视觉空白问题（消息列表占满可用高度）。
- 新增“从屏幕左缘右滑打开侧栏”手势。
- 输入栏改为同轴对齐布局：`+` 按钮与输入框、发送按钮垂直中心对齐。

