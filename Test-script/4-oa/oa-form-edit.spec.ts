/**
 * E2E Test: 岗位 OA 题库维护
 * PRD: 4.在线测评模块/1.岗位OA题库维护
 * Test Cases: TC-4.1-001 ~ TC-4.1-012
 *
 * Execute with Playwright MCP tools.
 * Precondition: dev server running, logged in as coordinator
 */

// TC-4.1-001: 新建 OA 题库 — 配置作答时长、说明和题目
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/admin/positions" })
//   2. browser_click({ element: "未配置OA岗位的配置入口" })
//   3. browser_type({ element: "作答时长输入框", text: "60" })
//   4. browser_type({ element: "中文作答说明", text: "请认真作答" })
//   5. browser_type({ element: "英文作答说明", text: "Please answer carefully" })
//   6. browser_click({ element: "新增题目按钮" })
//   7. browser_type({ element: "题干输入框", text: "请介绍你的项目经验" })
//   8. 选择"文本"类型
//   9. browser_click({ element: "新增题目按钮" })
//   10. browser_type({ element: "第二题题干", text: "写一个排序函数" })
//   11. 选择"代码"类型
//   12. browser_click({ element: "保存按钮" })
//   13. browser_snapshot({})
// Verify:
//   - 保存成功，返回岗位管理页
//   - 该岗位的 OA 题库列显示"已配置"（绿色）

// TC-4.1-002: 编辑已有 OA 题库
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/admin/positions" })
//   2. browser_click({ element: "已配置OA岗位的编辑入口" })
//   3. browser_snapshot({}) — 确认预填所有现值
//   4. browser_type({ element: "作答时长输入框", text: "90", clear: true })
//   5. 修改某题的题干
//   6. browser_click({ element: "保存按钮" })
//   7. browser_snapshot({})
// Verify:
//   - 保存成功，修改内容已更新

// TC-4.1-003: 调整题目顺序
// Steps:
//   1. 进入已有 3+ 题目的题库编辑页
//   2. browser_click({ element: "第3题的上移按钮" })
//   3. browser_snapshot({})
// Verify:
//   - 第3题移至第2位
//   - 题目顺序按操作结果重排

// TC-4.1-004: 删除题目
// Steps:
//   1. 进入题库编辑页
//   2. browser_snapshot({}) — 记录题目数
//   3. browser_click({ element: "某题卡片的删除按钮" })
//   4. browser_click({ element: "保存按钮" })
//   5. browser_snapshot({})
// Verify:
//   - 该题从列表中移除
//   - 保存成功

// TC-4.1-005: 删除 OA 题库
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/admin/positions" })
//   2. browser_click({ element: "已配置OA岗位的删除入口" })
//   3. browser_click({ element: "确认按钮" })
//   4. browser_snapshot({})
// Verify:
//   - 该岗位的 OA 题库列变为"未配置"（黄色）

// TC-4.1-006: 作答时长边界值
// Steps:
//   1. 进入题库编辑页
//   2. browser_type({ element: "作答时长输入框", text: "1", clear: true })
//   3. browser_click({ element: "保存按钮" }) — 保存成功
//   4. browser_type({ element: "作答时长输入框", text: "0", clear: true })
//   5. browser_click({ element: "保存按钮" })
//   6. browser_snapshot({})
// Verify:
//   - 作答时长 1 保存成功
//   - 作答时长 0 校验失败

// TC-4.1-007: 中英文说明留空
// Steps:
//   1. 进入题库编辑页
//   2. 中文说明和英文说明均留空
//   3. 添加题目并保存
//   4. browser_snapshot({})
// Verify:
//   - 保存成功（说明为选填）

// TC-4.1-008: 新建时默认作答时长 60 分钟
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/admin/positions" })
//   2. browser_click({ element: "未配置OA岗位的配置入口" })
//   3. browser_snapshot({})
// Verify:
//   - 作答时长默认值为 60

// TC-4.1-009: 已发放 OA 后编辑题库对已有答卷的影响
// Steps:
//   1. 确认有候选人已基于该题库提交 OA
//   2. 编辑题库，修改题目
//   3. browser_click({ element: "保存按钮" })
//   4. 查看已提交候选人的 OA 作答 Tab
//   5. browser_snapshot({})
// Verify:
//   - 已提交答卷不受题库修改影响

// TC-4.1-010: 题干为空校验
// Steps:
//   1. 进入题库编辑页
//   2. browser_click({ element: "新增题目按钮" })
//   3. 题干留空
//   4. browser_click({ element: "保存按钮" })
//   5. browser_snapshot({})
// Verify:
//   - 校验失败，提示题干不能为空

// TC-4.1-011: 取消编辑不保存
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/admin/positions" })
//   2. browser_click({ element: "某岗位的 OA 题库编辑入口" })
//   3. 修改作答时长
//   4. browser_click({ element: "取消按钮" })
//   5. browser_snapshot({}) — 确认返回岗位管理页
// Verify:
//   - 返回岗位管理页
//   - 题库内容未变

// TC-4.1-012: 仅协调员可维护题库
// Steps:
//   1. 以面试官身份登录
//   2. browser_navigate({ url: "http://localhost:5173/admin/positions" })
//   3. browser_snapshot({})
// Verify:
//   - 面试官无法看到或使用题库编辑/配置入口

// TC-4.1-013a 多角色权限边界 — screener 访问 OA 题库 API 返回 403
// PRD: 4.在线测评模块/1.岗位OA题库维护 §5 (仅协调员可维护 OA 题库)
// Backend gate: code/server/src/routes/oaForm.ts
//   → oaFormRouter.use(requireAuth, requireRole('coordinator', 'interviewer'))
//   screener/candidate must be rejected at the middleware layer.
// Preconditions:
//   - screener account exists (create via coordinator POST /users if absent)
//   - positionId = 1 (from docs/TDD/0.common/test-account.md)
// Steps:
//   1. Shell: curl -c screener_cookie -X POST
//        http://localhost:3000/auth/login
//        -H "Content-Type: application/json"
//        -d '{"username":"screener1","password":"<seeded-password>"}'
//   2. browser_navigate({ url: "http://localhost:5173/admin/positions" })
//      browser_snapshot({})
//      — 预期 OA 题库列没有 "配置"/"编辑" 按钮
//   3. Shell: curl -b screener_cookie -i
//        http://localhost:3000/positions/1/oa-form
//      — 预期 HTTP/1.1 403 Forbidden
//   4. Shell: curl -b screener_cookie -i -X PUT
//        http://localhost:3000/positions/1/oa-form
//        -H "Content-Type: application/json"
//        -d '{"form":{"timeLimitMinutes":60,
//              "questions":[{"answerType":"text","content":"test"}]}}'
//      — 预期 403 Forbidden
//   5. Shell: (以 coordinator 身份) curl -b admin_cookie
//        http://localhost:3000/positions/1/oa-form
//      — 预期 form 未被改动
// Verify (ALL required):
//   - GET /positions/1/oa-form with screener cookie → status 403
//   - PUT /positions/1/oa-form with screener cookie → status 403
//   - DB OaForm rows for positionId=1 unchanged pre/post
//   - /admin/positions UI: no "配置"/"编辑" button in OA form column
//   - Console: page.errors.length === 0
// Forbidden states (any → FAIL):
//   - GET returns 200 with empty array/object (backend uncovered; frontend-only hiding)
//   - GET/PUT returns 404 instead of 403 (exposes existence via error code)
//   - PUT causes any OaForm row mutation

// TC-4.1-013b 多角色权限边界 — candidate 访问 OA 题库 API 返回 403
// PRD: 4.在线测评模块/1.岗位OA题库维护 §5 + 7.候选人门户模块 访问控制
// Preconditions:
//   - Seed candidate exists with valid oneTimeCode + phoneLast4
//   - positionId = 1
// Steps:
//   1. Shell: curl -c cand_cookie -X POST
//        http://localhost:3000/auth/candidate-login
//        -H "Content-Type: application/json"
//        -d '{"code":"<oneTimeCode>","phoneLast4":"<last4>"}'
//   2. browser_navigate({ url: "http://localhost:5173/admin/positions" })
//      browser_snapshot({})
//      — 预期 URL 跳转到 /candidate-login 或 /candidate/* 路径
//   3. Shell: curl -b cand_cookie -i
//        http://localhost:3000/positions/1/oa-form
//      — 预期 403 Forbidden (or 401 Unauthorized)
//   4. Shell: curl -b cand_cookie -i -X PUT
//        http://localhost:3000/positions/1/oa-form
//        -H "Content-Type: application/json"
//        -d '{"form":{"timeLimitMinutes":60,
//              "questions":[{"answerType":"text","content":"test"}]}}'
//      — 预期 403/401
// Verify (ALL required):
//   - URL after step 2 is NOT /admin/positions (guard redirected)
//   - /admin sidebar (.ant-layout-sider) not rendered
//   - GET /positions/1/oa-form with candidate cookie → 401 or 403
//   - PUT /positions/1/oa-form with candidate cookie → 401 or 403
//   - DB OaForm rows for positionId=1 unchanged
//   - Console: page.errors.length === 0
// Forbidden states (any → FAIL):
//   - Any internal admin API returns 200 under a candidate cookie
//     (identity isolation broken — severe FAIL)
//   - /admin/positions fully renders for candidate
//   - Response code is 404 (leaks resource existence) instead of 401/403

export {};
