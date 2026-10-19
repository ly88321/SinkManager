// Variables used by Scriptable.
// icon-color: deep-blue; icon-glyph: link;
// SinkManager 3.0.6 — single-file Scriptable application.
// Configure your own Sink instance and token in Settings on first launch.
// Token stays in Keychain/native Request; never injected into WebView.
// Bridge evaluations ALWAYS return JSON strings or a literal string (Error 606 fix).

const SITE_KEY = 'SinkManager.Site';
let BASE = Keychain.contains(SITE_KEY) ? Keychain.get(SITE_KEY) : '';
let TOKEN_KEY = 'SinkManager.Token.' + BASE;
let token = Keychain.contains(TOKEN_KEY) ? Keychain.get(TOKEN_KEY) : '';

async function api(path, method = 'GET', body, query = {}) {
  if (!BASE || !token) throw new Error('请先点击「设置」配置服务地址和 Token。');
  const qs = Object.keys(query).filter(k => query[k] !== '' && query[k] != null)
    .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(String(query[k]))).join('&');
  const req = new Request(BASE + path + (qs ? '?' + qs : ''));
  req.method = method;
  req.timeoutInterval = 30;
  const headers = { Authorization: 'Bearer ' + token, Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json; charset=utf-8';
    req.body = JSON.stringify(body);
  }
  // Assign the complete dictionary: native bridge getters may return copies.
  req.headers = headers;
  let raw;
  try { raw = await req.loadString(); }
  catch (e) { throw new Error(method + ' ' + path + '\n网络请求失败：' + String(e.message || e)); }
  const status = req.response ? req.response.statusCode : 0;
  // Do not display echoed credentials in HTTP diagnostics.
  const safe = s => String(s).split(token).join('[REDACTED]').slice(0, 3000);
  if (status < 200 || status >= 300)
    throw new Error('HTTP ' + status + ' · ' + method + ' ' + path + '\n' + safe(raw || '空响应'));
  if (!raw.trim()) return null;
  try { return JSON.parse(raw); }
  catch (_) { throw new Error('HTTP ' + status + ' · ' + path + '\n服务未返回 JSON：' + safe(raw)); }
}

async function configure() {
  const a = new Alert();
  a.title = 'SinkManager 设置';
  a.message = '填写你的 Sink 网站根地址和 NUXT_SITE_TOKEN。Token 仅保存到 Scriptable Keychain；同一网站留空保留原 Token。';
  a.addTextField('https://your-sink.example', BASE);
  a.addSecureTextField('Token（可带 Bearer 前缀）', '');
  a.addAction('保存并验证');
  a.addDestructiveAction('清除已保存 Token');
  a.addCancelAction('取消');
  const i = await a.presentAlert();
  if (i === 1) {
    if (Keychain.contains(TOKEN_KEY)) Keychain.remove(TOKEN_KEY);
    token = '';
    return { configured: false, base: BASE };
  }
  if (i === 0) {
    let site = a.textFieldValue(0).trim().replace(/\/+$/, '');
    if (site && !/^https?:\/\//i.test(site)) site = 'https://' + site;
    if (!/^https:\/\/[^\s/?#:@]+(?::\d+)?$/i.test(site)) throw new Error('请输入 HTTPS 网站根地址，不含路径、账号或查询参数。');
    const next = a.textFieldValue(1).trim().replace(/^Bearer\s+/i, '');
    const previous = { base: BASE, key: TOKEN_KEY, token };
    const key = 'SinkManager.Token.' + site;
    const saved = Keychain.contains(key) ? Keychain.get(key) : '';
    if (!next && !saved) throw new Error('Token 不能为空。');
    BASE = site; TOKEN_KEY = key; token = next || saved;
    try { await api('/api/verify'); }
    catch (e) { BASE = previous.base; TOKEN_KEY = previous.key; token = previous.token; throw e; }
    Keychain.set(TOKEN_KEY, token);
    Keychain.set(SITE_KEY, BASE);
  }
  return { configured: !!token, base: BASE };
}

// Runs ONLY inside WebView. All untrusted service strings use textContent/value.
function browserApp() {
  function expirationInput(seconds) {
    if (!seconds) return '';
    const d = new Date(Number(seconds) * 1000);
    if (!Number.isFinite(d.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function expirationSeconds(value) {
    if (!value) return undefined;
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
    if (!match) throw new Error('请选择有效的到期日期和时间。');
    const parts = match.slice(1).map(n => Number(n || 0));
    const d = new Date(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]);
    if (d.getFullYear() !== parts[0] || d.getMonth() + 1 !== parts[1] || d.getDate() !== parts[2] || d.getHours() !== parts[3] || d.getMinutes() !== parts[4] || d.getSeconds() !== parts[5]) throw new Error('所选日期时间无效，请重新选择。');
    return Math.floor(d.getTime() / 1000);
  }
  function statsQuery(section, query) {
    const result = { ...query };
    if (section.type) result.type = section.type;
    if (section.path === 'views') {
      const span = query.endAt - query.startAt;
      result.unit = span <= 3600 ? 'minute' : span <= 86400 ? 'hour' : 'day';
      let timezone = 'Etc/UTC';
      try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || timezone; } catch (_) {}
      result.clientTimezone = /^[\w+-]+(?:\/[\w+-]+)*$/.test(timezone) && timezone.length <= 64 ? timezone : 'Etc/UTC';
    }
    return result;
  }
  function normalizeTarget(value) {
    let text = String(value || '').trim();
    if (!text) return '';
    if (text.startsWith('//')) text = 'https:' + text;
    else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text) && !/^(javascript|data|mailto|tel):/i.test(text)) text = 'https://' + text;
    const parsed = new URL(text);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || /\s/.test(text)) throw new Error('目标 URL 无效，请输入网站地址。');
    return text;
  }
  function plainStats(value, depth = 0) {
    const labels = { visits: '访问次数', visitors: '独立访客', referers: '来源数量', count: '数量', total: '总计', time: '时间', date: '日期', name: '名称', country: '国家或地区', browser: '浏览器', os: '操作系统', device: '设备', slug: '短链接', data: '统计数据', rows: '记录', countDistinct: '去重数量' };
    if (value == null) return '暂无数据';
    if (typeof value === 'number') return value.toLocaleString('zh-CN');
    if (typeof value === 'boolean') return value ? '是' : '否';
    if (typeof value !== 'object') return String(value);
    if (!Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, 'data')) return plainStats(value.data, depth);
    if (Array.isArray(value)) {
      if (!value.length) return '暂无数据';
      return value.map((item, i) => {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          if ('name' in item && 'count' in item) return (item.name || '未知来源') + '：' + plainStats(item.count) + ' 次';
          if ('time' in item) return String(item.time) + '\n' + Object.keys(item).filter(k => k !== 'time').map(k => '  ' + (labels[k] || k) + '：' + plainStats(item[k], depth + 1)).join('\n');
        }
        return (value.length > 1 ? (i + 1) + '. ' : '') + plainStats(item, depth + 1);
      }).join('\n\n');
    }
    const keys = Object.keys(value);
    if (!keys.length) return '暂无数据';
    return keys.map(k => (labels[k] || k) + '：' + (value[k] && typeof value[k] === 'object' ? '\n' : '') + plainStats(value[k], depth + 1)).join('\n');
  }
  function statsError(error) {
    const message = error.message || String(error);
    const first = message.indexOf('\n');
    if (first < 0) return message;
    try {
      const detail = JSON.parse(message.slice(first + 1));
      return message.slice(0, first) + '\n' + (detail.statusMessage || detail.message || '服务暂时无法提供统计，请稍后重试。');
    } catch (_) { return message; }
  }
  const $ = id => document.getElementById(id);
  const state = { rows: [], cursor: '', search: '', busy: false, editing: null };
  let seq = 0;
  const pending = new Map();
  window.__queue = [];
  window.__reply = function (r) {
    const p = pending.get(r.id);
    if (!p) return;
    pending.delete(r.id);
    r.ok ? p.resolve(r.data) : p.reject(new Error(r.error));
  };
  function native(action, data) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      window.__queue.push({ id, action, data });
    });
  }
  function node(tag, text, cls) {
    const n = document.createElement(tag);
    if (text != null) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }
  function button(text, action) {
    const b = node('button', text);
    b.onclick = () => run(action);
    return b;
  }
  async function run(fn) {
    if (state.busy) return;
    state.busy = true;
    $('message').textContent = '处理中…';
    document.body.classList.add('busy');
    try { await fn(); $('message').textContent = ''; }
    catch (e) { $('message').textContent = e.message || String(e); }
    finally { state.busy = false; document.body.classList.remove('busy'); }
  }
  const call = (path, method, body, query) => native('api', { path, method, body, query });
  function rowsOf(d) {
    if (Array.isArray(d)) return d;
    if (d && Array.isArray(d.links)) return d.links;
    if (d && d.data) return rowsOf(d.data);
    throw new Error('无法识别链接列表响应：' + JSON.stringify(d).slice(0, 800));
  }
  async function load(more = false) {
    const q = $('search').value.trim();
    const query = { status: $('status').value, tag: $('tag').value.trim(), limit: q ? 1000 : 50 };
    let d;
    if (q) { query.q = q; d = await call('/api/link/search', 'GET', null, query); }
    else {
      query.sort = $('sort').value;
      if (more) query.cursor = state.cursor;
      d = await call('/api/link/list', 'GET', null, query);
    }
    const rows = rowsOf(d);
    state.rows = more ? state.rows.concat(rows) : rows;
    state.search = q;
    state.cursor = q ? '' : String((d && (d.cursor || d.nextCursor)) || '');
    if (d && (d.list_complete === true || d.hasMore === false)) state.cursor = '';
    render();
    $('summary').textContent = '已显示 ' + state.rows.length + ' 条' + (q ? '；搜索最多返回 1000 条，请缩小关键词以获得完整结果' : '');
    $('more').hidden = !state.cursor;
  }
  function render() {
    $('list').replaceChildren();
    if (!state.rows.length) $('list').append(node('p', '没有匹配的链接。'));
    for (const row of state.rows) {
      const card = node('article');
      card.append(node('h3', '/' + row.slug), node('p', row.url, 'url'));
      if (row.comment) card.append(node('p', row.comment));
      if (Array.isArray(row.tags)) card.append(node('small', row.tags.join(' · ')));
      if (row.expiration) card.append(node('p', '到期：' + new Date(row.expiration * 1000).toLocaleString()));
      const actions = node('div', null, 'actions');
      actions.append(button('复制', () => native('copy', { text: window.__base + '/' + row.slug })),
        button('编辑', async () => {
          const d = await call('/api/link/query', 'GET', null, { slug: row.slug });
          edit(d.link || d);
        }), button('统计', () => stats(row.slug)), button('删除', async () => {
          if (!confirm('永久删除 /' + row.slug + '？')) return;
          await call('/api/link/delete', 'POST', { slug: row.slug });
          await load();
        }));
      card.append(actions); $('list').append(card);
    }
  }
  function edit(row) {
    state.editing = row || null;
    $('formTitle').textContent = row ? '编辑 /' + row.slug : '创建链接';
    for (const key of ['url', 'slug', 'comment', 'title', 'description', 'apple', 'google', 'image'])
      $(key).value = row && row[key] != null ? row[key] : '';
    $('slug').readOnly = !!row;
    if (!row) $('url').value = 'https://';
    $('tags').value = row && Array.isArray(row.tags) ? row.tags.join(', ') : '';
    $('expiration').value = expirationInput(row && row.expiration);
    $('password').value = '';
    $('clearPassword').checked = false;
    const extras = {};
    for (const key of ['geo', 'cloaking', 'redirectWithQuery', 'proxy', 'unsafe'])
      if (row && row[key] !== undefined) extras[key] = row[key];
    $('extras').value = JSON.stringify(extras, null, 2);
    $('editor').hidden = false;
    $('editor').scrollIntoView({ behavior: 'smooth' });
  }
  async function save() {
    const body = {};
    for (const key of ['url', 'slug', 'comment', 'title', 'description', 'apple', 'google', 'image']) {
      const value = $(key).value.trim();
      if (value || (state.editing && ['comment', 'title', 'description', 'image'].includes(key))) body[key] = value;
    }
    try { body.url = normalizeTarget(body.url); if (!body.url) throw 0; $('url').value = body.url; }
    catch (_) { throw new Error('目标 URL 必须是有效的 http:// 或 https:// 地址。'); }
    if (body.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug)) throw new Error('Slug 仅允许小写字母、数字和中间连字符。');
    if (body.url.length > 16384) throw new Error('URL 过长。');
    const tags = $('tags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    if (tags.length > 10 || tags.some(t => t.length > 32)) throw new Error('最多 10 个标签，每个最多 32 字符。');
    body.tags = tags;
    const expiration = $('expiration').value.trim();
    if (expiration) {
      const n = expirationSeconds(expiration);
      if (!state.editing || n !== Number(state.editing.expiration)) {
        if (!Number.isSafeInteger(n) || n <= Date.now() / 1000) throw new Error('到期时间必须晚于当前时间。');
        body.expiration = n;
      }
    }
    if ($('password').value) body.password = $('password').value;
    if (state.editing && $('clearPassword').checked) body.password = '';
    let extras;
    try { extras = JSON.parse($('extras').value || '{}'); } catch (_) { throw new Error('高级 JSON 格式错误。'); }
    if (!extras || Array.isArray(extras) || typeof extras !== 'object') throw new Error('高级 JSON 必须是对象。');
    for (const key of Object.keys(extras)) {
      if (!['geo', 'cloaking', 'redirectWithQuery', 'proxy', 'unsafe'].includes(key)) throw new Error('不支持的高级字段：' + key);
      if (key !== 'geo' && typeof extras[key] !== 'boolean') throw new Error(key + ' 必须为布尔值。');
      if (key === 'geo') {
        if (!extras.geo || Array.isArray(extras.geo) || typeof extras.geo !== 'object') throw new Error('geo 必须是国家代码到 URL 的对象。');
        for (const country of Object.keys(extras.geo)) {
          if (!/^[A-Z]{2}$/.test(country)) throw new Error('国家代码须为两个大写字母。');
          try { new URL(extras.geo[country]); } catch (_) { throw new Error('geo URL 无效。'); }
        }
      }
      body[key] = extras[key];
    }
    await call(state.editing ? '/api/link/edit' : '/api/link/create', state.editing ? 'PUT' : 'POST', body);
    $('editor').hidden = true;
    await load();
  }
  async function stats(slug) {
    $('statistics').hidden = false;
    $('statsTitle').textContent = slug ? '/' + slug + ' · 统计' : '全站统计';
    $('statsData').textContent = '读取中…';
    const endAt = Math.floor(Date.now() / 1000);
    const query = { startAt: endAt - Number($('days').value) * 86400, endAt };
    if (slug) query.slug = slug;
    const results = [];
    const sections = [
      { path: 'counters', title: '访问概览' },
      { path: 'views', title: '访问趋势' },
      { path: 'metrics', title: '来源排行', type: 'referer' },
      { path: 'metrics', title: '国家或地区排行', type: 'country' },
      { path: 'metrics', title: '设备类型', type: 'deviceType' },
      { path: 'metrics', title: '浏览器排行', type: 'browser' },
    ];
    for (const section of sections) {
      try { results.push(section.title + '\n' + plainStats(await call('/api/stats/' + section.path, 'GET', null, statsQuery(section, query)))); }
      catch (e) { results.push(section.title + '\n' + statsError(e)); }
      $('statsData').textContent = results.join('\n\n');
    }
    if (!slug) {
      try { results.unshift('全站链接数量（不限时间）\n' + plainStats(await call('/api/link/count', 'GET', null, { status: 'all' }))); }
      catch (e) { results.unshift(statsError(e)); }
    }
    $('statsData').textContent = results.join('\n\n');
    $('statistics').scrollIntoView({ behavior: 'smooth' });
  }
  $('refresh').onclick = () => run(() => load());
  $('searchForm').onsubmit = e => { e.preventDefault(); run(() => load()); };
  $('more').onclick = () => run(() => load(true));
  $('create').onclick = () => edit(null);
  $('cancel').onclick = () => { $('editor').hidden = true; };
  $('linkForm').onsubmit = e => { e.preventDefault(); run(save); };
  $('url').onblur = () => { try { if ($('url').value.trim() && $('url').value.trim() !== 'https://') $('url').value = normalizeTarget($('url').value); } catch (_) {} };
  $('token').onclick = () => run(async () => {
    const d = await native('token');
    window.__base = d.base;
    $('site').textContent = d.base || '尚未配置网站';
    $('auth').textContent = d.configured ? 'Token 已保存' : '尚未配置 Token';
    if (d.configured) await load();
    else { state.rows = []; state.cursor = ''; render(); $('more').hidden = true; }
  });
  $('stats').onclick = () => run(() => stats());
  $('closeStats').onclick = () => { $('statistics').hidden = true; };
  $('site').textContent = window.__base || '尚未配置网站';
  $('auth').textContent = window.__configured ? 'Token 已保存' : '首次使用请点击设置';
  if (window.__configured) run(() => load());
}

function html(configured) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>SinkManager 3.0.6</title><style>
  :root{color-scheme:light dark;font:16px -apple-system,BlinkMacSystemFont,sans-serif;background:#f1f4fa;color:#17213b}*{box-sizing:border-box}body{margin:0;padding:20px 16px 50px;max-width:860px;margin:auto}h1{font-size:27px;margin:10px 0}h3{margin:0 0 10px}p{overflow-wrap:anywhere}small,#auth,#summary{color:#69758d}button,input,select,textarea{font:inherit;border-radius:10px;border:1px solid #b9c6db;padding:11px;background:#fff;color:#17213b}button{color:#245ad4;cursor:pointer}button:active{opacity:.6}input,textarea{width:100%}input[type=checkbox]{width:auto}label{display:block;margin:14px 0 6px}textarea{min-height:80px}header,.actions,.toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.toolbar{margin:16px 0}article,section{background:white;padding:18px;border-radius:16px;margin:14px 0;border:1px solid #dce3ee}.url{color:#245ad4}.actions{margin-top:15px}#message{white-space:pre-wrap;overflow-wrap:anywhere;color:#ba3131;margin:14px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}.busy button{opacity:.55}#search{flex:1;min-width:150px}#tag{max-width:180px}[hidden]{display:none!important}@media(prefers-color-scheme:dark){:root{background:#111827;color:#eef2ff}article,section{background:#1b2536;border-color:#334158}button,input,select,textarea{background:#222e43;color:#e0e9ff;border-color:#475773}.url{color:#98baff}small,#auth,#summary{color:#a9b6ce}#message{color:#ff9c9c}}
  </style></head><body><h1>SinkManager <small>3.0.6</small></h1><p><span id="site"></span> · <span id="auth"></span></p>
  <header><button id="token">设置</button><button id="create">创建链接</button><button id="refresh">刷新</button><button id="stats">全站统计</button><select id="days"><option value="7">最近 7 天</option><option value="30">最近 30 天</option><option value="90">最近 90 天</option></select></header>
  <form id="searchForm"><div class="toolbar"><input id="search" placeholder="搜索 Slug、URL、备注、标签"><button>搜索</button></div><div class="toolbar"><select id="status"><option value="all">全部状态</option><option value="active">有效</option><option value="expired">已过期</option></select><select id="sort"><option value="newest">最新创建</option><option value="oldest">最早创建</option><option value="az">Slug A–Z</option><option value="za">Slug Z–A</option></select><input id="tag" placeholder="精确标签筛选"></div></form>
  <div id="message" role="alert"></div><section id="editor" hidden><h2 id="formTitle"></h2><form id="linkForm">
  <label>目标 URL *（省略协议时自动补 https://）</label><input id="url" required type="text" inputmode="url" autocapitalize="none" autocorrect="off" maxlength="16384" placeholder="example.com 或 https://example.com">
  <label>Slug（创建时留空自动生成；编辑时固定）</label><input id="slug" maxlength="2048" autocapitalize="none" autocorrect="off">
  <label>备注</label><textarea id="comment" maxlength="2048"></textarea><label>标签（逗号分隔）</label><input id="tags">
  <label for="expiration">到期日期和时间</label><input id="expiration" type="datetime-local" step="1"><small>按手机本地时区设置。留空：创建时不设置到期时间，编辑时保留原值。</small>
  <label>预览标题</label><input id="title" maxlength="256"><label>预览描述</label><textarea id="description" maxlength="2048"></textarea>
  <label>预览图片地址</label><input id="image" maxlength="128"><label>Apple 跳转 URL（留空保留）</label><input id="apple" type="url"><label>Google 跳转 URL（留空保留）</label><input id="google" type="url">
  <label>密码（留空保留）</label><input id="password" type="password" maxlength="128" autocomplete="new-password"><label><input type="checkbox" id="clearPassword"> 清除原密码（编辑时）</label>
  <details><summary>高级选项 JSON</summary><p>支持 geo、cloaking、redirectWithQuery、proxy、unsafe。布尔字段使用 true/false；geo 例如 {"US":"https://example.com"}。</p><textarea id="extras" spellcheck="false"></textarea></details>
  <div class="actions"><button type="submit">保存</button><button id="cancel" type="button">取消</button></div></form></section>
  <section id="statistics" hidden><h2 id="statsTitle"></h2><p>访问统计为上方所选最近天数；未启用 Analytics 时显示错误原因。</p><div id="statsData" style="white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7"></div><button id="closeStats">关闭统计</button></section>
  <p id="summary"></p><main id="list"></main><button id="more" hidden>加载下一页</button>
  <script>window.__base=${JSON.stringify(BASE).replace(/</g, "\\u003c")};window.__configured=${JSON.stringify(configured)};(${browserApp.toString()})();</script></body></html>`;
}

async function main() {
  if (config.runsInWidget) { const a = new Alert(); a.title = 'SinkManager'; a.message = '请在 Scriptable App 内运行此脚本以打开管理界面。'; a.addAction('好'); await a.presentAlert(); return; }
  const web = new WebView();
  await web.loadHTML(html(!!BASE && !!token));
  // Block navigation: this WebView contains credentials-free local UI only.
  web.shouldAllowRequest = request => request.url === 'about:blank';
  let closed = false;
  const presented = web.present(false).then(() => { closed = true; }, () => { closed = true; });
  const pause = ms => new Promise(resolve => Timer.schedule(ms, false, resolve));
  const allowed = new Set(['/api/verify', '/api/link/list', '/api/link/search', '/api/link/query', '/api/link/create', '/api/link/edit', '/api/link/delete', '/api/link/count', '/api/stats/counters', '/api/stats/metrics', '/api/stats/views']);
  while (!closed) {
    let messages;
    try {
      // Synchronous IIFE, string result, no Promise/DOM/undefined crossing bridge.
      const raw = await web.evaluateJavaScript('(function(){return JSON.stringify(window.__queue.splice(0));})()', false);
      messages = JSON.parse(raw);
    } catch (e) { if (!closed) console.error('WebView bridge: ' + String(e)); break; }
    for (const m of messages) {
      const reply = { id: m.id, ok: true, data: null };
      try {
        if (m.action === 'token') reply.data = await configure();
        else if (m.action === 'copy') { Pasteboard.copyString(String(m.data.text)); reply.data = true; }
        else if (m.action === 'api') {
          const d = m.data;
          if (!allowed.has(d.path)) throw new Error('不允许的接口。');
          reply.data = await api(d.path, d.method || 'GET', d.body == null ? undefined : d.body, d.query || {});
        } else throw new Error('未知操作。');
      } catch (e) { reply.ok = false; reply.error = String(e.message || e); }
      if (closed) break;
      try {
        const payload = JSON.stringify(reply).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
        await web.evaluateJavaScript('(function(){window.__reply(' + payload + ');return "ok";})()', false);
      } catch (e) { if (!closed) console.error('WebView reply: ' + String(e)); closed = true; break; }
    }
    if (!closed) await pause(200);
  }
  await presented;
}
try { await main(); }
catch (e) { const a = new Alert(); a.title = 'SinkManager 错误'; a.message = String(e.message || e); a.addAction('好'); await a.presentAlert(); }
Script.complete();
