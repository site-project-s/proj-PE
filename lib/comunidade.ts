import { supabase } from "./supabase";
import { ErroUsuario, validarRegistro } from "./seguranca";
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

let ultimoEnvio = 0; // intervalo mínimo entre registros (o servidor também limita)

export async function criarRegistro(r: NovoRegistro, userId: string, idsConhecidos: string[]): Promise<Registro> {
  // Revalida logo antes de enviar (o banco repete essas regras).
  const limpo = validarRegistro({ ...r, review: r.review ?? "" }, idsConhecidos);
  const agora = Date.now();
  if (agora - ultimoEnvio < 15000) throw new ErroUsuario("Aguarde alguns segundos antes de registrar outro lanche.");
  const { data, error } = await cliente()
    .from("registros")
    .insert({ local_id: limpo.localId, item: limpo.item, preco: limpo.preco, nota: limpo.nota, review: limpo.review, user_id: userId })
    .select(COLUNAS)
    .single();
  if (error) throw error;
  ultimoEnvio = agora;
  return paraRegistro(data as unknown as Linha);
}

export async function excluirRegistro(id: string): Promise<void> {
  const { error } = await cliente().from("registros").delete().eq("id", id);
  if (error) throw error;
}

export async function entrar(email: string, senha: string, captchaToken?: string): Promise<void> {
  const { error } = await cliente().auth.signInWithPassword({ email, password: senha, options: { captchaToken } });
  if (error) throw error;
}

/** Cria a conta. `precisaConfirmar` = true quando o Supabase exige confirmação por e-mail. */
export async function criarConta(
  email: string,
  senha: string,
  apelido: string,
  captchaToken?: string
): Promise<{ precisaConfirmar: boolean }> {
  const { data, error } = await cliente().auth.signUp({ email, password: senha, options: { data: { apelido }, captchaToken } });
  if (error) throw error;
  return { precisaConfirmar: !data.session };
}

export async function sair(): Promise<void> {
  await cliente().auth.signOut();
}

/** Traduz erros para mensagens claras, sem expor detalhes internos do banco. */
export function mensagemErro(e: unknown): string {
  if (e instanceof ErroUsuario) return e.message;
  const err = e as { message?: string; code?: string } | null;
  const msg = (err?.message ?? "").toLowerCase();
  if (err?.code === "42501" || msg.includes("row-level security") || msg.includes("permission denied"))
    return "Não foi possível salvar: entre novamente, ou você atingiu o limite (3 por minuto e 20 por dia).";
  if (err?.code === "23514" || msg.includes("violates check constraint")) return "Algum campo não passou na validação (nome, preço ou texto). Revise e tente de novo.";
  if (err?.code === "23505") return "Esse registro já existe.";
  if (msg.includes("captcha")) return "A verificação anti-robô falhou. Tente de novo.";
  if (msg.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (msg.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar (veja a caixa de entrada e o spam).";
  if (msg.includes("already registered") || msg.includes("already been registered")) return "Já existe uma conta com este e-mail. Use “Entrar”.";
  if (msg.includes("database error saving new user") || msg.includes("profiles_apelido")) return "Não foi possível criar a conta. Esse apelido já pode estar em uso: tente outro.";
  if (msg.includes("password")) return "Senha inválida: use pelo menos 8 caracteres, com letras e números.";
  if (msg.includes("rate limit") || msg.includes("too many") || err?.code === "429") return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  if (msg.includes("failed to fetch") || msg.includes("network")) return "Sem conexão com o servidor. Tente de novo.";
  return "Ocorreu um erro inesperado. Tente novamente em instantes.";
}
