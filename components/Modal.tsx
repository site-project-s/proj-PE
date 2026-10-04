"use client";

import { useEffect, type ReactNode } from "react";

export default function Modal({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: ReactNode }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onFechar]);

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <div className="modal-topo">
          <h2>{titulo}</h2>
          <button className="fechar" onClick={onFechar} aria-label="Fechar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
