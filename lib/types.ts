export type ItemPreco = { item: string; preco: number };

export type Local = {
  id: string;
  nome: string;
  lat: number;
  lon: number;
  blocoMaisProximo: string;
  distBlocoM: number;
  itens: ItemPreco[];
};

export type Bloco = { id: string; nome: string; lat: number; lon: number };

export type Dados = {
  coletadoEm: string;
  locais: Local[];
  blocos: Bloco[];
};

/** Registro feito por um usuário (preço + nota + review). */
export type Registro = {
  id: string;
  localId: string;
  item: string;
  preco: number;
  nota: number | null;
  review: string | null;
  userId: string;
  apelido: string;
  criadoEm: string;
};

/** Local já filtrado pela busca, com distância e registros da comunidade. */
export type LocalResultado = Local & {
  dist: number | null;
  regs: Registro[]; // registros que combinam com a busca (todos, se não há busca)
  totalRegs: number; // total de registros do local
  mediaNota: number | null;
};

export type Origem = { lat: number; lon: number; rotulo: string; blocoId?: string };

export type Usuario = { id: string; apelido: string };
