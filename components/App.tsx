"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as TecladoEvento, type PointerEvent as PonteiroEvento } from "react";
import { flushSync } from "react-dom";
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

type Folha = "min" | "meio" | "cheio";
const ORDEM_FOLHA: Folha[] = ["cheio", "meio", "min"];
const PICO_PX = 96; // altura visível da lista recolhida
const ehMobile = () => typeof window !== "undefined" && window.matchMedia("(max-width: 800px)").matches;
const VISIVEL_CSS: Record<Folha, string> = {
  min: `${PICO_PX}px`,
  meio: "50dvh",
  cheio: "calc(100dvh - 132px - env(safe-area-inset-top))", // = --altura-folha no CSS
};
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
  const [menuConta, setMenuConta] = useState(false);

  // Lista "gaveta" no celular: recolhida / meio / cheia (arrastável)
  const [folha, setFolha] = useState<Folha>("meio");
  const folhaRef = useRef<HTMLElement | null>(null);
  const alturaFolha = () => folhaRef.current?.offsetHeight ?? window.innerHeight * 0.88;
  const visivelPx = (f: Folha) => (f === "min" ? PICO_PX : f === "meio" ? window.innerHeight * 0.5 : alturaFolha());
  const offsetPx = (f: Folha) => alturaFolha() - visivelPx(f);
  const arrasto = useRef<{ y0: number; off0: number; yUlt: number; tUlt: number; v: number; moveu: boolean } | null>(null);

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

  // Ao selecionar (na lista ou no mapa): no celular, a gaveta vai para o meio; depois rola até o card.
  useEffect(() => {
    if (!selecionado) return;
    if (ehMobile()) setFolha("meio");
    const t = setTimeout(
      () => document.getElementById("card-" + selecionado)?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
      ehMobile() ? 280 : 0
    );
    return () => clearTimeout(t);
  }, [selecionado]);

  // ----- Arrastar a gaveta (só celular) -----
  const aoComecarArrasto = (ev: PonteiroEvento<HTMLDivElement>) => {
    if (!ehMobile() || !folhaRef.current) return;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    folhaRef.current.classList.add("arrastando");
    arrasto.current = { y0: ev.clientY, off0: offsetPx(folha), yUlt: ev.clientY, tUlt: performance.now(), v: 0, moveu: false };
  };
  const aoArrastar = (ev: PonteiroEvento<HTMLDivElement>) => {
    const a = arrasto.current;
    if (!a || !folhaRef.current) return;
    const dy = ev.clientY - a.y0;
    if (Math.abs(dy) > 4) a.moveu = true;
    const off = Math.min(offsetPx("min"), Math.max(0, a.off0 + dy));
    folhaRef.current.style.transform = `translateY(${off}px)`;
    const agora = performance.now();
    a.v = (ev.clientY - a.yUlt) / (agora - a.tUlt + 1);
    a.yUlt = ev.clientY;
    a.tUlt = agora;
  };
  const aoSoltar = (ev: PonteiroEvento<HTMLDivElement>) => {
    const a = arrasto.current;
    const el = folhaRef.current;
    arrasto.current = null;
    if (!a || !el) return;
    let alvo: Folha;
    if (!a.moveu) {
      alvo = folha === "min" ? "meio" : folha === "meio" ? "cheio" : "meio"; // toque simples alterna
    } else {
      const atual = Math.min(offsetPx("min"), Math.max(0, a.off0 + (ev.clientY - a.y0)));
      alvo = ORDEM_FOLHA.reduce((melhor, f) => (Math.abs(offsetPx(f) - atual) < Math.abs(offsetPx(melhor) - atual) ? f : melhor));
      if (Math.abs(a.v) > 0.5) {
        const i = ORDEM_FOLHA.indexOf(folha);
        alvo = ORDEM_FOLHA[Math.min(2, Math.max(0, i + (a.v > 0 ? 1 : -1)))];
      }
    }
    // Reativa a animação, aplica o novo estado e só então solta a posição do dedo (para o "encaixe" ser suave).
    el.classList.remove("arrastando");
    flushSync(() => setFolha(alvo));
    el.style.transform = "";
  };
  const aoTeclaFolha = (e: TecladoEvento<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setFolha((f) => (f === "cheio" ? "meio" : f === "meio" ? "min" : "cheio"));
    }
  };

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

  const inicial = usuario ? usuario.apelido.charAt(0).toUpperCase() : "";

  return (
    <div className="layout" style={{ ["--folha-visivel" as string]: VISIVEL_CSS[folha] } as CSSProperties}>
      <header className="barra-topo">
        <h1 className="titulo so-desktop">🍴 Lanches na UFAL</h1>
        <div className="linha-busca">
          <div className="busca-wrap">
            <span className="lupa" aria-hidden="true">
              🔍
            </span>
            <input
              className="busca"
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar lanche (coxinha, café…)"
              aria-label="Buscar lanche"
              enterKeyHint="search"
              autoComplete="off"
            />
            {busca && (
              <button className="limpar" onClick={() => setBusca("")} aria-label="Limpar busca">
                ✕
              </button>
            )}
          </div>
          {COMUNIDADE_ATIVA &&
            (usuario ? (
              <div className="conta-wrap">
                <button className="avatar" onClick={() => setMenuConta((v) => !v)} aria-label={`Conta de ${usuario.apelido}`}>
                  {inicial}
                </button>
                {menuConta && (
                  <div className="menu-conta" onClick={() => setMenuConta(false)}>
                    <span className="menu-nome">👤 {usuario.apelido}</span>
                    <button className="btn-link" onClick={() => sair()}>
                      Sair da conta
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="conta-botoes">
                <button className="btn-entrar" onClick={() => setAuthAberto("entrar")}>
                  Entrar / Criar conta
                </button>
              </div>
            ))}
        </div>

        <div className="chips-scroll">
          <button className={"chip" + (origem?.rotulo === "Minha localização" ? " ativo" : "")} onClick={usarGps}>
            📍 Perto de mim
          </button>
          <select
            className={"chip chip-select" + (origem?.blocoId ? " ativo" : "")}
            aria-label="Estou perto de"
            value={origem?.blocoId ?? ""}
            onChange={(e) => escolherBloco(e.target.value)}
          >
            <option value="">{origem?.rotulo === "Minha localização" ? "📌 Ou um bloco…" : "📌 Estou perto de…"}</option>
            {[...dados.blocos]
              .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nome}
                </option>
              ))}
          </select>
          <button className="chip" onClick={() => setOrdem((o) => (o === "dist" ? "preco" : "dist"))}>
            ↕ {ordem === "dist" ? "Mais perto" : "Mais barato"}
          </button>
          <button className={"chip" + (mostrarBlocos ? " ativo" : "")} onClick={() => setMostrarBlocos((v) => !v)}>
            🏢 Blocos
          </button>
          <span className="chips-sep" aria-hidden="true" />
          {ATALHOS.map((a) => (
            <button key={a} className={"chip chip-item" + (normalizar(busca) === normalizar(a) ? " ativo" : "")} onClick={() => setBusca(a)}>
              {a}
            </button>
          ))}
        </div>
        {erroGps && <p className="msg-erro balao">{erroGps}</p>}
        {erroRegistros && <p className="msg-erro balao">Não foi possível carregar os registros da comunidade: {erroRegistros}</p>}
      </header>

      <aside ref={folhaRef} className={"folha folha-" + folha}>
        <div
          className="folha-cabeca"
          onPointerDown={aoComecarArrasto}
          onPointerMove={aoArrastar}
          onPointerUp={aoSoltar}
          onPointerCancel={aoSoltar}
          onKeyDown={aoTeclaFolha}
          role="button"
          tabIndex={0}
          aria-label="Arraste para abrir ou fechar a lista"
        >
          <span className="alca" aria-hidden="true" />
          <p className="resumo">
            <strong>
              {resultados.length} {resultados.length === 1 ? "local" : "locais"}
            </strong>
            {origem ? ` · a partir de: ${origem.rotulo}` : " · toque em “Perto de mim” para ver as distâncias"}
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
