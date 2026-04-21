> **Historical note (V12.5)**
> This file is preserved as historical reference only.
> docs/spec/ is not an active source of truth.
> Any binding, canonical, AS-IS, TO-BE, or roadmap language below reflects the original document state and is kept for audit context.
> Use ../INDEX_KANONICZNY.md to locate current canonical documentation.

# ROZDZIAŁ 3: TOPOLOGIA I ŁĄCZNOŚĆ SIECI

**Dokument kanoniczny — MV-DESIGN-PRO**
**Wersja:** 1.0
**Status:** BINDING
**Warstwa:** ENM Domain / Solver Contract
**Zależności:** Rozdział 2 (ENM Domain Model) — ZAMKNIĘTY, nie podlega zmianom

---

## 3.1 Cel i zakres rozdziału

### 3.1.1 Cel

Niniejszy rozdział definiuje **kanoniczne zasady topologii i łączności sieci** w MV-DESIGN-PRO, obejmujące:

- dozwolone i zakazane połączenia między bytami ENM,
- modelowanie stacji elektroenergetycznych jako kompozycji bytów ENM,
- sekcjonowanie szyn SN (bus coupler),
- układ master–oddział (zasilanie liniowe SN),
- magistrale i linie wieloodcinkowe,
- walidacje topologiczne.

### 3.1.2 Zasada nadrzędna (BINDING)

> **Topologia sieci jest definiowana wyłącznie przez byty ENM i ich połączenia elektryczne.**
> **Pojęcia organizacyjne (Substation, Bay, Corridor) i graficzne (SLD) NIE MAJĄ znaczenia obliczeniowego.**

Solver widzi WYŁĄCZNIE byty obliczeniowe z zamkniętej listy §2.3:
Bus, Junction, OverheadLine, Cable, SwitchBranch, FuseBranch, Transformer, Source, Generator, Load.

### 3.1.3 Relacja do Rozdziału 2

Rozdział 2 definiuje **byty** i ich **atrybuty**.
Rozdział 3 definiuje **relacje** i **dozwolone połączenia** między tymi bytami.

Rozdział 3 **NIE** wprowadza nowych bytów ENM — operuje wyłącznie na zamkniętej liście z §2.3.

---

## 3.2 Fundament: Bus vs Junction — reguły topologiczne

### 3.2.1 Bus jako węzeł obliczeniowy

Bus jest fundamentalnym węzłem topologii sieci. Każdy Bus:
- posiada napięcie znamionowe (`voltage_kv`),
- jest mapowany na `Node` w solverze (`map_enm_to_network_graph()`),
- jest punktem rozpływowym (bilans mocy P/Q) i zwarciowym (I_k),
- reprezentuje **wspólny potencjał elektryczny** — wszystkie elementy przyłączone do tego samego Bus widzą to samo napięcie.

**Klasyfikacja napięciowa Bus:**

| Klasa | Zakres napięcia | Przykład | Rola typowa |
|---|---|---|---|
| Bus nn | U_n < 1 kV | Bus falownika, Bus nn stacji | Strona nn transformatora, źródła OZE |
| Bus SN | 1 kV ≤ U_n ≤ 36 kV | Bus sekcji szyny, Bus oddziału | Szyna zbiorcza rozdzielni SN |
| Bus WN | U_n > 36 kV | Bus WN GPZ | Strona WN transformatora GPZ |

### 3.2.2 Junction jako punkt topologiczny

Junction jest punktem rozgałęzienia magistrali. Junction:
- **NIE** posiada napięcia znamionowego,
- **NIE** jest mapowany na `Node` w solverze,
- **NIE** przyjmuje źródeł, odbiorów ani generatorów,
- służy WYŁĄCZNIE do modelowania rozgałęzień i wieloodcinkowych magistral.

**AS-IS** (`enm/models.py`):
```
Junction
├── connected_branch_refs: list[str]    # Min. 3 gałęzie (W007)
└── junction_type: "T_node" | "sectionalizer" | "recloser_point" | "NO_point"
```

### 3.2.3 Zakazy (BINDING)

1. **ZAKAZ** używania Junction jako Bus — przypisywanie napięcia, źródeł, odbiorów do Junction jest ERROR.
2. **ZAKAZ** mapowania Junction na `Node` solvera — Junction NIE jest węzłem obliczeniowym.
3. **ZAKAZ** modelowania sekcji szyny SN jako Junction — sekcja szyny SN MUSI być Bus SN.

---

## 3.3 Kanoniczne zasady łączenia bytów ENM

### 3.3.1 Kontrakt połączenia gałęzi

Każda gałąź (Branch) posiada dokładnie dwa końce:
- `from_bus_ref: str` — referencja do Bus początkowego,
- `to_bus_ref: str` — referencja do Bus końcowego.

**Inwariant:** Branch MUSI mieć dokładnie 2 końce. Brak `from_bus_ref` lub `to_bus_ref` jest ERROR.

### 3.3.2 Połączenia DOZWOLONE

| Element źródłowy | Element docelowy | Relacja | Pole referencji | Status |
|---|---|---|---|---|
| Bus | OverheadLine / Cable | Bus → Branch.from_bus_ref | `from_bus_ref` | DOZWOLONE |
| OverheadLine / Cable | Bus | Branch.to_bus_ref → Bus | `to_bus_ref` | DOZWOLONE |
| Bus | SwitchBranch / FuseBranch | Bus → Aparat.from_bus_ref | `from_bus_ref` | DOZWOLONE |
| SwitchBranch / FuseBranch | Bus | Aparat.to_bus_ref → Bus | `to_bus_ref` | DOZWOLONE |
| OverheadLine / Cable | Junction | Branch.to_bus_ref → Junction | `to_bus_ref`* | DOZWOLONE |
| Junction | OverheadLine / Cable | Junction → Branch.from_bus_ref | `from_bus_ref`* | DOZWOLONE |
| Transformer | Bus nn ↔ Bus SN | hv_bus_ref ↔ lv_bus_ref | `hv_bus_ref`, `lv_bus_ref` | OBOWIĄZKOWE |
| Source | Bus SN (lub Bus WN) | Source.bus_ref → Bus | `bus_ref` | OBOWIĄZKOWE |
| Generator | Bus nn | Generator.bus_ref → Bus nn | `bus_ref` | DOZWOLONE (§2.6) |
| Load | Bus | Load.bus_ref → Bus | `bus_ref` | DOZWOLONE |

*\* Junction jest realizowany przez Bus + Branch w mapowaniu — `connected_branch_refs` Junction wskazują na gałęzie, których `from_bus_ref`/`to_bus_ref` prowadzą do tymczasowego Bus w punkcie rozgałęzienia.*

### 3.3.3 Połączenia ZAKAZANE (ERROR)

| Połączenie | Powód zakazu | Walidacja |
|---|---|---|
| Generator → Bus SN (bez transformatora) | Falownik jest elementem nn (§2.6, Decyzja #11) | E-T01 |
| Load → Junction | Junction nie przyjmuje elementów końcowych | E-T02 |
| Generator → Junction | Junction nie przyjmuje elementów końcowych | E-T03 |
| Source → Junction | Junction nie jest węzłem obliczeniowym | E-T04 |
| Branch → Branch (bez Bus/Junction) | Każda gałąź musi mieć 2 końce na Bus/Junction | E-T05 |
| Transformer → Junction | Transformator łączy dwa Bus o różnych napięciach | E-T06 |
| Branch z > 2 końcami | Branch ma dokładnie 2 końce (from + to) | E-T07 |
| SwitchBranch łączący Bus o różnych U_n (z wyjątkiem bus_coupler) | Aparat łączeniowy łączy Bus o TYM SAMYM napięciu | E-T08 |

### 3.3.4 Reguła poziomu napięcia (BINDING)

Połączenie Bus ↔ Branch ↔ Bus MUSI zachowywać spójność napięciową:
- Linia / Kabel: `from_bus_ref.voltage_kv == to_bus_ref.voltage_kv` (ten sam poziom).
- SwitchBranch / FuseBranch: `from_bus_ref.voltage_kv == to_bus_ref.voltage_kv` (ten sam poziom).
- Transformer: `hv_bus_ref.voltage_kv > lv_bus_ref.voltage_kv` (OBOWIĄZKOWE — transformacja napięcia).

Jedynym elementem łączącym dwa Bus o RÓŻNYCH napięciach jest **Transformer**.

---

## 3.4 Stacje elektroenergetyczne — zasada modelowania

### 3.4.1 Stacja NIE jest bytem ENM

Stacja elektroenergetyczna (GPZ, rozdzielnia SN, stacja oddziałowa):
- **NIE JEST** bytem obliczeniowym ENM,
- **JEST** kompozycją bytów ENM: Busów, Branchy, aparatów i transformatorów.

Solver nie widzi „stacji" — widzi Bus, Branch, Switch, Transformer.

### 3.4.2 Byty organizacyjne (nie obliczeniowe)

| Byt ENM | Rola | Solver | Decyzja |
|---|---|---|---|
| `Substation` | Kontener logiczny stacji | NIE widzi | #8a |
| `Bay` | Pole rozdzielcze (rola: IN/OUT/TR/COUPLER/FEEDER/OZE) | NIE widzi | #8a |
| `Corridor` | Magistrala / trasa (radial/ring/mixed) | NIE widzi | #8c |

**Reguła BINDING:** Byty organizacyjne (Substation, Bay, Corridor) służą WYŁĄCZNIE do:
- organizacji wizualnej w SLD i drzewie ENM,
- identyfikacji ról (pole liniowe, transformatorowe, sprzęgłowe),
- opisu tras magistralnych (radial / ring z NO point).

**ZAKAZ:** Używania bytów organizacyjnych w logice obliczeniowej solvera.

### 3.4.3 Stacja jako kompozycja (przykład GPZ)

```
Stacja GPZ = {
  Substation: "GPZ Główna"
  │
  Bus WN:     Bus(voltage_kv=110)
  │
  Transformer: Transformer(hv_bus_ref=Bus_WN, lv_bus_ref=Bus_SN_sekcja_I)
  │
  Bus SN I:   Bus(voltage_kv=15)
  │
  SwitchBranch(bus_coupler): from=Bus_SN_sekcja_I, to=Bus_SN_sekcja_II
  │
  Bus SN II:  Bus(voltage_kv=15)
  │
  Source:      Source(bus_ref=Bus_SN_sekcja_I)  ← zasilanie z sieci nadrzędnej
  │
  Bays:       Bay(IN), Bay(OUT×N), Bay(TR), Bay(COUPLER)  ← organizacja wizualna
}
```

---

## 3.5 Sekcjonowanie szyn SN (BINDING)

### 3.5.1 Zasada fundamentalna

> **Każda sekcja szyny SN jest modelowana jako osobny Bus SN.**

Sekcja szyny SN NIE jest:
- Junction,
- bytem graficznym (SLD),
- atrybutem innego Bus.

Sekcja szyny SN **JEST** pełnoprawnym Bus z własnym `voltage_kv`, własnym bilanem mocy i własnymi przyłączonymi elementami.

### 3.5.2 Sprzęgło sekcyjne (bus coupler)

Sprzęgło sekcyjne łączące dwie sekcje szyny SN:
- jest modelowane jako `SwitchBranch(type="bus_coupler")`,
- łączy DOKŁADNIE dwa Bus SN (`from_bus_ref`, `to_bus_ref`),
- oba Bus SN MUSZĄ mieć to samo napięcie znamionowe,
- jego stan (`status`: closed/open) wpływa **bezpośrednio** na topologię obliczeniową.

**AS-IS** (`enm/models.py`):
```
SwitchBranch
├── type: "bus_coupler"
├── from_bus_ref: str     → Bus SN sekcja I
├── to_bus_ref: str       → Bus SN sekcja II
└── status: "closed" | "open"
```

**Mapowanie na solver** (`mapping.py`):
```
SwitchBranch(bus_coupler) → Switch(type=LOAD_SWITCH, state=CLOSED|OPEN)
```

### 3.5.3 Topologia kanoniczna — rozdzielnia SN z 2 sekcjami

```
Source (sieć nadrzędna)
│
Bus WN (110 kV)
│
Transformer WN/SN
│
Bus SN sekcja I (15 kV)  ←── [pola liniowe, transformatorowe, OZE]
│
SwitchBranch (bus_coupler, zamknięty/otwarty)
│
Bus SN sekcja II (15 kV) ←── [pola liniowe, transformatorowe, OZE]
│
(opcjonalnie: drugi Transformer WN/SN → Bus WN → Source)
```

### 3.5.4 Konsekwencje obliczeniowe sekcjonowania

| Aspekt | Sprzęgło zamknięte | Sprzęgło otwarte |
|---|---|---|
| Topologia | Jedna wyspa (Bus I + Bus II połączone) | Dwie wyspy (Bus I i Bus II rozdzielone) |
| Prądy zwarciowe | Obliczane dla połączonego układu | Obliczane osobno dla każdej sekcji |
| Rozpływ mocy | Wspólny bilans P/Q | Osobne bilanse P/Q |
| Selektywność | Wspólna koordynacja | Koordynacja per sekcja |
| White Box | Raportuje stan sprzęgła w chwili zdarzenia | j.w. |

### 3.5.5 Rozszerzenie na N sekcji

System MUSI obsługiwać dowolną liczbę sekcji:
```
Bus SN I ── coupler ── Bus SN II ── coupler ── Bus SN III ── ...
```

Każdy coupler to osobny `SwitchBranch(type="bus_coupler")` z niezależnym stanem.

### 3.5.6 Zakazy sekcjonowania (BINDING)

1. **ZAKAZ** modelowania wielu sekcji szyny jako jednego Bus SN — każda sekcja = osobny Bus.
2. **ZAKAZ** modelowania sekcji jako Junction — sekcja szyny jest węzłem obliczeniowym.
3. **ZAKAZ** łączenia sprzęgłem Bus o różnych napięciach — `bus_coupler` łączy WYŁĄCZNIE Bus o tym samym `voltage_kv`.
4. **ZAKAZ** pomijania stanu sprzęgła w White Box — raport MUSI uwzględniać stan (open/closed) każdego couplera.

---

## 3.6 Układ master–oddział (zasilanie liniowe SN) (BINDING)

### 3.6.1 Definicja

Układ master–oddział to topologia, w której:
- istnieje **Bus SN w stacji nadrzędnej (master)** — stacja posiadająca Source,
- istnieje **Bus SN w stacji zasilanej liniowo (oddział)** — stacja BEZ Source,
- połączenie realizowane jest przez linię/kabel SN (OverheadLine lub Cable).

Stacja oddziałowa:
- **NIE** posiada Source (nie jest węzłem zasilającym),
- **JEST** częścią tej samej sieci SN (ten sam poziom napięcia),
- **MOŻE** posiadać transformatory SN/nn i dalsze odpływy,
- **MOŻE** posiadać lokalne sekcjonowanie szyn (§3.5),
- **MOŻE** być elementem ringu SN (jeżeli istnieje druga linia zasilająca).

### 3.6.2 Topologia kanoniczna

```
STACJA MASTER (GPZ):                    STACJA ODDZIAŁ:
┌────────────────────┐                  ┌────────────────────┐
│ Source             │                  │ (brak Source)      │
│ │                  │                  │                    │
│ Bus WN (110 kV)    │                  │                    │
│ │                  │                  │                    │
│ Transformer WN/SN  │                  │                    │
│ │                  │                  │                    │
│ Bus SN (15 kV)     │                  │ Bus SN (15 kV)     │
│ │                  │                  │ │                  │
│ Pole liniowe (Bay) │                  │ Pole liniowe (Bay) │
│ │                  │                  │ │                  │
│ SwitchBranch (CB)  │                  │ SwitchBranch (CB)  │
└────┤───────────────┘                  └────┤───────────────┘
     │                                       │
     └──── Line SN / Cable SN ───────────────┘
```

**Interpretacja ENM:**
- `Bus SN (master)` ≠ `Bus SN (oddział)` — dwa odrębne węzły obliczeniowe.
- Brak „dziedziczenia" napięcia — każdy Bus posiada własne `voltage_kv`.
- Linia SN między stacjami: `OverheadLine(from_bus_ref=Bus_SN_master, to_bus_ref=Bus_SN_oddział)`.
- Source przyłączony WYŁĄCZNIE do stacji master (bezpośrednio lub przez transformator WN/SN).

### 3.6.3 Stacja oddziałowa z odpływami

```
Bus SN (oddział, 15 kV)
├── SwitchBranch (CB) → OverheadLine → Bus SN (kolejny oddział)
├── SwitchBranch (CB) → Transformer SN/nn → Bus nn → Load
├── SwitchBranch (CB) → Transformer SN/nn → Bus nn → Generator (OZE)
└── (opcja) SwitchBranch (bus_coupler) → Bus SN sekcja II (oddział)
```

### 3.6.4 Układ pierścieniowy (ring) z NO point

Stacje oddziałowe mogą tworzyć pierścień SN:

```
Bus SN (master)
│                          │
Line SN (droga A)          Line SN (droga B)
│                          │
Bus SN (oddział 1)         Bus SN (oddział N)
│                          │
Line SN                    Line SN
│                          │
Bus SN (oddział 2) ─ ... ─ Bus SN (oddział N-1)
                    ↑
              NO point (Branch z status="open")
```

**AS-IS:** Corridor modeluje trasę pierścienia:
```
Corridor(corridor_type="ring", ordered_segment_refs=[...], no_point_ref="branch_NO")
```

NO point jest realizowany przez `Branch(status="open")` lub `SwitchBranch(status="open")`.

### 3.6.5 Zasady BINDING

1. Stacja zasilana liniowo **NIE MOŻE** posiadać Source — zasilanie wyłącznie przez linię SN z master.
2. Bus SN master i Bus SN oddział **MUSZĄ** mieć to samo `voltage_kv`.
3. Każdy Bus SN (master i oddział) jest **niezależnym węzłem obliczeniowym** — brak „dziedziczenia" napięcia.
4. Stacja oddziałowa **MOŻE** posiadać lokalne sekcjonowanie (§3.5).
5. Stacja oddziałowa **MOŻE** być elementem ringu SN (NO point modelowany jako Branch/SwitchBranch z status="open").
6. Walidator MUSI wykrywać stację oddziałową bez połączenia do Source (wyspa bez zasilania = E003).

---

## 3.7 Magistrale i linie wieloodcinkowe

### 3.7.1 Definicja magistrali

Magistrala to sekwencja gałęzi łączących Bus źródłowy z jednym lub wieloma Bus docelowymi:

```
Bus → Branch → (Junction → Branch)* → Bus
```

Każdy odcinek magistrali:
- jest osobną instancją `Branch` (OverheadLine lub Cable),
- posiada własny typ z katalogu (`catalog_ref`),
- posiada własną długość (`length_km`),
- posiada własne parametry impedancyjne.

### 3.7.2 Rozgałęzienie magistrali (Junction)

Junction modeluje punkt rozgałęzienia magistrali:

```
Bus SN (stacja)
│
OverheadLine odcinek 1
│
Junction (T_node)
├── OverheadLine odcinek 2a → Bus SN (oddział A)
└── OverheadLine odcinek 2b → Bus SN (oddział B)
```

**AS-IS:** `Junction(junction_type="T_node", connected_branch_refs=[odc1, odc2a, odc2b])`

### 3.7.3 Punkty specjalne magistrali

| Typ Junction | Rola | Zastosowanie |
|---|---|---|
| `T_node` | Rozgałęzienie fizyczne | Punkt odgałęzienia magistrali |
| `sectionalizer` | Sekcjoner na magistrali | Punkt podziału magistrali (aparat izolacyjny) |
| `recloser_point` | SPZ na magistrali | Punkt samoczynnego ponownego załączenia |
| `NO_point` | Punkt normalnie otwarty | Pierścień SN — punkt rozwarcia |

### 3.7.4 Reguły magistral (BINDING)

1. Każdy odcinek magistrali MUSI być osobną instancją Branch — zakaz „mega-gałęzi" łączących Bus odległy bezpośrednio.
2. Rozgałęzienie modelowane przez Junction z minimum 3 gałęziami (W007).
3. NO point (punkt normalnie otwarty) modelowany jako Branch/SwitchBranch z `status="open"` lub Junction z `junction_type="NO_point"`.
4. Corridor (`corridor_type`, `ordered_segment_refs`, `no_point_ref`) opisuje trasę magistrali — NIE wpływa na solver.

---

## 3.8 Walidacje topologiczne (BINDING)

### 3.8.1 Walidacje obowiązkowe

System MUSI wykrywać i raportować następujące naruszenia topologii:

| Kod | Poziom | Warunek | Opis |
|---|---|---|---|
| E-T01 | ERROR | Generator → Bus SN bez transformatora | Falownik nn podłączony bezpośrednio do szyny SN (§2.6, Decyzja #11) |
| E-T02 | ERROR | Load → Junction | Odbiór przyłączony do Junction zamiast Bus |
| E-T03 | ERROR | Generator → Junction | Generator przyłączony do Junction zamiast Bus |
| E-T04 | ERROR | Source → Junction | Source przyłączony do Junction zamiast Bus |
| E-T05 | ERROR | Branch → Branch (bez Bus/Junction) | Gałąź bez węzłów na obu końcach |
| E-T06 | ERROR | Transformer → Junction | Transformator wymaga Bus (nie Junction) na obu stronach |
| E-T07 | ERROR | Branch z ≠ 2 końcami | Gałąź musi mieć dokładnie `from_bus_ref` i `to_bus_ref` |
| E-T08 | ERROR | Coupler łączy Bus o różnych U_n | `bus_coupler` wymaga jednakowego `voltage_kv` na obu Bus |
| E-T09 | ERROR | Stacja oddziałowa z Source | Stacja zasilana liniowo nie może posiadać Source (§3.6) |
| E-T10 | ERROR | Sekcja szyny modelowana jako Junction | Sekcja szyny SN MUSI być Bus SN (§3.5) |
| W-T01 | WARNING | Bus SN bez aparatu na odejściu | Odejście z Bus SN bez SwitchBranch/FuseBranch |
| W-T02 | WARNING | Magistrala bez Junction przy rozgałęzieniu | Brak punktu rozgałęzienia na magistrali wieloodcinkowej |
| I-T01 | INFO | Sprzęgło sekcyjne otwarte | Informacja: sekcje szyny SN pracują rozdzielnie |
| I-T02 | INFO | Ring SN z NO point | Informacja: pierścień SN z punktem normalnie otwartym |

### 3.8.2 Relacja do istniejących walidacji

Walidacje E-T01 — I-T02 uzupełniają (nie zastępują) istniejące walidacje:

| Grupa | Kody | Warstwa | Cel |
|---|---|---|---|
| ENM Validator (§2.11) | E001–I005 | ENM Core | Kompletność i poprawność modelu |
| Protection Validations (§2.19) | E-P01–I-P02 | Analysis | Konfiguracja zabezpieczeń |
| **Topology Validations (§3.8)** | **E-T01–I-T02** | **ENM Core / Topology** | **Łączność i spójność topologii** |

Wszystkie trzy grupy walidacji są niezależne i nie kolidują.

### 3.8.3 Walidacje AS-IS

System posiada (AS-IS):
- `E003` — weryfikacja spójności grafu (islands bez Source) → `enm/validator.py:446-483`.
- `W007` — walidacja Junction (min. 3 gałęzie) → `enm/validator.py:357-383`.
- `W008` — walidacja Corridor (poprawne referencje segmentów) → `enm/validator.py:385-399`.

**GAP (TO-BE):** Brak walidacji E-T01 (generator na SN), E-T08 (coupler różne U_n), E-T09 (oddział z Source), E-T10 (sekcja jako Junction). Do opisania w SPEC_07.

---

## 3.9 Kontrakt topologia → solver

### 3.9.1 Wpływ topologii na solver

Solver (SC / PF) widzi topologię jako graf:
- **Węzły** = Bus (mapowane na Node),
- **Krawędzie** = Branch + Transformer + Switch (mapowane na LineBranch / TransformerBranch / Switch),
- **Stan krawędzi** = `status` (closed/open) determinuje czy krawędź istnieje w grafie.

**AS-IS** (`network_model/core/graph.py`):
- Graf: `nx.MultiGraph` (nieskierowany, dopuszcza krawędzie równoległe).
- Branch dodany do grafu TYLKO jeśli `in_service=True`.
- Switch dodany do grafu TYLKO jeśli `in_service=True` AND `state=CLOSED`.

### 3.9.2 Wpływ sekcjonowania na solver

| Stan sprzęgła | Wpływ na graf | Konsekwencja obliczeniowa |
|---|---|---|
| `bus_coupler(status="closed")` | Krawędź istnieje → Bus I i Bus II w jednej wyspie | Wspólny rozpływ, prądy zwarciowe dla połączonego układu |
| `bus_coupler(status="open")` | Krawędź NIE istnieje → Bus I i Bus II w osobnych wyspach | Osobne rozpływy, prądy zwarciowe per sekcja |

### 3.9.3 White Box — raportowanie topologii

White Box MUSI raportować w każdej analizie:
- stan każdego SwitchBranch/FuseBranch (open/closed),
- stan każdego couplera (open/closed),
- identyfikację wysp (connected components),
- źródło zasilania dla każdej wyspy (Source → Bus → ścieżka).

---

## 3.10 Relacja do kreatora (Wizard)

### 3.10.1 Odpowiedzialność kreatora

Kreator MUSI prowadzić użytkownika zgodnie z zasadami topologii z niniejszego rozdziału:

1. Kreator MUSI rozróżniać:
   - Bus SN sekcji szyny (§3.5),
   - Bus SN zasilany liniowo (§3.6).

2. Kreator NIE MOŻE tworzyć połączeń sprzecznych z §3.3.3 (ERROR).

3. Kreator MUSI wymuszać:
   - osobny Bus SN dla każdej sekcji szyny,
   - SwitchBranch(bus_coupler) między sekcjami,
   - brak Source na stacji oddziałowej.

4. Kreator MUSI oferować scenariusze:
   - K-TOP-1: Dodanie sekcji szyny SN (nowy Bus SN + coupler),
   - K-TOP-2: Dodanie stacji oddziałowej (nowy Bus SN + linia zasilająca, bez Source),
   - K-TOP-3: Zamknięcie pierścienia SN (dodanie drugiej linii + NO point).

### 3.10.2 Walidacja w kreatorze

Kreator MUSI walidować topologię na bieżąco (P0/P1) przed zatwierdzeniem:
- spójność napięciowa (Bus po obu stronach Branch),
- kompletność połączeń (brak „wiszących" Bus),
- brak zakazanych połączeń (§3.3.3).

---

## 3.11 Definition of Done — Topologia i Łączność (FINAL)

### 3.11.1 Kryteria zamknięcia

| # | Kryterium | Status |
|---|---|---|
| 1 | Zasada nadrzędna: topologia = byty ENM + połączenia elektryczne | ✅ §3.1.2 |
| 2 | Bus vs Junction: semantyka obliczeniowa vs topologiczna | ✅ §3.2 |
| 3 | Dozwolone połączenia: pełna macierz From×To | ✅ §3.3.2 |
| 4 | Zakazane połączenia: 10 reguł ERROR | ✅ §3.3.3 |
| 5 | Reguła poziomu napięcia: Transformer jedyny most między U_n | ✅ §3.3.4 |
| 6 | Stacje = kompozycja bytów ENM, nie byt obliczeniowy | ✅ §3.4 |
| 7 | Sekcjonowanie szyn SN: każda sekcja = Bus SN | ✅ §3.5 |
| 8 | Sprzęgło sekcyjne: SwitchBranch(bus_coupler) | ✅ §3.5.2 |
| 9 | Układ master–oddział: stacja bez Source, zasilanie liniowe | ✅ §3.6 |
| 10 | Pierścień SN z NO point | ✅ §3.6.4 |
| 11 | Magistrale wieloodcinkowe: Branch → Junction → Branch | ✅ §3.7 |
| 12 | Walidacje topologiczne: E-T01…I-T02 (14 reguł) | ✅ §3.8 |
| 13 | Kontrakt topologia → solver: stan krawędzi, wyspy | ✅ §3.9 |
| 14 | Relacja do kreatora: scenariusze K-TOP-1..3 | ✅ §3.10 |
| 15 | Zgodność z benchmark / benchmark | ✅ pełna |

### 3.11.2 Oświadczenie zamknięcia (BINDING)

> **Rozdział 3 (Topologia i Łączność) jest ZAMKNIĘTY.**
>
> Dalsze modyfikacje sekcji §3.1–§3.11 wymagają formalnej decyzji architektonicznej (ADR)
> i wpisu do Macierzy Decyzji w AUDIT_SPEC_VS_CODE.md.
>
> Zasady topologii definiują kompletny kanon relacji między bytami ENM.

---

**KONIEC ROZDZIAŁU 3**

---

*Dokument kanoniczny. Wersja 1.0 FINAL. Topologia i łączność sieci.*

