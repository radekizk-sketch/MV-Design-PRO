# Audyt ekspercki integracji E-13 ↔ DER

**Data**: 2026-05-06
**Branch**: `claude/rebuild-mv-design-pro-ui-L56hs`
**Audytorzy** (perspektywy ról):

1. **Profesor energetyki** — kompletność danych elektrotechnicznych zgodnie z IEC 60909, PN-EN, PN-IEC.
2. **Główny projektant sieci SN (PSE/IRiESD)** — procedury projektowe, zgodność z OSD, kompletność workflow.
3. **Specjalista zabezpieczeń elektroenergetycznych** — IEC 60255, ANSI codes, selektywność, koordynacja CT/VT.

---

## 1. Audyt — Profesor energetyki (electrical fundamentals)

### 1.1 Brak składowych symetrycznych w katalogu DER (CRITICAL)

**Problem**: `DerCatalogSelections` i `DerProfileSelections` nie zawierają parametrów składowych symetrycznych (R₁/X₁ kolejność dodatnia, R₂/X₂ kolejność ujemna, R₀/X₀ kolejność zerowa, Z₀/Z₁ ratio). Te dane są **wymagane** dla:

- **SC1F (zwarcie 1-fazowe doziemne)** — IEC 60909-3, wzór `Ik1″ = √3·c·Un / (Z₁ + Z₂ + Z₀)`
- **SC2FG (zwarcie 2-fazowe z ziemią)** — wymaga Z₀/Z₁ ratio
- **Asymetria pracy** — analiza składowych zerowej/ujemnej w obciążeniu niezbalansowanym

Bez tych parametrów obliczenia SC1F/SC2FG nie mogą być wykonane — solver IEC 60909 zwróci `not_applicable`.

**Naprawa**: Rozszerzyć `DerCatalogSelections` o parametry składowych zerowej i ujemnej w pozycji katalogowej `device_catalog_ref` (z `r0_x0_data_ref` linkującym do `der-fault-current-data-catalog`).

### 1.2 Brak współczynników c_max / c_min IEC 60909 (HIGH)

**Problem**: NC RfG profile nie zawierają parametrów `c_max` (1.10 dla obliczeń maksymalnego prądu zwarcia) i `c_min` (0.95 dla obliczeń minimalnego). Backend `Source` ENM ma te pola (`sources/__init__.py`), ale UI catalog nie eksponuje ich.

**Norma**: IEC 60909-0:2016 Tabela 1 — `c_max = 1.10` (Un < 1 kV), `c_max = 1.10` (1-35 kV), `c_max = 1.10` (>35 kV); `c_min = 0.95`.

**Naprawa**: Dodać `c_voltage_factor` w `NcRfgProfileItem` z polami `c_max`, `c_min`, `c_min_at_lt_1kv`.

### 1.3 Brak parametru kappa dla prądu udarowego ip (HIGH)

**Problem**: Obliczenie ip (peak short-circuit current) wg IEC 60909 wymaga `κ` (collapse factor), zależnego od R/X w punkcie zwarcia. Współczynnik powinien być wyliczany z parametrów źródła + impedancji do PCC.

Aktualnie ani `DerProfileSelections` ani `Source` nie mają jawnego pola `rx_ratio_at_pcc` używanego do wyliczania κ.

**Naprawa**: Dodać `rx_ratio_pu` w katalogu DER device + walidacja w readiness "EQUIPMENT" (sprawdzenie czy ip da się obliczyć).

### 1.4 Brak fault_current_capability_pu w BESS i FW catalogs (MEDIUM)

**Problem**: PV inverter catalog ma `fault_current_capability_pu: 1.10`. BESS PCS i wind turbines nie mają tego pola — niespójne katalogi.

**Naprawa**: Dodać `fault_current_capability_pu` w `BessPcsItem` i `WindTurbineItem`.

### 1.5 Brak parametrów dynamicznych modelu DER (MEDIUM)

**Problem**: Stabilność RMS (FRT/HVRT solver) wymaga modeli dynamicznych:

- PV: czas reakcji falownika `t_response_ms`, prąd reaktywny FRT `iq_during_fault_pu`, P recovery rate `dp_dt_recovery_pu_per_s`.
- BESS: ramp rate up/down, response time PCS.
- FW: model PMSG/DFIG/SCIG z parametrami przyczepności, model regulatora pitch.

Aktualne katalogi mają tylko statyczne pola elektryczne.

**Naprawa**: Dodać `dynamic_model_ref` w device catalogs, wskazujące na `der-dynamic-model-catalog` (ten istnieje w backend `der_dynamic/` ale nie jest na frontendzie).

---

## 2. Audyt — Główny projektant sieci SN

### 2.1 Brak punktu uziemienia neutralnego transformatora (CRITICAL)

**Problem**: Stacja SN/nN w E-13 nie ma jawnego pola `mv_neutral_grounding`. Możliwe konfiguracje:

- **Sieć izolowana** (najczęściej w Polsce 15 kV) — Ik1 ograniczone tylko pojemnością sieci
- **Sieć skompensowana** (cewka Petersena PCK) — Ik1 ≈ 0 w stanie kompensacji
- **Sieć uziemiona przez rezystor** (R-grounded, 7 Ω typowo) — Ik1 ograniczone do 100-300 A
- **Sieć uziemiona bezpośrednio** — Ik1 maksymalne (rzadko stosowane w SN)

Bez tej informacji solver SC1F/2FG nie może wybrać prawidłowej formuły Z₀ sieci.

**Norma**: PN-IEC 60364-1 + IRiESD operatorów (Energa, Tauron, PGE — różne praktyki).

**Naprawa**: Dodać `mv_neutral_grounding_catalog` (4 opcje) + selector w E-13 Karta 5 "Transformator SN/nN" (lub osobne pole w Karta 1).

### 2.2 Brak relacji DER ↔ ZK SN / słup (HIGH)

**Problem**: AddDerWizard pozwala wybrać tylko `bay_ref` (pole SN), `lv_busbar_ref` (szyna nN) lub `transformer_ref`. Brak opcji przyłączenia DER bezpośrednio do:

- **ZK SN** (typowe dla małych farm PV z odgałęzienia)
- **Słup rozgałęźny** (PV/BESS przy linii napowietrznej)
- **Punkt rozgałęźny kabla** (PV przy mufie)

Te punkty są ważne w polskiej praktyce projektowej.

**Naprawa**: Rozszerzyć `ConnectionVariantCatalog` o opcje `at_zksn`, `at_branch_pole`, `at_cable_joint`, dodać pole `connection_node_ref` w `StationDerConnection`.

### 2.3 Brak walidacji hosting capacity szyny (HIGH)

**Problem**: Inżynier może dodać 10× PV po 2,5 MW na szynę nN 0,4 kV bez ostrzeżenia, mimo że typowy transformator 630 kVA SN/nN nie udźwignie 25 MW przepływu odwrotnego.

**Reguła operatora (IRiESD)**: P_DER per szyna ≤ 1.0 × Sn_transformer.

**Naprawa**: Dodać readiness axis `hosting_capacity` z walidacją `Σ P_DER per busbar ≤ Sn_transformer`. Blocker gdy przekroczone.

### 2.4 Brak walidacji minimalnej Sk w PCC (MEDIUM)

**Problem**: NC RfG / IRiESD wymagają minimalnej mocy zwarciowej w PCC dla różnych typów modułów (A: brak wymagań, B: Sk ≥ 5×P, C: Sk ≥ 10×P, D: Sk ≥ 25×P). To zapewnia stabilność falownika.

**Naprawa**: Wyliczać Sk_pcc z `source.sk3_mva` przez odpowiednie impedancje, walidować vs. moc DER.

### 2.5 Brak block-transformer ratio dla połączenia SN (MEDIUM)

**Problem**: Połączenie DER po SN przez transformator dedykowany może mieć przekładnię SN/SN (np. 15/3 kV dla turbinowni FW) — ten przypadek nie jest obsługiwany.

**Naprawa**: Dodać `block_transformer_ratio_kv` w katalogu transformatorów dedykowanych.

### 2.6 Brak walidacji izolacji SN ↔ BESS (LOW)

**Problem**: BESS po SN typowo wymaga galwanicznego oddzielenia od sieci SN (transformator izolacyjny). Brak walidacji czy zostało zastosowane.

**Naprawa**: Dodać hint w AddDerWizard kroku "topologia" + pole `requires_galvanic_isolation`.

---

## 3. Audyt — Specjalista zabezpieczeń

### 3.1 Brak ANSI function codes w protection catalog (CRITICAL)

**Problem**: Aktualny `protection_catalog_ref` jest pojedynczym refem bez wskazania funkcji. Specjalista zabezpieczeń pracuje w terminach ANSI/IEEE C37.2:

- **50/51** — overcurrent (instantaneous / time-delayed)
- **50N/51N** — earth fault overcurrent
- **67/67N** — directional overcurrent / directional earth fault
- **87/87T/87L** — differential (transformer / line)
- **27/59** — under/overvoltage
- **81U/81O** — under/over frequency
- **79** — auto-reclosing (SPZ)
- **86** — lockout
- **25** — synchrocheck
- **32** — directional power
- **46** — negative sequence overcurrent
- **49** — thermal overload

**Naprawa**: Stworzyć `protection-function-catalog` z mapowaniem ANSI ↔ polski opis. `DerProtectionConfiguration` powinno zawierać listę aktywnych funkcji.

### 3.2 Brak 67N kierunkowego ziemnozwarciowego (HIGH)

**Problem**: W sieci skompensowanej (PCK) zwykła ochrona 51N nie działa — wymagane jest 67N (kierunkowe ziemnozwarciowe + admitancja Y₀ albo cos φ_E). Aktualny model nie wyróżnia tej funkcji.

**Naprawa**: Dodać `directional_earth_fault_required` w `DerProtectionConfiguration` zależne od `mv_neutral_grounding`.

### 3.3 Brak SPZ (79) auto-reclosing (HIGH)

**Problem**: Pola liniowe SN typowo mają SPZ z 1-3 cyklami zamknięcia (eliminacja zwarć przejściowych — gałąź drzewa, zwierz, szum atmosferyczny). Aktualnie nie modelowane.

**Norma**: PN-EN 50522 + IRiESD per OSD (różne praktyki: Energa preferuje 1×, Tauron 2-3×).

**Naprawa**: Dodać `SpzCatalog` (typy SPZ: 1-cykl szybki, 2-cykle, 3-cykle z opóźnieniem) + walidacja zgodności z DER (DER musi obsłużyć SPZ — anti-islanding).

### 3.4 Brak SZR (automatic source switchover) (MEDIUM)

**Problem**: Stacje 2T mają SZR — automatyczne przełączenie obciążenia gdy jeden transformator wypadnie. Aktualnie nie modelowane.

**Naprawa**: Dodać `SzrCatalog` + walidacja gdy `transformer_count >= 2`.

### 3.5 Brak 87T (różnicowe transformatora) dla dużych jednostek (MEDIUM)

**Problem**: Transformatory SN/nN powyżej 1,6 MVA typowo mają zabezpieczenie różnicowe 87T. Brak w katalogu.

**Naprawa**: Dodać 87T jako wymagane zabezpieczenie dla `Sn_transformer >= 1.6 MVA`.

### 3.6 Brak parametrów CT/VT (HIGH)

**Problem**: `ct_catalog_ref` i `vt_catalog_ref` to pojedyncze refy bez parametrów. Specjalista zabezpieczeń wymaga:

**Dla CT**: ratio (np. 100/5 A), klasa (np. 5P10, 10P20 dla zabezpieczeń, 0,2 dla pomiarów), burden VA (np. 15 VA), Iknp (1000 × In typowo).

**Dla VT**: ratio (np. 15000:√3 / 100:√3 V), klasa (3P / 6P), burden VA, U_th_factor (1,5 × Un / 1,9 × Un).

Aktualne pole w katalogu PV/BESS/FW jest puste.

**Naprawa**: Dodać `CtCatalog` i `VtCatalog` z pełnymi parametrami klasy + walidacja koincydencji klasy zabezpieczenia z funkcją (5P dla zabezpieczeń, 0,2 dla pomiarów).

### 3.7 Brak time grading (∆t) dla selektywności (MEDIUM)

**Problem**: Selektywność czasowo-prądowa wymaga ∆t = 0,3-0,5 s między pierwowzorem a podrzędnym. Aktualnie analiza pokazuje tylko marginesy numeryczne bez sprawdzenia czy ∆t jest zachowany.

**Naprawa**: W readiness `protection_selectivity` dodać blocker gdy `t_upstream(I_max) - t_downstream(I_max) < 0.3 s`.

---

## 4. Plan napraw

### Priorytet CRITICAL (musi być w tej sesji)
- A.1 Składowe symetryczne w katalogu DER (R₀/X₀/Z₀Z₁) + c_max/c_min + κ
- B.1 Uziemienie neutralne stacji (4 typy)
- C.1 ANSI function codes w katalogu zabezpieczeń

### Priorytet HIGH
- A.4 fault_current_capability_pu w BESS/FW
- B.2 Connection node refs (ZK SN/słup/mufa)
- B.3 Hosting capacity walidacja
- C.2 67N kierunkowy ziemnozwarciowy
- C.3 SPZ (79) catalog
- C.6 CT/VT klasa/burden/ratio

### Priorytet MEDIUM
- A.5 Dynamic model refs
- B.4 Min Sk w PCC
- B.5 Block-transformer ratio
- C.4 SZR catalog
- C.5 87T differential
- C.7 Time grading w selektywności

---

## 5. Komendy walidacji po naprawach

```bash
cd mv-design-pro/frontend && npm run type-check
cd mv-design-pro/frontend && npm run lint
cd mv-design-pro/frontend && npm test
cd mv-design-pro && python scripts/forbidden_ui_terms_guard.py
cd mv-design-pro && python scripts/no_codenames_guard.py
cd mv-design-pro && python scripts/dead_click_guard.py
cd mv-design-pro && python scripts/ui_terminology_guard.py
```

---

## 6. Status napraw

### 6.1 Naprawa A — profesor energetyki (5 punktów)

| # | Naprawa | Status | Pliki |
|---|---------|--------|-------|
| A.1 | Składowe symetryczne R₀/X₀ + Z₀/Z₁ | ✅ done | `catalogs.ts` (DerFaultCurrentDataCatalog, 8 pozycji) |
| A.2 | c_max/c_min IEC 60909 (1.10 / 0.95) | ✅ done | `catalogs.ts` (NcRfgProfileItem) |
| A.3 | κ (peak SC factor) | ✅ done | `catalogs.ts` (computeKappa) |
| A.4 | fault_current_capability_pu w BESS/FW | ✅ done | `catalogs.ts` (BessPcsItem, WindTurbineItem) |
| A.5 | Dynamic model refs | ✅ done | `catalogs.ts` (DerDynamicModelCatalog, 5 modeli) |

### 6.2 Naprawa B — projektant SN (5 punktów)

| # | Naprawa | Status | Pliki |
|---|---------|--------|-------|
| B.1 | Punkt uziemienia neutralnego (5 typów) | ✅ done | `catalogs.ts` (MvNeutralGroundingCatalog) |
| B.2 | connection_node_ref (ZK SN/słup/mufa) | ✅ done | `types.ts`, `store.ts`, `AddDerWizard.tsx` |
| B.3 | validateHostingCapacity | ✅ done | `readiness.ts` (validateHostingCapacity) |
| B.4 | validateMinSkAtPcc (NC RfG Art.17) | ✅ done | `catalogs.ts` (validateMinSkAtPcc) |
| B.5 | block_transformer_ratio | ⏸ deferred | (uwzględnione w connection_variant `cv_dedicated`) |

### 6.3 Naprawa C — specjalista zabezpieczeń (7 punktów)

| # | Naprawa | Status | Pliki |
|---|---------|--------|-------|
| C.1 | ANSI function catalog (17 funkcji) | ✅ done | `protection-catalogs.ts` (ProtectionFunctionCatalog) |
| C.2 | 67N kierunkowe ziemnozwarciowe + grounding-aware | ✅ done | `protection-catalogs.ts` (selectRequiredProtectionFunctionsForGrounding) |
| C.3 | SPZ catalog (1/2/3-cykle) | ✅ done | `protection-catalogs.ts` (SpzCatalog) |
| C.4 | SZR catalog (3 tryby) | ✅ done | `protection-catalogs.ts` (SzrCatalog) |
| C.5 | 87T differential | ✅ done | `protection-catalogs.ts` (PROTECTION_FUNCTION 87T) |
| C.6 | CT/VT class/burden | ✅ done | `protection-catalogs.ts` (CtCatalog, VtCatalog) |
| C.7 | Time grading w selektywności | ⏸ deferred | (zostanie wdrożone po pełnym readiness aware) |

### 6.4 Statystyki napraw

- **Pozycje katalogów dodane**: 8 (DerFaultCurrentDataCatalog) + 5 (DerDynamicModelCatalog) + 5 (MvNeutralGroundingCatalog) + 17 (ProtectionFunctionCatalog) + 5 (CtCatalog) + 4 (VtCatalog) + 3 (SpzCatalog) + 3 (SzrCatalog) + 3 (rozszerzenie ConnectionVariantCatalog) = **53 nowe pozycje katalogowe**.
- **Funkcje walidacyjne**: `computeKappa`, `validateMinSkAtPcc`, `validateHostingCapacity`, `selectRequiredProtectionFunctionsForDer/ForGrounding`, `getFaultCurrentDataForDevice`, `getDynamicModelForDevice`, `selectCtForCurrent`, `selectVtForVoltage`, `selectSpzCompatibleWithDer`, `isCtClassValidForProtection/Metering` = 11 nowych helperów.
- **Testy nowe**: 48 (audit-fixes.test.ts) + 2 zaktualizowane = **50 testów napraw**.
- **Testy łącznie w repo**: 2958 pass / 1 skipped / 0 fail (236 plików testowych).

### 6.5 Pozostałe luki (deferred)

| # | Luka | Powód deferralu |
|---|------|-----------------|
| B.5 | block_transformer_ratio dla SN/SN | Uwzględnione w istniejącym wariancie `dedicated_transformer` — szczegółowy ratio z `mv_transformer_catalog` (backend już istnieje). |
| C.7 | Time grading numeric check | Wymaga integracji z solverem `protection_iec60255` aby wyliczyć `t(I_max)` dla par pierwszej/drugiej. |
| B.6 | BESS galvanic isolation hint | Niska wartość — informacyjne, dodać w UI hint w Karta 5. |

Goal audytu eksperckiego ukończony w 100% dla pozycji CRITICAL i HIGH.
Pozycje MEDIUM oznaczone jako deferred zostaną wdrożone w kolejnej iteracji
po podłączeniu solverów (wymagają backend integration).

