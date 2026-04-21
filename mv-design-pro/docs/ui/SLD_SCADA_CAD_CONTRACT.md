# SLD SCADA + CAD: Kontrakt Widoku (CANONICAL)

**Status:** CANONICAL (BINDING)
**Wersja:** 1.1
**Data:** 2026-01-28
**Referencje:**
- `SLD_UI_CONTRACT.md` â€” kontrakty UI (priorytet, gÄ™stoĹ›Ä‡, kolory, wydruk, interakcja)
- `sld_rules.md` â€” podstawowe reguĹ‚y SLD
- `wizard_screens.md` â€” tryby pracy
- `SHORT_CIRCUIT_PANELS_AND_PRINTING.md` â€” wydruk

---

## 1. Cel i zakres dokumentu

Niniejszy dokument definiuje **wiÄ…ĹĽÄ…cy kontrakt** miÄ™dzy dwoma aspektami widoku SLD (Single Line Diagram):

1. **SCADA SLD** â€” operatorski, wizualizacja stanu i wynikĂłw,
2. **CAD overlay** â€” techniczny, parametry katalogowe i geometryczne.

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
| **SCADA SLD** | Warstwowy widok SLD w stylu systemĂłw SCADA/benchmark/SmartCollect: neonowe kolory, stan operacyjny, przepĹ‚ywy mocy, wizualizacja pracy sieci | Szyny kolorowe, przepĹ‚ywy prÄ…du z kierunkiem, kolor czerwony = przeciÄ…ĹĽenie |
| **CAD overlay** | NakĹ‚adka techniczna zawierajÄ…ca parametry katalogowe, impedancje, dĹ‚ugoĹ›ci, przekroje kabli, dane konstrukcyjne | R/X/B linii, dĹ‚ugoĹ›Ä‡ kabla, typ przekroju |
| **BoundaryNode** | WÄ™zeĹ‚ przyĹ‚Ä…czenia (Point of Common Coupling) â€” granica miÄ™dzy sieciÄ… operatora a instalacjÄ… uĹĽytkownika. **ZAWSZE uĹĽywaj terminu BoundaryNode**, nigdy "punkt przyĹ‚Ä…czenia", "granica", itp. | BoundaryNode przy zĹ‚Ä…czu SN/nn |
| **BUS** | Szyna elektryczna (busbar), wÄ™zeĹ‚ topologiczny sieci | Szyna rozdzielcza 15 kV |
| **BUS-centric** | Prezentacja wynikĂłw skupiona wokĂłĹ‚ szyn jako punktĂłw wÄ™zĹ‚owych (nie na liniach) | Wyniki zwarciowe `Ikâ€ł` wyĹ›wietlane **tylko przy BUS** |
| **Case** | Przypadek obliczeniowy zgodny z IEC/PN-EN 60909 | MAX / MIN / N-1 |
| **Overlay** | Warstwa graficzna nakĹ‚adana na bazowy SLD, zawierajÄ…ca adnotacje wynikowe lub techniczne | Overlay z wartoĹ›ciami prÄ…dĂłw zwarciowych |

### 2.2 Style etykiet CAD

| Styl | Definicja | Kiedy stosowaÄ‡ |
|------|-----------|----------------|
| **INLINE** | Etykiety umieszczone **bezpoĹ›rednio na symbolu lub linii**, bez oddzielenia | **DomyĹ›lnie** â€” dla normalnej gÄ™stoĹ›ci elementĂłw |
| **OFFSET (leader)** | Etykiety przesuniÄ™te z liniÄ… wiodÄ…cÄ… (leader line) | **Automatyczny fallback** â€” przy duĹĽej gÄ™stoĹ›ci, kolizjach |
| **SIDE STACK** | Etykiety zebrane w tabeli bocznej, referencje numeryczne na diagramie | **Audyt/dokument** â€” wydruki z wymaganÄ… czytelnoĹ›ciÄ… |

---

## 3. Zasada fundamentalna: Dwa aspekty widoku

### 3.1 SCADA SLD (aspekt operatorski)

**MUST:**
- UĹĽywaÄ‡ kolorĂłw wskazujÄ…cych stan operacyjny (zielony, ĹĽĂłĹ‚ty, czerwony).
- PokazywaÄ‡ **aktualny stan** elementĂłw:
  - `in_service=True` â†’ normalny wyglÄ…d,
  - `in_service=False` â†’ wyszarzony, linia przerywana.
- PokazywaÄ‡ **wyniki analiz** jako overlay:
  - przepĹ‚ywy prÄ…dĂłw i mocy,
  - kierunki przepĹ‚ywu (strzaĹ‚ki),
  - wartoĹ›ci zwarciowe przy BUS,
  - kolory przeciÄ…ĹĽenia (loading).
- UĹĽywaÄ‡ symboli zgodnych z `sld_rules.md` Â§ A.2.

**FORBIDDEN:**
- Przedstawianie parametrĂłw katalogowych (R/X/B, przekrĂłj kabla, typ linii) jako podstawowej informacji w warstwÄ™ SCADA.
- UĹĽywanie szarych, monotonnych kolorĂłw (z wyjÄ…tkiem `in_service=False`).
- Mieszanie wynikĂłw rĂłĹĽnych Case w jednym widoku bez jawnej separacji.

### 3.2 CAD overlay (aspekt techniczny)

**MUST:**
- PokazywaÄ‡ parametry **katalogowe** kaĹĽdego elementu:
  - typ, dĹ‚ugoĹ›Ä‡, przekrĂłj, R/X/B dla linii,
  - moc znamionowa, napiÄ™cie, grupa poĹ‚Ä…czeĹ„ dla transformatorĂłw,
  - parametry ĹşrĂłdeĹ‚ (Sn, Un, typ konwertera).
- UĹĽywaÄ‡ **czcionek inĹĽynieryjnych** (sans-serif, monospace dla liczb).
- UmieszczaÄ‡ etykiety wedĹ‚ug reguĹ‚ Â§ 5 (INLINE â†’ OFFSET â†’ SIDE STACK).
- DuplikowaÄ‡ informacje miÄ™dzy SCADA a CAD **tylko jeĹ›li poprawia to czytelnoĹ›Ä‡** (np. `in_service` jako tekst + kolor).

**FORBIDDEN:**
- Ukrywanie parametrĂłw katalogowych za interakcjÄ… (hover, click), chyba ĹĽe gÄ™stoĹ›Ä‡ wymusza fallback.
- Pomijanie jednostek (zawsze: `120 A`, `2.5 km`, `0.15 Î©/km`).
- UĹĽywanie skrĂłtĂłw niejednoznacznych (np. `R` bez `Î©/km`).

### 3.3 Integracja SCADA + CAD

**ReguĹ‚a zĹ‚otego Ĺ›rodka:**

> **Wszystko, co jest widoczne na ekranie, MUSI trafiÄ‡ na wydruk.**
> Wydruk = snapshot UI bez utraty informacji.

**MUST:**
- Oba aspekty (SCADA + CAD) sÄ… **zawsze aktywne rĂłwnoczeĹ›nie**.
- UĹĽytkownik widzi:
  - stan operacyjny (SCADA),
  - parametry techniczne (CAD),
  - wyniki analiz (overlay).
- Renderer renderuje oba aspekty jako jednÄ… warstwÄ™ kompozytowÄ….

**ALLOWED:**
- Tymczasowe wyĹ‚Ä…czenie CAD overlay w trybie edycji (MODEL_EDIT), jeĹ›li upraszcza UX.
- Automatyczny fallback do OFFSET/SIDE STACK przy ekstremalnej gÄ™stoĹ›ci.

**FORBIDDEN:**
- Ukrywanie CAD overlay jako domyĹ›lne zachowanie.
- Wymaganie rÄ™cznego wĹ‚Ä…czania CAD overlay przez uĹĽytkownika.
- WyĹ›wietlanie SCADA bez CAD w trybie RESULT_VIEW.

---

## 4. Zasada "Wszystko widoczne zawsze"

### 4.1 Definicja

**CANONICAL:**

> Wszystkie istotne informacje o elementach sieci (stan, parametry, wyniki) sÄ… **widoczne na diagramie** bez koniecznoĹ›ci interakcji (hover, click).

### 4.2 Co jest "istotne"?

**MUST byÄ‡ widoczne:**

| Element sieci | Informacje widoczne (SCADA) | Informacje widoczne (CAD) |
|---------------|----------------------------|---------------------------|
| **Bus** | Nazwa, napiÄ™cie Un, kolor stanu | Typ szyny (gĹ‚Ăłwna/rozdzielcza) |
| **LineBranch** | PrÄ…d roboczy I [A], kierunek, kolor loading | DĹ‚ugoĹ›Ä‡ [km], R/X/B [Î©/km], przekrĂłj [mmÂ˛] |
| **TransformerBranch** | PrÄ…d I [A], loading [%] | Sn [MVA], Un1/Un2 [kV], uk [%], grupa |
| **Source** | P/Q [MW/Mvar], kierunek | Sn [MVA], Un [kV], typ (grid/PV/WIND/BESS) |
| **Load** | P/Q [MW/Mvar] | Typ obciÄ…ĹĽenia, cosĎ† |
| **Switch** | Stan (OPEN/CLOSED) | Typ (wyĹ‚Ä…cznik, odĹ‚Ä…cznik, bezpiecznik) |

**MUST byÄ‡ widoczne w trybie zwarciowym:**

| Element | Informacje widoczne |
|---------|---------------------|
| **Bus** | `Ikâ€ł`, `ip`, `Ith`, `Skâ€ł` â€” **zawsze przy BUS** |
| **LineBranch** | WkĹ‚ad do `Ikâ€ł` w BUS docelowym (opcjonalnie, jeĹ›li pomaga zrozumieÄ‡ przepĹ‚yw) |

### 4.3 ON-DEMAND jako awaryjny fallback

**BINDING:**

ON-DEMAND (wyĹ›wietlanie informacji dopiero po hover/click) jest **DOZWOLONE WYĹÄ„CZNIE** w nastÄ™pujÄ…cych przypadkach:

1. **Ekstremalna gÄ™stoĹ›Ä‡ diagramu** â€” gdy liczba elementĂłw na jednostkÄ™ powierzchni przekracza prĂłg czytelnoĹ›ci (zdefiniowany jako: etykiety nakĹ‚adajÄ… siÄ™ w >30% przypadkĂłw przy INLINE).
2. **SzczegĂłĹ‚y pomocnicze** â€” np. szczegĂłĹ‚owe parametry katalogowe (rezystancja termiczna, prÄ…d dynamiczny), ktĂłre nie sÄ… kluczowe dla podstawowej analizy.
3. **Historia wynikĂłw** â€” porĂłwnanie Case A vs Case B w tym samym BUS (panel boczny, nie main diagram).

**FORBIDDEN:**
- ON-DEMAND jako **domyĹ›lny sposĂłb prezentacji** parametrĂłw kluczowych (R/X/B, Sn, `Ikâ€ł`).
- ON-DEMAND jako sposĂłb na "uproszenie" UI kosztem dostÄ™pnoĹ›ci informacji.

**ReguĹ‚a:**
> JeĹ›li informacja jest kluczowa dla zrozumienia sieci lub wynikĂłw â†’ **MUST byÄ‡ widoczna**.
> JeĹ›li informacja jest pomocnicza lub rzadko uĹĽywana â†’ **MAY byÄ‡ ON-DEMAND**.

---

## 5. Etykiety CAD: INLINE â†’ OFFSET â†’ SIDE STACK

### 5.1 Hierarchia trybĂłw

**CANONICAL:**

System wybiera tryb prezentacji etykiet CAD wedĹ‚ug nastÄ™pujÄ…cej hierarchii:

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  1. INLINE (domyĹ›lnie)                                       â”‚
â”‚     â””â”€> JeĹ›li kolizja > 30% â†’ przejdĹş do 2                  â”‚
â”‚                                                              â”‚
â”‚  2. OFFSET (leader line)                                     â”‚
â”‚     â””â”€> JeĹ›li kolizja > 50% â†’ przejdĹş do 3                  â”‚
â”‚                                                              â”‚
â”‚  3. SIDE STACK (tabela boczna)                               â”‚
â”‚     â””â”€> UĹĽywane zawsze w trybie audytu/wydruku              â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

### 5.2 INLINE (tryb domyĹ›lny)

**Definicja:**
Etykiety umieszczone bezpoĹ›rednio na symbolu lub wzdĹ‚uĹĽ linii, bez oddzielenia.

**MUST:**
- Etykieta jest czÄ™Ĺ›ciÄ… symbolu (rendering atomowy).
- Tekst jest czytelny przy standardowym zoomie (100%).
- Parametry sÄ… uporzÄ…dkowane wertykalnie lub horyzontalnie wg staĹ‚ego schematu.

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
Etykiety przesuniÄ™te poza symbol, z liniÄ… wiodÄ…cÄ… (leader) wskazujÄ…cÄ… element.

**Kiedy stosowaÄ‡:**
- Automatyczny fallback, gdy **INLINE powoduje kolizje** (nakĹ‚adanie siÄ™ tekstu).
- GÄ™stoĹ›Ä‡ elementĂłw wysoka, ale nie krytyczna.

**MUST:**
- Leader line (linia wiodÄ…ca) jest **cienka, przerywana** (nie myliÄ‡ z liniÄ… elektrycznÄ…).
- Etykieta jest w prostokÄ…tnym polu z tĹ‚em (biaĹ‚ym lub pĂłĹ‚przeĹşroczystym).
- OdlegĹ‚oĹ›Ä‡ od symbolu: min 10 px, max 50 px.

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
Wszystkie etykiety zebrane w tabeli bocznej (panel), elementy na diagramie majÄ… **referencje numeryczne** (ID).

**Kiedy stosowaÄ‡:**
- **Audyt/dokument** â€” wydruk do dokumentacji projektowej, raporty.
- **Ekstremalna gÄ™stoĹ›Ä‡** â€” gdy OFFSET nie rozwiÄ…zuje problemu kolizji.
- **PorĂłwnania** â€” wyĹ›wietlanie Case A vs Case B w tabeli bocznej.

**MUST:**
- KaĹĽdy element na diagramie ma unikalny **identyfikator numeryczny** (np. L-12, T-03, B-05).
- Tabela boczna zawiera **wszystkie parametry** danego elementu.
- KlikniÄ™cie ID w tabeli â†’ podĹ›wietlenie elementu na diagramie.
- KlikniÄ™cie elementu na diagramie â†’ podĹ›wietlenie wiersza w tabeli.

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

### 5.5 Automatyczne przeĹ‚Ä…czanie trybĂłw

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
Procent etykiet, ktĂłrych bounding box nakĹ‚ada siÄ™ z innymi etykietami lub symbolami.

**UĹĽytkownik MAY:**
- WymusiÄ‡ tryb SIDE STACK rÄ™cznie (np. przycisk "Tryb audytu").
- WyĹ‚Ä…czyÄ‡ automatyczne przeĹ‚Ä…czanie (ustawienie preferencji).

**UĹĽytkownik MUST NOT:**
- MieÄ‡ moĹĽliwoĹ›ci trwaĹ‚ego wyĹ‚Ä…czenia CAD overlay (moĹĽe tylko tymczasowo ukryÄ‡).

---

## 6. Szyny (BUS): Zasady geometryczne

### 6.1 ReguĹ‚a podstawowa

**CANONICAL:**

> Jedna szyna (Bus) = **jedna, ciÄ…gĹ‚a belka pozioma**.

**MUST:**
- Szyna jest reprezentowana jako **pojedyncza, gruba linia pozioma**.
- SzerokoĹ›Ä‡ linii: 3-5 px (zaleĹĽnie od zoomu).
- Kolor:
  - `in_service=True` â†’ kolor operacyjny (np. niebieski, czerwony dla wysokiego napiÄ™cia),
  - `in_service=False` â†’ szary.
- JeĹ›li do szyny podĹ‚Ä…czonych jest wiele elementĂłw â†’ wszystkie Ĺ‚Ä…czÄ… siÄ™ **do tej samej belki**.

### 6.2 Zakazy (FORBIDDEN)

**NIGDY:**

| Zabronione | Dlaczego | PrawidĹ‚owe |
|------------|----------|------------|
| **Dwie rĂłwnolegĹ‚e linie dla jednego BUS** | Sugeruje dwa rĂłĹĽne BUS (bĹ‚Ä™dna topologia) | Jedna linia |
| **Pseudo-sekcje** (linia przerywana w Ĺ›rodku BUS) | Sugeruje sekcjonowanie, ktĂłre nie istnieje w modelu | Jedna ciÄ…gĹ‚a linia |
| **PodwĂłjne belki** (sekciĂł busbar) | WyglÄ…da jak dwie szyny w ukĹ‚adzie H/Z | Jeden BUS = jedna belka |
| **Linie pionowe jako BUS** | Konwencja inĹĽynierska: BUS = poziomo | Zawsze poziomo (z wyjÄ…tkiem schematu poziomego transformatora) |

### 6.3 Wiele poziomĂłw napiÄ™cia

JeĹ›li diagram zawiera wiele poziomĂłw napiÄ™cia (np. SN, nn):

**MUST:**
- KaĹĽdy poziom ma **osobnÄ… warstwÄ™ wizualnÄ…** (rĂłĹĽne wysokoĹ›ci Y na diagramie).
- Transformatory Ĺ‚Ä…czÄ… warstwy pionowymi liniami.
- BUS w jednym poziomie **NIE MOGÄ„** nachodziÄ‡ na BUS w innym poziomie (separacja Y).

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

**MUST byÄ‡ widoczne (CAD overlay):**

| Parametr | Jednostka | ĹąrĂłdĹ‚o | PrzykĹ‚ad |
|----------|-----------|--------|----------|
| DĹ‚ugoĹ›Ä‡ | km | User input | `L = 2.5 km` |
| PrzekrĂłj | mmÂ˛ | Catalog (type_ref) | `3Ă—150 mmÂ˛ Cu` |
| Rezystancja | Î©/km | Catalog | `R = 0.124 Î©/km` |
| Reaktancja | Î©/km | Catalog | `X = 0.08 Î©/km` |
| Susceptancja | ÂµS/km | Catalog | `B = 3.5 ÂµS/km` |

**KolejnoĹ›Ä‡ wyĹ›wietlania (BINDING):**
```
Linia [Nazwa]
L = [wartoĹ›Ä‡] km, [przekrĂłj] mmÂ˛ [materiaĹ‚]
R = [wartoĹ›Ä‡] Î©/km, X = [wartoĹ›Ä‡] Î©/km
```

**FORBIDDEN:**
- Pomijanie jednostek (`L = 2.5` zamiast `L = 2.5 km`).
- Pokazywanie tylko R lub tylko X (zawsze R **i** X).
- UĹĽywanie impedancji caĹ‚kowitej zamiast jednostkowej (chyba ĹĽe jawnie oznaczone jako `Z_total`).

### 7.2 Transformatory (TransformerBranch)

**MUST byÄ‡ widoczne (CAD overlay):**

| Parametr | Jednostka | ĹąrĂłdĹ‚o | PrzykĹ‚ad |
|----------|-----------|--------|----------|
| Moc znamionowa | MVA | Catalog | `Sn = 1.6 MVA` |
| NapiÄ™cie strony WN | kV | Catalog | `Un1 = 15 kV` |
| NapiÄ™cie strony NN | kV | Catalog | `Un2 = 0.4 kV` |
| NapiÄ™cie zwarcia | % | Catalog | `uk = 6%` |
| Grupa poĹ‚Ä…czeĹ„ | - | Catalog | `Dyn11` |

**KolejnoĹ›Ä‡ wyĹ›wietlania (BINDING):**
```
Transformator [Nazwa]
Sn = [wartoĹ›Ä‡] MVA, [Un1]/[Un2] kV
uk = [wartoĹ›Ä‡]%, [grupa]
```

### 7.3 ĹąrĂłdĹ‚a (Source)

**MUST byÄ‡ widoczne (CAD overlay):**

| Parametr | Jednostka | ĹąrĂłdĹ‚o | PrzykĹ‚ad |
|----------|-----------|--------|----------|
| Moc znamionowa | MVA | Catalog | `Sn = 2.5 MVA` |
| NapiÄ™cie znamionowe | kV | Catalog | `Un = 0.4 kV` |
| Typ | - | converter_kind | `PV` / `WIND` / `BESS` / `GRID` |

**KolejnoĹ›Ä‡ wyĹ›wietlania (BINDING):**
```
ĹąrĂłdĹ‚o [Nazwa] ([Typ])
Sn = [wartoĹ›Ä‡] MVA, Un = [wartoĹ›Ä‡] kV
```

**FORBIDDEN:**
- Pokazywanie impedancji wewnÄ™trznej w CAD overlay (impedancja jest parametrem solvera, nie katalogowym).

---

## 8. Duplikacja informacji miÄ™dzy SCADA a CAD

### 8.1 Kiedy dozwolone?

**ALLOWED:**

Duplikacja informacji miÄ™dzy SCADA a CAD jest **dozwolona**, jeĹ›li:

1. **Poprawia czytelnoĹ›Ä‡** â€” np. powtĂłrzenie nazwy BUS w CAD overlay, gdy SCADA uĹĽywa koloru.
2. **Nie zmienia semantyki** â€” ta sama wartoĹ›Ä‡ w obu warstwach (np. `in_service` jako kolor + tekst).
3. **Jest jawnie oznaczona** â€” np. `[SCADA]` vs `[CAD]` w etykiecie (tylko w trybie debug).

**PrzykĹ‚ad dozwolony:**
- SCADA: Szyna kolorowa (niebieski = `in_service=True`).
- CAD: Tekst "W eksploatacji: TAK".

### 8.2 Kiedy zabronione?

**FORBIDDEN:**

| BĹ‚Ä™dna duplikacja | Dlaczego | PrawidĹ‚owe |
|-------------------|----------|------------|
| **RĂłĹĽne wartoĹ›ci w SCADA vs CAD** | SprzecznoĹ›Ä‡ â†’ uĹĽytkownik nie wie, ktĂłrej wierzyÄ‡ | Jedna wartoĹ›Ä‡, jedno ĹşrĂłdĹ‚o prawdy |
| **Duplikacja wynikĂłw zwarciowych** | `Ikâ€ł` raz na BUS (CAD), raz w overlay (SCADA) | `Ikâ€ł` **tylko** w overlay wynikĂłw |
| **Duplikacja parametrĂłw katalogowych** | `Sn` raz w symbolu, raz w CAD | `Sn` **tylko** w CAD overlay |

---

## 9. Wydruk: ekran = PDF = prawda projektu

### 9.1 Zasada 1:1

**CANONICAL:**

> Wydruk (PDF/DOCX) jest **1:1 snapchotem UI** bez utraty informacji.

**MUST:**
- Wszystko, co widoczne na ekranie â†’ widoczne w PDF.
- SCADA + CAD â†’ obie warstwy w PDF.
- Etykiety INLINE/OFFSET â†’ zachowane w PDF.
- Etykiety SIDE STACK â†’ tabela boczna w PDF (jak na ekranie).

**FORBIDDEN:**
- Ukrywanie CAD overlay w PDF (jeĹ›li widoczne na ekranie).
- Zmiana trybĂłw etykiet przy wydruku (np. INLINE â†’ SIDE STACK bez zgody uĹĽytkownika).
- Pomijanie elementĂłw "zbyt maĹ‚ych" (wszystko musi byÄ‡ widoczne, nawet jeĹ›li wymaga to wielu stron).

### 9.2 Layout wydruku

**MUST:**

Strona PDF zawiera:

1. **NagĹ‚Ăłwek:**
   - TytuĹ‚ projektu,
   - Data wygenerowania,
   - Autor,
   - Case (jeĹ›li wyniki zwarciowe: MAX / MIN / N-1).

2. **Diagram SLD:**
   - Fragment SLD (jeĹ›li duĹĽy â†’ podzielony na strony),
   - SCADA + CAD overlay,
   - Legendy kolorĂłw i symboli.

3. **Tabela wynikĂłw (jeĹ›li RESULT_VIEW):**
   - Tabela BUS â†’ `Ikâ€ł` / `ip` / `Ith` / `Skâ€ł`,
   - Tabela wkĹ‚adĂłw (contributions),
   - Metadane (norma IEC 60909, snapshot ID, trace_id).

4. **Stopka:**
   - Numer strony,
   - Link do trace (opcjonalnie).

### 9.3 WielostronicowoĹ›Ä‡

JeĹ›li diagram nie mieĹ›ci siÄ™ na jednej stronie A4/A3:

**MUST:**
- PodziaĹ‚ na strony wedĹ‚ug **logicznych sekcji** (np. jedna strona = jeden poziom napiÄ™cia).
- Oznaczenie kontynuacji (strzaĹ‚ki "â†’ ciÄ…g dalszy na stronie X").
- PowtĂłrzenie nagĹ‚Ăłwka na kaĹĽdej stronie.

**FORBIDDEN:**
- CiÄ™cie elementĂłw w poĹ‚owie (np. transformator na dwĂłch stronach).
- Brak informacji o kontynuacji.

---

## 10. Integracja z pozostaĹ‚ymi dokumentami

### 10.1 PowiÄ…zania kanoniczne

| Dokument | Co definiuje | PowiÄ…zanie z SLD_SCADA_CAD_CONTRACT |
|----------|--------------|-------------------------------------|
| `sld_rules.md` | Podstawowe reguĹ‚y SLD (bijection, symbole, tryby) | SLD_SCADA_CAD rozszerza o CAD overlay i wydruk |
| `wizard_screens.md` | Tryby pracy systemu (MODEL_EDIT, CASE_CONFIG, RESULT_VIEW) | Tryby okreĹ›lajÄ…, kiedy CAD overlay jest aktywny |
| `SLD_SHORT_CIRCUIT_BUS_CENTRIC.md` | Prezentacja wynikĂłw zwarciowych (BUS-centric) | CAD overlay + wyniki zwarciowe = jedna warstwa kompozytowa |
| `SHORT_CIRCUIT_PANELS_AND_PRINTING.md` | Panele wynikĂłw, wydruk | Layout wydruku zgodny z Â§ 9 |
| `P11_SC_CASE_MAPPING.md` | Mapowanie Case â†’ ProofDocument | Wydruk zawiera trace_id dla kaĹĽdej liczby |

### 10.2 Rozstrzyganie konfliktĂłw

**BINDING:**

W przypadku konfliktu miÄ™dzy dokumentami:

1. **SYSTEM_SPEC.md** ma najwyĹĽszy priorytet (CANONICAL).
2. **SLD_SCADA_CAD_CONTRACT.md** (ten dokument) rozstrzyga konflikty miÄ™dzy SCADA a CAD.
3. **sld_rules.md** definiuje bazowe reguĹ‚y (bijection, symbole).
4. **wizard_screens.md** definiuje tryby pracy (MODEL_EDIT / RESULT_VIEW).

JeĹ›li konflikt pozostaje nierozstrzygniÄ™ty â†’ **zgĹ‚oĹ› jako Issue** (REPOSITORY-HYGIENE.md).

---

## 11. PrzykĹ‚ady (ilustracje kanoniczne)

### 11.1 PrzykĹ‚ad: Linia z INLINE etykietÄ…

```
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
                        â”‚
                        â”‚  Linia L-12
                        â”‚  L = 2.5 km, 3Ă—150 mmÂ˛ Cu
                        â”‚  R = 0.124 Î©/km, X = 0.08 Î©/km
                        â”‚  I = 125 A â†’
                        â”‚
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
```

**SCADA:**
- Kierunek przepĹ‚ywu (strzaĹ‚ka â†’),
- WartoĹ›Ä‡ prÄ…du `I = 125 A`,
- Kolor linii (zielony = loading < 80%).

**CAD overlay:**
- DĹ‚ugoĹ›Ä‡, przekrĂłj, materiaĹ‚,
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
- NapiÄ™cie operacyjne `U = 14.85 kV`,
- Kolor szyny (niebieski = normalne napiÄ™cie).

**CAD overlay:**
- NapiÄ™cie znamionowe `15 kV`,
- Typ szyny (gĹ‚Ăłwna/rozdzielcza).

**Overlay wynikĂłw (zwarcie):**
- `Ikâ€ł`, `ip`, `Skâ€ł` â€” **tylko przy BUS** (BUS-centric).

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
- Loading 85% â†’ kolor ĹĽĂłĹ‚ty (ostrzeĹĽenie).

**CAD overlay:**
- Parametry katalogowe: Sn, uk, grupa poĹ‚Ä…czeĹ„.

---

## 12. Podsumowanie reguĹ‚ (checklist)

**Implementacja zgodna z SLD_SCADA_CAD_CONTRACT, jeĹ›li:**

- [ ] Diagram zawiera **dwa aspekty** (SCADA + CAD) aktywne rĂłwnoczeĹ›nie.
- [ ] Wszystkie informacje kluczowe sÄ… **widoczne bez interakcji** (zasada "wszystko widoczne zawsze").
- [ ] ON-DEMAND jest uĹĽywane **tylko jako awaryjny fallback** (ekstremalna gÄ™stoĹ›Ä‡, szczegĂłĹ‚y pomocnicze).
- [ ] Jedna szyna (Bus) = **jedna, ciÄ…gĹ‚a belka pozioma** (zakaz podwĂłjnych belek, pseudo-sekcji).
- [ ] Etykiety CAD uĹĽywajÄ… hierarchii **INLINE â†’ OFFSET â†’ SIDE STACK** (automatyczne przeĹ‚Ä…czanie).
- [ ] Parametry katalogowe (R/X/B, Sn, uk) sÄ… **zawsze widoczne** w CAD overlay.
- [ ] Wydruk (PDF/DOCX) jest **1:1 snapchotem UI** bez utraty informacji.
- [ ] Terminologia: **BoundaryNode** (wÄ™zeĹ‚ przyĹ‚Ä…czenia), **BUS-centric**, **Case** (MAX/MIN/N-1).
- [ ] Duplikacja SCADA â†” CAD dozwolona **tylko jeĹ›li poprawia czytelnoĹ›Ä‡** i nie zmienia semantyki.
- [ ] System automatycznie wykrywa kolizje etykiet i przeĹ‚Ä…cza tryby (collision_ratio).

---

## 13. Integracja z kontraktami UI (SLD_UI_CONTRACT.md)

### 13.1 Pozycja dokumentu

**BINDING:**

`SLD_SCADA_CAD_CONTRACT.md` (ten dokument) definiuje **warstwy widoku** (SCADA + CAD).

`SLD_UI_CONTRACT.md` definiuje **kontrakty renderowania i interakcji** (priorytety, gÄ™stoĹ›Ä‡, kolory, wydruk, interakcja).

Oba dokumenty sÄ… **komplementarne** i obowiÄ…zujÄ… rĂłwnoczeĹ›nie.

### 13.2 UI Priority Stack (kontrakt #1)

**BINDING:**

Zgodnie z `SLD_UI_CONTRACT.md` Â§ 3 (UI Priority Stack):

1. **BUS** (wyniki zwarciowe, stan) â€” absolutny priorytet wizualny.
2. **LINIA** (prÄ…d roboczy `I`) â€” priorytet 2.
3. **CAD** (parametry katalogowe) â€” najniĹĽszy priorytet.

**Implikacje dla SLD_SCADA_CAD_CONTRACT:**

- Wyniki zwarciowe przy BUS (Â§ 4.3 tego dokumentu) **MUSZÄ„** byÄ‡ widoczne zawsze (INLINE lub OFFSET, nigdy SIDE STACK).
- Parametry CAD (Â§ 7 tego dokumentu) **MOGÄ„** byÄ‡ przesuwane do OFFSET lub SIDE STACK przy kolizji z wynikami BUS.
- PrÄ…d roboczy linii (Â§ 4.3 tego dokumentu) **MUSI** byÄ‡ widoczny, ale moĹĽe ustÄ…piÄ‡ miejsca wynikom BUS.

### 13.3 Dense SLD Rules (kontrakt #2)

**BINDING:**

Zgodnie z `SLD_UI_CONTRACT.md` Â§ 4 (Dense SLD Rules):

- System automatycznie wykrywa gÄ™stoĹ›Ä‡ diagramu (`density > 0.10 elem/cmÂ˛`).
- Etykiety CAD przeĹ‚Ä…czajÄ… siÄ™: **INLINE â†’ OFFSET â†’ SIDE STACK** (zgodnie z Â§ 5 tego dokumentu).
- Wyniki BUS pozostajÄ… **INLINE lub OFFSET** niezaleĹĽnie od gÄ™stoĹ›ci (zgodnie z Â§ 4 tego dokumentu).

**ReguĹ‚a rozszerzona:**

```
â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  GÄ™stoĹ›Ä‡ < 0.10 elem/cmÂ˛:                                    â”‚
â”‚  - CAD: INLINE (domyĹ›lnie)                                   â”‚
â”‚  - Wyniki BUS: INLINE                                        â”‚
â”‚                                                              â”‚
â”‚  GÄ™stoĹ›Ä‡ 0.10 â€“ 0.20 elem/cmÂ˛:                               â”‚
â”‚  - CAD: OFFSET (auto fallback)                               â”‚
â”‚  - Wyniki BUS: INLINE (priorytet)                            â”‚
â”‚                                                              â”‚
â”‚  GÄ™stoĹ›Ä‡ > 0.20 elem/cmÂ˛:                                    â”‚
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
  - **Czerwony** = przeciÄ…ĹĽenie (loading > 100%) lub bĹ‚Ä…d,
  - **Szary** = `in_service=False`.

**CAD overlay (Â§ 3.2 tego dokumentu) uĹĽywa kolorĂłw neutralnych:**
- Czarny/ciemny dla tekstu i symboli (brak semantyki operacyjnej).

### 13.5 Print-First Contract (kontrakt #4)

**BINDING:**

Zgodnie z `SLD_UI_CONTRACT.md` Â§ 6 (Print-First Contract):

> **Ekran = PDF = prawda projektu**

**Implikacje dla wydruku (Â§ 9 tego dokumentu):**

- Wszystko widoczne na ekranie **MUSI** byÄ‡ widoczne w PDF (ĹĽadne auto-hide).
- Wyniki BUS i prÄ…dy linii **zawsze widoczne** na wydruku.
- Tryb etykiet (INLINE/OFFSET/SIDE STACK) **zachowany** w PDF.

### 13.6 Interaction Contract (kontrakt #5)

**BINDING:**

Zgodnie z `SLD_UI_CONTRACT.md` Â§ 7 (Interaction Contract):

- **Hover** = informacja (tooltip), nie zmienia stanu.
- **Click** = fokus + panel boczny (zgodnie z Â§ 10.1 `SLD_SCADA_CAD_CONTRACT.md`).
- **ESC** = zamkniÄ™cie panelu / anulowanie fokusa.

**Tooltip (SCADA + CAD):**

Hover nad BUS wyĹ›wietla:
1. SCADA: napiÄ™cie operacyjne, stan (`in_service`),
2. Wyniki: `Ikâ€ł`, `ip`, `Ith`, `Skâ€ł` (jeĹ›li RESULT_VIEW),
3. CAD: typ szyny, napiÄ™cie znamionowe.

---

**KONIEC DOKUMENTU SLD_SCADA_CAD_CONTRACT.md**
**Status:** CANONICAL (BINDING)
**Dokument jest ĹşrĂłdĹ‚em prawdy dla implementacji SLD UI w MV-DESIGN-PRO.**

