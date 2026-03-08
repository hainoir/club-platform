import { test, expect } from '@playwright/test';

test('核心用户旅程: 网页基本加载与导航', async ({ page }) => {
    // 1. 访问首页，等待渲染完成
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 2. 验证导航栏是否存在
    await expect(page.getByRole('navigation')).toBeVisible();

    // 3. 尝试找到侧边栏并导航至“活动与课程”或“Members”页面
    // 在实际测试中，应根据精确的 data-testid 或者角色导航进行定位
    const eventLink = page.getByRole('link', { name: /活动|课程/ }).first();
    if (await eventLink.count() > 0) {
        await eventLink.click();
        await expect(page).toHaveURL(/.*events/);
        await expect(page.locator('h2', { hasText: '活动与课程' })).toBeVisible();
    }
});
