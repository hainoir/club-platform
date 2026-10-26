import { test, type Page } from '@playwright/test'

import { resolveE2EDutySlotPin } from './duty-slot'

/**
 * Shift browser Date onto today's 10:30 Asia/Shanghai without freezing timers.
 * Install before loginWithPassword. The Next server clock stays real, so the
 * seeded roster must be for today's weekday.
 */
export async function pinBrowserToE2EDutySlot(page: Page, now: Date = new Date()): Promise<void> {
    const pin = resolveE2EDutySlotPin(now)
    if (!pin.ok) {
        test.skip(true, pin.reason)
        return
    }

    const targetMs = pin.targetMs
    await page.addInitScript(`(() => {
        const targetMs = ${targetMs};
        const RealDate = Date;
        const offset = targetMs - RealDate.now();
        function ShiftedDate(...args) {
            const values = args.length === 0 ? [RealDate.now() + offset] : args;
            if (!(this instanceof ShiftedDate)) {
                return new RealDate(...values).toString();
            }
            return new RealDate(...values);
        }
        ShiftedDate.now = () => RealDate.now() + offset;
        ShiftedDate.parse = RealDate.parse.bind(RealDate);
        ShiftedDate.UTC = RealDate.UTC.bind(RealDate);
        ShiftedDate.prototype = RealDate.prototype;
        Object.setPrototypeOf(ShiftedDate, RealDate);
        Date = ShiftedDate;
    })();`)
}
