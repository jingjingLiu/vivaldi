/**
 * E2E Test: 面试评估填写
 * PRD: 6.面试评估模块/1.面试评估填写
 * Test Cases: TC-6.1-001 ~ TC-6.1-010
 *
 * Execute with Playwright MCP tools.
 * Precondition: dev server running, logged in as interviewer,
 *               candidate has submitted OA and is in interviewer's position
 */

// TC-6.1-001: 面试官提交"通过"评估
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/admin/candidates/<id>" })
//   2. browser_click({ element: "OA 作答 Tab" })
//   3. 滚动到底部评估区
//   4. browser_type({ element: "评语输入框", text: "技术能力强，沟通好" })
//   5. browser_click({ element: "通过按钮" })
//   6. browser_snapshot({})
// Verify:
//   - 弹出全局绿色提示"评估已提交"
//   - 评语输入框自动清空
//   - 评估 Tab 记录数 +1

// TC-6.1-002: 面试官提交"拒绝"评估
// Steps:
//   1. browser_click({ element: "OA 作答 Tab" })
//   2. browser_type({ element: "评语输入框", text: "代码质量不达标" })
//   3. browser_click({ element: "拒绝按钮" })
//   4. browser_snapshot({})
// Verify:
//   - 提交成功
//   - 新评估记录结果为 failed

// TC-6.1-003: 不填评语直接提交
// Steps:
//   1. browser_click({ element: "OA 作答 Tab" })
//   2. 评语留空
//   3. browser_click({ element: "通过按钮" })
//   4. browser_snapshot({})
// Verify:
//   - 评估提交成功（评语为选填）

// TC-6.1-004: 评估表单位置与分隔
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/admin/candidates/<id>" })
//   2. browser_click({ element: "OA 作答 Tab" })
//   3. 滚动到底部
//   4. browser_snapshot({})
// Verify:
//   - 评估区位于题目列表下方
//   - 顶部有浅灰色水平分隔线
//   - 标题"面试评估"（加粗）
//   - 评语文本框 3 行高
//   - "通过"绿色按钮、"拒绝"红色按钮并排

// TC-6.1-009: 提交失败时保留输入
// Steps:
//   1. browser_type({ element: "评语输入框", text: "测试评语内容" })
//   2. 模拟网络断开（或使用无效请求）
//   3. browser_click({ element: "通过按钮" })
//   4. browser_snapshot({})
// Verify:
//   - 弹出错误提示
//   - 评语输入框保留已填内容

// TC-6.1-010: 防止重复提交
// Steps:
//   1. browser_type({ element: "评语输入框", text: "评语" })
//   2. browser_click({ element: "通过按钮" })
//   3. browser_snapshot({}) — 立即截图
// Verify:
//   - 按钮处于 loading 态

// TC-6.1-005: 同一面试官多次评估不覆盖
// Steps:
//   1. 提交一次"通过"评估
//   2. browser_click({ element: "评估 Tab" }) — 确认记录存在
//   3. browser_click({ element: "OA 作答 Tab" })
//   4. browser_type({ element: "评语输入框", text: "补充评语" })
//   5. browser_click({ element: "拒绝按钮" })
//   6. browser_click({ element: "评估 Tab" })
//   7. browser_snapshot({})
// Verify:
//   - 评估历史中保留两条记录
//   - 前一条不被覆盖

// TC-6.1-006: 评估不自动推进状态
// Steps:
//   1. 提交 passed 评估
//   2. browser_snapshot({}) — 查看顶部状态标签
// Verify:
//   - 候选人状态未自动变更
//   - 协调员需手动通过"变更状态"推进

// TC-6.1-007: OA 未提交时评估表单不出现
// Steps:
//   1. 进入未提交 OA 的候选人详情页
//   2. browser_click({ element: "OA 作答 Tab" })
//   3. browser_snapshot({})
// Verify:
//   - 显示"暂无 OA 提交"
//   - 评估表单不出现

// TC-6.1-008: 非关联面试官无评估入口
// Steps:
//   1. 以面试官身份登录（候选人岗位未与该面试官绑定）
//   2. browser_navigate({ url: "http://localhost:5173/admin/candidates/<non_linked_id>" })
//   3. browser_snapshot({})
// Verify:
//   - 评估按钮隐藏或置灰

export {};
