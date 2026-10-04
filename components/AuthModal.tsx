"use client";

import { useState, type FormEvent } from "react";
import { criarConta, entrar, mensagemErro } from "../lib/comunidade";
import Modal from "./Modal";

type Props = { modoInicial: "entrar" | "criar"; onFechar: () => void; onSucesso: () => void };

export default function AuthModal({ modoInicial, onFechar, onSucesso }: Props) {
  const [modo, setModo] = useState<"entrar" | "criar">(modoInicial);
  const [apelido, setApelido] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setInfo(null);

    if (modo === "criar") {
      if (!/^[A-Za-z0-9_.-]{3,20}$/.test(apelido)) {
        setErro("Apelido: 3 a 20 caracteres, só letras, números, ponto, hífen ou _ (sem espaços ou acentos).");
        return;
      }
      if (senha.length < 8) {
        setErro("A senha precisa ter pelo menos 8 caracteres.");
        return;
      }
    }

    setEnviando(true);
    try {
      if (modo === "criar") {
        const { precisaConfirmar } = await criarConta(email.trim(), senha, apelido);
        if (precisaConfirmar) {
          setInfo("Conta criada! Enviamos um e-mail de confirmação. Clique no link e depois use “Entrar”.");
          setModo("entrar");
          setSenha("");
          return;
        }
      } else {
        await entrar(email.trim(), senha);
      }
      onSucesso();
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={modo === "criar" ? "Criar conta" : "Entrar"} onFechar={onFechar}>
      <form onSubmit={enviar} className="form">
        {modo === "criar" && (
          <label>
            Apelido (aparece nos seus registros)
            <input value={apelido} onChange={(e) => setApelido(e.target.value)} maxLength={20} autoComplete="nickname" required />
          </label>
        )}
        <label>
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label>
          Senha
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete={modo === "criar" ? "new-password" : "current-password"}
            minLength={modo === "criar" ? 8 : undefined}
            required
          />
        </label>
        {erro && <p className="msg-erro">{erro}</p>}
        {info && <p className="msg-ok">{info}</p>}
        <button className="btn-primario" disabled={enviando}>
          {enviando ? "Aguarde…" : modo === "criar" ? "Criar conta" : "Entrar"}
        </button>
        <p className="troca">
          {modo === "criar" ? "Já tem conta?" : "Ainda não tem conta?"}{" "}
          <button type="button" className="btn-link" onClick={() => { setModo(modo === "criar" ? "entrar" : "criar"); setErro(null); }}>
            {modo === "criar" ? "Entrar" : "Criar conta"}
          </button>
        </p>
        <p className="miudo">Seu e-mail não aparece para ninguém: só o apelido é público.</p>
      </form>
    </Modal>
  );
}
