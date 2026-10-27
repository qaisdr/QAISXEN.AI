create table if not exists public.conversations (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'محادثة',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.messages (
  id bigserial primary key,
  conversation_id text not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
drop policy if exists "own conversations select" on public.conversations;
drop policy if exists "own conversations insert" on public.conversations;
drop policy if exists "own conversations update" on public.conversations;
drop policy if exists "own conversations delete" on public.conversations;
drop policy if exists "own messages select" on public.messages;
drop policy if exists "own messages insert" on public.messages;
drop policy if exists "own messages delete" on public.messages;
create policy "own conversations select" on public.conversations for select using (auth.uid() = user_id);
create policy "own conversations insert" on public.conversations for insert with check (auth.uid() = user_id);
create policy "own conversations update" on public.conversations for update using (auth.uid() = user_id);
create policy "own conversations delete" on public.conversations for delete using (auth.uid() = user_id);
create policy "own messages select" on public.messages for select using (auth.uid() = user_id);
create policy "own messages insert" on public.messages for insert with check (auth.uid() = user_id);
create policy "own messages delete" on public.messages for delete using (auth.uid() = user_id);
