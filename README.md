# 深度分析工作台 · Deep Analysis Workbench

把三个 OpenAI Codex skill 产品化为「推理轨迹平台」的响应式 Web MVP：

- `deep-analysis`（深度分析 / 事件七步拆解）
- `structural-navigator`（结构导航 / 异常锁定与撕裂路径）
- `resonant-cognition`（共振认知 / 机理穿透与情景分支）

## 核心特色

- **7 步推理流水线**：材料信源 → 异常锁定 → 中性骨架 → 机制穿透 → 博弈类比 → 情景分支 → 对抗质检
- **异常候选仲裁**：3 个异常候选按杠杆率评分，撕错了可切换入口重撕
- **步骤干预 + 下游重算**：「我不同意」→ 标记已修改 → 下游全部重算
- **审校会话**：交叉质询，系统必须落「辩护 / 让步并修订 / 挂起」三选一
- **联网检索**：输入事件 → 百科 + 网页检索 → 勾选「加入材料」并入步骤 1
- **证据分级 + 跨源交叉印证**：检索结果自动打 T1–T5 权威徽标 + 信源小结（独立域名数/权威分布/跨源锚点），纯规则零 LLM
- **案例库推理轨迹卡**：异常淘汰→撕裂→游走→碰壁→结论+可证伪条件
- **响应式**：桌面三栏 / 平板两栏 / 手机单栏，网页端手机均可打开

## 快速开始

```
node app/server.js
# 工作台 http://localhost:8931/
# 案例库 http://localhost:8931/cases.html
```

零依赖纯前端（HTML/CSS/JS + 轻量 Node 服务，无 npm install）。

## 目录

```
app/                  # Web MVP（index.html / cases.html / css / js / server.js）
deep-analysis.skill   # 三个原始 skill 定义
structural-navigator.skill
resonant-cognition.skill
案例库.md              # 种子案例库（29 张轨迹卡原材料）
MVP产品方案-深度分析工作台.md  # 产品方案：价值评估 + 推理轨迹平台规划
案例库分类清单.md / UI线框图-推理链工作台与审校会话.md
```

详见 `app/README.md` 与 `MVP产品方案-深度分析工作台.md`。
