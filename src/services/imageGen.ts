/**
 * 图片生成服务 — qwen-image-max
 *
 * 使用阿里云 DashScope multimodal-generation API（同步）
 * 相比旧版 wanx-v1 的异步轮询模式，qwen-image-max 支持同步返回，更简洁高效。
 *
 * API: POST https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
 */
import type { ImageGenResult } from '../types';

/** qwen-image-max 使用 multimodal-generation 同步端点 */
const DASHSCOPE_IMAGE_URL =
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

/** 旧版异步任务查询端点（兼容降级） */
const DASHSCOPE_TASK_URL = 'https://dashscope.aliyuncs.com/api/v1/tasks';

/**
 * 使用 qwen-image-max 生成图片
 * 优先同步返回，如果 API 返回 task_id 则降级到轮询模式
 */
export async function generateImage(
  prompt: string,
  apiKey: string,
  model: string = 'qwen-image-max',
  size: string = '1024*1024',
): Promise<ImageGenResult | null> {
  if (!apiKey || !prompt.trim()) return null;

  try {
    console.log('[ImageGen] 开始生成图片, 模型:', model, '提示词:', prompt.slice(0, 60));

    const response = await fetch(DASHSCOPE_IMAGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: {
          messages: [
            {
              role: 'user',
              content: [{ text: prompt.trim() }],
            },
          ],
        },
        parameters: {
          result_format: 'message',
          watermark: false,
          prompt_extend: true,
          size,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ImageGen] 请求失败 (${response.status}):`, errorText);
      return null;
    }

    const data = await response.json();
    console.log('[ImageGen] 响应状态码: 200, 数据预览:', JSON.stringify(data).slice(0, 300));

    // ── 同步响应解析（qwen-image-max / wan2.6） ──
    // 格式: output.choices[0].message.content[0].image
    const choices = data?.output?.choices;
    if (choices && choices.length > 0) {
      const msgContent = choices[0]?.message?.content;
      if (msgContent && Array.isArray(msgContent)) {
        const imageItem = msgContent.find(
          (item: any) => item.type === 'image' || item.image,
        );
        if (imageItem?.image) {
          console.log('[ImageGen] ✅ 同步获取到图片URL');
          return {
            url: imageItem.image,
            revisedPrompt: prompt.trim(),
          };
        }
      }
    }

    // ── 异步任务降级（wanx-v1 等旧模型） ──
    const taskId = data?.output?.task_id;
    if (taskId) {
      console.log('[ImageGen] 收到异步任务ID:', taskId, '开始轮询...');
      return await pollImageResult(taskId, apiKey, prompt.trim());
    }

    console.error('[ImageGen] 无法解析响应:', JSON.stringify(data).slice(0, 500));
    return null;
  } catch (error: any) {
    console.error('[ImageGen] 错误:', error?.message || error);
    return null;
  }
}

/**
 * 轮询图片生成结果（异步任务降级方案）
 */
async function pollImageResult(
  taskId: string,
  apiKey: string,
  originalPrompt: string,
  maxAttempts: number = 60,
  interval: number = 3000,
): Promise<ImageGenResult | null> {
  const statusUrl = `${DASHSCOPE_TASK_URL}/${taskId}`;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, interval));

    try {
      const resp = await fetch(statusUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!resp.ok) {
        console.warn(`[ImageGen] 轮询请求失败 (${resp.status}), 继续...`);
        continue;
      }

      const data = await resp.json();
      const status = data?.output?.task_status;

      if (status === 'SUCCEEDED') {
        // 新版 wan2.6 格式
        const choices = data?.output?.choices;
        if (choices && choices.length > 0) {
          const msgContent = choices[0]?.message?.content;
          if (msgContent && Array.isArray(msgContent)) {
            const imageItem = msgContent.find(
              (item: any) => item.type === 'image' || item.image,
            );
            if (imageItem?.image) {
              console.log('[ImageGen] ✅ 异步任务完成（新格式）');
              return { url: imageItem.image, revisedPrompt: originalPrompt };
            }
          }
        }

        // 旧版 wanx-v1 格式
        const results = data?.output?.results;
        if (results && results.length > 0 && results[0].url) {
          console.log('[ImageGen] ✅ 异步任务完成（旧格式）');
          return { url: results[0].url, revisedPrompt: originalPrompt };
        }

        console.error('[ImageGen] 任务成功但无法解析图片URL');
        return null;
      }

      if (status === 'FAILED') {
        console.error('[ImageGen] 任务失败:', data?.output?.message || data?.output?.code);
        return null;
      }

      // PENDING / RUNNING → 继续轮询
      if (i % 5 === 0) {
        console.log(`[ImageGen] 任务状态: ${status}, 已等待 ${(i + 1) * interval / 1000}s...`);
      }
    } catch (error: any) {
      console.warn('[ImageGen] 轮询错误:', error?.message);
    }
  }

  console.error('[ImageGen] 任务超时');
  return null;
}
