import type { SupabaseClient } from "@supabase/supabase-js";

export const CUSTOMER_CARE_CATEGORIES = [
  { value: "coach_unreachable", label: "Coach is unreachable" },
  { value: "registration_issue", label: "Registration issue" },
  { value: "account_issue", label: "Account issue" },
  { value: "other", label: "Other" },
] as const;
export type CustomerCareCategory = (typeof CUSTOMER_CARE_CATEGORIES)[number]["value"];

export interface CustomerCareRequest {
  id: string;
  requesterUserId: string;
  teamId: string | null;
  category: CustomerCareCategory;
  description: string;
  status: "open" | "resolved";
  createdAt: string;
}

function toRequest(row: any): CustomerCareRequest {
  return {
    id: row.id,
    requesterUserId: row.requester_user_id,
    teamId: row.team_id,
    category: row.category,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function submitCustomerCareRequest(
  supabase: SupabaseClient,
  input: { requesterUserId: string; teamId: string | null; category: CustomerCareCategory; description: string }
): Promise<void> {
  const { error } = await supabase.from("customer_care_request").insert({
    requester_user_id: input.requesterUserId,
    team_id: input.teamId,
    category: input.category,
    description: input.description,
  });
  if (error) throw error;
}

export async function listMyCustomerCareRequests(supabase: SupabaseClient, userId: string): Promise<CustomerCareRequest[]> {
  const { data, error } = await supabase
    .from("customer_care_request")
    .select("*")
    .eq("requester_user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toRequest);
}

// Admin triage view (spec Section 10: requests are "tracked ... for
// follow-up") -- RLS restricts this to is_app_admin() regardless of what
// the caller asks for.
export async function listAllCustomerCareRequests(supabase: SupabaseClient): Promise<CustomerCareRequest[]> {
  const { data, error } = await supabase.from("customer_care_request").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toRequest);
}

export async function markCustomerCareRequestResolved(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("customer_care_request").update({ status: "resolved" }).eq("id", id);
  if (error) throw error;
}
