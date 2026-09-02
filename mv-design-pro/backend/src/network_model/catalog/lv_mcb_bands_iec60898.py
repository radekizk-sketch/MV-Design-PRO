"""Pasma wyzwolenia MCB wg IEC 60898-1 (STAŁE NORMATYWNE, G-D4).

Karta P0.6 (nN, docs/nn/H_PLAN_IMPLEMENTACJI_NN.md §P0.6, luka G-D4 —
docs/nn/G_MACIERZ_LUK_BACKENDU_NN.md). Rejestr G-D4: "stałe normatywne w
kodzie z referencją normy" — w odróżnieniu od G-D3/G-D1 (dane z proweniencją
dwuźródłową w osobnym pliku danych) te wartości są DEFINICJĄ klas MCB samej
normy IEC 60898-1 (Tabela 3), nie wielkościami wtórnie wyprowadzonymi —
identyczne w każdej publikacji technicznej dotyczącej MCB.

WHITE BOX: wyzwolenie magnetyczne jest GWARANTOWANE przy GÓRNEJ granicy
pasma (B→5·In, C→10·In, D→20·In) — norma NIE gwarantuje zadziałania przy
dolnej granicy (może, ale nie musi). Użycie dolnej granicy jako progu
zadziałania dawałoby OPTYMISTYCZNY (niebezpieczny) werdykt SWZ — dlatego
``ia_gwarantowane_a`` poniżej używa WYŁĄCZNIE górnej granicy.

Źródła (dwa, niezależne): (1) karta P0.6 zlecenia (wartości B/C/D podane
wprost przez właściciela); (2) WebSearch — ElectGo, „MCB Tripping Curves –
Types B, C, D, K, Z & Characteristics” (electgo.com/resources/
mcb-trip-mcb-connection): „A B-curve 16 A MCB will magnetically trip
somewhere between 48–80 A” (=3–5×In), „C-curve … trips between 80–160 A”
(=5–10×In), „D-curve … trips between 160–320 A” (=10–20×In) — zgodne.
"""

from __future__ import annotations

from dataclasses import dataclass

_KLASY_DOZWOLONE = ("B", "C", "D")


@dataclass(frozen=True)
class PasmoMagnetyczneMcb:
    """Pasmo wyzwolenia magnetycznego (chwilowego) jednej klasy MCB [×In]."""

    klasa: str
    min_x_in: float
    max_x_in: float


# IEC 60898-1 Tabela 3 — pasma wyzwolenia magnetycznego (chwilowego, <0,1 s):
PASMA_MAGNETYCZNE: dict[str, PasmoMagnetyczneMcb] = {
    "B": PasmoMagnetyczneMcb(klasa="B", min_x_in=3.0, max_x_in=5.0),
    "C": PasmoMagnetyczneMcb(klasa="C", min_x_in=5.0, max_x_in=10.0),
    "D": PasmoMagnetyczneMcb(klasa="D", min_x_in=10.0, max_x_in=20.0),
}

# Pasmo cieplne (przeciążeniowe, IEC 60898-1 Tabela 2A/2B): 1,13×In NIE MOŻE
# zadziałać w czasie umownym; 1,45×In MUSI zadziałać w czasie umownym (>1 h
# dla In≤63 A). Niesione dla kompletności rejestru G-D4 — werdykt SWZ tej
# karty ocenia WYŁĄCZNIE próg magnetyczny (jedyny relewantny dla t_wym z Tab.
# 41.1, rzędu 0,1–5 s; próg cieplny działa w czasie GODZIN, poza zakresem
# SWZ). Ścieżka krzywych pełnego przebiegu I-t — P0.7 (G-07).
PROG_CIEPLNY_NIE_WYZWALA_X_IN = 1.13
PROG_CIEPLNY_WYZWALA_X_IN = 1.45


def ia_gwarantowane_a(*, in_a: float, klasa: str) -> float:
    """Prąd Ia GWARANTOWANEGO zadziałania wyzwalacza magnetycznego MCB [A].

    Górna granica pasma klasy (``max_x_in · In``) — jedyny próg z GWARANCJĄ
    zadziałania w czasie chwilowym normy. Raises ``ValueError`` dla nieznanej
    klasy (dozwolone wyłącznie B/C/D wg IEC 60898-1) albo In ≤ 0.
    """
    if klasa not in PASMA_MAGNETYCZNE:
        raise ValueError(
            f"Nieznana klasa wyzwolenia MCB '{klasa}' — dozwolone: "
            f"{', '.join(_KLASY_DOZWOLONE)} (IEC 60898-1)."
        )
    if in_a <= 0:
        raise ValueError(f"in_a musi być dodatnie, otrzymano {in_a}.")
    return PASMA_MAGNETYCZNE[klasa].max_x_in * in_a
