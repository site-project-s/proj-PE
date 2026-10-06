"use client";

import { useRef, useState, type FormEvent } from "react";
import { criarConta, entrar, mensagemErro } from "../lib/comunidade";
import { APELIDO_OK } from "../lib/seguranca";
import Modal from "./Modal";
import Turnstile, { TURNSTILE_ATIVO } from "./Turnstile";

type Props = { modoInicial: "entrar" | "criar"; onFechar: () => void; onSucesso: (mensagem: string) => void };

const SENHA_FORTE = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/;

export default function AuthModal({ modoInicial, onFechar, onSucesso }: Props) {
  const [modo, setModo] = useState<"entrar" | "criar">(modoInicial);
  const [apelido, setApelido] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [resetCaptcha, setResetCaptcha] = useState(0);
  const falhas = useRef({ n: 0, ate: 0 }); // freio local (o servidor também limita as tentativas)

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setInfo(null);

    if (Date.now() < falhas.current.ate) {
      setErro("Muitas tentativas seguidas. Aguarde alguns segundos e tente de novo.");
      return;
    }
    if (modo === "criar") {
      if (!APELIDO_OK.test(apelido)) {
        setErro("Apelido: 3 a 20 caracteres, só letras, números, ponto, hífen ou _ (sem espaços ou acentos).");
        return;
      }
      if (!SENHA_FORTE.test(senha)) {
        setErro("A senha precisa ter de 8 a 72 caracteres, com pelo menos uma letra e um número.");
        return;
      }
    }
    if (TURNSTILE_ATIVO && !captcha) {
      setErro("Aguarde a verificação “não sou um robô” terminar e tente de novo.");
      return;
    }

    setEnviando(true);
    try {
      const token = captcha ?? undefined;
      if (modo === "criar") {
        const { precisaConfirmar } = await criarConta(email.trim(), senha, apelido, token);
        if (precisaConfirmar) {
          setInfo("Conta criada! Enviamos um e-mail de confirmação. Clique no link e depois use “Entrar”.");
          setModo("entrar");
          setSenha("");
          return;
        }
        onSucesso(`Conta criada! Bem-vindo(a), ${apelido} 🎉`);
      } else {
        await entrar(email.trim(), senha, token);
        onSucesso("Você entrou na sua conta ✅");
      }
      falhas.current = { n: 0, ate: 0 };
    } catch (err) {
      falhas.current.n += 1;
      if (falhas.current.n >= 5) falhas.current = { n: 0, ate: Date.now() + 30000 };
      setErro(mensagemErro(err));
    } finally {
      setEnviando(false);
      setCaptcha(null); // o token só vale uma vez
      setResetCaptcha((v) => v + 1);
    }
  }

  return (
    <Modal titulo={modo === "criar" ? "Criar conta" : "Entrar"} onFechar={onFechar}>
      <p className="modal-sub">
        {modo === "criar"
          ? "Crie sua conta para registrar preços e avaliar lanches. Leva menos de 1 minuto."
          : "Entre para registrar preços e avaliar lanches."}
      </p>
      <form onSubmit={enviar} className="form">
        {modo === "criar" && (
          <label>
            Apelido (aparece nos seus registros)
            <input value={apelido} onChange={(e) => setApelido(e.target.value)} maxLength={20} autoComplete="nickname" autoCapitalize="none" required />
          </label>
        )}
        <label>
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" maxLength={254} required />
        </label>
        <label>
          Senha
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete={modo === "criar" ? "new-password" : "current-password"}
            minLength={modo === "criar" ? 8 : undefined}
            maxLength={72}
            required
          />
          {modo === "criar" && <span className="miudo">Mínimo 8 caracteres, com letras e números.</span>}
        </label>
        <Turnstile onToken={setCaptcha} resetKey={resetCaptcha} />
        {erro && <p className="msg-erro" role="alert">{erro}</p>}
        {info && <p className="msg-ok" role="status">{info}</p>}
        <button className="btn-primario" disabled={enviando}>
          {enviando ? "Aguarde…" : modo === "criar" ? "Criar conta" : "Entrar"}
        </button>
        <p className="troca">
          {modo === "criar" ? "Já tem conta?" : "Ainda não tem conta?"}{" "}
          <button type="button" className="btn-link" onClick={() => { setModo(modo === "criar" ? "entrar" : "criar"); setErro(null); }}>
            {modo === "criar" ? "Entrar" : "Criar conta"}
          </button>
        </p>
        <p className="miudo">🔒 Seu e-mail não aparece para ninguém: só o apelido é público.</p>
      </form>
    </Modal>
  );
}
