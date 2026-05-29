# ADR-011: Model obciążeń ZIP w przepływie mocy (realizacja inwariantu Z-ZIP-04)

## Status

Proposed — kierunek autoryzowany przez właściciela (świadome, zakresowe zniesienie
bariery B-01 dla tej jednej zmiany). Niniejszy ADR przedstawia **pełny kontrakt
solverowy** do zatwierdzenia szczegółów **zanim** edytowany będzie zamrożony rdzeń
Newton-Raphson. Wymóg formalny: inwariant **Z-ZIP-04** (`SPEC_CHAPTER_07`,
wiersz 1032): *„Aktywacja ZIP wymaga osobnej decyzji ADR z pełnym kontraktem
solverowym"*.

## Kontekst

- **Luka K-29 / §8C.5:** „QSTS jest, ZIP brak". Brak jawnego modelu obciążeń
  zależnych od napięcia P(U)/Q(U). Wszystkie odbiory liczone jako stała moc (PQ).
- **Model już rezerwuje tryb ZIP:** `enm/models.py:289` — `Load.model:
  Literal["pq", "zip"] = "pq"`. Tryb `"zip"` jest dziś **zablokowany** w
  projekcji (`enm/v2_projection.py:497-503`: *„Odbior ZIP wymaga pelnego
  kontraktu profilu obciazenia w ENM v2.0"*), a `MIGRACJA_ENM_V1_V2.md`
  oznacza `zip` jako *„wymagający solver support"*. Czyli architektura ma
  zarezerwowane miejsce — ten ADR je **aktywuje**.
- **Bariera B-01 (zamrożony rdzeń):** solver NR (`power_flow_newton_internal.py`)
  jest zamrożonym, deterministycznym rdzeniem. ADR-007 wymaga ADR dla
  „modyfikacji formuł / zmiany struktury wyników". Właściciel autoryzował tę
  konkretną zmianę.

## Decyzja

### 1. Model fizyczny ZIP (wielomian napięciowy)

Dla węzła odbiorczego o mocy bazowej P₀, Q₀ przy napięciu odniesienia V₀ (= 1.0 pu):

```
P_load(V) = P₀ · [ a_p·(V/V₀)² + b_p·(V/V₀) + c_p ]      (Z + I + P)
Q_load(V) = Q₀ · [ a_q·(V/V₀)² + b_q·(V/V₀) + c_q ]
```

Ograniczenia (walidowane): `a_p + b_p + c_p = 1`, `a_q + b_q + c_q = 1`,
każdy współczynnik ∈ [0, 1] (model fizyczny: udziały składowych Z/I/P).
Składowe: `a` = stała impedancja (Z, ~V²), `b` = stały prąd (I, ~V),
`c` = stała moc (P, niezależna od V).

**Wartość domyślna `a=b=0, c=1`** (stała moc) — odpowiada dzisiejszemu PQ.

### 2. Lokalizacja współczynników — przez katalog (Rule #10)

Współczynniki ZIP to **właściwość typu katalogowego**, materializowana do
`Load.materialized_params` (jak inne parametry typu). **NIE** bezpośrednie
wstrzyknięcie na element — zgodnie z Catalog Binding Rule. Brak współczynników
przy `model="zip"` ⇒ błąd walidacji (zakaz cichego założenia).

### 3. Integracja w NR (solver kanoniczny)

- `p_spec`/`q_spec` dla węzłów ZIP **przeliczane w każdej iteracji** z bieżącego
  |V| (część obciążeniowa; generacja i część stała bez zmian).
- **Jakobian — jeden dodatkowy człon na diagonali** bloków ∂P/∂V (J12) i ∂Q/∂V (J22):
  ```
  ∂P_spec_i/∂V_i = −P₀_i·(2·a_p·V_i/V₀² + b_p/V₀) / S_base
  ∂Q_spec_i/∂V_i = −Q₀_i·(2·a_q·V_i/V₀² + b_q/V₀) / S_base
  ```
  (znak ujemny: obciążenie = ujemny wstrzyk). Człon **odejmowany** od diagonali
  J12/J22, bo mismatch f_i = P_spec_i(V_i) − P_calc_i, a J = ∂P_calc/∂x − ∂P_spec/∂x.

### 4. INWARIANT bezpieczeństwa — reduce-to-NR (kluczowy)

Przy `a=b=0, c=1`: `P_load(V)=P₀` (stała), `∂P_spec/∂V=0`. Mismatch i Jakobian
**redukują się dokładnie** do obecnej postaci. ⇒ **Sieci ze stałą mocą dają wynik
bajt-w-bajt identyczny** z dzisiejszym solverem. Egzekwowane testem na referencyjnej
sieci (porównanie SHA-256 trace + wartości węzłowych przed/po). To gwarancja, że
edycja zamrożonego rdzenia **nie zmienia żadnego istniejącego wyniku**.

### 5. WHITE BOX i determinizm

- Trace eksponuje: współczynniki ZIP per węzeł, V₀, P_load(V)/Q_load(V) per iteracja,
  dodatkowy człon Jakobianu. Pełna audytowalność (Rule #2).
- Determinizm zachowany: przeliczenie deterministyczne, SHA-256 stabilne (Rule #7).

### 6. Zakres tej zmiany (jawnie sekwencjonowany — bez teatru)

- **W zakresie:** NR (kanoniczny) + model/kontrakt + walidacja + testy.
- **GS / FD:** **odrzucają** nietrywialne współczynniki ZIP **jawnym błędem**
  (`ZipNotSupportedError`) — **bez cichego pominięcia** (zakaz cichego fałszu).
  Pełne wsparcie ZIP w GS/FD = sekwencyjny follow-on (ten sam kontrakt).
- **P(f)/Q(f) (zależność częstotliwościowa):** **poza zakresem** statycznego
  rozpływu (f = nominalna, mnożnik = 1). Udokumentowane rozszerzenie dla studiów
  częstotliwościowych/wyspowych — nie udajemy, że jest.

### 7. Wpływ na zamrożone API wyników

Pola `PowerFlowResult` **niezmienione** (Frozen Result API, Rule #6). ZIP to
atrybut **wejścia**; skonwergowane wartości obciążenia są **addytywne** w trace
(nie łamią kontraktu). Brak bumpa wersji wyniku.

## Konsekwencje

### Pozytywne
- Realne obciążenia napięciozależne — istotne dla słabych sieci i integracji OZE.
- Aktywacja zarezerwowanej, ale martwej dotąd ścieżki `model="zip"`.
- Wzorzec dla GS/FD (ten sam kontrakt).

### Negatywne / ryzyka
- **Dotknięty zamrożony rdzeń NR** — ryzyko regresji. Mitygacja: inwariant
  reduce-to-NR (bajt-identyczność dla stałej mocy) + bateria testów + guard determinizmu.
- GS/FD chwilowo odrzucają ZIP (jawnie) — niespójność rozwiązana sekwencyjnie.
- P(f)/Q(f) nie dostarczone w tej turze (udokumentowane).

## Plan testów (warunek „done")
1. **reduce-to-NR:** sieć referencyjna ze stałą mocą — wynik (V, trace SHA-256)
   bajt-identyczny przed/po. *(bezpieczeństwo rdzenia)*
2. **const-Z** (`a=1`): obciążenie skaluje się ~V²; spadek napięcia mniejszy niż PQ.
3. **const-I** (`b=1`): obciążenie ~V.
4. **mix ZIP** (np. 0.4/0.3/0.3): zbieżność + bilans mocy.
5. **determinizm:** dwa przebiegi identyczne; guard determinizmu PASS.
6. **white-box:** człon ZIP i współczynniki obecne w trace.
7. **walidacja:** suma współczynników ≠ 1 ⇒ błąd; `zip` bez współczynników ⇒ błąd.
8. **GS/FD:** nietrywialny ZIP ⇒ `ZipNotSupportedError` (bez cichego PQ).

## Powiązane
- Inwariant **Z-ZIP-04** — `docs/spec/SPEC_CHAPTER_07_SOURCES_GENERATORS_LOADS.md:1032`
- [ADR-007](./ADR-007-iec60909-frozen-reference.md) — wzorzec zamrożonego solvera
- [ADR-008](./ADR-008-power-flow-location.md) — lokalizacja przepływu mocy
- `docs/v12xx/MIGRACJA_ENM_V1_V2.md` — `zip` jako „wymagający solver support"
