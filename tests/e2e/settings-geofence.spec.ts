import fs from 'node:fs'
import path from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { gotoProtectedPath, loginWithPassword, requireEnv } from './helpers/auth'

async function openGeofence(page: Page) {
    await gotoProtectedPath(page, '/settings')
    await page.getByRole('tab', { name: '工作室围栏' }).click()
    await expect(page.locator('#geofence-radius')).toBeVisible()
    await expect(page.locator('#geofence-radius')).not.toHaveValue('')
}

test('member settings hide the studio geofence control', async ({ page }) => {
    test.setTimeout(60_000)
    const env = requireEnv(['E2E_MEMBER_EMAIL', 'E2E_MEMBER_PASSWORD'])

    await loginWithPassword(page, env.E2E_MEMBER_EMAIL, env.E2E_MEMBER_PASSWORD)
    await gotoProtectedPath(page, '/settings')

    await expect(page.getByRole('heading', { name: '设置中心' })).toBeVisible()
    await expect(page.getByRole('tab', { name: '工作室围栏' })).toHaveCount(0)
    await expect(page.locator('#geofence-radius')).toHaveCount(0)
})

test('admin can update the studio geofence from settings and see the audit', async ({ page }) => {
    test.setTimeout(90_000)
    const env = requireEnv(['E2E_ADMIN_EMAIL', 'E2E_ADMIN_PASSWORD'])

    await loginWithPassword(page, env.E2E_ADMIN_EMAIL, env.E2E_ADMIN_PASSWORD)
    await openGeofence(page)

    const radius = page.locator('#geofence-radius')
    const accuracy = page.locator('#geofence-accuracy')
    const latitude = page.locator('#geofence-latitude')
    const longitude = page.locator('#geofence-longitude')
    const reason = page.locator('#geofence-reason')
    const save = page.getByRole('button', { name: '保存围栏' })

    const original = {
        radius: await radius.inputValue(),
        accuracy: await accuracy.inputValue(),
        latitude: await latitude.inputValue(),
        longitude: await longitude.inputValue(),
    }
    const nextRadius = original.radius === '80' ? '70' : '80'
    let saved = false

    try {
        await radius.fill('10')
        await reason.fill('半径太小')
        await save.click()
        await expect(page.getByRole('alert')).toContainText('围栏半径必须在 20 到 200 米之间。')

        await radius.fill(nextRadius)
        await reason.fill(`半径改为 ${nextRadius}`)
        const savedResponse = page.waitForResponse(
            (response) => response.url().includes('/rest/v1/rpc/update_studio_geofence') && response.request().method() === 'POST'
        )
        await save.click()
        expect((await savedResponse).ok()).toBeTruthy()
        await expect(page.getByRole('status')).toContainText('围栏已更新')
        await expect(page.getByText(`半径改为 ${nextRadius}`).first()).toBeVisible()
        await expect(radius).toHaveValue(nextRadius)
        saved = true

        const artifactDir = '/opt/cursor/artifacts'
        fs.mkdirSync(artifactDir, { recursive: true })
        await page.screenshot({
            path: path.join(artifactDir, 'settings_geofence_admin.png'),
            fullPage: true,
        })
    } finally {
        if (saved) {
            await openGeofence(page)
            await latitude.fill(original.latitude)
            await longitude.fill(original.longitude)
            await radius.fill(original.radius)
            await accuracy.fill(original.accuracy)
            await reason.fill('恢复原来的围栏')
            const restoredResponse = page.waitForResponse(
                (response) => response.url().includes('/rest/v1/rpc/update_studio_geofence') && response.request().method() === 'POST'
            )
            await save.click()
            expect((await restoredResponse).ok()).toBeTruthy()
            await expect(page.getByText('恢复原来的围栏').first()).toBeVisible()
            await expect(radius).toHaveValue(original.radius)
        }
    }
})
