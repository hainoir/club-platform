# 🎓 校内社团全周期管理平台 (Club Platform)

![Next.js](https://img.shields.io/badge/Next.js-15.0-black?style=for-the-badge&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-DB_%26_Auth-4FC08D?style=for-the-badge&logo=supabase)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?style=for-the-badge&logo=tailwind-css)

一款基于最新前端工程化标准构建的一站式校园社团/部门管理系统。本项目作为**企业级架构示范案例**，深度集成 Next.js App Router 的高阶特性与 Supabase 强类型生态，为校园组织提供现代化、安全且极具扩展性的业务底座。

## ✨ 核心亮点 (Engineering Excellence)

### 1. 极致的类型与权限安全体系
- **消除任何形式的 `any` 黑洞**：深度利用 Supabase 的 Typed Schema，将数据库建表的 Schema (Row / Insert / Update) 与前端组件Props形成闭环。不再有推论不到位的隐患，从网络请求的 Response 到组件强类型输入，达成100%覆盖。
- **数据库及存储级别的 Row-Level Security (RLS)**：不依赖脆弱的前端路由拦截（前端拦截仅用于 UX 提升），通过真实的 PostgreSQL RLS policy 强制保障所有请求（含表数据与 Storage bucket 存储对象）无法越权读写（见 `database/rls_policies.sql`，内含表级及 Storage policy 完整防线）。
- **去同步漂移的 Auth 状态管线**：封装全局 `AuthProvider`，每次装载强一致同步 Supabase HttpOnly Session 和内存缓存状态（Zustand persist），确保角色/权限信息不发生“短时时差渲染”。

### 2. React 最佳实践与解耦重构
- **解构巨型组件 (Decoupling)**：严格遵照单一职责原则，将原本厚重的 Client 聚合页面，抽象出 `<MemberModal>`、`<EventModal>`、`<AttendeesModal>`、`<EventCard>`，极大降低了长期维护的心智负担。
- **智能的乐观更新 (Optimistic UI)**：以 `React.useOptimistic` 替代传统的 "loading锁" 结合 "等待请求" 的笨重循环。对于报名单增删、成员管理等重度交互场景，响应时间降至肉眼无法察觉的 0ms 并配合无刷新 Server Action 补全，提升应用丝滑度。

### 3. Next.js App Router 前沿特性覆盖
- **路由拦截与平行路由 (Intercepting & Parallel Routes)**：为活动图文介绍的“点开”场景，特地构建拦截路由 `(.)[id]` 与平级视图层 `@modal`。实现在同级页面唤起高定渲染弹窗的同时，分享 URL 即自动回退为SSR整页渲染 (`/[id]/page.tsx`)。
- **静态增量再生 (ISR, Incremental Static Regeneration)**：配合平行路由的分享着陆页提取静态配置 `revalidate: 60`，使得活动宣传这种高并发/读多写少的页面自动受惠于 CDN 层边缘缓存，无需动用数据库即可毫秒级下发内容，提升SEO。

### 4. 完整的业务闭环
- **活动全生命周期流转**：从发布活动（包含强类型受控排期）、 Markdown 图文详细录入与 Supabase Storage 封面上云直传，到前排学生的自由“报名选课”，再到执行干事/管理员打开内置面板“查名勾选签到”与“一键导出 CSV 表格汇报”，逻辑全程自洽。
- **全站响应的控制大盘**：内置通过 ECharts 封装的 Dashboard，使用 SSR 直出报表，囊括考勤出勤率漏斗、近6月入部趋势雷达与部门人数配比。

---

## 🚀 极速起步

**1. 克隆与安装依赖**
本项目默认指定并推荐使用 `pnpm`：
```bash
git clone https://github.com/your-username/club-platform.git
cd club-platform
pnpm install
```

**2. 配置环境变量**
在根目录创立 `.env.local` 并在其中填入 Supabase 控制台获取到的公钥和URL：
```properties
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

**3. 执行数据库前置语句**
前往你的 Supabase Dashboard 的 SQL Editor 中执行项目自带的安全规则防线：
- `database/rls_policies.sql`

**4. 运行实例**
```bash
pnpm run dev
```
打开 `http://localhost:3000` 即可开始探索。

---

## 🛠️ 质量验证管线 (CI / CD)
本项目中内置了完备的 `.github/workflows/ci.yml`。每次提交 (Push) / 拉取请求 (PR) 到 `main` 分支时，将强制并行拉起 GitHub Actions 来审查：
- `eslint` 语法违规
- 严格模式下的 `tsc --noEmit` 双盲阻断测试
- 容器化编译与 Build 验证
以保障并延续此项目的工业级纯净度。
