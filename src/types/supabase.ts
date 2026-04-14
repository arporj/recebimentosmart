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
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      client_custom_field_values: {
        Row: {
          client_id: string | null
          created_at: string | null
          field_id: string | null
          id: string
          value: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          field_id?: string | null
          id?: string
          value?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          field_id?: string | null
          id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_custom_field_values_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_custom_field_values_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "custom_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          id: string
          last_payment_date: string | null
          monthly_payment: number
          name: string
          next_payment_date: string | null
          payment_due_day: number | null
          payment_frequency: Database["public"]["Enums"]["payment_frequency_type"]
          phone: string
          start_date: string
          status: boolean | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          last_payment_date?: string | null
          monthly_payment: number
          name: string
          next_payment_date?: string | null
          payment_due_day?: number | null
          payment_frequency?: Database["public"]["Enums"]["payment_frequency_type"]
          phone: string
          start_date?: string
          status?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          last_payment_date?: string | null
          monthly_payment?: number
          name?: string
          next_payment_date?: string | null
          payment_due_day?: number | null
          payment_frequency?: Database["public"]["Enums"]["payment_frequency_type"]
          phone?: string
          start_date?: string
          status?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      custom_fields: {
        Row: {
          created_at: string | null
          id: string
          name: string
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          type?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      email_broadcasts: {
        Row: {
          body: string
          created_at: string
          error_message: string | null
          id: string
          processed_at: string | null
          status: string
          subject: string
        }
        Insert: {
          body: string
          created_at?: string
          error_message?: string | null
          id?: string
          processed_at?: string | null
          status?: string
          subject: string
        }
        Update: {
          body?: string
          created_at?: string
          error_message?: string | null
          id?: string
          processed_at?: string | null
          status?: string
          subject?: string
        }
        Relationships: []
      }
      feedback_messages: {
        Row: {
          created_at: string
          feedback_id: string
          id: string
          message: string
          sender_id: string | null
        }
        Insert: {
          created_at?: string
          feedback_id: string
          id?: string
          message: string
          sender_id?: string | null
        }
        Update: {
          created_at?: string
          feedback_id?: string
          id?: string
          message?: string
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_messages_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "feedbacks"
            referencedColumns: ["id"]
          },
        ]
      }
      feedbacks: {
        Row: {
          created_at: string
          has_unread_admin: boolean
          has_unread_user: boolean
          id: string
          last_activity_at: string
          status: string
          subject: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          has_unread_admin?: boolean
          has_unread_user?: boolean
          id?: string
          last_activity_at?: string
          status?: string
          subject: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          has_unread_admin?: boolean
          has_unread_user?: boolean
          id?: string
          last_activity_at?: string
          status?: string
          subject?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      financial_tags: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      financial_transactions: {
        Row: {
          amount: number
          client_id: string | null
          created_at: string | null
          date: string
          description: string | null
          id: string
          recurrence_enabled: boolean | null
          recurrence_interval: number | null
          recurrence_period: string | null
          status: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          client_id?: string | null
          created_at?: string | null
          date: string
          description?: string | null
          id?: string
          recurrence_enabled?: boolean | null
          recurrence_interval?: number | null
          recurrence_period?: string | null
          status?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          client_id?: string | null
          created_at?: string | null
          date?: string
          description?: string | null
          id?: string
          recurrence_enabled?: boolean | null
          recurrence_interval?: number | null
          recurrence_period?: string | null
          status?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string | null
          created_at: string
          id: number
          sender_id: string | null
        }
        Insert: {
          content: string
          conversation_id?: string | null
          created_at?: string
          id?: number
          sender_id?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string | null
          created_at?: string
          id?: number
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          client_id: string | null
          created_at: string | null
          id: string
          message: string
          sent_at: string | null
          status: string
          type: string
          user_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          id?: string
          message: string
          sent_at?: string | null
          status: string
          type: string
          user_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          id?: string
          message?: string
          sent_at?: string | null
          status?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      password_reset_tokens: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: number
          token: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: number
          token: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: number
          token?: string
        }
        Relationships: []
      }
      payment_transactions: {
        Row: {
          amount: number
          charge_id: string | null
          created_at: string | null
          description: string | null
          id: string
          payment_method: string | null
          reference_id: string
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          charge_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          payment_method?: string | null
          reference_id: string
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          charge_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          payment_method?: string | null
          reference_id?: string
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          client_id: string | null
          created_at: string | null
          id: string
          payment_date: string | null
          payment_method: string | null
          reference_id: string | null
          reference_month: string | null
          user_id: string | null
        }
        Insert: {
          amount: number
          client_id?: string | null
          created_at?: string | null
          id?: string
          payment_date?: string | null
          payment_method?: string | null
          reference_id?: string | null
          reference_month?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          client_id?: string | null
          created_at?: string | null
          id?: string
          payment_date?: string | null
          payment_method?: string | null
          reference_id?: string | null
          reference_month?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      pix_transactions: {
        Row: {
          amount: number
          created_at: string
          id: number
          status: string
          transaction_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: number
          status?: string
          transaction_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: number
          status?: string
          transaction_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          created_at: string
          description: string | null
          features: Json | null
          id: number
          name: string
          price_monthly: number
          price_yearly: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          features?: Json | null
          id?: number
          name: string
          price_monthly?: number
          price_yearly?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          features?: Json | null
          id?: number
          name?: string
          price_monthly?: number
          price_yearly?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          cpf_cnpj: string | null
          created_at: string | null
          id: string
          is_admin: boolean
          last_payment_at: string | null
          name: string
          next_payment_due_at: string | null
          pix_key: string | null
          plano: Database["public"]["Enums"]["plan_type"] | null
          referral_code: string | null
          referral_credits: number
          updated_at: string | null
          valid_until: string | null
        }
        Insert: {
          cpf_cnpj?: string | null
          created_at?: string | null
          id: string
          is_admin?: boolean
          last_payment_at?: string | null
          name: string
          next_payment_due_at?: string | null
          pix_key?: string | null
          plano?: Database["public"]["Enums"]["plan_type"] | null
          referral_code?: string | null
          referral_credits?: number
          updated_at?: string | null
          valid_until?: string | null
        }
        Update: {
          cpf_cnpj?: string | null
          created_at?: string | null
          id?: string
          is_admin?: boolean
          last_payment_at?: string | null
          name?: string
          next_payment_due_at?: string | null
          pix_key?: string | null
          plano?: Database["public"]["Enums"]["plan_type"] | null
          referral_code?: string | null
          referral_credits?: number
          updated_at?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      referral_credits: {
        Row: {
          created_at: string | null
          credit_amount: number
          credited_at: string | null
          id: string
          referral_level: number
          referred_user_id: string
          referrer_user_id: string
          status: string | null
        }
        Insert: {
          created_at?: string | null
          credit_amount: number
          credited_at?: string | null
          id?: string
          referral_level: number
          referred_user_id: string
          referrer_user_id: string
          status?: string | null
        }
        Update: {
          created_at?: string | null
          credit_amount?: number
          credited_at?: string | null
          id?: string
          referral_level?: number
          referred_user_id?: string
          referrer_user_id?: string
          status?: string | null
        }
        Relationships: []
      }
      referrals: {
        Row: {
          created_at: string | null
          id: string
          is_converted: boolean | null
          is_used_for_renewal: boolean | null
          referred_id: string
          referrer_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_converted?: boolean | null
          is_used_for_renewal?: boolean | null
          referred_id: string
          referrer_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_converted?: boolean | null
          is_used_for_renewal?: boolean | null
          referred_id?: string
          referrer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount: number
          created_at: string | null
          id: number
          payment_provider: string | null
          subscription_date: string | null
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: number
          payment_provider?: string | null
          subscription_date?: string | null
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: number
          payment_provider?: string | null
          subscription_date?: string | null
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_tags: {
        Row: {
          tag_id: string
          transaction_id: string
        }
        Insert: {
          tag_id: string
          transaction_id: string
        }
        Update: {
          tag_id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "financial_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_tags_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_create_user_profile: {
        Args: {
          p_name: string
          p_plano?: Database["public"]["Enums"]["plan_type"]
          p_user_id: string
          p_valid_until?: string
        }
        Returns: Json
      }
      admin_delete_user: { Args: { p_user_id: string }; Returns: undefined }
      admin_set_user_plan: {
        Args: { new_plan_name: string; user_id_to_update: string }
        Returns: undefined
      }
      admin_update_user_admin_status: {
        Args: { p_is_admin: boolean; p_user_id: string }
        Returns: undefined
      }
      admin_update_user_validity: {
        Args: { new_valid_until: string; p_user_id: string }
        Returns: undefined
      }
      apply_referral_credit_multilevel: {
        Args: { p_referred_user_id: string }
        Returns: boolean
      }
      calculate_next_payment_date: {
        Args: {
          payment_day: number
          payment_freq: Database["public"]["Enums"]["payment_frequency_type"]
          payment_timestamp: string
        }
        Returns: string
      }
      calculate_referral_credits: {
        Args: { p_user_id: string }
        Returns: number
      }
      check_user_blocked: { Args: { p_user_id: string }; Returns: boolean }
      create_user_with_profile: {
        Args: { user_email: string; user_name: string; user_password: string }
        Returns: Json
      }
      generate_referral_code: { Args: never; Returns: string }
      get_admin_dashboard_kpis: { Args: never; Returns: Json }
      get_admin_feedbacks: {
        Args: never
        Returns: {
          created_at: string
          has_unread_admin: boolean
          has_unread_user: boolean
          id: string
          last_activity_at: string
          status: string
          subject: string
          type: string
          updated_at: string
          user_data: Json
          user_id: string
        }[]
      }
      get_all_plans_with_prices: {
        Args: never
        Returns: {
          features: Json
          name: string
          price_monthly: number
          price_yearly: number
        }[]
      }
      get_all_users_admin: {
        Args: never
        Returns: {
          created_at: string
          email: string
          id: string
          is_admin: boolean
          last_sign_in_at: string
          name: string
          plan_name: string
          subscription_end_date: string
          subscription_status: string
        }[]
      }
      get_full_referral_stats: {
        Args: { p_user_id: string }
        Returns: {
          available_credits: number
          referral_code: string
          referrer_name: string
          total_paid: number
          total_registered: number
          was_referred: boolean
        }[]
      }
      get_my_referral_code: { Args: never; Returns: string }
      get_my_user_info: {
        Args: never
        Returns: {
          p_key: string
          ref_code: string
        }[]
      }
      get_referral_stats: {
        Args: { p_user_id: string }
        Returns: {
          available_credits: number
          referrer_name: string
          was_referred: boolean
        }[]
      }
      get_subscription_page_data:
        | { Args: never; Returns: Json }
        | { Args: { p_user_id?: string }; Returns: Json }
      get_user_id_by_referral_code: {
        Args: { p_referral_code: string }
        Returns: string
      }
      get_user_status_name: { Args: { p_user_id: string }; Returns: string }
      grant_referral_credit: {
        Args: { paid_plan_name: string; referred_user_id: string }
        Returns: undefined
      }
      handle_user_payment: { Args: { p_user_id: string }; Returns: undefined }
      invoke_process_broadcast_queue_function: {
        Args: never
        Returns: undefined
      }
      is_admin: { Args: { p_user_id: string }; Returns: boolean }
      is_paid_user: { Args: { p_user_id: string }; Returns: boolean }
      process_subscription_renewals: { Args: never; Returns: undefined }
      register_manual_payment: {
        Args: {
          p_amount: number
          p_credits_used?: number
          p_payment_date: string
          p_plan_name: string
          p_user_id: string
        }
        Returns: Json
      }
      set_user_status_by_name: {
        Args: { p_new_status_name: string; p_user_id: string }
        Returns: undefined
      }
      update_last_seen: { Args: never; Returns: undefined }
      update_my_pix_key: { Args: { p_pix_key: string }; Returns: undefined }
      update_plan_prices: { Args: { prices_data: Json }; Returns: undefined }
      update_price_and_notify: { Args: { new_price: string }; Returns: string }
      update_user_subscription: {
        Args: { p_plan_name: string; p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      payment_frequency_type:
        | "monthly"
        | "bimonthly"
        | "quarterly"
        | "semiannual"
        | "annual"
      plan_type: "basico" | "pro" | "premium" | "trial"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type PaymentFrequency = Database['public']['Enums']['payment_frequency_type'];
