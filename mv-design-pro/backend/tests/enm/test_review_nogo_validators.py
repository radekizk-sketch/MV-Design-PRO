"""Walidatory z recenzji NO-GO właściciela 2026-07-17 (rejestr:
docs/sld/SLD_REVIEW_NO_GO_2026-07-17.md).

- pkt 2 (W033, `sources.sk_ik_voltage_inconsistent`): trójka Sk''/Ik''/U
  źródła musi być wewnętrznie spójna — Ik'' = Sk''/(√3·U) ±5%. Pomiar
  recenzji: „Sk''=250 MVA + Ik''=9,62 kA + 110 kV" (dane 15 kV sklejone z
  cudzym napięciem) — dokładnie ten przypadek jest tu NEGATYWEM.
- pkt 10 (W034, `bays.earthing_interlock_violation`): uziemnik ZAMKNIĘTY
  przy jednocześnie zamkniętym łączniku toru głównego TEGO SAMEGO pola =
  niedozwolona kombinacja stanów (blokada rozdzielnicy).

Każdy walidator ma pozytyw (dane poprawne ⇒ zero wpisów) i negatyw
(dane błędne ⇒ wpis o właściwym kodzie) — wyrocznia musi GRYŹĆ.
"""

from enm.models import (
    Bay,
    BayPrimaryDevice,
    BaySwitchState,
    Bus,
    EnergyNetworkModel,
    ENMHeader,
    Source,
    Substation,
)
from enm.validator import ENMValidator


def _enm(**kwargs) -> EnergyNetworkModel:
    return EnergyNetworkModel(header=ENMHeader(name="Test recenzji NO-GO"), **kwargs)


def _codes(enm: EnergyNetworkModel) -> list[str]:
    return [issue.code for issue in ENMValidator().validate(enm).issues]


def _source(sk3_mva: float, ik3_ka: float, bus_ref: str = "bus_sn") -> Source:
    return Source(
        ref_id="src_1",
        name="Ekwiwalent sieci",
        bus_ref=bus_ref,
        model="short_circuit_power",
        sk3_mva=sk3_mva,
        ik3_ka=ik3_ka,
    )


class TestW033SkIkVoltageConsistency:
    def test_consistent_triple_at_15kv_passes(self) -> None:
        # Ik'' = 250/(√3·15) = 9,6225 kA — spójne z Sk''=250 MVA przy 15 kV.
        enm = _enm(
            buses=[Bus(ref_id="bus_sn", name="Szyna SN", voltage_kv=15)],
            sources=[_source(250.0, 9.62)],
        )
        assert "sources.sk_ik_voltage_inconsistent" not in _codes(enm)

    def test_review_measured_case_110kv_with_15kv_current_fails(self) -> None:
        # NEGATYW = dosłowny pomiar recenzji pkt 2: źródło na szynie 110 kV
        # z Ik''=9,62 kA (wartość 15 kV); oczekiwane przy 110 kV: ~1,31 kA.
        enm = _enm(
            buses=[Bus(ref_id="bus_wn", name="Szyna WN", voltage_kv=110)],
            sources=[_source(250.0, 9.62, bus_ref="bus_wn")],
        )
        assert "sources.sk_ik_voltage_inconsistent" in _codes(enm)

    def test_source_with_only_sk_is_out_of_scope(self) -> None:
        # Spójność wymaga OBU wielkości — samo Sk'' nie podlega temu testowi.
        enm = _enm(
            buses=[Bus(ref_id="bus_sn", name="Szyna SN", voltage_kv=15)],
            sources=[
                Source(
                    ref_id="src_1",
                    name="Ekwiwalent",
                    bus_ref="bus_sn",
                    model="short_circuit_power",
                    sk3_mva=250.0,
                )
            ],
        )
        assert "sources.sk_ik_voltage_inconsistent" not in _codes(enm)


def _bay_with_states(es_state: str, cb_state: str) -> Bay:
    def _sw(actual: str) -> BaySwitchState:
        return BaySwitchState(actual_state=actual, control_mode="zdalne")

    return Bay(
        ref_id="bay_1",
        name="Pole liniowe",
        bay_role="OUT",
        substation_ref="st_1",
        bus_ref="bus_sn",
        primary_devices=[
            BayPrimaryDevice(
                device_ref="bay_1/cb",
                symbol_ref="cb",
                kind="CB",
                placement="MIDSTREAM",
                switch_state=_sw(cb_state),
            ),
            BayPrimaryDevice(
                device_ref="bay_1/es",
                symbol_ref="es",
                kind="ES",
                placement="GROUND_BRANCH",
                switch_state=_sw(es_state),
            ),
        ],
    )


def _interlock_enm(es_state: str, cb_state: str) -> EnergyNetworkModel:
    return _enm(
        buses=[Bus(ref_id="bus_sn", name="Szyna SN", voltage_kv=15)],
        substations=[
            Substation(ref_id="st_1", name="Stacja S01", station_type="mv_lv", bus_refs=["bus_sn"])
        ],
        bays=[_bay_with_states(es_state=es_state, cb_state=cb_state)],
    )


class TestW034EarthingInterlock:
    def test_es_closed_with_cb_open_passes(self) -> None:
        # Uziemienie pola przy OTWARTYM łączniku głównym = legalna praca.
        enm = _interlock_enm(es_state="zamkniety", cb_state="otwarty")
        assert "bays.earthing_interlock_violation" not in _codes(enm)

    def test_es_closed_with_cb_closed_fails(self) -> None:
        # NEGATYW: ES + CB zamknięte w TYM SAMYM polu — uziemienie toru pod
        # napięciem (recenzja pkt 10: „system powinien uniemożliwiać
        # niedozwoloną kombinację stanów").
        enm = _interlock_enm(es_state="zamkniety", cb_state="zamkniety")
        assert "bays.earthing_interlock_violation" in _codes(enm)

    def test_unknown_states_are_out_of_scope(self) -> None:
        # Brak telemetrii ⇒ zero fabrykowanego konfliktu (Invariant 9).
        enm = _interlock_enm(es_state="nieznany", cb_state="nieznany")
        assert "bays.earthing_interlock_violation" not in _codes(enm)
