"""
Domain model dla Project Archive — P31.

Project Import/Export jako funkcja pierwszej klasy:
- pełny projekt (model ENM + cases + runs + interpretation)
- deterministyczny format
- gotowy do archiwizacji i przenoszenia

KANON:
- Import/Export = NOT-A-SOLVER
- Zero nowych obliczeń
- Determinizm absolutny
- 100% PL
- Kompatybilność wsteczna (versioned format)

Karta W1-B-ARCH (2026-09, mapa domknięcia „jedna prawda sieci"): W1 skasował tabele
legacy modelu sieci i ich klasy ORM (`NetworkSnapshotORM`, `NetworkNodeORM`,
`NetworkBranchORM`, `NetworkSourceORM`, `NetworkLoadORM`, `SwitchingStateORM`,
`Sld*ORM`, `Design*ORM`) — model sieci projektu żyje WYŁĄCZNIE w magazynie ENM
(`enm/store.py`). Format archiwum 3.0.0 odzwierciedla to wprost: sekcje
`network_model`, `sld_diagrams`, `proofs` (i ich hashe) ZNIKAJĄ ze struktury —
nie ma dla nich już żadnego źródła danych. Sekcja `enm` (model per przypadek)
zostaje jedynym nośnikiem sieci — była nim faktycznie od N-D1/CV-1-W, teraz jest
nim też formalnie. Archiwa 2.x (z tymi sekcjami) pozostają WCZYTYWALNE
(`_is_compatible_version`): `dict_to_archive` po prostu ich nie czyta, a
warstwa importu (`application/project_archive/service.py`) sięga po SUROWY
słownik `network_model`, gdy trzeba skompilować model z danych legacy
(`application.migracja_legacy.graf_z_modelu_legacy` + `enm.kompilator_grafu`).
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any

# ============================================================================
# STAŁE WERSJI
# ============================================================================

# W1-B-ARCH: bump MAJOR — sekcje `network_model`/`sld_diagrams`/`proofs` (i ich
# hashe) znikają ze struktury razem z tabelami ORM, które je zasilały (W1).
# Archiwa 1.x/2.x pozostają WCZYTYWALNE (`_is_compatible_version`: major <=
# current_major) — `dict_to_archive` po prostu ich nie czyta („usuń, nie
# migruj"); import archiwum 2.x z `network_model.nodes`, ale bez `enm.models`,
# kompiluje model z danych legacy (patrz `application/project_archive/service.py`).
ARCHIVE_SCHEMA_VERSION = "3.0.0"
ARCHIVE_FORMAT_ID = "MV-DESIGN-PRO-ARCHIVE"


# ============================================================================
# BŁĘDY ARCHIWUM
# ============================================================================


class ArchiveError(Exception):
    """Bazowy błąd archiwum projektu."""

    pass


class ArchiveVersionError(ArchiveError):
    """Błąd wersji schematu archiwum."""

    def __init__(self, expected: str, got: str) -> None:
        self.expected = expected
        self.got = got
        super().__init__(
            f"Nieobsługiwana wersja schematu archiwum: oczekiwano {expected}, otrzymano {got}"
        )


class ArchiveIntegrityError(ArchiveError):
    """Błąd integralności archiwum (hash mismatch)."""

    def __init__(self, section: str, expected: str, got: str) -> None:
        self.section = section
        self.expected = expected
        self.got = got
        super().__init__(
            f"Błąd integralności sekcji '{section}': oczekiwano {expected}, otrzymano {got}"
        )


class ArchiveStructureError(ArchiveError):
    """Błąd struktury archiwum (brakujące sekcje)."""

    def __init__(self, message: str) -> None:
        super().__init__(f"Błąd struktury archiwum: {message}")


# ============================================================================
# TYPY STATUSÓW
# ============================================================================


class ArchiveImportStatus(StrEnum):
    """Status importu archiwum."""

    SUCCESS = "SUCCESS"
    PARTIAL = "PARTIAL"  # Częściowy import (np. starsza wersja)
    FAILED = "FAILED"
    CATALOG_MAPPING_REQUIRED = (
        "CATALOG_MAPPING_REQUIRED"  # Import OK, ale wymagane mapowanie katalogowe
    )


# ============================================================================
# MODELE DANYCH ARCHIWUM
# ============================================================================


@dataclass(frozen=True)
class ProjectMeta:
    """Metadane projektu w archiwum."""

    id: str
    name: str
    description: str | None
    schema_version: str
    connection_node_id: str | None
    sources: list[dict[str, Any]]
    created_at: str  # ISO 8601
    updated_at: str  # ISO 8601
    # NOTE: exported_at is in manifest.json only (not in project.json for determinism)


@dataclass(frozen=True)
class CasesSection:
    """Sekcja przypadków obliczeniowych w archiwum."""

    study_cases: list[dict[str, Any]]
    operating_cases: list[dict[str, Any]]
    settings: dict[str, Any] | None


@dataclass(frozen=True)
class RunsSection:
    """Sekcja wykonań analiz w archiwum.

    CV-3.3-B: `analysis_runs` (R2) + `study_runs` (R3) usunięte razem z torem,
    który je pisał (`AnalysisRunService`, legacy `study_runs`/`study_results`) —
    JEDYNY rejestr biegów to odtąd `canonical_runs` (R1, `enm.canonical_analysis
    .CanonicalRun`), pełny zrzut pól (patrz `application/project_archive/service
    .py::_collect_runs`). `analysis_runs_index` ZOSTAJE bez zmian: to
    NIEZALEŻNA tabela (`AnalysisRunIndexORM`) obsługująca ekran koordynacji
    zabezpieczeń (`application/analyses/protection/{catalog,overcurrent}
    /pipeline.py`, `api/protection_overcurrent_settings.py`) — żywy konsument
    produkcyjny (`ui2/wyniki/koordynacja`), niezwiązany z R2/R3.
    """

    canonical_runs: list[dict[str, Any]]
    analysis_runs_index: list[dict[str, Any]]


@dataclass(frozen=True)
class ResultsSection:
    """Sekcja wyników w archiwum.

    CV-3.3-B: `study_results` (R3, `StudyResultORM`) usunięty razem z torem,
    który go pisał — wynik biegu jest odtąd częścią samego `canonical_runs`
    (`CanonicalRun.raw_result`), nie osobnym rekordem. Sekcja zostaje jako
    pusty kontener: klucz `results` jest częścią WYMAGANEJ struktury archiwum
    (`required_keys` w `dict_to_archive`), a hash sekcji (`results_hash`)
    zostaje stabilnym polem odcisku nawet bez zawartości.
    """


@dataclass(frozen=True)
class InterpretationsSection:
    """Sekcja interpretacji w archiwum."""

    # Interpretacje są generowane dynamicznie z wyników
    # Ta sekcja może przechowywać cached interpretations
    cached: list[dict[str, Any]] = field(default_factory=list)


@dataclass(frozen=True)
class IssuesSection:
    """Sekcja problemów/walidacji w archiwum."""

    # Issues są generowane dynamicznie
    # Ta sekcja może przechowywać snapshot issues w momencie eksportu
    snapshot: list[dict[str, Any]] = field(default_factory=list)


@dataclass(frozen=True)
class EnmSection:
    """Sekcja modeli ENM (EnergyNetworkModel) per przypadek w archiwum.

    Każdy wpis: {"case_id": str, "snapshot": dict} — pełny zrzut modelu ENM
    (model_dump) dla przypadku, posortowane po case_id dla determinizmu.
    ENM jest JEDYNYM nośnikiem sieci (stacje/transformatory/strona nN/gałęzie) —
    od W1-B-ARCH formalnie też jedyną sekcją archiwum, która sieć niesie.
    """

    models: list[dict[str, Any]] = field(default_factory=list)


@dataclass(frozen=True)
class ArchiveFingerprints:
    """Fingerprints (hashe) wszystkich sekcji archiwum formatu 3.0.0.

    W1-B-ARCH: `network_model_hash`/`sld_hash`/`proofs_hash` skasowane razem z
    sekcjami, które hashowały (nie ma już dla nich żadnego źródła danych).
    Archiwa 2.x, które te pola JESZCZE niosą, weryfikuje `verify_archive_integrity`
    na SUROWYM słowniku JSON (poniżej) — niezależnie od tej klasy.
    """

    archive_hash: str  # Hash całego archiwum
    project_meta_hash: str
    cases_hash: str
    runs_hash: str
    results_hash: str
    interpretations_hash: str
    issues_hash: str
    enm_hash: str = ""  # puste w archiwach sprzed sekcji ENM


@dataclass(frozen=True)
class ProjectArchive:
    """
    Pełne archiwum projektu MV-DESIGN PRO (format 3.0.0).

    Format:
    - schema_version: wersja schematu archiwum
    - format_id: identyfikator formatu (MV-DESIGN-PRO-ARCHIVE)
    - project_meta: metadane projektu
    - cases: przypadki obliczeniowe
    - runs: wykonania analiz
    - results: wyniki (pusty kontener — patrz ResultsSection)
    - interpretations: interpretacje
    - issues: problemy/walidacje
    - enm: model(e) ENM (JEDYNY nośnik sieci — W1-B-ARCH)
    - fingerprints: hashe wszystkich sekcji

    Sekcje `network_model`/`sld_diagrams`/`proofs` NIE ISTNIEJĄ w tym formacie
    (W1-B-ARCH) — ich dane żywe wyparowały razem z tabelami ORM w W1.
    """

    schema_version: str
    format_id: str
    project_meta: ProjectMeta
    cases: CasesSection
    runs: RunsSection
    results: ResultsSection
    interpretations: InterpretationsSection
    issues: IssuesSection
    fingerprints: ArchiveFingerprints
    enm: EnmSection = field(default_factory=EnmSection)


# ============================================================================
# NARZĘDZIA DO HASHOWANIA (DETERMINISTYCZNE)
# ============================================================================


def _stable_sort_key(value: Any) -> str:
    """Klucz sortowania dla stabilnego porządku."""
    if isinstance(value, dict):
        for key in ("id", "snapshot_id", "node_id", "branch_id", "run_id", "name"):
            if key in value and value[key] is not None:
                return str(value[key])
    return str(value)


def canonicalize(value: Any) -> Any:
    """Kanonizacja wartości dla deterministycznego JSON."""
    if isinstance(value, dict):
        return {key: canonicalize(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [canonicalize(item) for item in value]
    if isinstance(value, tuple):
        return [canonicalize(item) for item in value]
    if isinstance(value, set):
        return sorted((canonicalize(item) for item in value), key=_stable_sort_key)
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def compute_hash(data: Any) -> str:
    """Oblicz deterministyczny hash SHA-256 dla danych."""
    canonical = canonicalize(data)
    json_str = json.dumps(canonical, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(json_str.encode("utf-8")).hexdigest()


def compute_archive_fingerprints(
    project_meta: dict[str, Any],
    cases: dict[str, Any],
    runs: dict[str, Any],
    results: dict[str, Any],
    interpretations: dict[str, Any],
    issues: dict[str, Any],
    enm: dict[str, Any] | None = None,
) -> ArchiveFingerprints:
    """Oblicz fingerprints dla wszystkich sekcji archiwum formatu 3.0.0.

    W1-B-ARCH: sygnatura niesie WYŁĄCZNIE sekcje formatu 3.0.0 — ten serwis
    eksportuje TYLKO 3.0.0 (nigdy 2.x), więc nie ma tu wariantu z
    `network_model`/`sld`/`proofs`. Weryfikacja archiwów 2.x (z tymi sekcjami)
    liczy je osobno, wprost z surowego słownika — `verify_archive_integrity`.
    """
    project_meta_hash = compute_hash(project_meta)
    cases_hash = compute_hash(cases)
    runs_hash = compute_hash(runs)
    results_hash = compute_hash(results)
    interpretations_hash = compute_hash(interpretations)
    issues_hash = compute_hash(issues)
    enm_hash = compute_hash(enm if enm is not None else {"models": []})

    # Hash całego archiwum to hash wszystkich hash'y sekcji formatu 3.0.0.
    archive_hash = compute_hash(
        {
            "project_meta": project_meta_hash,
            "cases": cases_hash,
            "runs": runs_hash,
            "results": results_hash,
            "interpretations": interpretations_hash,
            "issues": issues_hash,
            "enm": enm_hash,
        }
    )

    return ArchiveFingerprints(
        archive_hash=archive_hash,
        project_meta_hash=project_meta_hash,
        cases_hash=cases_hash,
        runs_hash=runs_hash,
        results_hash=results_hash,
        interpretations_hash=interpretations_hash,
        issues_hash=issues_hash,
        enm_hash=enm_hash,
    )


# ============================================================================
# SERIALIZACJA / DESERIALIZACJA
# ============================================================================


def archive_to_dict(archive: ProjectArchive) -> dict[str, Any]:
    """Konwersja archiwum do słownika (do JSON) — zawsze format 3.0.0."""
    return canonicalize(
        {
            "schema_version": archive.schema_version,
            "format_id": archive.format_id,
            "project_meta": {
                "id": archive.project_meta.id,
                "name": archive.project_meta.name,
                "description": archive.project_meta.description,
                "schema_version": archive.project_meta.schema_version,
                "connection_node_id": archive.project_meta.connection_node_id,
                "sources": archive.project_meta.sources,
                "created_at": archive.project_meta.created_at,
                "updated_at": archive.project_meta.updated_at,
            },
            "cases": {
                "study_cases": archive.cases.study_cases,
                "operating_cases": archive.cases.operating_cases,
                "settings": archive.cases.settings,
            },
            "runs": {
                "canonical_runs": archive.runs.canonical_runs,
                "analysis_runs_index": archive.runs.analysis_runs_index,
            },
            "results": {},
            "interpretations": {
                "cached": archive.interpretations.cached,
            },
            "issues": {
                "snapshot": archive.issues.snapshot,
            },
            "enm": {
                "models": archive.enm.models,
            },
            "fingerprints": {
                "archive_hash": archive.fingerprints.archive_hash,
                "project_meta_hash": archive.fingerprints.project_meta_hash,
                "cases_hash": archive.fingerprints.cases_hash,
                "runs_hash": archive.fingerprints.runs_hash,
                "results_hash": archive.fingerprints.results_hash,
                "interpretations_hash": archive.fingerprints.interpretations_hash,
                "issues_hash": archive.fingerprints.issues_hash,
                "enm_hash": archive.fingerprints.enm_hash,
            },
        }
    )


def dict_to_archive(data: dict[str, Any]) -> ProjectArchive:
    """Konwersja słownika (z JSON) do archiwum — akceptuje format 3.0.0 I 2.x.

    W1-B-ARCH: `ProjectArchive` formatu 3.0.0 nie ma pól dla `network_model`/
    `sld_diagrams`/`proofs` — jeśli `data` (archiwum 2.x) je niesie, są tu po
    prostu IGNOROWANE (żadnego pola „dla zgodności"). Surowy słownik `data`
    (z tymi sekcjami) zostaje jednak dostępny wołającemu PRZED tym wywołaniem
    (`json.loads(project.json)`) — `application/project_archive/service.py`
    sięga po `data["network_model"]` wprost, gdy trzeba skompilować model z
    danych legacy (archiwum 2.x bez `enm.models`).
    """
    # Walidacja podstawowej struktury — sekcje formatu 3.0.0.
    required_keys = [
        "schema_version",
        "format_id",
        "project_meta",
        "cases",
        "runs",
        "results",
        "fingerprints",
    ]
    for key in required_keys:
        if key not in data:
            raise ArchiveStructureError(f"Brak wymaganej sekcji: {key}")

    # Walidacja format_id
    if data["format_id"] != ARCHIVE_FORMAT_ID:
        raise ArchiveStructureError(f"Nieprawidłowy identyfikator formatu: {data['format_id']}")

    # Walidacja wersji (obsługujemy migracje)
    schema_version = data["schema_version"]
    if not _is_compatible_version(schema_version):
        raise ArchiveVersionError(ARCHIVE_SCHEMA_VERSION, schema_version)

    pm = data["project_meta"]
    cases = data["cases"]
    runs = data["runs"]
    interpretations = data.get("interpretations", {"cached": []})
    issues = data.get("issues", {"snapshot": []})
    enm = data.get("enm", {"models": []})
    fp = data["fingerprints"]

    return ProjectArchive(
        schema_version=schema_version,
        format_id=data["format_id"],
        project_meta=ProjectMeta(
            id=pm["id"],
            name=pm["name"],
            description=pm.get("description"),
            schema_version=pm["schema_version"],
            connection_node_id=pm.get("connection_node_id"),
            sources=pm.get("sources", []),
            created_at=pm["created_at"],
            updated_at=pm["updated_at"],
        ),
        cases=CasesSection(
            study_cases=cases.get("study_cases", []),
            operating_cases=cases.get("operating_cases", []),
            settings=cases.get("settings"),
        ),
        runs=RunsSection(
            canonical_runs=runs.get("canonical_runs", []),
            analysis_runs_index=runs.get("analysis_runs_index", []),
        ),
        results=ResultsSection(),
        interpretations=InterpretationsSection(
            cached=interpretations.get("cached", []),
        ),
        issues=IssuesSection(
            snapshot=issues.get("snapshot", []),
        ),
        enm=EnmSection(
            models=enm.get("models", []),
        ),
        fingerprints=ArchiveFingerprints(
            archive_hash=fp["archive_hash"],
            project_meta_hash=fp["project_meta_hash"],
            cases_hash=fp["cases_hash"],
            runs_hash=fp["runs_hash"],
            results_hash=fp["results_hash"],
            interpretations_hash=fp.get("interpretations_hash", ""),
            issues_hash=fp.get("issues_hash", ""),
            enm_hash=fp.get("enm_hash", ""),
        ),
    )


def _is_compatible_version(version: str) -> bool:
    """Sprawdź czy wersja schematu jest kompatybilna."""
    # Parsowanie wersji semantycznej
    try:
        parts = version.split(".")
        major = int(parts[0])
        # Kompatybilność w ramach tej samej wersji major
        current_parts = ARCHIVE_SCHEMA_VERSION.split(".")
        current_major = int(current_parts[0])
        return major <= current_major
    except (ValueError, IndexError):
        return False


# Klucz sekcji (jak w słowniku JSON archiwum) -> (nazwa pola hasha w
# fingerprints, nazwa klucza sekcji wewnątrz `archive_hash` = hash-hashy).
# W1-B-ARCH §0.3: weryfikacja integralności działa na SUROWYM słowniku, więc
# ta tabela musi obejmować RÓWNIEŻ sekcje, których format 3.0.0 już nie ma
# (`network_model`/`sld_diagrams`/`proofs`) — inaczej archiwa 2.x weryfikowałyby
# się „w przybliżeniu" (bez tych trzech sekcji), nie DOKŁADNIE. Nazwa "sld" (nie
# "sld_diagrams") wewnątrz `archive_hash` jest CELOWA — dokładnie tak liczyła tę
# sekcję historyczna `compute_archive_fingerprints` formatu 2.x, a `archive_hash`
# musi się odtworzyć BIT W BIT, żeby weryfikacja była dokładna, nie przybliżona.
_SECTION_HASH_FIELDS: tuple[tuple[str, str, str], ...] = (
    ("project_meta", "project_meta_hash", "project_meta"),
    ("network_model", "network_model_hash", "network_model"),
    ("sld_diagrams", "sld_hash", "sld"),
    ("cases", "cases_hash", "cases"),
    ("runs", "runs_hash", "runs"),
    ("results", "results_hash", "results"),
    ("proofs", "proofs_hash", "proofs"),
    ("interpretations", "interpretations_hash", "interpretations"),
    ("issues", "issues_hash", "issues"),
    ("enm", "enm_hash", "enm"),
)


def verify_archive_integrity(data: dict[str, Any]) -> list[str]:
    """
    Weryfikacja integralności archiwum NA SUROWYM słowniku JSON (§0.3).

    Działa identycznie dla KAŻDEJ wczytywalnej wersji formatu, bo nie przechodzi
    przez `ProjectArchive` (ta klasa formatu 3.0.0 nie niesie już sekcji
    `network_model`/`sld_diagrams`/`proofs`, więc przeliczanie z niej pomijałoby
    je w archiwum 2.x — "w przybliżeniu", nie dokładnie). Sekcje do sprawdzenia
    wyznacza `fingerprints` SAMEGO archiwum: dla 3.0.0 to `project_meta/cases/
    runs/results/interpretations/issues/enm` (siedem pól); dla 2.x DODATKOWO
    `network_model_hash`/`sld_hash`/`proofs_hash` — dokładnie te klucze, które
    `compute_archive_fingerprints` DANEJ wersji policzyła przy eksporcie.

    `archive_hash` jest weryfikowany NAPRAWDĘ (hash słownika hashy sekcji, w
    dokładnie tej postaci) — nie tylko sekcje składowe.

    Zwraca listę błędów (pusta = OK).
    """
    errors: list[str] = []
    fingerprints = data.get("fingerprints") or {}
    if not isinstance(fingerprints, dict):
        return ["Błąd integralności: sekcja 'fingerprints' nie jest słownikiem"]

    hashy_sekcji: dict[str, str] = {}
    for section_key, fp_field, archive_hash_key in _SECTION_HASH_FIELDS:
        stored_hash = fingerprints.get(fp_field)
        if not stored_hash:
            # Pole nieobecne albo puste = sekcja nie istniała w TEJ wersji formatu
            # (np. network_model_hash w archiwum 3.0.0, albo interpretations_hash
            # w archiwum sprzed tej sekcji) — nic do sprawdzenia, zgodnie z zamysłem.
            continue
        if section_key not in data:
            errors.append(
                f"Błąd integralności: fingerprints wymaga sekcji '{section_key}', "
                "a archiwum jej nie zawiera"
            )
            continue
        computed_hash = compute_hash(data[section_key])
        hashy_sekcji[archive_hash_key] = computed_hash
        if computed_hash != stored_hash:
            errors.append(
                f"Błąd integralności sekcji '{section_key}': "
                f"oczekiwano {stored_hash}, obliczono {computed_hash}"
            )

    stored_archive_hash = fingerprints.get("archive_hash")
    if stored_archive_hash:
        computed_archive_hash = compute_hash(hashy_sekcji)
        if computed_archive_hash != stored_archive_hash:
            errors.append(
                "Błąd integralności archiwum: "
                f"oczekiwano {stored_archive_hash}, obliczono {computed_archive_hash}"
            )
    else:
        errors.append("Błąd integralności: brak 'archive_hash' w fingerprints")

    return errors


# ============================================================================
# WYNIK IMPORTU
# ============================================================================


@dataclass
class ArchiveImportResult:
    """Wynik operacji importu archiwum."""

    status: ArchiveImportStatus
    project_id: str | None
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    migrated_from_version: str | None = None
    # Bramka katalogowa po imporcie — lista elementow bez catalog_ref
    elements_without_catalog: list[str] = field(default_factory=list)
    catalog_mapping_required: bool = False
