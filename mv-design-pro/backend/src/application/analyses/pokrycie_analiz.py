"""Serwis aplikacyjny: pokrycie analizami przypadku obliczeniowego.

Warstwa APPLICATION (mapowanie, NIE fizyka). Dla wskazanego przypadku
obliczeniowego składa wejścia gotowego buildera ``analysis/coverage_score``
z tego, co FAKTYCZNIE istnieje w magazynie biegów:

- najnowszy zakończony przebieg rozpływu (``PF``) → dowód spadków napięć,
  profil napięć, wrażliwość i rekomendacje (przepis wspólny z
  ``wrazliwosc_rozplywu.py`` — jedno źródło składania),
- raport normatywny → ``NormativeEvaluator`` na dostępnych dowodach
  (pozycje bez dowodu uczciwie NIEOBLICZONE — zero fabrykacji),
- analiza zabezpieczeń i krzywe I–t → ``None``: dowody zabezpieczeniowe nie
  są produkowane z żadnego przebiegu kanonicznego (uczciwy brak, obniża wynik).

Wynik (``CoverageScoreView``): łączna punktacja 0–100, lista braków po polsku
(``missing_items``) i luki krytyczne (``critical_gaps``). Widok mówi wprost,
CZEGO w pakiecie analiz przypadku brakuje — to jest jego rola; nie udaje, że
brakujące pakiety istnieją.

Bez żadnego zakończonego przebiegu rozpływu widok również powstaje — wszystkie
pozycje są wtedy brakami (uczciwy stan zerowy dla świeżego przypadku).
"""

from __future__ import annotations

from typing import Any

from analysis.coverage_score.builder import CoverageScoreBuilder
from analysis.normative.evaluator import NormativeEvaluator
from analysis.normative.models import NormativeConfig
from analysis.recommendations.builder import RecommendationBuilder
from analysis.sensitivity.builder import SensitivityBuilder
from application.analyses.wrazliwosc_rozplywu import _zloz_widoki
from enm.canonical_analysis import CanonicalRun, list_runs_for_case


def _najnowszy_zakonczony_pf(biegi: list[CanonicalRun]) -> CanonicalRun | None:
    zakonczone = [
        bieg for bieg in biegi if bieg.analysis_type == "PF" and bieg.status == "FINISHED"
    ]
    if not zakonczone:
        return None
    return max(zakonczone, key=lambda bieg: (bieg.created_at, str(bieg.id)))


def build_pokrycie_view(case_id: str) -> dict[str, Any]:
    """Zbuduj widok pokrycia analizami dla przypadku obliczeniowego."""
    biegi = list_runs_for_case(case_id)
    bieg_pf = _najnowszy_zakonczony_pf(biegi)

    dowody = []
    profil = None
    raport_normatywny = None
    wrazliwosc = None
    rekomendacje = None

    if bieg_pf is not None:
        dowod, profil, _graf = _zloz_widoki(bieg_pf)
        dowody = [dowod]
        raport_normatywny = NormativeEvaluator().evaluate(dowody, NormativeConfig())
        wrazliwosc = SensitivityBuilder().build(dowody, raport_normatywny, profil, None, None)
        rekomendacje = RecommendationBuilder().build(
            proofs=dowody,
            sensitivity=wrazliwosc,
            normative_report=raport_normatywny,
            voltage_profile=profil,
            protection_insight=None,
            protection_curves_it=None,
        )

    widok = CoverageScoreBuilder().build(
        proof_documents=dowody,
        normative_report=raport_normatywny,
        voltage_profile=profil,
        protection_insight=None,
        protection_curves_it=None,
        sensitivity=wrazliwosc,
        recommendations=rekomendacje,
    )

    return {
        "case_id": case_id,
        "run_id": str(bieg_pf.id) if bieg_pf is not None else None,
        "pokrycie": widok.to_dict(),
    }
