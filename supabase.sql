create table if not exists public.global_totals (
  id bigint primary key,
  debt_won bigint not null default 0,
  money_owed bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.global_totals (id, debt_won, money_owed)
values (1, 0, 0)
on conflict (id) do nothing;

alter table public.global_totals enable row level security;

drop policy if exists "read_global_totals" on public.global_totals;

create policy "read_global_totals" on public.global_totals
for select
to anon, authenticated
using (true);

revoke all on table public.global_totals from public;
grant select on table public.global_totals to anon, authenticated;

create or replace function public.increment_global_totals(
  delta_debt_won bigint,
  delta_money_owed bigint
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.global_totals
  set debt_won = debt_won + delta_debt_won,
      money_owed = money_owed + delta_money_owed,
      updated_at = now()
  where id = 1;
$$;

grant execute on function public.increment_global_totals(bigint, bigint) to anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table public.global_totals;
exception
  when duplicate_object then null;
end $$;

create table if not exists public.chat_messages (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  username text not null,
  content text not null
);

alter table public.chat_messages enable row level security;

drop policy if exists "read_chat_messages" on public.chat_messages;
drop policy if exists "insert_chat_messages" on public.chat_messages;

create policy "read_chat_messages" on public.chat_messages
for select
to anon, authenticated
using (true);

create policy "insert_chat_messages" on public.chat_messages
for insert
to anon, authenticated
with check (
  length(username) between 1 and 24
  and length(content) between 1 and 280
);

revoke all on table public.chat_messages from public;
grant select, insert on table public.chat_messages to anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table public.chat_messages;
exception
  when duplicate_object then null;
end $$;
