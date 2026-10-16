import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { PGlite } from '@electric-sql/pglite'

const MEMBER_ID = '11111111-1111-4111-8111-111111111111'
const STUDIO_LATITUDE = 39.181074
const STUDIO_LONGITUDE = 117.12138

const FIXTURE_SQL = `
CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT '${MEMBER_ID}'::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT '{"email":"member@example.com"}'::jsonb;
$$;

CREATE TABLE public.members (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  role text NOT NULL
);

INSERT INTO public.members (id, email, role)
VALUES ('${MEMBER_ID}', 'member@example.com', '干事');

CREATE TABLE public.duty_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  sign_in_time timestamptz DEFAULT now(),
  sign_in_date date,
  location_verified boolean DEFAULT false,
  device_info text,
  week_number integer
);

CREATE OR REPLACE FUNCTION public.sync_duty_sign_in_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.sign_in_time := COALESCE(NEW.sign_in_time, now());
  NEW.sign_in_date := timezone('Asia/Shanghai', NEW.sign_in_time)::date;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_duty_sign_in_date
BEFORE INSERT OR UPDATE OF sign_in_time ON public.duty_logs
FOR EACH ROW
EXECUTE FUNCTION public.sync_duty_sign_in_date();

CREATE UNIQUE INDEX duty_logs_member_sign_in_date_unique
ON public.duty_logs (member_id, sign_in_date);

CREATE TABLE public.duty_rosters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  day_of_week int NOT NULL,
  period int NOT NULL
);

CREATE TABLE public.duty_leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  day_of_week int NOT NULL,
  period int NOT NULL,
  leave_date date,
  expires_at timestamptz,
  status text
);

ALTER TABLE public.duty_logs ENABLE ROW LEVEL SECURITY;

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
GRANT anon, authenticated TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
`

type DutyLogRow = {
    location_verified: boolean
    distance_meters: number
    device_info: string | null
}

function migrationSql() {
    return readFileSync(path.join(process.cwd(), 'supabase/migrations/20261015083723_duty_signin_geofence.sql'), 'utf8')
}

function enforcementSql() {
    return readFileSync(path.join(process.cwd(), 'supabase/migrations/20261015092000_duty_sign_in_enforcement.sql'), 'utf8')
}

function deleteAuditSql() {
    return readFileSync(path.join(process.cwd(), 'supabase/migrations/20261015120000_duty_sign_in_delete_audit.sql'), 'utf8')
}

function storedInstantSql() {
    return readFileSync(path.join(process.cwd(), 'supabase/migrations/20261016020000_duty_sign_in_stores_evaluation_instant.sql'), 'utf8')
}

async function setClock(db: PGlite, instant: string) {
    await db.query(`SELECT set_config('duty.sign_in_at', $1, false)`, [instant])
}

async function prepareThursdayShift(db: PGlite) {
    await setClock(db, '2026-10-15 02:30:00+00')
    await db.exec(`
        INSERT INTO public.duty_rosters (member_id, day_of_week, period)
        VALUES ('${MEMBER_ID}', 4, 2)
    `)
}

async function expectDatabaseError(run: () => Promise<unknown>, hint: string) {
    try {
        await run()
    } catch (error) {
        const details = error as { hint?: string; message?: string; detail?: string }
        const text = `${details.hint ?? ''}\n${details.message ?? ''}\n${details.detail ?? ''}`
        assert.match(text, new RegExp(hint))
        return
    }

    assert.fail(`expected database error containing ${hint}`)
}

async function signIn(db: PGlite, latitude: number, longitude: number, accuracy: number, device = 'pixel') {
    const result = await db.query<{ status: string }>(
        `SELECT public.submit_duty_sign_in($1::float8, $2::float8, $3::float8, $4::text) AS status`,
        [latitude, longitude, accuracy, device]
    )
    return result.rows[0]?.status
}

async function logCount(db: PGlite) {
    const result = await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM public.duty_logs`)
    return result.rows[0]?.count ?? 0
}

test('duty check-in geofence cannot be bypassed in the database', { timeout: 120_000 }, async () => {
    const db = new PGlite()
    try {
        await db.exec(FIXTURE_SQL)
        await db.exec(migrationSql())
        await db.exec(enforcementSql())
        await db.exec(storedInstantSql())
        const sessionUser = await db.query<{ session_user: string }>(`SELECT session_user`)
        assert.equal(sessionUser.rows[0]?.session_user, 'postgres')
        await prepareThursdayShift(db)

        assert.equal(await signIn(db, STUDIO_LATITUDE, STUDIO_LONGITUDE, 5, 'pixel'), 'signed_in')
        const stored = await db.query<DutyLogRow>(
            `SELECT location_verified, distance_meters, device_info FROM public.duty_logs`
        )
        assert.equal(stored.rows.length, 1)
        assert.equal(stored.rows[0]?.location_verified, true)
        assert.equal(stored.rows[0]?.device_info, 'pixel')
        assert.ok((stored.rows[0]?.distance_meters ?? 999) < 1)

        assert.equal(await signIn(db, STUDIO_LATITUDE, STUDIO_LONGITUDE, 5), 'already_signed_in')
        assert.equal(await logCount(db), 1)

        await db.exec(`DELETE FROM public.duty_logs`)
        const near = await signIn(db, STUDIO_LATITUDE + 0.0002, STUDIO_LONGITUDE, 20)
        assert.equal(near, 'signed_in')
        const nearRow = await db.query<{ distance_meters: number }>(
            `SELECT distance_meters FROM public.duty_logs`
        )
        const nearDistance = nearRow.rows[0]?.distance_meters ?? 0
        assert.ok(nearDistance > 15 && nearDistance < 30)

        await db.exec(`DELETE FROM public.duty_logs`)
        await expectDatabaseError(
            () => signIn(db, STUDIO_LATITUDE + 0.001, STUDIO_LONGITUDE, 5),
            'out_of_range'
        )
        assert.equal(await logCount(db), 0)

        await expectDatabaseError(
            () => signIn(db, STUDIO_LATITUDE, STUDIO_LONGITUDE, 250),
            'insufficient_accuracy'
        )
        await expectDatabaseError(
            () => signIn(db, 91, STUDIO_LONGITUDE, 5),
            'invalid_coordinates'
        )
        await expectDatabaseError(
            () => signIn(db, STUDIO_LATITUDE, STUDIO_LONGITUDE, -1),
            'invalid_accuracy'
        )
        assert.equal(await logCount(db), 0)

        await expectDatabaseError(
            () => db.exec(`
                INSERT INTO public.duty_logs (member_id, location_verified)
                VALUES ('${MEMBER_ID}', true)
            `),
            'invalid_coordinates'
        )
        await expectDatabaseError(
            () => db.exec(`
                INSERT INTO public.duty_logs (member_id, location_verified, latitude, longitude, accuracy_meters)
                VALUES ('${MEMBER_ID}', true, ${STUDIO_LATITUDE + 0.001}, ${STUDIO_LONGITUDE}, 5)
            `),
            'out_of_range'
        )
        assert.equal(await logCount(db), 0)

        await db.exec(`
            INSERT INTO public.duty_logs (member_id, location_verified, latitude, longitude, accuracy_meters)
            VALUES ('${MEMBER_ID}', false, ${STUDIO_LATITUDE}, ${STUDIO_LONGITUDE}, 5)
        `)
        const forced = await db.query<{ location_verified: boolean }>(
            `SELECT location_verified FROM public.duty_logs`
        )
        assert.equal(forced.rows[0]?.location_verified, true)
        await db.exec(`DELETE FROM public.duty_logs`)

        await db.exec(`DELETE FROM public.studio_geofence`)
        await expectDatabaseError(
            () => signIn(db, STUDIO_LATITUDE, STUDIO_LONGITUDE, 5),
            'geofence_unconfigured'
        )
        await db.exec(`
            INSERT INTO public.studio_geofence (id, latitude, longitude, radius_meters, max_accuracy_meters)
            VALUES (true, ${STUDIO_LATITUDE}, ${STUDIO_LONGITUDE}, 50, 100)
        `)

        await db.exec(`SET ROLE authenticated`)
        try {
            await expectDatabaseError(
                () => db.exec(`
                    INSERT INTO public.duty_logs (member_id, location_verified, latitude, longitude, accuracy_meters)
                    VALUES ('${MEMBER_ID}', true, ${STUDIO_LATITUDE}, ${STUDIO_LONGITUDE}, 5)
                `),
                'permission denied|row-level security'
            )
        } finally {
            await db.exec(`RESET ROLE`)
        }
        await db.exec(`GRANT INSERT ON TABLE public.duty_logs TO authenticated`)
        await db.exec(`SET ROLE authenticated`)
        try {
            await expectDatabaseError(
                () => db.exec(`
                    INSERT INTO public.duty_logs (member_id, location_verified, latitude, longitude, accuracy_meters)
                    VALUES ('${MEMBER_ID}', true, ${STUDIO_LATITUDE}, ${STUDIO_LONGITUDE}, 5)
                `),
                'row-level security'
            )
        } finally {
            await db.exec(`RESET ROLE`)
        }
        assert.equal(await logCount(db), 0)

        await db.exec(`UPDATE public.studio_geofence SET radius_meters = 1 WHERE id`)
        await expectDatabaseError(
            () => signIn(db, STUDIO_LATITUDE + 0.0002, STUDIO_LONGITUDE, 5),
            'out_of_range'
        )
        assert.equal(await logCount(db), 0)
    } finally {
        await db.close()
    }
})

test('the enforcement migration sorts after the geofence migration', () => {
    const files = readdirSync(path.join(process.cwd(), 'supabase/migrations'))
        .filter((name) => name.endsWith('.sql'))
        .sort()
    const geofence = files.findIndex((name) => name.startsWith('20261015083723_'))
    const enforcement = files.indexOf('20261015092000_duty_sign_in_enforcement.sql')
    const deleteAudit = files.indexOf('20261015120000_duty_sign_in_delete_audit.sql')
    const storedInstant = files.indexOf('20261016020000_duty_sign_in_stores_evaluation_instant.sql')
    assert.ok(geofence >= 0)
    assert.ok(enforcement > geofence)
    assert.ok(deleteAudit > enforcement)
    assert.ok(storedInstant > deleteAudit)
})

test('duty sign-in enforces the shift window, column lock, and fence grants', { timeout: 120_000 }, async () => {
    const db = new PGlite()
    try {
        await db.exec(FIXTURE_SQL)
        await db.exec(migrationSql())
        await db.exec(enforcementSql())
        await db.exec(storedInstantSql())
        await prepareThursdayShift(db)

        await setClock(db, '2026-05-01 02:30:00+00')
        await expectDatabaseError(
            () => signIn(db, STUDIO_LATITUDE, STUDIO_LONGITUDE, 5),
            'holiday'
        )

        await setClock(db, '2026-10-17 02:30:00+00')
        await expectDatabaseError(
            () => signIn(db, STUDIO_LATITUDE, STUDIO_LONGITUDE, 5),
            'outside_shift_window'
        )

        await setClock(db, '2026-10-15 12:00:00+00')
        await expectDatabaseError(
            () => signIn(db, STUDIO_LATITUDE, STUDIO_LONGITUDE, 5),
            'outside_shift_window'
        )

        await setClock(db, '2026-10-15 02:30:00+00')
        await db.exec(`DELETE FROM public.duty_rosters`)
        await expectDatabaseError(
            () => signIn(db, STUDIO_LATITUDE, STUDIO_LONGITUDE, 5),
            'not_rostered'
        )

        await db.exec(`
            INSERT INTO public.duty_rosters (member_id, day_of_week, period)
            VALUES ('${MEMBER_ID}', 4, 2)
        `)
        await db.exec(`
            INSERT INTO public.duty_leaves (member_id, day_of_week, period, leave_date, expires_at, status)
            VALUES (
              '${MEMBER_ID}',
              4,
              2,
              DATE '2026-10-15',
              '2026-10-15 16:00:00+00',
              'approved'
            )
        `)
        await expectDatabaseError(
            () => signIn(db, STUDIO_LATITUDE, STUDIO_LONGITUDE, 5),
            'not_rostered'
        )
        await db.exec(`DELETE FROM public.duty_leaves`)
        assert.equal(await logCount(db), 0)

        assert.equal(await signIn(db, STUDIO_LATITUDE, STUDIO_LONGITUDE, 5), 'signed_in')
        const stamped = await db.query<{ sign_in_date: string; matches_clock: boolean }>(`
            SELECT
              sign_in_date::text,
              sign_in_time = timestamptz '2026-10-15 02:30:00+00' AS matches_clock
            FROM public.duty_logs
        `)
        assert.equal(stamped.rows[0]?.sign_in_date, '2026-10-15')
        assert.equal(stamped.rows[0]?.matches_clock, true)
        await expectDatabaseError(
            () => db.exec(`UPDATE public.duty_logs SET latitude = latitude + 0.0001`),
            'sign_in_columns_locked'
        )
        await db.exec(`UPDATE public.duty_logs SET device_info = 'edited'`)
        const edited = await db.query<{ device_info: string; latitude: number }>(
            `SELECT device_info, latitude FROM public.duty_logs`
        )
        assert.equal(edited.rows[0]?.device_info, 'edited')
        assert.equal(edited.rows[0]?.latitude, STUDIO_LATITUDE)

        await db.exec(`UPDATE public.members SET role = '主席' WHERE id = '${MEMBER_ID}'`)
        const logId = await db.query<{ id: string }>(`SELECT id FROM public.duty_logs`)
        await db.query(
            `SELECT public.mark_duty_sign_in_invalid($1::uuid, $2::text)`,
            [logId.rows[0]?.id, '误打卡']
        )
        const invalidated = await db.query<{ location_verified: boolean }>(
            `SELECT location_verified FROM public.duty_logs`
        )
        assert.equal(invalidated.rows[0]?.location_verified, false)
        const invalidAudits = await db.query<{ count: number }>(
            `SELECT count(*)::int AS count FROM public.duty_sign_in_admin_events WHERE action = 'mark_invalid'`
        )
        assert.equal(invalidAudits.rows[0]?.count, 1)
        await expectDatabaseError(
            () => db.query(
                `SELECT public.mark_duty_sign_in_invalid($1::uuid, $2::text)`,
                [logId.rows[0]?.id, '再次作废']
            ),
            'already_invalid'
        )

        await expectDatabaseError(
            () => db.query(
                `SELECT public.admin_backfill_duty_sign_in($1::uuid, $2::timestamptz, $3::text)`,
                [MEMBER_ID, '2026-10-15 02:30:00+00', '补记']
            ),
            'already_signed_in'
        )
        await db.exec(`DELETE FROM public.duty_logs`)
        const backfill = await db.query<{ id: string }>(
            `SELECT public.admin_backfill_duty_sign_in($1::uuid, $2::timestamptz, $3::text) AS id`,
            [MEMBER_ID, '2026-10-15 02:30:00+00', '补记']
        )
        const backfilled = await db.query<{
            location_verified: boolean
            latitude: number | null
            device_info: string
        }>(`SELECT location_verified, latitude, device_info FROM public.duty_logs WHERE id = $1`, [
            backfill.rows[0]?.id,
        ])
        assert.equal(backfilled.rows[0]?.location_verified, true)
        assert.equal(backfilled.rows[0]?.latitude, null)
        assert.equal(backfilled.rows[0]?.device_info, 'admin_backfill')

        await expectDatabaseError(
            () => db.query(
                `SELECT public.update_studio_geofence($1::float8, $2::float8, $3::float8, $4::float8, $5::text)`,
                [STUDIO_LATITUDE, STUDIO_LONGITUDE, 10000, 100, '放得太大']
            ),
            'radius_out_of_bounds'
        )
        await db.query(
            `SELECT public.update_studio_geofence($1::float8, $2::float8, $3::float8, $4::float8, $5::text)`,
            [STUDIO_LATITUDE, STUDIO_LONGITUDE, 80, 100, '半径改为 80']
        )
        const fence = await db.query<{ radius_meters: number }>(
            `SELECT radius_meters FROM public.studio_geofence WHERE id`
        )
        assert.equal(fence.rows[0]?.radius_meters, 80)
        const fenceAudits = await db.query<{ previous_radius_meters: number; radius_meters: number }>(
            `SELECT previous_radius_meters, radius_meters FROM public.studio_geofence_audits`
        )
        assert.equal(fenceAudits.rows.length, 1)
        assert.equal(fenceAudits.rows[0]?.previous_radius_meters, 50)
        assert.equal(fenceAudits.rows[0]?.radius_meters, 80)

        await db.exec(`UPDATE public.members SET role = '干事' WHERE id = '${MEMBER_ID}'`)
        await expectDatabaseError(
            () => db.query(
                `SELECT public.mark_duty_sign_in_invalid($1::uuid, $2::text)`,
                [backfill.rows[0]?.id, '干事不能作废']
            ),
            'not_admin'
        )

        await db.exec(`SET ROLE authenticated`)
        try {
            const visible = await db.query<{ count: number }>(
                `SELECT count(*)::int AS count FROM public.studio_geofence`
            )
            assert.equal(visible.rows[0]?.count, 1)
            await expectDatabaseError(
                () => db.exec(`UPDATE public.studio_geofence SET radius_meters = 60 WHERE id`),
                'permission denied'
            )
            await expectDatabaseError(
                () => db.exec(`UPDATE public.duty_logs SET latitude = ${STUDIO_LATITUDE}`),
                'permission denied'
            )
        } finally {
            await db.exec(`RESET ROLE`)
        }

        const signatures = [
            'public.admin_backfill_duty_sign_in(uuid, timestamp with time zone, text)',
            'public.evaluate_duty_sign_in_window(uuid, timestamp with time zone, boolean)',
            'public.update_studio_geofence(double precision, double precision, double precision, double precision, text)',
            'public.mark_duty_sign_in_invalid(uuid, text)',
            'public.current_member_id()',
            'public.is_china_public_holiday(date)',
            'public.duty_sign_in_instant()',
            'public.assert_duty_admin(text)',
            'public.prevent_duty_sign_in_column_update()',
        ]
        for (const signature of signatures) {
            const found = await db.query<{ ok: string | null }>(
                `SELECT to_regprocedure($1)::text AS ok`,
                [signature]
            )
            assert.ok(found.rows[0]?.ok, `missing ${signature}`)
        }
    } finally {
        await db.close()
    }
})

test('duty log deletes are audited and authenticated cannot delete directly', { timeout: 120_000 }, async () => {
    const db = new PGlite()
    try {
        await db.exec(FIXTURE_SQL)
        await db.exec(migrationSql())
        await db.exec(enforcementSql())
        await db.exec(storedInstantSql())
        await db.exec(deleteAuditSql())

        const inserted = await db.query<{ id: string }>(`
            INSERT INTO public.duty_logs (member_id, location_verified, latitude, longitude, accuracy_meters)
            VALUES ('${MEMBER_ID}', false, ${STUDIO_LATITUDE}, ${STUDIO_LONGITUDE}, 5)
            RETURNING id
        `)
        const logId = inserted.rows[0]?.id
        assert.ok(logId)
        await db.exec(`DELETE FROM public.duty_logs WHERE id = '${logId}'`)
        assert.equal(await logCount(db), 0)

        const direct = await db.query<{
            reason: string
            actor_session_user: string
            duty_log_id: string
            snapshot_id: string
            snapshot_member: string
            snapshot_latitude: string
        }>(`
            SELECT
              reason,
              actor_session_user,
              duty_log_id::text,
              row_snapshot->>'id' AS snapshot_id,
              row_snapshot->>'member_id' AS snapshot_member,
              row_snapshot->>'latitude' AS snapshot_latitude
            FROM public.duty_sign_in_admin_events
            WHERE action = 'delete'
        `)
        assert.equal(direct.rows.length, 1)
        assert.equal(direct.rows[0]?.reason, 'direct delete')
        assert.equal(direct.rows[0]?.actor_session_user, 'postgres')
        assert.equal(direct.rows[0]?.duty_log_id, logId)
        assert.equal(direct.rows[0]?.snapshot_id, logId)
        assert.equal(direct.rows[0]?.snapshot_member, MEMBER_ID)
        assert.ok(direct.rows[0]?.snapshot_latitude)

        await db.exec(`
            CREATE OR REPLACE FUNCTION auth.uid()
            RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
            CREATE OR REPLACE FUNCTION auth.jwt()
            RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
        `)
        const anonymous = await db.query<{ id: string }>(`
            INSERT INTO public.duty_logs (member_id, location_verified, latitude, longitude, accuracy_meters)
            VALUES ('${MEMBER_ID}', false, ${STUDIO_LATITUDE}, ${STUDIO_LONGITUDE}, 5)
            RETURNING id
        `)
        await db.exec(`DELETE FROM public.duty_logs WHERE id = '${anonymous.rows[0]?.id}'`)
        const unsigned = await db.query<{ actor_member_id: string | null; actor_uid: string | null }>(`
            SELECT actor_member_id::text, actor_uid::text
            FROM public.duty_sign_in_admin_events
            WHERE duty_log_id = '${anonymous.rows[0]?.id}'
        `)
        assert.equal(unsigned.rows[0]?.actor_member_id ?? null, null)
        assert.equal(unsigned.rows[0]?.actor_uid ?? null, null)

        await db.exec(`
            CREATE OR REPLACE FUNCTION auth.uid()
            RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '${MEMBER_ID}'::uuid $$;
            CREATE OR REPLACE FUNCTION auth.jwt()
            RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{"email":"member@example.com"}'::jsonb $$;
        `)
        await db.exec(`UPDATE public.members SET role = '干事' WHERE id = '${MEMBER_ID}'`)
        const kept = await db.query<{ id: string }>(`
            INSERT INTO public.duty_logs (member_id, location_verified, latitude, longitude, accuracy_meters)
            VALUES ('${MEMBER_ID}', false, ${STUDIO_LATITUDE}, ${STUDIO_LONGITUDE}, 5)
            RETURNING id
        `)
        await expectDatabaseError(
            () => db.query(
                `SELECT public.delete_duty_sign_in($1::uuid, $2::text)`,
                [kept.rows[0]?.id, '干事不能删']
            ),
            'not_admin'
        )
        assert.equal(await logCount(db), 1)

        await db.exec(`UPDATE public.members SET role = '主席' WHERE id = '${MEMBER_ID}'`)
        await expectDatabaseError(
            () => db.query(
                `SELECT public.delete_duty_sign_in($1::uuid, $2::text)`,
                ['00000000-0000-4000-8000-000000000099', '不存在的记录']
            ),
            'log_not_found'
        )
        await expectDatabaseError(
            () => db.query(
                `SELECT public.delete_duty_sign_in($1::uuid, $2::text)`,
                [kept.rows[0]?.id, '   ']
            ),
            'reason_required'
        )
        await db.query(
            `SELECT public.delete_duty_sign_in($1::uuid, $2::text)`,
            [kept.rows[0]?.id, '误删这条签到']
        )
        assert.equal(await logCount(db), 0)
        const audited = await db.query<{
            reason: string
            actor_member_id: string
            actor_uid: string
        }>(`
            SELECT reason, actor_member_id::text, actor_uid::text
            FROM public.duty_sign_in_admin_events
            WHERE action = 'delete' AND duty_log_id = '${kept.rows[0]?.id}'
        `)
        assert.equal(audited.rows.length, 1)
        assert.equal(audited.rows[0]?.reason, '误删这条签到')
        assert.equal(audited.rows[0]?.actor_member_id, MEMBER_ID)
        assert.equal(audited.rows[0]?.actor_uid, MEMBER_ID)

        const another = await db.query<{ id: string }>(`
            INSERT INTO public.duty_logs (member_id, location_verified, latitude, longitude, accuracy_meters)
            VALUES ('${MEMBER_ID}', false, ${STUDIO_LATITUDE}, ${STUDIO_LONGITUDE}, 5)
            RETURNING id
        `)
        await db.exec(`SET ROLE authenticated`)
        try {
            await expectDatabaseError(
                () => db.exec(`DELETE FROM public.duty_logs WHERE id = '${another.rows[0]?.id}'`),
                'permission denied'
            )
        } finally {
            await db.exec(`RESET ROLE`)
        }
        assert.equal(await logCount(db), 1)

        await db.exec(`DELETE FROM public.members WHERE id = '${MEMBER_ID}'`)
        const cascaded = await db.query<{ snapshot_member: string; actor_member_id: string | null }>(`
            SELECT row_snapshot->>'member_id' AS snapshot_member, actor_member_id::text
            FROM public.duty_sign_in_admin_events
            WHERE duty_log_id = '${another.rows[0]?.id}'
        `)
        assert.equal(cascaded.rows[0]?.snapshot_member, MEMBER_ID)
        assert.equal(cascaded.rows[0]?.actor_member_id ?? null, null)
        assert.equal(await logCount(db), 0)
    } finally {
        await db.close()
    }
})

function localClockSql() {
    const seed = readFileSync(path.join(process.cwd(), 'supabase/seed.sql'), 'utf8')
    const start = seed.indexOf('-- BEGIN verify-local-duty-clock')
    const end = seed.indexOf('-- END verify-local-duty-clock')
    assert.ok(start >= 0 && end > start, 'seed is missing the local duty clock markers')
    return seed.slice(start, end)
}

test('local seed clock controls sign-in time and stays out of migrations', { timeout: 120_000 }, async () => {
    const enforcement = enforcementSql()
    assert.equal(enforcement.includes('duty_sign_in_clock'), false)
    assert.match(enforcement, /session_user IN \('postgres', 'supabase_admin'\)/)

    const db = new PGlite()
    try {
        await db.exec(FIXTURE_SQL)
        await db.exec(migrationSql())
        await db.exec(enforcementSql())
        await db.exec(storedInstantSql())
        const production = await db.query<{ def: string }>(
            `SELECT pg_get_functiondef('public.duty_sign_in_instant()'::regprocedure) AS def`
        )
        assert.equal(production.rows[0]?.def.includes('duty_sign_in_clock'), false)

        await db.exec(localClockSql())
        await db.query(`SELECT set_config('duty.sign_in_at', '', false)`)

        const followsNow = await db.query<{ ok: boolean }>(
            `SELECT abs(extract(epoch FROM (public.duty_sign_in_instant() - now()))) < 5 AS ok`
        )
        assert.equal(followsNow.rows[0]?.ok, true)

        await db.exec(`
            INSERT INTO public.duty_rosters (member_id, day_of_week, period)
            VALUES ('${MEMBER_ID}', 4, 1)
        `)
        await db.query(`SELECT set_config('duty.sign_in_at', '2026-10-15 04:10:00+00', false)`)
        await db.exec(`
            INSERT INTO public.duty_sign_in_clock (id, clock_at)
            VALUES (true, timestamptz '2026-10-15 00:30:00+00')
        `)

        const pinned = await db.query<{ ok: boolean }>(
            `SELECT public.duty_sign_in_instant() = timestamptz '2026-10-15 00:30:00+00' AS ok`
        )
        assert.equal(pinned.rows[0]?.ok, true)
        assert.equal(await signIn(db, STUDIO_LATITUDE, STUDIO_LONGITUDE, 5, 'pixel'), 'signed_in')

        const stored = await db.query<{ sign_in_time: string; sign_in_date: string }>(`
            SELECT sign_in_time::text, sign_in_date::text
            FROM public.duty_logs
        `)
        assert.equal(stored.rows.length, 1)
        assert.equal(stored.rows[0]?.sign_in_date, '2026-10-15')
        assert.match(stored.rows[0]?.sign_in_time ?? '', /2026-10-15/)

        await db.exec(`DELETE FROM public.duty_logs`)
        await db.exec(`
            UPDATE public.duty_sign_in_clock
            SET clock_at = timestamptz '2026-10-15 04:10:00+00'
            WHERE id
        `)
        await expectDatabaseError(
            () => signIn(db, STUDIO_LATITUDE, STUDIO_LONGITUDE, 5),
            'outside_shift_window'
        )
        assert.equal(await logCount(db), 0)

        await db.exec(`DELETE FROM public.duty_sign_in_clock`)
        await db.query(`SELECT set_config('duty.sign_in_at', '', false)`)
        const restored = await db.query<{ ok: boolean }>(
            `SELECT abs(extract(epoch FROM (public.duty_sign_in_instant() - now()))) < 5 AS ok`
        )
        assert.equal(restored.rows[0]?.ok, true)

        await db.exec(`SET ROLE authenticated`)
        try {
            await expectDatabaseError(
                () => db.exec(`
                    INSERT INTO public.duty_sign_in_clock (id, clock_at)
                    VALUES (true, timestamptz '2026-10-15 00:30:00+00')
                `),
                'permission denied'
            )
        } finally {
            await db.exec(`RESET ROLE`)
        }
    } finally {
        await db.close()
    }
})
