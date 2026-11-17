// ==UserScript==
// @name         网页视频下载图标
// @namespace    local.video.extractor
// @version      2.1
// @description  检测网页中的 MP4 和 M3U8 视频
// @match        *://*/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  if (window.top !== window.self ||
      document.getElementById('video-download-icon')) return;

  const btn = document.createElement('button');
  btn.id = 'video-download-icon';
  btn.title = '检测并下载视频';
  btn.setAttribute('aria-label', '下载视频');
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" width="25" height="25">
      <path d="M12 3v12m0 0 5-5m-5 5-5-5M5 18v3h14v-3"
      fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

  Object.assign(btn.style, {
    position: 'fixed',
    right: '18px',
    bottom: '105px',
    zIndex: '2147483647',
    width: '48px',
    height: '48px',
    border: 'none',
    borderRadius: '50%',
    background: '#202124',
    color: 'white',
    display: 'grid',
    placeItems: 'center',
    padding: '0',
    boxShadow: '0 2px 12px #0006'
  });

  document.documentElement.appendChild(btn);

  const toast = document.createElement('div');
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '165px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '2147483647',
    background: '#222',
    color: '#fff',
    padding: '10px 14px',
    borderRadius: '10px',
    fontSize: '14px',
    display: 'none',
    maxWidth: '85vw',
    textAlign: 'center'
  });
  document.documentElement.appendChild(toast);

  let timer;
  function message(text) {
    toast.textContent = text;
    toast.style.display = 'block';
    clearTimeout(timer);
    timer = setTimeout(() => toast.style.display = 'none', 4000);
  }

  function scan() {
    const urls = new Set();

    document.querySelectorAll('video,source').forEach(el => {
      const u = el.currentSrc || el.src;
      if (u && /^https?:/i.test(u)) urls.add(u);
    });

    performance.getEntriesByType('resource').forEach(item => {
      if (/^https?:/i.test(item.name) &&
          /\.(mp4|m4v|webm|mov|m3u8)(?:$|[?#])/i.test(item.name)) {
        urls.add(item.name);
      }
    });

    return [...urls];
  }

  function isMp4(url) {
    return /\.(mp4|m4v|webm|mov)(?:$|[?#])/i.test(url);
  }

  function isHls(url) {
    return /\.m3u8(?:$|[?#])/i.test(url);
  }

  function save(blob, filename) {
    const objectURL = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectURL;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectURL), 60000);
  }

  async function get(url) {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) throw new Error('服务器返回 ' + response.status);
    return response;
  }

  async function downloadMp4(url) {
    message('正在下载视频…');
    const response = await get(url);
    const blob = await response.blob();

    if (!blob.size) throw new Error('视频文件为空');

    let name = 'video.mp4';
    try {
      name = decodeURIComponent(
        new URL(url).pathname.split('/').pop()
      ) || name;
    } catch (_) {}

    save(blob, name);
    message('已发起下载，请查看文件 App');
  }

  async function downloadHls(url) {
    message('正在读取 M3U8…');

    let response = await get(url);
    let text = await response.text();

    if (!text.trim().startsWith('#EXTM3U')) {
      throw new Error('不是有效的 M3U8 文件');
    }

    // 如果是主播放列表，选择最高带宽的视频清晰度
    if (/#EXT-X-STREAM-INF/i.test(text)) {
      const lines = text.split(/\r?\n/);
      const variants = [];

      for (let i = 0; i < lines.length; i++) {
        if (/#EXT-X-STREAM-INF/i.test(lines[i])) {
          const next = lines.slice(i + 1)
            .find(x => x.trim() && !x.trim().startsWith('#'));

          if (next) {
            const bandwidth = Number(
              (lines[i].match(/BANDWIDTH=(\d+)/i) || [])[1] || 0
            );
            variants.push({
              url: new URL(next.trim(), url).href,
              bandwidth
            });
          }
        }
      }

      if (!variants.length) {
        throw new Error('没有找到清晰度列表');
      }

      variants.sort((a, b) => b.bandwidth - a.bandwidth);
      url = variants[0].url;

      response = await get(url);
      text = await response.text();
    }

    if (/^#EXT-X-KEY/m.test(text) &&
        !/^#EXT-X-KEY:METHOD=NONE/m.test(text)) {
      throw new Error('视频使用加密，无法处理');
    }

    const lines = text.split(/\r?\n/);
    const segments = [];
    let initURL = null;

    for (const raw of lines) {
      const line = raw.trim();

      if (line.startsWith('#EXT-X-MAP:')) {
        const match = line.match(/URI="([^"]+)"/i);
        if (match) initURL = new URL(match[1], url).href;
      } else if (
        line && !line.startsWith('#') &&
        /\.(m4s|mp4|ts)(?:$|[?#])/i.test(line)
      ) {
        segments.push(new URL(line, url).href);
      }
    }

    if (!segments.length) {
      throw new Error('没有找到视频分片');
    }

    const parts = [];

    if (initURL) {
      message('正在下载初始化数据…');
      parts.push(await (await get(initURL)).blob());
    }

    for (let i = 0; i < segments.length; i++) {
      message('正在下载分片 ' + (i + 1) + '/' + segments.length);
      parts.push(await (await get(segments[i])).blob());
    }

    const blob = new Blob(parts, {
      type: initURL ? 'video/mp4' : 'video/mp2t'
    });

    save(blob, initURL ? '网页视频.mp4' : '网页视频.ts');
    message('已发起保存，请查看文件 App');
  }

  btn.addEventListener('click', async () => {
    btn.disabled = true;

    try {
      const urls = scan();

      if (!urls.length) {
        message('没有检测到视频');
        return;
      }

      const mp4 = urls.find(isMp4);
      const hls = urls.find(isHls);

      if (mp4) {
        await downloadMp4(mp4);
      } else if (hls) {
        await downloadHls(hls);
      } else {
        message('没有找到可下载的视频');
      }

    } catch (error) {
      message('下载失败：' + error.message);
    } finally {
      btn.disabled = false;
    }
  });
})();
