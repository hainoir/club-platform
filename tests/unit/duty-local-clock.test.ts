import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const scripts = path.join(root, '.cursor/skills/verify-club-platform/scripts')

test('verification preload starts Date at the duty slot and keeps moving', () => {
    const preload = path.join(scripts, 'freeze-duty-clock.cjs')
    const clock = path.join(scripts, 'duty-clock.txt')
    const pinnedText = readFileSync(clock, 'utf8').trim()
    const script = `
      const started = Date.now()
      const seen = new Date().toISOString()
      const explicit = new Date('2020-01-01T00:00:00.000Z').toISOString()
      setTimeout(() => {
        process.stdout.write(JSON.stringify({ seen, explicit, advanced: Date.now() - started }))
      }, 40)
    `
    const result = spawnSync(process.execPath, ['-e', script], {
        encoding: 'utf8',
        env: {
            ...process.env,
            VERIFY_DUTY_CLOCK_FILE: clock,
            NODE_OPTIONS: `--require ${preload}`,
        },
    })
    assert.equal(result.status, 0, result.stderr)
    const body = JSON.parse(result.stdout) as { seen: string; explicit: string; advanced: number }
    assert.equal(body.explicit, '2020-01-01T00:00:00.000Z')
    const delta = Math.abs(Date.parse(body.seen) - Date.parse(pinnedText))
    assert.ok(delta < 2000, `saw ${body.seen} for ${pinnedText}`)
    assert.ok(body.advanced >= 20, `clock advanced ${body.advanced}ms`)
})

test('duty enforcement migration does not mention the local clock table', () => {
    const sql = readFileSync(
        path.join(root, 'supabase/migrations/20261015092000_duty_sign_in_enforcement.sql'),
        'utf8'
    )
    assert.equal(sql.includes('duty_sign_in_clock'), false)
    assert.match(sql, /session_user IN \('postgres', 'supabase_admin'\)/)
    for (const name of ['20261015080916_core_tables.sql', '20261015080917_functions_and_triggers.sql', '20261015083723_duty_signin_geofence.sql', '20261015120000_duty_sign_in_delete_audit.sql']) {
        const body = readFileSync(path.join(root, 'supabase/migrations', name), 'utf8')
        assert.equal(body.includes('duty_sign_in_clock'), false, name)
    }
})
