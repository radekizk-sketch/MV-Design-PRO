"""
Audit2 Validation Proof Pack — pakiet dowodowy dla rozszerzen audytu 2.

5 typow dowodow (Phase 4):
  - AUDIT2_BESS_OPERATION_MODES (eng.10): zgodnosc trybow z PCS + NC RfG modulem
  - AUDIT2_TAP_CHANGER_PLAN (eng.13): plan przelaczania zaczepow OLTC/DETC
  - AUDIT2_HOSTING_CAPACITY_EXPORT (eng.15): bilans P_export vs P_import
  - AUDIT2_DEVICE_WITHSTAND (eng.18): walidacja I_dyn / I_th aparatury
  - AUDIT2_VT_GROUNDING_VALIDATION (eng.20): VT U_th vs typ uziemienia

INVARIANTS:
- Identical input -> identical output (deterministic).
- LaTeX-only math.
- Walidacje zwracaja zarowno status (pass/fail) jak i message_pl + dane uzasadnienia.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from network_model.catalog.audit2_catalogs import (
    get_bess_operation_mode,
    get_block_transformer,
    get_device_withstand,
    get_mv_neutral_grounding,
    get_pf_curve,
    get_tap_changer,
    is_vt_voltage_factor_valid_for_grounding,
    validate_device_withstand,
    validate_hosting_capacity_export,
)


@dataclass(frozen=True)
class Audit2ProofResult:
    """Wynik dowodu audytu 2 (jednorodny format dla wszystkich 5 typow)."""

    proof_id: UUID
    proof_type: str
    pass_status: bool
    summary_pl: str
    details: dict[str, Any]
    formulas_latex: list[str]
    generated_at: str  # ISO 8601 deterministyczne — caller dostarcza.

    def to_dict(self) -> dict[str, Any]:
        return {
            "proof_id": str(self.proof_id),
            "proof_type": self.proof_type,
            "pass_status": self.pass_status,
            "summary_pl": self.summary_pl,
            "details": self.details,
            "formulas_latex": self.formulas_latex,
            "generated_at": self.generated_at,
        }


# =============================================================================
# 1. BESS Operation Modes proof (eng.10)
# =============================================================================


def generate_bess_modes_proof(
    *,
    der_id: str,
    pcs_four_quadrant: bool,
    pcs_grid_forming: bool,
    nc_rfg_module: str,  # "A" | "B" | "C" | "D"
    selected_mode_refs: list[str],
    proof_id: UUID | None = None,
    generated_at_iso: str = "1970-01-01T00:00:00Z",
) -> Audit2ProofResult:
    """
    Dowod zgodnosci trybow BESS z PCS + NC RfG modulem.

    Naprawa eng.10:
      - Sprawdza ze PCS obsluguje wymagane tryby (4Q, grid-forming).
      - Sprawdza ze tryby wymagane dla danego modulu NC RfG sa wybrane.
    """
    proof_id = proof_id or uuid4()
    issues: list[str] = []
    selected_modes: list[dict[str, Any]] = []

    for ref in sorted(set(selected_mode_refs)):
        mode = get_bess_operation_mode(ref)
        if mode is None:
            issues.append(f"Nieznany tryb BESS: {ref}")
            continue
        # PCS capability check.
        if mode.requires_four_quadrant and not pcs_four_quadrant:
            issues.append(
                f"Tryb '{mode.label_pl}' wymaga PCS 4-quadrant (PCS DER {der_id} nie obsluguje)."
            )
        if mode.requires_grid_forming and not pcs_grid_forming:
            issues.append(
                f"Tryb '{mode.label_pl}' wymaga PCS grid-forming (PCS DER {der_id} nie obsluguje)."
            )
        selected_modes.append(mode.to_dict())

    # Wymagane tryby dla modulu NC RfG.
    from network_model.catalog.audit2_catalogs import select_required_bess_modes_for_module

    required = select_required_bess_modes_for_module(nc_rfg_module)  # type: ignore[arg-type]
    selected_codes = {m["mode_code"] for m in selected_modes}
    missing_required = [r for r in required if r.mode_code not in selected_codes]
    for missing in missing_required:
        issues.append(
            f"Brakuje wymaganego trybu dla modulu NC RfG {nc_rfg_module}: '{missing.label_pl}'."
        )

    pass_status = len(issues) == 0
    summary = (
        f"OK: DER {der_id} ma {len(selected_modes)} tryby zgodne z PCS i NC RfG modulem {nc_rfg_module}."
        if pass_status
        else f"BLOKER: DER {der_id} — {len(issues)} problemow z trybami BESS."
    )

    return Audit2ProofResult(
        proof_id=proof_id,
        proof_type="AUDIT2_BESS_OPERATION_MODES",
        pass_status=pass_status,
        summary_pl=summary,
        details={
            "der_id": der_id,
            "pcs_four_quadrant": pcs_four_quadrant,
            "pcs_grid_forming": pcs_grid_forming,
            "nc_rfg_module": nc_rfg_module,
            "selected_modes": selected_modes,
            "required_modes_for_module": [r.to_dict() for r in required],
            "issues": issues,
        },
        formulas_latex=[
            r"$$\text{Mode}_{\text{compatible}} \iff (\text{4Q required} \implies \text{PCS}_{\text{4Q}}) "
            r"\land (\text{GFM required} \implies \text{PCS}_{\text{GFM}})$$",
            r"$$\text{Module}_{\text{compliant}} \iff \forall m \in \text{required}(M_{NC RfG}): m \in \text{selected}$$",
        ],
        generated_at=generated_at_iso,
    )


# =============================================================================
# 2. Tap Changer Plan proof (eng.13)
# =============================================================================


def generate_tap_changer_plan_proof(
    *,
    transformer_id: str,
    transformer_type: str,  # "transformer_110_15" | "transformer_15_04" | etc.
    tap_changer_ref: str,
    requires_avr: bool,
    proof_id: UUID | None = None,
    generated_at_iso: str = "1970-01-01T00:00:00Z",
) -> Audit2ProofResult:
    """
    Dowod planu przelaczania zaczepow.

    Naprawa eng.13:
      - Sprawdza ze tap-changer pasuje do typu transformatora.
      - Sprawdza ze AVR jest dostepny gdy wymagany.
    """
    proof_id = proof_id or uuid4()
    tc = get_tap_changer(tap_changer_ref)
    issues: list[str] = []

    if tc is None:
        issues.append(f"Nieznany tap-changer: {tap_changer_ref}")
    else:
        if transformer_type not in tc.applicable_to:
            issues.append(
                f"Tap-changer '{tc.label_pl}' nie jest przeznaczony dla {transformer_type} "
                f"(applicable: {list(tc.applicable_to)})."
            )
        if requires_avr and not tc.supports_avr:
            issues.append(
                f"Wymagany AVR (Automatic Voltage Regulation), tap-changer '{tc.label_pl}' "
                "nie obsluguje (typ DETC off-load)."
            )

    pass_status = len(issues) == 0
    summary = (
        f"OK: Tap-changer dla transformatora {transformer_id} jest zgodny z wymaganiami."
        if pass_status
        else f"BLOKER: {len(issues)} problemow z planem zaczepow dla {transformer_id}."
    )

    return Audit2ProofResult(
        proof_id=proof_id,
        proof_type="AUDIT2_TAP_CHANGER_PLAN",
        pass_status=pass_status,
        summary_pl=summary,
        details={
            "transformer_id": transformer_id,
            "transformer_type": transformer_type,
            "tap_changer": tc.to_dict() if tc else None,
            "requires_avr": requires_avr,
            "issues": issues,
        },
        formulas_latex=[
            r"$$\Delta U_{\text{regulation}} = \pm \text{step}\% \times N_{\text{taps}}$$",
            r"$$U_{\text{output}} = U_{\text{nominal}} \cdot (1 + \frac{n - n_{\text{neutral}}}{N_{\text{taps}}} \cdot \text{range}\%)$$",
        ],
        generated_at=generated_at_iso,
    )


# =============================================================================
# 3. Hosting Capacity Export proof (eng.15)
# =============================================================================


def generate_hosting_capacity_export_proof(
    *,
    station_id: str,
    p_export_kw: float,
    p_import_kw: float,
    proof_id: UUID | None = None,
    generated_at_iso: str = "1970-01-01T00:00:00Z",
) -> Audit2ProofResult:
    """Dowod bilansu eksportu vs importu (NC RfG Art. 17)."""
    proof_id = proof_id or uuid4()
    result = validate_hosting_capacity_export(
        station_id=station_id, p_export_kw=p_export_kw, p_import_kw=p_import_kw
    )
    pass_status = result["status"] in ("no_export", "normal_export")
    return Audit2ProofResult(
        proof_id=proof_id,
        proof_type="AUDIT2_HOSTING_CAPACITY_EXPORT",
        pass_status=pass_status,
        summary_pl=result["message_pl"],
        details=result,
        formulas_latex=[
            r"$$P_{\text{net export}} = \sum P_{\text{DER}} - \sum P_{\text{load}}$$",
            r"$$\text{ratio} = \frac{P_{\text{export}}}{P_{\text{import}}}$$",
        ],
        generated_at=generated_at_iso,
    )


# =============================================================================
# 4. Device Withstand proof (eng.18)
# =============================================================================


def generate_device_withstand_proof(
    *,
    device_id: str,
    i_peak_calculated_ka: float,
    i_thermal_calculated_ka: float,
    t_clearing_s: float,
    proof_id: UUID | None = None,
    generated_at_iso: str = "1970-01-01T00:00:00Z",
) -> Audit2ProofResult:
    """Dowod wytrzymalosci aparatury I_dyn / I_th (IEC 60909)."""
    proof_id = proof_id or uuid4()
    result = validate_device_withstand(
        device_id=device_id,
        i_peak_calculated_ka=i_peak_calculated_ka,
        i_thermal_calculated_ka=i_thermal_calculated_ka,
        t_clearing_s=t_clearing_s,
    )
    return Audit2ProofResult(
        proof_id=proof_id,
        proof_type="AUDIT2_DEVICE_WITHSTAND",
        pass_status=bool(result["ok"]),
        summary_pl=str(result["message_pl"]),
        details=result,
        formulas_latex=[
            r"$$I_{\text{dyn}} \geq \kappa \sqrt{2} \cdot I_k''$$",
            r"$$I_{\text{th eff}}(t) = I_{\text{th rated}} \cdot \sqrt{\frac{t_{\text{rated}}}{t_{\text{clearing}}}}$$",
            r"$$I_{\text{th eff}}(t) \geq I_k''$$",
        ],
        generated_at=generated_at_iso,
    )


# =============================================================================
# 5. VT Grounding Validation proof (eng.20)
# =============================================================================


def generate_vt_grounding_validation_proof(
    *,
    bay_designation: str,
    vt_voltage_factor: float,
    grounding_type: str,  # "isolated" | "petersen_coil" | "resistor_grounded" | "directly_grounded"
    proof_id: UUID | None = None,
    generated_at_iso: str = "1970-01-01T00:00:00Z",
) -> Audit2ProofResult:
    """Dowod zgodnosci VT U_th z typem uziemienia neutralnego (IEC 61869-3)."""
    proof_id = proof_id or uuid4()
    if grounding_type not in {"isolated", "petersen_coil", "resistor_grounded", "directly_grounded"}:
        return Audit2ProofResult(
            proof_id=proof_id,
            proof_type="AUDIT2_VT_GROUNDING_VALIDATION",
            pass_status=False,
            summary_pl=f"Nieznany typ uziemienia: {grounding_type}",
            details={"bay_designation": bay_designation, "grounding_type": grounding_type},
            formulas_latex=[],
            generated_at=generated_at_iso,
        )
    ok, message = is_vt_voltage_factor_valid_for_grounding(vt_voltage_factor, grounding_type)  # type: ignore[arg-type]
    return Audit2ProofResult(
        proof_id=proof_id,
        proof_type="AUDIT2_VT_GROUNDING_VALIDATION",
        pass_status=ok,
        summary_pl=message
        or f"OK: VT U_th={vt_voltage_factor} pasuje do sieci {grounding_type}.",
        details={
            "bay_designation": bay_designation,
            "vt_voltage_factor": vt_voltage_factor,
            "grounding_type": grounding_type,
            "ok": ok,
            "message_pl": message,
        },
        formulas_latex=[
            r"$$U_{\text{th VT}} \geq U_{\text{required}}(\text{grounding})$$",
            r"$$U_{\text{required}} = \begin{cases} 1.9 & \text{isolated/petersen (8h)} \\ "
            r"1.5 & \text{R-grounded (30s)} \\ 1.2 & \text{directly grounded (continuous)} \end{cases}$$",
        ],
        generated_at=generated_at_iso,
    )


# =============================================================================
# Aggregator: kompletny zestaw dowodow audytu 2 dla stacji
# =============================================================================


@dataclass(frozen=True)
class StationAudit2ProofPack:
    """Pakiet dowodowy audytu 2 dla stacji."""

    station_id: str
    proofs: list[Audit2ProofResult] = field(default_factory=list)
    generated_at_iso: str = "1970-01-01T00:00:00Z"

    @property
    def all_pass(self) -> bool:
        return all(p.pass_status for p in self.proofs)

    @property
    def fail_count(self) -> int:
        return sum(1 for p in self.proofs if not p.pass_status)

    def to_dict(self) -> dict[str, Any]:
        return {
            "station_id": self.station_id,
            "all_pass": self.all_pass,
            "fail_count": self.fail_count,
            "proof_count": len(self.proofs),
            "proofs": [p.to_dict() for p in self.proofs],
            "generated_at": self.generated_at_iso,
        }


def generate_station_audit2_proof_pack(
    *,
    station_id: str,
    proofs: list[Audit2ProofResult],
    generated_at_iso: str = "1970-01-01T00:00:00Z",
) -> StationAudit2ProofPack:
    """Skomponowane dowody dla stacji (deterministyczne, posortowane po proof_type)."""
    sorted_proofs = sorted(proofs, key=lambda p: (p.proof_type, str(p.proof_id)))
    return StationAudit2ProofPack(
        station_id=station_id,
        proofs=sorted_proofs,
        generated_at_iso=generated_at_iso,
    )
