"""
Run Batch Domain Model — karta CV-3.3-C.

R2 (docs/architecture/CANONICAL_TWIN_ARCHITECTURE.md §B.2): E4 (serie biegow,
dawniej `domain/batch_job.py` + trzy slowniki w pamieci w
`application/batch_execution_service.py`) przechodzi na trwaly rejestr
`run_batches`. Seria NIE jest drugim rejestrem wynikow — pozycja serii NIE MA
wlasnego wyniku, tylko `canonical_run_id` wskazujacy na `CanonicalRun` w R1
(`enm/canonical_analysis.py`, tabela `canonical_runs`). Ten modul niesie
WYLACZNIE ksztalt domenowy (immutable dataclasses) — persystencja zyje w
`infrastructure/persistence/repositories/run_batch_repository.py`.

CYKL ZYCIA (KLASA, NIE INSTANCJA — status serii i status pozycji dziela JEDEN
slownik zrodlowy z `enm.canonical_analysis.CanonicalRun.status`
("CREATED"/"RUNNING"/"FINISHED"/"FAILED"), zamiast wprowadzac drugi,
rownolegly slownik "PENDING"/"DONE"): pozycja przechodzi dokladnie te same
cztery stany co bieg kanoniczny, ktory reprezentuje. Seria dodaje JEDEN wlasny
stan, PARTIAL, niemozliwy dla pojedynczego biegu — czesc pozycji FAILED, reszta
FINISHED. Seria NIGDY nie melduje cicho FINISHED, gdy ktoras pozycja zawiodla.

WYKONANIE CIAGLE (karta CV-3.3-C, C2): awaria JEDNEJ pozycji NIE zatrzymuje
pozostalych (`stop_on_failure` nie istnieje w kontrakcie API — sprawdzone przy
tej karcie — wiec nie ma jak go zazadac; brak fantomu). Kolejnosc wykonania to
`position` (0..N-1), przypisywany przy tworzeniu wg TEGO SAMEGO porzadku
leksykograficznego identyfikatorow scenariuszy co dawny
`domain.batch_job.new_batch_job` (determinizm — `test_domenowy_odcisk_
niezalezny_od_porzadku`).
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from domain.execution import ExecutionAnalysisType

#: Statusy POZYCJI serii — DOKLADNIE slownik `CanonicalRun.status`
#: (`enm/canonical_analysis.py`), zero nowego rownoleglego slownika.
ITEM_STATUS_CREATED = "CREATED"
ITEM_STATUS_RUNNING = "RUNNING"
ITEM_STATUS_FINISHED = "FINISHED"
ITEM_STATUS_FAILED = "FAILED"
#: Stany KONCOWE pozycji — po ktorych `finalize_batch_status` moze rozstrzygnac.
ITEM_STATUSES_TERMINALNE = frozenset({ITEM_STATUS_FINISHED, ITEM_STATUS_FAILED})


class RunBatchStatus(StrEnum):
    """Cykl zycia serii — slownik `CanonicalRun.status` + PARTIAL (karta §0 C1)."""

    CREATED = "CREATED"
    RUNNING = "RUNNING"
    FINISHED = "FINISHED"
    FAILED = "FAILED"
    #: Czesc pozycji FAILED, reszta FINISHED — NIGDY cicho FINISHED (karta §0 C1).
    PARTIAL = "PARTIAL"


@dataclass(frozen=True)
class RunBatchItem:
    """Jedna pozycja serii. ZERO wlasnego wyniku — wynik = `CanonicalRun` po
    `canonical_run_id` (karta §0 C1: "Pozycja serii NIE ma wlasnego wyniku")."""

    position: int
    scenario_id: UUID
    #: Rodzaj analizy pozycji (`ExecutionAnalysisType.value`, np. "SC_3F") —
    #: TA SAMA wartosc, co `RunBatch.analysis_type` (seria wymusza jeden rodzaj
    #: analizy dla wszystkich pozycji), niesiona per pozycja bo pole jest
    #: nazwane wprost w kontrakcie (karta §0 C1).
    analysis_type: str
    #: Odcisk tresci scenariusza PRZYPIETY przy tworzeniu serii — JEDNO zrodlo
    #: prawdy weryfikowane przy wykonaniu (`compute_scenario_content_hash`,
    #: zastepuje dawny osobny slownik `_pinned_hashes`; predykaty parami).
    options_hash: str
    canonical_run_id: UUID | None = None
    status: str = ITEM_STATUS_CREATED
    error_message: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "position": self.position,
            "scenario_id": str(self.scenario_id),
            "analysis_type": self.analysis_type,
            "options_hash": self.options_hash,
            "canonical_run_id": (
                str(self.canonical_run_id) if self.canonical_run_id is not None else None
            ),
            "status": self.status,
            "error_message": self.error_message,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> RunBatchItem:
        surowy_run_id = data.get("canonical_run_id")
        return cls(
            position=int(data["position"]),
            scenario_id=UUID(str(data["scenario_id"])),
            analysis_type=str(data["analysis_type"]),
            options_hash=str(data["options_hash"]),
            canonical_run_id=UUID(str(surowy_run_id)) if surowy_run_id else None,
            status=str(data.get("status", ITEM_STATUS_CREATED)),
            error_message=data.get("error_message"),
        )


def finalize_batch_status(items: tuple[RunBatchItem, ...]) -> RunBatchStatus:
    """Status serii WYPROWADZONY z pozycji — JEDNO zrodlo prawdy (karta §0 C1).

    Wymaga, zeby KAZDA pozycja byla w stanie koncowym (FINISHED/FAILED) —
    wolane DOPIERO po probie wykonania wszystkich pozycji serii.
    """
    statusy = [pozycja.status for pozycja in items]
    if any(s not in ITEM_STATUSES_TERMINALNE for s in statusy):
        raise ValueError(
            "finalize_batch_status wymaga, zeby kazda pozycja byla w stanie koncowym "
            f"(FINISHED/FAILED); otrzymano: {sorted(set(statusy))}"
        )
    if all(s == ITEM_STATUS_FINISHED for s in statusy):
        return RunBatchStatus.FINISHED
    if all(s == ITEM_STATUS_FAILED for s in statusy):
        return RunBatchStatus.FAILED
    return RunBatchStatus.PARTIAL


def compute_batch_input_hash(
    analysis_type: ExecutionAnalysisType,
    scenario_ids: tuple[UUID, ...],
    scenario_content_hashes: tuple[str, ...],
) -> str:
    """Odcisk SHA-256 wejscia serii — BEZ ZMIAN wzgledem dawnego
    `domain.batch_job.compute_batch_input_hash` (ten sam algorytm, testy
    determinizmu `TestBatchHashDeterminism` pina zachowanie 1:1).

    Identyczny zestaw scenariuszy (bez wzgledu na kolejnosc podania) → identyczny
    odcisk.
    """
    scenariusze = []
    for sid, chash in zip(scenario_ids, scenario_content_hashes, strict=False):
        scenariusze.append({"scenario_id": str(sid), "content_hash": chash})
    scenariusze.sort(key=lambda s: s["scenario_id"])

    kanoniczny = {
        "analysis_type": analysis_type.value,
        "scenarios": scenariusze,
    }
    payload = json.dumps(kanoniczny, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class RunBatch:
    """Rekord serii biegow — trwaly (`run_batches`, karta §0 C1).

    Pola pochodne (`scenario_ids`/`run_ids`/`result_set_ids`/`errors`) sa
    WYPROWADZANE z `items` w porzadku `position` — jedno zrodlo prawdy, zero
    drugiej ksiegi (dawne osobne pola `run_ids`/`errors` w
    `domain.batch_job.BatchJob` byly zapisywane RECZNIE przy kazdej tranzycji;
    tu nie da sie ich rozjechac z `items`, bo nie istnieja osobno).
    """

    id: UUID
    project_id: str | None
    case_id: UUID
    analysis_type: ExecutionAnalysisType
    #: Etykieta serii — kolumna schematu (karta §0 C1); brak dostawcy UI w tej
    #: karcie (formularz tworzenia serii nie ma pola nazwy) — `None` jest
    #: uczciwym stanem, nie zgadywana wartoscia.
    name: str | None
    created_at: datetime
    finished_at: datetime | None
    status: RunBatchStatus
    #: Koperta rewizji modelu Z CHWILI UTWORZENIA serii (`enm/envelope.py`,
    #: MECHANIZM 1:1 z koperta biegow pozycji, zbudowana TA SAMA funkcja
    #: `zbuduj_koperte`) — `options_hash` niesie `batch_input_hash` (tozsamosc
    #: CALEJ serii), `scenario_ref=None` (seria nie ma JEDNEGO scenariusza).
    #: Zapis WYLACZNIE informacyjny: seria NIE kopiuje tej migawki do pozycji
    #: (karta C5 — "seria NIE kopiuje migawki, pozycje dostaja migawke z
    #: create_run"), kazda pozycja czyta model NA WLASNY RACHUNEK przy
    #: wykonaniu, dokladnie jak pojedynczy bieg.
    envelope: dict[str, Any] | None
    items: tuple[RunBatchItem, ...]
    batch_input_hash: str

    def sorted_items(self) -> tuple[RunBatchItem, ...]:
        """Pozycje uporzadkowane wg `position` — defensywna normalizacja (karta
        §0 C1: kolejnosc wykonania i prezentacji jest ZAWSZE `position`, nie
        kolejnoscia zapisu w `items_json`)."""
        return tuple(sorted(self.items, key=lambda pozycja: pozycja.position))

    @property
    def scenario_ids(self) -> tuple[UUID, ...]:
        return tuple(pozycja.scenario_id for pozycja in self.sorted_items())

    @property
    def run_ids(self) -> tuple[UUID, ...]:
        return tuple(
            pozycja.canonical_run_id
            for pozycja in self.sorted_items()
            if pozycja.canonical_run_id is not None
        )

    @property
    def result_set_ids(self) -> tuple[UUID, ...]:
        #: Zestaw wynikow biegu kanonicznego jest adresowany identyfikatorem
        #: biegu (`GET /api/execution/runs/{run_id}/results`) — to samo pole
        #: co `run_ids`, zachowane jako ODREBNA nazwa dla zgodnosci ksztaltu
        #: kontraktu HTTP sprzed tej karty (pole addytywne bez zmiany ksztaltu).
        return self.run_ids

    @property
    def errors(self) -> tuple[str, ...]:
        return tuple(
            pozycja.error_message for pozycja in self.sorted_items() if pozycja.error_message
        )

    def with_item(self, zaktualizowana: RunBatchItem) -> RunBatch:
        """Podmien JEDNA pozycje (po `position`) — reszta bez zmian."""
        nowe = tuple(
            zaktualizowana if pozycja.position == zaktualizowana.position else pozycja
            for pozycja in self.items
        )
        return replace(self, items=nowe)

    def mark_running(self) -> RunBatch:
        return replace(self, status=RunBatchStatus.RUNNING)

    def finalize(self, *, finished_at: datetime) -> RunBatch:
        """Rozstrzygnij status koncowy z pozycji (FINISHED/FAILED/PARTIAL)."""
        return replace(
            self,
            status=finalize_batch_status(self.items),
            finished_at=finished_at,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "batch_id": str(self.id),
            "study_case_id": str(self.case_id),
            "analysis_type": self.analysis_type.value,
            "scenario_ids": [str(sid) for sid in self.scenario_ids],
            "created_at": self.created_at.isoformat(),
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "status": self.status.value,
            "batch_input_hash": self.batch_input_hash,
            "run_ids": [str(rid) for rid in self.run_ids],
            "result_set_ids": [str(rsid) for rsid in self.result_set_ids],
            "errors": list(self.errors),
            "name": self.name,
            "envelope": self.envelope,
            "items": [pozycja.to_dict() for pozycja in self.sorted_items()],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> RunBatch:
        finished_at = data.get("finished_at")
        return cls(
            id=UUID(data["id"]),
            project_id=data.get("project_id"),
            case_id=UUID(data["case_id"]),
            analysis_type=ExecutionAnalysisType(data["analysis_type"]),
            name=data.get("name"),
            created_at=datetime.fromisoformat(data["created_at"]),
            finished_at=datetime.fromisoformat(finished_at) if finished_at else None,
            status=RunBatchStatus(data["status"]),
            envelope=data.get("envelope"),
            items=tuple(RunBatchItem.from_dict(p) for p in data["items"]),
            batch_input_hash=data["batch_input_hash"],
        )


def new_run_batch(
    *,
    project_id: str | None,
    case_id: UUID,
    analysis_type: ExecutionAnalysisType,
    scenario_ids: list[UUID],
    scenario_content_hashes: list[str],
    envelope: dict[str, Any] | None,
    name: str | None = None,
) -> RunBatch:
    """Nowa seria w stanie CREATED — pozycje posortowane leksykograficznie po
    identyfikatorze scenariusza (determinizm 1:1 z dawnym
    `domain.batch_job.new_batch_job`).

    Raises:
        ValueError: duplikat `scenario_ids` albo niezgodna dlugosc list.
    """
    if len(scenario_ids) != len(scenario_content_hashes):
        raise ValueError("scenario_ids i scenario_content_hashes musza miec te sama dlugosc")
    if len(set(scenario_ids)) != len(scenario_ids):
        raise ValueError("scenario_ids zawiera duplikaty")

    pary = sorted(
        zip(scenario_ids, scenario_content_hashes, strict=False),
        key=lambda p: str(p[0]),
    )
    batch_input_hash = compute_batch_input_hash(
        analysis_type=analysis_type,
        scenario_ids=tuple(p[0] for p in pary),
        scenario_content_hashes=tuple(p[1] for p in pary),
    )
    items = tuple(
        RunBatchItem(
            position=indeks,
            scenario_id=scenario_id,
            analysis_type=analysis_type.value,
            options_hash=content_hash,
        )
        for indeks, (scenario_id, content_hash) in enumerate(pary)
    )
    return RunBatch(
        id=uuid4(),
        project_id=project_id,
        case_id=case_id,
        analysis_type=analysis_type,
        name=name,
        created_at=datetime.now(UTC),
        finished_at=None,
        status=RunBatchStatus.CREATED,
        envelope=envelope,
        items=items,
        batch_input_hash=batch_input_hash,
    )
