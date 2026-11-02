# Club Platform Android V1

这是 Expo SDK 58 + Expo Router Android 应用，提供登录、值班表和请假申请。需要 Node.js 22 或更新版本。

## Supabase 目标与本地运行

默认只连接测试或本地 Supabase 项目。应用没有内置 URL 或 key；缺少配置、URL 无效时会显示启动错误。生产项目受保护，`EXPO_PUBLIC_ALLOW_PRODUCTION_SUPABASE` 默认是 `false`；只有获授权并将它精确设为 `true` 时，应用才允许连接生产。除 URL 外，还会解析 anon key（JWT）里的 `ref`：即使通过代理或自定义域名，只要 key 属于生产项目同样会被拦截。不要把生产 URL、key 写入仓库。

在 `mobile/` 目录执行：

```bash
npm ci
cp .env.example .env
```

在 `.env` 中设置测试/本地项目的 `EXPO_PUBLIC_SUPABASE_URL` 和公开的 `EXPO_PUBLIC_SUPABASE_ANON_KEY`。`.env` 已被 Git 忽略。Android 模拟器或设备必须能访问该 URL；本地服务应使用设备可访问的地址（例如局域网 IP）；注意 release APK 默认禁止明文 HTTP，若测试库用 `http://` 局域网地址，需要另行开启 cleartext（V1 未开启）。然后运行 `npm run android`，也可用 Expo Go 扫描 Expo CLI 二维码。

## EAS 构建

构建时，在对应 EAS environment 中分别创建 `EXPO_PUBLIC_SUPABASE_URL`、`EXPO_PUBLIC_SUPABASE_ANON_KEY`；不要在 `eas.json` 中写 URL 或 key。例如为 preview 创建变量（将值换成测试项目自己的配置）：

```bash
eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value "<测试项目 URL>" --visibility plaintext
eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<测试项目 anon key>" --visibility plaintext
```

如需 production 构建，也须在 `production` environment 配置测试目标。两个构建 profile 都强制将生产连接开关设为 `false`。预览 APK 命令：

```bash
eas build -p android --profile preview
```

构建要求 kir 使用自己的账号执行 `eas login`。上述命令只是使用说明，不会自动上传任何配置。

## 请假流程

登录后，底部标签显示每周值班表和请假申请。值班表支持下拉刷新，并标记自己的排班；退出按钮在右上角。请假页只展示自己的排班，选中后默认填入下一次可请假日期，也可手动输入 `YYYY-MM-DD`。日期须对应排班星期、尚未结束且不是节假日。

与 Web 一样，请假必须选择补班节数（1 或 2）及**恰好**相同数量的补班班次。候选班次按“请假当周剩余班次”和“请假次周所有班次”展示；已选择班次会在日期或排班变化时清空。待审批或已批准的同班次同日期请假不可重复提交。成功后创建待审批请假和补班记录；补班写入失败时尝试撤回待审批请假。V1 不提供代班（substitute）功能，不创建 `duty_swaps`。

成员资料只查询，不会自动创建。应用依赖现有 Supabase RLS 允许成员读取排班、提交本人请假和补班。

## 检查

在 `mobile/` 运行：

```bash
npm run typecheck
npm test
npm run check:shared
```

`check:shared` 验证 `src/shared/` 中四个副本与仓库根目录的 Web 源文件字节完全一致。
