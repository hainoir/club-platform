# Database Migration Guide

This project uses SQL-first migrations. Run files in a strict order to avoid drift.

## Canonical Sources

- `database/update_swap_status.sql` is the only source of truth for `public.accept_duty_swap`.
- `database/accept_swap_rpc.sql` is deprecated and intentionally does not define RPC behavior.

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

1. `database/fix_duty_hall_permissions.sql` (recommended first when duty hall writes are rejected by RLS)
2. `database/update_swap_status.sql`
3. `database/key_and_leave_schema.sql` (to refresh secure `confirm_key_transfer` and grants)
4. Re-apply `database/rls_policies.sql` only if you changed member/event policies.

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
- `confirm_key_transfer` rejects callers that are not the receiver.
- Function definitions include: `SECURITY DEFINER SET search_path = public, pg_temp`.
- `event_attendees_event_email_unique` exists to enforce one RSVP per event/email (case-insensitive).
- `duty_logs_member_sign_in_date_unique` exists to block repeated sign-ins in the same day.
