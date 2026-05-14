/**
 * E2E Test: 候选人档案查看与编辑 / 简历管理 / 状态推进 / 历史
 * PRD: 3.候选人管理模块/2-5
 * Test Cases: TC-3.2-001 ~ TC-3.2-011, TC-3.3-001 ~ TC-3.3-011,
 *             TC-3.4-001 ~ TC-3.4-011, TC-3.5-001 ~ TC-3.5-008
 *
 * Execute with Playwright MCP tools.
 * Precondition: dev server running, logged in as coordinator, candidate exists
 */

// ===== 3.2 候选人档案查看与编辑 =====

// TC-3.2-001: 查看候选人档案详情
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/admin/candidates/<id>" })
//   2. browser_snapshot({})
// Verify:
//   - 顶部卡片展示：圆形头像（姓名首字母蓝色底）、姓名 + 状态标签
//   - 描述列表显示：岗位、性别、一次性登录码（等宽字体）、邮箱、手机号（完整）、OA 截止时间
//   - 右上角有"编辑信息"和"变更状态"按钮

// TC-3.2-002: 编辑候选人信息 — 修改姓名和联系方式
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/admin/candidates/<id>" })
//   2. browser_click({ element: "编辑信息按钮" })
//   3. browser_type({ element: "姓名输入框", text: "修改后姓名", clear: true })
//   4. browser_type({ element: "邮箱输入框", text: "new@test.com", clear: true })
//   5. browser_click({ element: "确认按钮" })
//   6. browser_snapshot({})
// Verify:
//   - 弹窗关闭
//   - 顶部卡片刷新显示新值

// TC-3.2-003: 编辑候选人信息 — 修改性别
// Steps:
//   1. browser_click({ element: "编辑信息按钮" })
//   2. 修改性别选择
//   3. browser_click({ element: "确认按钮" })
//   4. browser_snapshot({})
// Verify:
//   - 保存成功，性别字段更新

// TC-3.2-004: 编辑候选人信息 — 修改简历正文
// Steps:
//   1. browser_click({ element: "编辑信息按钮" })
//   2. browser_type({ element: "简历正文文本框", text: "# 更新后的简历内容", clear: true })
//   3. browser_click({ element: "确认按钮" })
//   4. browser_click({ element: "简历 Tab" })
//   5. browser_snapshot({})
// Verify:
//   - 简历 Tab 中显示更新后的内容

// TC-3.2-005: 登录码不可编辑
// Steps:
//   1. browser_click({ element: "编辑信息按钮" })
//   2. browser_snapshot({})
// Verify:
//   - 登录码字段不在编辑弹窗中，或为只读

// TC-3.2-006: OA 截止时间不可手动编辑
// Steps:
//   1. browser_click({ element: "编辑信息按钮" })
//   2. browser_snapshot({})
// Verify:
//   - OA 截止时间不在编辑弹窗中

// TC-3.2-007: 筛简人仅可查看不可编辑
// Steps:
//   1. 以筛简人身份登录
//   2. browser_navigate({ url: "http://localhost:5173/admin/candidates/<id>" })
//   3. browser_snapshot({})
// Verify:
//   - "编辑信息"按钮不可见或禁用

// TC-3.2-008: OA 截止时间 — 未发放 OA 时显示
// Steps:
//   1. 进入未发放 OA 的候选人详情页
//   2. browser_snapshot({})
// Verify:
//   - OA 截止时间显示 "-"

// TC-3.2-009: 编辑弹窗必填字段校验
// Steps:
//   1. browser_click({ element: "编辑信息按钮" })
//   2. 清空姓名，点击"确认"
//   3. browser_snapshot({})
// Verify:
//   - 校验失败，提示必填字段不能为空

// TC-3.2-010: 编辑弹窗取消不保存
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/admin/candidates/<id>" })
//   2. browser_click({ element: "编辑信息按钮" })
//   3. browser_type({ element: "姓名输入框", text: "临时修改", clear: true })
//   4. browser_click({ element: "取消按钮" })
//   5. browser_snapshot({})
// Verify:
//   - 弹窗关闭，信息未变

// TC-3.2-011: 保存失败时的错误处理
// Steps:
//   1. browser_click({ element: "编辑信息按钮" })
//   2. browser_type({ element: "邮箱输入框", text: "invalid-email", clear: true })
//   3. browser_click({ element: "确认按钮" })
//   4. browser_snapshot({})
// Verify:
//   - 弹出错误提示
//   - 弹窗保留输入内容不关闭

// ===== 3.3 简历管理 =====

// TC-3.3-001: 上传简历 — 成功创建候选人档案
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/admin/candidates" })
//   2. browser_click({ element: "上传简历按钮" })
//   3. 在上传面板中选择岗位
//   4. 选择本地 PDF 文件
//   5. browser_click({ element: "上传按钮" })
//   6. browser_snapshot({})
// Verify:
//   - 上传成功，面板关闭
//   - 列表刷新，新候选人出现
//   - 候选人状态为 new

// TC-3.3-002: 上传简历 — DOCX 格式
// Steps:
//   1. browser_click({ element: "上传简历按钮" })
//   2. 选择岗位，选择 DOCX 文件
//   3. browser_click({ element: "上传按钮" })
//   4. browser_snapshot({})
// Verify:
//   - 上传成功，候选人档案创建成功

// TC-3.3-003: 查看简历正文
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/admin/candidates/<id>" })
//   2. browser_click({ element: "简历 Tab" })
//   3. browser_snapshot({})
// Verify:
//   - 浅灰色底阅读卡片
//   - Markdown 内容已渲染（标题、粗体、列表等）

// TC-3.3-008: 暂无简历的空状态
// Steps:
//   1. 进入无简历的候选人详情页
//   2. browser_click({ element: "简历 Tab" })
//   3. browser_snapshot({})
// Verify:
//   - 显示"暂未上传简历"

// TC-3.3-010: 详情页无"重新上传"入口
// Steps:
//   1. 进入有简历的候选人详情页
//   2. browser_click({ element: "简历 Tab" })
//   3. browser_snapshot({})
// Verify:
//   - 不存在"重新上传"按钮

// TC-3.3-004: 下载简历原件
// Steps:
//   1. 进入有简历的候选人详情页
//   2. browser_click({ element: "简历 Tab" })
//   3. browser_click({ element: "下载原件按钮" })
//   4. browser_snapshot({})
// Verify:
//   - 浏览器触发文件下载

// TC-3.3-005: 一次性登录码自动生成
// Steps:
//   1. 上传简历成功创建候选人
//   2. 进入该候选人详情页
//   3. browser_snapshot({})
// Verify:
//   - 一次性登录码已自动生成（8 位字母数字）

// TC-3.3-006: 简历解析失败
// Steps:
//   1. browser_click({ element: "上传简历按钮" })
//   2. 选择岗位，上传内容极少的文件
//   3. browser_snapshot({})
// Verify:
//   - 提示解析失败或部分字段为空
//   - 允许后续通过编辑信息补齐

// TC-3.3-007: 上传未选择岗位
// Steps:
//   1. browser_click({ element: "上传简历按钮" })
//   2. 不选择岗位，直接上传文件
//   3. browser_snapshot({})
// Verify:
//   - 提示必须选择岗位

// TC-3.3-009: 筛简人无上传权限
// Steps:
//   1. 以筛简人身份登录
//   2. browser_navigate({ url: "http://localhost:5173/admin/candidates" })
//   3. browser_snapshot({})
// Verify:
//   - "上传简历"按钮不可见或禁用

// TC-3.3-011: 上传不支持的文件格式
// Steps:
//   1. browser_click({ element: "上传简历按钮" })
//   2. 选择岗位，尝试上传 .txt 文件
//   3. browser_snapshot({})
// Verify:
//   - 文件选择器限制为 PDF/DOCX
//   - 或上传被拒绝

// ===== 3.4 筛简决策与状态推进 =====

// TC-3.4-001: 筛简人通过候选人
// Steps:
//   1. 以筛简人身份登录
//   2. 进入 new 状态候选人详情页
//   3. browser_click({ element: "变更状态按钮" })
//   4. browser_click({ element: "状态级联选择器 (.ant-cascader-picker)" })
//   5. browser_click({ element: "一级组 OA 阶段 (.ant-cascader-menu:nth-child(1) .ant-cascader-menu-item with text 'OA 阶段')" })
//   6. browser_click({ element: "二级子状态 waiting_for_oa (.ant-cascader-menu:nth-child(2) .ant-cascader-menu-item)" })
//   7. browser_type({ element: "备注输入框", text: "简历质量好" })
//   8. browser_click({ element: "确认按钮" })
//   9. browser_snapshot({})
// Verify:
//   - 状态推进成功 (API POST /api/candidates/:id/status body { toStatus: "waiting_for_oa", note: "..." })
//   - 顶部状态标签更新
//   - 请求体 toStatus 为精确子状态枚举，不是组标签

// TC-3.4-002: 筛简人拒绝候选人
// Steps:
//   1. 以筛简人身份登录
//   2. 进入 new 状态候选人详情页
//   3. browser_click({ element: "变更状态按钮" })
//   4. browser_click({ element: "状态级联选择器 (.ant-cascader-picker)" })
//   5. browser_click({ element: "一级组 未通过 (.ant-cascader-menu:nth-child(1) 文本 '未通过')" })
//   6. browser_click({ element: "二级子状态 rejected (.ant-cascader-menu:nth-child(2) 文本对应 status.rejected i18n)" })
//   7. browser_type({ element: "备注输入框", text: "经验不足" })
//   8. browser_click({ element: "确认按钮" })
//   9. browser_snapshot({})
// Verify:
//   - 状态推进为 rejected
//   - API 请求体 toStatus === "rejected"（精确子状态枚举，不是组标签 "failed" 或 "未通过"）

// TC-3.4-003: 协调员手动推进状态
// Steps:
//   1. 以协调员身份登录
//   2. 进入非终态候选人详情页
//   3. browser_click({ element: "变更状态按钮" })
//   4. browser_click({ element: "状态级联选择器 (.ant-cascader-picker)" })
//   5. browser_click({ element: "一级组 (合法目标状态所属组)" })
//   6. browser_click({ element: "二级子状态 (该组下的精确子状态)" })
//   7. browser_type({ element: "备注输入框", text: "协调员推进" })
//   8. browser_click({ element: "确认按钮" })
//   9. browser_snapshot({})
// Verify:
//   - 状态更新成功（candidate.status === 目标子状态）
//   - candidate.updatedAt 向前推进

// TC-3.4-004: 变更状态弹窗默认预选当前状态（级联两段）
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/admin/candidates/<id>" })
//   2. browser_click({ element: "变更状态按钮" })
//   3. browser_snapshot({})  -- 确认级联选择器默认显示 [组标签, 子状态标签]
//   4. browser_click({ element: "级联选择器 .ant-cascader-picker" })  -- 展开浮层
//   5. browser_snapshot({})
// Verify:
//   - .ant-cascader-picker-label 文本按顺序包含 [组标签, 子状态 i18n 标签]
//   - 第 1 层 .ant-cascader-menu-item-active 指向当前状态所属组
//   - 第 2 层 .ant-cascader-menu-item-active 指向当前精确子状态
//   - 不得出现平铺单下拉 .ant-select-selection-item 直接渲染子状态枚举

// TC-3.4-007: 变更状态弹窗取消
// Steps:
//   1. browser_click({ element: "变更状态按钮" })
//   2. browser_click({ element: "级联选择器 .ant-cascader-picker" })
//   3. browser_click({ element: "一级组项" })
//   4. browser_click({ element: "二级子状态项" })
//   5. browser_type({ element: "备注输入框", text: "any" })
//   6. browser_click({ element: "取消按钮 .ant-modal-footer .ant-btn:not(.ant-btn-primary)" })
//   7. browser_snapshot({})
// Verify:
//   - 弹窗关闭 (.ant-modal-content 从 DOM 移除)
//   - 未发起 POST /api/candidates/:id/status
//   - 顶部 .ant-card .ant-tag 文本不变

// TC-3.4-005: 终态不可变更
// Steps:
//   1. 进入终态候选人（如 rejected）详情页
//   2. browser_click({ element: "变更状态按钮" })
//   3. 选择另一个状态
//   4. browser_click({ element: "确认按钮" })
//   5. browser_snapshot({})
// Verify:
//   - 后端拒绝
//   - 弹出错误提示

// TC-3.4-006: 非法状态跳转
// Steps:
//   1. 进入 rejected 状态候选人详情页
//   2. browser_click({ element: "变更状态按钮" })
//   3. 尝试选择 new
//   4. browser_click({ element: "确认按钮" })
//   5. browser_snapshot({})
// Verify:
//   - 系统返回错误

// TC-3.4-008: 备注为选填
// Steps:
//   1. 进入非终态候选人详情页
//   2. browser_click({ element: "变更状态按钮" })
//   3. 选择目标状态，不填写备注
//   4. browser_click({ element: "确认按钮" })
//   5. browser_snapshot({})
// Verify:
//   - 状态变更成功

// TC-3.4-009: 推进到 waiting_for_oa 不自动发放 OA
// Steps:
//   1. 将 new 状态候选人变更为 waiting_for_oa
//   2. browser_snapshot({})
// Verify:
//   - 状态变为 waiting_for_oa
//   - OA 截止时间仍为 "-"

// TC-3.4-010: 筛简人仅能对 new 状态操作
// Steps:
//   1. 以筛简人身份登录
//   2. 进入 waiting_for_oa 状态候选人详情页
//   3. browser_snapshot({})
// Verify:
//   - 变更状态入口受限

// TC-3.4-011: 保存失败的错误处理
// Steps:
//   1. 在变更状态弹窗中选择目标状态
//   2. 因网络或后端错误导致保存失败
//   3. browser_snapshot({})
// Verify:
//   - 弹出错误提示
//   - 弹窗保留输入内容

// ===== 3.5 状态变更历史 =====

// TC-3.5-001: 查看状态变更历史时间线
// Steps:
//   1. 进入有多次变更的候选人详情页
//   2. browser_click({ element: "历史 Tab" })
//   3. browser_snapshot({})
// Verify:
//   - 以垂直时间线展示，最新记录在上
//   - 每条记录包含：状态标签、变更时间、责任人姓名 + 角色标签、备注

// TC-3.5-002: 新候选人有初始记录
// Steps:
//   1. 进入刚创建的候选人详情页
//   2. browser_click({ element: "历史 Tab" })
//   3. browser_snapshot({})
// Verify:
//   - 至少有一条"创建 → new"的初始记录

// TC-3.5-003: 状态变更后历史实时刷新
// Steps:
//   1. browser_click({ element: "历史 Tab" })
//   2. browser_snapshot({}) — 记录当前记录数
//   3. browser_click({ element: "变更状态按钮" })
//   4. 选择合法目标状态，确认
//   5. browser_click({ element: "历史 Tab" })
//   6. browser_snapshot({})
// Verify:
//   - 新记录出现在时间线顶部

// TC-3.5-005: 历史记录只读
// Steps:
//   1. browser_click({ element: "历史 Tab" })
//   2. browser_snapshot({})
// Verify:
//   - 不存在"删除"或"修改"按钮

// TC-3.5-006: 备注展示
// Steps:
//   1. browser_click({ element: "历史 Tab" })
//   2. browser_snapshot({})
// Verify:
//   - 有备注的记录显示灰色字体
//   - 无备注的记录省略备注行

// TC-3.5-007: 角色标签颜色一致性
// Steps:
//   1. browser_click({ element: "历史 Tab" })
//   2. browser_snapshot({})
// Verify:
//   - 角色标签使用一致的 RoleTag 配色

// TC-3.5-004: 系统自动变更记录
// Steps:
//   1. 进入 OA 超时被系统自动关闭的候选人详情页
//   2. browser_click({ element: "历史 Tab" })
//   3. browser_snapshot({})
// Verify:
//   - 有一条系统触发的变更记录
//   - 责任人位置显示"系统"或留空

// TC-3.5-008: 空状态
// Steps:
//   1. 查看无变更记录的候选人历史 Tab
//   2. browser_snapshot({})
// Verify:
//   - 显示"暂无历史记录"

export {};
