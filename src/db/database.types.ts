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
          original_intent: string
          title: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          original_intent: string
          title: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          original_intent?: string
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      edges: {
        Row: {
          both_existing: boolean
          canvas_id: string
          created_at: string
          edge_type: string
          from_node_id: string
          id: string
          session_id: string
          to_node_id: string
        }
        Insert: {
          both_existing?: boolean
          canvas_id: string
          created_at?: string
          edge_type: string
          from_node_id: string
          id?: string
          session_id: string
          to_node_id: string
        }
        Update: {
          both_existing?: boolean
          canvas_id?: string
          created_at?: string
          edge_type?: string
          from_node_id?: string
          id?: string
          session_id?: string
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
          id: string
          owner: string
          session_id: string
          summary: string | null
        }
        Insert: {
          canvas_id: string
          content?: string | null
          created_at?: string
          direction_marker?: string | null
          embedding?: string | null
          id?: string
          owner?: string
          session_id: string
          summary?: string | null
        }
        Update: {
          canvas_id?: string
          content?: string | null
          created_at?: string
          direction_marker?: string | null
          embedding?: string | null
          id?: string
          owner?: string
          session_id?: string
          summary?: string | null
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

