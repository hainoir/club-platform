# 项目总览

## 一句话概述

`club-platform` 是一个基于 Next.js App Router 和 Supabase 的校园社团运营系统，核心不是页面数量，而是围绕登录态、值班、审批、自习和活动报名形成的一套完整业务流。

## 适合前端面试的项目定位

可以把这个项目讲成：

- 一个有明确服务端/客户端边界的 Next.js 应用。
- 一个把认证、状态同步、复杂表单和业务状态机结合起来的前端项目。
- 一个对数据库契约、权限规则和端到端验证有意识的工程化作品。

## 核心模块

### 1. 路由与鉴权链

- `middleware.ts`：页面请求进入鉴权链路，静态资源直接放行。
- `utils/supabase/middleware.ts`：统一处理会话续期和受保护路由判断。
- `app/layout.tsx`：根布局挂载主题、Toast、StoreHydration 和 AuthProvider。
- `app/(app)/layout.tsx`：受保护业务壳层，服务端先解析用户，再交给客户端路由守卫。
- `components/providers/*`：把服务端首屏结果和客户端长期状态同步起来。

### 2. 登录与用户模型链

- `components/auth/LoginForm.tsx`：登录、注册、密码重置和 members 业务资料对齐。
- `utils/supabase/resolve-app-user.ts`：把 Supabase 认证用户映射成前端真正消费的 `AppUser`。
- `lib/app-user.ts`、`store/useUserStore.ts`：统一角色、姓名和全局登录态形状。

### 3. 首页与仪表盘链

- `app/(app)/page.tsx`：只负责视图布局。
- `lib/services/dashboard-service.ts`：并发聚合排班、请假、签到、成员和当前用户。
- `components/dashboard/DashboardSignInWidget.tsx`：处理时间窗口、节流、会话续命和签到反馈。
- `components/dashboard/StudioOverview.tsx`：自习排行榜和工作室在场概览。

### 4. 值班业务链

- `hooks/useDuty.ts`：值班大厅的统一门面。
- `hooks/duty/*`：拆分排班、签到、请假、代班、钥匙交接子域。
- `lib/duty/*`：时间计算、签到规则、请假过滤、节假日判断等业务工具。
- `database/key_and_leave_schema.sql`、`database/update_swap_status.sql`：数据库层状态流转规则。

### 5. 工作室自习链

- `hooks/studio/useStudioPresenceQuery.ts`：先触发过期清理，再合并 duty 与 self-study 两条来源。
- `database/studio_sessions_schema.sql`：自习会话表与 `expire_studio_sessions` RPC。

## 关键数据流

### 请求与登录态

1. 浏览器请求进入 `middleware.ts`。
2. Supabase SSR 在中间件里完成用户校验与 Cookie 续期。
3. 受保护布局在服务端拿到当前用户。
4. `AppRouteGuard` 与 `AuthProvider` 把用户同步到 Zustand。
5. 后续客户端操作通过 `ensureClientSession` 和 `useProtectedAction` 做写操作前校验。

### 首页与签到

1. `dashboard-service` 在服务端并发读取排班、请假、今日签到和成员信息。
2. 页面只消费聚合结果，不自己拼多次请求。
3. `DashboardSignInWidget` 在客户端处理节流、时段判断、重复签到检查和定位校验。
4. 最终签到事实只认 `duty_logs` 写入结果。

### 请假、代班、补班

1. 请假进入 `duty_leaves`。
2. 与代班绑定的请假通过 `leave_id` 串到 `duty_swaps`。
3. 管理员批准普通请假时走 `approve_duty_leave`。
4. 有代班链路时，最终由代班 RPC 推进到 `approved` 并更新排班事实。
5. `duty_compensations.compensation_date` 记录具体补班日期，而不是只有星期和节次。

### 工作室自习

1. 前端先调用 `expire_studio_sessions` 清理过期会话。
2. 再读取 `duty_logs` 和 `studio_sessions`。
3. 前端把两条业务线合并成统一在场列表，但底层数据仍然分表维护。

## 最值得讲的前端工程点

- 服务端先聚合，客户端只接强交互。
- 登录态不是“登录一次就结束”，而是有续期、回填、重水合和焦点恢复。
- 复杂业务不是堆在页面里，而是按子域拆成 hooks 和 lib。
- 数据库契约直接影响 UI 展示规则，不是前后端各自维护一套状态理解。
- 自习与值班分表建模体现了前端对领域建模的理解，而不是只会做页面。

## 目录阅读顺序

建议按下面顺序读代码：

1. `app/layout.tsx`
2. `app/(app)/layout.tsx`
3. `components/providers/AuthProvider.tsx`
4. `components/providers/AppRouteGuard.tsx`
5. `app/(app)/page.tsx`
6. `lib/services/dashboard-service.ts`
7. `components/dashboard/DashboardSignInWidget.tsx`
8. `hooks/useDuty.ts`
9. `hooks/studio/useStudioPresenceQuery.ts`
10. `database/key_and_leave_schema.sql` 与 `database/update_swap_status.sql`

## 验证方式

- 静态质量：`pnpm run lint`、`pnpm run typecheck`
- 构建验证：`pnpm run build`
- 关键路径验证：`pnpm run e2e:smoke` 与完整 `pnpm run e2e --reporter=line`

## 相关文档

- [架构说明](./architecture.md)
- [值班流程契约](./duty-contract.md)
- [面试讲稿](./interview-briefing.md)
- [Supabase RPC 排查清单](./supabase-rpc-checklist.md)
