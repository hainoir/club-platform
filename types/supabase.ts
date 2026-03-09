export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
    public: {
        Tables: {
            members: {
                Row: {
                    id: string
                    email: string
                    name: string
                    role: string
                    student_id: string | null
                    department: string | null
                    grade: string | null
                    status: string | null
                    join_date: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    email?: string
                    name: string
                    role?: string
                    student_id?: string | null
                    department?: string | null
                    grade?: string | null
                    status?: string | null
                    join_date?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    email?: string
                    name?: string
                    role?: string
                    student_id?: string | null
                    department?: string | null
                    grade?: string | null
                    status?: string | null
                    join_date?: string | null
                    created_at?: string
                }
                Relationships: []
            }
            events: {
                Row: {
                    id: string
                    title: string
                    description: string | null
                    event_date: string
                    end_time: string | null
                    location: string | null
                    type: string | null
                    is_online: boolean
                    cover_url: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    title: string
                    description?: string | null
                    event_date: string
                    end_time?: string | null
                    location?: string | null
                    type?: string | null
                    is_online?: boolean
                    cover_url?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    title?: string
                    description?: string | null
                    event_date?: string
                    end_time?: string | null
                    location?: string | null
                    type?: string | null
                    is_online?: boolean
                    cover_url?: string | null
                    created_at?: string
                }
                Relationships: []
            }
            event_attendees: {
                Row: {
                    id: string
                    event_id: string
                    user_email: string
                    user_name: string
                    is_attended: boolean
                    created_at: string
                }
                Insert: {
                    id?: string
                    event_id: string
                    user_email: string
                    user_name: string
                    is_attended?: boolean
                    created_at?: string
                }
                Update: {
                    id?: string
                    event_id?: string
                    user_email?: string
                    user_name?: string
                    is_attended?: boolean
                    created_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "event_attendees_event_id_fkey"
                        columns: ["event_id"]
                        isOneToOne: false
                        referencedRelation: "events"
                        referencedColumns: ["id"]
                    }
                ]
            }
            duty_rosters: {
                Row: {
                    id: string
                    member_id: string
                    day_of_week: number
                    period: number
                    has_key: boolean
                    created_at: string
                }
                Insert: {
                    id?: string
                    member_id: string
                    day_of_week: number
                    period: number
                    has_key?: boolean
                    created_at?: string
                }
                Update: {
                    id?: string
                    member_id?: string
                    day_of_week?: number
                    period?: number
                    has_key?: boolean
                    created_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "duty_rosters_member_id_fkey"
                        columns: ["member_id"]
                        isOneToOne: false
                        referencedRelation: "members"
                        referencedColumns: ["id"]
                    }
                ]
            }
            duty_logs: {
                Row: {
                    id: string
                    member_id: string
                    sign_in_time: string
                    location_verified: boolean | null
                    device_info: string | null
                    week_number: number | null
                }
                Insert: {
                    id?: string
                    member_id: string
                    sign_in_time?: string
                    location_verified?: boolean | null
                    device_info?: string | null
                    week_number?: number | null
                }
                Update: {
                    id?: string
                    member_id?: string
                    sign_in_time?: string
                    location_verified?: boolean | null
                    device_info?: string | null
                    week_number?: number | null
                }
                Relationships: [
                    {
                        foreignKeyName: "duty_logs_member_id_fkey"
                        columns: ["member_id"]
                        isOneToOne: false
                        referencedRelation: "members"
                        referencedColumns: ["id"]
                    }
                ]
            }
            duty_swaps: {
                Row: {
                    id: string
                    requester_id: string
                    target_id: string | null
                    original_day: number
                    original_period: number
                    target_day: number | null
                    target_period: number | null
                    status: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    requester_id: string
                    target_id?: string | null
                    original_day: number
                    original_period: number
                    target_day?: number | null
                    target_period?: number | null
                    status?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    requester_id?: string
                    target_id?: string | null
                    original_day?: number
                    original_period?: number
                    target_day?: number | null
                    target_period?: number | null
                    status?: string | null
                    created_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "duty_swaps_requester_id_fkey"
                        columns: ["requester_id"]
                        isOneToOne: false
                        referencedRelation: "members"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "duty_swaps_target_id_fkey"
                        columns: ["target_id"]
                        isOneToOne: false
                        referencedRelation: "members"
                        referencedColumns: ["id"]
                    }
                ]
            }
            duty_leaves: {
                Row: {
                    id: string
                    member_id: string
                    day_of_week: number
                    period: number
                    reason: string | null
                    penalty_shifts: number
                    status: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    member_id: string
                    day_of_week: number
                    period: number
                    reason?: string | null
                    penalty_shifts?: number
                    status?: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    member_id?: string
                    day_of_week?: number
                    period?: number
                    reason?: string | null
                    penalty_shifts?: number
                    status?: string
                    created_at?: string
                }
                Relationships: []
            }
            duty_compensations: {
                Row: {
                    id: string
                    leave_id: string
                    member_id: string
                    day_of_week: number
                    period: number
                    completed: boolean
                    created_at: string
                }
                Insert: {
                    id?: string
                    leave_id: string
                    member_id: string
                    day_of_week: number
                    period: number
                    completed?: boolean
                    created_at?: string
                }
                Update: {
                    id?: string
                    leave_id?: string
                    member_id?: string
                    day_of_week?: number
                    period?: number
                    completed?: boolean
                    created_at?: string
                }
                Relationships: []
            }
            key_transfers: {
                Row: {
                    id: string
                    from_member_id: string | null
                    to_member_id: string
                    note: string | null
                    status: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    from_member_id?: string | null
                    to_member_id: string
                    note?: string | null
                    status?: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    from_member_id?: string | null
                    to_member_id?: string
                    note?: string | null
                    status?: string
                    created_at?: string
                }
                Relationships: []
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            accept_duty_swap: {
                Args: {
                    p_swap_id: string
                    p_acceptor_id: string
                }
                Returns: undefined
            }
            confirm_key_transfer: {
                Args: {
                    p_transfer_id: string
                    p_confirmer_id: string
                }
                Returns: undefined
            }
        }
        Enums: {
            [_ in never]: never
        }
        CompositeTypes: {
            [_ in never]: never
        }
    }
}
