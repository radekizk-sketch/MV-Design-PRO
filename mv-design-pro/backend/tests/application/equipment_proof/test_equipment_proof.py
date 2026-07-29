from __future__ import annotations

from application.equipment_proof import (
    DeviceRating,
    EquipmentProofGenerator,
    EquipmentProofInput,
)
from application.equipment_proof.proof_pack import build_equipment_proof_pack


def _base_input() -> EquipmentProofInput:
    device = DeviceRating(
        device_id="SW-001",
        name_pl="Wyłącznik SN",
        type_ref="CB-15kV",
        u_m_kv=15.0,
        i_cu_ka=20.0,
        i_dyn_ka=50.0,
        i_th_ka=20.0,
        t_th_s=1.0,
        meta={"vendor": "Test"},
    )
    required = {
        "u_kv": 12.0,
        "ikss_ka": 16.0,
        "ip_ka": 30.0,
        "idyn_ka": 40.0,
        "ith_ka": 18.0,
        "tk_s": 1.0,
    }
    return EquipmentProofInput(
        project_id="proj-1",
        case_id="case-1",
        run_id="run-1",
        connection_node_id="BoundaryNode-1",
        device=device,
        required_fault_results=required,
    )


def _find_check(bundle, name: str):
    return next(check for check in bundle.result.checks if check.name == name)


def test_equipment_proof_pass_all():
    bundle = EquipmentProofGenerator.generate(_base_input())

    assert bundle.result.overall_status == "PASS"
    assert bundle.result.failed_checks == ()
    assert bundle.result.key_results["overall_ok"] == "PASS"


def test_equipment_proof_fail_missing_field():
    proof_input = _base_input()
    device = proof_input.device
    proof_input = EquipmentProofInput(
        project_id=proof_input.project_id,
        case_id=proof_input.case_id,
        run_id=proof_input.run_id,
        connection_node_id=proof_input.connection_node_id,
        device=DeviceRating(
            device_id=device.device_id,
            name_pl=device.name_pl,
            type_ref=device.type_ref,
            u_m_kv=device.u_m_kv,
            i_cu_ka=None,
            i_dyn_ka=device.i_dyn_ka,
            i_th_ka=device.i_th_ka,
            t_th_s=device.t_th_s,
            meta=device.meta,
        ),
        required_fault_results=proof_input.required_fault_results,
    )
    bundle = EquipmentProofGenerator.generate(proof_input)
    check = _find_check(bundle, "Icu")

    assert check.status == "FAIL"
    assert "brak" in check.message_pl.lower()
    assert bundle.result.overall_status == "FAIL"


def test_equipment_proof_idyn_uses_ip_proxy_when_missing_idyn():
    proof_input = _base_input()
    required = dict(proof_input.required_fault_results)
    required.pop("idyn_ka")
    proof_input = EquipmentProofInput(
        project_id=proof_input.project_id,
        case_id=proof_input.case_id,
        run_id=proof_input.run_id,
        connection_node_id=proof_input.connection_node_id,
        device=proof_input.device,
        required_fault_results=required,
    )
    bundle = EquipmentProofGenerator.generate(proof_input)
    check = _find_check(bundle, "Idyn")

    assert check.status == "PASS"
    assert check.required_source_key == "ip_ka"


def _input_with_device(base: EquipmentProofInput, **device_over) -> EquipmentProofInput:
    """Wejście z podmienionymi polami aparatu (reszta 1:1 z bazowego)."""
    device = base.device
    fields = {
        "device_id": device.device_id,
        "name_pl": device.name_pl,
        "type_ref": device.type_ref,
        "u_m_kv": device.u_m_kv,
        "i_cu_ka": device.i_cu_ka,
        "i_dyn_ka": device.i_dyn_ka,
        "i_th_ka": device.i_th_ka,
        "t_th_s": device.t_th_s,
        "meta": device.meta,
    }
    fields.update(device_over)
    return EquipmentProofInput(
        project_id=base.project_id,
        case_id=base.case_id,
        run_id=base.run_id,
        connection_node_id=base.connection_node_id,
        device=DeviceRating(**fields),
        required_fault_results=base.required_fault_results,
    )


def test_equipment_proof_ith_equal_times_unchanged():
    """t_th_s == tk_s → porównanie prądów jak dotychczas (bez zmiany zachowania)."""
    bundle = EquipmentProofGenerator.generate(_base_input())
    check = _find_check(bundle, "Ith")

    assert check.status == "PASS"
    assert "20.0000 >= 18.0000" in check.message_pl
    # Krok wywodu: równanie prądowe (nie energetyczne).
    step = next(s for s in bundle.proof_document.steps if s.title_pl == "Check Ith")
    assert step.equation.equation_id == "EQ_P12_006"


def test_equipment_proof_ith_time_mismatch_i2t_pass():
    """Karta S-C: t_th_s != tk_s → porównanie energii I²t (tu: 324 ≤ 800 → PASS)."""
    proof_input = _input_with_device(_base_input(), t_th_s=2.0)
    bundle = EquipmentProofGenerator.generate(proof_input)
    check = _find_check(bundle, "Ith")

    # Ith_req²·tk = 18²·1 = 324 kA²s ≤ Ith²·t_th = 20²·2 = 800 kA²s → PASS.
    assert check.status == "PASS"
    assert "I²t" in check.message_pl
    assert "324.0000" in check.message_pl
    assert "800.0000" in check.message_pl
    assert any("I²t wymagane" in note for note in check.notes)
    assert any("I²t aparatu" in note for note in check.notes)
    # Krok wywodu: równanie energetyczne z jawnym podstawieniem.
    step = next(s for s in bundle.proof_document.steps if s.title_pl == "Check Ith")
    assert step.equation.equation_id == "EQ_P12_006b"
    assert "324.0000" in step.substitution_latex
    assert "800.0000" in step.substitution_latex
    assert bundle.result.overall_status == "PASS"


def test_equipment_proof_ith_time_mismatch_i2t_fail():
    """Karta S-C: t rożne i energia aparatu za mała → uczciwy FAIL."""
    # Ith aparatu 10 kA @ 2 s → 200 kA²s < wymagane 18²·1 = 324 kA²s.
    proof_input = _input_with_device(_base_input(), i_th_ka=10.0, t_th_s=2.0)
    bundle = EquipmentProofGenerator.generate(proof_input)
    check = _find_check(bundle, "Ith")

    assert check.status == "FAIL"
    assert "I²t" in check.message_pl
    assert bundle.result.overall_status == "FAIL"
    assert "Ith" in bundle.result.failed_checks


def test_equipment_proof_ith_missing_catalog_time_fails_honestly():
    """Brak danych katalogowych (t_th_s=None) → uczciwy FAIL jak dotychczas."""
    proof_input = _input_with_device(_base_input(), t_th_s=None)
    bundle = EquipmentProofGenerator.generate(proof_input)
    check = _find_check(bundle, "Ith")

    assert check.status == "FAIL"
    assert "brak" in check.message_pl.lower()


def test_equipment_proof_determinism_json():
    proof_input = _base_input()
    first = EquipmentProofGenerator.generate(proof_input)
    second = EquipmentProofGenerator.generate(proof_input)

    assert first.result.to_dict() == second.result.to_dict()
    assert first.proof_document.json_representation == second.proof_document.json_representation


def test_equipment_proof_pack_deterministic_zip():
    proof_input = _base_input()
    first_filename, first_pack = build_equipment_proof_pack(proof_input)
    second_filename, second_pack = build_equipment_proof_pack(proof_input)

    assert first_filename == second_filename
    assert first_pack == second_pack
