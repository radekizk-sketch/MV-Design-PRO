"""
Proof Inspector — P11.1d Read-Only Viewer & Export

STATUS: CANONICAL & BINDING
Reference: P11_1d_PROOF_UI_EXPORT.md

Warstwa przegladu, audytu i eksportu dowodow P11.
Read-only: brak mutacji, brak logiki decyzyjnej.
Inspector NIE generuje dowodow — tylko je prezentuje.

Funkcje:
- Lista krokow dowodu (kolejnosc deterministyczna)
- Podglad: wzor -> dane -> podstawienie -> wynik -> jednostki
- Widoczny mapping_key dla kazdej wielkosci
- Tryb A/B (jesli ProofDocument counterfactual)

Eksporty:
- proof.json (kanoniczny, deterministyczny)
- proof.tex (LaTeX-only, $$...$$)
- proof.pdf (jesli pipeline istnieje)
"""

from application.proof_engine.proof_inspector.exporters import (
    ExportResult,
    InspectorExporter,
    export_to_json,
    export_to_pdf,
    export_to_tex,
    is_pdf_export_available,
)
from application.proof_engine.proof_inspector.inspector import (
    ProofInspector,
    inspect,
)
from application.proof_engine.proof_inspector.types import (
    CounterfactualRow,
    CounterfactualView,
    HeaderView,
    InspectorView,
    ProtectionComparisonRow,
    ProtectionComparisonView,
    StepView,
    SummaryView,
    UnitCheckView,
    ValueView,
)

__all__ = [
    # Types
    "CounterfactualRow",
    "CounterfactualView",
    "HeaderView",
    "InspectorView",
    "ProtectionComparisonRow",
    "ProtectionComparisonView",
    "StepView",
    "SummaryView",
    "UnitCheckView",
    "ValueView",
    # Inspector
    "ProofInspector",
    "inspect",
    # Exporters
    "ExportResult",
    "InspectorExporter",
    "export_to_json",
    "export_to_pdf",
    "export_to_tex",
    "is_pdf_export_available",
]
