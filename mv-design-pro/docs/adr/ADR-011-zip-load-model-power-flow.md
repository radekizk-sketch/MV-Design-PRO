# ADR-011: Model obciążeń ZIP + P(f)/Q(f) w przepływie mocy (realizacja Z-ZIP-04)

## Status

Accepted — właściciel autoryzował edycję zamrożonego rdzenia (B-01) dla tej zmiany,
w **pełnym zakresie**: ZIP + zależność częstotliwościowa we **wszystkich trzech
solverach** (NR, GS, FD) oraz **pełne wpięcie** ENM→katalog→solver we wszystkich
miejscach budujących `PQSpec`. Brak odroczeń, brak „solver liczy, aplikacja nie
używa". Realizuje inwariant **Z-ZIP-04** (`SPEC_CHAPTER_07:1032`): *„Aktywacja ZIP
wymaga osobnej decyzji ADR z pełnym kontraktem solverowym"*.

## Kontekst

- **Luka K-29 / §8C.5:** brak jawnego modelu obciążeń zależnych od napięcia i
  częstotliwości. Wszystkie odbiory liczone jako stała moc (PQ).
- **Model rezerwuje tryb ZIP:** `enm/models.py:289` — `Load.model: Literal["pq",
  "zip"]`; `Load.materialized_params` gotowe na parametry z katalogu;
  `ENMDefaults.frequency_hz=50.0` (`models.py:97`) niesie częstotliwość studium.
- **Bariera B-01 (zamrożony rdzeń NR):** ADR-007 wymaga ADR dla „modyfikacji formuł".
  Właściciel autoryzował zakresowo tę zmianę; bramką bezpieczeństwa jest inwariant
  reduce-to-NR.

## Decyzja

### 1. Model fizyczny — ZIP (napięcie) + liniowa zależność częstotliwościowa

```
P_load(V, f) = P0 · [ a_p·(V/V0)² + b_p·(V/V0) + c_p ] · [ 1 + k_pf·(f-f0)/f0 ]
Q_load(V, f) = Q0 · [ a_q·(V/V0)² + b_q·(V/V0) + c_q ] · [ 1 + k_qf·(f-f0)/f0 ]
```

Ograniczenia (walidowane `validate_zip_coeffs`): `a+b+c = 1` dla P i Q, każdy ∈ [0,1];
`v0_pu>0`, `f0_hz>0`. Domyślnie `a=b=0, c=1, k=0` (stała moc, niezależna od f).

### 2. Częstotliwość — studyjne **wejście**, nie niewiadoma

`f` (częstotliwość systemu studium) to **wejście** rozpływu:
`PowerFlowInput.base_frequency_hz` (źródło: `ENMDefaults.frequency_hz`). Czynnik
częstotliwościowy jest **stały względem napięcia**, więc **jednorazowo skaluje bazę**
`p_spec/q_spec` (helper `apply_zip_frequency`, wspólny dla NR/GS/FD) — **nie** wchodzi
do iteracji ani do Jakobianu. Przy `f=f0` czynnik = 1. (Rozpływ z `f` jako niewiadomą
— droop/distributed slack — to odrębny solver częstotliwościowy, nie model obciążenia.)

### 3. Lokalizacja parametrów — przez katalog (Rule #10)

Parametry typu obciążenia (`a/b/c` P,Q, `v0_pu`, `k_pf`, `k_qf`, `f0_hz`) żyją na
typie katalogowym `LoadType` (`catalog/types.py`), eksponowane przez
`MaterializationContract.solver_fields` i materializowane do
`Load.materialized_params`. Helper `zip_coeffs_from_materialized_params` buduje
`ZipCoeffs` (None = stała moc). **Bez bezpośredniego wstrzyknięcia.**

### 4. Agregacja na szynie (ścieżka kanoniczna)

`map_enm_to_network_graph` agreguje obciążenia jednej szyny. Agregacja ZIP jest
**ważona mocą i dokładna** (wielomian sumy = suma wielomianów):
`udział_agg = Σ(P0ᵢ·udziałᵢ)/Σ P0ᵢ` (analogicznie Q i `k`). Helper `aggregate_zip`.
`Node` niesie zagregowane `ZipCoeffs`; `PQSpec.zip_coeffs` z nich powstaje.

### 5. Integracja w solverach (wszystkie trzy)

- **NR (v1 i v2):** `p_spec/q_spec` przeliczane per iteracja z bieżącego |V|;
  Jakobian +człon ZIP na diagonali ∂P/∂V (J12) i ∂Q/∂V (J22):
  `∂P_spec_i/∂V_i = P_spec_base_i·(2·a_p·V_i/V0² + b_p/V0)` (analogicznie Q).
  Konwencja zweryfikowana w kodzie: aktualizacja `v_mag += ΔV` (czysta), więc
  J12=∂P/∂V (czysta). v2 używa rozbicia indeksów `non_slack`/`active_pq`.
- **GS:** punkt stały — `S_i(|v_i|)` przeliczane co przejście (brak Jakobianu).
- **FD:** `p_spec/q_spec` przeliczane w mismatchu; macierze B′/B″ stałe (z `ybus.imag`,
  niezależne od obciążenia) — natura FD zachowana.

### 5a. Scalenie dwóch ścieżek NR (ZASADA NR 3 — w tej samej pracy)

`newton_raphson_solve` (v1, PQ-only) i `newton_raphson_solve_v2` (z PV + przełączaniem
PV→PQ) to **dwie implementacje tej samej fizyki NR** → ryzyko drugiej prawdy w rdzeniu
(błąd naprawiony w jednej, nie w drugiej). v2 jest przypadkiem ogólnym (przy braku PV
redukuje się do v1). **Scalamy do jednej ścieżki fizyki** w tej samej pracy co ZIP —
nie odkładamy. Bramka: **reduce-to-NR bajt-identyczny** — przepuszczenie przypadku
PQ-only przez zunifikowaną ścieżkę musi dać identyczne wyniki i ślad jak obecne v1
(brak cichej regresji w węzłach PV). Po scaleniu: jeden builder Jakobianu, jeden rdzeń
iteracji; duplikat usunięty.

### 5b. Źródła falownikowe U/f (WSZYSTKO WSZĘDZIE — ZASADA NR 3)

Korekta: „falownik = generacja, więc model U/f go nie dotyczy" było błędem. Falownik
(PV/BESS/FW) jest bytem U/f-zależnym i jest modelowany w **tym samym rozpływie** co
odbiory ZIP — jako wstrzyk PQ (źródła wchodzą dziś jako `PQSpec`), z charakterystyką
sterowania na `PQSpec.inverter_control`. Tryby NC RfG (§8.7), w pu na `base_mva`,
konwencja wstrzyku:

- **Q_CONST** — stałe Q (przypadek „off", reduce-to-NR),
- **COSPHI_CONST** — `Q = q_over_p·|P|` (znak = nad/niedowzbudzenie),
- **COSPHI_P** — `q_over_p(P)` odcinkami-liniowo (od `P/Pmax`),
- **Q_U** — droop volt-var `Q(|V|)`: jedyny tryb **napięciowo-zależny** (deadband
  low/high + `slope_pu_per_pu` + clamp do `[q_min,q_max]`, ta sama reprezentacja co
  pakiet dowodu Q(U) — jedno źródło prawdy),
- **P(f)/LFSM-O/U** — jednorazowe skalowanie wstrzyku czynnego (f = stałe wejście
  studium, identycznie jak ZIP P(f)).

**Integracja (mirror ZIP):** `apply_inverter_setpoint` (jednorazowo: LFSM + Q dla
trybów V-niezależnych) + `build_inverter_table` (zbiór buséw Q_U) + `inverter_effective_spec`
(Q per iteracja z |V|). Jakobian: człon `∂Q_spec/∂V = qu_dq_dv` na diagonali J22
(P nie zależy od V → brak członu J12). We **wszystkich trzech solverach** (NR, GS, FD),
ten sam kontrakt. Charakterystyki z katalogu (`ConverterType`/`InverterType`, Rule #10),
materializowane na źródło. White Box: `inverter_sources` (Q/P spec + tryb) w trace.

reduce-to-NR rozszerzony: źródło pasywne (Q_CONST, brak LFSM, f=f0) ⇒
`inverter_control_from_params` zwraca None ⇒ `PQSpec` bez zmian ⇒ wynik bajt-identyczny.
*(Zweryfikowane dla NR: pasywne źródło = czysty wstrzyk PQ, napięcia i slack identyczne.)*

### 6. INWARIANT reduce-to-NR (bramka bezpieczeństwa, per solver)

Przy `a=b=0, c=1, f=f0`: czynnik napięciowy=1, czynnik częstotliwościowy=1, pochodna
ZIP=0. Każdy solver **redukuje się dokładnie** do obecnej postaci. Cała logika ZIP
jest **bramkowana** (`if zip_table:` / `has_frequency_dependence`), więc sieci bez
ZIP wykonują **identyczny kod** → wynik bajt-w-bajt. Egzekwowane testami per solver.
*(Zweryfikowane dla NR: dVmax=0, slack P identyczny.)*

### 7. WHITE BOX, determinizm, Frozen Result API

- Trace eksponuje współczynniki ZIP i przeliczone `p_spec/q_spec` per iteracja (Rule #2).
- Determinizm zachowany; SHA-256 stabilne (Rule #7).
- Pola `PowerFlowResult` **niezmienione** (Rule #6); ZIP/`f` to **wejście**.

## Konsekwencje

### Pozytywne
- Realne obciążenia napięcio- i częstotliwościozależne — kluczowe dla słabych sieci i OZE.
- Spójność: ten sam kontrakt ZIP w NR/GS/FD; pełna ścieżka katalog→aplikacja→solver.

### Negatywne / ryzyka
- Dotknięty zamrożony rdzeń NR — ryzyko regresji. Mitygacja: reduce-to-NR
  (bajt-identyczność) + bateria testów per solver + guard determinizmu.
- Zmiana przekrojowa (katalog + agregacja + wiele miejsc `PQSpec`) — realizowana
  orkiestracją (swarm) z recenzją `recenzent-norm` przed scaleniem.

## Plan testów (warunek „done", per solver)
1. **reduce-to-NR:** `a=b=0,c=1,f=f0` — wynik bajt-identyczny przed/po (NR, GS, FD).
2. **const-Z** (`a=1`): obciążenie ~V², napięcie wyższe niż PQ. *(NR: potwierdzone.)*
3. **const-I** (`b=1`): obciążenie ~V (pośrednie). *(NR: potwierdzone.)*
4. **P(f):** `f<f0, k_pf>0` ⇒ mniejszy pobór. *(NR: potwierdzone, factor 0.96.)*
5. **determinizm** + **white-box** (człon ZIP w trace).
6. **walidacja:** suma ≠ 1 ⇒ błąd; `f0/v0 ≤ 0` ⇒ błąd.
7. **e2e wpięcia:** ENM Load `model="zip"` z katalogu → `PQSpec.zip_coeffs` → solver.

## Powiązane
- Inwariant **Z-ZIP-04** — `docs/spec/SPEC_CHAPTER_07_SOURCES_GENERATORS_LOADS.md:1032`
- [ADR-007](./ADR-007-iec60909-frozen-reference.md) — wzorzec zamrożonego solvera
- [ADR-008](./ADR-008-power-flow-location.md) — lokalizacja przepływu mocy
- `docs/v12xx/MIGRACJA_ENM_V1_V2.md` — `zip` jako „wymagający solver support"
