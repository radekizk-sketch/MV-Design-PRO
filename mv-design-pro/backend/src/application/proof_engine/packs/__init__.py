"""
Proof Packs — Pakiety dowodowe

STATUS: CANONICAL & BINDING
Reference: AGENTS.md, PROOF_SCHEMAS.md

Pakiety dowodowe:
- P14: Power Flow Verification (convergence, balance)
- P15: Operating Current (load currents, overload) - w proof_generator.py
- P16: Losses Proof (P, Q losses)
- P17: Voltage Drop (VDROP) — standalone pack: vdrop.py (2026-05, V12K-015)
- P18: Branch Loading - w proof_generator.py (Protection)
- P19 (uziemienie / doziemienie SN) skasowany w karcie UX-04/POLE-ZU-SKLADOWA-ZEROWA
  (commit 5): pakiet bez producenta, liczył fizykę w silniku dowodów (I_E = U_0/Z_E,
  U_d = I_u·R_u „uproszczone”) i dublował dowód bezpieczeństwa uziomu V12.6
  (EN 50522 tab. 1 + napięcia rażeniowe, ślad White Box biegu `earthing_safety`)
- SC Asymmetrical: 1F-Z, 2F, 2F-Z (§4.1 blocker resolution)
- SC3F (symmetrical): zwarcie trójfazowe + rozbicie maszynowe μ/q/i_b (G-SCM F2, V12K-054)
- Protection Settings: I>/I>> (Hoppel method, IRiESD)
- Q(U) Regulation: NC RfG compliance
"""

from application.proof_engine.packs.p14_power_flow import (
    P14PowerFlowInput,
    P14PowerFlowProof,
)
from application.proof_engine.packs.p16_losses import (
    P16LossesInput,
    P16LossesProof,
)
from application.proof_engine.packs.protection_settings import (
    ProtectionSettingsProofInput,
    ProtectionSettingsProofPack,
    ProtectionSettingsProofResult,
)
from application.proof_engine.packs.sc_asymmetrical import (
    SCAsymmetricalPackInput,
    SCAsymmetricalPackResult,
    SCAsymmetricalProofPack,
)
from application.proof_engine.packs.sc_symmetrical import (
    SC3FPackInput,
    SC3FPackResult,
    SC3FProofPack,
)
from application.proof_engine.packs.vdrop import (
    VDROPPackInput,
    VDROPPackSegment,
    VDROPPackTransformerBoundary,
    generate_vdrop_pack,
    serialize_vdrop_pack,
)

__all__ = [
    "P14PowerFlowInput",
    "P14PowerFlowProof",
    "P16LossesInput",
    "P16LossesProof",
    "SCAsymmetricalPackInput",
    "SCAsymmetricalPackResult",
    "SCAsymmetricalProofPack",
    "SC3FPackInput",
    "SC3FPackResult",
    "SC3FProofPack",
    "ProtectionSettingsProofInput",
    "ProtectionSettingsProofPack",
    "ProtectionSettingsProofResult",
    # VDROP pack (V12K-015, 2026-05; łańcuch multi-segment: karta P0.5b, 2026-08-13)
    "VDROPPackInput",
    "VDROPPackSegment",
    "VDROPPackTransformerBoundary",
    "generate_vdrop_pack",
    "serialize_vdrop_pack",
]
