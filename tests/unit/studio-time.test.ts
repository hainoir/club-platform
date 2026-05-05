import assert from "node:assert/strict"
import test from "node:test"

import {
    buildStudioStudyLeaderboard,
    formatDurationMinutes,
    getSemesterStartDateKey,
    summarizeStudioStudySessions,
} from "../../lib/studio/studio-time.ts"

test("counts a finished session that stays entirely within today", () => {
    const summary = summarizeStudioStudySessions(
        [
            {
                member_id: "member-1",
                started_at: "2026-04-01T01:00:00.000Z",
                ended_at: "2026-04-01T03:30:00.000Z",
                is_active: false,
            },
        ],
        "2026-04-01T12:00:00.000Z"
    )

    assert.equal(summary.todayMinutes, 150)
    assert.equal(summary.weekMinutes, 150)
    assert.equal(summary.monthMinutes, 150)
    assert.equal(summary.semesterMinutes, 150)
    assert.equal(summary.totalMinutes, 150)
    assert.equal(summary.activeCount, 0)
})

test("counts an active session up to now", () => {
    const summary = summarizeStudioStudySessions(
        [
            {
                member_id: "member-1",
                started_at: "2026-04-01T06:00:00.000Z",
                ended_at: null,
                is_active: true,
            },
        ],
        "2026-04-01T08:15:00.000Z"
    )

    assert.equal(summary.todayMinutes, 135)
    assert.equal(summary.totalMinutes, 135)
    assert.equal(summary.activeCount, 1)
})

test("clips an overnight session to today's boundary", () => {
    const summary = summarizeStudioStudySessions(
        [
            {
                member_id: "member-1",
                started_at: "2026-03-31T14:30:00.000Z",
                ended_at: "2026-03-31T17:00:00.000Z",
                is_active: false,
            },
        ],
        "2026-04-01T04:00:00.000Z"
    )

    assert.equal(summary.todayMinutes, 60)
    assert.equal(summary.totalMinutes, 150)
})

test("clips a cross-month session to the current month", () => {
    const summary = summarizeStudioStudySessions(
        [
            {
                member_id: "member-1",
                started_at: "2026-03-31T14:00:00.000Z",
                ended_at: "2026-03-31T18:00:00.000Z",
                is_active: false,
            },
        ],
        "2026-04-01T06:00:00.000Z"
    )

    assert.equal(summary.monthMinutes, 120)
    assert.equal(summary.totalMinutes, 240)
})

test("clips a cross-semester session to the inferred semester boundary", () => {
    const summary = summarizeStudioStudySessions(
        [
            {
                member_id: "member-1",
                started_at: "2026-01-31T15:00:00.000Z",
                ended_at: "2026-02-01T04:00:00.000Z",
                is_active: false,
            },
        ],
        "2026-02-10T00:00:00.000Z"
    )

    assert.equal(summary.semesterMinutes, 720)
    assert.equal(summary.totalMinutes, 780)
})

test("january dates resolve to the previous autumn semester", () => {
    assert.equal(getSemesterStartDateKey("2026-01-15T10:00:00.000Z"), "2025-09-01")
    assert.equal(getSemesterStartDateKey("2026-09-15T10:00:00.000Z"), "2026-09-01")
})

test("ignores invalid sessions in all duration buckets", () => {
    const summary = summarizeStudioStudySessions(
        [
            {
                member_id: "member-1",
                started_at: "not-a-date",
                ended_at: null,
                is_active: false,
            },
            {
                member_id: "member-2",
                started_at: "2026-04-01T04:00:00.000Z",
                ended_at: "2026-04-01T03:00:00.000Z",
                is_active: false,
            },
        ],
        "2026-04-01T12:00:00.000Z"
    )

    assert.deepEqual(summary, {
        todayMinutes: 0,
        weekMinutes: 0,
        monthMinutes: 0,
        semesterMinutes: 0,
        totalMinutes: 0,
        activeCount: 0,
    })
})

test("builds member leaderboard across different windows", () => {
    const leaderboard = buildStudioStudyLeaderboard(
        [
            {
                member_id: "member-1",
                started_at: "2026-04-01T01:00:00.000Z",
                ended_at: "2026-04-01T03:00:00.000Z",
                is_active: false,
                member: { name: "张三" },
            },
            {
                member_id: "member-1",
                started_at: "2026-03-31T10:00:00.000Z",
                ended_at: "2026-03-31T11:00:00.000Z",
                is_active: false,
                member: { name: "张三" },
            },
            {
                member_id: "member-2",
                started_at: "2026-04-01T05:00:00.000Z",
                ended_at: null,
                is_active: true,
                member: { name: "李四" },
            },
            {
                member_id: "member-3",
                started_at: "2026-03-20T01:00:00.000Z",
                ended_at: "2026-03-20T05:00:00.000Z",
                is_active: false,
                member: { name: "王五" },
            },
        ],
        "2026-04-01T08:00:00.000Z"
    )

    assert.equal(leaderboard.activeCount, 1)
    assert.deepEqual(
        leaderboard.today.map((entry) => [entry.name, entry.todayMinutes]),
        [
            ["李四", 180],
            ["张三", 120],
        ]
    )
    assert.deepEqual(
        leaderboard.total.map((entry) => [entry.name, entry.totalMinutes]),
        [
            ["王五", 240],
            ["李四", 180],
            ["张三", 180],
        ]
    )
    assert.equal(leaderboard.total[1].isActive, true)
    assert.equal(leaderboard.total[2].totalMinutes, 180)
})

test("formats duration labels without decimals", () => {
    assert.equal(formatDurationMinutes(0), "0 分钟")
    assert.equal(formatDurationMinutes(45), "45 分钟")
    assert.equal(formatDurationMinutes(120), "2 小时")
    assert.equal(formatDurationMinutes(125), "2 小时 5 分钟")
})

