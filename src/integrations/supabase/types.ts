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
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      accounting_periods: {
        Row: {
          created_at: string;
          end_date: string | null;
          id: string;
          legal_entity_id: string;
          period_name: string;
          start_date: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          end_date?: string | null;
          id?: string;
          legal_entity_id: string;
          period_name: string;
          start_date: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          end_date?: string | null;
          id?: string;
          legal_entity_id?: string;
          period_name?: string;
          start_date?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      accounts: {
        Row: {
          account_code: string;
          account_type: string;
          created_at: string;
          id: string;
          legal_entity_id: string;
          name: string;
          parent_id: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          account_code: string;
          account_type: string;
          created_at?: string;
          id?: string;
          legal_entity_id: string;
          name: string;
          parent_id?: string | null;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          account_code?: string;
          account_type?: string;
          created_at?: string;
          id?: string;
          legal_entity_id?: string;
          name?: string;
          parent_id?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      admissions: {
        Row: {
          admitted_at: string;
          created_at: string;
          discharged_at: string | null;
          encounter_id: string;
          facility_id: string;
          id: string;
          patient_id: string;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          admitted_at?: string;
          created_at?: string;
          discharged_at?: string | null;
          encounter_id: string;
          facility_id: string;
          id?: string;
          patient_id: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          admitted_at?: string;
          created_at?: string;
          discharged_at?: string | null;
          encounter_id?: string;
          facility_id?: string;
          id?: string;
          patient_id?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      allergies: {
        Row: {
          created_at: string;
          id: string;
          patient_id: string;
          reaction: string;
          severity: string;
          status: string;
          substance: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          patient_id: string;
          reaction: string;
          severity: string;
          status?: string;
          substance: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          patient_id?: string;
          reaction?: string;
          severity?: string;
          status?: string;
          substance?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      appointments: {
        Row: {
          appointment_type: string;
          created_at: string;
          doctor_responded_at: string | null;
          doctor_response: string;
          doctor_response_note: string | null;
          duration_minutes: number;
          encounter_id: string | null;
          facility_id: string;
          id: string;
          location: string | null;
          patient_id: string;
          provider_id: string;
          reason: string | null;
          scheduled_at: string;
          scheduled_by: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          appointment_type?: string;
          created_at?: string;
          doctor_responded_at?: string | null;
          doctor_response?: string;
          doctor_response_note?: string | null;
          duration_minutes?: number;
          encounter_id?: string | null;
          facility_id: string;
          id?: string;
          location?: string | null;
          patient_id: string;
          provider_id: string;
          reason?: string | null;
          scheduled_at: string;
          scheduled_by?: string | null;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          appointment_type?: string;
          created_at?: string;
          doctor_responded_at?: string | null;
          doctor_response?: string;
          doctor_response_note?: string | null;
          duration_minutes?: number;
          encounter_id?: string | null;
          facility_id?: string;
          id?: string;
          location?: string | null;
          patient_id?: string;
          provider_id?: string;
          reason?: string | null;
          scheduled_at?: string;
          scheduled_by?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      approval_requests: {
        Row: {
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          entity_version: number;
          id: string;
          reason: string | null;
          requested_by: string | null;
          resolved_at: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
          workflow_type: string;
        };
        Insert: {
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          entity_version?: number;
          id?: string;
          reason?: string | null;
          requested_by?: string | null;
          resolved_at?: string | null;
          status?: string;
          tenant_id: string;
          updated_at?: string;
          workflow_type: string;
        };
        Update: {
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          entity_version?: number;
          id?: string;
          reason?: string | null;
          requested_by?: string | null;
          resolved_at?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          workflow_type?: string;
        };
        Relationships: [];
      };

      approval_steps: {
        Row: {
          approval_request_id: string;
          approved_at: string | null;
          approved_by: string | null;
          approver_role_id: string;
          comment: string | null;
          created_at: string;
          id: string;
          status: string;
          step_number: number;
        };
        Insert: {
          approval_request_id: string;
          approved_at?: string | null;
          approved_by?: string | null;
          approver_role_id: string;
          comment?: string | null;
          created_at?: string;
          id?: string;
          status?: string;
          step_number: number;
        };
        Update: {
          approval_request_id?: string;
          approved_at?: string | null;
          approved_by?: string | null;
          approver_role_id?: string;
          comment?: string | null;
          created_at?: string;
          id?: string;
          status?: string;
          step_number?: number;
        };
        Relationships: [];
      };

      assets: {
        Row: {
          asset_code: string;
          created_at: string;
          facility_id: string;
          id: string;
          name: string;
          purchase_date: string;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          asset_code: string;
          created_at?: string;
          facility_id: string;
          id?: string;
          name: string;
          purchase_date: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          asset_code?: string;
          created_at?: string;
          facility_id?: string;
          id?: string;
          name?: string;
          purchase_date?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      attendance_records: {
        Row: {
          attendance_date: string;
          clock_in: string;
          clock_out: string | null;
          created_at: string;
          employee_id: string;
          facility_id: string;
          id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          attendance_date: string;
          clock_in: string;
          clock_out?: string | null;
          created_at?: string;
          employee_id: string;
          facility_id: string;
          id?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          attendance_date?: string;
          clock_in?: string;
          clock_out?: string | null;
          created_at?: string;
          employee_id?: string;
          facility_id?: string;
          id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      audit_events: {
        Row: {
          action: string;
          actor_id: string;
          before_after: Json | null;
          correlation_id: string | null;
          created_at: string;
          device: string | null;
          entity_id: string | null;
          entity_type: string;
          id: string;
          ip_address: string | null;
          occurred_at: string;
          outcome: string;
          reason: string | null;
          tenant_id: string;
        };
        Insert: {
          action: string;
          actor_id: string;
          before_after?: Json | null;
          correlation_id?: string | null;
          created_at?: string;
          device?: string | null;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          ip_address?: string | null;
          occurred_at?: string;
          outcome: string;
          reason?: string | null;
          tenant_id: string;
        };
        Update: {
          action?: string;
          actor_id?: string;
          before_after?: Json | null;
          correlation_id?: string | null;
          created_at?: string;
          device?: string | null;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          ip_address?: string | null;
          occurred_at?: string;
          outcome?: string;
          reason?: string | null;
          tenant_id?: string;
        };
        Relationships: [];
      };

      bank_accounts: {
        Row: {
          account_name: string;
          account_number: string;
          bank_name: string;
          created_at: string;
          currency: string;
          id: string;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          account_name: string;
          account_number: string;
          bank_name: string;
          created_at?: string;
          currency?: string;
          id?: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          account_name?: string;
          account_number?: string;
          bank_name?: string;
          created_at?: string;
          currency?: string;
          id?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      bank_reconciliations: {
        Row: {
          bank_account_id: string;
          closing_balance: number;
          created_at: string;
          id: string;
          opening_balance: number;
          reconciled_at: string | null;
          statement_date: string;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          bank_account_id: string;
          closing_balance: number;
          created_at?: string;
          id?: string;
          opening_balance: number;
          reconciled_at?: string | null;
          statement_date: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          bank_account_id?: string;
          closing_balance?: number;
          created_at?: string;
          id?: string;
          opening_balance?: number;
          reconciled_at?: string | null;
          statement_date?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      bed_assignments: {
        Row: {
          admission_id: string;
          bed_id: string;
          created_at: string;
          end_at: string | null;
          id: string;
          start_at: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          admission_id: string;
          bed_id: string;
          created_at?: string;
          end_at?: string | null;
          id?: string;
          start_at?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          admission_id?: string;
          bed_id?: string;
          created_at?: string;
          end_at?: string | null;
          id?: string;
          start_at?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      beds: {
        Row: {
          bed_code: string;
          bed_type: string;
          created_at: string;
          facility_id: string;
          id: string;
          is_occupied: boolean;
          status: string;
          tenant_id: string;
          updated_at: string;
          ward: string;
        };
        Insert: {
          bed_code: string;
          bed_type?: string;
          created_at?: string;
          facility_id: string;
          id?: string;
          is_occupied?: boolean;
          status?: string;
          tenant_id: string;
          updated_at?: string;
          ward?: string;
        };
        Update: {
          bed_code?: string;
          bed_type?: string;
          created_at?: string;
          facility_id?: string;
          id?: string;
          is_occupied?: boolean;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          ward?: string;
        };
        Relationships: [];
      };

      charge_catalog: {
        Row: {
          base_rate: number;
          category: string;
          charge_code: string;
          created_at: string;
          effective_from: string;
          effective_to: string | null;
          id: string;
          name: string;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          base_rate: number;
          category: string;
          charge_code: string;
          created_at?: string;
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          name: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          base_rate?: number;
          category?: string;
          charge_code?: string;
          created_at?: string;
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          name?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      clinical_documents: {
        Row: {
          created_at: string;
          document_id: string;
          document_type: string;
          encounter_id: string | null;
          id: string;
          patient_id: string;
          tenant_id: string;
          uploaded_by: string;
        };
        Insert: {
          created_at?: string;
          document_id: string;
          document_type: string;
          encounter_id?: string | null;
          id?: string;
          patient_id: string;
          tenant_id: string;
          uploaded_by: string;
        };
        Update: {
          created_at?: string;
          document_id?: string;
          document_type?: string;
          encounter_id?: string | null;
          id?: string;
          patient_id?: string;
          tenant_id?: string;
          uploaded_by?: string;
        };
        Relationships: [];
      };

      clinical_notes: {
        Row: {
          amendment_reason: string | null;
          author_id: string;
          content: string;
          content_hash: string | null;
          created_at: string;
          encounter_id: string;
          id: string;
          note_type: string;
          signed_at: string | null;
          signed_by: string | null;
          status: string;
          supersedes_id: string | null;
          tenant_id: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          amendment_reason?: string | null;
          author_id: string;
          content: string;
          content_hash?: string | null;
          created_at?: string;
          encounter_id: string;
          id?: string;
          note_type: string;
          signed_at?: string | null;
          signed_by?: string | null;
          status?: string;
          supersedes_id?: string | null;
          tenant_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          amendment_reason?: string | null;
          author_id?: string;
          content?: string;
          content_hash?: string | null;
          created_at?: string;
          encounter_id?: string;
          id?: string;
          note_type?: string;
          signed_at?: string | null;
          signed_by?: string | null;
          status?: string;
          supersedes_id?: string | null;
          tenant_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [];
      };

      cost_centers: {
        Row: {
          code: string;
          created_at: string;
          department_id: string | null;
          id: string;
          name: string;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          department_id?: string | null;
          id?: string;
          name: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          department_id?: string | null;
          id?: string;
          name?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      credit_note_items: {
        Row: {
          amount: number;
          created_at: string;
          credit_note_id: string;
          id: string;
          invoice_item_id: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          credit_note_id: string;
          id?: string;
          invoice_item_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          credit_note_id?: string;
          id?: string;
          invoice_item_id?: string;
        };
        Relationships: [];
      };

      credit_notes: {
        Row: {
          amount: number;
          created_at: string;
          credit_note_number: string;
          id: string;
          invoice_id: string;
          issued_at: string | null;
          reason: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          credit_note_number: string;
          id?: string;
          invoice_id: string;
          issued_at?: string | null;
          reason?: string | null;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          credit_note_number?: string;
          id?: string;
          invoice_id?: string;
          issued_at?: string | null;
          reason?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      departments: {
        Row: {
          created_at: string;
          department_code: string;
          facility_id: string;
          id: string;
          name: string;
          parent_id: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          department_code: string;
          facility_id: string;
          id?: string;
          name: string;
          parent_id?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          department_code?: string;
          facility_id?: string;
          id?: string;
          name?: string;
          parent_id?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      designations: {
        Row: {
          code: string;
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      diagnoses: {
        Row: {
          code_system: string;
          created_at: string;
          description: string | null;
          diagnosis_code: string;
          diagnosis_type: string;
          encounter_id: string;
          id: string;
          tenant_id: string;
        };
        Insert: {
          code_system?: string;
          created_at?: string;
          description?: string | null;
          diagnosis_code: string;
          diagnosis_type: string;
          encounter_id: string;
          id?: string;
          tenant_id: string;
        };
        Update: {
          code_system?: string;
          created_at?: string;
          description?: string | null;
          diagnosis_code?: string;
          diagnosis_type?: string;
          encounter_id?: string;
          id?: string;
          tenant_id?: string;
        };
        Relationships: [];
      };

      dispense_allocations: {
        Row: {
          batch_id: string;
          created_at: string;
          dispense_id: string;
          id: string;
          location_id: string;
          quantity: number;
          stock_movement_id: string;
        };
        Insert: {
          batch_id: string;
          created_at?: string;
          dispense_id: string;
          id?: string;
          location_id: string;
          quantity: number;
          stock_movement_id: string;
        };
        Update: {
          batch_id?: string;
          created_at?: string;
          dispense_id?: string;
          id?: string;
          location_id?: string;
          quantity?: number;
          stock_movement_id?: string;
        };
        Relationships: [];
      };

      document_metadata: {
        Row: {
          archived_at: string | null;
          checksum: string;
          classification: string;
          created_at: string;
          document_type: string;
          id: string;
          purged_at: string | null;
          retention_class: string;
          status: string;
          storage_key: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          checksum: string;
          classification: string;
          created_at?: string;
          document_type: string;
          id?: string;
          purged_at?: string | null;
          retention_class: string;
          status?: string;
          storage_key: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          checksum?: string;
          classification?: string;
          created_at?: string;
          document_type?: string;
          id?: string;
          purged_at?: string | null;
          retention_class?: string;
          status?: string;
          storage_key?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      employee_exit_settlements: {
        Row: {
          approved_at: string | null;
          created_at: string;
          deductions: number;
          employee_id: string;
          final_payable: number;
          id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          approved_at?: string | null;
          created_at?: string;
          deductions?: number;
          employee_id: string;
          final_payable: number;
          id?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          approved_at?: string | null;
          created_at?: string;
          deductions?: number;
          employee_id?: string;
          final_payable?: number;
          id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      employee_salary_assignments: {
        Row: {
          created_at: string;
          effective_from: string;
          effective_to: string | null;
          employee_id: string;
          id: string;
          salary_structure_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          effective_from: string;
          effective_to?: string | null;
          employee_id: string;
          id?: string;
          salary_structure_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          effective_from?: string;
          effective_to?: string | null;
          employee_id?: string;
          id?: string;
          salary_structure_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      employees: {
        Row: {
          availability: string;
          created_at: string;
          department_id: string | null;
          designation_id: string | null;
          employee_code: string;
          employment_status: string;
          id: string;
          tenant_id: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          availability?: string;
          created_at?: string;
          department_id?: string | null;
          designation_id?: string | null;
          employee_code: string;
          employment_status?: string;
          id?: string;
          tenant_id: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          availability?: string;
          created_at?: string;
          department_id?: string | null;
          designation_id?: string | null;
          employee_code?: string;
          employment_status?: string;
          id?: string;
          tenant_id?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };

      encounters: {
        Row: {
          created_at: string;
          encounter_type: string;
          ended_at: string | null;
          facility_id: string;
          id: string;
          patient_id: string;
          provider_id: string;
          started_at: string;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          encounter_type: string;
          ended_at?: string | null;
          facility_id: string;
          id?: string;
          patient_id: string;
          provider_id: string;
          started_at?: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          encounter_type?: string;
          ended_at?: string | null;
          facility_id?: string;
          id?: string;
          patient_id?: string;
          provider_id?: string;
          started_at?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      facilities: {
        Row: {
          address: string | null;
          created_at: string;
          facility_code: string;
          id: string;
          name: string;
          status: string;
          tenant_id: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          created_at?: string;
          facility_code: string;
          id?: string;
          name: string;
          status?: string;
          tenant_id: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          created_at?: string;
          facility_code?: string;
          id?: string;
          name?: string;
          status?: string;
          tenant_id?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      goods_receipt_items: {
        Row: {
          batch_id: string;
          created_at: string;
          goods_receipt_id: string;
          id: string;
          item_id: string;
          po_item_id: string;
          received_quantity: number;
        };
        Insert: {
          batch_id: string;
          created_at?: string;
          goods_receipt_id: string;
          id?: string;
          item_id: string;
          po_item_id: string;
          received_quantity: number;
        };
        Update: {
          batch_id?: string;
          created_at?: string;
          goods_receipt_id?: string;
          id?: string;
          item_id?: string;
          po_item_id?: string;
          received_quantity?: number;
        };
        Relationships: [];
      };

      goods_receipts: {
        Row: {
          created_at: string;
          id: string;
          purchase_order_id: string;
          received_at: string | null;
          received_by: string;
          status: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          purchase_order_id: string;
          received_at?: string | null;
          received_by: string;
          status?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          purchase_order_id?: string;
          received_at?: string | null;
          received_by?: string;
          status?: string;
        };
        Relationships: [];
      };

      imaging_studies: {
        Row: {
          created_at: string;
          document_id: string | null;
          id: string;
          modality: string;
          pacs_study_reference: string | null;
          performed_at: string | null;
          radiology_order_id: string;
          status: string;
          study_instance_uid: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          document_id?: string | null;
          id?: string;
          modality: string;
          pacs_study_reference?: string | null;
          performed_at?: string | null;
          radiology_order_id: string;
          status?: string;
          study_instance_uid?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          document_id?: string | null;
          id?: string;
          modality?: string;
          pacs_study_reference?: string | null;
          performed_at?: string | null;
          radiology_order_id?: string;
          status?: string;
          study_instance_uid?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      insurance_claims: {
        Row: {
          approved_amount: number;
          claim_number: string;
          claimed_amount: number;
          created_at: string;
          id: string;
          invoice_id: string;
          patient_id: string;
          payer_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          approved_amount?: number;
          claim_number: string;
          claimed_amount: number;
          created_at?: string;
          id?: string;
          invoice_id: string;
          patient_id: string;
          payer_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          approved_amount?: number;
          claim_number?: string;
          claimed_amount?: number;
          created_at?: string;
          id?: string;
          invoice_id?: string;
          patient_id?: string;
          payer_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      integration_connections: {
        Row: {
          configuration_reference: string;
          created_at: string;
          facility_id: string;
          id: string;
          integration_type: string;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          configuration_reference: string;
          created_at?: string;
          facility_id: string;
          id?: string;
          integration_type: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          configuration_reference?: string;
          created_at?: string;
          facility_id?: string;
          id?: string;
          integration_type?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      integration_messages: {
        Row: {
          acknowledged_at: string | null;
          attempt_count: number;
          created_at: string;
          dead_lettered: boolean | null;
          direction: string;
          external_reference: string | null;
          id: string;
          idempotency_key: string;
          integration_connection_id: string;
          message_type: string;
          payload_reference: string | null;
          schema_version: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          acknowledged_at?: string | null;
          attempt_count?: number;
          created_at?: string;
          dead_lettered?: boolean | null;
          direction: string;
          external_reference?: string | null;
          id?: string;
          idempotency_key: string;
          integration_connection_id: string;
          message_type: string;
          payload_reference?: string | null;
          schema_version: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          acknowledged_at?: string | null;
          attempt_count?: number;
          created_at?: string;
          dead_lettered?: boolean | null;
          direction?: string;
          external_reference?: string | null;
          id?: string;
          idempotency_key?: string;
          integration_connection_id?: string;
          message_type?: string;
          payload_reference?: string | null;
          schema_version?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      inventory_balances: {
        Row: {
          batch_id: string;
          created_at: string;
          id: string;
          item_id: string;
          location_id: string;
          quantity_on_hand: number;
          quantity_reserved: number;
          updated_at: string;
        };
        Insert: {
          batch_id: string;
          created_at?: string;
          id?: string;
          item_id: string;
          location_id: string;
          quantity_on_hand?: number;
          quantity_reserved?: number;
          updated_at?: string;
        };
        Update: {
          batch_id?: string;
          created_at?: string;
          id?: string;
          item_id?: string;
          location_id?: string;
          quantity_on_hand?: number;
          quantity_reserved?: number;
          updated_at?: string;
        };
        Relationships: [];
      };

      inventory_items: {
        Row: {
          category: string;
          created_at: string;
          id: string;
          item_code: string;
          name: string;
          status: string;
          tenant_id: string;
          unit_of_measure: string;
          updated_at: string;
        };
        Insert: {
          category: string;
          created_at?: string;
          id?: string;
          item_code: string;
          name: string;
          status?: string;
          tenant_id: string;
          unit_of_measure: string;
          updated_at?: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          id?: string;
          item_code?: string;
          name?: string;
          status?: string;
          tenant_id?: string;
          unit_of_measure?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      inventory_locations: {
        Row: {
          created_at: string;
          facility_id: string;
          id: string;
          location_type: string;
          name: string;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          facility_id: string;
          id?: string;
          location_type: string;
          name: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          facility_id?: string;
          id?: string;
          location_type?: string;
          name?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      invoice_items: {
        Row: {
          charge_id: string | null;
          created_at: string;
          description: string | null;
          discount_amount: number;
          id: string;
          invoice_id: string;
          line_total: number;
          quantity: number;
          source_id: string | null;
          source_type: string;
          tax_amount: number;
          tenant_id: string;
          unit_price: number;
        };
        Insert: {
          charge_id: string;
          created_at?: string;
          description?: string | null;
          discount_amount?: number;
          id?: string;
          invoice_id: string;
          line_total: number;
          quantity: number;
          source_id?: string | null;
          source_type: string;
          tax_amount?: number;
          tenant_id: string;
          unit_price: number;
        };
        Update: {
          charge_id?: string;
          created_at?: string;
          description?: string | null;
          discount_amount?: number;
          id?: string;
          invoice_id?: string;
          line_total?: number;
          quantity?: number;
          source_id?: string | null;
          source_type?: string;
          tax_amount?: number;
          tenant_id?: string;
          unit_price?: number;
        };
        Relationships: [];
      };

      insurance_policy_claims: {
        Row: {
          amount: number;
          claim_number: string;
          created_at: string;
          decision_note: string | null;
          facility_id: string;
          id: string;
          invoice_claim_id: string | null;
          note: string | null;
          patient_id: string;
          policy_id: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
          submitted_at: string;
          submitted_by: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          amount: number;
          claim_number: string;
          created_at?: string;
          decision_note?: string | null;
          facility_id: string;
          id?: string;
          invoice_claim_id?: string | null;
          note?: string | null;
          patient_id: string;
          policy_id: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          submitted_at?: string;
          submitted_by?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          claim_number?: string;
          created_at?: string;
          decision_note?: string | null;
          facility_id?: string;
          id?: string;
          invoice_claim_id?: string | null;
          note?: string | null;
          patient_id?: string;
          policy_id?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          submitted_at?: string;
          submitted_by?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      insurance_policies: {
        Row: {
          coverage_percent: number;
          created_at: string;
          created_by: string | null;
          facility_id: string;
          id: string;
          patient_id: string;
          plan_name: string | null;
          policy_number: string;
          provider_name: string;
          status: string;
          tenant_id: string;
          updated_at: string;
          valid_from: string;
          valid_until: string | null;
        };
        Insert: {
          coverage_percent?: number;
          created_at?: string;
          created_by?: string | null;
          facility_id: string;
          id?: string;
          patient_id: string;
          plan_name?: string | null;
          policy_number: string;
          provider_name: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
          valid_from?: string;
          valid_until?: string | null;
        };
        Update: {
          coverage_percent?: number;
          created_at?: string;
          created_by?: string | null;
          facility_id?: string;
          id?: string;
          patient_id?: string;
          plan_name?: string | null;
          policy_number?: string;
          provider_name?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          valid_from?: string;
          valid_until?: string | null;
        };
        Relationships: [];
      };
      invoices: {
        Row: {
          created_at: string;
          discount_amount: number;
          encounter_id: string | null;
          facility_id: string;
          gross_amount: number;
          id: string;
          invoice_number: string;
          issued_at: string | null;
          net_amount: number;
          patient_id: string;
          status: string;
          tax_amount: number;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          discount_amount?: number;
          encounter_id?: string | null;
          facility_id: string;
          gross_amount?: number;
          id?: string;
          invoice_number: string;
          issued_at?: string | null;
          net_amount?: number;
          patient_id: string;
          status?: string;
          tax_amount?: number;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          discount_amount?: number;
          encounter_id?: string | null;
          facility_id?: string;
          gross_amount?: number;
          id?: string;
          invoice_number?: string;
          issued_at?: string | null;
          net_amount?: number;
          patient_id?: string;
          status?: string;
          tax_amount?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      journal_entries: {
        Row: {
          accounting_period_id: string;
          created_at: string;
          id: string;
          idempotency_key: string;
          journal_number: string;
          legal_entity_id: string;
          posted_at: string | null;
          posting_date: string;
          posting_event: string;
          reversal_of_id: string | null;
          source_id: string | null;
          source_type: string;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          accounting_period_id: string;
          created_at?: string;
          id?: string;
          idempotency_key: string;
          journal_number: string;
          legal_entity_id: string;
          posted_at?: string | null;
          posting_date: string;
          posting_event: string;
          reversal_of_id?: string | null;
          source_id?: string | null;
          source_type: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          accounting_period_id?: string;
          created_at?: string;
          id?: string;
          idempotency_key?: string;
          journal_number?: string;
          legal_entity_id?: string;
          posted_at?: string | null;
          posting_date?: string;
          posting_event?: string;
          reversal_of_id?: string | null;
          source_id?: string | null;
          source_type?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      journal_lines: {
        Row: {
          account_id: string;
          cost_center_id: string;
          created_at: string;
          credit_amount: number;
          debit_amount: number;
          id: string;
          journal_entry_id: string;
        };
        Insert: {
          account_id: string;
          cost_center_id: string;
          created_at?: string;
          credit_amount?: number;
          debit_amount?: number;
          id?: string;
          journal_entry_id: string;
        };
        Update: {
          account_id?: string;
          cost_center_id?: string;
          created_at?: string;
          credit_amount?: number;
          debit_amount?: number;
          id?: string;
          journal_entry_id?: string;
        };
        Relationships: [];
      };

      lab_order_items: {
        Row: {
          accession_number: string;
          created_at: string;
          id: string;
          lab_order_id: string;
          priority: string;
          status: string;
          test_id: string;
          updated_at: string;
        };
        Insert: {
          accession_number: string;
          created_at?: string;
          id?: string;
          lab_order_id: string;
          priority?: string;
          status?: string;
          test_id: string;
          updated_at?: string;
        };
        Update: {
          accession_number?: string;
          created_at?: string;
          id?: string;
          lab_order_id?: string;
          priority?: string;
          status?: string;
          test_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      lab_orders: {
        Row: {
          assigned_at: string | null;
          assigned_to: string | null;
          created_at: string;
          encounter_id: string;
          id: string;
          ordered_at: string;
          ordered_by: string;
          patient_id: string;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          assigned_at?: string | null;
          assigned_to?: string | null;
          created_at?: string;
          encounter_id: string;
          id?: string;
          ordered_at?: string;
          ordered_by: string;
          patient_id: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          assigned_at?: string | null;
          assigned_to?: string | null;
          created_at?: string;
          encounter_id?: string;
          id?: string;
          ordered_at?: string;
          ordered_by?: string;
          patient_id?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      lab_results: {
        Row: {
          amendment_reason: string | null;
          content_hash: string | null;
          created_at: string;
          critical_acknowledged_at: string | null;
          critical_acknowledged_by: string | null;
          critical_escalated_at: string | null;
          critical_escalated_to: string | null;
          critical_flag: boolean;
          id: string;
          lab_order_item_id: string;
          reference_range: string;
          result_value: string;
          specimen_id: string;
          status: string;
          supersedes_id: string | null;
          tenant_id: string;
          unit: string;
          updated_at: string;
          verified_at: string | null;
          verified_by: string | null;
          version: number;
        };
        Insert: {
          amendment_reason?: string | null;
          content_hash?: string | null;
          created_at?: string;
          critical_acknowledged_at?: string | null;
          critical_acknowledged_by?: string | null;
          critical_escalated_at?: string | null;
          critical_escalated_to?: string | null;
          critical_flag?: boolean;
          id?: string;
          lab_order_item_id: string;
          reference_range: string;
          result_value: string;
          specimen_id: string;
          status?: string;
          supersedes_id?: string | null;
          tenant_id: string;
          unit: string;
          updated_at?: string;
          verified_at?: string | null;
          verified_by?: string | null;
          version?: number;
        };
        Update: {
          amendment_reason?: string | null;
          content_hash?: string | null;
          created_at?: string;
          critical_acknowledged_at?: string | null;
          critical_acknowledged_by?: string | null;
          critical_escalated_at?: string | null;
          critical_escalated_to?: string | null;
          critical_flag?: boolean;
          id?: string;
          lab_order_item_id?: string;
          reference_range?: string;
          result_value?: string;
          specimen_id?: string;
          status?: string;
          supersedes_id?: string | null;
          tenant_id?: string;
          unit?: string;
          updated_at?: string;
          verified_at?: string | null;
          verified_by?: string | null;
          version?: number;
        };
        Relationships: [];
      };

      lab_test_catalog: {
        Row: {
          created_at: string;
          department_id: string;
          id: string;
          name: string;
          specimen_type: string;
          status: string;
          tenant_id: string;
          test_code: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          department_id: string;
          id?: string;
          name: string;
          specimen_type: string;
          status?: string;
          tenant_id: string;
          test_code: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          department_id?: string;
          id?: string;
          name?: string;
          specimen_type?: string;
          status?: string;
          tenant_id?: string;
          test_code?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      leave_requests: {
        Row: {
          approved_by: string | null;
          created_at: string;
          employee_id: string;
          end_date: string | null;
          id: string;
          leave_type_id: string;
          reason: string | null;
          start_date: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          approved_by?: string | null;
          created_at?: string;
          employee_id: string;
          end_date?: string | null;
          id?: string;
          leave_type_id: string;
          reason?: string | null;
          start_date: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          approved_by?: string | null;
          created_at?: string;
          employee_id?: string;
          end_date?: string | null;
          id?: string;
          leave_type_id?: string;
          reason?: string | null;
          start_date?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      leave_types: {
        Row: {
          code: string;
          created_at: string;
          id: string;
          is_paid: boolean;
          max_days_per_year: number | null;
          name: string;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          id?: string;
          is_paid?: boolean;
          max_days_per_year?: number | null;
          name: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          id?: string;
          is_paid?: boolean;
          max_days_per_year?: number | null;
          name?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      legal_entities: {
        Row: {
          created_at: string;
          entity_name: string;
          id: string;
          registration_number: string;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          entity_name: string;
          id?: string;
          registration_number: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          entity_name?: string;
          id?: string;
          registration_number?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      maintenance_work_orders: {
        Row: {
          asset_id: string;
          assigned_to: string;
          closed_at: string | null;
          created_at: string;
          id: string;
          issue_type: string;
          priority: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          asset_id: string;
          assigned_to: string;
          closed_at?: string | null;
          created_at?: string;
          id?: string;
          issue_type: string;
          priority?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          asset_id?: string;
          assigned_to?: string;
          closed_at?: string | null;
          created_at?: string;
          id?: string;
          issue_type?: string;
          priority?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      medicine_catalog: {
        Row: {
          created_at: string;
          dosage_form: string;
          id: string;
          medicine_code: string;
          name: string;
          status: string;
          strength: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          dosage_form: string;
          id?: string;
          medicine_code: string;
          name: string;
          status?: string;
          strength: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          dosage_form?: string;
          id?: string;
          medicine_code?: string;
          name?: string;
          status?: string;
          strength?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      medicine_inventory_map: {
        Row: {
          conversion_factor: number;
          created_at: string;
          id: string;
          item_id: string;
          medicine_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          conversion_factor: number;
          created_at?: string;
          id?: string;
          item_id: string;
          medicine_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          conversion_factor?: number;
          created_at?: string;
          id?: string;
          item_id?: string;
          medicine_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      notification_jobs: {
        Row: {
          attempt_count: number;
          channel: string;
          created_at: string;
          id: string;
          payload: Json | null;
          recipient_id: string;
          sent_at: string | null;
          status: string;
          template_id: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          attempt_count?: number;
          channel: string;
          created_at?: string;
          id?: string;
          payload?: Json | null;
          recipient_id: string;
          sent_at?: string | null;
          status?: string;
          template_id: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          attempt_count?: number;
          channel?: string;
          created_at?: string;
          id?: string;
          payload?: Json | null;
          recipient_id?: string;
          sent_at?: string | null;
          status?: string;
          template_id?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      notification_templates: {
        Row: {
          body: string;
          channel: string;
          code: string;
          created_at: string;
          id: string;
          is_active: boolean;
          subject: string | null;
          tenant_id: string | null;
          updated_at: string;
        };
        Insert: {
          body: string;
          channel: string;
          code: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          subject?: string | null;
          tenant_id?: string | null;
          updated_at?: string;
        };
        Update: {
          body?: string;
          channel?: string;
          code?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          subject?: string | null;
          tenant_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };

      observations: {
        Row: {
          created_at: string;
          encounter_id: string;
          id: string;
          observation_code: string;
          observed_at: string;
          patient_id: string;
          tenant_id: string;
          unit: string;
          value: string;
        };
        Insert: {
          created_at?: string;
          encounter_id: string;
          id?: string;
          observation_code: string;
          observed_at?: string;
          patient_id: string;
          tenant_id: string;
          unit: string;
          value: string;
        };
        Update: {
          created_at?: string;
          encounter_id?: string;
          id?: string;
          observation_code?: string;
          observed_at?: string;
          patient_id?: string;
          tenant_id?: string;
          unit?: string;
          value?: string;
        };
        Relationships: [];
      };

      patient_consents: {
        Row: {
          consent_category: string;
          consent_type: string;
          created_at: string;
          granted_at: string | null;
          id: string;
          patient_id: string;
          purpose: string;
          status: string;
          tenant_id: string;
          updated_at: string;
          withdrawn_at: string | null;
        };
        Insert: {
          consent_category: string;
          consent_type: string;
          created_at?: string;
          granted_at?: string | null;
          id?: string;
          patient_id: string;
          purpose: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
          withdrawn_at?: string | null;
        };
        Update: {
          consent_category?: string;
          consent_type?: string;
          created_at?: string;
          granted_at?: string | null;
          id?: string;
          patient_id?: string;
          purpose?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          withdrawn_at?: string | null;
        };
        Relationships: [];
      };

      patient_contacts: {
        Row: {
          contact_type: string;
          created_at: string;
          id: string;
          name: string;
          patient_id: string;
          phone: string | null;
          relationship: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          contact_type: string;
          created_at?: string;
          id?: string;
          name: string;
          patient_id: string;
          phone?: string | null;
          relationship?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          contact_type?: string;
          created_at?: string;
          id?: string;
          name?: string;
          patient_id?: string;
          phone?: string | null;
          relationship?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      patient_duplicate_candidates: {
        Row: {
          approval_request_id: string | null;
          created_at: string;
          id: string;
          patient_id_a: string;
          patient_id_b: string;
          proposed_surviving_patient_id: string | null;
          review_note: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          signals: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          approval_request_id?: string | null;
          created_at?: string;
          id?: string;
          patient_id_a: string;
          patient_id_b: string;
          proposed_surviving_patient_id?: string | null;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          signals: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          approval_request_id?: string | null;
          created_at?: string;
          id?: string;
          patient_id_a?: string;
          patient_id_b?: string;
          proposed_surviving_patient_id?: string | null;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          signals?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      patient_identifiers: {
        Row: {
          created_at: string;
          id: string;
          identifier_type: string;
          identifier_value: string;
          issuing_authority: string | null;
          patient_id: string;
          tenant_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          identifier_type: string;
          identifier_value: string;
          issuing_authority?: string | null;
          patient_id: string;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          identifier_type?: string;
          identifier_value?: string;
          issuing_authority?: string | null;
          patient_id?: string;
          tenant_id?: string;
        };
        Relationships: [];
      };

      patient_merge_log: {
        Row: {
          approval_request_id: string;
          created_at: string;
          id: string;
          merged_at: string;
          merged_by: string;
          merged_patient_id: string;
          reason: string | null;
          reversed_at: string | null;
          reversed_by: string | null;
          surviving_patient_id: string;
        };
        Insert: {
          approval_request_id: string;
          created_at?: string;
          id?: string;
          merged_at?: string;
          merged_by: string;
          merged_patient_id: string;
          reason?: string | null;
          reversed_at?: string | null;
          reversed_by?: string | null;
          surviving_patient_id: string;
        };
        Update: {
          approval_request_id?: string;
          created_at?: string;
          id?: string;
          merged_at?: string;
          merged_by?: string;
          merged_patient_id?: string;
          reason?: string | null;
          reversed_at?: string | null;
          reversed_by?: string | null;
          surviving_patient_id?: string;
        };
        Relationships: [];
      };

      patient_merge_repoints: {
        Row: {
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          merge_id: string;
          previous_patient_id: string;
          repointed_at: string;
        };
        Insert: {
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          merge_id: string;
          previous_patient_id: string;
          repointed_at?: string;
        };
        Update: {
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          merge_id?: string;
          previous_patient_id?: string;
          repointed_at?: string;
        };
        Relationships: [];
      };

      patient_portal_access: {
        Row: {
          created_at: string;
          id: string;
          patient_id: string;
          relationship: string | null;
          status: string;
          updated_at: string;
          user_id: string;
          verification_method: string | null;
          verified_at: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          patient_id: string;
          relationship?: string | null;
          status?: string;
          updated_at?: string;
          user_id: string;
          verification_method?: string | null;
          verified_at?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          patient_id?: string;
          relationship?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
          verification_method?: string | null;
          verified_at?: string | null;
        };
        Relationships: [];
      };

      patient_profiles: {
        Row: {
          created_at: string;
          full_name: string;
          id: string;
          phone: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          full_name: string;
          id: string;
          phone: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          full_name?: string;
          id?: string;
          phone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      service_charges: {
        Row: {
          amount: number;
          charge_id: string;
          created_at: string;
          encounter_id: string | null;
          facility_id: string;
          id: string;
          invoice_id: string | null;
          medicine_id: string | null;
          note: string | null;
          patient_id: string;
          quantity: number;
          recorded_by: string | null;
          recorded_by_user: string | null;
          recorded_role: string;
          status: string;
          tenant_id: string;
          unit_price: number;
          updated_at: string;
          voided_at: string | null;
          voided_by: string | null;
        };
        Insert: {
          amount: number;
          charge_id: string;
          created_at?: string;
          encounter_id?: string | null;
          facility_id: string;
          id?: string;
          invoice_id?: string | null;
          medicine_id?: string | null;
          note?: string | null;
          patient_id: string;
          quantity?: number;
          recorded_by?: string | null;
          recorded_by_user?: string | null;
          recorded_role?: string;
          status?: string;
          tenant_id: string;
          unit_price: number;
          updated_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          amount?: number;
          charge_id?: string;
          created_at?: string;
          encounter_id?: string | null;
          facility_id?: string;
          id?: string;
          invoice_id?: string | null;
          note?: string | null;
          patient_id?: string;
          quantity?: number;
          recorded_by?: string | null;
          recorded_by_user?: string | null;
          recorded_role?: string;
          status?: string;
          tenant_id?: string;
          unit_price?: number;
          updated_at?: string;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [];
      };

      patients: {
        Row: {
          contact_details: string | null;
          created_at: string;
          date_of_birth: string;
          id: string;
          name: string;
          patient_number: string;
          sex: string;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          contact_details?: string | null;
          created_at?: string;
          date_of_birth: string;
          id?: string;
          name: string;
          patient_number: string;
          sex: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          contact_details?: string | null;
          created_at?: string;
          date_of_birth?: string;
          id?: string;
          name?: string;
          patient_number?: string;
          sex?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      payers: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          payer_code: string;
          payer_type: string;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          payer_code: string;
          payer_type: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          payer_code?: string;
          payer_type?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      payment_allocations: {
        Row: {
          allocated_amount: number;
          created_at: string;
          id: string;
          invoice_id: string;
          payment_id: string;
        };
        Insert: {
          allocated_amount: number;
          created_at?: string;
          id?: string;
          invoice_id: string;
          payment_id: string;
        };
        Update: {
          allocated_amount?: number;
          created_at?: string;
          id?: string;
          invoice_id?: string;
          payment_id?: string;
        };
        Relationships: [];
      };

      payments: {
        Row: {
          amount: number;
          created_at: string;
          currency: string;
          id: string;
          method: string;
          patient_id: string;
          payer_id: string | null;
          payment_reference: string;
          received_at: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          currency?: string;
          id?: string;
          method: string;
          patient_id: string;
          payer_id?: string | null;
          payment_reference: string;
          received_at?: string | null;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          currency?: string;
          id?: string;
          method?: string;
          patient_id?: string;
          payer_id?: string | null;
          payment_reference?: string;
          received_at?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      payroll_item_components: {
        Row: {
          amount: number;
          calculation_details: string;
          component_code: string;
          created_at: string;
          id: string;
          payroll_item_id: string;
        };
        Insert: {
          amount: number;
          calculation_details: string;
          component_code: string;
          created_at?: string;
          id?: string;
          payroll_item_id: string;
        };
        Update: {
          amount?: number;
          calculation_details?: string;
          component_code?: string;
          created_at?: string;
          id?: string;
          payroll_item_id?: string;
        };
        Relationships: [];
      };

      payroll_items: {
        Row: {
          created_at: string;
          deductions: number;
          employee_id: string;
          gross_pay: number;
          id: string;
          input_snapshot: Json;
          net_pay: number;
          payroll_run_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          deductions?: number;
          employee_id: string;
          gross_pay: number;
          id?: string;
          input_snapshot?: Json;
          net_pay: number;
          payroll_run_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          deductions?: number;
          employee_id?: string;
          gross_pay?: number;
          id?: string;
          input_snapshot?: Json;
          net_pay?: number;
          payroll_run_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      payroll_payments: {
        Row: {
          amount: number;
          created_at: string;
          id: string;
          paid_at: string | null;
          payment_reference: string;
          payroll_item_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          id?: string;
          paid_at?: string | null;
          payment_reference: string;
          payroll_item_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          id?: string;
          paid_at?: string | null;
          payment_reference?: string;
          payroll_item_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      payroll_runs: {
        Row: {
          approved_by: string | null;
          calculation_version: string;
          created_at: string;
          facility_id: string;
          id: string;
          locked_at: string | null;
          period_end: string;
          period_start: string;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          approved_by?: string | null;
          calculation_version?: string;
          created_at?: string;
          facility_id: string;
          id?: string;
          locked_at?: string | null;
          period_end: string;
          period_start: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          approved_by?: string | null;
          calculation_version?: string;
          created_at?: string;
          facility_id?: string;
          id?: string;
          locked_at?: string | null;
          period_end?: string;
          period_start?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      payslips: {
        Row: {
          created_at: string;
          generated_at: string;
          id: string;
          payroll_item_id: string;
          storage_key: string;
        };
        Insert: {
          created_at?: string;
          generated_at?: string;
          id?: string;
          payroll_item_id: string;
          storage_key: string;
        };
        Update: {
          created_at?: string;
          generated_at?: string;
          id?: string;
          payroll_item_id?: string;
          storage_key?: string;
        };
        Relationships: [];
      };

      permissions: {
        Row: {
          action: string;
          code: string;
          created_at: string;
          description: string | null;
          id: string;
          module: string;
        };
        Insert: {
          action: string;
          code: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          module: string;
        };
        Update: {
          action?: string;
          code?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          module?: string;
        };
        Relationships: [];
      };

      po_requisition_allocations: {
        Row: {
          created_at: string;
          id: string;
          po_item_id: string;
          quantity: number;
          requisition_item_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          po_item_id: string;
          quantity: number;
          requisition_item_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          po_item_id?: string;
          quantity?: number;
          requisition_item_id?: string;
        };
        Relationships: [];
      };

      posting_role_accounts: {
        Row: {
          account_id: string;
          created_at: string;
          effective_from: string;
          effective_to: string | null;
          id: string;
          legal_entity_id: string;
          posting_role: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          account_id: string;
          created_at?: string;
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          legal_entity_id: string;
          posting_role: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          created_at?: string;
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          legal_entity_id?: string;
          posting_role?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      prescription_dispenses: {
        Row: {
          created_at: string;
          dispensed_at: string;
          dispensed_medicine_id: string | null;
          id: string;
          pharmacist_id: string;
          prescription_item_id: string;
          quantity: number;
          substitution_authorized_by: string | null;
          substitution_reason: string | null;
        };
        Insert: {
          created_at?: string;
          dispensed_at?: string;
          dispensed_medicine_id?: string | null;
          id?: string;
          pharmacist_id: string;
          prescription_item_id: string;
          quantity: number;
          substitution_authorized_by?: string | null;
          substitution_reason?: string | null;
        };
        Update: {
          created_at?: string;
          dispensed_at?: string;
          dispensed_medicine_id?: string | null;
          id?: string;
          pharmacist_id?: string;
          prescription_item_id?: string;
          quantity?: number;
          substitution_authorized_by?: string | null;
          substitution_reason?: string | null;
        };
        Relationships: [];
      };

      prescription_items: {
        Row: {
          created_at: string;
          dose: string;
          duration: string;
          frequency: string;
          id: string;
          medicine_id: string;
          prescription_id: string;
          quantity_dispensed: number;
          quantity_prescribed: number;
          route: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          dose: string;
          duration: string;
          frequency: string;
          id?: string;
          medicine_id: string;
          prescription_id: string;
          quantity_dispensed?: number;
          quantity_prescribed: number;
          route: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          dose?: string;
          duration?: string;
          frequency?: string;
          id?: string;
          medicine_id?: string;
          prescription_id?: string;
          quantity_dispensed?: number;
          quantity_prescribed?: number;
          route?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      prescriptions: {
        Row: {
          created_at: string;
          encounter_id: string;
          id: string;
          prescriber_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          encounter_id: string;
          id?: string;
          prescriber_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          encounter_id?: string;
          id?: string;
          prescriber_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      purchase_order_items: {
        Row: {
          created_at: string;
          id: string;
          item_id: string;
          purchase_order_id: string;
          quantity: number;
          unit_price: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          item_id: string;
          purchase_order_id: string;
          quantity: number;
          unit_price: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          item_id?: string;
          purchase_order_id?: string;
          quantity?: number;
          unit_price?: number;
        };
        Relationships: [];
      };

      purchase_orders: {
        Row: {
          created_at: string;
          facility_id: string;
          id: string;
          po_number: string;
          status: string;
          tenant_id: string;
          total_amount: number;
          updated_at: string;
          vendor_id: string;
        };
        Insert: {
          created_at?: string;
          facility_id: string;
          id?: string;
          po_number: string;
          status?: string;
          tenant_id: string;
          total_amount?: number;
          updated_at?: string;
          vendor_id: string;
        };
        Update: {
          created_at?: string;
          facility_id?: string;
          id?: string;
          po_number?: string;
          status?: string;
          tenant_id?: string;
          total_amount?: number;
          updated_at?: string;
          vendor_id?: string;
        };
        Relationships: [];
      };

      purchase_requisition_items: {
        Row: {
          created_at: string;
          estimated_price: number;
          id: string;
          item_id: string;
          quantity: number;
          requisition_id: string;
        };
        Insert: {
          created_at?: string;
          estimated_price: number;
          id?: string;
          item_id: string;
          quantity: number;
          requisition_id: string;
        };
        Update: {
          created_at?: string;
          estimated_price?: number;
          id?: string;
          item_id?: string;
          quantity?: number;
          requisition_id?: string;
        };
        Relationships: [];
      };

      purchase_requisitions: {
        Row: {
          created_at: string;
          department_id: string;
          facility_id: string;
          id: string;
          requested_by: string;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          department_id: string;
          facility_id: string;
          id?: string;
          requested_by: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          department_id?: string;
          facility_id?: string;
          id?: string;
          requested_by?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      radiology_orders: {
        Row: {
          accession_number: string;
          body_site: string | null;
          created_at: string;
          encounter_id: string;
          id: string;
          modality: string;
          ordered_by: string;
          patient_id: string;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          accession_number: string;
          body_site?: string | null;
          created_at?: string;
          encounter_id: string;
          id?: string;
          modality: string;
          ordered_by: string;
          patient_id: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          accession_number?: string;
          body_site?: string | null;
          created_at?: string;
          encounter_id?: string;
          id?: string;
          modality?: string;
          ordered_by?: string;
          patient_id?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      radiology_reports: {
        Row: {
          amendment_reason: string | null;
          approved_at: string | null;
          approved_by: string | null;
          content_hash: string | null;
          created_at: string;
          id: string;
          radiology_order_id: string;
          report_text: string;
          reported_by: string;
          status: string;
          supersedes_id: string | null;
          updated_at: string;
          version: number;
        };
        Insert: {
          amendment_reason?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          content_hash?: string | null;
          created_at?: string;
          id?: string;
          radiology_order_id: string;
          report_text: string;
          reported_by: string;
          status?: string;
          supersedes_id?: string | null;
          updated_at?: string;
          version?: number;
        };
        Update: {
          amendment_reason?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          content_hash?: string | null;
          created_at?: string;
          id?: string;
          radiology_order_id?: string;
          report_text?: string;
          reported_by?: string;
          status?: string;
          supersedes_id?: string | null;
          updated_at?: string;
          version?: number;
        };
        Relationships: [];
      };

      refund_allocations: {
        Row: {
          allocated_amount: number;
          created_at: string;
          credit_note_id: string | null;
          id: string;
          invoice_id: string;
          refund_id: string;
        };
        Insert: {
          allocated_amount: number;
          created_at?: string;
          credit_note_id?: string | null;
          id?: string;
          invoice_id: string;
          refund_id: string;
        };
        Update: {
          allocated_amount?: number;
          created_at?: string;
          credit_note_id?: string | null;
          id?: string;
          invoice_id?: string;
          refund_id?: string;
        };
        Relationships: [];
      };

      refunds: {
        Row: {
          amount: number;
          approved_by: string | null;
          created_at: string;
          id: string;
          payment_id: string;
          reason: string | null;
          reference_number: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          amount: number;
          approved_by?: string | null;
          created_at?: string;
          id?: string;
          payment_id: string;
          reason?: string | null;
          reference_number?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          approved_by?: string | null;
          created_at?: string;
          id?: string;
          payment_id?: string;
          reason?: string | null;
          reference_number?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      reimbursements: {
        Row: {
          amount: number;
          approved_by: string | null;
          created_at: string;
          employee_id: string;
          expense_type: string;
          id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          amount: number;
          approved_by?: string | null;
          created_at?: string;
          employee_id: string;
          expense_type: string;
          id?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          approved_by?: string | null;
          created_at?: string;
          employee_id?: string;
          expense_type?: string;
          id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      role_permissions: {
        Row: {
          created_at: string;
          permission_id: string;
          role_id: string;
        };
        Insert: {
          created_at?: string;
          permission_id: string;
          role_id: string;
        };
        Update: {
          created_at?: string;
          permission_id?: string;
          role_id?: string;
        };
        Relationships: [];
      };

      roles: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          scope_type: string;
          tenant_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          scope_type?: string;
          tenant_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          scope_type?: string;
          tenant_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };

      salary_components: {
        Row: {
          calculation_type: string;
          component_code: string;
          component_type: string;
          created_at: string;
          id: string;
          salary_structure_id: string;
          updated_at: string;
          value: string;
        };
        Insert: {
          calculation_type: string;
          component_code: string;
          component_type: string;
          created_at?: string;
          id?: string;
          salary_structure_id: string;
          updated_at?: string;
          value: string;
        };
        Update: {
          calculation_type?: string;
          component_code?: string;
          component_type?: string;
          created_at?: string;
          id?: string;
          salary_structure_id?: string;
          updated_at?: string;
          value?: string;
        };
        Relationships: [];
      };

      salary_structures: {
        Row: {
          created_at: string;
          effective_from: string;
          effective_to: string | null;
          id: string;
          name: string;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          effective_from: string;
          effective_to?: string | null;
          id?: string;
          name: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          effective_from?: string;
          effective_to?: string | null;
          id?: string;
          name?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      service_charge_map: {
        Row: {
          charge_id: string;
          created_at: string;
          id: string;
          service_id: string | null;
          service_type: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          charge_id: string;
          created_at?: string;
          id?: string;
          service_id?: string | null;
          service_type: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          charge_id?: string;
          created_at?: string;
          id?: string;
          service_id?: string | null;
          service_type?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      shift_assignments: {
        Row: {
          created_at: string;
          employee_id: string;
          end_at: string | null;
          id: string;
          shift_id: string;
          start_at: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          employee_id: string;
          end_at?: string | null;
          id?: string;
          shift_id: string;
          start_at: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          employee_id?: string;
          end_at?: string | null;
          id?: string;
          shift_id?: string;
          start_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      shifts: {
        Row: {
          created_at: string;
          end_time: string;
          id: string;
          name: string;
          start_time: string;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          end_time: string;
          id?: string;
          name: string;
          start_time: string;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          end_time?: string;
          id?: string;
          name?: string;
          start_time?: string;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      specimens: {
        Row: {
          collected_at: string;
          created_at: string;
          id: string;
          lab_order_item_id: string;
          received_at: string | null;
          rejection_reason: string | null;
          specimen_code: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          collected_at?: string;
          created_at?: string;
          id?: string;
          lab_order_item_id: string;
          received_at?: string | null;
          rejection_reason?: string | null;
          specimen_code: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          collected_at?: string;
          created_at?: string;
          id?: string;
          lab_order_item_id?: string;
          received_at?: string | null;
          rejection_reason?: string | null;
          specimen_code?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      staff_approval_requests: {
        Row: {
          email: string;
          full_name: string;
          id: string;
          phone: string;
          requested_role: Database["public"]["Enums"]["staff_role"];
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
          submitted_at: string;
          tenant_id: string | null;
          user_id: string;
        };
        Insert: {
          email: string;
          full_name: string;
          id?: string;
          phone: string;
          requested_role: Database["public"]["Enums"]["staff_role"];
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          submitted_at?: string;
          tenant_id?: string | null;
          user_id: string;
        };
        Update: {
          email?: string;
          full_name?: string;
          id?: string;
          phone?: string;
          requested_role?: Database["public"]["Enums"]["staff_role"];
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          submitted_at?: string;
          tenant_id?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };

      hospital_admin_registration_requests: {
        Row: {
          email: string;
          full_name: string;
          hospital_name: string;
          id: string;
          phone: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
          submitted_at: string;
          tenant_id: string | null;
          user_id: string;
        };
        Insert: {
          email: string;
          full_name: string;
          hospital_name: string;
          id?: string;
          phone: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          submitted_at?: string;
          tenant_id?: string | null;
          user_id: string;
        };
        Update: {
          email?: string;
          full_name?: string;
          hospital_name?: string;
          id?: string;
          phone?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          submitted_at?: string;
          tenant_id?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };

      staff_profiles: {
        Row: {
          created_at: string;
          department: string | null;
          full_name: string;
          id: string;
          license_number: string | null;
          phone: string | null;
          specialization: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          department?: string | null;
          full_name: string;
          id: string;
          license_number?: string | null;
          phone?: string | null;
          specialization?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          department?: string | null;
          full_name?: string;
          id?: string;
          license_number?: string | null;
          phone?: string | null;
          specialization?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };

      status_history: {
        Row: {
          changed_at: string;
          changed_by: string;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          from_status: string;
          id: string;
          reason: string | null;
          tenant_id: string;
          to_status: string;
        };
        Insert: {
          changed_at?: string;
          changed_by: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          from_status: string;
          id?: string;
          reason?: string | null;
          tenant_id: string;
          to_status: string;
        };
        Update: {
          changed_at?: string;
          changed_by?: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          from_status?: string;
          id?: string;
          reason?: string | null;
          tenant_id?: string;
          to_status?: string;
        };
        Relationships: [];
      };

      stock_batches: {
        Row: {
          batch_number: string;
          created_at: string;
          expiry_date: string;
          facility_id: string;
          id: string;
          item_id: string;
          received_quantity: number;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          batch_number: string;
          created_at?: string;
          expiry_date: string;
          facility_id: string;
          id?: string;
          item_id: string;
          received_quantity?: number;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          batch_number?: string;
          created_at?: string;
          expiry_date?: string;
          facility_id?: string;
          id?: string;
          item_id?: string;
          received_quantity?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      stock_movements: {
        Row: {
          batch_id: string;
          created_at: string;
          id: string;
          item_id: string;
          location_id: string;
          movement_type: string;
          quantity: number;
          reference_id: string | null;
          reference_type: string;
          transfer_item_id: string | null;
        };
        Insert: {
          batch_id: string;
          created_at?: string;
          id?: string;
          item_id: string;
          location_id: string;
          movement_type: string;
          quantity: number;
          reference_id?: string | null;
          reference_type: string;
          transfer_item_id?: string | null;
        };
        Update: {
          batch_id?: string;
          created_at?: string;
          id?: string;
          item_id?: string;
          location_id?: string;
          movement_type?: string;
          quantity?: number;
          reference_id?: string | null;
          reference_type?: string;
          transfer_item_id?: string | null;
        };
        Relationships: [];
      };

      stock_transfer_items: {
        Row: {
          batch_id: string;
          created_at: string;
          id: string;
          item_id: string;
          quantity: number;
          transfer_id: string;
        };
        Insert: {
          batch_id: string;
          created_at?: string;
          id?: string;
          item_id: string;
          quantity: number;
          transfer_id: string;
        };
        Update: {
          batch_id?: string;
          created_at?: string;
          id?: string;
          item_id?: string;
          quantity?: number;
          transfer_id?: string;
        };
        Relationships: [];
      };

      stock_transfers: {
        Row: {
          approved_by: string | null;
          created_at: string;
          destination_location_id: string;
          id: string;
          source_location_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          approved_by?: string | null;
          created_at?: string;
          destination_location_id: string;
          id?: string;
          source_location_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          approved_by?: string | null;
          created_at?: string;
          destination_location_id?: string;
          id?: string;
          source_location_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      subscription_plans: {
        Row: {
          billing_interval: string;
          code: string;
          created_at: string;
          currency: string;
          description: string | null;
          id: string;
          is_active: boolean;
          max_employees: number | null;
          max_facilities: number | null;
          name: string;
          price_cents: number;
          updated_at: string;
        };
        Insert: {
          billing_interval?: string;
          code: string;
          created_at?: string;
          currency?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          max_employees?: number | null;
          max_facilities?: number | null;
          name: string;
          price_cents?: number;
          updated_at?: string;
        };
        Update: {
          billing_interval?: string;
          code?: string;
          created_at?: string;
          currency?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          max_employees?: number | null;
          max_facilities?: number | null;
          name?: string;
          price_cents?: number;
          updated_at?: string;
        };
        Relationships: [];
      };

      tenants: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          slug: string;
          status: string;
          subscription_plan_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          slug: string;
          status?: string;
          subscription_plan_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string;
          status?: string;
          subscription_plan_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };

      user_role_assignments: {
        Row: {
          created_at: string;
          department_id: string | null;
          facility_id: string | null;
          id: string;
          role_id: string;
          tenant_id: string | null;
          user_id: string;
          valid_from: string;
          valid_until: string | null;
        };
        Insert: {
          created_at?: string;
          department_id?: string | null;
          facility_id?: string | null;
          id?: string;
          role_id: string;
          tenant_id?: string | null;
          user_id: string;
          valid_from?: string;
          valid_until?: string | null;
        };
        Update: {
          created_at?: string;
          department_id?: string | null;
          facility_id?: string | null;
          id?: string;
          role_id?: string;
          tenant_id?: string | null;
          user_id?: string;
          valid_from?: string;
          valid_until?: string | null;
        };
        Relationships: [];
      };

      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["staff_role"];
          user_id: string;
        };
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["staff_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["staff_role"];
          user_id?: string;
        };
        Relationships: [];
      };

      user_sessions: {
        Row: {
          created_at: string;
          expires_at: string;
          id: string;
          revoked_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at: string;
          id?: string;
          revoked_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          revoked_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };

      users: {
        Row: {
          auth_subject: string | null;
          created_at: string;
          email: string | null;
          id: string;
          last_login_at: string | null;
          phone: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          auth_subject?: string | null;
          created_at?: string;
          email?: string | null;
          id: string;
          last_login_at?: string | null;
          phone?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          auth_subject?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          last_login_at?: string | null;
          phone?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      vendor_invoice_items: {
        Row: {
          created_at: string;
          goods_receipt_item_id: string;
          id: string;
          line_total: number;
          po_item_id: string;
          quantity: number;
          unit_price: number;
          vendor_invoice_id: string;
        };
        Insert: {
          created_at?: string;
          goods_receipt_item_id: string;
          id?: string;
          line_total: number;
          po_item_id: string;
          quantity: number;
          unit_price: number;
          vendor_invoice_id: string;
        };
        Update: {
          created_at?: string;
          goods_receipt_item_id?: string;
          id?: string;
          line_total?: number;
          po_item_id?: string;
          quantity?: number;
          unit_price?: number;
          vendor_invoice_id?: string;
        };
        Relationships: [];
      };

      vendor_invoices: {
        Row: {
          created_at: string;
          due_date: string | null;
          gross_amount: number;
          id: string;
          invoice_date: string;
          invoice_number: string;
          purchase_order_id: string;
          status: string;
          updated_at: string;
          vendor_id: string;
        };
        Insert: {
          created_at?: string;
          due_date?: string | null;
          gross_amount: number;
          id?: string;
          invoice_date: string;
          invoice_number: string;
          purchase_order_id: string;
          status?: string;
          updated_at?: string;
          vendor_id: string;
        };
        Update: {
          created_at?: string;
          due_date?: string | null;
          gross_amount?: number;
          id?: string;
          invoice_date?: string;
          invoice_number?: string;
          purchase_order_id?: string;
          status?: string;
          updated_at?: string;
          vendor_id?: string;
        };
        Relationships: [];
      };

      vendor_payment_allocations: {
        Row: {
          allocated_amount: number;
          created_at: string;
          id: string;
          vendor_invoice_id: string;
          vendor_payment_id: string;
        };
        Insert: {
          allocated_amount: number;
          created_at?: string;
          id?: string;
          vendor_invoice_id: string;
          vendor_payment_id: string;
        };
        Update: {
          allocated_amount?: number;
          created_at?: string;
          id?: string;
          vendor_invoice_id?: string;
          vendor_payment_id?: string;
        };
        Relationships: [];
      };

      vendor_payments: {
        Row: {
          amount: number;
          created_at: string;
          id: string;
          method: string;
          paid_at: string | null;
          payment_reference: string;
          status: string;
          updated_at: string;
          vendor_id: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          id?: string;
          method: string;
          paid_at?: string | null;
          payment_reference: string;
          status?: string;
          updated_at?: string;
          vendor_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          id?: string;
          method?: string;
          paid_at?: string | null;
          payment_reference?: string;
          status?: string;
          updated_at?: string;
          vendor_id?: string;
        };
        Relationships: [];
      };

      vendors: {
        Row: {
          created_at: string;
          email: string | null;
          id: string;
          name: string;
          payment_terms: string | null;
          phone: string | null;
          status: string;
          tax_identifier: string | null;
          tenant_id: string;
          updated_at: string;
          vendor_code: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          id?: string;
          name: string;
          payment_terms?: string | null;
          phone?: string | null;
          status?: string;
          tax_identifier?: string | null;
          tenant_id: string;
          updated_at?: string;
          vendor_code: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          id?: string;
          name?: string;
          payment_terms?: string | null;
          phone?: string | null;
          status?: string;
          tax_identifier?: string | null;
          tenant_id?: string;
          updated_at?: string;
          vendor_code?: string;
        };
        Relationships: [];
      };
      medicine_requests: {
        Row: {
          created_at: string;
          facility_id: string;
          id: string;
          medicine_id: string;
          note: string | null;
          quantity: number;
          requested_by: string | null;
          requested_by_user: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          facility_id: string;
          id?: string;
          medicine_id: string;
          note?: string | null;
          quantity?: number;
          requested_by?: string | null;
          requested_by_user?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          facility_id?: string;
          id?: string;
          medicine_id?: string;
          note?: string | null;
          quantity?: number;
          requested_by?: string | null;
          requested_by_user?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      medicine_vendor_orders: {
        Row: {
          created_at: string;
          facility_id: string;
          id: string;
          medicine_id: string;
          quantity: number;
          request_id: string;
          sent_at: string;
          sent_by: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
          vendor_id: string;
        };
        Insert: {
          created_at?: string;
          facility_id: string;
          id?: string;
          medicine_id: string;
          quantity: number;
          request_id: string;
          sent_at?: string;
          sent_by?: string | null;
          status?: string;
          tenant_id: string;
          updated_at?: string;
          vendor_id: string;
        };
        Update: {
          created_at?: string;
          facility_id?: string;
          id?: string;
          medicine_id?: string;
          quantity?: number;
          request_id?: string;
          sent_at?: string;
          sent_by?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          vendor_id?: string;
        };
        Relationships: [];
      };
      wards: {
        Row: {
          capacity: number | null;
          created_at: string;
          facility_id: string;
          floor: string | null;
          id: string;
          name: string;
          notes: string | null;
          phone: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
          ward_type: string;
        };
        Insert: {
          capacity?: number | null;
          created_at?: string;
          facility_id: string;
          floor?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          phone?: string | null;
          status?: string;
          tenant_id: string;
          updated_at?: string;
          ward_type?: string;
        };
        Update: {
          capacity?: number | null;
          created_at?: string;
          facility_id?: string;
          floor?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          phone?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          ward_type?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      facility_ward_staff: {
        Args: { _facility_id: string };
        Returns: {
          employee_id: string;
          full_name: string;
          role_label: string;
        }[];
      };
      facility_ward_patients: {
        Args: { _facility_id: string };
        Returns: {
          assignment_id: string;
          admission_id: string;
          patient_id: string;
          patient_name: string;
          patient_number: string | null;
          ward: string;
          bed_code: string;
          bed_id: string;
          nurse_id: string | null;
          provider_id: string | null;
          nurse_name: string | null;
          doctor_name: string | null;
          admitted_at: string;
          start_at: string;
          admission_status: string;
        }[];
      };
      facility_lab_technicians: {
        Args: { _facility_id: string };
        Returns: { employee_id: string; full_name: string }[];
      };
      create_lab_assignment: {
        Args: {
          _patient_id: string;
          _test_ids: string[];
          _assigned_to: string;
          _priority?: string;
        };
        Returns: { lab_order_id: string; item_count: number }[];
      };
      update_my_encounter_status: {
        Args: { _encounter_id: string; _status: string };
        Returns: string;
      };
      admit_patient_to_ward: {
        Args: {
          _patient_id: string;
          _bed_id: string;
          _nurse_id: string | null;
          _provider_id: string;
        };
        Returns: string;
      };
      update_ward_assignment: {
        Args: {
          _assignment_id: string;
          _bed_id: string;
          _nurse_id: string | null;
          _provider_id: string;
        };
        Returns: undefined;
      };
      write_handoff_note: {
        Args: { _patient_id: string; _content: string };
        Returns: string;
      };
      facility_handoff_notes: {
        Args: { _facility_id: string };
        Returns: {
          note_id: string;
          patient_name: string;
          author_name: string;
          content: string;
          note_type: string;
          status: string;
          created_at: string;
        }[];
      };
      platform_overview_stats: {
        Args: Record<PropertyKey, never>;
        Returns: {
          hospitals_total: number;
          hospitals_active: number;
          hospitals_trial: number;
          hospitals_suspended: number;
          facilities_total: number;
          staff_total: number;
          staff_active: number;
          patients_total: number;
          patients_new_7d: number;
          encounters_7d: number;
          appointments_today: number;
          invoices_issued: number;
          invoiced_amount: number;
          collected_amount: number;
          outstanding_amount: number;
          pending_hospital_requests: number;
        }[];
      };
      create_prescription: {
        Args: { _patient_id: string; _items: Json };
        Returns: string;
      };
      facility_prescription_lines: {
        Args: { _facility_id: string };
        Returns: {
          item_id: string;
          prescription_id: string;
          encounter_id: string;
          patient_id: string;
          patient_name: string;
          patient_number: string | null;
          prescriber_id: string | null;
          prescriber_name: string;
          prescriber_department: string | null;
          prescriber_specialization: string | null;
          prescriber_code: string | null;
          medicine_id: string;
          medicine_name: string;
          dose: string;
          route: string;
          frequency: string;
          duration: string;
          quantity_prescribed: number;
          quantity_dispensed: number;
          remaining: number;
          prescription_status: string;
          prescribed_at: string;
          stock_available: number;
          stock_linked: boolean;
          last_dispensed_quantity: number | null;
          last_dispensed_at: string | null;
        }[];
      };
      record_medicine_charge: {
        Args: {
          _medicine_id: string;
          _note: string | null;
          _patient_id: string;
          _quantity: number;
          _unit_price: number;
        };
        Returns: string;
      };
      create_invoice_from_charges: {
        Args: {
          _charge_ids: string[];
          _discount_amount: number;
          _patient_id: string;
          _tax_amount: number;
        };
        Returns: {
          id: string;
          invoice_number: string;
          net_amount: number;
        }[];
      };
      facility_payment_ledger: {
        Args: { _facility_id: string };
        Returns: {
          invoice_id: string;
          invoice_number: string;
          patient_id: string;
          patient_name: string;
          patient_number: string | null;
          net_amount: number;
          paid_amount: number;
          outstanding: number;
          invoice_status: string;
          issued_at: string | null;
          last_payment_at: string | null;
          last_payment_method: string | null;
          last_payment_reference: string | null;
          last_payment_status: string | null;
          doctor_name: string | null;
          nurse_name: string | null;
          ward: string | null;
          bed_code: string | null;
        }[];
      };
      facility_invoice_balances: {
        Args: { _facility_id: string };
        Returns: {
          invoice_id: string;
          invoice_number: string;
          issued_at: string | null;
          net_amount: number;
          outstanding: number;
          paid_amount: number;
          patient_id: string;
          patient_name: string;
          status: string;
        }[];
      };
      dispense_prescription_item: {
        Args: {
          _item_id: string;
          _quantity?: number;
        };
        Returns: number;
      };
      facility_insurance_claims: {
        Args: { _facility_id: string };
        Returns: {
          amount: number;
          approved_amount: number;
          claim_id: string;
          claim_number: string;
          decision_note: string | null;
          invoice_claim_id: string | null;
          invoice_id: string | null;
          invoice_net_amount: number | null;
          invoice_number: string | null;
          invoice_outstanding: number | null;
          invoice_paid_amount: number | null;
          invoice_status: string | null;
          note: string | null;
          patient_id: string;
          patient_name: string;
          patient_number: string;
          policy_id: string;
          policy_number: string;
          provider_name: string;
          reviewed_at: string | null;
          reviewed_by_name: string | null;
          status: string;
          submitted_at: string;
        }[];
      };
      facility_insurance_policies: {
        Args: { _facility_id: string };
        Returns: {
          coverage_percent: number;
          created_at: string;
          patient_id: string;
          patient_name: string;
          patient_number: string;
          plan_name: string | null;
          policy_id: string;
          policy_number: string;
          provider_name: string;
          status: string;
          valid_from: string;
          valid_until: string | null;
        }[];
      };
      review_insurance_claim: {
        Args: {
          _claim_id: string;
          _note?: string | null;
          _status: string;
        };
        Returns: undefined;
      };
      submit_insurance_claim: {
        Args: {
          _invoice_id: string;
          _note?: string | null;
          _policy_id: string;
        };
        Returns: string;
      };
      facility_service_charges: {
        Args: { _facility_id: string };
        Returns: {
          amount: number;
          charge_id: string;
          created_at: string;
          invoice_id: string | null;
          invoice_number: string | null;
          invoice_status: string | null;
          note: string | null;
          patient_id: string;
          patient_name: string;
          patient_number: string;
          quantity: number;
          recorded_by_name: string;
          recorded_by_role: string;
          recorded_by_user: string | null;
          service_code: string;
          service_name: string;
          status: string;
          unit_price: number;
          confirmed_at: string | null;
          confirmed_by: string | null;
        }[];
      };
      confirm_service_charge: {
        Args: {
          _charge_id: string;
          _confirmed?: boolean;
        };
        Returns: undefined;
      };
      record_invoice_payment: {
        Args: {
          _amount: number;
          _invoice_id: string;
          _method: string;
        };
        Returns: {
          outstanding: number;
          paid_amount: number;
          status: string;
        }[];
      };
      record_service_charge: {
        Args: {
          _charge_id: string;
          _note: string | null;
          _patient_id: string;
          _quantity: number;
        };
        Returns: string;
      };
      void_service_charge: {
        Args: { _charge_id: string };
        Returns: undefined;
      };
      facility_day_schedule: {
        Args: { _facility_id: string; _from: string; _to: string };
        Returns: {
          appointment_id: string;
          appointment_type: string;
          doctor_name: string;
          doctor_response: string;
          duration_minutes: number;
          location: string | null;
          patient_id: string;
          patient_name: string;
          patient_number: string;
          provider_id: string;
          reason: string | null;
          scheduled_at: string;
          status: string;
        }[];
      };
      facility_doctor_load: {
        Args: { _facility_id: string; _from: string; _to: string };
        Returns: {
          appointments: number;
          availability: string;
          booked_minutes: number;
          completed: number;
          department_name: string | null;
          designation_name: string | null;
          doctor_name: string;
          first_slot: string | null;
          last_slot: string | null;
          provider_id: string;
        }[];
      };
      patient_appointments: {
        Args: Record<PropertyKey, never>;
        Returns: {
          appointment_id: string;
          department_name: string | null;
          doctor_name: string;
          duration_minutes: number;
          location: string | null;
          reason: string | null;
          scheduled_at: string;
          status: string;
        }[];
      };
      schedule_appointment: {
        Args: {
          _duration_minutes: number;
          _location: string | null;
          _patient_id: string;
          _provider_id: string;
          _reason: string | null;
          _scheduled_at: string;
          _appointment_type: string;
        };
        Returns: string;
      };
      ensure_department: {
        Args: { _facility_id: string; _name: string };
        Returns: string;
      };
      has_permission: {
        Args: { _code: string };
        Returns: boolean;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["staff_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_platform_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_tenant_admin: {
        Args: { _tenant_id: string };
        Returns: boolean;
      };
      is_hospital_admin: {
        Args: { _tenant_id: string };
        Returns: boolean;
      };
      is_tenant_member: {
        Args: { _tenant_id: string };
        Returns: boolean;
      };
      create_staff_draft_invoice: {
        Args: {
          _discount_amount?: number;
          _facility_id: string;
          _line_items: Json;
          _patient_id: string;
          _tax_amount?: number;
          _tenant_id: string;
        };
        Returns: {
          created_at: string;
          id: string;
          invoice_number: string;
        }[];
      };
      get_medicine_catalog_stock: {
        Args: { _tenant_id: string };
        Returns: {
          available_quantity: number;
          is_mapped: boolean;
          medicine_id: string;
        }[];
      };
      manage_medicine_inventory_mapping: {
        Args: {
          _conversion_factor: number | null;
          _item_id: string;
          _medicine_id: string;
          _operation: string;
          _tenant_id: string;
        };
        Returns: undefined;
      };
      send_medicine_request_to_vendor: {
        Args: {
          _request_id: string;
          _vendor_id: string;
        };
        Returns: string;
      };
      my_employment: {
        Args: Record<PropertyKey, never>;
        Returns: {
          department_name: string | null;
          designation_name: string | null;
          employee_code: string | null;
          employment_status: string | null;
          facility_code: string | null;
          facility_name: string | null;
          role_names: string[] | null;
          tenant_name: string | null;
          tenant_slug: string | null;
        }[];
      };
      approve_patient_registration: {
        Args: {
          _date_of_birth: string | null;
          _patient_id: string | null;
          _sex: string | null;
          _tenant_id: string;
          _user_id: string;
        };
        Returns: string;
      };
      pending_patient_registrations: {
        Args: Record<PropertyKey, never>;
        Returns: {
          full_name: string;
          phone: string;
          registered_at: string;
          user_id: string;
        }[];
      };
      respond_to_appointment: {
        Args: {
          _appointment_id: string;
          _note: string | null;
          _response: string;
        };
        Returns: undefined;
      };
      registration_hospitals: {
        Args: Record<PropertyKey, never>;
        Returns: { id: string; name: string }[];
      };
      reject_patient_registration: {
        Args: { _user_id: string };
        Returns: undefined;
      };
      set_my_availability: {
        Args: { _availability: string };
        Returns: undefined;
      };
      review_hospital_admin_registration: {
        Args: {
          _approved: boolean;
          _request_id: string;
        };
        Returns: undefined;
      };
      review_staff_access_request: {
        Args: {
          _approved: boolean;
          _request_id: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      staff_role:
        | "admin"
        | "doctor"
        | "insurance"
        | "nurse"
        | "lab_technician"
        | "pharmacist"
        | "receptionist";
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      staff_role: [
        "admin",
        "doctor",
        "insurance",
        "nurse",
        "lab_technician",
        "pharmacist",
        "receptionist",
      ],
    },
  },
} as const;
