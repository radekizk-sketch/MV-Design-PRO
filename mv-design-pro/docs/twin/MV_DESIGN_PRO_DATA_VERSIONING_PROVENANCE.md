# MV-DESIGN-PRO — DATA / VERSIONING / PROVENANCE MODEL (pakiet §179 poz. 13)

**Status:** PROPOZYCJA DO PRZEGLĄDU WŁAŚCICIELA (mandat §8, §60, §85–§89, §93, §113–§116, §125, §135–§136). Nie jest kanonem do czasu decyzji.
**Data:** 2026-09-02 · **Autor:** Fable · **Nadrzędny:** `MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md` (§5, §14, §15, §20, §22)
**Dowody stanu obecnego:** `MV_DESIGN_PRO_DIGITAL_TWIN_AUDIT.md` (A1-01, A1-06, A1-13, A1-15, A1-17, A2, A6, A9)

---

## 0. Cel

Jedna oś wersji dla wszystkiego, co może zmienić wynik: **model** (rewizje), **scenariusz** (rewizje delt),
**katalog** (rewizje pozycji), **solver** (wersja), **reguły** (wersja norm/polityk), **dokument** (instancja).
Każda liczba w systemie ma odpowiedź na pytanie „skąd, kiedy, z jakiej wersji, jakiej jakości" bez dodatkowej
struktury — z samego łańcucha provenance.

## 1. Stan obecny (skrót audytu) i co z niego zostaje

| Element | Dziś | Ocena | Docelowo |
|---|---|---|---|
| Rewizja modelu | `ENMHeader.revision: int` + flat-file `.enm_store/<sha256(case)>.json` (`enm/store.py`), `dziennik_zmian.py` (dziennik zmian), `kopia_graniczna.py` (kopia przed mutacją) | ziarno dobre; brak historii rewizji jako obiektów, brak gałęzi, brak autora | `RevisionGraph` (§2) |
| Hashe modelu | `enm/hash.py`: `semantic_hash`, `input_hash`, `switching_snapshot_hash`, `case_hash`, `variant_hash` (ortogonalne; „wariant to tylko delta … NIE oddzielny model") | **zachować** jako składowe hasha rewizji i migawki | §8 |
| Bieg obliczeń | `CanonicalRun(snapshot=pełna kopia ENM, snapshot_hash, input_hash)` in-memory + ORM `canonical_runs` | provenance częściowa (brak `catalog_revision_set`, `settings_hash` jako osobnego pola, wersji reguł), pełna kopia ENM per bieg | `Provenance` (§4) + odtwarzanie migawki z rewizji i delt |
| Katalog | stałe Pythona bez rewizji (`network_model/catalog/*`), `catalog_version` tylko na `BranchPointSN`, `drift_detection.py` | reprodukowalność biegu zależy od żywego katalogu (A1-13) | `CatalogRevision` (§3) |
| Wyniki | `ResultSetV1` FROZEN, `element_ref` + `element_ref_id` (uuid5), status świeżości liczony porównaniem hasha całego modelu (`result_freshness.py`) | provenance bez zakresu zmiany; „wszystko STALE" | `ResultSetV2` + `Freshness` z grafu zależności (§5) |
| Archiwum ZIP | deterministyczne, wersjonowane, z sekcją ENM (P0.0), archiwum przyrostowe, `archive_diff` | **zachować**; rozszerzyć o rewizje, scenariusze, provenance, prezentację | §7 |
| CGMES | `mrid = uuid5("Class:ref_id")` + `CgmesRefMap` + `LOSSY_BOUNDARY` | **zachować** uczciwą granicę stratności; `mRID = asset_id` po migracji tożsamości | §9 |
| Decyzje / założenia | brak `DesignDecisionLog`, brak `AssumptionsRegister`; `ParameterOverride{key,value,reason}` istnieje | luka §87–§89 | §4.3 |
| Dokumenty | PDF/DOCX deterministyczne (`docx_determinism`), bez statusu OUTDATED po zmianie modelu | luka §125 | §5.2 |

## 2. Graf rewizji (`RevisionGraph`)

```python
class DomainCommandRecord(BaseModel):     # append-only dziennik (event sourcing)
    command_id: UUID; project_id: UUID; branch_id: BranchId
    parent_revision_id: RevisionId; result_revision_id: RevisionId
    command: DomainCommand                 # typowana komenda z §21 architektury (payload + changes + scope)
    author: PrincipalId; at: datetime; reason: str | None; inverse: DomainCommand | None   # undo/redo
class TwinRevision(BaseModel):            # rewizja zmaterializowana (content-addressed)
    revision_id: RevisionId                # monotoniczny numer w gałęzi + `content_hash`
    branch_id: BranchId; parent_ids: list[RevisionId]   # 1 rodzic; 2 rodziców = merge wariantu
    content_hash: str                      # sha256 kanonicznego `TwinModel` (exclude_none, sort keys, id-order)
    semantic_hash: str; input_hash: str; switching_hash: str      # składowe ortogonalne (dzisiejszy `enm/hash.py`)
    tags: list[Literal["AS_DESIGNED","APPROVED","AS_BUILT","AS_OPERATED","MILESTONE"]]
    author: PrincipalId; at: datetime; message: str
class VariantBranch(BaseModel):           # wariant projektu = gałąź (mandat §85), NIE kopia sieci
    branch_id: BranchId; name: str; base_revision_id: RevisionId; status: Literal["PROPOSED","ACTIVE","MERGED","ABANDONED"]
    created_by: PrincipalId | Literal["AGENT"]     # §132: agent tworzy tylko PROPOSED
```

Reguły:

1. **Zapis = komenda.** Każda mutacja przechodzi przez `DomainCommandRecord` i produkuje nową `TwinRevision`; nie istnieje ścieżka „podmień JSON" (dzisiejsze `set_enm` znika; `_strip_uuids` przestaje być potrzebne, bo `asset_id` jest częścią treści).
2. **Optymistyczna współbieżność.** Komenda niesie `expected_revision_id`; niezgodność = 409 z diffem (dziś `RLock` per case w `enm/store.py` — zastąpiony).
3. **Rewizja jest odtwarzalna** z rodzica + komendy; snapshot materializowany jest cache'em (content-addressed, deduplikowany). `CanonicalRun.snapshot` (pełna kopia ENM) przestaje istnieć — bieg trzyma `revision_id + scenario_revision_id + snapshot_hash`. **Kolejność migracji (ostrzeżenie A2 §11.1):** pełna migawka w biegu jest dziś JEDYNYM mechanizmem izolacji draftu i odtwarzalności (`canonical_analysis.py:511-548`, test `test_canonical_analysis_draft_isolation.py`) — wolno ją usunąć dopiero, gdy `RevisionStore` materializuje rewizje, a test odtwarzalności biegu z (rewizja + delty) jest zielony.
4. **Gałęzie i scalanie.** Warianty A/B/C to gałęzie; `merge` = trójdrożne scalanie po `asset_id` i klasie atrybutu z regułami konfliktu (ta sama komenda po obu stronach = brak konfliktu; różne wartości tego samego atrybutu = konflikt do decyzji człowieka; konflikt łączności = zawsze człowiek). Porównanie wariantów (§86) = `diff(revision_a, revision_b)` + `diff(results)` — istniejące `archive_diff`/`study_case_delta` są wzorcem implementacji.
5. **Tagi form sieci (§8).** `AS_BUILT` to tag rewizji + `AsBuiltOverlay` (parametry powykonawcze, pomiary odbiorcze, faktycznie zabudowana pozycja katalogu@rev); `AS_OPERATED` to tag + `OperationalState` bieżący; nie ma czterech modeli.
6. **Lineage tożsamości.** Podział/scalenie/zastąpienie assetu zapisuje `AssetLineage {from_ids, to_ids, kind: SPLIT|MERGE|REPLACE|RETIRE, revision}` (semantyka dzisiejszej `MACIERZ_ID_I_REFERENCJI.md`: zachowany/wygaszony/podzielony/scalony/zastąpiony — zachowana). Element RETIRED pozostaje w rewizji z lifecycle, wchodzi do `semantic_hash` (z flagą), nie wchodzi do `input_hash` (rozstrzygnięcie konfliktu A1 §9.7).

## 3. Rewizje katalogu (`CatalogRevision`)

```python
class CatalogRevision(BaseModel):
    namespace: str                          # KABEL_SN, KABEL_NN, TRANSFORMATOR, APARAT_SN, APARAT_NN, APARAT_NN_MCB, WKLADKA_NN, CT, VT, RELAY, KONWERTER, BESS, GENERATOR, KOMPENSATOR, DLAWIK, OGRANICZNIK, SZABLON_POLA, SZABLON_STACJI, …
    revision: int; published_at: datetime; published_by: PrincipalId; content_hash: str
    items: dict[str, CatalogItem]           # niezmienne po publikacji; poprawka = nowa rewizja
    provenance_policy: Literal["DATASHEET_REQUIRED","ESTIMATED_ALLOWED"]
class CatalogBinding(BaseModel):            # na assecie
    item_id: str; namespace: str; catalog_revision: int
```

Reguły: (a) binding zawsze wskazuje konkretną rewizję (koniec „żywego katalogu" w biegu); (b) `CatalogUpdateAdvisor` (rozwinięcie `drift_detection.py`) listuje assety z bindingiem za nowszą rewizją, pokazuje diff parametrów i podgląd wpływu (przez graf zależności §5) — aktualizacja bindingu to komenda z decyzją, nie automat; (c) projekt z tagiem APPROVED/AS_BUILT ma bindingi zamrożone (zmiana wymaga nowej rewizji projektu z uzasadnieniem); (d) każdy `CatalogItem` niesie `source` (producent/norma/URL/dokument), `quality` (DATASHEET/ESTIMATED), `verification_status` — kontynuacja zasad K-O/K-Q (zero fabrykacji danych katalogowych).

## 4. Provenance

### 4.1 Parametr
```python
class ParameterProvenance(BaseModel):
    source: Literal["CATALOG","OVERRIDE","DERIVED","ASSUMED","MEASURED","MISSING"]
    catalog: CatalogBinding | None; assumption_id: str | None; measurement_id: str | None
    formula_ref: str | None; inputs: list[str]      # DERIVED: wzór + wejścia (np. R_total = r_km · L)
    quality: Literal["DATASHEET","ESTIMATED","SYSTEM_DEFAULT","KNOWN","UNCERTAIN"]
    author: PrincipalId | None; at: datetime | None
```
Zasięg: wszystkie parametry efektywne wszystkich klas urządzeń (dziś: wybrane pola przez `solver_input/provenance.py` — ziarno do uogólnienia; `osd_card_gate` zostaje jako polityka blokująca pakiet OSD dla ESTIMATED bez akceptacji).

### 4.2 Wynik, dokument
`Provenance` biegu (architektura §14) + `DocumentProvenance {document_id, template_id@version, twin_revision_id, scenario_revision_ids, run_ids, catalog_revision_set, rules_version, generated_at, content_hash, status: CURRENT|OUTDATED(reason)}`.

### 4.3 Decyzje i założenia (§87–§89)
```python
class DesignDecision(BaseModel):
    decision_id: UUID; revision_id: RevisionId; author: PrincipalId; at: datetime
    subject_ids: list[AssetId]; kind: Literal["SIZING","TOPOLOGY","PROTECTION","CATALOG","POLICY","OVERRIDE","VARIANT_CHOICE"]
    chosen: str; alternatives: list[str]; reason: str; evidence_refs: list[str]   # run_ids, constraint evaluations, candidate rankings
    mode: Literal["MANUAL","ASSISTED","OPTIMIZED"]; overrides_recommendation: bool
class Assumption(BaseModel):
    assumption_id: UUID; revision_id: RevisionId; value: float | str; unit: str | None; source: str; reason: str
    scope: list[AssetId] | Literal["PROJECT"]; status: Literal["ACTIVE","SUPERSEDED","CONFIRMED"]
```
Logowane są decyzje inżynierskie, nie kliknięcia (§87); każdy `ParameterOverride` tworzy wpis `kind=OVERRIDE` z `old/new/reason/affected_constraints` (§89).

### 4.4 Zapytania lineage (API)
`GET /lineage/asset/{asset_id}/parameter/{name}` → łańcuch (katalog@rev → override → wynik zależny), `GET /lineage/run/{run_id}` → wejścia biegu (rewizja, delty, katalog, ustawienia), `GET /lineage/document/{doc_id}` → biegi i rewizje. Dane pochodzą z istniejących struktur; endpointy są czystym odczytem.

## 5. Świeżość i inwalidacja

### 5.1 Wyniki
`Freshness {status: FRESH|STALE|SUPERSEDED|NOT_APPLICABLE, reason: [AttributeClass], changed_scope: LOCAL|AREA|CASE|PROJECT, since_revision_id}` liczona przez `InvalidationService` z deklaracji komend (`changes`, `scope`) i tabeli zależności analiz (architektura §22). Porównanie hasha całej migawki pozostaje jako *strażnik ostateczny* (jeśli hash równy → FRESH bez względu na deklaracje; jeśli różny, a deklaracje mówią „bez wpływu" → test inwariantu wykrywa niekompletną deklarację komendy).

### 5.2 Dokumenty (§125–§126)
Dokument jest projekcją `(twin_revision, scenario_revisions, run_ids, template@version)`; każda zmiana w zbiorze zależności (przez ten sam graf) oznacza dokument `OUTDATED(reason)`; `DocumentReadiness {READY|NOT_READY(missing: [pola, zgody, biegi])}` przed generacją. Reguła kanonu „raport używa tylko wyników `aktualny`/`częściowy_dopuszczony` z sekcją ograniczeń" — zachowana.

## 6. Persystencja

| Zbiór | Technologia (rekomendacja) | Uzasadnienie |
|---|---|---|
| komendy, rewizje (metadane), gałęzie, decyzje, założenia, provenance | PostgreSQL (jsonb + indeksy po `asset_id`, `revision_id`) — zależność już w repo | transakcje, współbieżność, zapytania lineage |
| treść rewizji (snapshot `TwinModel`) | blob content-addressed (`content_hash`), deduplikacja między rewizjami | rewizje różnią się fragmentem; koszt O(zmian) |
| wyniki + ślady White Box | jsonb (wyniki) + blob (ślady) z `run_id` | ślady duże, rzadko czytane w całości |
| szeregi czasowe | kolumnowy magazyn (Parquet/Feather w blobie lub tablice Postgres) | 8760 h × N urządzeń poza JSON |
| stan prezentacji (layouty) | jsonb per `(project, view, user)` | mały, często zmieniany |
| katalog | jsonb per `(namespace, revision)` + pliki źródłowe (karty katalogowe) w blobie | audytowalność źródeł |
| MongoDB / Redis / Celery | decyzja po audycie A9 (użycie faktyczne); rekomendacja: usunąć to, czego kod nie używa (zasada inżynierska nr 1) | jedna technologia mniej |

Migracja: `.enm_store/*.json` → import jako rewizja 1 gałęzi `main` per projekt (deterministyczna transformacja ENM→twin z raportem `NOT_MODELED`); tabele legacy `network_*`, `network_snapshots`, `network_switching_states` → import do rewizji tylko dla projektów, które właściciel wskaże jako produkcyjne, w przeciwnym razie kasacja (pytanie A1 §10.1).

## 7. Archiwum projektu (ZIP)

Rozszerzenie istniejącego deterministycznego archiwum (zachowany manifest z SHA-256 i wersjonowanie): `twin/revisions/*.json` (co najmniej HEAD każdej gałęzi + dziennik komend), `scenarios/`, `results/{run_id}/` z provenance i śladami, `catalog/pinned/` (wyłącznie użyte pozycje w użytych rewizjach), `presentation/`, `decisions.json`, `assumptions.json`, `documents/` z `DocumentProvenance`. Import weryfikuje ciągłość tożsamości (`asset_id` zachowane 1:1), wersję kontraktu i hashe; brak fallbacków dla nieznanych wersji (zasada inżynierska nr 1) — import odmawia z jawnym komunikatem.

## 8. Reguły determinizmu i hashowania

1. Kanoniczna serializacja: `model_dump(mode="json", exclude_none=True)`, klucze posortowane, kolekcje uporządkowane po `asset_id`/`terminal_id`, liczby zmiennoprzecinkowe przez `repr` (round-trip), bez znaczników czasu w treści hashowanej.
2. Hash rewizji = drzewo hashy per kontener (stacja/linia) → hash projektu; pozwala liczyć zakres zmiany (LOCAL/AREA/PROJECT) bez porównywania całości.
3. `snapshot_hash` migawki efektywnej = hash(rewizja, delty scenariusza, stan ruchowy, kontekst czasu, zestaw rewizji katalogu).
4. Losowość wyłącznie w analizach jawnie stochastycznych z `seed` w provenance (dziś `HOSTING-RNG-IZOLACJA` — wzorzec izolacji strumieni).
5. Dokumenty: deterministyczna normalizacja ZIP/DOCX/PDF (istniejące `docx_determinism` — zachować i objąć wszystkie 16 modułów DOCX wykrytych w rejestrze konfliktów).

## 9. Tożsamość na granicach integracji

CIM/CGMES: `mRID = asset_id` (UUID) — koniec `uuid5("Class:ref_id")`; `CgmesRefMap` zostaje jako mapa `mRID ↔ ref_id` dla czytelności i `LOSSY_BOUNDARY` jako uczciwy rejestr strat (pojęcia bez odpowiednika w CIM). GIS: `asset_id` + geometria geoprzestrzenna w osobnej warstwie (architektura §24, mandat §120). IEC 61850/SCL: `IED`/`LogicalNode` powiązane z `ProtectionRelay.asset_id` i `terminal_id` przez tabelę powiązań, nie przez wspólny model (mandat §123).

## 10. Uprawnienia i ślad użytkownika

Każda komenda, decyzja, publikacja katalogu i generacja dokumentu niesie `PrincipalId` i rolę (`DESIGNER`, `REVIEWER`, `APPROVER`, `OPERATOR`, `AUDITOR`, `AGENT`). Zatwierdzenia (`APPROVED`, akceptacja `ESTIMATED` w pakiecie OSD, scalenie wariantu agenta) wymagają roli ludzkiej; `AGENT` nie ma prawa zatwierdzać (I-10). Istniejąca `MACIERZ_UPRAWNIEN.md` staje się tabelą testowaną. (Wymagania dodatkowe R-02/R-03 w `OWNER_REVIEW_PACKAGE.md`.)

## 11. Decyzje właściciela

1. Import projektów z toru legacy ORM — które (jeśli jakiekolwiek) są produkcyjne.
2. Polityka publikacji rewizji katalogu (kto, jak często, czy projekt może „przypiąć" katalog na stałe).
3. Czy element RETIRED ma wchodzić do `semantic_hash` (rekomendacja: tak, z flagą; nie do `input_hash`).
4. Technologie do usunięcia (Mongo/Redis/Celery) — po audycie użycia (A9).
