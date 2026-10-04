/** Distância em metros entre dois pontos (fórmula de Haversine). */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const r = Math.PI / 180;
  const h =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Remove acentos e põe em minúsculas, para a busca ignorar "Água" x "agua". */
export function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function reais(v: number): string {
  return "R$ " + v.toFixed(2).replace(".", ",");
}

export function formatarDistancia(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`;
}

/** Minutos a pé, a ~5 km/h (aproximação em linha reta). */
export function minutosAPe(m: number): number {
  return Math.max(1, Math.round(m / 83));
}
