-- spec Section 10: "if none of a team's coach accounts are reachable, a
-- linked parent can use a 'Reach out to Customer Care' option ...
-- tracked in a Supabase table for follow-up." This sprint builds a
-- structured intake form (category + description) rather than a live
-- conversational AI bot -- genuinely gathers "the nature of the request"
-- without a new external LLM dependency; swapping in a real conversational
-- bot later is an additive change (an Edge Function writing to this same
-- table), not a schema change.
create table customer_care_request (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users (id),
  team_id uuid references team (id),
  category text not null check (category in ('coach_unreachable', 'registration_issue', 'account_issue', 'other')),
  description text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now()
);

alter table customer_care_request enable row level security;

create policy "requesters and admin can read customer care requests" on customer_care_request for select
  to authenticated
  using (is_app_admin() or requester_user_id = auth.uid());

create policy "users can submit a customer care request as themselves" on customer_care_request for insert
  to authenticated
  with check (requester_user_id = auth.uid());

-- Admin triages and marks resolved (spec Section 10: "tracked ... for
-- follow-up"); the requester doesn't get an edit path in v1.
create policy "admin can update customer care requests" on customer_care_request for update
  to authenticated
  using (is_app_admin());
