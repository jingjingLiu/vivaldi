/**
 * E2E Test: 评估历史查询
 * PRD: 6.面试评估模块/2.评估历史查询
 * Test Cases: TC-6.2-001 ~ TC-6.2-007
 *
 * Execute with Playwright MCP tools.
 * Precondition: dev server running, logged in, candidate has evaluation records
 */

// TC-6.2-001: 查看评估历史列表
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/admin/candidates/<id>" })
//   2. browser_click({ element: "评估 Tab" })
//   3. browser_snapshot({})
// Verify:
//   - 按提交时间倒序展示每条评估
//   - 每条显示：面试官姓名、结果 Tag（通过绿色/拒绝红色）、评语、提交时间
//   - 条目间有水平分隔线

// TC-6.2-002: 查看含评语的评估记录
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/admin/candidates/<id>" })
//   2. browser_click({ element: "评估 Tab" })
//   3. browser_snapshot({})
// Verify:
//   - 评语完整显示，不截断
//   - 长评语自动换行

// TC-6.2-003: 查看无评语的评估记录
// Steps:
//   1. browser_click({ element: "评估 Tab" })
//   2. browser_snapshot({})
// Verify:
//   - Comment 行显示 "-"

// TC-6.2-004: 空状态
// Steps:
//   1. 进入无评估记录的候选人详情页
//   2. browser_click({ element: "评估 Tab" })
//   3. browser_snapshot({})
// Verify:
//   - 显示"暂无评估"

// TC-6.2-005: 评估记录只读
// Steps:
//   1. browser_click({ element: "评估 Tab" })
//   2. browser_snapshot({})
// Verify:
//   - 不存在"删除"或"修改"按钮

// TC-6.2-007: 提交时间格式
// Steps:
//   1. browser_click({ element: "评估 Tab" })
//   2. browser_snapshot({})
// Verify:
//   - 时间格式为 yyyy-MM-dd HH:mm

// TC-6.2-006: 面试官可查看其他面试官的评估
// Steps:
//   1. 以面试官 A 登录
//   2. 进入有面试官 B 评估记录的候选人详情页
//   3. browser_click({ element: "评估 Tab" })
//   4. browser_snapshot({})
// Verify:
//   - 可看到面试官 B 的评估记录

export {};
