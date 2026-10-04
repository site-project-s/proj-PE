-- =====================================================================
-- Lanches na UFAL — esquema do banco (Supabase / PostgreSQL)
-- Rode este arquivo inteiro uma vez em: Supabase > SQL Editor > New query
-- =====================================================================

-- 1) Perfis: apelido público de cada conta (o e-mail nunca é exposto)
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  apelido    text not null unique
             check (char_length(apelido) between 3 and 20 and apelido ~ '^[A-Za-z0-9_.-]+$'),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "perfis visiveis a todos" on public.profiles;
create policy "perfis visiveis a todos"
  on public.profiles for select using (true);
-- (sem policy de insert/update: o perfil só é criado pelo gatilho abaixo)

-- 2) Cria o perfil automaticamente quando alguém cria uma conta
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, apelido)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'apelido'), ''), 'aluno_' || substr(new.id::text, 1, 6))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3) Registros de lanches (preço + nota + review) feitos pela comunidade
create table if not exists public.registros (
  id         uuid primary key default gen_random_uuid(),
  local_id   text not null check (local_id ~ '^L[0-9]{2}$'),          -- id do local no data/lanches.json
  item       text not null check (char_length(trim(item)) between 2 and 60),
  preco      numeric(6,2) not null check (preco > 0 and preco <= 500),
  nota       smallint check (nota between 1 and 5),
  review     text check (review is null or char_length(review) <= 300),
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  oculto     boolean not null default false,                          -- moderação: marque true para esconder
  created_at timestamptz not null default now()
);

create index if not exists registros_local_idx on public.registros (local_id);
create index if not exists registros_user_idx  on public.registros (user_id, created_at);

alter table public.registros enable row level security;

-- Todos veem os registros não ocultados
drop policy if exists "ver registros" on public.registros;
create policy "ver registros"
  on public.registros for select
  using (not oculto);

-- Só quem está logado cria, em seu próprio nome, no máximo 20 por dia
drop policy if exists "criar registro" on public.registros;
create policy "criar registro"
  on public.registros for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      select count(*) from public.registros r
      where r.user_id = auth.uid() and r.created_at > now() - interval '1 day'
    ) < 20
  );

-- Cada pessoa pode excluir apenas os próprios registros
drop policy if exists "excluir meu registro" on public.registros;
create policy "excluir meu registro"
  on public.registros for delete to authenticated
  using (user_id = auth.uid());

-- =====================================================================
-- Moderação (feita por você, no painel Table Editor ou aqui):
--   update public.registros set oculto = true where id = '...';
-- =====================================================================
