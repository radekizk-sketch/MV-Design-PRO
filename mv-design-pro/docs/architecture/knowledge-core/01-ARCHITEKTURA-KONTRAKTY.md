# 01. EKC — ARCHITEKTURA, MODEL DOMENOWY I KONTRAKTY SYSTEMOWE

**Status:** propozycja szczegółowa; nie jest obowiązującym kanonem bez decyzji ADR.  
**Kontekst:** MV-DESIGN-PRO; backend Python 3.11/FastAPI/Pydantic, frontend React/TypeScript; istniejący reference_engine oraz model ENM.

## 1. Problem i granice rozwiązania

W projekcie istnieje kilka zjawisk, których nie rozwiązuje zwykła wyszukiwarka pełnotekstowa:
- jedna wartość techniczna pojawia się w PDF, tabeli, karcie katalogowej, regule OSD, funkcji solvera, wyniku i raporcie;
- numer normy bez edycji nie wyznacza jej treści;
- EN, IEC, PN-EN, zmiana A1, corrigendum i standard OSD mają odmienne identyfikatory, daty oraz relacje;
- dwa dokumenty mogą być jednocześnie właściwe, lecz dotyczyć różnych zakresów lub mierzyć inne wielkości;
- „materiał przeczytany” nie równa się „wymaganie zatwierdzone”, a „reguła zatwierdzona” nie równa się „reguła wdrożona i przetestowana”;
- przebudowa wzoru nie może niejawnie zmienić historycznych obliczeń lub zrzutów SLD;
- model LLM nie może być właścicielem granicznej decyzji inżynierskiej.

Zamierzone użycia: (A) pytania z dowodem, (B) parametry i tablice dla katalogów, (C) reguły kontroli/walidacji, (D) obowiązujące profile projektu, (E) testy referencyjne i raporty, (F) monitoring zmian i ocena wpływu, (G) eksport śladu źródłowego. Nie są zamierzone: ekspercki system prawny, automatyczny podpis projektanta, bezpośrednie wykonywanie arbitralnych wzorów PDF, kopiowanie norm do publicznej bazy.

## 2. Architektura logiczna — jednorodny rdzeń, jawne porty

Ingestion (PDF / DOC / HTML / URL, importer ręczny i sprawdzany monitoring oficjalnych źródeł)
  -> ArtifactVault (prywatne bajty, checksum, tenant, ACL, license)
  -> ExtractionPipeline (strony, bloki, tablice, równania, rysunki, OCR)
  -> EvidenceStore (bbox, pagina, confidence, source digest)
  -> Curation (kandydaci, interpretacja, review, approval)
  -> KnowledgeRegistry (DocumentFamily, Edition, ChangeSet, Claim, Rule, DataTable, Formula)
  -> ReleaseBuilder (immutable manifest, dependency closure, fingerprint, effective scope)
  -> KnowledgeResolver (project context, applicability, conflict, precedence evidence)
  -> Typed Query/Rule/Parameter APIs (no file-by-default)
  -> Existing reference_engine, ENM validator, solvers, catalogs, UI, exports, agents.

Połączenia pionowe nie oznaczają nowej wersji solvera ani nowego ENM. Adapter konsumuje zatwierdzony atom danych, transformuje go do własnego modelu obliczeniowego i dokumentuje tę transformację. Repozytorium wiedzy nie jest właścicielem faktu fizycznego „prąd gałęzi” ani „położenie łącznika”; właścicielem pozostaje model/solver.

### 2.1 Wariant wdrożenia

**Preferowane:** modularny monolit w backendzie, wspólny pakiet src/reference_engine/knowledge_core (lub podział warstw zgodny z aktualną strukturą po audycie), lokalny vault poza repo, transakcyjny store istniejącej aplikacji; SQLite FTS5 dopuszczalny lokalnie/pojedyncze środowisko, lecz wymagane blokady i transakcje; PostgreSQL + full-text/pgvector opcjonalnie przy rzeczywistej skali multi-user. Silnik wektorowy jest indeksem wtórnym, nigdy źródłem prawdy.

**Niedopuszczalne:** oddzielne bazy dla każdego OSD, rozproszone usługi bez testów kontraktowych, rejestr JSON modyfikowany równolegle bez transakcji, semantyczna wyszukiwarka jako enforcement, hardcode powielający wartości tabel.

### 2.2 Bounded contexts i ownership

Document Registry — własność tożsamości, publikacji, wydania, statusu, zakresu dat i relacji supersedes/amends/corrects.  
Source Vault — własność oryginalnych bajtów i praw dostępu.  
Evidence — własność lokatorów stron i jakości odczytu.  
Curation — własność kandydatów, głosów reviewerów, interpretacji.  
Normative Knowledge — własność zatwierdzonych reguł, tabel, równań i definicji.  
Release & Resolution — własność niezmiennych zestawów, wyboru obowiązującego zakresu, konfliktów.  
Consumer Binding — własność kontraktu z modułem i testowanych adapterów.  
ENM/solver/catalog — pozostają właścicielami obliczeń, obiektów, wersji danych domenowych, algorytmów, UI i wyników.

## 3. Tożsamość dokumentów i wydań

DocumentFamily: stabilna rodzina, np. IEC-60909-0, PN-EN-60909-0, ENEA-SN-STACJE-Z1, ENEA-IRIESD, IEC-62271-200, PTPiREE-RfG-test-v3, MFR-ABB-Safering, BOOK-DOLEGA. Rodziny IEC/EN/PN są odrębne, powiązane relacją adoption_of / identical_to / modifies, nigdy zlane w jednym rekordzie.

DocumentEdition: dokładny identyfikator (np. IEC 60909-0:2026, PN-EN 60909-0:2016-09, ENEA Z1 06.2024), język, publisher, dokument bazowy, amendment/corrigendum, region, edition tag, rejestr statusu źródłowego, metadata evidence, issued_at, published_at, effective_from/to, withdrawn_at, checked_at. Pojedynczy „current=true” jest błędny, ponieważ wydanie może być aktualne w katalogu wydawcy, a umowa wymagać wydania starszego.

SourceArtifact: artifact_id (SHA256 bajtów), MIME, page_count, extraction profile, language, origin_url, fetched_at, storage location (opaque), license constraints, entitlement, access domain, retention policy, printable page mapping, PDF signature if present, immutable bitstream. Identyczny hash z różnych adresów jest tym samym bajtowo obiektem, ale może mieć różne manifesty pochodzenia i prawa.

ChangeRelationship: SUPERCEDES, AMENDS, CORRECTS, ADOPTS, REFERENCES_DATED, REFERENCES_UNDATED, DEPENDS_ON, CONFLICTS_WITH, INTERPRETS, IMPLEMENTS, HISTORICALLY_APPLICABLE. Relacja ma dowód i własne daty. Nie utożsamiać relacji „nowe wydanie” z „uchyleniem obowiązywania” bez katalogu.

### 3.1 Bitemporal i zastosowanie w projektach

W każdym rekordzie źródłowym rozdzielić:
- **valid time** (data, od której wydawca/OSD określa stosowanie, i data końcowa);
- **transaction time** (moment, w którym system dowiedział się o zmianie);
- **adoption time** (moment wyboru w konkretnym projekcie/umowie);
- **revision time** (kiedy sprawdzono i zatwierdzono interpretację);
- **calculation time** (kiedy powstał dany wynik).

Zapytanie „co obowiązywało 2025-05-01 według wiedzy dostępnej 2025-06-01?” jest inne od „co obecnie wiemy o treści obowiązującej 2025-05-01?”. API powinno obsługiwać as_of_valid i as_of_known. Data wydruku z PDF nie jest automatycznie datą wejścia w życie.

### 3.2 Zmiany częściowe i konsolidacja

Amendment A1/AC/karta aktualizacji to samodzielny dokument; nie jest pełną nową edycją tekstu bazowego. Zatwierdzenie złożonego zestawu wymaga zależności i delta overlay: BASE -> AMENDMENT_1 -> CORRIGENDUM -> CONSOLIDATED_VIEW. Brak BASE powoduje PARTIAL_SOURCE, nie pełny PASS. Nie tworzyć fikcyjnego tekstu ujednoliconego, jeśli brak praw i dowodu każdej zmiany. W IRiESD odróżnić karty aktualizacji od obowiązującego tekstu ujednoliconego i sprawdzać, czy obie ścieżki są spójne.

## 4. Model wiedzy — typy atomów i różnica znaczenia

KnowledgeRecord to abstrakcja z type i revision:
- REQUIREMENT: modalność MUST/MUST_NOT/SHOULD/MAY, adresat, wyjątki, zakres, if/then;
- FORMULA: identyfikator eq, AST/MathML/LaTeX do prezentacji, lista zmiennych i jednostek, wymiar, założenia;
- TABLE: tabular schema (kolumny, nagłówki hierarchiczne, row domains, footnotes, alternative rows, interpolation policy);
- PARAMETER: liczba/range/condition, units, provenance, confidence, effective range;
- DEFINITION: definicja terminu z edycji źródła, synonimy i zależności;
- PROCEDURE: sekwencja działań i przejść, zależności wejścia/wyjścia;
- TEST_METHOD: warunki i kryteria testu, tolerancje, przygotowanie próby, evidence;
- SYMBOL: semantic_id, standard ref, shape evidence, rendering reference (nie kopia bitmapy normy);
- DIAGRAM: oryginalny lokator i niezależne opracowanie znaczenia, bez automatycznej rekonstrukcji geometrii;
- EXAMPLE: wejścia i wyniki z jawnie oznaczonego przykładu, nie warunek obowiązkowy;
- GUIDANCE: materiał dydaktyczny, rekomendacja autora/producenta; bez statusu normy.

Każdy ma record_id stabilny między edycjami, revision_id content-addressable, evidence_refs[] z pozycją dokładną, curator, workflow, scope, confidence vector (extraction/evidence/interpretation), citations, source dependency, unit metadata, status, license flags. Granulacja: jeden niezależnie ocenialny wymóg/reguła/wiersz tabeli zamiast „cała norma w jednej karcie”.

### 4.1 Nie dublować katalogów

Parametry produktów (np. Ur, In, Ith, Ipk, IAC, S_n, u_k, R', X', Iz, klasy CT/VT, k_sc) należą do kanonicznych katalogów. KnowledgeRecord definiuje ich źródło, warunki użycia i wymaganie. Katalog wskazuje knowledge_revision_ref; system wiedzy nie prowadzi alternatywnego katalogu kabli, producentów i stacji. Jeżeli wartość pochodzi wyłącznie z oświadczenia projektanta, provenance = USER_ASSUMPTION, nie NORMATIVE.

### 4.2 Wzory

Formula: **display** (LaTeX do odczytu), **symbolic** (bezpieczny typowany AST bez eval), **semantics** (argumenty, znak, jednostki, faza, strona napięcia, RMS/peak, per-phase/three-phase, time reference), **domain** (od/do, wersja), **adopted_implementation** (funkcja własności modułu), **test_vectors** (goldens), **evidence** (nr wzoru i bbox).

Domyślnie brak wykonania AST w runtime. Niezależnie zatwierdzony operator obliczeniowy może być dopuszczony dla prostego rachunku tabelarycznego, ale nie wolno go mylić z produkcyjnym solverem P0. Typowanie fizyczne: VoltageLL vs VoltageLN, CurrentRMS vs CurrentPeak, ImpedanceOhm vs PerUnit, Degree vs Radian, Hz, kV, V, MVA, kVA, W, var, kvar; kompleksowe P+jQ oraz R+jX. Walidacja wymiarowa konieczna lecz niewystarczająca: dwa wyniki w kA mogą mieć inną semantykę.

### 4.3 Tabele

DataTable: row_id stable, col_id stable, multi-level headers, unit_per_column/per_cell, exact decimal, categorical keys, voltage bands (open/closed endpoints), notes, cross-cell merges, alternative values, normative qualifiers. Żadne „domyślne zaokrąglenie” nie może gubić wartości z rysunku. Niepoprawnie odczytany znak ≤ jako < może zmienić wybór w punkcie granicznym; takie komórki idą do manual review. Interpolacja tylko gdy reguła źródłowa dopuszcza i jej sposób jest zweryfikowany.

## 5. Zakres stosowania (Applicability DSL)

Propozycja deklaratywnych warunków bez arbitralnego Pythona:
AND/OR/NOT, EQ/NE, IN, GT/GTE/LT/LTE, BETWEEN z granicami, EXISTS, matches enum, region, osd, voltage_level, Un, Um, U_r, technology, object_type, new/rebuild/existing, date, connection conditions, operating mode, source topology, earthing arrangement, project stage, manufacturer family, rated frequency.

Wymaganie ma trzy składniki: predicate, required_data_paths (ENM/case/catalog), failure_behavior. Rozstrzyganie trójwartościowe: APPLIES / NOT_APPLICABLE / UNKNOWN_DATA. UNKNOWN_DATA nigdy nie przechodzi na PASS. Przepis o nowych stacjach słupowych nie może być użyty jako jednoznaczny zakaz eksploatacji istniejącej.

## 6. Precedencja, równoległość i konflikty

Nie wolno implementować jednej statycznej hierarchii IEC < PN < ENEA. Kontekst wymaga rozpoznania:
- źródła: prawo/regulacja, umowa/warunki przyłączenia, IRiESD, standard OSD, norma ogólna, norma wyrobu, karta producenta, lokalne założenie;
- adresata: zakres projektowy, eksploatacyjny, odbiorowy, certyfikacyjny;
- modalności: obowiązek, zalecenie, informacja, przykład;
- daty i jurysdykcji;
- relacji normy ogólnej do szczegółowej;
- dopuszczonych odstępstw podpisanych przez upoważnioną rolę.

Reguła precyzująca wymaganie ogólne może współistnieć z normą techniczną, zamiast ją „zastępować”. Sprzeczność wartości (np. Ur, IAC) to ConflictRecord: affected_rule_ids, contexts, evidence, numeric diff, resolution_state, decision_owner, chosen policy, project waiver. Bez dowodu na legalną/umowną wyższość jednej reguły resolver zwraca AMBIGUOUS lub CONFLICT, a nie wybiera ostrzejszą „na wszelki wypadek”. Wariant konserwatywny można zaproponować inżynierowi, ale nie nadać mu statusu normowego.

## 7. Release i ProjectKnowledgeLock

KnowledgeRelease to trwały manifest: release_id (hash z kanonicznego JSON), schema_version, edition_ids+artifact_sha256, record_revision_ids, rule_revision_ids, adapter compatibility, effective scopes, source integrity, creator/reviewer, created_at, signatures/approval metadata. Release jest niezmienny, kolejny release nie edytuje starego.

ProjectKnowledgeLock: project_id, case_id, as_of_valid/known, operator profile, jurisdiction, contract/connection-condition_refs, knowledge_release_id, explicit edition selection/overrides, signed waivers, dependency closure/hash, solver_manifest_hash, catalog_snapshot_hash, ENM_snapshot_hash. Raport i obliczenie przypisują lock_id oraz per-metric trace. SLD nie powinien uzależniać geometrii od zmian danych normowych, chyba że zmiana katalogu świadomie aktualizuje element ENM.

Typowy lifecycle: DRAFT_DOCUMENT -> INDEXED -> CURATED -> REVIEWED -> APPROVED -> PUBLISHED_RELEASE -> PINNED_PROJECT -> IMPACT_CANDIDATE -> OPT_IN_MIGRATION -> RECOMPUTED -> ACCEPTED. Stopień zatwierdzenia każdej warstwy jest jawny.

## 8. API semantyczne / kontrakt usług

Separacja Query od Execution:
- document-registry: list/get editions, changes, history, source status;
- evidence: retrieve/preview anchored excerpt authorized by ACL, controlled quotations, page image from private vault only when license permits;
- search: lexical FTS + curated semantic + facets; result type EvidenceCandidate vs ApprovedRecord;
- resolve: candidate rules for project context, applicability, conflicts, rationale, chosen release;
- parameter: typed single value/table slice with unit, constraints, source and status;
- formula: metadata/spec only, never remote execution of untrusted formula;
- compliance: evaluate approved predicates against ENM without solver;
- impact: edition diff -> affected records -> adapters -> tests -> cases -> reports;
- release: build/validate/publish/revoke/unpublish allowed only by authorized roles; not delete history;
- lock: pin/unpin/migrate with explicit user decision, audit.

Wdrożenie API powinno respektować istniejące endpointy /api/reference/* i /api/cases/*/reference/compliance, nie łamać konsumentów. Nowe wersje pod /api/reference/v2/ w miarę potrzeb; mapping anti-corruption layer utrzymuje V1.

## 9. Determinizm, aktualność i ślad

Żadnego odpytywania internetu, OCR, OCR/LLM, niezatwierdzonego katalogu czy „latest” podczas P0 solver run. Resolve run = deterministyczna funkcja (snapshot ENM, locked release, scenario, catalog snapshot, solver impl). Pojawienie się nowej edycji oznacza FLAG_NORM_UPDATE_AVAILABLE i raport impact, nie podmianę parametrów. Zmiana dokumentu może spowodować „wynik na starej podstawie” jako osobną informację; nie utożsamiać z nieaktualnym wynikiem ENM po zmianie topologii. Oba statusy mają inne źródła i skutki.

Ślad: (module, version, formula/param ID, input evidence IDs, output type, run_id, source edition refs, intermediate numeric values when whitebox, warnings, data completeness). Należy wspierać kliknięcie z wyniku I''k -> zastosowany c -> tabela 1 -> wydanie 2016 -> dozwolony podgląd strony PDF.

## 10. Graph wiedzy

Węzły: edition, section, formula, table, row, requirement, product, catalog field, domain entity kind, solver function, UI consumer, test, report, project; relacje typu HAS_SOURCE, AMENDS, USES_VARIABLE, CONSTRAINS, IMPLEMENTED_BY, TESTED_BY, USED_IN, SUPERSEDES, CONFLICTS_WITH. Minimalna implementacja to relacyjna tabela edges z FK/indeksem, nie potrzebuje Neo4j. Graf umożliwia „jakie wyniki są potencjalnie dotknięte zmianą Z1 §4.3.2?” i „gdzie wykorzystywany jest współczynnik c?”. Graphify repo może pomóc w analizie statycznych zależności kodu, ale **nie zastępuje** semantycznego grafu wymagań; to dwa różne grafy.

## 11. AI/RAG i agenci

LLM może: znajdować potencjalne odniesienia, budować kandydatów kart, proponować porównania edycji i pytania do recenzji, generować raporty z zatwierdzonej wiedzy. Nie może: samodzielnie ustalać obowiązywania, podpisywać interpretacji, wykonać arbitralnego kodu wyjętego z PDF, „udowodnić brak wymagania” po pustym wyszukiwaniu, tłumić statusu konfliktu.

Odpowiedzi w aplikacji: (ANSWER_FROM_APPROVED_RECORD, EVIDENCE_ONLY, CONFLICT, OUT_OF_SCOPE, SOURCE_UNAVAILABLE, NOT_FOUND_IN_INDEX). Każdy wariant zawiera zakres przeszukania, dokumenty/edycje i daty; pusty index nie oznacza zgodności. Retrieval ranking można zmieniać bez zmiany wyników deterministic compliance.

## 12. Autoryzacja i licencje

Role: viewer, engineer, curator, normative_reviewer, release_approver, auditor, platform_admin. Uprawnienia na organizację/tenant, dokument i projekt, z audytem dostępu. Repo publiczne: tylko metadane, własne modele, nieekstensywne parafrazy, linki; surowe i długie ekstrakty poza repo. Vault encrypted at rest, private volume/controlled object store; API odmowa unauthorized; wyszukiwarki i logi nie emitują pełnej normy; backup i retencja zgodne z licencją; nie wysyłać PDF do zewnętrznego API bez uprawnienia. Monitoring oficjalnych stron pobiera metadane i hashe; pobieranie pełnej treści musi respektować licencję/terms.

## 13. Inwarianty implementacyjne i failure modes

Invariant A: każda reguła APPROVED ma co najmniej jeden EvidenceAnchor do dokładnego edition/artifact.  
B: każda reguła ENFORCED ma adapter, wersję adaptera, test pozytywny i negatywny.  
C: każda liczba ze źródła ma unit, source, data, bound semantics i daty.  
D: żaden release nie zmienia się po zatwierdzeniu; historyczne linki nie przepinają się na latest.  
E: brak danych i konflikt nie dają PASS.  
F: każda operacja migrate ma PreviewDiff, decyzję, snapshot przed i po, test regresji i undo projektu (nowy snapshot; nie nadpis).  
G: source_hash mismatch = quarantine; nie nadpisywać zatwierdzonego artefaktu.  
H: two versions of same operator standard in one project require explicit effectivity decision; unless separate scope.  
I: input unknown -> no unsafe default.  
J: output type and applied source visible in whitebox/proof pack.

## 14. Decyzje do podjęcia przez architekta

D-01: tabela relacyjna w istniejącym store vs osobny DB (preferowane istniejące transakcje).
D-02: jak mapować ProjectKnowledgeLock do istniejącego StudyCaseConfig i snapshotu (brak drugiej prawdy).
D-03: czy adaptery solverowe otrzymują immutable ParameterBundle czy rozwijalne rule refs (preferowany ParameterBundle).
D-04: klasyfikacja statusów wobec legacy SourceStatus i implement=True.
D-05: tryb wieloużytkownikowy i licencje prywatnego vault.
D-06: semantyka amendments i temporalność (must).
D-07: minimalny mechanizm akceptacji przez inżyniera (manual signer/approval).
D-08: granica „automatyczna reguła” vs „tylko wskazówka”.
D-09: sposób mapowania do legacy Reference Score (nie liczyć UNKNOWN jak PASS).
D-10: kolejność adopcji domen bez równoległego przepisywania solverów.

## 15. Kontrakt odbioru

Trace test: source fragment -> correct edition -> verified table cell -> parameter bundle -> solver -> calculation trace -> report.  
History test: same old lock+same solver+same ENM => bit-identical result independent of latest document.  
Conflict test: two applicable contradictory rules => explicit CONFLICT.  
Coverage test: missing artifact/partial amendment => not FULLY_VERIFIED.  
Security test: user without rights cannot retrieve PDF, extracted text or semantic search private resource.  
Module parity test: each adopted consumer binding has an actual imported adapter and live end-to-end test; test-only JSON without use fails.
