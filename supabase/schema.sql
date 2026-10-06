-- =====================================================================
-- Lanches na UFAL — esquema do banco (Supabase / PostgreSQL)  [versão segura]
-- Rode este arquivo inteiro em: Supabase > SQL Editor > New query > Run.
-- Pode rodar de novo quantas vezes quiser (é idempotente), inclusive
-- para ATUALIZAR um banco que já tinha a versão anterior.
-- =====================================================================

-- 1) Perfis: apelido público de cada conta (o e-mail nunca é exposto) -----
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  apelido    text not null unique,
  created_at timestamptz not null default now()
);

alter table public.profiles drop constraint if exists profiles_apelido_valido;
alter table public.profiles add constraint profiles_apelido_valido
  check (apelido ~ '^[A-Za-z0-9_.-]{3,20}$') not valid;

alter table public.profiles enable row level security;

drop policy if exists "perfis visiveis a todos" on public.profiles;
create policy "perfis visiveis a todos" on public.profiles for select using (true);
-- (sem policy de insert/update/delete: o perfil só é criado pelo gatilho abaixo)

-- 2) Cria o perfil automaticamente quando alguém cria uma conta -----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''          -- evita sequestro de funções/tabelas por search_path
as $$
begin
  insert into public.profiles (id, apelido)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'apelido'), ''), 'aluno_' || substr(new.id::text, 1, 6))
  );
  return new;
end;
$$;

-- Ninguém precisa chamar essa função diretamente (só o gatilho)
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3) Registros de lanches (preço + nota + review) feitos pela comunidade ---
create table if not exists public.registros (
  id         uuid primary key default gen_random_uuid(),
  local_id   text not null,                                   -- id do local no data/lanches.json (ex.: L07)
  item       text not null,
  preco      numeric(6,2) not null,
  nota       smallint,
  review     text,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  oculto     boolean not null default false,                  -- moderação: marque true para esconder
  created_at timestamptz not null default now()
);

-- Regras de validação (valem para qualquer cliente, mesmo fora do site).
-- "not valid" = aplica a novos registros sem reprovar dados antigos.
alter table public.registros drop constraint if exists registros_local_valido;
alter table public.registros add constraint registros_local_valido
  check (local_id ~ '^L[0-9]{2}$') not valid;

alter table public.registros drop constraint if exists registros_item_valido;
alter table public.registros add constraint registros_item_valido
  check (char_length(btrim(item)) between 2 and 60 and item !~ '[<>[:cntrl:]]') not valid;

alter table public.registros drop constraint if exists registros_preco_valido;
alter table public.registros add constraint registros_preco_valido
  check (preco > 0 and preco <= 500) not valid;

alter table public.registros drop constraint if exists registros_nota_valida;
alter table public.registros add constraint registros_nota_valida
  check (nota is null or nota between 1 and 5) not valid;

alter table public.registros drop constraint if exists registros_review_valida;
alter table public.registros add constraint registros_review_valida
  check (
    review is null
    or (char_length(review) <= 300 and review !~ '[<>[:cntrl:]]' and review !~* '(https?://|www\.)')
  ) not valid;

create index if not exists registros_local_idx on public.registros (local_id);
create index if not exists registros_user_idx  on public.registros (user_id, created_at);

-- 4) Segurança de linha (RLS) ---------------------------------------------
alter table public.registros enable row level security;

drop policy if exists "ver registros" on public.registros;
create policy "ver registros" on public.registros for select using (not oculto);

-- Só logado cria, em seu próprio nome: no máximo 3 por minuto e 20 por dia
drop policy if exists "criar registro" on public.registros;
create policy "criar registro" on public.registros for insert to authenticated
  with check (
    user_id = auth.uid()
    and (select count(*) from public.registros r
         where r.user_id = auth.uid() and r.created_at > now() - interval '1 minute') < 3
    and (select count(*) from public.registros r
         where r.user_id = auth.uid() and r.created_at > now() - interval '1 day') < 20
  );

-- Cada pessoa exclui apenas os próprios registros
drop policy if exists "excluir meu registro" on public.registros;
create policy "excluir meu registro" on public.registros for delete to authenticated
  using (user_id = auth.uid());

-- 5) Menor privilégio (permissões das tabelas) ----------------------------
-- Sem isso, um cliente poderia tentar gravar colunas sensíveis (oculto, created_at, id).
revoke all on table public.registros from anon, authenticated;
grant select on table public.registros to anon, authenticated;
grant insert (local_id, item, preco, nota, review, user_id) on table public.registros to authenticated;
grant delete on table public.registros to authenticated;

revoke all on table public.profiles from anon, authenticated;
grant select (id, apelido, created_at) on table public.profiles to anon, authenticated;

-- =====================================================================
-- Moderação (feita por você, no Table Editor ou aqui):
--   update public.registros set oculto = true where id = '...';
-- =====================================================================
