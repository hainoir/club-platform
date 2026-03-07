# 🚀 前端开发者俱乐部管理平台 (Frontend Developer Club Platform)

这是一个现代化、面向高校及技术社区的**硬核全栈社团管理系统**。
项目旨在为社团管理层提供一站式的人员调配、活动生命周期管控与数据洞察视图。由前台交互式 Web 体验和底层的无服务器 (Serverless) 架构强强联合驱动。这也是一份绝佳的 **React + Next.js 全栈实习生简历级展示项目**。

---

## 🛠️ 技术栈与架构 (Tech Stack)

### 前端生态 (Frontend)
- **核心框架**: [Next.js 15 (App Router)](https://nextjs.org/) - 利用最新的 React Server Components (RSC) 手法，带来丝滑的服务端渲染体验和极快的首屏直出（FCP）。
- **组件系统**: [React 19](https://react.dev/) - 大量应用 Hooks、响应式流与不可变数据理念。
- **UI & 样式**: [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) - 打造带有多彩暗黑模式 (Dark Mode) 与极简工业风的玻璃拟态组件。
- **状态管理**: [Zustand](https://github.com/pmndrs/zustand) - 放弃沉重的 Redux/Context，采用极简的跨层级响应式状态库配合 LocalStorage 持久化管理 RBAC RBAC 鉴权机制。
- **数据可视化**: [ECharts](https://echarts.apache.org/) - 用百度开源的专业渲染引擎绘制时间序列的大盘折线图。

### 后端与云服务 (Backend / BaaS)
- **底层驱动**: [Supabase](https://supabase.com/) - 强悍的开源 Firebase 替代品，基于 PostgreSQL 强一致性结构。
- **核心中间件**: Next.js Edge Middleware 拦截非法未登录路由与令牌自刷新保活。
- **对象直传**: 前端 File 对象通过预签名策略绕过服务器计算直通 Supabase Storage 云端桶。

---

## ✨ 核心业务模块 (Key Features)

### � 1. 动态数据大盘 (Dashboard)
- 破除静态渲染，实时侦听底层 PostgreSQL 的四大数据指标头。
- **社团活力趋势折线图**：跨表（Members x Events）聚合最近 6 个月的当月招新数量与发起的活动频次，采用贝塞尔曲线渲染双轨数据走向。
- **全站动态流 (Recent Activity)**：按时间轴倒叙交织出最新的人员加入记录与活动发布通告。

### 👥 2. RBAC 人员与科层管理 (Member Management)
- **多级权限字典**：主席团（红牌）、部长层（蓝牌）、普通干事（灰牌），支持部门分类派驻。
- **复杂名单控制台**：搭载极速的客户端即时搜索、服务端动态筛选防白屏分页（Pagination）以及批量导出为 CSV (BOM-UTF8 处理防中文乱码) 的硬核导出指令。
- **防越野机制**：深度的搜索游标控制，当结果收缩时分页指针自动拽回安全区。

### 📅 3. 全生命周期活动集市 (Events Hub)
- **海报封面展示**：支持在平台端上传压缩高清活动大图展示头图。
- **自动归档算子**：基于纯函数对活动设定的截止时间与系统 `new Date()` 自动侦测比对，对失效活动灰度渲染、禁用报名系统并沉底进入“历史长廊”折叠面板。
- **乐观更新 (Optimistic UI) 签到闭环**：不仅成员可以自己一键报名/退出，身为**管理员**能够使用实时点名签到打卡并强制剥离失效成员的功能。在网络受限环境通过欺骗性渲染提前亮起签到成功标志。

---

## 🏃 部署与运行 (Getting Started)

本项目严格规定了使用 `pnpm` 控制幽灵依赖与包尺寸。请确保你本地装有 [Node.js](https://nodejs.org/)(v20+)。

1. **拉取依赖**
   \`\`\`bash
   pnpm install
   \`\`\`

2. **环境变量配置**
   你需要在项目根目录创建一个 `.env.local`，并填入你自己的 Supabase 公钥：
   \`\`\`env
   NEXT_PUBLIC_SUPABASE_URL=你的_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY=你的_ANON_KEY
   \`\`\`

3. **激发引擎**
   \`\`\`bash
   pnpm run dev
   \`\`\`
   运行后，访问 [http://localhost:3000](http://localhost:3000) 即可切入战斧巡航。

---

## 📖 面试与学习向导 (For Studying)

本项目绝非只是简单的 "Todo List"，其中包含了大量应对大厂实习生面试的关键考点，作者已在核心文件中利用 **`// 【系统学习】` 和 `// 【面试考点】` 标注了超过 20 处系统级难点讲解**。

- **`app/page.tsx`**: 学习理解 React Server Component 与瀑布流请求破除。
- **`app/events/EventsClient.tsx`**: 探讨 useEffect 闭包陷阱、乐观更新以及前台校验防爆。
- **`app/members/MembersClient.tsx`**: 看看受控组件、Zustand 持久化以及绝对的 “派生状态 (Derived State)” 滤镜写法。
- **`middleware.ts`**: 如何写一个带静态前缀防误伤的高性能守卫。

*Built with passion, by Developer.*
