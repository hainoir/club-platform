# Club Platform Android V1

Expo Router 应用提供登录、值班表和请假申请三个界面。需要 Node.js 22 或更新版本。

## 配置与运行

在 `mobile/` 目录执行：

```bash
npm ci
cp .env.example .env
```

在 `.env` 中填写 `EXPO_PUBLIC_SUPABASE_URL` 和 `EXPO_PUBLIC_SUPABASE_ANON_KEY`。只使用可公开的 anon key；`.env` 已被 Git 忽略。然后运行：

```bash
npm run android
```

Android 模拟器或设备需能访问 Supabase URL。Expo Go 可用 Expo CLI 的二维码打开应用。运行 `npm run typecheck` 检查移动端类型。

登录后，底部标签分别显示每周值班表和请假申请。值班表支持下拉刷新，并标记自己的排班。请假页仅显示自己的排班；选择排班后会填入下一次可请假日期，可手动改为 `YYYY-MM-DD`。提交后会显示待处理申请。退出按钮在右上角。

请假直接写入 `duty_leaves`，状态为 `pending`，不调用审批 RPC。成员资料只查询，不会自动创建。应用依赖现有 Supabase RLS 允许成员读取排班和提交本人请假。

请假写入 `penalty_shifts: 1`（符合库约束 1–2 与 Web 默认），V1 不创建补班/代班记录。本应用不会改动生产 schema。
