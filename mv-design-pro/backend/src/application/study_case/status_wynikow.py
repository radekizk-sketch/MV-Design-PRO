"""Status wynikow PRZYPADKU obliczeniowego — WYPROWADZANY z jego biegow (CV-2-W).

DLUG, KTORY TEN MODUL ZAMYKA. `StudyCase.result_status` byl POLEM w bazie, a jego
prawdziwosc zalezala od tego, czy kazda sciezka mutujaca model pamietala o
wywolaniu „uniewazniacza”. Pisarzy bylo siedmiu (`ResultInvalidator`,
`StudyCaseService.mark_*`, `case_repository.mark_*`, dwie koncowki
`/invalidate*`, `LifecycleService`, regula OUTDATED w `with_network_snapshot_id`),
a mutujacych sciezek wiecej — wiec luka byla nieunikniona: zmiana typu
katalogowego nie uniewazniala NICZEGO, a przypadek meldowal „wyniki aktualne”
przy modelu, ktory pojechal dalej. Stan, ktorego nikt nie utrzymuje, nie moze
sklamac: status jest odtad FUNKCJA (biegi przypadku × biezaca rewizja modelu ×
odcisk katalogu), liczona na zadanie.

JEDNO ZRODLO PRAWDY. Werdykt liczy `application/result_freshness.py` — DOKLADNIE
ta sama funkcja (`status_wynikow_przypadku` → `swiezosc_biegu_kanonicznego` →
`evaluate_envelope_freshness`), ktora ocenia swiezosc pojedynczego biegu w
nakladce SLD i w liscie biegow. Ten modul jest wylacznie DOSTAWCA WEJSC: pobiera
biegi przypadku (kolumny lekkie) i biezacy stan modelu, nie liczy niczego sam.

ZERO FIZYKI, ZERO INTERPRETACJI: porownywane sa numery rewizji i odciski —
zadnych wielkosci elektrycznych.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any
from uuid import UUID

from application.result_freshness import (
    FreshnessReason,
    FreshnessVerdict,
    ResultFreshness,
    StanBiezacyModelu,
    status_wynikow_przypadku,
)
from infrastructure.persistence.repositories.canonical_run_repository import (
    canonical_run_repository_scope,
)

#: Status biegu, ktory w ogole moze niesc wynik. Bieg QUEUED/RUNNING/FAILED/
#: NOT_COMPUTED nie ma czego uczynic aktualnym — filtrujemy go PRZED ocena, zeby
#: nie dotykac kolumn ciezkich biegow, ktore i tak dostalyby status NONE.
STATUS_BIEGU_Z_WYNIKIEM = "FINISHED"


def werdykt_statusu_przypadku(
    case_id: UUID | str, uow_factory: Callable[[], Any] | None
) -> FreshnessVerdict:
    """Werdykt swiezosci WYNIKOW PRZYPADKU: status + przyczyna + lista zmian.

    NONE — przypadek nie ma zadnego zakonczonego biegu z wynikiem; FRESH — co
    najmniej jeden bieg z wynikiem jest aktualny wobec biezacego modelu i
    katalogu; OUTDATED — sa wyniki, ale zaden nie jest aktualny (werdykt niesie
    wtedy rewizje biegu, rewizje biezaca i LISTE ZMIAN z dziennika, czyli
    odpowiedz na pytanie „ktora zmiana uniewaznila wynik”).

    Dla NONE nie ma biegu rozstrzygajacego, wiec werdykt powstaje z tego samego
    kodu przyczyny, ktorego uzywa ocena pojedynczego biegu bez wyniku
    (`BRAK_WYNIKU`), i niesie biezaca rewizje modelu — ekran ma co pokazac, zanim
    cokolwiek policzono.
    """
    referencja = str(case_id)
    stan = StanBiezacyModelu.dla_przypadku(referencja, uow_factory)
    with canonical_run_repository_scope() as repozytorium:
        biegi = [
            bieg
            for bieg in repozytorium.list_by_case(referencja)
            if bieg.status == STATUS_BIEGU_Z_WYNIKIEM
        ]
    status, werdykt = status_wynikow_przypadku(biegi, stan)
    if werdykt is not None:
        return werdykt
    return FreshnessVerdict(
        status,
        FreshnessReason.BRAK_WYNIKU,
        rewizja_biezaca=stan.rewizja,
    )


def pola_statusu_przypadku(
    case_id: UUID | str, uow_factory: Callable[[], Any] | None
) -> dict[str, Any]:
    """Pola statusu wynikow doklejane do KAZDEJ odpowiedzi API z przypadkiem.

    Ksztalt jest ten sam co w nakladkach (`FreshnessVerdict.to_overlay_fields`),
    powiekszony o `results_valid` — jawna flage kontraktu HTTP wyprowadzona z tego
    SAMEGO statusu (nie z drugiego warunku, ktory „dzis sie zgadza”).
    """
    werdykt = werdykt_statusu_przypadku(case_id, uow_factory)
    pola = werdykt.to_overlay_fields()
    pola["results_valid"] = werdykt.status == ResultFreshness.FRESH
    return pola
