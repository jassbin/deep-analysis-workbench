// 深度分析工作台 本地静态服务器（Node，零依赖）
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname);
const port = Number(process.env.PORT || 8931);
const host = '127.0.0.1';
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon'
};
/* ---------- /api/search 事件联网检索（百度百科 + 必应，尽力而为） ---------- */
function cjkKeywords(q) {
  const out = [];
  for (const term of String(q || '').split(/\s+/)) {
    const m = term.match(/[\u4e00-\u9fa5]{2,}/g) || [];
    for (const w of m) if (w.length >= 2 && out.indexOf(w) < 0) out.push(w);
  }
  return out;
}
async function searchBaike(keys) {
  const out = [];
  for (const k of keys.slice(0, 4)) {
    if (!k || k.length > 40) continue;
    try {
      const url = 'https://baike.baidu.com/api/openapi/BaikeLemmaCardApi?scope=103&format=json&appid=379020&bk_key=' + encodeURIComponent(k) + '&bk_length=500';
      const res = await fetch(url, { headers: { 'User-Agent': 'DAWorkbench/0.1' }, signal: AbortSignal.timeout(7000) });
      const j = await res.json();
      if (j && j.title && !out.some(function (x) { return x.title === j.title; })) {
        out.push({ title: j.title, snippet: String(j.abstract || '').replace(/<[^>]+>/g, '').trim().slice(0, 220), url: 'https://baike.baidu.com/item/' + encodeURIComponent(j.title), source: '百度百科', tier: 'mid' });
      }
    } catch (e) {}
  }
  return out;
}
async function searchBing(q, keywords) {
  try {
    const url = 'https://cn.bing.com/search?q=' + encodeURIComponent(q) + '&mkt=zh-CN&setlang=zh-hans';
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Accept-Language': 'zh-CN,zh;q=0.9' },
      signal: AbortSignal.timeout(9000)
    });
    const html = await res.text();
    const out = [];
    const re = /<li class="b_algo"[\s\S]*?<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?:<p[^>]*>([\s\S]*?)<\/p>)?/g;
    let m = null, n = 0;
    while ((m = re.exec(html)) !== null && n < 6) {
      const title = String(m[2]).replace(/<[^>]+>/g, '').trim();
      const u = m[1];
      const snip = String(m[4] || '').replace(/<[^>]+>/g, '').trim();
      if (!title || !/^https?:\/\//i.test(u) || u.indexOf('bing.com') >= 0) continue;
      const hay = title + snip;
      let score = 0;
      for (const k of keywords) if (hay.indexOf(k) >= 0) score++;
      if (keywords.length && score === 0) continue; // 相关性过滤：滤掉必应分词不稳带来的无关结果
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
  for (const x of await searchBaike(baikeKeys)) push(x);
  let bing = await searchBing(q, keywords);
  if (!bing.length && keywords.length) bing = await searchBing(keywords[0], keywords.slice(0, 2));
  for (const x of bing) push(x);
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
    if (err) { res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'}); return res.end('404 not found'); }
    if (st.isDirectory()) filePath = path.join(filePath, 'index.html');
    fs.readFile(filePath, (err2, data) => {
      if (err2) { res.writeHead(404); return res.end('404'); }
      res.writeHead(200, {'Content-Type': types[path.extname(filePath).toLowerCase()] || 'application/octet-stream'});
      res.end(data);
    });
  });
});
server.listen(port, host, () => console.log('DA workbench serving: http://' + host + ':' + port));