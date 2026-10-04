"""Gera data/lanches.json a partir da planilha, do KML e do script de análise.
Uso (na raiz do projeto): python scripts/exportar_dados.py"""
import json, math, os
from pathlib import Path
import pandas as pd
from analise_distancia_preco_ufal import parse_kml, classify_kml_points

AQUI = Path(__file__).resolve().parent
XLSX = AQUI / "fonte" / "base_mestra_UFAL_precos_estatistica.xlsx"
KML = AQUI / "fonte" / "PROJETO PROB E ESTATISTICA (2).kml"
SAIDA = AQUI.parent / "data" / "lanches.json"

def haversine_m(a, b, c, d):
    R = 6371000; p1, p2 = math.radians(a), math.radians(c)
    dphi, dl = p2 - p1, math.radians(d - b)
    h = math.sin(dphi/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*R*math.asin(math.sqrt(h))

df = pd.read_excel(XLSX)
kml_all, blocos = classify_kml_points(parse_kml(str(KML)), df["local_planilha"].unique())

# Nomes de blocos repetidos no KML (ex.: dois pontos "COMUNICAÇÃO SOCIAL") recebem (1), (2)...
from collections import Counter
cont = Counter(blocos.nome_kml)
visto = Counter()
lista_blocos = []
for r in blocos.itertuples():
    visto[r.nome_kml] += 1
    rotulo = r.nome_kml if cont[r.nome_kml] == 1 else f"{r.nome_kml} ({visto[r.nome_kml]})"
    lista_blocos.append({"id": f"B{len(lista_blocos) + 1:02d}", "nome": rotulo, "lat": r.latitude, "lon": r.longitude})

locais = []
for nome, g in df.groupby("local_planilha"):
    lat, lon = float(g.latitude.iloc[0]), float(g.longitude.iloc[0])
    b = min(lista_blocos, key=lambda x: haversine_m(lat, lon, x["lat"], x["lon"]))
    locais.append({
        "id": g.id_local.iloc[0], "nome": nome, "lat": lat, "lon": lon,
        "blocoMaisProximo": b["nome"],
        "distBlocoM": round(haversine_m(lat, lon, b["lat"], b["lon"])),
        "itens": [{"item": r.item, "preco": float(r.preco)} for r in g.sort_values("item").itertuples()],
    })

saida = {
    "coletadoEm": str(df.data_coleta.iloc[0].date()),
    "locais": locais,
    "blocos": lista_blocos,
}
SAIDA.parent.mkdir(parents=True, exist_ok=True)
json.dump(saida, open(SAIDA, "w", encoding="utf8"), ensure_ascii=False, indent=1)
print(len(locais), "locais;", sum(len(l["itens"]) for l in locais), "preços;", len(lista_blocos), "blocos")
