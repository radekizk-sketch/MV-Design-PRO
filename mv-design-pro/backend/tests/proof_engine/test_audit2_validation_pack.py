"""
Testy ProofPack audytu 2 (Phase 4).

5 typow dowodow + agregator + determinizm.
"""

from __future__ import annotations

from uuid import UUID

from application.proof_engine.packs.audit2_validation import (
    generate_bess_modes_proof,
    generate_device_withstand_proof,
    generate_hosting_capacity_export_proof,
    generate_station_audit2_proof_pack,
    generate_tap_changer_plan_proof,
    generate_vt_grounding_validation_proof,
)


def test_bess_modes_proof_passes_with_compatible_pcs():
    proof = generate_bess_modes_proof(
        der_id="der_bess_001",
        pcs_four_quadrant=True,
        pcs_grid_forming=True,
        nc_rfg_module="C",
        selected_mode_refs=["mode_fcr_n", "mode_voltage_support"],
        proof_id=UUID(int=1),
        generated_at_iso="2026-04-01T00:00:00Z",
    )
    assert proof.pass_status is True
    assert "OK" in proof.summary_pl


def test_bess_modes_proof_fails_when_pcs_lacks_4q():
    proof = generate_bess_modes_proof(
        der_id="der_bess_002",
        pcs_four_quadrant=False,
        pcs_grid_forming=False,
        nc_rfg_module="C",
        selected_mode_refs=["mode_fcr_n"],  # Wymaga 4Q
        proof_id=UUID(int=2),
        generated_at_iso="2026-04-01T00:00:00Z",
    )
    assert proof.pass_status is False
    assert "4-quadrant" in proof.summary_pl or any(
        "4-quadrant" in i for i in proof.details["issues"]
    )


def test_bess_modes_proof_fails_when_module_required_missing():
    proof = generate_bess_modes_proof(
        der_id="der_bess_003",
        pcs_four_quadrant=True,
        pcs_grid_forming=False,
        nc_rfg_module="C",
        selected_mode_refs=[],  # Modul C wymaga FCR-N + Q(U), brak.
        proof_id=UUID(int=3),
        generated_at_iso="2026-04-01T00:00:00Z",
    )
    assert proof.pass_status is False
    assert any("Brakuje wymaganego trybu" in i for i in proof.details["issues"])


def test_tap_changer_plan_proof_passes_for_oltc_110sn():
    proof = generate_tap_changer_plan_proof(
        transformer_id="tr_001",
        transformer_type="transformer_110_15",
        tap_changer_ref="tc_oltc_110sn_19_125",
        requires_avr=True,
        proof_id=UUID(int=4),
        generated_at_iso="2026-04-01T00:00:00Z",
    )
    assert proof.pass_status is True


def test_tap_changer_plan_fails_when_avr_required_but_detc():
    proof = generate_tap_changer_plan_proof(
        transformer_id="tr_002",
        transformer_type="transformer_15_04",
        tap_changer_ref="tc_detc_snnn_5_25",  # DETC nie ma AVR
        requires_avr=True,
        proof_id=UUID(int=5),
        generated_at_iso="2026-04-01T00:00:00Z",
    )
    assert proof.pass_status is False
    assert any("AVR" in i for i in proof.details["issues"])


def test_tap_changer_plan_fails_for_wrong_transformer_type():
    proof = generate_tap_changer_plan_proof(
        transformer_id="tr_003",
        transformer_type="transformer_15_04",
        tap_changer_ref="tc_oltc_110sn_19_125",  # 110/SN nie pasuje
        requires_avr=False,
        proof_id=UUID(int=6),
        generated_at_iso="2026-04-01T00:00:00Z",
    )
    assert proof.pass_status is False


def test_hosting_capacity_proof_passes_for_normal_export():
    proof = generate_hosting_capacity_export_proof(
        station_id="station_001",
        p_export_kw=1200,
        p_import_kw=1000,
        proof_id=UUID(int=7),
        generated_at_iso="2026-04-01T00:00:00Z",
    )
    assert proof.pass_status is True
    assert proof.details["status"] == "normal_export"


def test_hosting_capacity_proof_fails_for_critical_export():
    proof = generate_hosting_capacity_export_proof(
        station_id="station_002",
        p_export_kw=5000,
        p_import_kw=1000,
        proof_id=UUID(int=8),
        generated_at_iso="2026-04-01T00:00:00Z",
    )
    assert proof.pass_status is False
    assert proof.details["status"] == "requires_ramp_down"


def test_device_withstand_proof_passes_within_limits():
    proof = generate_device_withstand_proof(
        device_id="wstd_breaker_vacuum_15_25",
        i_peak_calculated_ka=50,
        i_thermal_calculated_ka=20,
        t_clearing_s=1.0,
        proof_id=UUID(int=9),
        generated_at_iso="2026-04-01T00:00:00Z",
    )
    assert proof.pass_status is True


def test_device_withstand_proof_fails_idyn_exceeded():
    proof = generate_device_withstand_proof(
        device_id="wstd_breaker_vacuum_15_25",
        i_peak_calculated_ka=70,  # > 63 kA limit
        i_thermal_calculated_ka=20,
        t_clearing_s=1.0,
        proof_id=UUID(int=10),
        generated_at_iso="2026-04-01T00:00:00Z",
    )
    assert proof.pass_status is False
    assert "I_dyn" in proof.summary_pl


def test_vt_grounding_proof_passes_for_19_petersen():
    proof = generate_vt_grounding_validation_proof(
        bay_designation="POLE-01",
        vt_voltage_factor=1.9,
        grounding_type="petersen_coil",
        proof_id=UUID(int=11),
        generated_at_iso="2026-04-01T00:00:00Z",
    )
    assert proof.pass_status is True


def test_vt_grounding_proof_fails_for_15_isolated():
    proof = generate_vt_grounding_validation_proof(
        bay_designation="POLE-02",
        vt_voltage_factor=1.5,
        grounding_type="isolated",
        proof_id=UUID(int=12),
        generated_at_iso="2026-04-01T00:00:00Z",
    )
    assert proof.pass_status is False
    assert "1.9" in proof.summary_pl


def test_vt_grounding_proof_unknown_type():
    proof = generate_vt_grounding_validation_proof(
        bay_designation="POLE-03",
        vt_voltage_factor=1.9,
        grounding_type="unknown_grounding",
        proof_id=UUID(int=13),
        generated_at_iso="2026-04-01T00:00:00Z",
    )
    assert proof.pass_status is False
    assert "Nieznany typ uziemienia" in proof.summary_pl


def test_station_audit2_proof_pack_aggregates_proofs():
    proofs = [
        generate_hosting_capacity_export_proof(
            station_id="station_X",
            p_export_kw=1200,
            p_import_kw=1000,
            proof_id=UUID(int=20),
        ),
        generate_vt_grounding_validation_proof(
            bay_designation="POLE-01",
            vt_voltage_factor=1.9,
            grounding_type="petersen_coil",
            proof_id=UUID(int=21),
        ),
    ]
    pack = generate_station_audit2_proof_pack(station_id="station_X", proofs=proofs)
    assert pack.station_id == "station_X"
    assert pack.all_pass is True
    assert pack.fail_count == 0
    assert len(pack.proofs) == 2


def test_station_audit2_proof_pack_reports_failures():
    proofs = [
        generate_hosting_capacity_export_proof(
            station_id="station_Y",
            p_export_kw=5000,
            p_import_kw=1000,  # requires_ramp_down -> FAIL
        ),
        generate_vt_grounding_validation_proof(
            bay_designation="POLE-02",
            vt_voltage_factor=1.5,
            grounding_type="isolated",  # requires 1.9 -> FAIL
        ),
    ]
    pack = generate_station_audit2_proof_pack(station_id="station_Y", proofs=proofs)
    assert pack.all_pass is False
    assert pack.fail_count == 2


def test_determinism_same_input_same_output():
    """Identyczny input -> identyczny output (DETERMINISM Rule)."""
    p1 = generate_device_withstand_proof(
        device_id="wstd_breaker_vacuum_15_25",
        i_peak_calculated_ka=50,
        i_thermal_calculated_ka=20,
        t_clearing_s=1.0,
        proof_id=UUID(int=100),
        generated_at_iso="2026-04-01T00:00:00Z",
    )
    p2 = generate_device_withstand_proof(
        device_id="wstd_breaker_vacuum_15_25",
        i_peak_calculated_ka=50,
        i_thermal_calculated_ka=20,
        t_clearing_s=1.0,
        proof_id=UUID(int=100),
        generated_at_iso="2026-04-01T00:00:00Z",
    )
    assert p1.to_dict() == p2.to_dict()


def test_brak_wspolczynnika_daje_dowod_NIEZALICZONY_a_nie_domyslne_19() -> None:
    """Nieznany wspolczynnik napieciowy nie moze stac sie liczba (V12K-258).

    Wolajacy podstawial `VT_CATALOG_FOR_FACTOR.get(vt_ref, 1.9)` — czteroelementowa mapa
    syntetycznych identyfikatorow frontu z wartoscia domyslna 1,9. Kazdy typ spoza tej
    mapy (czyli KAZDY typ z realnego katalogu) dostawal wspolczynnik z powietrza, a
    pakiet dowodowy oglaszal na tej podstawie ZGODNOSC. Brak danej musi byc widoczny
    w dokumencie, bo dokument jest dowodem.
    """
    dowod = generate_vt_grounding_validation_proof(
        bay_designation="J01",
        vt_voltage_factor=None,
        grounding_type="petersen_coil",
    )
    assert dowod.pass_status is False
    assert "nieznany" in dowod.summary_pl.lower()
    assert dowod.details["vt_voltage_factor"] is None
    # Wzor bez danych nie jest dowodem — nie udajemy rachunku.
    assert dowod.formulas_latex == []
