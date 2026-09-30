"""Wiązanie rozpływu mocy: ZAPIS BIEGU → zamrożony wynik ``PowerFlowResultV1``.

STATUS: CANONICAL (karta PACK-ROZPLYW, rejestr V12K).

DEFEKT, KTÓRY TO ZAMYKA. Generator pakietu dowodowego rozpływu
(``application/proof_engine/packs/p14_power_flow.py``) nie miał żadnego konsumenta,
bo brakowało ogniwa między ZAPISANYM biegiem a wejściem dowodu. Kuszące „proste"
rozwiązanie — przeliczyć rozpływ jeszcze raz, żeby mieć obiekt wyniku — jest
zakazane: Proof Engine czyta wyniki READ-ONLY (kanon ``CLAUDE.md``), a drugie
uruchomienie solvera byłoby drugim źródłem prawdy o tym samym przebiegu.

WZORZEC BLIŹNIACZY: ``application/solvers/short_circuit_binding.py``
(``zwarcie_3f_ze_snapshotu``, ``wynik_zwarcia_1f_ze_snapshotu``) — tam warstwa
wiązania woła solver i oddaje pakietowi gotowy FROZEN wynik. Tu wiązanie jest
jeszcze węższe: bieg rozpływu ZAPISAŁ już ``PowerFlowResultV1.to_dict()``, więc
wiązanie wyłącznie ODTWARZA ten obiekt. **Ten moduł nie liczy niczego** — nie ma
tu ani jednego działania na wielkościach fizycznych; jest tylko odczyt, kontrola
kompletności i złożenie zamrożonej struktury z powrotem.

ZERO FABRYKACJI (warunek brzegowy karty). Każde pole ma pochodzić z zapisu biegu
albo NIE POWSTAĆ WCALE. Dlatego w całym module nie ma ani jednej wartości
domyślnej, ani jednego „zapasu": brak pola, wartość nieliczbowa, wartość
nieskończona i szyna, której solver nie policzył, kończą się
``BrakDanychRozplywuError`` z powodem po polsku. Dowód z podstawioną wartością
wygląda wiarygodnie i dlatego jest gorszy niż brak dowodu.

JEDNO ŹRÓDŁO PRAWDY DOSTĘPNOŚCI (reguła predykatów parami). Nie ma tu osobnego
predykatu „czy się da" i osobnej ścieżki „buduj". Brama pakietu
(``proof_engine/pakiet_biegu.py``) pyta o dostępność, PRÓBUJĄC odtworzyć wynik tą
samą funkcją, której użyje do budowy — więc „dostępny" nie może rozjechać się z
„da się pobrać" przy żadnych danych brzegowych.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from network_model.solvers.power_flow_result import (
    PowerFlowBranchResult,
    PowerFlowBusResult,
    PowerFlowResultV1,
    PowerFlowSummary,
)

#: Rodzaj wyniku, jaki zapisuje tor rozpływu (``enm.canonical_analysis``).
RODZAJ_WYNIKU_ROZPLYWU = "load_flow"

#: Faza kroku śladu White Box niosącego KOŃCOWE niedopasowanie — tę samą liczbę,
#: którą solver porównał z tolerancją. Bierzemy ją stąd, a nie z ostatniej
#: iteracji śladu rozpływu: lista iteracji bywa pusta (bieg zbieżny od stanu
#: początkowego), a wtedy „ostatnia iteracja" nie istnieje i trzeba by ZMYŚLIĆ zero.
_FAZA_KROKU_KONCOWEGO = "final"


class BrakDanychRozplywuError(ValueError):
    """Zapis biegu nie niesie danych, z których dowód mógłby powstać uczciwie.

    Komunikat jest po polsku i nazywa BRAKUJĄCĄ rzecz — brama pakietu pokazuje go
    projektantowi wprost, zamiast milczeć albo budować dowód z domysłów.
    """


@dataclass(frozen=True)
class RozplywZBiegu:
    """Odtworzony rozpływ przebiegu: zamrożony wynik + wielkości spoza wyniku.

    ``max_mismatch_pu`` i ``solver_version`` nie mieszczą się w kontrakcie FROZEN
    ``PowerFlowResultV1`` (pierwsza żyje w śladzie White Box, druga w artefakcie
    biegu), a dowód potrzebuje obu — stąd ta trójka zamiast samego wyniku.
    """

    wynik: PowerFlowResultV1
    max_mismatch_pu: float
    solver_version: str


def rozplyw_z_biegu(
    *,
    raw_result: dict[str, Any] | None,
    white_box_trace: list[dict[str, Any]] | None,
) -> RozplywZBiegu:
    """Odtwórz zamrożony wynik rozpływu z ZAPISU biegu (bez ponownej fizyki).

    ``raw_result`` i ``white_box_trace`` to dokładnie te dwie kolumny biegu, które
    tor ``_execute_power_flow`` zapisuje przy każdym rozpływie. Funkcja nie sięga
    po snapshot modelu ani po solver: dowód ma opisywać przebieg, który się
    wydarzył, a nie przebieg policzony po raz drugi.

    Podnosi ``BrakDanychRozplywuError`` (powód po polsku), gdy zapis biegu jest
    niekompletny albo gdy solver nie policzył części szyn — bilans mocy złożony z
    szyn nierozwiązanych podawałby moce ŻĄDANE jako wstrzyknięte, czyli kłamałby.
    """
    artefakt = raw_result or {}
    rodzaj = artefakt.get("analysis_type")
    if rodzaj != RODZAJ_WYNIKU_ROZPLYWU:
        raise BrakDanychRozplywuError(
            "Ten przebieg nie jest rozpływem mocy — pakietu rozpływu nie da się z niego złożyć."
        )

    surowy_wynik = artefakt.get("result_v1")
    if not isinstance(surowy_wynik, dict):
        raise BrakDanychRozplywuError(
            "Przebieg nie zawiera artefaktu wyniku rozpływu. Uruchom obliczenie ponownie."
        )

    wynik = _odtworz_wynik(surowy_wynik)
    if wynik.unsolved_node_ids:
        raise BrakDanychRozplywuError(
            "Rozpływ nie objął wszystkich szyn modelu "
            f"(nierozwiązane: {len(wynik.unsolved_node_ids)}), "
            "więc bilans mocy nie miałby pokrycia w obliczeniu. "
            "Sprawdź spójność sieci (szyny odcięte od źródła) i policz ponownie."
        )

    wersja = artefakt.get("solver_version")
    if not isinstance(wersja, str) or not wersja.strip():
        raise BrakDanychRozplywuError(
            "Przebieg nie podaje wersji solvera rozpływu — dowód nie miałby czym "
            "opisać narzędzia, którym go policzono."
        )

    return RozplywZBiegu(
        wynik=wynik,
        max_mismatch_pu=max_mismatch_ze_sladu(white_box_trace),
        solver_version=wersja,
    )


def _odtworz_wynik(surowy: dict[str, Any]) -> PowerFlowResultV1:
    """Złóż ``PowerFlowResultV1`` z jego własnej serializacji (pole w pole).

    Odwrotność ``PowerFlowResultV1.to_dict()``. Świadomie NIE jest metodą tej
    zamrożonej klasy: kontrakt FROZEN zostaje nietknięty, a odczyt zapisu biegu
    jest sprawą warstwy wiązania, nie warstwy wyniku.
    """
    szyny = _lista(surowy, "bus_results")
    galezie = _lista(surowy, "branch_results")
    podsumowanie = surowy.get("summary")
    if not isinstance(podsumowanie, dict):
        raise BrakDanychRozplywuError(
            "Artefakt wyniku rozpływu nie zawiera podsumowania (straty, skrajne napięcia, "
            "moc węzła bilansującego)."
        )

    return PowerFlowResultV1(
        result_version=_tekst(surowy, "result_version"),
        converged=_logiczna(surowy, "converged"),
        iterations_count=int(_calkowita(surowy, "iterations_count")),
        tolerance_used=_liczba(surowy, "tolerance_used"),
        base_mva=_liczba(surowy, "base_mva"),
        slack_bus_id=_tekst(surowy, "slack_bus_id"),
        bus_results=tuple(_odtworz_szyne(pozycja) for pozycja in szyny),
        branch_results=tuple(_odtworz_galaz(pozycja) for pozycja in galezie),
        summary=PowerFlowSummary(
            total_losses_p_mw=_liczba(podsumowanie, "total_losses_p_mw"),
            total_losses_q_mvar=_liczba(podsumowanie, "total_losses_q_mvar"),
            min_v_pu=_liczba(podsumowanie, "min_v_pu"),
            max_v_pu=_liczba(podsumowanie, "max_v_pu"),
            slack_p_mw=_liczba(podsumowanie, "slack_p_mw"),
            slack_q_mvar=_liczba(podsumowanie, "slack_q_mvar"),
        ),
        unsolved_node_ids=tuple(str(pozycja) for pozycja in _lista(surowy, "unsolved_node_ids")),
    )


def _odtworz_szyne(surowa: Any) -> PowerFlowBusResult:
    if not isinstance(surowa, dict):
        raise BrakDanychRozplywuError("Artefakt wyniku rozpływu ma uszkodzony wiersz szyny.")
    status = surowa.get("status")
    if status != "solved":
        raise BrakDanychRozplywuError(
            f"Szyna {surowa.get('bus_id')} nie została policzona przez solver rozpływu "
            "— jej wielkości nie są wynikiem, więc dowód nie może ich użyć."
        )
    return PowerFlowBusResult(
        bus_id=_tekst(surowa, "bus_id"),
        v_pu=_liczba(surowa, "v_pu"),
        angle_deg=_liczba(surowa, "angle_deg"),
        p_injected_mw=_liczba(surowa, "p_injected_mw"),
        q_injected_mvar=_liczba(surowa, "q_injected_mvar"),
        status=str(status),
    )


def _odtworz_galaz(surowa: Any) -> PowerFlowBranchResult:
    if not isinstance(surowa, dict):
        raise BrakDanychRozplywuError("Artefakt wyniku rozpływu ma uszkodzony wiersz gałęzi.")
    return PowerFlowBranchResult(
        branch_id=_tekst(surowa, "branch_id"),
        p_from_mw=_liczba(surowa, "p_from_mw"),
        q_from_mvar=_liczba(surowa, "q_from_mvar"),
        p_to_mw=_liczba(surowa, "p_to_mw"),
        q_to_mvar=_liczba(surowa, "q_to_mvar"),
        losses_p_mw=_liczba(surowa, "losses_p_mw"),
        losses_q_mvar=_liczba(surowa, "losses_q_mvar"),
    )


def max_mismatch_ze_sladu(white_box_trace: list[dict[str, Any]] | None) -> float:
    """Końcowe niedopasowanie rozpływu — z kroku KOŃCOWEGO śladu White Box.

    To ta sama liczba, którą solver porównał z tolerancją (``solution.max_mismatch``),
    a nie odczyt z ostatniej iteracji: iteracji bywa zero i wtedy „ostatnia" nie
    istnieje. Brak kroku końcowego = brak podstawy dowodu zbieżności, więc odmowa.
    """
    for krok in reversed(white_box_trace or []):
        if not isinstance(krok, dict) or krok.get("phase") != _FAZA_KROKU_KONCOWEGO:
            continue
        wyniki = krok.get("result")
        if not isinstance(wyniki, dict):
            continue
        pozycja = wyniki.get("max_mismatch_pu")
        if not isinstance(pozycja, dict):
            continue
        return _liczba(pozycja, "value")
    raise BrakDanychRozplywuError(
        "Ślad obliczeń przebiegu nie niesie końcowego niedopasowania rozpływu — "
        "bez niego nie da się udowodnić zbieżności. Uruchom obliczenie ponownie."
    )


def max_mismatch_ze_sladu_lub_brak(white_box_trace: list[dict[str, Any]] | None) -> float | None:
    """Jak `max_mismatch_ze_sladu`, ale BRAK jest wartością (`None`), nie odmową.

    Dla widoków interpretacji (nie dowodów) brak kroku końcowego w śladzie nie
    blokuje odczytu wyniku — pole jest wtedy jawnym „brak danych", NIGDY `0.0`
    (zero sugerowałoby idealną zbieżność, której nikt nie zmierzył; FAB-E).
    """
    try:
        return max_mismatch_ze_sladu(white_box_trace)
    except BrakDanychRozplywuError:
        return None


@dataclass(frozen=True)
class SkalaryRozplywu:
    """Skalary biegu rozpływu z FROZEN `PowerFlowResultV1` — zawsze serializowane."""

    iterations_count: int
    tolerance_used: float
    base_mva: float


def skalary_wyniku_rozplywu(result_v1: dict[str, Any]) -> SkalaryRozplywu:
    """Odczytaj `iterations_count`, `tolerance_used`, `base_mva` z artefaktu wyniku.

    Kontrakt FROZEN `network_model/solvers/power_flow_result.py::PowerFlowResultV1`
    serializuje te trzy pola ZAWSZE (wymagane, bez wartości domyślnych). Ich brak
    to artefakt uszkodzony albo niekompletny — ODMOWA z nazwaniem pola, a nie
    podstawienie `0`/`0.0`/`100.0` (do FAB-E i jeszcze po niej widok interpretacji
    fabrykował `base_mva = 100 MVA` i „zero iteracji", a bilans energii — 100 MVA).
    Jedno miejsce odczytu dla wszystkich odtwarzaczy wyniku z zapisu biegu.
    """
    iteracje = result_v1.get("iterations_count")
    tolerancja = result_v1.get("tolerance_used")
    base_mva = result_v1.get("base_mva")
    for nazwa, wartosc in (
        ("iterations_count", iteracje),
        ("tolerance_used", tolerancja),
        ("base_mva", base_mva),
    ):
        if isinstance(wartosc, bool) or not isinstance(wartosc, int | float):
            raise BrakDanychRozplywuError(
                f"Artefakt wyniku rozpływu nie zawiera liczbowego pola {nazwa!r} — "
                "wynik niekompletny, odczyt odmawia zamiast podstawiać liczbę. "
                "Uruchom obliczenie ponownie."
            )
    assert isinstance(iteracje, int | float) and isinstance(tolerancja, int | float)
    assert isinstance(base_mva, int | float)
    if float(base_mva) <= 0:
        raise BrakDanychRozplywuError(
            "Artefakt wyniku rozpływu niesie niedodatnią moc bazową — wynik niekompletny."
        )
    return SkalaryRozplywu(
        iterations_count=int(iteracje),
        tolerance_used=float(tolerancja),
        base_mva=float(base_mva),
    )


def skalary_wyniku_rozplywu_lub_brak(result_v1: dict[str, Any]) -> SkalaryRozplywu | None:
    """Jak `skalary_wyniku_rozplywu`, ale BRAK jest wartością (`None`), nie odmową.

    Dla analiz o kontrakcie „dane niepełne → pozycja NIE OBLICZONA, bez wyjątku"
    (walidacja energii): skalary są wtedy jawnie nieznane, nigdy podstawione.
    Wszystko-albo-nic: niekompletna trójka to jeden brak artefaktu, nie trzy osobne
    predykaty.
    """
    try:
        return skalary_wyniku_rozplywu(result_v1)
    except BrakDanychRozplywuError:
        return None


def _lista(zrodlo: dict[str, Any], klucz: str) -> list[Any]:
    wartosc = zrodlo.get(klucz)
    if not isinstance(wartosc, list):
        raise BrakDanychRozplywuError(f"Artefakt wyniku rozpływu nie zawiera pozycji: {klucz}.")
    return wartosc


def _tekst(zrodlo: dict[str, Any], klucz: str) -> str:
    wartosc = zrodlo.get(klucz)
    if not isinstance(wartosc, str) or not wartosc:
        raise BrakDanychRozplywuError(f"Artefakt wyniku rozpływu nie zawiera pozycji: {klucz}.")
    return wartosc


def _logiczna(zrodlo: dict[str, Any], klucz: str) -> bool:
    wartosc = zrodlo.get(klucz)
    if not isinstance(wartosc, bool):
        raise BrakDanychRozplywuError(f"Artefakt wyniku rozpływu nie zawiera pozycji: {klucz}.")
    return wartosc


def _calkowita(zrodlo: dict[str, Any], klucz: str) -> int:
    wartosc = zrodlo.get(klucz)
    if isinstance(wartosc, bool) or not isinstance(wartosc, int):
        raise BrakDanychRozplywuError(f"Artefakt wyniku rozpływu nie zawiera pozycji: {klucz}.")
    return wartosc


def _liczba(zrodlo: dict[str, Any], klucz: str) -> float:
    """Skończona liczba spod klucza albo odmowa — nigdy zapas.

    ``None`` w artefakcie oznacza wartość, której solver nie policzył (serializacja
    zamienia NaN na ``null``), a wartość nieskończona nie nadaje się do dowodu.
    Oba przypadki są odmową, nie podstawieniem zera.
    """
    wartosc = zrodlo.get(klucz)
    if isinstance(wartosc, bool) or not isinstance(wartosc, int | float):
        raise BrakDanychRozplywuError(
            f"Artefakt wyniku rozpływu nie zawiera liczby pod pozycją: {klucz}."
        )
    liczba = float(wartosc)
    if not math.isfinite(liczba):
        raise BrakDanychRozplywuError(
            f"Wielkość {klucz} przebiegu nie jest skończoną liczbą — "
            "dowód nie może się na niej oprzeć."
        )
    return liczba
