"""D2 (RECENZJA_DER_SN_DOBORY_2026-07): testy silników DOBORU toru DER-SN.

Reguła doboru, progi, kandydaci odrzuceni z powodem, determinizm oraz przypadki ❌.
Przykład kanonu: PV 998 kW ⇒ propozycja 1000 kVA 15/0.4 (asercja na REGULE:
najmniejsza Sn ≥ próg przy zgodnych napięciach — katalog ma wpis 1000 kVA 15/0.4).
"""

from __future__ import annotations

import pytest
from network_model.solvers.der_selection_preview import (
    BlockTransformerCandidate,
    BlockTransformerSelectionInput,
    CableCandidate,
    CableSelectionInput,
    FieldApparatusCandidate,
    FieldApparatusSelectionInput,
    propose_block_transformer,
    propose_mv_cable,
    propose_mv_field_apparatus,
)


def _tr_candidates() -> tuple[BlockTransformerCandidate, ...]:
    """Typoszereg 15/0.4 kV (część rzeczywistego katalogu) + wpis o niezgodnym napięciu."""
    return (
        BlockTransformerCandidate("tr-630", "TR 630 kVA 15/0.4", 0.63, 15.0, 0.4, 5.0, "Dyn11"),
        BlockTransformerCandidate("tr-1000", "TR 1000 kVA 15/0.4", 1.0, 15.0, 0.4, 6.0, "Dyn11"),
        BlockTransformerCandidate("tr-1600", "TR 1600 kVA 15/0.4", 1.6, 15.0, 0.4, 6.0, "Dyn11"),
        # Niezgodne napięcie SN (20 kV) — musi zostać odrzucone.
        BlockTransformerCandidate("tr-1000-20", "TR 1000 kVA 20/0.4", 1.0, 20.0, 0.4, 6.0, "Dyn11"),
        # Niezgodne napięcie nN (0.69 kV) — musi zostać odrzucone.
        BlockTransformerCandidate(
            "tr-1000-069", "TR 1000 kVA 15/0.69", 1.0, 15.0, 0.69, 6.0, "Dyn11"
        ),
    )


def test_block_transformer_998kw_proposes_1000kva() -> None:
    """PV 998 kW (cosφ→P=S) ⇒ najmniejsza Sn ≥ 0,998 MVA przy 15/0,4 kV = 1000 kVA."""
    result = propose_block_transformer(
        BlockTransformerSelectionInput(
            sum_apparent_power_mva=0.998,
            primary_voltage_kv=15.0,
            secondary_voltage_kv=0.4,
            candidates=_tr_candidates(),
        )
    )
    assert result.proposal is not None
    assert result.proposal.sn_mva == pytest.approx(1.0)
    assert result.proposal.primary_kv == pytest.approx(15.0)
    assert result.proposal.secondary_kv == pytest.approx(0.4)
    assert result.required_apparent_power_mva == pytest.approx(0.998)
    # 630 kVA odrzucone jako za małe; wpisy o niezgodnych napięciach też odrzucone.
    reason_by_ref = {r.catalog_ref: r.reason_code for r in result.rejected}
    assert reason_by_ref["tr-630"] == "moc_niewystarczajaca"
    assert reason_by_ref["tr-1000-20"] == "napiecie_sn_niezgodne"
    assert reason_by_ref["tr-1000-069"] == "napiecie_nn_niezgodne"


def test_block_transformer_available_vector_groups_from_voltage_class() -> None:
    """D3 wym. 7: lista układów połączeń = realne grupy kandydatów zgodnych napięciowo,
    posortowane, unikalne, niezależnie od progu mocy (i bez wpisów o innych napięciach)."""
    candidates = (
        BlockTransformerCandidate("tr-630", "TR 630 Dyn11", 0.63, 15.0, 0.4, 5.0, "Dyn11"),
        BlockTransformerCandidate("tr-1000-yd", "TR 1000 Yd11", 1.0, 15.0, 0.4, 6.0, "Yd11"),
        # Inne napięcie SN (20 kV) — jego grupa (YNyn0) NIE należy do klasy 15/0,4 kV.
        BlockTransformerCandidate("tr-20", "TR 20/0.4 YNyn0", 1.0, 20.0, 0.4, 6.0, "YNyn0"),
    )
    result = propose_block_transformer(
        BlockTransformerSelectionInput(
            sum_apparent_power_mva=0.5,
            primary_voltage_kv=15.0,
            secondary_voltage_kv=0.4,
            candidates=candidates,
        )
    )
    assert result.available_vector_groups == ("Dyn11", "Yd11")


def test_block_transformer_reserve_and_simultaneity_raise_threshold() -> None:
    """Rezerwa + jednoczesność podnoszą próg: 0,63·1,2·1,1 = 0,8316 MVA ⇒ nadal 1000 kVA,
    ale 630 kVA już nie starcza (0,63 < 0,8316)."""
    result = propose_block_transformer(
        BlockTransformerSelectionInput(
            sum_apparent_power_mva=0.63,
            primary_voltage_kv=15.0,
            secondary_voltage_kv=0.4,
            candidates=_tr_candidates(),
            simultaneity_factor=1.1,
            reserve_pu=0.2,
        )
    )
    assert result.required_apparent_power_mva == pytest.approx(0.63 * 1.1 * 1.2)
    assert result.proposal is not None
    assert result.proposal.sn_mva == pytest.approx(1.0)


def test_block_transformer_no_candidate_returns_error() -> None:
    """ΣS ponad największy TR ⇒ brak kandydata, kod ❌ stabilny."""
    result = propose_block_transformer(
        BlockTransformerSelectionInput(
            sum_apparent_power_mva=5.0,
            primary_voltage_kv=15.0,
            secondary_voltage_kv=0.4,
            candidates=_tr_candidates(),
        )
    )
    assert result.proposal is None
    assert result.error_code == "converter.der_sn.dobor_tr_brak_kandydata"
    assert result.error_pl is not None and result.error_pl.startswith("❌")


def test_block_transformer_deterministic() -> None:
    """Ten sam wejściowy zestaw ⇒ identyczna propozycja (determinizm)."""
    args = BlockTransformerSelectionInput(
        sum_apparent_power_mva=0.998,
        primary_voltage_kv=15.0,
        secondary_voltage_kv=0.4,
        candidates=_tr_candidates(),
    )
    first = propose_block_transformer(args)
    second = propose_block_transformer(args)
    assert first == second


def _cable_candidates() -> tuple[CableCandidate, ...]:
    return (
        CableCandidate("cab-50", "Kabel 50", 50.0, 160.0, 0.641, 0.14),
        CableCandidate("cab-120", "Kabel 120", 120.0, 340.0, 0.153, 0.112),
        CableCandidate("cab-240", "Kabel 240", 240.0, 530.0, 0.0754, 0.099),
    )


def test_cable_selects_smallest_meeting_ampacity_and_drop() -> None:
    """I_TR=140 A, rezerwa 0 ⇒ próg 140 A; najmniejszy przekrój z Iz≥140 i ΔU≤2% = 50 mm²."""
    result = propose_mv_cable(
        CableSelectionInput(
            transformer_current_a=140.0,
            length_km=1.0,
            line_voltage_v=15000.0,
            cos_phi=0.95,
            candidates=_cable_candidates(),
            max_delta_u_pct=2.0,
        )
    )
    assert result.proposal is not None
    assert result.proposal.cross_section_mm2 == pytest.approx(50.0)
    assert result.proposal.rated_current_a >= result.required_ampacity_a


def test_cable_rejects_undersized_by_ampacity() -> None:
    """I_TR=200 A ⇒ 50 mm² (Iz 160) odrzucony za mały, propozycja 120 mm²."""
    result = propose_mv_cable(
        CableSelectionInput(
            transformer_current_a=200.0,
            length_km=1.0,
            line_voltage_v=15000.0,
            cos_phi=0.95,
            candidates=_cable_candidates(),
            max_delta_u_pct=5.0,
        )
    )
    assert result.proposal is not None
    assert result.proposal.cross_section_mm2 == pytest.approx(120.0)
    reason_by_ref = {r.catalog_ref: r.reason_code for r in result.rejected}
    assert reason_by_ref["cab-50"] == "przekroj_niewystarczajacy"


def test_cable_voltage_drop_exceeded_returns_error() -> None:
    """Długi odcinek + rygorystyczny ΔU ⇒ żaden przekrój się nie mieści (kod ❌ ΔU)."""
    result = propose_mv_cable(
        CableSelectionInput(
            transformer_current_a=150.0,
            length_km=40.0,
            line_voltage_v=15000.0,
            cos_phi=0.9,
            candidates=_cable_candidates(),
            max_delta_u_pct=0.5,
        )
    )
    assert result.proposal is None
    assert result.error_code == "converter.der_sn.dobor_kabel_spadek_przekroczony"
    assert result.error_pl is not None and result.error_pl.startswith("❌")


def test_cable_all_undersized_returns_ampacity_error() -> None:
    """I_TR ponad największą obciążalność ⇒ kod ❌ „przekrój niewystarczający"."""
    result = propose_mv_cable(
        CableSelectionInput(
            transformer_current_a=800.0,
            length_km=1.0,
            line_voltage_v=15000.0,
            cos_phi=0.95,
            candidates=_cable_candidates(),
            max_delta_u_pct=5.0,
        )
    )
    assert result.proposal is None
    assert result.error_code == "converter.der_sn.dobor_kabel_przekroj_niewystarczajacy"


def _field_candidates() -> tuple[FieldApparatusCandidate, ...]:
    return (
        FieldApparatusCandidate("cb-630", "Wyłącznik 630 A", "CIRCUIT_BREAKER", 12.0, 630.0, 20.0),
        FieldApparatusCandidate(
            "cb-1250", "Wyłącznik 1250 A", "CIRCUIT_BREAKER", 12.0, 1250.0, 25.0
        ),
        FieldApparatusCandidate("fuse-200", "Bezpiecznik 200 A", "FUSE", 12.0, 200.0, None),
    )


def test_field_apparatus_selects_smallest_meeting_current() -> None:
    """I_TR=100 A ⇒ najmniejszy wyłącznik In≥100 = 630 A (bezpiecznik odrzucony rodzajem)."""
    result = propose_mv_field_apparatus(
        FieldApparatusSelectionInput(
            transformer_current_a=100.0,
            system_voltage_kv=12.0,
            candidates=_field_candidates(),
        )
    )
    assert result.proposal is not None
    assert result.proposal.catalog_ref == "cb-630"
    reason_by_ref = {r.catalog_ref: r.reason_code for r in result.rejected}
    assert reason_by_ref["fuse-200"] == "rodzaj_niewlasciwy"


def test_field_apparatus_too_weak_proposes_stronger() -> None:
    """Aparat 630 A za słaby dla progu 700 A ⇒ odrzucony, propozycja 1250 A (kanon 11)."""
    result = propose_mv_field_apparatus(
        FieldApparatusSelectionInput(
            transformer_current_a=700.0,
            system_voltage_kv=12.0,
            candidates=_field_candidates(),
        )
    )
    assert result.proposal is not None
    assert result.proposal.catalog_ref == "cb-1250"
    reason_by_ref = {r.catalog_ref: r.reason_code for r in result.rejected}
    assert reason_by_ref["cb-630"] == "prad_niewystarczajacy"


def test_field_apparatus_voltage_too_low_rejected() -> None:
    """Aparat 12 kV na sieci 24 kV ⇒ odrzucony napięciem, brak kandydata."""
    result = propose_mv_field_apparatus(
        FieldApparatusSelectionInput(
            transformer_current_a=100.0,
            system_voltage_kv=24.0,
            candidates=_field_candidates(),
        )
    )
    assert result.proposal is None
    assert result.error_code == "converter.der_sn.dobor_pole_brak_kandydata"
    reason_codes = {r.reason_code for r in result.rejected}
    assert "napiecie_aparatu_za_niskie" in reason_codes
