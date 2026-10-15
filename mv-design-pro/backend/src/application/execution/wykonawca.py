"""Wykonawca biegów w procesie API (karta DYNAMIKA-W-TLE; DT-12 jako wykonawca w procesie).

DLACZEGO. Bieg (rozpływ, zwarcie sieci 50 stacji — do 171 s, bieg czasowy — dziesiątki
sekund na 10 s symulacji, seria — N × zwarcie) wykonywał się SYNCHRONICZNIE w żądaniu
`POST …/execute`: zerwane połączenie HTTP nie przerywało obliczeń, a projektant nie
wiedział, czy bieg trwa. Od tej karty `POST …/execute` przyjmuje bieg do kolejki
(202, stan `QUEUED`) i wraca natychmiast; klient odpytuje `GET …/runs/{id}` jak
dotąd, dostając stan, postęp i — po zakończeniu — wynik istniejącymi końcówkami.

KSZTAŁT (decyzja O-57 pkt 2). Jeden wątek roboczy w procesie API = jeden ciężki bieg
naraz (maszyna 4 CPU, narzędzie jednostanowiskowe; równoległe biegi dzieliłyby te
same rdzenie i wątki BLAS — pomiar WATKI-BLAS-E2E: 866 s zamiast 6 s przy
nadsubskrypcji). Drugi bieg zlecony w trakcie pierwszego czeka w kolejce FIFO z
JAWNYM stanem `QUEUED` w rejestrze biegów, nie w wyścigu. Kolejka nie jest trwała
i tego nie udaje: po restarcie procesu każdy bieg `QUEUED`/`RUNNING` jest zamykany
jako FAILED z przyczyną (`zamknij_osierocone_biegi`), tak jak dotąd bieg RUNNING.

ANULOWANIE. Bieg w kolejce: zdjęty atomowo (QUEUED → CANCELLED z wyjaśnieniem).
Bieg w toku: flaga sprawdzana w PUNKTACH PRZERWANIA wykonawcy (bieg czasowy — po
każdym kroku całkowania; zwarcie — między punktami zwarcia; seria — między
pozycjami); wykonawca bez punktów przerwania (rozpływ NR w rdzeniu FROZEN, stan
fazowy, zabezpieczenia, V12.6) odmawia anulowania biegu w toku NAZWANYM powodem —
nie udaje, że przerwał. Anulowany bieg nie ma wyniku częściowego.

POSTĘP żyje w pamięci wykonawcy (nie w bazie): zapis po każdym kroku całkowania
(5 000 kroków na 10 s symulacji) byłby kosztem biegu, a po restarcie procesu postęp
nie ma znaczenia (bieg jest osierocony). `GET …/runs/{id}` dokłada go do stanu.

Celery/Redis (martwe: 0 zadań, 0 konsumentów) skasowane w tej karcie — bramka
wskrzeszenia w `scripts/legacy_public_path_guard.py`. Alternatywa „Celery jako
wykonawca" odrzucona w O-57: zależność od Redis w testach i pracy lokalnej, zero
wartości dla jednego użytkownika, prewencyjna abstrakcja.
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from domain.execution import STANY_KONCOWE_BIEGU, KontekstWykonania, PostepBiegu
from enm.canonical_analysis import CanonicalRun, execute_run, get_run
from infrastructure.persistence.repositories.canonical_run_repository import (
    canonical_run_repository_scope,
)
from network_model.odmowa_danych import OdmowaDanychError

logger = logging.getLogger(__name__)

#: Wyjaśnienie stanu CANCELLED biegu zdjętego z kolejki albo anulowanego przed zleceniem.
POWOD_ANULOWANIA_PRZED_STARTEM = (
    "Bieg anulowany przez użytkownika przed rozpoczęciem obliczeń — nic nie policzono."
)

#: Rodzaje analiz z PUNKTAMI PRZERWANIA w wykonawcy (`enm/canonical_analysis.py`):
#: bieg czasowy (po każdym kroku całkowania), zwarcie (między punktami zwarcia).
#: Lista ZAMKNIĘTA — dopisanie rodzaju wymaga punktu przerwania w jego wykonawcy
#: (przypięte testem: każdy rodzaj z listy przerywa bieg w toku, żaden spoza niej).
RODZAJE_Z_PUNKTAMI_PRZERWANIA: frozenset[str] = frozenset({"dynamika_rms", "short_circuit_sn"})


class BiegNieDoAnulowaniaError(OdmowaDanychError):
    """Anulowanie niemożliwe — z nazwanego powodu (stan końcowy, brak punktu przerwania)."""


@dataclass
class _Zlecenie:
    """Jedno zlecenie kolejki: bieg albo seria; postęp i flaga anulowania w pamięci."""

    klucz: str
    wykonaj: Callable[[KontekstWykonania], object]
    anulowanie: threading.Event = field(default_factory=threading.Event)
    postep: PostepBiegu | None = None
    w_toku: bool = False


class WykonawcaBiegow:
    """Kolejka FIFO z jednym wątkiem roboczym; stan zleceń w pamięci procesu."""

    def __init__(self) -> None:
        self._zamek = threading.Lock()
        self._budzik = threading.Condition(self._zamek)
        # Zwykła lista jako kolejka FIFO: zlecenia liczy się w jednostkach, nie tysiącach.
        self._kolejka: list[_Zlecenie] = []
        self._zlecenia: dict[str, _Zlecenie] = {}
        self._watek: threading.Thread | None = None

    # ------------------------------------------------------------------ biegi

    def zlec_bieg(self, run_id: UUID, uow_factory: Callable[[], Any] | None) -> CanonicalRun:
        """Przyjmij bieg do kolejki (CREATED → QUEUED atomowo) i wróć natychmiast.

        Przegrany wyścig o ten sam bieg (drugi `POST …/execute`) nie zleca nic i
        oddaje stan bieżący — jedno zlecenie na bieg, tak jak dotąd jedno wykonanie.
        """
        with canonical_run_repository_scope() as repository:
            przyjety = repository.claim_for_queue(run_id)
        run = get_run(run_id)
        if run is None:
            raise OdmowaDanychError(f"Run {run_id} not found")
        if not przyjety:
            return run
        self._dodaj(
            _Zlecenie(
                klucz=_klucz_biegu(run_id),
                wykonaj=lambda kontekst: execute_run(
                    run_id, uow_factory=uow_factory, kontekst=kontekst
                ),
            )
        )
        return run

    def anuluj_bieg(self, run_id: UUID) -> CanonicalRun:
        """Anuluj bieg: z kolejki natychmiast, w toku — w najbliższym punkcie przerwania.

        Zwraca stan biegu PO żądaniu: CANCELLED (zdjęty z kolejki albo nigdy nie
        zlecony) albo RUNNING (przerwanie zlecone — klient odpytuje do CANCELLED).
        Bieg zakończony i bieg w toku bez punktu przerwania → `BiegNieDoAnulowaniaError`
        z nazwanym powodem.
        """
        run = get_run(run_id)
        if run is None:
            raise OdmowaDanychError(f"Run {run_id} not found")
        if run.status in STANY_KONCOWE_BIEGU:
            raise BiegNieDoAnulowaniaError(
                f"Bieg {run_id} jest już zakończony (stan {run.status}) — nie ma czego anulować."
            )
        if run.status in {"CREATED", "QUEUED"}:
            with canonical_run_repository_scope() as repository:
                zdjety = repository.cancel_before_start(
                    run_id,
                    reason=POWOD_ANULOWANIA_PRZED_STARTEM,
                    finished_at=datetime.now(UTC),
                )
            if zdjety:
                self._usun_z_kolejki(_klucz_biegu(run_id))
                return get_run(run_id) or run
            run = get_run(run_id) or run
            if run.status in STANY_KONCOWE_BIEGU:
                return run
        # RUNNING (także bieg, który wystartował między odczytem a próbą zdjęcia z kolejki).
        if run.analysis_type not in RODZAJE_Z_PUNKTAMI_PRZERWANIA:
            raise _odmowa_bez_punktu_przerwania(run)
        with self._zamek:
            zlecenie = self._zlecenia.get(_klucz_biegu(run_id))
        if zlecenie is None:
            raise BiegNieDoAnulowaniaError(
                f"Bieg {run_id} jest wykonywany poza wykonawcą w tle (bez punktu przerwania) — "
                "można go anulować wyłącznie przed rozpoczęciem obliczeń."
            )
        zlecenie.anulowanie.set()
        return get_run(run_id) or run

    # ------------------------------------------------------------------ serie

    def zlec(self, klucz: str, wykonaj: Callable[[KontekstWykonania], object]) -> None:
        """Przyjmij dowolne zlecenie (seria biegów) do tej samej kolejki FIFO.

        Wołający atomowo przestawia stan zlecanego bytu na QUEUED PRZED zleceniem —
        wykonawca nie zna serii, zna tylko funkcję do wykonania z kontekstem.
        """
        self._dodaj(_Zlecenie(klucz=klucz, wykonaj=wykonaj))

    def zazadaj_przerwania(self, klucz: str) -> bool:
        """Ustaw flagę anulowania zlecenia w toku; ``False`` gdy zlecenia nie ma."""
        with self._zamek:
            zlecenie = self._zlecenia.get(klucz)
        if zlecenie is None:
            return False
        zlecenie.anulowanie.set()
        return True

    def zdejmij_z_kolejki(self, klucz: str) -> bool:
        """Zdejmij zlecenie CZEKAJĄCE w kolejce; ``False`` gdy już wystartowało albo go nie ma."""
        return self._usun_z_kolejki(klucz)

    # ------------------------------------------------------------------ odczyt

    def postep(self, klucz: str) -> PostepBiegu | None:
        """Ostatni zgłoszony postęp zlecenia w toku (``None`` — brak pomiaru albo zakończone)."""
        with self._zamek:
            zlecenie = self._zlecenia.get(klucz)
            return None if zlecenie is None else zlecenie.postep

    def postep_biegu(self, run_id: UUID) -> PostepBiegu | None:
        return self.postep(_klucz_biegu(run_id))

    def dlugosc_kolejki(self) -> int:
        with self._zamek:
            return len(self._kolejka)

    def poczekaj_na_pustke(self, limit_s: float) -> bool:
        """Test/skrypt: czekaj, aż kolejka i bieżące zlecenie się wyczerpią."""
        with self._budzik:
            return self._budzik.wait_for(lambda: not self._zlecenia, timeout=limit_s)

    # ------------------------------------------------------------------ wnętrze

    def _dodaj(self, zlecenie: _Zlecenie) -> None:
        with self._budzik:
            if zlecenie.klucz in self._zlecenia:
                raise AssertionError(f"Zlecenie {zlecenie.klucz} jest już w wykonawcy")
            self._zlecenia[zlecenie.klucz] = zlecenie
            self._kolejka.append(zlecenie)
            self._uruchom_watek_pod_zamkiem()
            self._budzik.notify_all()

    def _usun_z_kolejki(self, klucz: str) -> bool:
        with self._budzik:
            zlecenie = self._zlecenia.get(klucz)
            if zlecenie is None or zlecenie.w_toku:
                return False
            self._kolejka.remove(zlecenie)
            del self._zlecenia[klucz]
            self._budzik.notify_all()
            return True

    def _uruchom_watek_pod_zamkiem(self, *, zastap: bool = False) -> None:
        """Uruchom wątek roboczy, gdy go nie ma; `zastap=True` — także gdy bieżący wątek
        właśnie kończy się błędem programu (jest jeszcze żywy w swoim `finally`)."""
        if not zastap and self._watek is not None and self._watek.is_alive():
            return
        self._watek = threading.Thread(target=self._petla, name="wykonawca-biegow", daemon=True)
        self._watek.start()

    def _petla(self) -> None:
        while True:
            with self._budzik:
                while not self._kolejka:
                    self._budzik.wait()
                zlecenie = self._kolejka.pop(0)
                zlecenie.w_toku = True
            blad_programu = True
            try:
                zlecenie.wykonaj(self._kontekst(zlecenie))
                blad_programu = False
            except Exception:
                # Błąd PROGRAMU (karta #151): `execute_run`/`execute_batch` zapisały już
                # FAILED z nazwą błędu wewnętrznego i puściły wyjątek dalej. Tu nie ma
                # żądania HTTP, które dostałoby 500 — ślad idzie do dziennika, a wyjątek
                # leci dalej i KOŃCZY ten wątek (nie jest połykany); `finally` niżej
                # stawia wątek zastępczy, żeby kolejka nie stanęła.
                logger.exception(
                    "Zlecenie %s przerwane błędem wewnętrznym programu", zlecenie.klucz
                )
                raise
            finally:
                with self._budzik:
                    self._zlecenia.pop(zlecenie.klucz, None)
                    self._budzik.notify_all()
                    if blad_programu:
                        self._uruchom_watek_pod_zamkiem(zastap=True)

    def _kontekst(self, zlecenie: _Zlecenie) -> KontekstWykonania:
        def zglos_postep(postep: PostepBiegu) -> None:
            with self._zamek:
                zlecenie.postep = postep

        return KontekstWykonania(
            czy_anulowano=zlecenie.anulowanie.is_set, zglos_postep=zglos_postep
        )


def _odmowa_bez_punktu_przerwania(run: CanonicalRun) -> BiegNieDoAnulowaniaError:
    return BiegNieDoAnulowaniaError(
        f"Bieg {run.id} ({run.analysis_type}) jest w toku, a jego wykonawca nie ma punktów "
        "przerwania między krokami obliczeń — anulować można wyłącznie bieg czekający w "
        "kolejce; bieg w toku zakończy się sam (FINISHED albo FAILED)."
    )


def _klucz_biegu(run_id: UUID) -> str:
    return f"bieg:{run_id}"


def klucz_serii(batch_id: UUID) -> str:
    return f"seria:{batch_id}"


#: JEDEN wykonawca na proces API (jeden ciężki bieg naraz — O-57 pkt 2).
wykonawca_biegow = WykonawcaBiegow()


__all__ = [
    "POWOD_ANULOWANIA_PRZED_STARTEM",
    "RODZAJE_Z_PUNKTAMI_PRZERWANIA",
    "BiegNieDoAnulowaniaError",
    "WykonawcaBiegow",
    "klucz_serii",
    "wykonawca_biegow",
]
