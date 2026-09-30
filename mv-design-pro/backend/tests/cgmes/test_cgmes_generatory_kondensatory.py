"""
Karta OLTC-U-DOCELOWE/C2: generatory i kondensatory w wymianie CGMES.

Stan PRZED:
- ``RotatingMachine.ratedS``/``PowerElectronicsConnection.ratedS`` pisane z MOCY CZYNNEJ
  ``p_mw`` (P w miejsce S),
- ``PowerElectronicsConnection.p/q`` w konwencji wytwórczej, choć CGMES 3.0 wymaga
  odbiorczej („positive sign means flow out from a node"), a ``SynchronousMachine`` bez
  ``p``/``q`` w ogóle,
- jednostka PV jako nieistniejąca klasa ``PhotovoltaicUnit`` (CGMES 3.0: ``PhotoVoltaicUnit``),
  turbina SCIG jako ``PowerElectronicsConnection`` (maszyna klatkowa nie ma przekształtnika),
- tor obcy EQ+TP nie importował generatorów, kondensatorów ani stacji.

Iloczyn cech generatora: rodzaj {None, synchronous, pv_inverter, bess, wind_inverter,
fw_pmsg, fw_dfig, fw_scig} × Q {brak, podane} × S z tabliczki {brak, podana} × U_n
{brak, podane} × liczba jednostek {brak, 3} = 128 przypadków; kondensator: Q {0,6; 1,2}
Mvar × U_n {15; 0,4} kV × stan {załączony, otwarty} = 8.
"""

from __future__ import annotations

import io
import itertools
import zipfile
from typing import Any

import pytest
from application.cgmes.service import export_cgmes, import_cgmes
from enm.mapping import _gen_rated_apparent_mva
from enm.models import (
    Bus,
    EnergyNetworkModel,
    ENMHeader,
    Generator,
    ShuntCapacitor,
    Source,
)
from infrastructure.cgmes.cgmes_exporter import (
    _IBR_TYPES,
    _KLASA_CIM_GENERATORA,
    GENERATOR_UTRATA_TORU_OBCEGO,
    build_eq_tp_trees,
    export_eq_tp_bytes,
)
from infrastructure.cgmes.cgmes_importer import import_from_eq_tp
from infrastructure.cgmes.mrid import KLASY_OBIEKTOW_GLOWNYCH, mrid_for
from infrastructure.cgmes.profiles import NS_CIM, NS_RDF

from .golden_enm import build_golden_enm

_CIM = f"{{{NS_CIM}}}"
_RDF_ID = f"{{{NS_RDF}}}ID"
_RDF_RESOURCE = f"{{{NS_RDF}}}resource"

_P_MW = 2.0
_Q_MVAR = 0.6
_SN_MVA = 2.5
_UN_KV = 0.69

_RODZAJE = (
    None,
    "synchronous",
    "pv_inverter",
    "bess",
    "wind_inverter",
    "fw_pmsg",
    "fw_dfig",
    "fw_scig",
)

#: Rodzaj po torze obcym — typ z KLASY CIM (utraty nazwane w GENERATOR_UTRATA_TORU_OBCEGO).
_RODZAJ_PO_IMPORCIE = {
    None: "synchronous",
    "synchronous": "synchronous",
    "pv_inverter": "pv_inverter",
    "bess": "bess",
    "wind_inverter": "wind_inverter",
    "fw_pmsg": "wind_inverter",
    "fw_dfig": "wind_inverter",
    "fw_scig": "fw_scig",
}


def _siec(
    generatory: list[Generator] | None = None,
    kondensatory: list[ShuntCapacitor] | None = None,
) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="cgmes-generatory"),
        buses=[
            Bus(ref_id="b_sn", name="Szyna SN", voltage_kv=15.0),
            Bus(ref_id="b_nn", name="Szyna nN", voltage_kv=0.4),
        ],
        sources=[
            Source(
                ref_id="s1",
                name="Siec",
                bus_ref="b_sn",
                model="short_circuit_power",
                sk3_mva=250.0,
                rx_ratio=0.1,
            )
        ],
        generators=generatory or [],
        shunt_capacitors=kondensatory or [],
    )


def _generator(
    rodzaj: str | None,
    *,
    q: float | None = _Q_MVAR,
    sn: float | None = _SN_MVA,
    un: float | None = _UN_KV,
    jednostki: int | None = None,
) -> Generator:
    tabliczka: dict[str, float] = {}
    if sn is not None:
        tabliczka["sn_mva"] = sn
    if un is not None:
        tabliczka["un_kv"] = un
    return Generator(
        ref_id="g1",
        name="Zrodlo",
        bus_ref="b_sn",
        p_mw=_P_MW,
        q_mvar=q,
        gen_type=rodzaj,  # type: ignore[arg-type]
        materialized_params=tabliczka or None,
        quantity=jednostki,
    )


def _eq_obiekty(enm: EnergyNetworkModel) -> dict[str, Any]:
    eq, _tp = build_eq_tp_trees(enm)
    return {e.tag.rpartition("}")[2]: e for e in eq}


def _tekst(elem: Any, nazwa: str) -> str | None:
    wezel = elem.find(f"{_CIM}{nazwa}")
    return None if wezel is None else wezel.text


def _po_torze_obcym(enm: EnergyNetworkModel) -> tuple[EnergyNetworkModel, list[str]]:
    wynik = import_cgmes(export_cgmes(enm), prefer_side_car=False)
    assert wynik.enm is not None
    return wynik.enm, wynik.warnings


# ---------------------------------------------------------------------------
# Iloczyn cech generatora (128 przypadków)
# ---------------------------------------------------------------------------

_ILOCZYN_GEN = list(
    itertools.product(_RODZAJE, (None, _Q_MVAR), (None, _SN_MVA), (None, _UN_KV), (None, 3))
)


def _id_gen(p: tuple[Any, ...]) -> str:
    rodzaj, q, sn, un, n = p
    return (
        f"{rodzaj or 'nieokreslony'}-q_{'tak' if q else 'brak'}-sn_{'tak' if sn else 'brak'}-"
        f"un_{'tak' if un else 'brak'}-jednostki_{n or 'brak'}"
    )


@pytest.mark.parametrize("cechy", _ILOCZYN_GEN, ids=[_id_gen(p) for p in _ILOCZYN_GEN])
class TestIloczynGeneratora:
    def _model(self, cechy: tuple[Any, ...]) -> EnergyNetworkModel:
        rodzaj, q, sn, un, n = cechy
        return _siec([_generator(rodzaj, q=q, sn=sn, un=un, jednostki=n)])

    def test_xml_moc_pozorna_z_tabliczki_nigdy_z_mocy_czynnej(self, cechy: tuple[Any, ...]) -> None:
        rodzaj, q, sn, un, n = cechy
        klasa, jednostka = _KLASA_CIM_GENERATORA[rodzaj]
        obiekty = _eq_obiekty(self._model(cechy))
        urzadzenie = obiekty[klasa]
        assert urzadzenie.get(_RDF_ID) == mrid_for(klasa, "g1")
        wl = "PowerElectronicsConnection" if jednostka else "RotatingMachine"
        rated_s = _tekst(urzadzenie, f"{wl}.ratedS")
        if sn is None:
            assert rated_s is None  # brak tabliczki = brak atrybutu, nie P w miejsce S
        else:
            assert float(rated_s or "nan") == pytest.approx(sn * (n or 1) * 1e6)
        rated_u = _tekst(urzadzenie, f"{wl}.ratedU")
        assert (rated_u is None) is (un is None)
        if un is not None:
            assert float(rated_u or "nan") == pytest.approx(un * 1e3)
        # Konwencja odbiorcza CGMES: wytwarzanie ma znak ujemny.
        assert float(_tekst(urzadzenie, f"{wl}.p") or "nan") == pytest.approx(-_P_MW * 1e6)
        q_txt = _tekst(urzadzenie, f"{wl}.q")
        assert (q_txt is None) is (q is None)
        if q is not None:
            assert float(q_txt or "nan") == pytest.approx(-q * 1e6)
        if jednostka is None:
            assert "PowerElectronicsConnection" not in obiekty
        else:
            unit = obiekty[jednostka]
            assert unit.find(f"{_CIM}PowerElectronicsUnit.PowerElectronicsConnection").get(
                _RDF_RESOURCE
            ) == (f"urn:uuid:{mrid_for('PowerElectronicsConnection', 'g1')}")
        assert "PhotovoltaicUnit" not in obiekty  # klasa spoza CGMES 3.0

    def test_runda_tor_obcy(self, cechy: tuple[Any, ...]) -> None:
        rodzaj, q, sn, un, n = cechy
        enm = self._model(cechy)
        po_enm, ostrzezenia = _po_torze_obcym(enm)
        assert len(po_enm.generators) == 1, ostrzezenia
        po = po_enm.generators[0]
        assert po.ref_id == "g1" and po.bus_ref == "b_sn"
        assert po.gen_type == _RODZAJ_PO_IMPORCIE[rodzaj]
        assert po.p_mw == pytest.approx(_P_MW)
        assert po.q_mvar == (pytest.approx(q) if q is not None else None)
        tabliczka = po.materialized_params or {}
        if sn is None:
            assert "sn_mva" not in tabliczka
        else:
            # Moc CAŁEJ instalacji w jednej jednostce — ta sama moc łączna dla mappera.
            assert tabliczka["sn_mva"] == pytest.approx(sn * (n or 1))
            assert po.quantity is None
            przed = _gen_rated_apparent_mva(
                enm.generators[0], enm.generators[0].materialized_params or {}
            )
            assert _gen_rated_apparent_mva(po, tabliczka) == pytest.approx(przed)
        assert tabliczka.get("un_kv") == (pytest.approx(un) if un is not None else None)
        if rodzaj in ("fw_pmsg", "fw_dfig", "wind_inverter"):
            assert any("nie odróżnia typu 3" in o for o in ostrzezenia)
        assert po.catalog_ref is None and po.source_mode == "MIGRACJA"

    def test_runda_side_car_pelna_tozsamosc(self, cechy: tuple[Any, ...]) -> None:
        enm = self._model(cechy)
        wynik = import_cgmes(export_cgmes(enm))
        assert wynik.used_side_car and wynik.enm is not None
        assert wynik.enm.generators[0].model_dump(exclude={"id"}) == enm.generators[0].model_dump(
            exclude={"id"}
        )


def test_mapa_klas_pokrywa_caly_literal_gen_type() -> None:
    from typing import get_args

    adnotacja = Generator.model_fields["gen_type"].annotation
    literal = next(a for a in get_args(adnotacja) if a is not type(None))
    assert set(_KLASA_CIM_GENERATORA) == set(get_args(literal)) | {None}
    # Klasy przekształtnikowe CIM tylko dla rodzajów z kanonicznego zbioru DER.
    assert {
        r for r, (k, _j) in _KLASA_CIM_GENERATORA.items() if k == "PowerElectronicsConnection"
    } <= _IBR_TYPES


def test_utraty_generatora_nazwane() -> None:
    assert any("fw_pmsg/fw_dfig" in u for u in GENERATOR_UTRATA_TORU_OBCEGO)
    assert any("gen_type=None" in u for u in GENERATOR_UTRATA_TORU_OBCEGO)
    assert any("quantity" in u for u in GENERATOR_UTRATA_TORU_OBCEGO)


# ---------------------------------------------------------------------------
# Iloczyn cech kondensatora (8 przypadków)
# ---------------------------------------------------------------------------

_ILOCZYN_KOND = list(itertools.product((0.6, 1.2), (15.0, 0.4), ("closed", "open")))


@pytest.mark.parametrize(("q", "u", "stan"), _ILOCZYN_KOND)
def test_kondensator_runda_tor_obcy(q: float, u: float, stan: str) -> None:
    szyna = "b_sn" if u == 15.0 else "b_nn"
    enm = _siec(
        kondensatory=[
            ShuntCapacitor(
                ref_id="c1", name="Bateria", bus_ref=szyna, rated_mvar=q, rated_kv=u, status=stan
            )
        ]
    )
    po_enm, ostrzezenia = _po_torze_obcym(enm)
    assert len(po_enm.shunt_capacitors) == 1, ostrzezenia
    po = po_enm.shunt_capacitors[0]
    assert (po.ref_id, po.bus_ref, po.status) == ("c1", szyna, stan)
    assert po.rated_kv == pytest.approx(u)
    assert po.rated_mvar == pytest.approx(q, rel=1e-9)
    wynik = import_cgmes(export_cgmes(enm))
    assert wynik.enm is not None
    assert wynik.enm.shunt_capacitors[0].model_dump(exclude={"id"}) == enm.shunt_capacitors[
        0
    ].model_dump(exclude={"id"})


# ---------------------------------------------------------------------------
# Plik obcy: brak domysłów
# ---------------------------------------------------------------------------


def _eq_tp(enm: EnergyNetworkModel) -> tuple[str, bytes]:
    with zipfile.ZipFile(io.BytesIO(export_cgmes(enm))) as zf:
        return zf.read("EQ.xml").decode("utf-8"), zf.read("TP.xml")


def _kondensator_eq() -> tuple[str, bytes]:
    return _eq_tp(
        _siec(
            kondensatory=[
                ShuntCapacitor(
                    ref_id="c1", name="Bateria", bus_ref="b_sn", rated_mvar=0.6, rated_kv=15.0
                )
            ]
        )
    )


class TestPlikObcy:
    def test_maszyna_asynchroniczna_silnik_pominieta(self) -> None:
        eq, tp = _eq_tp(_siec([_generator("fw_scig")]))
        eq = eq.replace("AsynchronousMachineKind.generator", "AsynchronousMachineKind.motor")
        wynik = import_from_eq_tp(eq.encode("utf-8"), tp)
        assert wynik.enm is not None and wynik.enm.generators == []
        assert any("zamiast generatora" in o for o in wynik.warnings)

    def test_przeksztaltnik_bez_jednostki_rodzaj_pusty(self) -> None:
        eq, tp = _eq_tp(_siec([_generator("pv_inverter")]))
        start = eq.index("<cim:PhotoVoltaicUnit")
        koniec = eq.index("</cim:PhotoVoltaicUnit>") + len("</cim:PhotoVoltaicUnit>")
        eq = eq[:start] + eq[koniec:]
        wynik = import_from_eq_tp(eq.encode("utf-8"), tp)
        assert wynik.enm is not None and wynik.enm.generators[0].gen_type is None
        assert any("rodzaj źródła nieokreślony" in o for o in wynik.warnings)

    def test_brak_mocy_czynnej_nazwany(self) -> None:
        eq, tp = _eq_tp(_siec([_generator("synchronous")]))
        eq = eq.replace("<cim:RotatingMachine.p>-2000000</cim:RotatingMachine.p>", "")
        wynik = import_from_eq_tp(eq.encode("utf-8"), tp)
        assert wynik.enm is not None and wynik.enm.generators[0].p_mw == 0.0
        assert any("generator(ów)" in o and "0 MW" in o for o in wynik.warnings)

    def test_dlawik_pominiety(self) -> None:
        eq, tp = _kondensator_eq()
        eq = eq.replace(
            "<cim:LinearShuntCompensator.bPerSection>",
            "<cim:LinearShuntCompensator.bPerSection>-",
        )
        wynik = import_from_eq_tp(eq.encode("utf-8"), tp)
        assert wynik.enm is not None and wynik.enm.shunt_capacitors == []
        assert any("wyłącznie baterię kondensatorów" in o for o in wynik.warnings)

    def test_zalaczenie_czesciowe_pominiete(self) -> None:
        eq, tp = _kondensator_eq()
        eq = eq.replace(
            "<cim:ShuntCompensator.maximumSections>1<", "<cim:ShuntCompensator.maximumSections>3<"
        )
        wynik = import_from_eq_tp(eq.encode("utf-8"), tp)
        assert wynik.enm is not None and wynik.enm.shunt_capacitors == []
        assert any("załączenia częściowego" in o for o in wynik.warnings)

    def test_wiele_sekcji_zalaczonych_moc_calej_baterii(self) -> None:
        eq, tp = _kondensator_eq()
        eq = eq.replace(
            "<cim:ShuntCompensator.maximumSections>1<", "<cim:ShuntCompensator.maximumSections>3<"
        ).replace("<cim:ShuntCompensator.sections>1<", "<cim:ShuntCompensator.sections>3<")
        wynik = import_from_eq_tp(eq.encode("utf-8"), tp)
        assert wynik.enm is not None
        assert wynik.enm.shunt_capacitors[0].rated_mvar == pytest.approx(1.8, rel=1e-9)

    def test_brak_nom_u_pominiety_i_nazwany(self) -> None:
        eq, tp = _kondensator_eq()
        start = eq.index("<cim:ShuntCompensator.nomU>")
        koniec = eq.index("</cim:ShuntCompensator.nomU>") + len("</cim:ShuntCompensator.nomU>")
        wynik = import_from_eq_tp((eq[:start] + eq[koniec:]).encode("utf-8"), tp)
        assert wynik.enm is not None and wynik.enm.shunt_capacitors == []
        assert any("brak nomU" in o for o in wynik.warnings)

    def test_konduktancja_nazwana(self) -> None:
        eq, tp = _kondensator_eq()
        eq = eq.replace(
            "<cim:LinearShuntCompensator.gPerSection>0<",
            "<cim:LinearShuntCompensator.gPerSection>0.0001<",
        )
        wynik = import_from_eq_tp(eq.encode("utf-8"), tp)
        assert wynik.enm is not None and len(wynik.enm.shunt_capacitors) == 1
        assert any("gPerSection" in o for o in wynik.warnings)


# ---------------------------------------------------------------------------
# Stacje, tożsamość, determinizm
# ---------------------------------------------------------------------------


def test_stacje_nieodtworzone_i_nazwane() -> None:
    po_enm, ostrzezenia = _po_torze_obcym(build_golden_enm())
    assert po_enm.substations == []
    assert any("Stacje nieodtworzone (2)" in o for o in ostrzezenia)


def test_zloty_model_tor_obcy_niesie_generatory() -> None:
    enm = build_golden_enm()
    po_enm, _ = _po_torze_obcym(enm)
    assert {(g.ref_id, g.gen_type) for g in po_enm.generators} == {
        ("gen_sync", "synchronous"),
        ("gen_pv", "pv_inverter"),
    }


#: Obiekty podrzędne elementu (jednostka przekształtnika, regulator zaczepów) — nie są
#: elementami ENM, importer czyta je przez obiekt główny, a nie przez tożsamość.
_OBIEKTY_PODRZEDNE = frozenset(
    {
        "PhotoVoltaicUnit",
        "BatteryUnit",
        "PowerElectronicsWindUnit",
        "RatioTapChanger",
        "TapChangerControl",
    }
)


def test_klasy_obiektow_glownych_kompletne() -> None:
    """Każdy obiekt EQ o mRID-zie mrid_for(klasa, ref_id) ma klasę na liście importera."""
    enm = _siec(
        [_generator(r).model_copy(update={"ref_id": f"g_{r}"}) for r in _RODZAJE],
        [ShuntCapacitor(ref_id="c1", name="B", bus_ref="b_sn", rated_mvar=0.6, rated_kv=15.0)],
    )
    for model in (enm, build_golden_enm()):
        refy = {
            e.ref_id
            for lista in (
                model.buses,
                model.branches,
                model.transformers,
                model.sources,
                model.generators,
                model.loads,
                model.shunt_capacitors,
                model.substations,
            )
            for e in lista
        }
        eq, tp = build_eq_tp_trees(model)
        for elem in [*eq, *tp]:
            klasa = elem.tag.rpartition("}")[2]
            if klasa in _OBIEKTY_PODRZEDNE:
                continue
            if any(elem.get(_RDF_ID) == mrid_for(klasa, r) for r in refy):
                assert klasa in KLASY_OBIEKTOW_GLOWNYCH, klasa


@pytest.mark.parametrize("rodzaj", _RODZAJE)
def test_podwojny_eksport_bajtowo_identyczny(rodzaj: str | None) -> None:
    enm = _siec([_generator(rodzaj, jednostki=3)])
    assert export_cgmes(enm) == export_cgmes(enm)
    assert export_eq_tp_bytes(enm) == export_eq_tp_bytes(enm)


def test_model_bez_generatorow_i_kondensatorow_bajty_bazy() -> None:
    """Złoty model bez generatorów: EQ/TP bajtowo takie jak przed kartą C2.

    Skróty zmierzone na bazie d6c26c3f (przed kartami C i C2) i po C2 — identyczne.
    Zmiana tych bajtów wymaga dowodu semantycznego w commicie, nie przepięcia skrótu.
    """
    import hashlib

    enm = build_golden_enm().model_copy(update={"generators": []})
    eq, tp = export_eq_tp_bytes(enm)
    assert hashlib.sha256(eq).hexdigest() == (
        "81e048d51ed011cfda3d01a2898d3f4489a06f6f800e3e322dda3a420dc40d8b"
    )
    assert hashlib.sha256(tp).hexdigest() == (
        "017360fa12246b715487abf123f4c19b7fc08c1148262d72f3ef776d6f1d520b"
    )
