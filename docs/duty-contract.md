# Duty Workflow Contract

This document records the database and RPC contract behind the duty workflow. Use it as a checklist when changing leave, swap, key-transfer, sign-in, or studio-presence behavior.

## Core Tables

- `duty_rosters`: weekly duty assignments by `member_id`, `day_of_week`, and `period`.
- `duty_logs`: location-verified duty sign-ins. `duty_logs_member_sign_in_date_unique` prevents duplicate same-day sign-ins.
- `duty_leaves`: leave requests. Only `approved` leave rows affect duty availability.
- `duty_swaps`: substitute workflows. `leave_id` links a leave request to its substitute handling.
- `duty_compensations`: compensation slots for approved leave. `compensation_date` is the concrete calendar date of the compensation duty.
- `key_transfers`: key handoff records.
- `studio_sessions`: self-study presence. This is separate from duty sign-in.

## State Rules

- Pending leave requests do not change duty availability.
- Approved leave requests remove the original member from duty availability for that slot.
- A leave linked to a swap must travel with `duty_swaps.leave_id`; approval happens through the swap flow, not through `approve_duty_leave`.
- Public substitute flow: `pending -> accepted -> approved`.
- Targeted substitute flow can return to the public hall: `accepted -> pending` with `target_id = null`.
- Admin decisions can close a pending swap as `approved` or `rejected`.
- Key transfer confirmation is only valid when the caller is the receiver.
- Studio self-study sessions are not duty attendance; they use `studio_sessions`, not `duty_logs`.

## RPC Contract

- `approve_duty_leave(p_leave_id uuid)`: admin-only approval for pending leave requests that are not linked to a swap.
- `accept_duty_swap(p_swap_id uuid, p_acceptor_id uuid)`: admin approval for an accepted substitute swap.
- `volunteer_for_duty_swap(p_swap_id uuid)`: member volunteers for a public or self-targeted pending swap.
- `return_duty_swap_to_hall(p_swap_id uuid)`: requester/admin returns an accepted or targeted swap to public pending.
- `confirm_key_transfer(p_transfer_id uuid, p_confirmer_id uuid)`: receiver confirms key handoff.
- `expire_studio_sessions(p_now timestamptz default now())`: authenticated cleanup of active self-study sessions whose start period has ended by more than 10 minutes.

All RPC definitions must use `SECURITY DEFINER SET search_path = public, pg_temp`, revoke public execute access, and grant execute access only to `authenticated`.

## Validation Checklist

- `duty_swaps.status` accepts `pending`, `accepted`, `approved`, and `rejected`.
- Pending leave rows remain visible only to owner/admin and do not affect sign-in availability.
- Approved leave rows remain visible to authenticated users and do affect duty availability.
- `duty_swaps.leave_id` is preserved across linked leave/swap operations.
- `duty_compensations.compensation_date` is required and reflects the exact compensation calendar date.
- `approve_duty_leave` rejects leaves that already have a linked swap.
- `accept_duty_swap`, `volunteer_for_duty_swap`, and `return_duty_swap_to_hall` stay in sync between `database/update_swap_status.sql` and `database/fix_duty_hall_permissions.sql`.
- `expire_studio_sessions` is called before reading active studio sessions; client code must not update expired rows while rendering a presence list.
- Run `pnpm run lint`, `pnpm run typecheck`, `pnpm run build`, and the duty/self-study E2E specs after changing this contract.
