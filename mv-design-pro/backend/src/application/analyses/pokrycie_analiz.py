"""Serwis aplikacyjny: pokrycie analizami przypadku obliczeniowego.

Warstwa APPLICATION (mapowanie, NIE fizyka). Dla wskazanego przypadku
obliczeniowego składa wejścia gotowego buildera ``analysis/coverage_score``
z tego, co FAKTYCZNIE istnieje w magazynie biegów:

- najnowszy zakończony przebieg rozpływu (``PF``) → dowód spadków napięć,
  profil napięć, wrażliwość i rekomendacje (przepis wspólny z
  ``wrazliwosc_rozplywu.py`` — jedno źródło składania),
- raport normatywny → ``NormativeEvaluator`` na dostępnych dowodach
  (pozycje bez dowodu uczciwie NIEOBLICZONE — zero fabrykacji),
- najnowszy zakończony bieg oceny zabezpieczeń (``protection_sn``) → dowód uziemienia
  każdej stacji SN (prąd i napięcie uziomowe z solvera doziemień SN, PN-EN 50522 tablica 1;
  ``application/proof_engine/packs/earthing_ground_fault_sn.py``) — jedna ścieżka prądu
  uziomowego, ta sama, którą bieg ocenia uziemienia i zabezpieczenia ziemnozwarciowe,
- analiza zabezpieczeń i krzywe I–t → ``None``: widoki ``ProtectionInsightView`` /
  ``ProtectionCurvesITView`` nie są produkowane z żadnego przebiegu kanonicznego (uczciwy
  brak, obniża wynik).

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
from application.nazwy_biegu import nazwa_projektu_z_migawki
from application.proof_engine.packs.earthing_ground_fault_sn import dowody_uziemien_biegu
from enm.canonical_analysis import CanonicalRun, list_runs_for_case


def _najnowszy_zakonczony(biegi: list[CanonicalRun], rodzaj: str) -> CanonicalRun | None:
    zakonczone = [
        bieg for bieg in biegi if bieg.analysis_type == rodzaj and bieg.status == "FINISHED"
    ]
    if not zakonczone:
        return None
    return max(zakonczone, key=lambda bieg: (bieg.created_at, str(bieg.id)))


def _dowody_uziemien(bieg: CanonicalRun, *, nazwa_przypadku: str) -> list[Any]:
    """Dowody uziemień stacji z zapisanego wyniku biegu oceny zabezpieczeń (bez przeliczania)."""
    wynik = (bieg.raw_result or {})["protection_result"]
    ziemne = wynik.get("ziemnozwarciowe")
    if ziemne is None:
        return []
    return dowody_uziemien_biegu(
        ziemne,
        run_id=str(bieg.id),
        project_name=nazwa_projektu_z_migawki(bieg.snapshot),
        case_name=nazwa_przypadku,
        run_timestamp=bieg.finished_at or bieg.created_at,
        solver_version=str((ziemne.get("doziemienie") or {}).get("wersja_solvera") or "—"),
    )


def build_pokrycie_view(case_id: str, *, nazwa_przypadku: str) -> dict[str, Any]:
    """Zbuduj widok pokrycia analizami dla przypadku obliczeniowego.

    ``nazwa_przypadku`` — nazwa przypadku z bazy (granica API) do nagłówka dowodu
    spadków napięć, który widok ocenia (karta #144).
    """
    biegi = list_runs_for_case(case_id)
    bieg_pf = _najnowszy_zakonczony(biegi, "PF")
    bieg_ochrony = _najnowszy_zakonczony(biegi, "protection_sn")

    dowody: list[Any] = []
    profil = None
    raport_normatywny = None
    wrazliwosc = None
    rekomendacje = None

    if bieg_pf is not None:
        # Wrażliwość i rekomendacje rozpływu czytają WYŁĄCZNIE dowód rozpływu i jego raport
        # normatywny (kontekst widoku = bieg rozpływu, nie bieg zabezpieczeń).
        dowod, profil, _graf = _zloz_widoki(bieg_pf, nazwa_przypadku=nazwa_przypadku)
        raport_pf = NormativeEvaluator().evaluate([dowod], NormativeConfig())
        wrazliwosc = SensitivityBuilder().build([dowod], raport_pf, profil, None, None)
        rekomendacje = RecommendationBuilder().build(
            proofs=[dowod],
            sensitivity=wrazliwosc,
            normative_report=raport_pf,
            voltage_profile=profil,
            protection_insight=None,
            protection_curves_it=None,
        )
        dowody.append(dowod)
        raport_normatywny = raport_pf
    if bieg_ochrony is not None:
        dowody_uziemien = _dowody_uziemien(bieg_ochrony, nazwa_przypadku=nazwa_przypadku)
        if dowody_uziemien:
            dowody.extend(dowody_uziemien)
            raport_normatywny = NormativeEvaluator().evaluate(dowody, NormativeConfig())

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
        "protection_run_id": str(bieg_ochrony.id) if bieg_ochrony is not None else None,
        "pokrycie": widok.to_dict(),
    }
