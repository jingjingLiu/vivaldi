/**
 * E2E Test: 门户侧 OA 入口 + 候选人 OA 作答
 * PRD: 7.候选人门户模块/2.门户侧OA入口 + 4.在线测评模块/3.候选人OA作答
 * Test Cases: TC-7.2-001 ~ TC-7.2-006, TC-4.3-001 ~ TC-4.3-015
 *
 * Execute with Playwright MCP tools.
 * Precondition: dev server running, candidate account available
 */

// ===== 7.2 门户侧 OA 入口 =====

// TC-7.2-001: 登录后默认进入 OA 页
// Steps:
//   1. 以候选人身份登录
//   2. browser_snapshot({})
// Verify:
//   - 当前 URL 为 /candidate/oa

// TC-7.2-002: OA 页使用门户外壳
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/candidate/oa" })
//   2. browser_snapshot({})
// Verify:
//   - 深色顶栏 + 白字
//   - 主体居中，最大宽度 800px
//   - 无返回按钮、无侧边导航

// TC-7.2-004: OA 页按阶段正确渲染
// Steps:
//   1. 以 unavailable 阶段候选人访问 → 显示"尚未收到测评任务"
//   2. 以 not_started 阶段候选人访问 → 显示作答说明 + 开始按钮
//   3. 以 submitted 阶段候选人访问 → 显示"您已提交"
//   4. browser_snapshot({})

// TC-7.2-005: 无导航入口避免分心
// Steps:
//   1. browser_navigate({ url: "http://localhost:5173/candidate/oa" })
//   2. browser_snapshot({})
// Verify:
//   - 无跳转到状态页或面试时段页的入口

// TC-7.2-006: 未登录访问被拦截
// Steps:
//   1. 清除 cookies
//   2. browser_navigate({ url: "http://localhost:5173/candidate/oa" })
//   3. browser_snapshot({})
// Verify:
//   - 跳转至 /candidate-login

// TC-7.2-003: 通知中的深链直达
// Steps:
//   1. 候选人收到 OA 发放通知
//   2. 点击通知中的门户链接
//   3. 登录后观察
//   4. browser_snapshot({})
// Verify:
//   - 登录后直达 /candidate/oa
// Note: 需要在通知日志中获取链接地址

// ===== 4.3 候选人 OA 作答 =====

// TC-4.3-001: OA 未发放时的页面展示
// Steps:
//   1. 以 OA 阶段为 unavailable 的候选人登录
//   2. browser_navigate({ url: "http://localhost:5173/candidate/oa" })
//   3. browser_snapshot({})
// Verify:
//   - 显示警告结果页："尚未收到测评任务"

// TC-4.3-002: 查看作答说明并开始作答
// Steps:
//   1. 以 OA 阶段为 not_started 的候选人登录
//   2. browser_navigate({ url: "http://localhost:5173/candidate/oa" })
//   3. browser_snapshot({}) — 查看作答说明和剩余作答时长
//   4. browser_click({ element: "开始作答按钮" })
//   5. browser_snapshot({})
// Verify:
//   - 阶段切换为 in_progress
//   - 进入作答界面
//   - 倒计时开始

// TC-4.3-003: 逐题作答与自动保存
// Steps:
//   1. 以 in_progress 阶段候选人进入 OA 页
//   2. browser_type({ element: "答题输入框", text: "我的答案" })
//   3. 等待约 1 秒
//   4. browser_snapshot({}) — 查看保存状态
//   5. browser_click({ element: "下一题按钮" })
//   6. browser_click({ element: "上一题按钮" })
//   7. browser_snapshot({})
// Verify:
//   - 输入时显示"保存中…"
//   - 约 1 秒后显示"已自动保存"
//   - 切换题目后之前的答案保留

// TC-4.3-004: 手动提交 OA
// Steps:
//   1. 在最后一题输入答案
//   2. browser_click({ element: "提交按钮" })
//   3. browser_snapshot({}) — 二次确认框
//   4. browser_click({ element: "确认按钮" })
//   5. browser_snapshot({})
// Verify:
//   - 页面切换为已提交结果页："您已提交"

// TC-4.3-005: 已过期 OA 的页面展示
// Steps:
//   1. 以 OA 阶段为 expired 的候选人登录
//   2. browser_navigate({ url: "http://localhost:5173/candidate/oa" })
//   3. browser_snapshot({})
// Verify:
//   - 显示错误结果页："测评已过期"

// TC-4.3-006: 已提交 OA 的页面展示
// Steps:
//   1. 以 OA 阶段为 submitted 的候选人登录
//   2. browser_navigate({ url: "http://localhost:5173/candidate/oa" })
//   3. browser_snapshot({})
// Verify:
//   - 显示成功结果页："您已提交"

// TC-4.3-007: 倒计时颜色变化
// Steps:
//   1. 以 in_progress 阶段候选人进入 OA 页
//   2. browser_snapshot({}) — 观察倒计时 Tag 颜色
// Verify:
//   - > 10 min: 绿色
//   - 5-10 min: 橙色
//   - < 5 min: 红色

// TC-4.3-009: 文本题与代码题的视觉区分
// Steps:
//   1. 作答中查看文本题和代码题
//   2. browser_snapshot({})
// Verify:
//   - 文本题: 普通多行文本框
//   - 代码题: 深色背景 (#1e1e1e) + 等宽字体

// TC-4.3-011: 提交确认取消
// Steps:
//   1. 在最后一题点击"提交"
//   2. browser_snapshot({}) — 确认弹出二次确认框
//   3. browser_click({ element: "取消按钮" })
//   4. browser_snapshot({})
// Verify:
//   - 返回作答界面，继续倒计时

// TC-4.3-012: 第一题"上一题"按钮置灰
// Steps:
//   1. 在第一题查看底部导航栏
//   2. browser_snapshot({})
// Verify:
//   - "上一题"按钮置灰/禁用

// TC-4.3-014: 题目序号和总数显示
// Steps:
//   1. 作答中查看顶栏左侧
//   2. browser_snapshot({})
// Verify:
//   - 显示 "第 N 题 / 共 M 题"

// TC-4.3-015: 中英文切换作答说明
// Steps:
//   1. 在 not_started 阶段查看作答说明
//   2. 切换门户语言
//   3. browser_snapshot({})
// Verify:
//   - 按语言渲染对应说明

// TC-4.3-008: 倒计时耗尽自动提交
// Steps:
//   1. 以 in_progress 阶段候选人进入 OA 页（倒计时即将归零）
//   2. 等待倒计时归零
//   3. browser_snapshot({})
// Verify:
//   - 系统自动提交当前所有已保存内容
//   - 页面切换到已提交结果页
// Note: 需要 OA 配置较短作答时长以便测试

// TC-4.3-010: 刷新页面后恢复作答
// Steps:
//   1. 在 OA 作答中输入部分答案
//   2. 刷新浏览器页面
//   3. browser_snapshot({})
// Verify:
//   - 页面恢复作答状态
//   - 倒计时按后端剩余时间继续
//   - 已保存的答案不丢失

// TC-4.3-013: 提交不可回退
// Steps:
//   1. OA 已提交后
//   2. browser_navigate({ url: "http://localhost:5173/candidate/oa" })
//   3. browser_snapshot({})
// Verify:
//   - 显示已提交结果页
//   - 不提供重做能力

export {};
