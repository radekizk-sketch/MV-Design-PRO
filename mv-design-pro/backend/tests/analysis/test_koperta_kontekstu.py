"""Jawny przepis koperty kontekstu — kopia GŁOŚNA zamiast getattr z domyślną.

DLACZEGO TEN TEST ISTNIEJE (domknięcie granicy V12K-267). Konteksty łańcucha
dowodowo-raportowego były kopiowane przez ``getattr(ctx, "pole", None)`` w pięciu
builderach i w raporcie PDF. Częściowe przemianowanie pola w JEDNYM ogniwie nie
zapalało wtedy żadnego błędu — kopia po cichu podstawiała ``None`` i identyfikator
znikał z raportów bez śladu. Po zamianie na ``pola_koperty`` (dostęp bezpośredni)
ten tryb awarii ma być NIEMOŻLIWY — i to jest właściwość, którą ten plik mierzy,
a nie sama poprawność kopii.

WSTRZYKNIĘTA REGRESJA (wykonana przy budowie karty): przywrócenie
``getattr(ctx, "run_id", None)`` w ``pola_koperty`` czyni
``test_kontekst_bez_pola_wybucha_a_nie_milczy`` czerwonym — bramka gryzie.
"""

from __future__ import annotations

import dataclasses
from datetime import UTC, datetime

import pytest
from analysis.coverage_score.models import CoverageScoreContext
from analysis.koperta_kontekstu import pola_koperty
from analysis.lf_sensitivity.models import LFSensitivityContext
from analysis.normative.models import NormativeContext
from analysis.protection_curves_it.models import ProtectionCurvesITContext
from analysis.protection_insight.models import ProtectionInsightContext
from analysis.recommendations.models import RecommendationContext
from analysis.reporting.pdf.p24_plus_report import ReportContext
from analysis.sensitivity.models import SensitivityContext
from analysis.voltage_profile.models import VoltageProfileContext

#: Sześć pól koperty — jedyny kształt, jaki przepis ma prawo znać.
POLA_KOPERTY = {
    "project_name",
    "case_name",
    "run_timestamp",
    "snapshot_id",
    "trace_id",
    "run_id",
}

#: Wszystkie ogniwa łańcucha + kontekst raportu PDF. Nowe ogniwo dopisuje się tutaj.
OGNIWA_LANCUCHA = (
    VoltageProfileContext,
    NormativeContext,
    ProtectionInsightContext,
    ProtectionCurvesITContext,
    CoverageScoreContext,
    SensitivityContext,
    LFSensitivityContext,
    RecommendationContext,
    ReportContext,
)


def _kontekst_zrodlowy() -> VoltageProfileContext:
    return VoltageProfileContext(
        project_name="Projekt A",
        case_name="Wariant zimowy",
        run_timestamp=datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC),
        snapshot_id="snap-001",
        trace_id="trace_load_flow_abc123",
        run_id="8f3c2a1b-9d4e-4f6a-b7c8-0123456789ab",
    )


def test_przepis_kopiuje_wszystkie_pola_1do1():
    zrodlo = _kontekst_zrodlowy()

    kopia = SensitivityContext(**pola_koperty(zrodlo))

    for pole in POLA_KOPERTY:
        assert getattr(kopia, pole) == getattr(zrodlo, pole), pole


def test_kontekst_bez_pola_wybucha_a_nie_milczy():
    """Właściwość, dla której karta powstała: brak pola = wybuch w miejscu kopii.

    Kontekst „po częściowym przemianowaniu" (run_id → identyfikator_biegu)
    symuluje dokładnie tę awarię, którą getattr z domyślną zamieniał w ciche
    None. Przepis MUSI podnieść AttributeError — nigdy oddać słownika bez pola.
    """

    class KontekstPoPrzemianowaniu:
        project_name = "Projekt A"
        case_name = None
        run_timestamp = None
        snapshot_id = "snap-001"
        trace_id = "trace-001"
        # run_id celowo NIE istnieje

    with pytest.raises(AttributeError):
        pola_koperty(KontekstPoPrzemianowaniu())  # type: ignore[arg-type]


def test_kazde_ogniwo_lancucha_ma_komplet_pol_koperty():
    """Przesłanka przepisu: każde ogniwo niesie DOKŁADNIE komplet pól koperty.

    Gdy ktoś przemianuje pole w jednym ogniwie, ten test wskazuje klasę po
    imieniu — zanim jakikolwiek builder zdąży wykonać kopię.
    """
    for ogniwo in OGNIWA_LANCUCHA:
        nazwy = {f.name for f in dataclasses.fields(ogniwo)}
        assert (
            POLA_KOPERTY <= nazwy
        ), f"{ogniwo.__name__} nie niesie pól: {sorted(POLA_KOPERTY - nazwy)}"


def test_przepis_przyjmuje_kazde_ogniwo_lancucha():
    """Kopia działa z każdego ogniwa, nie tylko z VoltageProfileContext."""
    wzor = pola_koperty(_kontekst_zrodlowy())
    for ogniwo in OGNIWA_LANCUCHA:
        instancja = ogniwo(**wzor)
        assert pola_koperty(instancja) == wzor, ogniwo.__name__
