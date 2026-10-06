import { normalizar } from "./geo";

/** Emoji de cada item (por palavra-chave, na ordem). Itens desconhecidos ficam com 🍽️. */
const ICONES: Array<[string[], string]> = [
  [["agua", "garrafinha"], "💧"],
  [["suco"], "🧃"],
  [["cafe"], "☕"],
  [["coco"], "🥥"],
  [["monster", "red bull"], "⚡"],
  [["coca", "refri", "cacul", "h2o", "aquarius", "guaicurus"], "🥤"],
  [["coxinha"], "🍗"],
  [["pastel"], "🥟"],
  [["pao de queijo"], "🧀"],
  [["sanduiche", "misto"], "🥪"],
  [["hamburguer"], "🍔"],
  [["tapioca"], "🫓"],
  [["salgado", "croissant", "tortilete"], "🥐"],
  [["broa"], "🍞"],
  [["torta"], "🥧"],
  [["bolo"], "🍰"],
  [["brigadeiro", "trufa", "brownie"], "🍫"],
  [["pudim", "mousse"], "🍮"],
  [["pacoca", "amendoim"], "🥜"],
  [["balinha", "trident"], "🍬"],
  [["biscoito"], "🍪"],
  [["picole", "cremosinho", "sorvete"], "🍦"],
  [["lasanha", "macarronada"], "🍝"],
];

export function iconeItem(nome: string): string {
  const n = normalizar(nome);
  for (const [palavras, emoji] of ICONES) if (palavras.some((p) => n.includes(p))) return emoji;
  return "🍽️";
}

export type Categoria = { id: string; rotulo: string; emoji: string; palavras: string[] };

/** Atalhos de filtro. Só entram itens que reconhecemos; o resto continua achável pela busca. */
export const CATEGORIAS: Categoria[] = [
  { id: "bebidas", rotulo: "Bebidas", emoji: "🥤", palavras: ["agua", "suco", "cafe", "coco", "monster", "red bull", "coca", "refri", "cacul", "h2o", "aquarius", "garrafinha"] },
  { id: "salgados", rotulo: "Salgados", emoji: "🥟", palavras: ["coxinha", "pastel", "salgado", "croissant", "tortilete", "pao de queijo", "sanduiche", "misto", "tapioca", "broa"] },
  { id: "doces", rotulo: "Doces e sorvetes", emoji: "🍰", palavras: ["bolo", "brigadeiro", "trufa", "brownie", "pudim", "mousse", "pacoca", "balinha", "trident", "picole", "cremosinho", "sorvete"] },
  { id: "refeicoes", rotulo: "Refeições", emoji: "🍝", palavras: ["lasanha", "macarronada", "hamburguer"] },
];

export function itemEmCategoria(nome: string, categoriaId: string): boolean {
  const c = CATEGORIAS.find((x) => x.id === categoriaId);
  if (!c) return true;
  const n = normalizar(nome);
  return c.palavras.some((p) => n.includes(p));
}
