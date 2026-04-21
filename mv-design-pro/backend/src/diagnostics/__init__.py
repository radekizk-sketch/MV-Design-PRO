"""
Moduł diagnostyki inżynierskiej ENM (v4.2).

Silnik diagnostyczny analizuje model sieci (ENM) i wykrywa
błędy projektowe, niespójności parametrów oraz ograniczenia
dostępnych analiz — BEZ mutacji modelu.

Komponenty:
- engine: DiagnosticEngine — główny silnik diagnostyczny
- models: Modele danych (DiagnosticReport, DiagnosticIssue, AnalysisMatrix)
- rules: Reguły diagnostyczne E-Dxx (BLOCKER/WARN/INFO)
- preflight: Pre-flight checks — macierz dostępności analiz
- diff: Porównanie rewizji ENM (deterministyczny diff)
"""

from .engine import DiagnosticEngine
from .models import (
    AnalysisAvailability,
    AnalysisMatrix,
    AnalysisType,
    DiagnosticIssue,
    DiagnosticReport,
    DiagnosticSeverity,
    DiagnosticStatus,
)

__all__ = [
    "AnalysisAvailability",
    "AnalysisMatrix",
    "AnalysisType",
    "DiagnosticEngine",
    "DiagnosticIssue",
    "DiagnosticReport",
    "DiagnosticSeverity",
    "DiagnosticStatus",
]
