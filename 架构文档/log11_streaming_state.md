# 🌊 流式传输与状态管理

> V2.0：XHR SSE 解析 + Zustand 状态更新 + React 重渲染链路（含节流刷新与多重保险）

---

## 1. XHR SSE 流式架构 (deepseek.ts)

```mermaid
sequenceDiagram
    participant Store as Zustand Store
    participant DS as deepseek.ts
    participant XHR as XMLHttpRequest
    participant API as DeepSeek API

    Store->>DS: chatCompletion(messages, key, url, model, onStream)
    DS->>DS: 构建请求: stream=true
    DS->>XHR: new XMLHttpRequest()
    
    Note over XHR: 设置属性:<br/>responseType = ''<br/>timeout = 120000<br/>withCredentials = false

    XHR->>API: POST /chat/completions<br/>Headers: Authorization: Bearer {key}

    Note over XHR,API: SSE (Server-Sent Events) 流

    rect rgb(232, 245, 233)
        Note over XHR: onreadystatechange<br/>(readyState === 3: LOADING)
        loop 每次收到数据
            API-->>XHR: data: {"choices":[{"delta":{"content":"你"}}]}
            XHR->>DS: 解析 responseText 中的新增部分
            DS->>DS: 按 \n\n 分割 SSE events
            DS->>DS: 解析 data: JSON
            
            alt delta.content 存在
                DS->>DS: fullContent += delta.content
            else delta.reasoning_content 存在 (Reasoner模型)
                DS->>DS: fullContent += [思考中]\n + reasoning_content
            end
            
            DS->>Store: onStream(fullContent, false)
        end
    end

    rect rgb(252, 228, 236)
        Note over XHR: onload (readyState === 4)
        XHR->>DS: 最终响应完成
        DS->>DS: 处理最后的 SSE 数据
        DS->>Store: onStream(fullContent, true) ⚡ done=true
        DS->>DS: resolve(fullContent)
    end

    alt 错误处理
        XHR->>DS: onerror / ontimeout / status >= 400
        DS->>DS: reject(Error)
        Note over DS: 非 4xx 错误: 重试 (最多 2 次)<br/>4xx 错误: 立即抛出
    end
```

---

## 2. Zustand 状态流转

```mermaid
stateDiagram-v2
    [*] --> Idle: 初始状态
    
    Idle --> Loading: sendMessage()
    state Loading {
        [*] --> Preparing: set isLoading=true
        Preparing --> RAGSearch: 多层 RAG 检索
        RAGSearch --> BuildContext: 构建 apiMessages
        BuildContext --> AgentRouting: Agent 意图路由
        
        state AgentRouting {
            [*] --> ImageGen: 画图意图
            [*] --> WebSearch: 搜索意图
            [*] --> NormalChat: 普通对话
        }
        
        AgentRouting --> Streaming: 流式传输中
        
        state Streaming {
            [*] --> Receiving
            Receiving --> Receiving: onStream(chunk, false)<br/>更新 streamingContent<br/>更新 messages[]
            Receiving --> StreamDone: onStream(content, true)
        }
        
        StreamDone --> Saving: 保存到 DB
    }
    
    Loading --> Idle: set isLoading=false<br/>清空 streamingContent
    Loading --> Error: catch 异常
    Error --> Idle: 显示错误消息<br/>set isLoading=false

    note right of Loading
        三重保险:
        1. streamCallback done=true
        2. finally 块
        3. 120s 安全超时
    end note
```

---

## 3. isLoading 控制策略 (三重保险)

```mermaid
flowchart TD
    START["sendMessage() 开始<br/>isLoading = true"] --> TIMEOUT["⏰ 启动 120s 安全超时"]
    
    TIMEOUT --> TRY["try { ... }"]
    
    TRY --> STREAM["流式传输中..."]
    STREAM --> DONE_SIG{"onStream(content, true)<br/>done 信号到达?"}
    
    DONE_SIG -->|"是"| FIX1["🔧 保险1: streamCallback<br/>立即 set isLoading=false"]
    DONE_SIG -->|"否(流被中断)"| SAVE
    
    FIX1 --> SAVE["步骤4: 保存结果"]
    SAVE --> FIX2["🔧 保险2: 显式 set<br/>isLoading=false (再次确认)"]
    
    FIX2 --> FINALLY["finally 块"]

    TRY -->|"抛出异常"| CATCH["catch 块<br/>set isLoading=false"]
    CATCH --> FINALLY
    
    FINALLY --> FIX3["🔧 保险3: finally<br/>clearTimeout(safetyTimeout)<br/>set isLoading=false (终极)"]
    
    TIMEOUT -->|"120s 超时触发"| FORCE["⚠️ 保险4: 安全超时<br/>强制 isLoading=false"]

    FIX3 --> END(["✅ isLoading 必定为 false"])
    FORCE --> END

    style FIX1 fill:#C8E6C9,stroke:#2E7D32
    style FIX2 fill:#C8E6C9,stroke:#2E7D32
    style FIX3 fill:#C8E6C9,stroke:#2E7D32
    style FORCE fill:#FFECB3,stroke:#FF8F00
    style END fill:#A5D6A7,stroke:#1B5E20
```

### 3.1 流式 UI 更新节流（新增）

- `streamCallback` 仍保持 `onStream(chunk, done)` 语义不变。
- 为降低 Android 真机在长回复时的重渲染压力，Store 现在对消息气泡更新做了约 `66ms` 的节流刷新。
- `done=true` 不节流，立即 flush 到 UI，并立刻清理 `isLoading`，保证“完成即停”。
- `finally` 会额外清理节流定时器，避免会话结束后残留异步更新。

---

## 4. React 组件数据绑定

```mermaid
flowchart LR
    subgraph Zustand["Zustand Store"]
        ML["messages: Message[]"]
        SC["streamingContent: string"]
        IL["isLoading: boolean"]
    end

    subgraph Selectors["useStore 选择器"]
        S1["s => s.messages"]
        S2["s => s.isLoading"]
    end

    subgraph UI["index.tsx 渲染"]
        FL["FlatList<br/>data={messages}"]
        LI["ActivityIndicator<br/>visible={isLoading}"]
        MB["MessageBubble<br/>per message"]
    end

    subgraph Bubble["MessageBubble.tsx"]
        MD["react-native-markdown-display<br/>普通 Markdown 文本"]
        LATEX["WebView + KaTeX<br/>块级公式渲染"]
        MER["WebView + Mermaid<br/>图表渲染 + 放大预览"]
        IMG["Image<br/>source={generatedImageUrl}"]
        TC["ToolCall 展示<br/>tool_calls[]"]
    end

    ML --> S1 --> FL
    IL --> S2 --> LI
    FL --> MB
    MB --> MD
    MB --> LATEX
    MB --> MER
    MB --> IMG
    MB --> TC

    style Zustand fill:#FFF3E0
    style UI fill:#E3F2FD
    style Bubble fill:#E0F7FA
```

---

## 5. AbortController 取消流程

```mermaid
sequenceDiagram
    participant U as 👤 用户
    participant UI as index.tsx
    participant S as Store
    participant XHR as XMLHttpRequest

    U->>UI: 点击"停止生成"
    UI->>S: stopGeneration()
    S->>S: get()._abortController
    S->>XHR: controller.abort()
    
    Note over XHR: XHR 检测到 abort<br/>触发 onerror
    XHR-->>S: reject(AbortError)
    
    S->>S: catch: error.name === 'AbortError'
    S->>S: set isLoading=false<br/>streamingContent=''
    
    Note over S: 保留已生成的部分内容<br/>不显示错误消息
```
