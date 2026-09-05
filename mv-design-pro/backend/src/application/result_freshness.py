"""Swiezosc wyniku wzgledem modelu — JEDNO zrodlo prawdy dla WSZYSTKICH nakladek.

DLUG, KTORY TEN MODUL ZAMYKA (K-S). Trzy koncowki nakladek SLD obiecywaly
projektantowi status FRESH/OUTDATED/NONE i ZADNA go nie liczyla:

  1. `api/protection_runs.py` — nakladka zabezpieczen meldowala `"FRESH"`
     LITERALEM (komentarz „For now, assume FRESH if run is FINISHED"),
  2. `api/canonical_run_views.py` — nakladka biegu kanonicznego oddawala
     `run.result_status`, czyli pole o wartosci domyslnej `"VALID"`, ktorego
     NIKT w calym repo nigdy nie zmienial (pomiar: brak przypisania innej
     wartosci poza odczytem z bazy) — do tego w innym slowniku niz ten, ktorego
     szuka konsument (`ui/results-inspector/SldOverlay.tsx` porownuje z
     `'OUTDATED'`, wiec baner „Wyniki nieaktualne" nie mogl zapalic sie nigdy),
  3. `api/analysis_runs.py` — koncowka `/analysis-runs/{id}/overlay` status
     WYRZUCALA z odpowiedzi, wiec klient (`ui/results-inspector/api.ts`)
     dopisywal sobie `result_status: 'VALID'` z palca.

Skutek dla projektanta byl w kazdym z trzech przypadkow ten sam: wynik policzony
na modelu sprzed edycji prezentowal sie jak wynik aktualny. To jest gorsze niz
brak statusu, bo wylacza czujnosc.

MECHANIZM (zadnej nowej fizyki, zadnych heurystyk). Odcisk modelu to ten SAM
`compute_enm_hash`, ktorym `enm/canonical_analysis.create_run` znakuje kazdy
bieg (`CanonicalRun.snapshot_hash`). Status powstaje z POROWNANIA odciskow:
zapisanego przy biegu z odciskiem modelu biezacego. `current_model_hash` jest
JEDYNYM wejsciem do „odcisku modelu biezacego" w calym systemie — strona
zapisujaca odcisk przy biegu i strona oceniajaca swiezosc wolaja DOKLADNIE te
sama funkcje (regula predykatow parami: warunek wejscia i wyjscia z jednego
zrodla prawdy).

UCZCIWOSC PRZY BRAKU DANYCH. Bieg zapisany zanim odcisk zaczal byc utrwalany
(albo bieg zwarciowy spoza kanalu kanonicznego) NIE MA kotwicy — i wtedy status
NIE MOZE brzmiec FRESH. Taki przypadek dostaje OUTDATED z kodem przyczyny
nazywajacym stan wprost („nie da sie potwierdzic"), a nie zgadnieta aktualnosc.
Brak wyniku to osobny stan (NONE), niezalezny od modelu.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from application.twin_key import klucz_twin_dla_przypadku
from enm.hash import compute_enm_hash
from enm.klucz_twin import PrzypadekBezProjektuError
from enm.store import get_enm, has_enm


class ResultFreshness(StrEnum):
    """Slownik statusu wyniku nakladki (kontrakt: NONE / FRESH / OUTDATED)."""

    NONE = "NONE"
    FRESH = "FRESH"
    OUTDATED = "OUTDATED"


class FreshnessReason(StrEnum):
    """Kod przyczyny statusu — stabilny, maszynowy (bez diakrytykow)."""

    BRAK_WYNIKU = "brak-wyniku"
    BRAK_MODELU_BIEZACEGO = "brak-modelu-biezacego"
    BRAK_ODCISKU_W_BIEGU = "brak-odcisku-modelu-w-biegu"
    MODEL_ZMIENIONY = "model-zmieniony"
    MODEL_NIEZMIENIONY = "model-niezmieniony"


# Zdanie dla projektanta — po polsku, JEDNO na kod przyczyny. Kazdy kod ma tu
# wpis (pin: `test_kazdy_kod_przyczyny_ma_zdanie_pl`), zeby nie dalo sie dodac
# przyczyny bez tekstu i oddac uzytkownikowi surowego kodu.
REASON_TEXTS_PL: dict[FreshnessReason, str] = {
    FreshnessReason.BRAK_WYNIKU: (
        "Brak zapisanego wyniku dla tego przebiegu — nie ma czego nałożyć na schemat."
    ),
    FreshnessReason.BRAK_MODELU_BIEZACEGO: (
        "Bieżący model przypadku jest niedostępny — nie da się potwierdzić, "
        "że wynik odpowiada modelowi."
    ),
    FreshnessReason.BRAK_ODCISKU_W_BIEGU: (
        "Przebieg zapisano bez odcisku modelu — nie da się potwierdzić, "
        "że wynik odpowiada bieżącemu modelowi."
    ),
    FreshnessReason.MODEL_ZMIENIONY: (
        "Model zmienił się po obliczeniu — wynik opisuje poprzedni stan sieci."
    ),
    FreshnessReason.MODEL_NIEZMIENIONY: "Model nie zmienił się od chwili obliczenia.",
}


@dataclass(frozen=True)
class FreshnessVerdict:
    """Werdykt swiezosci: status + przyczyna maszynowa + zdanie dla czlowieka."""

    status: ResultFreshness
    reason: FreshnessReason

    @property
    def reason_pl(self) -> str:
        return REASON_TEXTS_PL[self.reason]

    def to_overlay_fields(self) -> dict[str, str]:
        """Pola statusu dodawane do odpowiedzi nakladki (ten sam ksztalt wszedzie)."""
        return {
            "result_status": self.status.value,
            "result_status_reason": self.reason.value,
            "result_status_reason_pl": self.reason_pl,
        }


def current_model_hash(case_ref: str | None, uow_factory: Callable[[], Any] | None) -> str | None:
    """Odcisk BIEZACEGO modelu przypadku — jedyne wejscie do tej wartosci.

    `None` gdy przypadek nie ma jeszcze materializowanego modelu ENM: to jest
    uczciwy brak wiedzy, nie „model pusty". Swiadomie NIE wolamy `get_enm` dla
    przypadku bez snapshotu, bo ta funkcja TWORZY model domyslny i zapisuje go —
    ocena swiezosci (czysty odczyt) nie moze zakladac modelu, ktorego uzytkownik
    nie zbudowal. Ten sam uczciwy brak obejmuje TERAZ (CV-1-W) przypadek, ktory
    nie nalezy juz do zadnego projektu (`PrzypadekBezProjektuError`) — nie da sie
    potwierdzic swiezosci wobec modelu, ktorego nie da sie zidentyfikowac.

    `case_ref` jest tu SUROWYM `case_id` (np. `CanonicalRun.case_id`);
    `klucz_twin_dla_przypadku` tlumaczy go na klucz magazynu ENM. Wolane TU
    (nie na granicy API), bo `uow_factory` jest przekazywany z wolajacego —
    wyjatek SS0 pkt 3 dla „freshness".
    """
    if not case_ref or uow_factory is None:
        return None
    try:
        klucz = klucz_twin_dla_przypadku(case_ref, uow_factory)
    except PrzypadekBezProjektuError:
        return None
    if not has_enm(klucz):
        return None
    return compute_enm_hash(get_enm(klucz))


def evaluate_result_freshness(
    *,
    has_result: bool,
    run_model_hashes: Sequence[str | None],
    current_hash: str | None,
) -> FreshnessVerdict:
    """Werdykt swiezosci z POROWNANIA odciskow — funkcja czysta (bez wejscia/wyjscia).

    `run_model_hashes` to KOTWICE biegu: odciski modelu, ktore bieg zapisal
    (np. odcisk przypadku w chwili utworzenia biegu ORAZ odcisk modelu biegu
    zwarciowego, z ktorego wynik pochodzi). Kotwica nieznana (`None`) jest
    POMIJANA — nie udaje zgodnosci ani niezgodnosci. Wynik jest AKTUALNY tylko
    wtedy, gdy znana jest co najmniej jedna kotwica i KAZDA znana rowna sie
    odciskowi biezacemu; jedna rozbiezna kotwica wystarczy do OUTDATED, bo
    wynik opisuje wtedy stan sieci sprzed zmiany.
    """
    if not has_result:
        return FreshnessVerdict(ResultFreshness.NONE, FreshnessReason.BRAK_WYNIKU)
    if current_hash is None:
        return FreshnessVerdict(ResultFreshness.OUTDATED, FreshnessReason.BRAK_MODELU_BIEZACEGO)
    anchors = [value for value in run_model_hashes if value]
    if not anchors:
        return FreshnessVerdict(ResultFreshness.OUTDATED, FreshnessReason.BRAK_ODCISKU_W_BIEGU)
    if any(anchor != current_hash for anchor in anchors):
        return FreshnessVerdict(ResultFreshness.OUTDATED, FreshnessReason.MODEL_ZMIENIONY)
    return FreshnessVerdict(ResultFreshness.FRESH, FreshnessReason.MODEL_NIEZMIENIONY)
