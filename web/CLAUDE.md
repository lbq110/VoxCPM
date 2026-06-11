@AGENTS.md

## UI Bug Fixing: Loop Engineering（源自 Addy Osmani）

修 UI/CSS bug 时**禁止盲改**。必须使用 Goal + Loop 方法论。

### 核心概念

- **Goal** — 每轮 Loop 开始前必须定义一个可度量的目标。没有 Goal，Verify 就无标准。
- **Loop** — Observe → Hypothesize → Fix → Verify 循环。没解决就回到 Observe。
- **Skill** — 可复用的观察/验证能力（如 Playwright observe 脚本）。Skill 消除 Intent Debt（用猜测填补没观察到的事实）。

### 每个 Bug 的完整流程

```
=== Loop N: [bug 名称] ===
GOAL:      [可度量的验收标准，如 "text-indent ≥ 32px" 或 "lastBlock.bottom < contentBottom"]
OBSERVE:   npm run observe → 拿到截图 + computed style 数据
HYPOTHESIZE: [基于数据的假设，不是猜测]
FIX:       [只改一件事]
VERIFY:    npm run observe → 用数据对照 GOAL 判断是否达标
           → 达标：关闭 bug，进入下一个
           → 未达标：回到 OBSERVE，重新假设
```

### 规则

1. **先写 Goal 再进 Loop** — Goal 必须是可度量的（computed style 值、像素位置、布尔条件），不是"看起来对了"
2. **改代码前先 Observe** — 拿到 computed style 数据再形成假设
3. **一次只做一个 bug** — 不要同时修缩进、抖动、截断。混在一起时无法回溯哪步引入新问题
4. **改完必须 Verify** — 再跑一次 observe，用数据对照 Goal 确认修复
5. **不要"应该能行"** — 如果没有 observe 数据证明，就没有修好。"自信的猜测"是 Intent Debt 的来源
6. **分离 doer 和 checker** — 写代码的步骤（Fix）和验证的步骤（Observe/Verify）必须分开，不能在同一步里既改又判断

### Observe 命令

```sh
# 观察：截图 + 读 computed style（需要 dev server 在跑）
npm run observe

# 观察特定元素
OBSERVE_SELECTOR=".my-class" npm run observe

# 只截图 / 只读样式
OBSERVE_ACTION=screenshot npm run observe
OBSERVE_ACTION=style npm run observe

# 批量扫描：自动翻 30 页检查缩进/间距/截断违规（OBSERVE_PAGES 可调页数）
npm run observe:scan
OBSERVE_PAGES=50 npm run observe:scan
```

截图保存在 `.observe/`，不会提交到 git。

### 文件

- `e2e/observe.spec.ts` — Playwright 观察脚本（注入样本文本 + 截图 + computed style + 翻页诊断）
- `playwright.config.ts` — 默认 iPhone 14 视口 (390x844)
- `.observe/` — 截图输出目录（gitignored）
