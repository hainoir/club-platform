import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../../..')
const evidence = path.join(root, '.verification-artifacts/evidence/duty-sign-in')
const dbUrlFile = path.join(root, '.verification-artifacts/run/db.url')
const appUrl = 'http://127.0.0.1:3001'
const memberEmail = 'e2e.member@club.local'
const memberPassword = 'e2e-member-pass'
const adminEmail = 'e2e.admin@club.local'
const adminPassword = 'e2e-admin-pass'
const memberName = 'E2E 成员'
const periodLabels = {
  1: '第一大节',
  2: '第二大节',
  3: '第三大节',
  4: '第四大节',
}

const result = { steps: [] }

function record(name, status, detail) {
  result.steps.push({ name, status, detail })
  process.stdout.write(`${status} ${name}: ${detail}\n`)
}

function psql(sql) {
  const dbUrl = fs.readFileSync(dbUrlFile, 'utf8').trim()
  const query = spawnSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], {
    encoding: 'utf8',
  })
  if (query.status !== 0) {
    throw new Error((query.stderr || 'psql failed').trim())
  }
  return query.stdout.trim()
}

function writeResult() {
  fs.mkdirSync(evidence, { recursive: true })
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2))
}

function classWindow(period) {
  const windows = {
    1: [8 * 60, 9 * 60 + 35],
    2: [10 * 60 + 5, 11 * 60 + 40],
    3: [13 * 60 + 30, 15 * 60 + 5],
    4: [15 * 60 + 35, 17 * 60 + 10],
  }
  return windows[period]
}

function dbWindow(minutes) {
  if (minutes >= 7 * 60 + 30 && minutes <= 9 * 60 + 35) return 1
  if (minutes >= 9 * 60 + 35 && minutes <= 11 * 60 + 40) return 2
  if (minutes >= 13 * 60 && minutes <= 15 * 60 + 5) return 3
  if (minutes >= 15 * 60 + 5 && minutes <= 17 * 60 + 10) return 4
  return 0
}

function shanghaiInstant(dateKey, hour, minute) {
  return new Date(`${dateKey}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+08:00`)
}

async function login(page, email, password) {
  await page.goto('/login')
  await page.locator('#email').waitFor({ timeout: 20_000 })
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 })
  await page.getByTestId('notification-trigger').waitFor({ timeout: 20_000 })
  await waitForAuthLockIdle(page)
}

async function waitForAuthLockIdle(page) {
  const started = Date.now()
  while (Date.now() - started < 15_000) {
    const busy = await page.evaluate(async () => {
      const state = await navigator.locks.query()
      return [...state.held, ...state.pending].some((lock) => String(lock.name).includes('auth-token'))
    })
    if (!busy) return
    await page.waitForTimeout(200)
  }
  throw new Error('lock:sb-127-auth-token stayed busy for 15s. A full document load deadlocks AuthProvider. Stay on the login document and use in-app links.')
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(evidence, name), fullPage: true })
}

async function openMember(browser, when, geolocation) {
  const context = await browser.newContext({
    baseURL: appUrl,
    viewport: { width: 1400, height: 900 },
  })
  if (geolocation) {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation(geolocation)
  }
  const page = await context.newPage()
  await page.clock.setFixedTime(when)
  await login(page, memberEmail, memberPassword)
  await page.getByRole('heading', { name: '我的工作台' }).waitFor({ timeout: 20_000 })
  return { context, page }
}

async function readButton(page) {
  const names = [
    '立即验证定位并签到',
    '当前不在班次时间内',
    '您未被安排在当前班次',
    '公共假日无需值班',
    '正在验证定位...',
  ]
  for (const name of names) {
    const button = page.getByRole('button', { name, exact: true })
    if (await button.count()) {
      return { name, enabled: await button.first().isEnabled() }
    }
  }
  const banner = page.getByText('今日已签到')
  if (await banner.count()) return { name: '今日已签到', enabled: false }
  return { name: 'missing', enabled: false }
}

async function clickSignIn(page) {
  const button = page.getByRole('button', { name: '立即验证定位并签到', exact: true })
  await button.waitFor({ timeout: 15_000 })
  if (!(await button.isEnabled())) {
    throw new Error('Sign-in button is disabled')
  }
  await button.click()
  const toast = page.getByText(/签到成功|签到失败|定位权限被拒绝|当前位置距离工作室约/)
  await toast.first().waitFor({ timeout: 30_000 })
  return (await page.locator('body').innerText()).slice(0, 4000)
}

const browser = await chromium.launch({ headless: true })
let exitCode = 1

try {
  fs.mkdirSync(evidence, { recursive: true })
  if (!fs.existsSync(dbUrlFile)) {
    throw new Error('Run launch.sh and doctor.sh before drive-duty-sign-in.mjs')
  }

  const clockRow = psql(
    "select to_char(timezone('Asia/Shanghai', now()), 'YYYY-MM-DD') || '|' || to_char(timezone('Asia/Shanghai', now()), 'HH24:MI:SS') || '|' || extract(isodow from timezone('Asia/Shanghai', now()))::int"
  )
  const [dateKey, timeText, dowText] = clockRow.split('|')
  const dow = Number(dowText)
  const [hourText, minuteText] = timeText.split(':')
  const dbMinutes = Number(hourText) * 60 + Number(minuteText)
  const dbPeriod = dbWindow(dbMinutes)
  result.postgresShanghai = { dateKey, timeText, dow, dbPeriod }
  fs.writeFileSync(path.join(evidence, 'postgres-clock.txt'), clockRow + '\n')

  const fenceRow = psql(
    'select latitude || \',\' || longitude || \',\' || radius_meters || \',\' || max_accuracy_meters from public.studio_geofence where id'
  )
  const [latText, lngText, radiusText, accuracyText] = fenceRow.split(',')
  const latitude = Number(latText)
  const longitude = Number(lngText)
  const radiusMeters = Number(radiusText)
  result.fence = { latitude, longitude, radiusMeters, maxAccuracyMeters: Number(accuracyText) }
  fs.writeFileSync(path.join(evidence, 'studio-geofence.txt'), fenceRow + '\n')

  const adminContext = await browser.newContext({
    baseURL: appUrl,
    viewport: { width: 1400, height: 900 },
  })
  const adminPage = await adminContext.newPage()
  await login(adminPage, adminEmail, adminPassword)
  await adminPage.getByRole('heading', { name: '值班管理' }).waitFor({ timeout: 20_000 })

  await adminPage.getByRole('link', { name: '设置中心' }).click()
  await adminPage.getByRole('heading', { name: '设置中心' }).waitFor()
  const geofenceTab = adminPage.getByRole('tab', { name: '工作室围栏' })
  if ((await geofenceTab.count()) === 0) {
    await shot(adminPage, 'settings.png')
    record(
      'admin-geofence',
      'fail',
      'No 工作室围栏 tab. The user path cannot write studio_geofence_audits.'
    )
  } else {
    await geofenceTab.click()
    const radiusInput = adminPage.locator('#geofence-radius')
    await radiusInput.waitFor()
    const originalRadius = await radiusInput.inputValue()
    const nextRadius = originalRadius === '80' ? '70' : '80'
    const beforeAudits = Number(psql('select count(*) from public.studio_geofence_audits'))
    await radiusInput.fill('10')
    await adminPage.locator('#geofence-reason').fill('半径太小')
    await adminPage.getByRole('button', { name: '保存围栏' }).click()
    await adminPage.getByText('围栏半径必须在 20 到 200 米之间。').waitFor()
    const blockedAudits = Number(psql('select count(*) from public.studio_geofence_audits'))
    const saveFence = async () => {
      const response = adminPage.waitForResponse(
        (res) => res.url().includes('/rest/v1/rpc/update_studio_geofence') && res.request().method() === 'POST'
      )
      await adminPage.getByRole('button', { name: '保存围栏' }).click()
      const rpc = await response
      if (!rpc.ok()) throw new Error(`update_studio_geofence failed: ${rpc.status()}`)
      await adminPage.getByRole('status').getByText('围栏已更新').waitFor({ timeout: 15_000 })
    }
    await radiusInput.fill(nextRadius)
    await adminPage.locator('#geofence-reason').fill(`半径改为 ${nextRadius}`)
    await saveFence()
    const savedRadius = Number(psql('select radius_meters from public.studio_geofence where id'))
    const afterAudits = Number(psql('select count(*) from public.studio_geofence_audits'))
    await shot(adminPage, 'settings.png')
    await radiusInput.fill(originalRadius)
    await adminPage.locator('#geofence-reason').fill('恢复验证前的围栏')
    await saveFence()
    const restoredRadius = Number(psql('select radius_meters from public.studio_geofence where id'))
    const boundsHeld = blockedAudits === beforeAudits
    const saved = savedRadius === Number(nextRadius) && afterAudits === beforeAudits + 1
    const restored = restoredRadius === Number(originalRadius)
    record(
      'admin-geofence',
      boundsHeld && saved && restored ? 'pass' : 'fail',
      `bounds=${boundsHeld} saved=${savedRadius} audits=${beforeAudits}->${afterAudits} restored=${restoredRadius}`
    )
  }

  if (dow < 1 || dow > 5) {
    record('assign-roster', 'fail', `Shanghai weekday is ${dow}. The duty table only has Monday through Friday.`)
    throw new Error('stop')
  }

  await adminPage.getByRole('link', { name: '值班管理' }).click()
  await adminPage.getByRole('heading', { name: '值班管理' }).waitFor()
  await waitForAuthLockIdle(adminPage)
  const row = adminPage.getByRole('row', { name: new RegExp(periodLabels[1]) })
  const cell = row.getByRole('cell').nth(dow)
  const assign = cell.getByRole('button', { name: '指派成员' })
  if ((await assign.count()) === 0) {
    record('assign-roster', 'fail', 'The admin duty table has no 指派成员 button in the target cell.')
    await shot(adminPage, 'assign-missing.png')
    throw new Error('stop')
  }
  await assign.click()
  await adminPage.getByPlaceholder('搜索姓名或学号...').fill(memberName)
  await adminPage.getByRole('button', { name: memberName, exact: true }).click()
  await cell.getByText(memberName).waitFor({ timeout: 15_000 })
  await shot(adminPage, 'roster-assigned.png')
  const rosterCount = psql(
    `select count(*) from public.duty_rosters r join public.members m on m.id = r.member_id where m.email = '${memberEmail}' and r.day_of_week = ${dow} and r.period = 1`
  )
  fs.writeFileSync(path.join(evidence, 'duty-rosters.txt'), rosterCount + '\n')
  if (rosterCount !== '1') {
    record('assign-roster', 'fail', `UI showed ${memberName} but duty_rosters count is ${rosterCount}.`)
    throw new Error('stop')
  }
  record('assign-roster', 'pass', `duty_rosters has ${memberName} on weekday ${dow} period 1.`)
  await adminContext.close()

  const buttonCases = [
    { id: 'button-in-period', when: shanghaiInstant(dateKey, 8, 30), expectName: '立即验证定位并签到', expectEnabled: true },
    { id: 'button-outside-class', when: shanghaiInstant(dateKey, 12, 10), expectName: '当前不在班次时间内', expectEnabled: false },
    { id: 'button-not-rostered', when: shanghaiInstant(dateKey, 10, 10), expectName: '您未被安排在当前班次', expectEnabled: false },
    { id: 'button-holiday', when: shanghaiInstant('2026-10-01', 8, 30), expectName: '公共假日无需值班', expectEnabled: false },
  ]

  let inPeriodReady = false
  for (const item of buttonCases) {
    const opened = await openMember(browser, item.when, null)
    const seen = await readButton(opened.page)
    await shot(opened.page, `${item.id}.png`)
    await opened.context.close()
    const matched = seen.name === item.expectName && seen.enabled === item.expectEnabled
    record(item.id, matched ? 'pass' : 'fail', `saw ${seen.name} enabled=${seen.enabled}`)
    if (item.id === 'button-in-period' && matched) inPeriodReady = true
  }

  if (!inPeriodReady) {
    record('inside-fence', 'fail', 'The enabled sign-in button was not shown, so the click journeys were not run.')
    throw new Error('stop')
  }

  const outside = await openMember(browser, shanghaiInstant(dateKey, 8, 30), {
    latitude: latitude + (radiusMeters + 500) / 111320,
    longitude,
    accuracy: 10,
  })
  const outsideText = await clickSignIn(outside.page)
  await shot(outside.page, 'outside-fence.png')
  await outside.context.close()
  const outsideLogs = psql(
    `select count(*) from public.duty_logs d join public.members m on m.id = d.member_id where m.email = '${memberEmail}'`
  )
  const outsideRejected = /当前位置距离工作室约 \d+ 米，超出允许范围。/.test(outsideText) && outsideLogs === '0'
  record(
    'outside-fence',
    outsideRejected ? 'pass' : 'fail',
    outsideRejected ? 'Client rejected the point and duty_logs stayed empty.' : `logs=${outsideLogs}`
  )
  if (!outsideRejected) throw new Error('stop')

  const denied = await openMember(browser, shanghaiInstant(dateKey, 8, 30), null)
  const deniedText = await clickSignIn(denied.page)
  await shot(denied.page, 'no-coords.png')
  await denied.context.close()
  const deniedLogs = psql(
    `select count(*) from public.duty_logs d join public.members m on m.id = d.member_id where m.email = '${memberEmail}'`
  )
  const deniedOk = /定位权限被拒绝/.test(deniedText) && deniedLogs === '0'
  record(
    'no-coords',
    deniedOk ? 'pass' : 'fail',
    deniedOk ? 'Permission denial wrote no duty_logs row.' : `logs=${deniedLogs}`
  )
  if (!deniedOk) throw new Error('stop')

  const inside = await openMember(browser, shanghaiInstant(dateKey, 8, 30), {
    latitude,
    longitude,
    accuracy: 10,
  })
  const insideText = await clickSignIn(inside.page)
  await shot(inside.page, 'inside-fence.png')
  await inside.context.close()
  const logDump = psql(
    `select coalesce(sign_in_date::text,'') || '|' || coalesce(location_verified::text,'') || '|' || coalesce(latitude::text,'') || '|' || coalesce(longitude::text,'') || '|' || coalesce(distance_meters::text,'') from public.duty_logs d join public.members m on m.id = d.member_id where m.email = '${memberEmail}'`
  )
  fs.writeFileSync(path.join(evidence, 'duty-logs.txt'), (logDump || '(no rows)') + '\n')

  if (/已完成位置验证并记录到值班考勤/.test(insideText) && logDump) {
    const [signInDate, verified, rowLat, rowLng] = logDump.split('|')
    const shanghaiDate = psql("select timezone('Asia/Shanghai', now())::date::text")
    const dateOk = signInDate === shanghaiDate && verified === 'true'
    record(
      'inside-fence',
      dateOk ? 'pass' : 'fail',
      `row date=${signInDate} verified=${verified} lat=${rowLat} lng=${rowLng} shanghai=${shanghaiDate}`
    )
    const again = await openMember(browser, shanghaiInstant(dateKey, 8, 30), {
      latitude,
      longitude,
      accuracy: 10,
    })
    const againButton = await readButton(again.page)
    await shot(again.page, 'one-per-day.png')
    await again.context.close()
    const rowCount = psql(
      `select count(*) from public.duty_logs d join public.members m on m.id = d.member_id where m.email = '${memberEmail}' and d.sign_in_date = '${signInDate}'`
    )
    const once = againButton.name === '今日已签到' && rowCount === '1'
    record('one-per-day', once ? 'pass' : 'fail', `button=${againButton.name} rows=${rowCount}`)
    record('shanghai-date', dateOk ? 'pass' : 'fail', `sign_in_date=${signInDate} shanghai_today=${shanghaiDate}`)
  } else if (/当前不在值班签到时段/.test(insideText) && !logDump) {
    record(
      'inside-fence',
      'fail',
      `Postgres time ${timeText} is period ${dbPeriod}. The browser clock was 08:30 and the RPC rejected outside_shift_window. No duty_logs row.`
    )
    record('one-per-day', 'fail', 'No first row, so a second sign-in was not attempted.')
    record('shanghai-date', 'fail', 'No duty_logs row, so sign_in_date was not observed.')
  } else {
    record('inside-fence', 'fail', 'Unexpected sign-in result. See inside-fence.png and duty-logs.txt.')
    throw new Error('stop')
  }

  const failed = result.steps.filter((step) => step.status === 'fail')
  exitCode = failed.length === 0 ? 0 : 2
} catch (error) {
  if (error instanceof Error && error.message !== 'stop') {
    record('harness', 'fail', error.stack || error.message)
  }
  exitCode = result.steps.some((step) => step.name === 'harness') ? 1 : 2
} finally {
  await browser.close()
  writeResult()
}

process.exit(exitCode)
