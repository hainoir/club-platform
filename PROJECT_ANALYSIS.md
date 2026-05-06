
# Club Platform 项目详细分析文档

## 目录

1. [项目概述](#1-项目概述)
2. [技术栈分析](#2-技术栈分析)
3. [架构设计](#3-架构设计)
4. [核心业务模块](#4-核心业务模块)
5. [数据库架构](#5-数据库架构)
6. [安全机制](#6-安全机制)
7. [开发与部署](#7-开发与部署)
8. [测试体系](#8-测试体系)
9. [代码质量](#9-代码质量)
10. [项目亮点与总结](#10-项目亮点与总结)

---

## 1. 项目概述

### 1.1 项目简介

**项目名称**：Club Platform（社团管理平台）  
**项目定位**：面向校园社团的全周期管理平台  
**主要用途**：值班管理、活动组织、成员管理、钥匙交接等

### 1.2 核心功能

- ✅ 值班签到与排班管理
- ✅ 换班/代班/请假流程
- ✅ 活动发布与报名管理
- ✅ 成员档案与权限管理
- ✅ 钥匙交接流程
- ✅ 自习时长统计
- ✅ 数据可视化与分析

### 1.3 项目文档

项目包含中英文双语文档：
- [README.md](file:///workspace/README.md) - 英文文档
- [README.zh-CN.md](file:///workspace/README.zh-CN.md) - 中文文档

---

## 2. 技术栈分析

### 2.1 核心框架

| 技术 | 版本 | 用途 |
|------|------|------|
| **Next.js** | 15 | 全栈 React 框架，App Router |
| **React** | 19 | 前端 UI 库 |
| **TypeScript** | 最新 | 静态类型系统 |
| **Supabase** | 最新 | BaaS 平台（认证、数据库、存储）|
| **Tailwind CSS** | 3.4+ | 原子化 CSS 框架 |

### 2.2 UI 组件库

| 库名 | 用途 |
|------|------|
| **Radix UI** | 基础组件（Dialog、Dropdown、Select 等）|
| **shadcn/ui** | UI 组件设计系统 |
| **Lucide React** | 图标库 |

### 2.3 数据可视化

| 库名 | 用途 |
|------|------|
| **ECharts** | 强大的数据可视化库 |
| **echarts-for-react** | React 包装器 |

### 2.4 工具库

| 库名 | 用途 |
|------|------|
| **date-fns** | 日期处理库 |
| **zustand** | 轻量级状态管理 |
| **react-day-picker** | 日期选择组件 |
| **react-markdown** | Markdown 渲染 |
| **class-variance-authority** | 类名变体管理 |
| **clsx / tailwind-merge** | 类名组合与合并 |

### 2.5 开发工具

| 工具 | 用途 |
|------|------|
| **Playwright** | E2E 测试框架 |
| **ESLint** | 代码规范检查 |
| **Vercel Analytics** | 网站分析 |
| **Vercel Speed Insights** | 性能监控 |

### 2.6 包管理器

**pnpm** - 高性能 npm 替代方案

---

## 3. 架构设计

### 3.1 目录结构

```
/workspace/
├── app/                           # Next.js App Router
│   ├── (app)/                    # 需认证路由组
│   │   ├── duty/                 # 值班模块
│   │   ├── events/               # 活动模块
│   │   ├── members/              # 成员模块
│   │   └── settings/             # 设置模块
│   ├── api/auth/session/         # API 路由
│   ├── login/                    # 登录页
│   └── reset-password/           # 重置密码页
├── components/                   # React 组件
│   ├── dashboard/                # 仪表盘
│   ├── duty/                     # 值班组件
│   ├── events/                   # 活动组件
│   ├── layout/                   # 布局组件
│   ├── providers/                # 上下文提供者
│   └── ui/                       # UI 组件库
├── database/                     # 数据库迁移
├── hooks/                        # 自定义 Hooks
├── lib/                          # 业务工具
├── store/                        # 状态管理
├── utils/                        # 工具函数
├── tests/                        # 测试
└── 配置文件
```

### 3.2 架构层次

```
┌─────────────────────────────────────────┐
│           UI 表现层 (Client)            │
│  ┌─────────────────────────────────┐  │
│  │  业务组件 (Dashboard, Events)   │  │
│  └──────────────┬──────────────────┘  │
│  ┌──────────────▼──────────────────┐  │
│  │   UI 组件库 (Radix/shadcn/ui)   │  │
│  └─────────────────────────────────┘  │
└───────────────────────────┬─────────────┘
                            │
┌───────────────────────────▼─────────────┐
│         业务逻辑层 (Hooks)              │
│  ┌─────────────────────────────────┐  │
│  │  useDuty / useEvents / useMembers│ │
│  └─────────────────────────────────┘  │
│  ┌─────────────────────────────────┐  │
│  │  业务子 Hook (duty/*)            │  │
│  └─────────────────────────────────┘  │
└───────────────────────────┬─────────────┘
                            │
┌───────────────────────────▼─────────────┐
│         数据层 (Server + Client)         │
│  ┌─────────────────────────────────┐  │
│  │  Server Components (数据聚合)    │  │
│  └─────────────────────────────────┘  │
│  ┌─────────────────────────────────┐  │
│  │  Supabase (Auth / DB / Storage) │  │
│  └─────────────────────────────────┘  │
└───────────────────────────┬─────────────┘
                            │
┌───────────────────────────▼─────────────┐
│         基础设施层                       │
│  - Next.js (App Router / RSC)            │
│  - Tailwind CSS (样式)                   │
│  - Zustand (状态管理)                    │
└─────────────────────────────────────────┘
```

### 3.3 关键架构决策

#### 3.3.1 Server Components 与 Client Components 分离

**Server Components 职责**（[app/(app)/page.tsx](file:///workspace/app/(app)/page.tsx#L65)）：
- 首屏数据聚合
- 数据库直连查询
- 减少客户端瀑布请求

**Client Components 职责**（[DashboardSignInWidget](file:///workspace/components/dashboard/DashboardSignInWidget.tsx#L31)）：
- 处理用户交互
- 浏览器 API 调用（定位等）
- 实时状态更新

#### 3.3.2 业务 Hooks 分层设计

主业务门面 [useDuty](file:///workspace/hooks/useDuty.ts#L27) 组合多个子 Hooks：
- [useDutyRosters](file:///workspace/hooks/duty/useDutyRosters.ts) - 排班管理
- [useDutySignIn](file:///workspace/hooks/duty/useDutySignIn.ts) - 签到逻辑
- [useDutySwaps](file:///workspace/hooks/duty/useDutySwaps.ts) - 换班流程
- [useDutyLeaves](file:///workspace/hooks/duty/useDutyLeaves.ts) - 请假审批
- [useDutyKeyTransfers](file:///workspace/hooks/duty/useDutyKeyTransfers.ts) - 钥匙交接

#### 3.3.3 上下文提供者设计

根布局 [layout.tsx](file:///workspace/app/layout.tsx#L35) 按顺序初始化：
1. `ThemeProvider` - 主题切换
2. `ToastProvider` - 全局通知
3. `StoreHydration` - 状态恢复
4. `AuthProvider` - 登录状态

---

## 4. 核心业务模块

### 4.1 值班签到模块

#### 4.1.1 核心功能

| 功能 | 实现位置 | 特点 |
|------|---------|------|
| 周排班 | [duty_schema.sql](file:///workspace/database/duty_schema.sql#L8) | 周一至周五，4个时段 |
| 签到验证 | [duty-sign-in.ts](file:///workspace/lib/duty-sign-in.ts) | 位置验证 + 设备信息 |
| 换班大厅 | [useDutySwaps](file:///workspace/hooks/duty/useDutySwaps.ts) | 公开招募 + 定向邀请 |
| 请假审批 | [useDutyLeaves](file:///workspace/hooks/duty/useDutyLeaves.ts) | 需管理员审批 |

#### 4.1.2 签到流程

签到有三层验证防线（[DashboardSignInWidget](file:///workspace/components/dashboard/DashboardSignInWidget.tsx#L66)）：

1. **点击节流**：防止重复点击（冷却 30 秒）
2. **重复签到检查**：当天是否已签到
3. **定位与写库**：位置验证 + 数据库写入

### 4.2 活动管理模块

- 活动创建与编辑
- 报名与签到
- 活动通知
- 数据统计

### 4.3 成员管理模块

- 成员档案维护
- 角色权限管理
- 部门年级信息
- 活跃度统计

### 4.4 自习统计模块

- 自习时长记录
- 排行榜（日/周/月/学期）
- 数据可视化

---

## 5. 数据库架构

### 5.1 核心数据表

#### 5.1.1 值班相关表

| 表名 | 用途 |
|------|------|
| `duty_rosters` | 排班池（周排班）|
| `duty_logs` | 签到流水记录 |
| `duty_swaps` | 换班/代班申请 |
| `duty_leaves` | 请假申请 |
| `duty_key_transfers` | 钥匙交接记录 |

#### 5.1.2 活动相关表

| 表名 | 用途 |
|------|------|
| `events` | 活动信息 |
| `event_attendees` | 活动报名 |

#### 5.1.3 成员与统计

| 表名 | 用途 |
|------|------|
| `members` | 成员档案 |
| `studio_sessions` | 自习记录 |

### 5.2 数据库迁移

迁移文件位于 [database/](file:///workspace/database/) 目录。

#### 5.2.1 新环境迁移顺序（[database/README.md](file:///workspace/database/README.md#L14)）

1. `auth_trigger.sql` - 认证触发器
2. `rls_policies.sql` - 安全策略
3. `duty_schema.sql` - 值班模块
4. `key_and_leave_schema.sql` - 钥匙与请假
5. `studio_sessions_schema.sql` - 自习记录
6. `update_swap_status.sql` - 换班 RPC
7. `add_signin_and_rsvp_constraints.sql` - 约束加固
8. `fix_duty_hall_permissions.sql` - 权限兼容

#### 5.2.2 关键数据库约束

- `duty_logs_member_sign_in_date_unique` - 每日唯一签到
- `event_attendees_event_email_unique` - 每人每活动唯一报名
- `duty_swaps_status_check` - 换班状态约束

### 5.3 存储过程（RPC）

| 函数名 | 用途 |
|--------|------|
| `accept_duty_swap` | 接受换班申请 |
| `volunteer_for_duty_swap` | 报名换班 |
| `return_duty_swap_to_hall` | 退回换班大厅 |
| `approve_duty_leave` | 审批请假 |
| `confirm_key_transfer` | 确认钥匙交接 |

---

## 6. 安全机制

### 6.1 认证与授权

#### 6.1.1 Supabase Auth

- 邮箱密码登录
- 密码重置流程
- 会话自动刷新（[middleware.ts](file:///workspace/middleware.ts#L1)）

#### 6.1.2 用户角色

| 角色 | 权限 |
|------|------|
| `admin` | 完全管理权限 |
| `主席` / `执行主席` | 高级管理权限 |
| `副主席` / `部长` | 中级管理权限 |
| `管理员` | 基础管理权限 |
| 普通成员 | 基础操作权限 |

### 6.2 行级安全策略（RLS）

完善的 RLS 策略配置在 [duty_schema.sql](file:///workspace/database/duty_schema.sql#L51) 中：

#### 6.2.1 排班表策略

```sql
-- 所有认证用户可读
-- 自己或管理员可写/删
```

#### 6.2.2 签到表策略

```sql
-- 所有认证用户可读
-- 自己可签到（INSERT）
-- 仅管理员可修改/删除
```

#### 6.2.3 换班表策略

```sql
-- 可见性：已审批、公开申请、相关方、管理员
-- 自己可发起、相关方可响应、管理员可管理
```

#### 6.2.4 请假表策略

```sql
-- 待审批：仅自己和管理员可见
-- 已审批：所有人可见
```

### 6.3 安全加固建议

项目包含详细的安全检查清单（[README.md](file:///workspace/README.md#L65)）：

1. **环境文件保护**：`.env.local` 禁止提交
2. **密钥轮换流程**：泄露后立即轮换
3. **质量门禁**：CI 流程完整执行

---

## 7. 开发与部署

### 7.1 开发环境配置

#### 7.1.1 环境变量

必需配置在 `.env.local`：

```properties
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

#### 7.1.2 开发命令

```bash
pnpm install              # 安装依赖
pnpm run dev             # 启动开发服务器 (http://localhost:3000)
pnpm run build           # 构建生产版本
pnpm run start           # 启动生产服务器
```

### 7.2 部署流程

#### 7.2.1 分支策略

- `main` 分支 → 生产环境
- 其他分支 → Preview 环境
- PR → 自动部署 Preview

#### 7.2.2 CI 流程（[.github/workflows/ci.yml](file:///workspace/.github/workflows/ci.yml)）

```
代码提交
  ↓
代码检查 (lint + typecheck)
  ↓
项目构建 (build)
  ↓
Smoke 测试
  ↓
完整 E2E 测试
  ↓
上传测试产物（失败时）
```

### 7.3 质量门禁

本地建议执行完整检查：

```bash
pnpm run lint              # 代码规范
pnpm run typecheck         # 类型检查
pnpm run build             # 构建检查
pnpm run e2e:smoke         # 冒烟测试
pnpm run e2e               # 完整 E2E
```

---

## 8. 测试体系

### 8.1 测试分层

| 层级 | 工具 | 位置 |
|------|------|------|
| **E2E 测试** | Playwright | `tests/e2e/` |
| **单元测试** | 自定义 | `tests/unit/` |

### 8.2 Playwright 配置

配置文件：[playwright.config.ts](file:///workspace/playwright.config.ts#L43)

**配置特点**：
- 并行执行
- CI 重试 2 次
- 自动启动 Web Server
- Chromium 浏览器测试
- Trace 记录（首次重试）

### 8.3 E2E 测试覆盖

测试文件位于 [tests/e2e/](file:///workspace/tests/e2e/)：

| 测试文件 | 覆盖场景 |
|----------|---------|
| `auth-login.spec.ts` | 登录流程 |
| `auth-guard-smoke.spec.ts` | 认证守卫 |
| `dashboard-signin-entry.spec.ts` | 仪表盘签到 |
| `duty-flow.spec.ts` | 值班完整流程 |
| `duty-rpc-integration.spec.ts` | RPC 集成 |
| `event-rsvp.spec.ts` | 活动报名 |
| `members-search-stability.spec.ts` | 成员搜索 |
| `settings-profile-save.spec.ts` | 设置保存 |

### 8.4 单元测试覆盖

单元测试位于 [tests/unit/](file:///workspace/tests/unit/)：

| 测试文件 | 覆盖内容 |
|----------|---------|
| `duty-sign-in.test.ts` | 签到逻辑 |
| `duty-time.test.ts` | 时间计算 |
| `studio-time.test.ts` | 自习统计 |

---

## 9. 代码质量

### 9.1 TypeScript 配置

[tsconfig.json](file:///workspace/tsconfig.json#L1) 配置：

- `strict: true` - 严格模式
- `moduleResolution: bundler` - 打包器解析
- `baseUrl + paths` - 路径别名 `@/*`
- `incremental: true` - 增量编译

### 9.2 ESLint 配置

[.eslintrc.json](file:///workspace/.eslintrc.json#L1) 配置：

- 基于 `next/core-web-vitals` 规则
- 放宽 `<img>` 元素限制（允许原生 img）

### 9.3 Tailwind 配置

[tailwind.config.ts](file:///workspace/tailwind.config.ts#L1) 配置：

- 深色模式：`class` 策略
- CSS 变量主题系统
- shadcn/ui 兼容配置
- `tailwindcss-animate` 和 `@tailwindcss/typography` 插件

### 9.4 shadcn/ui 配置

[components.json](file:///workspace/components.json#L1) 配置：

- RSC 兼容
- Tailwind CSS 变量主题
- 路径别名配置

### 9.5 代码注释规范

项目包含丰富的中文学习注释，例如：

```typescript
// 【学习注释：根布局元信息】
// App Router 允许在布局层直接导出 metadata...
```

---

## 10. 项目亮点与总结

### 10.1 技术亮点

#### 10.1.1 现代化架构

- ✅ Next.js 15 + React 19 最新特性
- ✅ App Router 与 RSC 最佳实践
- ✅ 服务端/客户端组件清晰分离

#### 10.1.2 安全设计

- ✅ 完善的 RLS 策略
- ✅ 基于角色的权限控制
- ✅ 会话自动刷新
- ✅ 数据库约束加固

#### 10.1.3 代码质量

- ✅ TypeScript 严格模式
- ✅ 完整的 E2E + 单元测试
- ✅ 丰富的中文注释
- ✅ 模块化业务设计

#### 10.1.4 用户体验

- ✅ 签到前多防线验证
- ✅ 自动刷新状态
- ✅ 流畅的动画过渡
- ✅ 响应式设计

### 10.2 业务亮点

#### 10.2.1 完整的值班体系

- 周排班 + 灵活调整
- 位置验证签到
- 换班大厅 + 定向邀请
- 请假审批流程
- 钥匙交接记录

#### 10.2.2 活动与成员管理

- 活动发布与报名
- 成员档案维护
- 权限分级管理
- 数据统计与分析

#### 10.2.3 数据可视化

- 值班考勤统计
- 自习时长排行榜
- ECharts 强大图表

### 10.3 可扩展性

项目架构设计具有良好的扩展性：

1. **模块化 Hooks**：业务逻辑易于拆分和复用
2. **组件分层**：UI 组件与业务逻辑解耦
3. **数据库迁移**：SQL-first 迁移，易于版本管理
4. **API 路由**：可扩展后端逻辑

### 10.4 项目总结

Club Platform 是一个**架构优良、功能完整、代码质量高**的校园社团管理平台。

**核心优势**：
- 🎯 业务场景覆盖完整
- 🏗️ 现代化技术栈与架构
- 🛡️ 完善的安全机制
- ✅ 全面的测试覆盖
- 📚 优秀的代码质量

**适用场景**：
- 校园社团管理
- 学生组织运营
- 小型团队协作

这是一个**值得学习和参考**的优秀项目，无论从技术实现还是业务设计方面都有很多亮点。

---

*文档生成时间：2026-05-06*

