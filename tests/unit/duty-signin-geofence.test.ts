import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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
