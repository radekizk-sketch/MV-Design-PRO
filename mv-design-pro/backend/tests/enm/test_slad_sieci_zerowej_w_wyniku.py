"""Ślad WHITE BOX budowy sieci składowej zerowej w wyniku zwarcia doziemnego.

Do tej karty ślad budowy macierzy Y0 (rozbicie po elementach: Z0 źródła, Z0 i B0 linii,
decyzja grupy połączeń transformatora, droga zerowa baterii) miał wyłącznie konsumentów
testowych — wynik 1F/2FG pokazywał samo Z0 w miejscu zwarcia, bez możliwości sprawdzenia,
z czego ta impedancja powstała. Teraz bieg publikuje ślad w ``raw_result.siec_zerowa``
z TEJ SAMEJ macierzy, z której solver dostaje ``z0_bus`` (jedno złożenie, jedna prawda),
a ``GET …/results/short-circuit`` przenosi go do klienta.

Iloczyn cech (reguła KLASA, NIE INSTANCJA §2):
  {rodzaj zwarcia 1F, 2FG — ślad jest; 3F, 2F — klucza nie ma} ×
  {sieć: TN z Dyn11 i kablem z Z0 / sieć izolowana z B0 kabla / sieć bez danych składowej
   zerowej (odniesienie numeryczne)} ×
  {scenariusz MAX / MIN} ×
  {jedna prawda: ślad = ślad funkcji budującej z0_bus dla grafu i scenariusza biegu} ×
  {determinizm: dwa biegi → ten sam ślad} ×
  {teksty po polsku: bez kodów maszynowych w tytule, podstawieniu i uwagach} ×
  {tor API: trasa wyników przenosi ślad bez zmian}.
Bateria kondensatorów (gwiazda uziemiona / izolowana / trójkąt) w śladzie biegu:
``tests/enm/test_bateria_kondensatorow_iloczyn.py``.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from api.main import app
from enm.assembler import zloz_wejscie_zwarcia
from enm.canonical_analysis import (
    CanonicalRun,
    _execute_short_circuit,
    canonical_run_repository_scope,
    reset_canonical_runs,
)
from enm.mapping import build_zero_sequence_zbus_with_trace
from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMHeader,
    GroundingConfig,
    Source,
    Transformer,
)
from enm.rozplyw_niesymetryczny_wynik import json_bezpieczny
from enm.zero_sequence_transformer import (
    NAZWY_POLACZEN_ZEROWYCH_PL,
    NAZWY_UZWOJEN_ZEROWYCH_PL,
)
from fastapi.testclient import TestClient
from network_model.core.bateria_kondensatorow import NAZWY_UKLADOW_POLACZEN_BATERII_PL
from network_model.odmowa_danych import OdmowaDanychError
from network_model.solvers.short_circuit_core import ShortCircuitType

RODZAJE_Z_SLADEM = ("1F", "2FG")
RODZAJE_BEZ_SLADU = ("3F", "2F")
SCENARIUSZE = ("max", "min")


def _transformator(**zmiany: Any) -> Transformer:
    pola: dict[str, Any] = {
        "ref_id": "tr1",
        "name": "TR GPZ",
        "hv_bus_ref": "hv",
        "lv_bus_ref": "sn",
        "sn_mva": 25.0,
        "uhv_kv": 110.0,
        "ulv_kv": 15.0,
        "uk_percent": 11.0,
        "pk_kw": 110.0,
        "vector_group": "Dyn11",
    }
    pola.update(zmiany)
    return Transformer(**pola)


def _kabel(**zmiany: Any) -> Cable:
    pola: dict[str, Any] = {
        "ref_id": "c1",
        "name": "Kabel K1",
        "from_bus_ref": "sn",
        "to_bus_ref": "st",
        "length_km": 4.0,
        "r_ohm_per_km": 0.2,
        "x_ohm_per_km": 0.1,
        "r0_ohm_per_km": 0.6,
        "x0_ohm_per_km": 0.3,
    }
    pola.update(zmiany)
    return Cable(**pola)


def _zrodlo(**zmiany: Any) -> Source:
    pola: dict[str, Any] = {
        "ref_id": "src",
        "name": "System 110 kV",
        "bus_ref": "hv",
        "model": "short_circuit_power",
        "sk3_mva": 2000.0,
        "rx_ratio": 0.1,
        "sk3_min_mva": 1200.0,
        "rx_ratio_min": 0.15,
        "z0_z1_ratio": 1.2,
    }
    pola.update(zmiany)
    return Source(**pola)


def _siec(rodzaj_sieci: str) -> EnergyNetworkModel:
    szyny = [
        Bus(ref_id="hv", name="GPZ 110 kV", voltage_kv=110.0),
        Bus(ref_id="sn", name="Rozdzielnia SN", voltage_kv=15.0),
        Bus(ref_id="st", name="Stacja S1", voltage_kv=15.0),
    ]
    if rodzaj_sieci == "tn_dyn11":
        trafo, kabel, zrodlo = _transformator(), _kabel(), _zrodlo()
    elif rodzaj_sieci == "izolowana_b0":
        trafo = _transformator(lv_neutral=GroundingConfig(type="isolated"))
        kabel, zrodlo = _kabel(b0_siemens_per_km=2.5e-4), _zrodlo()
    elif rodzaj_sieci == "bez_danych_z0":
        trafo = _transformator(vector_group=None)
        kabel = _kabel(r0_ohm_per_km=None, x0_ohm_per_km=None)
        zrodlo = _zrodlo(z0_z1_ratio=None)
    else:  # pragma: no cover — parametryzacja zamknięta
        raise AssertionError(rodzaj_sieci)
    return EnergyNetworkModel(
        header=ENMHeader(name=f"Siec {rodzaj_sieci}", revision=1),
        buses=szyny,
        sources=[zrodlo],
        transformers=[trafo],
        branches=[kabel],
    )


#: Klucze kroków, które ślad sieci zerowej MUSI nieść dla danej sieci (rozbicie po elementach).
OCZEKIWANE_KROKI: dict[str, set[str]] = {
    "tn_dyn11": {"z0_source[src]", "z0_line[c1]", "tr_z0_parse[tr1]", "tr_z0_conn[tr1]"},
    "izolowana_b0": {"z0_source[src]", "z0_line[c1]", "z0_line_shunt[c1]", "tr_z0_conn[tr1]"},
    "bez_danych_z0": {"tr_z0_open[tr1]", "z0_numerical_reference"},
}
SIECI = tuple(OCZEKIWANE_KROKI)


def _opcje(rodzaj: str, scenariusz: str) -> dict[str, Any]:
    return {"fault_type": rodzaj, "scenario": scenariusz, "thermal_time_seconds": 1.0}


def _bieg(enm: EnergyNetworkModel, rodzaj: str, scenariusz: str) -> CanonicalRun:
    run_id = uuid4()
    run = CanonicalRun(
        id=run_id,
        case_id="case-siec-zerowa",
        project_id="proj-siec-zerowa",
        analysis_type="short_circuit_sn",
        status="FINISHED",
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
        snapshot_hash=f"snap-{run_id}",
        input_hash=f"in-{run_id}",
        snapshot=enm.model_dump(mode="json"),
        validation={},
        readiness={},
        options=_opcje(rodzaj, scenariusz),
    )
    run.finished_at = run.created_at
    _execute_short_circuit(run)
    return run


@pytest.mark.parametrize("scenariusz", SCENARIUSZE)
@pytest.mark.parametrize("rodzaj_sieci", SIECI)
@pytest.mark.parametrize("rodzaj", RODZAJE_Z_SLADEM + RODZAJE_BEZ_SLADU)
def test_slad_sieci_zerowej_wylacznie_w_zwarciu_doziemnym(
    rodzaj: str, rodzaj_sieci: str, scenariusz: str
) -> None:
    enm = _siec(rodzaj_sieci)
    raw = _bieg(enm, rodzaj, scenariusz).raw_result or {}
    if rodzaj in RODZAJE_BEZ_SLADU:
        # Zwarcie bez składowej zerowej nie buduje Y0 — klucza nie ma (ładunek 3F/2F bez zmian).
        assert "siec_zerowa" not in raw
        return
    slad = raw["siec_zerowa"]
    klucze = {krok["key"] for krok in slad}
    assert OCZEKIWANE_KROKI[rodzaj_sieci] <= klucze, klucze
    # Jedna prawda: ślad biegu to ślad złożenia macierzy, którą solver dostał jako z0_bus —
    # dla grafu solvera i scenariusza biegu (MIN ma inne Z_Q, więc i inne Z0 źródła).
    wejscie = zloz_wejscie_zwarcia(enm.model_dump(mode="json"), _opcje(rodzaj, scenariusz))
    _, slad_budowy = build_zero_sequence_zbus_with_trace(
        enm, wejscie.solve_graph, scenario=wejscie.scenario_c
    )
    assert slad == json_bezpieczny(slad_budowy)


@pytest.mark.parametrize("rodzaj", RODZAJE_Z_SLADEM)
def test_slad_zrodla_zalezy_od_scenariusza_biegu(rodzaj: str) -> None:
    """Z0 źródła (Z0/Z1)·Z_Q: MIN liczy z S''kQmin — ślad biegu MIN nie jest śladem MAX."""
    enm = _siec("tn_dyn11")
    kroki = {
        scenariusz: {
            krok["key"]: krok
            for krok in (_bieg(enm, rodzaj, scenariusz).raw_result or {})["siec_zerowa"]
        }
        for scenariusz in SCENARIUSZE
    }
    assert (
        kroki["max"]["z0_source[src]"]["substitution"]
        != kroki["min"]["z0_source[src]"]["substitution"]
    )
    assert kroki["max"]["z0_line[c1]"] == kroki["min"]["z0_line[c1]"]


@pytest.mark.parametrize("rodzaj_sieci", SIECI)
@pytest.mark.parametrize("rodzaj", RODZAJE_Z_SLADEM)
def test_slad_sieci_zerowej_deterministyczny(rodzaj: str, rodzaj_sieci: str) -> None:
    enm = _siec(rodzaj_sieci)
    pierwszy = (_bieg(enm, rodzaj, "max").raw_result or {})["siec_zerowa"]
    drugi = (_bieg(enm, rodzaj, "max").raw_result or {})["siec_zerowa"]
    assert pierwszy == drugi


#: Kody maszynowe, które do tej karty stały w tekstach śladu (enum połączenia i uzwojenia,
#: nazwa pola modelu, zapis jednostki) — ślad jest teraz częścią wyniku dla projektanta.
_KODY_W_TEKSCIE = re.compile(
    r"series_through|hv_shunt_ground|lv_shunt_ground|grounded_wye|grounded_zigzag|"
    r"vector_group|vector\\_group|uziem=|pu@|Z0\(src\)|Y0_sh,end|p\.u\.|SERIES_THROUGH|OPEN:"
)
_IDENTYFIKATOR_KODU = re.compile(r"\b[a-z]+_[a-z0-9_]+\b")


@pytest.mark.parametrize("rodzaj_sieci", SIECI)
def test_teksty_sladu_sieci_zerowej_po_polsku(rodzaj_sieci: str) -> None:
    slad = (_bieg(_siec(rodzaj_sieci), "1F", "max").raw_result or {})["siec_zerowa"]
    for krok in slad:
        for pole in ("title", "substitution", "notes"):
            tekst = krok.get(pole) or ""
            assert not _KODY_W_TEKSCIE.search(tekst), (krok["key"], pole, tekst)
            assert not _IDENTYFIKATOR_KODU.search(tekst), (krok["key"], pole, tekst)
        assert not _KODY_W_TEKSCIE.search(krok.get("formula_latex") or ""), krok["key"]


def test_odniesienie_numeryczne_nazywa_wezly_i_ostrzega() -> None:
    """Sieć bez danych składowej zerowej: Z0 wszystkich węzłów pochodzi z odniesienia
    numerycznego macierzy, nie z elementów — ślad mówi to wprost (WHITE BOX: korekta
    macierzy nie jest ukryta)."""
    slad = (_bieg(_siec("bez_danych_z0"), "1F", "max").raw_result or {})["siec_zerowa"]
    [krok] = [k for k in slad if k["key"] == "z0_numerical_reference"]
    assert krok["inputs"]["wezly"] == ["GPZ 110 kV", "Rozdzielnia SN", "Stacja S1"]
    assert krok["result"]["liczba_wezlow"] == 3
    assert krok["notes"].startswith("OSTRZEŻENIE:")
    # Sieć z elementami drogi zerowej w każdym węźle nie dostaje tego kroku.
    slad_tn = (_bieg(_siec("tn_dyn11"), "1F", "max").raw_result or {})["siec_zerowa"]
    assert "z0_numerical_reference" not in {k["key"] for k in slad_tn}


@pytest.fixture()
def client() -> TestClient:
    reset_canonical_runs()
    with TestClient(app) as test_client:
        yield test_client


@pytest.mark.parametrize("rodzaj", RODZAJE_Z_SLADEM + RODZAJE_BEZ_SLADU)
def test_trasa_wynikow_przenosi_slad_sieci_zerowej(client: TestClient, rodzaj: str) -> None:
    run = _bieg(_siec("tn_dyn11"), rodzaj, "max")
    with canonical_run_repository_scope() as repository:
        repository.save(run)
    odpowiedz = client.get(f"/api/analysis-runs/{run.id}/results/short-circuit")
    assert odpowiedz.status_code == 200, odpowiedz.text
    wynik = odpowiedz.json()
    if rodzaj in RODZAJE_BEZ_SLADU:
        assert "siec_zerowa" not in wynik
    else:
        assert wynik["siec_zerowa"] == (run.raw_result or {})["siec_zerowa"]


# ---------------------------------------------------------------------------
# Lustra map kodów w interfejsie (`frontend/src/ui/results-inspector/types.ts`)
# ---------------------------------------------------------------------------

_TYPY_FRONTU = (
    Path(__file__).resolve().parents[2]
    / ".."
    / "frontend"
    / "src"
    / "ui"
    / "results-inspector"
    / "types.ts"
).resolve()


def _mapa_frontu(nazwa: str) -> dict[str, str]:
    """Wpisy `klucz: 'opis'` mapy o nazwie ``nazwa`` (stała albo pole `TRACE_VALUE_CODES`)."""
    tresc = _TYPY_FRONTU.read_text(encoding="utf-8")
    poczatek = re.search(rf"(?m)^\s*(?:const )?{re.escape(nazwa)}\b[^{{\n]*{{$", tresc)
    assert poczatek is not None, nazwa
    blok = tresc[poczatek.end() : tresc.index("}", poczatek.end())]
    return dict(re.findall(r"'?([\w+]+)'?:\s*'([^']*)'", blok))


def test_kody_sladu_sieci_zerowej_maja_lustro_w_interfejsie() -> None:
    """Interfejs zamienia kody śladu na opisy z map, które MUSZĄ być tymi samymi zdaniami co
    backend — kod spoza mapy spada do „Informacji audytowych", a opis rozbieżny pokazywałby
    na ekranie inną nazwę niż podstawienie kroku."""
    assert _mapa_frontu("connection") == {
        kod.value: opis for kod, opis in NAZWY_POLACZEN_ZEROWYCH_PL.items()
    }
    assert _mapa_frontu("UZWOJENIA_ZEROWE_PL") == {
        kod.value: opis for kod, opis in NAZWY_UZWOJEN_ZEROWYCH_PL.items()
    }
    assert _mapa_frontu("uklad_polaczen") == NAZWY_UKLADOW_POLACZEN_BATERII_PL


def test_tokeny_rodzaju_zwarcia_interfejsu_to_kody_wyniku() -> None:
    """Wiersz wyniku niesie `fault_type` = wartość `ShortCircuitType`; słownik rodzajów
    interfejsu (jedno źródło `TRACE_VALUE_CODES.short_circuit_type`) ma DOKŁADNIE te klucze.
    Do tej karty interfejs znał „2F+Z" zamiast „2F+G" i bieg 2F+G był „rodzajem nieznanym"."""
    assert set(_mapa_frontu("short_circuit_type")) == {typ.value for typ in ShortCircuitType}


@pytest.mark.parametrize("rodzaj", RODZAJE_Z_SLADEM)
@pytest.mark.parametrize(
    ("element", "siec"),
    [
        (
            "Źródło System 110 kV",
            lambda: _siec("tn_dyn11").model_copy(
                update={"sources": [_zrodlo(z0_z1_ratio=None, r0_ohm=0.0, x0_ohm=0.0)]}
            ),
        ),
        (
            "Gałąź Kabel K1",
            lambda: _siec("tn_dyn11").model_copy(
                update={"branches": [_kabel(r0_ohm_per_km=0.0, x0_ohm_per_km=0.0)]}
            ),
        ),
    ],
    ids=["zrodlo", "kabel"],
)
def test_zerowa_impedancja_zerowa_to_odmowa_nazwana(rodzaj: str, element: str, siec: Any) -> None:
    """{źródło / kabel} z R0 = X0 = 0 × {1F / 2FG}: Y0 = 1/Z0 nie istnieje — odmowa danych
    z nazwą elementu (dawniej goły `ZeroDivisionError` po angielsku, 500 w API)."""
    with pytest.raises(OdmowaDanychError) as info:
        zloz_wejscie_zwarcia(siec().model_dump(mode="json"), _opcje(rodzaj, "max"))
    assert str(info.value).startswith(f"{element}: impedancja składowej zerowej Z0 jest równa zeru")
