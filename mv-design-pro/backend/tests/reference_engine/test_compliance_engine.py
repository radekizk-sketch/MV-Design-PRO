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


def _rmu_tr_bay(ref_id: str = "bay/tr") -> Bay:
    return Bay(
        ref_id=ref_id,
        name="Pole transformatorowe RMU",
        bay_role="TR",
        substation_ref="st/01",
        bus_ref="bus/sn",
        primary_devices=[
            _device(f"{ref_id}/f1", "FUSE"),
            _device(f"{ref_id}/qe1", "ES", "GROUND_BRANCH"),
            _device(f"{ref_id}/t1", "TRANSFORMER_DEVICE", "DOWNSTREAM"),
        ],
    )


class TestOsdCompliance:
    """Reguły z pełnej lektury standardów Enea Operator (research 2026-07-17,
    cytowania w packs/osd_enea/pack.json). Pozytyw + negatywy + bramki danych."""

    def test_pole_mounted_station_bites(self) -> None:
        station = _station(construction="slupowa")
        pack = _pack_report(_enm([_rmu_line_bay()], station), "osd_enea")
        assert any(
            c.rule_code == "osd_enea.station.prefabricated_compact_preferred" and c.status == "fail"
            for c in pack.checks
        )

    def test_prefabricated_station_with_tr_and_line_bay_passes(self) -> None:
        # Skład wg Zeszytu 1 §4.3.1: 1 pole TR + pola liniowe.
        station = _station(construction="prefabrykowana")
        pack = _pack_report(_enm([_rmu_line_bay(), _rmu_tr_bay()], station), "osd_enea")
        assert pack.failed == 0
        assert pack.score_percent == 100

    def test_unknown_construction_is_not_applicable(self) -> None:
        pack = _pack_report(_enm([_rmu_line_bay()], _station()), "osd_enea")
        assert pack.applicable == 0
        assert pack.score_percent is None

    def test_bay_composition_without_tr_bay_bites(self) -> None:
        # NEGATYW: stacja kompaktowa bez pola transformatorowego (Zeszyt 1
        # §4.3.1.a: „posiadać jedno pole transformatorowe").
        station = _station(construction="prefabrykowana")
        pack = _pack_report(_enm([_rmu_line_bay()], station), "osd_enea")
        assert any(
            c.rule_code == "osd_enea.station.bay_composition" and c.status == "fail"
            for c in pack.checks
        )

    def test_pole_station_cable_entry_bites(self) -> None:
        # NEGATYW: Zeszyt 3 rozdz. 2 s. 3 — zakaz stacji słupowej z kablowym
        # podejściem SN.
        from enm.models import Cable

        station = _station(construction="slupowa")
        enm = _enm([_rmu_line_bay()], station)
        enm.buses.append(Bus(ref_id="bus/zrodlo", name="Szyna zasilająca", voltage_kv=15.0))
        enm.branches.append(
            Cable(
                ref_id="kabel/1",
                name="Kabel SN do stacji",
                from_bus_ref="bus/zrodlo",
                to_bus_ref="bus/sn",
                length_km=0.5,
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.1,
            )
        )
        pack = _pack_report(enm, "osd_enea")
        assert any(
            c.rule_code == "osd_enea.station.pole_station_cable_entry_forbidden"
            and c.status == "fail"
            for c in pack.checks
        )
        # Pozytyw: ta sama stacja słupowa bez kabla — sprawdzenie pass.
        pack_ok = _pack_report(
            _enm([_rmu_line_bay()], _station(construction="slupowa")), "osd_enea"
        )
        assert any(
            c.rule_code == "osd_enea.station.pole_station_cable_entry_forbidden"
            and c.status == "pass"
            for c in pack_ok.checks
        )

    def test_transformer_power_limit_bites(self) -> None:
        # NEGATYW: 800 kVA > 630 kVA (Zeszyt 1); pozytyw: 400 kVA ≤ 630 kVA.
        from enm.models import Transformer

        def enm_with_trafo(sn_mva: float):
            station = _station(construction="prefabrykowana")
            station.transformer_refs = ["tr/1"]
            enm = _enm([_rmu_line_bay(), _rmu_tr_bay()], station)
            enm.buses.append(Bus(ref_id="bus/nn", name="Szyna nN", voltage_kv=0.4))
            enm.transformers.append(
                Transformer(
                    ref_id="tr/1",
                    name="Transformator stacji",
                    hv_bus_ref="bus/sn",
                    lv_bus_ref="bus/nn",
                    sn_mva=sn_mva,
                    uhv_kv=15.0,
                    ulv_kv=0.42,
                    uk_percent=4.5,
                    pk_kw=6.0,
                )
            )
            return enm

        pack = _pack_report(enm_with_trafo(0.8), "osd_enea")
        assert any(
            c.rule_code == "osd_enea.station.transformer_power_limit" and c.status == "fail"
            for c in pack.checks
        )
        pack_ok = _pack_report(enm_with_trafo(0.4), "osd_enea")
        assert any(
            c.rule_code == "osd_enea.station.transformer_power_limit" and c.status == "pass"
            for c in pack_ok.checks
        )

    def test_telemechanika_u_i_measurement_gated_and_bites(self) -> None:
        # Telemechanika §6.4.1 s. 14: pole liniowe ZDALNIE STEROWANE wymaga
        # pomiaru U i I. Bramka danych: bez dowodu zdalnego sterowania —
        # sprawdzenie nie istnieje.
        from enm.models import BayRuntimeState, Measurement, MeasurementRating

        def remote_bay(ref_id: str = "bay/zdalne") -> Bay:
            bay = _rmu_line_bay(ref_id)
            bay.runtime_state = BayRuntimeState(control_availability="dostepne")
            return bay

        # Bramka: pole bez telemetrii — zero sprawdzeń telemechaniki.
        pack_gated = _pack_report(
            _enm([_rmu_line_bay()], _station(construction="prefabrykowana")), "osd_enea"
        )
        assert not any(
            c.rule_code == "osd_enea.telemechanika.line_bay_u_i_measurement"
            for c in pack_gated.checks
        )

        # NEGATYW: pole zdalnie sterowane bez pomiarów U/I.
        enm_fail = _enm([remote_bay(), _rmu_tr_bay()], _station(construction="prefabrykowana"))
        pack_fail = _pack_report(enm_fail, "osd_enea")
        assert any(
            c.rule_code == "osd_enea.telemechanika.line_bay_u_i_measurement" and c.status == "fail"
            for c in pack_fail.checks
        )

        # POZYTYW: to samo pole z rekordami Measurement VT + CT (bay_ref).
        enm_ok = _enm([remote_bay(), _rmu_tr_bay()], _station(construction="prefabrykowana"))
        rating = MeasurementRating(ratio_primary=100.0, ratio_secondary=5.0)
        enm_ok.measurements.extend(
            [
                Measurement(
                    ref_id="vt/1",
                    name="Sensor napięciowy pola",
                    measurement_type="VT",
                    bus_ref="bus/sn",
                    bay_ref="bay/zdalne",
                    rating=rating,
                ),
                Measurement(
                    ref_id="ct/1",
                    name="Przetwornik prądowy pola",
                    measurement_type="CT",
                    bus_ref="bus/sn",
                    bay_ref="bay/zdalne",
                    rating=rating,
                ),
            ]
        )
        pack_ok = _pack_report(enm_ok, "osd_enea")
        assert any(
            c.rule_code == "osd_enea.telemechanika.line_bay_u_i_measurement" and c.status == "pass"
            for c in pack_ok.checks
        )


class TestDeterminism:
    def test_same_enm_produces_identical_report(self) -> None:
        enm = _enm([_rmu_line_bay(), _rmu_line_bay("bay/drugie")])
        first = json.dumps(evaluate_enm(enm).model_dump(mode="json"), sort_keys=True)
        second = json.dumps(evaluate_enm(enm).model_dump(mode="json"), sort_keys=True)
        assert first == second


class TestCellMatchCompliance:
    """`family.cell_match` (spec §7): dopasowanie pola do konfiguracji celki
    z katalogu producenta. Dane celek są bramkowane (pusty pakiet = zero
    sprawdzeń); test używa syntetycznego pakietu, bo realne dane celek
    wchodzą wyłącznie po weryfikacji źródłowej (research podwykonawcy)."""

    def _pack_with_cells(self):
        from reference_engine import get_reference_pack
        from reference_engine.models import (
            ReferenceCellApparatus,
            ReferenceCellConfiguration,
        )

        base = get_reference_pack("abb_safering")
        return base.model_copy(
            update={
                "cell_configurations": [
                    ReferenceCellConfiguration(
                        cell_code="C",
                        name_pl="Celka liniowa rozłącznikowa",
                        bay_kind="liniowe_odplywowe",
                        apparatus=[
                            ReferenceCellApparatus(kind="LOAD_SWITCH"),
                            ReferenceCellApparatus(kind="ES"),
                            ReferenceCellApparatus(kind="CABLE_HEAD"),
                            ReferenceCellApparatus(kind="VT", requirement="optional"),
                        ],
                        source_pl="test syntetyczny (dane realne po researchu)",
                    )
                ]
            }
        )

    def test_matching_bay_passes_and_names_cell(self) -> None:
        from reference_engine.compliance import _cell_match_check_for_bay
        from reference_engine.registry import family_for_pack

        pack = self._pack_with_cells()
        family = family_for_pack(pack)
        assert family is not None
        checks = _cell_match_check_for_bay(_rmu_line_bay(), pack, family)
        assert len(checks) == 1
        assert checks[0].status == "pass"
        assert "C" in checks[0].message_pl

    def test_bay_with_apparatus_outside_cell_bites(self) -> None:
        # NEGATYW: CB w polu, którego żadna celka kandydująca nie przewiduje.
        from reference_engine.compliance import _cell_match_check_for_bay
        from reference_engine.registry import family_for_pack

        pack = self._pack_with_cells()
        family = family_for_pack(pack)
        assert family is not None
        bay = _rmu_line_bay("bay/cb")
        bay.primary_devices.insert(0, _device("bay/cb/q0", "CB"))
        checks = _cell_match_check_for_bay(bay, pack, family)
        assert len(checks) == 1
        assert checks[0].status == "fail"

    def test_pack_without_cells_is_data_gated(self) -> None:
        # Bramka danych: pakiet bez konfiguracji celek = zero sprawdzeń.
        # e²ALPHA ŚWIADOMIE nie niesie celek (producent nie publikuje składu
        # per typ pola — research 2026-07-17).
        from reference_engine import get_reference_pack
        from reference_engine.compliance import _cell_match_check_for_bay
        from reference_engine.registry import family_for_pack

        pack = get_reference_pack("elektrometal_e2alpha")
        family = family_for_pack(pack)
        assert family is not None
        assert _cell_match_check_for_bay(_rmu_line_bay(), pack, family) == []
