create table if not exists public.quiz_batches (
  id uuid primary key,
  label text not null,
  created_at bigint not null,
  max_uses integer not null check (max_uses between 1 and 20),
  code_count integer not null check (code_count between 1 and 500)
);

create table if not exists public.quiz_access_codes (
  id uuid primary key,
  batch_id uuid not null references public.quiz_batches(id) on delete cascade,
  code_hash text not null unique,
  max_uses integer not null check (max_uses between 1 and 20),
  used_count integer not null default 0 check (used_count >= 0),
  created_at bigint not null,
  disabled_at bigint
);

create table if not exists public.quiz_admin_sessions (
  token_hash text primary key,
  created_at bigint not null,
  expires_at bigint not null,
  revoked_at bigint
);

create index if not exists quiz_access_codes_batch_idx
  on public.quiz_access_codes(batch_id);

alter table public.quiz_batches enable row level security;
alter table public.quiz_access_codes enable row level security;
alter table public.quiz_admin_sessions enable row level security;
revoke all on public.quiz_batches from anon, authenticated;
revoke all on public.quiz_access_codes from anon, authenticated;
revoke all on public.quiz_admin_sessions from anon, authenticated;
grant all on public.quiz_batches to service_role;
grant all on public.quiz_access_codes to service_role;
grant all on public.quiz_admin_sessions to service_role;

create or replace function public.quiz_consume_access_code(code_hash_input text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_code public.quiz_access_codes%rowtype;
begin
  select * into selected_code
  from public.quiz_access_codes
  where code_hash = code_hash_input
  for update;

  if not found or selected_code.disabled_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  if selected_code.used_count >= selected_code.max_uses then
    return jsonb_build_object('ok', false, 'reason', 'exhausted');
  end if;

  update public.quiz_access_codes
  set used_count = used_count + 1
  where id = selected_code.id;

  return jsonb_build_object(
    'ok', true,
    'remaining', selected_code.max_uses - selected_code.used_count - 1
  );
end;
$$;

revoke all on function public.quiz_consume_access_code(text) from public, anon, authenticated;
grant execute on function public.quiz_consume_access_code(text) to service_role;
