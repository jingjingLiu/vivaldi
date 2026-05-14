/**
 * E2E Test: 门户首页与进度总览
 * PRD: 7.候选人门户模块/1.门户首页与进度总览
 * Test Cases: TC-7.1-001 ~ TC-7.1-009 (complete)
 *
 * Execute with Playwright MCP tools.
 * Precondition: dev server running, candidate account available
 */

// TC-7.1-001: 查看当前进度状态
// Steps:
//   1. 以候选人身份登录
//   2. browser_navigate({ url: "http://localhost:5173/candidate/status" })
//   3. browser_snapshot({})
// Verify:
//   - 居中单列卡片
//   - 卡片标题"候选人状态"
//   - 大号 StatusTag 展示当前阶段

// TC-7.1-002: 门户品牌顶栏
// Steps:
//   1. browser_snapshot({})
// Verify:
//   - 高度 64px，深色底
//   - 白色文字"候选人门户"
//   - 无菜单、无搜索、无登出

// TC-7.1-003: 不同阶段的状态展示
// Steps:
//   1. 分别以不同阶段的候选人登录
//   2. browser_navigate({ url: "http://localhost:5173/candidate/status" })
//   3. browser_snapshot({})
// Verify:
//   - unavailable: "尚未收到测评任务"
//   - not_started: "OA 已发放，请前往作答"
//   - submitted: "已提交，等待后续通知"
//   - expired: "OA 已过期"

// TC-7.1-004: 登录后默认跳转逻辑
// Steps:
//   1. 以候选人身份登录
//   2. browser_snapshot({})
// Verify:
//   - 默认跳转至 /candidate/oa

// TC-7.1-005: 卡片最大宽度 800px
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/candidate/status" })
//   2. browser_snapshot({})
// Verify:
//   - 卡片最大宽度 800px，居中显示

// TC-7.1-006: 阶段实时性 — 不轮询
// Steps:
//   1. 以候选人身份登录
//   2. browser_navigate({ url: "http://localhost:5173/candidate/status" })
//   3. browser_snapshot({}) — 记录当前状态
//   4. 后端状态发生变化（通过 API 修改）
//   5. 不刷新页面
//   6. browser_snapshot({})
// Verify:
//   - 仍显示打开页面时的状态
//   - 需刷新页面才能看到最新状态

// TC-7.1-007: 终态后登录码失效
// Steps:
//   1. 候选人进入终态（如 date_confirmed）
//   2. 尝试访问门户任意页
// Verify:
//   - 被跳转至 /candidate-login
//   - 提示登录码已失效

// TC-7.1-008: 未登录访问被拦截
// Steps:
//   1. 清除 cookies
//   2. browser_navigate({ url: "http://localhost:5173/candidate/status" })
//   3. browser_snapshot({})
// Verify:
//   - 被跳转至 /candidate-login

// TC-7.1-009: 多语言支持
// Steps:
//   1. 浏览器设为英文
//   2. browser_navigate({ url: "http://localhost:5173/candidate/status" })
//   3. browser_snapshot({})
// Verify:
//   - 标题和状态文案按英文渲染

// TC-7.1-013 i18n 源码断言 — 5 个 OA 阶段 key 存在且 zhCN 文案逐字匹配 PRD
// PRD: 7.候选人门户模块/1.门户首页与进度总览 §3.2.2
// Purpose: static source-code guard upstream of TC-7.1-003a~003e runtime checks.
//   Runtime probes can miss the "zhCN key absent → fallback to English but
//   English happens to render Chinese literal" edge — this TC inspects
//   the i18n files directly.
// Execution: uses the Bash tool (no browser).
// Expected mapping (PRD §3.2.2):
//   oa.unavailable → "尚未收到测评任务"
//   oa.notStarted  → "OA 已发放，请前往作答"
//   oa.inProgress  → "作答进行中"
//   oa.submitted   → "已提交，等待后续通知"
//   oa.expired     → "OA 已过期"
// Steps:
//   1. Bash: grep -nE "unavailable|notStarted|not_started|inProgress|in_progress|submitted|expired" code/src/i18n/zhCN.ts
//      — confirm every key exists under the `oa` object
//   2. Bash: grep -oE "(unavailable|notStarted|not_started|inProgress|in_progress|submitted|expired):\s*'[^']*'" code/src/i18n/zhCN.ts
//      — capture each key's literal value
//   3. Repeat steps 1-2 against code/src/i18n/en.ts (assert same key set, any English value)
//   4. Optional: node -e "import('./code/src/i18n/zhCN.ts').then(m => console.log(m.default.oa))"
//      — read the runtime object to cross-check raw grep
// Verify (ALL required; any single failure → FAIL):
//   - zhCN.ts oa.unavailable === '尚未收到测评任务'
//   - zhCN.ts oa.notStarted (or not_started) === 'OA 已发放，请前往作答'
//   - zhCN.ts oa.inProgress (or in_progress) === '作答进行中'
//   - zhCN.ts oa.submitted === '已提交，等待后续通知'
//     (current repo value is '测评已提交' — this Verification is EXPECTED
//      to FAIL today; that's the i18n↔PRD drift the TC is meant to surface)
//   - zhCN.ts oa.expired === 'OA 已过期'
//     (current repo value is '测评时间已过期' — same FAIL-on-drift note)
//   - en.ts has all 5 keys (English values; set parity with zhCN)
// Forbidden states (any → FAIL):
//   - value is the key name itself (e.g. unavailable: 'oa.unavailable')
//   - zhCN and en key sets differ (one side has a key the other lacks)
//   - value is empty string
//   - tester accepts a fuzzy "contains 'OA'" match instead of exact equality

export {};
