"""Rekordy werdyktu wyjaśnialnego wrażliwości zapasu kryterium (karta WERDYKT-MIGRACJA-190).

Każdy wpis wrażliwości (stan bazowy oraz perturbacje −delta % i +delta %) niesie rekord K:
zapas do progu kryterium (liczba z buildera, bez zmiany) wobec zera z podstawą progu, dowód
i zakres ważności. Kody zastane ``base_decision``/``decision`` są PROJEKCJĄ rekordu
(``projekcja_statusu``) — zapas równy zeru spełnia relację, brak zapasu nie jest spełnieniem.

Warstwa ANALIZY — zero fizyki: zapas przychodzi gotowy z buildera, tu wyłącznie porównanie
z zerem przez pakiet ``werdykt`` (jedna reguła decyzji produktu).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final, Literal

from analysis.normative.kryteria_napiecia import KRYTERIUM_OSTRZEZENIE_PODSTAWA_PL
from analysis.sensitivity.models import SensitivityDecision
from solver_input.provenance import classify_dynamic_capability
from werdykt import (
    DziedzinaFizyki,
    OcenaKryterium,
    OdnosnikSladu,
    PodstawaWymagania,
    Przedmiot,
    ZakresWaznosci,
)
from werdykt.porownanie import (
    Porownanie,
    ocena_porownania,
    podstawa_normy,
    podstawa_zalozenia,
    projekcja_statusu,
)

ZDOLNOSC_WRAZLIWOSCI: Final = "wrazliwosc.zapas_kryterium"

Wariant = Literal["bazowy", "minus", "plus"]


@dataclass(frozen=True)
class _Definicja:
    opis_pl: str
    wielkosc_pl: str
    podstawa: PodstawaWymagania
    rodzaj_analizy: DziedzinaFizyki


_PODSTAWA_APARATURY: Final = podstawa_normy(
    "IEC 62271-1 i IEC 62271-100 (aparatura rozdzielcza wysokiego napięcia)",
    "2017; 2021",
    "62271-1 5.6 i 5.7 — prądy znamionowe krótkotrwały i szczytowy wytrzymywane; "
    "62271-100 5.101 — znamionowy prąd wyłączalny zwarciowy",
)

_DEFINICJE: Final[dict[str, _Definicja]] = {
    "voltage_limit": _Definicja(
        opis_pl="Zapas odchyłki napięcia węzła do progu kryterium napięciowego",
        wielkosc_pl=(
            "zapas = próg − |ΔU| (próg ostrzeżenia, a po przekroczeniu progu przekroczenia — "
            "próg przekroczenia)"
        ),
        podstawa=podstawa_zalozenia(
            "Kryteria napięciowe SN programu (profil napięć i ocena normatywna)",
            "próg ostrzeżenia ± 5 % Un i próg przekroczenia ± 10 % Un (PN-EN 50160)",
            uwagi_pl=KRYTERIUM_OSTRZEZENIE_PODSTAWA_PL,
        ),
        rodzaj_analizy="POWER_FLOW",
    ),
    "load_q": _Definicja(
        opis_pl="Zapas obciążenia prądowego elementu do progu oceny normatywnej",
        wielkosc_pl="zapas = próg − k_I (próg z pozycji oceny normatywnej)",
        podstawa=podstawa_zalozenia(
            "Konfiguracja oceny normatywnej programu (NormativeConfig)",
            "progi obciążenia (loading_warn_pct, loading_fail_pct)",
        ),
        rodzaj_analizy="POWER_FLOW",
    ),
    "load_p": _Definicja(
        opis_pl="Zapas obciążenia mocowego elementu do progu oceny normatywnej",
        wielkosc_pl="zapas = próg − k_S (próg z pozycji oceny normatywnej)",
        podstawa=podstawa_zalozenia(
            "Konfiguracja oceny normatywnej programu (NormativeConfig)",
            "progi obciążenia (loading_warn_pct, loading_fail_pct)",
        ),
        rodzaj_analizy="POWER_FLOW",
    ),
    "short_circuit_level": _Definicja(
        opis_pl=(
            "Zapas wytrzymałości zwarciowej aparatu przy zmianie poziomu prądów zwarciowych "
            "(najsłabszy z warunków Ik'' ≤ Icu, ip ≤ Idyn, Ith ≤ Ith,lim)"
        ),
        wielkosc_pl="zapas względny = min[(limit − wielkość) / limit] · 100 %",
        podstawa=_PODSTAWA_APARATURY,
        rodzaj_analizy="SHORT_CIRCUIT",
    ),
    "protection_margin": _Definicja(
        opis_pl=(
            "Zapas wytrzymałości zwarciowej aparatu przy zmianie wartości znamionowych "
            "(najsłabszy z warunków Ik'' ≤ Icu, ip ≤ Idyn, Ith ≤ Ith,lim)"
        ),
        wielkosc_pl="zapas względny = min[(limit − wielkość) / limit] · 100 %",
        podstawa=_PODSTAWA_APARATURY,
        rodzaj_analizy="SHORT_CIRCUIT",
    ),
    "protection_curve_margin": _Definicja(
        opis_pl="Zapas koordynacji krzywych czasowo-prądowych zabezpieczeń",
        wielkosc_pl="najmniejszy margines koordynacji krzywych I–t",
        podstawa=podstawa_zalozenia(
            "Widok krzywych zabezpieczeń I–t programu (analysis/protection_curves_it)",
            "marginesy koordynacji krzywych zabezpieczeń (margins_pct)",
        ),
        rodzaj_analizy="SHORT_CIRCUIT",
    ),
}

_OPIS_WARIANTU: Final[dict[Wariant, str]] = {
    "bazowy": "stan bazowy przebiegu",
    "minus": "zmiana wielkości o −{delta} %",
    "plus": "zmiana wielkości o +{delta} %",
}


def ocena_zapasu(
    *,
    parameter_id: str,
    wariant: Wariant,
    delta_pct: float,
    target_id: str,
    nazwa_pl: str,
    zapas: float | None,
    jednostka: str | None,
) -> OcenaKryterium:
    """Rekord K zapasu kryterium ``parameter_id`` w wariancie perturbacji. ``zapas is None`` —
    zapasu nie wyznaczono (brak wielkości albo progu); reguła daje ``NIE_OCENIONO``."""
    d = _DEFINICJE[parameter_id]
    stan_pl = _OPIS_WARIANTU[wariant].format(delta=f"{abs(delta_pct):g}".replace(".", ","))
    return ocena_porownania(
        Porownanie(
            kryterium_id=f"wrazliwosc.{parameter_id}.{wariant}",
            opis_pl=f"{d.opis_pl} — {stan_pl}",
            warunek_latex=r"\text{zapas} \ge 0",
            relacja="NIE_MNIEJ",
            wielkosc_pl=d.wielkosc_pl,
            symbol_latex=r"\text{zapas}",
            jednostka=jednostka or "%",
            wynik=zapas,
            limit=0.0,
            limit_pl="zapas zerowy — wielkość na progu kryterium",
            braki=(
                ()
                if zapas is not None
                else ("zapas do progu — brak wielkości albo progu kryterium w danych wejściowych",)
            ),
        ),
        przedmiot=Przedmiot(
            element_ref=target_id,
            nazwa_pl=nazwa_pl,
            opis_pl=d.opis_pl,
        ),
        podstawa=d.podstawa,
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_WRAZLIWOSCI),
        zakres=ZakresWaznosci(
            rodzaj_analizy=d.rodzaj_analizy,
            opis_pl=f"Analiza wrażliwości gotowego wyniku — {stan_pl}",
            wykluczenia=(
                "perturbacja przeskalowuje wynik bazowy liniowo — nie jest nowym biegiem obliczeń",
            ),
        ),
        slad=(
            (
                OdnosnikSladu(
                    krok=f"sensitivity.{parameter_id}.{wariant}",
                    opis_pl="Zapas do progu kryterium w analizie wrażliwości",
                ),
            )
            if zapas is not None
            else ()
        ),
        odniesienie="analysis/sensitivity/builder.py",
    )


def decyzja(ocena: OcenaKryterium) -> SensitivityDecision:
    """Kod zastany wpisu wyprowadzony z rekordu (jedno źródło rozstrzygnięcia)."""
    return SensitivityDecision(
        projekcja_statusu(
            (ocena,),
            spelnia=SensitivityDecision.PASS.value,
            nie_spelnia=SensitivityDecision.FAIL.value,
            nierozstrzygniete=SensitivityDecision.NOT_COMPUTED.value,
        )
    )
