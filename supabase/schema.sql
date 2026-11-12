-- Bora: esquema do Supabase para sincronizar viagens em grupo.
-- Rode este arquivo inteiro no SQL Editor do seu projeto.

create table if not exists public.trips (
  code text primary key check (code ~ '^[A-Z0-9]{6}$'),
  data jsonb not null check (pg_column_size(data) < 600000),
  updated_at timestamptz not null default now()
);

create table if not exists public.members (
  trip_code text not null references public.trips(code) on delete cascade,
  member_id text not null,
  name text not null check (char_length(name) between 1 and 40),
  color text not null,
  primary key (trip_code, member_id)
);

create table if not exists public.votes (
  trip_code text not null references public.trips(code) on delete cascade,
  member_id text not null,
  place_id text not null,
  value smallint not null check (value in (-1, 1, 2)),
  primary key (trip_code, member_id, place_id)
);

alter table public.trips enable row level security;
alter table public.members enable row level security;
alter table public.votes enable row level security;

-- Modelo de acesso: sem login. Quem tem o código de 6 caracteres participa da viagem.
-- As políticas abaixo liberam leitura e escrita para a chave pública (anon).
-- Isso é adequado para uso pessoal entre amigos; qualquer pessoa com a chave anon
-- e um código válido consegue ler e alterar aquela viagem. Não guarde dados sensíveis.
create policy "trips anon" on public.trips for all to anon using (true) with check (true);
create policy "members anon" on public.members for all to anon using (true) with check (true);
create policy "votes anon" on public.votes for all to anon using (true) with check (true);

grant select, insert, update, delete on public.trips, public.members, public.votes to anon;

-- Tempo real
alter publication supabase_realtime add table public.trips, public.members, public.votes;
