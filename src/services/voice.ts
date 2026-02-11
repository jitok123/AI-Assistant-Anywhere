/**
 * 语音服务 - 录音与语音合成
 */
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';

let recording: Audio.Recording | null = null;

/** 开始录音 */
export async function startRecording(): Promise<void> {
  try {
    // 清理之前可能存在的 recording 对象
    if (recording) {
      try {
        await recording.stopAndUnloadAsync();
      } catch (e) {
        console.warn('清理旧录音对象时出错:', e);
      }
      recording = null;
    }

    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      throw new Error('未授予麦克风权限');
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const { recording: newRecording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );
    recording = newRecording;
  } catch (error) {
    console.error('开始录音失败:', error);
    throw error;
  }
}

/** 停止录音并返回文件 URI */
export async function stopRecording(): Promise<string | null> {
  try {
    if (!recording) return null;

    await recording.stopAndUnloadAsync();
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
    });

    const uri = recording.getURI();
    recording = null;
    return uri;
  } catch (error) {
    console.error('停止录音失败:', error);
    recording = null;
    return null;
  }
}

/** 语音合成（TTS） */
export function speak(
  text: string,
  onDone?: () => void
): void {
  // 清除 markdown 标记
  const cleanText = text
    .replace(/```[\s\S]*?```/g, '代码块')
    .replace(/[#*`_~\[\]()>|]/g, '')
    .replace(/\n+/g, '。')
    .trim();

  if (!cleanText) return;

  Speech.speak(cleanText, {
    language: 'zh-CN',
    rate: 1.0,
    pitch: 1.0,
    onDone,
    onError: (error) => {
      console.error('语音合成失败:', error);
      onDone?.();
    },
  });
}

/** 停止语音播放 */
export function stopSpeaking(): void {
  Speech.stop();
}

/** 是否正在播放语音 */
export async function isSpeaking(): Promise<boolean> {
  return Speech.isSpeakingAsync();
}

/**
 * 阿里云语音识别 (ASR)
 * 使用千问3-ASR-Flash模型进行短音频识别（<5分钟）
 * 官方文档：https://help.aliyun.com/zh/model-studio/getting-started/models
 */
export async function recognizeSpeech(
  audioUri: string,
  apiKey: string
): Promise<string> {
  const formData = new FormData();
  
  // 上传音频文件
  formData.append('file', {
    uri: audioUri,
    type: 'audio/m4a',
    name: 'recording.m4a',
  } as any);
  
  // 使用千问3-ASR-Flash模型
  formData.append('model', 'qwen3-asr-flash');

  const response = await fetchWithTimeout(
    'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    },
    30000,
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`语音识别失败 (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  
  // 提取识别文本
  const text = data?.output?.text || '';
  if (!text) {
    throw new Error('语音识别返回为空');
  }
  
  return text;
}

/**
 * 带超时的 fetch 封装
 */
function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('语音识别超时')), timeoutMs);
    fetch(url, options)
      .then((res) => { clearTimeout(timer); resolve(res); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}
