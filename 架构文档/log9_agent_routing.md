# 🤖 Agent 意图路由与工具调度

> V2.0：agent.ts 的核心决策逻辑 — LLM 路由优先 + 规则兜底

---

## 1. 四路意图路由总览

```mermaid
flowchart TD
    START(["👤 用户消息"]) --> EXTRACT["提取 userText<br/>从 apiMessages 末尾"]
    
    EXTRACT --> CHK1{"Agent 开启?<br/>ImageGen 开启?<br/>DashScope Key?"}
    
    CHK1 -->|"全部 ✅"| IMG_DET["detectImageGenIntent(text)"]
    CHK1 -->|"任一 ❌"| CHK2

    IMG_DET -->|"✅ 匹配"| IMG_ROUTE["🎨 路由1: 图片生成"]
    IMG_DET -->|"❌ 不匹配"| CHK2

    CHK2{"Agent 开启?<br/>WebSearch 开启?<br/>DashScope Key?"}
    
    CHK2 -->|"全部 ✅"| SEARCH_DET["detectWebSearchIntent(text)"]
    CHK2 -->|"任一 ❌"| NORMAL

    SEARCH_DET -->|"✅ 匹配"| SEARCH_ROUTE["🔍 路由2: 联网搜索"]
    SEARCH_DET -->|"❌ 不匹配"| NORMAL

    SEARCH_DET -->|"❌ 不匹配"| TIME_DET["detectTimeIntent(text)"]
    TIME_DET -->|"✅ 匹配"| TIME_ROUTE["🕒 路由3: 时间工具"]
    TIME_DET -->|"❌ 不匹配"| NORMAL["💬 路由4: 普通对话"]

    subgraph R1["路由1: 图片生成"]
        IMG_ROUTE --> IMG_STREAM["onStream: 🎨 正在生成图片..."]
        IMG_STREAM --> IMG_OPT["LLM 优化生图提示词"]
        IMG_OPT --> IMG_CALL["generateImage(optimizedPrompt, apiKey)"]
        IMG_CALL -->|"成功"| IMG_OK["返回 generatedImageUrl<br/>+ 简短确认文字"]
        IMG_CALL -->|"失败"| IMG_FALL["降级 → 路由2 检查"]
    end

    subgraph R2["路由2: 联网搜索 → DeepSeek"]
        SEARCH_ROUTE --> S_STREAM["onStream: 🔍 正在联网搜索..."]
        S_STREAM --> S_EXTRACT["searchAndExtract(text, apiKey)<br/>Qwen + enable_search 非流式"]
        S_EXTRACT -->|"成功"| S_INJECT["注入搜索事实到<br/>system message"]
        S_INJECT --> S_DEEPSEEK["chatCompletion(流式)<br/>DeepSeek 综合回答"]
        S_EXTRACT -->|"失败"| S_FALL["降级 → 路由3"]
    end

    subgraph R3["路由3: 时间工具"]
        TIME_ROUTE --> TIME_LOCAL["本地函数返回时间/日期/星期/时间戳"]
    end

    subgraph R4["路由4: 普通对话"]
        NORMAL --> DS_CALL["chatCompletion(流式)<br/>DeepSeek 直接回复"]
    end

    IMG_FALL --> CHK2
    S_FALL --> NORMAL

    IMG_OK --> DONE(["✅ 返回 AgentResult"])
    S_DEEPSEEK --> DONE
    TIME_LOCAL --> DONE
    DS_CALL --> DONE

    style R1 fill:#FCE4EC,stroke:#C62828
    style R2 fill:#E8F5E9,stroke:#2E7D32
    style R3 fill:#FFF3E0,stroke:#FB8C00
    style R4 fill:#E3F2FD,stroke:#1565C0
    style DONE fill:#C8E6C9,stroke:#1B5E20
```

---

## 2. 图片生成意图检测规则 (detectImageGenIntent)

```mermaid
flowchart TD
    INPUT(["输入文本 t"]) --> NEG["⛔ 负向排除"]
    
    NEG --> N1{"记得/想起/回忆<br/>+ 画/图/生成?"}
    N1 -->|是| FALSE1(["❌ return false"])
    N1 -->|否| N2{"之前/上次/以前<br/>+ 画/绘/生成?"}
    N2 -->|是| FALSE1
    N2 -->|否| N3{"不能/不会/无法<br/>+ 画/绘/生成?"}
    N3 -->|是| FALSE1
    N3 -->|否| POS["✅ 正向匹配"]

    POS --> R1{"1️⃣ 画/绘 + 量词<br/>画一张/绘三幅?"}
    R1 -->|是| TRUE(["✅ return true"])
    R1 -->|否| R2{"2️⃣ 给我画/帮我画<br/>请画/来画?"}
    R2 -->|是| TRUE
    R2 -->|否| R3{"3️⃣ 生成+图/画<br/>生成一张照片?"}
    R3 -->|是| TRUE
    R3 -->|否| R4{"4️⃣ 制作/创作<br/>+图/画/像?"}
    R4 -->|是| TRUE
    R4 -->|否| R5{"5️⃣ 生成+描述≥2字<br/>且非文本类?<br/>✅生成美少女<br/>❌生成代码"}
    R5 -->|是| TRUE
    R5 -->|否| R6{"6️⃣ 可以/能+生成<br/>+描述≥4字?<br/>✅可以生成超绝美少女吗<br/>❌你能生成吗"}
    R6 -->|是| TRUE
    R6 -->|否| R7{"7️⃣ 画/绘+对象≥2字<br/>且非图表类?<br/>✅画夕阳风景<br/>❌画饼图"}
    R7 -->|是| TRUE
    R7 -->|否| R8{"8️⃣ English<br/>draw/paint/generate image?"}
    R8 -->|是| TRUE
    R8 -->|否| FALSE2(["❌ return false"])

    style NEG fill:#FFCDD2
    style POS fill:#C8E6C9
    style TRUE fill:#A5D6A7,stroke:#2E7D32
    style FALSE1 fill:#EF9A9A,stroke:#C62828
    style FALSE2 fill:#EF9A9A,stroke:#C62828
```

---

## 3. 联网搜索意图检测规则 (detectWebSearchIntent)

```mermaid
flowchart LR
    INPUT(["输入文本"]) --> P1["搜索/搜一下"]
    INPUT --> P2["今/明/昨天+新闻/天气"]
    INPUT --> P3["今天发生了什么"]
    INPUT --> P4["最新/最近+新闻/资讯"]
    INPUT --> P5["实时+信息/数据"]
    INPUT --> P6["热点/头条/热搜"]
    INPUT --> P7["联网搜/上网查"]
    INPUT --> P8["现在的+价格/天气/汇率"]
    INPUT --> P9["YYYY年MM月+事件"]
    INPUT --> P10["English: search/latest"]

    P1 --> OR{"任一匹配?"}
    P2 --> OR
    P3 --> OR
    P4 --> OR
    P5 --> OR
    P6 --> OR
    P7 --> OR
    P8 --> OR
    P9 --> OR
    P10 --> OR

    OR -->|"是"| TRUE(["✅ 搜索意图"])
    OR -->|"否"| FALSE(["❌ 非搜索"])

    style TRUE fill:#A5D6A7
    style FALSE fill:#EF9A9A
```

---

## 4. 联网搜索两步流程详解

```mermaid
sequenceDiagram
    participant AG as Agent
    participant QW as Qwen (DashScope)
    participant DS as DeepSeek

    Note over AG: 检测到搜索意图
    AG->>QW: POST /compatible-mode/v1/chat/completions<br/>model: qwen-plus<br/>enable_search: true<br/>stream: false
    Note over QW: Qwen 联网搜索<br/>提取关键事实
    QW-->>AG: 搜索增强回复 (searchFacts)

    Note over AG: 将 searchFacts 注入<br/>system message 末尾

    AG->>DS: POST /chat/completions<br/>model: deepseek-chat/reasoner<br/>stream: true<br/>messages 含搜索上下文
    
    loop SSE 流式
        DS-->>AG: data: {"choices":[{"delta":{"content":"..."}}]}
        AG-->>AG: onStream(chunk, false)
    end
    DS-->>AG: data: [DONE]
    AG-->>AG: onStream(finalContent, true)

    Note over AG: 返回 AgentResult<br/>含 toolCalls[web_search]
```

---

## 5. 图片生成 API 调用流程

```mermaid
sequenceDiagram
    participant AG as Agent
    participant IG as imageGen.ts
    participant DS as DashScope API

    AG->>IG: generateImage(prompt, apiKey)
    IG->>IG: 构建 prompt: "根据描述生成图片: {text}"
    IG->>DS: POST /api/v1/services/aigc/<br/>multimodal-generation/generation<br/>model: qwen-image-max<br/>input.messages[{role:user, content:[{image: prompt}]}]
    
    alt 同步响应 (output.choices 存在)
        DS-->>IG: output.choices[0].message.content[0].image → URL
        IG-->>AG: { url, revisedPrompt }
    else 异步任务 (output.task_id)
        DS-->>IG: output.task_id + output.task_status
        loop 轮询 (最多 60 次, 间隔 2s)
            IG->>DS: GET /tasks/{task_id}
            DS-->>IG: task_status
        end
        DS-->>IG: SUCCEEDED → results[0].url
        IG-->>AG: { url }
    end

    AG->>AG: 不在 content 放 Markdown 图片<br/>通过 generatedImageUrl 字段传递
```

---

## 6. 路由策略说明（当前实现）

### 6.1 LLM 路由优先 + 规则兜底

- 当前 `agent.ts` 先调用 `decideRouteWithLLM` 输出 `image_gen / web_search / time_query / chat`。
- 当 LLM 路由失败或置信度不足时，降级到关键词规则：
    - `detectImageGenIntent`
    - `detectTimeIntent`
    - `detectWebSearchIntent`
- 设计目标是在保持跨模型兼容前提下，提高复杂语句的路由准确率。

### 6.2 联网搜索增强回退链路

- 主路径：`searchAndExtract(query)` 获取搜索事实
- 回退路径：若事实为空，使用 `qwenSearchChat(...)` 获取可用实时摘要
- 然后统一注入 DeepSeek 上下文进行最终流式回复

### 6.3 设计目标

- 降低误判（尤其是“是否生图”）
- 提高联网问答可用率
- 保持原有流式 `onStream(chunk, done)` 行为不变

## 7. 路由补充（时间工具 + 图片检索协同）

### 7.1 新增时间工具路由

- 新路由：`time_query`
- 触发场景：
    - “现在几点”“今天几号”“星期几”“时间戳”等
- 执行方式：
    - 不走外部模型，直接调用本地时间函数
    - 返回当前时间、日期、星期、时区、Unix 时间戳

### 7.2 图片轮与联网检索协同

- Agent 仍保持“文本轮路由决策”职责。
- 对于图片轮，由 `store` 编排组合能力：
    - 先进行视觉识别
    - 若用户问题含实时检索意图，再追加联网搜索
    - 最终交给对话模型流式综合

该设计确保：
- 不破坏现有 Agent 架构边界
- 同时支持“图片识别 + 联网搜索”在同一回合完成

### 7.3 与多附件能力的边界

- Agent 主要处理文本轮工具路由。
- 图片/文件多附件轮由 `store` 完成多模态消息拼装后再调用 Agent 或视觉链路。
- 对“描述刚生成图片”等跨轮引用请求，优先在 `store` 侧做上下文补全（复用上一条 `generatedImageUrl`）。

