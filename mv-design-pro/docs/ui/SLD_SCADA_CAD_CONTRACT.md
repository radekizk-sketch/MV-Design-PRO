# SLD SCADA + CAD: Kontrakt Widoku (CANONICAL)

**Status:** CANONICAL (BINDING)
**Wersja:** 1.1
**Data:** 2026-01-28
**Referencje:**
- `SLD_UI_CONTRACT.md` — kontrakty UI (priorytet, gęstość, kolory, wydruk, interakcja)
- `sld_rules.md` — podstawowe reguły SLD
- `wizard_screens.md` — tryby pracy
- `SHORT_CIRCUIT_PANELS_AND_PRINTING.md` — wydruk
- `../sld/STACJE_ELEKTROENERGETYCZNE_PROJECT_STANDARD.md` - standard projektowania stacji: GPZ, szyny, pola SN, aparatura, zabezpieczenia, sterowanie, sygnalizacja i zakaz atrap schematowych

---

## 1. Cel i zakres dokumentu

Niniejszy dokument definiuje **wiążący kontrakt** między dwoma aspektami widoku SLD (Single Line Diagram):

1. **SCADA SLD** — operatorski, wizualizacja stanu i wyników,
2. **CAD overlay** — techniczny, parametry katalogowe i geometryczne.

Dokument jest **BINDING** dla:
- implementacji warstwy UI (SLD renderer),
- logiki prezentacji wyników analiz (overlay),
- logiki wydruku (PDF/DOCX),
- wszystkich dokumentów referencyjnych (ARCHITECTURE.md, SYSTEM_SPEC.md).

---

## 2. Terminologia (BINDING)

### 2.1 Podstawowe terminy

| Termin | Definicja | Przykład |
|--------|-----------|----------|
| **SCADA SLD** | Warstwowy widok SLD w stylu systemów SCADA/benchmark/SmartCollect: neonowe kolory, stan operacyjny, przepływy mocy, wizualizacja pracy sieci | Szyny kolorowe, przepływy prądu z kierunkiem, kolor czerwony = przeciążenie |
| **CAD overlay** | Nakładka techniczna zawierająca parametry katalogowe, impedancje, długości, przekroje kabli, dane konstrukcyjne | R/X/B linii, długość kabla, typ przekroju |
| **BoundaryNode** | Węzeł przyłączenia (Point of Common Coupling) — granica między siecią operatora a instalacją użytkownika. **ZAWSZE używaj terminu BoundaryNode**, nigdy "punkt przyłączenia", "granica", itp. | BoundaryNode przy złączu SN/nn |
| **BUS** | Szyna elektryczna (busbar), węzeł topologiczny sieci | Szyna rozdzielcza 15 kV |
| **BUS-centric** | Prezentacja wyników skupiona wokół szyn jako punktów węzłowych (nie na liniach) | Wyniki zwarciowe `Ik″` wyświetlane **tylko przy BUS** |
| **Case** | Przypadek obliczeniowy zgodny z IEC/PN-EN 60909 | MAX / MIN / N-1 |
| **Overlay** | Warstwa graficzna nakładana na bazowy SLD, zawierająca adnotacje wynikowe lub techniczne | Overlay z wartościami prądów zwarciowych |

### 2.2 Style etykiet CAD

| Styl | Definicja | Kiedy stosować |
|------|-----------|----------------|
| **INLINE** | Etykiety umieszczone **bezpośrednio na symbolu lub linii**, bez oddzielenia | **Domyślnie** — dla normalnej gęstości elementów |
| **OFFSET (leader)** | Etykiety przesunięte z linią wiodącą (leader line) | **Automatyczny fallback** — przy dużej gęstości, kolizjach |
| **SIDE STACK** | Etykiety zebrane w tabeli bocznej, referencje numeryczne na diagramie | **Audyt/dokument** — wydruki z wymaganą czytelnością |

---

## 3. Zasada fundamentalna: Dwa aspekty widoku

### 3.1 SCADA SLD (aspekt operatorski)

**MUST:**
- Używać kolorów wskazujących stan operacyjny (zielony, żółty, czerwony).
- Pokazywać **aktualny stan** elementów:
  - `in_service=True` → normalny wygląd,
  - `in_service=False` → wyszarzony, linia przerywana.
- Pokazywać **wyniki analiz** jako overlay:
  - przepływy prądów i mocy,
  - kierunki przepływu (strzałki),
  - wartości zwarciowe przy BUS,
  - kolory przeciążenia (loading).
- Używać symboli zgodnych z `sld_rules.md` § A.2.

**FORBIDDEN:**
- Przedstawianie parametrów katalogowych (R/X/B, przekrój kabla, typ linii) jako podstawowej informacji w warstwę SCADA.
- Używanie szarych, monotonnych kolorów (z wyjątkiem `in_service=False`).
- Mieszanie wyników różnych Case w jednym widoku bez jawnej separacji.

### 3.2 CAD overlay (aspekt techniczny)

**MUST:**
- Pokazywać parametry **katalogowe** każdego elementu:
  - typ, długość, przekrój, R/X/B dla linii,
  - moc znamionowa, napięcie, grupa połączeń dla transformatorów,
  - parametry źródeł (Sn, Un, typ konwertera).
- Używać **czcionek inżynieryjnych** (sans-serif, monospace dla liczb).
- Umieszczać etykiety według reguł § 5 (INLINE → OFFSET → SIDE STACK).
- Duplikować informacje między SCADA a CAD **tylko jeśli poprawia to czytelność** (np. `in_service` jako tekst + kolor).

**FORBIDDEN:**
- Ukrywanie parametrów katalogowych za interakcją (hover, click), chyba że gęstość wymusza fallback.
- Pomijanie jednostek (zawsze: `120 A`, `2.5 km`, `0.15 Ω/km`).
- Używanie skrótów niejednoznacznych (np. `R` bez `Ω/km`).

### 3.3 Integracja SCADA + CAD

**Reguła złotego środka:**

> **Wszystko, co jest widoczne na ekranie, MUSI trafić na wydruk.**
> Wydruk = snapshot UI bez utraty informacji.

**MUST:**
- Oba aspekty (SCADA + CAD) są **zawsze aktywne równocześnie**.
- Użytkownik widzi:
  - stan operacyjny (SCADA),
  - parametry techniczne (CAD),
  - wyniki analiz (overlay).
- Renderer renderuje oba aspekty jako jedną warstwę kompozytową.

**ALLOWED:**
- Tymczasowe wyłączenie CAD overlay w trybie edycji (MODEL_EDIT), jeśli upraszcza UX.
- Automatyczny fallback do OFFSET/SIDE STACK przy ekstremalnej gęstości.

**FORBIDDEN:**
- Ukrywanie CAD overlay jako domyślne zachowanie.
- Wymaganie ręcznego włączania CAD overlay przez użytkownika.
- Wyświetlanie SCADA bez CAD w trybie RESULT_VIEW.

---

## 4. Zasada "Wszystko widoczne zawsze"

### 4.1 Definicja

**CANONICAL:**

> Wszystkie istotne informacje o elementach sieci (stan, parametry, wyniki) są **widoczne na diagramie** bez konieczności interakcji (hover, click).

### 4.2 Co jest "istotne"?

**MUST być widoczne:**

| Element sieci | Informacje widoczne (SCADA) | Informacje widoczne (CAD) |
|---------------|----------------------------|---------------------------|
| **Bus** | Nazwa, napięcie Un, kolor stanu | Typ szyny (główna/rozdzielcza) |
| **LineBranch** | Prąd roboczy I [A], kierunek, kolor loading | Długość [km], R/X/B [Ω/km], przekrój [mm²] |
| **TransformerBranch** | Prąd I [A], loading [%] | Sn [MVA], Un1/Un2 [kV], uk [%], grupa |
| **Source** | P/Q [MW/Mvar], kierunek | Sn [MVA], Un [kV], typ (grid/PV/WIND/BESS) |
| **Load** | P/Q [MW/Mvar] | Typ obciążenia, cosφ |
| **Switch** | Stan (OPEN/CLOSED) | Typ (wyłącznik, odłącznik, bezpiecznik) |

**MUST być widoczne w trybie zwarciowym:**

| Element | Informacje widoczne |
|---------|---------------------|
| **Bus** | `Ik″`, `ip`, `Ith`, `Sk″` — **zawsze przy BUS** |
| **LineBranch** | Wkład do `Ik″` w BUS docelowym (opcjonalnie, jeśli pomaga zrozumieć przepływ) |

### 4.3 ON-DEMAND jako awaryjny fallback

**BINDING:**

ON-DEMAND (wyświetlanie informacji dopiero po hover/click) jest **DOZWOLONE WYŁĄCZNIE** w następujących przypadkach:

1. **Ekstremalna gęstość diagramu** — gdy liczba elementów na jednostkę powierzchni przekracza próg czytelności (zdefiniowany jako: etykiety nakładają się w >30% przypadków przy INLINE).
2. **Szczegóły pomocnicze** — np. szczegółowe parametry katalogowe (rezystancja termiczna, prąd dynamiczny), które nie są kluczowe dla podstawowej analizy.
3. **Historia wyników** — porównanie Case A vs Case B w tym samym BUS (panel boczny, nie main diagram).

**FORBIDDEN:**
- ON-DEMAND jako **domyślny sposób prezentacji** parametrów kluczowych (R/X/B, Sn, `Ik″`).
- ON-DEMAND jako sposób na "uproszenie" UI kosztem dostępności informacji.

**Reguła:**
> Jeśli informacja jest kluczowa dla zrozumienia sieci lub wyników → **MUST być widoczna**.
> Jeśli informacja jest pomocnicza lub rzadko używana → **MAY być ON-DEMAND**.

---

## 5. Etykiety CAD: INLINE → OFFSET → SIDE STACK

### 5.1 Hierarchia trybów

**CANONICAL:**

System wybiera tryb prezentacji etykiet CAD według następującej hierarchii:

```
┌─────────────────────────────────────────────────────────────┐
│  1. INLINE (domyślnie)                                       │
│     └─> Jeśli kolizja > 30% → przejdź do 2                  │
│                                                              │
│  2. OFFSET (leader line)                                     │
│     └─> Jeśli kolizja > 50% → przejdź do 3                  │
│                                                              │
│  3. SIDE STACK (tabela boczna)                               │
│     └─> Używane zawsze w trybie audytu/wydruku              │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 INLINE (tryb domyślny)

**Definicja:**
Etykiety umieszczone bezpośrednio na symbolu lub wzdłuż linii, bez oddzielenia.

**MUST:**
- Etykieta jest częścią symbolu (rendering atomowy).
- Tekst jest czytelny przy standardowym zoomie (100%).
- Parametry są uporządkowane wertykalnie lub horyzontalnie wg stałego schematu.

**Przykład (LineBranch INLINE):**
```
────────────────────────────────────────
  L = 2.5 km, 3×150 mm² Cu
  R = 0.124 Ω/km, X = 0.08 Ω/km
────────────────────────────────────────
```

**Przykład (Bus INLINE):**
```
════════════════════════════════════════
   Szyna SN-01 | 15 kV | U = 14.85 kV
════════════════════════════════════════
```

### 5.3 OFFSET (leader line)

**Definicja:**
Etykiety przesunięte poza symbol, z linią wiodącą (leader) wskazującą element.

**Kiedy stosować:**
- Automatyczny fallback, gdy **INLINE powoduje kolizje** (nakładanie się tekstu).
- Gęstość elementów wysoka, ale nie krytyczna.

**MUST:**
- Leader line (linia wiodąca) jest **cienka, przerywana** (nie mylić z linią elektryczną).
- Etykieta jest w prostokątnym polu z tłem (białym lub półprzeźroczystym).
- Odległość od symbolu: min 10 px, max 50 px.

**Przykład (OFFSET):**
```
                     ┌─────────────────────┐
                     │ Linia L-12          │
          ╭─ ─ ─ ─ ─ │ L = 3.2 km          │
          │          │ 3×185 mm² Al        │
          │          │ R = 0.164 Ω/km      │
──────────┴──────────┴─────────────────────┴──────
```

### 5.4 SIDE STACK (tabela boczna)

**Definicja:**
Wszystkie etykiety zebrane w tabeli bocznej (panel), elementy na diagramie mają **referencje numeryczne** (ID).

**Kiedy stosować:**
- **Audyt/dokument** — wydruk do dokumentacji projektowej, raporty.
- **Ekstremalna gęstość** — gdy OFFSET nie rozwiązuje problemu kolizji.
- **Porównania** — wyświetlanie Case A vs Case B w tabeli bocznej.

**MUST:**
- Każdy element na diagramie ma unikalny **identyfikator numeryczny** (np. L-12, T-03, B-05).
- Tabela boczna zawiera **wszystkie parametry** danego elementu.
- Kliknięcie ID w tabeli → podświetlenie elementu na diagramie.
- Kliknięcie elementu na diagramie → podświetlenie wiersza w tabeli.

**Przykład (SIDE STACK):**

```
┌───────────────────────────────────┬─────────────────────────┐
│ Diagram                           │ Tabela parametrów       │
│                                   │                         │
│   ════╦════════════════╦════      │ ID  │ Element │ L [km] │
│       ║                ║          │ ────┼─────────┼────────│
│     [L-12]          [L-15]        │ L-12│ Linia   │ 3.2    │
│       │                │          │ L-15│ Linia   │ 1.8    │
│                                   │     │         │        │
└───────────────────────────────────┴─────────────────────────┘
```

### 5.5 Automatyczne przełączanie trybów

**BINDING:**

System **automatycznie** wybiera tryb etykiet według algorytmu:

```python
def select_label_mode(diagram):
    collision_ratio = calculate_collision_ratio(diagram)

    if collision_ratio < 0.30:
        return LabelMode.INLINE
    elif collision_ratio < 0.50:
        return LabelMode.OFFSET
    else:
        return LabelMode.SIDE_STACK
```

**Definicja `collision_ratio`:**
Procent etykiet, których bounding box nakłada się z innymi etykietami lub symbolami.

**Użytkownik MAY:**
- Wymusić tryb SIDE STACK ręcznie (np. przycisk "Tryb audytu").
- Wyłączyć automatyczne przełączanie (ustawienie preferencji).

**Użytkownik MUST NOT:**
- Mieć możliwości trwałego wyłączenia CAD overlay (może tylko tymczasowo ukryć).

---

## 6. Szyny (BUS): Zasady geometryczne

### 6.1 Reguła podstawowa

**CANONICAL:**

> Jedna szyna (Bus) = **jedna, ciągła belka pozioma**.

**MUST:**
- Szyna jest reprezentowana jako **pojedyncza, gruba linia pozioma**.
- Szerokość linii: 3-5 px (zależnie od zoomu).
- Kolor:
  - `in_service=True` → kolor operacyjny (np. niebieski, czerwony dla wysokiego napięcia),
  - `in_service=False` → szary.
- Jeśli do szyny podłączonych jest wiele elementów → wszystkie łączą się **do tej samej belki**.

### 6.2 Zakazy (FORBIDDEN)

**NIGDY:**

| Zabronione | Dlaczego | Prawidłowe |
|------------|----------|------------|
| **Dwie równoległe linie dla jednego BUS** | Sugeruje dwa różne BUS (błędna topologia) | Jedna linia |
| **Pseudo-sekcje** (linia przerywana w środku BUS) | Sugeruje sekcjonowanie, które nie istnieje w modelu | Jedna ciągła linia |
| **Podwójne belki** (sekció busbar) | Wygląda jak dwie szyny w układzie H/Z | Jeden BUS = jedna belka |
| **Linie pionowe jako BUS** | Konwencja inżynierska: BUS = poziomo | Zawsze poziomo (z wyjątkiem schematu poziomego transformatora) |

### 6.3 Wiele poziomów napięcia

Jeśli diagram zawiera wiele poziomów napięcia (np. SN, nn):

**MUST:**
- Każdy poziom ma **osobną warstwę wizualną** (różne wysokości Y na diagramie).
- Transformatory łączą warstwy pionowymi liniami.
- BUS w jednym poziomie **NIE MOGĄ** nachodzić na BUS w innym poziomie (separacja Y).

**Przykład:**
```
════════════════════════════════════  ← SN (15 kV)
       ║
       ║  [T-01]
       ║
════════════════════════════════════  ← nn (0.4 kV)
```

---

## 7. Parametry katalogowe i techniczne

### 7.1 Linie (LineBranch)

**MUST być widoczne (CAD overlay):**

| Parametr | Jednostka | Źródło | Przykład |
|----------|-----------|--------|----------|
| Długość | km | User input | `L = 2.5 km` |
| Przekrój | mm² | Catalog (type_ref) | `3×150 mm² Cu` |
| Rezystancja | Ω/km | Catalog | `R = 0.124 Ω/km` |
| Reaktancja | Ω/km | Catalog | `X = 0.08 Ω/km` |
| Susceptancja | µS/km | Catalog | `B = 3.5 µS/km` |

**Kolejność wyświetlania (BINDING):**
```
Linia [Nazwa]
L = [wartość] km, [przekrój] mm² [materiał]
R = [wartość] Ω/km, X = [wartość] Ω/km
```

**FORBIDDEN:**
- Pomijanie jednostek (`L = 2.5` zamiast `L = 2.5 km`).
- Pokazywanie tylko R lub tylko X (zawsze R **i** X).
- Używanie impedancji całkowitej zamiast jednostkowej (chyba że jawnie oznaczone jako `Z_total`).

### 7.2 Transformatory (TransformerBranch)

**MUST być widoczne (CAD overlay):**

| Parametr | Jednostka | Źródło | Przykład |
|----------|-----------|--------|----------|
| Moc znamionowa | MVA | Catalog | `Sn = 1.6 MVA` |
| Napięcie strony WN | kV | Catalog | `Un1 = 15 kV` |
| Napięcie strony NN | kV | Catalog | `Un2 = 0.4 kV` |
| Napięcie zwarcia | % | Catalog | `uk = 6%` |
| Grupa połączeń | - | Catalog | `Dyn11` |

**Kolejność wyświetlania (BINDING):**
```
Transformator [Nazwa]
Sn = [wartość] MVA, [Un1]/[Un2] kV
uk = [wartość]%, [grupa]
```

### 7.3 Źródła (Source)

**MUST być widoczne (CAD overlay):**

| Parametr | Jednostka | Źródło | Przykład |
|----------|-----------|--------|----------|
| Moc znamionowa | MVA | Catalog | `Sn = 2.5 MVA` |
| Napięcie znamionowe | kV | Catalog | `Un = 0.4 kV` |
| Typ | - | converter_kind | `PV` / `WIND` / `BESS` / `GRID` |

**Kolejność wyświetlania (BINDING):**
```
Źródło [Nazwa] ([Typ])
Sn = [wartość] MVA, Un = [wartość] kV
```

**FORBIDDEN:**
- Pokazywanie impedancji wewnętrznej w CAD overlay (impedancja jest parametrem solvera, nie katalogowym).

---

## 8. Duplikacja informacji między SCADA a CAD

### 8.1 Kiedy dozwolone?

**ALLOWED:**

Duplikacja informacji między SCADA a CAD jest **dozwolona**, jeśli:

1. **Poprawia czytelność** — np. powtórzenie nazwy BUS w CAD overlay, gdy SCADA używa koloru.
2. **Nie zmienia semantyki** — ta sama wartość w obu warstwach (np. `in_service` jako kolor + tekst).
3. **Jest jawnie oznaczona** — np. `[SCADA]` vs `[CAD]` w etykiecie (tylko w trybie debug).

**Przykład dozwolony:**
- SCADA: Szyna kolorowa (niebieski = `in_service=True`).
- CAD: Tekst "W eksploatacji: TAK".

### 8.2 Kiedy zabronione?

**FORBIDDEN:**

| Błędna duplikacja | Dlaczego | Prawidłowe |
|-------------------|----------|------------|
| **Różne wartości w SCADA vs CAD** | Sprzeczność → użytkownik nie wie, której wierzyć | Jedna wartość, jedno źródło prawdy |
| **Duplikacja wyników zwarciowych** | `Ik″` raz na BUS (CAD), raz w overlay (SCADA) | `Ik″` **tylko** w overlay wyników |
| **Duplikacja parametrów katalogowych** | `Sn` raz w symbolu, raz w CAD | `Sn` **tylko** w CAD overlay |

---

## 9. Wydruk: ekran = PDF = prawda projektu

### 9.1 Zasada 1:1

**CANONICAL:**

> Wydruk (PDF/DOCX) jest **1:1 snapchotem UI** bez utraty informacji.

**MUST:**
- Wszystko, co widoczne na ekranie → widoczne w PDF.
- SCADA + CAD → obie warstwy w PDF.
- Etykiety INLINE/OFFSET → zachowane w PDF.
- Etykiety SIDE STACK → tabela boczna w PDF (jak na ekranie).

**FORBIDDEN:**
- Ukrywanie CAD overlay w PDF (jeśli widoczne na ekranie).
- Zmiana trybów etykiet przy wydruku (np. INLINE → SIDE STACK bez zgody użytkownika).
- Pomijanie elementów "zbyt małych" (wszystko musi być widoczne, nawet jeśli wymaga to wielu stron).

### 9.2 Layout wydruku

**MUST:**

Strona PDF zawiera:

1. **Nagłówek:**
   - Tytuł projektu,
   - Data wygenerowania,
   - Autor,
   - Case (jeśli wyniki zwarciowe: MAX / MIN / N-1).

2. **Diagram SLD:**
   - Fragment SLD (jeśli duży → podzielony na strony),
   - SCADA + CAD overlay,
   - Legendy kolorów i symboli.

3. **Tabela wyników (jeśli RESULT_VIEW):**
   - Tabela BUS → `Ik″` / `ip` / `Ith` / `Sk″`,
   - Tabela wkładów (contributions),
   - Metadane (norma IEC 60909, snapshot ID, trace_id).

4. **Stopka:**
   - Numer strony,
   - Link do trace (opcjonalnie).

### 9.3 Wielostronicowość

Jeśli diagram nie mieści się na jednej stronie A4/A3:

**MUST:**
- Podział na strony według **logicznych sekcji** (np. jedna strona = jeden poziom napięcia).
- Oznaczenie kontynuacji (strzałki "→ ciąg dalszy na stronie X").
- Powtórzenie nagłówka na każdej stronie.

**FORBIDDEN:**
- Cięcie elementów w połowie (np. transformator na dwóch stronach).
- Brak informacji o kontynuacji.

---

## 10. Integracja z pozostałymi dokumentami

### 10.1 Powiązania kanoniczne

| Dokument | Co definiuje | Powiązanie z SLD_SCADA_CAD_CONTRACT |
|----------|--------------|-------------------------------------|
| `sld_rules.md` | Podstawowe reguły SLD (bijection, symbole, tryby) | SLD_SCADA_CAD rozszerza o CAD overlay i wydruk |
| `wizard_screens.md` | Tryby pracy systemu (MODEL_EDIT, CASE_CONFIG, RESULT_VIEW) | Tryby określają, kiedy CAD overlay jest aktywny |
| `SLD_SHORT_CIRCUIT_BUS_CENTRIC.md` | Prezentacja wyników zwarciowych (BUS-centric) | CAD overlay + wyniki zwarciowe = jedna warstwa kompozytowa |
| `SHORT_CIRCUIT_PANELS_AND_PRINTING.md` | Panele wyników, wydruk | Layout wydruku zgodny z § 9 |
| `P11_SC_CASE_MAPPING.md` | Mapowanie Case → ProofDocument | Wydruk zawiera trace_id dla każdej liczby |

### 10.2 Rozstrzyganie konfliktów

**BINDING:**

W przypadku konfliktu między dokumentami:

1. **SYSTEM_SPEC.md** ma najwyższy priorytet (CANONICAL).
2. **SLD_SCADA_CAD_CONTRACT.md** (ten dokument) rozstrzyga konflikty między SCADA a CAD.
3. **sld_rules.md** definiuje bazowe reguły (bijection, symbole).
4. **wizard_screens.md** definiuje tryby pracy (MODEL_EDIT / RESULT_VIEW).

Jeśli konflikt pozostaje nierozstrzygnięty → **zgłoś jako Issue** (REPOSITORY-HYGIENE.md).

---

## 11. Przykłady (ilustracje kanoniczne)

### 11.1 Przykład: Linia z INLINE etykietą

```
════════════════════════════════════════════════════════════
                        │
                        │  Linia L-12
                        │  L = 2.5 km, 3×150 mm² Cu
                        │  R = 0.124 Ω/km, X = 0.08 Ω/km
                        │  I = 125 A →
                        │
════════════════════════════════════════════════════════════
```

**SCADA:**
- Kierunek przepływu (strzałka →),
- Wartość prądu `I = 125 A`,
- Kolor linii (zielony = loading < 80%).

**CAD overlay:**
- Długość, przekrój, materiał,
- Parametry R/X.

### 11.2 Przykład: Szyna z wynikami zwarciowymi

```
════════════════════════════════════════════════════════════
   Szyna SN-01 | 15 kV                              [SCADA]
   Ik″ = 12.5 kA, ip = 32.8 kA, Sk″ = 325 MVA      [WYNIKI]
   U = 14.85 kV (operacyjne)                        [SCADA]
════════════════════════════════════════════════════════════
```

**SCADA:**
- Napięcie operacyjne `U = 14.85 kV`,
- Kolor szyny (niebieski = normalne napięcie).

**CAD overlay:**
- Napięcie znamionowe `15 kV`,
- Typ szyny (główna/rozdzielcza).

**Overlay wyników (zwarcie):**
- `Ik″`, `ip`, `Sk″` — **tylko przy BUS** (BUS-centric).

### 11.3 Przykład: Transformator

```
════════════════════════════════════════  ← SN (15 kV)
       ║
       ║  Transformator T-01
       ║  Sn = 1.6 MVA, 15/0.4 kV
       ║  uk = 6%, Dyn11
       ║  Loading = 85% (SCADA: żółty)
       ║
════════════════════════════════════════  ← nn (0.4 kV)
```

**SCADA:**
- Loading 85% → kolor żółty (ostrzeżenie).

**CAD overlay:**
- Parametry katalogowe: Sn, uk, grupa połączeń.

---

## 12. Podsumowanie reguł (checklist)

**Implementacja zgodna z SLD_SCADA_CAD_CONTRACT, jeśli:**

- [ ] Diagram zawiera **dwa aspekty** (SCADA + CAD) aktywne równocześnie.
- [ ] Wszystkie informacje kluczowe są **widoczne bez interakcji** (zasada "wszystko widoczne zawsze").
- [ ] ON-DEMAND jest używane **tylko jako awaryjny fallback** (ekstremalna gęstość, szczegóły pomocnicze).
- [ ] Jedna szyna (Bus) = **jedna, ciągła belka pozioma** (zakaz podwójnych belek, pseudo-sekcji).
- [ ] Etykiety CAD używają hierarchii **INLINE → OFFSET → SIDE STACK** (automatyczne przełączanie).
- [ ] Parametry katalogowe (R/X/B, Sn, uk) są **zawsze widoczne** w CAD overlay.
- [ ] Wydruk (PDF/DOCX) jest **1:1 snapchotem UI** bez utraty informacji.
- [ ] Terminologia: **BoundaryNode** (węzeł przyłączenia), **BUS-centric**, **Case** (MAX/MIN/N-1).
- [ ] Duplikacja SCADA ↔ CAD dozwolona **tylko jeśli poprawia czytelność** i nie zmienia semantyki.
- [ ] System automatycznie wykrywa kolizje etykiet i przełącza tryby (collision_ratio).

---

## 13. Integracja z kontraktami UI (SLD_UI_CONTRACT.md)

### 13.1 Pozycja dokumentu

**BINDING:**

`SLD_SCADA_CAD_CONTRACT.md` (ten dokument) definiuje **warstwy widoku** (SCADA + CAD).

`SLD_UI_CONTRACT.md` definiuje **kontrakty renderowania i interakcji** (priorytety, gęstość, kolory, wydruk, interakcja).

Oba dokumenty są **komplementarne** i obowiązują równocześnie.

### 13.2 UI Priority Stack (kontrakt #1)

**BINDING:**

Zgodnie z `SLD_UI_CONTRACT.md` § 3 (UI Priority Stack):

1. **BUS** (wyniki zwarciowe, stan) — absolutny priorytet wizualny.
2. **LINIA** (prąd roboczy `I`) — priorytet 2.
3. **CAD** (parametry katalogowe) — najniższy priorytet.

**Implikacje dla SLD_SCADA_CAD_CONTRACT:**

- Wyniki zwarciowe przy BUS (§ 4.3 tego dokumentu) **MUSZĄ** być widoczne zawsze (INLINE lub OFFSET, nigdy SIDE STACK).
- Parametry CAD (§ 7 tego dokumentu) **MOGĄ** być przesuwane do OFFSET lub SIDE STACK przy kolizji z wynikami BUS.
- Prąd roboczy linii (§ 4.3 tego dokumentu) **MUSI** być widoczny, ale może ustąpić miejsca wynikom BUS.

### 13.3 Dense SLD Rules (kontrakt #2)

**BINDING:**

Zgodnie z `SLD_UI_CONTRACT.md` § 4 (Dense SLD Rules):

- System automatycznie wykrywa gęstość diagramu (`density > 0.10 elem/cm²`).
- Etykiety CAD przełączają się: **INLINE → OFFSET → SIDE STACK** (zgodnie z § 5 tego dokumentu).
- Wyniki BUS pozostają **INLINE lub OFFSET** niezależnie od gęstości (zgodnie z § 4 tego dokumentu).

**Reguła rozszerzona:**

```
┌─────────────────────────────────────────────────────────────┐
│  Gęstość < 0.10 elem/cm²:                                    │
│  - CAD: INLINE (domyślnie)                                   │
│  - Wyniki BUS: INLINE                                        │
│                                                              │
│  Gęstość 0.10 – 0.20 elem/cm²:                               │
│  - CAD: OFFSET (auto fallback)                               │
│  - Wyniki BUS: INLINE (priorytet)                            │
│                                                              │
│  Gęstość > 0.20 elem/cm²:                                    │
│  - CAD: SIDE STACK (wymuszony)                               │
│  - Wyniki BUS: INLINE (absolutny priorytet)                  │
└─────────────────────────────────────────────────────────────┘
```

### 13.4 Semantic Color Contract (kontrakt #3)

**BINDING:**

Zgodnie z `SLD_UI_CONTRACT.md` § 5 (Semantic Color Contract):

- Kolor oznacza **znaczenie** (stan, alarm), nie typ elementu.
- SCADA SLD (§ 3.1 tego dokumentu) używa kolorów semantycznych:
  - **Zielony** = stan normalny,
  - **Żółty** = ostrzeżenie (loading 80-100%),
  - **Czerwony** = przeciążenie (loading > 100%) lub błąd,
  - **Szary** = `in_service=False`.

**CAD overlay (§ 3.2 tego dokumentu) używa kolorów neutralnych:**
- Czarny/ciemny dla tekstu i symboli (brak semantyki operacyjnej).

### 13.5 Print-First Contract (kontrakt #4)

**BINDING:**

Zgodnie z `SLD_UI_CONTRACT.md` § 6 (Print-First Contract):

> **Ekran = PDF = prawda projektu**

**Implikacje dla wydruku (§ 9 tego dokumentu):**

- Wszystko widoczne na ekranie **MUSI** być widoczne w PDF (żadne auto-hide).
- Wyniki BUS i prądy linii **zawsze widoczne** na wydruku.
- Tryb etykiet (INLINE/OFFSET/SIDE STACK) **zachowany** w PDF.

### 13.6 Interaction Contract (kontrakt #5)

**BINDING:**

Zgodnie z `SLD_UI_CONTRACT.md` § 7 (Interaction Contract):

- **Hover** = informacja (tooltip), nie zmienia stanu.
- **Click** = fokus + panel boczny (zgodnie z § 10.1 `SLD_SCADA_CAD_CONTRACT.md`).
- **ESC** = zamknięcie panelu / anulowanie fokusa.

**Tooltip (SCADA + CAD):**

Hover nad BUS wyświetla:
1. SCADA: napięcie operacyjne, stan (`in_service`),
2. Wyniki: `Ik″`, `ip`, `Ith`, `Sk″` (jeśli RESULT_VIEW),
3. CAD: typ szyny, napięcie znamionowe.

---

**KONIEC DOKUMENTU SLD_SCADA_CAD_CONTRACT.md**
**Status:** CANONICAL (BINDING)
**Dokument jest źródłem prawdy dla implementacji SLD UI w MV-DESIGN-PRO.**

