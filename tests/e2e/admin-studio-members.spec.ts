import { expect, test } from '@playwright/test'

import { gotoProtectedPath, loginWithPassword, requireEnv } from './helpers/auth'

const DUTY_HALL_TITLE = '\u503c\u73ed\u4e0e\u8003\u52e4\u5927\u5385'
const CURRENT_IN_STUDIO_TEXT_REGEX = /\u5f53\u524d\u5728\u5de5\u4f5c\u5ba4|\u76ee\u524d\u5728\u5de5\u4f5c\u5ba4/
const STUDY_MEMBER_NAME = '\u6d4b\u8bd5\u6210\u5458'
const STUDY_CHIP_TEXT_REGEX = new RegExp(`${STUDY_MEMBER_NAME}\\s*\u81ea\u4e60`)
const DELETE_BUTTON_LABEL = `\u79fb\u9664 ${STUDY_MEMBER_NAME} \u7684\u81ea\u4e60\u8bb0\u5f55`

test.describe('Admin studio members controls', () => {
    test.setTimeout(90_000)

    test('admin can delete a self-study session from the studio card', async ({ page }) => {
        const env = requireEnv(['E2E_ADMIN_EMAIL', 'E2E_ADMIN_PASSWORD'])

        let hasActiveStudy = true
        let deleteRequests = 0
        const now = new Date().toISOString()

        await loginWithPassword(page, env.E2E_ADMIN_EMAIL, env.E2E_ADMIN_PASSWORD)

        await page.route('**/rest/v1/duty_logs*', async (route, request) => {
            if (request.method() !== 'GET') {
                await route.continue()
                return
            }

            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: '[]',
            })
        })

        await page.route('**/rest/v1/studio_sessions*', async (route, request) => {
            if (request.method() === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: hasActiveStudy
                        ? JSON.stringify([
                              {
                                  id: '00000000-0000-0000-0000-000000000011',
                                  member_id: '00000000-0000-0000-0000-000000000022',
                                  started_at: now,
                                  member: {
                                      id: '00000000-0000-0000-0000-000000000022',
                                      name: STUDY_MEMBER_NAME,
                                  },
                              },
                          ])
                        : '[]',
                })
                return
            }

            if (request.method() === 'DELETE') {
                hasActiveStudy = false
                deleteRequests += 1
                await route.fulfill({
                    status: 204,
                    body: '',
                })
                return
            }

            await route.continue()
        })

        await gotoProtectedPath(page, '/duty')
        await expect(page.getByRole('heading', { level: 2, name: DUTY_HALL_TITLE })).toBeVisible({ timeout: 45_000 })
        await expect(page.getByText(CURRENT_IN_STUDIO_TEXT_REGEX)).toBeVisible()

        const deleteButton = page.getByRole('button', { name: DELETE_BUTTON_LABEL }).first()
        await expect(deleteButton).toBeVisible({ timeout: 45_000 })

        const studyChip = page.locator('span').filter({ hasText: STUDY_CHIP_TEXT_REGEX }).first()
        await expect(studyChip).toBeVisible()
        await deleteButton.click()

        await expect.poll(() => deleteRequests, { timeout: 15_000, intervals: [100, 250, 500] }).toBe(1)
        await expect(studyChip).toHaveCount(0)
    })
})
