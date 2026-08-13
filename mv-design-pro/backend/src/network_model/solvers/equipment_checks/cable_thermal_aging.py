"""STARZENIE TERMICZNE izolacji kabla — regula Montsingera (2^(ΔT/10)).

DLACZEGO TEN MODUL POWSTAL (karta KD-3, dlug §7.4 pozycja 3). Dobor kabla
sprawdza obciazalnosc dlugotrwala, zmiane napiecia i wytrzymalosc zwarciowa —
czyli to, czy kabel PRZETRWA. Nie odpowiadal na pytanie, JAK DLUGO: praca kilka
stopni powyzej temperatury znamionowej izolacji nie wywoluje zadnej awarii
„teraz", a skraca zywotnosc kabla o polowe co kolejne 10 °C. To wlasnie ten
rachunek odrozniamy od obciazalnosci: obciazalnosc mowi „wolno", starzenie mowi
„jakim kosztem".

PODSTAWA FIZYCZNA. Degradacja izolacji polimerowej jest procesem chemicznym,
ktorego szybkosc rosnie wykladniczo z temperatura (Arrhenius). Praktyczne
przyblizenie inzynierskie — regula Montsingera, zwana tez „regula 10 stopni":

    V = 2^((θ_pracy − θ_zn) / 10)          [wzgledny wspolczynnik starzenia]
    L_wzgl = 1 / V                          [wzgledna zywotnosc]

Podwyzszenie temperatury o 10 °C ponad znamionowa PODWAJA szybkosc starzenia
(V = 2, zywotnosc 0,5); obnizenie o 10 °C ja polowi.

TEMPERATURA ODNIESIENIA POCHODZI Z KATALOGU. θ_zn to dopuszczalna temperatura
DLUGOTRWALA zyly wyznaczona przez IZOLACJE tego kabla (XLPE 90 °C, PVC 70 °C) —
czytana z pozycji katalogowej, nigdy przyjmowana „typowo". Kabel bez typu
izolacji albo bez temperatury znamionowej daje wynik NIEDOSTEPNY z kodem
gotowosci: przyjecie 90 °C dla nieznanej izolacji zanizaloby starzenie kabla
PVC ponad szesnastokrotnie.

WHITE BOX. Wynik niesie roznice temperatur, wspolczynnik starzenia, wzgledna
zywotnosc, temperature odniesienia z jej zrodlem oraz pelny slad krokow.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from network_model.solvers.equipment_checks.slad import (
    STATUS_FAIL,
    STATUS_PASS,
    STATUS_UNAVAILABLE,
    dodatnia,
    liczba_tex,
    wartosc,
)

# Kanoniczne kody gotowosci (zsynchronizowane z domain.canonical_operations.READINESS_CODES).
READINESS_CABLE_INSULATION_DATA_MISSING = "cable.insulation_data_missing"
READINESS_CABLE_OPERATING_TEMPERATURE_MISSING = "cable.operating_temperature_missing"

#: Krok temperaturowy reguly Montsingera [°C] — podwojenie szybkosci starzenia.
KROK_MONTSINGERA_C = 10.0

_FORMULA_REF = "V = 2^((θ_pracy − θ_zn)/10);  L_wzgl = 1/V"


@dataclass(frozen=True)
class CableThermalAgingInput:
    """Dane wejsciowe oceny starzenia izolacji.

    ``temperatura_znamionowa_c`` i ``typ_izolacji`` pochodza z pozycji katalogowej
    kabla (``max_temperature_c``, ``insulation_type``); wiazanie robi koncowka.
    ``temperatura_pracy_c`` podaje projektant albo analiza obciazenia.
    """

    temperatura_pracy_c: float | None
    temperatura_znamionowa_c: float | None
    typ_izolacji: str | None = None


@dataclass(frozen=True)
class CableThermalAgingResult:
    """Wynik oceny starzenia izolacji kabla (WHITE BOX).

    ``status`` = PASS oznacza prace w temperaturze nie wyzszej od znamionowej
    (wspolczynnik starzenia ≤ 1), FAIL — prace przyspieszajaca starzenie.
    """

    status: str
    roznica_temperatur_c: float | None
    wspolczynnik_starzenia: float | None
    wzgledna_zywotnosc: float | None
    temperatura_znamionowa_c: float | None
    typ_izolacji: str | None
    readiness_codes: tuple[str, ...] = ()
    formula_ref: str = _FORMULA_REF
    white_box_trace: tuple[dict[str, Any], ...] = ()
    assumptions: tuple[str, ...] = ()

    @property
    def is_conclusive(self) -> bool:
        return self.status in (STATUS_PASS, STATUS_FAIL)


def check_cable_thermal_aging(data: CableThermalAgingInput) -> CableThermalAgingResult:
    """Policz wzgledny wspolczynnik starzenia izolacji wzgledem temperatury znamionowej."""
    theta_pracy = data.temperatura_pracy_c
    theta_zn = dodatnia(data.temperatura_znamionowa_c)
    izolacja = (data.typ_izolacji or "").strip() or None

    braki: list[str] = []
    if theta_zn is None or izolacja is None:
        braki.append(READINESS_CABLE_INSULATION_DATA_MISSING)
    if theta_pracy is None:
        braki.append(READINESS_CABLE_OPERATING_TEMPERATURE_MISSING)

    if theta_zn is None or izolacja is None or theta_pracy is None:
        return CableThermalAgingResult(
            status=STATUS_UNAVAILABLE,
            roznica_temperatur_c=None,
            wspolczynnik_starzenia=None,
            wzgledna_zywotnosc=None,
            temperatura_znamionowa_c=theta_zn,
            typ_izolacji=izolacja,
            readiness_codes=tuple(dict.fromkeys(braki)),
        )

    delta_t = theta_pracy - theta_zn
    wspolczynnik = 2.0 ** (delta_t / KROK_MONTSINGERA_C)
    zywotnosc = 1.0 / wspolczynnik
    status = STATUS_PASS if wspolczynnik <= 1.0 else STATUS_FAIL

    return CableThermalAgingResult(
        status=status,
        roznica_temperatur_c=delta_t,
        wspolczynnik_starzenia=wspolczynnik,
        wzgledna_zywotnosc=zywotnosc,
        temperatura_znamionowa_c=theta_zn,
        typ_izolacji=izolacja,
        readiness_codes=tuple(dict.fromkeys(braki)),
        white_box_trace=_slad_starzenia(
            theta_pracy_c=theta_pracy,
            theta_zn_c=theta_zn,
            izolacja=izolacja,
            delta_t_c=delta_t,
            wspolczynnik=wspolczynnik,
            zywotnosc=zywotnosc,
            status=status,
        ),
        assumptions=(
            "Regula Montsingera („regula 10 stopni”): kazde +10 °C ponad temperature "
            "znamionowa PODWAJA szybkosc starzenia izolacji.",
            f"Temperatura odniesienia θ_zn = {theta_zn} °C pochodzi z pozycji katalogowej "
            f"kabla (izolacja {izolacja}), nie z wartosci typowej.",
            "Wspolczynnik jest WZGLEDNY — opisuje stosunek szybkosci starzenia do "
            "warunkow znamionowych, nie zywotnosc bezwzgledna w latach.",
            "Rachunek zaklada stala temperature pracy; praca zmienna wymaga scalkowania "
            "wspolczynnika po profilu obciazenia.",
        ),
    )


def _slad_starzenia(
    *,
    theta_pracy_c: float,
    theta_zn_c: float,
    izolacja: str,
    delta_t_c: float,
    wspolczynnik: float,
    zywotnosc: float,
    status: str,
) -> tuple[dict[str, Any], ...]:
    """Kroki dowodowe reguly Montsingera; slad nie liczy nic od nowa."""
    return (
        {
            "step": 1,
            "key": "kabel_roznica_temperatur",
            "title": "Różnica temperatury pracy i temperatury znamionowej izolacji",
            "formula_latex": r"$$\Delta T = \theta_{pracy} - \theta_{zn}$$",
            "inputs": {
                "theta_pracy_c": wartosc(theta_pracy_c, "°C", "Temperatura pracy żyły"),
                "theta_zn_c": wartosc(theta_zn_c, "°C", "Temperatura znamionowa izolacji"),
                "izolacja": {"value": izolacja, "unit": "", "label": "Typ izolacji (katalog)"},
            },
            "substitution": (
                r"$$\Delta T = "
                + liczba_tex(theta_pracy_c)
                + r" - "
                + liczba_tex(theta_zn_c)
                + r" = "
                + liczba_tex(delta_t_c)
                + r"\ ^\circ\mathrm{C}$$"
            ),
            "result": {"delta_t_c": wartosc(delta_t_c, "°C", "Różnica temperatur")},
            "notes": (
                "Temperatura znamionowa jest własnością IZOLACJI odczytaną z katalogu — "
                "dla nieznanej izolacji kryterium nie ma podstawy."
            ),
        },
        {
            "step": 2,
            "key": "kabel_wspolczynnik_starzenia",
            "title": "Względny współczynnik starzenia (reguła Montsingera)",
            "formula_latex": r"$$V = 2^{\frac{\Delta T}{10}}$$",
            "inputs": {
                "delta_t_c": wartosc(delta_t_c, "°C", "Różnica temperatur"),
                "krok_c": wartosc(KROK_MONTSINGERA_C, "°C", "Krok podwojenia"),
            },
            "substitution": (
                r"$$V = 2^{\frac{"
                + liczba_tex(delta_t_c)
                + r"}{10}} = "
                + liczba_tex(wspolczynnik)
                + r"$$"
            ),
            "result": {
                "wspolczynnik": wartosc(wspolczynnik, "", "Współczynnik starzenia"),
                "werdykt": {"value": status, "unit": "", "label": "Werdykt"},
            },
            "notes": (
                "V > 1 oznacza starzenie szybsze niż znamionowe; V = 2 — dwukrotnie "
                "szybsze (temperatura wyższa o 10 °C)."
            ),
        },
        {
            "step": 3,
            "key": "kabel_wzgledna_zywotnosc",
            "title": "Względna żywotność izolacji",
            "formula_latex": r"$$L_{wzgl} = \frac{1}{V}$$",
            "inputs": {"wspolczynnik": wartosc(wspolczynnik, "", "Współczynnik starzenia")},
            "substitution": (
                r"$$L_{wzgl} = \frac{1}{"
                + liczba_tex(wspolczynnik)
                + r"} = "
                + liczba_tex(zywotnosc)
                + r"$$"
            ),
            "result": {"zywotnosc": wartosc(zywotnosc, "", "Względna żywotność")},
            "notes": (
                "Wartość względna wobec żywotności w warunkach znamionowych — nie jest "
                "liczbą lat i nie zastępuje danych producenta."
            ),
        },
    )
