"""Odcisk analizy nie moze zalezec od zegara ani od etykiet (V12K-269).

TEST, KTOREGO BRAKOWALO. Wszystkie istniejace testy determinizmu odciskow
budowaly kontekst przez wspolne `_ctx()` ze STALYM znacznikiem czasu, wiec
sprawdzaly niezaleznosc od KOLEJNOSCI danych, a nigdy niezaleznosc od CZASU.
Skutek byl mierzalny: ta sama analiza tej samej sieci dawala inny
`analysis_id` przy kazdym uruchomieniu, czyli odcisk nie odpowiadal na jedyne
pytanie, do ktorego sluzy — „czy to jest ta sama analiza".
"""

from __future__ import annotations

from datetime import UTC, datetime

from analysis.coverage_score.models import CoverageScoreContext, compute_coverage_id
from analysis.grid_strength.models import GridStrengthContext, compute_grid_strength_id
from analysis.odcisk_kontekstu import POLA_PROWENIENCJI, odcisk_kontekstu
from analysis.sensitivity.models import SensitivityContext, compute_sensitivity_id


def _kontekst(
    *,
    czas: datetime,
    projekt: str = "Projekt A",
    przypadek: str = "Wariant bazowy",
    snapshot: str = "snap-1",
) -> SensitivityContext:
    return SensitivityContext(
        project_name=projekt,
        case_name=przypadek,
        run_timestamp=czas,
        snapshot_id=snapshot,
        trace_id="artefakt-1",
    )


class TestOdciskNieZalezyOdProweniencji:
    def test_ten_sam_wynik_policzony_pozniej_ma_TEN_SAM_odcisk(self):
        wczesniej = _kontekst(czas=datetime(2026, 1, 1, tzinfo=UTC))
        pozniej = _kontekst(czas=datetime(2026, 7, 28, tzinfo=UTC))

        assert compute_sensitivity_id(wczesniej, 10.0, []) == compute_sensitivity_id(
            pozniej, 10.0, []
        ), "zegar scienny nie jest wejsciem analizy — nie moze zmieniac jej odcisku"

    def test_zmiana_nazwy_projektu_nie_zmienia_odcisku(self):
        przed = _kontekst(czas=datetime(2026, 1, 1, tzinfo=UTC), projekt="GPZ Polnoc")
        po = _kontekst(czas=datetime(2026, 1, 1, tzinfo=UTC), projekt="GPZ Polnoc (rew. 2)")

        assert compute_sensitivity_id(przed, 10.0, []) == compute_sensitivity_id(po, 10.0, [])

    def test_INNA_MIGAWKA_MODELU_daje_INNY_odcisk(self):
        """Kierunek odwrotny — odcisk musi rozroznic dwie rozne sieci."""
        a = _kontekst(czas=datetime(2026, 1, 1, tzinfo=UTC), snapshot="snap-1")
        b = _kontekst(czas=datetime(2026, 1, 1, tzinfo=UTC), snapshot="snap-2")

        assert compute_sensitivity_id(a, 10.0, []) != compute_sensitivity_id(b, 10.0, [])

    def test_zmiana_parametru_analizy_nadal_zmienia_odcisk(self):
        ctx = _kontekst(czas=datetime(2026, 1, 1, tzinfo=UTC))

        assert compute_sensitivity_id(ctx, 10.0, []) != compute_sensitivity_id(ctx, 20.0, [])


class TestRzutKoperty:
    def test_rzut_usuwa_dokladnie_pola_proweniencji(self):
        ctx = _kontekst(czas=datetime(2026, 1, 1, tzinfo=UTC))

        rzut = odcisk_kontekstu(ctx)

        assert rzut is not None
        assert set(rzut) == set(ctx.to_dict()) - POLA_PROWENIENCJI
        assert rzut["snapshot_id"] == "snap-1"
        assert rzut["trace_id"] == "artefakt-1"

    def test_brak_koperty_to_None_a_nie_pusty_slownik(self):
        """Brak kontekstu i kontekst pusty to dwa rozne stany."""
        assert odcisk_kontekstu(None) is None

    def test_pelna_koperta_zostaje_nietknieta_w_serializacji(self):
        """Proweniencja znika z ODCISKU, nie z odpowiedzi — raport nadal ja widzi."""
        ctx = _kontekst(czas=datetime(2026, 1, 1, tzinfo=UTC))

        dane = ctx.to_dict()

        assert dane["run_timestamp"] == "2026-01-01T00:00:00+00:00"
        assert dane["project_name"] == "Projekt A"
        assert dane["case_name"] == "Wariant bazowy"


class TestPozostaleAnalizyMajaTaSamaWlasciwosc:
    """Odcisk liczy dziewiec analiz — regula musi obowiazywac w kazdej."""

    def test_coverage_score(self):
        def ctx(czas: datetime) -> CoverageScoreContext:
            return CoverageScoreContext(
                project_name="P",
                case_name="C",
                run_timestamp=czas,
                snapshot_id="snap-1",
                trace_id="art-1",
            )

        assert compute_coverage_id(
            ctx(datetime(2026, 1, 1, tzinfo=UTC)), 0.85, [], []
        ) == compute_coverage_id(ctx(datetime(2026, 7, 28, tzinfo=UTC)), 0.85, [], [])

    def test_grid_strength(self):
        def ctx(czas: datetime) -> GridStrengthContext:
            return GridStrengthContext(
                project_name="P",
                case_name="C",
                case_id=None,
                run_timestamp=czas,
                snapshot_hash="snap-1",
                run_id="bieg-1",
            )

        assert compute_grid_strength_id(
            ctx(datetime(2026, 1, 1, tzinfo=UTC)), 3.0, 2.0, []
        ) == compute_grid_strength_id(ctx(datetime(2026, 7, 28, tzinfo=UTC)), 3.0, 2.0, [])
