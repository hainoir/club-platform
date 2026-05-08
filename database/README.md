# Database Migration Guide

This project uses SQL-first migrations. Run files in a strict order to avoid drift.

## Canonical Sources

- `database/update_swap_status.sql` is the source of truth for duty-swap RPC behavior:
  `public.accept_duty_swap`, `public.volunteer_for_duty_swap`, and `public.return_duty_swap_to_hall`.
- `database/fix_duty_hall_permissions.sql` intentionally mirrors those RPC definitions for role/email compatibility hardening and must stay in sync.
- `database/accept_swap_rpc.sql` is deprecated and intentionally does not define RPC behavior.
- `database/studio_sessions_schema.sql` owns `public.expire_studio_sessions`, the RPC boundary for closing expired self-study presence records.

## Fresh Environment Order

1. `database/auth_trigger.sql`
2. `database/rls_policies.sql`
3. `database/duty_schema.sql`
4. `database/key_and_leave_schema.sql`
5. `database/studio_sessions_schema.sql`
6. `database/update_swap_status.sql`
7. `database/add_signin_and_rsvp_constraints.sql` (required hardening: sign-in de-dup + RSVP uniqueness)
8. `database/fix_duty_hall_permissions.sql` (role/email compatibility hardening for duty hall)

## Incremental Upgrade Order (Existing Environments)

1. `database/normalize_profile_fields_to_zh.sql` (one-time backfill for legacy English `department`/`grade` in `public.members` and `auth.users.raw_user_meta_data`)
2. `database/key_and_leave_schema.sql` (adds `duty_swaps.leave_id`, leave approval RPC, and approved-only leave visibility)
3. `database/update_swap_status.sql` (refreshes swap approval / volunteer / return-to-hall RPCs)
4. `database/fix_duty_hall_permissions.sql` (role/email compatibility hardening for duty hall policies and RPCs)
5. Re-apply `database/rls_policies.sql` only if you changed member/event policies.
6. Re-apply `database/studio_sessions_schema.sql` when changing self-study presence cleanup behavior.

## Rollback (Security Hardening)

Use only when you must revert behavior quickly. Apply carefully in Supabase SQL Editor.

```sql
-- 1) Revert duty_swaps status constraint
ALTER TABLE public.duty_swaps DROP CONSTRAINT IF EXISTS duty_swaps_status_check;
ALTER TABLE public.duty_swaps ADD CONSTRAINT duty_swaps_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

-- 2) Remove hardening grants (accept_duty_swap)
REVOKE ALL ON FUNCTION public.accept_duty_swap(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.accept_duty_swap(uuid, uuid) TO public;

-- 3) Remove hardening grants (confirm_key_transfer)
REVOKE ALL ON FUNCTION public.confirm_key_transfer(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_key_transfer(uuid, uuid) TO public;
```

## Validation Checklist

- `duty_swaps.status` accepts: `pending`, `accepted`, `approved`, `rejected`.
- `accept_duty_swap` rejects non-admin callers.
- `volunteer_for_duty_swap` only accepts public or self-targeted pending swaps.
- `return_duty_swap_to_hall` clears `target_id` and returns targeted/accepted swaps to public pending.
- `approve_duty_leave` approves pending leave requests that do not have a linked swap.
- `confirm_key_transfer` rejects callers that are not the receiver.
- Function definitions include: `SECURITY DEFINER SET search_path = public, pg_temp`.
- `event_attendees_event_email_unique` exists to enforce one RSVP per event/email (case-insensitive).
- `duty_logs_member_sign_in_date_unique` exists to block repeated sign-ins in the same day.
- `duty_swaps.leave_id` exists and historical `duty_leaves.status='pending'` rows are backfilled to `approved`.
- `duty_leaves` only expose `pending` rows to the owner/admin; approved rows stay visible to everyone.
- `duty_compensations.compensation_date` exists and historical rows are backfilled.
- `members.department` / `members.grade` and `auth.users.raw_user_meta_data` no longer contain legacy English enum values.
- `expire_studio_sessions` exists, is executable by `authenticated`, and client code calls it instead of directly updating expired rows while reading active studio sessions.
