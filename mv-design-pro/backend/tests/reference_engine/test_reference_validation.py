"""Reference Engine V1 — walidacja referencyjna NA ŻYWO (spec §6/§12).

Ostrzeżenia `reference.*` emitują się przez walidator ENM przy KAŻDEJ
walidacji (czyli natychmiast po każdej operacji topologicznej — pkt 3
dyrektywy: „Nie dopiero przy eksporcie PDF. Natychmiast."). Pozytyw +
negatywy; pakiety producenckie tylko dla pól związanych z rodziną.
"""

from enm.models import (
    Bay,
    BayPrimaryDevice,
    Bus,
    EnergyNetworkModel,
    ENMHeader,
    Substation,
)
from enm.validator import ENMValidator


def _device(ref: str, kind: str, placement: str = "MIDSTREAM") -> BayPrimaryDevice:
    return BayPrimaryDevice(device_ref=ref, symbol_ref=ref, kind=kind, placement=placement)


def _enm(bays: list[Bay]) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="Walidacja referencyjna"),
        buses=[Bus(ref_id="bus/sn", name="Szyna SN", voltage_kv=15.0)],
        substations=[
            Substation(
                ref_id="st/01",
                name="Stacja testowa",
                station_type="mv_lv",
                bus_refs=["bus/sn"],
            )
        ],
        bays=bays,
    )


def _reference_codes(enm: EnergyNetworkModel) -> list[str]:
    return sorted(
        issue.code
        for issue in ENMValidator().validate(enm).issues
        if issue.code.startswith("reference.")
    )


def _compliant_bay(ref_id: str = "bay/ok") -> Bay:
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


class TestLiveReferenceValidation:
    def test_compliant_data_bay_emits_no_reference_warnings(self) -> None:
        assert _reference_codes(_enm([_compliant_bay()])) == []

    def test_convention_bay_without_data_emits_nothing(self) -> None:
        # Pusta lista aparatów = konwencja rysunkowa — zgodna z definicji
        # (wywodzi się z profili, parytet spec §8) — zero domysłu.
        bay = Bay(
            ref_id="bay/konwencja",
            name="Pole bez danych",
            bay_role="OUT",
            substation_ref="st/01",
            bus_ref="bus/sn",
        )
        assert _reference_codes(_enm([bay])) == []

    def test_sabotaged_bay_emits_reference_warnings(self) -> None:
        # NEGATYW: przykład dyrektywy pkt 3 — brak funkcji łączeniowej,
        # uziemnik w osi toru, aparat zakazany, zła kolejność.
        bay = Bay(
            ref_id="bay/zle",
            name="Pole zdegenerowane",
            bay_role="OUT",
            substation_ref="st/01",
            bus_ref="bus/sn",
            primary_devices=[
                _device("bay/zle/qe9", "ES"),  # w osi toru (MIDSTREAM)
                _device("bay/zle/tr", "TRANSFORMER_DEVICE", "DOWNSTREAM"),
            ],
        )
        codes = _reference_codes(_enm([bay]))
        assert "reference.bays.missing_required_apparatus" in codes
        assert "reference.bays.missing_switching_function" in codes
        assert "reference.bays.forbidden_apparatus" in codes
        assert "reference.bays.apparatus_order_mismatch" in codes
        assert "reference.bays.earth_switch_in_main_path" in codes

    def test_family_warnings_only_for_bound_bays(self) -> None:
        # CT w polu RMU: bez związania z rodziną — brak family_mismatch;
        # po związaniu z 8DJH (bay_template_ref) — ostrzeżenie na żywo.
        bay = _compliant_bay("bay/ct")
        bay.primary_devices.insert(1, _device("bay/ct/t1", "CT"))
        assert "reference.bays.family_mismatch" not in _reference_codes(_enm([bay]))

        bay.bay_template_ref = "SIEMENS__8DJH__LINE_OUT"
        codes = _reference_codes(_enm([bay]))
        assert "reference.bays.family_mismatch" in codes

    def test_validation_issue_has_polish_message_and_fix_action(self) -> None:
        bay = _compliant_bay("bay/brak")
        bay.primary_devices = [d for d in bay.primary_devices if d.kind != "CABLE_HEAD"]
        issues = [
            i
            for i in ENMValidator().validate(_enm([bay])).issues
            if i.code == "reference.bays.missing_required_apparatus"
        ]
        assert issues, "brak ostrzeżenia o brakującym aparacie wymaganym"
        issue = issues[0]
        assert "Głowica kablowa" in issue.message_pl
        assert issue.fix_action is not None
        assert issue.fix_action.modal_type == "BayModal"
