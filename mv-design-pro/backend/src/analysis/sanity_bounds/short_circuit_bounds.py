"""Sanity-bounds dla prądu zwarciowego per poziom napięcia (DEF-01 / K-08).

Warstwa INTERPRETACJI (Z15): czyta wynik solvera IEC 60909 (FROZEN) i ocenia jego
wiarygodność wobec twardych granic fizycznych dla danego poziomu napięcia. NIE liczy
fizyki. Łapie absurdy (np. Ik'' = 116 kA na SN 15 kV) ZANIM trafią na SLD i do
pakietu OSD — wynik poza zakresem dostaje status „poza zakresem wiarygodności" i
blokadę wejścia do pakietu (§6.2).

Poziom napięcia węzła z JEDNEGO źródła pasm (`network_model/pochodne/pasma_napieciowe.py`,
`poziom_napiecia` — IEC 60038 tab. 1 i rozporządzenie w sprawie szczegółowych warunków
funkcjonowania systemu elektroenergetycznego, zał. 1 cz. I pkt 2.2/3.2); granice wiarygodności
oparte o typowe wytrzymałości zwarciowe aparatury danego poziomu:
- niskie napięcie (nN, do 1 kV włącznie): rozdzielnice nN do ~150 kA przy transformatorze;
- średnie napięcie (SN, powyżej 1 kV i poniżej 110 kV): aparatura 16/20/25/31,5/40 kA →
  górna granica wiarygodności 50 kA;
- wysokie napięcie (WN, od 110 kV do poniżej 220 kV): aparatura do 63 kA;
- najwyższe napięcie (NN, od 220 kV): do 80 kA.
Dolna granica > 0 — Ik'' ≤ 0 jest niefizyczny.
"""

from __future__ import annotations

from dataclasses import dataclass

from network_model.pochodne.pasma_napieciowe import Poziom, poziom_napiecia

#: Granice wiarygodności Ik'' [kA] (dolna, górna) per poziom napięcia węzła.
_GRANICE_IKSS_KA: dict[Poziom, tuple[float, float]] = {
    "nN": (0.05, 150.0),
    "SN": (0.1, 50.0),
    "WN": (0.5, 63.0),
    "NN": (1.0, 80.0),
}

#: Liczba leży w paśmie fizycznie możliwym dla poziomu napięcia. Etykieta „zweryfikowany"
#: (do 2026-09-23) twierdziła weryfikację — wyrocznię albo pomiar — której ta kontrola NIE
#: wykonuje: sprawdza wyłącznie pasmo wiarygodności (uczciwość natychmiastowa, audyt
#: harmonicznych 2026-09-23). Jedna stała dla całej rodziny pasm — rozpływ i blok wiarygodności
#: analiz V12.6 (`application/v126_artifacts.py`) biorą ją importem.
CREDIBLE = "w paśmie wiarygodności"
OUT_OF_RANGE = "poza zakresem wiarygodności"
INCOMPLETE = "dane niekompletne"


@dataclass(frozen=True)
class ShortCircuitSanityVerdict:
    voltage_kv: float | None
    ikss_ka: float | None
    voltage_band: str | None
    lower_ka: float | None
    upper_ka: float | None
    in_range: bool
    status: str
    why_pl: str
    blocks_osd_package: bool  # True ⇒ wynik nie wchodzi do pakietu OSD bez decyzji

    def to_dict(self) -> dict[str, object]:
        return {
            "voltage_kv": self.voltage_kv,
            "ikss_ka": self.ikss_ka,
            "voltage_band": self.voltage_band,
            "lower_ka": self.lower_ka,
            "upper_ka": self.upper_ka,
            "in_range": self.in_range,
            "status": self.status,
            "why_pl": self.why_pl,
            "blocks_osd_package": self.blocks_osd_package,
        }


def evaluate_short_circuit_current(
    voltage_kv: float | None,
    ikss_ka: float | None,
) -> ShortCircuitSanityVerdict:
    """Ocena wiarygodności Ik'' wobec granic dla poziomu napięcia.

    Napięcie brakujące, niedodatnie albo nieskończone nie ma poziomu (`poziom_napiecia`
    zwraca ``None``) — ocena jest wtedy uczciwie niekompletna, tak samo jak przy braku Ik''.
    """
    name = poziom_napiecia(voltage_kv)
    if name is None or ikss_ka is None or not _is_finite(ikss_ka):
        return ShortCircuitSanityVerdict(
            voltage_kv=voltage_kv,
            ikss_ka=ikss_ka,
            voltage_band=None,
            lower_ka=None,
            upper_ka=None,
            in_range=False,
            status=INCOMPLETE,
            why_pl="Brak poprawnego napięcia lub Ik'' do oceny wiarygodności.",
            blocks_osd_package=False,
        )
    min_ka, max_ka = _GRANICE_IKSS_KA[name]
    in_range = min_ka <= ikss_ka <= max_ka
    if in_range:
        # Liczby w tekście z ustaloną precyzją (3 miejsca kA, `g` dla granic i napięcia):
        # surowy `repr` floata (15–17 cyfr) różnił się ostatnią cyfrą między maszynami
        # (CI 2026-09-16, run 5030: „4.611507168332454" vs „…455" w tym samym commicie),
        # a projektant i tak czyta kA z dokładnością do ampera.
        why = f"Ik'' = {ikss_ka:.3f} kA mieści się w zakresie [{min_ka:g}; {max_ka:g}] kA dla {name} ({voltage_kv:g} kV)."
    elif ikss_ka > max_ka:
        why = (
            f"Ik'' = {ikss_ka:.3f} kA przekracza górną granicę wiarygodności {max_ka:g} kA "
            f"dla {name} ({voltage_kv:g} kV) — wartość fizycznie wątpliwa (błąd jednostek/poziomu?). "
            "Zablokowane przed wejściem do pakietu OSD."
        )
    else:
        why = (
            f"Ik'' = {ikss_ka:.3f} kA poniżej dolnej granicy {min_ka:g} kA dla {name} ({voltage_kv:g} kV) "
            "— sprawdź model źródła/impedancje."
        )
    return ShortCircuitSanityVerdict(
        voltage_kv=voltage_kv,
        ikss_ka=ikss_ka,
        voltage_band=name,
        lower_ka=min_ka,
        upper_ka=max_ka,
        in_range=in_range,
        status=CREDIBLE if in_range else OUT_OF_RANGE,
        why_pl=why,
        blocks_osd_package=not in_range,
    )


def _is_finite(value: float) -> bool:
    return value == value and value not in (float("inf"), float("-inf"))
