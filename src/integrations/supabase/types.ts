export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          meta: Json
          restaurant_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          meta?: Json
          restaurant_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          meta?: Json
          restaurant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      connected_email_accounts: {
        Row: {
          connected_by: string
          connection_key_ciphertext: string
          connection_status: string
          created_at: string
          email_address: string | null
          emails_processed: number
          id: string
          last_checked_at: string | null
          last_error: string | null
          provider: string
          restaurant_id: string
          source_id: string | null
          updated_at: string
        }
        Insert: {
          connected_by: string
          connection_key_ciphertext: string
          connection_status?: string
          created_at?: string
          email_address?: string | null
          emails_processed?: number
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          provider?: string
          restaurant_id: string
          source_id?: string | null
          updated_at?: string
        }
        Update: {
          connected_by?: string
          connection_key_ciphertext?: string
          connection_status?: string
          created_at?: string
          email_address?: string | null
          emails_processed?: number
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          provider?: string
          restaurant_id?: string
          source_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connected_email_accounts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connected_email_accounts_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "order_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          restaurant_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          restaurant_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          assigned_at: string
          delivered_at: string | null
          id: string
          order_id: string
          partner_id: string | null
          picked_up_at: string | null
          restaurant_id: string
          status: string
        }
        Insert: {
          assigned_at?: string
          delivered_at?: string | null
          id?: string
          order_id: string
          partner_id?: string | null
          picked_up_at?: string | null
          restaurant_id: string
          status?: string
        }
        Update: {
          assigned_at?: string
          delivered_at?: string | null
          id?: string
          order_id?: string
          partner_id?: string | null
          picked_up_at?: string | null
          restaurant_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "delivery_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_partners: {
        Row: {
          active: boolean
          available: boolean
          created_at: string
          id: string
          name: string
          phone: string | null
          restaurant_id: string
          station: string | null
          user_id: string | null
        }
        Insert: {
          active?: boolean
          available?: boolean
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          restaurant_id: string
          station?: string | null
          user_id?: string | null
        }
        Update: {
          active?: boolean
          available?: boolean
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          restaurant_id?: string
          station?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_partners_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      imported_emails: {
        Row: {
          classification: string
          confidence: number
          created_at: string
          error_message: string | null
          gmail_message_id: string
          id: string
          order_id: string | null
          platform: string
          processed_at: string | null
          processing_status: string
          received_at: string | null
          restaurant_id: string
          sender: string | null
          sender_domain: string | null
          snippet: string | null
          subject: string | null
          thread_id: string | null
        }
        Insert: {
          classification?: string
          confidence?: number
          created_at?: string
          error_message?: string | null
          gmail_message_id: string
          id?: string
          order_id?: string | null
          platform?: string
          processed_at?: string | null
          processing_status?: string
          received_at?: string | null
          restaurant_id: string
          sender?: string | null
          sender_domain?: string | null
          snippet?: string | null
          subject?: string | null
          thread_id?: string | null
        }
        Update: {
          classification?: string
          confidence?: number
          created_at?: string
          error_message?: string | null
          gmail_message_id?: string
          id?: string
          order_id?: string | null
          platform?: string
          processed_at?: string | null
          processing_status?: string
          received_at?: string | null
          restaurant_id?: string
          sender?: string | null
          sender_domain?: string | null
          snippet?: string | null
          subject?: string | null
          thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imported_emails_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imported_emails_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_jobs: {
        Row: {
          attempts: number
          created_at: string
          dedupe_key: string | null
          error_code: string | null
          id: string
          kind: string
          last_attempt_at: string | null
          last_error: string | null
          max_attempts: number
          next_attempt_at: string
          order_id: string | null
          payload: Json
          restaurant_id: string
          source_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          dedupe_key?: string | null
          error_code?: string | null
          id?: string
          kind?: string
          last_attempt_at?: string | null
          last_error?: string | null
          max_attempts?: number
          next_attempt_at?: string
          order_id?: string | null
          payload: Json
          restaurant_id: string
          source_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          dedupe_key?: string | null
          error_code?: string | null
          id?: string
          kind?: string
          last_attempt_at?: string | null
          last_error?: string | null
          max_attempts?: number
          next_attempt_at?: string
          order_id?: string | null
          payload?: Json
          restaurant_id?: string
          source_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_jobs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingestion_jobs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "order_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_credentials: {
        Row: {
          ciphertext: string
          id: string
          source_id: string
          updated_at: string
        }
        Insert: {
          ciphertext: string
          id?: string
          source_id: string
          updated_at?: string
        }
        Update: {
          ciphertext?: string
          id?: string
          source_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_credentials_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: true
            referencedRelation: "order_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          available: boolean
          category: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          price: number
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          available?: boolean
          category?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          price?: number
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          available?: boolean
          category?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          price?: number
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          category: string
          created_at: string
          group_key: string | null
          id: string
          link: string | null
          occurrences: number
          read: boolean
          resolved_at: string | null
          restaurant_id: string | null
          title: string
        }
        Insert: {
          body?: string | null
          category: string
          created_at?: string
          group_key?: string | null
          id?: string
          link?: string | null
          occurrences?: number
          read?: boolean
          resolved_at?: string | null
          restaurant_id?: string | null
          title: string
        }
        Update: {
          body?: string | null
          category?: string
          created_at?: string
          group_key?: string | null
          id?: string
          link?: string | null
          occurrences?: number
          read?: boolean
          resolved_at?: string | null
          restaurant_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          name: string
          notes: string | null
          order_id: string
          quantity: number
          restaurant_id: string
          unit_price: number
        }
        Insert: {
          id?: string
          name: string
          notes?: string | null
          order_id: string
          quantity: number
          restaurant_id: string
          unit_price?: number
        }
        Update: {
          id?: string
          name?: string
          notes?: string | null
          order_id?: string
          quantity?: number
          restaurant_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_sources: {
        Row: {
          config: Json
          connected_account: string | null
          connector_key: string
          created_at: string
          display_name: string
          environment: string
          health: string
          id: string
          last_error: string | null
          last_sync_at: string | null
          orders_received: number
          restaurant_id: string
          status: Database["public"]["Enums"]["source_status"]
        }
        Insert: {
          config?: Json
          connected_account?: string | null
          connector_key: string
          created_at?: string
          display_name: string
          environment?: string
          health?: string
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          orders_received?: number
          restaurant_id: string
          status?: Database["public"]["Enums"]["source_status"]
        }
        Update: {
          config?: Json
          connected_account?: string | null
          connector_key?: string
          created_at?: string
          display_name?: string
          environment?: string
          health?: string
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          orders_received?: number
          restaurant_id?: string
          status?: Database["public"]["Enums"]["source_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_sources_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["order_status"] | null
          id: string
          note: string | null
          order_id: string
          restaurant_id: string
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: string
          note?: string | null
          order_id: string
          restaurant_id: string
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: string
          note?: string | null
          order_id?: string
          restaurant_id?: string
          to_status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          coach: string | null
          created_at: string
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          deliver_by: string | null
          delivery_fee: number
          delivery_station: string | null
          delivery_status: string
          discount: number
          external_order_id: string
          id: string
          instructions: string | null
          journey_date: string | null
          order_number: string
          payment_method: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          priority: string
          raw_payload: Json | null
          restaurant_id: string
          seat: string | null
          source_id: string | null
          source_key: string
          source_platform: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax: number
          total: number
          train_name: string | null
          train_number: string | null
          updated_at: string
        }
        Insert: {
          coach?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          deliver_by?: string | null
          delivery_fee?: number
          delivery_station?: string | null
          delivery_status?: string
          discount?: number
          external_order_id: string
          id?: string
          instructions?: string | null
          journey_date?: string | null
          order_number?: string
          payment_method?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          priority?: string
          raw_payload?: Json | null
          restaurant_id: string
          seat?: string | null
          source_id?: string | null
          source_key: string
          source_platform?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax?: number
          total?: number
          train_name?: string | null
          train_number?: string | null
          updated_at?: string
        }
        Update: {
          coach?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          deliver_by?: string | null
          delivery_fee?: number
          delivery_station?: string | null
          delivery_status?: string
          discount?: number
          external_order_id?: string
          id?: string
          instructions?: string | null
          journey_date?: string | null
          order_number?: string
          payment_method?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          priority?: string
          raw_payload?: Json | null
          restaurant_id?: string
          seat?: string | null
          source_id?: string | null
          source_key?: string
          source_platform?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax?: number
          total?: number
          train_name?: string | null
          train_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "order_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string
          mode: string
          order_id: string
          provider_ref: string | null
          restaurant_id: string
          status: Database["public"]["Enums"]["payment_status"]
          verified_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method: string
          mode?: string
          order_id: string
          provider_ref?: string | null
          restaurant_id: string
          status?: Database["public"]["Enums"]["payment_status"]
          verified_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string
          mode?: string
          order_id?: string
          provider_ref?: string | null
          restaurant_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
        }
        Relationships: []
      }
      refunds: {
        Row: {
          amount: number
          created_at: string
          id: string
          order_id: string
          reason: string | null
          restaurant_id: string
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          order_id: string
          reason?: string | null
          restaurant_id: string
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          order_id?: string
          reason?: string | null
          restaurant_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_members: {
        Row: {
          active: boolean
          created_at: string
          display_name: string | null
          id: string
          invited_email: string | null
          restaurant_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name?: string | null
          id?: string
          invited_email?: string | null
          restaurant_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string | null
          id?: string
          invited_email?: string | null
          restaurant_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_members_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          active: boolean
          address: string | null
          bank_details: Json
          created_at: string
          created_by: string
          email: string | null
          gstin: string | null
          id: string
          logo_url: string | null
          name: string
          operating_hours: Json
          owner_name: string | null
          phone: string | null
          stations: string[]
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          bank_details?: Json
          created_at?: string
          created_by: string
          email?: string | null
          gstin?: string | null
          id?: string
          logo_url?: string | null
          name: string
          operating_hours?: Json
          owner_name?: string | null
          phone?: string | null
          stations?: string[]
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          bank_details?: Json
          created_at?: string
          created_by?: string
          email?: string | null
          gstin?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          operating_hours?: Json
          owner_name?: string | null
          phone?: string | null
          stations?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      settlements: {
        Row: {
          adjustments: number
          commission: number
          created_at: string
          discounts: number
          gross: number
          id: string
          net: number
          period_end: string
          period_start: string
          refunds: number
          restaurant_id: string
          source_key: string
          status: string
        }
        Insert: {
          adjustments?: number
          commission?: number
          created_at?: string
          discounts?: number
          gross?: number
          id?: string
          net?: number
          period_end: string
          period_start: string
          refunds?: number
          restaurant_id: string
          source_key: string
          status?: string
        }
        Update: {
          adjustments?: number
          commission?: number
          created_at?: string
          discounts?: number
          gross?: number
          id?: string
          net?: number
          period_end?: string
          period_start?: string
          refunds?: number
          restaurant_id?: string
          source_key?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlements_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_ingested_order: {
        Args: {
          _actor: string
          _items: Json
          _o: Json
          _raw: Json
          _rid: string
          _source_id: string
          _source_key: string
        }
        Returns: Json
      }
      create_restaurant: {
        Args: {
          _address: string
          _bank: Json
          _email: string
          _gstin: string
          _hours: Json
          _logo_url: string
          _name: string
          _owner_name: string
          _phone: string
          _stations: string[]
        }
        Returns: string
      }
      has_any_role: {
        Args: {
          _rid: string
          _roles: Database["public"]["Enums"]["app_role"][]
        }
        Returns: boolean
      }
      is_member: { Args: { _rid: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      member_role: {
        Args: { _rid: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
    }
    Enums: {
      app_role: "owner" | "manager" | "kitchen" | "delivery" | "admin"
      order_status:
        | "NEW"
        | "ACCEPTED"
        | "PREPARING"
        | "READY"
        | "ASSIGNED"
        | "OUT_FOR_DELIVERY"
        | "DELIVERED"
        | "CANCELLED"
        | "REFUNDED"
        | "FAILED"
      payment_status: "PENDING" | "PAID" | "FAILED" | "REFUNDED"
      source_status:
        | "not_connected"
        | "connected"
        | "paused"
        | "error"
        | "syncing"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "manager", "kitchen", "delivery", "admin"],
      order_status: [
        "NEW",
        "ACCEPTED",
        "PREPARING",
        "READY",
        "ASSIGNED",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "CANCELLED",
        "REFUNDED",
        "FAILED",
      ],
      payment_status: ["PENDING", "PAID", "FAILED", "REFUNDED"],
      source_status: [
        "not_connected",
        "connected",
        "paused",
        "error",
        "syncing",
      ],
    },
  },
} as const
