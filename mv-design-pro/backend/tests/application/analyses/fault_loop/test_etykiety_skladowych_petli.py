"""Karta ETYKIETY-TR: etykiety składowych pętli zwarcia nN z modelu, bez zdublowań i bez stałej klasy.

Po co: cztery moduły (widoki pętli zwarcia, SWZ, dobór aparatów nN, dowód weryfikacji obwodu
nN) składały etykietę transformatora jako „Transformator SN/nN {nazwa}”. Transformator
wstawiany ze stacją ma domyślną nazwę „Transformator SN/nN”, więc etykieta brzmiała
„Transformator SN/nN Transformator SN/nN”, a klasa „SN/nN” była stałą, nie wynikiem napięć
stron. Etykieta sieci zasilającej brała klasę „SN” ze stałej domyślnej solvera.

Iloczyn cech (KLASA, NIE INSTANCJA): nazwa transformatora {domyślna nazwa stacji, nazwa
własna projektanta, pusta} × rodzaj transformatora {SN/nN 15/0,4 kV, WN/nN 110/0,4 kV,
WN/SN 110/15 kV — ścieżki nN nie bramkują pasma strony dolnej, więc etykieta musi być prawdziwa
także wtedy} × ścieżka {pętla u
źródła, pętla w punkcie, pętle odpływów, SWZ, dobór aparatów nN, dowód obwodu nN} ×
składowa {transformator, sieć zasilająca}. Każda ścieżka jest przechwycona na wejściu
solvera (`compute_fault_loop`), więc test nie zależy od tego, co dana ścieżka zwraca.
"""

from __future__ import annotations

import ast
import inspect
import re
from pathlib import Path
from typing import Any

import pytest
from application.analyses.fault_loop import service as serwis_petli
from application.analyses.fault_loop.service import (
    build_fault_loop_view_at_point,
    build_feeder_fault_loop_view,
    build_station_fault_loop_view,
    etykieta_sieci_zasilajacej_petli,
    etykieta_transformatora_petli,
)
from application.analyses.nn_device_selection import _ik1_min_i_u0
from application.analyses.swz.service import build_swz_view
from application.proof_engine.lv_circuit_verification_binding import _petla_zwarcia_min
from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    Source,
    Substation,
    SwitchBranch,
    Transformer,
)
from network_model.solvers.fault_loop_builder import (
    FaultLoopBuildRequest,
    refer_upstream_impedance_to_lv_ohm,
)
from network_model.solvers.fault_loop_iec60364 import FaultLoopInput

_SRC = Path(__file__).resolve().parents[4] / "src"

#: Nazwa nadawana transformatorowi przez wstawienie stacji w odcinek SN 15 kV / nN 0,4 kV.
_NAZWA_DOMYSLNA = "Transformator SN/nN"
_NAZWA_WLASNA = "TR-7 Kowalskiego"

_NAZWY = [_NAZWA_DOMYSLNA, _NAZWA_WLASNA, ""]
#: Pusta nazwa → opis rodzaju z jednej reguły nazw elementów (`enm.nazwy_elementow`, karta
#: #144), nigdy identyfikator transformatora — intencja testu (etykieta = nazwa z modelu, bez
#: klasy i bez stałej) bez zmian.
_TR_BEZ_NAZWY = "Transformator bez nazwy"
#: (napięcie GN, napięcie DN, oczekiwana etykieta sieci zasilającej).
_RODZAJE = [
    (15.0, 0.4, "Sieć SN (upstream Thevenin, sprowadzone do nN)"),
    (110.0, 0.4, "Sieć WN (upstream Thevenin, sprowadzone do nN)"),
    (110.0, 15.0, "Sieć WN (upstream Thevenin, sprowadzone do SN)"),
]


def _enm(
    nazwa: str, napiecie_gorne_kv: float, napiecie_dolne_kv: float = 0.4
) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="t", defaults=ENMDefaults(sn_nominal_kv=napiecie_gorne_kv)),
        buses=[
            Bus(ref_id="gn", name="GN", voltage_kv=napiecie_gorne_kv),
            Bus(ref_id="nn", name="DN", voltage_kv=napiecie_dolne_kv),
            Bus(ref_id="b1", name="B1", voltage_kv=napiecie_dolne_kv),
            Bus(ref_id="b2", name="B2", voltage_kv=napiecie_dolne_kv),
        ],
        sources=[
            Source(ref_id="src", name="Z", bus_ref="gn", model="thevenin", r_ohm=0.1, x_ohm=0.5)
        ],
        transformers=[
            Transformer(
                ref_id="tr",
                name=nazwa,
                hv_bus_ref="gn",
                lv_bus_ref="nn",
                sn_mva=0.63,
                uhv_kv=napiecie_gorne_kv,
                ulv_kv=napiecie_dolne_kv,
                uk_percent=4.0,
                pk_kw=6.5,
                vector_group="Dyn11",
                lv_earthing_system="TN-C-S",
            )
        ],
        branches=[
            Cable(
                ref_id="c1",
                name="C1",
                from_bus_ref="nn",
                to_bus_ref="b1",
                length_km=0.05,
                r_ohm_per_km=0.32,
                x_ohm_per_km=0.08,
                return_conductor_r_ohm_per_km_20c=0.32,
                return_conductor_x_ohm_per_km=0.08,
                short_circuit_temperature_c=160.0,
            ),
            SwitchBranch(
                ref_id="ap1",
                name="AP1",
                type="breaker",
                from_bus_ref="b1",
                to_bus_ref="b2",
                catalog_namespace="APARAT_NN_MCB",
                materialized_params={"in_a": 16.0, "curve_class": "B", "icn_ka": 6.0},
            ),
        ],
        substations=[
            Substation(
                ref_id="stn",
                name="S",
                station_type="mv_lv",
                bus_refs=["nn"],
                transformer_refs=["tr"],
            )
        ],
    )


def _pobierz_widok_u_zrodla(enm: EnergyNetworkModel) -> Any:
    return build_station_fault_loop_view(enm, "stn")


def _pobierz_widok_w_punkcie(enm: EnergyNetworkModel) -> Any:
    return build_fault_loop_view_at_point(enm, "stn", "b1")


def _pobierz_widok_odplywow(enm: EnergyNetworkModel) -> Any:
    return build_feeder_fault_loop_view(enm, "stn")


def _pobierz_swz(enm: EnergyNetworkModel) -> Any:
    return build_swz_view(enm, "stn", "b1", "ap1")


def _pobierz_dobor_aparatow(enm: EnergyNetworkModel) -> Any:
    return _ik1_min_i_u0(enm, "stn", "b1")


def _pobierz_dowod_obwodu(enm: EnergyNetworkModel) -> Any:
    return _petla_zwarcia_min(enm, "stn", "b1")


_SCIEZKI = {
    "petla_u_zrodla": _pobierz_widok_u_zrodla,
    "petla_w_punkcie": _pobierz_widok_w_punkcie,
    "petle_odplywow": _pobierz_widok_odplywow,
    "swz": _pobierz_swz,
    "dobor_aparatow_nn": _pobierz_dobor_aparatow,
    "dowod_obwodu_nn": _pobierz_dowod_obwodu,
}


@pytest.mark.parametrize("sciezka", sorted(_SCIEZKI))
@pytest.mark.parametrize(("napiecie_gorne_kv", "napiecie_dolne_kv", "siec"), _RODZAJE)
@pytest.mark.parametrize("nazwa", _NAZWY)
def test_etykiety_skladowych_na_wejsciu_solvera(
    monkeypatch: pytest.MonkeyPatch,
    sciezka: str,
    napiecie_gorne_kv: float,
    napiecie_dolne_kv: float,
    siec: str,
    nazwa: str,
) -> None:
    wejscia: list[FaultLoopInput] = []
    oryginal = serwis_petli.compute_fault_loop

    def _przechwyc(dane: FaultLoopInput) -> Any:
        wejscia.append(dane)
        return oryginal(dane)

    monkeypatch.setattr(serwis_petli, "compute_fault_loop", _przechwyc)
    _SCIEZKI[sciezka](_enm(nazwa, napiecie_gorne_kv, napiecie_dolne_kv))

    assert wejscia, f"ścieżka {sciezka} nie policzyła pętli zwarcia"
    for dane in wejscia:
        etykieta_tr = dane.transformer_impedance.label
        assert etykieta_tr == (nazwa or _TR_BEZ_NAZWY)
        assert "SN/nN SN/nN" not in etykieta_tr
        assert not etykieta_tr.startswith("Transformator SN/nN Transformator")
        assert dane.upstream_impedance is not None
        assert dane.upstream_impedance.label == siec


@pytest.mark.parametrize(("napiecie_gorne_kv", "napiecie_dolne_kv", "siec"), _RODZAJE)
@pytest.mark.parametrize("nazwa", _NAZWY)
def test_etykiety_w_wyniku_widokow_i_swz(
    napiecie_gorne_kv: float, napiecie_dolne_kv: float, siec: str, nazwa: str
) -> None:
    """Ta sama etykieta dociera do wyniku (`components`) widoku pętli i SWZ."""
    enm = _enm(nazwa, napiecie_gorne_kv, napiecie_dolne_kv)
    oczekiwane = {nazwa or _TR_BEZ_NAZWY, siec}
    for wynik, klucz in (
        (build_station_fault_loop_view(enm, "stn"), "fault_loop"),
        (build_fault_loop_view_at_point(enm, "stn", "b1"), "fault_loop"),
        (build_swz_view(enm, "stn", "b1", "ap1"), "fault_loop_min_scenario"),
    ):
        assert wynik["status"] == "OK", wynik
        etykiety = {c["label"] for c in wynik[klucz]["components"]}
        assert oczekiwane <= etykiety, etykiety


@pytest.mark.parametrize(
    ("napiecie_gorne_kv", "napiecie_dolne_kv", "oczekiwana"),
    [
        (15.0, 0.4, "Sieć SN (upstream Thevenin, sprowadzone do nN)"),
        (110.0, 0.4, "Sieć WN (upstream Thevenin, sprowadzone do nN)"),
        (110.0, 15.0, "Sieć WN (upstream Thevenin, sprowadzone do SN)"),
    ],
)
def test_etykieta_sieci_zasilajacej_z_pasm_napiec_transformatora(
    napiecie_gorne_kv: float, napiecie_dolne_kv: float, oczekiwana: str
) -> None:
    """Rodzaje transformatora {SN/nN, WN/nN, WN/SN}: klasa obu stron z napięć, nie ze stałej."""
    trafo = (
        _enm("T", napiecie_gorne_kv)
        .transformers[0]
        .model_copy(update={"uhv_kv": napiecie_gorne_kv, "ulv_kv": napiecie_dolne_kv})
    )
    assert etykieta_sieci_zasilajacej_petli(trafo) == oczekiwana
    assert etykieta_transformatora_petli(trafo) == "T"


def test_wejscie_solvera_petli_skladane_w_jednym_miejscu_warstwy_aplikacji() -> None:
    """Deklaracja „jedno złożenie wejścia solvera” (`oblicz_petle_na_trasie`) przypięta testem:
    żaden moduł warstwy aplikacji poza nim nie buduje `FaultLoopBuildRequest` i nie podaje
    własnej etykiety transformatora — inaczej wróci osobna kopia etykiety."""
    naruszenia: list[str] = []
    for plik in sorted((_SRC / "application").rglob("*.py")):
        drzewo = ast.parse(plik.read_text(encoding="utf-8"))
        for wezel in ast.walk(drzewo):
            if not isinstance(wezel, ast.Call):
                continue
            nazwa = getattr(wezel.func, "id", None) or getattr(wezel.func, "attr", None)
            if nazwa != "FaultLoopBuildRequest":
                continue
            funkcja = next(
                (
                    f.name
                    for f in ast.walk(drzewo)
                    if isinstance(f, ast.FunctionDef)
                    and f.lineno <= wezel.lineno <= (f.end_lineno or f.lineno)
                ),
                None,
            )
            miejsce = f"{plik.relative_to(_SRC)}::{funkcja}"
            if miejsce != "application/analyses/fault_loop/service.py::oblicz_petle_na_trasie":
                naruszenia.append(miejsce)
    assert naruszenia == []


def test_domyslne_etykiety_buildera_bez_klasy_napieciowej() -> None:
    """Domyślne etykiety `fault_loop_builder` (żądanie bez etykiet, np. `/fault-loop` bez
    składowej sieci zasilającej) niosą wyłącznie rolę składowej — builder nie zna napięć
    stron, więc klasa „SN/nN” (dawniej „Transformator SN/NN”, „Sieć SN …”) byłaby domysłem."""
    domyslne = [
        FaultLoopBuildRequest.transformer_label,
        FaultLoopBuildRequest.upstream_label,
        inspect.signature(refer_upstream_impedance_to_lv_ohm).parameters["label"].default,
    ]
    assert domyslne[0] == "Transformator"
    for etykieta in domyslne:
        assert not re.search(r"\b(SN|nN|NN|WN)\b", etykieta), etykieta


def test_zadanie_petli_w_produkcie_zawsze_z_jawnymi_etykietami() -> None:
    """Każde złożenie `FaultLoopBuildRequest` w kodzie produktu (poza builderem) podaje
    etykietę transformatora i sieci zasilającej jawnie — z modelu albo z ciała żądania API
    (`FaultLoopComponentModel.label` jest wymagane)."""
    wywolania: list[str] = []
    for plik in sorted(_SRC.rglob("*.py")):
        if plik.name == "fault_loop_builder.py":
            continue
        for wezel in ast.walk(ast.parse(plik.read_text(encoding="utf-8"))):
            if not isinstance(wezel, ast.Call):
                continue
            nazwa = getattr(wezel.func, "id", None) or getattr(wezel.func, "attr", None)
            if nazwa != "FaultLoopBuildRequest":
                continue
            klucze = {k.arg for k in wezel.keywords}
            wywolania.append(str(plik.relative_to(_SRC)))
            assert {"transformer_label", "upstream_label"} <= klucze, plik
    assert sorted(wywolania) == [
        "api/fault_loop.py",
        "application/analyses/fault_loop/service.py",
    ]
