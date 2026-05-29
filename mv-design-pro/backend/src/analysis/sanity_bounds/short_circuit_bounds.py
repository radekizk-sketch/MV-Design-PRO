"""Sanity-bounds dla prądu zwarciowego per poziom napięcia (DEF-01 / K-08).

Warstwa INTERPRETACJI (Z15): czyta wynik solvera IEC 60909 (FROZEN) i ocenia jego
wiarygodność wobec twardych granic fizycznych dla danego poziomu napięcia. NIE liczy
fizyki. Łapie absurdy (np. Ik'' = 116 kA na SN 15 kV) ZANIM trafią na SLD i do
pakietu OSD — wynik poza zakresem dostaje status „poza zakresem wiarygodności" i
blokadę wejścia do pakietu (§6.2).

Granice oparte o typowe wytrzymałości zwarciowe aparatury i poziomy sieci:
- nN (≤ 1 kV): rozdzielnice nN do ~150 kA przy transformatorze;
- SN (1–60 kV): aparatura 16/20/25/31,5/40 kA → górna granica wiarygodności 50 kA;
- WN (60–150 kV): aparatura do 63 kA;
- NN/EHV (> 150 kV): do 80 kA.
Dolna granica > 0 — Ik'' ≤ 0 jest niefizyczny.
"""

from __future__ import annotations

from dataclasses import dataclass

# (opis_poziomu_pl, dolna_kV_włącznie, górna_kV_wyłącznie, min_ikss_kA, max_ikss_kA)
_VOLTAGE_BANDS: tuple[tuple[str, float, float, float, float], ...] = (
    ("nN", 0.0, 1.0, 0.05, 150.0),
    ("SN", 1.0, 60.0, 0.1, 50.0),
    ("WN", 60.0, 150.0, 0.5, 63.0),
    ("NN", 150.0, 1000.0, 1.0, 80.0),
)

CREDIBLE = "zweryfikowany"
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


def _band_for(voltage_kv: float) -> tuple[str, float, float, float, float] | None:
    for band in _VOLTAGE_BANDS:
        _, lo_kv, hi_kv, _, _ = band
        if lo_kv <= voltage_kv < hi_kv:
            return band
    return None


def evaluate_short_circuit_current(
    voltage_kv: float | None,
    ikss_ka: float | None,
) -> ShortCircuitSanityVerdict:
    """Ocena wiarygodności Ik'' wobec granic dla poziomu napięcia."""
    if (
        voltage_kv is None
        or ikss_ka is None
        or voltage_kv <= 0.0
        or not _is_finite(voltage_kv)
        or not _is_finite(ikss_ka)
    ):
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
    band = _band_for(voltage_kv)
    if band is None:
        return ShortCircuitSanityVerdict(
            voltage_kv=voltage_kv,
            ikss_ka=ikss_ka,
            voltage_band=None,
            lower_ka=None,
            upper_ka=None,
            in_range=False,
            status=INCOMPLETE,
            why_pl=f"Poziom napięcia {voltage_kv} kV poza zdefiniowanymi pasmami sanity.",
            blocks_osd_package=False,
        )
    name, _lo_kv, _hi_kv, min_ka, max_ka = band
    in_range = min_ka <= ikss_ka <= max_ka
    if in_range:
        why = f"Ik'' = {ikss_ka} kA mieści się w zakresie [{min_ka}; {max_ka}] kA dla {name} ({voltage_kv} kV)."
    elif ikss_ka > max_ka:
        why = (
            f"Ik'' = {ikss_ka} kA przekracza górną granicę wiarygodności {max_ka} kA "
            f"dla {name} ({voltage_kv} kV) — wartość fizycznie wątpliwa (błąd jednostek/poziomu?). "
            "Zablokowane przed wejściem do pakietu OSD."
        )
    else:
        why = (
            f"Ik'' = {ikss_ka} kA poniżej dolnej granicy {min_ka} kA dla {name} ({voltage_kv} kV) "
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
