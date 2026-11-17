// ==UserScript==
// @name         iPhone 网页视频提取器
// @namespace    local.iphone.video.extractor
// @version      1.0.0
// @description  检测网页公开可访问的 MP4、WebM、MOV、M3U8 视频地址
// @match        *://*/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  if (window.top !== window.self || document.getElementById('ivx-button')) return;

  const found = new Map();
  const videoExt = /\.(mp4|m4v|webm|mov|m3u8)(?:$|[?#])/i;

  function addUrl(raw, source) {
    if (!raw || typeof raw !== 'string') return;
    let url;
    try { url = new URL(raw, location.href); } catch (_) { return; }
    if (!/^https?:$/.test(url.protocol)) return;
    if (!videoExt.test(url.href)) return;
    found.set(url.href, source || '网页资源');
  }

  function scan() {
    document.querySelectorAll('video').forEach(v => {
      addUrl(v.currentSrc, '视频播放器');
      addUrl(v.src, '视频播放器');
      v.querySelectorAll('source').forEach(s => addUrl(s.src, '视频源'));
    });
    try {
      performance.getEntriesByType('resource').forEach(e => addUrl(e.name, '已加载资源'));
    } catch (_) {}
  }

  const button = document.createElement('button');
  button.id = 'ivx-button';
  button.textContent = '提取视频';
  Object.assign(button.style, {
    position: 'fixed', right: '14px', bottom: '90px', zIndex: '2147483647',
    padding: '12px 15px', border: '0', borderRadius: '22px',
    background: '#1677ff', color: '#fff', fontSize: '14px',
    fontWeight: '600', boxShadow: '0 2px 12px #0005'
  });

  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position: 'fixed', left: '10px', right: '10px', bottom: '145px',
    zIndex: '2147483647', maxHeight: '55vh', overflow: 'auto',
    display: 'none', padding: '12px', borderRadius: '14px',
    background: '#fff', color: '#222', boxShadow: '0 3px 20px #0006',
    font: '14px -apple-system,BlinkMacSystemFont,sans-serif'
  });

  function render() {
    scan();
    panel.replaceChildren();
    const heading = document.createElement('div');
    heading.textContent = `检测到 ${found.size} 个视频地址`;
    heading.style.cssText = 'font-weight:700;margin-bottom:10px';
    panel.appendChild(heading);

    if (!found.size) {
      const tip = document.createElement('p');
      tip.textContent = '暂未发现公开视频地址。请先播放视频几秒，再点“重新扫描”。加密或 DRM 视频可能无法提取。';
      panel.appendChild(tip);
    }

    found.forEach((source, url) => {
      const item = document.createElement('div');
      item.style.cssText = 'border-top:1px solid #ddd;padding:9px 0;overflow-wrap:anywhere';
      const info = document.createElement('div');
      info.textContent = `${source} · ${url.split('?')[0].split('/').pop() || '视频地址'}`;
      info.style.cssText = 'font-weight:600;margin-bottom:6px';
      const copy = document.createElement('button');
      copy.textContent = '复制链接';
      copy.style.cssText = 'padding:7px 10px;margin-right:8px';
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(url);
          copy.textContent = '已复制';
        } catch (_) {
          const input = document.createElement('textarea');
          input.value = url;
          panel.appendChild(input);
          input.select();
          try { document.execCommand('copy'); copy.textContent = '已复制'; }
          catch (_) { copy.textContent = '请长按链接复制'; }
          input.remove();
        }
      });
      const open = document.createElement('button');
      open.textContent = '打开';
      open.style.cssText = 'padding:7px 10px';
      open.addEventListener('click', () => window.open(url, '_blank'));
      item.append(info, copy, open);
      panel.appendChild(item);
    });

    const rescan = document.createElement('button');
    rescan.textContent = '重新扫描';
    rescan.style.cssText = 'padding:9px 12px;margin-top:10px';
    rescan.addEventListener('click', render);
    const close = document.createElement('button');
    close.textContent = '关闭';
    close.style.cssText = 'padding:9px 12px;margin:10px 0 0 8px';
    close.addEventListener('click', () => panel.style.display = 'none');
    panel.append(rescan, close);
  }

  button.addEventListener('click', () => {
    render();
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });

  document.documentElement.append(button, panel);
  scan();
  const observer = new MutationObserver(() => scan());
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
