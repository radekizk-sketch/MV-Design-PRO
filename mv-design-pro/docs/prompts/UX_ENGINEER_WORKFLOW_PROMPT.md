# Prompt: Przebudowa Workflow Inżyniera SN w MV-DESIGN-PRO

**Wersja:** 1.0 — 2026-05-08
**Cel:** Dokument startowy dla nowej sesji Claude Code, która przeprowadzi pełną przebudowę UI/UX inżynierskiego workflow bez kosmetyki i placeholderów.

---

## CEL GŁÓWNY

Przebuduj MV-DESIGN-PRO UI/UX z obecnego stanu chaotycznego na uporządkowany, operatorskiej jakości, workflow inżyniera sieci SN. Chodzi **nie** o kosmetykę — chodzi o:

1. **Kolejność klików** — każdy krok inżyniera ma naturalną następność; nie może być ślepych uliczek ani powrotu do kroku 1 bez ostrzeżenia.
2. **Panele i karty** — każda karta ma realne pola (nie placeholder), każde pole jest zapisywalne przez `executeDomainOperation` lub `patchSnapshot`; żaden przycisk „Zapisz" nie może być `notify-only`.
3. **SLD Canvas** — zawsze odzwierciedla aktualny stan ENM; żaden element nie może być narysowany bez `domain_ref`; zmiana w formularzu → animacja aktualizacji na SLD.
4. **E2E testy** jako brama akceptacji — żaden PR nie wchodzi jeśli testy martwych klików (dead click guard) są czerwone.
5. **Pełna walidacja** — readiness gates widoczne w UI, powiązane z kartami konfiguratora; brakujące dane = explicite badge, nigdy „domyślnie 0.00".

---

## ROLA, W KTÓREJ MASZ DZIAŁAĆ

Działaj jednocześnie jako:

- **Senior Frontend Architect** (React 18 / TypeScript 5 / Zustand / Vitest / Playwright) — odpowiedzialny za architekturę komponentów, data flow, type safety, test pyramid.
- **Senior UX Engineer** (specjalista systemów operatorskich klasy SCADA/ETAP/DIgSILENT) — odpowiedzialny za click order, information hierarchy, flow bez martwych punktów.
- **Inżynier Sieci SN / Projektant GPZ** — odpowiedzialny za poprawność inżynierską: nazwy pól, wzory IEC 60909, kolejność operacji, semantykę aparatów.
- **Właściciel jakości kodu** — pisze test zanim kod; odrzuca placeholder; egzekwuje DoD per karta.

**Zasada pracy:** Każda zmiana ma artefakt testowalny. Każde pole ma handler. Każdy handler ma test. Każdy test przechodzi przez CI guardy.

---

## ARCHITEKTURA SYSTEMU — SKRÓCONE PRZYPOMNIENIE

Przed implementacją przeczytaj (bez modyfikacji):
- `mv-design-pro/SYSTEM_SPEC.md` — mapa modułów
- `mv-design-pro/ARCHITECTURE.md` — granice warstw
- `mv-design-pro/backend/src/enm/` — ENM schema (Pydantic v2)
- `mv-design-pro/frontend/src/ui/topology/snapshotStore.ts` — `patchSnapshot`, `executeDomainOperation`, undo/redo, Inv 4
- `mv-design-pro/frontend/src/ui/workspace/surfaces/GpzConfiguratorSurface.tsx` — wzorcowy konfigurator (R42-R45)
- `mv-design-pro/frontend/src/ui/workspace/surfaces/GpzConfiguratorSimple.tsx` — wzorcowy Simple mode
- `mv-design-pro/frontend/src/ui/sld/v2/canvas/SldWorkspaceContainer.tsx` — wzorcowe modale z patchSnapshot

**Trzy absolutne reguły (naruszenie = reject):**
1. `NOT-A-SOLVER` — żadna fizyka w UI/formularzach poza estymatorem IEC 60909 wyraźnie oznaczonym jako „szybki estymator — pełne obliczenia w E-23".
2. `WHITE-BOX` — każda wartość wynikowa (Ik3, Ik1, ip, Ith) ma footnote ze wzorem.
3. `SINGLE-MODEL` — ENM jest jedynym źródłem danych; żadne shadow state, żadne lokalne kopie poza `patchSnapshot`.

---

## NIEZMIENNE ZASADY UX (13 zasad)

### Zasada 1 — Jedna główna ścieżka pracy

Główna ścieżka inżyniera ma być jawna i widoczna jako breadcrumb + progress bar:

```
1. Projekt (nazwa + standard normowy)
   └─ 2. GPZ (wizard: identyfikacja → strona 110 kV → trafa → sekcje SN → gotowość)
          └─ 3. Sieć — rysowanie ciągów + wstawianie KOMPLETNYCH stacji
                 (każda stacja = wizard: typ → pola+aparatura → TR → nN → DER → 
                  zabezpieczenia hint → powiązania → gotowość)
                        └─ 4. Zabezpieczenia (pełna koordynacja TCC, selektywność)
                               └─ 5. Obliczenia (E-23 SC, load flow)
                                      └─ 6. Wyniki + dobór aparatury (Proof Packs)
                                             └─ 7. Korekty (jeśli dobór nie pasuje)
                                                    └─ 8. Raport (PDF/DOCX)
```

Każdy krok musi mieć:
- `entry_condition`: co musi być spełnione żeby wejść
- `exit_condition`: co musi być zrobione żeby przejść dalej
- `blocking_badge`: co blokuje przejście (widoczny w UI, nie ukryty w konsoli)

**KLUCZOWA RÓŻNICA vs. typowe systemy:** Krok 3 NIE jest „dodaj stację, potem skonfiguruj pola, potem skonfiguruj aparaturę, potem dodaj DER". Krok 3 jest **JEDNYM przepływem** w którym wstawiana stacja od razu jest pełną stacją z aparaturą i DER. Inżynier projektujący nie cofa się do „skonfiguruj pole" jeśli ma cały czas w głowie kontekst tej stacji.

### Zasada 2 — Panel lewy = drzewo nawigacji, nie lista plików

Panel lewy (`LeftNavigationPanel`) zawiera **tylko**:
- Drzewo projektu (GPZ → Sekcje → Pola → Stacje → Linie)
- Readiness gate per węzeł (ikona statusu: ✅ / ⚠ / ❌ / ⬜)
- Klik na węzeł = otwarcie karty konfiguratora po prawej + podświetlenie na SLD

**Zakaz:** lista plików, eksplorator katalogów, niezwiązane przyciski.

### Zasada 3 — Panel prawy = kontekstowy konfigurator

Panel prawy (`RightConfiguratorPanel`) pokazuje **zawsze** kartę konfiguratora dla:
- aktualnie wybranego elementu w drzewie lewo, LUB
- aktualnie klikniętego elementu na SLD

Konfigurator musi:
- Ładować aktualne wartości z ENM snapshot przy montowaniu
- Każde pole `<input>` lub `<select>` musi mieć `onChange` → `patchSnapshot` (albo `executeDomainOperation` jeśli dotyczy backend-walidowanej właściwości)
- Przycisk „Zapisz" MUSI wywoływać `executeDomainOperation` z fallback `patchSnapshot` — NIGDY samo `toast.success()`
- Przycisk „Resetuj" MUSI przywracać wartości z ENM snapshot

### Zasada 4 — SLD canvas zawsze odzwierciedla ENM

Każdy element na canvas:
- Ma `data-domain-ref` (traceability do ENM)
- Jest renderowany z faktycznych danych ENM (nie ze stanu lokalnego)
- Po `patchSnapshot` — canvas odświeża się przez `useEffect(deps: [snapshotVersion])`

Zakaz:
- Elementów bez `domain_ref` (poza dekoracyjnymi overlay-ami jawnie oznaczonymi jako CAD)
- Hardcoded wartości w SVG symbolach
- Animacji które nie odzwierciedlają stanu elektrycznego

### Zasada 5 — Zero martwych klików

Każdy `<button>`, `<a>`, element klikalny SLD:
- Musi mieć handler który coś robi (nawet toast „w trakcie realizacji" jest lepszy niż cisza, ale toast MUSI być usunięty przed mergeiem)
- `dead_click_guard.py` musi być zielony dla każdego PR
- Testy: `fireEvent.click(button)` → sprawdź czy wywołano mock handlera LUB zmienił się stan

### Zasada 6 — Każdy „Zapisz" ma backend

Hierarchia zapisywania (w tej kolejności):
```
1. executeDomainOperation(op_type, payload) → backend pipeline + Inv 4 invalidate
2. jeśli backend niedostępny: patchSnapshot(updater, affectedRefs) → Zustand + Inv 4
3. NIGDY: toast.success('Zapisano') bez mutacji stanu
```

Fallback 2 jest dozwolony dla pól niebędących danymi domenowymi (np. UI preferences, preferencje wyświetlania).

### Zasada 7 — Polskie etykiety wszędzie

- Wszystkie teksty UI po polsku (terminologia elektroenergetyczna polska)
- Zakaz: codenames P7/P11/P14/P17, angielskie skróty jako etykiety pól, kody systemowe widoczne w UI
- `forbidden_ui_terms_guard.py` i `no_codenames_guard.py` muszą być zielone
- Wyjątek: symbole techniczne IEC (CB, DS, CT, VT, SA) mogą być angielskie bo są normowe

### Zasada 8 — Karty są realne, nie placeholder

Każda karta konfiguratora MUSI mieć:
- Rzeczywiste pola `<input type="number|text|select">` (nie `<p>TODO</p>`)
- `data-testid` dla każdego pola (wymagany przez testy)
- `onChange` handler (nie `readOnly` bez powodu)
- Wartości inicjalne z ENM snapshot (nie `defaultValue=""`)

Jeśli karta ma sekcję której nie możesz teraz zaimplementować — POMIŃ sekcję całkowicie, nie wstawiaj placeholder-a.

### Zasada 9 — Readiness gates widoczne w UI

Każdy konfigurator musi mieć sekcję / badge „Gotowość":
- `complete`: wszystkie wymagane pola wypełnione poprawnie
- `partial`: część pól wypełniona, obliczenia możliwe z zastrzeżeniami
- `blocker`: brakuje kluczowych danych, obliczenia niemożliwe
- `not_started`: karta nigdy nie otwierana

Gotowość musi być zsynchronizowana z readiness gate w panelu lewym (same dane, inny widok).

### Zasada 10 — Test pyramid jest bramą akceptacji

DoD per karta (Definition of Done):
1. Testy jednostkowe: każde pole, każdy handler, każdy obliczeniowy wzór
2. Testy integracyjne: patchSnapshot → canvas re-render → SLD update
3. Testy E2E (Playwright): pełny flow karta → SLD → walidacja → wynik
4. Guard: `dead_click_guard.py`, `forbidden_ui_terms_guard.py`, `no_codenames_guard.py`

Żaden PR nie wchodzi bez zielonych testów na WSZYSTKICH poziomach.

### Zasada 11 — Tryb Simple/Advanced dla kluczowych konfiguratorów

Wzorzec: `GpzConfiguratorSimple` / `GpzConfiguratorSurface` (R42-R45) jest **kanonem**.

Dla każdego konfiguratora klasy „duży":
- Simple: 80% przypadków, accordion, live obliczenia, Save/Reset
- Advanced: pełna kontrola inżynierska, 7+ kart, presets, advisor, Z0/Z1, Ip/Ith
- Domyślny: Simple — użytkownik klika raz żeby przejść do Advanced
- Mode switcher: jeden klik, bez utraty danych, breadcrumb pokazuje tryb

### Zasada 12 — Hash triad nienaruszalny

Trzy hashe muszą być zawsze rozdzielone:
- `topology_hash`: zmienia się tylko gdy zmienia się ENM (pola, stacje, linie, powiązania)
- `layout_hash`: zmienia się tylko gdy zmienia się geometria (pozycje, trasy, bend points)
- `view_hash`: zmienia się tylko gdy zmienia się widok (LOD, anonimizacja, warstwy)

Obliczenia wynikowe zależą od `topology_hash`. Geometria nie może invalidować obliczeń.

### Zasada 13 — Wstawienie obiektu = jego pełna konfiguracja w jednym przepływie

**Inżynier projektujący ma kontekst obiektu w głowie tylko podczas jego wstawiania.** Wymuszanie powrotu „do edycji" po to żeby skonfigurować pola, aparaturę, transformatory, DER — to anti-pattern biurokratyczny, nie inżynierski.

**Reguła:**
- Każdy obiekt domenowy (GPZ, stacja, ciąg kablowy, pole SN, transformator, DER) ma swój **wizard wieloetapowy w jednym oknie** otwierany przy wstawianiu.
- Wizard prowadzi przez wszystkie wymagane do kompletności pola w jednym przepływie.
- Po „Zapisz i utwórz" obiekt jest **kompletny ENM-owo** (lub blocker badge wyraźnie sygnalizuje czego brakuje).
- **Edycja** istniejącego obiektu otwiera **ten sam wizard** z aktualnymi wartościami i opcją skoku do dowolnego stepu — jest to akcja kontekstowa (klik prawy → Edytuj / dwuklik), NIE odrębny „krok" workflow.

**Konsekwencja dla architektury:**
- E-13 StationConfigurator NIE jest „kartą stacji" do której wracasz — jest **Wizardem Stacji** używanym przy wstawianiu i przy edycji.
- E-11 BayConfigurator NIE jest „krokiem 5 workflow" — jest **stepem w Wizardzie Stacji** (sekcja „Pola SN") oraz akcją kontekstową „Edytuj pole" wywoływaną z SLD.
- E-12 LineSegmentConfigurator NIE jest osobnym krokiem — jest inline-em rysowania ciągu (typ kabla + długość + ułożenie w jednym tooltipie podczas drop).

**Zakaz:**
- „Wstaw pustą stację, potem otwórz konfigurator, potem dodaj pola, potem dodaj aparaturę" — to chaos.
- Pasek statusu typu „Stacja niekompletna — kliknij Edytuj żeby uzupełnić" jako default flow — to zła UX.
- Modal który zamyka się i każe wracać do drugiego modala — to chaos.

**Akcept:**
- Jeden wizard wieloetapowy z stepperem na górze, zawartością środka, footerem „Anuluj / Zapisz i utwórz / Zapisz i utwórz kolejną".
- Stepper pokazuje całą sekwencję od razu — inżynier widzi co go czeka.
- Możliwość pominięcia opcjonalnych stepów (DER, jeśli stacja nie jest źródłowa) bez zamykania wizarda.

---

## WORKFLOW INŻYNIERA SN — 8 kroków z kryteriami wyjścia

> **Filozofia:** Każdy krok kończy się kompletnym, spójnym ENM-em. Nie ma „wstawiłem ale nie skonfigurowałem" — wstawienie obiektu = jego pełna konfiguracja w jednym przepływie (Zasada 13). Powrót do edycji jest akcją kontekstową, nie wymuszonym krokiem workflow.

---

### Krok 1: Projekt — identyfikacja i kontekst
**Entry:** Brak  
**Co robi inżynier:**
- Tworzy nowy projekt lub otwiera istniejący
- Wypełnia: nazwa projektu, inwestor, numer projektu, data
- Wybiera standard normowy: IEC 60909, c-max/min, częstotliwość

**Exit condition:** Projekt ma nazwę + standard normowy  
**Blocking badge:** ❌ Brak nazwy projektu  
**Karta:** E-01 (ProjectSetupSurface)

---

### Krok 2: GPZ — wizard kompletnej konfiguracji
**Entry:** Projekt istnieje z nazwą i standardem  
**Co robi inżynier (jeden wizard wieloetapowy w jednym oknie):**
1. Identyfikacja: nazwa, operator, napięcie, tryb uziemienia
2. Strona 110 kV: S''k, R/X, opcjonalnie Z0/Z1, R0/X0
3. Transformatory HV/SN z katalogu (typ, moc, napięcia, układ)
4. Sekcje SN: liczba sekcji, sprzęgło, układ szyn
5. Bilans pól SN: liczba pól liniowych/TR/pomiarowych, presety
6. Gotowość: checklist, blocker badge dla brakujących danych

**Exit condition (wizard nie zamknie się dopóki nie spełnione):**  
S''k > 0, R/X > 0, co najmniej 1 transformator z katalogu, co najmniej 1 sekcja SN

**Blocking badge:** ❌ Brak mocy zwarciowej GPZ  
**Wzorzec:** R45 GpzConfiguratorSurface — Simple/Advanced mode (juz zaimplementowany 10.0/10)

---

### Krok 3: Sieć — rysowanie ciągów + wstawianie KOMPLETNYCH stacji
**Entry:** GPZ skonfigurowany (Krok 2 OK)  
**Co robi inżynier:**

**3a. Rysowanie ciągu kablowego (inline, bez modala):**
- Klik „Dodaj ciąg" → klik źródło (port wyjścia GPZ lub stacja) → klik kierunek
- Inline tooltip podczas dropu: typ kabla z katalogu, długość [m], typ ułożenia, temperatura
- Po confirm → ciąg istnieje w ENM z R/X/Imax

**3b. Wstawianie stacji = WIZARD STACJI (jeden modal, multi-step, bez wyjścia w środku):**

```
┌─ Wizard: Wstaw stację ──────────────────────────────────────────────┐
│ [1.Identyfikacja] [2.Pola+aparatura] [3.TR] [4.nN] [5.DER] [6.Zabezp.] │
│ [7.Powiązania] [8.Gotowość]                                          │
├─────────────────────────────────────────────────────────────────────┤
│  AKTYWNY STEP — pełna treść konfiguracyjna                           │
├─────────────────────────────────────────────────────────────────────┤
│ [Anuluj]                          [← Wstecz] [Dalej →] [Zapisz i utwórz]│
└─────────────────────────────────────────────────────────────────────┘
```

**Steps wizarda:**

1. **Identyfikacja** — nazwa, numer ewidencyjny, typ stacji (RMU/RM6/złącze/wolnostojąca), producent z katalogu, lokalizacja
2. **Pola SN + aparatura per pole** (w jednej karcie):
   - Lista pól z rolami (LINE/TR/COUPLER/MEASUREMENT/OZE)
   - Per każde pole: CB (typ, Icu), DS (typ), CT (klasa, ratio), VT jeśli dotyczy, SA (odgromnik), uziemnik, bezpieczniki dla TR
   - Walidacja inline: pole liniowe musi mieć CT — badge ⚠ jeśli brak
3. **Transformator SN/nN** (jeśli stacja typu transformatorowego):
   - Wybór z katalogu (Sn, Un HV/LV, uk%, vector)
   - Tap, regulacja
   - Opcjonalny — pomijany wizard jeśli typ stacji = złącze
4. **Strona nN** (jeśli stacja ma TR):
   - Un nN (230/400 V), układ sieci nN, wyłącznik główny nN
   - Opcjonalny
5. **DER (PV/BESS/FW)** (jeśli stacja jest źródłowa):
   - Typ DER, moc, connection_variant (LV_BEHIND_STATION_TR / DEDICATED_MV / SOURCE_STATION)
   - PCC ref (wymagany — bez PCC blocker)
   - Falownik/PCS z katalogu, blokowy trafo dla DEDICATED_MV
   - **Pomijalny tylko jeśli stacja nie ma być źródłowa** — w innym wypadku blocker
6. **Zabezpieczenia (hint level)**:
   - Per pole liniowe/TR: typ zabezpieczenia (nadprądowe/ziemnozwarciowe/różnicowe), urządzenie z katalogu
   - **Podstawowe nastawy** (Ir nominalne, kategoria koordynacji)
   - Pełna koordynacja TCC w Kroku 4
7. **Powiązania portów**:
   - sn_input ← do którego ciągu / portu wyjścia źródła SN się przypina
   - sn_output → który ciąg odchodzi z tej stacji
   - Opcjonalnie: NOP (jeśli stacja jest punktem otwarcia w pierścieniu)
8. **Gotowość**:
   - Checklist 12 punktów (każdy ✅/⚠/❌)
   - Blocker badges widoczne (np. „Pole L1 bez CT", „DER bez PCC")
   - Przycisk „Zapisz i utwórz" aktywny tylko jeśli brak ❌ (⚠ akceptowane)

**Exit condition kroku 3 (z wizarda):**  
Stacja zapisana ENM-owo z kompletną aparaturą, transformatorem (jeśli typu transformatorowego), DER (jeśli źródłowa), zabezpieczeniami (hint), powiązaniami portów.

**Exit condition kroku 3 (workflow):**  
Co najmniej 1 ciąg kablowy od GPZ + co najmniej 1 stacja KOMPLETNA (nie wireframe).

**Blocking badge:** ⚠ Sieć niepołączona (wyspy) | ❌ Stacja kompletna ale niepowiązana

**Akcja kontekstowa (zawsze dostępna):**  
- Klik prawy na stację SLD → „Edytuj stację" → otwiera ten sam wizard z aktualnymi wartościami i opcją skoku do dowolnego stepu
- Dwuklik na stację SLD → otwiera wizard na stepie 1 (Identyfikacja)
- Klik prawy na pole SN w mini-RMU → „Edytuj pole" → otwiera wizard na stepie 2 z preselected polem

**Karty (technicznie):**
- E-13 StationWizardSurface (multi-step wizard)
- E-12 LineSegmentInline (tooltip podczas dropu ciągu)
- E-11 BayEditorPanel (subkomponent wewnątrz Step 2 oraz akcja kontekstowa)

---

### Krok 4: Zabezpieczenia — pełna koordynacja TCC
**Entry:** Sieć + stacje z hint-em zabezpieczeń (Krok 3 OK)  
**Co robi inżynier:**
- Otwiera widok krzywych TCC (Time-Current Characteristics)
- Per ciąg liniowy: weryfikuje selektywność (główne vs. lokalne zabezpieczenia)
- Konfiguruje precyzyjne nastawy: Ir, Isd, t1, t2, k (IEC 60255)
- Sprawdza krzywe na wykresie I-t z naniesionymi Ik3 z obliczeń

**Exit condition:** Wszystkie ciągi mają zabezpieczenie selektywne (brak overlap krzywych)  
**Blocking badge:** ⚠ Brak selektywności między pole_main i pole_lokalne  
**Karta:** E-31 (ProtectionCoordinationSurface) — pełen edytor TCC

> **Uwaga:** Hint zabezpieczenia (typ relay, Ir nominalne) został już ustawiony w wizardzie stacji w Kroku 3. Tutaj jest TYLKO pełna koordynacja krzywych — nie definiowanie zabezpieczenia od zera.

---

### Krok 5: Obliczenia — E-23 IEC 60909 + load flow
**Entry:** Topologia + aparatura + zabezpieczenia OK  
**Co robi inżynier:**
- Uruchamia obliczenia zwarciowe IEC 60909 (E-23)
- Uruchamia przepływ mocy (Newton-Raphson)
- Czeka na zakończenie (async, progress bar)

**Exit condition:** Obliczenia zakończone bez SOLVER_ERROR  
**Blocking badge:** ❌ Obliczenia nieaktualne — zmieniono topologię po ostatnim uruchomieniu  
**Karta:** E-23 (ShortCircuitSurface) + E-24 (LoadFlowSurface)

---

### Krok 6: Wyniki + dobór aparatury — weryfikacja katalogowa
**Entry:** Obliczenia wykonane (Krok 5 OK)  
**Co robi inżynier:**
- Przegląda tabelę: szyna | Un | Ik3 | Ik1 | ip | Ith
- Porównuje z katalogowymi zdolnościami CB/DS dla każdego pola (Proof Pack per aparat)
- Sprawdza profil napięć (czy U > 0.95 Un w ostatniej stacji?)
- Identyfikuje aparaty przekroczone (Icu < Ik3 → blocker)

**Exit condition:** Wszystkie aparaty w zakresie katalogowym ALBO inżynier akceptuje korekty (Krok 7)  
**Blocking badge:** ❌ CB przekroczony Ik'' na szynach GPZ  
**Karta:** E-04 (ResultsBrowserSurface) + E-33 (EquipmentProofSurface)

---

### Krok 7: Korekty (warunkowy — pomijany jeśli Krok 6 zielony)
**Entry:** Krok 6 wykazał przekroczenie  
**Co robi inżynier:**
- Klik prawy na problematyczny aparat → „Edytuj pole" → wizard stacji otwiera się na stepie 2 z preselected polem
- Wymienia CB/DS/CT na większy z katalogu
- Zapisuje → patchSnapshot invaliduje wyniki Kroku 5
- Wraca do Kroku 5 i Kroku 6 (re-run)

**Exit condition:** Pętla Krok 5 ↔ Krok 7 aż wszystkie aparaty pasują  
**Karta:** E-13 wizard (akcja kontekstowa)

> **Uwaga:** Krok 7 jest „pętlą korekt", nie sztywną fazą. Inżynier wraca do edycji **konkretnego aparatu** (akcja kontekstowa z wyniku), nie do „karty 4 stacje" jako workflow step.

---

### Krok 8: Raport — generacja dokumentu
**Entry:** Dobór aparatury zatwierdzony (Krok 6 zielony)  
**Co robi inżynier:**
- Wybiera zakres raportu (obliczenia SC, load flow, protection, dobór CB)
- Generuje PDF/DOCX z Proof Packs
- Zapisuje artefakty do archiwum projektu

**Exit condition:** Raport wygenerowany, SHA-256 fingerprint zarejestrowany  
**Karta:** E-41 (ReportGeneratorSurface)

---

## ARCHITEKTURA UI — REGIONY I ODPOWIEDZIALNOŚCI

```
┌──────────────────────────────────────────────────────────────────┐
│  TOPBAR: Nazwa projektu | Krok aktualny (1-10) | Tryb | Akcje    │
├────────────┬────────────────────────────────┬────────────────────┤
│  LEWY      │                                │  PRAWY             │
│  PANEL     │       SLD CANVAS               │  PANEL             │
│  (240px)   │       (flex-grow)              │  (360px)           │
│            │                                │                    │
│  Drzewo    │  NetworkTerrainRenderer        │  Konfigurator      │
│  projektu  │  GpzCanonicalRenderer          │  per wybrany       │
│  + status  │  (LOD-aware, SCADA grade)      │  element           │
│  per węzeł │                                │  (karty E-03/11/   │
│            │  KLIK → otwiera                │   13/23/31/...)    │
│  Readiness │  konfigurator po prawej        │                    │
│  badge     │  + podświetla element          │  Save/Reset        │
│  per kroku │                                │  footer zawsze     │
│            │  HOVER → tooltip z             │  widoczny          │
│            │  domain_ref + readiness        │                    │
└────────────┴────────────────────────────────┴────────────────────┘
│  STATUSBAR: Aktywny krok | Oczekujące obliczenia | Hash version   │
└──────────────────────────────────────────────────────────────────┘
```

### Panel lewy — LeftNavigationPanel

```tsx
interface LeftNavNode {
  entityRef: string;           // ENM ref
  label: string;               // polska etykieta
  entityType: 'project' | 'gpz' | 'section' | 'bay' | 'station' | 'line';
  readinessLevel: 'complete' | 'partial' | 'blocker' | 'not_started';
  children?: LeftNavNode[];
}
```

Klik na węzeł:
1. Emituje `setActiveEntity(entityRef)` do store
2. Otwiera odpowiedni konfigurator w prawym panelu
3. Podświetla element na SLD (highlight przez `view_hash` zmianę)

### SLD Canvas — SldWorkspaceContainer

Odpowiada za:
- Renderowanie ENM → SVG przez `buildNetworkTerrain` + adaptery
- Obsługa kliknięć: deleguje do `setActiveEntity` + otwiera modal
- Wyświetlanie overlay-ów: napięcia, przepływy, straty, zwarcia
- **NIGDY** nie mutuje ENM bezpośrednio — tylko przez store

### Panel prawy — RightConfiguratorPanel

```tsx
interface RightPanelProps {
  activeEntityRef: string | null;
  activeEntityType: EntityType | null;
}
```

Router per `entityType`:
- `gpz` → `GpzConfiguratorSurface` (E-03)
- `bay` → `BayConfiguratorSurface` (E-11)
- `station` → `StationConfiguratorSurface` (E-13)
- `line_segment` → `LineSegmentConfiguratorSurface` (E-12)
- `transformer` → `TransformerConfiguratorSurface` (E-14)
- `protection_relay` → `ProtectionConfiguratorSurface` (E-31)
- `null` → instrukcja „Wybierz element z drzewa lub kliknij na SLD"

---

## SPECYFIKACJA KART KONFIGURATORÓW

### E-03 — GpzConfiguratorSurface (WZORZEC)

**Status implementacji:** R45 — 10.0/10, wzorcowy  
**Plik:** `src/ui/workspace/surfaces/GpzConfiguratorSurface.tsx`

**Simple mode (GpzConfiguratorSimple):**
- 6 sekcji accordion: Identyfikacja | Parametry zwarciowe | Normowe | Sekcje szyn | Podsumowanie obliczeniowe | Gotowość
- Live IEC 60909 estymator: Ik3, Ik1, ip (κ·√2·Ik3), Ith (Ik3·√(m+n))
- Save → `executeDomainOperation` + fallback `patchSnapshot`

**Advanced mode (7 kart):**
- Identyfikacja | Strona 110 kV (Z0/Z1 + uziemienie neutralne) | Transformator z katalogu | Sekcje SN | Bilans pól SN | Podsumowanie obliczeniowe | Wyniki obliczeń live
- Quick Presety GPZ (6 kategorii technicznych)
- Engineer Assistant Panel (gpzAdvisor: 14 zasad rankingowych)

**Wzorcowy test:** `Etap3Configurators.test.tsx` — 11 testów, wszystkie zielone

---

### E-13 — Station Wizard (KLUCZOWY — wzorzec dla Zasady 13)

**Status implementacji:** Istnieje 10-kartowy `StationConfiguratorSurface` — WYMAGA REFAKTORU do wizarda wieloetapowego  
**Plik:** `src/ui/workspace/surfaces/StationConfiguratorSurface.tsx` → przekształcić w `StationWizardSurface.tsx`

**Architektura: Multi-step wizard w jednym oknie**

```tsx
type StationWizardStep =
  | 'identification'      // Step 1
  | 'bays_and_apparatus'  // Step 2 (zawiera E-11 BayEditor jako subkomponent)
  | 'transformer'         // Step 3 (opcjonalny)
  | 'lv_side'             // Step 4 (opcjonalny — tylko gdy stacja ma TR)
  | 'der'                 // Step 5 (opcjonalny — tylko gdy stacja jest źródłowa)
  | 'protection_hint'     // Step 6
  | 'connections'         // Step 7
  | 'readiness';          // Step 8

interface StationWizardProps {
  mode: 'create' | 'edit';
  initialStep?: StationWizardStep;     // dla edycji — skok do konkretnego stepu
  preselectedBayRef?: string;          // dla edycji pola z SLD
  initialEnmRef?: string;              // dla edycji — ładuje aktualne wartości
  onComplete: (stationRef: string) => void;
  onCancel: () => void;
}
```

**Layout wizarda:**
- Header: stepper z 8 ikonami + status każdego stepu (✅/⚠/❌/⬜)
- Body: aktywny step content
- Footer: [Anuluj] [← Wstecz] [Dalej →] [Zapisz i utwórz] | dla edycji: [Anuluj] [Zapisz zmiany]

**Każdy step ma:**
- `data-testid="station-wizard-step-{name}"`
- Walidację inline (badge ⚠/❌ widoczny w stepperze)
- Możliwość pominięcia stepów opcjonalnych (TR/nN/DER) — przycisk „Pomiń" w footer

**Step 2 — Pola i aparatura (najbogatszy step):**
```
┌─────────────────────────────────────────────────────────────┐
│ Pola SN tej stacji:                              [+ Dodaj pole] │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ Pole 1: L1 (LINE_FULL)                  [Edytuj] [Usuń] │ │
│  │  ├─ CB: ABB VD4 630-16 (Icu=16kA)                       │ │
│  │  ├─ DS: ABB DSG/4 (630A)                                │ │
│  │  ├─ CT: 200/5 kl. 0.5S                                  │ │
│  │  ├─ SA: ABB MWK 24                                      │ │
│  │  └─ Uziemnik: tak (boczny)                              │ │
│  ├─────────────────────────────────────────────────────────┤ │
│  │ Pole 2: TR1 (TR_FULL)                   [Edytuj] [Usuń] │ │
│  │  └─ ...                                                 │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│ Klik [Edytuj] otwiera inline panel BayEditor (E-11)          │
│ — NIE odrębny modal, NIE zamknięcie wizarda                  │
└─────────────────────────────────────────────────────────────┘
```

**Step 5 — DER (warunkowy):**
- Toggle: „Czy stacja jest źródłowa? (PV/BESS/FW)"
- Jeśli NIE → przycisk „Pomiń" → step pominięty, wizard idzie dalej
- Jeśli TAK → wymagane pola: typ DER, moc, connection_variant, **PCC ref (blocker bez PCC)**, falownik z katalogu

**Step 8 — Gotowość:**
Checklist 12 punktów (zsynchronizowany z gpzAdvisor analogicznym `stationAdvisor`):
- [✅] Identyfikacja kompletna
- [✅] Co najmniej 1 pole IN
- [✅] Każde pole liniowe ma CT
- [✅] Pole TR ma CT + bezpieczniki (jeśli switch-fuse)
- [⚠] Pole TR1 — brak SA (sugestia inżynierska)
- [✅] Transformator z katalogu
- [✅] Napięcie nN zgodne z katalogiem trafo
- [⬜] DER — brak (stacja nie źródłowa, OK)
- [✅] Zabezpieczenia hint per pole
- [✅] sn_input powiązany z ciągiem GPZ→ST1
- [✅] sn_output powiązany z ciągiem ST1→ST2
- [✅] Brak blokerów

Przycisk „Zapisz i utwórz" aktywny tylko gdy brak ❌ (⚠ akceptowane jako sugestie).

**Save flow:**
```ts
// Po kliknięciu „Zapisz i utwórz" — JEDNA atomowa operacja:
await executeDomainOperation({
  op_type: 'create-station-complete',
  payload: {
    station: { name, type, producer, location, ... },
    bays: [
      { role: 'LINE_FULL', cb_ref, ds_ref, ct_ref, ct_ratio, sa_ref, ... },
      { role: 'TR_FULL', cb_ref, fuse_ref, ct_ref, ... },
    ],
    transformer: { catalog_ref, tap, vector } | null,
    lv_side: { un_kv, scheme, main_breaker } | null,
    der: { kind, sn_kva, connection_variant, pcc_ref, inverter_ref } | null,
    protection_hints: [{ bay_ref, relay_type, ir_a, category }],
    connections: { sn_input_segment_ref, sn_output_segment_ref, nop_state },
  },
});
// Backend tworzy stację + pola + aparaturę + DER + zabezpieczenia w JEDNYM eventcie ENM
// Inv 4 invalidate jeden raz, nie 8 razy
```

**Edycja istniejącej stacji:**
- Akcja kontekstowa: klik prawy na stację → „Edytuj stację" → wizard otwiera się z `mode='edit'`, `initialEnmRef`, `initialStep='identification'`
- Edycja konkretnego pola: klik prawy na pole na SLD → „Edytuj pole" → wizard otwiera się z `mode='edit'`, `initialStep='bays_and_apparatus'`, `preselectedBayRef`
- Save w trybie edit: częściowy patch przez `patchSnapshot` (tylko zmienione fragmenty)

---

### E-11 — BayEditor (subkomponent, NIE osobna karta workflow)

**Status:** Istnieje `BayConfiguratorSurface` — WYMAGA REFAKTORU na komponent wbudowany  
**Nowa rola:** Komponent inline używany w Step 2 wizarda stacji ORAZ jako akcja kontekstowa „Edytuj pole" z SLD.

**Plik (nowy):** `src/ui/workspace/components/BayEditor.tsx`  
**Plik (deprecate):** `src/ui/workspace/surfaces/BayConfiguratorSurface.tsx` → cienki wrapper do `BayEditor` dla zgodności wstecznej, do usunięcia w P2

**Props:**
```tsx
interface BayEditorProps {
  bayRef: string | null;          // null = nowe pole
  parentStationRef: string;
  initialValues?: Partial<Bay>;
  onSave: (bay: Bay) => void;     // emituje do wizarda lub do executeDomainOperation
  onCancel: () => void;
  embedded: boolean;              // true = w wizardzie, false = standalone modal
}
```

**Sekcje (compact, w jednej karcie scrollowalnej, NIE 9 zakładek):**
1. Rola pola (LINE/TR/COUPLER/MEASUREMENT/OZE) — radio
2. Wyłącznik (CB): typ z katalogu, Icu, Icd, numer fabryczny
3. Rozłącznik szynowy (DS): typ z katalogu
4. Przekładniki prądowe (CT): klasa, przekładnia, Sn (wymagane dla LINE/TR)
5. Przekładnik napięciowy (VT): klasa, przekładnia (tylko dla MEASUREMENT)
6. Odgromnik (SA): typ z katalogu (sugerowane)
7. Uziemnik: typ + lokalizacja (zawsze boczny od toru głównego)
8. Bezpieczniki (tylko dla TR_FULL switch-fuse): typ, In
9. Walidacja inline: ⚠/❌ badge per sekcja

**Save:**
- W trybie embedded (`embedded=true`): emit `onSave(bayDraft)` do wizarda — wizard zbiera wszystkie pola do `executeDomainOperation` przy „Zapisz i utwórz" stacji
- W trybie standalone (`embedded=false`, edycja z SLD): bezpośrednio `executeDomainOperation('configure-bay', ...)` z fallback `patchSnapshot`

**Wymagane testy:**
- Render bez bay_ref → puste pola, walidacja wymaga roli
- Render z bay_ref → ładuje z ENM
- Zmiana roli LINE → TR → walidacja wymaga bezpieczników
- Pole liniowe bez CT → badge ❌
- Save embedded → emit onSave z poprawnym kształtem
- Save standalone → executeDomainOperation called

---

### E-12 — LineSegmentInline (inline tooltip, NIE pełna karta)

**Status implementacji:** BRAK — do zaimplementowania jako inline tooltip podczas dropu ciągu  
**Plik:** `src/ui/sld/v2/canvas/LineSegmentInlineEditor.tsx`

**Wymagane pola (compact tooltip):**
- Typ kabla z katalogu (3×120 XUHAKXS, 3×240 XUHAKXS, etc.) — autocomplete
- Długość odcinka [m]
- Typ ułożenia (ziemia, kanał, powietrze) — radio
- Temperatura obliczeniowa [°C] — slider z domyślną 30°C

**Live preview (inline poniżej formularza):**
- R = r₀ · L [Ω]
- X = x₀ · L [Ω]
- Imax = Im · Kt [A]

**Save:**
- Przycisk [Confirm] → `executeDomainOperation('create-line-segment', payload)` z R/X/Imax obliczonymi
- Tooltip zamyka się, ciąg pojawia się na SLD jako kompletny

**Edycja:** Klik prawy na ciąg → „Edytuj ciąg" → ten sam tooltip otwiera się z aktualnymi wartościami.

---

### E-12 — LineSegmentConfiguratorSurface (nowy — wymagany)

**Status implementacji:** BRAK — do zaimplementowania  
**Opis:** Konfigurator odcinka kablowego między GPZ/stacją a kolejną stacją

**Wymagane pola:**
- Długość odcinka [m] (z mapy lub ręczna)
- Typ kabla z katalogu (3×120 XUHAKXS, 3×240 XUHAKXS, etc.)
- Typ ułożenia (ziemia, kanał, powietrze)
- Temperatura obliczeniowa [°C]
- Tryb pracy (normalny, zwarcie)

**Obliczenia live (estymator):**
- R' = r₀ · L [Ω] (na podstawie katalogu)
- X' = x₀ · L [Ω]
- Imax = Im · Kt [A] (z katalogu + korekcja temperatury)

**Wymagane testy:**
- Zmiana długości → przeliczenie R/X/Imax w czasie rzeczywistym
- Klik Zapisz → `patchSnapshot` z polami `r_ohm`, `x_ohm`, `imax_a`
- Brak kabla z katalogu → badge ⚠

---

### E-23 — ShortCircuitSurface

**Status implementacji:** Moduł obliczeń istnieje w backend, UI wymaga przeglądu  
**Opis:** Uruchamia obliczenia IEC 60909, pokazuje wyniki per szyna

**Wymagane elementy UI:**
- Przycisk „Uruchom obliczenia IEC 60909" → POST /api/analysis/short-circuit
- Progress bar podczas obliczeń (async)
- Tabela wyników: szyna | Un [kV] | Ik3 [kA] | Ik1 [kA] | ip [kA] | Ith [kA/1s]
- Kolorowanie wierszy: ❌ czerwony gdy Ik'' > CB.Icu z katalogu
- Przycisk „Pokaż Proof Pack" per szyna → otwiera E-33

**Kluczowy test:** Uruchomienie → polling (lub SSE) → wyświetlenie tabeli → klik Proof Pack → `data-testid="proof-pack-link-{busRef}"` widoczny

---

### E-33 — EquipmentProofSurface

**Status implementacji:** ProofPack istnieje w backend, UI do przeglądu  
**Opis:** WHITE BOX weryfikacja doboru aparatury

**Wymagane sekcje per aparatura:**
```
Wyłącznik CB-SN-001 (ABB VD4 630-16):
  Icu = 16.0 kA  vs  Ik3 = 12.4 kA  → ✅ OK (x1.29 margines)
  Icp = 40.0 kA  vs  ip3 = 31.8 kA  → ✅ OK (x1.26 margines)
  
  Wzór: Icu_required ≥ 1.1 · Ik3  [IEC 62271-100: §4.101]
  Podstawienie: 16.0 kA ≥ 1.1 · 12.4 kA = 13.6 kA  ✓
```

---

## SPECYFIKACJA MODALI

Każdy modal w SldWorkspaceContainer musi:
1. Otwierać się przez `openModal(modalType, entityRef)` ze store
2. Ładować dane z ENM snapshot przez `useSelector(selectEntityByRef(entityRef))`
3. Zapisywać przez `executeDomainOperation` → fallback `patchSnapshot`
4. Zamykać się przez `closeModal()` ze store
5. Mieć test: `render modal → fill fields → click save → expect executeDomainOperation called`

### Kanon modali / wizardów (wymagane):

**Modale stanu (fast-path, jedno-polowe — toggle stanu):**

| Modal | Trigger | OP type | Pola |
|---|---|---|---|
| SwitchStateModal | Klik na CB/DS/ES na SLD | `set-switch-state` | state: open/closed/locked |
| NopStateModal | Klik na NOP | `set-nop-state` | open/closed |

**Wizardy konfiguracyjne (multi-step, kompletny obiekt):**

| Wizard | Trigger | OP type | Wynik |
|---|---|---|---|
| GpzWizard (E-03 R45) | Krok 2 workflow / „Edytuj GPZ" | `create-gpz-complete` / `update-gpz` | Kompletny GPZ z trafami, sekcjami, polami |
| StationWizard (E-13 nowy) | Krok 3 workflow / „Edytuj stację" / dwuklik na SLD | `create-station-complete` / `update-station-partial` | Kompletna stacja z polami, aparaturą, TR, nN, DER, zabezpieczeniami |

**Inline editory (tooltip, prosty obiekt):**

| Editor | Trigger | OP type | Pola |
|---|---|---|---|
| LineSegmentInline (E-12) | Drop ciągu na SLD / „Edytuj ciąg" | `create-line-segment` / `configure-cable` | catalog_ref, length, installation |

**Subkomponenty (NIE osobne modale — wbudowane w wizard / akcja kontekstowa):**

| Komponent | Kontekst użycia |
|---|---|
| BayEditor (E-11) | Wbudowany w Step 2 StationWizard ORAZ akcja „Edytuj pole" z SLD |
| TransformerEditor | Wbudowany w Step 3 StationWizard ORAZ akcja „Edytuj TR" z SLD |
| DerEditor | Wbudowany w Step 5 StationWizard ORAZ akcja „Edytuj DER" z SLD |
| ProtectionHintEditor | Wbudowany w Step 6 StationWizard (pełna koordynacja w E-31) |

**Zasada:** Tylko obiekty atomowe (stan switcha, NOP) mają osobne modale. Obiekty złożone (GPZ, stacja) używają wizarda. Obiekty proste z paroma polami (ciąg) używają inline tooltip.

---

## ACCEPTANCE INVARIANTS (nienaruszalne)

1. **ENM jest jedyną prawdą elektryczną.** Żaden komponent nie może trzymać kopii danych ENM poza `snapshotStore`.
2. **Każdy element SLD ma `data-domain-ref`.** Brak = błąd CI.
3. **Każdy przycisk „Zapisz" wywołuje mutację stanu.** `toast-only` = dead click = błąd CI.
4. **Obliczenia zależą od `topology_hash`, nie od geometrii.** Zmiana pozycji elementu na SLD NIE invaliduje wyników.
5. **Simple mode jest dostępny zawsze bez Advanced.** Advanced jest opcją, nie wymaganiem.
6. **Readiness badges odzwierciedlają rzeczywisty stan ENM.** Nie mogą być hardcoded ani optymistyczne.
7. **Live estymatory IEC 60909 są oznaczone jako estymatory.** Footnote z wzorami i adnotacją „pełne obliczenia w E-23".
8. **Każde pole z wartością jest edytowalne** (chyba że jawnie `readOnly` z powodu blokady stanu aparatu).
9. **Anonimizacja jest warstwą prezentacji.** Toggle anonimizacji nie zmienia `topology_hash` ani `layout_hash`.
10. **Undo/Redo działa dla patchSnapshot** (MAX_UNDO=20). Ctrl+Z w UI wywołuje `undoSnapshot()`.

---

## DoD (DEFINITION OF DONE) per KARTA

Karta jest DONE gdy:

| Kryterium | Weryfikacja |
|---|---|
| Wszystkie pola mają `data-testid` | grep `data-testid` w pliku |
| Wszystkie pola mają `onChange` handler | TypeScript strict — no unused handlers |
| Przycisk Zapisz wywołuje `executeDomainOperation` | test mock + fireEvent.click |
| Przycisk Resetuj przywraca wartości z ENM | test: compare reset values with snapshot |
| Live obliczenia działają | test: change input → check computed output |
| Readiness badge widoczny | test: getByTestId('readiness-badge') |
| Polish labels — brak zakazanych terminów | forbidden_ui_terms_guard |
| Brak codenames | no_codenames_guard |
| Brak placeholder | grep 'TODO\|PLACEHOLDER\|w trakcie realizacji' → 0 wyników |
| Test E2E istnieje | playwright spec per karta |
| dead_click_guard zielony | python scripts/dead_click_guard.py |

---

## TEST PLAN

### Poziom 1 — Testy jednostkowe (Vitest)

Per karta konfiguratora:
```ts
describe('BayConfiguratorSurface', () => {
  it('renders all 9 tabs', () => { ... });
  it('tab click switches content', () => { ... });
  it('save button calls executeDomainOperation', async () => {
    const mockExec = vi.fn();
    render(<BayConfiguratorSurface executeDomainOperation={mockExec} ... />);
    fireEvent.click(screen.getByText('Dane podstawowe'));
    fireEvent.change(screen.getByTestId('bay-name'), { target: { value: 'Pole L1' } });
    fireEvent.click(screen.getByTestId('bay-save-btn'));
    expect(mockExec).toHaveBeenCalledWith(expect.objectContaining({
      op_type: 'configure-bay'
    }));
  });
  it('reset button restores snapshot values', () => { ... });
  it('readiness badge shows blocker when CT missing for LINE bay', () => { ... });
});
```

### Poziom 2 — Testy integracyjne

```ts
describe('SLD ↔ Konfigurator integration', () => {
  it('station click on SLD opens StationConfigurator in right panel', () => { ... });
  it('patchSnapshot after modal save triggers canvas re-render', async () => { ... });
  it('topology_hash unchanged after layout-only drag', () => { ... });
});
```

### Poziom 3 — E2E Playwright

```ts
// e2e/engineer-workflow-step1-to-5.spec.ts
test('Pełny workflow: Projekt → GPZ → Topologia → Stacja → Pole', async ({ page }) => {
  // Krok 1: Projekt
  await page.goto('/');
  await page.click('[data-testid="new-project-btn"]');
  await page.fill('[data-testid="project-name"]', 'Projekt testowy GPZ Wschód');
  await page.click('[data-testid="project-save"]');
  await expect(page.locator('[data-testid="step-indicator"]')).toContainText('Krok 1');

  // Krok 2: GPZ
  await page.click('[data-testid="nav-gpz"]');
  await page.fill('[data-testid="gpz-sk-mva"]', '2500');
  await page.fill('[data-testid="gpz-rx"]', '0.1');
  await page.click('[data-testid="gpz-save"]');
  await expect(page.locator('[data-testid="readiness-gpz"]')).toHaveAttribute('data-level', 'complete');

  // Krok 3: Sieć — rysuję ciąg + wstawiam stację KOMPLETNĄ z wizarda
  await page.click('[data-testid="sld-tool-add-line"]');
  await page.click('[data-testid="sld-canvas"]', { position: { x: 300, y: 200 } });
  // LineSegmentInline tooltip
  await page.fill('[data-testid="line-cable-catalog"]', '3x120 XUHAKXS');
  await page.fill('[data-testid="line-length-m"]', '450');
  await page.click('[data-testid="line-confirm"]');

  // Wstawiam stację — otwiera się StationWizard
  await page.click('[data-testid="sld-tool-add-station"]');
  await page.click('[data-testid="sld-canvas"]', { position: { x: 500, y: 200 } });
  await expect(page.locator('[data-testid="station-wizard"]')).toBeVisible();
  // Step 1: Identyfikacja
  await page.fill('[data-testid="station-name"]', 'ST-001 Wschód');
  await page.click('[data-testid="station-type-rmu"]');
  await page.click('[data-testid="wizard-next"]');
  // Step 2: Pola + aparatura — dodaję 3 pola
  await page.click('[data-testid="bay-add"]');
  // ... wypełniam pola, CB, CT, etc.
  await page.click('[data-testid="wizard-next"]');
  // ... pozostałe stepy
  // Step 8: Gotowość — Save
  await page.click('[data-testid="wizard-save-and-create"]');

  // Weryfikacja: SLD ma element z domain_ref + stacja jest KOMPLETNA
  await expect(page.locator('[data-domain-ref]').first()).toBeVisible();
  // Stacja kompletna = nie wireframe
  await expect(page.locator('[data-station-readiness="complete"]')).toBeVisible();
});
```

### Poziom 4 — Guard scripts

Przed każdym PR:
```bash
cd mv-design-pro

python scripts/dead_click_guard.py           # 0 dead clicks
python scripts/no_codenames_guard.py         # 0 codenames
python scripts/forbidden_ui_terms_guard.py   # 0 zakazanych terminów
python scripts/dialog_completeness_guard.py  # wszystkie modale kompletne
python scripts/overlay_no_physics_guard.py   # żadna fizyka w overlay
python scripts/sld_determinism_guards.py     # deterministyczny layout
python scripts/local_truth_guard.py          # ENM jest jedyną prawdą
python scripts/docs_guard.py                 # dokumentacja aktualna
```

---

## ANTI-PATTERNS (zakaz implementacji)

### Anti-pattern 1 — Notify-only Save
```tsx
// ZAKAZ
const handleSave = () => {
  toast.success('Zapisano pomyślnie');
};
```

```tsx
// WYMAGANE
const handleSave = async () => {
  await executeDomainOperation({ op_type: 'configure-gpz', payload: formData });
  // toast opcjonalnie po sukcesie, NIE zamiast mutacji
};
```

### Anti-pattern 2 — Placeholder karta
```tsx
// ZAKAZ
<TabPanel value="zabezpieczenia">
  <p>Sekcja zabezpieczeń — w trakcie realizacji</p>
</TabPanel>
```

```tsx
// WYMAGANE: jeśli nie możesz zaimplementować — pomijasz zakładkę całkowicie
// Nie renderujesz pustej / placeholder karty
```

### Anti-pattern 3 — Hardcoded wartości w renderingu
```tsx
// ZAKAZ
<text>Ik'' = 12.5 kA</text>  // hardcoded
```

```tsx
// WYMAGANE
<text>Ik'' = {shortCircuitResult?.ik3_ka?.toFixed(2) ?? '—'} kA</text>
```

### Anti-pattern 4 — Shadow state
```tsx
// ZAKAZ
const [localStations, setLocalStations] = useState(enmData.stations);
// Teraz mamy dwie wersje danych!
```

```tsx
// WYMAGANE
const stations = useSnapshotStore(s => s.snapshot?.substations ?? []);
// Jeden source of truth
```

### Anti-pattern 5 — Calc w renderze bez oznaczenia
```tsx
// ZAKAZ (kalkulator w UI bez ostrzeżenia)
const ik3 = skMva * 1000 / (Math.sqrt(3) * 110);
```

```tsx
// WYMAGANE
// Tylko w estymatorie z explicite footnote:
const ik3Estimate = computeSimpleCalc(formValues); 
// ... w UI:
<p className="text-xs text-muted">
  Szybki estymator (±15%). Pełne obliczenia IEC 60909 w module E-23.
</p>
```

### Anti-pattern 6 — Brak data-testid na klikalnych elementach
```tsx
// ZAKAZ
<button onClick={handleSave}>Zapisz</button>
```

```tsx
// WYMAGANE
<button data-testid="gpz-save-btn" onClick={handleSave}>Zapisz</button>
```

### Anti-pattern 7 — Bezpośrednia mutacja ENM z UI
```tsx
// ZAKAZ
const state = useSnapshotStore.getState();
state.snapshot.substations[0].name = 'Nowa nazwa';
```

```tsx
// WYMAGANE
patchSnapshot(
  draft => { const s = draft.substations.find(x => x.ref_id === ref); if (s) s.name = 'Nowa nazwa'; },
  [ref]
);
```

---

## METODOLOGIA — AUDYT PER KARTA (powtarzalny proces)

Dla każdej karty konfiguratora wykonaj w kolejności:

### Krok A — Audyt martwych klików
```bash
# Sprawdź każdy button/link w pliku
grep -n 'onClick\|onSubmit\|onChange' src/ui/workspace/surfaces/TargetSurface.tsx
# Dla każdego onClick sprawdź czy handler coś mutuje
# Jeśli handler = toast-only → BLOKADA, napraw przed merge
```

### Krok B — Audyt pól formularza
```bash
grep -n 'input\|select\|textarea' src/ui/workspace/surfaces/TargetSurface.tsx
# Dla każdego inputa sprawdź:
# - czy ma onChange → patchSnapshot / executeDomainOperation
# - czy ma value/defaultValue z ENM snapshot (nie hardcoded)
# - czy ma data-testid
```

### Krok C — Audyt readiness
```bash
# Sprawdź czy karta ma sekcję readiness / gotowość
grep -n 'readiness\|Gotowość\|blocker\|kompletność' src/ui/workspace/surfaces/TargetSurface.tsx
# Jeśli brak → dodaj sekcję/badge gotowości
```

### Krok D — Audyt testów
```bash
# Sprawdź czy istnieje test file
ls src/ui/workspace/surfaces/__tests__/
# Sprawdź czy testy zawierają:
# - test save wywołuje executeDomainOperation
# - test reset przywraca wartości
# - test readiness badge
```

### Krok E — Uruchom guardy
```bash
python scripts/dead_click_guard.py
python scripts/forbidden_ui_terms_guard.py
python scripts/no_codenames_guard.py
python scripts/dialog_completeness_guard.py
```

### Krok F — Uruchom testy
```bash
cd mv-design-pro/frontend
npx vitest run --config vite.config.ts src/ui/workspace --no-file-parallelism
```

Dopiero po zielonym przejściu WSZYSTKICH 6 kroków karta jest DONE.

---

## PRIORYTETY IMPLEMENTACJI

### P0 — Blokujące (przed każdym release)
- Żaden przycisk „Zapisz" nie może być notify-only
- `dead_click_guard.py` zielony
- `forbidden_ui_terms_guard.py` zielony
- Każde pole ma `data-testid`

### P1 — Wysokie (sprint bieżący — KLUCZOWE dla Zasady 13)
- **StationWizard (E-13 refaktor)** — przekształcenie `StationConfiguratorSurface` z 10 osobnych kart na multi-step wizard z 8 stepami w jednym oknie; jedna atomowa operacja `create-station-complete`
- **BayEditor (E-11 refaktor)** — przekształcenie z osobnej `BayConfiguratorSurface` na subkomponent wbudowany w Step 2 StationWizarda + akcja kontekstowa „Edytuj pole"
- **LineSegmentInline (E-12 nowy)** — inline tooltip podczas dropu ciągu (typ kabla + długość + ułożenie)
- **Backend: domain operation `create-station-complete`** — atomowa operacja tworząca stację+pola+aparaturę+TR+DER+zabezpieczenia w jednym evencie ENM (jeden Inv 4 invalidate, nie 8)
- **Akcje kontekstowe SLD** — prawy klik na stację/pole/ciąg/TR otwiera odpowiedni wizard/editor z preselected stepem

### P2 — Średnie (sprint następny)
- Undo/Redo UI (Ctrl+Z wywołuje `undoSnapshot()`, widoczny licznik w topbar)
- LOD histereza (15% deadband, debounce 250ms) — `LodPolicy.ts`
- MiniBlockRmuRenderer — mini-blok RMU z faktycznych pól (nie prostokąt)
- Pełna koordynacja TCC w E-31 (Krok 4 workflow) — selektywność krzywych

### P3 — Planowane
- Anonimizacja deterministyczna (SHA-256 pseudonimy)
- Layout korytarzowy dla sieci 30-80 stacji
- E2E pełny workflow Steps 1-8 (z naciskiem na Krok 3 StationWizard end-to-end)

---

## KOMENDA STARTOWA — KOPIUJ DO NOWEJ SESJI

Poniższy tekst skopiuj jako pierwsze polecenie w nowej sesji Claude Code:

```
Jesteś Senior Frontend Architect + Senior UX Engineer + Inżynier Sieci SN pracującym nad MV-DESIGN-PRO.

WAŻNE: Przeczytaj NAJPIERW te pliki (bez modyfikacji, tylko read):
1. mv-design-pro/docs/prompts/UX_ENGINEER_WORKFLOW_PROMPT.md  ← TEN PLIK (cały, ze szczególną uwagą na Zasadę 13)
2. mv-design-pro/SYSTEM_SPEC.md
3. mv-design-pro/frontend/src/ui/topology/snapshotStore.ts
4. mv-design-pro/frontend/src/ui/workspace/surfaces/GpzConfiguratorSurface.tsx (wzorzec wizarda — R45)
5. mv-design-pro/frontend/src/ui/workspace/surfaces/GpzConfiguratorSimple.tsx (wzorzec Simple mode)
6. mv-design-pro/frontend/src/ui/workspace/surfaces/__tests__/Etap3Configurators.test.tsx (wzorzec testów)

ZADANIE: [WPISZ KONKRETNE ZADANIE, np. "Zrefaktoruj StationConfiguratorSurface w StationWizard z 8 stepami zgodnie ze specyfikacją E-13 w UX_ENGINEER_WORKFLOW_PROMPT.md"]

OBOWIĄZKOWE ZASADY (z prompt document):
1. Zasada 13 — wstawienie obiektu = JEGO PEŁNA KONFIGURACJA W JEDNYM PRZEPŁYWIE
   - Stacja wstawiona = stacja z polami, aparaturą, TR, DER, zabezpieczeniami, powiązaniami
   - NIE dziel na "wstaw stację" + "skonfiguruj pola" + "skonfiguruj aparaturę" + "dodaj DER"
   - Multi-step wizard w JEDNYM oknie (stepper na górze, nie kolejne modale)
   - Edycja = ten sam wizard z mode='edit', skok do dowolnego stepu
2. Każdy przycisk Zapisz wywołuje executeDomainOperation lub patchSnapshot — NIGDY toast-only
3. Każde pole ma data-testid i onChange handler
4. Każda nowa karta ma test jednostkowy z testem handlera Zapisz
5. dead_click_guard.py musi być zielony po twojej zmianie
6. forbidden_ui_terms_guard.py musi być zielony
7. Wzorzec wizarda: GpzConfiguratorSurface.tsx (R45 — 10.0/10)
8. Wzorzec testów: Etap3Configurators.test.tsx
9. Żadnych placeholderów — jeśli nie możesz czegoś zaimplementować, pomijasz sekcję całkowicie
10. Atomowy save: wizard zbiera wszystkie pola → JEDNA operacja executeDomainOperation('create-X-complete') → backend tworzy całą hierarchię w jednym evencie

DoD (Definition of Done):
- [ ] Wszystkie pola mają data-testid
- [ ] Wszystkie przyciski Zapisz wywołują mutację stanu (nie notify-only)
- [ ] Test jednostkowy zielony (Vitest)
- [ ] Test E2E: wstawienie obiektu z wizarda → obiekt na SLD jest KOMPLETNY (nie wireframe)
- [ ] Test edycji: prawy klik na obiekt → wizard otwiera się z aktualnymi wartościami
- [ ] dead_click_guard.py zielony
- [ ] forbidden_ui_terms_guard.py zielony
- [ ] Brak TODO/PLACEHOLDER w kodzie
- [ ] Brak osobnych modali typu "AddBay", "AddTransformer" jeśli są częścią wizarda stacji
```

---

## QUICK REFERENCE — WZORCE KODU

### Wzorzec: Save z executeDomainOperation
```tsx
const handleSave = async () => {
  try {
    await executeDomainOperation({
      op_type: 'configure-line-segment',
      entity_ref: segmentRef,
      payload: {
        cable_catalog_ref: formValues.cableRef,
        length_m: formValues.lengthM,
        installation_type: formValues.installation,
      },
    });
  } catch {
    // fallback do patchSnapshot gdy backend niedostępny
    patchSnapshot(
      draft => {
        const seg = draft.line_runs
          ?.flatMap(r => r.segments ?? [])
          .find(s => s.ref_id === segmentRef);
        if (seg) {
          seg.cable_catalog_ref = formValues.cableRef;
          seg.length_m = formValues.lengthM;
        }
      },
      [segmentRef],
    );
  }
};
```

### Wzorzec: Live obliczenia z footnote
```tsx
const calc = useMemo(() => {
  if (!skMva || !rxRatio || !unKv) return null;
  const z1 = (unKv ** 2) / skMva;           // Ω
  const ik3 = (CMAX * unKv) / (Math.sqrt(3) * z1); // kA
  const kappa = 1.02 + 0.98 * Math.exp(-3 * rxRatio);
  const ip = kappa * Math.sqrt(2) * ik3;
  const ith = ik3 * Math.sqrt(1.2); // m+n=1.2 dla t=1s
  return { z1, ik3, ip, ith };
}, [skMva, rxRatio, unKv]);

// W JSX:
{calc && (
  <div data-testid="live-calc-summary">
    <p>Ik" 3F = {calc.ik3.toFixed(2)} kA</p>
    <p>ip = {calc.ip.toFixed(2)} kA</p>
    <p>Ith (1s) = {calc.ith.toFixed(2)} kA</p>
    <p className="text-xs text-muted mt-2">
      Szybki estymator ±15% (Z1 = Un²/Sk; Ik3 = c·Un/(√3·Z1); ip = κ·√2·Ik3).
      Pełne obliczenia IEC 60909 w module E-23.
    </p>
  </div>
)}
```

### Wzorzec: Readiness badge
```tsx
const readiness = useMemo((): ReadinessLevel => {
  if (!entityRef) return 'not_started';
  if (!skMva || skMva <= 0) return 'blocker';
  if (!cableRef) return 'partial';
  return 'complete';
}, [entityRef, skMva, cableRef]);

const READINESS_CONFIG: Record<ReadinessLevel, { icon: string; label: string; color: string }> = {
  complete:    { icon: '✅', label: 'Kompletny',    color: 'text-green-600' },
  partial:     { icon: '⚠',  label: 'Częściowy',   color: 'text-yellow-600' },
  blocker:     { icon: '❌', label: 'Blokada',      color: 'text-red-600' },
  not_started: { icon: '⬜', label: 'Nierozpoczęty', color: 'text-gray-400' },
};

<div data-testid="readiness-badge" data-level={readiness} className={READINESS_CONFIG[readiness].color}>
  {READINESS_CONFIG[readiness].icon} {READINESS_CONFIG[readiness].label}
</div>
```

### Wzorzec: Mode switcher Simple/Advanced
```tsx
type ConfigMode = 'simple' | 'advanced';

export function TargetConfiguratorSurface({ surface }: Props) {
  const [mode, setMode] = useState<ConfigMode>('simple');
  const entityRef = surface.entityRef;

  if (!entityRef) {
    return <div data-testid="target-simple-empty">Brak referencji</div>;
  }

  return (
    <div>
      <header>
        <button
          data-testid="target-mode-simple-switch"
          onClick={() => setMode('simple')}
          aria-pressed={mode === 'simple'}
        >
          Uproszczony
        </button>
        <button
          data-testid="target-mode-advanced-switch"
          onClick={() => setMode('advanced')}
          aria-pressed={mode === 'advanced'}
        >
          Zaawansowany →
        </button>
      </header>

      {mode === 'simple'
        ? <TargetConfiguratorSimple entityRef={entityRef} />
        : <TargetConfiguratorAdvanced entityRef={entityRef} />
      }
    </div>
  );
}
```

---

## HISTORIA WERSJI TEGO DOKUMENTU

| Wersja | Data | Zmiany |
|---|---|---|
| 1.0 | 2026-05-08 | Wersja inicjalna — po R45 Dual Mode GPZ Configurator |
| 1.1 | 2026-05-08 | **Krytyczna korekta:** Workflow przeprojektowany z 10 kroków na 8. Krok 3 łączy „rysowanie sieci" + „konfiguracja stacji" + „aparatura" + „DER" w jeden wizard wieloetapowy. Dodana **Zasada 13** — wstawienie obiektu = pełna konfiguracja w jednym przepływie. E-13 przekształcony z 10 osobnych kart na **StationWizard z 8 stepami w jednym oknie**. E-11 BayConfigurator zdegradowany z osobnej karty workflow do subkomponentu w Step 2 wizarda. E-12 LineSegment przeprojektowany z karty na inline tooltip. Backend: nowa atomowa operacja `create-station-complete`. |
| 2.0 | 2026-05-08 | **WDROŻENIE R46-R47 (Zasada 13 zrealizowana w kodzie):** ✅ E-13 StationWizard 8-step (commit `8fbeba9`). ✅ E-11 BayEditor wyciągnięty + standalone (commit `a374260`). ✅ E-12 LineSegmentInline z live IEC 60364 estymatorem (commit `a374260`). ✅ Atomowy save z hierarchią `executeDomainOperation('create-station-complete' / 'update-station-complete') → fallback patchSnapshot`. ✅ Auto-toggle `hasTransformer`/`hasLvSide` na bazie stationType (mv_lv → on, switching → off). ✅ 1588 testów zielonych w 94 plikach (+45 vs R45). ✅ Wszystkie 5 guardów zielone. Domyślne ścieżki E-11/E-12/E-13 wszystkie wzorcują Zasadę 13. Backend `create-station-complete` operation: kontrakt zdefiniowany, frontend wywołuje, fallback na patchSnapshot przy braku backendu. |

---

*Dokument generowany jako kanon pracy na podstawie audytu R42-R45 GpzConfigurator (10.0/10) oraz wytycznych architektury MV-DESIGN-PRO. Wersja 2.0 — milestone wdrożenia: Zasada 13 w pełni zoperacjonalizowana w kodzie z testami i guardami zielonymi.*
