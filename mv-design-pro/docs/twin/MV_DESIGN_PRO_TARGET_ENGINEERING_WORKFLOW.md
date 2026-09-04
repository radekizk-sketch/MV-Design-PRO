# MV-DESIGN-PRO — DOCELOWY WORKFLOW INŻYNIERSKI (FAZA C, mandat §157)

> **Status od 2026-09-04 (kontrakt MAX PLATFORM):** materiał wejściowy i dowodowy programu konwergencji. Źródło kanoniczne architektury: `../architecture/PRODUCT_CAPABILITY_CONSTITUTION.md`, `../architecture/CAPABILITY_ARCHITECTURE_MATRIX.md`, `../architecture/CANONICAL_TWIN_ARCHITECTURE.md`, `../architecture/CONVERGENCE_ROADMAP.md`, `../architecture/DECISION_FREEZE_REGISTER.md`, `../reference-networks/REFERENCE_NETWORK_REGISTRY.md`, `../evidence/CONVERGENCE_EVIDENCE.md`. Przy rozbieżności obowiązuje dokument kanoniczny; w szczególności: nie powstaje nowa klasa `TwinModel` (Canonical Project Twin = rozwinięty ENM), `network_model` jest pochodnym IR, program nie zatrzymuje się po M0, lecz prowadzi konwergencję wycinkami CV-0…CV-6 z bramkami B-01/B-02 i procedurą kasacji.


**Status:** PROPOZYCJA (do przeglądu właściciela; nic z tego dokumentu nie jest wdrożone)
**Data:** 2026-09-02 · **Gałąź:** `claude/mv-design-pro-twin-audit-u4lhy0` · **HEAD audytu:** `a1ab2959`
**Źródła dowodowe:** audyt A12 (tarcia inżynierskie W1–W14, rejestr EF-001…EF-060, ocena ról §168, test §181), A8 (architektura frontendu), A4 (zabezpieczenia), A11 (nN/uziemienia), A5 (DER), A6 (katalogi), A9 (API/persystencja). Pełny rejestr tarć: `ENGINEERING_FRICTION_REGISTER.md`.
**Relacja do mandatu:** §5 (klasy tarcia), §55–§56 (dobór z kandydatami, impact preview), §68–§76 (workflowy i silnik pracy), §157 (struktura per proces), §168 (role), §171–§176 (szybkość, „system nie pyta o to, co wie", FAIL wyjaśniony, propagacja), §181 (test łańcucha).
**Relacja do innych dokumentów twin:** model i stan — `MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md`; solvery — `MV_DESIGN_PRO_SIMULATION_ARCHITECTURE.md`; dobór i optymalizacja — `MV_DESIGN_PRO_DESIGN_OPTIMIZATION_ARCHITECTURE.md`; zabezpieczenia — `MV_DESIGN_PRO_PROTECTION_ARCHITECTURE.md`; prezentacja — `MV_DESIGN_PRO_SLD_PRESENTATION_ARCHITECTURE.md`; kolejność wdrożenia — `MV_DESIGN_PRO_MIGRATION_PLAN.md`.

---

## 0. Diagnoza, na którą odpowiada ten dokument (skrót A12/A8)

Test §181 („mam punkt zasilania i wymagania" → „kompletny, zweryfikowany, optymalny, udokumentowany projekt SN+nN") **nie przechodzi**. Projektant nie przejdzie łańcucha bez Excela obok. Zerwania (A12 §4):

| Ogniwo | Stan | Dowód (skrót) |
|---|---|---|
| 1. Wymagania OSD → założenia projektu | rwie się | założenia w 4 miejscach (Sk″ w kreatorze źródła i w konfiguracji przypadku; c/tk w 3 miejscach; temperatura/normy = „Wkrótce"), brak rejestru założeń (EF-001…EF-009) |
| 3. GPZ → ciąg SN (dobór przekroju) | rwie się | brak solvera doboru; ΔU liczone z prądu wpisanego ręcznie (`magistralaModel.ts:24-26`), ocena „po fakcie" (EF-011, EF-037) |
| 5. Stacja → nN | rwie się | kreatory nN bez wejścia w żywej powłoce; dobór aparatu nN (`nn_device_selection.py`) i arkusz nN bez konsumenta; SWZ tylko jako nakładka (EF-021…EF-023; A11-01) |
| 7. Gotowość → komplet obliczeń | rwie się | „Uruchom obliczenie" = 2 z 8 typów biegu i 2 z 25 zdolności; brak biegu Ik_min; bieg nastaw bez triggera (EF-029, EF-030, EF-035) |
| 11. Zabezpieczenia → nastawy w modelu | rwie się | dwie prawdy (ENM bez nastaw vs `ProtectionConfig.overrides` przypadku z szablonami 400 A/TMS 0,3); zapis do ENM zablokowany kanonem V11 (EF-038…EF-040; A4-02) |
| 4, 8, 9, 10, 13 | częściowo | TR bez zapotrzebowania (EF-014), werdykt 10 kryteriów z 4 poza automatem i bez nN (EF-048), remedium nieznane (EF-047), przeliczenie ręczne per typ (EF-055), pakiet dokumentów składany z 3 miejsc (EF-049) |
| 12. DER → RfG → wniosek OSD | działa z tarciem | jedyny domknięty tor: dobór z kandydatami + auto-bieg LF+SC + raport + BOM (wzorzec do uogólnienia) |
| 14. „Optymalny" | brak | brak doborów z rankingiem poza DER/kompensacją, brak wariantów delta, brak kryterium optymalności |

Ocena ról §168 (Σ/70): OZE 45 · analityk 37 · audytor 37 · projektant SN 36 · projektant stacji 36 · projektant nN 22 · zabezpieczeniowiec 22 · eksploatacja 13. Frontend (A8): pięć silników „następnego kroku", siedem inspektorów, brak `WorkflowEngine`/Command Center (grep = 0), dwie prawdy nawigacji, ~80 tys. LOC nieosiągalnego kodu.

**Odpowiedź tego dokumentu:** jeden silnik pracy (`WorkflowEngine`) oparty o **definicję gotowego per cel projektu**, jeden rejestr założeń, dobór z kandydatami dla KAŻDEJ decyzji doborowej (uogólnienie toru DER-SN), jedna akcja „uruchom wymagane analizy", remedia dla każdego FAIL, akcje naprawcze wykonujące naprawę (nie nawigujące), jeden inspektor, role jako profile.

---

## 1. Inwarianty workflowu (mandat §171–§176 jako reguły sprawdzalne)

| ID | Inwariant | Jak sprawdzany (test klasy) |
|---|---|---|
| W-01 | **Jedno źródło danych wejściowych.** Każda liczba wpisana przez inżyniera ma dokładnie jedno miejsce wpisu (rejestr założeń, asset, przypadek) i jest propagowana jako wartość domyślna wszędzie tam, gdzie jest potrzebna. | test: dla każdego pola formularza w kreatorach, jeśli identyczna semantyka istnieje w rejestrze założeń/modelu, domyślna = wartość z rejestru (iloczyn: pole × źródło) |
| W-02 | **System nie pyta o to, co wie** (§172–§173). Prąd roboczy, Un, cosφ, punkt przyłączenia, parametry NC RfG modułu, obwód wtórny — czytane z modelu/biegów, nigdy z ponownego wpisu. | test: kreator otwarty w kontekście elementu nie ma pola, którego wartość jest wyprowadzalna z modelu (lista zakazanych pól per kreator) |
| W-03 | **Każda decyzja doborowa ma kandydatów, ograniczenia, ranking i uzasadnienie** (§55): WHY THIS / WHY NOT OTHER, z `formula_ref`. | test: każdy `SizingRequest` zwraca `candidates[]`, `rejected[]` z `reason_code` i `constraints_checked[]` |
| W-04 | **Każdy FAIL ma WHY / WHERE / WHAT CAN FIX / WHAT EACH FIX CHANGES** (§174). | test: `CriterionVerdict.status == FAIL ⇒ len(remedies) ≥ 1` i każde remedium ma `expected_effect` |
| W-05 | **Propagacja jest automatyczna wg jawnej polityki** (§175): update → invalidate (selektywnie) → recalc (polityka) → revalidate → SLD → dokumenty OUTDATED. | test: zmiana atrybutu klasy X unieważnia dokładnie analizy z macierzy zależności i dokumenty od nich zależne; nic więcej, nic mniej |
| W-06 | **NBA zna definicję gotowego** (E1–E8), nie kończy się na „odczytaj wyniki". | test: dla każdego stanu procesu (produkt: cel × etap × pokrycie × werdykt × dokumenty) NBA zwraca akcję wykonywalną |
| W-07 | **Akcja naprawcza wykonuje naprawę**, nie nawiguje: otwiera właściwy formularz z fokusem pola, proponuje wartość, albo stosuje auto-fix (przypisanie typu katalogowego). | test: każdy kod gotowości z `fix_action_id` ma executor; brak executora = czerwień guarda |
| W-08 | **Zero fizyki w UI**, zero heurystyk w doborze: kandydaci i ranking pochodzą z backendu (warstwa interpretacji), z kryteriami normatywnymi i deterministycznym rozstrzyganiem remisów. | `ui_no_physics_guard` + test determinizmu rankingu |
| W-09 | **Jedna prawda nawigacji i jeden inspektor** (A8-03, A8-05): element → właściwości, wyniki per analiza, dowody, powiązania, akcje. | test: każdy typ elementu ma inspektor z niepustymi zakładkami dla dostępnych danych |
| W-10 | **Role jako profile** (§168), ortogonalne do trybów zaawansowania: profil = domyślny plan analiz + widoki + uprawnienia; nie ukrywa danych, zmienia kolejność i domyślne. | test: każdy profil ma plan analiz i przechodzi test §181 dla swojego zakresu |

---

## 2. Silnik pracy (`WorkflowEngine`) — jedna definicja gotowego

### 2.1 Obiekty (backend, warstwa aplikacji; zero fizyki)

```
ProjectGoal            # cel projektu: NOWA_SIEC | PRZYLACZENIE_OZE | ROZBUDOWA | AUDYT_ISTNIEJACEJ | MODERNIZACJA_ZABEZPIECZEN | PRZYLACZENIE_ODBIORCY (utrwalany — dziś cel nie jest zapisywany, EF-008)
DefinitionOfDone       # per cel: required_analyses[], required_criteria[], required_documents[], required_data_classes[]
AnalysisPlan           # wyprowadzony z DefinitionOfDone + stanu modelu: lista biegów (rodzaj, przypadek, scenariusz, zależności) — wykonywany jako JEDNA akcja przez SolverOrchestrator
ProcessState           # per projekt: etap E1–E8, pokrycie analiz, werdykty kryteriów, świeżość wyników, status dokumentów, blokady gotowości
NextBestAction         # czysta funkcja (ProcessState, DefinitionOfDone) → Action; rozszerzenie dzisiejszej drabiny R1–R6 (`ui2/proces/nastepnaAkcja.ts`) o E6–E8; JEDNA implementacja (backend), UI ją renderuje
Action                 # {kind, target_ref, payload, executor}: OPEN_FORM(focus) | RUN_PLAN | APPLY_FIX | OPEN_SIZING | OPEN_COMPARE | GENERATE_PACKAGE | REVIEW_VERDICT
Remedy                 # {criterion_ref, element_ref, kind: CHANGE_TYPE|ADD_ELEMENT|CHANGE_SETTING|CHANGE_TOPOLOGY|CHANGE_ASSUMPTION, candidates: SizingResult|None, expected_effect: ImpactPreview|None}
```

### 2.2 Definicja gotowego per cel (propozycja startowa — do zatwierdzenia przez właściciela, decyzja C-02)

| Cel | Wymagane analizy (plan) | Wymagane kryteria (werdykt) | Wymagane dokumenty |
|---|---|---|---|
| NOWA_SIEC SN+nN | LF (max/min obciążenie), SC 3F max, SC 1F/2F min (c_min), pętla zwarcia nN + SWZ, obciążalność Iz′ (SN+nN), I²t, nastawy zabezpieczeń + koordynacja, N-1 dla pierścieni | ΔU SN i nN per obwód, obciążalność, wytrzymałość aparatury (Icu/Idyn/Ith) całego modelu, SWZ per obwód, selektywność, granica sieci | raport, dowody WHITE BOX, SLD SN+nN z tabliczką i rewizją, zestawienia (kable SN, TR, pola/rozdzielnice, CT/VT, przekaźniki/nastawy), arkusz obwodów nN, BOM całości, karta nastaw |
| PRZYLACZENIE_OZE | jak wyżej + hosting capacity/zdolność, obszar PQ, FRT/HVRT, LoM, RfG (klasa modułu), N-1 z DER, moc bierna | + zgodność NC RfG, kryteria OSD (warunki przyłączenia) | + studium przyłączeniowe, wniosek OSD, certyfikat zgodności, BOM toru DER |
| ROZBUDOWA | jak NOWA_SIEC w zakresie zmienionym + porównanie przed/po (wariant delta) | + brak pogorszenia kryteriów poza zakresem zmiany | + raport porównawczy przed/po |
| AUDYT_ISTNIEJACEJ | LF, SC, nastawy, koordynacja, obciążalność | wszystkie kryteria, w tym „nie do ustalenia" jako jawny stan | raport audytowy z rejestrem założeń i braków danych |
| MODERNIZACJA_ZABEZPIECZEN | SC max/min, nastawy, koordynacja, selektywność | selektywność, czułość, cieplne, SPZ×LoM | karta nastaw, TCC per tor, raport koordynacji |
| PRZYLACZENIE_ODBIORCY | LF, SC, pętla zwarcia nN/SWZ, obciążalność | ΔU, SWZ, obciążalność, warunki OSD | raport, arkusz nN, wniosek |

### 2.3 Command Center (jedno wejście do działania — §70–§72)

Jedna przestrzeń/pasek z pięcioma czasownikami: **Sprawdź** (gotowość + blokady z akcjami), **Policz** (`RUN_PLAN`: wszystkie wymagane analizy jako jedna seria zadań; „Przelicz nieaktualne" jako wariant), **Zweryfikuj** (werdykt kompletny SN+nN z remediami), **Porównaj** (warianty delta A/B/C, przed/po, run-vs-run), **Wydaj** (pakiet dokumentów jednym klikiem z gotowością per dokument). Wszystkie czasowniki to komendy backendu; UI nie zawiera własnej logiki kolejności.

### 2.4 Co zostaje z dzisiejszego kodu (dowód: A12 §5, A8)

- reguła NBA jako czysta funkcja (`nastepnaAkcja.ts:154-231`) — **rozszerzana, nie wymieniana**; przenosimy semantykę do backendu (jedna prawda), UI zostaje renderem;
- gotowość wg celów (`gotowoscAdapter.ts`, `grupowanieCelow.ts`) i rejestr kodów z `fix_navigation` (`canonical_operations.py:725-734`);
- łańcuchowanie realnej kolejnej operacji (`trunkContinuation.ts`) i `dry_run` stacji (fundament impact preview);
- tor DER-SN (dobór z kandydatami/odrzuconymi + auto-bieg + raport + BOM) jako **wzorzec** każdego doboru;
- unieważnienie serwerowe + znacznik świeżości + „Co się zmieniło" (`PanelCoSieZmienilo.tsx`);
- diagnoza biegu (`kodyDiagnozy.ts`), generator raportu z bramą PW;
- legacy executor akcji naprawczych (`ui/shared/fixActionSurfaceExecutor.ts`) — wraca do użycia jako executor `OPEN_FORM(focus)` (EF-046).

---

## 3. Nowe obiekty domenowe wymagane przez workflow (delta do architektury FAZY B §4)

| Obiekt | Po co | Dziś (dowód) |
|---|---|---|
| `ProjectAssumptions` (rejestr założeń, z provenance i rewizją) | jedno miejsce dla: Sk″max/min i R/X w punkcie zasilania, Un, cosφ wymagany, temperatura otoczenia/gruntu, rezystywność cieplna, normy i profile OSD, c_max/c_min, tk, rezerwy doborowe (TR, kabel, pole), k_j | rozproszone w 4 miejscach (EF-001); `KartaPrzypadku.tsx:138-147` „Wkrótce" |
| `ConnectionConditions` (warunki przyłączenia OSD jako dokument wejściowy) | nr/data dokumentu, Sk″ w punkcie, U, moc przyłączeniowa, cosφ, tryb pracy, wymagania zabezpieczeń/pomiaru/SCADA, klasa modułu; zasila `ProjectAssumptions` i `GridConnectionPoint` | 3 pola (`enm/models.py:126-137`); Sk″ wpisywane w kreatorze źródła |
| `DemandRecord` + `SimultaneityProfile` | zapotrzebowanie per odbiorca/szyna/TR (P_szczyt, profil, k_j, rezerwa rozwojowa) — warunek doboru TR i przekroju „od zapotrzebowania" | `Load` bez pól zapotrzebowania (`enm/models.py:422-433`); `simultaneity` tylko w torze DER |
| `LoadProfileCatalog` (profile odbiorców: komunalny, przemysłowy, usługowy… z ZIP i k_j) | odbiór z profilu zamiast 8 współczynników ZIP ręcznie (EF-020) | katalog OBCIAZENIE bez profili |
| `SizingRequest` / `SizingResult` (kandydaci, odrzuceni, ranking, uzasadnienie, `formula_ref`) | jeden kontrakt dla kabla SN/nN, TR, aparatu pola, CT/VT, kompensacji, DER | tylko `der-selection-preview`, `nn_device_selection`, `dobor_kompensacji` (różne kształty) |
| `ImpactPreview` | skutki elektryczne operacji przed zatwierdzeniem (ΔU, ΔIk, obciążenia, unieważnione biegi) liczone na kopii migawki | `dry_run` stacji tylko topologiczny (EF-015) |
| `Remedy` | patrz §2.1 | brak (EF-047) |
| `DocumentPackage` + `DocumentRecord{model_revision, run_refs, status}` | pakiet PW jednym klikiem; dokument OUTDATED po zmianie | magazyn bez hasha modelu (A9-20, A10-11) |
| `DesignDecision` / `Assumption` (dziennik decyzji per projekt) | „dlaczego", nie tylko „co" | brak w produkcie (A2-16, A10-12) |
| `ProjectMetadata` (zamawiający, obiekt, nr zlecenia, rewizja, projektant) | wspólna metryka wszystkich dokumentów | projekt = nazwa + opis (EF-009) |
| `StationTypical` (stacja typowa użytkownika z pełnym wyposażeniem, `copy_station`, wstaw N stacji wzdłuż ciągu) | powtarzalność (EF-059) | tylko konfiguracja rozdzielnicy w `szablonyUzytkownika.ts`; `copy_nn_feeder` bez UI |

---

## 4. Czternaście procesów (mandat §68, struktura §157)

Konwencja: **GOAL** · **INPUT** · **DOMAIN OBJECTS** · **MISSING DATA** (co system musi umieć zgłosić jako brak, nigdy podstawić) · **SMART DEFAULTS** (skąd domyślne — zawsze z rejestru/modelu, nigdy literał w UI) · **CANDIDATES** · **SOLVERS** · **CONSTRAINTS** · **OPTIMIZATION** · **COMPARISON** · **ENGINEER DECISION** · **NEXT ACTION** · **DOCUMENTATION**. W nawiasach: identyfikatory tarć z rejestru (EF-…) i ustaleń audytu, które proces domyka.

### W1 · Projekt i założenia (PROJECT + ASSUMPTIONS)
- **GOAL:** jedno miejsce prawdy o tym, „na jakich założeniach liczymy", z provenance i rewizją; cel projektu wyznacza definicję gotowego.
- **INPUT:** warunki przyłączenia OSD (dokument), dane zamawiającego, cel projektu, normy/profile OSD, warunki środowiskowe, polityka rezerw.
- **DOMAIN OBJECTS:** `ProjectMetadata`, `ProjectGoal`, `ConnectionConditions`, `ProjectAssumptions`, `Assumption[]`, `GridConnectionPoint`.
- **MISSING DATA:** brak Sk″min (→ Ik_min nierozstrzygalne, jawny brak), brak temperatury gruntu (→ Iz′ z warunków katalogowych z oznaczeniem założenia), brak cosφ wymaganego.
- **SMART DEFAULTS:** c wg IEC 60909 tab. 1 per pasmo napięcia (c_max 1,10 SN / 1,05–1,10 nN; c_min 1,00 SN / 0,95 nN) jako **rejestr normatywny**, nie literał (EF-004 — dziś trzy różne c_min w UI); tk = z czasu zadziałania zabezpieczenia gdy znany, inaczej 1 s z oznaczeniem założenia (EF-005); temperatura 20 °C grunt / 30 °C powietrze wg PN-HD 60364-5-52 jako założenie jawne (EF-002).
- **CANDIDATES:** profile OSD (Enea/Tauron/PGE/Energa/Stoen) jako katalog z cytowaniem IRiESD (A4 W9).
- **SOLVERS:** brak (rejestr danych); podgląd IEC 60909 punktu zasilania z `grid-source-preview` (istnieje).
- **CONSTRAINTS:** spójność Sk″ ↔ R/X ↔ Ik″; cosφ ∈ zakres OSD; moc przyłączeniowa ≥ Σ zapotrzebowanie.
- **OPTIMIZATION:** n/d.
- **COMPARISON:** rewizje założeń (diff) — „co się zmieniło w założeniach między rewizją 3 a 5".
- **ENGINEER DECISION:** akceptacja założeń (podpis inżyniera per założenie, jak dziś dla karty falownika — A6-14).
- **NEXT ACTION:** „Zbuduj punkt zasilania z warunków OSD" (W2) — kreator wstępnie wypełniony (EF-010).
- **DOCUMENTATION:** rozdział „Założenia i warunki przyłączenia" w każdym raporcie; rejestr założeń jako załącznik; hash założeń cytowany przez każdy bieg/dokument (A10-12).

### W2 · Punkt zasilania / GPZ (SOURCE / GPZ)
- **GOAL:** model GPZ (sekcje, transformatory, pola) zgodny z warunkami OSD, z pełnym podglądem zwarciowym, katalog-first.
- **INPUT:** `ConnectionConditions` (Sk″max/min, U, R/X, uziemienie punktu neutralnego), rodzina rozdzielnicy, liczba sekcji/TR.
- **DOMAIN OBJECTS:** `ExternalGrid` (źródło z terminalem), `Substation/VoltageLevel/BusbarSection/Bay`, `EarthingSystem`, `PowerTransformer` (dla GPZ 110/SN), `Breaker/Disconnector/EarthSwitch`, `Measurement` (CT/VT), `ProtectionDevice`.
- **MISSING DATA:** brak Sk″min → bieg min niemożliwy (blokada jawna); brak układu uziemienia → Ik1 nierozstrzygalny.
- **SMART DEFAULTS:** z `ProjectAssumptions` i rodziny rozdzielnicy (szablon FABRYCZNY/OPCJA — istnieje); Un z warunków.
- **CANDIDATES:** rodziny rozdzielnic (Reference Engine, istnieje), szablony pól kompletnych.
- **SOLVERS:** IEC 60909 podgląd (istnieje: `grid-source-preview`).
- **CONSTRAINTS:** Icu/Idyn/Ith aparatów ≥ Ik″/ip/Ith·√tk (kryteria wyposażenia w miejscu decyzji — istnieją dla CT/VT, rozszerzyć na aparaty).
- **OPTIMIZATION:** n/d (dobór rodziny to decyzja).
- **COMPARISON:** wariant 1 sekcja vs 2 sekcje (delta) — porównanie Ik″ i N-1.
- **ENGINEER DECISION:** rodzina, liczba sekcji, punkt neutralny.
- **NEXT ACTION:** „Poprowadź ciąg SN z pola X" (W3) — łańcuchowanie `next_step` (istnieje).
- **DOCUMENTATION:** karta GPZ w raporcie; SLD SN.

### W3 · Ciąg SN / pierścień / punkt podziału (SN FEEDER / RING / OPEN POINT)
- **GOAL:** trasa SN dobrana od zapotrzebowania (nie „od In kabla"), z pierścieniem i NOP jako obiektami, z re-walidacją po rozpływie.
- **INPUT:** przewidywane obciążenie ciągu (Σ `DemandRecord` × k_j + rezerwa), długości odcinków, warunki ułożenia (dziedziczone z założeń, override per odcinek), rodzaj (kabel/linia).
- **DOMAIN OBJECTS:** `ACLineSegment` (Cable/Line z terminalami), `Junction/BranchPoint`, `Switch` (łącznik sekcyjny, NOP jako `NormalOpenPoint` na terminalu), `Corridor` (trasa wspólna), `LayingConditions`.
- **MISSING DATA:** brak zapotrzebowania → dobór po Ib niemożliwy: system oferuje tryb „dobór po In" z jawnym oznaczeniem założenia (nigdy cicho).
- **SMART DEFAULTS:** cosφ z warunków OSD (EF-006), Un z szyny źródłowej (EF-007), prąd obliczeniowy Ib z zapotrzebowania (EF-011), warunki ułożenia z założeń (EF-002).
- **CANDIDATES:** `SizingRequest(kind=CABLE_SN)` → kandydaci z rewizji katalogu spełniający Ib ≤ Iz′, ΔU ≤ ΔU_max, I²t (k²S² ≥ Ik²·tk), ekonomiczna gęstość (IEC 60287-3-2, opcja), ranking wg kryterium właściciela (decyzja C-05).
- **SOLVERS:** ΔU (istnieje `cable-voltage-drop-preview`), LF po zbudowaniu (re-walidacja), SC (I²t).
- **CONSTRAINTS:** Iz′, ΔU, I²t, promień gięcia/przekrój minimalny wg OSD, prąd wyrównawczy w pierścieniu, Ik na końcu (czułość zabezpieczeń).
- **OPTIMIZATION:** ranking lokalizacji NOP (straty, prądy wyrównawcze, N-1) — batch rozpływów per kandydat (EF-013); standaryzacja przekroju w ciągu.
- **COMPARISON:** warianty trasy (delta), NOP A vs B.
- **ENGINEER DECISION:** przekrój z listy kandydatów (z uzasadnieniem), NOP, punkty sekcjonowania.
- **NEXT ACTION:** „Wstaw stację na odcinku" (W4) lub „Domknij pierścień między …" (akcja z menu obu końców na kanwie — EF-012).
- **DOCUMENTATION:** zestawienie kabli SN (cable schedule: odcinek, typ, przekrój, długość, ułożenie, Iz′, Ib, ΔU, I²t) — dziś brak (A9-20).

### W4 · Wstawienie stacji na odcinku (STATION INSERT — mandat §76)
- **GOAL:** stacja SN/nN wstawiona na odcinku z podziałem, dziedziczeniem katalogu, pełnym wyposażeniem pól, podglądem skutków **elektrycznych** i automatycznym doborem TR/aparatów z kandydatami.
- **INPUT:** miejsce podziału (z kanwy/km), szablon stacji lub rodzina rozdzielnicy, zapotrzebowanie stacji (Σ odbiory nN + rezerwa), typ pola nN.
- **DOMAIN OBJECTS:** `Substation`, `VoltageLevel×2`, `Bay` (SN: liniowe ×2, TR; nN: zasilające, odpływowe), `PowerTransformer`, `Switch/Fuse`, `Measurement` (CT/VT, rdzenie), `ProtectionDevice`, `EarthingSystem` (stacja), `BusbarSection` nN.
- **MISSING DATA:** brak zapotrzebowania → TR bez propozycji (jawnie), brak układu sieci nN (TN-C/TN-S/TT) → SWZ nierozstrzygalne (nigdy cichy TN-C-S — A11-03).
- **SMART DEFAULTS:** wyposażenie pól z szablonu rodziny (FABRYCZNY/OPCJA — istnieje) rozszerzone o obwód wtórny (EF-060); TR z kandydatów; układ nN z założeń projektu.
- **CANDIDATES:** `SizingRequest(TRANSFORMER)` (S ≥ zapotrzebowanie×k_j/(1−rezerwa), Un, uk, grupa, straty; EF-014); `SizingRequest(FIELD_APPARATUS)` (Un, In ≥ Ib, Icu ≥ Ik″, Idyn, Ith — reuse `field_apparatus` z DER, EF-016); `SizingRequest(CT)` i `(VT)` (reuse `dobor_przekladnika`, EF-041).
- **SOLVERS:** `ImpactPreview` = LF+SC na kopii migawki z wstawioną stacją (rozszerzenie `dry_run`, EF-015).
- **CONSTRAINTS:** jak W2 + obciążenie TR ≤ 100 % (max) i rezerwa; ΔU nN; zwarcie po stronie nN (Icu aparatów nN).
- **OPTIMIZATION:** moc TR (najmniejsza spełniająca z rezerwą vs straty), standaryzacja (jeden typ TR w ciągu).
- **COMPARISON:** przed/po wstawieniu (delta): ΔU, Ik, N-1.
- **ENGINEER DECISION:** TR, aparaty, CT/VT, układ nN; zatwierdzenie po podglądzie skutków.
- **NEXT ACTION:** „Zbuduj rozdzielnicę nN i obwody" (W6) — jako AKCJA, nie tekst (EF-018); „Uruchom wymagane analizy" jeżeli cel nie wymaga nN.
- **DOCUMENTATION:** karta stacji; zestawienie TR i pól/rozdzielnic (dziś brak); SLD stacji (widok wewnętrzny).

### W5 · Dobór transformatora (TR SELECTION) — jako część W4 i jako samodzielna akcja „Zmień typ"
- **GOAL:** TR dobrany z zapotrzebowania i zwarcia, z kandydatami i uzasadnieniem, także w trybie „wynik → zmień typ".
- **INPUT:** zapotrzebowanie (P, Q, k_j, rezerwa), Un obu stron, wymagania uk (Ik nN), regulacja (DETC/OLTC), straty (opcjonalne kryterium ekonomiczne).
- **DOMAIN OBJECTS:** `PowerTransformer` + `TapChanger`, `CatalogBinding` (rewizja przypięta), `DemandRecord`.
- **MISSING DATA:** zapotrzebowanie; koszt strat (jeśli kryterium ekonomiczne).
- **SMART DEFAULTS:** z `ProjectAssumptions` (rezerwa TR, k_j), Un z szyn.
- **CANDIDATES:** filtr twardy (Un, S ≥ S_wym) → ranking (S najmniejsze spełniające / straty / koszt) → `rejected[]` z powodem (EF-019).
- **SOLVERS:** `transformer-rated-currents-preview` (istnieje), LF (obciążenie), SC (Ik nN).
- **CONSTRAINTS:** obciążenie ≤ limit, uk w zakresie (Ik nN ≤ Icu aparatów nN, ale ≥ warunek SWZ), ΔU nN.
- **OPTIMIZATION:** kryterium właściciela (C-05).
- **COMPARISON:** kandydat A vs B: obciążenie, straty, Ik nN, koszt.
- **ENGINEER DECISION:** typ TR.
- **NEXT ACTION:** przelicz zależne analizy (automatycznie wg polityki) → werdykt.
- **DOCUMENTATION:** zestawienie TR; uzasadnienie doboru w raporcie (kandydaci + powody odrzucenia).

### W6 · Rozdzielnica nN, obwody, odbiory (nN BOARD + FEEDERS + LOADS)
- **GOAL:** pełna projektowalność nN w żywej powłoce: rozdzielnica, obwody, aparaty, odbiory, z doborem aparatu (4 kryteria IEC 60364) i SWZ per obwód **w werdykcie**, nie tylko jako nakładka.
- **INPUT:** odbiory (profil + P + przyłącze 1/3-faz.), długości/trasy obwodów, układ sieci nN, warunki ułożenia.
- **DOMAIN OBJECTS:** `BusbarSection` nN (+ szyna PE/N i punkt rozdziału PEN — A11-04), `Bay` nN, `Breaker/Fuse/RCD` nN, `ACLineSegment` nN z żyłami (L/N/PE/PEN — model fazowy), `EnergyConsumer` z `PhaseCode` i `DemandRecord`, `EarthingSystem` (układ TN-S/TN-C/TN-C-S/TT/IT jako encja).
- **MISSING DATA:** żyła PE/PEN (fail-closed — istnieje), układ sieci, r0/x0 kabli nN (dziś 0/17 — A11-05: brak = brak, nie fallback).
- **SMART DEFAULTS:** profil odbiorcy z `LoadProfileCatalog` (ZIP, k_j) zamiast 8 pól (EF-020); warunki ułożenia z założeń; aparat z kandydatów.
- **CANDIDATES:** `SizingRequest(CABLE_NN)` (Ib ≤ In ≤ Iz′, I2 ≤ 1,45·Iz′, ΔU, I²t, SWZ), `SizingRequest(DEVICE_NN)` = `nn_device_selection` (istnieje w backendzie, 0 konsumentów UI — EF-022).
- **SOLVERS:** pętla zwarcia nN (istnieje), SWZ (istnieje), nowy rozpływ 3-fazowy 4-przewodowy nN (FAZA D, decyzja właściciela), LF/SC z SN (upstream Thevenin).
- **CONSTRAINTS:** SWZ (czas wyłączenia wg IEC 60364-4-41 z Tab. 41.1 — dane normy: decyzja C-08), ΔU nN per obwód, Iz′, I²t, selektywność MCB–MCCB (tabele producenta), RCD (TT).
- **OPTIMIZATION:** standaryzacja przekrojów/aparatów w rozdzielnicy; kolejność obwodów.
- **COMPARISON:** wariant zasilania (1 TR / 2 TR ze sprzęgłem; SZR).
- **ENGINEER DECISION:** aparat per obwód, przekrój, układ.
- **NEXT ACTION:** „Uruchom wymagane analizy nN" (FAULT_LOOP_NN, SWZ_NN, LF nN) jako biegi z rewizją (dziś liczone „w locie" bez rekordu — A9-05).
- **DOCUMENTATION:** arkusz obwodów nN (istnieje w backendzie, bez UI), karta rozdzielnicy, SLD nN (istnieje), pakiet dowodowy obwodu (istnieje).

### W7 · DER (PV/BESS) + punkt przyłączenia + RfG
- **GOAL:** uogólnić najlepiej domknięty tor (DER-SN) na wszystkie warianty przyłączenia (SN bezpośrednio, przez TR blokowy, nN), z jedną prawdą parametrów modułu (model, nie formularz) i unieważnieniem wyników RfG po zmianie modelu.
- **INPUT:** moc modułu, klasa (A–D wg mocy i Un), technologia (PV/BESS/FW/PCS), wariant przyłączenia, wymagania OSD (warunki), profil pracy.
- **DOMAIN OBJECTS:** `PowerElectronicsConnection` + `PhotovoltaicUnit/BatteryUnit` (rozdzielenie źródła pierwotnego, konwertera, sterowania — A5-01), `ControlMode` (grid-following/forming jako typ, nie string — A5-03), `GridConnectionPoint` (obiekt umowny na terminalu; rozstrzygnięcie A5-06), `ComplianceProfile` (NC RfG/PTPiREE/OSD), `PowerTransformer` blokowy.
- **MISSING DATA:** krzywe zdolności P/Q falownika (z karty — istnieje), droop/dead-band (z modelu; brak = brak, nie 5 % — EF-026), Sk″ w punkcie przyłączenia.
- **SMART DEFAULTS:** rezerwy doboru toru z założeń (EF-025); punkt przyłączenia z granicy sieci (1 klik — EF-027); przebiegi do wniosku = najnowsze aktualne (EF-027).
- **CANDIDATES:** `der-selection-preview` (istnieje; wzorzec), rozszerzone o aparaty nN dla przyłączy nN.
- **SOLVERS:** LF (tryby Q z katalogu **aktywne** w rozpływie — A5-03), SC (wkład DER z karty, nie tylko k_sc·In — A5-14), hosting capacity, PQ area, FRT/HVRT, LoM, RMS (T8/T10/T11/T16–18 zamiast `no_module` — A4-17).
- **CONSTRAINTS:** ΔU w punkcie przyłączenia, moc bierna w obszarze PQ, SCR/WSCR, N-1 z DER, LoM×SPZ.
- **OPTIMIZATION:** ranking punktów przyłączenia (istnieje: zdolność), dobór kompensacji (istnieje).
- **COMPARISON:** warianty przyłączenia (delta), z DER vs bez.
- **ENGINEER DECISION:** wariant, tor, klasa modułu, nastawy funkcji sieciowych.
- **NEXT ACTION:** auto-bieg planu (istnieje dla LF+SC; rozszerzyć o wymagane analizy OZE) → raport zgodności → wniosek.
- **DOCUMENTATION:** studium, wniosek OSD (punkt z modelu), certyfikat zgodności, BOM toru (istnieją), sekcja DER w raporcie głównym.

### W8 · Uruchamianie obliczeń (RUN CALCULATIONS)
- **GOAL:** jedna akcja `RUN_PLAN` uruchamia komplet wymaganych analiz (z zależnościami: SC max/min ⇒ nastawy ⇒ koordynacja ⇒ cieplne), jako zadania z postępem; „Przelicz nieaktualne" po zmianie.
- **INPUT:** `AnalysisPlan` z definicji gotowego; przypadek/scenariusz; polityka przeliczeń.
- **DOMAIN OBJECTS:** `Run` (jeden rejestr — A9-02), `AnalysisPlan`, `Scenario`, `Freshness`.
- **MISSING DATA:** gotowość per analiza (lista blokad z akcjami — EF-032, nie pierwsza blokada).
- **SMART DEFAULTS:** plan z celu; para max/min automatycznie (EF-030); bieg zawsze na jawnie wybranym przypadku (EF-033).
- **CANDIDATES:** n/d.
- **SOLVERS:** przez `SolverOrchestrator` (FAZA D): DAG, cache, równoległość, provenance.
- **CONSTRAINTS:** gotowość (`ReadinessService`), budżet czasu (plan wydajności).
- **OPTIMIZATION:** kolejność i równoległość zadań; selektywne przeliczenie z grafu zależności (A2-11).
- **COMPARISON:** n/d.
- **ENGINEER DECISION:** zatwierdzenie planu (widoczny przed uruchomieniem: „policzymy: LF, SC 3F max, SC 1F min, nastawy, koordynacja — 6 biegów, ~40 s").
- **NEXT ACTION:** „Zweryfikuj" (W13) po zakończeniu; diagnoza biegu przy błędzie (istnieje).
- **DOCUMENTATION:** rejestr biegów z rewizją modelu (EF-054) w raporcie.

### W9 · Dobór (SIZING) — kabel / TR / aparat / CT / VT — ogólny (mandat §55)
- **GOAL:** każdy dobór = ta sama pętla: kandydaci → ograniczenia → ranking → uzasadnienie → skutek → decyzja; wejście z kreatora, z wyniku (przekroczenie), z werdyktu (remedium) i z inspektora („Zmień typ").
- **INPUT:** kontekst elementu (Ib z biegu, Ik z biegu, Un, warunki), kryterium rankingu.
- **DOMAIN OBJECTS:** `SizingRequest/SizingResult`, `CatalogRevision`, `Remedy`, `ImpactPreview`.
- **MISSING DATA:** brak biegu → Ib/Ik nieznane → kandydaci wg wartości z założeń z oznaczeniem („dobór wstępny").
- **SMART DEFAULTS:** wszystkie z modelu/biegów (W-02).
- **CANDIDATES:** moduły doboru (`analysis/sizing/*` — patrz `MV_DESIGN_PRO_DESIGN_OPTIMIZATION_ARCHITECTURE.md` §4).
- **SOLVERS:** wyniki istniejących biegów + `ImpactPreview` na kopii dla wybranego kandydata.
- **CONSTRAINTS:** normatywne (IEC 60364, HD 60364-5-52, IEC 60909, IEC 62271, IEC 60947) + polityki OSD + założenia projektu — jawnie rozdzielone (`ConstraintEngine`).
- **OPTIMIZATION:** kryterium właściciela (C-05): minimalny spełniający / koszt / straty / standaryzacja.
- **COMPARISON:** kandydat A vs B (tabela skutków).
- **ENGINEER DECISION:** wybór; zapis `DesignDecision` (alternatywy + powód).
- **NEXT ACTION:** propagacja (W-05) → werdykt.
- **DOCUMENTATION:** rozdział „Dobór" w raporcie z kandydatami i odrzuconymi (jak DER-SN dziś).

### W10 · Zabezpieczenia: CT/VT, nastawy, TCC, koordynacja (szczegóły: `MV_DESIGN_PRO_PROTECTION_ARCHITECTURE.md`)
- **GOAL:** jeden tor: model (IED, funkcje, grupy nastaw, trip matrix) → propozycja nastaw z biegów (metodyka Hoppel/IRiESD — istnieje) → TCC jako projekcja modelu → selektywność/czułość/cieplne w werdykcie → karta nastaw.
- **INPUT:** biegi SC max/min + LF; katalog IED; profil OSD; wymagania z warunków przyłączenia.
- **DOMAIN OBJECTS:** `ProtectionDevice` (IED), `ProtectionFunction`, `SettingGroup`, `TripMatrix`, `Interlock`, `CtCore`, `Measurement`, `SpzScheme`.
- **MISSING DATA:** brak Ik_min → czułość nierozstrzygalna; brak klasy CT zabezpieczeniowej → nasycenie nierozstrzygalne; brak tabel selektywności producenta nN → „nierozstrzygalne" (nigdy „spełnia").
- **SMART DEFAULTS:** nastawy proponowane z biegów (I> = k_b·I_obc_max itd. — `protection_settings/engine.py`), profil OSD z katalogu.
- **CANDIDATES:** IED z katalogu (realne karty, bez „ACME" — A4-13), CT/VT (`dobor_przekladnika` — istnieje), grupy nastaw jako warianty.
- **SOLVERS:** `protection_iec60255` (jedyna fizyka krzywych — A4-01: 5 → 1), `protection_lv_curves`, SC/LF (prądy), `czas_wylaczenia` (trace).
- **CONSTRAINTS:** selektywność Δt ≥ 0,3–0,5 s (profil OSD), czułość k ≥ 1,2–1,5 przy Ik_min na końcu strefy, cieplne (I²t kabla ≥ let-through), koordynacja SPZ×LoM, CBF.
- **OPTIMIZATION:** minimalne czasy przy zachowaniu marginesów (ranking grup nastaw).
- **COMPARISON:** grupa nastaw A vs B (TCC nałożone, marginesy).
- **ENGINEER DECISION:** zatwierdzenie grupy nastaw (rewizja nastaw).
- **NEXT ACTION:** werdykt selektywności (W13); karta nastaw (W14).
- **DOCUMENTATION:** karta nastaw per stacja/pole, TCC per tor, raport koordynacji (istnieje częściowo), zestawienie przekaźników i CT/VT (brak).

### W11 · Scenariusze, what-if, N-1 (SCENARIOS)
- **GOAL:** eksperymentowanie bez psucia projektu bazowego: warianty jako delty na rewizji, generator scenariuszy, N-1 w planie i werdykcie.
- **INPUT:** rodzaj scenariusza (23 rodzaje `ScenarioKind` — FAZA B §11), zakres (wybór z modelu, nie tekst — EF-042), kryteria oceny.
- **DOMAIN OBJECTS:** `Scenario` (typowane delty), `VariantBranch`, `ContingencySet`, `EffectiveState`.
- **MISSING DATA:** dane awaryjności dla niezawodności (jeśli SAIDI) — jawny brak.
- **SMART DEFAULTS:** zakres N-1 = wszystkie gałęzie SN + TR (domyślnie), generator „zwarcie na każdej szynie SN / w każdej stacji".
- **CANDIDATES:** kandydaci NOP, kandydaci lokalizacji sekcjonowania.
- **SOLVERS:** `SolverOrchestrator` serie z cache (współdzielony Y-bus, faktoryzacja) — N-1 ≤ budżet (plan wydajności).
- **CONSTRAINTS:** kryteria N-1 (przeciążenia, ΔU, wyspy, zabezpieczenia).
- **OPTIMIZATION:** ranking konfiguracji (NOP), reinforcement planner (co wzmocnić, by N-1 przeszło).
- **COMPARISON:** A/B/C wariantów (tabela + SLD różnicowy).
- **ENGINEER DECISION:** „Zastosuj wariant" (merge delty do bazy z rewizją) lub odrzuć.
- **NEXT ACTION:** po zastosowaniu — propagacja.
- **DOCUMENTATION:** raport N-1 (dziś tylko JSON), raport porównawczy wariantów.

### W12 · RfG / jakość energii (RfG / PQ)
- **GOAL:** ocena zgodności z jednej prawdy parametrów modułu i z aktualnych biegów; wynik jako bieg z rewizją (unieważnialny).
- **INPUT:** klasa modułu, profil OSD, parametry z modelu (W7), wyniki LF/SC/dynamiki.
- **DOMAIN OBJECTS:** `ComplianceRun` (rodzaj `Run`), `ComplianceProfile`, `TestCase` (katalog testów PTPiREE), `Measurement` (dla oceny powykonawczej).
- **MISSING DATA:** brak solvera dla testu → `NIE_DO_USTALENIA` z powodem (nigdy `no_module` jako werdykt).
- **SMART DEFAULTS:** brak (parametry tylko z modelu).
- **CANDIDATES:** n/d.
- **SOLVERS:** FRT/HVRT, RMS, LF (Q(U), P(f)), PQ (harmoniczne z widm katalogowych, flicker, asymetria — dziś fabrykowane/nieliczone — A5-08).
- **CONSTRAINTS:** wymagania NC RfG/PTPiREE per klasa; EN 50160.
- **OPTIMIZATION:** n/d.
- **COMPARISON:** przed/po zmianie nastaw modułu.
- **ENGINEER DECISION:** akceptacja/odrzucenie; wniosek.
- **NEXT ACTION:** dokumenty OSD.
- **DOCUMENTATION:** certyfikat, wniosek, studium (istnieją) + raport PQ (brak).

### W13 · Weryfikacja: kryteria, gotowość, werdykt (VERIFICATION)
- **GOAL:** jeden werdykt kompletny SN+nN (wszystkie kryteria definicji gotowego), każdy FAIL z remediami i skutkiem, „co wymaga uwagi" jako jeden rejestr przekroczeń z backendu.
- **INPUT:** biegi (świeże), model, założenia, definicja gotowego.
- **DOMAIN OBJECTS:** `CriterionVerdict` (PASS/FAIL/NIE_DOTYCZY/NIE_DO_USTALENIA + WHY/WHERE), `Remedy[]`, `ViolationRegister`, `Readiness`.
- **MISSING DATA:** kryterium bez dostawcy = `NIE_DO_USTALENIA` z nazwą brakującej analizy i akcją „policz".
- **SMART DEFAULTS:** n/d.
- **CANDIDATES:** remedia (z `SizingRequest`), zmiana nastaw, zmiana topologii, zmiana założenia.
- **SOLVERS:** `ImpactPreview` dla każdego remedium (na żądanie).
- **CONSTRAINTS:** wszystkie kryteria SN+nN (dziś 10 z 4 poza automatem i bez nN — EF-048): ΔU SN/nN, obciążalność z korektą ułożenia, wytrzymałość aparatury całego modelu, SWZ per obwód, selektywność/czułość, granica sieci, warunki OSD, N-1, RfG.
- **OPTIMIZATION:** ranking remediów wg kosztu/skutku.
- **COMPARISON:** werdykt rewizji N vs N−1 (co się pogorszyło).
- **ENGINEER DECISION:** wybór remedium lub akceptacja odstępstwa (z wpisem `DesignDecision` i uzasadnieniem).
- **NEXT ACTION:** NBA: remedium → propagacja → re-werdykt; gdy PASS: „Wydaj" (W14).
- **DOCUMENTATION:** rozdział „Weryfikacja" z tabelą kryteriów, odstępstw i decyzji.

### W14 · Dokumentacja (DOCUMENTATION — mandat §124–§126)
- **GOAL:** pakiet projektu jednym klikiem, z gotowością per dokument (lista braków), świeżością (OUTDATED po zmianie) i rewizją; SLD w hubie.
- **INPUT:** definicja gotowego (wymagane dokumenty), profil odbiorcy (OSD/wykonawczy/audytowy), metryka projektu.
- **DOMAIN OBJECTS:** `DocumentType` (rejestr §124), `DocumentRecord{model_revision, run_refs, assumptions_hash, status}`, `DocumentPackage`, `SheetDocument` (SLD).
- **MISSING DATA:** per dokument lista braków (wzorzec `report_readiness` — istnieje, niewpięty).
- **SMART DEFAULTS:** metryka z `ProjectMetadata`; tabliczka SLD z rewizją.
- **CANDIDATES:** n/d.
- **SOLVERS:** brak (generatory czytają biegi; zero fizyki).
- **CONSTRAINTS:** dokument z nieświeżego biegu = OUTDATED (blokada wydania „wydany" bez potwierdzenia).
- **OPTIMIZATION:** n/d.
- **COMPARISON:** rewizja dokumentu N vs N−1.
- **ENGINEER DECISION:** status dokumentu (roboczy/uzgodniony/wydany), podpis.
- **NEXT ACTION:** archiwum ZIP rewizji; przekazanie do OSD.
- **DOCUMENTATION:** to jest wyjście: raport, dowody, SLD SN+nN (PDF/DXF z tabliczką), zestawienia (kable SN, TR, pola/rozdzielnice, CT/VT, przekaźniki/nastawy), arkusz nN, BOM całości, karta nastaw, N-1, PQ, studium/wniosek/certyfikat OZE — jeden generator z jednego modelu (dziś 5 punktów wejścia — A10-11).

---

## 5. Jeden inspektor i akcje obiektowe (mandat §73; A8-05, A8-08)

Inspektor elementu = 5 zakładek zasilanych z read-modeli backendu: **Właściwości** (parametry z provenance: katalog/override/założenie), **Wyniki** (per analiza, ze świeżością), **Dowody** (WHITE BOX, dokumenty), **Powiązania** (terminale, kontener, zabezpieczenia chroniące — `trace_protection`, obwody zasilane), **Akcje**. Akcje obiektowe per rodzaj elementu (menu kontekstowe kanwy i palety poleceń — dziś 5 pozycji kończy się toastem „Etap N roadmapy"):

| Element | TRACE | SIZE | REPLACE | COMPARE | FAULT | SWZ | inne |
|---|---|---|---|---|---|---|---|
| kabel/linia SN | ścieżka zasilania, zabezpieczenia chroniące | dobór przekroju | zmień typ (kandydaci) | wariant A/B | zwarcie na końcu/w punkcie | — | wstaw stację, domknij pierścień, sekcjonuj |
| TR | tor zasilania | dobór S | zmień typ | A/B | zwarcie nN | — | zaczepy, straty |
| pole/aparat | tor wyzwalania (trip matrix) | dobór aparatu/CT/VT | zmień typ | — | zwarcie na szynie | — | nastawy, TCC toru |
| obwód nN | który aparat chroni | dobór kabla/aparatu | zmień | — | pętla zwarcia | werdykt SWZ | arkusz |
| DER | punkt przyłączenia, granica | dobór toru | zmień falownik | wariant | wkład zwarciowy | — | RfG, zdolność |
| szyna | wyspa/zasilanie | — | — | — | zwarcie | — | dodaj odbiór/źródło/pole |

---

## 6. Role (§168) jako profile — decyzja C-06

Profil ≠ tryb zaawansowania (basic/extended/expert — `modeModel.ts:10`). Profil ustala: domyślny `ProjectGoal`, kolejność przestrzeni, domyślny plan analiz, zakładki wyników (zamiast 32 w jednym tablist — EF-056), uprawnienia (gdy włączone — decyzja A9-06). Profile: projektant SN, projektant stacji, projektant nN, zabezpieczeniowiec, specjalista OZE/BESS, analityk sieci, eksploatacja (tryb SCADA prezentacji, stany as-operated, tylko odczyt modelu), audytor (WHITE BOX, rejestr założeń, decyzje). Każdy profil ma test §181 dla swojego zakresu.

---

## 7. Polityka propagacji (§175) — decyzja C-01

Trzy polityki dostępne per projekt: **natychmiast** (małe sieci: po każdej zmianie przelicz analizy z grafu zależności w tle), **na żądanie** („Przelicz nieaktualne" — zbiór z grafu zależności, jeden klik), **w tle z budżetem** (przelicz szybkie analizy natychmiast — LF/SC podstawowe; kosztowne — N-1, hosting, PQ — zaplanuj). Warunek wstępny każdej polityki: selektywna inwalidacja (FAZA B §22) i orkiestrator z cache (FAZA D). Bez tego „automatycznie" oznacza „wszystko od nowa" (dziś all-or-nothing: A2-05).

---

## 8. Test §181 jako kryterium odbioru workflowu (14 ogniw) + KPI

Jeden scenariusz e2e na sieci wzorcowej rejestru (`MV_DESIGN_PRO_MIGRATION_PLAN.md` §6): warunki OSD → założenia → GPZ → ciąg SN (dobór z kandydatów) → 3 stacje (jedna z 2 TR i sprzęgłem) → nN (obwody, aparaty z kandydatów, SWZ) → DER (PV+BESS) → plan analiz jednym klikiem → werdykt kompletny (wszystkie kryteria) → FAIL z remedium → zastosowanie remedium → propagacja (dokładnie te analizy) → nastawy+koordynacja → N-1 → pakiet dokumentów (14 typów) → zmiana rewizji → dokumenty OUTDATED → wydanie. Każde ogniwo ma asercję **i** pomiar KPI:

| KPI | Dziś (A12) | Cel |
|---|---|---|
| liczba miejsc wpisu tej samej danej | Sk″ ×2, tk ×3, cosφ ×4, c ×3 | 1 |
| kliki do kompletu analiz | 4–6 miejsc × 2–3 kliki | 1 akcja |
| dobory z kandydatami | 2 z 8 klas (DER, kompensacja) | 8 z 8 |
| kryteria werdyktu z dostawcą | 6 z 10 (0 nN) | 100 % definicji gotowego |
| FAIL z remedium | 0 % | 100 % |
| akcje naprawcze wykonujące naprawę | 0 % (100 % nawigacja) | 100 % |
| dokumenty z pakietu jednym klikiem | 6 kart, 3 miejsca | 1 pakiet, gotowość per dokument |
| ogniwa §181 „działa" | 3/14 | 14/14 |

---

## 9. Mapowanie stanu obecnego → docelowego (skrót; LOC i kolejność w planie migracji)

| Dziś | Los | Docelowo |
|---|---|---|
| `ui2/proces/nastepnaAkcja.ts` (R1–R6) | KEEP + rozszerz | semantyka w backendzie `NextBestActionService`, UI = render |
| pięć silników „następnego kroku" (A8-04) | DELETE (4 z 5) | jeden NBA |
| siedem inspektorów (A8-05) | REPLACE | jeden inspektor z read-modeli |
| akcja naprawcza = nawigacja (`AppRoot.tsx:306-311`) | REPLACE | executor `OPEN_FORM(focus)` (reuse `fixActionSurfaceExecutor.ts`), `APPLY_FIX` |
| `UruchomObliczenie.tsx` (2 rodzaje) | REPLACE | `RUN_PLAN` z `AnalysisPlan` |
| 23 kreatory (2–9 kroków) | KEEP (kontrakty) + odchudź | tryb „z założeń" (auto-wypełnienie), kandydaci w każdym doborze |
| kreator stacji 2 646 LOC | KEEP + `ImpactPreview` + `SizingRequest` | — |
| strumień OZE z drugim store DER (`synchronizacjaZModelu.ts`) | REPLACE | parametry z modelu; wynik RfG jako `Run` |
| `PanelScenariuszy.tsx` (`element_ref` tekstowy) | REPLACE | wybór z modelu + generator |
| `WynikiWarsztat.tsx` 32 zakładki | REPLACE | zakładki wg profilu/celu + rejestr przekroczeń |
| hub dokumentacji (6 kart) | REPLACE | `DocumentPackage` + rejestr typów §124 |
| `KartaPrzypadku.tsx` „Wkrótce" | DELETE | edytor założeń przypadku (override rejestru) |
| `ProtectionCoordinationPage.tsx` (urządzenia z szablonów) | REPLACE | TCC z modelu (`MV_DESIGN_PRO_PROTECTION_ARCHITECTURE.md`) |

---

## 10. Decyzje wymagające właściciela (zebrane także w `OWNER_REVIEW_PACKAGE.md`)

| ID | Decyzja | Rekomendacja |
|---|---|---|
| C-01 | Polityka przeliczeń po zmianie modelu (natychmiast / na żądanie / w tle z budżetem) | domyślnie „w tle z budżetem" po wdrożeniu grafu zależności; do tego czasu „na żądanie" z jedną akcją |
| C-02 | Definicja gotowego per cel (§2.2) — zatwierdzić listy analiz/kryteriów/dokumentów | przyjąć propozycję jako wersję 1; rozszerzać przez katalog, nie kod |
| C-03 | Jedna prawda zabezpieczeń: nastawy w modelu (IED, grupy), przypadek wybiera grupę/override | model (hybryda PowerFactory); zdjąć blokadę V11 |
| C-04 | Odbudowa wejścia nN: drzewo/kanwa nN z akcjami w istniejących przestrzeniach czy nowa przestrzeń „nN" | akcje w kanwie nN (istnieje `LvDomainView`) + inspektor; bez nowej przestrzeni |
| C-05 | Kryterium „optymalny" (§181): minimalny spełniający / koszt materiałów / straty / standaryzacja / niezawodność | domyślnie: minimalny spełniający z rezerwą + standaryzacja; koszt i straty jako kryteria opcjonalne z katalogiem kosztów |
| C-06 | Role jako profile ortogonalne do trybów | tak (§6) |
| C-07 | Warianty projektu: gałęzie rewizji (delta) na jednym modelu — zgodność z Single Model Rule | tak: jeden model, wiele gałęzi rewizji (FAZA B §20) |
| C-08 | Dane normowe IEC 60364-4-41 Tab. 41.1 i t-I gG: zakup normy vs tabele producentów | zakup normy + tabele producentów z weryfikacją; do czasu — „nierozstrzygalne" |
| C-09 | Minimalny pakiet dokumentacji wykonawczej i formaty (PDF/A, DXF, XLSX, CIM) | 14 typów §124 w wersji 1; PDF/A i DXF obowiązkowe, XLSX dla zestawień |
| C-10 | Rejestr założeń: poziom projektu z override per przypadek — czy przypadek może nadpisywać c/tk/T | tak, z jawnym oznaczeniem override w raporcie |
