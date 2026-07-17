"""Reference Engine V1 — silnik zgodności + Reference Score (spec §7/§12).

Pozytyw (pole zgodne ⇒ score 100) + negatywy-sabotaże (brak required /
zła kolejność / uziemnik w osi / aparat spoza rodziny / konstrukcja stacji
poza standardem OSD) + determinizm raportu. Wyrocznia gryzie.
"""

import json

from enm.models import (
    Bay,
    BayPrimaryDevice,
    BaySwitchState,
    Bus,
    EnergyNetworkModel,
    ENMHeader,
    Substation,
)
from reference_engine import evaluate_enm


def _device(ref: str, kind: str, placement: str = "MIDSTREAM") -> BayPrimaryDevice:
    return BayPrimaryDevice(device_ref=ref, symbol_ref=ref, kind=kind, placement=placement)


def _station(station_type: str = "mv_lv", construction: str | None = None) -> Substation:
    return Substation(
        ref_id="st/01",
        name="Stacja testowa",
        station_type=station_type,  # type: ignore[arg-type]
        bus_refs=["bus/sn"],
        construction_type=construction,  # type: ignore[arg-type]
    )


def _enm(bays: list[Bay], station: Substation | None = None) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="Test zgodności"),
        buses=[Bus(ref_id="bus/sn", name="Szyna SN", voltage_kv=15.0)],
        substations=[station or _station()],
        bays=bays,
    )


def _rmu_line_bay(ref_id: str = "bay/ok") -> Bay:
    return Bay(
        ref_id=ref_id,
        name="Pole liniowe RMU",
        bay_role="OUT",
        substation_ref="st/01",
        bus_ref="bus/sn",
        primary_devices=[
            _device(f"{ref_id}/q1", "LOAD_SWITCH"),
            _device(f"{ref_id}/qe1", "ES", "GROUND_BRANCH"),
            _device(f"{ref_id}/gk", "CABLE_HEAD", "DOWNSTREAM"),
        ],
    )


def _pack_report(enm: EnergyNetworkModel, pack_id: str):
    report = evaluate_enm(enm, pack_ids=[pack_id])
    assert len(report.packs) == 1
    return report.packs[0]


class TestNormCompliance:
    def test_compliant_rmu_line_scores_100(self) -> None:
        pack = _pack_report(_enm([_rmu_line_bay()]), "iec62271")
        assert pack.failed == 0
        assert pack.score_percent == 100

    def test_bay_without_data_is_not_applicable(self) -> None:
        # Konwencja rysunkowa (puste primary_devices) — zgodna z definicji,
        # zero sprawdzeń i score None (uczciwe „nie dotyczy", spec §7).
        bay = Bay(
            ref_id="bay/konwencja",
            name="Pole bez danych",
            bay_role="OUT",
            substation_ref="st/01",
            bus_ref="bus/sn",
        )
        pack = _pack_report(_enm([bay]), "iec62271")
        assert pack.applicable == 0
        assert pack.score_percent is None

    def test_missing_required_apparatus_bites(self) -> None:
        bay = _rmu_line_bay("bay/brak-glowicy")
        bay.primary_devices = [d for d in bay.primary_devices if d.kind != "CABLE_HEAD"]
        pack = _pack_report(_enm([bay]), "iec62271")
        assert any(
            c.rule_code == "profile.required.CABLE_HEAD" and c.status == "fail" for c in pack.checks
        )

    def test_missing_switching_function_bites(self) -> None:
        bay = _rmu_line_bay("bay/bez-lacznika")
        bay.primary_devices = [d for d in bay.primary_devices if d.kind != "LOAD_SWITCH"]
        pack = _pack_report(_enm([bay]), "iec62271")
        assert any(
            c.rule_code.startswith("profile.one_of.") and c.status == "fail" for c in pack.checks
        )

    def test_wrong_order_bites(self) -> None:
        # Głowica NAD rozłącznikiem (od szyny w dół) = złamany kanon kolejności.
        bay = Bay(
            ref_id="bay/zla-kolejnosc",
            name="Pole liniowe",
            bay_role="OUT",
            substation_ref="st/01",
            bus_ref="bus/sn",
            primary_devices=[
                _device("gk", "CABLE_HEAD", "UPSTREAM"),
                _device("q1", "LOAD_SWITCH", "DOWNSTREAM"),
                _device("qe1", "ES", "GROUND_BRANCH"),
            ],
        )
        pack = _pack_report(_enm([bay]), "iec62271")
        assert any(c.rule_code == "profile.order" and c.status == "fail" for c in pack.checks)

    def test_earth_switch_in_main_path_bites(self) -> None:
        bay = _rmu_line_bay("bay/es-w-osi")
        for device in bay.primary_devices:
            if device.kind == "ES":
                device.placement = "MIDSTREAM"
        pack = _pack_report(_enm([bay]), "iec62271")
        assert any(
            c.rule_code == "profile.lateral_placement.ES" and c.status == "fail"
            for c in pack.checks
        )

    def test_interlock_violation_bites_and_known_open_passes(self) -> None:
        closed = BaySwitchState(actual_state="zamkniety", control_mode="zdalne")
        open_ = BaySwitchState(actual_state="otwarty", control_mode="zdalne")
        bay = _rmu_line_bay("bay/blokada")
        for device in bay.primary_devices:
            if device.kind in ("ES", "LOAD_SWITCH"):
                device.switch_state = closed
        pack = _pack_report(_enm([bay]), "iec62271")
        assert any(
            c.rule_code == "iec62271.interlock.es_vs_main" and c.status == "fail"
            for c in pack.checks
        )
        # Pozytyw: łącznik toru otwarty ⇒ sprawdzenie pass.
        for device in bay.primary_devices:
            if device.kind == "LOAD_SWITCH":
                device.switch_state = open_
        pack = _pack_report(_enm([bay]), "iec62271")
        assert any(
            c.rule_code == "iec62271.interlock.es_vs_main" and c.status == "pass"
            for c in pack.checks
        )


class TestManufacturerCompliance:
    def test_ct_outside_rmu_family_vocabulary_bites(self) -> None:
        # Pkt 7 dyrektywy: „✗ 8DJH — aparat CT spoza słownika rodziny".
        bay = _rmu_line_bay("bay/ct")
        bay.primary_devices.insert(1, _device("bay/ct/t1", "CT"))
        pack = _pack_report(_enm([bay]), "siemens_8djh")
        assert any(c.rule_code == "family.apparatus.CT" and c.status == "fail" for c in pack.checks)
        # Ta sama sieć wobec rodziny wyłącznikowej (UniGear) — CT w słowniku.
        pack_ug = _pack_report(_enm([bay]), "abb_unigear")
        assert any(
            c.rule_code == "family.apparatus.CT" and c.status == "pass" for c in pack_ug.checks
        )

    def test_network_voltage_above_family_levels_bites(self) -> None:
        enm = _enm([_rmu_line_bay()])
        enm.buses[0].voltage_kv = 30.0  # ponad 24 kV rodzin RMU
        pack = _pack_report(enm, "abb_safering")
        assert any(c.rule_code == "family.voltage" and c.status == "fail" for c in pack.checks)

    def test_network_15kv_fits_families_up_to_17_5(self) -> None:
        # Dobór: napięcie znamionowe rozdzielnicy ≥ napięcie sieci (15 ≤ 17,5).
        pack = _pack_report(_enm([_rmu_line_bay()]), "abb_safering")
        assert any(c.rule_code == "family.voltage" and c.status == "pass" for c in pack.checks)


class TestOsdCompliance:
    def test_pole_mounted_station_bites(self) -> None:
        station = _station(construction="slupowa")
        pack = _pack_report(_enm([_rmu_line_bay()], station), "osd_enea")
        assert any(
            c.rule_code == "osd_enea.station.prefabricated_compact_preferred" and c.status == "fail"
            for c in pack.checks
        )

    def test_prefabricated_station_passes(self) -> None:
        station = _station(construction="prefabrykowana")
        pack = _pack_report(_enm([_rmu_line_bay()], station), "osd_enea")
        assert pack.failed == 0
        assert pack.score_percent == 100

    def test_unknown_construction_is_not_applicable(self) -> None:
        pack = _pack_report(_enm([_rmu_line_bay()], _station()), "osd_enea")
        assert pack.applicable == 0
        assert pack.score_percent is None


class TestDeterminism:
    def test_same_enm_produces_identical_report(self) -> None:
        enm = _enm([_rmu_line_bay(), _rmu_line_bay("bay/drugie")])
        first = json.dumps(evaluate_enm(enm).model_dump(mode="json"), sort_keys=True)
        second = json.dumps(evaluate_enm(enm).model_dump(mode="json"), sort_keys=True)
        assert first == second
