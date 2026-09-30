"""Sanity-bounds dla rozpływu mocy: napięcia, obciążenia gałęzi, straty (K-08).

Warstwa INTERPRETACJI (Z15), siostra ``short_circuit_bounds.py`` — ten sam
werdykt trójstanowy (w paśmie wiarygodności / poza zakresem wiarygodności / dane
niekompletne), ta sama zasada: czyta GOTOWY wynik solvera (rozpływu, FROZEN) i
ocenia jego WIARYGODNOŚĆ, NIE liczy fizyki. Karta W3-G2 (KARTA_W3_KONWERGENCJA_
FIZYKI_2026-09.md §0.17, mapa aneks D4): do tej karty ``analysis/sanity_bounds/``
dawał pasma wiarygodności WYŁĄCZNIE dla zwarć — rozpływ nie miał żadnej bramki
„czy ten wynik jest fizycznie sensowny".

Trzy niezależne oceny (§0.17, dosłownie):
1. Napięcia szyn w paśmie Un ± 10 % — norma PN-EN 50160 (cytat w
   ``NORMA_NAPIECIA_PL``, jedno miejsce; mapa 6 #10 „zintegrowany raport EN
   50160 — 6 plików z progiem 50160 lokalnie": ten moduł jest odtąd JEDNYM
   źródłem prawdy progu KREDYBILNOŚCI napięcia — domknięcie CZĘŚCIOWE 6 #10,
   bo pełny zintegrowany raport PQ/EN 50160 to osobna, większa zdolność, patrz
   inwentarz klasy w meldunku karty).
2. Obciążenie gałęzi wobec prądu znamionowego KAŻDEGO zacisku (decyzja O-51):
   linia i kabel — In z katalogu na obu zaciskach; transformator — prąd znamionowy
   zacisku I_r = S_n/(√3·U_n,strona) (IEC 60076-1, przez `network_model/pochodne`).
   Obciążenie = max(I_od/I_r,od; I_do/I_r,do) z JEDNEJ funkcji
   (`analysis/obciazenie_galezi.py`, ta sama co tabela gałęzi i walidacja
   energetyczna) — kabel z susceptancją i transformator mają na końcach różne
   prądy, więc ocena z jednego zacisku zaniżała obciążenie. Brak danej
   znamionowej albo prądu zacisku daje stan „dane niekompletne" z nazwanym
   powodem, NIGDY podstawienie 0/inf (solver_input_substitute_guard).
3. Straty czynne sieci wobec sumy mocy czynnej odbiorów — próg JAWNY,
   NAZWANY parametr z uzasadnieniem inżynierskim (``DOMYSLNY_PROG_STRAT_
   PROCENT``/``UZASADNIENIE_PROGU_STRAT_PL``), nie zaszyta stała bez źródła.

Różnica wobec ``analysis/energy_validation`` (istniejący, ODDZIELNY moduł —
NIE duplikat, inna klasa): tamten ocenia ZGODNOŚĆ PROJEKTOWĄ (PASS/WARNING/FAIL
wobec progów jakości 80 %/100 %/5 %/10 %, cel: czy sieć spełnia kryteria
inżynierskie). Ten moduł ocenia KREDYBILNOŚĆ WYNIKU SOLVERA (w paśmie
wiarygodności/poza zakresem wiarygodności/dane niekompletne, cel: czy liczba w ogóle jest
wiarygodna fizycznie, zanim trafi do pakietu OSD) — dokładnie ta sama różnica
celu, która już istnieje między tym pakietem a ``energy_validation`` dla zwarć
(Ik'' ma OBA: „poza zakresem wiarygodności" tutaj ORAZ osobne progi jakości
gdzie indziej). Progi liczbowe (±10 % napięcia, 100 % obciążenia) CELOWO
pokrywają się z granicami FAIL walidacji energetycznej — to nie przypadek: obie
klasy patrzą na tę samą fizyczną granicę normy, z różnym pytaniem.
"""

from __future__ import annotations

from dataclasses import dataclass

from analysis.normative.kryteria_napiecia import PASMO_WIARYGODNOSCI_PROCENT
from analysis.obciazenie_galezi import ObciazenieGalezi, Zacisk
from analysis.sanity_bounds.short_circuit_bounds import (
    CREDIBLE,
    INCOMPLETE,
    OUT_OF_RANGE,
)
from network_model.pochodne import a_na_ka

#: Cytat normy dla pasma napięciowego (jedno miejsce — mapa 6 #10, domknięcie
#: częściowe). PN-EN 50160 określa dopuszczalne odchylenia napięcia zasilającego
#: w publicznych sieciach elektroenergetycznych; ± 10 % Un to granica normalnej
#: pracy sieci przywołana w §0.17 karty W3.
NORMA_NAPIECIA_PL = (
    "PN-EN 50160 (Parametry napięcia zasilającego w publicznych sieciach "
    "elektroenergetycznych) — zmiany napięcia zasilającego w warunkach normalnej "
    "pracy: Un ± 10 %."
)

#: Szerokość pasma wiarygodności napięcia [%] wokół Un (± PASMO_NAPIECIA_PROCENT).
#: Jedno źródło prawdy (karta W3-J): `analysis.normative.kryteria_napiecia.
#: PASMO_WIARYGODNOSCI_PROCENT` — nazwa pola tego modułu i wynik (10.0)
#: bit w bit bez zmian, wyłącznie źródło liczby jest wspólne.
PASMO_NAPIECIA_PROCENT: float = PASMO_WIARYGODNOSCI_PROCENT

#: Domyślny próg wiarygodności strat czynnych rozpływu, jako % sumy mocy czynnej
#: odbiorów (JAWNY parametr — patrz ``evaluate_network_losses``, nie zaszyta
#: stała bez źródła). UZASADNIENIE INŻYNIERSKIE: typowe straty czynne sieci SN
#: mieszczą się w przedziale ok. 2-6 % mocy dostarczonej do odbiorów (dane
#: eksploatacyjne OSD, sprawozdawczość strat sieciowych); 10 % to górna granica
#: WIARYGODNOŚCI wyniku solvera (nie granica projektowa energy_validation) —
#: prawie dwukrotność typowej górnej wartości technicznej, więc przekroczenie
#: tego progu wskazuje raczej błąd modelu (zawyżona impedancja gałęzi, błędna
#: topologia, zdegenerowany przypadek obliczeniowy) niż rzeczywistą fizykę sieci.
DOMYSLNY_PROG_STRAT_PROCENT: float = 10.0

#: Uzasadnienie progu strat — towarzyszy KAŻDEMU werdyktowi (API/UI), żeby próg
#: nigdy nie był „zaszytą stałą bez źródła".
UZASADNIENIE_PROGU_STRAT_PL = (
    "Typowe straty czynne sieci SN wynoszą ok. 2-6 % mocy dostarczonej do "
    "odbiorów (dane eksploatacyjne OSD). 10 % to górna granica WIARYGODNOŚCI "
    "wyniku solvera (nie granica projektowa) — powyżej niej wynik prawdopodobnie "
    "sygnalizuje błąd modelu (zawyżona impedancja gałęzi, błędna topologia), a "
    "nie rzeczywistą fizykę sieci."
)


def _is_finite(value: float) -> bool:
    return value == value and value not in (float("inf"), float("-inf"))


# =============================================================================
# 1. Napięcia szyn — Un ± 10 % (PN-EN 50160)
# =============================================================================


@dataclass(frozen=True)
class VoltageBandSanityVerdict:
    nominal_kv: float | None
    actual_kv: float | None
    lower_kv: float | None
    upper_kv: float | None
    deviation_pct: float | None
    in_range: bool
    status: str
    why_pl: str

    def to_dict(self) -> dict[str, object]:
        return {
            "nominal_kv": self.nominal_kv,
            "actual_kv": self.actual_kv,
            "lower_kv": self.lower_kv,
            "upper_kv": self.upper_kv,
            "deviation_pct": self.deviation_pct,
            "in_range": self.in_range,
            "status": self.status,
            "why_pl": self.why_pl,
        }


def evaluate_bus_voltage(
    nominal_kv: float | None,
    actual_kv: float | None,
) -> VoltageBandSanityVerdict:
    """Ocena wiarygodności napięcia szyny wobec pasma Un ± 10 % (PN-EN 50160)."""
    if (
        nominal_kv is None
        or actual_kv is None
        or nominal_kv <= 0.0
        or not _is_finite(nominal_kv)
        or not _is_finite(actual_kv)
    ):
        return VoltageBandSanityVerdict(
            nominal_kv=nominal_kv,
            actual_kv=actual_kv,
            lower_kv=None,
            upper_kv=None,
            deviation_pct=None,
            in_range=False,
            status=INCOMPLETE,
            why_pl="Brak poprawnego napięcia znamionowego lub wyniku napięcia do oceny wiarygodności.",
        )
    lower_kv = nominal_kv * (1.0 - PASMO_NAPIECIA_PROCENT / 100.0)
    upper_kv = nominal_kv * (1.0 + PASMO_NAPIECIA_PROCENT / 100.0)
    deviation_pct = abs(actual_kv - nominal_kv) / nominal_kv * 100.0
    in_range = lower_kv <= actual_kv <= upper_kv
    if in_range:
        why = (
            f"U = {actual_kv} kV mieści się w paśmie [{lower_kv:.3f}; {upper_kv:.3f}] kV "
            f"(Un = {nominal_kv} kV ± {PASMO_NAPIECIA_PROCENT:.0f} %)."
        )
    else:
        why = (
            f"U = {actual_kv} kV jest poza pasmem [{lower_kv:.3f}; {upper_kv:.3f}] kV "
            f"(Un = {nominal_kv} kV ± {PASMO_NAPIECIA_PROCENT:.0f} %, odchylenie "
            f"{deviation_pct:.2f} %) — wynik fizycznie wątpliwy (błąd modelu/jednostek?)."
        )
    return VoltageBandSanityVerdict(
        nominal_kv=nominal_kv,
        actual_kv=actual_kv,
        lower_kv=lower_kv,
        upper_kv=upper_kv,
        deviation_pct=deviation_pct,
        in_range=in_range,
        status=CREDIBLE if in_range else OUT_OF_RANGE,
        why_pl=why,
    )


# =============================================================================
# 2. Obciążenie gałęzi — prądy obu zacisków wobec prądów znamionowych zacisków
# =============================================================================


@dataclass(frozen=True)
class BranchLoadingSanityVerdict:
    """Werdykt wiarygodności obciążenia gałęzi.

    `current_ka` i `rated_current_a` dotyczą zacisku DECYDUJĄCEGO (`zacisk_decydujacy`);
    pola `*_od_*` / `*_do_*` niosą oba zaciski (addytywnie, decyzja O-51).
    """

    current_ka: float | None
    rated_current_a: float | None
    loading_pct: float | None
    in_range: bool
    status: str
    why_pl: str
    zacisk_decydujacy: Zacisk | None = None
    current_od_ka: float | None = None
    current_do_ka: float | None = None
    rated_current_od_a: float | None = None
    rated_current_do_a: float | None = None

    def to_dict(self) -> dict[str, object]:
        return {
            "current_ka": self.current_ka,
            "rated_current_a": self.rated_current_a,
            "loading_pct": self.loading_pct,
            "in_range": self.in_range,
            "status": self.status,
            "why_pl": self.why_pl,
            "zacisk_decydujacy": self.zacisk_decydujacy,
            "current_od_ka": self.current_od_ka,
            "current_do_ka": self.current_do_ka,
            "rated_current_od_a": self.rated_current_od_a,
            "rated_current_do_a": self.rated_current_do_a,
        }


def _ka_lub_brak(prad_a: float | None) -> float | None:
    return a_na_ka(prad_a) if prad_a is not None else None


def evaluate_branch_loading(obciazenie: ObciazenieGalezi) -> BranchLoadingSanityVerdict:
    """Ocena wiarygodności obciążenia gałęzi wobec prądów znamionowych zacisków.

    Wejście pochodzi z JEDNEJ funkcji obciążenia (`analysis/obciazenie_galezi.py`).
    Brak prądu zacisku albo danej znamionowej daje „dane niekompletne" z powodem tej
    funkcji — NIGDY podstawienie 0/inf za brakującą daną (solver_input_substitute_guard,
    karta W3-G2 §Granice). W paśmie: obciążenie ≤ 100 % (prąd zacisku decydującego nie
    przekracza jego prądu znamionowego).
    """
    wspolne = {
        "current_od_ka": _ka_lub_brak(obciazenie.prad_od_a),
        "current_do_ka": _ka_lub_brak(obciazenie.prad_do_a),
        "rated_current_od_a": obciazenie.prad_znamionowy_od_a,
        "rated_current_do_a": obciazenie.prad_znamionowy_do_a,
    }
    if obciazenie.obciazenie_pct is None or obciazenie.zacisk_decydujacy is None:
        return BranchLoadingSanityVerdict(
            current_ka=None,
            rated_current_a=None,
            loading_pct=None,
            in_range=False,
            status=INCOMPLETE,
            why_pl=obciazenie.powod_braku_pl or "",
            zacisk_decydujacy=None,
            **wspolne,
        )
    loading_pct = obciazenie.obciazenie_pct
    prad_ka = _ka_lub_brak(obciazenie.prad_decydujacy_a)
    znamionowy_a = obciazenie.prad_znamionowy_decydujacy_a
    assert prad_ka is not None and znamionowy_a is not None
    znamionowy_ka = a_na_ka(znamionowy_a)
    zacisk = obciazenie.zacisk_decydujacy
    in_range = loading_pct <= 100.0
    if in_range:
        why = (
            f"I = {abs(prad_ka):.4f} kA (zacisk {zacisk}) nie przekracza I_r = "
            f"{znamionowy_ka:.4f} kA tego zacisku (obciążenie {loading_pct:.1f} %)."
        )
    else:
        why = (
            f"I = {abs(prad_ka):.4f} kA (zacisk {zacisk}) przekracza I_r = "
            f"{znamionowy_ka:.4f} kA tego zacisku (obciążenie {loading_pct:.1f} %) — wynik "
            "fizycznie wątpliwy (błąd modelu/doboru przekroju?)."
        )
    return BranchLoadingSanityVerdict(
        current_ka=prad_ka,
        rated_current_a=znamionowy_a,
        loading_pct=loading_pct,
        in_range=in_range,
        status=CREDIBLE if in_range else OUT_OF_RANGE,
        why_pl=why,
        zacisk_decydujacy=zacisk,
        **wspolne,
    )


# =============================================================================
# 3. Straty czynne sieci — wobec sumy mocy czynnej odbiorów
# =============================================================================


@dataclass(frozen=True)
class NetworkLossesSanityVerdict:
    losses_active_mw: float | None
    load_active_total_mw: float | None
    losses_pct_of_load: float | None
    threshold_pct: float
    threshold_why_pl: str
    in_range: bool
    status: str
    why_pl: str

    def to_dict(self) -> dict[str, object]:
        return {
            "losses_active_mw": self.losses_active_mw,
            "load_active_total_mw": self.load_active_total_mw,
            "losses_pct_of_load": self.losses_pct_of_load,
            "threshold_pct": self.threshold_pct,
            "threshold_why_pl": self.threshold_why_pl,
            "in_range": self.in_range,
            "status": self.status,
            "why_pl": self.why_pl,
        }


def evaluate_network_losses(
    losses_active_mw: float | None,
    load_active_total_mw: float | None,
    threshold_pct: float = DOMYSLNY_PROG_STRAT_PROCENT,
) -> NetworkLossesSanityVerdict:
    """Ocena wiarygodności strat czynnych wobec sumy mocy czynnej odbiorów.

    ``threshold_pct`` jest JAWNYM parametrem z domyślną wartością nazwaną i
    uzasadnioną (``DOMYSLNY_PROG_STRAT_PROCENT``/``UZASADNIENIE_PROGU_STRAT_PL``)
    — nigdy zaszytym literałem bez źródła.
    """
    if (
        losses_active_mw is None
        or load_active_total_mw is None
        or not _is_finite(losses_active_mw)
        or not _is_finite(load_active_total_mw)
    ):
        return NetworkLossesSanityVerdict(
            losses_active_mw=losses_active_mw,
            load_active_total_mw=load_active_total_mw,
            losses_pct_of_load=None,
            threshold_pct=threshold_pct,
            threshold_why_pl=UZASADNIENIE_PROGU_STRAT_PL,
            in_range=False,
            status=INCOMPLETE,
            why_pl=(
                "Brak strat czynnych lub sumy mocy czynnej odbiorów w wyniku "
                "rozpływu — budżet strat nieoznaczony."
            ),
        )
    if load_active_total_mw <= 0.0:
        return NetworkLossesSanityVerdict(
            losses_active_mw=losses_active_mw,
            load_active_total_mw=load_active_total_mw,
            losses_pct_of_load=None,
            threshold_pct=threshold_pct,
            threshold_why_pl=UZASADNIENIE_PROGU_STRAT_PL,
            in_range=False,
            status=INCOMPLETE,
            why_pl="Sieć bez odbiorów (suma mocy czynnej odbiorów = 0) — budżet strat nieoznaczony.",
        )
    losses_pct = abs(losses_active_mw) / load_active_total_mw * 100.0
    in_range = losses_pct <= threshold_pct
    if in_range:
        why = (
            f"Straty czynne {abs(losses_active_mw):.4f} MW = {losses_pct:.2f} % sumy mocy "
            f"czynnej odbiorów ({load_active_total_mw:.4f} MW) — poniżej progu "
            f"wiarygodności {threshold_pct:.1f} %."
        )
    else:
        why = (
            f"Straty czynne {abs(losses_active_mw):.4f} MW = {losses_pct:.2f} % sumy mocy "
            f"czynnej odbiorów ({load_active_total_mw:.4f} MW) — przekraczają próg "
            f"wiarygodności {threshold_pct:.1f} % (wynik fizycznie wątpliwy)."
        )
    return NetworkLossesSanityVerdict(
        losses_active_mw=losses_active_mw,
        load_active_total_mw=load_active_total_mw,
        losses_pct_of_load=losses_pct,
        threshold_pct=threshold_pct,
        threshold_why_pl=UZASADNIENIE_PROGU_STRAT_PL,
        in_range=in_range,
        status=CREDIBLE if in_range else OUT_OF_RANGE,
        why_pl=why,
    )
