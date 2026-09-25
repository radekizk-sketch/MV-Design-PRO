"""
Catalog governance: bramka katalogowa importu + governance biblioteki zabezpieczen (P14b)

W1 (2026-09-09): governance biblioteki typow sieci (P13b — `TypeLibraryManifest`,
`TypeLibraryExport`, `ImportConflict`, `ImportReport`, `compute_fingerprint`,
`sort_types_deterministically`) skasowane razem z tabelami typow w bazie i
koncowkami eksportu/importu (jedyny konsument — przyciski w `ui/catalog/TypeLibraryBrowser.tsx`
— skasowany razem z nimi). Zostaje:
- `ImportMode` + `wymagalnosc_katalogu` (bramka katalogowa: tworzenie/walidacja/import),
- governance biblioteki zabezpieczen: manifest/eksport/import/odcisk (MERGE/REPLACE).

Canonical reference: SYSTEM_SPEC.md § 4 (Catalog); versioning/export/import
governance rules below are spelled out in docs/system/SPEC_KATALOGI_I_MATERIALIZACJA_
PARAMETROW.md, section "Governance biblioteki typow" (each rule cites the enforcing
symbol here and its pinning test). The retired CT-* checklist that used to be cited
here lives at docs/audit/archive/CANONICAL_COMPLIANCE_2026-01.md CT-* as historical
context only.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any
from uuid import uuid4


class ImportMode(Enum):
    """Import mode for type library."""

    MERGE = "merge"  # Add new types, skip existing (safe default)
    REPLACE = "replace"  # Replace library (blocked if types are in use)


# ---------------------------------------------------------------------------
# Bramka katalogowa — JEDNO ZRODLO PRAWDY dla WSZYSTKICH drog (tworzenie /
# walidacja / import), karta W3-I (§0.15 karty konwergencji fizyki)
# ---------------------------------------------------------------------------
#
# KLASA, NIE INSTANCJA: „ktory rodzaj elementu wymaga referencji katalogowej,
# na ktorej osi (tworzenie w operacji domenowej / walidacja ENM / import z
# pliku zewnetrznego)" bylo rozstrzygane NIEZALEZNIE w SZESCIU miejscach
# nazwanych w karcie W3-I — `enm/validator.py` (E009), `application/
# project_archive/service.py` (bramka ZIP), `infrastructure/cgmes/
# cgmes_importer.py` (`_elements_without_catalog`), `application/xlsx_import/
# importer.py` (wiersz bez typu), `api/domain_ops_policy.py::
# CATALOG_REQUIRED_OPERATIONS` + `enm/domain_operations_v2.py::
# V2_CATALOG_GATE_INVENTORY` (brama operacji), `enm/v2_projection.py`
# (ostrzezenie migracji / jakosc projekcji generatora przeksztaltnikowego) —
# PLUS SIODME, znalezione dopiero przy weryfikacji DoD tej karty (grep
# dosłownego predykatu w calym `backend/src` po naprawie szesciu nazwanych
# miejsc nie wracal zera): `application/eligibility_service.py::
# _check_catalog_refs` (brama eligibility SC_3F/SC_1F/SC_2F/LOAD_FLOW/
# FAULT_LOOP_NN/SWZ_NN). Trzy z siedmiu (E009, ZIP, eligibility) powielaly
# DOSLOWNIE ten sam warunek (`isinstance(branch, OverheadLine | Cable) and
# not branch.catalog_ref`) z WLASNYM zestawem wyjatkow — CGMES nie znal
# wyjatku `MANUAL_EQUIVALENT` dla zrodel (importowal poprawne zrodlo z jawnym
# Sk''/RX jako „wymaga mapowania katalogowego", mimo ze walidator E009 to
# samo zrodlo przepuszcza), eligibility nie sprawdzalo zrodel WCALE (tylko
# galezie/transformatory), a generator przeksztaltnikowy nie mial ZADNEGO
# kodu walidatora (E009 go pomija), mimo ze tworzenie go BEZ katalogu jest
# 422 (`catalog.ref_required`) i gotowosc zwarciowa blokuje bez katalogu
# (`inverter.k_sc_missing`) — trzy poziomy w trzech miejscach, bez jednego
# zrodla prawdy.
#
# `wymagalnosc_katalogu(rodzaj, ...)` zastepuje wszystkie siedem — kazdy z
# nich CZYTA ta funkcje zamiast trzymac wlasny predykat (patrz wolajacy w
# `enm/validator.py`, `application/project_archive/service.py`,
# `infrastructure/cgmes/cgmes_importer.py`, `application/xlsx_import/
# importer.py`, `enm/v2_projection.py`, `application/calculation_readiness/
# service.py`, `application/eligibility_service.py`). Brama operacji
# (`CATALOG_REQUIRED_OPERATIONS`/`V2_CATALOG_GATE_INVENTORY`) zostaje
# kluczowana OPERACJA (kontrakt payloadow — inny ksztalt problemu), ale
# dostaje test parytetu z ta tabela
# (`tests/api/test_katalog_predykat_operacje_parytet.py`): dla kazdej operacji
# tworzacej element `tworzenie(rodzaj) == BLOCKER` musi sie zgadzac z
# obecnoscia operacji w `CATALOG_REQUIRED_OPERATIONS` (rozjazdy NAZWANE tam,
# nie zamiecione).
#
# KAZDA komorka ponizej ma w komentarzu miejsce (plik:linia), z ktorego POZIOM
# zostal ZMIERZONY 2026-09-09 (karta W3-I: „to jest karta konwergencji, nie
# polityki" — poziomy istniejacych kodow NIE zmieniaja sie, tylko ich miejsce
# przechowywania).
class Poziom(Enum):
    """Poziom wymagalnosci referencji katalogowej na jednej osi."""

    BLOCKER = "BLOCKER"
    WARNING = "WARNING"
    NIE = "NIE"


@dataclass(frozen=True)
class WymagalnoscKatalogu:
    """Wymagalnosc referencji katalogowej dla jednego rodzaju elementu, na
    trzech niezaleznych osiach cyklu zycia elementu.

    Attributes:
        tworzenie: poziom przy TWORZENIU elementu operacja domenowa (API,
            `api/domain_ops_policy.py` / `enm/domain_operations_v2.py`).
        walidacja: poziom przy WALIDACJI modelu ENM juz istniejacego
            (`enm/validator.py`, kod w `kod_walidacji`).
        import_: poziom przy IMPORCIE z pliku zewnetrznego (ZIP archiwum
            projektu, CGMES, XLSX).
        kod_walidacji: kod `ValidationIssue.code` w `enm/validator.py`
            odpowiadajacy osi `walidacja`, albo ``None``, gdy zaden kod nie
            istnieje (poziom `NIE`, albo wymog egzekwowany WYLACZNIE poza
            walidatorem — np. tylko przy tworzeniu).
    """

    tworzenie: Poziom
    walidacja: Poziom
    import_: Poziom
    kod_walidacji: str | None = None


def brakuje_wymaganej_referencji(poziom: Poziom, catalog_ref: str | None) -> bool:
    """Czy elementowi brakuje referencji katalogowej, której ta oś wymaga.

    Jedna, współdzielona kombinacja „poziom != NIE i `catalog_ref` puste" —
    każdy z sześciu konsumentów tabeli (walidator, bramka ZIP, CGMES,
    projekcja V2) składał ją OSOBNO (`isinstance(...) and not branch.
    catalog_ref`, `not trafo.catalog_ref`, `not source.catalog_ref`,
    `gen_type in {...} and not generator.catalog_ref` — cztery niezależne
    miejsca tej samej kombinacji, karta W3-I). `poziom != NIE` (nie tylko
    `== BLOCKER`) celowo obejmuje też `WARNING` (generator przekształtnikowy:
    walidacja W010, import — ostrzeżenie migracji V12-MIG-GEN-002, żaden z
    dwóch nigdy nie jest BLOCKER dla tego rodzaju) — dokładnie ten sam
    warunek obsługuje obie osie bez rozgałęzienia u wołającego. Wołający
    dostarcza WŁAŚCIWĄ oś (`wymagalnosc.tworzenie`/`.walidacja`/`.import_`) i
    sam dobiera severity swojego kontraktu (`SEVERITY_BLOCKER`/
    `SEVERITY_IMPORTANT`) z `poziom` — funkcja nie zgaduje severity za
    wołającego.
    """
    return poziom is not Poziom.NIE and not catalog_ref


# Core (`network_model.core.branch.BranchType`) uzywa WIELKICH liter
# (`CABLE`, `LINE`, `TRANSFORMER`); ENM (`enm/models.py`, importery, operacje
# domenowe) uzywa snake_case, z dwoma aliasami dla linii napowietrznej
# (`line_overhead` / `overhead_line`) i core `LINE`, ktore NIE lowercasuja sie
# wprost do tej samej nazwy — stad jawna mapa zamiast samego `.lower()`.
_ALIASY_RODZAJU: dict[str, str] = {
    "cable": "cable",
    "line": "line_overhead",
    "line_overhead": "line_overhead",
    "overhead_line": "line_overhead",
    "transformer": "transformer",
    "source": "source",
    "generator": "generator",
    "load": "load",
    "switch": "switch",
    "breaker": "switch",
    "fuse": "fuse",
    "measurement": "measurement",
    "protection": "protection",
    "shunt_capacitor": "shunt_capacitor",
}

#: Rodzaje galezi normalizujace do rodziny „odcinek SN" (linia/kabel) —
#: jedyna galaz, ktorej wymagalnosc jest dzis identyczna z transformatorem.
_RODZAJE_GALEZI_WYMAGAJACE_KATALOGU: frozenset[str] = frozenset({"cable", "line_overhead"})


#: Generator przeksztaltnikowy w SENSIE ZWARCIOWYM (IEC 60909 §6.7, model
#: `InverterSource` z Ik = k_sc*In) — `enm/mapping.py::FULL_CONVERTER_SC_GEN_TYPES`,
#: IMPORTOWANY, nie kopiowany (decyzja architekta §0.15 pkt 1). ZASTANY, INNY
#: zbior `enm/models.py::GEN_TYPES_PRZEKSZTALTNIKOWE` (6 pozycji, obejmuje tez
#: `fw_dfig`/`fw_scig` — maszyny wirujace) sluzy INNEMU pytaniu (czy generator
#: jest DER dla bram gotowosci / mostu zgodnosci NC RfG, wlasny docstring w
#: `models.py` to nazywa wprost) — NIE wolno go tu podstawic (dwie klasy
#: pytan, jedna nazwa „przeksztaltnikowy").
#: Import odroczony (wewnatrz funkcji) — `enm.mapping` importuje
#: `network_model.catalog.types`/`network_model.core.*`; modul katalogu jest
#: warstwa NIZSZA niz `enm`, wiec import na poziomie modulu odwracalby
#: kierunek zaleznosci (wzorzec juz uzywany w tym repo do tego samego celu:
#: `api/domain_ops_policy.py` importuje `network_model.catalog.repository`/
#: `audit2_catalogs` wewnatrz funkcji z tego samego powodu).
def _generator_przeksztaltnikowy(gen_type: str | None) -> bool:
    from enm.mapping import FULL_CONVERTER_SC_GEN_TYPES

    return gen_type is not None and gen_type in FULL_CONVERTER_SC_GEN_TYPES


#: Kod walidatora E009 (`enm/validator.py:698-772`, ZMIERZONY 2026-09-09):
#: linie/kable (:698-718), transformatory (:720-740), zrodla systemowe BEZ
#: `parameter_source == "MANUAL_EQUIVALENT"` (:742-772; wyjatek K1.2, zrodlo z
#: jawnym Sk''/RX — `add_grid_source_sn.manual_equivalent`).
_KOD_E009 = "E009"

#: Kod NOWY (karta W3-I §0.15 pkt 1): generator przeksztaltnikowy bez
#: referencji katalogowej — WARNING (nie BLOKUJE zwarcia w walidacji ENM;
#: gotowosc SC blokuje OSOBNYM kodem `inverter.k_sc_missing`, patrz
#: `application/calculation_readiness/service.py:264-275`, bez zmian
#: poziomu). Numer nastepny wolny po W001-W009 (`enm/validator.py`, pomiar
#: 2026-09-09: W001-W009, W040-W041, W060-W062 zajete).
_KOD_W010 = "W010"


def wymagalnosc_katalogu(
    rodzaj: str,
    *,
    parameter_source: str | None = None,
    gen_type: str | None = None,
) -> WymagalnoscKatalogu:
    """Wymagalnosc referencji katalogowej dla ``rodzaj`` na trzech osiach.

    JEDYNE zrodlo prawdy dla „czy element tego rodzaju wymaga katalogu" —
    czytane przez walidator ENM (E009 + W010), bramke importu ZIP, CGMES,
    XLSX, projekcje V2 i gotowosc obliczeniowa (karta W3-I). Poziomy sa
    ZMIERZONA dzisiejsza semantyka kodu na 2026-09-09 (karta konwergencji,
    nie polityki) — kazda galaz `if` ponizej cytuje plik:linie pomiaru.

    Args:
        rodzaj: rodzaj elementu w dowolnym nazewnictwie systemu — ENM
            (``cable``/``line_overhead``/``transformer``/``source``/
            ``generator``/``load``/``switch``/``breaker``/``fuse``/
            ``measurement``/``protection``/``shunt_capacitor``) albo rdzen
            solverowy (``CABLE``/``LINE``/``TRANSFORMER``). Rodzaj
            nierozpoznany -> `Poziom.NIE` na wszystkich trzech osiach (zero
            fabrykacji wymogu, ktorego zaden pomiar nie potwierdza).
        parameter_source: dla ``rodzaj="source"`` — wartosc pola
            `Source.parameter_source`. `"MANUAL_EQUIVALENT"` zdejmuje wymog
            na WSZYSTKICH trzech osiach (K1.2: zrodlo z jawnym Sk''/RX, bez
            pozycji katalogowej, jest kompletne z definicji).
        gen_type: dla ``rodzaj="generator"`` — wartosc pola
            `Generator.gen_type`. Steruje WYLACZNIE osiami `walidacja`/
            `import_` (generator przeksztaltnikowy wg
            `enm.mapping.FULL_CONVERTER_SC_GEN_TYPES` -> WARNING; kazdy inny,
            w tym `"synchronous"` i `None` -> NIE na tych dwoch osiach). Os
            `tworzenie` jest BLOCKER dla KAZDEGO generatora niezaleznie od
            `gen_type` — zmierzone: `enm/domain_operations_v2.py:6135-6144`
            (`add_generator_sn`, generator SYNCHRONICZNY, komentarz „K1.2 —
            element fizyczny, bez wyjatku dla generatorow", kod
            `generator.catalog_required`) I `add_converter_source`
            (generator PV/BESS/FW, w `CATALOG_REQUIRED_OPERATIONS`) —
            zaden tor tworzenia generatora nie ma wyjatku od katalogu.

    Returns:
        `WymagalnoscKatalogu` z poziomem na kazdej z trzech osi.
    """
    znormalizowany = _ALIASY_RODZAJU.get((rodzaj or "").strip().lower())

    if znormalizowany in _RODZAJE_GALEZI_WYMAGAJACE_KATALOGU:
        # Linia/kabel SN: tworzenie BLOCKER — `api/domain_ops_policy.py:38-61`
        # (`CATALOG_REQUIRED_OPERATIONS`: `continue_trunk_segment_sn`,
        # `start_branch_segment_sn`, `connect_secondary_ring_sn`); walidacja
        # BLOCKER E009 — `enm/validator.py:698-718`; import BLOCKER —
        # `application/project_archive/service.py:939-941` (ZIP),
        # `infrastructure/cgmes/cgmes_importer.py:487-489` (CGMES),
        # `application/xlsx_import/importer.py:943-973` (XLSX, wiersz bez
        # pelnej tabliczki i bez typu katalogowego = blad wiersza).
        return WymagalnoscKatalogu(Poziom.BLOCKER, Poziom.BLOCKER, Poziom.BLOCKER, _KOD_E009)

    if znormalizowany == "transformer":
        # Tworzenie BLOCKER — `api/domain_ops_policy.py:49` (`add_transformer_
        # sn_nn`) + stacyjne (`insert_station_on_segment_sn`,
        # `append_station_on_endpoint`, transformator gdy zadany).
        # Walidacja BLOCKER E009 — `enm/validator.py:720-740`. Import BLOCKER
        # — `project_archive/service.py:942-944` („transformatory ZAWSZE",
        # bez posredniej bramki `_RODZAJE_GALEZI_WYMAGAJACE_KATALOGU`),
        # `cgmes_importer.py:490-492`, `xlsx_import/importer.py:991-1044`.
        return WymagalnoscKatalogu(Poziom.BLOCKER, Poziom.BLOCKER, Poziom.BLOCKER, _KOD_E009)

    if znormalizowany == "source":
        if parameter_source == "MANUAL_EQUIVALENT":
            # K1.2 — zrodlo z jawnym Sk''/RX (`add_grid_source_sn.manual_
            # equivalent`), BEZ pozycji katalogowej z definicji. Wyjatek na
            # WSZYSTKICH trzech osiach — zmierzone: `enm/validator.py:742-772`
            # (E009 juz go respektuje). CGMES `_elements_without_catalog`
            # (`infrastructure/cgmes/cgmes_importer.py:484-496`) tego wyjatku
            # NIE MIAL przed ta karta (defekt nazwany w meldunku W3-I) —
            # po tej karcie respektuje go jak walidator.
            return WymagalnoscKatalogu(Poziom.NIE, Poziom.NIE, Poziom.NIE, None)
        # Tworzenie BLOCKER — `api/domain_ops_policy.py:40` (`add_grid_source_
        # sn` w `CATALOG_REQUIRED_OPERATIONS`, poza MANUAL_EQUIVALENT).
        # Walidacja BLOCKER E009 — `enm/validator.py:742-772`. Import BLOCKER
        # — `cgmes_importer.py:493-495` (jedyny z SZESCIU torow, ktory dzis
        # sprawdza zrodla; ZIP `project_archive/service.py::
        # _find_elements_without_catalog` ich NIE sprawdzalo wcale — rozjazd
        # nazwany w meldunku W3-I, naprawiony przez wpiecie zrodel w ZIP po
        # tej karcie, zeby bylo spojne z CGMES i E009).
        return WymagalnoscKatalogu(Poziom.BLOCKER, Poziom.BLOCKER, Poziom.BLOCKER, _KOD_E009)

    if znormalizowany == "generator":
        # Tworzenie BLOCKER dla KAZDEGO gen_type — patrz docstring parametru
        # `gen_type` powyzej (`add_generator_sn` + `add_converter_source`,
        # zaden wyjatek). Walidacja/import zaleza od klasyfikacji zwarciowej.
        if _generator_przeksztaltnikowy(gen_type):
            # Walidacja WARNING, kod W010 (NOWY, ta karta) — E009 milczal dla
            # generatorow (`enm/validator.py:697-772` nie iteruje
            # `enm.generators`), mimo ze tworzenie odmawia bez katalogu
            # (422 `catalog.ref_required`) i gotowosc SC blokuje
            # (`inverter.k_sc_missing`) — rozjazd nazwany w meldunku W3-I,
            # zamkniety nowym kodem walidatora. Import WARNING (raport
            # migracji, nie odmowa) — `enm/v2_projection.py:470-478`
            # (`V12-MIG-GEN-002`, `severity="ostrzezenie"`).
            return WymagalnoscKatalogu(Poziom.BLOCKER, Poziom.WARNING, Poziom.WARNING, _KOD_W010)
        # Generator inny (w tym `"synchronous"` i `gen_type=None`): walidacja
        # i import NIE — zaden kod E0xx/W0xx go nie sprawdza (pomiar:
        # `enm/validator.py` — grep `enm.generators` = 0 poza kodem W010
        # powyzej), zaden import (ZIP/CGMES/XLSX) nie tworzy/sprawdza
        # generatorow.
        return WymagalnoscKatalogu(Poziom.BLOCKER, Poziom.NIE, Poziom.NIE, None)

    if znormalizowany == "load":
        # Tworzenie BLOCKER — `api/domain_ops_policy.py:50` (`add_nn_load` w
        # `CATALOG_REQUIRED_OPERATIONS`; wyjatek `EKSPERCKI_RECZNY` jest
        # WEWNETRZNA logika TEJ bramy operacji, poza zakresem tej tabeli —
        # decyzja architekta §0.15 pkt 2 zostawia brame operacji kluczowana
        # operacja). `add_load_sn` (odbior SN wprost na szynie) jest
        # UDOKUMENTOWANYM wyjatkiem od tej komorki — katalog OPCJONALNY
        # (`enm/domain_operations_v2.py` komentarz przy
        # `V2_CATALOG_GATE_INVENTORY`: „odbior nie jest wyrobem katalogowym"),
        # NIE w `CATALOG_REQUIRED_OPERATIONS` — nazwany w
        # `tests/api/test_katalog_predykat_operacje_parytet.py`.
        # Walidacja/import NIE — brak kodu E0xx dla `Load.catalog_ref`, brak
        # sprawdzenia w ZIP/CGMES/XLSX (XLSX nie ma kolumny katalogu odbioru).
        return WymagalnoscKatalogu(Poziom.BLOCKER, Poziom.NIE, Poziom.NIE, None)

    if znormalizowany in {"switch", "fuse", "measurement", "protection"}:
        # Tworzenie BLOCKER — `api/domain_ops_policy.py:38-61`: lacznik pola
        # (`add_sn_bay`, `add_sn_bay_from_catalog`, `insert_section_switch_sn`,
        # `add_nn_switch_device` [switch LUB fuse — device_class],
        # `add_nn_section_coupler`), CT/VT (`add_ct`/`add_vt`), przekaznik
        # (`add_relay`) — wszystkie w `CATALOG_REQUIRED_OPERATIONS`.
        # Walidacja/import NIE — brak kodu E0xx dla tych rodzajow, brak
        # sprawdzenia w ZIP/CGMES/XLSX (schemat XLSX nie ma tych arkuszy).
        return WymagalnoscKatalogu(Poziom.BLOCKER, Poziom.NIE, Poziom.NIE, None)

    if znormalizowany == "shunt_capacitor":
        # Tworzenie NIE — `add_shunt_compensator_sn` NIE jest w
        # `CATALOG_REQUIRED_OPERATIONS` (`api/domain_ops_policy.py:38-61`);
        # gdy referencja JEST podana, jej ISTNIENIE jest sprawdzane
        # (`_referencje_dodatkowe`/`API_CATALOG_GATE_INVENTORY:740`), ale
        # brak referencji nie jest bledem — bateria kondensatorow nie jest
        # dzis wyrobem katalogowym wymaganym z definicji. Walidacja/import
        # NIE — brak kodu E0xx, brak sprawdzenia w ZIP/CGMES/XLSX.
        return WymagalnoscKatalogu(Poziom.NIE, Poziom.NIE, Poziom.NIE, None)

    # Rodzaj nierozpoznany (w tym pusty/None) — zero fabrykacji wymogu.
    return WymagalnoscKatalogu(Poziom.NIE, Poziom.NIE, Poziom.NIE, None)


# ============================================================================
# Protection Library Governance (P14b)
# ============================================================================


@dataclass(frozen=True)
class ProtectionLibraryManifest:
    """
    Protection library manifest for governance and versioning.

    PowerFactory-aligned metadata for protection library management.
    Contains versioning info, vendor/series/revision, and deterministic fingerprint.

    Attributes:
        library_id: Stable library identifier (UUID).
        name_pl: Polish name of the library.
        vendor: Vendor/manufacturer name.
        series: Product series/line.
        revision: Revision string or int.
        schema_version: Schema version for future compatibility.
        created_at: ISO 8601 timestamp of creation.
        fingerprint: SHA-256 hash of canonical JSON export.
        description_pl: Optional Polish description.
    """

    library_id: str
    name_pl: str
    vendor: str
    series: str
    revision: str
    schema_version: str
    created_at: str
    fingerprint: str
    description_pl: str = ""

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary (canonical order)."""
        return {
            "library_id": self.library_id,
            "name_pl": self.name_pl,
            "vendor": self.vendor,
            "series": self.series,
            "revision": self.revision,
            "schema_version": self.schema_version,
            "created_at": self.created_at,
            "fingerprint": self.fingerprint,
            "description_pl": self.description_pl,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ProtectionLibraryManifest:
        """Create from dictionary."""
        return cls(
            library_id=str(data.get("library_id", str(uuid4()))),
            name_pl=str(data.get("name_pl", "")),
            vendor=str(data.get("vendor", "")),
            series=str(data.get("series", "")),
            revision=str(data.get("revision", "")),
            schema_version=str(data.get("schema_version", "1.0")),
            created_at=str(data.get("created_at", datetime.utcnow().isoformat())),
            fingerprint=str(data.get("fingerprint", "")),
            description_pl=str(data.get("description_pl", "")),
        )


@dataclass(frozen=True)
class ProtectionLibraryExport:
    """
    Protection library export structure.

    Contains manifest and all protection type records.
    Deterministically serialized (canonical JSON with sorted keys).

    Attributes:
        manifest: Library metadata.
        device_types: List of protection device types (deterministic order).
        curves: List of protection curves (deterministic order).
        templates: List of protection setting templates (deterministic order).
    """

    manifest: ProtectionLibraryManifest
    device_types: list[dict[str, Any]]
    curves: list[dict[str, Any]]
    templates: list[dict[str, Any]]

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary (canonical order)."""
        return {
            "manifest": self.manifest.to_dict(),
            "device_types": self.device_types,
            "curves": self.curves,
            "templates": self.templates,
        }

    def to_canonical_json(self) -> str:
        """
        Export to canonical JSON.

        Deterministic serialization:
        - Sorted keys at all levels
        - No whitespace
        - Stable ordering of lists (name_pl → id)

        Returns:
            Canonical JSON string.
        """
        return json.dumps(self.to_dict(), sort_keys=True, separators=(",", ":"))

    def to_fingerprint_payload_dict(self) -> dict[str, Any]:
        """
        Export to fingerprint payload (excludes runtime fields).

        Deterministic payload for fingerprint computation:
        - Excludes runtime fields: created_at, fingerprint, library_id
        - Includes stable metadata: vendor, series, revision, schema_version
        - Includes all type lists (already sorted deterministically)

        This ensures that two exports with the same catalog content
        produce identical fingerprints, regardless of export timestamp.

        Returns:
            Dictionary suitable for deterministic fingerprint computation.
        """
        return {
            "manifest": {
                "name_pl": self.manifest.name_pl,
                "vendor": self.manifest.vendor,
                "series": self.manifest.series,
                "revision": self.manifest.revision,
                "schema_version": self.manifest.schema_version,
                "description_pl": self.manifest.description_pl,
            },
            "device_types": self.device_types,
            "curves": self.curves,
            "templates": self.templates,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ProtectionLibraryExport:
        """Create from dictionary."""
        return cls(
            manifest=ProtectionLibraryManifest.from_dict(data.get("manifest", {})),
            device_types=list(data.get("device_types", [])),
            curves=list(data.get("curves", [])),
            templates=list(data.get("templates", [])),
        )


@dataclass
class ProtectionImportConflict:
    """
    Conflict detected during protection import.

    Attributes:
        kind: Kind of protection item (device_type/curve/template).
        id: Conflicting item ID.
        name_pl: Item name in Polish.
        reason_code: Conflict reason code (e.g., "exists_different", "ref_missing").
    """

    kind: str
    id: str
    name_pl: str
    reason_code: str


@dataclass
class ProtectionImportReport:
    """
    Report of protection import operation.

    Attributes:
        mode: Import mode used (MERGE or REPLACE).
        added: List of added items (deterministic order).
        skipped: List of skipped items (deterministic order).
        conflicts: List of conflicts encountered (deterministic order).
        blocked: List of blocked items (REPLACE mode, items in use).
        success: True if import succeeded without conflicts.
    """

    mode: ImportMode
    added: list[ProtectionImportConflict] = field(default_factory=list)
    skipped: list[ProtectionImportConflict] = field(default_factory=list)
    conflicts: list[ProtectionImportConflict] = field(default_factory=list)
    blocked: list[ProtectionImportConflict] = field(default_factory=list)
    success: bool = True

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary (deterministic order)."""
        return {
            "mode": self.mode.value,
            "added": sorted(
                [
                    {
                        "kind": item.kind,
                        "id": item.id,
                        "name_pl": item.name_pl,
                        "reason_code": item.reason_code,
                    }
                    for item in self.added
                ],
                key=lambda x: (x["kind"], x["name_pl"], x["id"]),
            ),
            "skipped": sorted(
                [
                    {
                        "kind": item.kind,
                        "id": item.id,
                        "name_pl": item.name_pl,
                        "reason_code": item.reason_code,
                    }
                    for item in self.skipped
                ],
                key=lambda x: (x["kind"], x["name_pl"], x["id"]),
            ),
            "conflicts": sorted(
                [
                    {
                        "kind": item.kind,
                        "id": item.id,
                        "name_pl": item.name_pl,
                        "reason_code": item.reason_code,
                    }
                    for item in self.conflicts
                ],
                key=lambda x: (x["kind"], x["name_pl"], x["id"]),
            ),
            "blocked": sorted(
                [
                    {
                        "kind": item.kind,
                        "id": item.id,
                        "name_pl": item.name_pl,
                        "reason_code": item.reason_code,
                    }
                    for item in self.blocked
                ],
                key=lambda x: (x["kind"], x["name_pl"], x["id"]),
            ),
            "success": self.success,
        }


def compute_protection_fingerprint(export: ProtectionLibraryExport) -> str:
    """
    Compute SHA-256 fingerprint of deterministic protection export payload.

    Deterministic hash based on canonical JSON serialization of payload
    WITHOUT runtime fields (created_at, fingerprint, library_id).

    This ensures that two exports with identical catalog content
    produce the same fingerprint, regardless of export timestamp or library_id.

    Args:
        export: Protection library export to fingerprint.

    Returns:
        SHA-256 hex digest (64 characters).
    """
    payload = export.to_fingerprint_payload_dict()
    canonical_json = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()


def sort_protection_types_deterministically(types: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Sort protection type records deterministically (name_pl → id).

    Args:
        types: List of protection type dictionaries.

    Returns:
        Sorted list.
    """
    return sorted(types, key=lambda t: (str(t.get("name_pl", "")), str(t.get("id", ""))))
