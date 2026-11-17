// ==UserScript==
// @name         Video Downloader Ultimate
// @namespace    local.video.downloader.ultimate
// @version      1.0.0
// @description  网页视频资源扫描与 MP4 / M3U8 分片下载工具
// @match        *://*/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  if (window.top !== window.self) return;
  if (document.getElementById('vdu-root')) return;

  const state = {
    resources: [],
    tasks: [],
    busy: false,
    cancelled: false
  };

  const $ = (id) => root.querySelector('#' + id);

  const root = document.createElement('div');
  root.id = 'vdu-root';
  root.style.cssText = 'position:fixed;z-index:2147483647;inset:0;pointer-events:none;';
  document.documentElement.appendChild(root);

  const shadow = root.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    *{box-sizing:border-box}
    #float{
      position:fixed;right:17px;bottom:90px;width:54px;height:54px;
      border-radius:19px;background:linear-gradient(145deg,#3988ff,#1558d6);
      color:white;display:flex;align-items:center;justify-content:center;
      font-size:25px;box-shadow:0 8px 25px #1768dc66;
      border:1px solid #ffffff55;pointer-events:auto;cursor:pointer;
      -webkit-tap-highlight-color:transparent
    }
    #panel{
      position:fixed;left:12px;right:12px;bottom:12px;
      max-height:82vh;display:none;flex-direction:column;
      background:#111827;color:#f3f6ff;border:1px solid #334155;
      border-radius:23px;box-shadow:0 15px 55px #0009;
      overflow:hidden;pointer-events:auto;
      font-family:-apple-system,BlinkMacSystemFont,sans-serif
    }
    .top{padding:17px 17px 13px;background:linear-gradient(120deg,#172b4d,#111827)}
    .brand{font-size:18px;font-weight:750;letter-spacing:.2px}
    .sub{font-size:11px;color:#94a3b8;margin-top:5px}
    .actions{display:flex;gap:8px;margin-top:14px}
    button{
      border:0;border-radius:11px;padding:10px 13px;
      color:white;background:#26364f;font-size:12px;font-weight:650;
      cursor:pointer
    }
    button.primary{background:#2878f0}
    button:disabled{opacity:.4}
    .tabs{display:flex;gap:7px;padding:11px 14px;border-bottom:1px solid #263449}
    .tab{flex:1;text-align:center;background:#1d293b;color:#aab8ce}
    .tab.active{background:#1d4e91;color:white}
    #content{overflow:auto;padding:12px 13px 20px;min-height:150px}
    .section{font-size:12px;color:#8fa4c2;margin:2px 0 10px}
    .item{
      background:#1b2739;border:1px solid #2d3d54;
      padding:12px;border-radius:14px;margin-bottom:9px
    }
    .name{font-size:13px;font-weight:700;word-break:break-all}
    .url{font-size:10px;color:#8295b0;margin-top:6px;word-break:break-all}
    .meta{font-size:11px;color:#8fa4c2;margin-top:6px}
    .item-actions{display:flex;gap:7px;margin-top:10px;flex-wrap:wrap}
    .item-actions button{padding:8px 11px}
    .progress{height:5px;background:#334155;border-radius:8px;margin-top:10px;overflow:hidden}
    .bar{height:100%;width:0;background:#3b91ff;transition:width .2s}
    .empty{text-align:center;color:#8192aa;padding:30px 12px;font-size:13px}
    .notice{font-size:11px;color:#94a3b8;line-height:1.6;margin-top:12px}
    .close{margin-left:auto;background:#29364a}
    .headrow{display:flex;align-items:center;gap:8px}
    .tag{font-size:10px;color:#8fc1ff;background:#18365c;padding:4px 7px;border-radius:7px}
    #status{font-size:11px;color:#8fa4c2;margin-top:9px}
    @media(min-width:700px){
      #panel{left:auto;right:20px;bottom:20px;width:440px;max-height:82vh}
    }
  `;

  const ui = document.createElement('div');
  ui.innerHTML = `
    <div id="float" title="Video Downloader">↓</div>
    <div id="panel">
      <div class="top">
        <div class="headrow">
          <div>
            <div class="brand">Video Downloader <span style="color:#58a0ff">Ultimate</span></div>
            <div class="sub">网页媒体扫描 · 视频资源下载中心</div>
          </div>
          <button class="close" id="close">关闭</button>
        </div>
        <div class="actions">
          <button class="primary" id="scan">⌕ 重新扫描</button>
          <button id="clear">清除列表</button>
        </div>
        <div id="status">准备就绪</div>
      </div>
      <div class="tabs">
        <button class="tab active" data-tab="resources">资源列表</button>
        <button class="tab" data-tab="tasks">下载任务</button>
      </div>
      <div id="content"></div>
    </div>
  `;

  shadow.append(style, ui);

  const panel = shadow.querySelector('#panel');
  const content = shadow.querySelector('#content');
  const status = shadow.querySelector('#status');

  function setStatus(text) {
    status.textContent = text;
  }

  function openPanel() {
    panel.style.display = 'flex';
    scan();
  }

  shadow.querySelector('#float').addEventListener('click', () => {
    panel.style.display === 'flex' ? panel.style.display = 'none' : openPanel();
  });

  shadow.querySelector('#close').addEventListener('click', () => {
    panel.style.display = 'none';
  });

  shadow.querySelector('#scan').addEventListener('click', scan);

  shadow.querySelector('#clear').addEventListener('click', () => {
    state.resources = [];
    renderResources();
    setStatus('资源列表已清除');
  });

  shadow.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      shadow.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
      btn.dataset.tab === 'tasks' ? renderTasks() : renderResources();
    });
  });

  function classify(url) {
    const u = url.toLowerCase().split('?')[0];
    if (/\.m3u8$/.test(u)) return 'M3U8';
    if (/\.mp4$|\.m4v$|\.mov$|\.webm$/.test(u)) return 'MP4 / 视频';
    if (/\.ts$/.test(u)) return 'TS 分片';
    if (/\.m4s$|\.mp4$/.test(u)) return 'fMP4';
    return '媒体资源';
  }

  function addResource(url, source) {
    if (!url || typeof url !== 'string') return;
    if (!/^https?:\/\//i.test(url)) return;
    if (url.startsWith('blob:')) {
      state.resources.push({
        url, type:'Blob 视频', source, name:'网页 Blob 视频'
      });
      return;
    }
    if (!/\.(m3u8|mp4|m4v|mov|webm|ts|m4s)(?:$|[?#])/i.test(url)) return;
    if (state.resources.some(x => x.url === url)) return;

    state.resources.push({
      url,
      type: classify(url),
      source,
      name: url.split('?')[0].split('/').pop() || '视频资源'
    });
  }

  function scan() {
    state.resources = [];

    document.querySelectorAll('video').forEach(video => {
      addResource(video.currentSrc || video.src, 'Video');
      video.querySelectorAll('source').forEach(s => addResource(s.src, 'Source'));
    });

    document.querySelectorAll('source, a, video').forEach(el => {
      ['src','href','data-src','data-video','data-url'].forEach(attr => {
        const value = el.getAttribute(attr);
        if (value) {
          try {
            addResource(new URL(value, location.href).href, 'DOM');
          } catch (_) {}
        }
      });
    });

    try {
      performance.getEntriesByType('resource').forEach(entry => {
        addResource(entry.name, 'Network');
      });
    } catch (_) {}

    renderResources();
    setStatus('扫描完成 · 找到 ' + state.resources.length + ' 个资源');
  }

  function renderResources() {
    content.innerHTML = '<div class="section">已发现的媒体资源</div>';

    if (!state.resources.length) {
      content.innerHTML += '<div class="empty">暂未发现媒体资源<br>请播放视频后再点击重新扫描</div>';
      return;
    }

    state.resources.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'item';
      card.innerHTML = `
        <div class="headrow">
          <div class="name"></div><span class="tag"></span>
        </div>
        <div class="url"></div>
        <div class="meta"></div>
        <div class="item-actions">
          <button class="primary" data-action="download">下载 / 解析</button>
          <button data-action="copy">复制地址</button>
          <button data-action="open">打开链接</button>
        </div>
      `;
      card.querySelector('.name').textContent = item.name;
      card.querySelector('.tag').textContent = item.type;
      card.querySelector('.url').textContent = item.url.slice(0, 180);
      card.querySelector('.meta').textContent = '来源：' + item.source;

      card.querySelector('[data-action="download"]').addEventListener('click', () => {
        startDownload(item);
      });
      card.querySelector('[data-action="copy"]').addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(item.url);
          setStatus('地址已复制');
        } catch (_) {
          setStatus('复制失败：浏览器未授权剪贴板');
        }
      });
      card.querySelector('[data-action="open"]').addEventListener('click', () => {
        window.open(item.url, '_blank');
      });
      content.appendChild(card);
    });
  }

  function renderTasks() {
    content.innerHTML = '<div class="section">下载任务与处理状态</div>';
    if (!state.tasks.length) {
      content.innerHTML += '<div class="empty">暂无下载任务</div>';
      return;
    }

    state.tasks.forEach(task => {
      const card = document.createElement('div');
      card.className = 'item';
      card.innerHTML = `
        <div class="name"></div>
        <div class="meta"></div>
        <div class="progress"><div class="bar"></div></div>
        <div class="meta"></div>
      `;
      card.querySelector('.name').textContent = task.name;
      card.querySelectorAll('.meta')[0].textContent = task.message;
      card.querySelector('.bar').style.width = task.progress + '%';
      card.querySelectorAll('.meta')[1].textContent =
        Math.round(task.progress) + '% · ' + task.detail;
      content.appendChild(card);
    });
  }

  function makeTask(name) {
    const task = {
      name,
      progress: 0,
      message: '准备下载',
      detail: '等待中'
    };
    state.tasks.unshift(task);
    return task;
  }

  function updateTask(task, progress, message, detail) {
    task.progress = Math.max(0, Math.min(100, progress));
    task.message = message;
    task.detail = detail || '';
    renderTasks();
  }

  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function safeName(name) {
    return (name || 'video').replace(/[\\/:*?"<>|]/g, '_').slice(0, 100);
  }

  async function fetchWithRetry(url, retries = 2) {
    let lastError;
    for (let i = 0; i <= retries; i++) {
      if (state.cancelled) throw new Error('任务已取消');
      try {
        const response = await fetch(url, {
          credentials: 'same-origin',
          cache: 'no-store'
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response;
      } catch (e) {
        lastError = e;
        if (i < retries) await new Promise(r => setTimeout(r, 700 * (i + 1)));
      }
    }
    throw lastError || new Error('请求失败');
  }

  async function downloadDirect(item, task) {
    updateTask(task, 5, '正在请求视频', '连接中');
    const response = await fetchWithRetry(item.url);
    const blob = await response.blob();

    if (!blob.size) throw new Error('文件内容为空');

    updateTask(task, 95, '正在保存文件', formatSize(blob.size));
    const ext = item.url.split('?')[0].split('.').pop() || 'mp4';
    saveBlob(blob, safeName(item.name.replace(/\.[^.]+$/, '')) + '.' + ext);
    updateTask(task, 100, '下载完成', formatSize(blob.size));
  }

  function formatSize(bytes) {
    if (!bytes) return '0 B';
    const units = ['B','KB','MB','GB'];
    let n = bytes, i = 0;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i++;
    }
    return n.toFixed(1) + ' ' + units[i];
  }

  async function parsePlaylist(url) {
    const response = await fetchWithRetry(url);
    const text = await response.text();
    if (!text.startsWith('#EXTM3U')) {
      throw new Error('不是有效的 M3U8 播放列表');
    }

    const lines = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    const variants = [];
    const segments = [];
    let initMap = null;
    let encrypted = false;
    let audioGroup = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('#EXT-X-KEY:')) {
        if (!/METHOD=NONE/i.test(line)) encrypted = true;
      }

      if (line.startsWith('#EXT-X-MEDIA:') && /TYPE=AUDIO/i.test(line)) {
        const uri = line.match(/URI="([^"]+)"/);
        if (uri) audioGroup = new URL(uri[1], url).href;
      }

      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        const info = line;
        const next = lines.slice(i + 1).find(x => !x.startsWith('#'));
        if (next) {
          const resolution = info.match(/RESOLUTION=(\d+x\d+)/);
          const bandwidth = info.match(/BANDWIDTH=(\d+)/);
          variants.push({
            url: new URL(next, url).href,
            resolution: resolution ? resolution[1] : '未知清晰度',
            bandwidth: bandwidth ? Number(bandwidth[1]) : 0,
            audioGroup: (info.match(/AUDIO="([^"]+)"/) || [])[1] || null
          });
        }
      }

      if (line.startsWith('#EXT-X-MAP:')) {
        const match = line.match(/URI="([^"]+)"/);
        if (match) initMap = new URL(match[1], url).href;
      }

      if (line.startsWith('#EXTINF:')) {
        const next = lines.slice(i + 1).find(x => !x.startsWith('#'));
        if (next) segments.push(new URL(next, url).href);
      }
    }

    return { variants, segments, initMap, encrypted, audioGroup };
  }

  async function downloadHLS(item, task) {
    updateTask(task, 2, '正在解析 M3U8', '读取播放列表');
    let playlistUrl = item.url;
    let data = await parsePlaylist(playlistUrl);

    if (data.variants.length) {
      data.variants.sort((a,b) => b.bandwidth - a.bandwidth);
      const best = data.variants[0];
      playlistUrl = best.url;
      updateTask(task, 5, '已选择清晰度 ' + best.resolution, '读取子播放列表');
      data = await parsePlaylist(playlistUrl);
    }

    if (data.encrypted) {
      throw new Error('检测到加密 HLS，当前脚本不处理加密内容');
    }

    if (!data.segments.length) {
      throw new Error('没有找到媒体分片，可能是动态直播列表或特殊格式');
    }

    const parts = [];
    let completed = 0;
    const total = data.segments.length + (data.initMap ? 1 : 0);

    if (data.initMap) {
      const initResponse = await fetchWithRetry(data.initMap);
      parts.push(await initResponse.arrayBuffer());
      completed++;
    }

    const results = new Array(data.segments.length);
    let nextIndex = 0;

    async function worker() {
      while (nextIndex < data.segments.length) {
        if (state.cancelled) throw new Error('任务已取消');
        const index = nextIndex++;
        const response = await fetchWithRetry(data.segments[index]);
        results[index] = await response.arrayBuffer();
        completed++;
        updateTask(
          task,
          completed / total * 90 + 5,
          '正在下载分片',
          completed + ' / ' + total
        );
      }
    }

    await Promise.all([worker(), worker(), worker()]);
    parts.push(...results);

    const isFmp4 = !!data.initMap ||
      data.segments.some(x => /\.m4s(?:$|\?)/i.test(x));

    const blob = new Blob(parts, {
      type: isFmp4 ? 'video/mp4' : 'video/mp2t'
    });

    if (!blob.size) throw new Error('下载结果为空');

    const filename = safeName(item.name.replace(/\.[^.]+$/, '')) +
      (isFmp4 ? '.mp4' : '.ts');

    saveBlob(blob, filename);
    updateTask(task, 100, '分片处理完成', formatSize(blob.size));

    if (data.audioGroup) {
      task.detail += ' · 检测到独立音轨，未合并';
      task.message = '视频分片已保存；独立音轨未合并';
      renderTasks();
    }
  }

  async function startDownload(item) {
    if (state.busy) {
      setStatus('当前有下载任务正在运行');
      return;
    }

    state.busy = true;
    state.cancelled = false;
    const task = makeTask(item.name);
    renderTasks();

    try {
      if (item.url.startsWith('blob:')) {
        throw new Error('Blob 地址无法通过普通网络请求下载，请尝试网页原生保存功能');
      }

      if (/\.m3u8(?:$|[?#])/i.test(item.url)) {
        await downloadHLS(item, task);
      } else if (/\.(mp4|m4v|mov|webm)(?:$|[?#])/i.test(item.url)) {
        await downloadDirect(item, task);
      } else {
        throw new Error('该资源类型暂不支持直接合并下载');
      }
      setStatus('任务处理结束');
    } catch (error) {
      updateTask(task, task.progress, '下载失败', error.message || '未知错误');
      setStatus('失败：' + (error.message || '请检查资源权限'));
    } finally {
      state.busy = false;
      state.cancelled = false;
    }
  }

  renderResources();
  setStatus('已启动 · 播放视频后扫描资源');

})();
