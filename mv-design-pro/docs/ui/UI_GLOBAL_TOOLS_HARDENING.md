# Narzedzia globalne — hardening

> **Dokument**: UI_GLOBAL_TOOLS_HARDENING.md
> **Status**: ZAMKNIETY
> **Data audytu**: 2026-03-28
> **Warstwa**: Presentation Layer (Global Tools & Top Context Bar)

---

## 1. Zakres audytu

Niniejszy dokument opisuje stan hardeningu narzedzi globalnych aplikacji MV-Design-PRO,
tj. komponentow dostepnych z poziomu glownego paska kontekstowego (TopContextBar)
niezaleznie od aktualnie otwartego widoku.

Audyt obejmuje:
- TopContextBar — struktura i zawartosc
- GlobalSearch — wyszukiwanie globalne
- MassReviewPanel — przeglad masowy
- ProjectMetadataModal — edycja metadanych projektu
- SnapshotHistoryModal — historia operacji

---

## 2. TopContextBar

> **Stan 2026-10-15:** komponent skasowany (karta TUSZ-POD-TLO-JASNE) — od zastapienia przez
> `ui/shell/WorkflowContextStrip.tsx` nie mial konsumenta produkcyjnego (tylko eksport z barrela
> i testy). Ponizszy opis jest historyczny.

### 2.1. Struktura paska

TopContextBar jest stalym komponentem widocznym w gornej czesci aplikacji.
Wyswietla kluczowe informacje kontekstowe i zapewnia szybki dostep do narzedzi globalnych.

| Sekcja | Zawartosc | Pozycja |
|--------|-----------|---------|
| Projekt | `projectName` — nazwa aktywnego projektu | Lewa strona |
| Case | `caseName` — nazwa aktywnego Study Case | Lewa strona, po nazwie projektu |
| Build Phase | Badge z aktualnym etapem budowy sieci | Srodek-lewo |
| Blockers | Licznik blokerow readiness (czerwony badge) | Srodek |
| Network Stats | Statystyki sieci (buses, branches, sources, loads) | Srodek-prawo |
| Quick Actions | Przyciski szybkich akcji (patrz 2.2) | Prawa strona |

### 2.2. Quick Actions

| Akcja | Skrot | Ikona | Opis |
|-------|-------|-------|------|
| Search | `Ctrl+K` | Lupa | Otwiera GlobalSearch |
| Catalog | — | Katalog | Otwiera Catalog Browser |
| Mass Reviews | — | Checklist | Otwiera MassReviewPanel |
| History | — | Zegar | Otwiera SnapshotHistoryModal |

### 2.3. Reaktywnosc

TopContextBar subskrybuje nastepujace stany Zustand:
- `activeProject` — nazwa i ID projektu
- `activeCase` — nazwa i status aktywnego Case
- `readinessBlockers` — liczba aktualnych blokerow
- `networkStats` — agregowane statystyki modelu

Aktualizacja jest natychmiastowa (Zustand subscription) — brak pollingu.

---

## 3. GlobalSearch

### 3.1. Aktywacja

- Skrot klawiaturowy: **Ctrl+K**
- Przycisk w TopContextBar (ikona lupy)
- Otwarcie wyswietla modal z polem wyszukiwania w trybie focus

### 3.2. Zakres wyszukiwania

GlobalSearch przeszukuje nastepujace kategorie elementow modelu:

| Kategoria | Przeszukiwane pola | Priorytet |
|-----------|-------------------|-----------|
| Buses | name, id, voltage level | 1 (najwyzszy) |
| Branches | name, id, from_bus, to_bus | 2 |
| Transformers | name, id, type_name, rating | 3 |
| Sources | name, id, type (grid/generator/inverter) | 4 |
| Loads | name, id, power rating | 5 |
| Generators | name, id, rated power, type | 6 |
| Substations | name, id, voltage levels | 7 |

### 3.3. Algorytm wyszukiwania

- **Metoda**: Fuzzy search (tolerancja na literowki i czesciowe dopasowania)
- **Ranking**: Wyniki sortowane wg trafnosci (score) z priorytetem kategorii
- **Grupowanie**: Wyniki prezentowane w grupach per kategoria
- **Limit**: Maksymalnie 50 wynikow (10 per kategoria)

### 3.4. Nawigacja do elementu

Po wybraniu wyniku z listy:
1. Modal GlobalSearch zamyka sie
2. SLD centruje widok na wybranym elemencie (pan + zoom)
3. Element zostaje zaznaczony (selection state)
4. ObjectCard otwiera sie z wlasciwosciami elementu

---

## 4. MassReviewPanel

### 4.1. Struktura zakladek

MassReviewPanel udostepnia 6 zakladek do masowego przegladu i korekty modelu:

| # | Zakladka | Klucz | Opis |
|---|----------|-------|------|
| 1 | Catalog | `catalog` | Elementy z brakujacym powiazaniem katalogowym |
| 2 | Transformers | `transformers` | Przeglad transformatorow — parametry, typy, obciazalnosc |
| 3 | Switches | `switches` | Przeglad lacznikow — stany, typy, nastawy |
| 4 | OZE | `oze` | Zrodla odnawialne — moc, cos(phi), tryb pracy |
| 5 | Readiness | `readiness` | Blokery gotowosci do analizy |
| 6 | Stations | `stations` | Kompletnosc stacji — pola, szyny, zabezpieczenia |

### 4.2. Szczegoly zakladek

#### 4.2.1. Catalog (brakujace)

Wyswietla liste elementow, ktore nie maja przypisanego typu katalogowego.
Zgodnie z Catalog Binding Rule, wszystkie elementy musza byc powiazane z typem z katalogu.

- **Widok**: Tabela z kolumnami: Element, Typ, Status, Akcja
- **Akcja**: Przycisk "Assign" otwiera Catalog Browser z prefiltrowaniem

#### 4.2.2. Transformers

Przeglad wszystkich transformatorow w modelu:
- Parametry znamionowe (Sn, Uk%, Pcu, tapPosition)
- Zgodnosc z typem katalogowym
- Obciazalnosc wzgledem obliczen (jesli dostepne wyniki)

#### 4.2.3. Switches

Przeglad lacznikow:
- Stan (OPEN/CLOSED/UNKNOWN)
- Typ (Breaker/Disconnector/Fuse/BusCoupler)
- Nastawy zabezpieczen (jesli przypisane)

#### 4.2.4. OZE

Zrodla odnawialne (PVInverter, BESSInverter, GeneratorSync):
- Moc znamionowa i aktualna
- cos(phi) i tryb regulacji
- Punkt przylaczenia

#### 4.2.5. Readiness (blokery)

Lista wszystkich blokerow uniemozliwiajacych uruchomienie analizy:
- Typ blokera (MISSING_CATALOG, INCOMPLETE_PARAMS, TOPOLOGY_ERROR, itp.)
- Element zrodlowy
- Przycisk "Fix" uruchamiajacy FixAction flow

#### 4.2.6. Stations (kompletnosc)

Przeglad kompletnosci stacji:
- Liczba pol (BaySN, BayNN)
- Przypisane transformatory
- Kompletnosc zabezpieczen
- Status gotowosci

---

## 5. ProjectMetadataModal

### 5.1. Funkcjonalnosc

Modal do edycji metadanych projektu:

| Pole | Typ | Walidacja |
|------|-----|-----------|
| Nazwa projektu | string | Required, max 100 znakow |
| Opis | string (textarea) | Optional, max 500 znakow |
| Autor | string | Optional |
| Wersja | string (semver) | Format X.Y.Z |
| Data utworzenia | date | Read-only |
| Data modyfikacji | date | Auto-update |

### 5.2. Persystencja

Metadane projektu zapisywane sa w project store (Zustand) i synchronizowane
z backendem przez API `/api/projects/{id}/metadata`.

---

## 6. SnapshotHistoryModal

### 6.1. Aktualny stan

**Status: PLACEHOLDER**

SnapshotHistoryModal jest zaimplementowany jako komponent UI, ale wyswietla
komunikat informacyjny o braku danych historycznych.

### 6.2. Uzasadnienie

Backend nie dostarcza obecnie endpointu historii operacji (snapshot history).
Mechanizm undo/redo dziala w pamieci (in-memory) i nie persystuje historii
miedzy sesjami.

### 6.3. Planowane rozszerzenie

Docelowo SnapshotHistoryModal powinien wyswietlac:
- Liste operacji z timestampami
- Mozliwosc rollbacku do wybranego snapshotu
- Diff miedzy snapshotami

Wymaga implementacji backendowej (poza zakresem obecnego audytu).

---

## 7. Podsumowanie

| Komponent | Stan | Hardening |
|-----------|------|-----------|
| TopContextBar | Skasowany 2026-10-15 | Brak konsumenta produkcyjnego; role przejely `ui/shell/WorkflowContextStrip.tsx` i `ui2/shell/StatusBar.tsx` |
| GlobalSearch (Ctrl+K) | Produkcyjny | Pelny — fuzzy search, nawigacja, grupowanie |
| MassReviewPanel | Produkcyjny | Pelny — 6 zakladek, akcje naprawcze |
| ProjectMetadataModal | Produkcyjny | Pelny — edycja i walidacja metadanych |
| SnapshotHistoryModal | Placeholder | Brak backendu — wyswietla komunikat informacyjny |

**Status: ZAMKNIETY** — wszystkie narzedzia globalne (oprocz SnapshotHistory) sa w pelni
operacyjne i zahardowane. SnapshotHistory wymaga pracy backendowej.

---

*Dokument wygenerowany w ramach audytu UI warstwy prezentacyjnej MV-Design-PRO.*
