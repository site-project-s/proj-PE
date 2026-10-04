"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import { reais } from "../lib/geo";
import type { Bloco, LocalResultado, Origem } from "../lib/types";

type Props = {
  locais: LocalResultado[];
  blocos: Bloco[];
  mostrarBlocos: boolean;
  origem: Origem | null;
  selecionado: string | null;
  onSelect: (id: string) => void;
  onRegistrar?: (id: string) => void; // ausente quando as contas não estão configuradas
};

/** Enquadra o mapa nos locais exibidos sempre que o conjunto muda (ex.: depois de uma busca). */
function Enquadrar({ locais }: { locais: LocalResultado[] }) {
  const map = useMap();
  const chave = locais.map((l) => l.id).sort().join("|");
  useEffect(() => {
    if (locais.length === 0) return;
    map.fitBounds(
      locais.map((l) => [l.lat, l.lon] as [number, number]),
      { padding: [50, 50], maxZoom: 18 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, map]);
  return null;
}

/** Voa até o local selecionado na lista. */
function VoarPara({ local }: { local?: LocalResultado }) {
  const map = useMap();
  const id = local?.id;
  useEffect(() => {
    if (local) map.flyTo([local.lat, local.lon], Math.max(map.getZoom(), 18), { duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, map]);
  return null;
}

export default function Mapa({ locais, blocos, mostrarBlocos, origem, selecionado, onSelect, onRegistrar }: Props) {
  return (
    <MapContainer center={[-9.5555, -35.7745]} zoom={16} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <Enquadrar locais={locais} />
      <VoarPara local={locais.find((l) => l.id === selecionado)} />

      {mostrarBlocos &&
        blocos.map((b) => (
          <CircleMarker
            key={b.id}
            center={[b.lat, b.lon]}
            radius={5}
            pathOptions={{ color: "#555", fillColor: "#999", fillOpacity: 0.8, weight: 1 }}
          >
            <Tooltip>{b.nome}</Tooltip>
          </CircleMarker>
        ))}

      {locais.map((l) => {
        const sel = l.id === selecionado;
        return (
          <CircleMarker
            key={l.id}
            center={[l.lat, l.lon]}
            radius={sel ? 13 : 9}
            pathOptions={{
              color: sel ? "#b45309" : "#1f4e79",
              fillColor: sel ? "#f59e0b" : "#2e74b5",
              fillOpacity: 0.85,
              weight: 2,
            }}
            eventHandlers={{ click: () => onSelect(l.id) }}
          >
            <Popup>
              <strong>{l.nome}</strong>
              {l.itens.map((i) => (
                <div key={i.item}>
                  {i.item}: {reais(i.preco)}
                </div>
              ))}
              {l.totalRegs > 0 && (
                <div style={{ marginTop: 4, color: "#555" }}>
                  💬 {l.totalRegs} {l.totalRegs === 1 ? "registro" : "registros"} da comunidade
                  {l.mediaNota !== null && ` · ★ ${l.mediaNota.toFixed(1).replace(".", ",")}`}
                </div>
              )}
              {onRegistrar && (
                <button className="btn-popup" onClick={() => onRegistrar(l.id)}>
                  ➕ Registrar lanche aqui
                </button>
              )}
            </Popup>
          </CircleMarker>
        );
      })}

      {origem && (
        <CircleMarker
          center={[origem.lat, origem.lon]}
          radius={8}
          pathOptions={{ color: "#b00020", fillColor: "#e53935", fillOpacity: 0.9, weight: 2 }}
        >
          <Tooltip permanent direction="top">
            {origem.rotulo}
          </Tooltip>
        </CircleMarker>
      )}
    </MapContainer>
  );
}
