export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type PaymentFrequency = 'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual';

export interface Database {
  public: {
    Tables: {
      clients: {
        Row: {
          id: string
          name: string
          phone: string
          monthly_payment: number
          payment_due_day: number
          status: boolean
          last_payment_date: string | null
          next_payment_date: string | null
          created_at: string
          updated_at: string
          start_date: string
          payment_frequency: PaymentFrequency
          user_id: string | null
          device_key: string | null;
          mac_address: string | null;
          app: string | null;
        }
        Insert: {
          id?: string
          name: string
          phone: string
          monthly_payment: number
          payment_due_day: number
          status?: boolean
          last_payment_date?: string | null
          next_payment_date?: string | null
          created_at?: string
          updated_at?: string
          start_date: string
          payment_frequency?: PaymentFrequency
          user_id?: string | null
          device_key?: string | null;
          mac_address?: string | null;
          app?: string | null;
        }
        Update: {
          id?: string
          name?: string
          phone?: string
          monthly_payment?: number
          payment_due_day?: number
          status?: boolean
          last_payment_date?: string | null
          next_payment_date?: string | null
          created_at?: string
          updated_at?: string
          start_date?: string
          payment_frequency?: PaymentFrequency
          user_id?: string | null
          device_key?: string | null;
          mac_address?: string | null;
          app?: string | null;
        }
      }
      payments: {
        Row: {
          id: string
          client_id: string
          amount: number
          payment_date: string
          reference_month: string
          created_at: string
          user_id: string | null
        }
        Insert: {
          id?: string
          client_id: string
          amount: number
          payment_date?: string
          reference_month?: string
          created_at?: string
          user_id?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          amount?: number
          payment_date?: string
          reference_month?: string
          created_at?: string
          user_id?: string | null
        }
      }
      notifications: {
        Row: {
          id: string
          client_id: string
          type: string
          message: string
          sent_at: string
          status: string
          created_at: string
          user_id: string | null
        }
        Insert: {
          id?: string
          client_id: string
          type: string
          message: string
          sent_at?: string
          status: string
          created_at?: string
          user_id?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          type?: string
          message?: string
          sent_at?: string
          status?: string
          created_at?: string
          user_id?: string | null
        }
      }
      profiles: {
        Row: {
          id: string
          name: string
          created_at: string
          updated_at: string
          is_admin: boolean
          status: string
          last_payment_at: string
          next_payment_due_at: string
        }
        Insert: {
          id: string
          name: string
          created_at?: string
          updated_at?: string
          is_admin: boolean
          status: string
          last_payment_at?: string
          next_payment_due_at?: string
        }
        Update: {
          id?: string
          name?: string
          created_at?: string
          updated_at?: string
          is_admin: boolean
          status: string
          last_payment_at?: string
          next_payment_due_at?: string
        }
      }
    }
  }
}