/**
 * E2E Test: 候选人登录
 * PRD: 2.身份认证模块/2.候选人登录
 * Test Cases: TC-2.2-001 ~ TC-2.2-011
 *
 * Execute with Playwright MCP tools.
 * Precondition: dev server running at http://localhost:5173
 * Test Data: refer to seed data for candidate credentials
 */

// TC-2.2-001: 有效双要素登录成功
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/candidate-login" })
//   2. browser_type({ element: "登录码输入框", text: "<valid_oneTimeCode>" })
//   3. browser_type({ element: "手机尾号输入框", text: "<valid_phoneLast4>" })
//   4. browser_click({ element: "登录按钮" })
//   5. browser_snapshot({})
// Verify:
//   - 登录成功
//   - 跳转至 /candidate/oa

// TC-2.2-002: 登录页布局验证
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/candidate-login" })
//   2. browser_snapshot({})
// Verify:
//   - 居中卡片样式，宽度 400px
//   - 卡片标题 "候选人登录"
//   - 包含一次性登录码和手机号后4位两个字段
//   - 登录按钮宽度与表单同宽

// TC-2.2-003: 登录按钮 loading 态
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/candidate-login" })
//   2. browser_type({ element: "登录码输入框", text: "TESTCODE" })
//   3. browser_type({ element: "手机尾号输入框", text: "1234" })
//   4. browser_click({ element: "登录按钮" })
//   5. browser_snapshot({}) — 验证 loading 态

// TC-2.2-008: 手机尾号格式校验
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/candidate-login" })
//   2. browser_type({ element: "手机尾号输入框", text: "abc" })
//   3. browser_click({ element: "登录按钮" })
//   4. browser_snapshot({})
// Verify:
//   - 手机尾号字段校验失败（仅接受4位纯数字）
//   - maxlength=4 限制

// TC-2.2-009: 多语言支持
// Steps:
//   1. 浏览器设为英文后 browser_navigate
//   2. browser_snapshot({})
// Verify:
//   - 标题显示 "Candidate Login"

// TC-2.2-004: 登录码正确但手机尾号不匹配
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/candidate-login" })
//   2. browser_type({ element: "登录码输入框", text: "<valid_oneTimeCode>" })
//   3. browser_type({ element: "手机尾号输入框", text: "0000" })
//   4. browser_click({ element: "登录按钮" })
//   5. browser_snapshot({})
// Verify:
//   - 显示红色错误提示
//   - 不泄露"登录码已存在"的信息

// TC-2.2-005: 登录码不存在
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/candidate-login" })
//   2. browser_type({ element: "登录码输入框", text: "ZZZZZZZZ" })
//   3. browser_type({ element: "手机尾号输入框", text: "1234" })
//   4. browser_click({ element: "登录按钮" })
//   5. browser_snapshot({})
// Verify:
//   - 显示统一的错误提示
//   - 不区分登录码不存在与手机尾号不匹配

// TC-2.2-006: 登录码已失效（候选人处于终态）
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/candidate-login" })
//   2. browser_type({ element: "登录码输入框", text: "<terminal_candidate_code>" })
//   3. browser_type({ element: "手机尾号输入框", text: "<terminal_candidate_phone4>" })
//   4. browser_click({ element: "登录按钮" })
//   5. browser_snapshot({})
// Verify:
//   - 显示"登录码已失效，请联系招聘方"提示

// TC-2.2-007: 必填字段校验
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/candidate-login" })
//   2. 登录码留空，手机尾号填写，点击"登录"
//   3. browser_snapshot({})
//   4. 登录码填写，手机尾号留空，点击"登录"
//   5. browser_snapshot({})
// Verify:
//   - 对应字段下方显示红色校验提示
//   - 不发起登录请求

// TC-2.2-010: 频率限制
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/candidate-login" })
//   2. 对同一登录码连续多次输入错误手机尾号
//   3. browser_snapshot({})
// Verify:
//   - 达到阈值后施加频率限制

// TC-2.2-011: 登录成功后默认跳转页
// Steps:
//   1. 以候选人身份成功登录
//   2. browser_snapshot({})
// Verify:
//   - 统一跳转到 /candidate/oa

export {};
