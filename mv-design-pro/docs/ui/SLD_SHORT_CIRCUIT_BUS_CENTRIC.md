# Prezentacja wyników zwarciowych: BUS-centric (CANONICAL)

**Status:** CANONICAL (BINDING)
**Wersja:** 1.1
**Data:** 2026-01-28
**Referencje:**
- `SLD_UI_CONTRACT.md` — kontrakty UI (priorytet BUS, gęstość, kolory, wydruk)
- `SLD_SCADA_CAD_CONTRACT.md` — kontrakt widoku SLD
- `SHORT_CIRCUIT_PANELS_AND_PRINTING.md` — panele i wydruk
- `P11_SC_CASE_MAPPING.md` — mapowanie na P11 (White Box)
- `EQUATIONS_IEC60909_SC3F.md` — równania IEC 60909

---

## 1. Cel i zakres dokumentu

Niniejszy dokument definiuje **wiążący kontrakt** dla prezentacji wyników obliczeń zwarciowych w systemie MV-DESIGN-PRO.

**Zasada fundamentalna:**

> Zwarcie jest **punktowe** (występuje w konkretnym węźle sieci).
> Wyniki zwarciowe są **BUS-centric** (przypisane do szyn, nie do linii).

Dokument jest **BINDING** dla:
- warstwy UI (overlay wyników zwarciowych),
- solverów zwarciowych (IEC 60909),
- warstwy analizy (Analysis layer),
- logiki wydruku i raportowania.

---

## 2. Terminologia (BINDING)

### 2.1 Podstawowe terminy

| Termin | Definicja | Przykład |
|--------|-----------|----------|
| **Zwarcie** | Nieprawidłowe połączenie między fazami lub fazą a ziemią, powodujące przepływ prądu zwarciowego | Zwarcie trójfazowe symetryczne (3F) |
| **Prąd zwarciowy początkowy** `Ik″` | Skuteczna wartość prądu zwarciowego w chwili t = 0 (bez tłumienia) | `Ik″ = 12.5 kA` |
| **Prąd zwarciowy udarowy** `ip` | Wartość szczytowa pierwszego półokres prądu zwarciowego (z uwzględnieniem składowej aperiodycznej) | `ip = 32.8 kA` |
| **Prąd zwarciowy cieplny** `Ith` | Prąd zastępczy do obliczeń obciążenia cieplnego (IEC 60909) | `Ith = 11.2 kA` |
| **Moc zwarciowa** `Sk″` | Moc pozorna zwarcia: `Sk″ = √3 · Un · Ik″` | `Sk″ = 325 MVA` |
| **BUS** | Szyna elektryczna, węzeł topologiczny sieci | Szyna rozdzielcza SN-01 |
| **BUS-centric** | Prezentacja wyników skupiona wokół szyn (węzłów), nie na liniach | Wyniki zwarciowe **tylko przy BUS** |
| **Case** | Przypadek obliczeniowy zwarciowy zgodny z IEC/PN-EN 60909 | MAX / MIN / N-1 |
| **Wkład** (contribution) | Udział poszczególnych elementów w prądzie zwarciowym w danym BUS | Wkład transformatora T-01 do `Ik″` w BUS B-02: 3.5 kA |
| **Punkt przyłączenia** (`GridConnectionPoint`) | Obiekt umowny na terminalu (ADR-027, K-19 V12K-347) — granica między siecią operatora a instalacją użytkownika; nie węzeł fizyki, nie parametr solvera | **BoundaryNode** = wyłącznie interpretacja warstwy analizy (`BoundaryIdentifier`), w SLD tylko nakładka wyniku |

### 2.2 Norma IEC/PN-EN 60909

**BINDING:**

Wszystkie obliczenia zwarciowe w systemie MV-DESIGN-PRO **MUSZĄ** być zgodne z:

- **IEC 60909-0:2016** — Obliczanie prądów zwarciowych w sieciach trójfazowych (część 0: Dane ogólne),
- **PN-EN 60909-0:2016** — Polska norma (identyczna z IEC).

**MUST:**
- Używać współczynnika napięciowego `c` zgodnie z IEC 60909 (Tabela 1).
- Uwzględniać impedancje wszystkich elementów sieci (linie, transformatory, źródła).
- Uwzględniać wkłady silników (jeśli istnieją w modelu).
- Obliczać `Ik″`, `ip`, `Ith` zgodnie z równaniami IEC 60909.

**FORBIDDEN:**
- Stosowanie metod uproszczonych niezgodnych z IEC 60909.
- Pomijanie impedancji transformatorów lub linii.
- Używanie stałej wartości `c` dla wszystkich węzłów (wartość `c` zależy od poziomu napięcia i odległości od źródła).

---

## 3. Zasada BUS-centric

### 3.1 Definicja

**CANONICAL:**

> Wyniki zwarciowe (`Ik″`, `ip`, `Ith`, `Sk″`) są **przypisane do szyn (BUS)**, nie do linii.

**Uzasadnienie:**

Zwarcie jest **punktowe** — występuje w konkretnym węźle sieci (szynie). Prąd zwarciowy jest **sumą wkładów** wszystkich elementów sieci (źródeł, transformatorów, linii) do tego węzła.

### 3.2 Reguła prezentacji

**MUST:**

Wyniki zwarciowe są wyświetlane **tylko przy BUS** (na diagramie SLD):

```
════════════════════════════════════════════════════════════
   Szyna SN-01 | 15 kV
   ───────────────────────────────────────────────────────
   Ik″ = 12.5 kA  │  ip = 32.8 kA  │  Sk″ = 325 MVA
   ───────────────────────────────────────────────────────
   Case: MAX (3F)
════════════════════════════════════════════════════════════
```

**FORBIDDEN:**

- Wyświetlanie `Ik″`, `ip`, `Ith`, `Sk″` na liniach (LineBranch).
- Wyświetlanie wyników zwarciowych w środku linii (sugeruje zwarcie w połowie przewodu, co jest błędne).

### 3.3 Linie: przepływy robocze, nie wyniki zwarciowe

**ALLOWED:**

Linie (LineBranch) **mogą** pokazywać:

| Parametr | Opis | Kiedy widoczne |
|----------|------|----------------|
| **Wkład do zwarcia** | Prąd przepływający przez linię w kierunku BUS ze zwarciem | Opcjonalnie, jeśli pomaga zrozumieć przepływ |
| **Kierunek wkładu** | Strzałka wskazująca kierunek przepływu prądu zwarciowego | Opcjonalnie |

**MUST:**

- Jeśli wkład jest pokazywany na linii → **musi być jasno oznaczony jako wkład** (np. `→ 3.5 kA do B-02`).
- Wkład **nie może** być mylony z wynikiem zwarciowym (wynik jest tylko przy BUS).

**FORBIDDEN:**

- Pokazywanie `Ik″` na linii (sugeruje, że zwarcie jest na linii, a nie w BUS).
- Pokazywanie prądu zwarciowego bez wskazania, do którego BUS jest wkładem.

---

## 4. Wyniki zwarciowe: cztery wartości kanoniczne

### 4.1 Kompletny zestaw wyników

**CANONICAL:**

Dla każdego BUS i każdego Case system **MUSI** obliczyć i wyświetlić:

| Wielkość | Symbol | Jednostka | Definicja |
|----------|--------|-----------|-----------|
| **Prąd zwarciowy początkowy** | `Ik″` | kA | Skuteczna wartość prądu w t=0 (IEC 60909) |
| **Prąd zwarciowy udarowy** | `ip` | kA | Wartość szczytowa (z uwzględnieniem składowej aperiodycznej) |
| **Prąd zwarciowy cieplny** | `Ith` | kA | Prąd zastępczy do obliczeń cieplnych (RMS) |
| **Moc zwarciowa** | `Sk″` | MVA | `Sk″ = √3 · Un · Ik″` |

### 4.2 Kolejność wyświetlania

**BINDING:**

Wartości są wyświetlane w następującej kolejności:

```
Ik″ = [wartość] kA  │  ip = [wartość] kA  │  Ith = [wartość] kA  │  Sk″ = [wartość] MVA
```

**Uzasadnienie:**
- `Ik″` — najważniejszy parametr (normatywny),
- `ip` — drugi w kolejności (dobór wyłączników),
- `Ith` — trzeci (obciążenie cieplne),
- `Sk″` — czwarty (moc pozorna, pomocnicza).

### 4.3 Precyzja wyświetlania

**MUST:**

| Wielkość | Precyzja | Przykład |
|----------|----------|----------|
| `Ik″` | 0.1 kA | `12.5 kA` |
| `ip` | 0.1 kA | `32.8 kA` |
| `Ith` | 0.1 kA | `11.2 kA` |
| `Sk″` | 1 MVA | `325 MVA` |

**FORBIDDEN:**
- Wyświetlanie z nadmierną precyzją (np. `12.4567 kA`).
- Wyświetlanie bez jednostek (np. `12.5` zamiast `12.5 kA`).

---

## 5. Case zwarciowe: MAX / MIN / N-1

### 5.1 Definicja Case

**CANONICAL:**

**Case** to zestaw założeń określających stan sieci i konfigurację źródeł w momencie zwarcia.

**MUST:**

Każdy projekt **musi** definiować co najmniej **trzy Case**:

| Case | Definicja | Cel |
|------|-----------|-----|
| **MAX** | Maksymalny prąd zwarciowy: wszystkie źródła aktywne (`in_service=True`), minimalna impedancja sieci | Dobór wyłączników (zdolność wyłączeniowa) |
| **MIN** | Minimalny prąd zwarciowy: minimalna liczba źródeł aktywnych, maksymalna impedancja sieci | Sprawdzenie czułości zabezpieczeń |
| **N-1** | Zwarcie przy wyłączeniu jednego elementu krytycznego (transformator, linia, źródło) | Analiza awaryjności |

### 5.2 MAX (maksymalny prąd zwarciowy)

**Definicja:**

> Przypadek obliczeniowy dający **największy możliwy prąd zwarciowy** w każdym węźle sieci.

**Założenia:**

- **Wszystkie źródła** są aktywne (`in_service=True`),
- **Wszystkie transformatory** są aktywne,
- **Wszystkie linie** są aktywne,
- Współczynnik napięciowy `c` = `cmax` (IEC 60909, Tabela 1):
  - `cmax = 1.10` dla sieci nn (Un ≤ 1 kV),
  - `cmax = 1.10` dla sieci SN (1 kV < Un ≤ 35 kV),
  - `cmax = 1.10` dla sieci WN (Un > 35 kV).

**Cel:**
- Dobór wyłączników (zdolność wyłączeniowa `Icu`),
- Dobór szyn zbiorczych (obciążenie termiczne i dynamiczne),
- Dobór przewodów (obciążenie termiczne).

### 5.3 MIN (minimalny prąd zwarciowy)

**Definicja:**

> Przypadek obliczeniowy dający **najmniejszy możliwy prąd zwarciowy** w każdym węźle sieci.

**Założenia:**

- **Minimalna liczba źródeł** aktywnych (np. tylko sieć zewnętrzna, bez PV/WIND/BESS),
- **Maksymalna impedancja sieci** (najdłuższe linie, największa odległość od źródła),
- Współczynnik napięciowy `c` = `cmin` (IEC 60909, Tabela 1):
  - `cmin = 0.95` dla sieci nn (Un ≤ 1 kV),
  - `cmin = 1.00` dla sieci SN (1 kV < Un ≤ 35 kV),
  - `cmin = 1.00` dla sieci WN (Un > 35 kV).

**Cel:**
- Sprawdzenie **czułości zabezpieczeń** (czy zabezpieczenia zadziałają przy minimalnym prądzie),
- Weryfikacja poprawności doboru przekładników prądowych,
- Analiza przypadków granicznych (długie linie zasilające).

### 5.4 N-1 (analiza awaryjności)

**Definicja:**

> Przypadek obliczeniowy symulujący **wyłączenie jednego elementu krytycznego** (transformator, linia, źródło).

**Założenia:**

- **Jeden element** jest wyłączony (`in_service=False`):
  - Transformator główny,
  - Linia zasilająca,
  - Jedno ze źródeł (np. PV, WIND, BESS).
- Pozostałe elementy są aktywne,
- Współczynnik napięciowy `c` = `cmax` (jak w Case MAX).

**Cel:**
- Analiza **awaryjności** sieci (czy sieć działa poprawnie przy wyłączeniu jednego elementu),
- Sprawdzenie **redundancji** zasilania,
- Weryfikacja scenariuszy serwisowych (wyłączenie transformatora do konserwacji).

**MUST:**

- Case N-1 **musi** jawnie opisywać, który element jest wyłączony (np. "N-1: Transformator T-01").
- System **musi** pozwalać na zdefiniowanie wielu wariantów N-1 (np. N-1 dla T-01, N-1 dla T-02, N-1 dla L-05).

**FORBIDDEN:**

- Ukrywanie, który element jest wyłączony (Case N-1 bez opisu).
- Automatyczne generowanie N-1 bez wyboru użytkownika (użytkownik musi wskazać element krytyczny).

### 5.5 Porównanie Case

**MUST:**

System **musi** umożliwiać porównanie wyników zwarciowych między Case:

| BUS | Case MAX (`Ik″`) | Case MIN (`Ik″`) | Case N-1 (`Ik″`) | Stosunek MAX/MIN |
|-----|------------------|------------------|------------------|------------------|
| B-01 | 12.5 kA | 8.2 kA | 10.3 kA | 1.52 |
| B-02 | 10.8 kA | 6.5 kA | 9.1 kA | 1.66 |
| B-03 | 9.2 kA | 5.1 kA | 7.8 kA | 1.80 |

**Uzasadnienie:**
- Inżynier musi widzieć **rozstęp** między MAX a MIN (jeśli stosunek > 2.0 → duża wrażliwość na konfigurację źródeł).
- Porównanie N-1 z MAX → analiza ryzyka (jeśli N-1 << MAX → wysoka redundancja).

---

## 6. Wkłady do zwarcia (contributions)

### 6.1 Definicja wkładu

**CANONICAL:**

**Wkład** (contribution) to udział poszczególnych elementów w prądzie zwarciowym w danym BUS.

**Równanie:**

```
Ik″(BUS) = ∑ contributions(i)
           i=1..N
```

Gdzie:
- `Ik″(BUS)` — całkowity prąd zwarciowy w BUS,
- `contributions(i)` — wkład i-tego elementu (źródło, transformator, linia).

### 6.2 Rodzaje wkładów

**MUST:**

System **musi** obliczać i wyświetlać wkłady dla następujących typów elementów:

| Typ elementu | Opis wkładu | Przykład |
|--------------|-------------|----------|
| **Source (GRID)** | Wkład sieci zewnętrznej | `5.8 kA` |
| **Source (PV/WIND/BESS)** | Wkład źródeł konwerterowych | `1.2 kA` |
| **TransformerBranch** | Wkład transformatora (przekazanie prądu z WN do SN/nn) | `3.5 kA` |
| **Motor** (jeśli istnieje) | Wkład silników asynchronicznych | `0.8 kA` |

**FORBIDDEN:**

- Pomijanie wkładów małych elementów (każdy wkład > 0.1 kA musi być pokazany).
- Sumowanie wkładów bez pokazania rozkładu (użytkownik musi widzieć, skąd pochodzi prąd).

### 6.3 Prezentacja wkładów

**MUST:**

Wkłady są prezentowane w **tabeli wkładów** (osobny panel lub sekcja w widoku wyników):

```
┌─────────────────────────────────────────────────────────┐
│ Wkłady do zwarcia w BUS B-02 (Case MAX)                │
├────────────────────────┬────────────┬───────────────────┤
│ Element                │ Wkład [kA] │ Udział [%]        │
├────────────────────────┼────────────┼───────────────────┤
│ Sieć zewnętrzna (GRID) │ 5.8        │ 46.4%             │
│ Transformator T-01     │ 3.5        │ 28.0%             │
│ PV-01                  │ 1.2        │ 9.6%              │
│ BESS-01                │ 0.8        │ 6.4%              │
│ Linia L-12 (z B-01)    │ 1.2        │ 9.6%              │
├────────────────────────┼────────────┼───────────────────┤
│ **SUMA**               │ **12.5**   │ **100.0%**        │
└────────────────────────┴────────────┴───────────────────┘
```

**Kolejność wkładów:**
- Od największego do najmniejszego (`contributions DESC`).

**Precyzja:**
- Wkład: 0.1 kA.
- Udział: 0.1%.

### 6.4 Wizualizacja wkładów na SLD

**ALLOWED:**

System **może** pokazywać wkłady na diagramie SLD jako overlay:

```
════════════════════════════════════════════════════════════
   BUS B-02 | Ik″ = 12.5 kA (MAX)
   ═══════════════════════════════════════════════════════
       ↑ 5.8 kA (GRID)
       ║
   ────┴──────────────────────────────────────
       ↑ 3.5 kA (T-01)
       ║
   ────┴──────────────────────────────────────
       ↑ 1.2 kA (PV-01)
       ║
════════════════════════════════════════════════════════════
```

**MUST:**
- Strzałki wskazują **kierunek przepływu prądu** (do BUS ze zwarciem).
- Wartości są wyświetlane **przy strzałkach** (nie na liniach).

**FORBIDDEN:**
- Mieszanie wkładów z przepływami roboczymi (power flow).
- Pokazywanie wkładów bez jasnego oznaczenia Case (MAX/MIN/N-1).

---

## 7. Współczynnik napięciowy `c` (IEC 60909)

### 7.1 Definicja

**CANONICAL:**

Współczynnik napięciowy `c` jest używany do obliczenia **ekwiwalentnego napięcia źródłowego** w momencie zwarcia:

```
Ueq = c · Un / √3
```

Gdzie:
- `Un` — napięcie znamionowe sieci,
- `c` — współczynnik napięciowy (zgodnie z IEC 60909, Tabela 1).

### 7.2 Wartości `c` (IEC 60909)

**BINDING:**

| Poziom napięcia | `cmax` (Case MAX) | `cmin` (Case MIN) |
|-----------------|-------------------|-------------------|
| **nn** (Un ≤ 1 kV) | 1.05 lub 1.10* | 0.95 |
| **SN** (1 kV < Un ≤ 35 kV) | 1.10 | 1.00 |
| **WN** (35 kV < Un ≤ 230 kV) | 1.10 | 1.00 |

\* 1.05 dla nn z tolerancją ±6%, 1.10 dla nn z tolerancją ±10%.

### 7.3 Reguła użycia

**MUST:**

- Współczynnik `c` jest używany **dokładnie raz** na początku obliczeń (anti-double-counting).
- `c` **nie jest** stosowany do impedancji elementów sieci (linii, transformatorów).
- `c` **nie jest** stosowany do źródeł konwerterowych (PV, WIND, BESS) — te źródła mają ograniczony prąd zwarciowy niezależny od `c`.

**FORBIDDEN:**

- Wielokrotne stosowanie `c` w różnych etapach obliczeń (błąd mnożenia).
- Używanie innej wartości `c` niż określona w IEC 60909 (chyba że norma krajowa wymaga inaczej).

---

## 8. Zwarcia niesymetryczne (opcjonalnie)

### 8.1 Rodzaje zwarć

**MUST:**

System **musi** obsługiwać następujące rodzaje zwarć:

| Rodzaj zwarcia | Symbol | Opis |
|----------------|--------|------|
| **Trójfazowe symetryczne** | 3F | Zwarcie między fazami L1-L2-L3 |
| **Dwufazowe** | 2F | Zwarcie między dwiema fazami (np. L1-L2) |
| **Jednofazowe** | 1F | Zwarcie faza-ziemia (np. L1-PE) |

**ALLOWED:**

- Ograniczenie MVP do zwarć 3F (najważniejsze dla doboru wyłączników).
- Rozszerzenie w przyszłości o 2F i 1F (zgodnie z IEC 60909-0 § 4.3).

### 8.2 Składowe symetryczne

**Referencja:**

Obliczenia zwarć niesymetrycznych (2F, 1F) wymagają metody **składowych symetrycznych** (sequence components):

- **Składowa zgodna** (positive sequence),
- **Składowa przeciwna** (negative sequence),
- **Składowa zerowa** (zero sequence).

**Dokument referencyjny:**
- `P11_1c_SC_ASYMMETRICAL.md` — szczegółowe równania i mapowanie na P11.

---

## 9. Integracja z SLD: overlay wyników

### 9.1 Tryby pracy SLD

**Referencja:** `sld_rules.md` § C, `SLD_SCADA_CAD_CONTRACT.md` § 3.3

| Tryb | Overlay wyników zwarciowych |
|------|----------------------------|
| **MODEL_EDIT** | UKRYTE (wyniki unieważnione) |
| **CASE_CONFIG** | UKRYTE (konfiguracja Case, brak wyników) |
| **RESULT_VIEW** | **WIDOCZNE** (wyniki zwarciowe aktywne) |

### 9.2 Layout overlay

**MUST:**

Overlay wyników zwarciowych zawiera:

1. **Wyniki przy BUS:**
   - `Ik″`, `ip`, `Ith`, `Sk″` (cztery wartości kanoniczne),
   - Case (MAX / MIN / N-1),
   - Kolor BUS (czerwony = wysoki prąd zwarciowy, zielony = niski).

2. **Wkłady na liniach (opcjonalnie):**
   - Strzałki z wartościami wkładów,
   - Kierunek przepływu.

3. **Panel wkładów:**
   - Tabela contributions (§ 6.3),
   - Suma = `Ik″(BUS)`.

**FORBIDDEN:**

- Mieszanie wyników różnych Case w jednym overlay (np. MAX i MIN jednocześnie bez separacji).
- Pokazywanie wyników bez Case (użytkownik musi wiedzieć, jaki Case jest aktywny).

### 9.3 Kolory wyników

**BINDING:**

| Wartość `Ik″` | Kolor BUS | Opis |
|---------------|-----------|------|
| `Ik″ < 5 kA` | **Zielony** | Niski prąd zwarciowy |
| `5 kA ≤ Ik″ < 15 kA` | **Żółty** | Średni prąd zwarciowy |
| `Ik″ ≥ 15 kA` | **Czerwony** | Wysoki prąd zwarciowy |

**ALLOWED:**

- Dostosowanie progów do specyfiki projektu (ustawienia użytkownika).
- Dodatkowe kolory dla wartości ekstremalnych (np. pomarańczowy dla `Ik″ > 25 kA`).

---

## 10. Wydruk wyników zwarciowych

**Referencja:** `SHORT_CIRCUIT_PANELS_AND_PRINTING.md`

### 10.1 Format wydruku

**MUST:**

Strona PDF zawiera:

1. **Fragment SLD** z overlay wyników (BUS-centric),
2. **Tabela wyników** (wszystkie BUS + Case MAX/MIN/N-1),
3. **Tabela wkładów** (dla wybranych BUS),
4. **Metadane:**
   - Norma: IEC/PN-EN 60909,
   - Data obliczeń,
   - Snapshot ID,
   - Trace ID (P11).

### 10.2 Zasada 1:1

**CANONICAL:**

> Wydruk = snapshot UI bez utraty informacji.

**MUST:**
- Wszystko, co widoczne na ekranie → widoczne w PDF.
- Tabele wkładów → pełne (nie obcięte).
- Kolory BUS → zachowane w PDF (jeśli drukarka kolorowa) lub zastąpione wzorami (jeśli monochromatyczna).

---

## 11. Mapowanie na P11 (White Box)

**Referencja:** `P11_SC_CASE_MAPPING.md`

### 11.1 ProofDocument dla każdego (BUS, Case)

**CANONICAL:**

Każda para **(BUS, Case)** generuje osobny **ProofDocument** w systemie P11:

```json
{
  "proof_id": "SC_B-02_MAX_20260128T123045",
  "bus_id": "B-02",
  "case": "MAX",
  "result": {
    "Ik_biprim": 12.5,
    "ip": 32.8,
    "Ith": 11.2,
    "Sk_biprim": 325.0
  },
  "contributions": [
    {"element": "GRID", "value": 5.8},
    {"element": "T-01", "value": 3.5},
    {"element": "PV-01", "value": 1.2}
  ],
  "equations": [
    {"eq_id": "IEC60909_Ik_biprim", "trace_id": "..."},
    {"eq_id": "IEC60909_ip", "trace_id": "..."}
  ],
  "snapshot": {
    "network_hash": "abc123...",
    "timestamp": "2026-01-28T12:30:45Z"
  }
}
```

### 11.2 Trace ID dla każdej liczby

**MUST:**

- Każda wartość (`Ik″`, `ip`, `Ith`, `Sk″`) ma **trace_id** wskazujący na równanie i dane wejściowe.
- Użytkownik może kliknąć wartość → otworzyć Proof Inspector → zobaczyć dowód (równanie + dane).

**Dokument referencyjny:**
- `P11_1d_PROOF_UI_EXPORT.md` — Proof Inspector (read-only viewer).

---

## 12. Podsumowanie reguł (checklist)

**Implementacja zgodna z SLD_SHORT_CIRCUIT_BUS_CENTRIC, jeśli:**

- [ ] Wyniki zwarciowe (`Ik″`, `ip`, `Ith`, `Sk″`) są wyświetlane **tylko przy BUS** (nie na liniach).
- [ ] Każdy BUS + Case generuje **cztery wartości kanoniczne**: `Ik″`, `ip`, `Ith`, `Sk″`.
- [ ] System obsługuje **co najmniej trzy Case**: MAX, MIN, N-1.
- [ ] Case N-1 **jawnie opisuje**, który element jest wyłączony.
- [ ] Wkłady do zwarcia są obliczane i wyświetlane w **tabeli contributions**.
- [ ] Współczynnik napięciowy `c` jest używany zgodnie z IEC 60909 (raz, na początku obliczeń).
- [ ] Overlay wyników jest aktywny **tylko w trybie RESULT_VIEW**.
- [ ] Wydruk (PDF) zawiera: fragment SLD + tabela wyników + tabela wkładów + metadane.
- [ ] Każda para (BUS, Case) ma osobny **ProofDocument** w P11.
- [ ] Każda wartość ma **trace_id** (dowodowo).

---

## 13. Integracja z kontraktami UI (SLD_UI_CONTRACT.md)

### 13.1 Pozycja dokumentu

**BINDING:**

`SLD_SHORT_CIRCUIT_BUS_CENTRIC.md` (ten dokument) definiuje **prezentację wyników zwarciowych** (BUS-centric, Case, wkłady).

`SLD_UI_CONTRACT.md` definiuje **kontrakty renderowania** (priorytety, gęstość, kolory, wydruk, interakcja).

Oba dokumenty są **komplementarne** i obowiązują równocześnie.

### 13.2 UI Priority Stack: BUS ma absolutny priorytet

**BINDING:**

Zgodnie z `SLD_UI_CONTRACT.md` § 3 (UI Priority Stack):

> **BUS (wyniki zwarciowe, stan) > LINIA (prąd roboczy) > CAD (parametry katalogowe)**

**Implikacje dla prezentacji wyników zwarciowych:**

1. Wyniki zwarciowe przy BUS (`Ik″`, `ip`, `Ith`, `Sk″`) **MUSZĄ** być widoczne zawsze (§ 4.1 tego dokumentu).
2. Wyniki BUS **nigdy nie są ukryte** ani przesuwane do SIDE STACK (§ 3.2 tego dokumentu).
3. W przypadku kolizji z etykietami CAD → **CAD ustępuje miejsca** (przesunięcie OFFSET lub SIDE STACK).

**Przykład (zgodny z § 9.3):**

```
════════════════════════════════════════════════════════════
   Szyna SN-01 | 15 kV                      [PRIORYTET 1: BUS]
   ───────────────────────────────────────────────────────
   Ik″ = 12.5 kA  │  ip = 32.8 kA  │  Sk″ = 325 MVA
   ───────────────────────────────────────────────────────
   ↑ Absolutny priorytet wizualny (ZAWSZE INLINE/OFFSET)

                     ┌─────────────────────┐
          ╭─ ─ ─ ─ ─ │ CAD: Główna         │
          │          │ Izolowana           │
══════════┴══════════┴─────────────────────┴══════════════
                     ↑ CAD ustępuje miejsca (OFFSET)
```

### 13.3 Dense SLD: Wyniki BUS NIE są przesuwane do SIDE STACK

**BINDING:**

Zgodnie z `SLD_UI_CONTRACT.md` § 4 (Dense SLD Rules):

- Gęstość diagramu **nie wpływa** na widoczność wyników BUS.
- Wyniki BUS pozostają **INLINE lub OFFSET** niezależnie od gęstości.
- Tylko etykiety CAD mogą być przesuwane do SIDE STACK (§ 5 `SLD_SCADA_CAD_CONTRACT.md`).

**Reguła BINDING:**

| Gęstość diagramu | Etykiety CAD | Wyniki BUS |
|------------------|--------------|-----------|
| < 0.10 elem/cm² | INLINE | INLINE |
| 0.10 – 0.20 elem/cm² | OFFSET | INLINE |
| > 0.20 elem/cm² | SIDE STACK | **INLINE** (absolutny priorytet) |

### 13.4 Semantic Color: Kolory wyników zwarciowych

**BINDING:**

Zgodnie z `SLD_UI_CONTRACT.md` § 5 (Semantic Color Contract):

Kolor BUS w trybie zwarciowym oznacza **poziom prądu zwarciowego** (zgodnie z § 9.3 tego dokumentu):

| Wartość `Ik″` | Kolor BUS | Semantyka |
|---------------|-----------|-----------|
| `Ik″ < 5 kA` | **Zielony** | Niski prąd zwarciowy |
| `5 kA ≤ Ik″ < 15 kA` | **Żółty** | Średni prąd zwarciowy |
| `Ik″ ≥ 15 kA` | **Czerwony** | Wysoki prąd zwarciowy |

**FORBIDDEN:**

- Kolorowanie BUS według typu (np. "wszystkie BUS czerwone bo to SN").
- Używanie kolorów bez semantyki (np. "niebieski bo ładnie wygląda").

### 13.5 Print-First: Wyniki BUS na wydruku

**BINDING:**

Zgodnie z `SLD_UI_CONTRACT.md` § 6 (Print-First Contract):

> **Ekran = PDF = prawda projektu**

**Implikacje dla wydruku (§ 10 tego dokumentu):**

- Wszystkie wyniki BUS widoczne na ekranie **MUSZĄ** być widoczne w PDF (żadne auto-hide).
- Tabela wyników (§ 10.1) **MUSI** zawierać wszystkie BUS + Case MAX/MIN/N-1.
- Tabela wkładów (§ 6.3) **MUSI** być pełna (nie obcięta).

**Format wydruku (zgodny z § 10.1):**

```
PDF (A4, strona 1/2):

┌─────────────────────────────────────────────────────────┐
│ Projekt: Stacja SN-01        Data: 2026-01-28 12:30:45 │
│ Case: MAX (3F)               Norma: IEC 60909          │
└─────────────────────────────────────────────────────────┘

════════════════════════════════════════════════════════════
   Szyna SN-01 | 15 kV
   Ik″ = 12.5 kA  │  ip = 32.8 kA  │  Sk″ = 325 MVA
════════════════════════════════════════════════════════════

[Tabela wyników]
┌─────────┬─────────┬─────────┬─────────┬─────────┐
│ BUS     │ Ik″ [kA]│ ip [kA] │ Ith [kA]│ Sk″ [MVA]│
├─────────┼─────────┼─────────┼─────────┼─────────┤
│ B-01    │ 12.5    │ 32.8    │ 11.2    │ 325     │
│ B-02    │ 10.8    │ 28.3    │ 9.7     │ 280     │
└─────────┴─────────┴─────────┴─────────┴─────────┘

──────────────────────────────────────────────────────────
Strona 1/2        Trace ID: trace_SC_MAX_20260128_123045
```

### 13.6 Interaction Contract: Hover, Click, ESC

**BINDING:**

Zgodnie z `SLD_UI_CONTRACT.md` § 7 (Interaction Contract):

- **Hover nad BUS** → tooltip z wynikami zwarciowymi (§ 4.1 tego dokumentu):

```
┌─────────────────────────────────────────────┐
│ Szyna SN-01                                 │
├─────────────────────────────────────────────┤
│ [WYNIKI ZWARCIOWE - Case MAX]              │
│ Ik″ = 12.5 kA                               │
│ ip  = 32.8 kA                               │
│ Ith = 11.2 kA                               │
│ Sk″ = 325 MVA                               │
├─────────────────────────────────────────────┤
│ [WKŁADY]                                    │
│ GRID:  5.8 kA (46.4%)                       │
│ T-01:  3.5 kA (28.0%)                       │
│ PV-01: 1.2 kA (9.6%)                        │
└─────────────────────────────────────────────┘
```

- **Click na BUS** → fokus + panel boczny z pełnymi danymi (§ 6.3, tabela wkładów).
- **ESC** → zamknięcie panelu, powrót do widoku ogólnego.

**FORBIDDEN:**

- Hover zmieniający stan (np. hover otwiera panel wkładów — to tylko Click może zrobić).
- Click bez wizualnej informacji zwrotnej (brak podświetlenia BUS).

---

**KONIEC DOKUMENTU SLD_SHORT_CIRCUIT_BUS_CENTRIC.md**
**Status:** CANONICAL (BINDING)
**Dokument jest źródłem prawdy dla prezentacji wyników zwarciowych w MV-DESIGN-PRO.**
