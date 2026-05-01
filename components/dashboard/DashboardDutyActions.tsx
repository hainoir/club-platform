"use client"

import * as React from "react"
import { ClipboardList } from "lucide-react"

import { KeyTransferCard } from "@/components/duty/KeyTransferCard"
import { LeaveModal } from "@/components/duty/LeaveModal"
import { SimpleMember } from "@/components/duty/DutyTable"
import { SwapModal } from "@/components/duty/SwapModal"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RosterWithMember, useDuty } from "@/hooks/useDuty"

interface DashboardDutyActionsProps {
    initialData: RosterWithMember[]
    initialMembers: SimpleMember[]
}

export function DashboardDutyActions({ initialData, initialMembers }: DashboardDutyActionsProps) {
    const dutyManager = useDuty(initialData)
    const {
        refreshApprovedLeaves,
        refreshApprovedSwaps,
        refreshPendingLeaves,
    } = dutyManager

    React.useEffect(() => {
        refreshApprovedLeaves()
        refreshApprovedSwaps()
        refreshPendingLeaves()
    }, [refreshApprovedLeaves, refreshApprovedSwaps, refreshPendingLeaves])

    return (
        <div className="grid gap-4 lg:grid-cols-3">
            <Card className="flex h-full flex-col bg-card/60 shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <ClipboardList className="h-4 w-4 text-primary" />
                        我的值班事务
                    </CardTitle>
                    <CardDescription>请假、代班和钥匙流转都在这里处理。</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-center space-y-2">
                    <SwapModal dutyManager={dutyManager} mode="member" />
                    <LeaveModal dutyManager={dutyManager} allMembers={initialMembers} mode="member" />
                </CardContent>
            </Card>

            <div className="lg:col-span-2 lg:h-full">
                <KeyTransferCard dutyManager={dutyManager} allMembers={initialMembers} mode="member" />
            </div>
        </div>
    )
}
