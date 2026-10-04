#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Análise Estatística Exploratória e Espacial dos Preços de Alimentação
no Campus A.C. Simões (UFAL)

Objetivo principal:
avaliar, de forma exploratória, a associação entre o preço dos alimentos
e a distância dos pontos de venda ao bloco/prédio mais próximo.

IMPORTANTE:
- Associação/correlação não implica causalidade.
- O R.U. não é usado como referência central da distância.
- Não são removidos automaticamente valores extremos.
"""

from pathlib import Path
import re
import sys
import math
import unicodedata
import warnings
import xml.etree.ElementTree as ET

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from scipy import stats

# ============================================================
# CONFIGURAÇÃO — altere apenas estes nomes/caminhos se necessário
# ============================================================
INPUT_XLSX = "base_mestra_UFAL_precos_estatistica.xlsx"
INPUT_KML = "PROJETO PROB E ESTATISTICA (2).kml"
OUTPUT_DIR_NAME = "resultados_distancia_preco"

# Se os arquivos estiverem na mesma pasta do .py, não é preciso alterar.
# Também é possível informar caminhos absolutos nos dois parâmetros acima.

# Regras conservadoras para identificar pontos que NÃO devem ser usados
# como referências de blocos/prédios.
EXPLICIT_NON_BUILDING = {
    "UFAL", "ESTADIO", "PISTA ATLETISMO", "R.U", "R. U"
}

# Nomes/padrões que, quando presentes no KML, caracterizam ponto de venda
# e não bloco/prédio de referência. A lista é usada apenas para classificação
# dos Placemark; os nomes originais nunca são alterados.
SALE_NAME_PATTERNS = [
    "lanche", "barraca", "coco", "sabor", "passaporte", "pitstop",
    "ninha", "unilanches", "univerprint", "foufAl", "dentro fanut",
    "ichica"
]

# ============================================================
# UTILITÁRIOS
# ============================================================

def norm_text(value):
    """Normalização segura apenas para comparação de nomes."""
    if pd.isna(value):
        return ""
    s = str(value).strip()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.upper()
    s = re.sub(r"[\u2013\u2014]", "-", s)
    s = re.sub(r"[^A-Z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def haversine_m(lat1, lon1, lat2, lon2):
    """Distância geodésica aproximada em metros."""
    lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat / 2.0) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2.0) ** 2
    return 2 * 6371008.8 * np.arcsin(np.sqrt(a))


def valid_latlon(lat, lon):
    return pd.notna(lat) and pd.notna(lon) and -90 <= float(lat) <= 90 and -180 <= float(lon) <= 180


def fmt_p(p):
    if pd.isna(p):
        return "NA"
    if p < 0.001:
        return "<0,001"
    return f"{p:.4f}".replace(".", ",")


def fmt_num(x, digits=3):
    if pd.isna(x):
        return "NA"
    return f"{x:.{digits}f}".replace(".", ",")


def association_direction(coef, name="associação"):
    if pd.isna(coef):
        return "não calculável"
    if coef > 0:
        return f"{name} positiva"
    if coef < 0:
        return f"{name} negativa"
    return f"{name} nula"


def statistical_sentence(coef, p, kind):
    if pd.isna(coef) or pd.isna(p):
        return f"Não foi possível calcular a correlação de {kind}."
    direction = "positiva" if coef > 0 else "negativa" if coef < 0 else "nula"
    if p < 0.05:
        return (
            f"Foi observada associação {direction} estatisticamente significativa "
            f"(coeficiente={coef:.3f}, p={p:.4f}). Isso descreve associação, "
            f"não causalidade."
        )
    return (
        f"Foi observada associação {direction}, mas não houve evidência estatística "
        f"suficiente de associação ao nível de 5% (coeficiente={coef:.3f}, p={p:.4f})."
    )


# ============================================================
# DETECÇÃO AUTOMÁTICA DE COLUNAS
# ============================================================

def find_column(columns, aliases, required=True):
    norm_cols = {norm_text(c): c for c in columns}
    matches = []
    for alias in aliases:
        a = norm_text(alias)
        if a in norm_cols:
            matches.append(norm_cols[a])
    # Uma mesma coluna pode corresponder a aliases equivalentes após
    # normalização (por exemplo, "preco" e "preço"). Removemos apenas
    # duplicidades do resultado, sem alterar o nome real da coluna.
    matches = list(dict.fromkeys(matches))
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        raise ValueError(f"Mais de uma coluna corresponde a {aliases}: {matches}")
    if required:
        raise ValueError(
            "Não foi possível identificar automaticamente a coluna. "
            f"Esperava uma das formas: {aliases}. Colunas encontradas: {list(columns)}"
        )
    return None


def detect_columns(df):
    cols = df.columns.tolist()
    mapping = {
        "local": find_column(cols, ["local_planilha", "local", "nome_local", "ponto_venda"]),
        "item": find_column(cols, ["item", "produto", "produto_item"]),
        "preco": find_column(cols, ["preco", "preço", "valor", "preco_r$"]),
        "latitude": find_column(cols, ["latitude", "lat"]),
        "longitude": find_column(cols, ["longitude", "lon", "lng"]),
    }
    return mapping


# ============================================================
# LEITURA DO KML
# ============================================================

def parse_kml(kml_path):
    ns = {"k": "http://www.opengis.net/kml/2.2"}
    tree = ET.parse(kml_path)
    root = tree.getroot()
    rows = []

    for p in root.findall(".//k:Placemark", ns):
        name_el = p.find("k:name", ns)
        coord_el = p.find(".//k:coordinates", ns)
        name = name_el.text.strip() if name_el is not None and name_el.text else ""
        raw = coord_el.text.strip() if coord_el is not None and coord_el.text else ""

        if not raw:
            rows.append({"nome_kml": name, "latitude": np.nan, "longitude": np.nan,
                         "altitude": np.nan, "tipo_geometria": "sem_coordenada"})
            continue

        # O primeiro par é suficiente para pontos. Para o Placemark UFAL,
        # há um polígono e ele não será usado como bloco.
        first = raw.split()[0]
        parts = first.split(",")
        try:
            lon = float(parts[0])
            lat = float(parts[1])
            alt = float(parts[2]) if len(parts) > 2 else np.nan
        except (ValueError, IndexError):
            lon = lat = alt = np.nan

        geom = "point" if len(raw.split()) == 1 else "multi_coordinate"
        rows.append({
            "nome_kml": name,
            "latitude": lat,
            "longitude": lon,
            "altitude": alt,
            "tipo_geometria": geom
        })

    return pd.DataFrame(rows)


def classify_kml_points(kml_df, sale_names):
    sale_norm = {norm_text(x) for x in sale_names}
    records = []

    for _, row in kml_df.iterrows():
        name = row["nome_kml"]
        n = norm_text(name)

        if not valid_latlon(row["latitude"], row["longitude"]):
            tipo = "sem coordenada válida"
        elif row["tipo_geometria"] != "point":
            tipo = "limite/geom. não pontual"
        elif n in {norm_text(x) for x in EXPLICIT_NON_BUILDING}:
            if n in {norm_text("R.U"), norm_text("R. U")}:
                tipo = "R.U. — excluído das referências por regra do projeto"
            else:
                tipo = "estrutura não predial / referência não utilizada"
        elif n in sale_norm:
            tipo = "ponto de venda"
        elif any(pat in n.lower() for pat in [norm_text(x).lower() for x in SALE_NAME_PATTERNS]):
            tipo = "provável ponto de venda"
        else:
            # O KML não fornece uma tag semântica confiável para "prédio".
            # Portanto, classificamos os demais pontos acadêmicos nomeados
            # como candidatos a referência predial, deixando a regra explícita.
            tipo = "candidato a bloco/prédio"

        records.append({**row.to_dict(), "classificacao": tipo})

    out = pd.DataFrame(records)

    # Apenas candidatos prediais explícitos após as exclusões acima.
    building_mask = out["classificacao"].eq("candidato a bloco/prédio")
    buildings = out.loc[building_mask].copy()
    return out, buildings


# ============================================================
# AUDITORIA
# ============================================================

def audit_data(df, cols, kml_all, buildings):
    print("\n" + "=" * 72)
    print("AUDITORIA DOS ARQUIVOS")
    print("=" * 72)
    print(f"Planilha: {len(df)} linhas, {len(df.columns)} colunas")
    print(f"Abas lidas: Base_Mestra, quando disponível")
    print("Colunas identificadas automaticamente:")
    for role, col in cols.items():
        print(f"  {role:12s} -> {col}")

    print(f"\nKML: {len(kml_all)} Placemark(s)")
    print(f"Candidatos a blocos/prédios usados como referência: {len(buildings)}")

    numeric = df.copy()
    for role in ["preco", "latitude", "longitude"]:
        numeric[cols[role]] = pd.to_numeric(numeric[cols[role]], errors="coerce")

    print("\nValidação:")
    print(f"  Preços não numéricos/nulos: {numeric[cols['preco']].isna().sum()}")
    print(f"  Latitudes inválidas/nulas: {sum(~numeric.apply(lambda r: valid_latlon(r[cols['latitude']], r[cols['longitude']]), axis=1))}")
    print(f"  Duplicidades exatas: {numeric.duplicated().sum()}")
    print(f"  Locais únicos: {numeric[cols['local']].nunique()}")
    print(f"  Itens únicos: {numeric[cols['item']].nunique()}")

    print("\nClassificação dos Placemark do KML:")
    print(kml_all["classificacao"].value_counts(dropna=False).to_string())

    print("\nCorrespondências planilha ↔ KML:")
    kml_norm = {}
    for name in kml_all["nome_kml"].dropna():
        kml_norm.setdefault(norm_text(name), []).append(name)

    for local in sorted(numeric[cols["local"]].astype(str).unique()):
        matches = kml_norm.get(norm_text(local), [])
        if matches:
            print(f"  [OK] {local} -> {matches}")
        else:
            print(f"  [--] {local} -> não encontrado por normalização segura")

    print("\nPontos do KML sem correspondência com os locais da planilha:")
    sheet_norm = {norm_text(x) for x in numeric[cols["local"]].astype(str)}
    unmatched = []
    for name in kml_all["nome_kml"].dropna().unique():
        if norm_text(name) not in sheet_norm:
            unmatched.append(name)
    for x in unmatched:
        print(f"  - {x}")


# ============================================================
# DISTÂNCIAS
# ============================================================

def compute_distances(df, cols, buildings):
    work = df.copy()
    work["_preco_num"] = pd.to_numeric(work[cols["preco"]], errors="coerce")
    work["_lat_num"] = pd.to_numeric(work[cols["latitude"]], errors="coerce")
    work["_lon_num"] = pd.to_numeric(work[cols["longitude"]], errors="coerce")

    valid_buildings = buildings[
        buildings.apply(lambda r: valid_latlon(r["latitude"], r["longitude"]), axis=1)
    ].copy()

    if valid_buildings.empty:
        raise ValueError("Nenhum bloco/prédio com coordenadas válidas foi identificado.")

    ref_lat = valid_buildings["latitude"].to_numpy(dtype=float)
    ref_lon = valid_buildings["longitude"].to_numpy(dtype=float)
    ref_names = valid_buildings["nome_kml"].astype(str).to_numpy()

    nearest, second, mean_dist, nearest_name = [], [], [], []

    for _, r in work.iterrows():
        if not valid_latlon(r["_lat_num"], r["_lon_num"]):
            nearest.append(np.nan)
            second.append(np.nan)
            mean_dist.append(np.nan)
            nearest_name.append("")
            continue

        d = haversine_m(r["_lat_num"], r["_lon_num"], ref_lat, ref_lon)
        d = np.asarray(d, dtype=float)
        order = np.argsort(d)

        nearest.append(float(d[order[0]]))
        second.append(float(d[order[1]]) if len(d) > 1 else np.nan)
        mean_dist.append(float(np.mean(d)))
        nearest_name.append(str(ref_names[order[0]]))

    work["bloco_mais_proximo"] = nearest_name
    work["distancia_bloco_mais_proximo_m"] = nearest
    work["segunda_distancia_bloco_m"] = second
    work["distancia_media_aos_blocos_m"] = mean_dist

    # Remove colunas auxiliares somente depois dos cálculos.
    return work


def aggregate_by_local(work, cols):
    valid = work.dropna(subset=["_preco_num", "distancia_bloco_mais_proximo_m"]).copy()

    agg = (
        valid.groupby(cols["local"], dropna=False)
        .agg(
            quantidade_produtos=(cols["item"], "count"),
            preco_medio=("_preco_num", "mean"),
            preco_mediano=("_preco_num", "median"),
            desvio_padrao=("_preco_num", lambda x: x.std(ddof=1) if len(x) > 1 else 0.0),
            minimo=("_preco_num", "min"),
            maximo=("_preco_num", "max"),
            distancia_bloco_mais_proximo_m=("distancia_bloco_mais_proximo_m", "first"),
            bloco_mais_proximo=("bloco_mais_proximo", "first"),
            segunda_distancia_bloco_m=("segunda_distancia_bloco_m", "first"),
            distancia_media_aos_blocos_m=("distancia_media_aos_blocos_m", "first"),
            latitude=(cols["latitude"], "first"),
            longitude=(cols["longitude"], "first"),
        )
        .reset_index()
        .rename(columns={cols["local"]: "local"})
    )
    return agg


# ============================================================
# ESTATÍSTICA DESCRITIVA
# ============================================================

def descriptive_stats(series):
    s = pd.to_numeric(series, errors="coerce").dropna()
    if len(s) == 0:
        return pd.Series(dtype=float)

    mean = s.mean()
    return pd.Series({
        "n": len(s),
        "media": mean,
        "mediana": s.median(),
        "minimo": s.min(),
        "maximo": s.max(),
        "amplitude": s.max() - s.min(),
        "Q1": s.quantile(0.25),
        "Q3": s.quantile(0.75),
        "IQR": s.quantile(0.75) - s.quantile(0.25),
        "desvio_padrao": s.std(ddof=1) if len(s) > 1 else 0.0,
        "coeficiente_variacao": (s.std(ddof=1) / mean * 100) if len(s) > 1 and mean != 0 else np.nan,
        "assimetria": s.skew() if len(s) > 2 else np.nan,
    })


def detect_outliers_iqr(series):
    s = pd.to_numeric(series, errors="coerce").dropna()
    if len(s) < 4:
        return pd.Series([], dtype=float)
    q1, q3 = s.quantile([0.25, 0.75])
    iqr = q3 - q1
    low, high = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    return s[(s < low) | (s > high)]


# ============================================================
# CORRELAÇÕES
# ============================================================

def correlations(x, y):
    z = pd.DataFrame({"x": x, "y": y}).dropna()
    n = len(z)
    if n < 3 or z["x"].nunique() < 2 or z["y"].nunique() < 2:
        return {
            "n": n,
            "pearson_r": np.nan, "pearson_p": np.nan,
            "spearman_rho": np.nan, "spearman_p": np.nan
        }

    pr, pp = stats.pearsonr(z["x"], z["y"])
    sr, sp = stats.spearmanr(z["x"], z["y"])
    return {
        "n": n,
        "pearson_r": pr, "pearson_p": pp,
        "spearman_rho": sr, "spearman_p": sp
    }


# ============================================================
# GRÁFICOS
# ============================================================

def plot_individual(work, outpath):
    d = work.dropna(subset=["_preco_num", "distancia_bloco_mais_proximo_m"]).copy()
    fig, ax = plt.subplots(figsize=(10, 7))
    sns.scatterplot(
        data=d, x="distancia_bloco_mais_proximo_m", y="_preco_num",
        s=55, alpha=0.70, ax=ax
    )

    if len(d) >= 2 and d["distancia_bloco_mais_proximo_m"].nunique() > 1:
        lr = stats.linregress(d["distancia_bloco_mais_proximo_m"], d["_preco_num"])
        xs = np.linspace(d["distancia_bloco_mais_proximo_m"].min(),
                         d["distancia_bloco_mais_proximo_m"].max(), 200)
        ys = lr.intercept + lr.slope * xs
        ax.plot(xs, ys, linewidth=2, label=f"Tendência linear: y = {lr.slope:.4f}x + {lr.intercept:.3f}")
        ax.legend()

        r = lr.rvalue
        ax.text(
            0.02, 0.97,
            f"Pearson r = {r:.3f}\nR² = {r**2:.3f}",
            transform=ax.transAxes, va="top",
            bbox=dict(boxstyle="round,pad=0.3", alpha=0.8)
        )

    ax.set_title("Preço × distância até o bloco/prédio mais próximo")
    ax.set_xlabel("Distância até o bloco/prédio mais próximo (m)")
    ax.set_ylabel("Preço (R$)")
    ax.grid(alpha=0.2)
    fig.tight_layout()
    fig.savefig(outpath, dpi=300, bbox_inches="tight")
    plt.close(fig)


def plot_aggregate(agg, outpath):
    d = agg.dropna(subset=["preco_medio", "distancia_bloco_mais_proximo_m"]).copy()
    fig, ax = plt.subplots(figsize=(11, 8))
    sns.scatterplot(
        data=d, x="distancia_bloco_mais_proximo_m", y="preco_medio",
        size="quantidade_produtos", sizes=(50, 220), alpha=0.75,
        legend=True, ax=ax
    )

    if len(d) >= 2 and d["distancia_bloco_mais_proximo_m"].nunique() > 1:
        lr = stats.linregress(d["distancia_bloco_mais_proximo_m"], d["preco_medio"])
        xs = np.linspace(d["distancia_bloco_mais_proximo_m"].min(),
                         d["distancia_bloco_mais_proximo_m"].max(), 200)
        ax.plot(xs, lr.intercept + lr.slope * xs, linewidth=2,
                label="Tendência linear")
        ax.legend()

    for _, r in d.iterrows():
        label = str(r["local"])
        ax.annotate(label, (r["distancia_bloco_mais_proximo_m"], r["preco_medio"]),
                    xytext=(5, 5), textcoords="offset points", fontsize=8)

    ax.set_title("Preço médio por local × distância até o bloco/prédio mais próximo")
    ax.set_xlabel("Distância até o bloco/prédio mais próximo (m)")
    ax.set_ylabel("Preço médio por local (R$)")
    ax.grid(alpha=0.2)
    fig.tight_layout()
    fig.savefig(outpath, dpi=300, bbox_inches="tight")
    plt.close(fig)


def plot_heatmap(agg, outpath):
    numeric_cols = [
        "preco_medio", "preco_mediano", "desvio_padrao",
        "quantidade_produtos", "distancia_bloco_mais_proximo_m",
        "segunda_distancia_bloco_m", "distancia_media_aos_blocos_m"
    ]
    numeric_cols = [c for c in numeric_cols if c in agg.columns]
    matrix = agg[numeric_cols].corr(method="pearson")

    labels = {
        "preco_medio": "Preço médio",
        "preco_mediano": "Preço mediano",
        "desvio_padrao": "Desvio-padrão",
        "quantidade_produtos": "Nº de produtos",
        "distancia_bloco_mais_proximo_m": "Distância ao bloco mais próximo",
        "segunda_distancia_bloco_m": "2ª distância ao bloco",
        "distancia_media_aos_blocos_m": "Distância média aos blocos",
    }
    matrix = matrix.rename(index=labels, columns=labels)

    fig, ax = plt.subplots(figsize=(11, 9))
    sns.heatmap(
        matrix, vmin=-1, vmax=1, cmap="coolwarm",
        annot=True, fmt=".2f", square=True, linewidths=0.5,
        cbar_kws={"label": "Correlação de Pearson"}, ax=ax
    )
    ax.set_title("Heatmap de correlação — variáveis agregadas por local")
    fig.tight_layout()
    fig.savefig(outpath, dpi=300, bbox_inches="tight")
    plt.close(fig)
    return matrix


def plot_spatial(kml_all, buildings, agg, outpath):
    vendors = agg.dropna(subset=["longitude", "latitude"]).copy()
    refs = buildings.dropna(subset=["longitude", "latitude"]).copy()

    fig, ax = plt.subplots(figsize=(12, 10))

    # Blocos/prédios de referência.
    ax.scatter(refs["longitude"], refs["latitude"], marker="^", s=55,
               alpha=0.75, label="Blocos/prédios de referência")

    # Pontos de venda: cor = preço médio, tamanho = distância ao bloco mais próximo.
    if not vendors.empty:
        sizes = np.clip(vendors["distancia_bloco_mais_proximo_m"].fillna(0) * 0.08 + 35, 35, 250)
        sc = ax.scatter(
            vendors["longitude"], vendors["latitude"],
            c=vendors["preco_medio"], s=sizes,
            cmap="viridis", alpha=0.85, edgecolors="black", linewidths=0.4,
            label="Pontos de venda"
        )
        cbar = fig.colorbar(sc, ax=ax)
        cbar.set_label("Preço médio por local (R$)")

        for _, r in vendors.iterrows():
            ax.annotate(
                str(r["local"]), (r["longitude"], r["latitude"]),
                xytext=(5, 5), textcoords="offset points", fontsize=7
            )

    # Rótulos dos blocos somente se o número for manejável.
    if len(refs) <= 45:
        for _, r in refs.iterrows():
            ax.annotate(
                str(r["nome_kml"]), (r["longitude"], r["latitude"]),
                xytext=(4, -8), textcoords="offset points", fontsize=6, alpha=0.75
            )

    ax.set_title(
        "Mapa espacial exploratório — preço médio nos pontos de venda\n"
        "Tamanho do ponto ≈ distância ao bloco/prédio mais próximo"
    )
    ax.set_xlabel("Longitude")
    ax.set_ylabel("Latitude")
    ax.legend(loc="best")
    ax.grid(alpha=0.2)
    fig.tight_layout()
    fig.savefig(outpath, dpi=300, bbox_inches="tight")
    plt.close(fig)


# ============================================================
# EXPORTAÇÃO
# ============================================================

def build_output_tables(work, agg, cols):
    output = work.copy()

    rename = {
        cols["local"]: "local",
        cols["item"]: "item",
        cols["preco"]: "preco",
        cols["latitude"]: "latitude",
        cols["longitude"]: "longitude",
    }
    output = output.rename(columns=rename)

    # Mantém as demais variáveis originais e acrescenta as calculadas.
    helper_cols = ["_preco_num", "_lat_num", "_lon_num"]
    output = output.drop(columns=[c for c in helper_cols if c in output.columns])

    preferred = [
        "local", "item", "preco", "latitude", "longitude",
        "bloco_mais_proximo", "distancia_bloco_mais_proximo_m",
        "segunda_distancia_bloco_m", "distancia_media_aos_blocos_m"
    ]
    existing = [c for c in preferred if c in output.columns]
    rest = [c for c in output.columns if c not in existing]
    output = output[existing + rest]
    return output


def save_correlations(individual_corr, aggregate_corr, outpath):
    rows = [
        {
            "analise": "individual/produto",
            "metodo": "Pearson",
            "coeficiente": individual_corr["pearson_r"],
            "p_valor": individual_corr["pearson_p"],
            "n": individual_corr["n"]
        },
        {
            "analise": "individual/produto",
            "metodo": "Spearman",
            "coeficiente": individual_corr["spearman_rho"],
            "p_valor": individual_corr["spearman_p"],
            "n": individual_corr["n"]
        },
        {
            "analise": "agregada/local",
            "metodo": "Pearson",
            "coeficiente": aggregate_corr["pearson_r"],
            "p_valor": aggregate_corr["pearson_p"],
            "n": aggregate_corr["n"]
        },
        {
            "analise": "agregada/local",
            "metodo": "Spearman",
            "coeficiente": aggregate_corr["spearman_rho"],
            "p_valor": aggregate_corr["spearman_p"],
            "n": aggregate_corr["n"]
        },
    ]
    pd.DataFrame(rows).to_csv(outpath, index=False, encoding="utf-8-sig")


def write_report(path, df, work, agg, kml_all, buildings, individual_corr, aggregate_corr,
                 price_stats, distance_stats, price_outliers, distance_outliers, heat_matrix, local_col):
    lines = []
    lines.append("=" * 78)
    lines.append("RELATÓRIO — ANÁLISE DISTÂNCIA × PREÇO")
    lines.append("=" * 78)
    lines.append("")
    lines.append("Objetivo: investigar associação entre distância dos pontos de venda")
    lines.append("aos blocos/prédios e preços dos alimentos no Campus A.C. Simões (UFAL).")
    lines.append("")
    lines.append("NOTA: os resultados são associativos/exploratórios. Correlação não")
    lines.append("implica causalidade.")
    lines.append("")
    lines.append("1. AUDITORIA E COBERTURA DOS DADOS")
    lines.append(f"- Observações na planilha: {len(df)}")
    lines.append(f"- Locais com dados de preço: {work[local_col].nunique()}")
    lines.append(f"- Locais na análise agregada: {len(agg)}")
    lines.append(f"- Observações individuais usadas nas correlações: {individual_corr['n']}")
    lines.append(f"- Placemark no KML: {len(kml_all)}")
    lines.append(f"- Blocos/prédios de referência usados: {len(buildings)}")
    lines.append("")
    lines.append("2. BLOCOS/PRÉDIOS IDENTIFICADOS")
    for n in buildings["nome_kml"].tolist():
        lines.append(f"- {n}")
    lines.append("")
    lines.append("O R.U. foi excluído como referência de distância, conforme a regra")
    lines.append("do projeto, e não foi usado como centro obrigatório da análise.")
    lines.append("")
    lines.append("3. ESTATÍSTICA DESCRITIVA")
    lines.append("")
    lines.append("PREÇO — observações individuais:")
    for k, v in price_stats.items():
        lines.append(f"- {k}: {fmt_num(v, 3) if isinstance(v, (float, np.floating)) else v}")
    lines.append("")
    lines.append("DISTÂNCIA AO BLOCO MAIS PRÓXIMO — observações individuais:")
    for k, v in distance_stats.items():
        lines.append(f"- {k}: {fmt_num(v, 3) if isinstance(v, (float, np.floating)) else v}")
    lines.append("")
    lines.append("Possíveis outliers pelo critério 1,5×IQR (não removidos):")
    lines.append(f"- Preços: {len(price_outliers)} observação(ões)")
    if len(price_outliers):
        lines.append("  Valores: " + ", ".join(f"{x:.2f}" for x in price_outliers.tolist()))
    lines.append(f"- Distâncias: {len(distance_outliers)} observação(ões)")
    if len(distance_outliers):
        lines.append("  Valores: " + ", ".join(f"{x:.2f}" for x in distance_outliers.tolist()))
    lines.append("")
    lines.append("4. CORRELAÇÕES — DADOS INDIVIDUAIS/PRODUTO")
    lines.append(f"- Pearson r = {individual_corr['pearson_r']:.6f}" if pd.notna(individual_corr["pearson_r"]) else "- Pearson r = NA")
    lines.append(f"- Pearson p = {individual_corr['pearson_p']:.6g}" if pd.notna(individual_corr["pearson_p"]) else "- Pearson p = NA")
    lines.append(f"- Spearman rho = {individual_corr['spearman_rho']:.6f}" if pd.notna(individual_corr["spearman_rho"]) else "- Spearman rho = NA")
    lines.append(f"- Spearman p = {individual_corr['spearman_p']:.6g}" if pd.notna(individual_corr["spearman_p"]) else "- Spearman p = NA")
    lines.append(f"- n = {individual_corr['n']}")
    lines.append("")
    lines.append(statistical_sentence(individual_corr["pearson_r"], individual_corr["pearson_p"], "Pearson"))
    lines.append(statistical_sentence(individual_corr["spearman_rho"], individual_corr["spearman_p"], "Spearman"))
    lines.append("")
    lines.append("5. CORRELAÇÕES — DADOS AGREGADOS POR LOCAL")
    lines.append(f"- Pearson r = {aggregate_corr['pearson_r']:.6f}" if pd.notna(aggregate_corr["pearson_r"]) else "- Pearson r = NA")
    lines.append(f"- Pearson p = {aggregate_corr['pearson_p']:.6g}" if pd.notna(aggregate_corr["pearson_p"]) else "- Pearson p = NA")
    lines.append(f"- Spearman rho = {aggregate_corr['spearman_rho']:.6f}" if pd.notna(aggregate_corr["spearman_rho"]) else "- Spearman rho = NA")
    lines.append(f"- Spearman p = {aggregate_corr['spearman_p']:.6g}" if pd.notna(aggregate_corr["spearman_p"]) else "- Spearman p = NA")
    lines.append(f"- n = {aggregate_corr['n']}")
    lines.append("")
    lines.append(statistical_sentence(aggregate_corr["pearson_r"], aggregate_corr["pearson_p"], "Pearson"))
    lines.append(statistical_sentence(aggregate_corr["spearman_rho"], aggregate_corr["spearman_p"], "Spearman"))
    lines.append("")
    lines.append("6. LIMITAÇÕES E INTERPRETAÇÃO")
    lines.append("- A análise individual contém vários produtos do mesmo local, portanto")
    lines.append("  essas observações compartilham a mesma localização espacial.")
    lines.append("- A análise agregada por local reduz esse problema ao tratar o local")
    lines.append("  como unidade espacial de análise.")
    lines.append("- O estudo é observacional e exploratório; não permite concluir que")
    lines.append("  a distância cause aumento ou redução dos preços.")
    lines.append("- Preços podem também estar relacionados a tipo de produto, estabelecimento,")
    lines.append("  localização específica, concorrência, demanda, custos e mix de produtos.")
    lines.append("- Esses fatores não foram controlados quando os dados não os permitiram.")
    lines.append("- Valores extremos foram sinalizados pelo critério 1,5×IQR, mas não foram")
    lines.append("  removidos automaticamente.")
    lines.append("- A visualização espacial usa pontos, sem interpolação, para evitar criar")
    lines.append("  superfícies artificiais com poucos pontos.")
    lines.append("")
    lines.append("7. HEATMAP")
    lines.append("O heatmap usa correlação de Pearson entre variáveis quantitativas")
    lines.append("agregadas por local. A escala vai de -1 a +1.")
    lines.append("+1 representa associação linear positiva perfeita; 0 indica ausência")
    lines.append("de associação linear; -1 representa associação linear negativa perfeita.")
    lines.append("")
    lines.append("8. CONCLUSÃO")
    lines.append(
        "A resposta à pergunta de pesquisa deve ser formulada a partir dos coeficientes "
        "e respectivos p-valores acima. A análise informa se os dados apresentam "
        "evidência de associação entre distância e preço, mas não estabelece causalidade."
    )
    lines.append("")
    lines.append("Arquivo gerado automaticamente pelo script Python.")
    path.write_text("\n".join(lines), encoding="utf-8")


# ============================================================
# PRINCIPAL
# ============================================================

def main():
    warnings.filterwarnings("ignore", category=RuntimeWarning)

    base_dir = Path(__file__).resolve().parent
    xlsx_path = Path(INPUT_XLSX)
    kml_path = Path(INPUT_KML)

    if not xlsx_path.is_absolute():
        xlsx_path = base_dir / xlsx_path
    if not kml_path.is_absolute():
        kml_path = base_dir / kml_path

    outdir = base_dir / OUTPUT_DIR_NAME
    outdir.mkdir(parents=True, exist_ok=True)

    print("=" * 72)
    print("ANÁLISE ESTATÍSTICA E ESPACIAL — UFAL")
    print("=" * 72)
    print(f"XLSX: {xlsx_path}")
    print(f"KML : {kml_path}")
    print(f"Saída: {outdir}")

    # 1) Verificação de arquivos
    if not xlsx_path.exists():
        raise FileNotFoundError(f"Arquivo XLSX não encontrado: {xlsx_path}")
    if not kml_path.exists():
        raise FileNotFoundError(f"Arquivo KML não encontrado: {kml_path}")

    # 2) Leitura completa da planilha principal
    xl = pd.ExcelFile(xlsx_path)
    print("\nAbas encontradas:", ", ".join(xl.sheet_names))

    if "Base_Mestra" in xl.sheet_names:
        df = pd.read_excel(xlsx_path, sheet_name="Base_Mestra")
    else:
        # Fallback: primeira aba, mantendo os nomes reais das colunas.
        df = pd.read_excel(xlsx_path, sheet_name=xl.sheet_names[0])
        print(f"Aviso: aba 'Base_Mestra' não existe; usando '{xl.sheet_names[0]}'.")

    if df.empty:
        raise ValueError("A planilha principal está vazia.")

    cols = detect_columns(df)

    # 3) Conversões e auditoria básica
    df[cols["preco"]] = pd.to_numeric(df[cols["preco"]], errors="coerce")
    df[cols["latitude"]] = pd.to_numeric(df[cols["latitude"]], errors="coerce")
    df[cols["longitude"]] = pd.to_numeric(df[cols["longitude"]], errors="coerce")

    # 4) KML
    kml_all = parse_kml(kml_path)
    if kml_all.empty:
        raise ValueError("Nenhum Placemark foi encontrado no KML.")

    sale_names = df[cols["local"]].dropna().astype(str).unique()
    kml_classified, buildings = classify_kml_points(kml_all, sale_names)

    audit_data(df, cols, kml_classified, buildings)

    if buildings.empty:
        raise ValueError(
            "O KML não permitiu identificar nenhum candidato seguro a bloco/prédio. "
            "Nenhuma distância foi calculada para evitar inventar referências."
        )

    # 5) Distâncias
    work = compute_distances(df, cols, buildings)

    # Validação de cobertura espacial
    n_valid_price = work["_preco_num"].notna().sum()
    n_valid_dist = work["distancia_bloco_mais_proximo_m"].notna().sum()
    print("\nCobertura da análise:")
    print(f"  Preços numéricos: {n_valid_price}/{len(work)}")
    print(f"  Distâncias calculadas: {n_valid_dist}/{len(work)}")
    print(f"  Locais com dados: {work[cols['local']].nunique()}")

    # 6) Agregação por local
    agg = aggregate_by_local(work, cols)

    # 7) Correlações
    individual_corr = correlations(
        work["_preco_num"],
        work["distancia_bloco_mais_proximo_m"]
    )
    aggregate_corr = correlations(
        agg["preco_medio"],
        agg["distancia_bloco_mais_proximo_m"]
    )

    # 8) Descritivas
    price_stats = descriptive_stats(work["_preco_num"])
    distance_stats = descriptive_stats(work["distancia_bloco_mais_proximo_m"])
    price_outliers = detect_outliers_iqr(work["_preco_num"])
    distance_outliers = detect_outliers_iqr(work["distancia_bloco_mais_proximo_m"])

    # 9) Arquivos
    dados_out = build_output_tables(work, agg, cols)
    dados_out.to_excel(outdir / "dados_com_distancias.xlsx", index=False)

    resumo_out = agg.copy()
    resumo_out.to_excel(outdir / "resumo_por_local.xlsx", index=False)

    save_correlations(
        individual_corr, aggregate_corr,
        outdir / "correlacoes.csv"
    )

    plot_individual(work, outdir / "grafico_distancia_preco.png")
    plot_aggregate(agg, outdir / "grafico_distancia_preco_por_local.png")
    heat_matrix = plot_heatmap(agg, outdir / "heatmap_correlacao.png")
    plot_spatial(kml_classified, buildings, agg, outdir / "mapa_precos_distancia.png")

    write_report(
        outdir / "relatorio_distancia_preco.txt",
        df, work, agg, kml_classified, buildings,
        individual_corr, aggregate_corr,
        price_stats, distance_stats, price_outliers, distance_outliers,
        heat_matrix, cols["local"]
    )

    # 10) Resumo final
    print("\n" + "=" * 40)
    print("ANÁLISE DISTÂNCIA × PREÇO")
    print("=" * 40)
    print(f"Observações: {len(work)}")
    print(f"Locais: {work[cols['local']].nunique()}")
    print(f"Itens: {work[cols['item']].nunique()}")
    print(f"Blocos identificados: {len(buildings)}")
    print("\nPearson:")
    print(f"r = {individual_corr['pearson_r']:.6f}" if pd.notna(individual_corr["pearson_r"]) else "r = NA")
    print(f"p = {individual_corr['pearson_p']:.6g}" if pd.notna(individual_corr["pearson_p"]) else "p = NA")
    print("\nSpearman:")
    print(f"rho = {individual_corr['spearman_rho']:.6f}" if pd.notna(individual_corr["spearman_rho"]) else "rho = NA")
    print(f"p = {individual_corr['spearman_p']:.6g}" if pd.notna(individual_corr["spearman_p"]) else "p = NA")
    print("\nAnálise agregada por local:")
    print("\nPearson:")
    print(f"r = {aggregate_corr['pearson_r']:.6f}" if pd.notna(aggregate_corr["pearson_r"]) else "r = NA")
    print(f"p = {aggregate_corr['pearson_p']:.6g}" if pd.notna(aggregate_corr["pearson_p"]) else "p = NA")
    print("\nSpearman:")
    print(f"rho = {aggregate_corr['spearman_rho']:.6f}" if pd.notna(aggregate_corr["spearman_rho"]) else "rho = NA")
    print(f"p = {aggregate_corr['spearman_p']:.6g}" if pd.notna(aggregate_corr["spearman_p"]) else "p = NA")
    print("\nArquivos salvos em:")
    print(outdir.resolve())
    print("=" * 40)

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print("\nERRO:", exc, file=sys.stderr)
        raise
