import { supabase } from "./supabase";
import type { Registro } from "./types";

type Linha = {
  id: string;
  local_id: string;
  item: string;
  preco: number | string;
  nota: number | null;
  review: string | null;
  user_id: string;
  created_at: string;
  profiles: { apelido: string } | { apelido: string }[] | null;
};

const COLUNAS = "id, local_id, item, preco, nota, review, user_id, created_at, profiles(apelido)";

function paraRegistro(l: Linha): Registro {
  const perfil = Array.isArray(l.profiles) ? l.profiles[0] : l.profiles;
  return {
    id: l.id,
    localId: l.local_id,
    item: l.item,
    preco: Number(l.preco),
    nota: l.nota,
    review: l.review,
    userId: l.user_id,
    apelido: perfil?.apelido ?? "aluno",
    criadoEm: l.created_at,
  };
}

function cliente() {
  if (!supabase) throw new Error("Contas e registros não estão configurados neste site.");
  return supabase;
}

export async function listarRegistros(): Promise<Registro[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("registros")
    .select(COLUNAS)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw error;
  return ((data ?? []) as unknown as Linha[]).map(paraRegistro);
}

export type NovoRegistro = { localId: string; item: string; preco: number; nota: number | null; review: string | null };

export async function criarRegistro(r: NovoRegistro, userId: string): Promise<Registro> {
  const { data, error } = await cliente()
    .from("registros")
    .insert({ local_id: r.localId, item: r.item, preco: r.preco, nota: r.nota, review: r.review, user_id: userId })
    .select(COLUNAS)
    .single();
  if (error) throw error;
  return paraRegistro(data as unknown as Linha);
}

export async function excluirRegistro(id: string): Promise<void> {
  const { error } = await cliente().from("registros").delete().eq("id", id);
  if (error) throw error;
}

export async function entrar(email: string, senha: string): Promise<void> {
  const { error } = await cliente().auth.signInWithPassword({ email, password: senha });
  if (error) throw error;
}

/** Cria a conta. `precisaConfirmar` = true quando o Supabase exige confirmação por e-mail. */
export async function criarConta(email: string, senha: string, apelido: string): Promise<{ precisaConfirmar: boolean }> {
  const { data, error } = await cliente().auth.signUp({ email, password: senha, options: { data: { apelido } } });
  if (error) throw error;
  return { precisaConfirmar: !data.session };
}

export async function sair(): Promise<void> {
  await cliente().auth.signOut();
}

/** Traduz erros comuns do Supabase para mensagens claras. */
export function mensagemErro(e: unknown): string {
  const err = e as { message?: string; code?: string } | null;
  const msg = (err?.message ?? "").toLowerCase();
  if (err?.code === "42501" || msg.includes("row-level security")) return "Não foi possível salvar: entre novamente ou você atingiu o limite de 20 registros por dia.";
  if (msg.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (msg.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar (veja a caixa de entrada e o spam).";
  if (msg.includes("already registered") || msg.includes("already been registered")) return "Já existe uma conta com este e-mail. Use “Entrar”.";
  if (msg.includes("database error saving new user") || msg.includes("profiles_apelido")) return "Não foi possível criar a conta. Esse apelido já pode estar em uso: tente outro.";
  if (msg.includes("password")) return "Senha inválida: use pelo menos 8 caracteres.";
  if (msg.includes("rate limit") || msg.includes("too many")) return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  if (msg.includes("failed to fetch") || msg.includes("network")) return "Sem conexão com o servidor. Tente de novo.";
  return err?.message ?? "Ocorreu um erro inesperado.";
}
