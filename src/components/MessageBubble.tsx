/**
 * 聊天消息气泡组件（V2.0）
 * 支持 Markdown / LaTeX / Mermaid / 附件与工具调用可视化。
 */
import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Alert, Modal, Pressable } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Markdown from 'react-native-markdown-display';
import { WebView } from 'react-native-webview';
import { useTheme } from '../hooks/useTheme';
import { useAppStore } from '../store';
import { getUserBubbleColorByStyle, Typography } from '../constants/theme';
import { APP_AVATAR } from '../constants/branding';
import type { Message } from '../types';
import { saveImageToGallery } from '../utils/fileUtils';

interface Props {
  message: Message;
}

type RichSegment =
  | { type: 'text'; value: string }
  | { type: 'latex'; value: string }
  | { type: 'mermaid'; value: string };

function stripLatexFence(raw: string): string {
  const t = raw.trim();
  if (t.startsWith('$$') && t.endsWith('$$')) {
    return t.slice(2, -2).trim();
  }
  if (t.startsWith('\\[') && t.endsWith('\\]')) {
    return t.slice(2, -2).trim();
  }
  if (t.startsWith('\\(') && t.endsWith('\\)')) {
    return t.slice(2, -2).trim();
  }
  if (t.startsWith('$') && t.endsWith('$') && t.length > 2) {
    return t.slice(1, -1).trim();
  }
  return t;
}

function parseRichContentSegments(content: string): RichSegment[] {
  const mermaidRegex = /```mermaid\s*([\s\S]*?)```/gi;
  const segments: RichSegment[] = [];
  let cursor = 0;

  const pushTextWithLatex = (text: string) => {
    if (!text) return;
    // 只匹配块级 LaTeX：$$...$$  和  \[...\]
    // 行内 $...$ 与 \(...\) 留在文本段，由 Markdown 原样显示，避免为每个符号创建 WebView
    const latexRegex = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\])/g;
    let innerCursor = 0;
    let latexMatch: RegExpExecArray | null;

    while ((latexMatch = latexRegex.exec(text)) !== null) {
      const before = text.slice(innerCursor, latexMatch.index);
      if (before) segments.push({ type: 'text', value: before });
      const latexRaw = latexMatch[0];
      if (latexRaw.trim()) {
        segments.push({ type: 'latex', value: stripLatexFence(latexRaw) });
      }
      innerCursor = latexMatch.index + latexRaw.length;
    }

    const tail = text.slice(innerCursor);
    if (tail) segments.push({ type: 'text', value: tail });
  };

  let m: RegExpExecArray | null;
  while ((m = mermaidRegex.exec(content)) !== null) {
    const before = content.slice(cursor, m.index);
    pushTextWithLatex(before);

    const chart = m[1]?.trim();
    if (chart) segments.push({ type: 'mermaid', value: chart });
    cursor = m.index + m[0].length;
  }

  pushTextWithLatex(content.slice(cursor));
  return segments.filter((seg) => seg.value.trim().length > 0);
}

function buildLatexHtml(latex: string, textColor: string, darkBg = false): string {
  const bgColor = darkBg ? '#111827' : 'transparent';
  const safeLatex = latex
    .replace(/\\begin\{document\}|\\end\{document\}/g, '')
    .trim();

  return `<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" />
  <style>
    html, body { margin:0; padding:0; background:${bgColor}; overflow:auto; width:100%; height:100%; }
    #math { color:${textColor}; font-size:1.08rem; padding:8px 10px; line-height:1.4; }
    .err { opacity: 0.85; font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
  </style>
</head>
<body>
  <div id="math"></div>
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
  <script>
    (function () {
      var target = document.getElementById('math');
      var input = ${JSON.stringify(safeLatex)};
      try {
        katex.render(input, target, { displayMode: true, throwOnError: false, strict: 'ignore', trust: true });
      } catch (e) {
        try {
          target.innerHTML = '<div class="err">LaTeX 渲染失败，以下为源码：\\n\\n' + input.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
        } catch (_e) {
          target.textContent = input;
        }
      }
    })();
  </script>
</body>
</html>`;
}

function buildMermaidHtml(chart: string, darkMode: boolean, zoomEnabled = false, darkBg = false): string {
  const theme = darkMode ? 'dark' : 'default';
  const bgColor = darkBg ? '#111827' : 'transparent';
  const zoomMeta = zoomEnabled
    ? '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=8, minimum-scale=0.5, user-scalable=yes" />'
    : '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />';

  return `<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  ${zoomMeta}
  <style>
    html, body { margin:0; padding:0; background:${bgColor}; width: 100%; height: 100%; }
    body { ${zoomEnabled ? 'overflow:auto;' : 'overflow:hidden;'} }
    #wrap { box-sizing: border-box; padding: 16px; width: 100%; min-height: 100%; display: flex; justify-content: center; align-items: center; }
    .mermaid { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; width: 100%; text-align: center; }
    .mermaid svg { max-width: 100%; height: auto; }
    .err { color: #E5E7EB; opacity: 0.9; font-size: 13px; line-height: 1.6; white-space: pre-wrap; text-align: left; }
  </style>
</head>
<body>
  <div id="wrap">
    <pre class="mermaid">${chart
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')}</pre>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <script>
    (async function () {
      try {
        mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: '${theme}' });
        const nodes = document.querySelectorAll('.mermaid');
        await mermaid.run({ nodes: nodes });
      } catch (e) {
        var wrap = document.getElementById('wrap');
        if (wrap) {
          wrap.innerHTML = '<div class="err">Mermaid 渲染失败，以下为源码：\\n\\n' + ${JSON.stringify(chart)}.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
        }
      }
    })();
  </script>
</body>
</html>`;
}

/** 移除 Markdown 图片语法，避免 react-native-markdown-display 的 key prop 崩溃 */
export function stripMarkdownImages(text: string): string {
  // 移除 ![alt](url) 格式
  return text.replace(/!\[[^\]]*\]\([^)]+\)/g, '');
}

function normalizeStreamingMath(text: string): string {
  if (!text) return text;
  return text
    // 常见模型会输出转义版 \[ ... \] / \( ... \)
    .replace(/\\\[/g, '$$')
    .replace(/\\\]/g, '$$')
    .replace(/\\\(/g, '$')
    .replace(/\\\)/g, '$')
    // 避免结尾只有一个 \ 导致显示噪音
    .replace(/\\$/g, '');
}

/**
 * 可流式渲染 HTML 模板：支持 Markdown + LaTeX 实时渲染。
 * 通过 injectJavaScript 调用 window.updateContent(text, streaming) 更新。
 * KaTeX 异步加载，公式点击自动复制源码到剪贴板。
 */
function buildStreamableHtml(textColor: string, isDark: boolean): string {
  const linkColor = isDark ? '#93C5FD' : '#3B82F6';
  const codeBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)';
  const codeBlockBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)';
  const bqBorder = isDark ? '#60A5FA' : '#3B82F6';
  const hrColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const formulaBg = isDark ? 'rgba(147,197,253,0.06)' : 'rgba(59,130,246,0.04)';
  const formulaBorder = isDark ? 'rgba(147,197,253,0.15)' : 'rgba(59,130,246,0.1)';
  const formulaActiveBg = isDark ? 'rgba(147,197,253,0.14)' : 'rgba(59,130,246,0.1)';
  const thinkingColor = isDark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.28)';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" crossorigin>
<style>
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}html,body{margin:0;padding:0;background:transparent}
body{color:${textColor};font-size:16px;line-height:1.78;padding:6px 4px;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;word-wrap:break-word;overflow-wrap:break-word;-webkit-text-size-adjust:100%}
h1{font-size:1.28em;font-weight:700;margin:.5em 0 .3em;line-height:1.45}
h2{font-size:1.18em;font-weight:700;margin:.45em 0 .25em;line-height:1.45}
h3{font-size:1.1em;font-weight:600;margin:.4em 0 .22em;line-height:1.45}
h4,h5,h6{font-size:1em;font-weight:600;margin:.35em 0 .18em;line-height:1.45}
p{margin:.35em 0 .55em;line-height:1.78}
strong{font-weight:700}em{font-style:italic}
a{color:${linkColor};text-decoration:none}
code{background:${codeBg};padding:1px 5px;border-radius:4px;font-size:.86em;font-family:Menlo,Consolas,'Courier New',monospace}
pre{background:${codeBlockBg};padding:10px 12px;border-radius:8px;overflow-x:auto;margin:.5em 0;line-height:1.55}
pre code{background:none;padding:0;font-size:.84em}
blockquote{border-left:3px solid ${bqBorder};padding:2px 0 2px 12px;margin:.45em 0;opacity:.88}
ul,ol{padding-left:1.5em;margin:.25em 0 .55em}
li{margin-bottom:.18em;line-height:1.75}li>p{margin:.1em 0}
hr{border:none;border-top:1px solid ${hrColor};margin:.65em 0}
table{border-collapse:collapse;margin:.5em 0;width:100%}
th,td{border:1px solid ${hrColor};padding:5px 8px;text-align:left;font-size:.92em}th{font-weight:600}
.katex-display{overflow-x:auto;overflow-y:hidden;padding:10px 14px;margin:.4em 0;background:${formulaBg};border:1px solid ${formulaBorder};border-radius:10px;cursor:pointer;transition:background .15s ease}
.katex-display:active{background:${formulaActiveBg}}
.katex{font-size:1.08em}
.katex-inline-tap{cursor:pointer;padding:1px 2px;border-radius:4px;transition:background .15s}
.katex-inline-tap:active{background:${formulaActiveBg}}
.copy-hint{position:fixed;bottom:12px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.78);color:#fff;padding:6px 18px;border-radius:20px;font-size:13px;z-index:999;opacity:0;transition:opacity .25s;pointer-events:none}
.copy-hint.visible{opacity:1}
@keyframes cursor-blink{0%,100%{opacity:1}50%{opacity:0}}
.stream-cursor{display:inline-block;width:2px;height:1.05em;background:${textColor};margin-left:2px;vertical-align:text-bottom;animation:cursor-blink .8s step-end infinite}
.thinking{color:${thinkingColor};font-style:italic}
.math-src{background:${codeBg};border-radius:6px;padding:6px 10px;margin:.3em 0;font-family:Menlo,Consolas,monospace;font-size:.88em;line-height:1.6;white-space:pre-wrap;overflow-x:auto}
</style></head><body>
<div id="out"><p class="thinking">思考中...</p></div>
<div id="cpToast" class="copy-hint">已打开公式预览</div>
<script>
(function(){
var katexOk=false,curText='';var out=document.getElementById('out'),toast=document.getElementById('cpToast');
var D=String.fromCharCode(36),DD=D+D,BT=String.fromCharCode(96),BT3=BT+BT+BT;
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function md(src){var mt=[],cd=[];var i,p,s,T,L;
p=src.split(BT3);s='';for(i=0;i<p.length;i++){if(i%2===0)s+=p[i];else{cd.push(p[i]);s+='@@C'+(cd.length-1)+'@@'}}
var p2=s.split(BT);s='';
for(i=0;i<p2.length;i++){if(i%2===0)s+=p2[i];else if(p2[i].indexOf('\\n')<0&&p2[i].length>0&&p2[i].length<80){cd.push(BT+p2[i]+BT);s+='@@IC'+(cd.length-1)+'@@'}else{s+=BT+p2[i]+BT}}
p=s.split(DD);s='';
for(i=0;i<p.length;i++){if(i%2===0)s+=p[i];else{mt.push(DD+p[i]+DD);s+='@@M'+(mt.length-1)+'@@'}}
p=s.split(D);s='';
for(i=0;i<p.length;i++){if(i%2===0)s+=p[i];else{if(p[i].indexOf('\\n')<0&&p[i].trim().length>0&&p[i].length<120){mt.push(D+p[i]+D);s+='@@M'+(mt.length-1)+'@@'}else{s+=D+p[i]+D}}}
s=esc(s);
var lines=s.split('\\n'),h='',ul=false,ol=false;
for(i=0;i<lines.length;i++){L=lines[i];T=L.trim();
if(!T){if(ul){h+='</ul>';ul=false}if(ol){h+='</ol>';ol=false}h+='</p><p>';continue}
if(T.charAt(0)==='#'){var lvl=0;while(T.charAt(lvl)==='#'&&lvl<6)lvl++;
if(T.charAt(lvl)===' '){if(ul){h+='</ul>';ul=false}if(ol){h+='</ol>';ol=false}h+='<h'+lvl+'>'+T.substring(lvl+1)+'</h'+lvl+'>';continue}}
var bm=T.match(/^[\\-\\*\\u2022\\u00b7]\\s+(.*)/);
if(bm){if(ol){h+='</ol>';ol=false}if(!ul){h+='<ul>';ul=true}h+='<li>'+bm[1]+'</li>';continue}
var nm=T.match(/^(\\d+)[\\.)\\uff0e]\\s+(.*)/);
if(nm){if(ul){h+='</ul>';ul=false}if(!ol){h+='<ol start="'+nm[1]+'">';ol=true}h+='<li>'+nm[2]+'</li>';continue}
if(ul){h+='</ul>';ul=false}if(ol){h+='</ol>';ol=false}
if(/^-{3,}$/.test(T)||/^\\*{3,}$/.test(T)||/^_{3,}$/.test(T)){h+='<hr>';continue}
if(T.indexOf('&gt; ')===0){h+='<blockquote><p>'+T.substring(5)+'</p></blockquote>';continue}
h+=L+'<br>';}
if(ul)h+='</ul>';if(ol)h+='</ol>';
h='<p>'+h+'</p>';
h=h.replace(/\\*\\*\\*(.+?)\\*\\*\\*/g,'<strong><em>$1</em></strong>');
h=h.replace(/\\*\\*(.+?)\\*\\*/g,'<strong>$1</strong>');
h=h.replace(/\\*([^\\*]+?)\\*/g,'<em>$1</em>');
h=h.replace(/<p>\\s*<\\/p>/g,'');
for(i=0;i<cd.length;i++){
var v=cd[i];
if(typeof v==='string'&&v.charAt(0)===BT){
h=h.split('@@IC'+i+'@@').join('<code>'+esc(v.substring(1,v.length-1))+'</code>')
}else{var c=v,nl=v.indexOf('\\n');
if(nl>-1)c=v.substring(nl+1);
h=h.split('@@C'+i+'@@').join('<pre><code>'+esc(c.trim())+'</code></pre>')
}}
for(i=0;i<mt.length;i++){
h=h.split('@@M'+i+'@@').join(mt[i])
}
return h}
var mathTimer=null;
function doMath(){if(!katexOk)return;try{if(typeof renderMathInElement==='function'){renderMathInElement(out,{delimiters:[{left:DD,right:DD,display:true},{left:D,right:D,display:false}],throwOnError:false,trust:true})}}catch(e){}bindTap();rh()}
function schedMath(){if(mathTimer)clearTimeout(mathTimer);mathTimer=setTimeout(doMath,180)}
function bindTap(){out.querySelectorAll('.katex-display').forEach(function(el){if(el._b)return;el._b=true;el.addEventListener('click',function(e){e.stopPropagation();var a=el.querySelector('annotation[encoding="application/x-tex"]');if(a){postOpen(DD+a.textContent+DD)}})});
out.querySelectorAll('.katex:not(.katex-display .katex)').forEach(function(el){if(el._b)return;el._b=true;var w=el.parentElement;if(w&&!w.classList.contains('katex-inline-tap')){var sp=document.createElement('span');sp.className='katex-inline-tap';w.insertBefore(sp,el);sp.appendChild(el);w=sp}
(w||el).addEventListener('click',function(e){e.stopPropagation();var a=el.querySelector('annotation[encoding="application/x-tex"]');if(a){postOpen(D+a.textContent+D)}})})}
function postOpen(latex){if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({type:'openLatex',latex:latex}))}toast.classList.add('visible');setTimeout(function(){toast.classList.remove('visible')},1200)}
function rh(){var h=document.documentElement.scrollHeight;if(h>0&&window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({type:'height',height:h}))}}
window.updateContent=function(text,streaming){curText=text;
if(!text||!text.trim()){out.innerHTML='<p class="thinking">思考中...</p>';rh();return}
try{var h=md(text);if(streaming)h+='<span class="stream-cursor"></span>';out.innerHTML=h}catch(e){out.innerHTML='<p>'+esc(text).replace(/\\n/g,'<br>')+'</p>'}
schedMath();rh()};
function ls(u,cb){var s=document.createElement('script');s.src=u;s.onload=cb;s.onerror=function(){if(cb)cb()};document.head.appendChild(s)}
ls('https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js',function(){ls('https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js',function(){katexOk=true;if(curText)doMath()})});
setTimeout(rh,200);setTimeout(rh,800);
})();
</script></body></html>`;
}

function MessageBubbleImpl({ message }: Props) {
  const colors = useTheme();
  const { userDisplayName, userAvatarEmoji, userBubbleStyle, theme } = useAppStore((s) => s.settings);
  const isUser = message.role === 'user';
  // 使用 store 的 streamingMessageId 精准定位当前流式消息
  const isThisStreaming = useAppStore((s) => !!s.isLoading && !isUser && s.streamingMessageId === message.id);
  const liveStreamContent = useAppStore((s) => (s.streamingMessageId === message.id ? s.streamingContent : ''));
  const [previewUri, setPreviewUri] = React.useState<string | null>(null);
  const [mermaidPreview, setMermaidPreview] = React.useState<string | null>(null);
  const [latexPreview, setLatexPreview] = React.useState<string | null>(null);
  const [webViewHeight, setWebViewHeight] = React.useState(40);
  const isDark = theme === 'dark';
  const userBubbleColor = getUserBubbleColorByStyle(userBubbleStyle, isDark);
  const rawContent = isThisStreaming ? (liveStreamContent || message.content || '') : (message.content || '');
  const sanitizedContent = stripMarkdownImages(rawContent);
  const displayContent = isUser ? sanitizedContent : normalizeStreamingMath(sanitizedContent);
  // 内容类型检测
  const hasLatex = React.useMemo(
    () => /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)/.test(sanitizedContent),
    [sanitizedContent]
  );
  const hasMermaid = React.useMemo(() => /```mermaid/i.test(sanitizedContent), [sanitizedContent]);
  // 仅在有 Mermaid 且无 LaTeX、非流式时使用逐段渲染
  const richSegments = React.useMemo(
    () => (!isThisStreaming && hasMermaid && !hasLatex) ? parseRichContentSegments(sanitizedContent) : [],
    [isThisStreaming, hasMermaid, hasLatex, sanitizedContent]
  );
  const hasRichSegments = !isUser && !isThisStreaming && !hasLatex && hasMermaid && richSegments.some(s => s.type === 'mermaid');

  // Sticky：一旦某消息启用了 WebView（因检测到 LaTeX），就不再关闭，防止卸载 WebView 导致闪退
  const [webViewSticky, setWebViewSticky] = React.useState(false);
  React.useEffect(() => {
    if (hasLatex && !isUser && !webViewSticky) setWebViewSticky(true);
  }, [hasLatex, isUser, webViewSticky]);

  // 错误状态
  const [combinedFailed, setCombinedFailed] = React.useState(false);
  const [failedSegments, setFailedSegments] = React.useState<Set<number>>(new Set());
  const handleSegmentError = React.useCallback((idx: number) => {
    setFailedSegments((prev) => {
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
  }, []);

  const bubbleStyle = isUser
    ? [styles.bubble, styles.userBubble, { backgroundColor: userBubbleColor }]
    : [styles.bubble, styles.aiBubble, { backgroundColor: colors.aiBubble, borderColor: colors.border }];

  const textColor = isUser ? colors.userBubbleText : colors.aiBubbleText;

  // WebView 仅在检测到 LaTeX 时启用；sticky 保证一旦启用就不卸载（防止 Android 闪退）
  const useWebView = !isUser && (hasLatex || webViewSticky) && !combinedFailed;
  const webViewHtml = React.useMemo(
    () => useWebView ? buildStreamableHtml(textColor, isDark) : '',
    [useWebView, textColor, isDark]
  );
  const webViewRef = React.useRef<WebView>(null);
  const webViewReadyRef = React.useRef(false);
  const lastInjectedPayloadRef = React.useRef('');
  const isStreamingRef = React.useRef(isThisStreaming);
  isStreamingRef.current = isThisStreaming;
  const latestContentRef = React.useRef(displayContent);
  latestContentRef.current = displayContent;
  const normalizeWebViewHeight = React.useCallback((rawHeight: number) => {
    const textLen = latestContentRef.current?.length || 0;
    const expectedMax = Math.min(2200, Math.max(140, Math.round(textLen * 1.8) + 260));
    const safe = Math.ceil(rawHeight) + 16;
    return Math.max(40, Math.min(safe, expectedMax));
  }, []);
  const handleWebViewMessage = React.useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'height' && data.height > 0) {
        const h = normalizeWebViewHeight(data.height);
        setWebViewHeight((prev) => {
          if (!isStreamingRef.current) return h;
          if (h >= prev) return h;
          // 流式阶段允许有限回落，避免巨大白块持续存在
          if (prev - h > 120) return h + 24;
          return prev;
        });
      }
      if (data.type === 'openLatex' && data.latex) {
        setLatexPreview(data.latex);
      }
    } catch {}
  }, [normalizeWebViewHeight]);
  const handleWebViewLoadEnd = React.useCallback(() => {
    webViewReadyRef.current = true;
    if (webViewRef.current && latestContentRef.current) {
      const payload = `${isStreamingRef.current ? '1' : '0'}|${latestContentRef.current}`;
      lastInjectedPayloadRef.current = payload;
      webViewRef.current.injectJavaScript(`window.updateContent(${JSON.stringify(latestContentRef.current)},${isStreamingRef.current});true;`);
    }
  }, []);
  // 流式更新：内容变化时注入到 WebView
  React.useEffect(() => {
    if (useWebView && webViewReadyRef.current && webViewRef.current) {
      const payload = `${isThisStreaming ? '1' : '0'}|${displayContent}`;
      if (payload === lastInjectedPayloadRef.current) return;
      lastInjectedPayloadRef.current = payload;
      webViewRef.current.injectJavaScript(`window.updateContent(${JSON.stringify(displayContent)},${isThisStreaming});true;`);
    }
  }, [displayContent, useWebView, isThisStreaming]);
  React.useEffect(() => {
    // 消息切换时重置状态
    setWebViewHeight(40);
    setCombinedFailed(false);
    setWebViewSticky(false);
    lastInjectedPayloadRef.current = '';
    webViewReadyRef.current = false;
  }, [message.id]);

  const displayAvatarEmoji = React.useMemo(
    () => Array.from((userAvatarEmoji || '🙂').trim()).slice(0, 2).join('') || '🙂',
    [userAvatarEmoji]
  );

  const mdStyles = {
    body: { color: textColor, fontSize: 16, lineHeight: 29, fontFamily: Typography.fontFamily, letterSpacing: 0.2 },
    heading1: { color: textColor, fontSize: 22, fontWeight: '700' as const, marginTop: 6, marginBottom: 12, lineHeight: 32 },
    heading2: { color: textColor, fontSize: 20, fontWeight: '700' as const, marginTop: 5, marginBottom: 11, lineHeight: 30 },
    heading3: { color: textColor, fontSize: 18, fontWeight: '600' as const, marginTop: 4, marginBottom: 10, lineHeight: 28 },
    paragraph: { color: textColor, marginBottom: 14, lineHeight: 29 },
    link: { color: colors.primary },
    code_inline: {
      backgroundColor: isUser ? 'rgba(255,255,255,0.2)' : colors.primaryLight,
      color: textColor,
      paddingHorizontal: 4,
      borderRadius: 5,
      fontSize: 14,
    },
    code_block: {
      backgroundColor: isUser ? 'rgba(0,0,0,0.2)' : colors.primaryLight,
      color: textColor,
      padding: 12,
      borderRadius: 10,
      fontSize: 14,
      fontFamily: 'monospace',
    },
    fence: {
      backgroundColor: isUser ? 'rgba(0,0,0,0.2)' : colors.primaryLight,
      color: textColor,
      padding: 12,
      borderRadius: 10,
      fontSize: 14,
    },
    blockquote: {
      borderLeftColor: colors.primary,
      borderLeftWidth: 3,
      paddingLeft: 10,
      paddingVertical: 6,
      marginBottom: 10,
      backgroundColor: 'rgba(120,145,180,0.08)',
      borderTopRightRadius: 8,
      borderBottomRightRadius: 8,
    },
    list_item: { color: textColor, lineHeight: 29, marginBottom: 6 },
    bullet_list: { color: textColor },
    ordered_list: { color: textColor },
    hr: { backgroundColor: colors.border, height: 1, marginVertical: 10 },
  };

  const handleDownloadImage = async (uri?: string) => {
    if (!uri) return;
    const ok = await saveImageToGallery(uri);
    if (ok) {
      Alert.alert('保存成功', '图片已保存到系统相册');
    } else {
      Alert.alert('保存失败', '请检查相册权限后重试');
    }
  };

  const attachmentImageUris = (message.attachments || [])
    .filter((att) => att.kind === 'image')
    .map((att) => att.uri)
    .filter(Boolean);

  const legacyUris = [message.imageUri, message.generatedImageUrl].filter(
    (u): u is string => !!u
  );

  const imageUris = Array.from(new Set([...attachmentImageUris, ...legacyUris]));

  return (
    <View style={[styles.container, isUser && styles.userContainer]}>
      {/* 角色标识 */}
      <View style={[styles.avatar, { borderColor: isUser ? colors.primary : colors.border }]}>
        {isUser ? (
          <Text style={[styles.avatarText, { color: colors.primary }]}>
            {displayAvatarEmoji}
          </Text>
        ) : (
          <Image source={APP_AVATAR} style={styles.avatarImage} />
        )}
      </View>

      <View style={[styles.contentWrap, isUser && styles.userContentWrap]}>
        {/* 图片消息（支持多图） */}
        {imageUris.length > 0 && (
          <View style={styles.imageGrid}>
            {imageUris.map((uri, idx) => (
              <View key={`${uri}-${idx}`} style={styles.imageItemWrap}>
                <TouchableOpacity activeOpacity={0.85} onPress={() => setPreviewUri(uri)}>
                  <Image
                    source={{ uri }}
                    style={styles.image}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.downloadBtn, { borderColor: colors.border }]}
                  onPress={() => handleDownloadImage(uri)}
                >
                    <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: Typography.fontFamily }}>⬇ 下载图片</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* 多附件展示 */}
        {!!message.attachments?.some((att) => att.kind === 'file') && (
          <View style={styles.multiAttachmentWrap}>
            {message.attachments?.filter((att) => att.kind === 'file').map((att, idx) => (
              <View key={`${att.uri}-${idx}`} style={[styles.fileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.fileIcon, { color: colors.primary }]}>📎</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
                    {att.name}
                  </Text>
                  {!!att.mimeType && (
                    <Text style={[styles.fileMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                      {att.mimeType}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* 文件消息 */}
        {message.fileName && (
          <View style={[styles.fileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.fileIcon, { color: colors.primary }]}>📎</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
                {message.fileName}
              </Text>
              {!!message.fileMimeType && (
                <Text style={[styles.fileMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                  {message.fileMimeType}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* 思考过程/工具调用展示 */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <View style={styles.toolsContainer}>
            {message.toolCalls.map((call, idx) => (
              <View
                key={idx}
                style={[styles.toolCall, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Text style={[styles.toolTitle, { color: colors.textSecondary }]}>
                  {call.tool === 'web_search' ? '🔍 联网搜索' : 
                   call.tool === 'image_gen' ? '🎨 图片生成' :
                   call.tool === 'vision_analyze' ? '🖼️ 图片识别' :
                   call.tool === 'time_now' ? '🕒 时间工具' : '⚙️ 工具调用'}
                </Text>
                <Text style={[styles.toolInput, { color: colors.textTertiary }]} numberOfLines={1}>
                  "{call.input}"
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* 搜索结果来源引用 */}
        {!isUser && message.searchResults && message.searchResults.length > 0 && (
          <View style={styles.sourcesContainer}>
            <Text style={[styles.sourceLabel, { color: colors.textSecondary }]}>参考来源:</Text>
            {message.searchResults.map((res, idx) => (
              <Text key={idx} style={[styles.sourceLink, { color: colors.primary }]} numberOfLines={1}>
                [{idx + 1}] {res.title}
              </Text>
            ))}
          </View>
        )}

        {/* 文本内容 */}
        <View style={bubbleStyle}>
          {(message.content || isThisStreaming) ? (
            isUser ? (
              <Text style={{ color: textColor, fontSize: 16, lineHeight: 29, fontFamily: Typography.fontFamily, letterSpacing: 0.2 }}>
                {message.content}
              </Text>
            ) : useWebView ? (
              <WebView
                ref={webViewRef}
                originWhitelist={['*']}
                source={{ html: webViewHtml, baseUrl: 'https://cdn.jsdelivr.net/' }}
                style={{ height: webViewHeight, backgroundColor: 'transparent' }}
                scrollEnabled={false}
                javaScriptEnabled
                domStorageEnabled
                mixedContentMode="always"
                allowUniversalAccessFromFileURLs
                onMessage={handleWebViewMessage}
                onLoadEnd={handleWebViewLoadEnd}
                onError={() => setCombinedFailed(true)}
                onRenderProcessGone={() => setCombinedFailed(true)}
              />
            ) : hasRichSegments ? (
              <View>
                {richSegments.map((seg, idx) => {
                  if (seg.type === 'text') {
                    return (
                      <View key={`text-${idx}`} style={styles.richTextChunk}>
                        <Markdown style={mdStyles as any}>{seg.value}</Markdown>
                      </View>
                    );
                  }

                  // mermaid
                  if (failedSegments.has(idx)) {
                    return (
                      <View key={`mermaid-err-${idx}`} style={[styles.mermaidCard, { borderColor: colors.border, padding: 10 }]}>
                        <Text style={{ color: colors.textSecondary, fontSize: 11, fontFamily: 'monospace', marginBottom: 4 }}>Mermaid 渲染失败，源码：</Text>
                        <Text selectable style={{ color: textColor, fontSize: 13, fontFamily: 'monospace' }}>{seg.value}</Text>
                      </View>
                    );
                  }
                  return (
                    <TouchableOpacity
                      key={`mermaid-${idx}`}
                      activeOpacity={0.85}
                      onPress={() => setMermaidPreview(seg.value)}
                      style={[styles.mermaidCard, { borderColor: colors.border }]}
                    >
                      <View style={[styles.mermaidHeader, { borderBottomColor: colors.border }]}>
                        <Text style={[styles.mermaidTitle, { color: colors.textSecondary }]}>Mermaid 图表（点击放大）</Text>
                      </View>
                      <WebView
                        originWhitelist={["*"]}
                        source={{ html: buildMermaidHtml(seg.value, isDark, false, false) }}
                        style={styles.mermaidWebView}
                        scrollEnabled={false}
                        javaScriptEnabled
                        pointerEvents="none"
                        onError={() => handleSegmentError(idx)}
                        onHttpError={() => handleSegmentError(idx)}
                        onRenderProcessGone={() => handleSegmentError(idx)}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <Markdown style={mdStyles as any}>
                {displayContent}
              </Markdown>
            )
          ) : (
            <Text style={{ color: colors.textTertiary, fontStyle: 'italic', fontFamily: Typography.fontFamily }}>
              思考中...
            </Text>
          )}
        </View>

        {isUser && (
          <Text style={[styles.userName, { color: colors.textTertiary }]} numberOfLines={1}>
            {userDisplayName || '我'}
          </Text>
        )}

        {/* 时间和类型标记 */}
        <Text style={[styles.meta, { color: colors.textTertiary }, isUser && styles.userMeta]}>
          {message.type === 'voice' ? '[语音] ' : ''}
          {message.type === 'image' ? '[图片] ' : ''}
          {message.type === 'file' ? '[文件] ' : ''}
          {new Date(message.createdAt).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>

      <Modal
        visible={!!previewUri}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewUri(null)}
      >
        <Pressable style={styles.previewBackdrop} onPress={() => setPreviewUri(null)}>
          {previewUri && (
            <Image
              source={{ uri: previewUri }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          )}
        </Pressable>
      </Modal>

      <Modal
        visible={!!mermaidPreview}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setMermaidPreview(null)}
      >
        <View style={styles.richPreviewBackdrop}>
          <View style={styles.mermaidModalHeader}>
            <Text style={styles.mermaidModalTitle}>Mermaid 图表预览（可双指缩放）</Text>
            <View style={styles.previewActionRow}>
              <TouchableOpacity 
                onPress={async () => {
                  if (mermaidPreview) {
                    await Clipboard.setStringAsync(mermaidPreview);
                    Alert.alert('已复制', 'Mermaid 源码已复制到剪贴板');
                  }
                }} 
                style={styles.mermaidCloseBtn}
              >
                <Text style={styles.mermaidCloseText}>复制源码</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setMermaidPreview(null)} style={styles.mermaidCloseBtn}>
                <Text style={styles.mermaidCloseText}>关闭</Text>
              </TouchableOpacity>
            </View>
          </View>
          {mermaidPreview && (
            <WebView
              originWhitelist={["*"]}
              source={{ html: buildMermaidHtml(mermaidPreview, isDark, true, true) }}
              style={styles.mermaidModalWebView}
              javaScriptEnabled
              scrollEnabled
              scalesPageToFit={true}
              bounces={true}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </Modal>

      <Modal
        visible={!!latexPreview}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setLatexPreview(null)}
      >
        <View style={styles.richPreviewBackdrop}>
          <View style={styles.mermaidModalHeader}>
            <Text style={styles.mermaidModalTitle}>LaTeX 公式预览（可双指缩放）</Text>
            <View style={styles.previewActionRow}>
              <TouchableOpacity 
                onPress={async () => {
                  if (latexPreview) {
                    await Clipboard.setStringAsync(latexPreview);
                    Alert.alert('已复制', 'LaTeX 源码已复制到剪贴板');
                  }
                }} 
                style={styles.mermaidCloseBtn}
              >
                <Text style={styles.mermaidCloseText}>复制源码</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setLatexPreview(null)} style={styles.mermaidCloseBtn}>
                <Text style={styles.mermaidCloseText}>关闭</Text>
              </TouchableOpacity>
            </View>
          </View>
          {latexPreview && (
            <WebView
              originWhitelist={["*"]}
              source={{ html: buildLatexHtml(latexPreview, '#FFFFFF', true) }}
              style={styles.mermaidModalWebView}
              javaScriptEnabled
              scrollEnabled
              scalesPageToFit={true}
              bounces={true}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

export const MessageBubble = React.memo(MessageBubbleImpl);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignItems: 'flex-start',
  },
  userContainer: {
    flexDirection: 'row-reverse',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: Typography.fontFamily,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  contentWrap: {
    flex: 1,
    marginLeft: 8,
    marginRight: 14,
  },
  userContentWrap: {
    marginLeft: 14,
    marginRight: 8,
    alignItems: 'flex-end',
  },
  bubble: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    maxWidth: '98%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  userBubble: {
    borderBottomRightRadius: 6,
  },
  aiBubble: {
    borderBottomLeftRadius: 6,
    borderWidth: 0.8,
  },
  image: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 6,
  },
  imageGrid: {
    marginBottom: 2,
  },
  imageItemWrap: {
    marginBottom: 4,
  },
  downloadBtn: {
    alignSelf: 'flex-start',
    borderWidth: 0.5,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 6,
  },
  multiAttachmentWrap: {
    marginBottom: 6,
    maxWidth: 280,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 0.5,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
    maxWidth: 260,
  },
  fileIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  fileName: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Typography.fontFamily,
  },
  fileMeta: {
    fontSize: 11,
    marginTop: 2,
    fontFamily: Typography.fontFamily,
  },
  meta: {
    fontSize: 11,
    marginTop: 5,
    marginLeft: 4,
    fontFamily: Typography.fontFamily,
    letterSpacing: 0.2,
  },
  userName: {
    fontSize: 11,
    marginTop: 4,
    marginRight: 4,
    fontFamily: Typography.fontFamily,
  },
  userMeta: {
    marginLeft: 0,
    marginRight: 4,
  },
  // 工具调用样式
  toolsContainer: {
    marginBottom: 10,
  },
  toolCall: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 10,
    borderWidth: 0.8,
    marginBottom: 6,
  },
  toolTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginRight: 6,
    fontFamily: Typography.fontFamily,
  },
  toolInput: {
    fontSize: 11,
    flex: 1,
    fontFamily: Typography.fontFamily,
  },
  // 来源引用样式
  sourcesContainer: {
    marginBottom: 10,
    padding: 10,
    backgroundColor: 'rgba(90, 140, 255, 0.08)',
    borderRadius: 10,
  },
  sourceLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 2,
    fontFamily: Typography.fontFamily,
  },
  sourceLink: {
    fontSize: 11,
    marginBottom: 2,
    textDecorationLine: 'underline',
    fontFamily: Typography.fontFamily,
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  richPreviewBackdrop: {
    flex: 1,
    backgroundColor: '#111827',
    paddingTop: 8,
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  previewImage: {
    width: '100%',
    height: '80%',
  },
  richTextChunk: {
    marginBottom: 4,
  },
  latexCard: {
    borderWidth: 0.8,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 10,
  },
  mermaidCard: {
    borderWidth: 0.8,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 10,
  },
  mermaidHeader: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderBottomWidth: 0.8,
  },
  mermaidTitle: {
    fontSize: 12,
    fontFamily: Typography.fontFamily,
  },
  mermaidWebView: {
    height: 230,
    backgroundColor: 'transparent',
  },
  mermaidModalHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 12,
  },
  previewActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mermaidModalTitle: {
    color: '#EAF0FF',
    fontSize: 14,
    fontFamily: Typography.fontFamily,
  },
  mermaidCloseBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 10,
  },
  mermaidCloseText: {
    color: '#FFF',
    fontSize: 12,
    fontFamily: Typography.fontFamily,
  },
  mermaidModalWebView: {
    width: '100%',
    flex: 1,
    backgroundColor: '#111827',
  },
});
