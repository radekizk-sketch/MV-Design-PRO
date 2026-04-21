"""Protection Settings Engine — automatyczny dobór nastaw zabezpieczeń nadprądowych."""

from .engine import (
    DelayedSettings,
    InstantaneousSettings,
    ProtectionSettingsEngine,
    ProtectionSettingsInput,
    ProtectionSettingsResult,
    SPZAnalysisResult,
    ThermalWithstandResult,
)

__all__ = [
    "ProtectionSettingsEngine",
    "ProtectionSettingsInput",
    "ProtectionSettingsResult",
    "DelayedSettings",
    "InstantaneousSettings",
    "ThermalWithstandResult",
    "SPZAnalysisResult",
]
