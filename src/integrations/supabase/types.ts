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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          city: string
          country: string
          created_at: string
          id: string
          is_default: boolean
          label: string
          line1: string
          line2: string | null
          phone: string | null
          postal_code: string | null
          recipient: string
          state: string | null
          user_id: string
        }
        Insert: {
          city: string
          country?: string
          created_at?: string
          id?: string
          is_default?: boolean
          label: string
          line1: string
          line2?: string | null
          phone?: string | null
          postal_code?: string | null
          recipient: string
          state?: string | null
          user_id: string
        }
        Update: {
          city?: string
          country?: string
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          line1?: string
          line2?: string | null
          phone?: string | null
          postal_code?: string | null
          recipient?: string
          state?: string | null
          user_id?: string
        }
        Relationships: []
      }
      brands: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          image: string | null
          is_active: boolean
          name: string
          parent_id: string | null
          sap_group_code: number | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          image?: string | null
          is_active?: boolean
          name: string
          parent_id?: string | null
          sap_group_code?: number | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          image?: string | null
          is_active?: boolean
          name?: string
          parent_id?: string | null
          sap_group_code?: number | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          per_user_limit: number
          promotion_id: string | null
          usage_limit: number | null
          used_count: number
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          per_user_limit?: number
          promotion_id?: string | null
          usage_limit?: number | null
          used_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          per_user_limit?: number
          promotion_id?: string | null
          usage_limit?: number | null
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupons_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_accounts: {
        Row: {
          company_name: string | null
          created_at: string
          credit_limit: number | null
          customer_type: string
          id: string
          sap_card_code: string | null
          sap_sync_status: string
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          credit_limit?: number | null
          customer_type?: string
          id: string
          sap_card_code?: string | null
          sap_sync_status?: string
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          credit_limit?: number | null
          customer_type?: string
          id?: string
          sap_card_code?: string | null
          sap_sync_status?: string
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      integration_event_queue: {
        Row: {
          aggregate_id: string | null
          aggregate_type: string
          attempts: number
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          payload: Json
          processed_at: string | null
          scheduled_at: string
          status: string
        }
        Insert: {
          aggregate_id?: string | null
          aggregate_type: string
          attempts?: number
          created_at?: string
          event_type: string
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          scheduled_at?: string
          status?: string
        }
        Update: {
          aggregate_id?: string | null
          aggregate_type?: string
          attempts?: number
          created_at?: string
          event_type?: string
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          scheduled_at?: string
          status?: string
        }
        Relationships: []
      }
      inventory: {
        Row: {
          available: number | null
          committed: number
          id: string
          last_sap_sync_at: string | null
          product_id: string
          qty: number
          reorder_point: number
          store_id: string
          updated_at: string
        }
        Insert: {
          available?: number | null
          committed?: number
          id?: string
          last_sap_sync_at?: string | null
          product_id: string
          qty?: number
          reorder_point?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          available?: number | null
          committed?: number
          id?: string
          last_sap_sync_at?: string | null
          product_id?: string
          qty?: number
          reorder_point?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_reservations: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          order_id: string | null
          product_id: string
          qty: number
          status: string
          store_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          order_id?: string | null
          product_id: string
          qty: number
          status?: string
          store_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          order_id?: string | null
          product_id?: string
          qty?: number
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_reservations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          cancelled_at: string | null
          created_at: string
          currency: string
          id: string
          invoice_number: string | null
          issued_at: string | null
          order_id: string | null
          pdf_url: string | null
          raw_payload: Json | null
          sap_doc_entry: number | null
          sap_doc_num: string | null
          status: string
          subtotal: number
          tax: number
          total: number
          user_id: string | null
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          invoice_number?: string | null
          issued_at?: string | null
          order_id?: string | null
          pdf_url?: string | null
          raw_payload?: Json | null
          sap_doc_entry?: number | null
          sap_doc_num?: string | null
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          user_id?: string | null
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          invoice_number?: string | null
          issued_at?: string | null
          order_id?: string | null
          pdf_url?: string | null
          raw_payload?: Json | null
          sap_doc_entry?: number | null
          sap_doc_num?: string | null
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          channel: string
          created_at: string
          customer_account_id: string | null
          event_type: string
          id: string
          payload: Json
          sent_at: string | null
          status: string
          subject: string | null
        }
        Insert: {
          body?: string | null
          channel: string
          created_at?: string
          customer_account_id?: string | null
          event_type: string
          id?: string
          payload?: Json
          sent_at?: string | null
          status?: string
          subject?: string | null
        }
        Update: {
          body?: string | null
          channel?: string
          created_at?: string
          customer_account_id?: string | null
          event_type?: string
          id?: string
          payload?: Json
          sent_at?: string | null
          status?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_customer_account_id_fkey"
            columns: ["customer_account_id"]
            isOneToOne: false
            referencedRelation: "customer_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          image: string | null
          line_total: number
          name: string
          order_id: string
          product_id: string | null
          qty: number
          sku: string
          unit_price: number
          warehouse_code: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          image?: string | null
          line_total: number
          name: string
          order_id: string
          product_id?: string | null
          qty: number
          sku: string
          unit_price: number
          warehouse_code?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          image?: string | null
          line_total?: number
          name?: string
          order_id?: string
          product_id?: string | null
          qty?: number
          sku?: string
          unit_price?: number
          warehouse_code?: string | null
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
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          coupon_code: string | null
          created_at: string
          currency: string
          discount: number
          fulfillment: string
          id: string
          items: Json
          notes: string | null
          order_number: string
          payment_method: string | null
          payment_status: string
          sap_doc_entry: number | null
          sap_sync_status: string | null
          shipping: number
          shipping_address: Json | null
          status: string
          store_id: string | null
          subtotal: number
          tax: number
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          coupon_code?: string | null
          created_at?: string
          currency?: string
          discount?: number
          fulfillment?: string
          id?: string
          items?: Json
          notes?: string | null
          order_number?: string
          payment_method?: string | null
          payment_status?: string
          sap_doc_entry?: number | null
          sap_sync_status?: string | null
          shipping?: number
          shipping_address?: Json | null
          status?: string
          store_id?: string | null
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          coupon_code?: string | null
          created_at?: string
          currency?: string
          discount?: number
          fulfillment?: string
          id?: string
          items?: Json
          notes?: string | null
          order_number?: string
          payment_method?: string | null
          payment_status?: string
          sap_doc_entry?: number | null
          sap_sync_status?: string | null
          shipping?: number
          shipping_address?: Json | null
          status?: string
          store_id?: string | null
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          metadata: Json
          order_id: string
          provider: string
          provider_payment_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json
          order_id: string
          provider: string
          provider_payment_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json
          order_id?: string
          provider?: string
          provider_payment_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt: string | null
          created_at: string
          id: string
          is_primary: boolean
          product_id: string
          sort_order: number
          url: string
        }
        Insert: {
          alt?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          product_id: string
          sort_order?: number
          url: string
        }
        Update: {
          alt?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          product_id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          attributes: Json
          created_at: string
          id: string
          is_active: boolean
          name: string
          price_delta: number
          product_id: string
          sku: string
        }
        Insert: {
          attributes?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          price_delta?: number
          product_id: string
          sku: string
        }
        Update: {
          attributes?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          price_delta?: number
          product_id?: string
          sku?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand_id: string | null
          category_id: string | null
          created_at: string
          currency: string
          description: string | null
          dimensions: Json | null
          id: string
          image: string | null
          images: Json
          is_active: boolean
          labels: string[]
          name: string
          original_price: number | null
          price: number
          rating: number
          reviews: number
          sap_item_code: string | null
          sap_last_sync_at: string | null
          sap_sync_status: string
          short_description: string | null
          sku: string
          slug: string
          specs: Json
          tax_rate: number
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          dimensions?: Json | null
          id?: string
          image?: string | null
          images?: Json
          is_active?: boolean
          labels?: string[]
          name: string
          original_price?: number | null
          price?: number
          rating?: number
          reviews?: number
          sap_item_code?: string | null
          sap_last_sync_at?: string | null
          sap_sync_status?: string
          short_description?: string | null
          sku: string
          slug: string
          specs?: Json
          tax_rate?: number
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          dimensions?: Json | null
          id?: string
          image?: string | null
          images?: Json
          is_active?: boolean
          labels?: string[]
          name?: string
          original_price?: number | null
          price?: number
          rating?: number
          reviews?: number
          sap_item_code?: string | null
          sap_last_sync_at?: string | null
          sap_sync_status?: string
          short_description?: string | null
          sku?: string
          slug?: string
          specs?: Json
          tax_rate?: number
          updated_at?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      promotional_banners: {
        Row: {
          created_at: string
          ends_at: string | null
          id: string
          image_url: string
          is_active: boolean
          placement: string
          sort_order: number
          starts_at: string | null
          subtitle: string | null
          target_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          id?: string
          image_url: string
          is_active?: boolean
          placement: string
          sort_order?: number
          starts_at?: string | null
          subtitle?: string | null
          target_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          id?: string
          image_url?: string
          is_active?: boolean
          placement?: string
          sort_order?: number
          starts_at?: string | null
          subtitle?: string | null
          target_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      promotions: {
        Row: {
          created_at: string
          description: string | null
          discount_type: string
          discount_value: number
          ends_at: string | null
          id: string
          is_active: boolean
          min_purchase: number | null
          name: string
          starts_at: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          discount_type: string
          discount_value: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          min_purchase?: number | null
          name: string
          starts_at?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          min_purchase?: number | null
          name?: string
          starts_at?: string | null
        }
        Relationships: []
      }
      sap_events: {
        Row: {
          event_type: string
          id: string
          payload: Json | null
          processed_at: string | null
          processing_error: string | null
          received_at: string
        }
        Insert: {
          event_type: string
          id?: string
          payload?: Json | null
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Update: {
          event_type?: string
          id?: string
          payload?: Json | null
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Relationships: []
      }
      sap_sync_log: {
        Row: {
          direction: string
          error: string | null
          finished_at: string | null
          id: string
          job: string
          records_failed: number
          records_processed: number
          started_at: string
          status: string
        }
        Insert: {
          direction: string
          error?: string | null
          finished_at?: string | null
          id?: string
          job: string
          records_failed?: number
          records_processed?: number
          started_at?: string
          status: string
        }
        Update: {
          direction?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          job?: string
          records_failed?: number
          records_processed?: number
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      shipment_events: {
        Row: {
          description: string | null
          id: string
          location: string | null
          occurred_at: string
          shipment_id: string
          status: string
        }
        Insert: {
          description?: string | null
          id?: string
          location?: string | null
          occurred_at?: string
          shipment_id: string
          status: string
        }
        Update: {
          description?: string | null
          id?: string
          location?: string | null
          occurred_at?: string
          shipment_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_events_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          carrier: string
          cost: number | null
          created_at: string
          delivered_at: string | null
          destination: Json
          estimated_delivery: string | null
          id: string
          order_id: string
          origin_store_id: string | null
          package_count: number
          shipped_at: string | null
          status: string
          tracking_number: string | null
          updated_at: string
          volumetric_weight: number | null
          weight_kg: number | null
        }
        Insert: {
          carrier?: string
          cost?: number | null
          created_at?: string
          delivered_at?: string | null
          destination: Json
          estimated_delivery?: string | null
          id?: string
          order_id: string
          origin_store_id?: string | null
          package_count?: number
          shipped_at?: string | null
          status?: string
          tracking_number?: string | null
          updated_at?: string
          volumetric_weight?: number | null
          weight_kg?: number | null
        }
        Update: {
          carrier?: string
          cost?: number | null
          created_at?: string
          delivered_at?: string | null
          destination?: Json
          estimated_delivery?: string | null
          id?: string
          order_id?: string
          origin_store_id?: string | null
          package_count?: number
          shipped_at?: string | null
          status?: string
          tracking_number?: string | null
          updated_at?: string
          volumetric_weight?: number | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_origin_store_id_fkey"
            columns: ["origin_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_methods: {
        Row: {
          base_price: number
          carrier: string | null
          code: string
          created_at: string
          estimated_days: string | null
          free_from: number | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          type: string
        }
        Insert: {
          base_price?: number
          carrier?: string | null
          code: string
          created_at?: string
          estimated_days?: string | null
          free_from?: number | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          type?: string
        }
        Update: {
          base_price?: number
          carrier?: string | null
          code?: string
          created_at?: string
          estimated_days?: string | null
          free_from?: number | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          type?: string
        }
        Relationships: []
      }
      store_pickups: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          order_id: string
          picked_up_at: string | null
          pickup_code: string
          ready_at: string | null
          status: string
          store_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          order_id: string
          picked_up_at?: string | null
          pickup_code: string
          ready_at?: string | null
          status?: string
          store_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          order_id?: string
          picked_up_at?: string | null
          pickup_code?: string
          ready_at?: string | null
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_pickups_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_pickups_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          address: string | null
          city: string | null
          code: string
          created_at: string
          hours: string | null
          id: string
          is_active: boolean
          is_pickup_enabled: boolean
          latitude: number | null
          longitude: number | null
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          code: string
          created_at?: string
          hours?: string | null
          id?: string
          is_active?: boolean
          is_pickup_enabled?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string
          created_at?: string
          hours?: string | null
          id?: string
          is_active?: boolean
          is_pickup_enabled?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      wishlist_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          product_image: string | null
          product_name: string
          product_price: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          product_image?: string | null
          product_name: string
          product_price: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          product_image?: string | null
          product_name?: string
          product_price?: number
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
  public: {
    Enums: {},
  },
} as const
