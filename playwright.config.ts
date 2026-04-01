import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const externallyDefinedEnvKeys = new Set(Object.keys(process.env));

function loadLocalEnvFile(filePath: string) {
    if (!fs.existsSync(filePath)) return;

    const content = fs.readFileSync(filePath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!match) continue;

        const [, name, rawValue] = match;
        if (externallyDefinedEnvKeys.has(name)) continue;

        let value = rawValue.trim();
        if (
            value.length >= 2 &&
            ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
        ) {
            value = value.slice(1, -1);
        }

        process.env[name] = value;
    }
}

loadLocalEnvFile(path.resolve(process.cwd(), '.env'));
loadLocalEnvFile(path.resolve(process.cwd(), '.env.local'));

const playwrightPort = Number(process.env.PLAYWRIGHT_PORT || 3001);
const baseURL = `http://localhost:${playwrightPort}`;
const webServerCommand =
    process.env.PLAYWRIGHT_WEB_SERVER_COMMAND ||
    process.env.PLAYWRIGHT_DEV_COMMAND ||
    `npm run build && npm run start -- --port ${playwrightPort}`;

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    use: {
        baseURL,
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        command: webServerCommand,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 300 * 1000,
    },
});
