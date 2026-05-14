/**
 * E2E Test: 候选人列表与检索
 * PRD: 3.候选人管理模块/1.候选人列表与检索
 * Test Cases: TC-3.1-001 ~ TC-3.1-012
 *
 * Execute with Playwright MCP tools.
 * Precondition: dev server running, logged in as coordinator
 */

// TC-3.1-001: 默认加载候选人列表
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/admin/candidates" })
//   2. browser_snapshot({})
// Verify:
//   - 列表按更新时间倒序显示
//   - 显示姓名（加粗）、岗位、状态标签、邮箱、手机号（打码）、最近更新
//   - 底部分页器显示"共 N 条"

// TC-3.1-002: 按姓名搜索
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/admin/candidates" })
//   2. browser_type({ element: "搜索框", text: "<候选人姓名关键字>" })
//   3. browser_click({ element: "搜索按钮" })
//   4. browser_snapshot({})
// Verify:
//   - 列表仅显示姓名匹配的候选人

// TC-3.1-003: 按状态组 Tab 快筛
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/admin/candidates" })
//   2. browser_snapshot({}) — 确认默认 Tab 为"全部"
//   3. browser_click({ element: "OA 阶段 Tab" })
//   4. browser_snapshot({})
// Verify:
//   - 列表仅显示 OA 阶段的候选人

// TC-3.1-005: 点击行跳转详情
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/admin/candidates" })
//   2. browser_click({ element: "某候选人行" })
//   3. browser_snapshot({})
// Verify:
//   - 跳转至候选人详情页 /admin/candidates/:id

// TC-3.1-006: 状态级联筛选器与 Tab 组合筛选
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/admin/candidates" })
//   2. browser_click({ element: "OA 阶段 Tab" })
//   3. browser_click({ element: "状态级联筛选器 .ant-cascader-picker" })
//   4. browser_click({ element: "一级组 未通过 (.ant-cascader-menu:nth-child(1) 文本 '未通过')" })
//   5. browser_click({ element: "二级子状态 rejected (.ant-cascader-menu:nth-child(2) 文本对应 status.rejected)" })
//   6. browser_snapshot({})
// Verify:
//   - 状态级联优先于 Tab
//   - GET /api/candidates 查询串含 status=rejected 且不含 statusGroup=oa
//   - 所有 .ant-table-row .ant-tag 文本 === i18n status.rejected
//   - .ant-cascader-picker-label 同时显示两段 [未通过, rejected-i18n]
//   - .ant-tabs-tab-active 仍显示 "OA 阶段" 但不参与过滤

// TC-3.1-007: 重置按钮
// Steps:
//   1. 设置搜索关键字和筛选条件
//   2. browser_click({ element: "重置按钮" })
//   3. browser_snapshot({})
// Verify:
//   - 全部筛选条件和 Tab 选中被清空

// TC-3.1-010: 分页 — 切换筛选条件后重置到第一页
// Steps:
//   1. 翻到第 2 页
//   2. 修改搜索关键字
//   3. browser_snapshot({})
// Verify:
//   - 分页自动重置为第 1 页

// TC-3.1-011: 无数据时的空状态
// Steps:
//   1. 输入不存在的姓名搜索
//   2. browser_snapshot({})
// Verify:
//   - 表格显示默认的空状态文案

// TC-3.1-004: 按岗位下拉筛选
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/admin/candidates" })
//   2. browser_click({ element: "岗位下拉" })
//   3. 选择某岗位
//   4. browser_snapshot({})
// Verify:
//   - 仅显示该岗位下的候选人

// TC-3.1-008: 手机号打码显示
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/admin/candidates" })
//   2. browser_snapshot({})
// Verify:
//   - 手机号列中间位打码，如 ****1234
//   - 不显示完整手机号

// TC-3.1-009: 筛简人权限 — 仅可见关联岗位候选人
// Steps:
//   1. 以筛简人身份登录
//   2. browser_navigate({ url: "http://localhost:5173/admin/candidates" })
//   3. browser_snapshot({})
// Verify:
//   - 仅显示其关联岗位的候选人
//   - 不显示其他岗位的候选人

// TC-3.1-012: 岗位列显示岗位名称而非 ID
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/admin/candidates" })
//   2. browser_snapshot({})
// Verify:
//   - 岗位列显示岗位名称，非 ID

export {};
