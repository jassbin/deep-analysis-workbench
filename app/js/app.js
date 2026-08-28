/* 深度分析工作台 · MVP v0.1 前端逻辑（零依赖） */
(function () {
  "use strict";

  var state = {
    mode: "neutral",
    activeStep: 1,
    steps: JSON.parse(JSON.stringify(SEED.steps)),
    notes: [],
    reportVersion: 1.0,
    reviewCount: 0,
    defense: 0, concede: 0, pending: 0,
    lastQuestion: null
  };

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- 工具 ---------- */
  function tierClass(t) { return { strong: "strong", mid: "mid", weak: "weak" }[t] || "mid"; }
  function tierName(t) { return { strong: "独立信源[强]", mid: "单一信源[中]", weak: "无法核实[!]" }[t] || t; }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/\n/g, "<br>");
  }
  function statusLabel(st) {
    return { done: "已完成", pending: "待执行", dirty: "需重算", modified: "已修改", rejected: "已否决" }[st] || st;
  }

  /* ---------- 渲染：推理链 ---------- */
  function renderChain() {
    var list = $("chainList"); list.innerHTML = "";
    state.steps.forEach(function (s) {
      var li = document.createElement("li");
      li.className = "chain-node " + s.status + (s.id === state.activeStep ? " active" : "");
      li.innerHTML = '<div class="n">步骤 ' + s.id + ' · ' + statusLabel(s.status) + '</div>' +
        '<div class="t">' + esc(s.name) + '</div>' +
        (s.revision ? '<div class="st">已修订：' + esc(s.revision) + '</div>' : '');
      li.onclick = function () { state.activeStep = s.id; renderAll(); };
      list.appendChild(li);
    });
    var dirty = state.steps.filter(function (s) { return s.status === "dirty"; }).length;
    $("btnRecompute").disabled = dirty === 0;
    $("dirtyHint").textContent = dirty ? dirty + " 个下游节点待重算（上游已修改）" : "";
  }

  /* ---------- 渲染：步骤详情 ---------- */
  function renderDetail() {
    var s = state.steps[state.activeStep - 1];
    $("detailStep").textContent = "步骤 " + s.id + " / 7 · " + statusLabel(s.status);
    $("detailTitle").textContent = s.title;
    if (s.revision) $("detailStep").textContent += " · 已修订";
    var b = s.body, h = "";
    switch (s.id) {
      case 1:
        h += '<p>' + esc(b.intro) + '</p><h4>材料清单</h4><table><tr><th>事实</th><th>分级</th><th>来源</th></tr>';
        b.materials.forEach(function (m) {
          h += '<tr><td>' + esc(m.fact) + '</td><td><span class="tier ' + tierClass(m.tier) + '">' + tierName(m.tier) + '</span></td><td>' + esc(m.src) + '</td></tr>';
        });
        h += '</table><h4>硬缺口（强制标注，待补信息）</h4><ul>';
        b.gaps.forEach(function (g) { h += '<li><span class="tier weak">无法核实[!]</span> ' + esc(g) + '</li>'; });
        h += '</ul>';
        break;
      case 2:
        h += '<h4>预期基线（正常应该是什么）</h4><div class="card">' + esc(b.baseline) + '</div>';
        h += '<h4>候选异常（多入口并行，选错可重撕）</h4>';
        b.candidates.forEach(function (c) {
          var picked = c.id === b.picked;
          h += '<div class="cand' + (picked ? " picked" : "") + '" data-cand="' + c.id + '">' +
            '<div><b>' + c.id + '</b> · <span class="lever ' + (c.leverage >= 5 ? "high" : c.leverage >= 4 ? "mid" : "low") + '">杠杆率 ' + c.leverage + '/5</span>' +
            (picked ? ' <span class="tag-chip defend">已选为入口</span>' : '') + '</div>' +
            '<div>' + esc(c.label) + '</div>' +
            '<div class="hint">' + esc(c.note) + '</div>' +
            (picked ? '' : '<button class="btn small" data-pick="' + c.id + '">选此入口</button>') +
            '</div>';
        });
        h += '<h4>入口理由</h4><div class="card highlight">' + esc(b.pickReason) + '</div>';
        break;
      case 3:
        h += '<p>' + esc(b.note) + '</p><h4>五要素（中性骨架）</h4><div class="kv">';
        b.elements.forEach(function (e) { h += '<div class="k">' + esc(e[0]) + '</div><div>' + esc(e[1]) + '</div>'; });
        h += '</div><h4>骨架命名</h4><div class="card highlight">' + esc(b.naming) + '</div>';
        break;
      case 4:
        h += '<h4>三层强制下钻</h4>';
        b.layers.forEach(function (l) {
          h += '<div class="card"><b>' + esc(l[0]) + '：</b>' + esc(l[1]) + '</div>';
        });
        h += '<h4>利益流向（对抗模式重解释）</h4><div class="flow">';
        b.flow.forEach(function (f) { h += '<div>' + esc(f) + '</div>'; });
        h += '</div><h4>骨架重命名</h4><div class="card"><div class="hint">原名（表层叙事）：' + esc(b.rename.original) + '</div>' +
          '<div style="margin:6px 0"><b>重命名（结构事实）：</b>' + esc(b.rename.renamed) + '</div>' +
          '<div class="hint">' + esc(b.rename.check) + '</div></div>';
        break;
      case 5:
        h += '<h4>博弈矩阵（简化）</h4><table>';
        h += '<tr>' + b.matrix.head.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join("") + '</tr>';
        b.matrix.rows.forEach(function (r) {
          h += '<tr><th>' + esc(r[0]) + '</th><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td></tr>';
        });
        h += '</table><p>' + esc(b.matrix.conclusion) + '</p>';
        h += '<h4>为什么游走到这里（显式理由）</h4><div class="card">' + esc(b.tension) + '</div>';
        h += '<h4>游走候选池（3–5 个，人凭洞察仲裁）</h4>';
        b.wanderCandidates.forEach(function (w, i) {
          h += '<div class="cand' + (i === 0 ? " picked" : "") + '"><div><b>' + esc(w.name) + '</b></div>' +
            '<div class="hint">张力指向：' + esc(w.tension) + '</div>' +
            '<div class="hint">结构同构：' + esc(w.isomorph) + '</div></div>';
        });
        h += '<h4>游走结论（仲裁）</h4><div class="card highlight">' + esc(b.picked) + '</div>';
        h += '<div class="card">' + esc(b.conclusion) + '</div>';
        break;
      case 6:
        h += '<p class="hint">' + esc(b.note) + '</p><h4>情景分支</h4>';
        b.branches.forEach(function (br) {
          h += '<div class="branch"><div class="prob">' + br.prob + '%</div>' +
            '<div><b>分支 ' + br.key + '：' + esc(br.name) + '</b></div>' +
            '<div>' + esc(br.narrative) + '</div>' +
            '<div class="hint">预警信号：' + esc(br.signals) + '</div></div>';
        });
        break;
      case 7:
        h += '<h4>魔鬼代言人（最强反方）</h4>';
        b.devil.forEach(function (d, i) {
          h += '<div class="devil"><div class="arg">反方 ' + (i + 1) + '：' + esc(d.arg) + '</div>' +
            '<div style="margin-top:6px">回应：' + esc(d.reply) + '</div>' +
            '<div class="hint">影响：' + esc(d.effect) + '</div></div>';
        });
        h += '<h4>元认知审计</h4><table class="meta-table">';
        b.meta.forEach(function (m) {
          h += '<tr><td>' + esc(m[0]) + '</td><td>' + esc(m[1]) + '</td></tr>';
        });
        h += '</table>';
        break;
    }
    $("detailBody").innerHTML = h;
  }

  /* ---------- 渲染：检查器 ---------- */
  function renderInspector() {
    var ev = $("evidenceList"); ev.innerHTML = "";
    SEED.evidence.forEach(function (e) {
      var li = document.createElement("li");
      li.className = "evidence-item";
      li.innerHTML = esc(e.text) + '<span class="src"><span class="tier ' + tierClass(e.tier) + '">' + tierName(e.tier) + '</span> ' + esc(e.src || "") + '</span>';
      ev.appendChild(li);
    });
    var cb = $("confidenceBox"); cb.innerHTML = "";
    SEED.confidence.forEach(function (c) {
      cb.insertAdjacentHTML("beforeend", '<div class="conf-row"><span>' + esc(c.label) + '</span><span class="v ' + c.level + '">' + c.value + '%</span></div>');
    });
    var nl = $("noteList"); nl.innerHTML = "";
    state.notes.forEach(function (n) {
      var li = document.createElement("li");
      li.textContent = n;
      nl.appendChild(li);
    });
  }

  /* ---------- 渲染：全部 ---------- */
  function renderAll() {
    $("projectName").textContent = state.projectName || SEED.project;
    renderChain();
    renderDetail();
    renderInspector();
    renderMode();
  }

  /* ---------- 模式切换 ---------- */
  function renderMode() {
    var btns = document.querySelectorAll(".mode-btn");
    btns.forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-mode") === state.mode);
    });
    if (state.mode === "adversarial" && state.activeStep === 4) {
      var note = document.createElement("div");
      note.className = "card highlight";
      note.style.marginTop = "12px";
      note.innerHTML = '<b>对抗模式生效中</b>：利益流向与重命名为对抗性解释，非事实判断。';
      if (!$("advNote")) {
        note.id = "advNote";
        $("detailBody").appendChild(note);
      }
    } else if ($("advNote")) { $("advNote").remove(); }
  }

  /* ---------- 修订流：我不同意 → 下游脏 → 重算 ---------- */
  function openModal(stepId) {
    var s = state.steps[stepId - 1];
    $("modalTitle").textContent = "修订 步骤 " + stepId + "：" + s.name;
    $("modalSub").textContent = "提交后，步骤 " + stepId + " 标记「已修改」，下游全部标记「需重算」，可逐节点重算或一键重算。";
    $("modalText").value = "";
    $("modal").classList.remove("hidden");
    $("modalText").focus();
  }
  $("btnDisagree").onclick = function () { openModal(state.activeStep); };
  $("btnModalCancel").onclick = function () { $("modal").classList.add("hidden"); };
  $("btnModalOk").onclick = function () {
    var txt = $("modalText").value.trim();
    if (!txt) { $("modalText").focus(); return; }
    var id = state.activeStep;
    state.steps[id - 1].status = "modified";
    state.steps[id - 1].revision = txt;
    for (var i = id; i < state.steps.length; i++) {
      if (state.steps[i].status !== "dirty") state.steps[i].status = "dirty";
    }
    state.reportVersion = (Math.round((state.reportVersion + 0.1) * 10) / 10);
    $("modal").classList.add("hidden");
    renderAll();
  };
  $("btnRecompute").onclick = function () {
    var n = 0;
    state.steps.forEach(function (s) {
      if (s.status === "dirty") { s.status = "done"; n++; }
    });
    $("btnRecompute").disabled = true;
    $("dirtyHint").textContent = "已重算 " + n + " 个下游节点（演示环境：沿用原结论，真实环境由 LLM 重跑）";
    renderChain();
  };

  /* ---------- 异常入口切换 ---------- */
  $("detailBody").addEventListener("click", function (e) {
    var pick = e.target.getAttribute("data-pick");
    if (pick) {
      state.steps[1].body.picked = pick;
      var reasonMap = { A: "选 A 为入口：解释力最强的口子。", B: "选 B 为入口：时机异常是第二解释力入口。", C: "选 C 为入口：行为人异常，注意防阴谋论叙事。" };
      state.steps[1].body.pickReason = reasonMap[pick] || state.steps[1].body.pickReason;
      renderDetail();
    }
  });

  /* ---------- 审校会话 ---------- */
  function renderReviewPresets() {
    var box = $("presetList"); box.innerHTML = "";
    SEED.review.forEach(function (r) {
      var btn = document.createElement("button");
      btn.textContent = r.q.slice(0, 22) + "…";
      btn.onclick = function () { pushReview(r.q, r); };
      box.appendChild(btn);
    });
  }
  function pushReview(q, r) {
    var body = $("reviewBody");
    var u = document.createElement("div");
    u.className = "chat-msg user";
    u.innerHTML = '<div class="who">你</div><div class="bubble">' + esc(q) + '</div>';
    body.appendChild(u);
    var sys = document.createElement("div");
    sys.className = "chat-msg";
    var tag = r ? r.tag : "辩护";
    sys.innerHTML = '<div class="who">系统 · <span class="tag-chip ' + (r ? r.type : "defend") + '">' + tag + '</span></div><div class="bubble">' + esc(r ? r.a : "（演示环境）收到质询。真实环境将调用 LLM 依证据链作答，落辩护/让步/挂起三选一。") + '</div>';
    body.appendChild(sys);
    body.scrollTop = body.scrollHeight;
    state.reviewCount++;
    if (r) { if (r.type === "defend") state.defense++; else if (r.type === "concede") state.concede++; else state.pending++; }
  }
  $("btnSendReview").onclick = function () {
    var q = $("reviewInput").value.trim();
    if (!q) return;
    var r = SEED.review.find(function (x) { return x.q === q; });
    pushReview(q, r || null);
    $("reviewInput").value = "";
  };
  $("reviewInput").addEventListener("keydown", function (e) { if (e.key === "Enter") $("btnSendReview").click(); });
  $("btnReview").onclick = function () {
    $("reviewPane").classList.remove("hidden");
    renderReviewPresets();
    var summary = document.createElement("div");
    summary.className = "review-hint";
    summary.innerHTML = '<b>审校摘要（自动生成）</b>：质询 ' + state.reviewCount + ' 轮｜辩护 ' + state.defense + '｜让步修订 ' + state.concede + '｜挂起 ' + state.pending + '｜报告版本 v1.0 → v' + state.reportVersion.toFixed(1) + '。被质询过且改得动的报告，比嘴硬的分析更可信。';
    if (!$("sumBox")) { summary.id = "sumBox"; $("reviewBody").prepend(summary); } else { $("sumBox").outerHTML = summary.outerHTML; }
  };
  $("btnCloseReview").onclick = function () { $("reviewPane").classList.add("hidden"); };

  /* ---------- 导出（演示） ---------- */
  $("btnExport").onclick = function () {
    var s = state.steps[state.activeStep - 1];
    var text = "深度分析报告（演示导出）\n项目：" + (state.projectName || SEED.project) + "\n报告版本：v" + state.reportVersion.toFixed(1) + "\n\n当前步骤：" + s.id + " " + s.name + "\n" + s.title + "\n\n完整 7 步流水线与审校记录请在浏览器中操作。\n\n[无法核实] 项：请联网回填后重跑步骤 5–6 的概率与分支。";
    var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "深度分析报告-v" + state.reportVersion.toFixed(1) + ".txt";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /* ---------- 模式切换绑定 ---------- */
  document.querySelectorAll(".mode-btn").forEach(function (b) {
    b.onclick = function () {
      state.mode = b.getAttribute("data-mode");
      renderAll();
    };
  });

    /* ---------- 新建分析：输入自己的事件 → 生成草稿骨架 ---------- */
  function openInput() {
    $("inputScreen").classList.remove("hidden");
    $("layout").classList.add("hidden");
    $("reviewPane").classList.add("hidden");
  }
  function closeInput() { $("inputScreen").classList.add("hidden"); $("layout").classList.remove("hidden"); }
  $("btnNew").onclick = openInput;
  $("btnInputClose").onclick = closeInput;
  $("btnDemo").onclick = function () {
    state.steps = JSON.parse(JSON.stringify(SEED.steps));
    state.projectName = SEED.project;
    state.notes = []; state.activeStep = 1; state.reportVersion = 1.0;
    closeInput(); renderAll();
  };

  var ANOMALY_RULES = [
    { keys: ["突然", "意外", "反常", "违背", "匪夷所思", "不合常理", "居然", "竟然"], cand: { id: "A", label: "预期违背：这件事与「正常应该怎样」不符的摩擦点", leverage: 5, note: "异常点驱动的经典入口：先想清楚正常基线" } },
    { keys: ["获益", "受益", "好处", "赚钱", "利益", "谁得利", "收割"], cand: { id: "B", label: "受益方异常：谁才是真正的获益方（表面 vs 实质）", leverage: 4, note: "暗黑逻辑入口：剥掉叙事看利益流向" } },
    { keys: ["矛盾", "打脸", "不一致", "一边", "却说", "然而", "自相矛盾"], cand: { id: "C", label: "自相矛盾：言行/数据/叙事之间的裂缝", leverage: 4, note: "错误捕捉入口：信息层次剥离后找断裂" } },
    { keys: ["又", "再次", "历史", "重演", "熟悉", "老套路"], cand: { id: "D", label: "重复结构：与已知历史/案例同构", leverage: 4, note: "结构游走入口：找同构案例验证" } },
    { keys: ["隐瞒", "不说", "掩盖", "洗白", "回避", "封口", "删"], cand: { id: "E", label: "信息缺口：被省略/回避/删除的信息", leverage: 4, note: "沉默本身是信号" } }
  ];
  function suggestAnomalies(text) {
    var out = [], used = {};
    ANOMALY_RULES.forEach(function (r) {
      var hit = r.keys.some(function (k) { return text.indexOf(k) >= 0; });
      if (hit && !used[r.cand.id] && out.length < 3) { out.push(r.cand); used[r.cand.id] = 1; }
    });
    if (!out.length) {
      out.push(
        { id: "A", label: "预期违背：这件事与「正常应该怎样」不符的摩擦点", leverage: 5, note: "先想清楚正常基线，再找偏差" },
        { id: "B", label: "受益方异常：谁才是真正的获益方", leverage: 4, note: "剥掉叙事看利益流向" },
        { id: "C", label: "自相矛盾 / 信息缺口：裂缝与沉默", leverage: 3, note: "找言行不一或被省略的信息" }
      );
    }
    return out;
  }
  function splitMaterials(text) {
    var parts = text.split(/[。；\n\r]+/).map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 4; });
    if (!parts.length) parts = [text];
    return parts.slice(0, 4).map(function (s) { return { fact: s, tier: "mid", src: "用户输入[中]" }; });
  }
  function buildSteps(text) {
    var mats = splitMaterials(text);
    var anoms = suggestAnomalies(text);
    var wait = "（草稿占位：这一步需要你或 LLM 后端补充判断）";
    return [
      { id: 1, name: "材料与信源", status: "done", title: "材料输入与信源分级",
        body: { intro: "已把你的输入拆为若干事实条目（单一信源[中]）。注意：材料越单一，结论越要打折扣。", materials: mats, gaps: ["建议补充：独立信源/官方公告/时间线/各方回应"] } },
      { id: 2, name: "异常锁定", status: "done", title: "异常点驱动：先建基线，再找摩擦点",
        body: { baseline: "（待补充）这类事件“正常应该是什么”？想清楚基线，异常才显眼。", candidates: anoms, picked: anoms[0].id, pickReason: "（待你仲裁）根据文本关键词自动建议了 " + anoms.length + " 个候选异常，请在工作台里选最高杠杆率的入口，或点「我不同意」补充你自己的异常点。" } },
      { id: 3, name: "中性骨架", status: "done", title: "事件抽象：五要素 + 骨架命名（先中性，再穿透）",
        body: { note: "草稿：先不要暗黑解读，只描述结构形状。", elements: [["主体", "（谁在做？）"], ["对象", "（对什么？）"], ["机制", "（用什么方法？）"], ["受损方", "（谁受损？）"], ["受益方", "（谁受益？）"]], naming: "（待你给骨架命名：一句话说清“这是什么结构”）" } },
      { id: 4, name: "机制穿透", status: "done", title: "三层强制下钻 + 利益流向（对抗模式重命名）",
        body: { layers: [["表面", "（表面叙事是什么？）"], ["深层", "（机制是什么？为什么这样运作？）"], ["底层", "（可跨案例复用的结构是什么？）"]], flow: ["（利益流向：谁 ← 从谁拿到什么）"], rename: { original: "（表层叙事）", renamed: "（结构重命名：揭示本质+利益流向+可迁移）", check: "自查：揭示本质？含利益流向？可迁移到其他行业？" } } },
      { id: 5, name: "博弈与类比", status: "done", title: "博弈矩阵 + 结构游走（显式理由 + 候选池仲裁）",
        body: { matrix: { head: ["", "对方策略A", "对方策略B"], rows: [["你策略A", wait, wait], ["你策略B", wait, wait]], conclusion: "（草稿：列出关键玩家的占优策略与均衡）" }, tension: "（当前最大的未解张力是什么？它决定下一步游走去哪）", wanderCandidates: [{ name: "（候选类比案例 1：按「张力指向 + 结构同构」填入）", tension: "（张力指向）", isomorph: "（结构同构点）" }, { name: "（候选类比案例 2）", tension: "（张力指向）", isomorph: "（结构同构点）" }], picked: "（仲裁：这些案例的同构与差异揭示了什么？）", conclusion: "（迁移结论：这个结构在别的领域成不成立？）" } },
      { id: 6, name: "情景分支", status: "done", title: "情景输出：2–4 条分支 + 概率 + 预警信号",
        body: { note: "草稿：分支要内部自洽，概率要可回测。", branches: [
          { key: "A", name: "（分支 A）", prob: 50, narrative: "（叙事与走向）", signals: "（预警信号：什么出现说明走向这里）" },
          { key: "B", name: "（分支 B）", prob: 35, narrative: "（叙事与走向）", signals: "（预警信号）" },
          { key: "C", name: "（分支 C）", prob: 15, narrative: "（叙事与走向）", signals: "（预警信号）" } ] } },
      { id: 7, name: "对抗质检", status: "done", title: "魔鬼代言人 + 元认知审计",
        body: { devil: [{ arg: "（最强反方：攻击你报告里最依赖的假设）", reply: "（回应：成立的部分→下调置信度；不成立的→展示推导链）", effect: "（影响）" }], meta: [["暗黑框架过用？", "（检查：是否把一切归为阴谋）"], ["基线带偏？", "（检查：你的“正常”假设是否本身有偏）"], ["确认偏误？", "（检查：是否只找了支持自己判断的证据）"]] } }
    ];
  }
  $("btnBuild").onclick = function () {
    var title = $("inputTitle").value.trim() || "未命名事件分析";
    var text = $("inputText").value.trim();
    if (!text) { $("inputText").focus(); return; }
    state.steps = buildSteps(text);
    if (state.pendingMaterials && state.pendingMaterials.length) {
      state.steps[0].body.materials = state.steps[0].body.materials.concat(state.pendingMaterials);
    }
    state.projectName = title + "（草稿）";
    state.notes = []; state.activeStep = 1; state.reportVersion = 1.0;
    closeInput(); renderAll();
  };
  /* ---------- 联网检索并核实（/api/search） ---------- */
  state.pendingMaterials = [];
  state.lastSearch = [];
  function searchQuery() {
    var title = $("inputTitle").value.trim();
    var text = $("inputText").value.trim();
    var q = title || "";
    var first = text.split(/[。；\n\r]/)[0] || "";
    if (first.length > 24) first = first.slice(0, 24);
    if (q && first) q += " " + first; else if (!q) q = first;
    return { q: q, t: title };
  }
  function renderSearchResults(results, note) {
    var box = $("searchResults");
    if (!results || !results.length) {
      box.innerHTML = '<div class="search-empty">' + esc(note || "未检索到相关结果，可换关键词或补充事件主体名称。") + "</div>";
      return;
    }
    state.lastSearch = results;
    var h = '<div class="hint" style="margin-top:10px">已找到 ' + results.length + " 条，可逐条加入材料：</div>";
    results.forEach(function (r, i) {
      h += '<div class="search-result"><span class="src">' + esc(r.source) + " · 单一信源[中]</span>" +
        '<h4>' + esc(r.title) + "</h4>" +
        (r.snippet ? "<p>" + esc(r.snippet) + "</p>" : "") +
        '<div class="url">' + esc(r.url) + "</div>" +
        '<div class="actions"><button class="btn small" data-add="' + i + '">＋ 加入材料</button></div></div>';
    });
    box.innerHTML = h;
  }
  $("btnSearch").onclick = function () {
    var sp = searchQuery();
    if (!sp.q) { $("searchStatus").textContent = "先填事件标题或描述"; return; }
    $("searchStatus").textContent = "检索中…";
    fetch("/api/search?q=" + encodeURIComponent(sp.q) + "&t=" + encodeURIComponent(sp.t || ""))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        $("searchStatus").textContent = "完成";
        renderSearchResults(j.results, j.note);
      })
      .catch(function () {
        $("searchStatus").textContent = "检索失败（服务未运行？）";
      });
  };
  $("searchResults").addEventListener("click", function (e) {
    var idx = e.target.getAttribute("data-add");
    if (idx === null) return;
    var r = state.lastSearch[Number(idx)];
    if (!r) return;
    var fact = r.title + "：" + (r.snippet || "").slice(0, 120);
    var m = { fact: fact, tier: r.tier || "mid", src: r.source + " [" + r.url + "]" };
    state.pendingMaterials.push(m);
    var btn = e.target;
    btn.textContent = "已加入 ✓";
    btn.disabled = true;
    $("searchStatus").textContent = "已加入 " + state.pendingMaterials.length + " 条检索材料";
  });
/* ---------- 初始化 ---------- */
  renderAll();
})();