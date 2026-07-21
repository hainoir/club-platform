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
                    student_id: string | number | null
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
                    student_id?: string | number | null
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
                    student_id?: string | number | null
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
                    sign_in_date: string
                    location_verified: boolean | null
                    device_info: string | null
                    week_number: number | null
                }
                Insert: {
                    id?: string
                    member_id: string
                    sign_in_time?: string
                    sign_in_date?: string
                    location_verified?: boolean | null
                    device_info?: string | null
                    week_number?: number | null
                }
                Update: {
                    id?: string
                    member_id?: string
                    sign_in_time?: string
                    sign_in_date?: string
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
                    leave_id: string | null
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
                    leave_id?: string | null
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
                    leave_id?: string | null
                    original_day?: number
                    original_period?: number
                    target_day?: number | null
                    target_period?: number | null
                    status?: string | null
                    created_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "duty_swaps_leave_id_fkey"
                        columns: ["leave_id"]
                        isOneToOne: false
                        referencedRelation: "duty_leaves"
                        referencedColumns: ["id"]
                    },
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
                    leave_date: string
                    expires_at: string
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
                    leave_date: string
                    expires_at?: string
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
                    leave_date?: string
                    expires_at?: string
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
                    compensation_date: string
                    day_of_week: number
                    period: number
                    completed: boolean
                    created_at: string
                }
                Insert: {
                    id?: string
                    leave_id: string
                    member_id: string
                    compensation_date: string
                    day_of_week: number
                    period: number
                    completed?: boolean
                    created_at?: string
                }
                Update: {
                    id?: string
                    leave_id?: string
                    member_id?: string
                    compensation_date?: string
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
                    confirmed_at: string | null
                }
                Insert: {
                    id?: string
                    from_member_id?: string | null
                    to_member_id: string
                    note?: string | null
                    status?: string
                    created_at?: string
                    confirmed_at?: string | null
                }
                Update: {
                    id?: string
                    from_member_id?: string | null
                    to_member_id?: string
                    note?: string | null
                    status?: string
                    created_at?: string
                    confirmed_at?: string | null
                }
                Relationships: []
            }
            studio_sessions: {
                Row: {
                    id: string
                    member_id: string
                    started_at: string
                    ended_at: string | null
                    is_active: boolean
                }
                Insert: {
                    id?: string
                    member_id: string
                    started_at?: string
                    ended_at?: string | null
                    is_active?: boolean
                }
                Update: {
                    id?: string
                    member_id?: string
                    started_at?: string
                    ended_at?: string | null
                    is_active?: boolean
                }
                Relationships: [
                    {
                        foreignKeyName: "studio_sessions_member_id_fkey"
                        columns: ["member_id"]
                        isOneToOne: false
                        referencedRelation: "members"
                        referencedColumns: ["id"]
                    }
                ]
            }
            notification_preferences: {
                Row: {
                    member_id: string
                    in_app_enabled: boolean
                    web_push_enabled: boolean
                    duty_reminder: boolean
                    key_transfer_reminder: boolean
                    leave_reminder: boolean
                    swap_reminder: boolean
                    event_reminder: boolean
                    updated_at: string
                }
                Insert: {
                    member_id: string
                    in_app_enabled?: boolean
                    web_push_enabled?: boolean
                    duty_reminder?: boolean
                    key_transfer_reminder?: boolean
                    leave_reminder?: boolean
                    swap_reminder?: boolean
                    event_reminder?: boolean
                    updated_at?: string
                }
                Update: {
                    member_id?: string
                    in_app_enabled?: boolean
                    web_push_enabled?: boolean
                    duty_reminder?: boolean
                    key_transfer_reminder?: boolean
                    leave_reminder?: boolean
                    swap_reminder?: boolean
                    event_reminder?: boolean
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "notification_preferences_member_id_fkey"
                        columns: ["member_id"]
                        isOneToOne: true
                        referencedRelation: "members"
                        referencedColumns: ["id"]
                    }
                ]
            }
            push_subscriptions: {
                Row: {
                    id: string
                    member_id: string
                    endpoint: string
                    p256dh: string
                    auth: string
                    user_agent: string | null
                    platform: string | null
                    device_label: string | null
                    status: string
                    failure_count: number
                    last_success_at: string | null
                    last_failure_at: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    member_id: string
                    endpoint: string
                    p256dh: string
                    auth: string
                    user_agent?: string | null
                    platform?: string | null
                    device_label?: string | null
                    status?: string
                    failure_count?: number
                    last_success_at?: string | null
                    last_failure_at?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    member_id?: string
                    endpoint?: string
                    p256dh?: string
                    auth?: string
                    user_agent?: string | null
                    platform?: string | null
                    device_label?: string | null
                    status?: string
                    failure_count?: number
                    last_success_at?: string | null
                    last_failure_at?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "push_subscriptions_member_id_fkey"
                        columns: ["member_id"]
                        isOneToOne: false
                        referencedRelation: "members"
                        referencedColumns: ["id"]
                    }
                ]
            }
            notification_outbox: {
                Row: {
                    id: string
                    recipient_member_id: string
                    notification_type: string
                    entity_type: string
                    entity_id: string
                    dedupe_key: string
                    title: string
                    body: string
                    target_url: string
                    urgency: "normal" | "high"
                    scheduled_at: string
                    expires_at: string
                    status: string
                    attempts: number
                    next_attempt_at: string | null
                    last_error: string | null
                    worker_id: string | null
                    processing_started_at: string | null
                    sent_at: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    recipient_member_id: string
                    notification_type: string
                    entity_type: string
                    entity_id: string
                    dedupe_key: string
                    title: string
                    body: string
                    target_url?: string
                    urgency?: "normal" | "high"
                    scheduled_at?: string
                    expires_at: string
                    status?: string
                    attempts?: number
                    next_attempt_at?: string | null
                    last_error?: string | null
                    worker_id?: string | null
                    processing_started_at?: string | null
                    sent_at?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    recipient_member_id?: string
                    notification_type?: string
                    entity_type?: string
                    entity_id?: string
                    dedupe_key?: string
                    title?: string
                    body?: string
                    target_url?: string
                    urgency?: "normal" | "high"
                    scheduled_at?: string
                    expires_at?: string
                    status?: string
                    attempts?: number
                    next_attempt_at?: string | null
                    last_error?: string | null
                    worker_id?: string | null
                    processing_started_at?: string | null
                    sent_at?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "notification_outbox_recipient_member_id_fkey"
                        columns: ["recipient_member_id"]
                        isOneToOne: false
                        referencedRelation: "members"
                        referencedColumns: ["id"]
                    }
                ]
            }
            push_deliveries: {
                Row: {
                    id: string
                    outbox_id: string
                    subscription_id: string
                    status: string
                    attempts: number
                    response_status: number | null
                    error_message: string | null
                    sent_at: string | null
                    next_attempt_at: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    outbox_id: string
                    subscription_id: string
                    status?: string
                    attempts?: number
                    response_status?: number | null
                    error_message?: string | null
                    sent_at?: string | null
                    next_attempt_at?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    outbox_id?: string
                    subscription_id?: string
                    status?: string
                    attempts?: number
                    response_status?: number | null
                    error_message?: string | null
                    sent_at?: string | null
                    next_attempt_at?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "push_deliveries_outbox_id_fkey"
                        columns: ["outbox_id"]
                        isOneToOne: false
                        referencedRelation: "notification_outbox"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "push_deliveries_subscription_id_fkey"
                        columns: ["subscription_id"]
                        isOneToOne: false
                        referencedRelation: "push_subscriptions"
                        referencedColumns: ["id"]
                    }
                ]
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
            approve_duty_leave: {
                Args: {
                    p_leave_id: string
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
            claim_push_outbox: {
                Args: {
                    p_batch_size: number
                    p_worker_id: string
                }
                Returns: Database["public"]["Tables"]["notification_outbox"]["Row"][]
            }
            expire_studio_sessions: {
                Args: {
                    p_now?: string
                }
                Returns: number
            }
            return_duty_swap_to_hall: {
                Args: {
                    p_swap_id: string
                }
                Returns: undefined
            }
            release_stale_push_jobs: {
                Args: {
                    p_stale_before: string
                }
                Returns: number
            }
            volunteer_for_duty_swap: {
                Args: {
                    p_swap_id: string
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
