import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Calendar } from '@/components/ui/calendar'

describe('Calendar', () => {
    it('renders the month grid and preserves selection, disabled days, and navigation', () => {
        const onSelect = vi.fn()
        const { container } = render(
            <Calendar
                mode="single"
                defaultMonth={new Date(2026, 9, 1)}
                selected={new Date(2026, 9, 15)}
                disabled={new Date(2026, 9, 18)}
                onSelect={onSelect}
                formatters={{ formatCaption: (date) => `${date.getFullYear()}-${date.getMonth() + 1}` }}
            />
        )

        expect(container.querySelector('.rdp-month_grid')?.className).toContain('border-collapse')
        expect(container.querySelector('.rdp-caption_label')?.textContent).toBe('2026-10')
        expect(container.querySelector('[data-selected-single="true"]')?.textContent).toBe('15')

        const dayButtons = Array.from(container.querySelectorAll('button')).filter(
            (button) => /^\d+$/.test(button.textContent?.trim() ?? '')
        )
        const disabledDay = dayButtons.find((button) => button.textContent?.trim() === '18')
        expect(disabledDay?.disabled).toBe(true)

        const nextDay = dayButtons.find((button) => button.textContent?.trim() === '16')
        expect(nextDay).toBeDefined()
        fireEvent.click(nextDay!)
        expect(onSelect).toHaveBeenCalledWith(
            new Date(2026, 9, 16),
            expect.any(Date),
            expect.any(Object),
            expect.any(Object)
        )

        const previousMonth = container.querySelector('.rdp-button_previous')
        const nextMonth = container.querySelector('.rdp-button_next')
        expect(previousMonth).toBeTruthy()
        expect(nextMonth).toBeTruthy()

        fireEvent.click(nextMonth!)
        expect(container.querySelector('.rdp-caption_label')?.textContent).toBe('2026-11')

        fireEvent.click(previousMonth!)
        expect(container.querySelector('.rdp-caption_label')?.textContent).toBe('2026-10')
        expect(container.querySelector('[data-selected-single="true"]')?.textContent).toBe('15')
    })
})
