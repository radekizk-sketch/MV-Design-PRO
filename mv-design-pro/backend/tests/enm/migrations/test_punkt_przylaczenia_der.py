"""Automigracja klucza punktu przyłączenia wytwórcy (V12K-268).

Sprawdzamy to, na czym zależy projektantowi: po zmianie nazwy pola przypisanie
punktu przyłączenia zrobione w STARYM zapisie ma nadal działać. Bez migracji kod
czytający nową nazwę zobaczyłby pustkę i gotowy projekt straciłby przyłączenie.
"""

from __future__ import annotations

import pytest
from enm.migrations.punkt_przylaczenia_der import KLUCZ_KANONICZNY, migruj, wymaga_migracji
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader, Generator, Load, Source


def _model(*generatory: Generator) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="Test", defaults=ENMDefaults()),
        generators=list(generatory),
    )


def _generator(**pola: object) -> Generator:
    return Generator(ref_id="g1", name="Wytwórca 1", bus_ref="bus-1", p_mw=1.0, **pola)


def test_stary_klucz_w_materialized_params_trafia_pod_nazwe_kanoniczna():
    enm = _model(_generator(materialized_params={"pcc_ref": "szyna-7"}))

    zmigrowany, zmieniono = migruj(enm)

    assert zmieniono is True
    dane = zmigrowany.generators[0].materialized_params
    assert dane is not None
    assert dane[KLUCZ_KANONICZNY] == "szyna-7"
    assert "pcc_ref" not in dane


def test_najstarszy_skrocony_klucz_tez_jest_przenoszony():
    enm = _model(_generator(meta={"pcc": "szyna-3"}))

    zmigrowany, zmieniono = migruj(enm)

    assert zmieniono is True
    assert zmigrowany.generators[0].meta[KLUCZ_KANONICZNY] == "szyna-3"
    assert "pcc" not in zmigrowany.generators[0].meta


def test_nazwa_kanoniczna_wygrywa_gdy_obie_sa_obecne():
    """Zapis nowszego kodu nie może zostać nadpisany pozostałością po starym."""
    enm = _model(_generator(materialized_params={"pcc_ref": "stara", KLUCZ_KANONICZNY: "nowa"}))

    zmigrowany, _ = migruj(enm)

    dane = zmigrowany.generators[0].materialized_params
    assert dane is not None
    assert dane[KLUCZ_KANONICZNY] == "nowa"
    assert "pcc_ref" not in dane


def test_migracja_jest_idempotentna():
    enm = _model(_generator(materialized_params={"pcc_ref": "szyna-7"}))

    raz, _ = migruj(enm)
    dwa, zmieniono_drugi_raz = migruj(raz)

    assert zmieniono_drugi_raz is False
    assert dwa is raz, "brak zmian musi zwrocic TEN SAM obiekt (bez podbicia rewizji)"


def test_model_bez_starych_kluczy_nie_jest_ruszany():
    enm = _model(_generator(materialized_params={KLUCZ_KANONICZNY: "szyna-1"}))

    assert wymaga_migracji(enm) is False
    zmigrowany, zmieniono = migruj(enm)
    assert zmieniono is False
    assert zmigrowany is enm


@pytest.mark.parametrize("pusta", [None, ""])
def test_pusta_wartosc_starego_klucza_nie_tworzy_pustego_przypisania(pusta):
    """Brak danej nie może stać się wartością — usuwamy klucz, nic nie wpisujemy."""
    enm = _model(_generator(materialized_params={"pcc_ref": pusta}))

    zmigrowany, zmieniono = migruj(enm)

    dane = zmigrowany.generators[0].materialized_params
    assert zmieniono is True
    assert "pcc_ref" not in dane
    assert KLUCZ_KANONICZNY not in dane


def test_stary_klucz_w_innych_kolekcjach_tez_jest_przenoszony():
    """Zakaz dotyczy NAZWY w zapisanych danych — każdej kolekcji, nie tylko wytwórców.

    Rozszerzenie z weryfikacji nadzoru 2026-07-29: żaden producent nigdy nie
    pisał tych kluczy poza ``generators`` (zmierzone w historii), ale dane mogły
    powstać ręczną edycją albo importem — sonda na realnej ścieżce zapisu
    pokazała, że klucz podłożony w ``sources[]``/``loads[]`` przeżywał migrację.
    """
    enm = EnergyNetworkModel(
        header=ENMHeader(name="Test", defaults=ENMDefaults()),
        sources=[
            Source(
                ref_id="src-1",
                name="GPZ",
                bus_ref="bus-1",
                model="external_grid",
                materialized_params={"pcc_ref": "szyna-gpz"},
            )
        ],
        loads=[
            Load(
                ref_id="load-1",
                name="Odbiór",
                bus_ref="bus-1",
                p_mw=0.2,
                q_mvar=0.05,
                meta={"pcc": "szyna-odb"},
            )
        ],
    )

    assert wymaga_migracji(enm) is True
    zmigrowany, zmieniono = migruj(enm)

    assert zmieniono is True
    zrodlo = zmigrowany.sources[0].materialized_params
    assert zrodlo is not None
    assert zrodlo[KLUCZ_KANONICZNY] == "szyna-gpz"
    assert "pcc_ref" not in zrodlo
    odbior = zmigrowany.loads[0].meta
    assert odbior is not None
    assert odbior[KLUCZ_KANONICZNY] == "szyna-odb"
    assert "pcc" not in odbior
