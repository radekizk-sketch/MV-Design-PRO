# Documentation Index

**Status:** AKTYWNY (kanon V12.xx)
**Aktualizacja:** 2026-05-13 (po cleanupie + rozstrzygnięciu V12K-011)

> **Cel:** Doprowadzić MV-DESIGN-PRO do systemu klasy przemysłowej SCADA/CAD (ETAP/DIgSILENT/ABB grade) — **nie atrapy z klocków**.

> **Hierarchia kanonu** (po rozstrzygnięciu konfliktu V12K-001 / V12K-011 w 2026-05-13):
> 1. `docs/v12xx/KANON_V12_XX.md` — kanon kierunkowy V12.xx (binding)
> 2. `docs/system/SPEC_*.md` — wiążące specyfikacje systemowe
> 3. `docs/domain/*.md`, `docs/sld/SLD_CONTRACT_FLOW_V1.md`, `docs/sld/SLD_INDUSTRIAL_SPEC_v1.md` — aktywne kontrakty
> 4. `mv-design-pro/SYSTEM_SPEC.md`, `ARCHITECTURE.md`, `AGENTS.md`, `PLANS.md` — executive overview
> 5. `docs/spec/SPEC_CHAPTER_*.md` (18 rozdziałów) — **ARCHIWALNE** (V11 reference; nie aktywny kanon)
> 6. `docs/audit/archive/` + `docs/audit/historical_execplans/` — archiwum

---

## Architektura kanoniczna platformy MAX (konstytucja właściciela 2026-09-04) — ŹRÓDŁO PRAWDY programu konwergencji

Kontrakt „MAX PLATFORM ARCHITECTURE & CONVERGENCE CONTRACT" i „FINAL PRODUCT CONSTITUTION" są nadrzędne wobec pakietu Digital Twin niżej (materiał wejściowy i dowodowy). Model operacyjny (role Fable / wykonawcy): `../AGENTS.md` §8.

- [architecture/PRODUCT_CAPABILITY_CONSTITUTION.md](./architecture/PRODUCT_CAPABILITY_CONSTITUTION.md) — misja, zasada MAX, trzy poziomy zobowiązania, taksonomia zdolności A–Y, reguły future-proof, nie-cele
- [architecture/CAPABILITY_ARCHITECTURE_MATRIX.md](./architecture/CAPABILITY_ARCHITECTURE_MATRIX.md) — macierz §25: zdolność → pojęcia → dane → usługi → solver → projekcja → stan (pomiar) → luka → poziom → werdykt future-proof
- [architecture/CANONICAL_TWIN_ARCHITECTURE.md](./architecture/CANONICAL_TWIN_ARCHITECTURE.md) — część A: Canonical Project Twin = rozwinięty ENM (własność projektu, terminale, fazy, uziemienie); część B: rewizja/wariant/scenariusz/StudyCase, `RevisionEnvelope`, `EffectiveNetworkSnapshot`, wykonanie, współbieżność; część C: topologia wyprowadzana, Computational IR, solvery, White Box, determinizm
- [architecture/CONVERGENCE_ROADMAP.md](./architecture/CONVERGENCE_ROADMAP.md) — stan i kontynuacja (§41), wycinki CV-0…CV-6, kroki, parity, guardy
- [architecture/DECISION_FREEZE_REGISTER.md](./architecture/DECISION_FREEZE_REGISTER.md) — decyzje fundamentalne: dowód, odrzucone alternatywy, warunki ponownego otwarcia, status
- [reference-networks/REFERENCE_NETWORK_REGISTRY.md](./reference-networks/REFERENCE_NETWORK_REGISTRY.md) — rejestr G01–G15 z klasami wyroczni; tabela generowana `REGISTRY_TABLE.md`
- [evidence/CONVERGENCE_EVIDENCE.md](./evidence/CONVERGENCE_EVIDENCE.md) — dowody: CI, ochrona `main` (owner action), determinizm, Definition of Done, karty, P0/P1, decyzje właściciela
- [evidence/OPUS_PRZEGLAD_LUK_DYNAMIKI_2026-09-23.md](./evidence/OPUS_PRZEGLAD_LUK_DYNAMIKI_2026-09-23.md) — niezależny przegląd luk dynamiki RMS (Opus 5.5, READ-ONLY, HEAD `ef9f6228`) wobec rejestru Programu A/B: macierz 27 + 25 wierszy z dowodami `plik:linia`, 15 zdolności brakujących w planie (odcinek beznapięciowy, zamknięcie NOP, wyspa GFL-only, ekwiwalent sieci z bezwładnością, źródło programowalne, zdarzenia warunkowe, `rocof_pomiarowy`), luki wyroczni per rodzina, luki mutacji, trzy obalone zawyżenia (ROCOF, H4, clearing SO-1A), trzy eksperymenty odtwarzalne (wyspa GFL/GFM, rekonekcja przy 175°)
- [evidence/OPUS_AUDYT_HARMONICZNE_SUPRAHARMONICZNE_2026-09-23.md](./evidence/OPUS_AUDYT_HARMONICZNE_SUPRAHARMONICZNE_2026-09-23.md) — audyt §91–§92 kodu harmonicznego / jakości energii (Opus 5.5, VERIFY → REPRODUCE → FALSIFY → DECIDE): 52 elementy sklasyfikowane ADOPT/ADAPT/REWRITE/KEEP_RESEARCH_ONLY/REJECT, eksperymenty F1–F9 na solverze FROZEN (napięcie harmoniczne nN ×1406, R_T ×225, wynik zależny od kolejności szyn, moc zwarciowa nieczytana, suma arytmetyczna źródeł, grupa ignorowana), macierze luk H-36…H-52 / S-53…S-67 / multi-physics / modeli / regulacyjne / wyroczni / mutacji (żadna z 9 klas nie jest zabijana testem fizyki), architektura `solvers/harmoniczne/`, trzy obalone zawyżenia w dokumentach
- [evidence/OPUS_AUDYT_WARSTWY_REGULACYJNEJ_2026-09-23.md](./evidence/OPUS_AUDYT_WARSTWY_REGULACYJNEJ_2026-09-23.md) — audyt warstwy regulacyjnej i dowodowej przed AB-1 (Opus 5.5): śledztwo Git na pełnej historii (419 gałęzi + 475 głów PR, 4779 commitów — identyfikatory §95 nie istniały; WiPWC i SyPGM istnieją), inwentarz profili/solvera/mostu/rejestru PTPiREE (6887 rekordów, `acceptance_date` przyszła w 97 %), tabela 30 liczb wymagań z proweniencją, tautologie T10/T14/T15, T20 z limitem zaszytym, most z `PPM` na sztywno i bez SyPGM, LoM z progami bez źródła, kolizja akronimu WOS, przegląd definicji §6.1–§6.11 Programu A/B z korektami (dwie osie modelu, osobny kontrakt `BadanieZgodnosci`, `WynikInzynierski` jako rozszerzenie `OcenaElementu`, reguła guardu werdyktu), tabela 20 dokumentów jakości energii do OD-38
- [evidence/OPUS_PRZEGLAD_ADWERSARIALNY_2026-09-23.md](./evidence/OPUS_PRZEGLAD_ADWERSARIALNY_2026-09-23.md) — przegląd adwersarialny zintegrowanego Programu A/B (Opus 5.5, ETAP 7 mandatu): 6 zarzutów krytycznych (typ A „zgodny" bez LFSM-O, brak nN w rejestrze, T20 czytający THD_U sieci, SSCI/tor progowy `reportable`, CERTIFIED otwierający walidację, żywy endpoint `harmonic-limits`), ~30 zarzutów wysokich/średnich (brakujące ogniwa H/SH, zdarzenia warunkowe potrzebne w AB-2R, AB-7 po AB-6 sprzeczne z zamrożeniem, brakujące krawędzie grafu, pozostałości dwóch prawd), zdania kontrolne §11 przed poprawkami, dziesięć poprawek old → new (wniesione), lista tego, co przetrwało
- [evidence/MELDUNEK_AB_1A_WYKONAWCA_1_2026-09.md](./evidence/MELDUNEK_AB_1A_WYKONAWCA_1_2026-09.md) — meldunek wykonawcy 1 karty AB-1a (Opus 5.5, D1/D4/D5/D6/D8a): inwentarz klasy na HEAD (24/24 wpisów rejestru z zapisanym `reportable=True`, dwie prawdy o `DYNAMIC_STABILITY`), `PhysicsDomain` z jednego rejestru z `reportable` wyprowadzanym z proweniencji (16 z 26 wpisów przestaje być raportowalnych — nazwane w API), `BadanieZgodnosci` z nazwaną odmową adaptera, kontrakt parametru i kody fail-closed, R-6 (T05/T10/T12/T13/T20 poza `reportable`), pełna regresja 16 932 / vitest 12 555 / e2e realny, piny z pomiaru, decyzje własne
- [evidence/MELDUNEK_AB_1A_WYKONAWCA_2_2026-09.md](./evidence/MELDUNEK_AB_1A_WYKONAWCA_2_2026-09.md) — meldunek wykonawcy 2 karty AB-1a (Opus 5.5, D2/D3/D7/D8b): `WynikInzynierski` jako rozszerzenie `OcenaElementu`/`PozycjaWerdyktu` z adapterami wyników FROZEN (NC RfG, NER, walidacja porównawcza V12.6), dwie osie statusu modelu (`status_modelu.py`, trasa `status-modelu`), guard werdyktu wyjaśnialnego (AST, 6 nośników FROZEN na liście wyjątków z adapterami, 5 nośników nie-FROZEN przebudowanych, LoM → `OcenaNastawyLom` z podstawą niezweryfikowaną zamiast błędnej „IEEE 1547 / NC RfG Art. 14"), defekt adaptera (solver zwraca `fail` dla testów niewymaganych) naprawiony, luka reguły guardu dla werdyktów typu `Enum` zmierzona (7 klas → AB-1a-bis), pełna regresja 16 816 / vitest 12 579 / 99 guardów
- [evidence/MELDUNEK_AB_1A_BIS_2026-09.md](./evidence/MELDUNEK_AB_1A_BIS_2026-09.md) — meldunek karty AB-1a-bis (Opus 5.5): guard werdyktu widzi pola typu `Enum`/`StrEnum` z tokenem i aliasy (typy z całego `src`, 19 mutacji), 7 nośników `analysis/**` i dostawcy jakości z pięcioma towarzyszami, ekran „Jakość wyników" z zapasem i podstawą niezweryfikowaną (lista wyjątków frontu 8 → 2), `PodstawaNormatywna` w `analysis/podstawa_normatywna.py` (jeden typ), znalezisko: ręczne fikstury frontu z odwróconym znakiem `margin_pct`; nazwane braki → AB-1a-ter (11 nośników poza zakresem skanu, statusy `str`, ekran „Wrażliwość", dwa opisy podstawy w ocenie technicznej, `ProtectionCurvesITView` bez producenta)
- [evidence/MELDUNEK_AB_1D_MIN_2026-09.md](./evidence/MELDUNEK_AB_1D_MIN_2026-09.md) — meldunek kamienia AB-1d_min (Opus 5.5): jedna lista źródłowa rodzajów biegów z testem parytetu (dziewięć list zmierzonych na HEAD, w tym dryf `v126_gotowosc`), rodzaje `harmoniczne`/`skan_czestotliwosciowy`/`supraharmoniczne` z nazwaną odmową i niewidoczne w UI, kontrakty `OsCzestotliwosci` i `SupraharmonicBand` bez domyślnych, niezmiennik katalogu zawężony do `CURRENT_SPECTRUM_INTEGER_ORDER`, wycofanie `POWER_QUALITY_HARMONICS` i `SSCI_IMPEDANCE` mechanizmem W3-E (410 + następca, parytet rejestr ⇔ 410 ⇔ katalog ⇔ gotowość), kasacja endpointu `harmonic-limits` i kontrolki „THD napięcia" modułu, guard wierszy zamrożenia (`program_ab_freeze_rows_guard.py`) z pomiarem siedmiu wierszy do korekty planu
- [evidence/RAPORT_FAZY_CV_2026-09-05.md](./evidence/RAPORT_FAZY_CV_2026-09-05.md) — raport fazy konwergencji CV-0 → CV-4.2b (format §42 A–J): stan faktyczny, werdykt architektoniczny, wpływ na zdolności, wdrożenia, skasowane legacy, dowody, ustalenia adwersaryjne, P0/P1, decyzje właściciela, następny wycinek

## Program Digital Twin SN+nN 2026-09 (PROPOZYCJA — pakiet do przeglądu właściciela)

Wynik mandatu „FINAL MASTER ARCHITECTURE MANDATE" (FAZY A–F, STOP §180). Nic z tego programu nie jest jeszcze wdrożone ani wiążące; hierarchia kanonu powyżej pozostaje w mocy do decyzji właściciela.

- [twin/INDEX_TWIN.md](./twin/INDEX_TWIN.md) — indeks programu i kolejność czytania
- [twin/OWNER_REVIEW_PACKAGE.md](./twin/OWNER_REVIEW_PACKAGE.md) — pakiet §179, wymagania dodatkowe §177, konflikty §178, decyzje
- [twin/MV_DESIGN_PRO_DIGITAL_TWIN_AUDIT.md](./twin/MV_DESIGN_PRO_DIGITAL_TWIN_AUDIT.md) — audyt forensyczny (FAZA A): TOP 30, macierz luk, rejestry
- [twin/ENGINEERING_FRICTION_REGISTER.md](./twin/ENGINEERING_FRICTION_REGISTER.md) — rejestr tarć inżynierskich W1–W14
- [twin/MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md](./twin/MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md) — docelowa architektura twin (FAZA B)
- [twin/MV_DESIGN_PRO_DATA_VERSIONING_PROVENANCE.md](./twin/MV_DESIGN_PRO_DATA_VERSIONING_PROVENANCE.md) — rewizje, provenance, persystencja
- [twin/MV_DESIGN_PRO_TARGET_ENGINEERING_WORKFLOW.md](./twin/MV_DESIGN_PRO_TARGET_ENGINEERING_WORKFLOW.md) — docelowy workflow inżynierski (FAZA C)
- [twin/MV_DESIGN_PRO_SIMULATION_ARCHITECTURE.md](./twin/MV_DESIGN_PRO_SIMULATION_ARCHITECTURE.md) — architektura symulacji (FAZA D cz. 1)
- [twin/MV_DESIGN_PRO_DESIGN_OPTIMIZATION_ARCHITECTURE.md](./twin/MV_DESIGN_PRO_DESIGN_OPTIMIZATION_ARCHITECTURE.md) — dobór i optymalizacja (FAZA D cz. 2)
- [twin/MV_DESIGN_PRO_PROTECTION_ARCHITECTURE.md](./twin/MV_DESIGN_PRO_PROTECTION_ARCHITECTURE.md) — architektura zabezpieczeń
- [twin/MV_DESIGN_PRO_SLD_PRESENTATION_ARCHITECTURE.md](./twin/MV_DESIGN_PRO_SLD_PRESENTATION_ARCHITECTURE.md) — prezentacja SLD/CAD/SCADA (FAZA E)
- [twin/SLD_SYMBOL_SYSTEM_PLAN.md](./twin/SLD_SYMBOL_SYSTEM_PLAN.md) — plan pakietu symboli R3
- [twin/MV_DESIGN_PRO_PERFORMANCE_PLAN.md](./twin/MV_DESIGN_PRO_PERFORMANCE_PLAN.md) — plan wydajności
- [twin/MV_DESIGN_PRO_MIGRATION_PLAN.md](./twin/MV_DESIGN_PRO_MIGRATION_PLAN.md) — plan migracji strangler (FAZA F)
- ADR-012…ADR-028 (PROPOSED) w [adr/](./adr/)

---

## 🚀 START — Od czego zaczyna nowy developer

**Krok 1: Zrozumieć kontekst (15 min)**
1. [../SYSTEM_SPEC.md](../SYSTEM_SPEC.md) — wykonawcza specyfikacja systemu (1 strona)
2. [v12xx/KANON_V12_XX.md](./v12xx/KANON_V12_XX.md) — kanon V12.xx (binding, frozen 2026-04-24)
3. [../PLANS.md](../PLANS.md) — aktualny status faz i prace bieżące

**Krok 2: Zrozumieć cel (10 min)**
4. [sld/SLD_INDUSTRIAL_SCADA_CAD_TARGET.md](./sld/SLD_INDUSTRIAL_SCADA_CAD_TARGET.md) — docelowy SLD klasy przemysłowej
5. [sld/SLD_ENGINEER_WORKFLOW_END_TO_END.md](./sld/SLD_ENGINEER_WORKFLOW_END_TO_END.md) — flow inżyniera 14-krokowy

**Krok 3: Zrozumieć stan obecny (15 min)**
6. [audit/IMPLEMENTATION_GAP_ANALYSIS.md](./audit/IMPLEMENTATION_GAP_ANALYSIS.md) — co działa, co nie, co brakuje
7. [audit/SLD_VISUAL_QUALITY_AUDIT.md](./audit/SLD_VISUAL_QUALITY_AUDIT.md) — dlaczego SLD wygląda jak atrapa i co naprawić
8. [audit/ENGINEER_WORKFLOW_AUDIT.md](./audit/ENGINEER_WORKFLOW_AUDIT.md) — luki w flow inżyniera

**Krok 4: Zrozumieć plan (10 min)**
9. [plan/PLAN_E2E_INDUSTRIAL_2026-05.md](./plan/PLAN_E2E_INDUSTRIAL_2026-05.md) — plan E2E całego systemu (6 sprintów)
10. [sld/SLD_IMPLEMENTATION_ROADMAP.md](./sld/SLD_IMPLEMENTATION_ROADMAP.md) — roadmap SLD reworku (F1–F5)
11. [sld/SLD_VISUAL_ACCEPTANCE_CRITERIA.md](./sld/SLD_VISUAL_ACCEPTANCE_CRITERIA.md) — kryteria akceptacji (DoD)

**Krok 5: Praca z dokumentacją**
12. [audit/DOCUMENTATION_CLEANUP_AUDIT.md](./audit/DOCUMENTATION_CLEANUP_AUDIT.md) — co jest aktualne, co SUPERSEDED, co ARCHIWALNE
13. [audit/DOC_INVENTORY_2026-05.md](./audit/DOC_INVENTORY_2026-05.md) — pełna inwentaryzacja 415 plików

---

## Active 2026-05 cleanup deliverables (KANONICZNE)

### Audyty
- [audit/DOCUMENTATION_CLEANUP_AUDIT.md](./audit/DOCUMENTATION_CLEANUP_AUDIT.md) — audyt sprzątania dokumentacji (klasyfikacja + migracje)
- [audit/SLD_VISUAL_QUALITY_AUDIT.md](./audit/SLD_VISUAL_QUALITY_AUDIT.md) — audyt jakości wizualnej SLD (5/10 → cel 9/10)
- [audit/ENGINEER_WORKFLOW_AUDIT.md](./audit/ENGINEER_WORKFLOW_AUDIT.md) — audyt flow inżyniera (14 kroków vs aktualny stan)
- [audit/IMPLEMENTATION_GAP_ANALYSIS.md](./audit/IMPLEMENTATION_GAP_ANALYSIS.md) — luki implementacyjne per obszar
- [audit/DOC_INVENTORY_2026-05.md](./audit/DOC_INVENTORY_2026-05.md) — inwentaryzacja 415 plików
- [audit/AUDYT_BRAKI_2026-05.md](./audit/AUDYT_BRAKI_2026-05.md) — audyt braków, błędów, atrap (8 obszarów A–H)

### SLD industrial
- [sld/SLD_INDUSTRIAL_SCADA_CAD_TARGET.md](./sld/SLD_INDUSTRIAL_SCADA_CAD_TARGET.md) — opis docelowego SLD
- [sld/SLD_VISUAL_ACCEPTANCE_CRITERIA.md](./sld/SLD_VISUAL_ACCEPTANCE_CRITERIA.md) — kryteria akceptacji wizualnej
- [sld/SLD_ENGINEER_WORKFLOW_END_TO_END.md](./sld/SLD_ENGINEER_WORKFLOW_END_TO_END.md) — flow inżyniera 14-krokowy
- [sld/SLD_IMPLEMENTATION_ROADMAP.md](./sld/SLD_IMPLEMENTATION_ROADMAP.md) — roadmap implementacji
- [sld/SLD_INDUSTRIAL_SPEC_v1.md](./sld/SLD_INDUSTRIAL_SPEC_v1.md) — specyfikacja techniczna (komplementarna)
- [sld/PROJEKCJA_SN_NN_PORTAL_V1.md](./sld/PROJEKCJA_SN_NN_PORTAL_V1.md) — kanon projekcji SN/nN i portalu domeny nN (jedna sieć obliczeniowa, dwie projekcje, kontrakt nN 3.0.0: stany zacisków/odcinków, wyspy, tożsamość SN, audyt topologii; LOD 0/1/2 na jednej geometrii; zastępuje koncepcję LOD nN T5a)
- [sld/SLD_SYMBOL_NORMATIVE_REGISTRY.md](./sld/SLD_SYMBOL_NORMATIVE_REGISTRY.md) — rejestr normatywny symboli CAD SLD nN (R2 / R2.1, rewizja 1.1): 19 symboli z polami domain_type / symbol_role / IEC_reference / polish_name / project_designation / warianty / verification_status; geometria łączników wg SCHEMATU REFERENCYJNEGO właściciela (przegub u dołu, nóż otwiera w górę-lewo, kwalifikatory nieruchome na styku stałym, wyłącznik instalacyjny z wyzwalaczami, wkładka na nożu), hierarchia grubości; 0 × NORMATIVE_VERIFIED (uczciwie)
- [sld/SLD_CAD_SYMBOL_REFERENCE_PACK_R2.md](./sld/SLD_CAD_SYMBOL_REFERENCE_PACK_R2.md) — pakiet referencyjny symboli CAD po odrzuceniu R2 (obecny → proponowany, kadry w `audit/visual/cad/`), przegląd wielosoczewkowy (pkt 13–19 z pierwowzoru R2.1), klucz testu rozpoznawalności §22 (26 pozycji), odwzorowanie ENM → symbol z przestrzenią katalogu, pytania do właściciela, §12 pomiary wektorowe schematu referencyjnego
- [audit/SLD_NN_R2_CAD_REPORT_2026-09-02.md](./audit/SLD_NN_R2_CAD_REPORT_2026-09-02.md) — raport R2 po odrzuceniu B-02 (5/10) + addendum R2.1 (symbole ze schematu referencyjnego właściciela): system symboli CAD (19 symboli, 0 × NORMATIVE_VERIFIED — uczciwie), migracja renderera nN (hierarchia grubości, MIN_FIELD_WIDTH + przewijanie, etykiety bez łamania), kontrakt addytywny (`device_kind`, `catalog_namespace`, tabliczka CT, NN-AUD-18), samoocena bramek §25 OSOBNO, pytania do właściciela; werdykt należy do właściciela
- [audit/SLD_NN_FINAL_ACCEPTANCE_REPORT_2026-09-02.md](./audit/SLD_NN_FINAL_ACCEPTANCE_REPORT_2026-09-02.md) — raport końcowy profesjonalizacji SLD nN (20 problemów → status, testy, 20 kadrów §47 w `audit/visual/nn/`, samoocena bramek A–E, ograniczenia zarejestrowane; werdykt B-02 należy do właściciela)

### Plany
- [plan/PLAN_E2E_INDUSTRIAL_2026-05.md](./plan/PLAN_E2E_INDUSTRIAL_2026-05.md) — plan E2E klasy przemysłowej
- [plan/PLAN_SLD_REWORK.md](./plan/PLAN_SLD_REWORK.md) — fazowany plan reworku SLD (F1–F5)
- [plan/PLAN_PRZEBUDOWY_10X_2026-07.md](./plan/PLAN_PRZEBUDOWY_10X_2026-07.md) — program inżynieryjny 10x (F0–F4)
- [plan/MISJA_DOMKNIECIA_PRODUKTU_2026-09.md](./plan/MISJA_DOMKNIECIA_PRODUKTU_2026-09.md) — misja domknięcia produktu (dyrektywa właściciela 2026-09-09; 12 domen, kontrakt ukończenia CLAIMED → VERIFICATION GATE → ACCEPTED, mapa domknięcia z dowodów repo)
- [plan/MAPA_DOMKNIECIA_PRODUKTU_2026-09.md](./plan/MAPA_DOMKNIECIA_PRODUKTU_2026-09.md) — mapa domknięcia produktu (2026-09-09; granica faktyczna 12 domen z dowodów repo: klasyfikacja per zdolność, klasy defektów, wyjścia do Excela, korekty roszczeń, decyzje właściciela OD-13…OD-16, kolejność wycinków W1–W12, karta pierwszego wycinka W1)
- [plan/KARTA_W3_KONWERGENCJA_FIZYKI_2026-09.md](./plan/KARTA_W3_KONWERGENCJA_FIZYKI_2026-09.md) — karta wycinka W3 (konwergencja duplikatów fizyki): rozstrzygnięcia architekta per rodzina, podkarty A–I, fale, DoD (2026-09-09)
- [plan/KARTA_B02_POWIERZCHNIE_ANALITYCZNE_2026-09.md](./plan/KARTA_B02_POWIERZCHNIE_ANALITYCZNE_2026-09.md) — karta B-02 / W3-E: przebudowa dwóch powierzchni analitycznych („Analizy specjalistyczne": katalog kart z backendu + widok analizy A–G z gotowością; „Ocena techniczna wyników": podstawa → wynik → odniesienie → ocena → wniosek → dowód) i nawigacja obszar → analiza; dyrektywa właściciela verbatim, §0 rozstrzygnięcia, inwentarz, kontrakty, DoD, dowody (2026-09-10)
- [plan/SYNTEZA_DOMKNIECIA_PRODUKTU_2026-09.md](./plan/SYNTEZA_DOMKNIECIA_PRODUKTU_2026-09.md) — synteza domknięcia produktu (2026-09-16, dyrektywa właściciela §54–§57): stan z pomiaru, 28 odpowiedzi, synteza W6 (W6-0…W6-8), klasyfikacja wątku badawczego dynamiki (przejąć/zaadaptować/tylko-badawcze/odrzucić), rozstrzygnięcia A-1…A-15, decyzje OD-20…OD-23, korekta kolejności wycinków, karty S-1…S-5
- [plan/KARTA_W6_1_KONTRAKTY_CZASU_2026-09.md](./plan/KARTA_W6_1_KONTRAKTY_CZASU_2026-09.md) — karta W6-1 „Kontrakty czasu" (projekt architekta, 2026-09-16): parametry dynamiczne w ENM bez domyślek z proweniencją, katalog `der_dynamic` bez niemych wartości, maszyny synchroniczne w produkcie, zdarzenia w scenariuszu, `ResultSetDynamicV1` z szeregami poza wierszem biegu, rodzaj biegu `dynamika_rms`, kasacja osieroconego `load_profile_ref`, archiwum dowodowe wątku badawczego
- [plan/KARTA_W6_2_RDZEN_DYNAMIKI_2026-09.md](./plan/KARTA_W6_2_RDZEN_DYNAMIKI_2026-09.md) — karta W6-2 „Rdzeń dynamiki" (projekt architekta, 2026-09-16): nowy pakiet `network_model/solvers/dynamika/` (DAE półjawne na Ybus assemblera, inicjalizacja jako bramka, trapez niejawny z globalizacją, zdarzenia z dokładnym czasem i re-inicjalizacją, skończoność, tożsamość), walidacja C×W (całka pierwsza, CCT równych pól, małosygnałowa, ANDES w osobnym środowisku), wejścia z laboratorium i naprawy warunkujące
- [plan/KARTA_W5_MODEL_FAZOWY_I_UZIEMIENIE_2026-09.md](./plan/KARTA_W5_MODEL_FAZOWY_I_UZIEMIENIE_2026-09.md) — karta W5 „Model fazowy i uziemienie" (= CV-5; projekt architekta, 2026-09-16): jedna reprezentacja uziemienia (`GroundingConfig` na transformatorze i źródle, kasacja `Bus.grounding` i 5 kopii), układ sieci nN typowany bez domyślnego TN-C-S, `vector_group` ze słownikiem IEC 60076-1, ekran kabla bez fabrykacji, `meta.field_specs` → typowany `Bay` (106 plików, guard wskrzeszenia), stan łączeniowy jedna prawda (`open_switch`/`close_switch`, `normal_state`, `switch_states` w scenariuszu), model fazowy z rozpływem niesymetrycznym jako biegiem produktu, TT/IT/RCD (OD-25), terminale T-2; sub-karty W5-A…W5-T + `SZABLONY-NN`
- [plan/KARTA_W6_3_URZADZENIA_I_ADAPTER_2026-09.md](./plan/KARTA_W6_3_URZADZENIA_I_ADAPTER_2026-09.md) — karta W6-3 „Urządzenia dynamiczne + adapter" (projekt architekta, 2026-09-18): rdzeń DAE z karty W6-2 na ścieżce użytkownika — komplet rodzin urządzeń z kontraktu ENM (maszyna synchroniczna 6. rzędu z AVR/GOV/PSS, przekształtnik GFL i GFM, magazyn, turbina wiatrowa IEC 61400-27-1 typ 1–4), adapter składający wejście z migawki efektywnej i punktu pracy z rozpływu, wynik jako `ResultSetDynamicV1`, konwergencja z trasą „kąty od użytkownika" w ekranie stabilności (defekt klasy „UI bez zdolności"), odcięcie metadanych trzeciego rdzenia `stability_rms` (wniosek OD, bramka B-01); sub-karty W6-3A/B/C
- [plan/W6_A_KONTRAKT_OBSERWABLI.md](./plan/W6_A_KONTRAKT_OBSERWABLI.md) — kontrakt techniczny fali W6-A (obserwable dynamiczne; do przeglądu architektonicznego, nie zgoda na kodowanie): rozdział semantyczny stanów urządzeń / zmiennych algebraicznych sieci / obserwabli inżynierskich, DOWÓD wyprowadzenia częstotliwości węzła z faktycznej formulacji solvera (wszystkie trzy rodziny kątów całkują odchyłkę razy pulsacja bazowa, więc kąt jest względem osi wirującej synchronicznie), rozłączność częstotliwości węzła od pętli synchronizacji / urządzenia tworzącego sieć / prędkości wirnika, domena ważności wyprowadzona z tolerancji algebry, konwencja nieciągłości zdarzeń, rozdzielenie ROCOF chwilowego od pomiarowego, kontrakt prądów i przepływów gałęzi z orientacją i obiema stronami, 17 przypadków falsyfikacji z parytetem t=0 jako bramką nadrzędną, OD-35/OD-36/OD-37, rozdzielenie SO-1A i SO-1B
- [audit/FRT_PROWENIENCJA_NORMATYWNA.md](./audit/FRT_PROWENIENCJA_NORMATYWNA.md) — dochodzenie proweniencji obwiedni FRT (OD-33): KOREKTA wcześniejszego meldunku — reprezentacji są TRZY, nie dwie, a produkcyjna ocena FRT korzysta z rejestru profili operatorskich, nie ze stałej w torze legacy; porównanie punktowe trzech zbiorów liczb (przy t=0,7 s trzy różne wymagania), inwentarz braków proweniencji (dokument, wydanie, stosowalność wg typu modułu wytwórczego), propozycja kanonicznego źródła prawdy, granice tego, co wolno zrobić przed ustaleniem podstawy normatywnej
- [audit/DYSPOZYCJA_STABILITY_RMS.md](./audit/DYSPOZYCJA_STABILITY_RMS.md) — dyspozycja forensyczna martwego trzeciego rdzenia RMS: sprzeczność nagłówka z zawartością, pomiar zawartości (moc elektryczna bez SEM i reaktancji, 50 Hz zaszyte, napięcie jako skalar bez sprzężenia sieciowego, siedem cichych domyślnych parametrów, status zakazany przez zasadę nr 1 z wpisem na allowliście guarda), inwentarz konsumentów, zestawienie rodzin modeli z biblioteką W6-3A (silnik indukcyjny jako jedyna pozycja wnosząca coś do CELU → OD-37), pięciokrokowa dyspozycja z przeniesieniem wartości poznawczej przed kasacją
- [plan/PROGRAM_AB_DYNAMIKA_I_JAKOSC_ENERGII_2026-09.md](./plan/PROGRAM_AB_DYNAMIKA_I_JAKOSC_ENERGII_2026-09.md) — Program A/B (dynamika i zgodność modułów wytwarzania typu A i B w sieciach nN/SN) rozszerzony o harmoniczne i supraharmoniczne (mandat właściciela 2026-09-23): odzyskanie stanu i uczciwy bilans (plan poprzedniej sesji nie istnieje w żadnej gałęzi — odtworzony), rozstrzygnięcia R-01…R-09, rejestr wymagań D-/H-/S-/W- przeniesiony z mandatu w całości, poprawki §95 zdefiniowane po raz pierwszy (WOS/PTPiREE/WiPWC/Bank Nastaw resolvery, PPM vs SyPGM, AcceptedEvidenceMethods, ModelValidationStatus, bodziec zgodności ≠ zakłócenie sieciowe, Explainable Verdict Contract), kamienie AB-1a → AB-1b → AB-1d_min → AB-1c → AB-2…AB-7 z torem R (RMS) i torem H (harmoniczne/supraharmoniczne) mapowane na fale W6-A…W6-K, audyt kodu istniejącego, macierze luk, scenariusze E2E-R/H/SH/MP, zdania kontrolne zakazu spłycenia. **Uszczegóławia wycinek W6; nie zastępuje mapy dróg**
- [plan/KARTA_AB_1A_FUNDAMENT_WYNIKOW_2026-09.md](./plan/KARTA_AB_1A_FUNDAMENT_WYNIKOW_2026-09.md) — karta wykonawcza AB-1a Programu A/B (2026-09-23): rozstrzygnięcia R-1…R-9 (`PhysicsDomain` z rejestru zdolności, `WynikInzynierski` jako rozszerzenie `OcenaElementu`, dwie osie statusu modelu, osobny kontrakt `BadanieZgodnosci`, guard werdyktu na obiekcie wyniku, poprawki rejestru dowodowego T10/T20, liczby normatywne bez zmian), inwentarz klasy nośników werdyktu i list rodzajów biegów, deliverables D1–D8 dla dwóch wykonawców Opus 5.5 w worktree, bramki odbioru
- [plan/FINAL_DYNAMICS_CAPABILITY_FREEZE.md](./plan/FINAL_DYNAMICS_CAPABILITY_FREEZE.md) — zamrożenie DOCELOWEJ zdolności użytkownika w dynamice (korekta właściciela 2026-09-18 „FINAL DYNAMICS CAPABILITY FREEZE"): cel produktu w 14 punktach, scenariusz odniesienia SO-1, macierz zdolności w dwóch sprzężonych tablicach (wartość · stan bieżący · stan docelowy · obserwable dostępne i brakujące · luki fizyki/numeryki/walidacji/silnika zdarzeń/API/UI · zależności · dowód odbioru · fala), znalezisko N-8 (dwie sprzeczne obwiednie FRT), mapa dróg W6-A…W6-K WYPROWADZONA Z MACIERZY, warunki dopuszczenia narzędzia weryfikacyjnego, trójstopniowy status walidacji, decyzje OD-33/OD-34. **Zastępuje sekcję I dokumentu W6_3C_DYNAMICS_PRODUCT_FREEZE.md**
- [plan/W6_3C_DYNAMICS_PRODUCT_FREEZE.md](./plan/W6_3C_DYNAMICS_PRODUCT_FREEZE.md) — zamrozenie architektury produktu „Dynamika i stabilnosc sieci SN" (dyrektywa wlasciciela 2026-09-18, deliverable §26; HEAD rozpoznania `957e2a5f`): konflikt architektoniczny karty W6-3C do przegladu wlasciciela, mapa LEGACY vs RMS, klasyfikacja wejsc i wyjsc A–F (szesc pol klasy D/E wpisywanych dzis przez inzyniera), macierz sygnalow i zdarzen, docelowa architektura informacji jako JEDNA przestrzen robocza, rejestr luk P0/P1/P2, wycinki W6-3C…W6-4, decyzje wlasciciela OD-28…OD-32, odpowiedzi na 15 pytan P0
- [audit/CURRENT_DYNAMIC_CAPABILITY_MATRIX.md](./audit/CURRENT_DYNAMIC_CAPABILITY_MATRIX.md) — macierz zdolnosci dynamicznych ze stanu wykonywalnego (2026-09-18, `plik:linia` + test + komenda + wynik): cztery odrebne tory nazywane „stabilnoscia" (legacy progowy, RMS/DAE, FRT zastepczy, martwy `stability_rms`), statusy z zamknietego slownika, macierz sygnalow (brak czestotliwosci wezla, ROCOF, pradow galezi), macierz zdarzen, macierz walidacji, siedem naduzyc semantycznych
- [audit/INWENTARZ_W5_2026-09-16.md](./audit/INWENTARZ_W5_2026-09-16.md) — inwentarz dowodowy pod kartę W5 (pomiar grepem na `e08def50`, plik:linia): 20 reprezentacji uziemienia (1 czytana przez fizykę, 5 bez konsumenta), 106 plików `field_specs`, 7 reprezentacji stanu łącznika, rozpływ niesymetryczny bez konsumenta, TT/IT/RCD, `vector_group`, terminale; liczby i niepewności

### Program UI/UX 2026-07 (AKTYWNY)
- [uiux/PROGRAM_UIUX_2026-07.md](./uiux/PROGRAM_UIUX_2026-07.md) — program przebudowy UI/UX do klasy ETAP/PowerFactory (fazy U0–U5; clean-room UI)
- [uiux/KONTRAKT_PREZENTACJI_INZYNIERSKIEJ_V12_7.md](./uiux/KONTRAKT_PREZENTACJI_INZYNIERSKIEJ_V12_7.md) — KANON: matematyka = KaTeX (nie ASCII), metadane produkcyjne poza pierwszym planem, werdykt w zakresie kryterium, wiarygodność ≠ spełnienie, hierarchia jawności (`ui_math_guard.py`)
- [uiux/INWENTARZ_FUNKCJI_2026-07.md](./uiux/INWENTARZ_FUNKCJI_2026-07.md) — WIĄŻĄCY inwentarz funkcji obliczeniowych + macierz pokrycia UI
- [uiux/MODEL_INTERAKCJI_APLIKACJI_2026-07.md](./uiux/MODEL_INTERAKCJI_APLIKACJI_2026-07.md) — gramatyka interakcji całej aplikacji + rejestr okien (każde okno od nowa)
- [uiux/SPEC_KREATORY_2026-07.md](./uiux/SPEC_KREATORY_2026-07.md) — kreatory: zero pustych pól, podpowiedzi inżynierskie, gotowe przykłady
- [uiux/SPEC_POWIAZANIA_WARSTW_2026-07.md](./uiux/SPEC_POWIAZANIA_WARSTW_2026-07.md) — powiązanie warstw: propagacja model→schemat→gotowość→wyniki→raporty, wspólna selekcja, świeżość rewizji
- [uiux/SPEC_UKLAD_PANELI_2026-07.md](./uiux/SPEC_UKLAD_PANELI_2026-07.md) — układ paneli lewy/środkowy/prawy + tryby zaawansowania (Podstawowy/Rozszerzony/Ekspercki)
- [uiux/SZABLONY_STACJI_2026-07.md](./uiux/SZABLONY_STACJI_2026-07.md) — taksonomia szablonów stacji (role A–E, cel ≥ 80) + przeglądarka w kreatorze
- [uiux/PROPOZYCJE_ROZSZERZEN_2026-07.md](./uiux/PROPOZYCJE_ROZSZERZEN_2026-07.md) — rozszerzenia P1–P22 dla inżyniera (zatwierdzone zasadą „na max")
- [uiux/AUDYT_RADY_SPECJALISTOW_2026-07.md](./uiux/AUDYT_RADY_SPECJALISTOW_2026-07.md) — audyt rady specjalistów: rozbudowa każdego okna + delta rejestru
- [uiux/KARTA_KOORDYNACJI_SLD_01_TOKENY.md](./uiux/KARTA_KOORDYNACJI_SLD_01_TOKENY.md) — karta styku z wątkiem SLD (tokeny motywów)
- [uiux/PROMPT_ZARZADCA_FABLE_UIUX.md](./uiux/PROMPT_ZARZADCA_FABLE_UIUX.md) — prompt zarządcy programu (orkiestracja wykonawców)

> Rozgraniczenie wątków: rework SLD (PLAN_SLD_REWORK) biegnie w osobnej sesji; Program UI/UX
> nie modyfikuje `ui/sld*`/`engine/sld-layout` — styk wyłącznie przez karty koordynacyjne.

---

## Active Canon
- [v12xx/KANON_V12_XX.md](./v12xx/KANON_V12_XX.md) - aktywne prawo produktu V12.xx
- [v12xx/KANON_V12_6_PROFESORSKI.md](./v12xx/KANON_V12_6_PROFESORSKI.md) - rozszerzenie akademicko-przemyslowe V12.6 E-40..E-50
- [v12xx/RAPORT_M0_INWENTARYZACJA.md](./v12xx/RAPORT_M0_INWENTARYZACJA.md) - inwentaryzacja startowa M0 V12.xx
- [v12xx/BACKLOG_WDROZENIOWY_V12_XX.md](./v12xx/BACKLOG_WDROZENIOWY_V12_XX.md) - backlog wdrozeniowy M0-M4
- [INDEX_KANONICZNY.md](./INDEX_KANONICZNY.md) - indeks wiążących dokumentów V12.5
- [../SYSTEM_SPEC.md](../SYSTEM_SPEC.md) - wykonawcza specyfikacja systemu
- [../ARCHITECTURE.md](../ARCHITECTURE.md) - architektura referencyjna
- [../PLANS.md](../PLANS.md) - aktywny plan wykonawczy
- [01-Core.md](./01-Core.md) - kanon domeny i kontraktów rdzenia
- [04-Application.md](./04-Application.md) - aktywna architektura aplikacji
- [domain/ENM_OP_CONTRACTS_CANONICAL_FULL.md](./domain/ENM_OP_CONTRACTS_CANONICAL_FULL.md) - kontrakty operacji domenowych
- [analysis/URUCHAMIANIE_ANALIZ_I_GOTOWOSC.md](./analysis/URUCHAMIANIE_ANALIZ_I_GOTOWOSC.md) - kontekst analityczny i gotowość
- [analysis/NC_RFG_PTPiREE_TESTY_KANON.md](./analysis/NC_RFG_PTPiREE_TESTY_KANON.md) - testy NC RfG / PTPiREE dla DER
- [analysis/NC_RFG_FLOW_TESTING_PROMPT.md](./analysis/NC_RFG_FLOW_TESTING_PROMPT.md) - prompt pętli testowania flow NC RfG
- [analysis/SENSITIVITY_ANALYSIS_CANONICAL_PLUS.md](./analysis/SENSITIVITY_ANALYSIS_CANONICAL_PLUS.md) - analiza wrażliwości P25
- [analysis/P26_AUTO_RECOMMENDATIONS_CANONICAL_PLUS.md](./analysis/P26_AUTO_RECOMMENDATIONS_CANONICAL_PLUS.md) - rekomendacje P26
- [analysis/P27_SCENARIO_COMPARISON_CANONICAL_PLUS.md](./analysis/P27_SCENARIO_COMPARISON_CANONICAL_PLUS.md) - porównanie scenariuszy P27 (kod usunięty CV-3.2, dokument historyczny)
- [analysis/P33_LF_SENSITIVITY_CANONICAL_KILLER.md](./analysis/P33_LF_SENSITIVITY_CANONICAL_KILLER.md) - wrażliwość napięć P33
- [architecture/STUDY_SCENARIO_WORKFLOW_CANONICAL_PLUS.md](./architecture/STUDY_SCENARIO_WORKFLOW_CANONICAL_PLUS.md) - workflow Study/Scenario/Run (kod usunięty CV-3.2, dokument historyczny)
- [study/WARIANTY_URUCHOMIENIA_POROWNANIA.md](./study/WARIANTY_URUCHOMIENIA_POROWNANIA.md) - warianty, runy i porównania
- [audit/REPO_HYGIENE_PO_FAZIE_KATALOG_FIRST.md](./audit/REPO_HYGIENE_PO_FAZIE_KATALOG_FIRST.md) - aktywna higiena repo po fazie katalog-first
- [ui/UI_CANONICAL_PARITY_MATRIX.md](./ui/UI_CANONICAL_PARITY_MATRIX.md) - aktywna macierz UI
- [ui/ui_canonical_parity.md](./ui/ui_canonical_parity.md) - aktywne wytyczne parity UI
- [ui/KANON_KREATOR_SN_NN_NA_ZYWO.md](./ui/KANON_KREATOR_SN_NN_NA_ZYWO.md) - kanon budowy sieci
- [tests/GOLDEN_NETWORKS_CANONICAL.md](./tests/GOLDEN_NETWORKS_CANONICAL.md) - goldeny i deterministyczność
- [system/SPEC_KATALOGI_I_MATERIALIZACJA_PARAMETROW.md](./system/SPEC_KATALOGI_I_MATERIALIZACJA_PARAMETROW.md) - katalogi i materializacja parametrow; zalaczniki: moc regul katalogu (klasy KAT-T-*/KAT-W-*, przeglad wiarygodnosci) i mierzona gotowosc katalogow

## Active Rules
- Aktywny root dokumentacji to `mv-design-pro/docs`.
- `docs/spec/` nie jest już aktywnym źródłem prawdy. To materiał [historyczne](./spec/).
- `docs/archive/` jest wyłącznie archiwum [historyczne](./archive/).
- Żaden aktywny generator raportu, test, skrypt ani indeks dokumentacji nie może pobierać treści z `docs/archive/` jako kanonu.
- Link do materiału historycznego musi być jawnie oznaczony `[historyczne]`.
- Każdy aktualny dokument ma w nagłówku **Status** (AKTUALNY / SUPERSEDED / ARCHIWALNY / BLOCKER).
- Każdy SUPERSEDED ma wskazanie aktualnego następcy.

## Active Areas
- [v12xx/](./v12xx/) - nadrzedny kanon V12.xx, rejestry i macierze wykonawcze
- [analysis/](./analysis/) - aktywne kontrakty analiz
- [architecture/](./architecture/) - aktywne workflow i mapy architektury wykonawczej
- [audit/](./audit/) - aktywne audyty (DOC_INVENTORY_2026-05, AUDYT_BRAKI_2026-05, DOCUMENTATION_CLEANUP, SLD_VISUAL_QUALITY, ENGINEER_WORKFLOW, IMPLEMENTATION_GAP_ANALYSIS, AUDYT_KATALOG_FIRST_END_TO_END)
- [plan/](./plan/) - aktywne plany (PLAN_E2E_INDUSTRIAL_2026-05, PLAN_SLD_REWORK)
- [domain/](./domain/) - aktywne kontrakty domenowe
- [proof_engine/](./proof_engine/) - aktywny White Box
- [qa/](./qa/) - aktywna macierz jakości i bram testowych
- [sld/](./sld/) - aktywne kontrakty i geometria SLD + 5 nowych SLD industrial docs (2026-05)
- [study/](./study/) - aktywne workflow wariantów i uruchomień
- [system/](./system/) - wiążące specyfikacje systemowe V12.5
- [ui/](./ui/) - aktywne kontrakty UI
- [export/](./export/) - aktywne kontrakty eksportu
- [tests/](./tests/) - aktywne kryteria testowe i goldeny

## Historical
- [spec/](./spec/) [historyczne] - 18 rozdziałów V11, wszystkie z disclaimer "Historical note (V12.5)"
- [audit/historical_execplans/](./audit/historical_execplans/) [historyczne]
- [audit/archive/2026-05/](./audit/archive/2026-05/) [archiwum] - 35+ zamkniętych audytów + planów M0 + snapshotów E2E + weryfikacji
- [audit/archive/CANONICAL_COMPLIANCE_2026-01.md](./audit/archive/CANONICAL_COMPLIANCE_2026-01.md) [archiwum] - checklista zgodności, migawka audytu 2026-01 (poza Document Hierarchy), zarchiwizowana 2026-09-09 (karta ARCHIWUM-CANONICAL-COMPLIANCE)
- [archive/README.md](./archive/README.md) [historyczne]
- [archive/](./archive/) [historyczne]
