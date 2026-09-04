# MV-DESIGN-PRO — PAKIET DO PRZEGLĄDU WŁAŚCICIELA (mandat §177–§180)

**Status:** ARCHITEKTURA DOCELOWA ZATWIERDZONA WARUNKOWO (werdykt właściciela 2026-09-02, §4a) · AUTORYZACJA WYŁĄCZNIE M0 · M1–M7 ZABLOKOWANE. Pierwotnie: PROPOZYCJA — program zatrzymany na §180 STOP. **Żadna migracja, refaktoryzacja ani naprawa nie została rozpoczęta** (audyt READ-ONLY; jedyne zmiany w repo to dokumenty `docs/twin/`, ADR-012…ADR-028 ze statusem PROPOSED, wpis w `docs/INDEX.md` oraz jedna minimalna korekta dokumentu `CLAUDE.md` — dopisanie istniejącego modułu `ui2/shared`, przyczyny czerwieni `claude_md_struktura_guard` w CI).
**Data:** 2026-09-02 · **Gałąź:** `claude/mv-design-pro-twin-audit-u4lhy0` · **HEAD audytu:** `a1ab2959` (= `origin/main` w chwili pomiaru)
**Indeks programu:** `INDEX_TWIN.md`.

---

## 1. Pakiet §179 — 20 pozycji (mapowanie koordynatora na dokumenty)

| # | Pozycja §179 | Gdzie | Stan |
|---|---|---|---|
| 1 | Streszczenie wykonawcze audytu | `MV_DESIGN_PRO_DIGITAL_TWIN_AUDIT.md` §1 | gotowe |
| 2 | TOP 30 problemów P0–P3 (§154) | audyt §7 | gotowe (16 P0 · 11 P1 · 2 P2 · 1 P3) |
| 3 | Rejestr luk (§155) | audyt §6 (G-01…G-28) | gotowe |
| 4 | Mapa systemu i rejestr legacy | audyt §2, §4 | gotowe (LOC zmierzone) |
| 5 | Rejestr tarć inżynierskich (§5) | `ENGINEERING_FRICTION_REGISTER.md` (EF-001…EF-060, role §168, test §181) | gotowe |
| 6 | Docelowa architektura twin (§156) | `MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md` | gotowe (propozycja) |
| 7 | Docelowy workflow inżynierski (§157) | `MV_DESIGN_PRO_TARGET_ENGINEERING_WORKFLOW.md` (14 procesów × 13 pól) | gotowe |
| 8 | Architektura doboru i optymalizacji (§158) | `MV_DESIGN_PRO_DESIGN_OPTIMIZATION_ARCHITECTURE.md` | gotowe |
| 9 | Architektura prezentacji SLD/CAD/SCADA (§159) | `MV_DESIGN_PRO_SLD_PRESENTATION_ARCHITECTURE.md` | gotowe |
| 10 | Pakiet symboli (§160) | `SLD_SYMBOL_SYSTEM_PLAN.md` — **plan** 45 pozycji CURRENT → PROPOSED z procedurą zatwierdzenia | **częściowo**: bez grafik SVG (rysunek pakietu wymaga zatwierdzenia listy i geometrii przez właściciela — B-02) |
| 11 | Architektura symulacji | `MV_DESIGN_PRO_SIMULATION_ARCHITECTURE.md` | gotowe |
| 12 | Architektura zabezpieczeń | `MV_DESIGN_PRO_PROTECTION_ARCHITECTURE.md` | gotowe |
| 13 | Wersjonowanie danych i provenance | `MV_DESIGN_PRO_DATA_VERSIONING_PROVENANCE.md` | gotowe |
| 14 | Plan wydajności | `MV_DESIGN_PRO_PERFORMANCE_PLAN.md` | gotowe (pomiary bazowe zmierzone; budżety do akceptacji) |
| 15 | Plan migracji (§161) | `MV_DESIGN_PRO_MIGRATION_PLAN.md` §1–§2 (M0–M7, 40 wycinków) | gotowe |
| 16 | Trzy wycinki pionowe (§163–§165) | plan migracji §3 | gotowe |
| 17 | ADR (§162) | `docs/adr/ADR-012…ADR-028` (17, PROPOSED) | gotowe |
| 18 | KEEP / REPLACE / DELETE | plan migracji §6; audyt §4; mapowania w każdym dokumencie obszarowym | gotowe (LOC z pomiarów) |
| 19 | Bramki jakości ≥ 9/10 (§166) | plan migracji §5 (10 obszarów × 10 kryteriów) | gotowe (propozycja rubryk) |
| 20 | Wymagania dodatkowe (§177), konflikty (§178), decyzje, STOP (§180) | ten dokument §2–§5 | gotowe |

Jeśli numeracja pozycji w mandacie różni się od powyższego mapowania — treść jest kompletna, zmienia się tylko przypisanie numerów.

---

## 2. Wymagania dodatkowe odkryte przez audyt (§177) — czego brakuje w mandacie

Format: **wymaganie** · powód (dowód) · priorytet · wpływ na architekturę · wpływ na workflow · rekomendacja.

### 2.1 Fundament pomiaru i jakości (odkryte w A10 — mandat zakłada, że „zielone" jest dowodem)
1. **Hash kanoniczny niezależny od platformy** · 7/18 scenariuszy nN ma inny hash w CI niż lokalnie (A10-02) · P0 · warunek świeżości, determinizmu, fixtur współdzielonych (ADR-018) · bez tego „nieaktualny/aktualny" jest niewiarygodne · M0-2 przed wszystkim.
2. **CI wymagane i zielone; jedno środowisko guardów** · 5/8 workflowów czerwone na `main` bez required checks (A10-01) · P0 · brak · brak · M0-1.
3. **Rejestr sieci wzorcowych w kodzie (G01–G17 + sieć L) i moduł inwariantów klasy** · 3 niezgodne listy, 264 buildery, inwarianty jako instancje (A10-05/06/07) · P0 · testy parametryzowane po rejestrze · test §181 na jednej sieci · M0-5.
4. **Guardy determinizmu na realnych biegach** · dzisiejsze nie uruchamiają solvera ani renderu (A10-09) · P1 · — · — · M0-5.
5. **Wyrocznie wizualne właściciela w repo** · `accept:sld-v3` ocenia kod jego własnymi funkcjami („395 PASS" przy 6/10; A10-13) · P1 · L4 render · odbiór B-02 · referencyjne rendery jako fixtury.
6. **Generowany STAN_REPO i drzewa katalogów; CLAUDE.md bez liczb; jedna hierarchia dokumentów** · root opisuje nieistniejący stan, 3 hierarchie (A10-04, S1) · P1 · — · — · M7.

### 2.2 Model i dane (A1, A2, A6, A11)
7. **Rejestr założeń projektu z provenance** (Sk″max/min, U, cosφ, T, normy, c, tk, rezerwy, k_j) · założenia w 4 miejscach, dwa Sk″ w projekcie, „Wkrótce" (EF-001…006; A6-14) · P0 · `ProjectAssumptions` (FAZA C §3) · W1 · wdrożyć przed doborem.
8. **Warunki przyłączenia OSD jako dokument wejściowy** (`ConnectionConditions`) · 3 pola dziś (EF-001) · P0 · zasila `GridConnectionPoint` i założenia · W1/W7 · —.
9. **Zapotrzebowanie i jednoczesność** (`DemandRecord`, profile odbiorców) · `Load` bez zapotrzebowania; dobór TR/kabla „od In" (EF-011/014/020) · P0 · encja + katalog profili · W3–W6 · warunek doboru od zapotrzebowania.
10. **Lifecycle assetu i stany EARTHED/TRIPPED/`in_service`** · brak osi lifecycle (A1-07) · P1 · warstwa ASSET · eksploatacja · ADR-012.
11. **Poziom napięcia jako encja (kontener), pasma nN jedna stała** · liczba i dwie niezgodne stałe (A1-05) · P1 · `VoltageLevel` · — · ADR-012.
12. **Dziennik decyzji projektowych i rejestr założeń per projekt; sekcja `assumptions` w śladzie i dowodzie** · 0 w produkcie (A2-16, A10-12) · P1 · `DesignDecision`, `Assumption` · W13/W14 · wersjonowanie §4.3.
13. **Dane normowe nN (Tab. 41.1, t-I gG) i tabele selektywności producentów** · „spełnia" nieosiągalne (A11-06, A4-12) · P1 · katalog z weryfikacją · W6/W10 · decyzja zakupu.
14. **Współrzędne geograficzne jako pola addytywne (bez trybu geo w wersji 1)** · 0 współrzędnych, D-12 (A9-16) · P2 · `Location` na stacjach/trasach · planowanie tras · włączyć do modelu teraz, tryb geo później.
15. **Linie napowietrzne nN, ekran kabli SN, agregat/UPS z katalogiem i SZR** · nieobecne (A11-14/17) · P2 · encje · W6 · wersja 1.1.

### 2.3 Symulacja (A3, A5, A11)
16. **Rozpływ nN 4-przewodowy (ABCN) jako nowy solver** · FDLF nie zbiega na kablach nN; rozpływ niesymetryczny odcięty (A3-03, A11-11) · P0 · ADR-021 · W6/W12 · decyzja S-Q1.
17. **Wyspy SN z solvera (bilans, GFM jako referencja, protection validity)** · silnik wysp tylko nN-projekcja (A5-05) · P1 · `TopologyService` + assembler partycjonujący · W11 · symulacja §5.4.
18. **BESS pełny (stan, sprawność, P/Q ładowanie/rozładowanie, szereg, black-start)** · model = energia + 2 moce + stringi (A5-04) · P1 · `BatteryUnit` · W7 · —.
19. **Wkład zwarciowy DER z karty (nie tylko k_sc·In), sekwencje z katalogu** · A5-14 · P1 · `SequenceView` · W7/W10 · —.
20. **Rozruch silników z encją silnika i inrush TR w koordynacji** · DTO z zaszytą impedancją (A11-09; A4 W13) · P2 · `AsynchronousMachine` · W10 · —.
21. **PQ liczone (harmoniczne ze źródeł na elementach, flicker, asymetria) zamiast fabrykowanych widm** · A5-08, A11-10 · P2 · źródła harmonicznych jako atrybuty · W12 · —.

### 2.4 Zabezpieczenia (A4 — 16 wymagań; tu esencja)
22. **IED + grupy nastaw + wersjonowanie nastaw** · P0 · ADR-022 · W10 · —.
23. **Trip matrix + CBF (50BF) + rezerwa** · P0 · ADR-022 · W10 · —.
24. **Kierunkowość 67/67N i kryteria ziemnozwarciowe sieci kompensowanych (Y0>/G0>/B0>, U0>, sin/cos φ)** · brak modelu kierunku; OZE odwraca prąd (A4-07) · P0 · nowy solver kierunkowy · W7/W10 · —.
25. **SPZ jako obiekt modelu z koordynacją LoM** · 6 reprezentacji, 0 w modelu · P0 · `SpzScheme` · W7/W10 · —.
26. **Trace protection per odcinek nN i SN z FUSE/MCB/gG** · P0 · `trace_protection` · W6/W10/W13 · —.
27. **87T, 49/46/27/59/81 z solwerem, selektywność logiczna i energetyczna nN, profile OSD (IRiESD) jako katalog, CT wielordzeniowy z Rct/Vk, aparatura z Ima/Ics/cyklem, RCD/TT/IT, kaskada unieważnienia po nastawach** · P1–P2 · zabezpieczenia §3–§7 · W10 · —.

### 2.5 Workflow i UI (A12, A8)
28. **Definicja gotowego per cel projektu i plan analiz jako jedna akcja** · 2 z 8 biegów; NBA kończy się na E5 (EF-029/045) · P0 · `WorkflowEngine` · wszystkie · FAZA C §2.
29. **Remedia dla każdego FAIL z podglądem skutków** · EF-047 · P0 · `Remedy`, `ImpactPreview` · W13 · —.
30. **Dobór z kandydatami dla 8 klas (nie tylko DER)** · EF-037 i in. · P0 · FAZA D cz. 2 · W3–W10 · —.
31. **Akcja naprawcza wykonuje naprawę (executor), nie nawiguje** · 100 % nawigacja (EF-046) · P0 · reuse `fixActionSurfaceExecutor` · W13 · —.
32. **Jeden inspektor z akcjami obiektowymi (TRACE/SIZE/REPLACE/COMPARE/FAULT/SWZ)** · 7 inspektorów; akcje kończą się toastem (A8-05/08) · P1 · FAZA C §5 · — · —.
33. **Stacja typowa / powielanie / wstaw N stacji wzdłuż ciągu; metryka projektu** · EF-059, EF-009 · P1 · `StationTypical`, `ProjectMetadata` · W4/W14 · —.
34. **Profile ról ortogonalne do trybów** · 3 tryby, 0 ról (EF-053) · P2 · FAZA C §6 · — · decyzja C-06.
35. **Pakiet dokumentacji jednym klikiem z gotowością i świeżością per dokument; zestawienia (kable SN, TR, pola/rozdzielnice, CT/VT, przekaźniki)** · 5 generatorów, 4 zestawienia brak, magazyn bez hasha (A9-20, A10-11) · P1 · `DocumentType`, `DocumentRecord{model_revision}` · W14 · —.

### 2.6 API, persystencja, integracje (A9)
36. **Optymistyczna kontrola wersji (`If-Match` → 409) i blokada międzyprocesowa** · `RLock` tylko w procesie · P1 · ADR-028 · — · —.
37. **Aktor w komendach/biegach/dokumentach nawet w trybie jednostanowiskowym** · 0 tożsamości (A9-06) · P1 · ADR-028 · — · decyzja W-D1.
38. **Zadania długotrwałe (202/status/anulowanie/postęp)** · sync w żądaniu (A9-10) · P0 · ADR-020 · W8 · —.
39. **Snapshot OpenAPI + generowany klient TS; guard trasa↔konsument dwukierunkowy** · ręczne lustro, ≈70 sierot (A8-10, A9-04) · P1 · — · — · M0/M1.
40. **Retencja i GC artefaktów biegów; backup/harmonogram; limity uploadu; kontrakt błędów z `request_id`** · A9 §9 · P2 · — · — · —.
41. **CGMES z API/UI (EQ/TP/SSH/SV), DXF z backendu z blokami, SCL jako eksport projektu stacji (jeśli decyzja)** · A9-15/17/18 · P2 · architektura §24 · W14 · decyzje.
42. **Granica SCADA: as-designed vs as-operated; bez `pending_command` w modelu projektowym** · A9-19 · P1 · warstwy OPERATIONAL/MEASUREMENT · eksploatacja · ADR-023.

---

## 3. Konflikty z mandatem (§178) — gdzie mandat prowadziłby do złej abstrakcji, duplikatu lub złej fizyki, i jak rozstrzygnięto w propozycji

| # | Konflikt | Strona A (mandat) | Strona B (kanon repo / fizyka / stan) | Rozstrzygnięcie w propozycji |
|---|---|---|---|---|
| K-01 | Punkt przyłączenia pierwszej klasy (§44) | obiekt w modelu | Core Rule 5 / `pcc_zero_guard`: zakaz w NetworkModel; w kodzie 12 rozproszonych ról | `GridConnectionPoint` jako obiekt **umowny** wskazujący terminal; fizyka nie wie o umowie (ADR-027) |
| K-02 | Terminal-centric (§10) vs solvery na Y-bus | wszystko przez terminale | solvery FROZEN pracują na węzłach | CN→TN wyprowadzane przez `TopologyService`; assembler buduje widoki solverowe (ADR-014/020) |
| K-03 | „Cztery postacie sieci" (§7–§8: as-designed/as-built/as-operated/scenario) jako osobne modele | kopie | Single Model Rule | warstwy jako przestrzenie atrybutów na wspólnych id + `EffectiveStateResolver` (ADR-017) |
| K-04 | 11 warstw stanu (§6) | rozumiane jako 11 struktur | duplikacja danych | jak K-03 |
| K-05 | Jednostki per wartość (§92) | każda liczba z jednostką | koszt/rozwlekłość wewnętrznych kontraktów | jednostki SI wewnętrznie; `Quantity` wyłącznie na granicy API/UI/dokumentów (architektura §15.3) |
| K-06 | „Ten sam layout SN i nN" (§96–§99) | jeden układ | różne gramatyki i skale | ta sama **scena semantyczna** i rejestr symboli; osobne `LayoutDocument` per widok (ADR-023/024) |
| K-07 | Wyspy i praca wyspowa DER (§43) vs rdzeń NR z jednym slackiem | wyspy w rozpływie | rdzeń FROZEN | assembler partycjonuje per wyspa; GFM jako referencja wyspy; rozszerzenie rdzenia przez ADR-021 (B-01) |
| K-08 | Nastawy jako część twin (§34) vs Core Rule #4 (Case = parametry) i blokada V11 `relay.legacy_write_disabled` | nastawy w modelu | nastawy w przypadku | nastawy bazowe w modelu (IED, grupy), przypadek wybiera grupę/override jako deltę (ADR-022; decyzja PZ-01) |
| K-09 | Propagacja automatyczna (§175) vs all-or-nothing + koszt N-1 + determinizm | recalc po każdej zmianie | dziś niewykonalne | selektywna inwalidacja (ADR-026) + jawna polityka przeliczeń (decyzja C-01) |
| K-10 | Auto-dobór (§55) vs „No Heuristics in Solvers"/„zero fizyki w UI" | ranking i rekomendacje | zakaz heurystyk | dobór w warstwie interpretacji z jawnymi kryteriami normatywnymi, deterministyczny, bez fizyki (FAZA D cz. 2, O-01/O-02); „optymalny" wymaga kryterium (decyzja C-05) |
| K-11 | Role §168 vs kanon 3 trybów zaawansowania | role | tryby | role jako profile ortogonalne (decyzja C-06) |
| K-12 | Fix-action = 1 klik naprawy (§174) vs decyzja integracyjna D1 nawigacji ui2 | executor | nawigacja | executor (istnieje legacy) — zmiana decyzji D1 (C-… w FAZIE C) |
| K-13 | Twin wielostanowiskowy (role, ślad „kto") vs decyzja właściciela 2026-08-05 (jednostanowiskowo, bez auth) | multi-user | single-user | zaprojektować pod serwer (aktor w komendach, `If-Match`), uruchamiać lokalnie; decyzja W-D1 |
| K-14 | IEC 61850/SCL (§123) vs D-05a „nie budować bez konsumenta" | SCL | brak konsumenta | zdefiniować konsumenta (eksport SSD projektu stacji) lub potwierdzić wyłączenie (decyzja) |
| K-15 | GIS (§122) vs D-12 odłożone | geo | brak | pola geo addytywne w wersji 1, tryb geo później (wymaganie 14) |
| K-16 | „Montować trasy tylko z konsumentem UI" vs API integracyjne twin | API bez UI | guard montowania | rozszerzyć regułę o klasę „API integracyjne" w macierzy kompatybilności |
| K-17 | Zero-Debt CLAUDE.md („wykryte = naprawione natychmiast") vs mandat §2/§180 (audyt bez implementacji) | naprawiać | nie naprawiać | mandat wygrywa w tej sesji; wszystkie defekty zarejestrowane (audyt, rejestry), naprawa od M0 po decyzji |
| K-18 | Frozen Result API (Core Rule 6) vs konsolidacja 4 rejestrów biegów i `ResultSetV2` | zmiana | zamrożenie | `ResultSetV2` addytywnie obok v1; rejestr biegów to warstwa persystencji, nie wynik solvera (ADR-018/028) |
| K-19 | `SLD_SCADA_CAD_CONTRACT.md` („BoundaryNode ZAWSZE") vs Core Rule 5 | — | sprzeczne dokumenty BINDING | kontrakt do poprawy; terminologia prezentacyjna „punkt przyłączenia" z `GridConnectionPoint` |
| K-20 | §146 lista G01–G17 i treść §21/§60/§115/§131 nie występują w repo; §150 „kabel 35→70" nie ma instancji (jest 120→95 nN); „PROMPT_MV_DESIGN_PRO_PRZEBUDOWA.md" (kanon docelowy wg CLAUDE.md) nie istnieje | odwołania | brak | mapowania oznaczone jako inferowane; kanon docelowy = `docs/twin/` po decyzji |
| K-21 | Liczby w briefach/dokumentach (274 trasy, 88 guardów, 1600+/5400 testów, „QSTS istnieje", „import XLSX ✅", „P0 DoD KOMPLET nN") | deklaracje | pomiar: 334 tras, 78 guardów, 8 672 funkcji testowych / 10 523 zebranych, QSTS fantom, XLSX do legacy, trace nN brak | raport podaje pomiar i źródło rozbieżności; STAN_REPO do wygenerowania z pomiarów |
| K-22 | Reguła KLASA-NIE-INSTANCJA vs deklaracje „jedna fizyka" (N-D4 zunifikowała 2 z 5 IDMT), „nN DoD komplet" | — | — | inwentarz klasy przed każdą kartą naprawczą (plan migracji §0 pkt 4) |

---

## 4. Decyzje wymagające właściciela (skonsolidowane; identyfikatory z dokumentów obszarowych)

| ID | Decyzja | Skąd | Rekomendacja |
|---|---|---|---|
| D-01 | Przejście z ENM v1 (bus-branch) na model terminalowy jako źródło prawdy, z migracją projektów i mostem na czas cutoveru | architektura §27.1 | tak (ADR-012/013) |
| D-02 | `GridConnectionPoint` jako obiekt umowny na terminalu; `pcc_zero_guard` strukturalny | architektura §27.2, A5-06, A12 Q9 | tak (ADR-027) |
| D-03 | Kasacja toru legacy ORM (`network_*`, `analysis_runs`, `study_runs`, wizard, `operating_cases`) bez migracji danych — po potwierdzeniu braku projektów użytkowników i eksporcie ZIP | architektura §27.3, wersjonowanie §11.1, A9 Q3, migracja F-D2 | tak |
| D-04 | Miejsce silnika layoutu: semantyka sceny w backendzie, geometria w deterministycznym silniku TS z trwałością w backendzie (uruchamialnym w backendzie do eksportu) | architektura §27.4, SLD §13.3 | tak (ADR-023) |
| D-05 | Polityka rewizji katalogu (kto publikuje, jak często, „przypięcie na stałe" w projektach zatwierdzonych) | architektura §27.5, wersjonowanie §11.2 | publikacja przez administratora katalogu; projekt przypina rewizję; zmiana tylko komendą z podglądem skutków |
| D-06 | Element RETIRED w `semantic_hash` (tak, z flagą), nie w `input_hash` | wersjonowanie §11.3 | tak |
| D-07 | Usunięcie MongoDB/Redis/Celery z compose; pula procesów w API | wersjonowanie §11.4, symulacja §11.6, wydajność W-D2 | tak (ADR-020) |
| D-08 | Nowy solver nN 4-przewodowy (current-injection/BFS ABCN) zamiast rozszerzania NR | symulacja §11.1 | nowy solver (ADR-021) |
| D-09 | B-01: rozszerzenia rdzeni (Ith n≠1, szyny PV, slack rozproszony, algebra rzadka) jako ścieżki addytywne z testem tożsamości | symulacja §11.2 | zgoda (ADR-021) |
| D-10 | Kasacja legacy ścieżek uruchomienia (`/api/runs/*`, `enm/runs`, `power-flow-runs/execute`) po potwierdzeniu braku klientów | symulacja §11.3, A9 Q4 | tak |
| D-11 | Determinizm N-1 z ciepłym startem: bit-identyczność vs tolerancja per solver | symulacja §11.4, wydajność W-D6 | tolerancja zadeklarowana w rejestrze zdolności i testowana |
| D-12 | `trace_v2` (2 404 LOC bez konsumenta): wpiąć jako jedyny format śladu vs usunąć | symulacja §11.5 | wpiąć |
| D-13 | Adnotacja w wystawionych certyfikatach o tautologicznym teście LVRT T14/T15 | symulacja §11.7, A5-07 | tak (uczciwość) |
| D-14 | Zatwierdzenie pakietu symboli R3 (wspólny SN+nN) przed migracją renderera SN — werdykt B-02 | SLD §13.1, symbole §5 | procedura z `SLD_SYMBOL_SYSTEM_PLAN.md` §4 |
| D-15 | Jedna geometria z LOD jako filtrem vs trzy sceny per LOD | SLD §13.2 | jedna geometria |
| D-16 | Kasacja ≈54 tys. LOC SLD legacy po parytecie; harnessy archetypów → fixtury rejestru czy kosz | SLD §13.4 | kosz po przeniesieniu potrzebnych sieci do rejestru |
| D-17 | Źródło stanu dla polityki SCADA: import/wpis ręczny teraz, telemetria później, bez sterowania | SLD §13.5, A9-19 | tak |
| D-18 | Dostęp do bazy IEC 60617 dla statusu NORMATIVE_VERIFIED symboli; konwencja oznaczeń (IEC 81346 vs zwyczaj OSD); geometria łączników R2.1 jako jedyna dla SN | symbole §5.1–5.3 | zakup/dostęp; 81346 z aliasem OSD; tak |
| D-19 | Polityka przeliczeń po zmianie modelu (natychmiast / na żądanie / w tle z budżetem) | workflow C-01, A12 Q1 | „w tle z budżetem" po ADR-026; wcześniej „na żądanie" z jedną akcją |
| D-20 | Definicja gotowego per cel projektu (analizy/kryteria/dokumenty) | workflow C-02, A12 Q2 | przyjąć wersję 1 z FAZY C §2.2 |
| D-21 | Nastawy w modelu (IED, grupy) + przypadek wybiera grupę/override; zdjęcie blokady V11 | workflow C-03, zabezpieczenia PZ-01, A4 §9.1, A12 Q3 | tak |
| D-22 | Odbudowa wejścia nN: akcje w kanwie/drzewie nN + inspektor (bez nowej przestrzeni) | workflow C-04, A12 Q5, A11-01 | tak |
| D-23 | Kryterium „optymalny": minimalny spełniający z rezerwą + standaryzacja; koszt/straty opcjonalnie | workflow C-05, optymalizacja O-D1, A12 Q4 | tak |
| D-24 | Role jako profile ortogonalne do trybów | workflow C-06, A12 Q7 | tak |
| D-25 | Warianty projektu jako gałęzie rewizji na jednym modelu (zgodność z Single Model Rule) | workflow C-07, A12 Q8 | tak (ADR-016) |
| D-26 | Dane normowe IEC 60364-4-41 Tab. 41.1, t-I gG, tabele selektywności producentów — zakup/pozyskanie | workflow C-08, zabezpieczenia PZ-05, A4 Q3 | zakup + tabele producentów z weryfikacją; do czasu „nierozstrzygalne" |
| D-27 | Minimalny pakiet dokumentacji i formaty (PDF/A, DXF, XLSX, CIM) | workflow C-09, A9 Q8, A12 Q10 | 14 typów §124; PDF/A i DXF obowiązkowe; XLSX dla zestawień |
| D-28 | Przypadek może nadpisywać c/tk/T z rejestru założeń (z jawnym oznaczeniem) | workflow C-10, A12 Q6 | tak |
| D-29 | Dane kosztowe (`CostCatalog`) i niezawodnościowe (λ, r) — źródło i zakres wersji 1 | optymalizacja O-D2/O-D3 | katalog użytkownika z provenance; niezawodność jako zaczepy |
| D-30 | Ekonomiczna gęstość prądu (IEC 60287-3-2) jako opcjonalne kryterium; budżet biegów optymalizacji; Pareto dla ≥ 2 celów | optymalizacja O-D4/5/6 | tak |
| D-31 | FUSE (rozłącznik bezpiecznikowy SN, wkładki nN) jako aparat wyłączający w trace | zabezpieczenia PZ-02, A4 Q7 | tak |
| D-32 | Konwencja kierunkowości dla OSD (67N sin/cos φ; admitancyjne) w profilu domyślnym; granulacja trip matrix i CBF | zabezpieczenia PZ-03/PZ-04, A4 Q4/Q5 | profil per OSD; stopień→aparat; CBF do aparatów zasilających szynę |
| D-33 | Jeden katalog IED z realnymi kartami; natychmiastowe usunięcie nazw „ABB REX-100/200/300/500" (fabrykacja pod marką) | zabezpieczenia PZ-06, A4 Q6, A6-17 | tak, natychmiast (M0-4) |
| D-34 | Zakres wersji 1 zabezpieczeń: 21/21N, 64, 87BB poza; SWZ per odcinek; jednostki zakresów nastaw | zabezpieczenia PZ-07/08/09 | tak |
| D-35 | Pola runtime (łączność, komendy, pomiary) tylko w profilu eksploatacyjnym; usunięcie `pending_command` z modelu projektowego | zabezpieczenia PZ-10, A9 Q9 | tak |
| D-36 | Topologia wdrożenia: narzędzie lokalne vs serwer wielostanowiskowy (auth, aktor, Postgres) | wydajność W-D1, A9 Q1, K-13 | projektować pod serwer, uruchamiać lokalnie; aktor od razu |
| D-37 | Postgres obowiązkowy; retencja artefaktów biegów; budżety wydajności jako bramka CI | wydajność W-D3/4/5 | tak |
| D-38 | Kolejność migracji M0 → M1 → wycinki pionowe równolegle z M2–M5 → M6 → M7; bramki ≥ 9/10 jako warunek scalenia; orkiestracja wykonawców kartami | migracja F-D1/5/7 | tak |
| D-39 | Kasacja 191 i archiwizacja 464 dokumentów; los 28 rozdziałów SPEC V11 (archiwum w repo czy poza) | migracja F-D3, A10 Q3/Q4 | kasacja + archiwum w repo (jeden katalog `docs/archive/<rok-miesiąc>/`) |
| D-40 | Lista sieci wzorcowych G01–G17 + sieć L (G00) — potwierdzenie listy §146 | migracja F-D4, A10 Q1 | przyjąć propozycję z planu migracji §4 |
| D-41 | Zakres wersji 1 poza mandatem: 61850/SCL (konsument?), GIS tryb geo, niezawodność bez danych | migracja F-D6, K-14/K-15 | SCL: tylko jeśli wskazany konsument; GIS pola tak/tryb później |
| D-42 | Które zapadki przekroczone na HEAD naprawić przed przebudową (wszystkie w M0-3) | A10 Q6 | wszystkie w M0 |
| D-43 | Zależności raportów (reportlab, python-docx) obowiązkowe w produkcji i CI (skip = fail) | A10 Q8, A9-13/26 | tak |
| D-44 | `symphony/` (orkiestracja agentów kodujących w produkcie) — kasacja lub przeniesienie poza produkt | A9 Q10 | kasacja z `backend/src` |
| D-45 | Format XLSX importu: obecny 5-arkuszowy czy rozszerzony o stacje/pola/nN/katalog | A9 Q11 | rozszerzony, `typ_katalogowy` obowiązkowy |
| D-46 | Czy pełne raporty audytowe A1–A12 (≈870 KB, dowody `plik:linia`) mają trafić do repo jako archiwum audytu | ten pakiet (P-05 w audycie §9) | tak, do `docs/archive/2026-09-twin-audit/` po decyzji |

---

## 4a. Werdykt właściciela (2026-09-02) — korekty decyzji i wymagania dodatkowe

**Werdykt:** ARCHITEKTURA DOCELOWA: ZATWIERDZONA WARUNKOWO · M0: ZGODA NA START · M1–M7: STOP do odbioru M0 i naniesienia korekt · B-01 i B-02 pozostają osobnymi bramkami właścicielskimi. Zatwierdzony kierunek: ONE TWIN · ONE ASSET IDENTITY · TERMINAL-CENTRIC CONNECTIVITY · DERIVED TOPOLOGY · SCENARIO DELTAS · EFFECTIVE STATE RESOLUTION · CANONICAL NETWORK SNAPSHOT · SOLVER ADAPTERS · CANONICAL RESULT + PROVENANCE · CAD / SCADA / ENGINEERING AS PRESENTATION POLICIES · STRANGLER MIGRATION. Nadrzędne zasady dla wszystkich decyzji: jedna prawda, brak regresji, brak silent fallback, pełny provenance; żadna decyzja architektoniczna nie może być optymalizowana wyłącznie pod aktualny fixture. Cel migracji NIE jest liczbą LOC ani liczbą dokumentów — kryterium to jedna prawda, pełna fizyka, traceability, brak pracy ręcznej między modułami i zdolność do projektowania dowolnych realnych sieci SN+nN.

| Decyzja | Werdykt | Korekta właściciela | Gdzie naniesiono |
|---|---|---|---|
| D-01 terminalowy TwinModel | TAK | docelowy source of truth, nie „wieczny most" | architektura §5–§6; ADR-012/013 |
| D-02 `GridConnectionPoint` | TAK | obiekt umowny wskazujący terminal, nie drugi węzeł fizyczny | ADR-027 |
| D-03 kasacja legacy ORM | WARUNKOWO | procedura kasacji: inventory → consumer search → data export → parity → cutover → post-cutover observation → removal; zero kasacji na podstawie przypuszczenia lub celu LOC | plan migracji §0 pkt 8 |
| D-04 layout | TAK | semantyka w backendzie, geometria deterministyczna; ręczny layout jako presentation state | ADR-023 |
| D-07 Redis/Celery → pula procesów | ZMIENIĆ | abstrakcja `ExecutionBackend`: `LocalProcessPoolExecutionBackend` teraz, `WorkerQueueExecutionBackend` później bez zmiany `SolverOrchestrator` i kontraktów biegów; nieużywany Redis/Celery może zniknąć z obecnego produktu | symulacja §7.1; wydajność §2.3; ADR-020 |
| D-08 solver nN ABCN | TAK — P0 | niezbędny dla rzeczywistego twin nN | ADR-021 |
| D-09 rozszerzenia solverów B-01 | TAK WARUNKOWO | addytywnie, z niezależnymi przypadkami referencyjnymi, testem tożsamości starej fizyki, tolerancją numeryczną i porównaniem wydajności | ADR-021; plan migracji §8 (B-01) |
| D-14 symbole R3 | TAK | B-02 oceniany na rzeczywistych arkuszach CAD/SCADA SN+nN, nie na snapshotach SVG | plan migracji §8 (B-02) |
| D-18 IEC 60617 / 81346 | TAK WARUNKOWO | IEC 60617 dla symboliki; IEC 81346 dla oznaczeń wyłącznie przez konfigurowalny profil; zachować konwencję OSD/projektową | plan symboli §5 |
| D-19 przeliczenia | TAK | docelowo dependency graph + background budget; w pierwszej fazie RECALCULATE AFFECTED | workflow §7; ADR-026 |
| D-23 „optymalny" | ODRZUCONE W OBECNEJ FORMIE | „minimalny spełniający + rezerwa + standaryzacja" = DEFAULT DESIGN POLICY, nie definicja optimum; silnik multi-objective: TECHNICAL FEASIBILITY, CAPEX, LOSSES, RESERVE, STANDARDIZATION, N-1, RELIABILITY, FUTURE EXPANSION; Pareto dla wielu celów | optymalizacja §5.1, §10 |
| D-27 dokumentacja | TAK WARUNKOWO | PDF/A + XLSX + techniczny eksport wektorowy; bez fałszywego „DWG"; DXF jako jawny adapter; CIM jako wymiana danych, nie dokument CAD | workflow W14 |
| D-31 FUSE w trace | TAK | wyłącznik nie jest jedynym aparatem przerywającym tor | zabezpieczenia PR-05 |
| D-33 fikcyjny katalog przekaźników | TAK — NATYCHMIAST (M0) | nazwy wyglądające jak produkty producenta bez prawdziwego katalogu niedopuszczalne | M0-4 |
| D-34 zakres zabezpieczeń v1 | ZMIENIĆ | nie wolno wyłączyć funkcji, które system już posiada i poprawnie liczy; `ProtectionCapabilityRegistry` ze stanami SUPPORTED / PARTIAL / PLANNED / NOT_IMPLEMENTED; zero regresji funkcjonalnej | zabezpieczenia §5a; ADR-022 |
| D-36 local/server | TAK | architektura server-capable, wdrożenie local-first; aktor i współbieżność od początku | ADR-028; architektura §21a |
| D-37 Postgres | TAK | docelowy persistence layer; SQLite tylko techniczny tryb dev/test przy identycznych kontraktach | ADR-028 |
| D-38 migracja strangler | TAK | vertical slice, parity, cutover, DELETE old path | plan migracji |
| D-39 dokumenty 191/464 | ZMIENIĆ | najpierw ARCHIVE + SUPERSESSION MANIFEST + REFERENCE/LINK AUDIT; DELETE dopiero po dowodzie, że dokument nie zawiera jedynej informacji kanonicznej; liczba plików nie jest KPI | plan migracji M7-1 |
| D-40 G01–G17 | TAK + ROZSZERZYĆ | rejestr = żywy katalog KLAS przypadków, nie zamknięta lista 17 fixture; obowiązkowe klasy wg §D werdyktu | plan migracji §4; M0-5 |
| D-41 GIS/SCL/niezawodność | TAK | pola geograficzne i zaczepy niezawodnościowe od początku; pełne moduły dopiero z konsumentem | architektura §24 |
| D-42 zapadki | TAK | wszystkie w M0 — nie budujemy twin na czerwonej bazie | M0-3 |
| D-43 zależności raportów | TAK | generator dokumentów jest częścią produktu; skip w CI nie może udawać PASS | plan migracji M0 |
| D-44 `symphony/` | TAK | narzędzia orkiestracji agentów nie należą do `backend/src` | plan migracji §6.3 |
| D-45 XLSX | TAK | import tworzy Twin/komendy domenowe, nigdy drugi model SQL | ADR-028; M1-4 |
| D-46 raporty A1–A12 | TAK | zachować jako audit evidence archive | D-46 |
| pozostałe D-05, D-06, D-10…D-13, D-15…D-17, D-20…D-22, D-24…D-26, D-28…D-30, D-32, D-35 | TAK (wg rekomendacji) | pod zasadami nadrzędnymi powyżej; D-10/D-16 podlegają procedurze kasacji jak D-03 | — |

**Wymagania dodatkowe właściciela (§C werdyktu) — naniesione do architektury docelowej:** (1) SOLVER CAPABILITY REGISTRY (typ sieci, model fazowy, zdolność topologiczna, źródła, DER, uziemienie, typy zwarć, szeregi czasowe — orkiestrator wybiera solver po zdolności, nie po końcówce) — symulacja §8; (2) REFERENCE VALIDATION SUITE (golden network ≠ self-test; wyrocznia analityczna / normowa / opublikowany benchmark / niezależnie zweryfikowany wynik) — architektura §26a, rejestr sieci M0-5; (3) TOPOLOGY CAPABILITY MATRIX (radial, ring, NOP, bus coupler, shared upstream, independent sources, parallel operation, backfeed, island, multi-TR, multi-section, deep nN, phase-domain) — architektura §9a; (4) NORMATIVE / DATA SOURCE REGISTRY (klasy STANDARD / OSD POLICY / MANUFACTURER / CATALOG / USER ASSUMPTION / MEASUREMENT z provenance i rewizją) — architektura §15.5; ADR-019; (5) CONCURRENCY CONTRACT (`expected_revision`, `actor`, `command_id`; konflikt = 409 CONFLICT; zakaz silent last-write-wins; dual-write w stranglerze z guardem równoważności i krótkim terminem życia) — architektura §21a; ADR-028; (6) PERFORMANCE BUDGET MATRIX (osobne budżety: topology, snapshot assembly, LF, SC, ABCN nN, scenario batch, projection SN, projection nN, dense renderer, document generation) — plan wydajności §1a.

**M0 (autoryzowane) — definicja odbioru wg §A werdyktu:** 8/8 workflowów CI zielone; required checks skonfigurowane tam, gdzie możliwe; hash kanoniczny deterministyczny cross-platform; wszystkie przekroczone zapadki usunięte u źródła; usunięte fabrykacje użytkowe (fikcyjne nastawy, fikcyjne katalogi/nazwy producentów, silent fallback); golden network registry jako jedno źródło przypadków integracyjnych; invariant test framework; snapshot OpenAPI; baseline wydajności S/M/L; raport M0 z BEFORE/AFTER. Po M0: STOP — bez automatycznego przejścia do M1. Raport: `M0_FINAL_REPORT.md`.

---

## 5. Co NIE zostało zrobione i dlaczego (uczciwość raportu)

- **Żadna naprawa kodu** — mandat §2/§180: tylko audyt i dokumenty (jedyna korekta poza `docs/twin/`: `CLAUDE.md`, moduł `ui2/shared` — dopuszczalna minimalna bezpieczna naprawa dokumentu, usuwa jedną z pięciu przyczyn czerwieni CI); pozostałe cztery przyczyny czerwieni `main` pozostają, fantom nastaw w szufladzie SLD pozostaje na żywo, nazwy „ABB REX-…" pozostają w katalogu, zapadki pozostają przekroczone. Wszystko zarejestrowane z priorytetem P0 w M0.
- **Pakiet symboli (§160) bez grafik** — dostarczono plan 45 pozycji CURRENT → PROPOSED z identyfikatorami IEC 60617 tam, gdzie rejestr R2.1 je ma, i procedurą zatwierdzenia; rysowanie pakietu przed zatwierdzeniem listy i geometrii przez właściciela byłoby samocertyfikacją (B-02).
- **Ocena wizualna** — nie wykonano (należy do właściciela).
- **Lista §146 i treść §21/§60/§115/§131** — nieobecne w repo; mapowania inferowane.
- **Pełne raporty A1–A12** — w katalogu roboczym sesji; w repo jest synteza (decyzja D-46 o archiwum).
- **Guardy dokumentacyjne** uruchomione lokalnie przed commitem: `docs_guard`, `docs_archive_guard`, `utf8_mojibake_guard`, `docs_count_consistency_guard`, `claude_md_struktura_guard` (+ jego test, 8 passed), `no_codenames_guard`, `forbidden_ui_terms_guard`, `repo_hygiene_guard` — wszystkie zielone (exit 0); pełna regresja pytest/vitest nie była uruchamiana ponownie, ponieważ zmiany ograniczają się do dokumentów (pełny bieg wykonany przez audyt A9/A10 na tym samym HEAD: 10 513 passed / 11 skipped).
- **Przerwa limitu API** w trakcie audytu: cztery audyty (A4, A9, A10, A12) dokończono po wznowieniu; ich raporty są kompletne i spójne krzyżowo.

---

## 6. STOP (§180) — aktualizacja po werdykcie 2026-09-02

Właściciel autoryzował WYŁĄCZNIE M0 (§4a). Po zakończeniu M0 obowiązuje ponowny STOP: `M0_FINAL_REPORT.md` (commity, BEFORE/AFTER, dowody CI, determinizm, rejestr sieci, inwarianty, benchmark, ryzyka, wpływ na ADR-012…028) i decyzja właściciela o M1. Pierwotna treść:

Program zatrzymany. Następny krok należy do właściciela: decyzje D-01…D-46 (co najmniej D-01, D-02, D-03, D-07, D-08, D-09, D-19, D-21, D-36, D-38, D-40 przed startem M0/M1). Po decyzjach: M0 (stabilizacja i pomiar) w kartach z §0 rozstrzygnięć i bramkami, potem wycinki §3 planu migracji. Bez decyzji właściciela żaden wycinek nie startuje.
