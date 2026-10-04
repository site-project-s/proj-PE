"use client";

import { useState, type FormEvent } from "react";
import type { NovoRegistro } from "../lib/comunidade";
import { mensagemErro } from "../lib/comunidade";
import Modal from "./Modal";

type Props = {
  localId: string;
  localNome: string;
  sugestoes: string[];
  onSalvar: (r: NovoRegistro) => Promise<void>;
  onFechar: () => void;
};

export default function RegistroModal({ localId, localNome, sugestoes, onSalvar, onFechar }: Props) {
  const [item, setItem] = useState("");
  const [preco, setPreco] = useState("");
  const [nota, setNota] = useState<number | null>(null);
  const [review, setReview] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const valor = Number(preco.replace(",", "."));
    if (item.trim().length < 2) return setErro("Informe o nome do lanche.");
    if (!Number.isFinite(valor) || valor <= 0 || valor > 500) return setErro("Informe um preço válido (ex.: 6,50).");

    setEnviando(true);
    try {
      await onSalvar({
        localId,
        item: item.trim(),
        preco: Math.round(valor * 100) / 100,
        nota,
        review: review.trim() === "" ? null : review.trim(),
      });
    } catch (err) {
      setErro(mensagemErro(err));
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={`Registrar lanche — ${localNome}`} onFechar={onFechar}>
      <form onSubmit={enviar} className="form">
        <label>
          Lanche
          <input value={item} onChange={(e) => setItem(e.target.value)} list="sugestoes-itens" maxLength={60} placeholder="ex.: Tapioca de queijo" required />
          <datalist id="sugestoes-itens">
            {sugestoes.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label>
          Preço (R$)
          <input value={preco} onChange={(e) => setPreco(e.target.value)} inputMode="decimal" placeholder="6,50" required />
        </label>
        <div>
          <span className="rotulo">Nota (opcional)</span>
          <div className="estrelas-input" role="radiogroup" aria-label="Nota de 1 a 5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                type="button"
                key={n}
                className={nota !== null && n <= nota ? "on" : ""}
                onClick={() => setNota(nota === n ? null : n)}
                aria-label={`${n} ${n === 1 ? "estrela" : "estrelas"}`}
                aria-pressed={nota === n}
              >
                ★
              </button>
            ))}
          </div>
        </div>
        <label>
          Review (opcional)
          <textarea value={review} onChange={(e) => setReview(e.target.value)} maxLength={300} rows={3} placeholder="Como estava? Vale o preço?" />
          <span className="miudo">{review.length}/300</span>
        </label>
        {erro && <p className="msg-erro">{erro}</p>}
        <button className="btn-primario" disabled={enviando}>
          {enviando ? "Salvando…" : "Salvar registro"}
        </button>
        <p className="miudo">Seu apelido e a data aparecem junto ao registro. Você pode excluí-lo depois.</p>
      </form>
    </Modal>
  );
}
