
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "duty_compensations": {
                  Row: {
                    "compensation_date": string,"completed": boolean,"created_at": string,"day_of_week": number,"id": string,"leave_id": string,"member_id": string,"period": number
                  }
                  ComputedFields: never
                  Insert: {
                    "compensation_date": string,"completed"?: boolean,"created_at"?: string,"day_of_week": number,"id"?: string,"leave_id": string,"member_id": string,"period": number
                  }
                  Update: {
                    "compensation_date"?: string,"completed"?: boolean,"created_at"?: string,"day_of_week"?: number,"id"?: string,"leave_id"?: string,"member_id"?: string,"period"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "duty_compensations_leave_id_fkey"
      columns: ["leave_id"]
isOneToOne: false
      referencedRelation: "duty_leaves"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "duty_compensations_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    }
                  ]
                },"duty_leaves": {
                  Row: {
                    "created_at": string,"day_of_week": number,"expires_at": string,"id": string,"leave_date": string,"member_id": string,"penalty_shifts": number,"period": number,"reason": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"day_of_week": number,"expires_at"?: string,"id"?: string,"leave_date": string,"member_id": string,"penalty_shifts"?: number,"period": number,"reason"?: string | null,"status"?: string
                  }
                  Update: {
                    "created_at"?: string,"day_of_week"?: number,"expires_at"?: string,"id"?: string,"leave_date"?: string,"member_id"?: string,"penalty_shifts"?: number,"period"?: number,"reason"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "duty_leaves_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    }
                  ]
                },"duty_logs": {
                  Row: {
                    "accuracy_meters": number | null,"device_info": string | null,"distance_meters": number | null,"id": string,"latitude": number | null,"location_verified": boolean | null,"longitude": number | null,"member_id": string,"sign_in_date": string,"sign_in_time": string,"week_number": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "accuracy_meters"?: number | null,"device_info"?: string | null,"distance_meters"?: number | null,"id"?: string,"latitude"?: number | null,"location_verified"?: boolean | null,"longitude"?: number | null,"member_id": string,"sign_in_date"?: string,"sign_in_time"?: string,"week_number"?: number | null
                  }
                  Update: {
                    "accuracy_meters"?: number | null,"device_info"?: string | null,"distance_meters"?: number | null,"id"?: string,"latitude"?: number | null,"location_verified"?: boolean | null,"longitude"?: number | null,"member_id"?: string,"sign_in_date"?: string,"sign_in_time"?: string,"week_number"?: number | null
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
                },"duty_rosters": {
                  Row: {
                    "created_at": string,"day_of_week": number,"has_key": boolean | null,"id": string,"member_id": string,"period": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"day_of_week": number,"has_key"?: boolean | null,"id"?: string,"member_id": string,"period": number
                  }
                  Update: {
                    "created_at"?: string,"day_of_week"?: number,"has_key"?: boolean | null,"id"?: string,"member_id"?: string,"period"?: number
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
                },"duty_sign_in_admin_events": {
                  Row: {
                    "action": string,"actor_member_id": string,"created_at": string,"duty_log_id": string | null,"id": string,"reason": string,"sign_in_time": string | null,"target_member_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_member_id": string,"created_at"?: string,"duty_log_id"?: string | null,"id"?: string,"reason": string,"sign_in_time"?: string | null,"target_member_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_member_id"?: string,"created_at"?: string,"duty_log_id"?: string | null,"id"?: string,"reason"?: string,"sign_in_time"?: string | null,"target_member_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "duty_sign_in_admin_events_actor_member_id_fkey"
      columns: ["actor_member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "duty_sign_in_admin_events_duty_log_id_fkey"
      columns: ["duty_log_id"]
isOneToOne: false
      referencedRelation: "duty_logs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "duty_sign_in_admin_events_target_member_id_fkey"
      columns: ["target_member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    }
                  ]
                },"duty_swaps": {
                  Row: {
                    "created_at": string,"id": string,"leave_id": string | null,"original_day": number,"original_period": number,"requester_id": string,"status": string | null,"target_day": number | null,"target_id": string | null,"target_period": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"leave_id"?: string | null,"original_day": number,"original_period": number,"requester_id": string,"status"?: string | null,"target_day"?: number | null,"target_id"?: string | null,"target_period"?: number | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"leave_id"?: string | null,"original_day"?: number,"original_period"?: number,"requester_id"?: string,"status"?: string | null,"target_day"?: number | null,"target_id"?: string | null,"target_period"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "duty_swaps_leave_id_fkey"
      columns: ["leave_id"]
isOneToOne: false
      referencedRelation: "duty_leaves"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "duty_swaps_requester_id_fkey"
      columns: ["requester_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "duty_swaps_target_id_fkey"
      columns: ["target_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    }
                  ]
                },"event_attendees": {
                  Row: {
                    "created_at": string,"event_id": string,"id": string,"is_attended": boolean,"user_email": string,"user_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event_id": string,"id"?: string,"is_attended"?: boolean,"user_email": string,"user_name": string
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string,"id"?: string,"is_attended"?: boolean,"user_email"?: string,"user_name"?: string
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
                },"events": {
                  Row: {
                    "cover_url": string | null,"created_at": string,"description": string | null,"end_time": string | null,"event_date": string,"id": string,"is_online": boolean,"location": string | null,"title": string,"type": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cover_url"?: string | null,"created_at"?: string,"description"?: string | null,"end_time"?: string | null,"event_date": string,"id"?: string,"is_online"?: boolean,"location"?: string | null,"title": string,"type"?: string | null
                  }
                  Update: {
                    "cover_url"?: string | null,"created_at"?: string,"description"?: string | null,"end_time"?: string | null,"event_date"?: string,"id"?: string,"is_online"?: boolean,"location"?: string | null,"title"?: string,"type"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"key_transfers": {
                  Row: {
                    "confirmed_at": string | null,"created_at": string,"from_member_id": string | null,"id": string,"note": string | null,"status": string,"to_member_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "confirmed_at"?: string | null,"created_at"?: string,"from_member_id"?: string | null,"id"?: string,"note"?: string | null,"status"?: string,"to_member_id": string
                  }
                  Update: {
                    "confirmed_at"?: string | null,"created_at"?: string,"from_member_id"?: string | null,"id"?: string,"note"?: string | null,"status"?: string,"to_member_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "key_transfers_from_member_id_fkey"
      columns: ["from_member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "key_transfers_to_member_id_fkey"
      columns: ["to_member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    }
                  ]
                },"members": {
                  Row: {
                    "created_at": string,"department": string | null,"email": string,"grade": string | null,"id": string,"join_date": string | null,"name": string,"role": string,"status": string | null,"student_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"department"?: string | null,"email"?: string,"grade"?: string | null,"id"?: string,"join_date"?: string | null,"name": string,"role"?: string,"status"?: string | null,"student_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"department"?: string | null,"email"?: string,"grade"?: string | null,"id"?: string,"join_date"?: string | null,"name"?: string,"role"?: string,"status"?: string | null,"student_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"studio_geofence": {
                  Row: {
                    "id": boolean,"latitude": number,"longitude": number,"max_accuracy_meters": number,"radius_meters": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: boolean,"latitude": number,"longitude": number,"max_accuracy_meters": number,"radius_meters": number,"updated_at"?: string
                  }
                  Update: {
                    "id"?: boolean,"latitude"?: number,"longitude"?: number,"max_accuracy_meters"?: number,"radius_meters"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"studio_geofence_audits": {
                  Row: {
                    "actor_member_id": string,"created_at": string,"id": string,"latitude": number,"longitude": number,"max_accuracy_meters": number,"previous_latitude": number | null,"previous_longitude": number | null,"previous_max_accuracy_meters": number | null,"previous_radius_meters": number | null,"radius_meters": number,"reason": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_member_id": string,"created_at"?: string,"id"?: string,"latitude": number,"longitude": number,"max_accuracy_meters": number,"previous_latitude"?: number | null,"previous_longitude"?: number | null,"previous_max_accuracy_meters"?: number | null,"previous_radius_meters"?: number | null,"radius_meters": number,"reason": string
                  }
                  Update: {
                    "actor_member_id"?: string,"created_at"?: string,"id"?: string,"latitude"?: number,"longitude"?: number,"max_accuracy_meters"?: number,"previous_latitude"?: number | null,"previous_longitude"?: number | null,"previous_max_accuracy_meters"?: number | null,"previous_radius_meters"?: number | null,"radius_meters"?: number,"reason"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "studio_geofence_audits_actor_member_id_fkey"
      columns: ["actor_member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    }
                  ]
                },"studio_sessions": {
                  Row: {
                    "ended_at": string | null,"id": string,"is_active": boolean,"member_id": string,"started_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ended_at"?: string | null,"id"?: string,"is_active"?: boolean,"member_id": string,"started_at"?: string
                  }
                  Update: {
                    "ended_at"?: string | null,"id"?: string,"is_active"?: boolean,"member_id"?: string,"started_at"?: string
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
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_duty_swap":
{ Args: { "p_acceptor_id": string,"p_swap_id": string }; Returns: undefined
                           },
"admin_backfill_duty_sign_in":
{ Args: { "p_member_id": string,"p_reason": string,"p_sign_in_time": string }; Returns: string
                           },
"approve_duty_leave":
{ Args: { "p_leave_id": string }; Returns: undefined
                           },
"assert_duty_admin":
{ Args: { "p_reason": string }; Returns: string
                           },
"confirm_key_transfer":
{ Args: { "p_confirmer_id": string,"p_transfer_id": string }; Returns: undefined
                           },
"current_member_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"duty_sign_in_instant":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"evaluate_duty_sign_in_window":
{ Args: { "p_at": string,"p_ignore_leave"?: boolean,"p_member_id": string }; Returns: string
                           },
"expire_studio_sessions":
{ Args: { "p_now"?: string }; Returns: number
                           },
"is_china_public_holiday":
{ Args: { "p_date": string }; Returns: boolean
                           },
"is_current_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"mark_duty_sign_in_invalid":
{ Args: { "p_log_id": string,"p_reason": string }; Returns: undefined
                           },
"return_duty_swap_to_hall":
{ Args: { "p_swap_id": string }; Returns: undefined
                           },
"submit_duty_sign_in":
{ Args: { "p_accuracy": number,"p_device_info"?: string,"p_latitude": number,"p_longitude": number }; Returns: string
                           },
"update_studio_geofence":
{ Args: { "p_latitude": number,"p_longitude": number,"p_max_accuracy_meters": number,"p_radius_meters": number,"p_reason": string }; Returns: undefined
                           },
"volunteer_for_duty_swap":
{ Args: { "p_swap_id": string }; Returns: undefined
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
