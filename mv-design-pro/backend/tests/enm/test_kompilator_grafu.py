"""Kompilator dowolnego grafu węzeł–gałąź → operacje domenowe (W1, `enm/kompilator_grafu.py`).

Iloczyn cech: {drzewo, pierścień, wiele źródeł} × {odcinek, transformator od strony HV,
transformator od strony LV, transformator zamykający} × {typ katalogu statycznego, typ
projektu} × {odbiór} + odmowy nazwane (szyna nieosiągalna, odcinek między napięciami,
źródło bez danych, duplikaty). Determinizm: ten sam graf = ten sam odcisk modelu.
"""

from __future__ import annotations

import pytest
from enm.hash import compute_enm_hash
from enm.kompilator_grafu import (
    BladGrafuWejsciowego,
    EdgeSpec,
    GrafDoKompilacji,
    OdbiorSpec,
    SzynaSpec,
    TransformatorSpec,
    ZrodloSpec,
    kompiluj_graf,
)
from enm.models import EnergyNetworkModel
from enm.validator import ENMValidator

KABEL = "cable-tfk-yakxs-3x120"
TRAFO_SN_NN = "tr-sn-nn-15-04-630kva-dyn11"
LINIA_PROJEKTU = {
    "id": "arkusz-linia-afl-6-120",
    "name": "AFL-6 120 (arkusz)",
    "params": {
        "r_ohm_per_km": 0.253,
        "x_ohm_per_km": 0.081,
        "b_us_per_km": 2.8,
        "rated_current_a": 315.0,
        "voltage_rating_kv": 15.0,
        "max_temperature_c": None,
        "cross_section_mm2": None,
        "source_reference": "arkusz:siec.xlsx#Linie:2",
        "verification_status": "NIEWERYFIKOWANY",
        "catalog_status": "PROJEKTOWY_V1",
    },
}


def _szyny(*spec: tuple[str, float]) -> tuple[SzynaSpec, ...]:
    return tuple(SzynaSpec(lit=lit, name=f"Szyna {lit}", voltage_kv=u) for lit, u in spec)


def _zrodlo(lit: str = "B1", **kw: object) -> ZrodloSpec:
    dane = {"lit": lit, "name": f"GPZ {lit}", "rx_ratio": 0.1, "sk3_mva": 250.0}
    dane.update(kw)
    return ZrodloSpec(**dane)  # type: ignore[arg-type]


def _promieniowa() -> GrafDoKompilacji:
    """GPZ 15 kV → L1 → B2 → L2 → B3; T1 15/0,4 kV z B3 → B4 (nN) z odbiorem."""
    return GrafDoKompilacji(
        name="promieniowa",
        szyny=_szyny(("B1", 15.0), ("B2", 15.0), ("B3", 15.0), ("B4", 0.4)),
        odcinki=(
            EdgeSpec("L1", "B1", "B2", KABEL, 1200.0, "KABEL"),
            EdgeSpec("L2", "B2", "B3", LINIA_PROJEKTU["id"], 3000.0, "LINIA"),
        ),
        transformatory=(TransformatorSpec("T1", "B3", "B4", TRAFO_SN_NN),),
        zrodla=(_zrodlo(),),
        odbiory=(OdbiorSpec("B4", "O1", 0.25, 0.08), OdbiorSpec("B3", "O2", 1.2, 0.4)),
        katalog_projektu={
            "line_types": [LINIA_PROJEKTU],
            "cable_types": [],
            "transformer_types": [],
        },
    )


def _model(wynik) -> EnergyNetworkModel:
    return EnergyNetworkModel.model_validate(wynik.enm)


def _szyna(model: EnergyNetworkModel, ref: str):
    return next(b for b in model.buses if b.ref_id == ref)


def test_siec_promieniowa_z_transformatorem_i_odbiorami() -> None:
    wynik = kompiluj_graf(_promieniowa())
    model = _model(wynik)
    assert set(wynik.bus_map) == {"B1", "B2", "B3", "B4"}
    assert set(wynik.branch_map) == {"L1", "L2"}
    assert set(wynik.transformer_map) == {"T1"}
    assert set(wynik.source_map) == {"B1"} and set(wynik.load_map) == {"O1", "O2"}
    # Nazwy szyn z grafu — także szyny GPZ i szyny utworzonej przez transformator.
    for lit in ("B1", "B2", "B3", "B4"):
        assert _szyna(model, wynik.bus_map[lit]).name == f"Szyna {lit}"
    assert _szyna(model, wynik.bus_map["B4"]).voltage_kv == pytest.approx(0.4)
    odcinek_projektu = next(b for b in model.branches if b.ref_id == wynik.branch_map["L2"])
    assert odcinek_projektu.catalog_ref == LINIA_PROJEKTU["id"]
    assert odcinek_projektu.r_ohm_per_km == pytest.approx(0.253)
    assert odcinek_projektu.length_km == pytest.approx(3.0)
    trafo = next(t for t in model.transformers if t.ref_id == wynik.transformer_map["T1"])
    assert trafo.hv_bus_ref == wynik.bus_map["B3"] and trafo.lv_bus_ref == wynik.bus_map["B4"]
    odbior = next(o for o in model.loads if o.ref_id == wynik.load_map["O1"])
    assert odbior.bus_ref == wynik.bus_map["B4"] and odbior.p_mw == pytest.approx(0.25)
    zrodlo = model.sources[0]
    assert zrodlo.bus_ref == wynik.bus_map["B1"] and zrodlo.sk3_mva == pytest.approx(250.0)
    # Model gotowy do obliczeń bez blokad (jedna prawda od pierwszego bajtu, bez ręcznych poprawek).
    walidacja = ENMValidator().validate(model)
    assert [i.code for i in walidacja.issues if i.severity == "BLOCKER"] == []


def test_ten_sam_graf_daje_ten_sam_odcisk_modelu() -> None:
    assert compute_enm_hash(_model(kompiluj_graf(_promieniowa()))) == compute_enm_hash(
        _model(kompiluj_graf(_promieniowa()))
    )


def test_pierscien_domyka_sie_krawedzia_zamykajaca() -> None:
    graf = GrafDoKompilacji(
        name="pierscien",
        szyny=_szyny(("B1", 15.0), ("B2", 15.0), ("B3", 15.0)),
        odcinki=(
            EdgeSpec("L1", "B1", "B2", KABEL, 1000.0, "KABEL"),
            EdgeSpec("L2", "B2", "B3", KABEL, 1000.0, "KABEL"),
            EdgeSpec("L3", "B3", "B1", KABEL, 1000.0, "KABEL"),
        ),
        zrodla=(_zrodlo(),),
    )
    wynik = kompiluj_graf(graf)
    model = _model(wynik)
    assert len(model.buses) == 3 and set(wynik.branch_map) == {"L1", "L2", "L3"}
    konce = {
        (b.from_bus_ref, b.to_bus_ref)
        for b in model.branches
        if b.ref_id in wynik.branch_map.values()
    }
    assert (wynik.bus_map["B3"], wynik.bus_map["B1"]) in konce or (
        wynik.bus_map["B1"],
        wynik.bus_map["B3"],
    ) in konce


def test_dwa_zrodla_i_transformator_od_strony_lv() -> None:
    """Dwa GPZ (15 kV) połączone odcinkiem (krawędź zamykająca między drzewami) oraz
    transformator 110/15 kV, do którego przegląd dochodzi od strony LV (nowa szyna HV)."""
    graf = GrafDoKompilacji(
        name="dwa gpz",
        szyny=_szyny(("A", 15.0), ("B", 15.0), ("C", 15.0), ("H", 110.0)),
        odcinki=(
            EdgeSpec("LA", "A", "C", KABEL, 1000.0, "KABEL"),
            EdgeSpec("LB", "B", "C", KABEL, 1000.0, "KABEL"),
        ),
        transformatory=(TransformatorSpec("T110", "H", "C", "tr-wn-sn-110-15-25mva-yd11"),),
        zrodla=(_zrodlo("A"), _zrodlo("B", sk3_mva=None, ik3_ka=9.0, u_set_pu=1.02)),
    )
    wynik = kompiluj_graf(graf)
    model = _model(wynik)
    assert len(model.sources) == 2
    assert set(wynik.bus_map) == {"A", "B", "C", "H"}
    assert _szyna(model, wynik.bus_map["H"]).voltage_kv == pytest.approx(110.0)
    trafo = next(t for t in model.transformers if t.ref_id == wynik.transformer_map["T110"])
    assert trafo.hv_bus_ref == wynik.bus_map["H"] and trafo.lv_bus_ref == wynik.bus_map["C"]
    zrodlo_b = next(s for s in model.sources if s.ref_id == wynik.source_map["B"])
    assert zrodlo_b.ik3_ka == pytest.approx(9.0) and zrodlo_b.u_set_pu == pytest.approx(1.02)


@pytest.mark.parametrize(
    ("graf", "fragment"),
    [
        (
            GrafDoKompilacji(
                name="wyspa",
                szyny=_szyny(("B1", 15.0), ("B2", 15.0), ("B9", 15.0)),
                odcinki=(EdgeSpec("L1", "B1", "B2", KABEL, 1000.0, "KABEL"),),
                zrodla=(_zrodlo(),),
            ),
            "nieosiągalne",
        ),
        (
            GrafDoKompilacji(
                name="napiecia",
                szyny=_szyny(("B1", 15.0), ("B2", 0.4)),
                odcinki=(EdgeSpec("L1", "B1", "B2", KABEL, 1000.0, "KABEL"),),
                zrodla=(_zrodlo(),),
            ),
            "różnych napięciach",
        ),
        (
            GrafDoKompilacji(
                name="bez zrodla",
                szyny=_szyny(("B1", 15.0)),
            ),
            "bez źródła",
        ),
        (
            GrafDoKompilacji(
                name="zrodlo bez danych",
                szyny=_szyny(("B1", 15.0)),
                zrodla=(_zrodlo(sk3_mva=None),),
            ),
            "Sk'' albo",
        ),
        (
            GrafDoKompilacji(
                name="duplikat",
                szyny=_szyny(("B1", 15.0), ("B2", 15.0)),
                odcinki=(
                    EdgeSpec("L1", "B1", "B2", KABEL, 1000.0, "KABEL"),
                    EdgeSpec("L1", "B2", "B1", KABEL, 1000.0, "KABEL"),
                ),
                zrodla=(_zrodlo(),),
            ),
            "dwukrotnie",
        ),
        (
            GrafDoKompilacji(
                name="trafo odwrotnie",
                szyny=_szyny(("B1", 15.0), ("B2", 0.4)),
                transformatory=(TransformatorSpec("T1", "B2", "B1", TRAFO_SN_NN),),
                zrodla=(_zrodlo(),),
            ),
            "niższe napięcie",
        ),
    ],
)
def test_odmowy_nazwane(graf: GrafDoKompilacji, fragment: str) -> None:
    with pytest.raises(BladGrafuWejsciowego, match=fragment):
        kompiluj_graf(graf)


def test_transformator_dostaje_nazwe_z_grafu_w_obu_torach() -> None:
    """Nazwa transformatora z grafu trafia do modelu zarówno dla krawędzi drzewa
    (transformator tworzy nową szynę), jak i krawędzi zamykającej (obie szyny istnieją)."""
    graf = GrafDoKompilacji(
        name="nazwy-trafo",
        szyny=_szyny(("B1", 15.0), ("B2", 15.0), ("B3", 0.4)),
        odcinki=(EdgeSpec("L1", "B1", "B2", KABEL, 1000.0, "KABEL"),),
        transformatory=(
            TransformatorSpec("T-drzewo", "B2", "B3", TRAFO_SN_NN, name="Trafo stacyjny"),
            TransformatorSpec("T-zamykajacy", "B2", "B3", TRAFO_SN_NN, name="Trafo rezerwowy"),
        ),
        zrodla=(_zrodlo(),),
    )
    model = _model(kompiluj_graf(graf))
    assert sorted(t.name for t in model.transformers) == ["Trafo rezerwowy", "Trafo stacyjny"]
