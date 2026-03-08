import { test, expect } from '@playwright/test';

test.describe('值班与考勤大厅前端挂载与视图', () => {

    test('未登录状态下能够访问值班大厅路由并看到主表格与考勤机UI', async ({ page }) => {
        // 1. 访问首页并导航到值班大厅
        await page.goto('/');

        // 假设桌面端侧边栏有链接 (根据 Sidebar.tsx 中的 name 定位)
        // 考虑到可能是响应式，咱们直接通过路由访问测试也可以，这里模拟点击侧边栏
        const dutyLink = page.getByRole('link', { name: '值班大厅' });
        if (await dutyLink.isVisible()) {
            await dutyLink.click();
        } else {
            await page.goto('/duty');
        }

        // 2. 验证路由跳转和主标题加载
        await expect(page).toHaveURL(/.*\/duty/);
        await expect(page.getByRole('heading', { level: 2, name: '值班与考勤大厅' })).toBeVisible();

        // 3. 验证左侧面板 (打卡机与换班大厅)
        await expect(page.getByRole('heading', { level: 3, name: '值班考勤打卡' })).toBeVisible();
        await expect(page.getByRole('heading', { level: 3, name: '换班与代理大厅' })).toBeVisible();

        // 验证那个带有酷炫雷达动效的打卡按钮存在
        await expect(page.getByRole('button', { name: '立即验证定位并签到' })).toBeVisible();

        // 4. 验证右侧 5x4 课表矩阵表格存在
        const tableHeaders = ['周一', '周二', '周三', '周四', '周五'];
        for (const header of tableHeaders) {
            // 验证表头被渲染
            await expect(page.getByRole('cell', { name: header, exact: true })).toBeVisible();
        }

        // 验证课表的纵轴大节
        await expect(page.getByText('第一大节')).toBeVisible();
        await expect(page.getByText('第四大节')).toBeVisible();

        // 5. 验证未登录状态下，不会出现“报名该岗”的 CTA 按钮 (由 requires currentUserId 控制)
        await expect(page.getByRole('button', { name: '报名该岗' })).toHaveCount(0);
    });
});
