export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      agent_threads: {
        Row: {
          active_rejection_insight_ids: string[]
          agent_role: string
          canvas_id: string
          id: string
          messages: Json
          updated_at: string
        }
        Insert: {
          active_rejection_insight_ids?: string[]
          agent_role: string
          canvas_id: string
          id?: string
          messages?: Json
          updated_at?: string
        }
        Update: {
          active_rejection_insight_ids?: string[]
          agent_role?: string
          canvas_id?: string
          id?: string
          messages?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_threads_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_contributions: {
        Row: {
          agent_role: string
          canvas_id: string
          created_at: string
          ghost_id: string | null
          id: string
          session_id: string | null
          status: string
        }
        Insert: {
          agent_role: string
          canvas_id: string
          created_at?: string
          ghost_id?: string | null
          id?: string
          session_id?: string | null
          status?: string
        }
        Update: {
          agent_role?: string
          canvas_id?: string
          created_at?: string
          ghost_id?: string | null
          id?: string
          session_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_contributions_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_contributions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      attunement_state: {
        Row: {
          canvas_id: string
          cognitive_mode: string
          confidence: number | null
          created_at: string
          id: string
          node_id: string | null
          phase_shift_suggested: boolean
          question_style: string
          session_id: string
        }
        Insert: {
          canvas_id: string
          cognitive_mode: string
          confidence?: number | null
          created_at?: string
          id?: string
          node_id?: string | null
          phase_shift_suggested?: boolean
          question_style: string
          session_id: string
        }
        Update: {
          canvas_id?: string
          cognitive_mode?: string
          confidence?: number | null
          created_at?: string
          id?: string
          node_id?: string | null
          phase_shift_suggested?: boolean
          question_style?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attunement_state_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attunement_state_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attunement_state_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      canvases: {
        Row: {
          created_at: string
          id: string
          next_node_seq: number
          original_intent: string
          title: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          next_node_seq?: number
          original_intent: string
          title: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          next_node_seq?: number
          original_intent?: string
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      component_removals: {
        Row: {
          canvas_id: string
          component_id: string
          component_label: string
          component_type: string
          created_at: string
          created_by: string | null
          id: string
          reason: string
          session_id: string | null
        }
        Insert: {
          canvas_id: string
          component_id: string
          component_label: string
          component_type: string
          created_at?: string
          created_by?: string | null
          id?: string
          reason: string
          session_id?: string | null
        }
        Update: {
          canvas_id?: string
          component_id?: string
          component_label?: string
          component_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: string
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "component_removals_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "component_removals_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      context_attachments: {
        Row: {
          alt_text: string | null
          canvas_id: string
          created_at: string
          entry_id: string
          file_name: string
          height: number | null
          id: string
          mime_type: string
          scan_status: string
          size_bytes: number
          storage_path: string
          uploaded_by: string | null
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          canvas_id: string
          created_at?: string
          entry_id: string
          file_name: string
          height?: number | null
          id?: string
          mime_type: string
          scan_status?: string
          size_bytes: number
          storage_path: string
          uploaded_by?: string | null
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          canvas_id?: string
          created_at?: string
          entry_id?: string
          file_name?: string
          height?: number | null
          id?: string
          mime_type?: string
          scan_status?: string
          size_bytes?: number
          storage_path?: string
          uploaded_by?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "context_attachments_entry_canvas_fkey"
            columns: ["entry_id", "canvas_id"]
            isOneToOne: true
            referencedRelation: "context_entries"
            referencedColumns: ["id", "canvas_id"]
          },
        ]
      }
      context_entries: {
        Row: {
          author_id: string | null
          canvas_id: string
          content: string | null
          created_at: string
          deleted_at: string | null
          id: string
          session_id: string | null
          source: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          canvas_id: string
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          session_id?: string | null
          source: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          canvas_id?: string
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          session_id?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "context_entries_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "context_entries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      context_links: {
        Row: {
          canvas_id: string
          created_at: string
          entry_id: string
          id: string
          origin_status: string
          state: string
          target_id: string | null
          target_type: string
          updated_at: string
        }
        Insert: {
          canvas_id: string
          created_at?: string
          entry_id: string
          id?: string
          origin_status: string
          state?: string
          target_id?: string | null
          target_type: string
          updated_at?: string
        }
        Update: {
          canvas_id?: string
          created_at?: string
          entry_id?: string
          id?: string
          origin_status?: string
          state?: string
          target_id?: string | null
          target_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "context_links_entry_canvas_fkey"
            columns: ["entry_id", "canvas_id"]
            isOneToOne: false
            referencedRelation: "context_entries"
            referencedColumns: ["id", "canvas_id"]
          },
        ]
      }
      edges: {
        Row: {
          both_existing: boolean
          canvas_id: string
          created_at: string
          from_handle: string | null
          from_node_id: string
          id: string
          label: string | null
          session_id: string
          to_handle: string | null
          to_node_id: string
        }
        Insert: {
          both_existing?: boolean
          canvas_id: string
          created_at?: string
          from_handle?: string | null
          from_node_id: string
          id?: string
          label?: string | null
          session_id: string
          to_handle?: string | null
          to_node_id: string
        }
        Update: {
          both_existing?: boolean
          canvas_id?: string
          created_at?: string
          from_handle?: string | null
          from_node_id?: string
          id?: string
          label?: string | null
          session_id?: string
          to_handle?: string | null
          to_node_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "edges_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edges_from_node_id_fkey"
            columns: ["from_node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edges_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edges_to_node_id_fkey"
            columns: ["to_node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      nodes: {
        Row: {
          canvas_id: string
          content: string | null
          created_at: string
          direction_marker: string | null
          embedding: string | null
          height: number | null
          id: string
          owner: string
          seq: number
          session_id: string
          set_aside_at: string | null
          summary: string | null
          width: number | null
          x: number | null
          y: number | null
        }
        Insert: {
          canvas_id: string
          content?: string | null
          created_at?: string
          direction_marker?: string | null
          embedding?: string | null
          height?: number | null
          id?: string
          owner?: string
          seq?: number
          session_id: string
          set_aside_at?: string | null
          summary?: string | null
          width?: number | null
          x?: number | null
          y?: number | null
        }
        Update: {
          canvas_id?: string
          content?: string | null
          created_at?: string
          direction_marker?: string | null
          embedding?: string | null
          height?: number | null
          id?: string
          owner?: string
          seq?: number
          session_id?: string
          set_aside_at?: string | null
          summary?: string | null
          width?: number | null
          x?: number | null
          y?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nodes_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nodes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      observer_edges: {
        Row: {
          created_at: string
          from_id: string
          id: string
          status: string
          structure_id: string
          to_id: string
        }
        Insert: {
          created_at?: string
          from_id: string
          id?: string
          status?: string
          structure_id: string
          to_id: string
        }
        Update: {
          created_at?: string
          from_id?: string
          id?: string
          status?: string
          structure_id?: string
          to_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "observer_edges_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "observer_structures"
            referencedColumns: ["id"]
          },
        ]
      }
      observer_structures: {
        Row: {
          anchor_node_ids: string[]
          canvas_id: string
          created_at: string
          id: string
          nodes: Json
          session_id: string | null
          thread_id: string | null
        }
        Insert: {
          anchor_node_ids: string[]
          canvas_id: string
          created_at?: string
          id?: string
          nodes?: Json
          session_id?: string | null
          thread_id?: string | null
        }
        Update: {
          anchor_node_ids?: string[]
          canvas_id?: string
          created_at?: string
          id?: string
          nodes?: Json
          session_id?: string | null
          thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "observer_structures_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observer_structures_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observer_structures_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "agent_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      rejection_insights: {
        Row: {
          active: boolean
          canvas_id: string
          connection_feedback: string | null
          created_at: string
          id: string
          insight_points: Json
          rejection_reason: string | null
          session_id: string | null
          severity: string
          target_edge_id: string | null
          thread_id: string | null
          turns_remaining: number | null
        }
        Insert: {
          active?: boolean
          canvas_id: string
          connection_feedback?: string | null
          created_at?: string
          id?: string
          insight_points?: Json
          rejection_reason?: string | null
          session_id?: string | null
          severity: string
          target_edge_id?: string | null
          thread_id?: string | null
          turns_remaining?: number | null
        }
        Update: {
          active?: boolean
          canvas_id?: string
          connection_feedback?: string | null
          created_at?: string
          id?: string
          insight_points?: Json
          rejection_reason?: string | null
          session_id?: string | null
          severity?: string
          target_edge_id?: string | null
          thread_id?: string | null
          turns_remaining?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rejection_insights_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rejection_insights_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rejection_insights_target_edge_id_fkey"
            columns: ["target_edge_id"]
            isOneToOne: false
            referencedRelation: "observer_edges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rejection_insights_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "agent_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      session_learnings: {
        Row: {
          canvas_id: string
          content: string
          created_at: string
          id: string
          session_id: string
          type: string
        }
        Insert: {
          canvas_id: string
          content: string
          created_at?: string
          id?: string
          session_id: string
          type: string
        }
        Update: {
          canvas_id?: string
          content?: string
          created_at?: string
          id?: string
          session_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_learnings_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_learnings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          canvas_id: string
          current_phase: string
          end_time: string | null
          id: string
          node_sequence: string[]
          start_time: string
          status: string
        }
        Insert: {
          canvas_id: string
          current_phase?: string
          end_time?: string | null
          id?: string
          node_sequence?: string[]
          start_time?: string
          status?: string
        }
        Update: {
          canvas_id?: string
          current_phase?: string
          end_time?: string | null
          id?: string
          node_sequence?: string[]
          start_time?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          id: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      system_config: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      append_node_to_sequence: {
        Args: { p_node_id: string; p_session_id: string }
        Returns: undefined
      }
      append_thread_message: {
        Args: { p_message: Json; p_thread_id: string }
        Returns: undefined
      }
      create_context_entry: {
        Args: { p_attachment?: Json; p_entry: Json; p_links: Json }
        Returns: Database["public"]["Tables"]["context_entries"]["Row"]
      }
      decrement_insight_turns: {
        Args: { p_insight_id: string }
        Returns: undefined
      }
      match_nodes: {
        Args: {
          canvas_id_filter: string
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          content: string
          id: string
          similarity: number
          summary: string
        }[]
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

