"""
LV Protection Curve Solver — WHITE BOX (MCB / MCCB elektroniczny / wkładka gG)

Karta P0.7 (nN, docs/nn/H_PLAN_IMPLEMENTACJI_NN.md §P0.7, luka G-07 —
docs/nn/G_MACIERZ_LUK_BACKENDU_NN.md).

Trzy rodziny krzywych aparatów nN, KAŻDA Z WŁASNĄ FIZYKĄ (różne normy, różne
mechanizmy wyzwalania — to NIE jest trzecia implementacja formuły IEC 60255 z
`protection_iec60255.py` (N-D4 dotyczy WYŁĄCZNIE dwóch ścieżek TEJ SAMEJ
formuły IDMT — patrz ten moduł); MCB/MCCB/gG mają odrębne, normatywnie
zdefiniowane mechanizmy, których IEC 60255 nie opisuje:

  MCB_THERMAL_MAGNETIC — wyłączniki nadmiarowo-prądowe B/C/D wg IEC 60898-1.
      Dwa NIEZALEŻNE mechanizmy wyzwalania z WŁASNYMI progami normatywnymi:
      cieplny (przeciążeniowy, czas rzędu minut/godzin, progi 1,13/1,45×In)
      i magnetyczny (zwarciowy, czas <0,1 s, pasma 3-5/5-10/10-20×In wg
      klasy). REUSE `network_model.catalog.lv_mcb_bands_iec60898` — JEDNO
      źródło stałych normatywnych (G-D4); ten moduł TYLKO klasyfikuje
      zapytany prąd względem tych stałych, nie definiuje ich powtórnie.

  MCCB_ELECTRONIC — wyłączniki z wyzwalaczem elektronicznym, nastawy
      Ir/Isd/Ii/tr/tsd RESOLWOWANE z katalogu (`LVApparatusType.ir_range` itd.
      — zakres NASTAWIALNOŚCI, nie gotowa nastawa; wywołujący podaje
      KONKRETNĄ wybraną wartość z tego zakresu). Trójstopniowa klasyfikacja
      definite-time (długozwłoczny/krótkozwłoczny/zwarciowy). ZERO
      FABRYKACJI kształtu I²t długozwłocznego — norma IEC 60947-2 nie
      definiuje go jako stałej uniwersalnej (zależy od producenta/rodziny
      wyzwalacza) — stopień długozwłoczny modelowany jako definite-time przy
      nastawionym `tr_s` (założenie NAZWANE w śladzie, nie ukryte).

  FUSE_GG — wkładki topikowe gG wg IEC 60269-1 (G-D2). Bramki I-t: prąd
      umowny nietopliwy Inf=1,25·In i prąd umowny topliwy If=1,6·In (dla
      In>16 A — jedyny zakres obecny w katalogu WKLADKA_NN, 25-250 A), z
      czasem umownym zależnym od zakresu In (1h/2h/3h/4h). Między punktami
      normatywnymi NORMA NIE GWARANTUJE zachowania — wynik jest PASMEM,
      nigdy interpolowaną linią.

ZASADA WSPÓLNA (§0.2 karty P0.7): między punktami/progami zdefiniowanymi
normą TEN SOLVER NIE INTERPOLUJE. Krzywa nN jest PASMEM GWARANCJI NORMY —
zapytanie o zachowanie przy prądzie I zwraca jeden z trzech stanów
(`GwarancjaNormy`): brak zadziałania gwarantowany / zadziałanie gwarantowane
/ nieokreślony (norma nie gwarantuje żadnego z dwóch) — NIGDY fikcyjny
pojedynczy czas wyinterpolowany między dwoma punktami kontrolnymi.

WHITE BOX: każda funkcja zwraca pełny ślad obliczeniowy + cytowaną podstawę
normatywną. ZERO HEURYSTYK.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from network_model.catalog.lv_mcb_bands_iec60898 import (
    PASMA_MAGNETYCZNE,
    PROG_CIEPLNY_NIE_WYZWALA_X_IN,
    PROG_CIEPLNY_WYZWALA_X_IN,
)

# =============================================================================
# SOLVER VERSION
# =============================================================================

PROTECTION_LV_CURVES_SOLVER_VERSION = "1.0.0"


# =============================================================================
# ENUMS
# =============================================================================


class LvCurveFamily(StrEnum):
    """Rodzina krzywej aparatu nN (§0.2 karty P0.7)."""

    MCB_THERMAL_MAGNETIC = "MCB_THERMAL_MAGNETIC"
    MCCB_ELECTRONIC = "MCCB_ELECTRONIC"
    FUSE_GG = "FUSE_GG"


class GwarancjaNormy(StrEnum):
    """Stan gwarancji normy dla zapytanego punktu prąd/czas.

    Krzywa nN to PASMO gwarancji normy, nie linia — norma definiuje TYLKO
    punkty/progi kontrolne. MIĘDZY nimi zachowanie NIE jest zdefiniowane —
    ``NIEOKRESLONY`` jest wtedy JEDYNĄ uczciwą odpowiedzią (zakaz
    interpolacji, §0.2 karty P0.7).
    """

    BRAK_WYZWOLENIA_GWARANTOWANY = "brak_wyzwolenia_gwarantowany"
    WYZWOLENIE_GWARANTOWANE = "wyzwolenie_gwarantowane"
    NIEOKRESLONY = "nieokreslony"
    DANE_NIEKOMPLETNE = "dane_niekompletne"


# =============================================================================
# MCB_THERMAL_MAGNETIC — WYNIK
# =============================================================================


@dataclass(frozen=True)
class McbCurvePointResult:
    """Klasyfikacja zapytanego prądu względem JEDNEGO mechanizmu wyzwalania MCB.

    Attributes:
        family: Zawsze ``LvCurveFamily.MCB_THERMAL_MAGNETIC``.
        mechanizm: ``"cieplny"`` (przeciążeniowy) albo ``"magnetyczny"``
            (zwarciowy, chwilowy) — DWA NIEZALEŻNE mechanizmy MCB, każdy z
            własnymi progami normatywnymi; nie ma jednej "krzywej MCB".
        in_a: Prąd znamionowy aparatu [A].
        curve_class: Klasa wyzwolenia magnetycznego B/C/D (tylko dla
            ``mechanizm="magnetyczny"`` — ``None`` dla cieplnego, bo próg
            cieplny 1,13/1,45×In jest WSPÓLNY dla B/C/D, IEC 60898-1).
        i_query_a: Zapytany prąd [A].
        current_multiple_x_in: I_query / In.
        prog_dolny_a: Dolny próg kontrolny normy [A] (poniżej — brak
            zadziałania gwarantowany w czasie umownym).
        prog_gorny_a: Górny próg kontrolny normy [A] (od niego — zadziałanie
            gwarantowane w czasie umownym).
        gwarancja: Stan gwarancji normy dla ``i_query_a``.
        t_umowny_s: Czas umowny testu normatywnego [s] — GÓRNY limit czasu
            zadziałania przy ``prog_gorny_a`` (``None`` dla mechanizmu
            magnetycznego, gdzie czas jest chwilowy <0,1 s, nie "umowny
            godzinowy").
    """

    family: str
    mechanizm: str
    in_a: float
    curve_class: str | None
    i_query_a: float
    current_multiple_x_in: float
    prog_dolny_a: float
    prog_gorny_a: float
    gwarancja: GwarancjaNormy
    t_umowny_s: float | None
    podstawa_pl: str
    white_box_trace: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "family": self.family,
            "mechanizm": self.mechanizm,
            "in_a": self.in_a,
            "curve_class": self.curve_class,
            "i_query_a": self.i_query_a,
            "current_multiple_x_in": self.current_multiple_x_in,
            "prog_dolny_a": self.prog_dolny_a,
            "prog_gorny_a": self.prog_gorny_a,
            "gwarancja": self.gwarancja.value,
            "t_umowny_s": self.t_umowny_s,
            "podstawa_pl": self.podstawa_pl,
            "white_box_trace": self.white_box_trace,
        }


# Czas umowny testu progu cieplnego MCB wg IEC 60898-1 — In<=63A: 1h;
# In>63A: 2h (wartość normatywna podana wprost w karcie zlecenia P0.7 §0.2a;
# ten sam próg 63 A rozdziela zakresy testu co dla wkładek topikowych
# IEC 60269-1, choć to DWIE RÓŻNE normy — zbieżność progu, nie zapożyczenie).
def _czas_umowny_mcb_s(in_a: float) -> float:
    if in_a <= 0:
        raise ValueError(f"in_a musi być dodatnie, otrzymano {in_a}.")
    return 3600.0 if in_a <= 63.0 else 7200.0


def compute_mcb_thermal_point(*, i_query_a: float, in_a: float) -> McbCurvePointResult:
    """Klasyfikuj zapytany prąd względem progu CIEPLNEGO (przeciążeniowego) MCB.

    IEC 60898-1: prąd umowny nie zadziałania 1,13×In (test bez zadziałania w
    czasie umownym), prąd umowny zadziałania 1,45×In (test z zadziałaniem w
    czasie umownym — In≤63A: 1h, In>63A: 2h). Próg WSPÓLNY dla klas B/C/D —
    element cieplny nie zależy od klasy wyzwolenia magnetycznego.

    Raises:
        ValueError: ``i_query_a < 0`` albo ``in_a <= 0``.
    """
    if in_a <= 0:
        raise ValueError(f"in_a musi być dodatnie, otrzymano {in_a}.")
    if i_query_a < 0:
        raise ValueError(f"i_query_a nie może być ujemne, otrzymano {i_query_a}.")

    prog_dolny = PROG_CIEPLNY_NIE_WYZWALA_X_IN * in_a
    prog_gorny = PROG_CIEPLNY_WYZWALA_X_IN * in_a
    t_umowny = _czas_umowny_mcb_s(in_a)
    x = i_query_a / in_a

    if i_query_a <= prog_dolny:
        gwarancja = GwarancjaNormy.BRAK_WYZWOLENIA_GWARANTOWANY
        wynik_t: float | None = None
        opis = (
            f"I={i_query_a:g} A <= {PROG_CIEPLNY_NIE_WYZWALA_X_IN:g}×In={prog_dolny:g} A — "
            f"norma (IEC 60898-1) gwarantuje BRAK zadziałania elementu cieplnego w czasie "
            f"umownym {t_umowny:g} s."
        )
    elif i_query_a >= prog_gorny:
        gwarancja = GwarancjaNormy.WYZWOLENIE_GWARANTOWANE
        wynik_t = t_umowny
        opis = (
            f"I={i_query_a:g} A >= {PROG_CIEPLNY_WYZWALA_X_IN:g}×In={prog_gorny:g} A — "
            f"norma (IEC 60898-1) gwarantuje zadziałanie elementu cieplnego w czasie "
            f"umownym <= {t_umowny:g} s (dokładny czas w tym przedziale nie jest "
            f"zdefiniowany dwoma punktami kontrolnymi — tylko górna granica)."
        )
    else:
        gwarancja = GwarancjaNormy.NIEOKRESLONY
        wynik_t = None
        opis = (
            f"I={i_query_a:g} A leży MIĘDZY progami kontrolnymi "
            f"({prog_dolny:g}÷{prog_gorny:g} A) — norma (IEC 60898-1) NIE gwarantuje ani "
            f"braku, ani wystąpienia zadziałania elementu cieplnego w tym przedziale "
            f"(zakaz interpolacji, §0.2 karty P0.7)."
        )

    trace: dict[str, Any] = {
        "step": "MCB_THERMAL",
        "standard": "IEC 60898-1",
        "in_a": in_a,
        "i_query_a": i_query_a,
        "current_multiple_x_in": round(x, 6),
        "prog_dolny_a": prog_dolny,
        "prog_gorny_a": prog_gorny,
        "t_umowny_s": t_umowny,
        "gwarancja": gwarancja.value,
        "opis_pl": opis,
    }

    return McbCurvePointResult(
        family=LvCurveFamily.MCB_THERMAL_MAGNETIC.value,
        mechanizm="cieplny",
        in_a=in_a,
        curve_class=None,
        i_query_a=i_query_a,
        current_multiple_x_in=round(x, 6),
        prog_dolny_a=prog_dolny,
        prog_gorny_a=prog_gorny,
        gwarancja=gwarancja,
        t_umowny_s=wynik_t,
        podstawa_pl=opis,
        white_box_trace=trace,
    )


def compute_mcb_magnetic_point(
    *, i_query_a: float, in_a: float, curve_class: str
) -> McbCurvePointResult:
    """Klasyfikuj zapytany prąd względem progu MAGNETYCZNEGO (zwarciowego) MCB.

    IEC 60898-1 Tabela 3 (REUSE `lv_mcb_bands_iec60898.PASMA_MAGNETYCZNE`):
    pasmo [min_x_in, max_x_in]×In wg klasy B/C/D. Zadziałanie GWARANTOWANE
    wyłącznie od górnej granicy pasma (chwilowe, <0,1 s) — zgodnie z
    ``ia_gwarantowane_a`` używanym przez SWZ (P0.6); brak zadziałania
    gwarantowany PONIŻEJ dolnej granicy (poza pasmem z definicji); WEWNĄTRZ
    pasma norma nie rozstrzyga (fizyczny rozrzut egzemplarzy — dokumentacja
    ``lv_mcb_bands_iec60898.py``).

    Raises:
        ValueError: nieznana ``curve_class``, ``i_query_a < 0`` albo
            ``in_a <= 0`` (przez `PASMA_MAGNETYCZNE`/walidację lokalną).
    """
    if in_a <= 0:
        raise ValueError(f"in_a musi być dodatnie, otrzymano {in_a}.")
    if i_query_a < 0:
        raise ValueError(f"i_query_a nie może być ujemne, otrzymano {i_query_a}.")
    if curve_class not in PASMA_MAGNETYCZNE:
        raise ValueError(
            f"Nieznana klasa wyzwolenia MCB '{curve_class}' — dozwolone: "
            f"{', '.join(sorted(PASMA_MAGNETYCZNE))} (IEC 60898-1)."
        )

    pasmo = PASMA_MAGNETYCZNE[curve_class]
    prog_dolny = pasmo.min_x_in * in_a
    prog_gorny = pasmo.max_x_in * in_a
    x = i_query_a / in_a

    if i_query_a >= prog_gorny:
        gwarancja = GwarancjaNormy.WYZWOLENIE_GWARANTOWANE
        opis = (
            f"I={i_query_a:g} A >= {pasmo.max_x_in:g}×In={prog_gorny:g} A — "
            f"norma (IEC 60898-1, klasa {curve_class}) gwarantuje zadziałanie magnetyczne "
            f"CHWILOWE (<0,1 s)."
        )
    elif i_query_a < prog_dolny:
        gwarancja = GwarancjaNormy.BRAK_WYZWOLENIA_GWARANTOWANY
        opis = (
            f"I={i_query_a:g} A < {pasmo.min_x_in:g}×In={prog_dolny:g} A — poniżej pasma "
            f"wyzwolenia magnetycznego klasy {curve_class} ({pasmo.min_x_in:g}-"
            f"{pasmo.max_x_in:g}×In) — element magnetyczny NIE zadziała (element cieplny "
            f"może, patrz `compute_mcb_thermal_point`)."
        )
    else:
        gwarancja = GwarancjaNormy.NIEOKRESLONY
        opis = (
            f"I={i_query_a:g} A leży WEWNĄTRZ pasma magnetycznego klasy {curve_class} "
            f"({prog_dolny:g}÷{prog_gorny:g} A) — norma (IEC 60898-1) gwarantuje "
            f"zadziałanie WYŁĄCZNIE na górnej granicy; wewnątrz pasma może, ale nie musi "
            f"zadziałać (zakaz interpolacji, §0.2 karty P0.7)."
        )

    trace: dict[str, Any] = {
        "step": "MCB_MAGNETIC",
        "standard": "IEC 60898-1 Tabela 3",
        "curve_class": curve_class,
        "in_a": in_a,
        "i_query_a": i_query_a,
        "current_multiple_x_in": round(x, 6),
        "prog_dolny_a": prog_dolny,
        "prog_gorny_a": prog_gorny,
        "gwarancja": gwarancja.value,
        "opis_pl": opis,
    }

    return McbCurvePointResult(
        family=LvCurveFamily.MCB_THERMAL_MAGNETIC.value,
        mechanizm="magnetyczny",
        in_a=in_a,
        curve_class=curve_class,
        i_query_a=i_query_a,
        current_multiple_x_in=round(x, 6),
        prog_dolny_a=prog_dolny,
        prog_gorny_a=prog_gorny,
        gwarancja=gwarancja,
        t_umowny_s=(0.1 if gwarancja == GwarancjaNormy.WYZWOLENIE_GWARANTOWANE else None),
        podstawa_pl=opis,
        white_box_trace=trace,
    )


# =============================================================================
# MCCB_ELECTRONIC — WYNIK
# =============================================================================


@dataclass(frozen=True)
class MccbCurvePointResult:
    """Klasyfikacja zapytanego prądu na tle nastaw wyzwalacza elektronicznego MCCB.

    Trójstopniowa klasyfikacja definite-time: I<Ir → poniżej progu
    długozwłocznego (brak wyzwolenia); Ir<=I<Isd → stopień długozwłoczny
    (wyzwolenie w ``tr_s``, ZAŁOŻENIE definite-time — norma IEC 60947-2 nie
    definiuje uniwersalnego kształtu I²t długozwłocznego, patrz
    ``zalozenie_pl``); Isd<=I<Ii → stopień krótkozwłoczny (``tsd_s``);
    I>=Ii → zwarciowy natychmiastowy (<0,1 s).
    """

    stopien: str  # "brak" | "dlugozwloczny" | "krotkozwloczny" | "zwarciowy"
    i_query_a: float
    ir_a: float | None
    isd_a: float | None
    ii_a: float | None
    tr_s: float | None
    tsd_s: float | None
    t_wyzwolenia_s: float | None
    zalozenie_pl: str | None
    podstawa_pl: str
    white_box_trace: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "stopien": self.stopien,
            "i_query_a": self.i_query_a,
            "ir_a": self.ir_a,
            "isd_a": self.isd_a,
            "ii_a": self.ii_a,
            "tr_s": self.tr_s,
            "tsd_s": self.tsd_s,
            "t_wyzwolenia_s": self.t_wyzwolenia_s,
            "zalozenie_pl": self.zalozenie_pl,
            "podstawa_pl": self.podstawa_pl,
            "white_box_trace": self.white_box_trace,
        }


def compute_mccb_point(
    *,
    i_query_a: float,
    ir_a: float | None,
    isd_a: float | None,
    ii_a: float | None,
    tr_s: float | None,
    tsd_s: float | None,
) -> MccbCurvePointResult:
    """Klasyfikuj zapytany prąd wg RESOLWOWANYCH nastaw wyzwalacza elektronicznego.

    Args:
        i_query_a: Zapytany prąd [A].
        ir_a: Nastawiony prąd długozwłoczny Ir [A] (``None`` = brak nastawy —
            pasmo NIEZNANE, zero fabrykacji domyślnej wartości).
        isd_a: Nastawiony prąd krótkozwłoczny Isd [A] (``None`` dozwolone —
            wtedy stopień pomijany, tylko Ir/Ii ocenione).
        ii_a: Nastawiony prąd zwarciowy natychmiastowy Ii [A] (``None``
            dozwolone — wtedy tylko Ir/Isd ocenione).
        tr_s: Zwłoka długozwłoczna [s] (wymagana, gdy ``ir_a`` podane).
        tsd_s: Zwłoka krótkozwłoczna [s] (wymagana, gdy ``isd_a`` podane).

    Returns:
        MccbCurvePointResult ze stopniem, do którego zapytany prąd należy,
        albo stopień "brak_danych" gdy ``ir_a`` jest ``None`` (bez progu
        długozwłocznego nie da się w ogóle zaklasyfikować prądu — zero
        fabrykacji domyślnego In).

    Raises:
        ValueError: ``i_query_a < 0``, albo podano próg bez odpowiadającej
            mu zwłoki (``isd_a``/``ii_a`` bez ``tsd_s``... ``ii_a`` nie
            wymaga zwłoki — jest natychmiastowy z definicji).
    """
    if i_query_a < 0:
        raise ValueError(f"i_query_a nie może być ujemne, otrzymano {i_query_a}.")

    if ir_a is None or tr_s is None:
        trace_brak: dict[str, Any] = {
            "step": "MCCB_ELECTRONIC",
            "standard": "IEC 60947-2",
            "result": "DANE_NIEKOMPLETNE",
            "reason": "Brak nastawy długozwłocznej (Ir/tr) w katalogu — pasmo nieznane.",
        }
        return MccbCurvePointResult(
            stopien="brak_danych",
            i_query_a=i_query_a,
            ir_a=ir_a,
            isd_a=isd_a,
            ii_a=ii_a,
            tr_s=tr_s,
            tsd_s=tsd_s,
            t_wyzwolenia_s=None,
            zalozenie_pl=None,
            podstawa_pl=(
                "Brak resolwowanej nastawy długozwłocznej (Ir/tr) — pasmo krzywej "
                "elektronicznej NIEZNANE (zero fabrykacji domyślnej wartości)."
            ),
            white_box_trace=trace_brak,
        )
    if ir_a <= 0:
        raise ValueError(f"ir_a musi być dodatnie, otrzymano {ir_a}.")
    if tr_s <= 0:
        raise ValueError(f"tr_s musi być dodatnie, otrzymano {tr_s}.")
    if isd_a is not None and tsd_s is None:
        raise ValueError("isd_a podane bez odpowiadającej zwłoki tsd_s.")
    if isd_a is not None and isd_a <= ir_a:
        raise ValueError(f"isd_a ({isd_a}) musi być > ir_a ({ir_a}).")
    if ii_a is not None and isd_a is not None and ii_a <= isd_a:
        raise ValueError(f"ii_a ({ii_a}) musi być > isd_a ({isd_a}).")
    if ii_a is not None and isd_a is None and ii_a <= ir_a:
        raise ValueError(f"ii_a ({ii_a}) musi być > ir_a ({ir_a}).")

    zalozenie_dlugo = (
        "Stopień długozwłoczny modelowany jako definite-time przy tr_s (IEC 60947-2 nie "
        "definiuje uniwersalnego kształtu I²t długozwłocznego niezależnie od producenta) — "
        "ZAŁOŻENIE nazwane wprost, nie fabrykacja kształtu krzywej."
    )

    czas: float | None
    if ii_a is not None and i_query_a >= ii_a:
        stopien = "zwarciowy"
        czas = 0.1
        opis = f"I={i_query_a:g} A >= Ii={ii_a:g} A — wyzwolenie zwarciowe natychmiastowe (<0,1 s)."
        zalozenie = None
    elif isd_a is not None and i_query_a >= isd_a:
        stopien = "krotkozwloczny"
        czas = tsd_s
        opis = (
            f"I={i_query_a:g} A >= Isd={isd_a:g} A — wyzwolenie krótkozwłoczne w tsd={tsd_s:g} s."
        )
        zalozenie = None
    elif i_query_a >= ir_a:
        stopien = "dlugozwloczny"
        czas = tr_s
        opis = f"I={i_query_a:g} A >= Ir={ir_a:g} A — wyzwolenie długozwłoczne w tr={tr_s:g} s."
        zalozenie = zalozenie_dlugo
    else:
        stopien = "brak"
        czas = None
        opis = (
            f"I={i_query_a:g} A < Ir={ir_a:g} A — poniżej progu długozwłocznego, brak wyzwolenia."
        )
        zalozenie = None

    trace: dict[str, Any] = {
        "step": "MCCB_ELECTRONIC",
        "standard": "IEC 60947-2",
        "i_query_a": i_query_a,
        "ir_a": ir_a,
        "isd_a": isd_a,
        "ii_a": ii_a,
        "tr_s": tr_s,
        "tsd_s": tsd_s,
        "stopien": stopien,
        "t_wyzwolenia_s": czas,
        "opis_pl": opis,
        "zalozenie_pl": zalozenie,
    }

    return MccbCurvePointResult(
        stopien=stopien,
        i_query_a=i_query_a,
        ir_a=ir_a,
        isd_a=isd_a,
        ii_a=ii_a,
        tr_s=tr_s,
        tsd_s=tsd_s,
        t_wyzwolenia_s=czas,
        zalozenie_pl=zalozenie,
        podstawa_pl=opis,
        white_box_trace=trace,
    )


# Karta D1 (nN, „runda 8 — PEŁNY WERDYKT nN"): prąd umowny zadziałania
# (conventional tripping current) wyzwalacza ELEKTRONICZNEGO wg IEC 60947-2 —
# I2 = 1,3×Ir (w czasie umownym: <=630 A → 2h; >630 A → 4h). Konsument:
# `application/analyses/nn_device_selection.py::_kryterium_i2` (kryterium ii,
# IEC 60364-4-43 §433.1.1) dla kandydatów KIND_MCCB — WYŁĄCZNIE gdy nastawa
# Ir jest resolwowana (katalog niesie `ir_range`); brak nastawy → trzeci stan
# (NIEROZSTRZYGALNE), zero fabrykacji domyślnego Ir.
#
# Źródła (dwa, niezależne):
#   (1) ABB SACE Emax2/Tmax XT — przewodnik doboru nastaw wyzwalacza Ekip
#       (stoklink.com/blogs/technical/select-ekip-trip-unit-abb-emax-2-guide):
#       „Conventional tripping time: 1.3 × Ir within 2 hours (currents below
#       630 A) or 4 hours (above 630 A)".
#   (2) VIOX, „MCCB Trip Unit Settings Guide" (viox.com/mccb-trip-unit-
#       settings-ir-isd-ii-explained) — ten sam mnożnik 1,3×Ir jako prąd
#       umowny zadziałania długozwłocznego dla wyzwalaczy elektronicznych.
MCCB_I2_MULTIPLIER = 1.3
MCCB_I2_SOURCE_PL = (
    "IEC 60947-2 — prąd umowny zadziałania (conventional tripping current) wyzwalacza "
    "elektronicznego I2=1,3×Ir (czas umowny: <=630 A → 2h, >630 A → 4h) — zweryfikowane "
    "podwójnie, niezależnie: (1) ABB Emax2/Tmax XT Ekip — przewodnik doboru nastaw "
    "(stoklink.com/blogs/technical/select-ekip-trip-unit-abb-emax-2-guide); "
    "(2) VIOX „MCCB Trip Unit Settings Guide” "
    "(viox.com/mccb-trip-unit-settings-ir-isd-ii-explained)."
)


# =============================================================================
# FUSE_GG — BRAMKI CZASOWO-PRĄDOWE (G-D2)
# =============================================================================

# Mnożniki bramek gG wg IEC 60269-1 dla In>16 A (JEDYNY zakres obecny w
# katalogu WKLADKA_NN — 25..250 A, patrz `mv_auxiliary_catalog._FUSE_IN_A`).
# ZERO FABRYKACJI: zakres In<=16 A (mnożniki 1,5/1,9/2,1 wg pamięci normy)
# CELOWO NIE JEST tu zaimplementowany — nie uzyskano dla niego podwójnej
# weryfikacji źródłowej w tej karcie (G-D2 "bez podwójnego potwierdzenia —
# poza rejestrem, jawnie"); wywołanie dla In<=16 A podnosi ValueError.
#
# Źródła (dwa, niezależne) dla mnożników 1,25/1,6:
#   (1) Zbiorcze wyszukiwanie techniczne (Schneider Electric "Electrical
#       Installation Guide" — electrical-installation.org, oraz
#       viox.com/iec-60269-low-voltage-fuse-selection-guide-gg-am-nh) —
#       "Conventional non-fusing current is usually 1.25 x In... conventional
#       fusing current (If) is usually 1.6 x In."
#   (2) elektro.info.pl (artykuł „Bezpieczniki topikowe do zabezpieczeń
#       instalacji niskiego napięcia") — cytat wprost: "umowny dolny prąd
#       probierczy (prąd niezadziałania – Inf) wynosi 1,25 x In oraz
#       zadziałania wkładki – If = 1,6 x In" (dla gG, w odróżnieniu od gTr:
#       1,3/1,5).
FUSE_GG_INF_MULTIPLIER = 1.25
FUSE_GG_IF_MULTIPLIER = 1.6
FUSE_GG_GATE_SOURCE_PL = (
    "IEC 60269-1 (Inf=1,25×In, If=1,6×In dla In>16 A) — zweryfikowane podwójnie: "
    "(1) zbiorcze źródła techniczne (Schneider Electric Electrical Installation Guide, "
    "electrical-installation.org/enwiki/Elementary_switching_devices; viox.com/"
    "iec-60269-low-voltage-fuse-selection-guide-gg-am-nh); "
    "(2) elektro.info.pl, „Bezpieczniki topikowe do zabezpieczeń instalacji niskiego "
    "napięcia” (cytat wprost: Inf=1,25×In, If=1,6×In dla gG)."
)

# Czas umowny wg zakresu In (In>16 A) — IEC 60269-1 Tabela 3 struktura
# progowa (63/160/400 A). Podwójna weryfikacja słabsza niż dla mnożników
# (jedno zbiorcze źródło techniczne w tej karcie) — nazwane wprost w
# `FUSE_GG_TIME_BAND_SOURCE_PL`, zgodnie z regułą uczciwego raportowania
# (dane bez pełnego podwójnego potwierdzenia NIE są cicho podawane jako
# w pełni zweryfikowane).
FUSE_GG_TIME_BAND_SOURCE_PL = (
    "IEC 60269-1 struktura czasu umownego wg zakresu In — źródło: zbiorcze wyszukiwanie "
    "techniczne (Schneider Electric Electrical Installation Guide + viox.com IEC 60269 "
    "guide), jedno źródło NIE podwójnie potwierdzone w tej karcie (patrz raport P0.7) — "
    "1h(In<=63A)/2h(63<In<=160A)/3h(160<In<=400A)/4h(In>400A)."
)


def _czas_umowny_fuse_gg_s(in_a: float) -> float:
    if in_a <= 16.0:
        raise ValueError(
            f"in_a={in_a} A <= 16 A — poza zweryfikowanym zakresem G-D2 tej karty "
            "(mnożniki bramek dla In<=16 A różnią się: 1,5/1,9/2,1× wg IEC 60269-1, "
            "nie zaimplementowane bez podwójnej weryfikacji źródłowej)."
        )
    if in_a <= 63.0:
        return 3600.0
    if in_a <= 160.0:
        return 7200.0
    if in_a <= 400.0:
        return 10800.0
    return 14400.0


@dataclass(frozen=True)
class FuseGgGateResult:
    """Klasyfikacja zapytanego prądu względem bramek I-t wkładki gG (G-D2).

    Attributes:
        in_a: Prąd znamionowy wkładki [A].
        i_query_a: Zapytany prąd [A].
        inf_a: Prąd umowny nietopliwy Inf=1,25×In [A] — norma gwarantuje
            BRAK stopienia poniżej/na tym progu w czasie umownym.
        if_a: Prąd umowny topliwy If=1,6×In [A] — norma gwarantuje stopienie
            od tego progu w czasie umownym.
        t_umowny_s: Czas umowny testu [s] (zależny od zakresu In).
        gwarancja: Stan gwarancji normy dla ``i_query_a``.
    """

    in_a: float
    i_query_a: float
    inf_a: float
    if_a: float
    t_umowny_s: float
    gwarancja: GwarancjaNormy
    podstawa_pl: str
    white_box_trace: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "in_a": self.in_a,
            "i_query_a": self.i_query_a,
            "inf_a": self.inf_a,
            "if_a": self.if_a,
            "t_umowny_s": self.t_umowny_s,
            "gwarancja": self.gwarancja.value,
            "podstawa_pl": self.podstawa_pl,
            "white_box_trace": self.white_box_trace,
        }


def compute_fuse_gg_gate(*, i_query_a: float, in_a: float) -> FuseGgGateResult:
    """Klasyfikuj zapytany prąd względem bramek I-t wkładki gG (IEC 60269-1, G-D2).

    Args:
        i_query_a: Zapytany prąd [A] (np. Ik_min obwodu, do SWZ/koordynacji).
        in_a: Prąd znamionowy wkładki [A] — MUSI być > 16 A (jedyny
            zweryfikowany zakres tej karty, patrz `_czas_umowny_fuse_gg_s`).

    Raises:
        ValueError: ``in_a <= 16`` (poza zweryfikowanym zakresem G-D2),
            ``in_a <= 0`` albo ``i_query_a < 0``.
    """
    if in_a <= 0:
        raise ValueError(f"in_a musi być dodatnie, otrzymano {in_a}.")
    if i_query_a < 0:
        raise ValueError(f"i_query_a nie może być ujemne, otrzymano {i_query_a}.")

    t_umowny = _czas_umowny_fuse_gg_s(in_a)
    inf_a = FUSE_GG_INF_MULTIPLIER * in_a
    if_a = FUSE_GG_IF_MULTIPLIER * in_a

    if i_query_a <= inf_a:
        gwarancja = GwarancjaNormy.BRAK_WYZWOLENIA_GWARANTOWANY
        opis = (
            f"I={i_query_a:g} A <= Inf={inf_a:g} A ({FUSE_GG_INF_MULTIPLIER:g}×In) — "
            f"norma (IEC 60269-1) gwarantuje BRAK stopienia wkładki w czasie umownym "
            f"{t_umowny:g} s."
        )
    elif i_query_a >= if_a:
        gwarancja = GwarancjaNormy.WYZWOLENIE_GWARANTOWANE
        opis = (
            f"I={i_query_a:g} A >= If={if_a:g} A ({FUSE_GG_IF_MULTIPLIER:g}×In) — "
            f"norma (IEC 60269-1) gwarantuje stopienie wkładki w czasie umownym "
            f"<= {t_umowny:g} s (dokładny czas nieokreślony dwoma punktami kontrolnymi — "
            f"tylko górna granica)."
        )
    else:
        gwarancja = GwarancjaNormy.NIEOKRESLONY
        opis = (
            f"I={i_query_a:g} A leży MIĘDZY bramkami Inf/If ({inf_a:g}÷{if_a:g} A) — "
            f"norma (IEC 60269-1) NIE gwarantuje ani braku, ani wystąpienia stopienia w "
            f"tym przedziale (zakaz interpolacji, §0.2 karty P0.7)."
        )

    trace: dict[str, Any] = {
        "step": "FUSE_GG_GATE",
        "standard": "IEC 60269-1",
        "in_a": in_a,
        "i_query_a": i_query_a,
        "inf_a": inf_a,
        "if_a": if_a,
        "t_umowny_s": t_umowny,
        "gwarancja": gwarancja.value,
        "opis_pl": opis,
        "zrodlo_mnoznikow": FUSE_GG_GATE_SOURCE_PL,
        "zrodlo_czasu_umownego": FUSE_GG_TIME_BAND_SOURCE_PL,
    }

    return FuseGgGateResult(
        in_a=in_a,
        i_query_a=i_query_a,
        inf_a=inf_a,
        if_a=if_a,
        t_umowny_s=t_umowny,
        gwarancja=gwarancja,
        podstawa_pl=opis,
        white_box_trace=trace,
    )


# =============================================================================
# FUSE_GG — BRAMKA PRZY t_wymagany DOKŁADNYM (KARTA D2, G-06 rozszerzenie SWZ)
# =============================================================================
#
# Inf/If powyżej gwarantują zachowanie WYŁĄCZNIE w czasie umownym normy
# (1-4h, wg zakresu In) — SWZ (IEC 60364-4-41, Tab. 41.1) wymaga zadziałania
# w t_wymagany RZĘDU UŁAMKA SEKUNDY (0,1-5 s, patrz `application.analyses.
# swz.werdykt` / `network_model.catalog.lv_disconnection_times_iec60364_4_41`)
# — CZAS INNY NIŻ czas umowny normy IEC 60269-1. Werdykt „spełnia w
# t_wymagany" wymaga osobnej bramki I-t przy TYM konkretnym czasie (nie da
# się jej wyprowadzić z Inf/If bez interpolacji, zakaz §0.2 karty P0.7).
#
# STATUS BADANIA (karta D2, 2026-08-14 — §0 pkt 1b/1c rozstrzygnięcia karty):
# PRÓBA PODJĘTA (WebSearch + WebFetch, wielokrotnie), BRAK PODWÓJNEGO
# POTWIERDZENIA ŹRÓDŁOWEGO liczbowej bramki I(t) dla t<1h. Sprawdzono:
#   (1) IEC 60269-1/2 — podglądy iTeh Standards (próbki PDF normy) POTWIERDZAJĄ
#       istnienie w indeksie normy tabel „gates for specified pre-arcing (and
#       operating) times" (numeracja tabeli różni się między wzmiankami:
#       Table 102/701/702 wg różnych wydań/cytowań wtórnych) DLA In>16A — ale
#       treść LICZBOWA tych tabel jest zamknięta za paywallem (próbki iTeh
#       udostępniają wyłącznie strony tytułowe/spis treści, nie treść
#       normatywną) — NIE odczytana w tej sesji.
#   (2) Musiał E. (Politechnika Gdańska, Katedra Elektroenergetyki),
#       „Bezpieczniki w nowoczesnych układach zabezpieczeń urządzeń niskiego
#       napięcia" (materiały szkolenia ENERGO-EKO-TECH, Poznań 2001) —
#       POTWIERDZA STRUKTURALNIE, że pełna charakterystyka czasowo-prądowa t-I
#       poniżej progu czasu umownego jest PASMOWA i SPECYFICZNA DLA
#       PRODUCENTA (rys. 2: przykładowe krzywe ETI-POLAM, cytat: „charakterystyki
#       czasowo-prądowe urywa się od dołu na ogół na poziomie 0,1 s") — norma
#       NIE publikuje jednej uniwersalnej wartości I(5s)/I(0,4s) wspólnej dla
#       wszystkich wytwórców; to spójne z rozjazdem I²t przedłukowego ETI vs
#       Bussmann 30-60% już odnotowanym w karcie P0.7 (ten sam mechanizm
#       rozbieżności — krzywa krótkoczasowa poniżej t_umowny jest własnością
#       KONSTRUKCJI topika konkretnego wytwórcy, nie samej normy).
#   (3) Katalogi manufacturera (Bussmann/Eaton, Mersen, ETI-POLAM, Schneider
#       Electric) sprawdzone przez WebFetch — publikują WYŁĄCZNIE krzywe
#       GRAFICZNE (obraz), nie tabele liczbowe ekstrahowalne — odczyt punktu
#       z wykresu byłby interpolacją/estymacją niepewną (zakaz §0.2 karty
#       P0.7), nie „podwójnym potwierdzeniem źródłowym" w rozumieniu karty D2.
#
# WNIOSEK (§0 pkt 1b/1c karty D2): rejestr poniżej PUSTY — brak wpisu = SWZ
# dla gG przy t_wymagany pozostaje NIEROZSTRZYGALNY (warunkowo), NIGDY
# „spełnia" bez potwierdzonej bramki. Mechanizm jest GOTOWY na przyszłe
# uzupełnienie (Reguła KLASA NIE INSTANCJA — dodanie wpisu tutaj automatycznie
# odblokowuje rozstrzygalny werdykt SWZ dla wszystkich konsumentów, bez zmian
# w `werdykt.py`), gdy właściciel dostarczy zakupioną normę IEC 60269-2 albo
# DWA zgodne katalogi producentów z jawną tabelą liczbową (nie tylko
# wykresem) dla danego t_wymagany.
FUSE_GG_BRAMKA_T_WYMAGANY_MULTIPLIER: dict[float, float] = {}

FUSE_GG_BRAMKA_T_WYMAGANY_STATUS_PL = (
    "Brak podwójnie zweryfikowanej bramki I-t gG przy t_wymagany (patrz karta D2, "
    "2026-08-14, §0 pkt 1b/1c) — próba WebSearch/WebFetch podjęta (IEC 60269-1/2 "
    "podglądy iTeh Standards, Musiał E./Politechnika Gdańska, katalogi Bussmann/Eaton/"
    "Mersen/ETI-POLAM/Schneider Electric), bez dwóch zgodnych źródeł liczbowych — "
    "norma publikuje WYŁĄCZNIE bramki konwencjonalne Inf/If przy czasie umownym (1-4h), "
    "poniżej tego czasu charakterystyka jest pasmowa i specyficzna dla producenta "
    "(rozjazd analogiczny do I²t ETI vs Bussmann 30-60% z karty P0.7). Rejestr PUSTY "
    "do czasu pozyskania normy IEC 60269-2 (Tabela gates for specified pre-arcing "
    "times) albo dwóch zgodnych katalogów producentów z jawną tabelą liczbową."
)


def bramka_t_wymagany_gg_a(*, t_wymagany_s: float, in_a: float) -> float | None:
    """Prąd gwarantowanego stopienia wkładki gG w CZASIE DOKŁADNYM t_wymagany.

    W odróżnieniu od ``compute_fuse_gg_gate`` (bramki Inf/If przy czasie
    UMOWNYM normy 1-4h), ta funkcja pyta o bramkę przy czasie WYMAGANYM przez
    SWZ (IEC 60364-4-41, ułamek sekundy) — DANE INNE niż Inf/If, ZERO
    ekstrapolacji/interpolacji między nimi (zakaz §0.2 karty P0.7).

    Args:
        t_wymagany_s: Dokładny czas wymagany [s] (np. 0,4 albo 5,0 —
            ``application.analyses.swz.werdykt.ocen_swz`` t_wymagany_s).
        in_a: Prąd znamionowy wkładki [A].

    Returns:
        Prąd [A] gwarantujący stopienie w ``t_wymagany_s`` — WYŁĄCZNIE gdy
        ``t_wymagany_s`` ma potwierdzony wpis w
        ``FUSE_GG_BRAMKA_T_WYMAGANY_MULTIPLIER`` (podwójnie zweryfikowany
        źródłowo, patrz status modułu powyżej) — inaczej ``None`` (zero
        fabrykacji, brak ekstrapolacji z Inf/If).

    Raises:
        ValueError: ``in_a <= 0``.
    """
    if in_a <= 0:
        raise ValueError(f"in_a musi być dodatnie, otrzymano {in_a}.")
    mnoznik = FUSE_GG_BRAMKA_T_WYMAGANY_MULTIPLIER.get(t_wymagany_s)
    if mnoznik is None:
        return None
    return mnoznik * in_a
