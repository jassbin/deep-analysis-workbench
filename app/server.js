// 深度分析工作台 本地静态服务器（Node，零依赖）
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile, execFileSync } = require('child_process');
const root = path.join(__dirname);
const port = Number(process.env.PORT || 8931);
const host = '127.0.0.1';
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon'
};

/* ---------- 网络抓取：系统 curl 优先（HTTP/1.1 + 浏览器 UA + 自动走系统代理），curl 缺失时回退 fetch ---------- */
const CURL = process.platform === 'win32' ? 'curl.exe' : 'curl';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// 自动探测代理：环境变量 > Windows 系统代理（注册表 Internet Settings）
function detectProxy() {
  for (const k of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy']) {
    if (process.env[k]) return process.env[k];
  }
  if (process.platform === 'win32') {
    try {
      const en = execFileSync('reg.exe', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyEnable'], { encoding: 'utf8', windowsHide: true });
      const sv = execFileSync('reg.exe', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyServer'], { encoding: 'utf8', windowsHide: true });
      const enabled = /\b0x1\b/i.test(en) || /1\s*$/.test(en.trim());
      if (enabled) {
        const m = sv.match(/(\S+)\s*$/);
        if (m && /^[\w.:-]+$/.test(m[1])) return m[1];
      }
    } catch (e) { /* 忽略注册表读取失败 */ }
  }
  return null;
}
let proxyCache = { value: null, t: 0 };
// 动态探测代理（5 秒缓存），随时开关外网都能自适应
function getProxy() {
  if (Date.now() - proxyCache.t > 5000) { proxyCache.value = detectProxy(); proxyCache.t = Date.now(); }
  return proxyCache.value;
}

function fetchWith(url, opts) {
  return new Promise((resolve) => {
    const args = ['-s', '-L', '--http1.1', '--max-time', String(opts.timeout), '--connect-timeout', '4', '-A', UA];
    if (opts.acceptLang) args.push('-H', 'Accept-Language: ' + opts.acceptLang);
    if (opts.proxy) args.push('-x', opts.proxy);
    args.push(url);
    execFile(CURL, args, { windowsHide: true, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        // curl 不可用时回退到 fetch（undici）
        if (err.code === 'ENOENT' && typeof fetch === 'function') {
          const h = { 'User-Agent': UA };
          if (opts.acceptLang) h['Accept-Language'] = opts.acceptLang;
          fetch(url, { headers: h, signal: AbortSignal.timeout(opts.timeout) })
            .then((r) => r.text())
            .then((tt) => resolve({ ok: true, body: tt }))
            .catch(() => resolve({ ok: false, body: '' }));
        } else {
          resolve({ ok: false, body: '' });
        }
      } else {
        resolve({ ok: true, body: stdout || '' });
      }
    });
  });
}

function httpGet(url, opts) {
  opts = opts || {};
  const timeout = opts.timeout || 8000;
  const proxy = (opts.proxy !== false) ? getProxy() : null;
  return fetchWith(url, { timeout: timeout, proxy: proxy, acceptLang: opts.acceptLang }).then((r) => {
    // 代理刚失效（如外网被关）时自动降级为直连重试一次
    if (!r.ok && proxy) return fetchWith(url, { timeout: timeout, proxy: null, acceptLang: opts.acceptLang });
    return r;
  });
}


function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ').trim();
}

/* ---------- /api/search 事件联网检索（百度百科 + DuckDuckGo + 必应，尽力而为） ---------- */
function cjkKeywords(q) {
  const out = [];
  for (const term of String(q || '').split(/\s+/)) {
    const m = term.match(/[\u4e00-\u9fa5]{2,}/g) || [];
    for (const w of m) if (w.length >= 2 && out.indexOf(w) < 0) out.push(w);
  }
  return out;
}

async function searchBaike(keys) {
  const tasks = (keys || []).slice(0, 4).filter((k) => k && k.length <= 40).map(async (k) => {
    try {
      const url = 'https://baike.baidu.com/api/openapi/BaikeLemmaCardApi?scope=103&format=json&appid=379020&bk_key=' + encodeURIComponent(k) + '&bk_length=500';
      const r = await httpGet(url, { timeout: 7000, proxy: false });
      if (!r.ok || !r.body) return null;
      const j = JSON.parse(r.body);
      if (j && j.title) {
        return { title: String(j.title), snippet: stripHtml(j.abstract || '').slice(0, 220), url: 'https://baike.baidu.com/item/' + encodeURIComponent(String(j.title)), source: '百度百科', tier: 'mid' };
      }
    } catch (e) { /* 单条失败忽略 */ }
    return null;
  });
  const arr = await Promise.all(tasks);
  const out = []; const seen = new Set();
  for (const x of arr) if (x && !seen.has(x.title)) { seen.add(x.title); out.push(x); }
  return out;
}

async function searchDdg(q, keywords) {
  // DuckDuckGo html 端点：202 风控时短暂重试一次
  const waits = [0, 1200];
  for (const w of waits) {
    if (w) await new Promise((r) => setTimeout(r, w));
    const out = await ddgHtml(q, keywords);
    if (out.length) return out;
  }
  return [];
}

async function ddgHtml(q, keywords) {
  try {
    const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q);
    const r = await httpGet(url, { timeout: 10000, acceptLang: 'zh-CN,zh;q=0.9,en;q=0.8' });
    if (!r.ok || r.body.indexOf('result__a') < 0) return [];
    const body = r.body;
    const titles = [], hrefs = [], snips = [];
    let m;
    const ta = /<a rel="nofollow" class="result__a" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    while ((m = ta.exec(body)) !== null) {
      let u = m[1];
      const um = u.match(/[?&]uddg=([^&]+)/);
      if (um) { try { u = decodeURIComponent(um[1]); } catch (e) {} }
      if (!/^https?:\/\//i.test(u) || /duckduckgo\.com/i.test(u)) continue;
      const t = stripHtml(m[2]);
      if (!t) continue;
      titles.push(t); hrefs.push(u);
    }
    const sa = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    while ((m = sa.exec(body)) !== null) snips.push(stripHtml(m[1]));
    const out = [];
    for (let i = 0; i < titles.length && out.length < 6; i++) {
      const snip = (snips[i] || '').slice(0, 220);
      const hay = titles[i] + snip;
      let score = 0;
      for (const k of keywords) if (hay.indexOf(k) >= 0) score++;
      if (keywords.length && score === 0) continue;
      out.push({ title: titles[i], snippet: snip, url: hrefs[i], source: 'DuckDuckGo', tier: 'mid' });
    }
    if (!out.length) {
      for (let i = 0; i < titles.length && out.length < 6; i++) {
        out.push({ title: titles[i], snippet: (snips[i] || '').slice(0, 220), url: hrefs[i], source: 'DuckDuckGo', tier: 'mid' });
      }
    }
    return out;
  } catch (e) { return []; }
}

async function searchBrave(q, keywords) {
  try {
    const url = 'https://search.brave.com/search?q=' + encodeURIComponent(q) + '&source=web';
    const r = await httpGet(url, { timeout: 10000, acceptLang: 'zh-CN,zh;q=0.9,en;q=0.8' });
    if (!r.ok || r.body.indexOf('search-snippet-title') < 0) return [];
    const html = r.body;
    const blocks = [];
    let m;
    const blockRe = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>[\s\S]*?<div class="title search-snippet-title[^"]*" title="([^"]*)"[\s\S]*?<\/a>/g;
    while ((m = blockRe.exec(html)) !== null) {
      if (/search\.brave\.com|brave\.com/i.test(m[1])) continue;
      blocks.push({ url: m[1], title: m[2] });
    }
    const snips = [];
    const snipRe = /<div class="generic-snippet svelte-[^"]*"[^>]*>[\s\S]*?<div class="content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
    while ((m = snipRe.exec(html)) !== null) snips.push(stripHtml(m[1]));
    const out = [];
    for (let i = 0; i < blocks.length && out.length < 6; i++) {
      const snip = (snips[i] || '').slice(0, 220);
      const hay = blocks[i].title + snip;
      let score = 0;
      for (const k of keywords) if (hay.indexOf(k) >= 0) score++;
      if (keywords.length && score === 0) continue;
      out.push({ title: blocks[i].title, snippet: snip, url: blocks[i].url, source: 'Brave', tier: 'mid' });
    }
    if (!out.length) {
      for (let i = 0; i < blocks.length && out.length < 6; i++) {
        out.push({ title: blocks[i].title, snippet: (snips[i] || '').slice(0, 220), url: blocks[i].url, source: 'Brave', tier: 'mid' });
      }
    }
    return out;
  } catch (e) { return []; }
}

async function searchBing(q, keywords) {
  try {
    const url = 'https://cn.bing.com/search?q=' + encodeURIComponent(q) + '&mkt=zh-CN&setlang=zh-hans';
    const r = await httpGet(url, { timeout: 9000, acceptLang: 'zh-CN,zh;q=0.9', proxy: false });
    if (!r.ok || !r.body) return [];
    const html = r.body;
    const re = /<li class="b_algo"[\s\S]*?<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?:<p[^>]*>([\s\S]*?)<\/p>)?/g;
    const out = [];
    let m = null, n = 0;
    while ((m = re.exec(html)) !== null && n < 6) {
      const title = stripHtml(m[2]);
      const u = m[1];
      const snip = stripHtml(m[4] || '');
      if (!title || !/^https?:\/\//i.test(u) || u.indexOf('bing.com') >= 0) continue;
      const hay = title + snip;
      let score = 0;
      for (const k of keywords) if (hay.indexOf(k) >= 0) score++;
      if (keywords.length && score === 0) continue;
      out.push({ title: title, snippet: snip.slice(0, 220), url: u, source: '必应网页', tier: 'mid' });
      n++;
    }
        return out;
  } catch (e) { return []; }
}

async function handleSearch(req, res) {
  const qs = new URL(req.url, 'http://x').searchParams;
  const q = (qs.get('q') || '').trim();
  const t = (qs.get('t') || '').trim();
  if (!q) { res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' }); return res.end(JSON.stringify({ error: 'missing q' })); }
  const keywords = cjkKeywords(q);
  const baikeKeys = [];
  if (q.length <= 40) baikeKeys.push(q);
  for (const k of keywords) if (baikeKeys.indexOf(k) < 0) baikeKeys.push(k);
  if (t && baikeKeys.indexOf(t) < 0) baikeKeys.push(t);

  const results = [];
  const seen = new Set();
  function push(x) { if (x && !seen.has(x.title + '|' + x.source)) { seen.add(x.title + '|' + x.source); results.push(x); } }

  const [baike, ddg, brave, bing] = await Promise.all([
    searchBaike(baikeKeys),
    searchDdg(q, keywords),
    searchBrave(q, keywords),
    searchBing(q, keywords)
  ]);
  let ddg2 = ddg;
  if (!ddg2.length && t) ddg2 = await searchDdg(t + ' ' + q, keywords);
  let bing2 = bing;
  if (!bing2.length && keywords.length) bing2 = await searchBing(keywords[0], keywords.slice(0, 2));

  for (const x of baike) push(x);
  for (const x of ddg2) push(x);
  for (const x of brave) push(x);
  for (const x of bing2) push(x);

  const capped = results.slice(0, 8);
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ q: q, results: capped, note: capped.length ? '' : '未检索到相关结果：可换关键词，或该事件太新/太冷门。' }));
}

const server = http.createServer((req, res) => {
  if (req.url.split('?')[0] === '/api/search') return handleSearch(req, res);
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  let filePath = path.join(root, urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, ''));
  if (!filePath.startsWith(root)) { res.writeHead(403); return res.end('forbidden'); }
  fs.stat(filePath, (err, st) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 not found'); }
    if (st.isDirectory()) filePath = path.join(filePath, 'index.html');
    fs.readFile(filePath, (err2, data) => {
      if (err2) { res.writeHead(404); return res.end('404'); }
      res.writeHead(200, { 'Content-Type': types[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
  });
});
server.listen(port, host, () => console.log('DA workbench serving: http://' + host + ':' + port));
