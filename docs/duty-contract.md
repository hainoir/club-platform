# 值班流程契约

本文只处理值班、自习和钥匙交接相关的数据库与 RPC 事实来源，不讨论页面布局和视觉实现。

如果你想先理解业务全貌，再回来看这里，建议按这个顺序阅读：

- [项目总览](./project-overview.md)
- [架构说明](./architecture.md)
- [Supabase RPC 排查清单](./supabase-rpc-checklist.md)

只要改动请假、代班、钥匙交接、签到或自习在场相关行为，都应先把它当作检查清单来对照。

## 核心数据表

- `duty_rosters`：按 `member_id`、`day_of_week` 和 `period` 记录每周值班安排。
- `duty_logs`：值班签到记录。`duty_logs_member_sign_in_date_unique` 用于阻止同一天重复签到。坐标、精度和距离由服务端写入；`location_verified` 只在围栏触发器通过后为 true。登录用户不能 UPDATE 地点、核验、成员或日期列，也不能 DELETE。作废、补签和删除分别走 `mark_duty_sign_in_invalid`、`admin_backfill_duty_sign_in`、`delete_duty_sign_in`，并写入 `duty_sign_in_admin_events`。任何直接删除仍由触发器保存被删行的快照。
- `studio_geofence`：签到和自习定位的权威圆心、半径和精度上限。客户端在定位前读取这一行。`authenticated` 只有 SELECT；修改走 `update_studio_geofence`，并写入 `studio_geofence_audits`。
- `duty_leaves`：请假申请。只有 `approved` 状态的请假记录会影响值班可用性。
- `duty_swaps`：代班流程。`leave_id` 用于把一条请假请求和它对应的代班处理关联起来。
- `duty_compensations`：已批准请假的补班槽位。`compensation_date` 表示补班发生的具体日历日期。
- `key_transfers`：钥匙交接记录。
- `studio_sessions`：自习在场记录，它与值班签到是两条独立业务线。

## 状态规则

- 待审批的请假不会改变值班可用性。
- 已批准的请假会把原成员从该时段的可值班名单中移除。
- 与代班关联的请假必须通过 `duty_swaps.leave_id` 一起流转；其批准动作应走代班流程，而不是直接调用 `approve_duty_leave`。
- 公共代班流程为：`pending -> accepted -> approved`。
- 定向代班流程可以回退到公共大厅：`accepted -> pending`，同时 `target_id = null`。
- 管理员可以把一条待处理代班收口为 `approved` 或 `rejected`。
- 只有接收方本人才能确认钥匙交接。
- 工作室自习会话不等于值班考勤；它使用的是 `studio_sessions`，不是 `duty_logs`。

## RPC 契约

- `approve_duty_leave(p_leave_id uuid)`：仅管理员可用，用于批准未关联代班的待审批请假。
- `accept_duty_swap(p_swap_id uuid, p_acceptor_id uuid)`：由管理员批准一条已被成员接单的代班。
- `volunteer_for_duty_swap(p_swap_id uuid)`：成员响应一条公共或定向给自己的待处理代班。
- `return_duty_swap_to_hall(p_swap_id uuid)`：申请人或管理员把一条已接单或定向代班退回到公共待处理状态。
- `confirm_key_transfer(p_transfer_id uuid, p_confirmer_id uuid)`：由接收方确认钥匙交接。
- `expire_studio_sessions(p_now timestamptz default now())`：对开始时段结束超过 10 分钟的活跃自习会话执行认证后的过期清理。
- `submit_duty_sign_in(p_latitude double precision, p_longitude double precision, p_accuracy double precision, p_device_info text default null)`：当前登录成员提交一次值班签到。成员身份来自会话，不接受调用方传入的 `member_id`。写入的 `sign_in_time` 就是本次窗口判断使用的 `duty_sign_in_instant()`，上海日期由触发器从该时刻算出。普通登录会话里这个时刻是 `now()`。上海日期已有记录时返回 `already_signed_in`，成功返回 `signed_in`。拒绝时的 `HINT`：`out_of_range`、`insufficient_accuracy`、`invalid_coordinates`、`invalid_accuracy`、`geofence_unconfigured`、`holiday`、`outside_shift_window`、`not_rostered`。节次窗口与 `lib/duty/duty-time.ts` 的 `getDutyPeriodByMinutes` 相同，比首页按钮的上课时间略宽。
- `current_member_id()`：解析当前登录用户对应的 `members.id`。前端重复签到预检和值班提醒都用它，不用调用方传入的用户 id。
- `mark_duty_sign_in_invalid(p_log_id uuid, p_reason text)`：管理员把一条已核验签到标为无效，并写审计。
- `admin_backfill_duty_sign_in(p_member_id uuid, p_sign_in_time timestamptz, p_reason text)`：管理员补签。仍要求目标时刻落在节次内且该节有排班，不要求围栏坐标，已批准请假不阻挡。返回新行 id。
- `update_studio_geofence(p_latitude double precision, p_longitude double precision, p_radius_meters double precision, p_max_accuracy_meters double precision, p_reason text)`：管理员更新围栏。半径必须在 20 到 200 米，精度上限必须在 30 到 200 米。
- `delete_duty_sign_in(p_log_id uuid, p_reason text)`：管理员删除一条签到。原因必填，1 到 200 字。删除前的整行写入 `duty_sign_in_admin_events.row_snapshot`，动作为 `delete`。

所有 RPC 定义都必须使用 `SECURITY DEFINER SET search_path = public, pg_temp`，撤销 `public` 的执行权限，并且只向 `authenticated` 授予执行权限。

## 校验清单

- `duty_swaps.status` 只接受 `pending`、`accepted`、`approved` 和 `rejected`。
- 客户端不能直接 INSERT、UPDATE 或 DELETE `duty_logs`。签到必须走 `submit_duty_sign_in`，并且插入触发器会忽略调用方传来的 `location_verified`。删除必须走 `delete_duty_sign_in`。
- 签到前客户端必须先读 `studio_geofence`。环境变量不是围栏来源。
- 待审批请假仅对本人和管理员可见，且不会影响签到可用性。
- 已批准请假对所有已认证用户可见，并且会影响值班可用性。
- `duty_swaps.leave_id` 会在关联的请假/代班操作中被完整保留。
- `duty_compensations.compensation_date` 是必填字段，并且应反映准确的补班日历日期。
- `approve_duty_leave` 必须拒绝已经关联代班的请假。
- `accept_duty_swap`、`volunteer_for_duty_swap` 和 `return_duty_swap_to_hall` 只在 `supabase/migrations/*_functions_and_triggers.sql` 中定义一次。
- 读取活跃自习会话前必须先调用 `expire_studio_sessions`；客户端在渲染在场列表时不应一边读列表一边直接回写过期记录。
- 在把 RPC 报错当成前端 Bug 之前，应根据 `docs/supabase-rpc-checklist.md` 先检查线上 Supabase 函数签名、执行权限和 PostgREST schema cache。
- 修改本契约后，应运行 `pnpm run lint`、`pnpm run typecheck`、`pnpm run build` 以及值班/自习相关 E2E 用例。

## 相关文档

- [项目总览](./project-overview.md)
- [架构说明](./architecture.md)
- [Supabase RPC 排查清单](./supabase-rpc-checklist.md)
