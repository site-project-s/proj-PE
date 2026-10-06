"use client";

import "leaflet/dist/leaflet.css";
import { divIcon, type DivIcon } from "leaflet";
import { useEffect } from "react";
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
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

/** Pin no estilo "gota" (como o do Google Maps). A ponta de baixo fica exatamente sobre a coordenada. */
const iconesPin = new Map<string, DivIcon>();
function iconePin(selecionado: boolean, mobile: boolean): DivIcon {
  const chave = `${selecionado}-${mobile}`;
  const guardado = iconesPin.get(chave);
  if (guardado) return guardado;
  const w = (selecionado ? 32 : 24) + (mobile ? 4 : 0);
  const h = Math.round((w * 32) / 24);
  const cor = selecionado ? "#f59e0b" : "#1f4e79";
  const furo = selecionado ? "#7c2d12" : "#ffffff";
  const icone = divIcon({
    className: selecionado ? "pin pin-sel" : "pin",
    html:
      `<svg width="${w}" height="${h}" viewBox="0 0 24 32" aria-hidden="true">` +
      `<path d="M12 .8C5.8.8.8 5.8.8 12c0 8.4 11.2 19.2 11.2 19.2S23.2 20.4 23.2 12C23.2 5.8 18.2.8 12 .8z" fill="${cor}" stroke="#fff" stroke-width="1.6"/>` +
      `<circle cx="12" cy="12" r="4.4" fill="${furo}"/></svg>`,
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
    popupAnchor: [0, -h + 4],
    tooltipAnchor: [0, -h + 6],
  });
  iconesPin.set(chave, icone);
  return icone;
}

const ehMobile = () => typeof window !== "undefined" && window.matchMedia("(max-width: 800px)").matches;

/** Enquadra o mapa nos locais exibidos sempre que o conjunto muda (ex.: depois de uma busca). */
function Enquadrar({ locais }: { locais: LocalResultado[] }) {
  const map = useMap();
  const chave = locais.map((l) => l.id).sort().join("|");
  useEffect(() => {
    if (locais.length === 0) return;
    const pontos = locais.map((l) => [l.lat, l.lon] as [number, number]);
    if (ehMobile()) {
      // No celular, a barra de busca cobre o topo e a lista cobre a metade de baixo.
      map.fitBounds(pontos, {
        paddingTopLeft: [30, 130],
        paddingBottomRight: [30, Math.round(window.innerHeight * 0.5) + 10],
        maxZoom: 18,
      });
    } else {
      map.fitBounds(pontos, { padding: [50, 50], maxZoom: 18 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, map]);
  return null;
}

/** Voa até o local selecionado; no celular, deixa o ponto na metade de cima (a lista cobre a de baixo). */
function VoarPara({ local }: { local?: LocalResultado }) {
  const map = useMap();
  const id = local?.id;
  useEffect(() => {
    if (!local) return;
    const zoom = Math.max(map.getZoom(), 18);
    let alvo = map.unproject(map.project([local.lat, local.lon], zoom), zoom);
    if (ehMobile()) {
      const deslocamento = map.getSize().y * 0.22;
      alvo = map.unproject(map.project([local.lat, local.lon], zoom).add([0, deslocamento]), zoom);
    }
    map.flyTo(alvo, zoom, { duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, map]);
  return null;
}

export default function Mapa({ locais, blocos, mostrarBlocos, origem, selecionado, onSelect, onRegistrar }: Props) {
  const mobile = ehMobile();
  return (
    <MapContainer center={[-9.5555, -35.7745]} zoom={16} style={{ height: "100%", width: "100%" }} zoomControl={!mobile}>
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
            radius={mobile ? 6 : 5}
            pathOptions={{ color: "#555", fillColor: "#999", fillOpacity: 0.8, weight: 1 }}
          >
            <Tooltip>{b.nome}</Tooltip>
          </CircleMarker>
        ))}

      {locais.map((l) => {
        const sel = l.id === selecionado;
        return (
          <Marker
            key={l.id}
            position={[l.lat, l.lon]}
            icon={iconePin(sel, mobile)}
            zIndexOffset={sel ? 1000 : 0}
            title={l.nome}
            eventHandlers={{ click: () => onSelect(l.id) }}
          >
            {/* No celular, o nome aparece sobre o pin selecionado e os detalhes ficam na lista. */}
            {mobile && sel && (
              <Tooltip permanent direction="top" offset={[0, 0]}>
                {l.nome}
              </Tooltip>
            )}
            {!mobile && (
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
            )}
          </Marker>
        );
      })}

      {origem && (
        <CircleMarker
          center={[origem.lat, origem.lon]}
          radius={8}
          pathOptions={{ color: "#fff", fillColor: "#e53935", fillOpacity: 0.95, weight: 3 }}
        >
          <Tooltip permanent direction="top">
            {origem.rotulo}
          </Tooltip>
        </CircleMarker>
      )}
    </MapContainer>
  );
}
