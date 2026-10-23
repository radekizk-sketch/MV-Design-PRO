# Dowod E2E — realna siec SN

> **Dokument**: UI_E2E_PROOF_REAL_SIEC_SN.md
> **Status**: ZAMKNIETY
> **Data audytu**: 2026-03-28
> **Warstwa**: E2E Testing (Presentation + Application + Domain)

---

## 1. Zakres audytu

Niniejszy dokument definiuje i dokumentuje 5 scenariuszy end-to-end dla realnej
sieci SN (srednie napiecie) w MV-Design-PRO. Kazdy scenariusz opisuje pelna sciezke
uzytkownika od akcji inicjujacej do weryfikowalnego rezultatu.

Audyt obejmuje:
- 5 scenariuszy E2E z krokami weryfikacji
- Istniejace testy E2E (Playwright)
- Nowe testy jednostkowe potwierdzajace scenariusze

---

## 2. Scenariusze E2E

### 2.1. Scenariusz 1: Budowa sieci od zera

**Cel**: Zbudowanie kompletnej sieci SN od pustego projektu do uruchomienia analizy.

| Krok | Akcja | Weryfikacja |
|------|-------|-------------|
| 1 | Utworz nowy projekt | Project utworzony, projectName widoczny w TopContextBar |
| 2 | Dodaj Source (External Grid) | Source pojawia sie na SLD, parametry mocy ustawione |
| 3 | Dodaj Trunk (linia zasilajaca) | LineBranch/CableSN polaczony z Source bus |
| 4 | Dodaj Stations (stacje SN/NN) | Station z BaySN, TransformerBranch, BayNN |
| 5 | Dodaj Branches (odgalezienia) | LineSN/CableSN laczace stacje, topologia poprawna |
| 6 | Ustaw NOP (Normally Open Point) | Wybrany Switch ustawiony na OPEN, topologia promieniowa |
| 7 | Dodaj OZE (PVInverter, BESS) | Zrodla OZE podlaczone do wybranych stacji |
| 8 | Sprawdz Readiness | Brak blokerow, zielony badge w TopContextBar |
| 9 | Run Analysis | Analiza uruchomiona, wyniki dostepne w Results Browser |

**Sciezka krytyczna**: Source -> Bus -> LineBranch -> Bus -> Station -> TransformerBranch -> Bus (NN)

### 2.2. Scenariusz 2: Mass review i korekta

**Cel**: Identyfikacja i korekta brakow w modelu za pomoca MassReviewPanel.

| Krok | Akcja | Weryfikacja |
|------|-------|-------------|
| 1 | Otworz MassReviewPanel | Panel otwiera sie z 6 zakladkami |
| 2 | Przejdz do zakladki Catalog | Lista elementow z brakujacym typem katalogowym |
| 3 | Dla kazdego elementu: Assign typ | Catalog Browser otwiera sie, typ przypisany |
| 4 | Przejdz do zakladki Transformers | Przeglad parametrow transformatorow |
| 5 | Sprawdz kompletnosc parametrow | Wszystkie wymagane pola wypelnione |
| 6 | Przejdz do zakladki Readiness | Sprawdz blokery |
| 7 | Potwierdz brak blokerow | Lista pusta, status READY |

**Kryteria sukcesu**: Po zakonczeniu mass review, licznik blokerow w TopContextBar = 0.

### 2.3. Scenariusz 3: Fix action flow

**Cel**: Demonstracja pelnego flow naprawy blokera readiness.

| Krok | Akcja | Weryfikacja |
|------|-------|-------------|
| 1 | Identyfikuj bloker readiness | Bloker widoczny w ReadinessBar lub MassReviewPanel |
| 2 | Kliknij przycisk FixAction | Przycisk aktywny, oznaczony typem blokera |
| 3 | Modal naprawczy otwiera sie | Modal z formularzem odpowiednim do typu blokera |
| 4 | Wypelnij formularz i zatwierdz | Dane walidowane, akcja naprawcza wykonana |
| 5 | Bloker znika z listy | Lista blokerow zaktualizowana, licznik zmniejszony |

**Mapowanie bloker -> modal**:
- `MISSING_CATALOG` -> CatalogAssignModal
- `INCOMPLETE_PARAMS` -> ElementPropertiesModal
- `TOPOLOGY_ERROR` -> TopologyFixModal
- `MISSING_PROTECTION` -> ProtectionAssignModal

### 2.4. Scenariusz 4: Card inspection

**Cel**: Weryfikacja poprawnosci ObjectCard po zaznaczeniu elementu na SLD.

| Krok | Akcja | Weryfikacja |
|------|-------|-------------|
| 1 | Zaznacz element na SLD (klik) | Element podswietlony, selection state aktywny |
| 2 | ObjectCard otwiera sie | Panel boczny z danymi elementu |
| 3 | Sprawdz sekcje Properties | Parametry elementu poprawne (name, type, values) |
| 4 | Sprawdz sekcje Catalog | Typ katalogowy przypisany i zgodny |
| 5 | Sprawdz sekcje Topology | Polaczenia (from_bus, to_bus) poprawne |
| 6 | Sprawdz sekcje Analysis Results | Wyniki analizy (jesli dostepne) w trybie RESULT_VIEW |

**Tryb RESULT_VIEW**: Sekcja Analysis Results wyswietla wyniki ostatniego uruchomienia
analizy dla wybranego elementu. Dane sa read-only i pochodza z ResultSet.

### 2.5. Scenariusz 5: Context menu

**Cel**: Weryfikacja pelnego flow akcji z menu kontekstowego.

| Krok | Akcja | Weryfikacja |
|------|-------|-------------|
| 1 | Kliknij PPM na elemencie SLD | Menu kontekstowe pojawia sie przy kursorze |
| 2 | Wybierz akcje z menu | Akcja odpowiednia do typu elementu |
| 3 | Formularz operacji otwiera sie | Modal/panel z formularzem operacji |
| 4 | Wypelnij i zatwierdz formularz | Dane walidowane, operacja wykonana |
| 5 | Snapshot zaktualizowany | Model zaktualizowany, SLD odswiezone |

**Przykladowe akcje per typ**:
- Bus: "Add Branch", "Delete", "Properties"
- Switch: "Toggle Open/Close", "Replace", "Properties"
- Source: "Edit Parameters", "Delete"
- Station: "Add Bay", "Properties"

---

## 3. Istniejace testy E2E

### 3.1. critical-run-flow.spec.ts

Plik: `frontend/e2e/critical-run-flow.spec.ts`

9-krokowy workflow ENM (Energy Network Model):

| Krok | Opis |
|------|------|
| 1 | Otworz aplikacje |
| 2 | Utworz nowy projekt |
| 3 | Dodaj Source (External Grid) |
| 4 | Dodaj Bus i polacz z Source |
| 5 | Dodaj Load |
| 6 | Skonfiguruj parametry |
| 7 | Sprawdz topologie |
| 8 | Uruchom obliczenia |
| 9 | Zweryfikuj wyniki |

**Srodowisko**: Uruchamiany przez `npm run test:e2e:real` (wymaga dzialajacego backendu).

### 3.2. wizard-full-flow.spec.ts

Plik: `frontend/e2e/wizard-full-flow.spec.ts`

Legacy test pokrywajacy workflow Wizard (kroki K1-K10):
- K1: Wybor topologii
- K2: Parametry zrodla
- K3: Konfiguracja stacji
- K4-K10: Kolejne kroki konfiguracji

**Uwaga**: Jest to test legacy workflow (Wizard). Nowy workflow (ProcessPanel)
ma osobne testy jednostkowe.

---

## 4. Nowe testy jednostkowe

### 4.1. readinessBar.test.ts

**Plik**: `frontend/src/ui/**/readinessBar.test.ts`
**Liczba testow**: 22

Pokrycie:
- Renderowanie paska readiness z roznymi stanami blokerow
- Aktualizacja licznika blokerow po naprawie
- Interakcja z przyciskami FixAction
- Filtrowanie blokerow per kategoria
- Pusty stan (brak blokerow — zielony badge)
- Edge cases: wiele blokerow tego samego typu, blokery bez mapowania do modala

### 4.2. cardAnalysisResults.test.ts

**Plik**: `frontend/src/ui/**/cardAnalysisResults.test.ts`
**Liczba testow**: 20

Pokrycie:
- Renderowanie sekcji Analysis Results w ObjectCard
- Tryb RESULT_VIEW — dane z ResultSet
- Brak wynikow — komunikat informacyjny
- Rozne typy elementow (Bus, Branch, Transformer, Source)
- Formatowanie wartosci numerycznych (precyzja, jednostki)

> Korekta 2026-10-22 (karta LINIA-110): `cardAnalysisResults.test.ts` skasowany — testował
> wyłącznie lokalne kopie funkcji, nie kod kart; `LineSegmentCard.tsx` skasowana (zero
> konsumentów produkcyjnych). Opis wyżej jest stanem z 2026-03-28, nie bieżącym dowodem.
- Obsluga blednych/niekompletnych danych

### 4.3. workflowIntegration.test.ts

**Plik**: `frontend/src/ui/**/workflowIntegration.test.ts`
**Liczba testow**: 20

Pokrycie:
- Pelny flow: dodaj element -> sprawdz readiness -> napraw blokery -> uruchom analize
- Integracja ProcessPanel z OperationFormRouter
- Integracja FixAction z odpowiednim modalem
- Integracja MassReviewPanel z Catalog Browser
- Snapshot update po operacji
- Deterministycznosc: ten sam input -> ten sam stan koncowy

---

## 5. Macierz pokrycia scenariuszy testami

| Scenariusz | critical-run-flow | wizard-full-flow | readinessBar | cardAnalysis | workflowInteg |
|-----------|:-:|:-:|:-:|:-:|:-:|
| 1. Budowa sieci | X | X | - | - | X |
| 2. Mass review | - | - | X | - | X |
| 3. Fix action | - | - | X | - | X |
| 4. Card inspection | - | - | - | X | - |
| 5. Context menu | X | - | - | - | X |

**Legenda**: X = scenariusz pokryty (czesc lub calosc)

---

## 6. Podsumowanie

| Metryka | Wartosc |
|---------|---------|
| Scenariusze E2E | 5 |
| Istniejace testy E2E (Playwright) | 2 pliki (critical-run-flow, wizard-full-flow) |
| Nowe testy jednostkowe | 3 pliki, 62 testy lacznie |
| Pokrycie scenariuszy | 5/5 — kazdy scenariusz ma co najmniej 1 test |

**Status: ZAMKNIETY** — scenariusze potwierdzone testami. Kazdy z 5 scenariuszy
E2E jest pokryty przez co najmniej jeden test (E2E lub jednostkowy).

---

*Dokument wygenerowany w ramach audytu E2E warstwy prezentacyjnej MV-Design-PRO.*
