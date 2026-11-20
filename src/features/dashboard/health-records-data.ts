import { supabase } from "@/integrations/supabase/client";

export const PATIENT_HEALTH_BUCKET = "patient-health-records";

export type PatientHealthDocument = {
  id: string;
  title: string;
  category: string;
  fileName: string;
  filePath: string;
  mimeType: string | null;
  fileSize: number | null;
  notes: string | null;
  uploaderRole: string;
  createdAt: string;
};

export type PatientHealthAllergy = {
  id: string;
  substance: string;
  reaction: string;
  severity: string;
  status: string;
  createdAt: string;
};

export type PatientHealthCondition = {
  id: string;
  code: string;
  description: string;
  type: string;
  at: string;
};

export type PatientHealthRecord = {
  allergies: PatientHealthAllergy[];
  conditions: PatientHealthCondition[];
  documents: PatientHealthDocument[];
};

/**
 * Conditions, allergies and uploaded reports for one patient. Row-level
 * security decides what the signed-in actor may see: the patient themselves,
 * every staff member of the patient's current hospital, and platform admins.
 */
export async function loadPatientHealthRecord(
  patientId: string,
): Promise<PatientHealthRecord> {
  const [allergyRes, encounterRes, documentRes] = await Promise.all([
    supabase
      .from("allergies")
      .select("id, substance, reaction, severity, status, created_at")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false }),
    supabase.from("encounters").select("id").eq("patient_id", patientId),
    supabase
      .from("patient_health_documents")
      .select(
        "id, title, category, file_name, file_path, mime_type, file_size, notes, uploader_role, created_at",
      )
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false }),
  ]);
  if (allergyRes.error) {
    throw new Error(`Could not load allergies: ${allergyRes.error.message}`);
  }
  if (encounterRes.error) {
    throw new Error(
      `Could not load the patient's visits: ${encounterRes.error.message}`,
    );
  }
  if (documentRes.error) {
    throw new Error(
      `Could not load health documents: ${documentRes.error.message}`,
    );
  }

  const encounterIds = (encounterRes.data ?? []).map((row) => row.id);
  const diagnosisRes = encounterIds.length
    ? await supabase
        .from("diagnoses")
        .select(
          "id, encounter_id, diagnosis_code, description, diagnosis_type, created_at",
        )
        .in("encounter_id", encounterIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (diagnosisRes.error) {
    throw new Error(
      `Could not load the patient's conditions: ${diagnosisRes.error.message}`,
    );
  }

  return {
    allergies: (allergyRes.data ?? []).map((row) => ({
      id: row.id,
      substance: row.substance,
      reaction: row.reaction,
      severity: row.severity,
      status: row.status,
      createdAt: row.created_at,
    })),
    conditions: (diagnosisRes.data ?? []).map((row) => ({
      id: row.id,
      code: row.diagnosis_code,
      description: row.description ?? row.diagnosis_code,
      type: row.diagnosis_type,
      at: row.created_at,
    })),
    documents: (documentRes.data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      category: row.category,
      fileName: row.file_name,
      filePath: row.file_path,
      mimeType: row.mime_type,
      fileSize: row.file_size === null ? null : Number(row.file_size),
      notes: row.notes,
      uploaderRole: row.uploader_role,
      createdAt: row.created_at,
    })),
  };
}

export async function getPatientHealthDocumentUrl(
  filePath: string,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(PATIENT_HEALTH_BUCKET)
    .createSignedUrl(filePath, 300);
  if (error || !data?.signedUrl) {
    throw new Error(
      error
        ? `Could not open that file: ${error.message}`
        : "Could not open that file.",
    );
  }
  return data.signedUrl;
}

export async function uploadPatientHealthDocument(input: {
  patientId: string;
  tenantId: string;
  userId: string;
  role: string;
  file: File;
  title: string;
  category: string;
  notes?: string;
}): Promise<void> {
  const safeName = input.file.name.replace(/[^A-Za-z0-9._-]+/g, "-");
  const filePath = `${input.patientId}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from(PATIENT_HEALTH_BUCKET)
    .upload(filePath, input.file, {
      contentType: input.file.type || "application/octet-stream",
      upsert: false,
    });
  if (uploadError) {
    throw new Error(`Could not upload that file: ${uploadError.message}`);
  }

  const { error: insertError } = await supabase
    .from("patient_health_documents")
    .insert({
      patient_id: input.patientId,
      tenant_id: input.tenantId,
      uploaded_by: input.userId,
      uploader_role: input.role,
      title: input.title.trim() || input.file.name,
      category: input.category,
      file_path: filePath,
      file_name: input.file.name,
      mime_type: input.file.type || null,
      file_size: input.file.size,
      notes: input.notes?.trim() || null,
    });
  if (insertError) {
    await supabase.storage.from(PATIENT_HEALTH_BUCKET).remove([filePath]);
    throw new Error(
      `Could not save that health document: ${insertError.message}`,
    );
  }
}

export async function deletePatientHealthDocument(document: {
  id: string;
  filePath: string;
}): Promise<void> {
  // Remove the stored file first: the storage policy checks the metadata row
  // for administrators who are not the uploader.
  const { error: storageError } = await supabase.storage
    .from(PATIENT_HEALTH_BUCKET)
    .remove([document.filePath]);
  if (storageError) {
    throw new Error(`Could not remove that file: ${storageError.message}`);
  }
  const { error } = await supabase
    .from("patient_health_documents")
    .delete()
    .eq("id", document.id);
  if (error) {
    throw new Error(`Could not remove that document: ${error.message}`);
  }
}

/** Records a diagnosis; it appears in the patient's health information at once. */
export async function recordPatientDiagnosis(input: {
  patientId: string;
  code: string;
  description?: string;
  type: string;
}): Promise<void> {
  const { error } = await supabase.rpc("record_patient_diagnosis", {
    _patient_id: input.patientId,
    _diagnosis_code: input.code,
    _description: input.description?.trim() || null,
    _diagnosis_type: input.type,
  });
  if (error) {
    throw new Error(`Could not record the diagnosis: ${error.message}`);
  }
}
