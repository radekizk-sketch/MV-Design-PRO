"""
Analysis orchestrator — unified pipeline from solver results to validated analysis.

Coordinates the execution of analysis modules in the correct order:
1. Energy validation (loading, voltage, losses, reactive balance)
2. Voltage profile (bus-centric view)
3. Run envelope creation + fingerprinting

This is APPLICATION LAYER — no physics, only coordination.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from analysis.energy_validation.builder import EnergyValidationBuilder
from analysis.energy_validation.models import (
    EnergyValidationConfig,
    EnergyValidationContext,
    EnergyValidationStatus,
    EnergyValidationView,
)
from analysis.power_flow.result import PowerFlowResult
from analysis.voltage_profile.builder import VoltageProfileBuilder
from analysis.voltage_profile.models import (
    VoltageProfileContext,
    VoltageProfileView,
)
from network_model.core.graph import NetworkGraph


@dataclass(frozen=True)
class AnalysisBundle:
    """Immutable bundle of all analysis results for a single PF run."""

    run_id: str
    created_at_utc: str
    energy_validation: EnergyValidationView
    voltage_profile: VoltageProfileView | None
    overall_status: str
    fingerprint: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "created_at_utc": self.created_at_utc,
            "energy_validation": self.energy_validation.to_dict(),
            "voltage_profile": (
                self.voltage_profile.to_dict() if self.voltage_profile is not None else None
            ),
            "overall_status": self.overall_status,
            "fingerprint": self.fingerprint,
        }


class AnalysisOrchestrator:
    """Coordinates analysis modules into a single deterministic pipeline."""

    def run_post_pf_analysis(
        self,
        *,
        run_id: str,
        power_flow_result: PowerFlowResult,
        graph: NetworkGraph,
        energy_config: EnergyValidationConfig | None = None,
        include_voltage_profile: bool = True,
        project_name: str | None = None,
        case_name: str | None = None,
    ) -> AnalysisBundle:
        now_utc = datetime.now(UTC)
        created_at = now_utc.isoformat()
        config = energy_config or EnergyValidationConfig()

        ev_context = EnergyValidationContext(
            project_name=project_name,
            case_name=case_name,
            run_timestamp=now_utc,
            case_id=None,
            snapshot_hash=None,
            run_id=run_id,
        )
        ev_builder = EnergyValidationBuilder(context=ev_context)
        energy_validation = ev_builder.build(power_flow_result, graph, config)

        voltage_profile: VoltageProfileView | None = None
        if include_voltage_profile:
            from analysis.normative.models import NormativeConfig

            # UWAGA (V12K-267): `VoltageProfileContext` NIE zostaje przemianowany
            # razem z kopertami widokow analiz. Nalezy do lancucha kontekstow
            # kopiowanych „po nazwie pola" przez `getattr(ctx, "trace_id", None)`
            # w builderach coverage_score/sensitivity/lf_sensitivity/recommendations
            # oraz w raporcie PDF. Przemianowanie CZESCI tego lancucha nie zapala
            # bledu — `getattr` z wartoscia domyslna po cichu podstawia `None`,
            # czyli identyfikator znikalby z raportow bez sladu. Ten lancuch
            # przemianowuje sie w calosci, osobna karta (patrz rejestr V12K-267).
            vp_context = VoltageProfileContext(
                project_name=project_name,
                case_name=case_name,
                run_timestamp=now_utc,
                snapshot_id=None,
                # V12K-269: `trace_id` to identyfikator ARTEFAKTU dowodowego
                # (skrot tresci — `trace_emitters/deterministic_ids.py`), a tu
                # znany jest wylacznie PRZEBIEG. Wpisanie run_id pod ta nazwa
                # bylo klamstwem, ktore dodatkowo wciagalo zmiennosc per-przebieg
                # do odcisku analizy. Artefakt na tym etapie NIE ISTNIEJE — i tak
                # to mowimy, zamiast podstawiac cokolwiek.
                trace_id=None,
                run_id=run_id,
            )
            vp_builder = VoltageProfileBuilder(graph=graph, context=vp_context)
            normative_config = NormativeConfig(
                voltage_warn_pct=config.voltage_warn_pct,
                voltage_fail_pct=config.voltage_fail_pct,
            )
            voltage_profile = vp_builder.build(power_flow_result, normative_config)

        overall_status = _compute_overall_status(energy_validation)

        bundle_dict = {
            "run_id": run_id,
            "energy_validation": energy_validation.to_dict(),
            "voltage_profile": (voltage_profile.to_dict() if voltage_profile else None),
            "overall_status": overall_status,
        }
        fingerprint = _fingerprint(bundle_dict)

        return AnalysisBundle(
            run_id=run_id,
            created_at_utc=created_at,
            energy_validation=energy_validation,
            voltage_profile=voltage_profile,
            overall_status=overall_status,
            fingerprint=fingerprint,
        )


def _compute_overall_status(ev: EnergyValidationView) -> str:
    if ev.summary.fail_count > 0:
        return EnergyValidationStatus.FAIL.value
    if ev.summary.warning_count > 0:
        return EnergyValidationStatus.WARNING.value
    if ev.summary.not_computed_count > 0 and ev.summary.pass_count == 0:
        return EnergyValidationStatus.NOT_COMPUTED.value
    return EnergyValidationStatus.PASS.value


def _fingerprint(data: dict[str, Any]) -> str:
    stable = _strip_timestamps(data)
    encoded = json.dumps(stable, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _strip_timestamps(obj: Any) -> Any:
    """Recursively remove timestamp fields for stable fingerprinting."""
    if isinstance(obj, dict):
        return {
            k: _strip_timestamps(v)
            for k, v in obj.items()
            if k not in {"run_timestamp", "created_at_utc"}
        }
    if isinstance(obj, list):
        return [_strip_timestamps(item) for item in obj]
    return obj
