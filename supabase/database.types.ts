// Generated from Supabase project ldevydqkdywrjedtjxlr. Do not edit by hand.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      audit_events: {
        Row: {
          action: string;
          actor_membership_id: string | null;
          created_at: string;
          details: Json;
          id: string;
          store_id: string;
          subject_membership_id: string | null;
        };
        Insert: {
          action: string;
          actor_membership_id?: string | null;
          created_at?: string;
          details?: Json;
          id?: string;
          store_id: string;
          subject_membership_id?: string | null;
        };
        Update: {
          action?: string;
          actor_membership_id?: string | null;
          created_at?: string;
          details?: Json;
          id?: string;
          store_id?: string;
          subject_membership_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_membership_id_fkey";
            columns: ["actor_membership_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_events_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_events_subject_membership_id_fkey";
            columns: ["subject_membership_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["id"];
          },
        ];
      };
      changes: {
        Row: {
          created_at: string;
          entity_id: string;
          entity_type: string;
          operation: string;
          payload: Json;
          sequence: number;
          store_id: string;
        };
        Insert: {
          created_at?: string;
          entity_id: string;
          entity_type: string;
          operation: string;
          payload: Json;
          sequence?: never;
          store_id: string;
        };
        Update: {
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          operation?: string;
          payload?: Json;
          sequence?: never;
          store_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "changes_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      conflict_notifications: {
        Row: {
          aggregate_id: string;
          aggregate_type: string;
          created_at: string;
          id: string;
          losing_payload: Json;
          resolved_at: string | null;
          store_id: string;
          winning_payload: Json;
        };
        Insert: {
          aggregate_id: string;
          aggregate_type: string;
          created_at?: string;
          id?: string;
          losing_payload: Json;
          resolved_at?: string | null;
          store_id: string;
          winning_payload: Json;
        };
        Update: {
          aggregate_id?: string;
          aggregate_type?: string;
          created_at?: string;
          id?: string;
          losing_payload?: Json;
          resolved_at?: string | null;
          store_id?: string;
          winning_payload?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "conflict_notifications_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      devices: {
        Row: {
          active: boolean;
          id: string;
          installation_id: string;
          last_seen_at: string;
          registered_at: string;
          secret_hash: string;
          store_id: string;
          terminal_code: string;
        };
        Insert: {
          active?: boolean;
          id?: string;
          installation_id: string;
          last_seen_at?: string;
          registered_at?: string;
          secret_hash: string;
          store_id: string;
          terminal_code: string;
        };
        Update: {
          active?: boolean;
          id?: string;
          installation_id?: string;
          last_seen_at?: string;
          registered_at?: string;
          secret_hash?: string;
          store_id?: string;
          terminal_code?: string;
        };
        Relationships: [
          {
            foreignKeyName: "devices_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      login_attempts: {
        Row: {
          attempts: number;
          blocked_until: string | null;
          key: string;
          window_started_at: string;
        };
        Insert: {
          attempts?: number;
          blocked_until?: string | null;
          key: string;
          window_started_at?: string;
        };
        Update: {
          attempts?: number;
          blocked_until?: string | null;
          key?: string;
          window_started_at?: string;
        };
        Relationships: [];
      };
      member_permissions: {
        Row: {
          membership_id: string;
          permission_key: string;
        };
        Insert: {
          membership_id: string;
          permission_key: string;
        };
        Update: {
          membership_id?: string;
          permission_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: "member_permissions_membership_id_fkey";
            columns: ["membership_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "member_permissions_permission_key_fkey";
            columns: ["permission_key"];
            isOneToOne: false;
            referencedRelation: "permission_definitions";
            referencedColumns: ["key"];
          },
        ];
      };
      memberships: {
        Row: {
          active: boolean;
          auth_email: string;
          created_at: string;
          employee_id: string;
          id: string;
          permission_version: number;
          profile_id: string;
          role: Database["public"]["Enums"]["member_role"];
          store_id: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          auth_email: string;
          created_at?: string;
          employee_id: string;
          id?: string;
          permission_version?: number;
          profile_id: string;
          role: Database["public"]["Enums"]["member_role"];
          store_id: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          auth_email?: string;
          created_at?: string;
          employee_id?: string;
          id?: string;
          permission_version?: number;
          profile_id?: string;
          role?: Database["public"]["Enums"]["member_role"];
          store_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memberships_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      menu_items: {
        Row: {
          cost_price_paisas: number;
          available_for_sale: boolean;
          deleted_at: string | null;
          id: string;
          name: string;
          name_normalized: string;
          sale_price_paisas: number;
          store_id: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          cost_price_paisas: number;
          available_for_sale?: boolean;
          deleted_at?: string | null;
          id?: string;
          name: string;
          name_normalized: string;
          sale_price_paisas: number;
          store_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          cost_price_paisas?: number;
          available_for_sale?: boolean;
          deleted_at?: string | null;
          id?: string;
          name?: string;
          name_normalized?: string;
          sale_price_paisas?: number;
          store_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "menu_items_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      order_events: {
        Row: {
          actor_membership_id: string | null;
          details: Json;
          device_id: string | null;
          event_type: string;
          id: string;
          occurred_at: string;
          order_id: string;
          revision_id: string | null;
        };
        Insert: {
          actor_membership_id?: string | null;
          details?: Json;
          device_id?: string | null;
          event_type: string;
          id: string;
          occurred_at: string;
          order_id: string;
          revision_id?: string | null;
        };
        Update: {
          actor_membership_id?: string | null;
          details?: Json;
          device_id?: string | null;
          event_type?: string;
          id?: string;
          occurred_at?: string;
          order_id?: string;
          revision_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "order_events_actor_membership_id_fkey";
            columns: ["actor_membership_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_events_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_events_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_events_revision_id_fkey";
            columns: ["revision_id"];
            isOneToOne: false;
            referencedRelation: "order_revisions";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: {
          cost_price_paisas: number;
          id: string;
          item_name: string;
          menu_item_id: string | null;
          quantity: number;
          revision_id: string;
          sale_price_paisas: number;
        };
        Insert: {
          cost_price_paisas: number;
          id: string;
          item_name: string;
          menu_item_id?: string | null;
          quantity: number;
          revision_id: string;
          sale_price_paisas: number;
        };
        Update: {
          cost_price_paisas?: number;
          id?: string;
          item_name?: string;
          menu_item_id?: string | null;
          quantity?: number;
          revision_id?: string;
          sale_price_paisas?: number;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey";
            columns: ["menu_item_id"];
            isOneToOne: false;
            referencedRelation: "menu_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_revision_id_fkey";
            columns: ["revision_id"];
            isOneToOne: false;
            referencedRelation: "order_revisions";
            referencedColumns: ["id"];
          },
        ];
      };
      order_revisions: {
        Row: {
          created_at: string;
          created_by_membership_id: string | null;
          customer_name: string;
          device_id: string | null;
          id: string;
          order_id: string;
          revision_number: number;
          status: string;
          total_paisas: number;
        };
        Insert: {
          created_at: string;
          created_by_membership_id?: string | null;
          customer_name: string;
          device_id?: string | null;
          id: string;
          order_id: string;
          revision_number: number;
          status: string;
          total_paisas: number;
        };
        Update: {
          created_at?: string;
          created_by_membership_id?: string | null;
          customer_name?: string;
          device_id?: string | null;
          id?: string;
          order_id?: string;
          revision_number?: number;
          status?: string;
          total_paisas?: number;
        };
        Relationships: [
          {
            foreignKeyName: "order_revisions_created_by_membership_id_fkey";
            columns: ["created_by_membership_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_revisions_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_revisions_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          created_by_membership_id: string | null;
          current_revision_id: string;
          device_id: string | null;
          id: string;
          occurred_at: string;
          order_no: string;
          source: string;
          status: Database["public"]["Enums"]["order_status"];
          store_id: string;
          updated_at: string;
        };
        Insert: {
          created_by_membership_id?: string | null;
          current_revision_id: string;
          device_id?: string | null;
          id: string;
          occurred_at: string;
          order_no: string;
          source: string;
          status: Database["public"]["Enums"]["order_status"];
          store_id: string;
          updated_at: string;
        };
        Update: {
          created_by_membership_id?: string | null;
          current_revision_id?: string;
          device_id?: string | null;
          id?: string;
          occurred_at?: string;
          order_no?: string;
          source?: string;
          status?: Database["public"]["Enums"]["order_status"];
          store_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_created_by_membership_id_fkey";
            columns: ["created_by_membership_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
      permission_definitions: {
        Row: {
          description: string;
          key: string;
        };
        Insert: {
          description: string;
          key: string;
        };
        Update: {
          description?: string;
          key?: string;
        };
        Relationships: [];
      };
      permission_snapshots: {
        Row: {
          id: string;
          issued_at: string;
          membership_id: string;
          permissions: string[];
          signature: string;
          version: number;
        };
        Insert: {
          id?: string;
          issued_at?: string;
          membership_id: string;
          permissions: string[];
          signature: string;
          version: number;
        };
        Update: {
          id?: string;
          issued_at?: string;
          membership_id?: string;
          permissions?: string[];
          signature?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "permission_snapshots_membership_id_fkey";
            columns: ["membership_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          must_change_password: boolean;
          name: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id: string;
          must_change_password?: boolean;
          name: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          must_change_password?: boolean;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      role_permission_defaults: {
        Row: {
          permission_key: string;
          role: Database["public"]["Enums"]["member_role"];
        };
        Insert: {
          permission_key: string;
          role: Database["public"]["Enums"]["member_role"];
        };
        Update: {
          permission_key?: string;
          role?: Database["public"]["Enums"]["member_role"];
        };
        Relationships: [
          {
            foreignKeyName: "role_permission_defaults_permission_key_fkey";
            columns: ["permission_key"];
            isOneToOne: false;
            referencedRelation: "permission_definitions";
            referencedColumns: ["key"];
          },
        ];
      };
      stores: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          timezone: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          timezone?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          timezone?: string;
        };
        Relationships: [];
      };
      sync_operations: {
        Row: {
          actor_membership_id: string | null;
          aggregate_id: string;
          aggregate_type: string;
          device_id: string | null;
          id: string;
          occurred_at: string;
          operation_type: string;
          payload: Json;
          permission_snapshot_id: string | null;
          received_at: string;
          store_id: string;
        };
        Insert: {
          actor_membership_id?: string | null;
          aggregate_id: string;
          aggregate_type: string;
          device_id?: string | null;
          id: string;
          occurred_at: string;
          operation_type: string;
          payload: Json;
          permission_snapshot_id?: string | null;
          received_at?: string;
          store_id: string;
        };
        Update: {
          actor_membership_id?: string | null;
          aggregate_id?: string;
          aggregate_type?: string;
          device_id?: string | null;
          id?: string;
          occurred_at?: string;
          operation_type?: string;
          payload?: Json;
          permission_snapshot_id?: string | null;
          received_at?: string;
          store_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sync_operations_actor_membership_id_fkey";
            columns: ["actor_membership_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sync_operations_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sync_operations_permission_snapshot_id_fkey";
            columns: ["permission_snapshot_id"];
            isOneToOne: false;
            referencedRelation: "permission_snapshots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sync_operations_store_id_fkey";
            columns: ["store_id"];
            isOneToOne: false;
            referencedRelation: "stores";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      apply_order_sync: {
        Args: {
          p_actor_membership_id: string;
          p_bill: Json;
          p_device_id: string;
          p_occurred_at: string;
          p_operation_id: string;
          p_operation_type: string;
          p_snapshot_id: string;
          p_store_id: string;
        };
        Returns: undefined;
      };
      next_terminal_code: { Args: { target_store: string }; Returns: string };
    };
    Enums: {
      member_role: "owner" | "manager" | "cashier";
      order_status: "active" | "cancelled";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      member_role: ["owner", "manager", "cashier"],
      order_status: ["active", "cancelled"],
    },
  },
} as const;
