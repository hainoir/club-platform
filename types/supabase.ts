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
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            [_ in never]: never
        }
        Enums: {
            [_ in never]: never
        }
        CompositeTypes: {
            [_ in never]: never
        }
    }
}
