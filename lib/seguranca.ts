import type { NovoRegistro } from "./comunidade";

/** Erro com mensagem segura para mostrar ao usuário. */
export class ErroUsuario extends Error {}

// Caracteres de controle e invisíveis/bidirecionais (usados para "truques" visuais em textos).
// eslint-disable-next-line no-control-regex
const INVISIVEIS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

/** Normaliza, remove invisíveis, junta espaços e corta no limite. */
export function limparTexto(texto: string, max: number): string {
  return texto.normalize("NFC").replace(INVISIVEIS, "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Detecta links (spam / phishing) em textos livres. */
export function temLink(texto: string): boolean {
  return /(https?:\/\/|www\.|\b[\w-]+\.(com|net|org|br|io|me|ly|xyz|gg)\b)/i.test(texto);
}

const NOME_ITEM = /^[\p{L}\p{N} .,'’()/&+%-]+$/u;

type Entrada = { localId: string; item: string; preco: string | number; nota: number | null; review: string };

/** Valida e limpa o que o usuário digitou. O banco repete essas regras (defesa em profundidade). */
export function validarRegistro(e: Entrada, idsConhecidos: string[]): NovoRegistro {
  if (!/^L\d{2}$/.test(e.localId) || !idsConhecidos.includes(e.localId)) throw new ErroUsuario("Local inválido. Atualize a página e tente de novo.");

  const item = limparTexto(e.item, 60);
  if (item.length < 2) throw new ErroUsuario("Informe o nome do lanche (mínimo 2 letras).");
  if (!NOME_ITEM.test(item)) throw new ErroUsuario("O nome do lanche tem caracteres não permitidos. Use letras, números e pontuação simples.");
  if (temLink(item)) throw new ErroUsuario("Não coloque links no nome do lanche.");

  const bruto = typeof e.preco === "number" ? String(e.preco) : e.preco.trim().replace(/^R\$\s*/i, "").replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(bruto)) throw new ErroUsuario("Informe um preço válido, como 6,50.");
  const preco = Number(bruto);
  if (!(preco > 0 && preco <= 500)) throw new ErroUsuario("O preço precisa estar entre R$ 0,01 e R$ 500,00.");

  if (e.nota !== null && !(Number.isInteger(e.nota) && e.nota >= 1 && e.nota <= 5)) throw new ErroUsuario("Nota inválida.");

  const review = limparTexto(e.review, 300);
  if (review && temLink(review)) throw new ErroUsuario("Por segurança, não é permitido colocar links na review.");
  if (/[<>]/.test(review)) throw new ErroUsuario("A review não pode conter os símbolos < ou >.");

  return { localId: e.localId, item, preco: Math.round(preco * 100) / 100, nota: e.nota, review: review === "" ? null : review };
}

/** Validação do apelido (igual à do banco). */
export const APELIDO_OK = /^[A-Za-z0-9_.-]{3,20}$/;
