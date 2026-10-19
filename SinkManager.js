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
  if (!BASE || !token) throw new Error('Open Settings to configure your site and token first.');
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
  catch (e) { throw new Error(method + ' ' + path + '\nNetwork request failed: ' + String(e.message || e)); }
  const status = req.response ? req.response.statusCode : 0;
  // Do not display echoed credentials in HTTP diagnostics.
  const safe = s => String(s).split(token).join('[REDACTED]').slice(0, 3000);
  if (status < 200 || status >= 300)
    throw new Error('HTTP ' + status + ' · ' + method + ' ' + path + '\n' + safe(raw || 'Empty response'));
  if (!raw.trim()) return null;
  try { return JSON.parse(raw); }
  catch (_) { throw new Error('HTTP ' + status + ' · ' + path + '\nThe server did not return JSON: ' + safe(raw)); }
}

async function configure() {
  const a = new Alert();
  a.title = 'SinkManager Settings';
  a.message = 'Enter your Sink root URL and NUXT_SITE_TOKEN. Tokens are stored only in Scriptable Keychain. Leave the token blank to keep the saved token for the same site.';
  a.addTextField('https://your-sink.example', BASE);
  a.addSecureTextField('Token (optional Bearer prefix)', '');
  a.addAction('Save and verify');
  a.addDestructiveAction('Clear saved token');
  a.addCancelAction('Cancel');
  const i = await a.presentAlert();
  if (i === 1) {
    if (Keychain.contains(TOKEN_KEY)) Keychain.remove(TOKEN_KEY);
    token = '';
    return { configured: false, base: BASE };
  }
  if (i === 0) {
    let site = a.textFieldValue(0).trim().replace(/\/+$/, '');
    if (site && !/^https?:\/\//i.test(site)) site = 'https://' + site;
    if (!/^https:\/\/[^\s/?#:@]+(?::\d+)?$/i.test(site)) throw new Error('Enter an HTTPS root URL without a path, credentials, or query parameters.');
    const next = a.textFieldValue(1).trim().replace(/^Bearer\s+/i, '');
    const previous = { base: BASE, key: TOKEN_KEY, token };
    const key = 'SinkManager.Token.' + site;
    const saved = Keychain.contains(key) ? Keychain.get(key) : '';
    if (!next && !saved) throw new Error('Token cannot be empty.');
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
    if (!match) throw new Error('Select a valid expiration date and time.');
    const parts = match.slice(1).map(n => Number(n || 0));
    const d = new Date(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]);
    if (d.getFullYear() !== parts[0] || d.getMonth() + 1 !== parts[1] || d.getDate() !== parts[2] || d.getHours() !== parts[3] || d.getMinutes() !== parts[4] || d.getSeconds() !== parts[5]) throw new Error('The selected date and time is invalid. Please choose again.');
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
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || /\s/.test(text)) throw new Error('Invalid destination URL. Enter a website address.');
    return text;
  }
  function plainStats(value, depth = 0) {
    const labels = { visits: 'Visits', visitors: 'Unique visitors', referers: 'Referrers', count: 'Count', total: 'Total', time: 'Time', date: 'Date', name: 'Name', country: 'Country or region', browser: 'Browser', os: 'Operating system', device: 'Device', slug: 'Short link', data: 'Analytics data', rows: 'Records', countDistinct: 'Distinct count' };
    if (value == null) return 'No data';
    if (typeof value === 'number') return value.toLocaleString('en-US');
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value !== 'object') return String(value);
    if (!Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, 'data')) return plainStats(value.data, depth);
    if (Array.isArray(value)) {
      if (!value.length) return 'No data';
      return value.map((item, i) => {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          if ('name' in item && 'count' in item) return (item.name || 'Unknown source') + ': ' + plainStats(item.count) + ' visits';
          if ('time' in item) return String(item.time) + '\n' + Object.keys(item).filter(k => k !== 'time').map(k => '  ' + (labels[k] || k) + ': ' + plainStats(item[k], depth + 1)).join('\n');
        }
        return (value.length > 1 ? (i + 1) + '. ' : '') + plainStats(item, depth + 1);
      }).join('\n\n');
    }
    const keys = Object.keys(value);
    if (!keys.length) return 'No data';
    return keys.map(k => (labels[k] || k) + ': ' + (value[k] && typeof value[k] === 'object' ? '\n' : '') + plainStats(value[k], depth + 1)).join('\n');
  }
  function statsError(error) {
    const message = error.message || String(error);
    const first = message.indexOf('\n');
    if (first < 0) return message;
    try {
      const detail = JSON.parse(message.slice(first + 1));
      return message.slice(0, first) + '\n' + (detail.statusMessage || detail.message || 'Analytics are temporarily unavailable. Please try again later.');
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
    $('message').textContent = 'Working…';
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
    throw new Error('Unrecognized link list response: ' + JSON.stringify(d).slice(0, 800));
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
    $('summary').textContent = 'Showing ' + state.rows.length + ' links' + (q ? '; search returns up to 1,000 results. Narrow your keyword for complete results.' : '');
    $('more').hidden = !state.cursor;
  }
  function render() {
    $('list').replaceChildren();
    if (!state.rows.length) $('list').append(node('p', 'No matching links.'));
    for (const row of state.rows) {
      const card = node('article');
      card.append(node('h3', '/' + row.slug), node('p', row.url, 'url'));
      if (row.comment) card.append(node('p', row.comment));
      if (Array.isArray(row.tags)) card.append(node('small', row.tags.join(' · ')));
      if (row.expiration) card.append(node('p', 'Expires: ' + new Date(row.expiration * 1000).toLocaleString('en-US')));
      const actions = node('div', null, 'actions');
      actions.append(button('Copy', () => native('copy', { text: window.__base + '/' + row.slug })),
        button('Edit', async () => {
          const d = await call('/api/link/query', 'GET', null, { slug: row.slug });
          edit(d.link || d);
        }), button('Analytics', () => stats(row.slug)), button('Delete', async () => {
          if (!confirm('Permanently delete /' + row.slug + '?')) return;
          await call('/api/link/delete', 'POST', { slug: row.slug });
          await load();
        }));
      card.append(actions); $('list').append(card);
    }
  }
  function edit(row) {
    state.editing = row || null;
    $('formTitle').textContent = row ? 'Edit /' + row.slug : 'Create link';
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
    catch (_) { throw new Error('The destination must be a valid http:// or https:// URL.'); }
    if (body.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug)) throw new Error('Slug supports lowercase letters, numbers, and internal hyphens only.');
    if (body.url.length > 16384) throw new Error('URL is too long.');
    const tags = $('tags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    if (tags.length > 10 || tags.some(t => t.length > 32)) throw new Error('Use up to 10 tags, each at most 32 characters.');
    body.tags = tags;
    const expiration = $('expiration').value.trim();
    if (expiration) {
      const n = expirationSeconds(expiration);
      if (!state.editing || n !== Number(state.editing.expiration)) {
        if (!Number.isSafeInteger(n) || n <= Date.now() / 1000) throw new Error('Expiration must be in the future.');
        body.expiration = n;
      }
    }
    if ($('password').value) body.password = $('password').value;
    if (state.editing && $('clearPassword').checked) body.password = '';
    let extras;
    try { extras = JSON.parse($('extras').value || '{}'); } catch (_) { throw new Error('Invalid advanced JSON.'); }
    if (!extras || Array.isArray(extras) || typeof extras !== 'object') throw new Error('Advanced JSON must be an object.');
    for (const key of Object.keys(extras)) {
      if (!['geo', 'cloaking', 'redirectWithQuery', 'proxy', 'unsafe'].includes(key)) throw new Error('Unsupported advanced field: ' + key);
      if (key !== 'geo' && typeof extras[key] !== 'boolean') throw new Error(key + ' must be a boolean.');
      if (key === 'geo') {
        if (!extras.geo || Array.isArray(extras.geo) || typeof extras.geo !== 'object') throw new Error('geo must be an object mapping country codes to URLs.');
        for (const country of Object.keys(extras.geo)) {
          if (!/^[A-Z]{2}$/.test(country)) throw new Error('Country codes must be two uppercase letters.');
          try { new URL(extras.geo[country]); } catch (_) { throw new Error('Invalid geo URL.'); }
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
    $('statsTitle').textContent = slug ? '/' + slug + ' · Analytics' : 'Site analytics';
    $('statsData').textContent = 'Loading…';
    const endAt = Math.floor(Date.now() / 1000);
    const query = { startAt: endAt - Number($('days').value) * 86400, endAt };
    if (slug) query.slug = slug;
    const results = [];
    const sections = [
      { path: 'counters', title: 'Traffic overview' },
      { path: 'views', title: 'Traffic trends' },
      { path: 'metrics', title: 'Top referrers', type: 'referer' },
      { path: 'metrics', title: 'Top countries and regions', type: 'country' },
      { path: 'metrics', title: 'Device types', type: 'deviceType' },
      { path: 'metrics', title: 'Top browsers', type: 'browser' },
    ];
    for (const section of sections) {
      try { results.push(section.title + '\n' + plainStats(await call('/api/stats/' + section.path, 'GET', null, statsQuery(section, query)))); }
      catch (e) { results.push(section.title + '\n' + statsError(e)); }
      $('statsData').textContent = results.join('\n\n');
    }
    if (!slug) {
      try { results.unshift('Total site links (all time)\n' + plainStats(await call('/api/link/count', 'GET', null, { status: 'all' }))); }
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
    $('site').textContent = d.base || 'No site configured';
    $('auth').textContent = d.configured ? 'Token saved' : 'No token configured';
    if (d.configured) await load();
    else { state.rows = []; state.cursor = ''; render(); $('more').hidden = true; }
  });
  $('stats').onclick = () => run(() => stats());
  $('closeStats').onclick = () => { $('statistics').hidden = true; };
  $('site').textContent = window.__base || 'No site configured';
  $('auth').textContent = window.__configured ? 'Token saved' : 'Open Settings to get started';
  if (window.__configured) run(() => load());
}

function html(configured) {
  return `<!doctype html><html lang="en-US"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>SinkManager 3.0.6</title><style>
  :root{color-scheme:light dark;font:16px -apple-system,BlinkMacSystemFont,sans-serif;background:#f1f4fa;color:#17213b}*{box-sizing:border-box}body{margin:0;padding:20px 16px 50px;max-width:860px;margin:auto}h1{font-size:27px;margin:10px 0}h3{margin:0 0 10px}p{overflow-wrap:anywhere}small,#auth,#summary{color:#69758d}button,input,select,textarea{font:inherit;border-radius:10px;border:1px solid #b9c6db;padding:11px;background:#fff;color:#17213b}button{color:#245ad4;cursor:pointer}button:active{opacity:.6}input,textarea{width:100%}input[type=checkbox]{width:auto}label{display:block;margin:14px 0 6px}textarea{min-height:80px}header,.actions,.toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.toolbar{margin:16px 0}article,section{background:white;padding:18px;border-radius:16px;margin:14px 0;border:1px solid #dce3ee}.url{color:#245ad4}.actions{margin-top:15px}#message{white-space:pre-wrap;overflow-wrap:anywhere;color:#ba3131;margin:14px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}.busy button{opacity:.55}#search{flex:1;min-width:150px}#tag{max-width:180px}[hidden]{display:none!important}@media(prefers-color-scheme:dark){:root{background:#111827;color:#eef2ff}article,section{background:#1b2536;border-color:#334158}button,input,select,textarea{background:#222e43;color:#e0e9ff;border-color:#475773}.url{color:#98baff}small,#auth,#summary{color:#a9b6ce}#message{color:#ff9c9c}}
  </style></head><body><h1>SinkManager <small>3.0.6</small></h1><p><span id="site"></span> · <span id="auth"></span></p>
  <header><button id="token">Settings</button><button id="create">Create link</button><button id="refresh">Refresh</button><button id="stats">Site analytics</button><select id="days"><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></header>
  <form id="searchForm"><div class="toolbar"><input id="search" placeholder="Search slug, URL, notes, or tags"><button>Search</button></div><div class="toolbar"><select id="status"><option value="all">All statuses</option><option value="active">Active</option><option value="expired">Expired</option></select><select id="sort"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="az">Slug A–Z</option><option value="za">Slug Z–A</option></select><input id="tag" placeholder="Exact tag filter"></div></form>
  <div id="message" role="alert"></div><section id="editor" hidden><h2 id="formTitle"></h2><form id="linkForm">
  <label>Destination URL * (https:// added if omitted)</label><input id="url" required type="text" inputmode="url" autocapitalize="none" autocorrect="off" maxlength="16384" placeholder="example.com or https://example.com">
  <label>Slug (blank to generate; fixed when editing)</label><input id="slug" maxlength="2048" autocapitalize="none" autocorrect="off">
  <label>Notes</label><textarea id="comment" maxlength="2048"></textarea><label>Tags (comma-separated)</label><input id="tags">
  <label for="expiration">Expiration date and time</label><input id="expiration" type="datetime-local" step="1"><small>Uses the device local timezone. Leave blank for no expiration on creation, or to keep the current expiration when editing.</small>
  <label>Preview title</label><input id="title" maxlength="256"><label>Preview description</label><textarea id="description" maxlength="2048"></textarea>
  <label>Preview image URL</label><input id="image" maxlength="128"><label>Apple redirect URL (blank to keep)</label><input id="apple" type="url"><label>Google redirect URL (blank to keep)</label><input id="google" type="url">
  <label>Password (blank to keep)</label><input id="password" type="password" maxlength="128" autocomplete="new-password"><label><input type="checkbox" id="clearPassword"> Clear existing password (when editing)</label>
  <details><summary>Advanced options JSON</summary><p>Supports geo, cloaking, redirectWithQuery, proxy, and unsafe. Boolean fields use true/false. Example geo: {"US":"https://example.com"}.</p><textarea id="extras" spellcheck="false"></textarea></details>
  <div class="actions"><button type="submit">Save</button><button id="cancel" type="button">Cancel</button></div></form></section>
  <section id="statistics" hidden><h2 id="statsTitle"></h2><p>Traffic analytics cover the selected period. An error message is shown if Analytics is unavailable.</p><div id="statsData" style="white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7"></div><button id="closeStats">Close analytics</button></section>
  <p id="summary"></p><main id="list"></main><button id="more" hidden>Load next page</button>
  <script>window.__base=${JSON.stringify(BASE).replace(/</g, "\\u003c")};window.__configured=${JSON.stringify(configured)};(${browserApp.toString()})();</script></body></html>`;
}

async function main() {
  if (config.runsInWidget) { const a = new Alert(); a.title = 'SinkManager'; a.message = 'Run this script inside the Scriptable app to open the manager.'; a.addAction('OK'); await a.presentAlert(); return; }
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
          if (!allowed.has(d.path)) throw new Error('Endpoint not allowed.');
          reply.data = await api(d.path, d.method || 'GET', d.body == null ? undefined : d.body, d.query || {});
        } else throw new Error('Unknown action.');
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
catch (e) { const a = new Alert(); a.title = 'SinkManager Error'; a.message = String(e.message || e); a.addAction('OK'); await a.presentAlert(); }
Script.complete();
