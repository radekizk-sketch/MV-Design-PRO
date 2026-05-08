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

## NIEZMIENNE ZASADY UX (12 zasad)

### Zasada 1 — Jedna główna ścieżka pracy

Główna ścieżka inżyniera ma być jawna i widoczna jako breadcrumb + progress bar:

```
1. Projekt
   └─ 2. Dane wejściowe (GPZ, sieć, stacje)
          └─ 3. Parametry normowe (Sk'', c-max/min, częstotliwość)
                 └─ 4. Topologia (SLD, ciągi, sprzęgła, NOP)
                        └─ 5. Aparatura (CB/DS/CT/VT per pole)
                               └─ 6. Zabezpieczenia
                                      └─ 7. Obliczenia (E-23 SC, load flow)
                                             └─ 8. Wyniki + Proof Packs
                                                    └─ 9. Raport (PDF/DOCX)
```

Każdy krok musi mieć:
- `entry_condition`: co musi być spełnione żeby wejść
- `exit_condition`: co musi być zrobione żeby przejść dalej
- `blocking_badge`: co blokuje przejście (widoczny w UI, nie ukryty w konsoli)

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

---

## WORKFLOW INŻYNIERA SN — 10 kroków z kryteriami wyjścia

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

### Krok 2: GPZ — dane wejściowe strona 110 kV
**Entry:** Projekt istnieje z nazwą i standardem  
**Co robi inżynier:**
- Konfiguruje GPZ: nazwa, operator, napięcie, tryb uziemienia
- Wprowadza moc zwarciową S''k [MVA] i R/X
- Opcjonalnie: Z0/Z1, R0/X0 dla obliczeń asymetrycznych
- Wybiera transformatory z katalogu HV

**Exit condition:** S''k > 0, R/X > 0, co najmniej 1 transformator  
**Blocking badge:** ❌ Brak mocy zwarciowej GPZ  
**Karta:** E-03 (GpzConfiguratorSurface) — Simple lub Advanced

---

### Krok 3: Topologia sieci — SLD rysowanie
**Entry:** GPZ skonfigurowany (Krok 2 OK)  
**Co robi inżynier:**
- Na SLD canvas: dodaje ciągi kablowe, stacje odbiorcze
- Definiuje: długości odcinków, typy kabli z katalogu
- Ustawia NOP (Normalnie Otwarte Połączenia) dla schematu pierścieniowego
- Konfiguruje typy stacji (RMU, RM6, złącze, etc.)

**Exit condition:** Przynajmniej 1 ciąg kablowy od GPZ + 1 stacja odbiorcza  
**Blocking badge:** ⚠ Sieć niepołączona (wyspy)  
**Karta:** E-00 (SldEditorPage) + kontekstowe E-12 per odcinek

---

### Krok 4: Stacje — konfiguracja RMU/RM6
**Entry:** Topologia narysowana (Krok 3 OK)  
**Co robi inżynier:**
- Per stacja: typ (RMU/RM6/złącze), producent z katalogu, pola SN
- Konfiguruje pola wejściowe (IN) i wyjściowe (OUT)
- Definiuje pobory (moce transformatorów SN/nN)
- Ustawia transformatory SN/nN z katalogu

**Exit condition:** Każda stacja ma co najmniej 1 pole IN + poprawny typ  
**Blocking badge:** ❌ Stacja bez pola wejściowego  
**Karta:** E-13 (StationConfiguratorSurface)

---

### Krok 5: Aparatura — CB/DS/CT/VT per pole
**Entry:** Stacje skonfigurowane (Krok 4 OK)  
**Co robi inżynier:**
- Per pole SN: typ wyłącznika/rozłącznika, numer fabryczny
- Dodaje CT: klasa dokładności, przekładnia dla pola liniowego i TR
- Dodaje VT: klasa dokładności, napięcie dla pola pomiarowego
- Sprawdza uziemniki i odgromniki

**Exit condition:** Pola liniowe mają CT; pola TR mają CT + bezpieczniki  
**Blocking badge:** ⚠ Pole liniowe bez CT (brak danych dla zabezpieczeń)  
**Karta:** E-11 (BayConfiguratorSurface)

---

### Krok 6: Zabezpieczenia — krzywe TCC
**Entry:** CT zdefiniowane (Krok 5 OK)  
**Co robi inżynier:**
- Wybiera typ zabezpieczenia (nadprądowe, ziemnozwarciowe, różnicowe)
- Konfiguruje nastawy: Ir, Isd, t1, t2 (IEC 60255 koordynacja)
- Weryfikuje selektywność na krzywych TCC

**Exit condition:** Co najmniej 1 zabezpieczenie per ciąg z katalogu  
**Blocking badge:** ⚠ Ciąg bez zabezpieczenia — koordynacja niemożliwa  
**Karta:** E-31 (ProtectionSurface)

---

### Krok 7: Obliczenia — E-23 IEC 60909 + load flow
**Entry:** Topologia + aparatura + zabezpieczenia OK  
**Co robi inżynier:**
- Uruchamia obliczenia zwarciowe IEC 60909 (E-23)
- Uruchamia przepływ mocy (Newton-Raphson)
- Weryfikuje: Ik3 per szyna, profil napięć, straty

**Exit condition:** Obliczenia zakończone bez SOLVER_ERROR  
**Blocking badge:** ❌ Obliczenia nieaktualne — zmieniono topologię po ostatnim uruchomieniu  
**Karta:** E-23 (ShortCircuitSurface) + E-24 (LoadFlowSurface)

---

### Krok 8: Wyniki — przegląd i weryfikacja
**Entry:** Obliczenia wykonane (Krok 7 OK)  
**Co robi inżynier:**
- Przegląda Ik3/Ik1 per szyna (czy CB wytrzymuje?)
- Przegląda profil napięć (czy U > 0.95 Un w ostatniej stacji?)
- Porównuje wyniki z katalogowymi zdolnościami CB/DS
- Sprawdza Proof Packs (WHITE BOX audit trail)

**Exit condition:** Żadna szyna bez „equipment overloaded" blocker  
**Blocking badge:** ❌ CB przekroczony Ik'' na szynach GPZ  
**Karta:** E-04 (ResultsBrowserSurface)

---

### Krok 9: Dobór aparatury — weryfikacja katalogowa
**Entry:** Wyniki znane (Krok 8 OK)  
**Co robi inżynier:**
- Weryfikuje że CB: Icu ≥ 1.1 × Ik3, Ip ≥ ip3
- Weryfikuje że kable: Ith ≥ Ith3 (cieplna wytrzymałość)
- Koryguje dobór jeśli niezbędne (powrót do Krok 4 z nowymi danymi)

**Exit condition:** Wszystkie aparaty w zakresie katalogowym  
**Karta:** E-04 + E-33 (EquipmentProofSurface)

---

### Krok 10: Raport — generacja dokumentu
**Entry:** Dobór aparatury zatwierdzony (Krok 9 OK)  
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

### E-11 — BayConfiguratorSurface

**Status implementacji:** Częściowy (8 kart), wymaga przeglądu martwych klików  
**Plik:** `src/ui/workspace/surfaces/BayConfiguratorSurface.tsx`

**Wymagane karty:**
1. Dane podstawowe (numer, typ pola: LINE/TR/COUPLER/MEASUREMENT/OZE)
2. Aparatura pierwotna (CB: typ, producent, Icu, Icd; DS: typ, producent)
3. Przekładniki prądowe (CT: klasa, przekładnia, Sn)
4. Przekładniki napięciowe (VT: klasa, przekładnia — tylko dla MEASUREMENT)
5. Zabezpieczenia (typ zabezpieczenia, nastawy)
6. Pomiary (liczniki, telemetria)
7. Porty SN (przypisanie portów wej/wyj do topologii)
8. Podgląd SLD (mini-SLD pola)
9. Obliczenia (Ik'' per szyna pola, Ip, Ith)

**Wymagane testy:**
- Każda karta ma `data-testid="bay-card-{tab-name}"`
- Przycisk Zapisz na każdej karcie → `executeDomainOperation('configure-bay', ...)`
- Test: klik Zapisz → sprawdź mock executeDomainOperation wywołane z poprawnym payload

**Wzorzec Save payload:**
```ts
executeDomainOperation({
  op_type: 'configure-bay',
  entity_ref: bayRef,
  payload: {
    bay_role: 'LINE_FULL' | 'TR_FULL' | 'COUPLER' | 'MEASUREMENT' | 'OZE',
    cb_catalog_ref: string | null,
    ct_catalog_ref: string | null,
    ct_ratio: number | null,
    // ... reszta pól
  }
})
```

---

### E-13 — StationConfiguratorSurface

**Status implementacji:** 10 kart, wymaga weryfikacji martwych klików  
**Plik:** `src/ui/workspace/surfaces/StationConfiguratorSurface.tsx`

**Karty (10):**
1. Identyfikacja i szablon (nazwa, numer ewidencyjny, typ stacji, producent)
2. Topologia, porty i PCC (powiązania z ciągami, punkt przyłączenia)
3. Rozdzielnia SN (typ: RMU/RM6/rozdzielnia wolnostojąca, napięcie Un)
4. Pola SN (lista pól, typy, konfiguracja)
5. Transformatory SN/nN (moc, napięcia, impedancja, producent)
6. Strona nN i poziomy napięć (Un nN, układ sieci nN)
7. Źródła i magazyny (PV, BESS, FW — z PCC validation)
8. Zabezpieczenia i automatyka
9. Pomiary, telemechanika i sygnały
10. Gotowość obliczeń (checklist 12 punktów)

**Kluczowe walidacje:**
- Stacja MUSI mieć co najmniej 1 pole z rolą IN (wejście zasilania) — blocker
- Każde źródło/magazyn DER MUSI mieć PCC — blocker bez PCC = missing-connection
- Napięcie nN musi być zgodne z katalogu trafo (230/400 V lub 110 V)

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

### Kanon modali (wymagane):

| Modal | Trigger | OP type | Pola |
|---|---|---|---|
| SwitchStateModal | Klik na CB/DS/ES na SLD | `set-switch-state` | state: open/closed/locked |
| AddApparatusModal | „Dodaj aparat" per pole | `configure-equipment` | kind, catalog_ref, accuracy |
| CbEditModal | Klik edytuj na CB | `configure-cb` | catalog_ref, Icu, serial |
| CtConfigModal | Klik edytuj CT | `configure-ct` | ratio, class, sn_va |
| VtConfigModal | Klik edytuj VT | `configure-vt` | ratio, class, connection |
| CableEditModal | Klik na odcinek | `configure-cable` | catalog_ref, length, installation |
| TransformerEditModal | Klik na TR | `configure-transformer` | catalog_ref, tap, vector |
| StationEditModal | Klik na stację | `configure-station` | name, type, producer |
| NopModal | Klik na NOP | `set-nop-state` | open/closed (planowany) |

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

  // Krok 3: Topologia (tryb rysowania SLD)
  await page.click('[data-testid="sld-tool-add-line"]');
  await page.click('[data-testid="sld-canvas"]', { position: { x: 300, y: 200 } });
  // ... dalej

  // Weryfikacja: SLD ma element z domain_ref
  await expect(page.locator('[data-domain-ref]').first()).toBeVisible();
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

### P1 — Wysokie (sprint bieżący)
- E-12 LineSegmentConfigurator — nowy (brak implementacji)
- E-11 BayConfigurator — audyt martwych klików, weryfikacja Save handlers
- E-13 StationConfigurator — audyt martwych klików, weryfikacja DER PCC

### P2 — Średnie (sprint następny)
- Undo/Redo UI (Ctrl+Z wywołuje `undoSnapshot()`, widoczny licznik w topbar)
- LOD histereza (15% deadband, debounce 250ms) — `LodPolicy.ts`
- MiniBlockRmuRenderer — mini-blok RMU z faktycznych pól (nie prostokąt)

### P3 — Planowane
- Anonimizacja deterministyczna (SHA-256 pseudonimy)
- Layout korytarzowy dla sieci 30-80 stacji
- E2E pełny workflow Steps 1-10

---

## KOMENDA STARTOWA — KOPIUJ DO NOWEJ SESJI

Poniższy tekst skopiuj jako pierwsze polecenie w nowej sesji Claude Code:

```
Jesteś Senior Frontend Architect + Senior UX Engineer + Inżynier Sieci SN pracującym nad MV-DESIGN-PRO.

WAŻNE: Przeczytaj NAJPIERW te pliki (bez modyfikacji, tylko read):
1. mv-design-pro/docs/prompts/UX_ENGINEER_WORKFLOW_PROMPT.md  ← TEN PLIK
2. mv-design-pro/SYSTEM_SPEC.md
3. mv-design-pro/frontend/src/ui/topology/snapshotStore.ts
4. mv-design-pro/frontend/src/ui/workspace/surfaces/GpzConfiguratorSurface.tsx (wzorzec)
5. mv-design-pro/frontend/src/ui/workspace/surfaces/__tests__/Etap3Configurators.test.tsx (wzorzec testów)

ZADANIE: [WPISZ KONKRETNE ZADANIE, np. "Zaimplementuj E-12 LineSegmentConfigurator zgodnie ze specyfikacją w UX_ENGINEER_WORKFLOW_PROMPT.md"]

OBOWIĄZKOWE ZASADY:
1. Każdy przycisk Zapisz wywołuje executeDomainOperation lub patchSnapshot — NIGDY toast-only
2. Każde pole ma data-testid i onChange handler
3. Każda nowa karta ma test jednostkowy z testem handlera Zapisz
4. dead_click_guard.py musi być zielony po twojej zmianie
5. forbidden_ui_terms_guard.py musi być zielony
6. Wzorzec implementacji: GpzConfiguratorSimple.tsx (Simple) i GpzConfiguratorSurface.tsx (Advanced)
7. Wzorzec testów: Etap3Configurators.test.tsx
8. Żadnych placeholderów — jeśli nie możesz czegoś zaimplementować, pomijasz sekcję całkowicie

DoD (Definition of Done):
- [ ] Wszystkie pola mają data-testid
- [ ] Wszystkie przyciski Zapisz wywołują mutację stanu (nie notify-only)
- [ ] Test jednostkowy zielony (Vitest)
- [ ] dead_click_guard.py zielony
- [ ] forbidden_ui_terms_guard.py zielony
- [ ] Brak TODO/PLACEHOLDER w kodzie
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

---

*Dokument generowany jako kanon pracy na podstawie audytu R42-R45 GpzConfigurator (10.0/10) oraz wytycznych architektury MV-DESIGN-PRO.*
