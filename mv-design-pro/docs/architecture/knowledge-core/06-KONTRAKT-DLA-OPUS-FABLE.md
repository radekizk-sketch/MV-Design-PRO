# 06. EKC — KONTRAKT PRZEJĘCIA PRZEZ OPUS LUB FABLE

**Status:** misja architektoniczna; nie dyspozycja bezwarunkowego wdrożenia. Autor niniejszego PR daje następnemu wykonawcy prawo do zmiany lub odrzucenia propozycji po audycie dowodowym.

## MISJA

Przejmij PR #526 jako Principal Engineer + architekt całości MV-DESIGN-PRO. Sprawdź stan main, kanon architektury, bieżący Reference Engine, PR #493 (ENEA, otwarty draft) i PR #521 (Knowledge R4, zamknięty bez merge). Opracuj jedną przyszłościową warstwę norm IEC/PN-EN, standardów ENEA i innych OSD, IRiESD, NC RfG/PTPiREE, danych producentów i dokumentów pomocniczych, używaną przez każdy moduł. Weź odpowiedzialność za fachową krytykę specyfikacji, wybór rozwiązania, migrowalność i obronę fizyki; **nie kopiuj rozwiązań bez weryfikacji**.

Wynik docelowy: import dowolnej przyszłej normy; źródło i wydanie; dokładne zweryfikowane wzory, tabele, rysunki i wymagania; zakres zastosowania; relacje amendments; reużycie w wielu modułach; immutable release; ProjectKnowledgeLock; ślad źródłowy; bez fałszywej zgodności. Zero odrębnego grafu ENM, duplikacji katalogów i live LLM w solverze.

## 1. Obowiązkowa kolejność lektury

1) Aktualny main, SHA, CLAUDE.md.
2) docs/architecture/PRODUCT_CAPABILITY_CONSTITUTION.md i CANONICAL_TWIN_ARCHITECTURE.md.
3) docs/sld/REFERENCE_ENGINE_SPEC_V1.md i istniejące kontrakty API.
4) backend/src/reference_engine, enm, catalog, network_model/solvers i reference_engine tests.
5) frontend/src/ui2/referencje, UI2 Inspector, wyniki, kreatory i rzeczywisty screen.
6) PR #493, branch codex/enea-knowledge-e2e-20261023, dokumenty katalogu i testy.
7) PR #521, branch feat/kb-iec60909-2016-provenance, materiały R4, source/rules/knowledge.
8) Spec EKC #526 (README i pliki 01–07) oraz dostępne legalnie oryginalne źródła.
9) Oficjalne statusy wydań norm i ENEA sprawdzone na datę review.

Jeśli propozycja PR #526 jest sprzeczna z repo, aktualnym oficjalnym źródłem lub fizyką, wykaż konflikt i zaproponuj poprawkę; nie traktuj dokumentacji jako autorytetu wyższego od dowodu.

## 2. Wymagana decyzja

DECISION_REPORT musi zawierać:
A. REUSE: rzeczywiste moduły do zachowania, ścieżki, zależności, działające testy.
B. MIGRATE: per plik i per rekord co odzyskać z #493/#521, z dowodem edition/paginy/source checksum.
C. REJECT: co w #526 jest zbędne/przewymiarowane/błędne, wariant alternatywny i jego koszt.
D. DATA CONTRACT: identyfikatory DocumentFamily, Edition, Artifact, EvidenceAnchor, KnowledgeRevision, RuleRevision, Release, ConsumerBinding, ProjectLock, trace.
E. NORMATIVE RESOLUTION: kiedy i dlaczego norma OSD/PN/IEC/producent/warunki przyłączenia ma zastosowanie; ambiguity/conflict/no data.
F. PHYSICS: brak zmian wyników P0 bez świadomej zmiany podstawy i niezależnej walidacji.
G. LICENSE/SECURITY: raw PDF i indeks wyłącznie w vault uprawnionego użytkownika.
H. MIGRATION PLAN: minimalne pionowe PR-y i rollback.
I. CI/EVIDENCE: testy liczbowe, kontrakty, API, UI, security i historyczny replay.
J. RISK: P0/P1/P2 z właścicielem, argumentem i mierzalną bramką.

Nie wymagaj od użytkownika ponownego podawania informacji dostępnych w repo i wcześniejszych pracach.

## 3. Granice autonomii

Masz samodzielność audytu, własnego wyboru architektury, korekty specyfikacji, ADR, repo research, implementacji na odrębnej gałęzi i dowodowych testów (jeżeli narzędzia i uprawnienia są dostępne). Możesz delegować odczyty/testy/research subagentom; ich wnioski pozostają materiałem dowodowym. Wykonawca główny podejmuje decyzje P0 i rozstrzyga sprzeczne opinie.

Nie wolno: niejawnie merge do main, kopiować pełnych licencjonowanych PDF do publicznego repo, wykonywać kodu z PDF, wydawać produkcyjnego PASS z niesprawdzonego OCR, przenieść składowej zerowej z nN przez transformator bez prawidłowego modelu, mieszać SN/nN w jednym SLD, zastępować ENM, przeprogramowywać solver P0 bez porównawczych testów, automatycznie uznawać IEC 2026 za krajową PN lub zmieniać historię projektu.

## 4. Konkretne pytania architektoniczne

D-01 Czy rozbudowa reference_engine jest najtańszą poprawną drogą? Jaka jest granica modułu?
D-02 Jak rozszerzyć ReferencePack i implementowane reguły bez naruszenia V1?
D-03 Gdzie istnieje atomowy zapis case/ENM i jak dołączyć ProjectKnowledgeLock?
D-04 Czy SQLite FTS5 + istniejący store wystarcza, czy lepszy PostgreSQL? Udowodnij danymi, nie intuicją.
D-05 Jak reprezentować IEC vs EN vs PN-EN adopcję i zmianę dat krajowych?
D-06 Jak rozróżnić wydanie bazowe, amendment A1, corrigendum, skonsolidowany IRiESD i kartę aktualizacji?
D-07 Jak modelować nieznaną podwersję Z1/Z2 stacji, bez fałszywego PASS?
D-08 Jak odróżnić wymóg, rekomendację, przykład i naukowy opis metod?
D-09 Jak opracowywać wzory, zmienne, jednostki, granice, przypisy tabel i alternatywy?
D-10 Jak wiązać normę do solvera, nie robiąc z EKC drugiego solwera?
D-11 Jak w istniejącej architekturze odróżnić nieaktualność wyniku po ENM od nowej edycji normy?
D-12 Jak odczytać uprawnienia do PDF i zabezpieczyć tekst/embedding/logi?
D-13 Jak policzyć wpływ zmian na katalog, wybór pól, SLD, analizy i raporty?
D-14 Które moduły odłożyć bez utraty spójności i rzetelności?
D-15 Czy pierwsza implementacja powinna dotyczyć IEC 60909 tabeli c czy ENEA Z1 stacji? Wskaż użycie produkcyjne, liczbę testów, ryzyko.

## 5. Niezbędne kontrole merytoryczne

IEC 60909 — I''k vs ip vs Ib vs Ik; c według Un i edycji; κ i R/X; MAX/MIN, korekty transformatora, impedance source and positive/negative/zero sequence, 1F-earth scope w izolowanej/kompensowanej SN, multiple feeds, inwertery. Przykład 2016 z PDF str. 30 (tabela 1), 51 (wzór 33), 58 (κ). Własny default cmin=0,95 dla SN nie jest cmin=1,00 z załączonej normy 2016. Wersja 2026 to osobna rewizja do przeczytania.

IEC 62271 — rozróżnić ogólne -1 i szczegółowe normy wyrobu; Ik withstand ≠ breaking; Ipk ≠ arbitralna pochodna I''k; insulation withstand alternatives/footnotes; IAC scope and classification. Dobór wymaga katalogu realnego aparatu.

ENEA — istniejący pakiet ma źródła dawnych wydań, PR #493 nowsze Z1: zrewiduj każdą enforced rule, zanim nazwiesz ją aktualną. Osobno „nie zaleca się” i „nie należy”, nowa vs istniejąca stacja, prefab Z1 vs uproszczona Z2, telemechanika zdalna vs kwalifikacja do zdalnego sterowania.

Jakość — EN 50160 A1 nie jest całą normą; pomiar czasu/agregacji/percentyla i punkt oceny są krytyczne. PTPiREE ma procedurę i wiele numerowanych programów; nie przenoś obowiązków między typami A/B/C/D. CT/VT różnią się funkcją; Ferranti jest CT sumującym, nie VT. PV/BESS/FW do SN tylko przez pole i TR blokowy zgodnie z kanonem produktu.

## 6. Kolejność przydatnej implementacji

G0 repo inventory i role źródeł (main + PR493 + PR521), quality/risk/duplication map.
G1 DocumentEdition/Artifact/Evidence with backward-compatible V1.
G2 curation/approval/version release + ProjectKnowledgeLock.
G3 jeden pionowy przykład SC z realnym solverem i trace, lub ENEA z realnym ENM (wybór udokumentowany).
G4 drugi pionowy przykład, niezależny technicznie.
G5 wpływ wersji i delta reports.
G6 kolejne moduły: catalog, switchgear, LF, protection, OZE, cable, overhead, quality, nN, reporting.
G7 secured operations, user interface, release migration, cross-app use.

Każda faza jest osobnym małym PR, DoD plus E2E; implementacja bez faktycznego konsumenta nie jest DONE. Sprawdzaj rzeczywiste nazwy test commands przed uruchomieniem.

## 7. Review i adversarial evaluation

Zorganizuj niezależne sprawdzenia: code architecture, normative/electrical, licensing/security, temporal migration/API. Reviewer ma spróbować obalić: błędne cmin, błędną stronę wydania, brak przypisu tabeli, 2026 IEC automatycznie w polskim projekcie, Z1 niespójne daty, symulację nN jako SN, ciche przeliczenie starych danych, publiczne wycieki PDF i false PASS na missing data.

Wyniki mają mieć zezwalający status PROVEN, PROPOSED, BLOCKED, REJECTED i CITATION/EVIDENCE. Żaden agent nie zatwierdza sam sobie naukowej poprawności bez niezależnego testu.

## 8. Wymagana zawartość ADR

Context, measured current repo SHA, alternatives (extension vs separate module vs separate service), evidence, data identity, edition rules, immutable release, specific case/ENM injection point, interoperability, security, migration, compatibility, cost, reversibility, technical risk, selected approach, rejected approaches, unresolved owner decisions and DoD.

## 9. Kontrakt implementacyjnego PR

Każdy PR z kodem zawiera:
- source edition and publisher proof with accurate clause/page;
- concrete typed data model and compatibility adapter;
- actual solver/ENM/catalog consumer using approved record;
- negative + boundary + scenario + legacy regression tests;
- UI screenshots from running app if UI changed;
- source access and license audit, rollback, source hash;
- release/case lock, no silently replaced old results;
- independent reviewer verdict and file/commit links;
- proof of actual runtime use (not just test counters).

STOP deployment if source ambiguous, rights unclear, unaudited numerical change, false PASS or broken history; finish safe subset and report blocker precisely.

## 10. PROMPT DO BEZPOŚREDNIEGO UŻYCIA

BEGIN MISSION

Act as independent Principal Engineer and Lead Architect for Engineering Knowledge Core in MV-DESIGN-PRO. Repo radekizk-sketch/MV-Design-PRO, base main, proposal PR #526. First audit real main and previous drafts #493 (ENEA) and #521 (norm knowledge R4), including canonical architecture and existing Reference Engine. Read all 01–07 documents. You may accept, modify or reject proposed architecture with concrete evidence and alternative costs. Design a unified, edition-aware and license-safe normative knowledge layer serving ALL solvers, ENM, SLD, catalogs, OZE, cables, lines, GPZ, nN and reports; preserve one ENM, no hidden new physics solver and no unreviewed OCR rule enforcement. Ensure artifact/evidence provenance, safe tables and formulas, applicability/temporal conflict semantics, immutable KnowledgeRelease, ProjectKnowledgeLock, adapters, API and historical repeatability. Deliver ADR, duplicate/crosswalk mapping, phased backlog with vertical E2E proofs, and independent adversarial review. If authorized to implement, start with the smallest evidence-closed cut, tests and reviewed PR; never silently merge to main. Distinguish implemented vs proposed and describe exact blockers. Use subagents for bounded research, not for conflicting architectures. Avoid unnecessary redesign.

END MISSION

## 11. Final principle

This is an outcome-and-evidence contract, not micro-management. Next model should be free to deliver a simpler architecture if it demonstrates all acceptance invariants with less maintenance, lower runtime risk and robust migration.
