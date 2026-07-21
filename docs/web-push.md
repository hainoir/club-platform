# PWA Web Push 部署与运维

本项目使用标准 Web Push、Service Worker 和 VAPID 密钥，不依赖 Firebase、微信公众号或短信。

## 架构

```text
Supabase 业务表 / 每分钟值班扫描
        -> notification_outbox
        -> Supabase Cron
        -> POST /api/internal/push/dispatch
        -> web-push
        -> 浏览器 Push Service
        -> public/sw.js
        -> 手机系统通知
```

`sent` 只表示浏览器 Push Service 接受了请求，不代表用户已经阅读或设备一定展示。

## 1. 安装数据库迁移

在已有环境中依次确认值班相关脚本已经是最新版，然后执行：

```text
database/key_and_leave_schema.sql
database/update_swap_status.sql
database/web_push_schema.sql
```

`web_push_schema.sql` 会创建：

- `notification_preferences`
- `push_subscriptions`
- `notification_outbox`
- `push_deliveries`
- 业务事件触发器
- `claim_push_outbox` / `release_stale_push_jobs` RPC

这些表没有面向普通 `authenticated` 用户的读取策略。订阅 endpoint 和加密密钥只能由使用 Service Role 的服务端访问。

## 2. 生成 VAPID 密钥

本地执行：

```powershell
pnpm run push:vapid
```

把输出分别写入本地 `.env.local` 和 Vercel 环境变量。Preview 与 Production 应使用不同的 VAPID 密钥；已经创建的订阅只适用于创建时的公钥，轮换密钥后用户需要重新订阅。

`WEB_PUSH_VAPID_SUBJECT` 必须改成真实维护邮箱或 HTTPS 联系地址，例如：

```properties
WEB_PUSH_VAPID_SUBJECT=mailto:club-platform@example.edu.cn
```

## 3. Vercel 环境变量

Production 至少需要：

```properties
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY=
WEB_PUSH_VAPID_PRIVATE_KEY=
WEB_PUSH_VAPID_SUBJECT=
PUSH_DISPATCH_SECRET=
```

安全要求：

- `SUPABASE_SERVICE_ROLE_KEY`、VAPID 私钥和 Dispatcher Secret 禁止提交 Git。
- 禁止以 `NEXT_PUBLIC_` 前缀暴露私钥。
- 日志中不得打印 endpoint、`p256dh` 或 `auth`。
- Preview 使用隔离的 Supabase 环境时再开启真实推送，避免向生产成员误发。

## 4. 配置 Supabase Cron

在 Supabase Dashboard 的 `Integrations -> Cron` 创建每分钟任务：

```text
Schedule: * * * * *
Method: POST
URL: https://<production-domain>/api/internal/push/dispatch
Header: Authorization: Bearer <PUSH_DISPATCH_SECRET>
```

真实 Secret 应放在 Supabase Vault 或 Dashboard 的安全配置中，不要写入 SQL 文件。Cron 只配置生产域名；Vercel Preview 不应注册生产调度任务。

验证 Cron：

1. 查看 `cron.job_run_details` 或 Dashboard Job History。
2. 确认接口返回包含 `claimed`、`sent`、`retried`、`failed` 等计数。
3. 确认 `notification_outbox` 不长期停留在 `processing`。
4. `processing` 超过 5 分钟会被下一轮 Dispatcher 自动恢复为 `retry`。

## 5. 用户开启流程

- Android：使用支持 Service Worker、Notifications API 和 Push API 的浏览器访问设置页；支持安装事件时可直接点击“安装应用”。
- iPhone/iPad：在 Safari 中选择“分享 -> 添加到主屏幕”，从桌面图标打开后才能请求通知权限。
- 页面不会在加载时请求权限；只有用户点击“开启手机通知”才调用系统权限框。
- 开启后会排队一条测试通知，通常在下一次 Cron（最多约一分钟）被发送。
- 主动退出账号会取消当前浏览器订阅；关闭标签页或从最近任务移除不会主动退订。

## 6. 第一版业务通知

- 钥匙交接创建与确认。
- 定向代班邀请、有人接单、管理员待审批、最终批准、退回大厅。
- 纯请假待审批和批准结果；关联代班的请假不会重复通知。
- 值班前约 30 分钟。
- 班次结束 10 分钟仍未签到。

活动提醒第一版仍只进入站内铃铛。

## 7. 故障处理

- Push Service 返回 404/410：订阅自动标记为 `expired`，用户需重新开启通知。
- 429、网络错误或 5xx：按 1 分钟、5 分钟、15 分钟、1 小时、6 小时退避重试，但不会超过通知 TTL。
- 用户没有 active 订阅、关闭 Web Push 或关闭业务分类：outbox 标记 `suppressed`。
- 过期的值班提醒不会补发。
- 大陆 Android 浏览器和省电策略差异较大，必须用真实成员设备试点；不支持的设备继续使用站内铃铛。

## 8. 上线前验证

```powershell
pnpm run typecheck
pnpm run test:unit
pnpm run build
```

真机至少覆盖一台 iPhone、华为、小米和 OPPO/vivo，验证锁屏、网页关闭、最近任务移除、省电模式和通知点击跳转。
