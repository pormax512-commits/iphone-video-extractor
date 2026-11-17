
// ==UserScript==
// @name         Video Downloader V3
// @namespace    local.video.downloader
// @version      3.0
// @description  网页视频检测与下载管理面板
// @match        *://*/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  if (window.top !== window.self ||
      document.getElementById('vd3-button')) return;

  const style = document.createElement('style');
  style.textContent = `
    #vd3-button {
      position:fixed;right:18px;bottom:105px;z-index:2147483647;
      width:50px;height:50px;border:0;border-radius:50%;
      background:#202124;color:white;display:grid;
      place-items:center;box-shadow:0 3px 14px #0005;
    }
    #vd3-panel {
      position:fixed;inset:0;z-index:2147483646;
      background:#0008;display:none;align-items:flex-end;
      font-family:-apple-system,BlinkMacSystemFont,sans-serif;
    }
    #vd3-window {
      width:100%;max-height:82vh;overflow:auto;
      background:#f7f7f9;color:#171717;
      border-radius:22px 22px 0 0;padding:20px;
      box-sizing:border-box;
    }
    #vd3-window button {
      border:0;border-radius:12px;padding:11px 15px;
      background:#202124;color:white;font-size:14px;
    }
    #vd3-window button.secondary {
      background:#e8e8eb;color:#222;
    }
    .vd3-row {
      display:flex;align-items:center;gap:12px;
      padding:14px 0;border-bottom:1px solid #e5e5e7;
    }
    .vd3-info {flex:1;min-width:0}
    .vd3-name {font-size:14px;font-weight:600;overflow-wrap:anywhere}
    .vd3-sub {font-size:12px;color:#777;margin-top:5px}
    .vd3-tag {
      font-size:11px;background:#e8e8eb;
      padding:4px 7px;border-radius:6px;
    }
    #vd3-status {
      background:#ededf0;border-radius:12px;
      padding:12px;font-size:13px;margin-top:14px;
    }
    #vd3-progress {
      height:6px;background:#ddd;border-radius:10px;
      overflow:hidden;margin-top:9px;
    }
    #vd3-bar {height:100%;width:0;background:#2485ed}
    @media(prefers-color-scheme:dark) {
      #vd3-window {background:#202124;color:white}
      .vd3-row {border-color:#444}
      .vd3-sub {color:#aaa}
      .vd3-tag,#vd3-status {background:#38383b;color:#eee}
      #vd3-window button.secondary {background:#444;color:white}
      #vd3-progress {background:#555}
    }
  `;
  document.documentElement.appendChild(style);

  const button = document.createElement('button');
  button.id = 'vd3-button';
  button.title = 'Video Downloader';
  button.innerHTML = `
    <svg viewBox="0 0 24 24" width="26" height="26">
      <path d="M12 3v12m0 0 5-5m-5 5-5-5M5 18v3h14v-3"
      fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  document.documentElement.appendChild(button);

  const panel = document.createElement('div');
  panel.id = 'vd3-panel';
  panel.innerHTML = `
    <div id="vd3-window">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="font-size:21px;font-weight:700;flex:1">
          Video Downloader
        </div>
        <button class="secondary" id="vd3-close">关闭</button>
      </div>

      <div style="font-size:12px;color:gray;margin-top:6px">
        网页视频检测与下载
      </div>

      <div style="display:flex;gap:10px;margin-top:18px">
        <button id="vd3-scan" style="flex:1">重新检测</button>
      </div>

      <div id="vd3-count" style="font-size:13px;margin-top:18px">
        正在等待检测
      </div>

      <div id="vd3-list"></div>

      <div id="vd3-status">
        等待操作
        <div id="vd3-progress"><div id="vd3-bar"></div></div>
      </div>

      <div style="font-size:11px;color:gray;line-height:1.6;margin-top:14px">
        提示：MP4 会尝试直接下载。M3U8 是分段视频播放列表，
        需要额外处理；本脚本不会绕过加密或网站访问限制。
      </div>
    </div>`;
  document.documentElement.appendChild(panel);

  const $ = id => document.getElementById(id);
  let resources = [];
  let activeController = null;

  function status(text, percent = 0) {
    $('vd3-status').childNodes[0].textContent = text;
    $('vd3-bar').style.width = percent + '%';
  }

  function getName(url) {
    try {
      return decodeURIComponent(
        new URL(url).pathname.split('/').pop()
      ) || '视频资源';
    } catch (_) {
      return '视频资源';
    }
  }

  function scan() {
    const found = new Map();

    function add(url) {
      if (!url || !/^https?:/i.test(url)) return;

      const type =
        /\.(m3u8)(?:$|[?#])/i.test(url) ? 'M3U8' :
        /\.(mp4|m4v|webm|mov)(?:$|[?#])/i.test(url) ? 'MP4' :
        '';

      if (!type) return;

      if (!found.has(url)) {
        found.set(url, {
          url,
          type,
          name: getName(url)
        });
      }
    }

    document.querySelectorAll('video,source').forEach(el => {
      add(el.currentSrc || el.src || el.getAttribute('src'));
    });

    try {
      performance.getEntriesByType('resource').forEach(item => {
        add(item.name);
      });
    } catch (_) {}

    resources = [...found.values()];
    render();
  }

  function render() {
    $('vd3-count').textContent =
      '检测到 ' + resources.length + ' 个视频资源';

    const list = $('vd3-list');
    list.innerHTML = '';

    if (!resources.length) {
      list.innerHTML =
        '<div style="padding:25px 0;text-align:center;color:gray;font-size:14px">暂未发现视频资源</div>';
      return;
    }

    resources.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'vd3-row';

      const info = document.createElement('div');
      info.className = 'vd3-info';

      const name = document.createElement('div');
      name.className = 'vd3-name';
      name.textContent = item.name;

      const sub = document.createElement('div');
      sub.className = 'vd3-sub';
      sub.textContent = item.type + ' · 网页资源';

      info.append(name, sub);

      const tag = document.createElement('span');
      tag.className = 'vd3-tag';
      tag.textContent = item.type;

      const action = document.createElement('button');
      action.textContent = item.type === 'MP4' ? '下载' : '查看';
      action.addEventListener('click', () => {
        if (item.type === 'MP4') {
          download(item);
        } else {
          openPlaylist(item);
        }
      });

      row.append(info, tag, action);
      list.appendChild(row);
    });
  }

  async function download(item) {
    if (activeController) {
      activeController.abort();
    }

    activeController = new AbortController();
    const signal = activeController.signal;

    try {
      status('正在连接视频服务器…', 5);

      const response = await fetch(item.url, {
        credentials: 'include',
        signal
      });

      if (!response.ok) {
        throw new Error('服务器错误：' + response.status);
      }

      const total = Number(response.headers.get('content-length')) || 0;
      const reader = response.body.getReader();
      const chunks = [];
      let received = 0;

      while (true) {
        const result = await reader.read();
        if (result.done) break;

        chunks.push(result.value);
        received += result.value.length;

        const percent = total
          ? Math.min(99, Math.round(received / total * 100))
          : 0;

        status(
          '正在下载 · ' + (received / 1024 / 1024).toFixed(1) +
          ' MB' + (total ? ' / ' +
          (total / 1024 / 1024).toFixed(1) + ' MB' : ''),
          percent
        );
      }

      const blob = new Blob(chunks, {
        type: response.headers.get('content-type') || 'video/mp4'
      });

      if (!blob.size) throw new Error('文件为空');

      const objectURL = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectURL;
      a.download = item.name || 'video.mp4';
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(objectURL), 120000);
      status('下载已发起，请检查文件 App', 100);

    } catch (error) {
      if (error.name === 'AbortError') {
        status('下载已取消');
      } else {
        status('下载失败：' + error.message);
      }
    } finally {
      activeController = null;
    }
  }

  function openPlaylist(item) {
    status('这是 M3U8 播放列表，不是完整 MP4。');
    window.open(item.url, '_blank');
  }

  button.addEventListener('click', () => {
    panel.style.display = 'flex';
    scan();
  });

  $('vd3-close').addEventListener('click', () => {
    panel.style.display = 'none';
  });

  $('vd3-scan').addEventListener('click', scan);

  panel.addEventListener('click', event => {
    if (event.target === panel) panel.style.display = 'none';
  });

})();
