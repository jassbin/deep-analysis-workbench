// 深度分析工作台 · 命令行检索入口（与 Web /api/search 同源）
// 用法: node cli.js "查询词"   例: node cli.js "瑞幸 库迪 价格战"
const api = require('./server.js');

(async () => {
  const q = process.argv.slice(2).join(' ').trim();
  if (!q) { console.error('用法: node cli.js "查询词"'); process.exit(1); }
  const keywords = api.cjkKeywords(q);
  const baikeKeys = [q].concat(keywords.filter((k) => k !== q));
  const [baike, ddg, brave, bing] = await Promise.all([
    api.searchBaike(baikeKeys),
    api.searchDdg(q, keywords),
    api.searchBrave(q, keywords),
    api.searchBing(q, keywords)
  ]);
  const seen = new Set(); const all = [];
  function push(x) { if (x && !seen.has(x.title + '|' + x.source)) { seen.add(x.title + '|' + x.source); all.push(x); } }
  for (const arr of [baike, ddg, brave, bing]) for (const x of arr) push(x);
  const capped = all.slice(0, 8);
  for (const x of capped) { const st = api.sourceTier(x.url); x.tier = st.tier; x.tierLabel = st.label; }
  const sum = api.corroborate(capped.map((r) => ({ url: r.url, body: (r.title || '') + ' ' + (r.snippet || '') })));
  console.log('== 检索: ' + q + ' ==');
  capped.forEach((r, i) => {
    console.log('[' + (i + 1) + '] (' + r.tierLabel + ') ' + r.title);
    console.log('    ' + (r.snippet || '').slice(0, 90));
    console.log('    ' + r.url + '  [' + r.source + ']');
  });
  console.log('\n== 信源小结 ==');
  console.log('独立域名 ' + sum.domainCount + ' 个 | 权威分布 ' + JSON.stringify(sum.tierDist));
  if (sum.anchors.length) console.log('跨源锚点: ' + sum.anchors.slice(0, 6).map((a) => a.anchor).join(' / '));
  process.exit(0);
})();
