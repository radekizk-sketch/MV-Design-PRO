"""Adapter wyników FROZEN analiz V12.6 na wynik inżynierski (karta AB-1a D2/D7).

PO CO. Solver ``network_model/solvers/v126_academic.py`` (FROZEN, B-01) wydaje dwa
werdykty jako goły literał w słowniku (pomiar guardu werdyktu na HEAD 2026-09-23):

* ``_ner_design`` → ``thermal_check.status = "zgodny"/"niezgodny"`` (sprawdzenie
  cieplne rezystora uziemiającego punkt neutralny: energia ``I_ef²·R·t`` wobec energii
  znamionowej) — liczby są obok, ale pod nazwami, których odbiorca nie wiąże z
  werdyktem, bez podstawy i bez dowodu;
* ``_benchmark_validation`` → ``status = "PASS"/"FAIL"`` wiersza i całości (odchyłka
  od wartości referencyjnej wobec tolerancji).

Kontrakt solvera nie może dostać pól, więc ten adapter składa z TYCH SAMYCH liczb
obiekt wyniku wyjaśnialnego (``PozycjaWerdyktu`` + ``OcenaElementu`` z
``werdykt_projektowy.py`` — zero trzeciego kontraktu, R-2) i trasa
``GET /api/analysis-runs/{run_id}/results/v126/{analysis_type}`` dokłada go
ADDYTYWNIE jako ``wynik_inzynierski``. Adapter niczego nie liczy poza zapasem z
dwóch liczb solvera (``_ocena_elementu`` — arytmetyka prezentacji, jedno źródło z
ekranem „Ocena techniczna").

Wynik ``power_quality_harmonics`` (``compatibility_status``) NIE dostaje adaptera:
zdolność jest wycofywana (kamień AB-1d_min — audyt harmoniczny, REJECT), pozycja
listy wyjątków guardu niesie adnotację ``WYCOFYWANA_AB-1d_min``.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from application.analyses.werdykt_projektowy import (
    GRUPA_WYTRZYMALOSC,
    STAN_NARUSZONE,
    STAN_NIESPRAWDZONE,
    STAN_SPELNIONE,
    WARUNEK_NIE_WIECEJ,
    WYNIK_BRAK_PODSTAW,
    WYNIK_NIE_SPELNIA,
    WYNIK_SPELNIA,
    ZRODLO_NIEZWERYFIKOWANE,
    ZRODLO_V126_BENCHMARK,
    ZRODLO_V126_NER,
    DefinicjaKryterium,
    PodstawaNormatywna,
    PozycjaWerdyktu,
    _ocena_elementu,
)

_PODSTAWA_NER = PodstawaNormatywna(
    dokument=None,
    wersja=None,
    klauzula=None,
    zrodlo_status=ZRODLO_NIEZWERYFIKOWANE,
    uwaga_pl=(
        "Warunek cieplny rezystora uziemiającego (energia wydzielona w czasie wyłączenia "
        "nie większa od energii znamionowej z danych producenta) — solver nie wskazuje "
        "dokumentu normowego tego warunku; energia znamionowa pochodzi z parametru biegu."
    ),
)
_PODSTAWA_BENCHMARK = PodstawaNormatywna(
    dokument=None,
    wersja=None,
    klauzula=None,
    zrodlo_status=ZRODLO_NIEZWERYFIKOWANE,
    uwaga_pl=(
        "Tolerancja i wartość referencyjna pochodzą z danych wejściowych biegu (sieć "
        "odniesienia wskazana przez użytkownika); solver nie weryfikuje ich źródła."
    ),
)

_DEF_NER = DefinicjaKryterium(
    kryterium_id="v126.ner.wytrzymalosc_cieplna",
    etap="E4",
    nazwa_pl="Wytrzymałość cieplna rezystora uziemiającego punkt neutralny",
    warunek_pl="Energia wydzielona w rezystorze nie większa od energii znamionowej",
    norma_pl=_PODSTAWA_NER.render_pl(),
    zrodlo=ZRODLO_V126_NER,
    element_rodzaj=None,
    grupa=GRUPA_WYTRZYMALOSC,
    wielkosc_pl="Energia wydzielona w rezystorze w czasie wyłączenia doziemienia",
    symbol="E",
    jednostka="J",
    warunek=WARUNEK_NIE_WIECEJ,
    symbol_latex=r"E",
    warunek_latex=r"E = I_{ef}^{2} R\, t_{w} \leq E_{\mathrm{zn}}",
)
_DEF_BENCHMARK = DefinicjaKryterium(
    kryterium_id="v126.benchmark.odchylka",
    etap="E4",
    nazwa_pl="Odchyłka wyniku od wartości referencyjnej sieci odniesienia",
    warunek_pl="Odchyłka względna nie większa od tolerancji",
    norma_pl=_PODSTAWA_BENCHMARK.render_pl(),
    zrodlo=ZRODLO_V126_BENCHMARK,
    element_rodzaj=None,
    grupa=GRUPA_WYTRZYMALOSC,
    wielkosc_pl="Odchyłka względna od wartości referencyjnej",
    symbol="δ",
    jednostka="%",
    warunek=WARUNEK_NIE_WIECEJ,
    symbol_latex=r"\delta",
    warunek_latex=r"\delta = \dfrac{|x - x_{\mathrm{ref}}|}{|x_{\mathrm{ref}}|} \leq \delta_{\mathrm{tol}}",
)

_WYNIK_Z_LITERALU: dict[str, str] = {
    "zgodny": WYNIK_SPELNIA,
    "niezgodny": WYNIK_NIE_SPELNIA,
    "PASS": WYNIK_SPELNIA,
    "FAIL": WYNIK_NIE_SPELNIA,
}


def _stan(wyniki: list[str]) -> str:
    if WYNIK_NIE_SPELNIA in wyniki:
        return STAN_NARUSZONE
    if not wyniki or WYNIK_BRAK_PODSTAW in wyniki:
        return STAN_NIESPRAWDZONE
    return STAN_SPELNIONE


def z_proby_cieplnej_ner(run_id: str, result: Mapping[str, Any]) -> PozycjaWerdyktu:
    """``thermal_check`` doboru rezystora NER jako pozycja wyniku wyjaśnialnego."""
    proba = result.get("thermal_check")
    if not isinstance(proba, Mapping):
        return PozycjaWerdyktu(
            definicja=_DEF_NER,
            stan=STAN_NIESPRAWDZONE,
            powod_pl=str(result.get("message_pl") or "Brak sprawdzenia cieplnego w wyniku."),
            run_id=run_id,
            podstawa=_PODSTAWA_NER,
        )
    wynik = _WYNIK_Z_LITERALU.get(str(proba.get("status")), WYNIK_BRAK_PODSTAW)
    brakujace = [str(pole) for pole in (proba.get("missing_fields") or [])]
    element = _ocena_elementu(
        _DEF_NER,
        element_id="rezystor_uziemiajacy",
        element_nazwa="Rezystor uziemiający punkt neutralny",
        wynik=wynik,
        wartosc=proba.get("energy_dissipated_j"),
        odniesienie=proba.get("energy_rating_j"),
        uzasadnienie_pl=(
            f"Brak danych do sprawdzenia cieplnego: {', '.join(brakujace)}." if brakujace else None
        ),
        run_id=run_id,
    )
    return PozycjaWerdyktu(
        definicja=_DEF_NER,
        stan=_stan([wynik]),
        liczba_ocenionych=0 if wynik == WYNIK_BRAK_PODSTAW else 1,
        liczba_naruszen=1 if wynik == WYNIK_NIE_SPELNIA else 0,
        liczba_niesprawdzonych=1 if wynik == WYNIK_BRAK_PODSTAW else 0,
        run_id=run_id,
        elementy=(element,),
        podstawa=_PODSTAWA_NER,
    )


def z_walidacji_benchmarkow(run_id: str, result: Mapping[str, Any]) -> PozycjaWerdyktu:
    """Wiersze ``validation_report`` walidacji porównawczej jako pozycja wyniku."""
    wiersze = [w for w in (result.get("validation_report") or []) if isinstance(w, Mapping)]
    if not wiersze:
        return PozycjaWerdyktu(
            definicja=_DEF_BENCHMARK,
            stan=STAN_NIESPRAWDZONE,
            powod_pl=str(result.get("message_pl") or "Brak wierszy walidacji w wyniku."),
            run_id=run_id,
            podstawa=_PODSTAWA_BENCHMARK,
        )
    elementy = tuple(
        _ocena_elementu(
            _DEF_BENCHMARK,
            element_id=f"{wiersz.get('network')}:{wiersz.get('test')}",
            element_nazwa=f"{wiersz.get('network')} — {wiersz.get('test')}",
            wynik=_WYNIK_Z_LITERALU.get(str(wiersz.get("status")), WYNIK_BRAK_PODSTAW),
            wartosc=wiersz.get("delta_percent"),
            odniesienie=wiersz.get("tolerance_percent"),
            run_id=run_id,
        )
        for wiersz in wiersze
    )
    wyniki = [e.wynik for e in elementy]
    return PozycjaWerdyktu(
        definicja=_DEF_BENCHMARK,
        stan=_stan(wyniki),
        liczba_ocenionych=sum(1 for w in wyniki if w != WYNIK_BRAK_PODSTAW),
        liczba_naruszen=sum(1 for w in wyniki if w == WYNIK_NIE_SPELNIA),
        liczba_niesprawdzonych=sum(1 for w in wyniki if w == WYNIK_BRAK_PODSTAW),
        run_id=run_id,
        elementy=elementy,
        podstawa=_PODSTAWA_BENCHMARK,
    )


def wynik_inzynierski_v126(
    analysis_type: str, run_id: str, result: Mapping[str, Any]
) -> dict[str, Any] | None:
    """Pozycja wyniku wyjaśnialnego dla biegu V12.6 albo ``None`` (rodzaj bez werdyktu).

    Rozgałęzienie JAWNE (nie słownik funkcji), żeby graf wywołań trasa → adapter był
    widoczny statycznie — guard werdyktu przypina, że każdy adapter z listy
    wyjątków jest osiągalny z trasy API.
    """
    if analysis_type == "neutral_earthing_design":
        return z_proby_cieplnej_ner(run_id, result).to_dict()
    if analysis_type == "benchmark_validation":
        return z_walidacji_benchmarkow(run_id, result).to_dict()
    return None


__all__ = ["wynik_inzynierski_v126", "z_proby_cieplnej_ner", "z_walidacji_benchmarkow"]
