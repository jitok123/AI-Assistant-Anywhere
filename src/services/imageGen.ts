/**
 * 图片生成服务
 * 使用阿里云 DashScope wanx/qwen-image 模型
 * 
 * 当 AI Agent 判断需要生成图片时调用
 */
import type { ImageGenResult } from '../types';

const DASHSCOPE_IMAGE_URL =
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis';

/**
 * 使用 qwen-image-max 生成图片
 */
export async function generateImage(
  prompt: string,
  apiKey: string,
  model: string = 'wanx-v1',
): Promise<ImageGenResult | null> {
  if (!apiKey || !prompt.trim()) return null;

  try {
    // 提交生成任务
    const response = await fetch(DASHSCOPE_IMAGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({
        model,
        input: {
          prompt: prompt.trim(),
        },
        parameters: {
          n: 1,
          size: '1024*1024',
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`图片生成提交失败 (${response.status}):`, errorText);
      return null;
    }

    const data = await response.json();
    const taskId = data?.output?.task_id;

    if (!taskId) {
      console.error('未获取到 task_id:', data);
      return null;
    }

    // 轮询等待结果
    return await pollImageResult(taskId, apiKey, prompt.trim());
  } catch (error) {
    console.error('图片生成错误:', error);
    return null;
  }
}

/**
 * 轮询图片生成结果
 */
async function pollImageResult(
  taskId: string,
  apiKey: string,
  originalPrompt: string,
  maxAttempts: number = 30,
  interval: number = 2000,
): Promise<ImageGenResult | null> {
  const statusUrl = `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, interval));

    try {
      const resp = await fetch(statusUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!resp.ok) continue;

      const data = await resp.json();
      const status = data?.output?.task_status;

      if (status === 'SUCCEEDED') {
        const results = data?.output?.results;
        if (results && results.length > 0) {
          return {
            url: results[0].url || results[0].b64_image || '',
            revisedPrompt: originalPrompt,
          };
        }
        return null;
      }

      if (status === 'FAILED') {
        console.error('图片生成失败:', data?.output?.message);
        return null;
      }

      // PENDING / RUNNING 继续等待
    } catch (error) {
      console.error('轮询图片结果错误:', error);
    }
  }

  console.error('图片生成超时');
  return null;
}

