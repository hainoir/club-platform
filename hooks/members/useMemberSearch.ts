import * as React from "react"

import { useDebounce } from "@/hooks/shared/useDebounce"
import type { Member } from "@/components/members/MembersClient"

import {
    DEFAULT_SORT_CONFIG,
    filterAndSortMembers,
    type MemberSortConfig,
    type MemberSortKey,
} from "./member-search"

interface UseMemberSearchOptions {
    onSortChange?: () => void
}

export function useMemberSearch(members: Member[], options: UseMemberSearchOptions = {}) {
    const { onSortChange } = options
    const [searchQuery, setSearchQuery] = React.useState("")
    const debouncedSearchQuery = useDebounce(searchQuery, 300)
    const [sortConfig, setSortConfig] = React.useState<MemberSortConfig>(DEFAULT_SORT_CONFIG)

    const sortedMembers = React.useMemo(
        () => filterAndSortMembers(members, debouncedSearchQuery, sortConfig),
        [members, debouncedSearchQuery, sortConfig]
    )

    const toggleSort = React.useCallback((key: MemberSortKey) => {
        onSortChange?.()
        setSortConfig((currentSortConfig) => {
            if (currentSortConfig.key !== key) {
                return { key, direction: "asc" }
            }

            if (currentSortConfig.direction === "asc") {
                return { key, direction: "desc" }
            }

            if (currentSortConfig.direction === "desc") {
                return DEFAULT_SORT_CONFIG
            }

            return { key, direction: "asc" }
        })
    }, [onSortChange])

    return {
        searchQuery,
        setSearchQuery,
        sortConfig,
        toggleSort,
        sortedMembers,
    }
}
