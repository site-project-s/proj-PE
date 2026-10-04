"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import dadosBrutos from "../data/lanches.json";
import {
  criarRegistro,
  excluirRegistro,
  listarRegistros,
  mensagemErro,
  sair,
  type NovoRegistro,
} from "../lib/comunidade";
import { formatarDistancia, haversine, minutosAPe, normalizar, reais } from "../lib/geo";
import { supabase } from "../lib/supabase";
import type { Dados, LocalResultado, Origem, Registro } from "../lib/types";
import { useSessao } from "../lib/useSessao";
import AuthModal from "./AuthModal";
import Estrelas from "./Estrelas";
import RegistroModal from "./RegistroModal";

const dados = dadosBrutos as Dados;
const COMUNIDADE_ATIVA = supabase !== null;

// Leaflet usa `window`: o mapa só pode ser carregado no navegador.
const Mapa = dynamic(() => import("./Mapa"), {
  ssr: false,
  loading: () => <p style={{ padding: 16 }}>Carregando mapa…</p>,
});

// Itens oficiais mais comuns (em nº de locais), usados como atalhos de busca.
const ATALHOS = (() => {
  const cont = new Map<string, number>();
  for (const l of dados.locais) for (const i of new Set(l.itens.map((x) => x.item))) cont.set(i, (cont.get(i) ?? 0) + 1);
  return [...cont.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([nome]) => nome);
})();

const ITENS_OFICIAIS = [...new Set(dados.locais.flatMap((l) => l.itens.map((i) => i.item)))].sort((a, b) =>
  a.localeCompare(b, "pt-BR")
);

export default function App() {
  const [busca, setBusca] = useState("");
  const [origem, setOrigem] = useState<Origem | null>(null);
  const [ordem, setOrdem] = useState<"dist" | "preco">("dist");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [mostrarBlocos, setMostrarBlocos] = useState(false);
  const [erroGps, setErroGps] = useState<string | null>(null);

  // Comunidade
  const { usuario } = useSessao();
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [erroRegistros, setErroRegistros] = useState<string | null>(null);
  const [authAberto, setAuthAberto] = useState<"entrar" | "criar" | null>(null);
  const [registroLocalId, setRegistroLocalId] = useState<string | null>(null);
  const [pendenteLocalId, setPendenteLocalId] = useState<string | null>(null);

  useEffect(() => {
    if (!COMUNIDADE_ATIVA) return;
    listarRegistros()
      .then(setRegistros)
      .catch((e) => setErroRegistros(mensagemErro(e)));
  }, []);

  // Depois de entrar, continua o "registrar lanche" que o usuário tinha iniciado.
  useEffect(() => {
    if (usuario && pendenteLocalId) {
      setRegistroLocalId(pendenteLocalId);
      setPendenteLocalId(null);
    }
  }, [usuario, pendenteLocalId]);

  const registrosPorLocal = useMemo(() => {
    const m = new Map<string, Registro[]>();
    for (const r of registros) {
      const lista = m.get(r.localId);
      if (lista) lista.push(r);
      else m.set(r.localId, [r]);
    }
    return m;
  }, [registros]);

  const resultados: LocalResultado[] = useMemo(() => {
    const q = normalizar(busca);
    const menor = (l: LocalResultado) => Math.min(...l.itens.map((i) => i.preco), ...l.regs.map((r) => r.preco));
    return dados.locais
      .map((l) => {
        const itens = (q ? l.itens.filter((i) => normalizar(i.item).includes(q)) : [...l.itens]).sort((a, b) =>
          a.item.localeCompare(b.item, "pt-BR")
        );
        const todos = registrosPorLocal.get(l.id) ?? [];
        const regs = q ? todos.filter((r) => normalizar(r.item).includes(q)) : todos;
        const notas = todos.map((r) => r.nota).filter((n): n is number => n !== null);
        const mediaNota = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null;
        const dist = origem ? haversine(origem.lat, origem.lon, l.lat, l.lon) : null;
        return { ...l, itens, regs, totalRegs: todos.length, mediaNota, dist };
      })
      .filter((l) => l.itens.length > 0 || l.regs.length > 0)
      .sort((a, b) => {
        if (ordem === "dist") {
          if (a.dist !== null && b.dist !== null) return a.dist - b.dist;
          return a.nome.localeCompare(b.nome, "pt-BR");
        }
        return menor(a) - menor(b);
      });
  }, [busca, origem, ordem, registrosPorLocal]);

  // Menor preço de cada item da coleta entre os locais exibidos (para destacar o mais barato).
  const menorPorItem = useMemo(() => {
    const m = new Map<string, { min: number; n: number }>();
    for (const l of resultados)
      for (const i of l.itens) {
        const atual = m.get(i.item);
        m.set(i.item, { min: Math.min(atual?.min ?? Infinity, i.preco), n: (atual?.n ?? 0) + 1 });
      }
    return m;
  }, [resultados]);

  // Sugestões do formulário: itens oficiais + itens já registrados pela comunidade.
  const sugestoes = useMemo(
    () => [...new Set([...ITENS_OFICIAIS, ...registros.map((r) => r.item)])].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [registros]
  );

  // Ao selecionar (na lista ou no mapa), rola a lista até o card.
  useEffect(() => {
    if (selecionado) document.getElementById("card-" + selecionado)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selecionado]);

  const usarGps = () => {
    setErroGps(null);
    if (!("geolocation" in navigator)) {
      setErroGps("Seu navegador não oferece localização. Escolha um bloco na lista.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => setOrigem({ lat: p.coords.latitude, lon: p.coords.longitude, rotulo: "Minha localização" }),
      () => setErroGps("Não foi possível obter sua localização. Escolha um bloco na lista."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const escolherBloco = (id: string) => {
    const b = dados.blocos.find((x) => x.id === id);
    setOrigem(b ? { lat: b.lat, lon: b.lon, rotulo: b.nome, blocoId: b.id } : null);
  };

  const linkRota = (l: LocalResultado) =>
    "https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=" +
    `${l.lat},${l.lon}` +
    (origem ? `&origin=${origem.lat},${origem.lon}` : "");

  const abrirRegistro = useCallback(
    (localId: string) => {
      setSelecionado(localId);
      if (usuario) setRegistroLocalId(localId);
      else {
        setPendenteLocalId(localId);
        setAuthAberto("entrar");
      }
    },
    [usuario]
  );

  const salvarRegistro = async (r: NovoRegistro) => {
    if (!usuario) throw new Error("Entre na sua conta para registrar.");
    const novo = await criarRegistro(r, usuario.id);
    setRegistros((atual) => [novo, ...atual]);
    setRegistroLocalId(null);
  };

  const apagarRegistro = async (id: string) => {
    if (!confirm("Excluir este registro?")) return;
    try {
      await excluirRegistro(id);
      setRegistros((atual) => atual.filter((r) => r.id !== id));
    } catch (e) {
      alert(mensagemErro(e));
    }
  };

  const localDoRegistro = dados.locais.find((l) => l.id === registroLocalId);

  return (
    <div className="layout">
      <aside className="painel">
        <div className="painel-topo">
          <div className="topo-linha">
            <h1>🍴 Lanches na UFAL</h1>
            {COMUNIDADE_ATIVA && (
              <div className="conta">
                {usuario ? (
                  <>
                    <span title="Você está logado">👤 {usuario.apelido}</span>
                    <button className="btn-link" onClick={() => sair()}>
                      Sair
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn-link" onClick={() => setAuthAberto("entrar")}>
                      Entrar
                    </button>
                    <button className="btn-mini" onClick={() => setAuthAberto("criar")}>
                      Criar conta
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <input
            className="busca"
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar lanche (ex.: coxinha, café, água)"
            aria-label="Buscar lanche"
          />
          <div className="chips">
            {ATALHOS.map((a) => (
              <button key={a} className="chip" onClick={() => setBusca(a)}>
                {a}
              </button>
            ))}
            {busca && (
              <button className="chip" onClick={() => setBusca("")}>
                ✕ limpar
              </button>
            )}
          </div>
          <div className="linha">
            <button onClick={usarGps} className={origem?.rotulo === "Minha localização" ? "ativo" : ""}>
              📍 Minha localização
            </button>
            <select aria-label="Estou perto de" value={origem?.blocoId ?? ""} onChange={(e) => escolherBloco(e.target.value)}>
              <option value="">{origem?.rotulo === "Minha localização" ? "Ou escolha um bloco…" : "Estou perto de…"}</option>
              {[...dados.blocos]
                .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nome}
                  </option>
                ))}
            </select>
            <select aria-label="Ordenar" value={ordem} onChange={(e) => setOrdem(e.target.value as "dist" | "preco")}>
              <option value="dist">Ordenar: mais perto</option>
              <option value="preco">Ordenar: mais barato</option>
            </select>
            <button className={mostrarBlocos ? "ativo" : ""} onClick={() => setMostrarBlocos((v) => !v)}>
              🏢 Blocos
            </button>
          </div>
          {erroGps && <p className="msg-erro">{erroGps}</p>}
          {erroRegistros && <p className="msg-erro">Não foi possível carregar os registros da comunidade: {erroRegistros}</p>}
          <p className="resumo">
            {resultados.length} {resultados.length === 1 ? "local" : "locais"}
            {origem ? ` · distâncias a partir de: ${origem.rotulo}` : " · escolha onde você está para ver as distâncias"}
          </p>
        </div>

        <div className="lista">
          {resultados.length === 0 && <p className="vazio">Nenhum local vende “{busca}”. Tente outro nome.</p>}
          {resultados.map((l) => {
            const aberto = l.id === selecionado;
            const mostrarRegs = (aberto || busca.trim() !== "") && l.regs.length > 0;
            return (
              <div key={l.id} id={"card-" + l.id} className={"card" + (aberto ? " sel" : "")} onClick={() => setSelecionado(l.id)}>
                <div className="card-topo">
                  <span className="card-nome">{l.nome}</span>
                  {l.dist !== null && (
                    <span className="card-dist">
                      {formatarDistancia(l.dist)} · ~{minutosAPe(l.dist)} min a pé
                    </span>
                  )}
                </div>
                <div className="card-sub">
                  Perto de {l.blocoMaisProximo} ({formatarDistancia(l.distBlocoM)})
                </div>

                {l.itens.length > 0 && (
                  <div className="itens">
                    {l.itens.map((i) => {
                      const ref = menorPorItem.get(i.item);
                      const barato = ref !== undefined && ref.n > 1 && i.preco === ref.min;
                      return (
                        <div key={i.item} style={{ display: "contents" }}>
                          <span>{i.item}</span>
                          <span
                            className={"preco" + (barato ? " mais-barato" : "")}
                            title={barato ? "Menor preço entre os locais exibidos" : undefined}
                          >
                            {reais(i.preco)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {COMUNIDADE_ATIVA && l.totalRegs > 0 && (
                  <div className="comunidade-resumo">
                    💬 {l.totalRegs} {l.totalRegs === 1 ? "registro" : "registros"} da comunidade
                    {l.mediaNota !== null && (
                      <>
                        {" · "}
                        <Estrelas nota={l.mediaNota} /> {l.mediaNota.toFixed(1).replace(".", ",")}
                      </>
                    )}
                  </div>
                )}

                {mostrarRegs && (
                  <div className="regs">
                    {l.regs.map((r) => (
                      <div key={r.id} className="reg">
                        <div className="reg-topo">
                          <strong>{r.item}</strong>
                          <span className="preco">{reais(r.preco)}</span>
                        </div>
                        {r.nota !== null && <Estrelas nota={r.nota} />}
                        {r.review && <p className="reg-texto">“{r.review}”</p>}
                        <div className="reg-rodape">
                          {r.apelido} · {new Date(r.criadoEm).toLocaleDateString("pt-BR")}
                          {usuario?.id === r.userId && (
                            <button
                              className="btn-link perigo"
                              onClick={(e) => {
                                e.stopPropagation();
                                apagarRegistro(r.id);
                              }}
                            >
                              Excluir
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="acoes">
                  <a className="rota" href={linkRota(l)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                    Como chegar →
                  </a>
                  {COMUNIDADE_ATIVA && (
                    <button
                      className="btn-mini"
                      onClick={(e) => {
                        e.stopPropagation();
                        abrirRegistro(l.id);
                      }}
                    >
                      ➕ Registrar lanche
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <p className="aviso">
            Preços da coleta: {new Date(dados.coletadoEm + "T12:00:00").toLocaleDateString("pt-BR")}, por alunos da UFAL (projeto de
            Probabilidade e Estatística). Podem ter mudado. Os registros da comunidade são feitos por usuários e não são verificados.
            Verde = menor preço do item (coleta) entre os locais exibidos. Distâncias em linha reta; o tempo a pé é aproximado.
          </p>
        </div>
      </aside>

      <section className="mapa-area">
        <Mapa
          locais={resultados}
          blocos={dados.blocos}
          mostrarBlocos={mostrarBlocos}
          origem={origem}
          selecionado={selecionado}
          onSelect={setSelecionado}
          onRegistrar={COMUNIDADE_ATIVA ? abrirRegistro : undefined}
        />
      </section>

      {authAberto && (
        <AuthModal
          modoInicial={authAberto}
          onFechar={() => {
            setAuthAberto(null);
            setPendenteLocalId(null);
          }}
          onSucesso={() => setAuthAberto(null)}
        />
      )}
      {registroLocalId && localDoRegistro && (
        <RegistroModal
          localId={localDoRegistro.id}
          localNome={localDoRegistro.nome}
          sugestoes={sugestoes}
          onSalvar={salvarRegistro}
          onFechar={() => setRegistroLocalId(null)}
        />
      )}
    </div>
  );
}
