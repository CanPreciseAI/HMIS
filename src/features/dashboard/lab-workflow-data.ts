import { supabase } from "@/integrations/supabase/client";
import type { StaffContext } from "./data";

export type LabReviewResult = {
  resultId: string;
  itemId: string;
  test: string;
  patient: string;
  value: string;
  unit: string;
  referenceRange: string;
  critical: boolean;
  at: string;
};

/** Preliminary results for tests this doctor ordered, awaiting verification. */
export async function loadLabResultsForReview(
  ctx: StaffContext,
): Promise<LabReviewResult[]> {
  if (!ctx.employeeId || !ctx.tenantId) return [];

  const { data: results, error } = await supabase
    .from("lab_results")
    .select(
      "id, lab_order_item_id, result_value, unit, reference_range, critical_flag, created_at",
    )
    .eq("tenant_id", ctx.tenantId)
    .eq("status", "preliminary")
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) {
    throw new Error(`Could not load results to verify: ${error.message}`);
  }
  if (!results?.length) return [];

  const itemIds = results.map((result) => result.lab_order_item_id);
  const { data: items, error: itemError } = await supabase
    .from("lab_order_items")
    .select("id, lab_order_id, test_id")
    .in("id", itemIds);
  if (itemError) {
    throw new Error(`Could not load the tested items: ${itemError.message}`);
  }

  const orderIds = [...new Set((items ?? []).map((item) => item.lab_order_id))];
  const { data: orders, error: orderError } = await supabase
    .from("lab_orders")
    .select("id, patient_id, ordered_by")
    .in("id", orderIds);
  if (orderError) {
    throw new Error(`Could not load the lab orders: ${orderError.message}`);
  }

  const myOrders = new Map(
    (orders ?? [])
      .filter((order) => order.ordered_by === ctx.employeeId)
      .map((order) => [order.id, order]),
  );
  const relevantItems = (items ?? []).filter((item) =>
    myOrders.has(item.lab_order_id),
  );
  if (!relevantItems.length) return [];

  const testIds = [...new Set(relevantItems.map((item) => item.test_id))];
  const patientIds = [
    ...new Set(
      relevantItems
        .map((item) => myOrders.get(item.lab_order_id)?.patient_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [testRes, patientRes] = await Promise.all([
    testIds.length
      ? supabase.from("lab_test_catalog").select("id, name").in("id", testIds)
      : Promise.resolve({ data: [], error: null }),
    patientIds.length
      ? supabase.from("patients").select("id, name").in("id", patientIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (testRes.error) {
    throw new Error(`Could not load test names: ${testRes.error.message}`);
  }
  if (patientRes.error) {
    throw new Error(
      `Could not load patient names: ${patientRes.error.message}`,
    );
  }

  const tests = new Map(
    (testRes.data ?? []).map((test) => [test.id, test.name]),
  );
  const patients = new Map(
    (patientRes.data ?? []).map((patient) => [patient.id, patient.name]),
  );
  const itemsById = new Map(relevantItems.map((item) => [item.id, item]));

  return results.flatMap((result) => {
    const item = itemsById.get(result.lab_order_item_id);
    if (!item) return [];
    const order = myOrders.get(item.lab_order_id);
    return [
      {
        resultId: result.id,
        itemId: item.id,
        test: tests.get(item.test_id) ?? "Lab test",
        patient: order
          ? (patients.get(order.patient_id) ?? "Patient")
          : "Patient",
        value: result.result_value,
        unit: result.unit ?? "",
        referenceRange: result.reference_range ?? "",
        critical: Boolean(result.critical_flag),
        at: result.created_at,
      },
    ];
  });
}

export async function updateLabItemStatus(input: {
  itemId: string;
  status: string;
}): Promise<void> {
  const { error } = await supabase.rpc("update_lab_item_status", {
    _item_id: input.itemId,
    _status: input.status,
  });
  if (error) {
    throw new Error(`Could not update the test status: ${error.message}`);
  }
}

export async function recordLabResult(input: {
  itemId: string;
  value: string;
  unit?: string;
  referenceRange?: string;
  critical?: boolean;
}): Promise<void> {
  const { error } = await supabase.rpc("record_lab_result", {
    _item_id: input.itemId,
    _result_value: input.value,
    _unit: input.unit?.trim() || null,
    _reference_range: input.referenceRange?.trim() || null,
    _critical: input.critical ?? false,
  });
  if (error) {
    throw new Error(
      `Could not send the result to the doctor: ${error.message}`,
    );
  }
}

export async function verifyLabResult(resultId: string): Promise<void> {
  const { error } = await supabase.rpc("verify_lab_result", {
    _result_id: resultId,
  });
  if (error) {
    throw new Error(`Could not verify the result: ${error.message}`);
  }
}
