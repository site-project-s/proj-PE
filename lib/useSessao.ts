"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Usuario } from "./types";

/** Acompanha o usuário logado. `usuario` é null se não estiver logado. */
export function useSessao(): { usuario: Usuario | null; carregando: boolean } {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState<boolean>(supabase !== null);

  useEffect(() => {
    const sb = supabase;
    if (!sb) return;
    const paraUsuario = (user: { id: string; user_metadata?: Record<string, unknown> } | null | undefined): Usuario | null =>
      user ? { id: user.id, apelido: String(user.user_metadata?.apelido ?? "aluno") } : null;

    sb.auth.getSession().then(({ data }) => {
      setUsuario(paraUsuario(data.session?.user));
      setCarregando(false);
    });
    const { data } = sb.auth.onAuthStateChange((_evento, sessao) => {
      setUsuario(paraUsuario(sessao?.user));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return { usuario, carregando };
}
