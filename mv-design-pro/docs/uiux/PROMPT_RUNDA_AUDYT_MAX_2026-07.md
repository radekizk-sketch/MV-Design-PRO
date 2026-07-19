# PROMPT RUNDY: globalny audyt + maksymalna rozbudowa (opcja MAX) — 2026-07-19

**Rola:** Fable — architekt/orkiestrator. **Tryb:** opcja MAX, do ostatniego klika,
wielowarstwowo. **Dyrektywa właściciela:** „zaprojektuj prompt tej rundy w wersji
maksimum: kolejna runda globalnego audytu i maksymalnej rozbudowy; odpowiedz na
pytania ekspertów, następnie wdrażaj".

---

## 1. Prompt rundy (kontrakt orkiestracji)

> Dla każdego badanego ogniwa łańcucha (operacja domenowa → element → solver → analiza
> → zabezpieczenia → raport → zgodność) przeprowadź audyt WIELOSOCZEWKOWY. Dla każdej
> soczewki odpowiedz na jej pytania z DOWODEM (`plik:linia`) i werdyktem:
> **OK · PHANTOM (forward: UI ustawia, backend ignoruje / inverse: backend umie, UI nie
> daje) · WYSPA (element bez konsumenta) · BRAK (luka zdolności)**. Następnie wdrażaj
> naprawy wg priorytetu wartości inżynierskiej, każda zmiana warstwy → pełna regresja tej
> warstwy + determinizm + guardy. Zero fabrykacji (kontrolka bez pola backendu zakazana),
> zero wysp (element bez konsumenta zakazany). FROZEN API tylko addytywnie.

### Soczewki i ich pytania

- **Projektant sieci:** czy każdy krok flow ma realną operację domenową i jawny następny krok?
- **Zwarciowiec (IEC 60909):** czy elementy wnoszą wkład do SC zgodnie z normą? K_T tap-niezależne?
- **Load-flow / regulacja:** czy każda kontrolka regulacji (OLTC, falownik Q(U)/cosφ/P(f),
  shunt) REALNIE wpływa na wynik kanonicznego PF? (najczęstsze źródło forward-phantomów)
- **Zabezpieczenia / NC RfG:** czy CT/VT/przekaźnik/krzywe P(f)/FRT/HVRT mają komplet wejść?
- **Katalogi / Reference Engine:** czy każdy namespace ma dostawcę (op) i konsumenta (solver/raport)?
- **Przyłączenia / OZE:** czy tryby regulacji i zdolność Q mapują na model solvera falownika?
- **UX/IA:** czy ekran spełnia kontrakt prowadzący (cel · tor · stan zerowy · następny krok · downstream)?

### Bramki wdrożenia (DoD)
Mapowanie 1:1 (zero phantomów) · konsument istnieje (zero wysp) · katalog-first · podgląd
z backendu gdzie dostępny · testy realnej ścieżki · guardy/lint/type-check · pełne
regresje obu stosów · determinizm/golden przejrzane z zachowaniem intencji · retire legacy.

---

## 2. Odpowiedzi ekspertów tej rundy (grounded, `plik:linia`)

| Soczewka | Pytanie | Werdykt | Dowód |
|----------|---------|---------|-------|
| Load-flow / regulacja | Czy tryb regulacji OZE wpływa na kanoniczny PF? | **PHANTOM (forward)** | `canonical_analysis.py:1256` PQSpec bez `inverter_control`; `power_flow_inverter.py:250` mode_map angielski-only, domena Polish `generator.py:52` |
| Load-flow / regulacja | Czy OLTC wpływa na PF? | **OK** | pętla OLTC F2 wpięta (`canonical_analysis` _execute_power_flow, V12K-045) |
| Load-flow / regulacja | Czy shunt (bateria) wpływa na PF? | **OK** (naprawione G-KOMP) | `_build_shunt_specs_from_snapshot` → +jB |
| Load-flow / regulacja | Czy cosφ odbioru wpływa na Q? | **OK** (naprawione G-NN) | `add_nn_load` Q=P·tan(arccos cosφ) |
| Przyłączenia / OZE | Czy P(U) (P_OD_U) ma model w solverze? | **BRAK (luka enuma)** | `InverterMode` nie ma P(U) (`power_flow_inverter.py`) |
| Katalogi | Czy ogranicznik przepięć ma konsumenta postawionego elementu? | **WYSPA** | v126 czyta `model.insulation`, nie elementy `surge_arrester` |
| Zwarciowiec | Czy K_T tap-niezależne? | **OK** | short_circuit_iec60909 nietknięty (solver_boundary_guard) |

**Rozstrzygnięcie P(U):** w ustalonym punkcie pracy (V≈1 pu) P(U) nie redukuje mocy
(krzywa aktywna dopiero przy przepięciu), więc w steady-state PF mapuje się na **pasywne**
(brak wpływu na Q) — z jawnym komentarzem w kodzie. Pełny model P(U)-curtailment to
osobna, świadoma faza (nie steady-state PF).

---

## 3. Wdrożenie tej rundy — G-OZE-PF (naprawa forward-phantomu regulacji OZE)

Jedna spójna zmiana fizyki, pełna regresja + przegląd golden:
1. **Mostek języka** w `inverter_control_from_params`: STALY_COS_PHI→COSPHI_CONST,
   Q_OD_U→Q_U, WYLACZONE/P_OD_U→pasywne (z komentarzem P(U)).
2. **Kanoniczne wpięcie**: `_execute_power_flow` ustawia `inverter_control` na PQSpec
   węzłów OZE z parametrów generatora (reużycie `inverter_control_from_params`).
3. **Determinizm**: źródła cosφ=1 / pasywne → wynik bez zmian; aktywne Q(U)/cosφ≠1 →
   przeliczyć golden z zachowaniem intencji. WHITE BOX, SC nietknięte.

Kolejne rundy: G-OZE-B (krzywe NC RfG), G-STA (stacja), G-SEK/RING, G-POM/ZAB, G-OZE-UI.
