"""
Karta OLTC-U-DOCELOWE/C: wymiana CGMES niesie KANONICZNY regulator zaczepów
(``Transformer.tap_changer``, V12K-045) — nastawę napięcia docelowego, pasmo,
tryb, szynę regulowaną — przez eksport i przez tor obcy EQ+TP (bez side-cara).

Powód (decyzja O-59): napięcie docelowe regulatora OLTC pochodzi WYŁĄCZNIE z modelu,
a bieg z regulacją automatyczną bez niego jest odmawiany. Stan PRZED: eksport pisał
tylko pola legacy ``tap_*``, a importer toru obcego nie czytał transformatorów wcale,
więc nastawa ginęła po cichu.

Iloczyn cech (``TestIloczynCech``): regulacja {NONE, DETC, OLTC} × tryb {MANUAL,
AUTOMATIC, PROFILE, REMOTE} × nastawa {pusta, ustawiona} × pasmo {puste, ustawione} ×
szyna regulowana {brak (zacisk DN), wskazana (szyna zdalna)} × uzwojenie {HV, LV} ×
LDC {brak, włączone z impedancją} = 384 przypadki. Dla każdego: (a) XML — atrybut
obecny dokładnie wtedy, gdy model niesie pole; (b) runda przez tor obcy — pola
odwzorowane tożsame, pola bez odwzorowania CIM (zwłoka, LDC, PROFILE/REMOTE, NONE)
jako ZNANA utrata z tą samą fizyką; (c) runda przez side-car — pełna tożsamość.
"""

from __future__ import annotations

import io
import itertools
import zipfile
from typing import Any

import pytest
from application.cgmes.service import export_cgmes, import_cgmes
from enm.mapping import map_enm_to_network_graph, ref_to_graph_id
from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMHeader,
    LineDropCompensation,
    Load,
    Source,
    TapChanger,
    Transformer,
)
from infrastructure.cgmes.cgmes_exporter import (
    REGULATOR_ZACZEPOW_UTRATA_TORU_OBCEGO,
    build_eq_tp_trees,
    export_eq_tp_bytes,
)
from infrastructure.cgmes.cgmes_importer import import_from_eq_tp
from infrastructure.cgmes.mrid import mrid_for
from infrastructure.cgmes.profiles import NS_CIM, NS_RDF
from network_model.core.branch import TransformerBranch

from .golden_enm import build_golden_enm

_CIM = f"{{{NS_CIM}}}"
_RDF_RESOURCE = f"{{{NS_RDF}}}resource"

_NASTAWA_KV = 15.75
_PASMO_KV = 0.3
_ZWLOKA_S = 30.0


# ---------------------------------------------------------------------------
# Sieć testowa: GPZ 110/15 kV, kabel SN do szyny zdalnej z odbiorem
# ---------------------------------------------------------------------------


def _siec(tap_changer: TapChanger | None = None, **legacy: Any) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="cgmes-regulator"),
        buses=[
            Bus(ref_id="b_gn", name="Szyna 110 kV", voltage_kv=110.0),
            Bus(ref_id="b_dn", name="Szyna SN GPZ", voltage_kv=15.0),
            Bus(ref_id="b_zdalna", name="Szyna SN zdalna", voltage_kv=15.0),
            Bus(ref_id="b_izolowana", name="Szyna izolowana", voltage_kv=15.0),
        ],
        sources=[
            Source(
                ref_id="s1",
                name="Siec 110 kV",
                bus_ref="b_gn",
                model="short_circuit_power",
                sk3_mva=3000.0,
                rx_ratio=0.1,
            )
        ],
        transformers=[
            Transformer(
                ref_id="t1",
                name="TR 110/15",
                hv_bus_ref="b_gn",
                lv_bus_ref="b_dn",
                sn_mva=25.0,
                uhv_kv=110.0,
                ulv_kv=15.0,
                uk_percent=12.0,
                pk_kw=120.0,
                vector_group="YNd11",
                tap_changer=tap_changer,
                **legacy,
            )
        ],
        branches=[
            Cable(
                ref_id="k1",
                name="Kabel SN",
                from_bus_ref="b_dn",
                to_bus_ref="b_zdalna",
                length_km=3.0,
                r_ohm_per_km=0.125,
                x_ohm_per_km=0.11,
            )
        ],
        loads=[Load(ref_id="o1", name="Odbior", bus_ref="b_zdalna", p_mw=4.0, q_mvar=1.2)],
    )


def _regulator(
    *,
    regulacja: str = "OLTC",
    tryb: str = "AUTOMATIC",
    nastawa: float | None = _NASTAWA_KV,
    pasmo: float | None = _PASMO_KV,
    szyna: str | None = None,
    uzwojenie: str = "HV",
    ldc: bool = False,
) -> TapChanger:
    return TapChanger(
        regulation_type=regulacja,  # type: ignore[arg-type]
        regulated_winding=uzwojenie,  # type: ignore[arg-type]
        neutral_position=0,
        current_position=3,
        min_position=-9,
        max_position=9,
        step_percent=1.78,
        control_mode=tryb,  # type: ignore[arg-type]
        voltage_setpoint_kv=nastawa,
        deadband_kv=pasmo,
        delay_seconds=_ZWLOKA_S,
        controlled_bus_ref=szyna,
        line_drop_compensation=(
            LineDropCompensation(enabled=True, r_ohm=0.2, x_ohm=0.4) if ldc else None
        ),
    )


def _po_torze_obcym(enm: EnergyNetworkModel) -> tuple[Transformer, list[str]]:
    wynik = import_cgmes(export_cgmes(enm), prefer_side_car=False)
    assert wynik.enm is not None
    assert len(wynik.enm.transformers) == 1, wynik.warnings
    return wynik.enm.transformers[0], wynik.warnings


def _po_side_carze(enm: EnergyNetworkModel) -> Transformer:
    wynik = import_cgmes(export_cgmes(enm))
    assert wynik.used_side_car is True and wynik.enm is not None
    return wynik.enm.transformers[0]


def _element(enm: EnergyNetworkModel, klasa: str) -> Any:
    eq, _tp = build_eq_tp_trees(enm)
    return eq.find(f"{_CIM}{klasa}")


def _atrybut(elem: Any, nazwa: str) -> Any:
    return None if elem is None else elem.find(f"{_CIM}{nazwa}")


def _galaz_transformatora(enm: EnergyNetworkModel) -> TransformerBranch:
    graf = map_enm_to_network_graph(enm)
    galaz = graf.branches[ref_to_graph_id("t1")]
    assert isinstance(galaz, TransformerBranch)
    return galaz


# ---------------------------------------------------------------------------
# Iloczyn cech (384 przypadki)
# ---------------------------------------------------------------------------

_ILOCZYN = list(
    itertools.product(
        ("NONE", "DETC", "OLTC"),
        ("MANUAL", "AUTOMATIC", "PROFILE", "REMOTE"),
        (None, _NASTAWA_KV),
        (None, _PASMO_KV),
        (None, "b_zdalna"),
        ("HV", "LV"),
        (False, True),
    )
)


def _id(p: tuple[Any, ...]) -> str:
    regulacja, tryb, nastawa, pasmo, szyna, uzwojenie, ldc = p
    return (
        f"{regulacja}-{tryb}-nastawa_{'tak' if nastawa else 'brak'}-"
        f"pasmo_{'tak' if pasmo else 'brak'}-szyna_{szyna or 'DN'}-{uzwojenie}-"
        f"ldc_{'tak' if ldc else 'brak'}"
    )


@pytest.mark.parametrize("cechy", _ILOCZYN, ids=[_id(p) for p in _ILOCZYN])
class TestIloczynCech:
    def _model(self, cechy: tuple[Any, ...]) -> EnergyNetworkModel:
        regulacja, tryb, nastawa, pasmo, szyna, uzwojenie, ldc = cechy
        return _siec(
            _regulator(
                regulacja=regulacja,
                tryb=tryb,
                nastawa=nastawa,
                pasmo=pasmo,
                szyna=szyna,
                uzwojenie=uzwojenie,
                ldc=ldc,
            )
        )

    def test_xml_atrybut_obecny_dokladnie_gdy_pole_w_modelu(self, cechy: tuple[Any, ...]) -> None:
        regulacja, tryb, nastawa, pasmo, szyna, uzwojenie, _ldc = cechy
        enm = self._model(cechy)
        rtc = _element(enm, "RatioTapChanger")
        ctrl = _element(enm, "TapChangerControl")
        if regulacja == "NONE":
            assert rtc is None and ctrl is None
            return
        assert rtc is not None
        koniec = _atrybut(rtc, "RatioTapChanger.TransformerEnd").get(_RDF_RESOURCE)
        oczekiwany = "1" if uzwojenie == "HV" else "2"
        assert koniec == f"urn:uuid:{mrid_for('PowerTransformerEnd', 't1', suffix=oczekiwany)}"
        assert _atrybut(rtc, "TapChanger.ltcFlag").text == (
            "true" if regulacja == "OLTC" else "false"
        )
        assert _atrybut(rtc, "TapChanger.controlEnabled").text == (
            "false" if tryb == "MANUAL" else "true"
        )
        ma_sterowanie = (
            tryb != "MANUAL" or nastawa is not None or pasmo is not None or szyna is not None
        )
        assert (ctrl is not None) is ma_sterowanie
        assert (_atrybut(rtc, "TapChanger.TapChangerControl") is not None) is ma_sterowanie
        if ctrl is None:
            return
        assert (_atrybut(ctrl, "RegulatingControl.targetValue") is not None) is (
            nastawa is not None
        )
        assert (_atrybut(ctrl, "RegulatingControl.targetDeadband") is not None) is (
            pasmo is not None
        )
        assert (_atrybut(ctrl, "RegulatingControl.targetValueUnitMultiplier") is not None) is (
            nastawa is not None or pasmo is not None
        )
        assert (_atrybut(ctrl, "RegulatingControl.Terminal") is not None) is (szyna is not None)
        # Pola bez odpowiednika w profilu CGMES 3.0 nie są wymyślane jako rozszerzenia.
        for obiekt in (rtc, ctrl):
            nazwy = {dziecko.tag.rpartition("}")[2] for dziecko in obiekt}
            assert not any("Delay" in n or "lineDrop" in n for n in nazwy), nazwy

    def test_runda_tor_obcy_pola_odwzorowane_tozsame(self, cechy: tuple[Any, ...]) -> None:
        regulacja, tryb, nastawa, pasmo, szyna, uzwojenie, _ldc = cechy
        enm = self._model(cechy)
        przed = enm.transformers[0].tap_changer
        assert przed is not None
        po, _ = _po_torze_obcym(enm)
        if regulacja == "NONE":
            # Znana utrata: CIM nie zna „regulatora bez regulacji" odrębnego od braku.
            assert po.tap_changer is None
            assert po.tap_min is None and po.tap_position is None
            return
        tc = po.tap_changer
        assert tc is not None
        assert tc.regulation_type == regulacja
        assert tc.regulated_winding == uzwojenie
        assert (tc.neutral_position, tc.current_position) == (0, 3)
        assert (tc.min_position, tc.max_position) == (-9, 9)
        assert tc.step_percent == przed.step_percent
        assert tc.voltage_setpoint_kv == nastawa
        assert tc.deadband_kv == pasmo
        assert tc.controlled_bus_ref == szyna
        # Tryb: MANUAL/AUTOMATIC tożsame; PROFILE/REMOTE -> AUTOMATIC (znana utrata).
        assert tc.control_mode == ("MANUAL" if tryb == "MANUAL" else "AUTOMATIC")
        # Znane utraty toru obcego (CGMES 3.0 nie ma odpowiednika).
        assert tc.delay_seconds is None
        assert tc.line_drop_compensation is None
        assert tc.catalog_ref is None

    def test_runda_tor_obcy_ta_sama_fizyka_regulatora(self, cechy: tuple[Any, ...]) -> None:
        enm = self._model(cechy)
        po, _ = _po_torze_obcym(enm)
        przed_galaz = _galaz_transformatora(enm)
        po_enm = enm.model_copy(update={"transformers": [po]})
        po_galaz = _galaz_transformatora(po_enm)
        assert po_galaz.get_tap_ratio() == pytest.approx(przed_galaz.get_tap_ratio(), rel=1e-12)
        przed_tc, po_tc = przed_galaz.tap_changer, po_galaz.tap_changer
        assert (po_tc is not None and po_tc.is_automatic()) == (
            przed_tc is not None and przed_tc.is_automatic()
        )
        if po_tc is not None and przed_tc is not None:
            assert po_tc.controlled_bus_id == przed_tc.controlled_bus_id

    def test_runda_side_car_pelna_tozsamosc(self, cechy: tuple[Any, ...]) -> None:
        enm = self._model(cechy)
        assert _po_side_carze(enm).tap_changer == enm.transformers[0].tap_changer


# ---------------------------------------------------------------------------
# Szyna regulowana: własne zaciski transformatora i szyna bez zacisku
# ---------------------------------------------------------------------------


class TestSzynaRegulowana:
    @pytest.mark.parametrize(("szyna", "zacisk"), [("b_dn", "2"), ("b_gn", "1")])
    def test_szyna_wlasna_wskazuje_zacisk_transformatora(self, szyna: str, zacisk: str) -> None:
        enm = _siec(_regulator(szyna=szyna))
        ctrl = _element(enm, "TapChangerControl")
        assert _atrybut(ctrl, "RegulatingControl.Terminal").get(_RDF_RESOURCE) == (
            f"urn:uuid:{mrid_for('Terminal', 't1', suffix=zacisk)}"
        )
        po, _ = _po_torze_obcym(enm)
        assert po.tap_changer is not None and po.tap_changer.controlled_bus_ref == szyna

    def test_szyna_zdalna_wskazuje_zacisk_urzadzenia_na_tej_szynie(self) -> None:
        enm = _siec(_regulator(szyna="b_zdalna"))
        ctrl = _element(enm, "TapChangerControl")
        # Na szynie zdalnej są: zacisk 2 kabla i zacisk odbioru; wybór = najmniejszy mRID.
        oczekiwany = min(
            mrid_for("Terminal", "k1", suffix="2"), mrid_for("Terminal", "o1", suffix="1")
        )
        assert _atrybut(ctrl, "RegulatingControl.Terminal").get(_RDF_RESOURCE) == (
            f"urn:uuid:{oczekiwany}"
        )

    def test_szyna_bez_zacisku_znana_utrata(self) -> None:
        """Szyna izolowana nie ma zacisku, który CIM mógłby wskazać — atrybut pominięty."""
        enm = _siec(_regulator(szyna="b_izolowana"))
        ctrl = _element(enm, "TapChangerControl")
        assert ctrl is not None
        assert _atrybut(ctrl, "RegulatingControl.Terminal") is None
        po, _ = _po_torze_obcym(enm)
        assert po.tap_changer is not None and po.tap_changer.controlled_bus_ref is None
        assert any("szynę bez żadnego zacisku" in u for u in REGULATOR_ZACZEPOW_UTRATA_TORU_OBCEGO)


# ---------------------------------------------------------------------------
# Tor legacy (bez regulatora kanonicznego) — bajty i zachowanie bez zmian
# ---------------------------------------------------------------------------


class TestTorLegacy:
    def test_zloty_model_bez_obiektow_regulatora_kanonicznego(self) -> None:
        eq, _tp = export_eq_tp_bytes(build_golden_enm())
        tekst = eq.decode("utf-8")
        assert "TapChanger.ltcFlag" not in tekst
        assert "TapChangerControl" not in tekst
        assert "RegulatingControl" not in tekst

    def test_legacy_rtc_bez_zmiany_zawartosci(self) -> None:
        enm = _siec(None, tap_position=2, tap_min=-9, tap_max=9, tap_step_percent=1.78)
        rtc = _element(enm, "RatioTapChanger")
        assert [d.tag.rpartition("}")[2] for d in rtc] == [
            "IdentifiedObject.name",
            "RatioTapChanger.TransformerEnd",
            "TapChanger.lowStep",
            "TapChanger.highStep",
            "TapChanger.normalStep",
            "RatioTapChanger.stepVoltageIncrement",
        ]

    def test_legacy_runda_tor_obcy_tozsama(self) -> None:
        enm = _siec(None, tap_position=2, tap_min=-9, tap_max=9, tap_step_percent=1.78)
        po, _ = _po_torze_obcym(enm)
        assert po.tap_changer is None
        assert (po.tap_min, po.tap_max, po.tap_position, po.tap_step_percent) == (-9, 9, 2, 1.78)

    def test_legacy_bez_zakresu_znana_utrata(self) -> None:
        """Pozycja legacy bez zakresu: CIM wymaga lowStep/highStep, więc obiektu nie ma."""
        enm = _siec(None, tap_position=2, tap_step_percent=1.78)
        assert _element(enm, "RatioTapChanger") is None
        po, _ = _po_torze_obcym(enm)
        assert po.tap_position is None and po.tap_step_percent is None

    def test_regulator_kanoniczny_wypiera_legacy_znana_utrata(self) -> None:
        """Aktywny regulator + pola legacy: jeden RatioTapChanger (kanoniczny)."""
        enm = _siec(_regulator(), tap_position=5, tap_min=-5, tap_max=5, tap_step_percent=2.5)
        eq, _tp = build_eq_tp_trees(enm)
        assert len(eq.findall(f"{_CIM}RatioTapChanger")) == 1
        po, _ = _po_torze_obcym(enm)
        assert po.tap_changer is not None and po.tap_changer.current_position == 3
        assert po.tap_position is None and po.tap_min is None
        # Fizyka przełożenia z regulatora kanonicznego — ta sama przed i po.
        przed = _galaz_transformatora(enm).get_tap_ratio()
        po_enm = enm.model_copy(update={"transformers": [po]})
        assert _galaz_transformatora(po_enm).get_tap_ratio() == pytest.approx(przed, rel=1e-12)


# ---------------------------------------------------------------------------
# Determinizm
# ---------------------------------------------------------------------------


class TestDeterminizm:
    @pytest.mark.parametrize("szyna", [None, "b_zdalna", "b_dn"])
    def test_podwojny_eksport_bajtowo_identyczny(self, szyna: str | None) -> None:
        enm = _siec(_regulator(szyna=szyna, uzwojenie="LV", ldc=True))
        assert export_cgmes(enm) == export_cgmes(enm)
        assert export_eq_tp_bytes(enm) == export_eq_tp_bytes(enm)

    def test_mrid_regulatora_czysta_funkcja_ref_id(self) -> None:
        enm = _siec(_regulator(szyna="b_zdalna"))
        rtc = _element(enm, "RatioTapChanger")
        ctrl = _element(enm, "TapChangerControl")
        assert rtc.get(f"{{{NS_RDF}}}ID") == mrid_for("RatioTapChanger", "t1")
        assert ctrl.get(f"{{{NS_RDF}}}ID") == mrid_for("TapChangerControl", "t1")


# ---------------------------------------------------------------------------
# Transformator w torze obcym (warunek konieczny regulatora)
# ---------------------------------------------------------------------------


class TestTransformatorTorObcy:
    def test_parametry_znamionowe_wracaja(self) -> None:
        enm = _siec(_regulator())
        po, ostrzezenia = _po_torze_obcym(enm)
        assert (po.hv_bus_ref, po.lv_bus_ref) == ("b_gn", "b_dn")
        assert po.sn_mva == pytest.approx(25.0)
        assert (po.uhv_kv, po.ulv_kv) == (pytest.approx(110.0), pytest.approx(15.0))
        assert po.uk_percent == pytest.approx(12.0, rel=1e-9)
        assert po.pk_kw == pytest.approx(120.0, rel=1e-9)
        assert po.catalog_ref is None and po.source_mode == "MIGRACJA"
        # Grupa połączeń nieodtworzona — NAZWANA, nie zgadnięta.
        assert po.vector_group is None
        assert any("Grupa połączeń nieodtworzona" in o for o in ostrzezenia)

    def test_szyny_wracaja_z_ref_id_z_side_cara(self) -> None:
        """Side-car rejestruje szynę pod mRID-em ConnectivityNode, importer buduje szyny
        z TopologicalNode — bez mostu TN -> CN szyny (i odwołania do nich, w tym szyna
        regulowana) wracały z NAZWĄ zamiast ``ref_id``."""
        for enm in (_siec(_regulator(szyna="b_zdalna")), build_golden_enm()):
            wynik = import_cgmes(export_cgmes(enm), prefer_side_car=False)
            assert wynik.enm is not None
            assert {b.ref_id for b in wynik.enm.buses} == {b.ref_id for b in enm.buses}

    def test_transformator_na_liscie_bez_katalogu(self) -> None:
        wynik = import_cgmes(export_cgmes(_siec(_regulator())), prefer_side_car=False)
        assert "t1" in wynik.elements_without_catalog


# ---------------------------------------------------------------------------
# Plik obcy (EQ+TP spoza systemu): brak domysłów
# ---------------------------------------------------------------------------


def _eq_tp(enm: EnergyNetworkModel) -> tuple[str, bytes]:
    with zipfile.ZipFile(io.BytesIO(export_cgmes(enm))) as zf:
        return zf.read("EQ.xml").decode("utf-8"), zf.read("TP.xml")


class TestPlikObcy:
    def _import(self, eq: str, tp: bytes) -> tuple[Transformer, list[str]]:
        wynik = import_from_eq_tp(eq.encode("utf-8"), tp)
        assert wynik.enm is not None and len(wynik.enm.transformers) == 1, wynik.warnings
        return wynik.enm.transformers[0], wynik.warnings

    def test_brak_mnoznika_jednostki_nastawa_nieodczytana(self) -> None:
        eq, tp = _eq_tp(_siec(_regulator()))
        linia = f'<cim:RegulatingControl.targetValueUnitMultiplier rdf:resource="{NS_CIM}UnitMultiplier.k"/>'
        assert linia in eq
        po, ostrzezenia = self._import(eq.replace(linia, ""), tp)
        assert po.tap_changer is not None
        assert po.tap_changer.voltage_setpoint_kv is None and po.tap_changer.deadband_kv is None
        assert any("mnożnika jednostki" in o for o in ostrzezenia)

    def test_mnoznik_none_to_wolty(self) -> None:
        eq, tp = _eq_tp(_siec(_regulator()))
        eq = (
            eq.replace("UnitMultiplier.k", "UnitMultiplier.none")
            .replace(">15.75<", ">15750<")
            .replace(">0.3<", ">300<")
        )
        po, _ = self._import(eq, tp)
        assert po.tap_changer is not None
        assert po.tap_changer.voltage_setpoint_kv == pytest.approx(_NASTAWA_KV)
        assert po.tap_changer.deadband_kv == pytest.approx(_PASMO_KV)

    def test_tryb_inny_niz_napieciowy_nastawa_nieodczytana(self) -> None:
        eq, tp = _eq_tp(_siec(_regulator()))
        eq = eq.replace(
            "RegulatingControlModeKind.voltage", "RegulatingControlModeKind.reactivePower"
        )
        po, ostrzezenia = self._import(eq, tp)
        assert po.tap_changer is not None and po.tap_changer.voltage_setpoint_kv is None
        assert any("zamiast napięciowego" in o for o in ostrzezenia)

    def test_pozycja_niecalkowita_bierze_normal_step(self) -> None:
        eq, tp = _eq_tp(_siec(_regulator()))
        eq = eq.replace(
            "<cim:TapChanger.step>3</cim:TapChanger.step>",
            "<cim:TapChanger.step>3.4</cim:TapChanger.step>",
        )
        po, _ = self._import(eq, tp)
        assert po.tap_changer is not None and po.tap_changer.current_position == 3

    def test_brak_pozycji_neutralnej_regulator_pominiety_z_ostrzezeniem(self) -> None:
        eq, tp = _eq_tp(_siec(_regulator()))
        eq = eq.replace("<cim:TapChanger.neutralStep>0</cim:TapChanger.neutralStep>", "")
        po, ostrzezenia = self._import(eq, tp)
        assert po.tap_changer is None
        assert any("neutralStep" in o and "regulator pominięty" in o for o in ostrzezenia)

    def test_brak_control_enabled_czyta_enabled_sterowania(self) -> None:
        eq, tp = _eq_tp(_siec(_regulator(tryb="AUTOMATIC")))
        eq = eq.replace("<cim:TapChanger.controlEnabled>true</cim:TapChanger.controlEnabled>", "")
        po, _ = self._import(eq, tp)
        assert po.tap_changer is not None and po.tap_changer.control_mode == "AUTOMATIC"

    def test_impedancja_na_obu_koncach_sumowana_po_odniesieniu(self) -> None:
        """Plik obcy z R/X rozdzielonym na oba końce: suma odniesiona do strony GN."""
        enm = _siec(None)
        eq, tp = _eq_tp(enm)
        r_gn = 120.0e3 * 110.0e3**2 / 25.0e6**2
        z_gn = 0.12 * 110.0e3**2 / 25.0e6
        x_gn = (z_gn**2 - r_gn**2) ** 0.5
        przekladnia2 = (15.0 / 110.0) ** 2
        # Połowa impedancji przeniesiona na stronę DN (w omach strony DN).
        eq = eq.replace(
            "<cim:PowerTransformerEnd.r>0</cim:PowerTransformerEnd.r>",
            f"<cim:PowerTransformerEnd.r>{r_gn / 2 * przekladnia2!r}</cim:PowerTransformerEnd.r>",
        ).replace(
            "<cim:PowerTransformerEnd.x>0</cim:PowerTransformerEnd.x>",
            f"<cim:PowerTransformerEnd.x>{x_gn / 2 * przekladnia2!r}</cim:PowerTransformerEnd.x>",
        )
        from infrastructure.cgmes.units import fmt_float

        eq = eq.replace(
            f"<cim:PowerTransformerEnd.r>{fmt_float(r_gn)}</cim:PowerTransformerEnd.r>",
            f"<cim:PowerTransformerEnd.r>{r_gn / 2!r}</cim:PowerTransformerEnd.r>",
        ).replace(
            f"<cim:PowerTransformerEnd.x>{fmt_float(x_gn)}</cim:PowerTransformerEnd.x>",
            f"<cim:PowerTransformerEnd.x>{x_gn / 2!r}</cim:PowerTransformerEnd.x>",
        )
        po, _ = self._import(eq, tp)
        assert po.uk_percent == pytest.approx(12.0, rel=1e-9)
        assert po.pk_kw == pytest.approx(120.0, rel=1e-9)

    def test_transformator_trojuzwojeniowy_pominiety_i_nazwany(self) -> None:
        eq, tp = _eq_tp(_siec(None))
        dodatkowy = (
            f'  <cim:PowerTransformerEnd rdf:ID="{mrid_for("PowerTransformerEnd", "t1", "3")}">\n'
            f'    <cim:PowerTransformerEnd.PowerTransformer rdf:resource="urn:uuid:'
            f'{mrid_for("PowerTransformer", "t1")}"/>\n'
            "    <cim:TransformerEnd.endNumber>3</cim:TransformerEnd.endNumber>\n"
            "  </cim:PowerTransformerEnd>\n</rdf:RDF>"
        )
        eq = eq.replace("</rdf:RDF>", dodatkowy)
        wynik = import_from_eq_tp(eq.encode("utf-8"), tp)
        assert wynik.enm is not None and wynik.enm.transformers == []
        assert any("3 końców" in o for o in wynik.warnings)
