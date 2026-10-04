export default function Estrelas({ nota }: { nota: number }) {
  const n = Math.round(nota);
  return (
    <span className="estrelas-fixas" role="img" aria-label={`${nota.toFixed(1).replace(".", ",")} de 5`}>
      {"★".repeat(n)}
      <span style={{ color: "#ccc" }}>{"★".repeat(5 - n)}</span>
    </span>
  );
}
