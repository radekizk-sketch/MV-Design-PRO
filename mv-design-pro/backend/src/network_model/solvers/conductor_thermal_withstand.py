"""Kryterium wytrzymalosci zwarciowej PRZEWODU (IEC 60949 / PN-HD 60364-5-54).

Karta F-K1 programu FLOW (docs/uiux/AUDYT_I_PROJEKT_FLOW_2026-07.md, znalezisko Z1).

DLACZEGO TEN MODUL POWSTAL. Dobor przewodu sprawdzal dotad DWA kryteria:
obciazalnosc dlugotrwala oraz zmiane napiecia. Brakowalo trzeciego, normowego i w
sieciach SN czesto WIAZACEGO: czy przekroj wytrzyma prad zwarciowy przez czas, w
ktorym zabezpieczenie zwarcie wylaczy. Kabel poprawny pradowo i napieciowo moze
ulec zniszczeniu przy zwarciu.

Wszystkie skladniki tego rachunku byly juz w systemie i nie mialy odbiorcy:
katalog niesie Ith(1s) / Jth(1s) (IEC 60949), solver zwarciowy liczy Ith, analiza
zabezpieczen wyznacza czas wylaczenia. Ten modul jest ogniwem, ktore je zestawia.

PODSTAWA FIZYCZNA. Nagrzewanie zwarciowe zyly przyjmuje sie za ADIABATYCZNE
(czas zwarcia jest krotki wobec stalej czasowej odplywu ciepla do otoczenia), a
przyrost temperatury jest proporcjonalny do calki Joule'a:

    I^2 * t = const   =>   I_dop(t) = I_th(1s) * sqrt(1 s / t)

Ta sama zasada rownowaznej energii cieplnej rzadzi sprawdzeniem APARATU
(`application/equipment_proof/generator.py::_check_ith`) — tu stosujemy ja do
PRZEWODU. Rownowaznie, przez minimalny przekroj:

    S_min = I_th * sqrt(t) / k,   gdzie k = Jth(1s) [A/mm^2]

ZERO FABRYKACJI (precedens V12K-189). Brak ktorejkolwiek danej wejsciowej daje
wynik NIEDOSTEPNY z kanonicznym kodem gotowosci — nigdy wartosci zastepczej ani
domyslnej stalej materialowej. Zgadniety material zyly falszowalby werdykt
bezpieczenstwa.

WHITE BOX: wynik niesie prad dopuszczalny, wykorzystanie, minimalny przekroj,
uzyty wzor i zalozenia.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

# Kanoniczne kody gotowosci (zsynchronizowane z domain.canonical_operations.READINESS_CODES).
READINESS_CONDUCTOR_THERMAL_DATA_MISSING = "conductor.thermal_data_missing"
READINESS_FAULT_DURATION_MISSING = "conductor.fault_duration_missing"
READINESS_FAULT_CURRENT_MISSING = "conductor.fault_current_missing"

STATUS_PASS = "PASS"
STATUS_FAIL = "FAIL"
STATUS_UNAVAILABLE = "UNAVAILABLE"

_FORMULA_REF = "I_dop(t) = I_th(1s)·√(1 s / t);  S_min = I_th·√t / Jth(1s)"


@dataclass(frozen=True)
class ConductorThermalInput:
    """Dane wejsciowe sprawdzenia cieplnego przewodu.

    Kazde pole moze byc None — brak danej daje wynik NIEDOSTEPNY z kodem gotowosci,
    a nie liczbe zastepcza.

    ``ith_a``            — prad zwarciowy ekwiwalentny cieplnie [A] z biegu zwarciowego
                           (IEC 60909-0 §12: I_th = I″k·√(m+n)).
    ``fault_duration_s`` — czas trwania zwarcia [s] = czas wylaczenia zabezpieczenia
                           przy TYM pradzie (z analizy zabezpieczen), nie wartosc umowna.
    ``ith_1s_a``         — dopuszczalny prad cieplny przewodu dla 1 s [A] (katalog).
    ``jth_1s_a_per_mm2`` — gestosc pradu cieplnego dla 1 s [A/mm²] (katalog); potrzebna
                           wylacznie do wyznaczenia minimalnego przekroju.
    ``cross_section_mm2``— przekroj zastosowany [mm²]; do porownania z minimalnym.
    """

    ith_a: float | None
    fault_duration_s: float | None
    ith_1s_a: float | None
    jth_1s_a_per_mm2: float | None = None
    cross_section_mm2: float | None = None


@dataclass(frozen=True)
class ConductorThermalResult:
    """Wynik sprawdzenia cieplnego przewodu (WHITE BOX).

    ``status`` = UNAVAILABLE oznacza BRAK PODSTAWY do oceny (patrz ``readiness_codes``)
    i nie wolno go czytac jako spelnienia kryterium.
    """

    status: str
    admissible_current_a: float | None
    utilization: float | None
    required_cross_section_mm2: float | None
    margin_a: float | None
    readiness_codes: tuple[str, ...] = ()
    formula_ref: str = _FORMULA_REF
    assumptions: tuple[str, ...] = field(
        default_factory=lambda: (
            "Nagrzewanie zwarciowe adiabatyczne (bez odplywu ciepla do otoczenia).",
            "Rownowazna energia cieplna I²·t = const (IEC 60949).",
            "I_th to prad ekwiwalentny cieplnie z biegu zwarciowego, nie prad poczatkowy.",
            "Czas t to rzeczywisty czas wylaczenia zabezpieczenia przy tym pradzie.",
            "Wytrzymalosc przewodu odniesiona do 1 s wg danych katalogowych.",
        )
    )

    @property
    def is_conclusive(self) -> bool:
        """Czy wynik jest werdyktem (PASS/FAIL), a nie brakiem podstawy do oceny."""
        return self.status in (STATUS_PASS, STATUS_FAIL)


def _positive(value: float | None) -> float | None:
    if value is None:
        return None
    return value if value > 0.0 else None


def check_conductor_thermal_withstand(
    data: ConductorThermalInput,
) -> ConductorThermalResult:
    """Sprawdz, czy przewod wytrzyma prad zwarciowy przez czas wylaczenia.

    Zwraca werdykt PASS/FAIL albo UNAVAILABLE + kody gotowosci, gdy ktoregokolwiek
    ze skladnikow rachunku brakuje. Nie zgaduje zadnej wielkosci.
    """
    ith = _positive(data.ith_a)
    duration = _positive(data.fault_duration_s)
    ith_1s = _positive(data.ith_1s_a)

    braki: list[str] = []
    if ith is None:
        braki.append(READINESS_FAULT_CURRENT_MISSING)
    if duration is None:
        braki.append(READINESS_FAULT_DURATION_MISSING)
    if ith_1s is None:
        braki.append(READINESS_CONDUCTOR_THERMAL_DATA_MISSING)

    if braki:
        return ConductorThermalResult(
            status=STATUS_UNAVAILABLE,
            admissible_current_a=None,
            utilization=None,
            required_cross_section_mm2=None,
            margin_a=None,
            readiness_codes=tuple(dict.fromkeys(braki)),
        )

    # mypy: po sprawdzeniu brakow wszystkie trzy sa float
    assert ith is not None and duration is not None and ith_1s is not None

    sqrt_t = math.sqrt(duration)
    admissible = ith_1s / sqrt_t
    utilization = ith / admissible
    margin = admissible - ith

    jth = _positive(data.jth_1s_a_per_mm2)
    required_section = (ith * sqrt_t / jth) if jth is not None else None

    status = STATUS_PASS if ith <= admissible else STATUS_FAIL

    return ConductorThermalResult(
        status=status,
        admissible_current_a=admissible,
        utilization=utilization,
        required_cross_section_mm2=required_section,
        margin_a=margin,
        readiness_codes=(),
    )
