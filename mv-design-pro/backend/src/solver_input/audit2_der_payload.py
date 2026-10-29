"""
Solver-input mapping dla pol audytu 2 w DER (Phase 3 backend integration).

Mapuje pola DER (BESS modes, block-trafo, P(f) curve, tap-changer)
na deterministyczny payload uzywany przez solver_input/proof_engine/report.

INVARIANTS:
- Identyczny DER spec + identyczny catalog -> identyczny payload (deterministic).
- Wszystkie pola maja catalog_ref + catalog_version (provenance).
- Brak heurystyki, brak fallback'ow.
- Sposobu uziemienia punktu neutralnego SN payload NIE niesie (karta
  UX-04/POLE-ZU-SKLADOWA-ZEROWA): dawny wybor wariantu z konfiguracji stacji byl druga
  prawda obok modelu, a jego rozszerzenia (klucz uziemienia w `sc_iec60909_extensions`
  i `protection_extensions.grounding_type`) nie mialy ani jednego czytelnika. Uziemienie
  sekcji SN czytaja solvery i analizy wprost z modelu (`enm.uziemienie_sekcji`).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

from network_model.catalog.audit2_catalogs import (
    get_bess_operation_mode,
    get_block_transformer,
    get_pf_curve,
    get_tap_changer,
)


@dataclass(frozen=True)
class DerAudit2Payload:
    """Deterministyczny payload audytu 2 dla pojedynczego DER."""

    der_id: str
    der_kind: str  # "PV" | "BESS" | "FW"
    bess_operation_modes: list[dict[str, Any]] = field(default_factory=list)
    block_transformer: dict[str, Any] | None = None
    pf_curve: dict[str, Any] | None = None
    issues: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "der_id": self.der_id,
            "der_kind": self.der_kind,
            "bess_operation_modes": self.bess_operation_modes,
            "block_transformer": self.block_transformer,
            "pf_curve": self.pf_curve,
            "issues": self.issues,
        }


@dataclass(frozen=True)
class StationAudit2Payload:
    """Deterministyczny payload audytu 2 dla stacji."""

    station_id: str
    tap_changers: list[dict[str, Any]] = field(default_factory=list)
    der_payloads: list[DerAudit2Payload] = field(default_factory=list)
    # Phase 22: per-transformer mapping (transformer_id -> tap_changer_dict).
    transformer_to_tap_changer: dict[str, dict[str, Any]] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "station_id": self.station_id,
            "tap_changers": self.tap_changers,
            "der_payloads": [d.to_dict() for d in self.der_payloads],
            "transformer_to_tap_changer": dict(self.transformer_to_tap_changer),
        }


def build_der_audit2_payload(
    *,
    der_id: str,
    der_kind: str,
    bess_operation_mode_refs: list[str] | None = None,
    block_transformer_catalog_ref: str | None = None,
    pf_curve_ref: str | None = None,
) -> DerAudit2Payload:
    """
    Buduje deterministyczny payload audytu 2 dla DER.

    Naprawy:
      - eng.10: bess_operation_modes -> rozwija catalog_refs do pelnych obiektow
      - B.5: block_transformer -> rozwija block-trafo z parametrami uk/Pk/p0
      - eng.9: pf_curve -> rozwija krzywa P(f) z droopem/deadband
    """
    issues: list[str] = []

    # eng.10: BESS modes (multi-select).
    bess_modes_payload: list[dict[str, Any]] = []
    if bess_operation_mode_refs:
        if der_kind != "BESS":
            issues.append(
                f"DER {der_kind} nie obsługuje trybów BESS — pole bess_operation_mode_refs "
                "zostało zignorowane."
            )
        else:
            # Deterministyczne sortowanie po id.
            for ref in sorted(set(bess_operation_mode_refs)):
                mode = get_bess_operation_mode(ref)
                if mode is None:
                    issues.append(f"Nieznany tryb BESS: {ref}")
                else:
                    bess_modes_payload.append(mode.to_dict())

    # B.5: block-trafo (single).
    block_trafo_payload: dict[str, Any] | None = None
    if block_transformer_catalog_ref:
        btr = get_block_transformer(block_transformer_catalog_ref)
        if btr is None:
            issues.append(f"Nieznany block-trafo: {block_transformer_catalog_ref}")
        elif der_kind not in btr.applicable_der_kinds:
            issues.append(
                f"Block-trafo '{btr.id}' nie jest przeznaczony dla DER {der_kind} "
                f"(applicable: {list(btr.applicable_der_kinds)})."
            )
        else:
            block_trafo_payload = btr.to_dict()

    # eng.9: P(f) curve.
    pf_payload: dict[str, Any] | None = None
    if pf_curve_ref:
        pf = get_pf_curve(pf_curve_ref)
        if pf is None:
            issues.append(f"Nieznana krzywa P(f): {pf_curve_ref}")
        else:
            pf_payload = pf.to_dict()

    return DerAudit2Payload(
        der_id=der_id,
        der_kind=der_kind,
        bess_operation_modes=bess_modes_payload,
        block_transformer=block_trafo_payload,
        pf_curve=pf_payload,
        issues=issues,
    )


def build_station_audit2_payload(
    *,
    station_id: str,
    tap_changer_refs: list[str] | None = None,
    der_specs: list[dict[str, Any]] | None = None,
    transformer_tap_changers: dict[str, str] | None = None,
) -> StationAudit2Payload:
    """
    Buduje deterministyczny payload audytu 2 dla stacji + DERs.

    Naprawy:
      - eng.13: tap_changers -> rozwija przelaczniki zaczepow per transformator
      - delegacja do build_der_audit2_payload dla kazdego DER
      - Phase 22: transformer_tap_changers (Dict[transformer_id, tap_changer_ref])
        rozwijany do `transformer_to_tap_changer` mapping (id -> full dict).
    """
    issues_global: list[str] = []

    # eng.13: tap-changers (lista, jeden per transformator).
    tap_changers_payload: list[dict[str, Any]] = []
    for ref in sorted(set(tap_changer_refs or [])):
        tc = get_tap_changer(ref)
        if tc is None:
            issues_global.append(f"Nieznany tap-changer: {ref}")
        else:
            tap_changers_payload.append(tc.to_dict())

    # Phase 22: per-transformer mapping z DB konfiguracji.
    tr_to_tc_payload: dict[str, dict[str, Any]] = {}
    for tr_id, tc_ref in (transformer_tap_changers or {}).items():
        if not tc_ref:
            continue
        tc = get_tap_changer(str(tc_ref))
        if tc is None:
            issues_global.append(f"Nieznany tap-changer dla {tr_id}: {tc_ref}")
        else:
            tr_to_tc_payload[str(tr_id)] = tc.to_dict()

    # DER payloads (delegacja).
    der_payloads: list[DerAudit2Payload] = []
    for spec in sorted(der_specs or [], key=lambda s: s.get("der_id", "")):
        der_payloads.append(
            build_der_audit2_payload(
                der_id=spec["der_id"],
                der_kind=spec["der_kind"],
                bess_operation_mode_refs=spec.get("bess_operation_mode_refs"),
                block_transformer_catalog_ref=spec.get("block_transformer_catalog_ref"),
                pf_curve_ref=spec.get("pf_curve_ref"),
            )
        )

    payload = StationAudit2Payload(
        station_id=station_id,
        tap_changers=tap_changers_payload,
        der_payloads=der_payloads,
        transformer_to_tap_changer=tr_to_tc_payload,
    )

    # Sklonuj issues_global do dict gdy zaszla potrzeba — uzywamy obiektu jak jest.
    return payload


# =============================================================================
# Solver-specific extractors (consumed przez solver_input/builder.py)
# =============================================================================


def extract_solver_extensions_from_payload(
    payload: StationAudit2Payload,
) -> dict[str, Any]:
    """
    Ekstraktuje rozszerzenia dla solver-ow z payloadu audytu 2.

    Zwraca dict z kluczami:
      - sc_iec60909_extensions: dane potrzebne dla short-circuit (block-trafo)
      - power_flow_extensions: dane dla NR PF (tap-changer settings, BESS modes)
      - protection_extensions: dane dla IEC 60255 (P(f) droop, anti-islanding)
    """
    sc_extensions: dict[str, Any] = {}
    pf_extensions: dict[str, Any] = {}
    protection_extensions: dict[str, Any] = {}

    # Power Flow Newton-Raphson: tap-changer settings.
    if payload.tap_changers:
        pf_extensions["tap_changers"] = payload.tap_changers

    # Power Flow + Protection: BESS modes (FCR-N requires reserved capacity, etc.).
    bess_modes_aggregated: list[dict[str, Any]] = []
    pf_curves_aggregated: list[dict[str, Any]] = []
    block_transformers_aggregated: list[dict[str, Any]] = []
    for der in payload.der_payloads:
        for mode in der.bess_operation_modes:
            bess_modes_aggregated.append(
                {
                    "der_id": der.der_id,
                    "mode": mode,
                }
            )
        if der.pf_curve:
            pf_curves_aggregated.append(
                {
                    "der_id": der.der_id,
                    "curve": der.pf_curve,
                }
            )
        if der.block_transformer:
            block_transformers_aggregated.append(
                {
                    "der_id": der.der_id,
                    "transformer": der.block_transformer,
                }
            )

    if bess_modes_aggregated:
        pf_extensions["bess_operation_modes_per_der"] = bess_modes_aggregated
    if pf_curves_aggregated:
        pf_extensions["p_f_curves_per_der"] = pf_curves_aggregated
        protection_extensions["frequency_protection_curves"] = pf_curves_aggregated
    if block_transformers_aggregated:
        sc_extensions["block_transformers"] = block_transformers_aggregated

    # Phase 22: per-transformer mapping (transformer_id -> tap_changer dict).
    if payload.transformer_to_tap_changer:
        pf_extensions["transformer_to_tap_changer"] = dict(payload.transformer_to_tap_changer)

    return {
        "sc_iec60909_extensions": sc_extensions,
        "power_flow_extensions": pf_extensions,
        "protection_extensions": protection_extensions,
    }


class KonfiguracjaAudit2Stacji(Protocol):
    """Kształt zapisanej konfiguracji audytu 2 stacji (wiersz ``station_audit2_configs``).

    Protokół zamiast importu ORM: ``solver_input`` nie zna warstwy persystencji —
    dostaje wiersz od wołającego (repozytorium ``UnitOfWork.audit2_station_configs``).
    """

    station_id: str
    tap_changer_refs: list[Any]
    der_specs: list[dict[str, Any]]
    transformer_tap_changers: dict[str, Any]


def rozszerzenia_audit2_z_konfiguracji(cfg: KonfiguracjaAudit2Stacji) -> dict[str, Any]:
    """Rozszerzenia solverów z zapisanej konfiguracji audytu 2 (CV-4.2b).

    JEDYNA droga ``wiersz konfiguracji → rozszerzenia`` — wspólna dla wykonawcy biegu
    kanonicznego (``enm.canonical_analysis.rozszerzenia_audit2_dla_opcji``), kontraktu
    P11 (``api/solver_input.py``) i końcówki diagnostycznej
    (``api/audit2_station_config.py``). Do tej karty każde z tych miejsc rozwijało
    wiersz osobno (trzy kopie tej samej sekwencji ``build_station_audit2_payload`` +
    ``extract_solver_extensions_from_payload``).
    """
    payload = build_station_audit2_payload(
        station_id=cfg.station_id,
        tap_changer_refs=[str(ref) for ref in (cfg.tap_changer_refs or [])],
        der_specs=list(cfg.der_specs or []),
        transformer_tap_changers={
            str(k): str(v) for k, v in dict(cfg.transformer_tap_changers or {}).items()
        },
    )
    return extract_solver_extensions_from_payload(payload)
