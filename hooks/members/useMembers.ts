import * as React from "react"

import { useToast } from "@/components/ui/toast-simple"
import type { Member } from "@/app/members/MembersClient"

import { exportMembersToCSV as downloadMembersToCSV } from "./export-members-csv"
import { useMemberCrud } from "./useMemberCrud"
import { useMemberSearch } from "./useMemberSearch"
export type { MemberSortConfig, MemberSortDirection, MemberSortKey } from "./member-search"

export function useMembers(initialMembers: Member[]) {
    const { toast } = useToast()
    const [showInactiveMembers, setShowInactiveMembers] = React.useState(false)
    const [currentPage, setCurrentPage] = React.useState(1)
    const itemsPerPage = 7

    const {
        optimisticMembers,
        isDialogOpen,
        setIsDialogOpen,
        editingMember,
        isSubmitting,
        handleSave,
        handleDelete,
        openEdit,
        openCreate,
    } = useMemberCrud(initialMembers)

    const resetToFirstPage = React.useCallback(() => {
        setCurrentPage(1)
    }, [])

    const {
        searchQuery,
        setSearchQuery,
        sortConfig,
        toggleSort,
        sortedMembers,
    } = useMemberSearch(optimisticMembers, { onSortChange: resetToFirstPage })

    const activeMembers = React.useMemo(
        () => sortedMembers.filter((member) => (member.status || "active") !== "inactive"),
        [sortedMembers]
    )

    const inactiveMembers = React.useMemo(
        () => sortedMembers.filter((member) => (member.status || "active") === "inactive"),
        [sortedMembers]
    )

    const inactiveMemberCount = React.useMemo(
        () => optimisticMembers.filter((member) => (member.status || "active") === "inactive").length,
        [optimisticMembers]
    )

    const totalPages = Math.ceil(activeMembers.length / itemsPerPage)

    React.useEffect(() => {
        if (currentPage > totalPages && totalPages > 0) {
            setCurrentPage(totalPages)
        } else if (totalPages === 0 && currentPage !== 1) {
            setCurrentPage(1)
        }
    }, [activeMembers.length, totalPages, currentPage])

    const exportMembersToCSV = React.useCallback(() => {
        const exported = downloadMembersToCSV(sortedMembers)
        if (exported) return

        toast({
            title: "导出失败",
            description: "当前搜索条件下没有可导出的成员列表。",
            variant: "destructive",
        })
    }, [sortedMembers, toast])

    return {
        searchQuery,
        setSearchQuery,
        isDialogOpen,
        setIsDialogOpen,
        editingMember,
        isSubmitting,
        showInactiveMembers,
        setShowInactiveMembers,
        currentPage,
        setCurrentPage,
        itemsPerPage,
        totalPages,
        sortConfig,
        toggleSort,
        activeMembers,
        inactiveMembers,
        inactiveMemberCount,
        filteredMembers: sortedMembers,
        handleSave,
        handleDelete,
        openEdit,
        openCreate,
        exportMembersToCSV,
    }
}
