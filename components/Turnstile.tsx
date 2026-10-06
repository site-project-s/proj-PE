"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

const CHAVE = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
/** true quando a chave do Cloudflare Turnstile foi configurada (anti-robô no login e cadastro). */
export const TURNSTILE_ATIVO = Boolean(CHAVE);
const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type Props = { onToken: (token: string | null) => void; resetKey: number };

export default function Turnstile({ onToken, resetKey }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!CHAVE) return;
    let cancelado = false;
    let script: HTMLScriptElement | null = null;

    const montar = () => {
      if (cancelado || !ref.current || !window.turnstile || widgetId.current) return;
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey: CHAVE,
        theme: "light",
        language: "pt-br",
        callback: (token: string) => onToken(token),
        "expired-callback": () => onToken(null),
        "error-callback": () => onToken(null),
      });
    };

    if (window.turnstile) montar();
    else {
      script = document.querySelector<HTMLScriptElement>("script[data-turnstile]");
      if (!script) {
        script = document.createElement("script");
        script.src = SRC;
        script.async = true;
        script.defer = true;
        script.dataset.turnstile = "1";
        document.head.appendChild(script);
      }
      script.addEventListener("load", montar);
    }

    return () => {
      cancelado = true;
      script?.removeEventListener("load", montar);
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cada token só vale uma vez: depois de cada tentativa o formulário pede um novo.
  useEffect(() => {
    if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
  }, [resetKey]);

  if (!CHAVE) return null;
  return <div ref={ref} className="turnstile" />;
}
