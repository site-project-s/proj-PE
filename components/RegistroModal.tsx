"use client";

import { useState, type FormEvent } from "react";
import type { NovoRegistro } from "../lib/comunidade";
import { mensagemErro } from "../lib/comunidade";
import { iconeItem } from "../lib/itens";
import { validarRegistro } from "../lib/seguranca";
import Modal from "./Modal";

type Props = {
  localId: string;
  localNome: string;
  idsConhecidos: string[];
  sugestoes: string[];
  onSalvar: (r: NovoRegistro) => Promise<void>;
  onFechar: () => void;
};

const ROTULOS_NOTA = ["", "Ruim", "Mais ou menos", "Bom", "Muito bom", "Excelente!"];

export default function RegistroModal({ localId, localNome, idsConhecidos, sugestoes, onSalvar, onFechar }: Props) {
  const [item, setItem] = useState("");
  const [preco, setPreco] = useState("");
  const [nota, setNota] = useState<number | null>(null);
  const [review, setReview] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const limpo = validarRegistro({ localId, item, preco, nota, review }, idsConhecidos);
      await onSalvar(limpo);
    } catch (err) {
      setErro(mensagemErro(err));
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Registrar lanche" onFechar={onFechar}>
      <p className="modal-sub">📍 {localNome}</p>
      <form onSubmit={enviar} className="form">
        <label>
          O que você comeu ou bebeu? {item && <span aria-hidden="true">{iconeItem(item)}</span>}
          <input value={item} onChange={(e) => setItem(e.target.value)} list="sugestoes-itens" maxLength={60} placeholder="ex.: Tapioca de queijo" autoComplete="off" required />
          <datalist id="sugestoes-itens">
            {sugestoes.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label>
          Quanto custou? (R$)
          <input value={preco} onChange={(e) => setPreco(e.target.value)} inputMode="decimal" placeholder="6,50" maxLength={7} autoComplete="off" required />
        </label>
        <div>
          <span className="rotulo">Sua nota (opcional)</span>
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
            {nota !== null && <span className="nota-rotulo">{ROTULOS_NOTA[nota]}</span>}
          </div>
        </div>
        <label>
          Conte como foi (opcional)
          <textarea value={review} onChange={(e) => setReview(e.target.value)} maxLength={300} rows={3} placeholder="Estava fresquinho? Vale o preço?" />
          <span className="miudo">{review.length}/300 · sem links, por favor</span>
        </label>
        {erro && <p className="msg-erro" role="alert">{erro}</p>}
        <button className="btn-primario" disabled={enviando}>
          {enviando ? "Salvando…" : "Salvar registro"}
        </button>
        <p className="miudo">Seu apelido e a data aparecem junto ao registro. Você pode excluí-lo depois.</p>
      </form>
    </Modal>
  );
}
