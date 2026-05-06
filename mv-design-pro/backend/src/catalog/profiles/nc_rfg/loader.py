"""NC RfG profile loader — czyta YAML z 5 profili operatorów (PR-9).

Używany przez compliance_checker (PR-16) i UI konfiguratora DER (PR-9/10/11).
"""

from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import BaseModel, Field

PROFILE_DIR = Path(__file__).parent
SUPPORTED_OPERATORS = ["pse", "energa", "tauron", "enea", "pge"]


class NcRfgModuleType(BaseModel):
    """Kategoria modułu wytwórczego (NC RfG art. 5)."""

    id: str  # "A" | "B" | "C" | "D"
    threshold_kw_min: float
    threshold_kw_max: float | None = None
    voltage_kv_max: float | None = None
    description_pl: str


class NcRfgFrequencyResponse(BaseModel):
    steady_state_hz_min: float
    steady_state_hz_max: float
    transient_hz_min: float
    transient_hz_max: float
    pf_droop_percent: float
    dead_band_hz: float
    ramp_rate_pct_per_min: float


class NcRfgReactivePower(BaseModel):
    q_range_pct_pn_min: float
    q_range_pct_pn_max: float
    cos_phi_min: float
    voltage_control_modes: list[str] = Field(default_factory=list)


class NcRfgRideThroughPoint(BaseModel):
    time_s: float
    voltage_pu: float


class NcRfgVoltageLevels(BaseModel):
    lvrt: list[NcRfgRideThroughPoint] = Field(default_factory=list)
    hvrt: list[NcRfgRideThroughPoint] = Field(default_factory=list)


class NcRfgPRecovery(BaseModel):
    required_for_modules: list[str] = Field(default_factory=list)
    p_recovery_time_s: float = 1.0
    p_recovery_rate_pct_per_s: float = 80.0


class NcRfgComplianceTest(BaseModel):
    id: str
    name_pl: str


class NcRfgProfile(BaseModel):
    """Pełen profil wymagań przyłączeniowych operatora (NC RfG)."""

    operator_id: str
    operator_name_pl: str
    voltage_level_pl: str
    last_revision: str
    module_types: list[NcRfgModuleType]
    frequency_response: NcRfgFrequencyResponse
    reactive_power: NcRfgReactivePower
    voltage_levels: NcRfgVoltageLevels
    p_recovery_after_fault: NcRfgPRecovery
    compliance_tests: list[NcRfgComplianceTest]

    def classify_module(
        self, p_max_kw: float, voltage_kv: float
    ) -> NcRfgModuleType | None:
        """Klasyfikuje moduł wytwórczy do kategorii A/B/C/D."""
        for mt in self.module_types:
            if p_max_kw < mt.threshold_kw_min:
                continue
            if mt.threshold_kw_max is not None and p_max_kw >= mt.threshold_kw_max:
                continue
            if mt.voltage_kv_max is not None and voltage_kv > mt.voltage_kv_max:
                continue
            return mt
        # Highest tier (D) — bez górnego limitu
        return self.module_types[-1] if self.module_types else None


class NcRfgProfileLoader:
    """Lazy loader profili NC RfG z dyskuf YAML."""

    def __init__(self, profile_dir: Path | None = None) -> None:
        self._profile_dir = profile_dir or PROFILE_DIR
        self._cache: dict[str, NcRfgProfile] = {}

    def load(self, operator_id: str) -> NcRfgProfile:
        if operator_id in self._cache:
            return self._cache[operator_id]
        path = self._profile_dir / f"{operator_id}.yaml"
        if not path.exists():
            available = ", ".join(SUPPORTED_OPERATORS)
            raise FileNotFoundError(
                f"Profil NC RfG dla operatora '{operator_id}' nie istnieje. "
                f"Obsługiwane operatory: {available}"
            )
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        profile = NcRfgProfile.model_validate(data)
        self._cache[operator_id] = profile
        return profile

    def list_available(self) -> list[str]:
        """Lista dostępnych operatorów (po YAML files w katalogu)."""
        return sorted(
            p.stem for p in self._profile_dir.glob("*.yaml") if p.stem in SUPPORTED_OPERATORS
        )


_default_loader = NcRfgProfileLoader()


def load_nc_rfg_profile(operator_id: str) -> NcRfgProfile:
    return _default_loader.load(operator_id)


def list_available_operators() -> list[str]:
    return _default_loader.list_available()
