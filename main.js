const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

let win;

const configPath = () => path.join(app.getPath('userData'), 'config.json');
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch (e) { return {}; }
}
function saveConfig(c) {
  fs.writeFileSync(configPath(), JSON.stringify(c, null, 2));
}

/* ---------------- Google Calendar ---------------- */
let googleAccessToken = null;
let googleTokenExpiry = 0;

async function googleGetAccessToken() {
  const g = loadConfig().google || {};
  if (!g.refreshToken || !g.clientId || !g.clientSecret) throw new Error('Google not connected');
  if (googleAccessToken && Date.now() < googleTokenExpiry - 60000) return googleAccessToken;
  const body = new URLSearchParams({
    client_id: g.clientId, client_secret: g.clientSecret,
    refresh_token: g.refreshToken, grant_type: 'refresh_token'
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Google token refresh failed: ' + (data.error_description || data.error || res.status));
  googleAccessToken = data.access_token;
  googleTokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
  return googleAccessToken;
}

function googleAuthFlow() {
  return new Promise((resolve) => {
    const g = loadConfig().google || {};
    if (!g.clientId || !g.clientSecret) { resolve({ ok: false, error: 'Client ID と Client Secret を入力してください' }); return; }
    const PORT = 42813;
    const redirect = 'http://127.0.0.1:' + PORT;
    let settled = false;
    const finish = (r) => { if (settled) return; settled = true; try { server.close(); } catch (e) {} resolve(r); };
    const server = http.createServer(async (req, res) => {
      try {
        const u = new URL(req.url, redirect);
        const err = u.searchParams.get('error');
        if (err) { res.end('Error: ' + err); finish({ ok: false, error: err }); return; }
        const code = u.searchParams.get('code');
        if (!code) { res.statusCode = 400; res.end('no code'); return; }
        const body = new URLSearchParams({
          code, client_id: g.clientId, client_secret: g.clientSecret,
          redirect_uri: redirect, grant_type: 'authorization_code'
        });
        const tr = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
        });
        const td = await tr.json();
        if (!tr.ok) { res.end('token error'); finish({ ok: false, error: td.error_description || td.error || 'token error' }); return; }
        const c = loadConfig();
        c.google = Object.assign({}, c.google, { refreshToken: td.refresh_token || (c.google && c.google.refreshToken) });
        saveConfig(c);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end('<html><body style="font-family:sans-serif;text-align:center;padding-top:60px;color:#2F2A26;"><h2>接続しました</h2><p>このタブを閉じてウィジェットに戻ってください。</p></body></html>');
        finish({ ok: true });
      } catch (e) { try { res.end('error'); } catch (_) {} finish({ ok: false, error: String(e.message || e) }); }
    });
    server.on('error', (e) => finish({ ok: false, error: 'ポート ' + PORT + ' を開けません: ' + e.message }));
    server.listen(PORT, () => {
      const params = new URLSearchParams({
        client_id: g.clientId, redirect_uri: redirect, response_type: 'code',
        scope: 'https://www.googleapis.com/auth/calendar.events',
        access_type: 'offline', prompt: 'consent'
      });
      shell.openExternal('https://accounts.google.com/o/oauth2/v2/auth?' + params.toString());
    });
    setTimeout(() => finish({ ok: false, error: 'タイムアウトしました（ブラウザで許可が完了しませんでした）' }), 180000);
  });
}

ipcMain.handle('google:saveCreds', (e, { clientId, clientSecret, calendarId }) => {
  const c = loadConfig();
  c.google = Object.assign({}, c.google, {
    clientId: (clientId || '').trim(),
    clientSecret: (clientSecret || '').trim(),
    calendarId: (calendarId || '').trim() || 'primary'
  });
  saveConfig(c);
  return { ok: true };
});
ipcMain.handle('google:connect', async () => {
  try { return await googleAuthFlow(); } catch (e) { return { ok: false, error: String(e.message || e) }; }
});
ipcMain.handle('google:disconnect', () => {
  const c = loadConfig(); delete c.google; saveConfig(c);
  googleAccessToken = null; googleTokenExpiry = 0;
  return { ok: true };
});

ipcMain.handle('events:list', async (e, { timeMin, timeMax }) => {
  try {
    const g = loadConfig().google || {};
    if (!g.refreshToken) return { ok: false, error: 'not connected', events: [] };
    const token = await googleGetAccessToken();
    const cal = encodeURIComponent(g.calendarId || 'primary');
    const q = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '250' });
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/' + cal + '/events?' + q, {
      headers: { Authorization: 'Bearer ' + token }
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: (data.error && data.error.message) || 'calendar error', events: [] };
    const events = (data.items || []).map((it) => ({
      title: it.summary || '(no title)',
      startISO: (it.start && (it.start.dateTime || it.start.date)) || null,
      endISO: (it.end && (it.end.dateTime || it.end.date)) || null,
      allDay: !!(it.start && it.start.date)
    })).filter((x) => x.startISO);
    return { ok: true, events };
  } catch (e) { return { ok: false, error: String(e.message || e), events: [] }; }
});

ipcMain.handle('events:create', async (e, ev) => {
  try {
    const g = loadConfig().google || {};
    if (!g.refreshToken) return { ok: false, error: 'not connected' };
    const token = await googleGetAccessToken();
    const cal = encodeURIComponent(g.calendarId || 'primary');
    let body;
    if (ev.allDay) {
      const [y, m, d] = ev.date.split('-').map(Number);
      const next = new Date(y, m - 1, d + 1);
      const endDate = next.getFullYear() + '-' + String(next.getMonth() + 1).padStart(2, '0') + '-' + String(next.getDate()).padStart(2, '0');
      body = { summary: ev.title, start: { date: ev.date }, end: { date: endDate } };
    } else {
      body = { summary: ev.title, start: { dateTime: ev.startISO }, end: { dateTime: ev.endISO } };
    }
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/' + cal + '/events', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: (data.error && data.error.message) || 'create error' };
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});

/* ---------------- Notion ---------------- */
const NOTION_VERSION = '2022-06-28';
const notionHeaders = (token) => ({
  Authorization: 'Bearer ' + token, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json'
});

async function notionDetectSchema(token, dbId) {
  const res = await fetch('https://api.notion.com/v1/databases/' + dbId, { headers: notionHeaders(token) });
  const data = await res.json();
  if (!res.ok) throw new Error((data && data.message) || 'database fetch failed');
  const entries = Object.entries(data.properties || {});
  let titleProp = null;
  for (const [name, def] of entries) if (def.type === 'title') titleProp = name;
  const checkbox = entries.filter(([, d]) => d.type === 'checkbox');
  const doneProp = (checkbox.find(([n]) => /done|complete|finish|完了|済/i.test(n)) || checkbox[0] || [])[0] || null;
  const dates = entries.filter(([, d]) => d.type === 'date');
  const dueProp = (dates.find(([n]) => /due|date|期限|締切|期日|日付/i.test(n)) || dates[0] || [])[0] || null;
  const selects = entries.filter(([, d]) => d.type === 'select');
  const priEntry = selects.find(([n]) => /pri|優先|重要/i.test(n)) || selects[0];
  let priProp = null, priOptions = [];
  if (priEntry) { priProp = priEntry[0]; priOptions = ((priEntry[1].select && priEntry[1].select.options) || []).map((o) => o.name); }
  return { titleProp, doneProp, dueProp, priProp, priOptions };
}

function priBucket(name) {
  if (!name) return 'mid';
  const n = String(name).toLowerCase();
  if (/high|urgent|高|重要/.test(n)) return 'high';
  if (/low|低/.test(n)) return 'low';
  return 'mid';
}
function priOptionFor(bucket, options) {
  if (!options || !options.length) return null;
  const re = { high: /high|urgent|高|重要/i, mid: /mid|med|中|normal|普通/i, low: /low|低/i }[bucket];
  return options.find((o) => re.test(o)) || null;
}

ipcMain.handle('notion:save', async (e, { token, databaseId }) => {
  try {
    token = (token || '').trim();
    databaseId = (databaseId || '').trim().replace(/-/g, '');
    if (!token || !databaseId) return { ok: false, error: 'Token と Database ID を入力してください' };
    const schema = await notionDetectSchema(token, databaseId);
    if (!schema.titleProp) return { ok: false, error: 'タイトル列が見つかりません。データベースをインテグレーションに共有しましたか？' };
    const c = loadConfig();
    c.notion = { token, databaseId, schema };
    saveConfig(c);
    return { ok: true, schema };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});
ipcMain.handle('notion:disconnect', () => {
  const c = loadConfig(); delete c.notion; saveConfig(c); return { ok: true };
});

ipcMain.handle('tasks:list', async () => {
  try {
    const n = loadConfig().notion;
    if (!n) return { ok: false, error: 'not connected', tasks: [] };
    const res = await fetch('https://api.notion.com/v1/databases/' + n.databaseId + '/query', {
      method: 'POST', headers: notionHeaders(n.token), body: JSON.stringify({ page_size: 100 })
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: (data && data.message) || 'query failed', tasks: [] };
    const s = n.schema;
    const tasks = (data.results || []).map((p) => {
      const props = p.properties || {};
      const titleArr = (s.titleProp && props[s.titleProp] && props[s.titleProp].title) || [];
      const name = titleArr.map((t) => t.plain_text).join('') || '(無題)';
      const done = !!(s.doneProp && props[s.doneProp] && props[s.doneProp].checkbox);
      const due = (s.dueProp && props[s.dueProp] && props[s.dueProp].date && props[s.dueProp].date.start) || null;
      const priName = (s.priProp && props[s.priProp] && props[s.priProp].select && props[s.priProp].select.name) || null;
      return { id: p.id, name, done, due, pri: priBucket(priName) };
    });
    return { ok: true, tasks };
  } catch (e) { return { ok: false, error: String(e.message || e), tasks: [] }; }
});

ipcMain.handle('tasks:add', async (e, { name, pri, due }) => {
  try {
    const n = loadConfig().notion;
    if (!n) return { ok: false, error: 'not connected' };
    const s = n.schema;
    const properties = {};
    properties[s.titleProp] = { title: [{ text: { content: name } }] };
    if (s.doneProp) properties[s.doneProp] = { checkbox: false };
    if (s.dueProp && due) properties[s.dueProp] = { date: { start: due } };
    if (s.priProp) { const opt = priOptionFor(pri, s.priOptions); if (opt) properties[s.priProp] = { select: { name: opt } }; }
    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST', headers: notionHeaders(n.token),
      body: JSON.stringify({ parent: { database_id: n.databaseId }, properties })
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: (data && data.message) || 'create failed' };
    return { ok: true, id: data.id };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});

ipcMain.handle('tasks:toggle', async (e, { id, done }) => {
  try {
    const n = loadConfig().notion;
    if (!n) return { ok: false, error: 'not connected' };
    if (!n.schema.doneProp) return { ok: false, error: 'チェックボックス列がありません' };
    const properties = {}; properties[n.schema.doneProp] = { checkbox: !!done };
    const res = await fetch('https://api.notion.com/v1/pages/' + id, {
      method: 'PATCH', headers: notionHeaders(n.token), body: JSON.stringify({ properties })
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: (data && data.message) || 'update failed' };
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});

ipcMain.handle('tasks:delete', async (e, { id }) => {
  try {
    const n = loadConfig().notion;
    if (!n) return { ok: false, error: 'not connected' };
    const res = await fetch('https://api.notion.com/v1/pages/' + id, {
      method: 'PATCH', headers: notionHeaders(n.token), body: JSON.stringify({ archived: true })
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: (data && data.message) || 'delete failed' };
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});

ipcMain.handle('config:status', () => {
  const c = loadConfig();
  return {
    google: !!(c.google && c.google.refreshToken),
    notion: !!(c.notion && c.notion.token)
  };
});

/* ---------------- Window ---------------- */
function createWindow() {
  win = new BrowserWindow({
    width: 720,
    height: 630,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('widget.html');

  // Make the frameless window draggable while keeping the widget transparent.
  // Interactive elements opt out of dragging so clicks still work.
  win.webContents.on('did-finish-load', () => {
    win.webContents.insertCSS(`
      html, body { background: transparent !important; }
      body { -webkit-app-region: drag; padding: 14px !important; }
      button, input, a, select, textarea,
      .cd, .card, .ck, .cf, .ib, .nb, .fb, .pb,
      .psb, .prb, .pom-mode-btn, .ei, .connect-btn, .bc-btn,
      .cdel, .abtn, .board, .arow,
      .settings-overlay, .settings-box {
        -webkit-app-region: no-drag;
      }
    `);
  });

  // Frameless windows have no close button, so allow Cmd/Ctrl+Q or Cmd/Ctrl+W to quit.
  win.webContents.on('before-input-event', (event, input) => {
    const mod = process.platform === 'darwin' ? input.meta : input.control;
    if (mod && (input.key === 'q' || input.key === 'w')) {
      app.quit();
    }
  });
}

// Only allow one instance; focus the existing widget if launched again.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
