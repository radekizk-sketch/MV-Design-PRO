"""Phase 0C — testy walidatora DER PCC (E028, E029).

Operator-grade SLD plan v2 (Decision #11 + #12 BINDING):
  - E028: DER (inverter) bez connection_variant → BLOCKER.
  - E029: DER (inverter) bezpośrednio na szynie SN (>1 kV) → BLOCKER.

Decision #11 (BINDING): Generator energoelektroniczny (falownik)
z gen_type ∈ {pv_inverter, wind_inverter, fw_*, bess} jest ZAWSZE
elementem niskonapięciowym (nn). Bezpośrednie przyłączenie do szyny
SN jest NIEDOZWOLONE.

Decision #12 (BINDING): Każda integracja źródła OZE z siecią SN
wymaga obecności transformatora nn/SN w torze przyłączenia.

Pokrycie:
  1. E028: 6 inverter types × bez connection_variant → BLOCKER.
  2. E028: Generator synchroniczny (NIE inverter) → brak walidacji.
  3. E028: Generator inverter Z connection_variant → brak issue.
  4. E029: DER inverter na Bus SN (>1 kV) → BLOCKER.
  5. E029: DER inverter na Bus nN (≤1 kV) → brak issue.
  6. E029 + E028 razem: oba issues emitowane gdy oba problemy.
"""

from __future__ import annotations

from typing import Any

from enm.models import (
    Bus,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    Generator,
)
from enm.validator import ENMValidator

INVERTER_GEN_TYPES: list[Any] = [
    "pv_inverter",
    "wind_inverter",
    "fw_pmsg",
    "fw_dfig",
    "fw_scig",
    "bess",
]


def _empty_enm() -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="der_test", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    )


def _validate(enm: EnergyNetworkModel) -> list[str]:
    """Zwraca listę kodów issues."""
    return [i.code for i in ENMValidator().validate(enm).issues]


# ---------------------------------------------------------------------------
# E028: brak connection_variant
# ---------------------------------------------------------------------------


def test_e028_inverter_without_connection_variant_blocker() -> None:
    """6 typów inverterów × brak connection_variant → BLOCKER E028."""
    for gen_type in INVERTER_GEN_TYPES:
        enm = _empty_enm()
        enm.buses.append(Bus(ref_id="bus_nn", name="Szyna nN", voltage_kv=0.4))
        enm.generators.append(
            Generator(
                ref_id=f"gen_{gen_type}",
                name=f"DER {gen_type}",
                bus_ref="bus_nn",
                p_mw=1.0,
                gen_type=gen_type,
                # connection_variant brak
            )
        )
        codes = _validate(enm)
        assert "E028" in codes, f"Brak E028 dla gen_type={gen_type}"


def test_e028_synchronous_generator_no_validation() -> None:
    """Generator synchroniczny NIE jest inverterem → walidacja E028 nie strzela."""
    enm = _empty_enm()
    enm.buses.append(Bus(ref_id="bus_sn", name="Szyna SN", voltage_kv=15.0))
    enm.generators.append(
        Generator(
            ref_id="gen_sync",
            name="Generator synchroniczny",
            bus_ref="bus_sn",
            p_mw=10.0,
            gen_type="synchronous",
        )
    )
    codes = _validate(enm)
    assert "E028" not in codes


def test_e028_inverter_with_connection_variant_no_issue() -> None:
    """Inverter Z connection_variant NIE wywołuje E028.

    V12S-008 model_validator wymaga spójności variant ↔ station_ref/blocking_transformer_ref.
    Test używa wariantów które są self-consistent.
    """
    test_cases: list[tuple[str, dict[str, Any]]] = [
        ("nn_side", {"station_ref": "sub_a"}),
        ("block_transformer", {"blocking_transformer_ref": "tr_block_a"}),
        (
            "LV_BEHIND_STATION_TRANSFORMER",
            {"station_ref": "sub_a", "blocking_transformer_ref": "tr_block_a"},
        ),
        ("DEDICATED_MV_CONNECTION", {}),
        ("SOURCE_CONNECTION_STATION", {}),
    ]
    for variant, extra_fields in test_cases:
        enm = _empty_enm()
        enm.buses.append(Bus(ref_id="bus_nn", name="Szyna nN", voltage_kv=0.4))
        enm.generators.append(
            Generator(
                ref_id="gen_pv",
                name="DER PV",
                bus_ref="bus_nn",
                p_mw=1.0,
                gen_type="pv_inverter",
                connection_variant=variant,  # type: ignore[arg-type]
                **extra_fields,
            )
        )
        codes = _validate(enm)
        assert "E028" not in codes, f"Niespodziewane E028 dla variant={variant}"


# ---------------------------------------------------------------------------
# E029: DER bezpośrednio na szynie SN
# ---------------------------------------------------------------------------


def test_e029_pv_inverter_on_sn_bus_blocker() -> None:
    """Falownik PV bezpośrednio na Bus SN (15 kV) → BLOCKER E029."""
    enm = _empty_enm()
    enm.buses.append(Bus(ref_id="bus_sn", name="Szyna SN", voltage_kv=15.0))
    enm.generators.append(
        Generator(
            ref_id="gen_pv_bad",
            name="PV na SN",
            bus_ref="bus_sn",
            p_mw=1.0,
            gen_type="pv_inverter",
            connection_variant="nn_side",  # E028 OK ale E029 strzela
            station_ref="sub_a",  # V12S-008: nn_side wymaga station_ref
        )
    )
    codes = _validate(enm)
    assert "E029" in codes


def test_e029_wind_inverter_on_sn_bus_blocker() -> None:
    """Falownik wiatrowy bezpośrednio na Bus 110 kV (variant=LV_BEHIND_STATION_TRANSFORMER → SN bus zabroniony)."""
    enm = _empty_enm()
    enm.buses.append(Bus(ref_id="bus_hv", name="Szyna 110 kV", voltage_kv=110.0))
    enm.generators.append(
        Generator(
            ref_id="gen_wind_bad",
            name="FW na HV",
            bus_ref="bus_hv",
            p_mw=10.0,
            gen_type="wind_inverter",
            connection_variant="LV_BEHIND_STATION_TRANSFORMER",
            station_ref="sub_a",
            blocking_transformer_ref="tr_block_a",  # V12S-008: LV_BEHIND wymaga obu
        )
    )
    codes = _validate(enm)
    assert "E029" in codes


def test_e029_block_transformer_variant_skips_validation() -> None:
    """connection_variant='block_transformer' jawnie deklaruje trafo blokowy
    w torze ENM — bus_ref może być SN bez naruszenia (Decision #14)."""
    enm = _empty_enm()
    enm.buses.append(Bus(ref_id="bus_sn", name="Bus SN", voltage_kv=15.0))
    enm.generators.append(
        Generator(
            ref_id="gen_pv_block",
            name="PV block transformer",
            bus_ref="bus_sn",  # SN bus, ale variant deklaruje trafo blokowy
            p_mw=1.0,
            gen_type="pv_inverter",
            connection_variant="block_transformer",
            blocking_transformer_ref="tr_block_pv",
        )
    )
    codes = _validate(enm)
    assert "E029" not in codes


def test_e029_dedicated_mv_variant_skips_validation() -> None:
    """connection_variant='DEDICATED_MV_CONNECTION' = analogicznie OK na SN."""
    enm = _empty_enm()
    enm.buses.append(Bus(ref_id="bus_sn", name="Bus SN", voltage_kv=15.0))
    enm.generators.append(
        Generator(
            ref_id="gen_pv_ded",
            name="PV dedicated MV",
            bus_ref="bus_sn",
            p_mw=1.0,
            gen_type="pv_inverter",
            connection_variant="DEDICATED_MV_CONNECTION",
            # DEDICATED_MV_CONNECTION: station_ref ZABRONIONY, blocking_transformer_ref opcjonalny
        )
    )
    codes = _validate(enm)
    assert "E029" not in codes


def test_e029_inverter_on_nn_bus_no_issue() -> None:
    """Falownik na Bus nN (0.4 kV) → E029 nie strzela."""
    enm = _empty_enm()
    enm.buses.append(Bus(ref_id="bus_nn", name="Szyna nN", voltage_kv=0.4))
    enm.generators.append(
        Generator(
            ref_id="gen_pv",
            name="PV nN",
            bus_ref="bus_nn",
            p_mw=1.0,
            gen_type="pv_inverter",
            connection_variant="nn_side",
            station_ref="sub_a",
        )
    )
    codes = _validate(enm)
    assert "E029" not in codes


def test_e029_synchronous_generator_on_sn_bus_no_issue() -> None:
    """Generator synchroniczny na Bus SN → DOZWOLONE (nie inverter)."""
    enm = _empty_enm()
    enm.buses.append(Bus(ref_id="bus_sn", name="Szyna SN", voltage_kv=15.0))
    enm.generators.append(
        Generator(
            ref_id="gen_sync",
            name="Generator sync",
            bus_ref="bus_sn",
            p_mw=10.0,
            gen_type="synchronous",
        )
    )
    codes = _validate(enm)
    assert "E029" not in codes


def test_e029_voltage_threshold_1kv_inclusive() -> None:
    """Granica 1 kV: bus voltage <= 1 kV nie wywołuje E029."""
    enm = _empty_enm()
    enm.buses.append(Bus(ref_id="bus_borderline", name="Szyna 0.69 kV", voltage_kv=0.69))
    enm.generators.append(
        Generator(
            ref_id="gen_pv",
            name="PV 0.69",
            bus_ref="bus_borderline",
            p_mw=1.0,
            gen_type="pv_inverter",
            connection_variant="nn_side",
            station_ref="sub_a",
        )
    )
    codes = _validate(enm)
    assert "E029" not in codes


# ---------------------------------------------------------------------------
# Composability: E028 + E029 razem
# ---------------------------------------------------------------------------


def test_e028_and_e029_both_emitted_when_both_violations() -> None:
    """Inverter na Bus SN bez connection_variant → oba E028 + E029."""
    enm = _empty_enm()
    enm.buses.append(Bus(ref_id="bus_sn", name="Szyna SN", voltage_kv=15.0))
    enm.generators.append(
        Generator(
            ref_id="gen_double_bad",
            name="DER zły",
            bus_ref="bus_sn",
            p_mw=1.0,
            gen_type="pv_inverter",
            # ani connection_variant ani na nN bus
        )
    )
    codes = _validate(enm)
    assert "E028" in codes
    assert "E029" in codes


# ---------------------------------------------------------------------------
# Determinism + element_refs
# ---------------------------------------------------------------------------


def test_e028_includes_generator_ref_in_element_refs() -> None:
    enm = _empty_enm()
    enm.buses.append(Bus(ref_id="bus_nn", name="Bus nN", voltage_kv=0.4))
    enm.generators.append(
        Generator(
            ref_id="gen_x",
            name="DER X",
            bus_ref="bus_nn",
            p_mw=1.0,
            gen_type="pv_inverter",
        )
    )
    issues = ENMValidator().validate(enm).issues
    e028_issues = [i for i in issues if i.code == "E028"]
    assert len(e028_issues) == 1
    assert "gen_x" in e028_issues[0].element_refs


def test_e029_includes_both_generator_and_bus_in_element_refs() -> None:
    enm = _empty_enm()
    enm.buses.append(Bus(ref_id="bus_sn", name="Bus SN", voltage_kv=15.0))
    enm.generators.append(
        Generator(
            ref_id="gen_x",
            name="DER X",
            bus_ref="bus_sn",
            p_mw=1.0,
            gen_type="pv_inverter",
            connection_variant="nn_side",
            station_ref="sub_a",
        )
    )
    issues = ENMValidator().validate(enm).issues
    e029_issues = [i for i in issues if i.code == "E029"]
    assert len(e029_issues) == 1
    assert "gen_x" in e029_issues[0].element_refs
    assert "bus_sn" in e029_issues[0].element_refs
