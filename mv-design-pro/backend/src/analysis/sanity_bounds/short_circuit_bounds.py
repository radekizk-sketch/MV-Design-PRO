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

from collections.abc import Sequence
from dataclasses import dataclass

from analysis.sanity_bounds.oceny import (
    CREDIBLE,
    INCOMPLETE,
    OUT_OF_RANGE,
    PODSTAWA_PASMA_IKSS,
    kod_wiarygodnosci,
    liczba_pl,
    ocena_pasma,
)
from network_model.pochodne.pasma_napieciowe import Poziom, poziom_napiecia
from werdykt import DanaPrzyjeta, OcenaKryterium, WyjasnienieWerdyktu

#: Granice wiarygodności Ik'' [kA] (dolna, górna) per poziom napięcia węzła.
_GRANICE_IKSS_KA: dict[Poziom, tuple[float, float]] = {
    "nN": (0.05, 150.0),
    "SN": (0.1, 50.0),
    "WN": (0.5, 63.0),
    "NN": (1.0, 80.0),
}

# ``CREDIBLE`` — liczba leży w paśmie fizycznie możliwym dla poziomu napięcia. Etykieta
# „zweryfikowany" (do 2026-09-23) twierdziła weryfikację — wyrocznię albo pomiar — której ta
# kontrola NIE wykonuje: sprawdza wyłącznie pasmo wiarygodności (uczciwość natychmiastowa, audyt
# harmonicznych 2026-09-23). Jedna stała dla całej rodziny pasm (``analysis.sanity_bounds.
# oceny``) — rozpływ i blok wiarygodności analiz V12.6 (`application/v126_artifacts.py`) biorą
# ją importem.
__all__ = [
    "CREDIBLE",
    "INCOMPLETE",
    "OUT_OF_RANGE",
    "ShortCircuitSanityVerdict",
    "evaluate_short_circuit_current",
]


@dataclass(frozen=True)
class ShortCircuitSanityVerdict:
    """Ocena wiarygodności Ik'' punktu. ``ocena`` — rekord werdyktu wyjaśnialnego (poziom K),
    ``status``/``in_range``/``blocks_osd_package`` są jego projekcją."""

    voltage_kv: float | None
    ikss_ka: float | None
    voltage_band: str | None
    lower_ka: float | None
    upper_ka: float | None
    in_range: bool
    status: str
    ocena: OcenaKryterium
    wyjasnienie: WyjasnienieWerdyktu
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
            "ocena": self.ocena.model_dump(mode="json"),
            "wyjasnienie": self.wyjasnienie.model_dump(mode="json"),
            "why_pl": self.why_pl,
            "blocks_osd_package": self.blocks_osd_package,
        }


def evaluate_short_circuit_current(
    voltage_kv: float | None,
    ikss_ka: float | None,
    *,
    nazwa_pl: str = "punkt zwarcia",
    dane_przyjete: Sequence[DanaPrzyjeta] = (),
) -> ShortCircuitSanityVerdict:
    """Ocena wiarygodności Ik'' wobec granic dla poziomu napięcia.

    Napięcie brakujące, niedodatnie albo nieskończone nie ma poziomu (`poziom_napiecia`
    zwraca ``None``) — ocena jest wtedy uczciwie niekompletna, tak samo jak przy braku Ik''.
    ``dane_przyjete`` — wartości robocze, na których stoi Ik'' punktu (dowód niepełny).
    """
    name = poziom_napiecia(voltage_kv)
    kompletne = name is not None and ikss_ka is not None and _is_finite(ikss_ka)
    granice = _GRANICE_IKSS_KA[name] if name is not None else None
    braki: tuple[str, ...] = ()
    if name is None:
        braki += ("Napięcie znamionowe węzła (poziom napięcia) z modelu.",)
    if ikss_ka is None or not _is_finite(ikss_ka):
        braki += ("Prąd zwarciowy początkowy Ik'' punktu z biegu IEC 60909.",)
    ocena = ocena_pasma(
        kryterium_id="wiarygodnosc.prad_zwarciowy",
        opis_pl="Prąd zwarciowy początkowy w paśmie fizycznie możliwym dla poziomu napięcia",
        warunek_latex=r"I_{k,\min}'' \le I_k'' \le I_{k,\max}''",
        wielkosc_pl="prąd zwarciowy początkowy Ik''",
        symbol_latex=r"I_k''",
        jednostka="kA",
        relacja="PASMO",
        wynik=ikss_ka if kompletne else None,
        pasmo=granice,
        nazwa_pl=nazwa_pl,
        opis_przedmiotu_pl="Węzeł zwarcia w biegu IEC 60909",
        podstawa=PODSTAWA_PASMA_IKSS,
        rodzaj_analizy="SHORT_CIRCUIT",
        braki=braki,
        dane_przyjete=dane_przyjete,
    )
    status = kod_wiarygodnosci(ocena)
    if not kompletne or granice is None or ikss_ka is None or voltage_kv is None:
        return ShortCircuitSanityVerdict(
            voltage_kv=voltage_kv,
            ikss_ka=ikss_ka,
            voltage_band=None,
            lower_ka=None,
            upper_ka=None,
            in_range=status == CREDIBLE,
            status=status,
            ocena=ocena,
            wyjasnienie=ocena.wyjasnienie,
            why_pl="Brak poprawnego napięcia lub Ik'' do oceny wiarygodności.",
            blocks_osd_package=status == OUT_OF_RANGE,
        )
    min_ka, max_ka = granice
    # Jedno zdanie liczbowe dla każdego stanu (rozstrzygnięcie niesie rekord ``ocena``). Liczby
    # z ustaloną precyzją (3 miejsca kA, `g` dla granic i napięcia): surowy `repr` floata
    # (15–17 cyfr) różnił się ostatnią cyfrą między maszynami (CI 2026-09-16, run 5030).
    why = (
        f"Ik'' = {liczba_pl(ikss_ka, '.3f')} kA wobec pasma wiarygodności "
        f"[{liczba_pl(min_ka, 'g')}; {liczba_pl(max_ka, 'g')}] kA "
        f"dla {name} ({liczba_pl(voltage_kv, 'g')} kV)."
    )
    if status == OUT_OF_RANGE:
        # Skutek procesowy (nie słowo werdyktu): wynik poza pasmem nie wchodzi do pakietu OSD.
        why += " Wynik zablokowany przed wejściem do pakietu OSD."
    return ShortCircuitSanityVerdict(
        voltage_kv=voltage_kv,
        ikss_ka=ikss_ka,
        voltage_band=name,
        lower_ka=min_ka,
        upper_ka=max_ka,
        in_range=status == CREDIBLE,
        status=status,
        ocena=ocena,
        wyjasnienie=ocena.wyjasnienie,
        why_pl=why,
        blocks_osd_package=status == OUT_OF_RANGE,
    )


def _is_finite(value: float) -> bool:
    return value == value and value not in (float("inf"), float("-inf"))
