"""Rodzaj i stan przebiegu po polsku w komunikatach bramek widoków analiz (karta #145).

Iloczyn cech: {rodzaj przebiegu, stan przebiegu} × {kod kanonicznego przebiegu, kod spoza
słownika} oraz {każdy widok analizy z bramką przebiegu} × {zły rodzaj, niezakończony}:
komunikat nie niesie identyfikatora przebiegu ani kodów rodzaju/stanu.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import pytest
from application.analyses.opis_przebiegu import (
    RODZAJ_SPOZA_SLOWNIKA_PL,
    RODZAJE_PRZEBIEGU_PL,
    STAN_SPOZA_SLOWNIKA_PL,
    STANY_PRZEBIEGU_PL,
    rodzaj_przebiegu_pl,
    stan_przebiegu_pl,
)
from enm.canonical_analysis import CanonicalRun

SRC = Path(__file__).resolve().parents[3] / "src"


KANONICZNY = SRC / "enm" / "canonical_analysis.py"


def test_kazdy_rodzaj_przebiegu_kanonicznego_ma_polska_nazwe_i_odwrotnie() -> None:
    """Rodzaje przebiegu kanonicznego: porównania i konstrukcje `analysis_type` w module
    przebiegów oraz stała rozpływu niesymetrycznego — równość zbiorów w obie strony."""
    tekst = KANONICZNY.read_text(encoding="utf-8")
    rodzaje = set(re.findall(r'analysis_type\s*(?:==|!=|=)\s*"([A-Za-z_]+)"', tekst))
    rodzaje |= set(re.findall(r'ANALYSIS_TYPE_[A-Z_]+\s*=\s*"([A-Za-z_]+)"', tekst))
    assert rodzaje == set(RODZAJE_PRZEBIEGU_PL), sorted(rodzaje ^ set(RODZAJE_PRZEBIEGU_PL))


def test_kazdy_stan_przebiegu_kanonicznego_ma_polska_nazwe() -> None:
    """Stany przebiegu (`run.status`/`status=` w module przebiegów; `validation.status`
    to inny słownik — walidacja, nie przebieg) mają polską nazwę."""
    tekst = KANONICZNY.read_text(encoding="utf-8")
    stany = set(re.findall(r'(?<!validation)\.status\s*(?:==|!=|=)\s*"([A-Z_]+)"', tekst))
    stany |= set(re.findall(r'\bstatus="([A-Z_]+)"', tekst))
    assert stany, "brak stanów w module przebiegów"
    assert stany <= set(STANY_PRZEBIEGU_PL), sorted(stany - set(STANY_PRZEBIEGU_PL))


def test_kod_spoza_slownika_daje_zdanie_nie_kod() -> None:
    assert rodzaj_przebiegu_pl("NOWY_RODZAJ") == RODZAJ_SPOZA_SLOWNIKA_PL
    assert stan_przebiegu_pl("NOWY_STAN") == STAN_SPOZA_SLOWNIKA_PL
    for nazwa in [*RODZAJE_PRZEBIEGU_PL.values(), *STANY_PRZEBIEGU_PL.values()]:
        assert re.search(r"\b[a-z]+_[a-z_]+\b", nazwa) is None, nazwa


def _bieg(analysis_type: str, status: str) -> CanonicalRun:
    return CanonicalRun(
        id=uuid4(),
        case_id="c",
        project_id="p",
        analysis_type=analysis_type,
        status=status,
        created_at=datetime(2024, 1, 1, tzinfo=UTC),
        snapshot_hash="h",
        input_hash="h",
        snapshot={"header": {"name": "Projekt"}, "buses": [], "generators": []},
        validation={},
        readiness={},
        raw_result={},
    )


def _widoki() -> list[tuple[str, object, str]]:
    from application.analyses.energy_validation.service import build_energy_validation_view
    from application.analyses.grid_strength import build_grid_strength_view
    from application.analyses.reactive_adequacy import build_reactive_adequacy_view
    from application.analyses.sanity_bounds import build_sanity_bounds_view
    from application.analyses.warunki_przylaczenia import build_warunki_przylaczenia_view
    from application.analyses.wytrzymalosc_cieplna_przewodow import (
        build_wytrzymalosc_cieplna_view,
    )
    from application.result_mapping.canonical_run_to_resultset_v1 import (
        build_resultset_v1_from_canonical_run,
    )

    return [
        ("warunki przyłączenia", build_warunki_przylaczenia_view, "PF"),
        ("wytrzymałość cieplna", build_wytrzymalosc_cieplna_view, "short_circuit_sn"),
        ("zestaw wyników", build_resultset_v1_from_canonical_run, "PF"),
        ("walidacja energetyczna", build_energy_validation_view, "PF"),
        ("wiarygodność Ik''", build_sanity_bounds_view, "short_circuit_sn"),
        ("siła sieci", build_grid_strength_view, "short_circuit_sn"),
        ("adekwatność Q", build_reactive_adequacy_view, "PF"),
    ]


@pytest.mark.parametrize("przypadek", ["zly_rodzaj", "niezakonczony"])
def test_komunikat_bramki_widoku_bez_identyfikatora_i_kodow(przypadek: str) -> None:
    for nazwa, widok, rodzaj in _widoki():
        bieg = (
            _bieg("dynamic_stability", "FINISHED")
            if przypadek == "zly_rodzaj"
            else _bieg(rodzaj, "RUNNING")
        )
        if nazwa == "zestaw wyników" and przypadek == "zly_rodzaj":
            continue  # zestaw wyników nie ma bramki rodzaju — tylko stanu
        with pytest.raises(ValueError) as blad:
            widok(bieg)  # type: ignore[operator]
        komunikat = str(blad.value)
        assert str(bieg.id) not in komunikat, nazwa
        for kod in ("dynamic_stability", "RUNNING", "status=", "short_circuit_sn", "(PF)"):
            assert kod not in komunikat, (nazwa, kod, komunikat)


#: Moduły z bramką przebiegu, których komunikat trafia na ekran (stan błędu widoku, dowodu
#: albo panelu wyników) — inwentarz klasy karty #145.
_MODULY_BRAMEK = (
    "application/analyses/energy_validation/service.py",
    "application/analyses/sanity_bounds.py",
    "application/analyses/grid_strength.py",
    "application/analyses/reactive_adequacy.py",
    "application/analyses/warunki_przylaczenia.py",
    "application/analyses/wytrzymalosc_cieplna_przewodow.py",
    "application/analyses/kontyngencje_n1.py",
    "application/analyses/lv_domain/projection_v1.py",
    "application/analyses/ssci_stability/service.py",
    "application/analyses/raport_zgodnosci.py",
    "application/protection_settings/batch_run.py",
    "application/result_mapping/canonical_run_to_resultset_v1.py",
    "application/autorytet_biegu_zwarciowego.py",
    "api/result_contract_v1.py",
)


@pytest.mark.parametrize("modul", _MODULY_BRAMEK)
def test_komunikaty_bramek_nie_wstawiaja_identyfikatora_rodzaju_ani_stanu(modul: str) -> None:
    """Zapis wprost w kodzie: f-string komunikatu nie wstawia identyfikatora przebiegu,
    kodu rodzaju ani kodu stanu (to robią wyłącznie `rodzaj_przebiegu_pl`/`stan_przebiegu_pl`)."""
    # Linie dekoratorów tras (`@router.get("/…/{run_id}/…")`) to ścieżki URL, nie komunikaty.
    tekst = "\n".join(
        linia
        for linia in (SRC / modul).read_text(encoding="utf-8").splitlines()
        if not linia.lstrip().startswith("@")
    )
    zakazane = re.findall(
        r"\{(?:run|bieg|kotwica|run_record)(?:\.|\.get\(\s*['\"])"
        r"(?:id|status|analysis_type)\b[^}]*\}|\{run_id\}|\{run_status\}|\{run_id!r\}",
        tekst,
    )
    assert zakazane == [], (modul, zakazane)
