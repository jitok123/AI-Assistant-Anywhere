/**
 * 语音服务 - 录音与语音合成
 */
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';

let recording: Audio.Recording | null = null;

/** 开始录音 */
export async function startRecording(): Promise<void> {
  try {
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
 * 将录音文件发送到 DashScope 进行识别
 */
export async function recognizeSpeech(
  audioUri: string,
  apiKey: string
): Promise<string> {
  // 使用阿里云 Paraformer 语音识别
  const formData = new FormData();
  formData.append('file', {
    uri: audioUri,
    type: 'audio/m4a',
    name: 'recording.m4a',
  } as any);

  try {
    const response = await fetch(
      'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error(`语音识别失败: ${response.status}`);
    }

    const data = await response.json();
    return data?.output?.text || '';
  } catch (error) {
    console.error('语音识别错误:', error);
    // 降级：提示用户手动输入
    throw new Error('语音识别失败，请检查网络或手动输入');
  }
}
