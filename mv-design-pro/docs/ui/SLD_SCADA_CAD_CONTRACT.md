# SLD SCADA + CAD: Kontrakt Widoku (CANONICAL)

**Status:** CANONICAL (BINDING)
**Wersja:** 1.1
**Data:** 2026-01-28
**Referencje:**
- `SLD_UI_CONTRACT.md` — kontrakty UI (priorytet, gęstoĹ›ć, kolory, wydruk, interakcja)
- `sld_rules.md` — podstawowe reguĹ‚y SLD
- `wizard_screens.md` — tryby pracy
- `SHORT_CIRCUIT_PANELS_AND_PRINTING.md` — wydruk

---

## 1. Cel i zakres dokumentu

Niniejszy dokument definiuje **wiąĹĽący kontrakt** między dwoma aspektami widoku SLD (Single Line Diagram):

1. **SCADA SLD** — operatorski, wizualizacja stanu i wynikĂłw,
2. **CAD overlay** — techniczny, parametry katalogowe i geometryczne.

Dokument jest **BINDING** dla:
- implementacji warstwy UI (SLD renderer),
- logiki prezentacji wynikĂłw analiz (overlay),
- logiki wydruku (PDF/DOCX),
- wszystkich dokumentĂłw referencyjnych (ARCHITECTURE.md, SYSTEM_SPEC.md).

---

## 2. Terminologia (BINDING)

### 2.1 Podstawowe terminy

| Termin | Definicja | PrzykĹ‚ad |
|--------|-----------|----------|
| **SCADA SLD** | Warstwowy widok SLD w stylu systemĂłw SCADA/benchmark/SmartCollect: neonowe kolory, stan operacyjny, przepĹ‚ywy mocy, wizualizacja pracy sieci | Szyny kolorowe, przepĹ‚ywy prądu z kierunkiem, kolor czerwony = przeciąĹĽenie |
| **CAD overlay** | NakĹ‚adka techniczna zawierająca parametry katalogowe, impedancje, dĹ‚ugoĹ›ci, przekroje kabli, dane konstrukcyjne | R/X/B linii, dĹ‚ugoĹ›ć kabla, typ przekroju |
| **BoundaryNode** | WęzeĹ‚ przyĹ‚ączenia (Point of Common Coupling) — granica między siecią operatora a instalacją uĹĽytkownika. **ZAWSZE uĹĽywaj terminu BoundaryNode**, nigdy "punkt przyĹ‚ączenia", "granica", itp. | BoundaryNode przy zĹ‚ączu SN/nn |
| **BUS** | Szyna elektryczna (busbar), węzeĹ‚ topologiczny sieci | Szyna rozdzielcza 15 kV |
| **BUS-centric** | Prezentacja wynikĂłw skupiona wokĂłĹ‚ szyn jako punktĂłw węzĹ‚owych (nie na liniach) | Wyniki zwarciowe `Ikâ€ł` wyĹ›wietlane **tylko przy BUS** |
| **Case** | Przypadek obliczeniowy zgodny z IEC/PN-EN 60909 | MAX / MIN / N-1 |
| **Overlay** | Warstwa graficzna nakĹ‚adana na bazowy SLD, zawierająca adnotacje wynikowe lub techniczne | Overlay z wartoĹ›ciami prądĂłw zwarciowych |

### 2.2 Style etykiet CAD

| Styl | Definicja | Kiedy stosować |
|------|-----------|----------------|
| **INLINE** | Etykiety umieszczone **bezpoĹ›rednio na symbolu lub linii**, bez oddzielenia | **DomyĹ›lnie** — dla normalnej gęstoĹ›ci elementĂłw |
| **OFFSET (leader)** | Etykiety przesunięte z linią wiodącą (leader line) | **Automatyczny fallback** — przy duĹĽej gęstoĹ›ci, kolizjach |
| **SIDE STACK** | Etykiety zebrane w tabeli bocznej, referencje numeryczne na diagramie | **Audyt/dokument** — wydruki z wymaganą czytelnoĹ›cią |

---

## 3. Zasada fundamentalna: Dwa aspekty widoku

### 3.1 SCADA SLD (aspekt operatorski)

**MUST:**
- UĹĽywać kolorĂłw wskazujących stan operacyjny (zielony, ĹĽĂłĹ‚ty, czerwony).
- Pokazywać **aktualny stan** elementĂłw:
  - `in_service=True` → normalny wygląd,
  - `in_service=False` → wyszarzony, linia przerywana.
- Pokazywać **wyniki analiz** jako overlay:
  - przepĹ‚ywy prądĂłw i mocy,
  - kierunki przepĹ‚ywu (strzaĹ‚ki),
  - wartoĹ›ci zwarciowe przy BUS,
  - kolory przeciąĹĽenia (loading).
- UĹĽywać symboli zgodnych z `sld_rules.md` Â§ A.2.

**FORBIDDEN:**
- Przedstawianie parametrĂłw katalogowych (R/X/B, przekrĂłj kabla, typ linii) jako podstawowej informacji w warstwę SCADA.
- UĹĽywanie szarych, monotonnych kolorĂłw (z wyjątkiem `in_service=False`).
- Mieszanie wynikĂłw rĂłĹĽnych Case w jednym widoku bez jawnej separacji.

### 3.2 CAD overlay (aspekt techniczny)

**MUST:**
- Pokazywać parametry **katalogowe** kaĹĽdego elementu:
  - typ, dĹ‚ugoĹ›ć, przekrĂłj, R/X/B dla linii,
  - moc znamionowa, napięcie, grupa poĹ‚ączeĹ„ dla transformatorĂłw,
  - parametry ĹşrĂłdeĹ‚ (Sn, Un, typ konwertera).
- UĹĽywać **czcionek inĹĽynieryjnych** (sans-serif, monospace dla liczb).
- Umieszczać etykiety wedĹ‚ug reguĹ‚ Â§ 5 (INLINE → OFFSET → SIDE STACK).
- Duplikować informacje między SCADA a CAD **tylko jeĹ›li poprawia to czytelnoĹ›ć** (np. `in_service` jako tekst + kolor).

**FORBIDDEN:**
- Ukrywanie parametrĂłw katalogowych za interakcją (hover, click), chyba ĹĽe gęstoĹ›ć wymusza fallback.
- Pomijanie jednostek (zawsze: `120 A`, `2.5 km`, `0.15 Î©/km`).
- UĹĽywanie skrĂłtĂłw niejednoznacznych (np. `R` bez `Î©/km`).

### 3.3 Integracja SCADA + CAD

**ReguĹ‚a zĹ‚otego Ĺ›rodka:**

> **Wszystko, co jest widoczne na ekranie, MUSI trafić na wydruk.**
> Wydruk = snapshot UI bez utraty informacji.

**MUST:**
- Oba aspekty (SCADA + CAD) są **zawsze aktywne rĂłwnoczeĹ›nie**.
- UĹĽytkownik widzi:
  - stan operacyjny (SCADA),
  - parametry techniczne (CAD),
  - wyniki analiz (overlay).
- Renderer renderuje oba aspekty jako jedną warstwę kompozytową.

**ALLOWED:**
- Tymczasowe wyĹ‚ączenie CAD overlay w trybie edycji (MODEL_EDIT), jeĹ›li upraszcza UX.
- Automatyczny fallback do OFFSET/SIDE STACK przy ekstremalnej gęstoĹ›ci.

**FORBIDDEN:**
- Ukrywanie CAD overlay jako domyĹ›lne zachowanie.
- Wymaganie ręcznego wĹ‚ączania CAD overlay przez uĹĽytkownika.
- WyĹ›wietlanie SCADA bez CAD w trybie RESULT_VIEW.

---

## 4. Zasada "Wszystko widoczne zawsze"

### 4.1 Definicja

**CANONICAL:**

> Wszystkie istotne informacje o elementach sieci (stan, parametry, wyniki) są **widoczne na diagramie** bez koniecznoĹ›ci interakcji (hover, click).

### 4.2 Co jest "istotne"?

**MUST być widoczne:**

| Element sieci | Informacje widoczne (SCADA) | Informacje widoczne (CAD) |
|---------------|----------------------------|---------------------------|
| **Bus** | Nazwa, napięcie Un, kolor stanu | Typ szyny (gĹ‚Ăłwna/rozdzielcza) |
| **LineBranch** | Prąd roboczy I [A], kierunek, kolor loading | DĹ‚ugoĹ›ć [km], R/X/B [Î©/km], przekrĂłj [mmÂ˛] |
| **TransformerBranch** | Prąd I [A], loading [%] | Sn [MVA], Un1/Un2 [kV], uk [%], grupa |
| **Source** | P/Q [MW/Mvar], kierunek | Sn [MVA], Un [kV], typ (grid/PV/WIND/BESS) |
| **Load** | P/Q [MW/Mvar] | Typ obciąĹĽenia, cosĎ† |
| **Switch** | Stan (OPEN/CLOSED) | Typ (wyĹ‚ącznik, odĹ‚ącznik, bezpiecznik) |

**MUST być widoczne w trybie zwarciowym:**

| Element | Informacje widoczne |
|---------|---------------------|
| **Bus** | `Ikâ€ł`, `ip`, `Ith`, `Skâ€ł` — **zawsze przy BUS** |
| **LineBranch** | WkĹ‚ad do `Ikâ€ł` w BUS docelowym (opcjonalnie, jeĹ›li pomaga zrozumieć przepĹ‚yw) |

### 4.3 ON-DEMAND jako awaryjny fallback

**BINDING:**

ON-DEMAND (wyĹ›wietlanie informacji dopiero po hover/click) jest **DOZWOLONE WYĹĄCZNIE** w następujących przypadkach:

1. **Ekstremalna gęstoĹ›ć diagramu** — gdy liczba elementĂłw na jednostkę powierzchni przekracza prĂłg czytelnoĹ›ci (zdefiniowany jako: etykiety nakĹ‚adają się w >30% przypadkĂłw przy INLINE).
2. **SzczegĂłĹ‚y pomocnicze** — np. szczegĂłĹ‚owe parametry katalogowe (rezystancja termiczna, prąd dynamiczny), ktĂłre nie są kluczowe dla podstawowej analizy.
3. **Historia wynikĂłw** — porĂłwnanie Case A vs Case B w tym samym BUS (panel boczny, nie main diagram).

**FORBIDDEN:**
- ON-DEMAND jako **domyĹ›lny sposĂłb prezentacji** parametrĂłw kluczowych (R/X/B, Sn, `Ikâ€ł`).
- ON-DEMAND jako sposĂłb na "uproszenie" UI kosztem dostępnoĹ›ci informacji.

**ReguĹ‚a:**
> JeĹ›li informacja jest kluczowa dla zrozumienia sieci lub wynikĂłw → **MUST być widoczna**.
> JeĹ›li informacja jest pomocnicza lub rzadko uĹĽywana → **MAY być ON-DEMAND**.

---

## 5. Etykiety CAD: INLINE → OFFSET → SIDE STACK

### 5.1 Hierarchia trybĂłw

**CANONICAL:**

System wybiera tryb prezentacji etykiet CAD wedĹ‚ug następującej hierarchii:

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  1. INLINE (domyĹ›lnie)                                       â”‚
â”‚     â””â”€> JeĹ›li kolizja > 30% → przejdĹş do 2                  â”‚
â”‚                                                              â”‚
â”‚  2. OFFSET (leader line)                                     â”‚
â”‚     â””â”€> JeĹ›li kolizja > 50% → przejdĹş do 3                  â”‚
â”‚                                                              â”‚
â”‚  3. SIDE STACK (tabela boczna)                               â”‚
â”‚     â””â”€> UĹĽywane zawsze w trybie audytu/wydruku              â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

### 5.2 INLINE (tryb domyĹ›lny)

**Definicja:**
Etykiety umieszczone bezpoĹ›rednio na symbolu lub wzdĹ‚uĹĽ linii, bez oddzielenia.

**MUST:**
- Etykieta jest częĹ›cią symbolu (rendering atomowy).
- Tekst jest czytelny przy standardowym zoomie (100%).
- Parametry są uporządkowane wertykalnie lub horyzontalnie wg staĹ‚ego schematu.

**PrzykĹ‚ad (LineBranch INLINE):**
```
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  L = 2.5 km, 3Ă—150 mmÂ˛ Cu
  R = 0.124 Î©/km, X = 0.08 Î©/km
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
```

**PrzykĹ‚ad (Bus INLINE):**
```
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   Szyna SN-01 | 15 kV | U = 14.85 kV
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
```

### 5.3 OFFSET (leader line)

**Definicja:**
Etykiety przesunięte poza symbol, z linią wiodącą (leader) wskazującą element.

**Kiedy stosować:**
- Automatyczny fallback, gdy **INLINE powoduje kolizje** (nakĹ‚adanie się tekstu).
- GęstoĹ›ć elementĂłw wysoka, ale nie krytyczna.

**MUST:**
- Leader line (linia wiodąca) jest **cienka, przerywana** (nie mylić z linią elektryczną).
- Etykieta jest w prostokątnym polu z tĹ‚em (biaĹ‚ym lub pĂłĹ‚przeĹşroczystym).
- OdlegĹ‚oĹ›ć od symbolu: min 10 px, max 50 px.

**PrzykĹ‚ad (OFFSET):**
```
                     â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                     â”‚ Linia L-12          â”‚
          â•­â”€ â”€ â”€ â”€ â”€ â”‚ L = 3.2 km          â”‚
          â”‚          â”‚ 3Ă—185 mmÂ˛ Al        â”‚
          â”‚          â”‚ R = 0.164 Î©/km      â”‚
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€
```

### 5.4 SIDE STACK (tabela boczna)

**Definicja:**
Wszystkie etykiety zebrane w tabeli bocznej (panel), elementy na diagramie mają **referencje numeryczne** (ID).

**Kiedy stosować:**
- **Audyt/dokument** — wydruk do dokumentacji projektowej, raporty.
- **Ekstremalna gęstoĹ›ć** — gdy OFFSET nie rozwiązuje problemu kolizji.
- **PorĂłwnania** — wyĹ›wietlanie Case A vs Case B w tabeli bocznej.

**MUST:**
- KaĹĽdy element na diagramie ma unikalny **identyfikator numeryczny** (np. L-12, T-03, B-05).
- Tabela boczna zawiera **wszystkie parametry** danego elementu.
- Kliknięcie ID w tabeli → podĹ›wietlenie elementu na diagramie.
- Kliknięcie elementu na diagramie → podĹ›wietlenie wiersza w tabeli.

**PrzykĹ‚ad (SIDE STACK):**

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Diagram                           â”‚ Tabela parametrĂłw       â”‚
â”‚                                   â”‚                         â”‚
â”‚   â•â•â•â•â•¦â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•¦â•â•â•â•      â”‚ ID  â”‚ Element â”‚ L [km] â”‚
â”‚       â•‘                â•‘          â”‚ â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”Ľâ”€â”€â”€â”€â”€â”€â”€â”€â”‚
â”‚     [L-12]          [L-15]        â”‚ L-12â”‚ Linia   â”‚ 3.2    â”‚
â”‚       â”‚                â”‚          â”‚ L-15â”‚ Linia   â”‚ 1.8    â”‚
â”‚                                   â”‚     â”‚         â”‚        â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

### 5.5 Automatyczne przeĹ‚ączanie trybĂłw

**BINDING:**

System **automatycznie** wybiera tryb etykiet wedĹ‚ug algorytmu:

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
Procent etykiet, ktĂłrych bounding box nakĹ‚ada się z innymi etykietami lub symbolami.

**UĹĽytkownik MAY:**
- Wymusić tryb SIDE STACK ręcznie (np. przycisk "Tryb audytu").
- WyĹ‚ączyć automatyczne przeĹ‚ączanie (ustawienie preferencji).

**UĹĽytkownik MUST NOT:**
- Mieć moĹĽliwoĹ›ci trwaĹ‚ego wyĹ‚ączenia CAD overlay (moĹĽe tylko tymczasowo ukryć).

---

## 6. Szyny (BUS): Zasady geometryczne

### 6.1 ReguĹ‚a podstawowa

**CANONICAL:**

> Jedna szyna (Bus) = **jedna, ciągĹ‚a belka pozioma**.

**MUST:**
- Szyna jest reprezentowana jako **pojedyncza, gruba linia pozioma**.
- SzerokoĹ›ć linii: 3-5 px (zaleĹĽnie od zoomu).
- Kolor:
  - `in_service=True` → kolor operacyjny (np. niebieski, czerwony dla wysokiego napięcia),
  - `in_service=False` → szary.
- JeĹ›li do szyny podĹ‚ączonych jest wiele elementĂłw → wszystkie Ĺ‚ączą się **do tej samej belki**.

### 6.2 Zakazy (FORBIDDEN)

**NIGDY:**

| Zabronione | Dlaczego | PrawidĹ‚owe |
|------------|----------|------------|
| **Dwie rĂłwnolegĹ‚e linie dla jednego BUS** | Sugeruje dwa rĂłĹĽne BUS (bĹ‚ędna topologia) | Jedna linia |
| **Pseudo-sekcje** (linia przerywana w Ĺ›rodku BUS) | Sugeruje sekcjonowanie, ktĂłre nie istnieje w modelu | Jedna ciągĹ‚a linia |
| **PodwĂłjne belki** (sekciĂł busbar) | Wygląda jak dwie szyny w ukĹ‚adzie H/Z | Jeden BUS = jedna belka |
| **Linie pionowe jako BUS** | Konwencja inĹĽynierska: BUS = poziomo | Zawsze poziomo (z wyjątkiem schematu poziomego transformatora) |

### 6.3 Wiele poziomĂłw napięcia

JeĹ›li diagram zawiera wiele poziomĂłw napięcia (np. SN, nn):

**MUST:**
- KaĹĽdy poziom ma **osobną warstwę wizualną** (rĂłĹĽne wysokoĹ›ci Y na diagramie).
- Transformatory Ĺ‚ączą warstwy pionowymi liniami.
- BUS w jednym poziomie **NIE MOGĄ** nachodzić na BUS w innym poziomie (separacja Y).

**PrzykĹ‚ad:**
```
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•  â† SN (15 kV)
       â•‘
       â•‘  [T-01]
       â•‘
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•  â† nn (0.4 kV)
```

---

## 7. Parametry katalogowe i techniczne

### 7.1 Linie (LineBranch)

**MUST być widoczne (CAD overlay):**

| Parametr | Jednostka | ĹąrĂłdĹ‚o | PrzykĹ‚ad |
|----------|-----------|--------|----------|
| DĹ‚ugoĹ›ć | km | User input | `L = 2.5 km` |
| PrzekrĂłj | mmÂ˛ | Catalog (type_ref) | `3Ă—150 mmÂ˛ Cu` |
| Rezystancja | Î©/km | Catalog | `R = 0.124 Î©/km` |
| Reaktancja | Î©/km | Catalog | `X = 0.08 Î©/km` |
| Susceptancja | ÂµS/km | Catalog | `B = 3.5 ÂµS/km` |

**KolejnoĹ›ć wyĹ›wietlania (BINDING):**
```
Linia [Nazwa]
L = [wartoĹ›ć] km, [przekrĂłj] mmÂ˛ [materiaĹ‚]
R = [wartoĹ›ć] Î©/km, X = [wartoĹ›ć] Î©/km
```

**FORBIDDEN:**
- Pomijanie jednostek (`L = 2.5` zamiast `L = 2.5 km`).
- Pokazywanie tylko R lub tylko X (zawsze R **i** X).
- UĹĽywanie impedancji caĹ‚kowitej zamiast jednostkowej (chyba ĹĽe jawnie oznaczone jako `Z_total`).

### 7.2 Transformatory (TransformerBranch)

**MUST być widoczne (CAD overlay):**

| Parametr | Jednostka | ĹąrĂłdĹ‚o | PrzykĹ‚ad |
|----------|-----------|--------|----------|
| Moc znamionowa | MVA | Catalog | `Sn = 1.6 MVA` |
| Napięcie strony WN | kV | Catalog | `Un1 = 15 kV` |
| Napięcie strony NN | kV | Catalog | `Un2 = 0.4 kV` |
| Napięcie zwarcia | % | Catalog | `uk = 6%` |
| Grupa poĹ‚ączeĹ„ | - | Catalog | `Dyn11` |

**KolejnoĹ›ć wyĹ›wietlania (BINDING):**
```
Transformator [Nazwa]
Sn = [wartoĹ›ć] MVA, [Un1]/[Un2] kV
uk = [wartoĹ›ć]%, [grupa]
```

### 7.3 ĹąrĂłdĹ‚a (Source)

**MUST być widoczne (CAD overlay):**

| Parametr | Jednostka | ĹąrĂłdĹ‚o | PrzykĹ‚ad |
|----------|-----------|--------|----------|
| Moc znamionowa | MVA | Catalog | `Sn = 2.5 MVA` |
| Napięcie znamionowe | kV | Catalog | `Un = 0.4 kV` |
| Typ | - | converter_kind | `PV` / `WIND` / `BESS` / `GRID` |

**KolejnoĹ›ć wyĹ›wietlania (BINDING):**
```
ĹąrĂłdĹ‚o [Nazwa] ([Typ])
Sn = [wartoĹ›ć] MVA, Un = [wartoĹ›ć] kV
```

**FORBIDDEN:**
- Pokazywanie impedancji wewnętrznej w CAD overlay (impedancja jest parametrem solvera, nie katalogowym).

---

## 8. Duplikacja informacji między SCADA a CAD

### 8.1 Kiedy dozwolone?

**ALLOWED:**

Duplikacja informacji między SCADA a CAD jest **dozwolona**, jeĹ›li:

1. **Poprawia czytelnoĹ›ć** — np. powtĂłrzenie nazwy BUS w CAD overlay, gdy SCADA uĹĽywa koloru.
2. **Nie zmienia semantyki** — ta sama wartoĹ›ć w obu warstwach (np. `in_service` jako kolor + tekst).
3. **Jest jawnie oznaczona** — np. `[SCADA]` vs `[CAD]` w etykiecie (tylko w trybie debug).

**PrzykĹ‚ad dozwolony:**
- SCADA: Szyna kolorowa (niebieski = `in_service=True`).
- CAD: Tekst "W eksploatacji: TAK".

### 8.2 Kiedy zabronione?

**FORBIDDEN:**

| BĹ‚ędna duplikacja | Dlaczego | PrawidĹ‚owe |
|-------------------|----------|------------|
| **RĂłĹĽne wartoĹ›ci w SCADA vs CAD** | SprzecznoĹ›ć → uĹĽytkownik nie wie, ktĂłrej wierzyć | Jedna wartoĹ›ć, jedno ĹşrĂłdĹ‚o prawdy |
| **Duplikacja wynikĂłw zwarciowych** | `Ikâ€ł` raz na BUS (CAD), raz w overlay (SCADA) | `Ikâ€ł` **tylko** w overlay wynikĂłw |
| **Duplikacja parametrĂłw katalogowych** | `Sn` raz w symbolu, raz w CAD | `Sn` **tylko** w CAD overlay |

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
- Ukrywanie CAD overlay w PDF (jeĹ›li widoczne na ekranie).
- Zmiana trybĂłw etykiet przy wydruku (np. INLINE → SIDE STACK bez zgody uĹĽytkownika).
- Pomijanie elementĂłw "zbyt maĹ‚ych" (wszystko musi być widoczne, nawet jeĹ›li wymaga to wielu stron).

### 9.2 Layout wydruku

**MUST:**

Strona PDF zawiera:

1. **NagĹ‚Ăłwek:**
   - TytuĹ‚ projektu,
   - Data wygenerowania,
   - Autor,
   - Case (jeĹ›li wyniki zwarciowe: MAX / MIN / N-1).

2. **Diagram SLD:**
   - Fragment SLD (jeĹ›li duĹĽy → podzielony na strony),
   - SCADA + CAD overlay,
   - Legendy kolorĂłw i symboli.

3. **Tabela wynikĂłw (jeĹ›li RESULT_VIEW):**
   - Tabela BUS → `Ikâ€ł` / `ip` / `Ith` / `Skâ€ł`,
   - Tabela wkĹ‚adĂłw (contributions),
   - Metadane (norma IEC 60909, snapshot ID, trace_id).

4. **Stopka:**
   - Numer strony,
   - Link do trace (opcjonalnie).

### 9.3 WielostronicowoĹ›ć

JeĹ›li diagram nie mieĹ›ci się na jednej stronie A4/A3:

**MUST:**
- PodziaĹ‚ na strony wedĹ‚ug **logicznych sekcji** (np. jedna strona = jeden poziom napięcia).
- Oznaczenie kontynuacji (strzaĹ‚ki "→ ciąg dalszy na stronie X").
- PowtĂłrzenie nagĹ‚Ăłwka na kaĹĽdej stronie.

**FORBIDDEN:**
- Cięcie elementĂłw w poĹ‚owie (np. transformator na dwĂłch stronach).
- Brak informacji o kontynuacji.

---

## 10. Integracja z pozostaĹ‚ymi dokumentami

### 10.1 Powiązania kanoniczne

| Dokument | Co definiuje | Powiązanie z SLD_SCADA_CAD_CONTRACT |
|----------|--------------|-------------------------------------|
| `sld_rules.md` | Podstawowe reguĹ‚y SLD (bijection, symbole, tryby) | SLD_SCADA_CAD rozszerza o CAD overlay i wydruk |
| `wizard_screens.md` | Tryby pracy systemu (MODEL_EDIT, CASE_CONFIG, RESULT_VIEW) | Tryby okreĹ›lają, kiedy CAD overlay jest aktywny |
| `SLD_SHORT_CIRCUIT_BUS_CENTRIC.md` | Prezentacja wynikĂłw zwarciowych (BUS-centric) | CAD overlay + wyniki zwarciowe = jedna warstwa kompozytowa |
| `SHORT_CIRCUIT_PANELS_AND_PRINTING.md` | Panele wynikĂłw, wydruk | Layout wydruku zgodny z Â§ 9 |
| `P11_SC_CASE_MAPPING.md` | Mapowanie Case → ProofDocument | Wydruk zawiera trace_id dla kaĹĽdej liczby |

### 10.2 Rozstrzyganie konfliktĂłw

**BINDING:**

W przypadku konfliktu między dokumentami:

1. **SYSTEM_SPEC.md** ma najwyĹĽszy priorytet (CANONICAL).
2. **SLD_SCADA_CAD_CONTRACT.md** (ten dokument) rozstrzyga konflikty między SCADA a CAD.
3. **sld_rules.md** definiuje bazowe reguĹ‚y (bijection, symbole).
4. **wizard_screens.md** definiuje tryby pracy (MODEL_EDIT / RESULT_VIEW).

JeĹ›li konflikt pozostaje nierozstrzygnięty → **zgĹ‚oĹ› jako Issue** (REPOSITORY-HYGIENE.md).

---

## 11. PrzykĹ‚ady (ilustracje kanoniczne)

### 11.1 PrzykĹ‚ad: Linia z INLINE etykietą

```
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
                        â”‚
                        â”‚  Linia L-12
                        â”‚  L = 2.5 km, 3Ă—150 mmÂ˛ Cu
                        â”‚  R = 0.124 Î©/km, X = 0.08 Î©/km
                        â”‚  I = 125 A →
                        â”‚
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
```

**SCADA:**
- Kierunek przepĹ‚ywu (strzaĹ‚ka →),
- WartoĹ›ć prądu `I = 125 A`,
- Kolor linii (zielony = loading < 80%).

**CAD overlay:**
- DĹ‚ugoĹ›ć, przekrĂłj, materiaĹ‚,
- Parametry R/X.

### 11.2 PrzykĹ‚ad: Szyna z wynikami zwarciowymi

```
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   Szyna SN-01 | 15 kV                              [SCADA]
   Ikâ€ł = 12.5 kA, ip = 32.8 kA, Skâ€ł = 325 MVA      [WYNIKI]
   U = 14.85 kV (operacyjne)                        [SCADA]
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
```

**SCADA:**
- Napięcie operacyjne `U = 14.85 kV`,
- Kolor szyny (niebieski = normalne napięcie).

**CAD overlay:**
- Napięcie znamionowe `15 kV`,
- Typ szyny (gĹ‚Ăłwna/rozdzielcza).

**Overlay wynikĂłw (zwarcie):**
- `Ikâ€ł`, `ip`, `Skâ€ł` — **tylko przy BUS** (BUS-centric).

### 11.3 PrzykĹ‚ad: Transformator

```
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•  â† SN (15 kV)
       â•‘
       â•‘  Transformator T-01
       â•‘  Sn = 1.6 MVA, 15/0.4 kV
       â•‘  uk = 6%, Dyn11
       â•‘  Loading = 85% (SCADA: ĹĽĂłĹ‚ty)
       â•‘
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•  â† nn (0.4 kV)
```

**SCADA:**
- Loading 85% → kolor ĹĽĂłĹ‚ty (ostrzeĹĽenie).

**CAD overlay:**
- Parametry katalogowe: Sn, uk, grupa poĹ‚ączeĹ„.

---

## 12. Podsumowanie reguĹ‚ (checklist)

**Implementacja zgodna z SLD_SCADA_CAD_CONTRACT, jeĹ›li:**

- [ ] Diagram zawiera **dwa aspekty** (SCADA + CAD) aktywne rĂłwnoczeĹ›nie.
- [ ] Wszystkie informacje kluczowe są **widoczne bez interakcji** (zasada "wszystko widoczne zawsze").
- [ ] ON-DEMAND jest uĹĽywane **tylko jako awaryjny fallback** (ekstremalna gęstoĹ›ć, szczegĂłĹ‚y pomocnicze).
- [ ] Jedna szyna (Bus) = **jedna, ciągĹ‚a belka pozioma** (zakaz podwĂłjnych belek, pseudo-sekcji).
- [ ] Etykiety CAD uĹĽywają hierarchii **INLINE → OFFSET → SIDE STACK** (automatyczne przeĹ‚ączanie).
- [ ] Parametry katalogowe (R/X/B, Sn, uk) są **zawsze widoczne** w CAD overlay.
- [ ] Wydruk (PDF/DOCX) jest **1:1 snapchotem UI** bez utraty informacji.
- [ ] Terminologia: **BoundaryNode** (węzeĹ‚ przyĹ‚ączenia), **BUS-centric**, **Case** (MAX/MIN/N-1).
- [ ] Duplikacja SCADA â†” CAD dozwolona **tylko jeĹ›li poprawia czytelnoĹ›ć** i nie zmienia semantyki.
- [ ] System automatycznie wykrywa kolizje etykiet i przeĹ‚ącza tryby (collision_ratio).

---

## 13. Integracja z kontraktami UI (SLD_UI_CONTRACT.md)

### 13.1 Pozycja dokumentu

**BINDING:**

`SLD_SCADA_CAD_CONTRACT.md` (ten dokument) definiuje **warstwy widoku** (SCADA + CAD).

`SLD_UI_CONTRACT.md` definiuje **kontrakty renderowania i interakcji** (priorytety, gęstoĹ›ć, kolory, wydruk, interakcja).

Oba dokumenty są **komplementarne** i obowiązują rĂłwnoczeĹ›nie.

### 13.2 UI Priority Stack (kontrakt #1)

**BINDING:**

Zgodnie z `SLD_UI_CONTRACT.md` Â§ 3 (UI Priority Stack):

1. **BUS** (wyniki zwarciowe, stan) — absolutny priorytet wizualny.
2. **LINIA** (prąd roboczy `I`) — priorytet 2.
3. **CAD** (parametry katalogowe) — najniĹĽszy priorytet.

**Implikacje dla SLD_SCADA_CAD_CONTRACT:**

- Wyniki zwarciowe przy BUS (Â§ 4.3 tego dokumentu) **MUSZĄ** być widoczne zawsze (INLINE lub OFFSET, nigdy SIDE STACK).
- Parametry CAD (Â§ 7 tego dokumentu) **MOGĄ** być przesuwane do OFFSET lub SIDE STACK przy kolizji z wynikami BUS.
- Prąd roboczy linii (Â§ 4.3 tego dokumentu) **MUSI** być widoczny, ale moĹĽe ustąpić miejsca wynikom BUS.

### 13.3 Dense SLD Rules (kontrakt #2)

**BINDING:**

Zgodnie z `SLD_UI_CONTRACT.md` Â§ 4 (Dense SLD Rules):

- System automatycznie wykrywa gęstoĹ›ć diagramu (`density > 0.10 elem/cmÂ˛`).
- Etykiety CAD przeĹ‚ączają się: **INLINE → OFFSET → SIDE STACK** (zgodnie z Â§ 5 tego dokumentu).
- Wyniki BUS pozostają **INLINE lub OFFSET** niezaleĹĽnie od gęstoĹ›ci (zgodnie z Â§ 4 tego dokumentu).

**ReguĹ‚a rozszerzona:**

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  GęstoĹ›ć < 0.10 elem/cmÂ˛:                                    â”‚
â”‚  - CAD: INLINE (domyĹ›lnie)                                   â”‚
â”‚  - Wyniki BUS: INLINE                                        â”‚
â”‚                                                              â”‚
â”‚  GęstoĹ›ć 0.10 – 0.20 elem/cmÂ˛:                               â”‚
â”‚  - CAD: OFFSET (auto fallback)                               â”‚
â”‚  - Wyniki BUS: INLINE (priorytet)                            â”‚
â”‚                                                              â”‚
â”‚  GęstoĹ›ć > 0.20 elem/cmÂ˛:                                    â”‚
â”‚  - CAD: SIDE STACK (wymuszony)                               â”‚
â”‚  - Wyniki BUS: INLINE (absolutny priorytet)                  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

### 13.4 Semantic Color Contract (kontrakt #3)

**BINDING:**

Zgodnie z `SLD_UI_CONTRACT.md` Â§ 5 (Semantic Color Contract):

- Kolor oznacza **znaczenie** (stan, alarm), nie typ elementu.
- SCADA SLD (Â§ 3.1 tego dokumentu) uĹĽywa kolorĂłw semantycznych:
  - **Zielony** = stan normalny,
  - **Ĺ»ĂłĹ‚ty** = ostrzeĹĽenie (loading 80-100%),
  - **Czerwony** = przeciąĹĽenie (loading > 100%) lub bĹ‚ąd,
  - **Szary** = `in_service=False`.

**CAD overlay (Â§ 3.2 tego dokumentu) uĹĽywa kolorĂłw neutralnych:**
- Czarny/ciemny dla tekstu i symboli (brak semantyki operacyjnej).

### 13.5 Print-First Contract (kontrakt #4)

**BINDING:**

Zgodnie z `SLD_UI_CONTRACT.md` Â§ 6 (Print-First Contract):

> **Ekran = PDF = prawda projektu**

**Implikacje dla wydruku (Â§ 9 tego dokumentu):**

- Wszystko widoczne na ekranie **MUSI** być widoczne w PDF (ĹĽadne auto-hide).
- Wyniki BUS i prądy linii **zawsze widoczne** na wydruku.
- Tryb etykiet (INLINE/OFFSET/SIDE STACK) **zachowany** w PDF.

### 13.6 Interaction Contract (kontrakt #5)

**BINDING:**

Zgodnie z `SLD_UI_CONTRACT.md` Â§ 7 (Interaction Contract):

- **Hover** = informacja (tooltip), nie zmienia stanu.
- **Click** = fokus + panel boczny (zgodnie z Â§ 10.1 `SLD_SCADA_CAD_CONTRACT.md`).
- **ESC** = zamknięcie panelu / anulowanie fokusa.

**Tooltip (SCADA + CAD):**

Hover nad BUS wyĹ›wietla:
1. SCADA: napięcie operacyjne, stan (`in_service`),
2. Wyniki: `Ikâ€ł`, `ip`, `Ith`, `Skâ€ł` (jeĹ›li RESULT_VIEW),
3. CAD: typ szyny, napięcie znamionowe.

---

**KONIEC DOKUMENTU SLD_SCADA_CAD_CONTRACT.md**
**Status:** CANONICAL (BINDING)
**Dokument jest ĹşrĂłdĹ‚em prawdy dla implementacji SLD UI w MV-DESIGN-PRO.**

