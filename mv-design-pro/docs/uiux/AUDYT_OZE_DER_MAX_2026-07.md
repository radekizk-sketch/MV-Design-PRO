# AUDYT + PROJEKT MAX: Źródła OZE/DER (add_converter_source) — G-OZE, do ostatniego klika

**Status:** BINDING (audyt wielosoczewkowy + projekt od zera; dyrektywa właściciela
2026-07-19: „przystąp z maksymalną opcją przebudowy, wielowarstwowo, myśl do ostatniego
klika w całym flow, przeprojektuj maksymalnie od zera, bądź 100× lepszy, weź audyt,
rozbuduj katalogi i wszystko inne, zadaj pytania czego brakuje i rozbuduj").
**Rejestr:** V12K-051 (podrzędny wobec blueprintu V12K-048; faza G-OZE).
**Zakres:** kanoniczna operacja `add_converter_source` (PV/BESS/FW) + pełny łańcuch DER.
Bez edycji `ui/sld/**` (glif OZE = wątek SLD V12K-060).

---

## 0. Metoda — soczewki eksperckie

Projektant OZE · przyłączeniowiec (NC RfG / PTPiREE) · zwarciowiec (machine SC) ·
stabilność (RMS) · rozdzielnie/przyłącze (block transformer) · katalogi/Reference
Engine · UX/IA. Każda soczewka pyta: „jakich pól potrzebuje mój solver/analiza i czy
inżynier może je ustawić w UI?".

---

## 1. Łańcuch warstw DER (recon 2026-07-19, ścieżki realne)

```
add_converter_source (enm/domain_operations_v2.py)
   → generator element (gen_type, sn_mva, pmax_mw, un_kv, control_mode,
     q_min_mvar, q_max_mvar, catalog_binding, connection_variant,
     blocking_transformer_ref, bus_nn_ref, operation_mode/BESS, pf_curve_ref)
   → solver_input/audit2_der_payload.py  (build_der_audit2_payload: rozwija pf_curve
     P(f) droop/deadband; bess_operation_mode_refs; block_transformer_catalog_ref)
   → SOLVERY:
       • power_flow_inverter.py         (tryby regulacji Q, Q(U), cosφ)
       • ncrfg_ptpiree/engine.py        (has_hvrt_curve, has_pf_droop, has_qu_curve,
                                         droop_percent, island/black_start/POD)
       • stability_rms/engine.py        (droop, FRT/HVRT, ride-through)
       • short_circuit machine SC       (wkład zwarciowy falownika)
       • v126_academic.py               (akademicki)
   → ANALIZY: grid_strength, reactive_adequacy
   → ZGODNOŚĆ: NC RfG / PTPiREE (werdykty pass/fail/required)
```

Katalogi DER: CONVERTER_PV/BESS/WIND (`ZRODLO_NN_PV`, `ZRODLO_NN_BESS`, wind inline
w `mv_converter_catalog.get_wind_types`), krzywe/konfiguracje w `audit2_catalogs.py`
(pf_curve/qu_curve/FRT), block-transformers (`/api/catalog/block-transformers`).

---

## 2. Kontrakt pól — co op utrwala vs co solver czyta vs co UI legacy pokazuje

| Pole | Op utrwala? | Konsument | Legacy UI (`AddConverterSourceForm`) |
|------|-------------|-----------|--------------------------------------|
| source_technology (PV/BESS/FW) | ✅ | wszystkie | ✅ |
| connection_variant (nn_side/block_transformer) | ✅ (+aliasy) | topologia, block tr | ✅ |
| blocking_transformer_ref (auto-resolve) | ✅ | topologia | ✅ (picker) |
| catalog_binding (falownik) | ✅ | materializacja | ✅ |
| quantity | ✅ | agregacja | ✅ |
| un_kv, pmax_mw, sn_mva | ✅ (z katalogu) | PF, SC, grid_strength | odczyt |
| control_mode (STALY_COS_PHI/Q_OD_U/P_OD_U/WYLACZONE) | ✅ (payload/katalog) | ⚠ patrz KOREKTA | ✅ (select — legacy JEST) |
| q_min_mvar / q_max_mvar | ✅ (payload/katalog) | reactive_adequacy | ✅ (legacy JEST) |
| power_setpoint_mw (FW/BESS) | ✅ | PF | ✅ (legacy JEST) |
| bess_mode / operation_mode | ✅ | PF/energia | ✅ (legacy JEST) |
| **pf_curve_ref → P(f) droop/deadband** | spec DER (ref) | ncrfg, stability_rms, IEC 60255 | **✗ BRAK** |
| **has_qu_curve (Q(U))** | konfiguracja krzywej | ncrfg | **✗ BRAK** |
| **has_hvrt_curve / FRT (ride-through)** | konfiguracja krzywej | ncrfg, stability_rms | **✗ BRAK** |
| **droop_percent** | spec/krzywa | ncrfg (has_pf_droop) | **✗ BRAK** |
| island/black_start/POD required | spec zgodności | ncrfg | **✗ BRAK** |

---

## 3. Rejestr braków (odpowiedź na „czego brakuje")

> **KOREKTA PO AUDYCIE EKSPERTÓW (2026-07-19).** Pierwotny GAP-OZE-1 (twierdzenie:
> „legacy UI nie eksponuje control_mode/Q") był **BŁĘDNY**. Weryfikacja empiryczna:
> `AddConverterSourceForm` MA edytowalny select „Tryb sterowania"
> (STALY_COS_PHI/Q_OD_U/P_OD_U/WYLACZONE), pola Q min/max, moc roboczą P i tryb BESS
> (linie ~1239, 279–282, 501–506). Ten dokument został skorygowany; poniżej realne braki.

- **GAP-OZE-1 (SKORYGOWANE → FORWARD PHANTOM, wysoki priorytet):** control_mode jest
  ustawiany w UI i utrwalany na generatorze, ALE **główny rozpływ mocy go ignoruje**.
  Fakty: (a) `power_flow_inverter.py` ma bogaty model regulacji falownika (Q_U volt-var,
  COSPHI_P, P(f)/LFSM, klamry Q) — ale (b) `canonical_analysis._execute_power_flow`
  buduje pętlę OLTC i NIE buduje tabeli regulacji falownika; (c) ciągi
  `STALY_COS_PHI/Q_OD_U/…` występują wyłącznie w katalogu i formularzu — BRAK mapowania
  na `InverterMode` w `canonical_analysis`/`solver_input`. Wniosek: wybór trybu
  regulacji OZE **nie wpływa na wynik domyślnego load-flow** (może być konsumowany w
  wybranych ścieżkach analiz — do potwierdzenia per analysis_type). To defekt do naprawy
  U ŹRÓDŁA (wpięcie InverterControl w kanoniczny PF), nie zadanie UI. **Wymaga rozbudowy
  backendu + pełnej regresji + determinizmu — osobna, ostrożna faza (G-OZE-PF).**

  **ROOT CAUSE (potwierdzony, plik:linia) — defekt DWUWARSTWOWY:**
  1. **Kanoniczny PF gubi inverter_control.** `canonical_analysis._execute_power_flow`
     (`canonical_analysis.py:1256`) buduje `PQSpec(node_id, p_mw, q_mvar, zip_coeffs)`
     BEZ pola `inverter_control` → `build_inverter_table` (Newton/FD) widzi None →
     wszystkie węzły OZE pasywne (Q_CONST). Legacy ścieżki aplikacyjne
     (`application/power_flow_input_builder.py:46`, `analysis_run/service.py:638`,
     `network_wizard/service.py`) USTAWIAJĄ `inverter_control` — kanoniczny run (nowe
     UI via `/api/execution`) NIE. To rozbieżność ścieżek: solver ma zdolność, kanon jej
     nie karmi.
  2. **Niezgodność języka enumów (głębszy phantom).** Domena: `generator.ControlMode`
     = Polish (`generator.py:52` STALY_COS_PHI/Q_OD_U/P_OD_U); katalog też Polish
     (`mv_converter_catalog.py`). Mapper `inverter_control_from_params`
     (`power_flow_inverter.py:250`) ma `mode_map` WYŁĄCZNIE angielski
     (Q_CONST/COSPHI_CONST/COSPHI_P/Q_U) i domyśla nieznane → Q_CONST (pasywne).
     Efekt: nawet ścieżki legacy, które wołają mapper z Polish control_mode,
     dostają pasywne źródło. Dodatkowo **P_OD_U (P(U)) NIE MA odpowiednika w
     `InverterMode`** — luka enuma solvera.

  **Zakres G-OZE-PF (jedna spójna zmiana fizyki, pełna regresja + przegląd golden):**
  (a) mostek języka: STALY_COS_PHI→COSPHI_CONST, Q_OD_U→Q_U, WYLACZONE→pasywne;
  decyzja o P_OD_U (dodać InverterMode P(U) albo świadomie odrzucić z komunikatem);
  (b) kanoniczne wpięcie: `_execute_power_flow` ustawia `inverter_control` na PQSpec
  dla węzłów OZE z parametrów generatora (reużycie `inverter_control_from_params`);
  (c) determinizm: sieci bez OZE albo z pasywnymi źródłami — wynik bez zmian; golden z
  aktywną regulacją — przeliczyć z zachowaniem intencji, udokumentować. WHITE BOX,
  Frozen Result API tylko addytywnie, SC nietknięte.
- **GAP-OZE-2 (krzywe regulacji, rozbudowa spec DER):** P(f) droop (`pf_curve_ref`),
  Q(U) (`has_qu_curve`), FRT/HVRT (`has_hvrt_curve`) są czytane przez NC RfG / RMS /
  inverter, ale przez warstwę krzywych/konfiguracji (`audit2_der_payload`,
  `audit2_catalogs`). Trzeba ustalić, czy `add_converter_source` utrwala `pf_curve_ref`
  na generatorze (recon: pole obecne w DER spec) i wystawić picker krzywych; jeśli op
  nie utrwala — addytywne rozszerzenie op (osobny, przetestowany krok), potem UI.
- **GAP-OZE-3 (zgodność NC RfG, wielowarstwowe):** flagi wymagań (island_operation,
  black_start, POD) sterują werdyktami NC RfG. Kreator powinien pozwolić je zadeklarować
  (mapują na `NcRfgPtpireeModuleInput`), aby ekran zgodności E-28 dostał realne wejścia.
- **GAP-OZE-4 (katalog):** zweryfikować namespace krzywych P(f)/Q(U)/FRT i block-trafo;
  uzupełnić Reference Engine, jeśli picker nie ma pokrycia (reużycie, nie duplikacja).

---

## 4. Projekt kreatora MAX (`KreatorZrodlaOze`, kreatory/rama, fazowo)

Ekran prowadzący (cel jednym zdaniem · tor pracy · uczciwy stan zerowy · jawny następny
krok · język inżynierski). Kroki:

1. **Technologia i przyłączenie** — PV/BESS/FW; wariant `nn_side` vs `block_transformer`
   (+ picker transformatora blokowego, auto-resolve gdy 1 TR na stacji). Uczciwy stan
   zerowy: brak szyny/stacji.
2. **Katalog falownika + moc** — picker (ZRODLO_NN_PV/BESS/wind), liczba jednostek,
   moc zagregowana; odczyt un_kv/pmax/sn z katalogu.
3. **Regulacja (GAP-OZE-1)** — control_mode: `Q(U)` / `cosφ(P)` / stała Q; zakres
   Q (q_min/q_max_mvar), power_setpoint (FW/BESS), bess_mode. Podgląd zdolności Q z
   backendu (nowy `/api/solver/*` albo z katalogu — bez fizyki w UI).
4. **NC RfG / ride-through (GAP-OZE-2/3)** — P(f) droop (pf_curve_ref/droop_percent),
   Q(U) on/off, FRT/HVRT on/off, wymagania (island/black_start/POD). Mapuje na spec DER
   + `NcRfgPtpireeModuleInput`. (Wymaga potwierdzenia utrwalania na op → jeśli nie,
   rozszerzenie op jako pierwszy krok fazy.)
5. **Podsumowanie + downstream** — sekcja „co to uruchamia": machine SC (wkład
   zwarciowy), inverter PF (tryb Q), NC RfG/PTPiREE (werdykty E-28), grid_strength,
   reactive_adequacy.

Zapis = `add_converter_source` (payload zgodny 1:1), retire `AddConverterSourceForm`
po podmianie. Determinizm/kontrakty FROZEN — pola addytywne.

---

> **STATUS 2026-07-19:** ✅ **G-OZE-PF WDROŻONE** — most języka Polish→InverterMode
> + kanoniczne wpięcie `inverter_control` na PQSpec (aktywne tylko dla cosφ≠1 / Q(U)
> slope≠0; determinizm zachowany, regresja backendu 6315/0). Pozostają G-OZE-B/C/UI.

## 5. Kolejność wdrożenia (fazy G-OZE) — SKORYGOWANA po audycie + DoD

Priorytet wg realnej wartości inżynierskiej (nie kosmetyki). Legacy `AddConverterSourceForm`
jest FUNKCJONALNIE bogaty (tryb regulacji, Q, block-trafo, BESS mode) — sama migracja
na kreatory/rama ma niską wartość i wysokie ryzyko regresji, więc NIE jest pierwsza.

1. **G-OZE-PF (najwyższy priorytet, backend) — naprawa forward-phantomu GAP-OZE-1.**
   Wpięcie `power_flow_inverter` (Q_U/COSPHI_P/P(f)) w kanoniczny rozpływ mocy: mapowanie
   `control_mode` (STALY_COS_PHI/Q_OD_U/P_OD_U/WYLACZONE) → `InverterMode`, budowa tabeli
   regulacji z generatorów, iteracyjny volt-var (analogicznie do pętli OLTC). WHITE BOX,
   determinizm, pola wyniku addytywne, SC nietknięte. Pełna regresja backendu. Dopiero
   po tym wybór trybu OZE realnie wpływa na wynik — warunek „do ostatniego klika".
2. **G-OZE-B** — brakujące realne kontrolki NC RfG: P(f) droop (`pf_curve_ref`), Q(U),
   FRT/HVRT, flagi wymagań (island/black_start/POD) → mapują na spec DER +
   `NcRfgPtpireeModuleInput`; wpięcie w E-28. Rozszerzenie op/spec + pełne regresje.
3. **G-OZE-C** — katalog krzywych P(f)/Q(U)/FRT (rozbudowa Reference Engine), pickery.
4. **G-OZE-UI (najniższy priorytet)** — migracja `AddConverterSourceForm` → kreator ui2
   `KreatorZrodlaOze` na frameworku kreatory/rama, DOPIERO gdy backend (PF + NC RfG) daje
   realne wejścia dla nowych kontrolek. Superset istniejącej funkcjonalności + nowe
   kontrolki z G-OZE-B. Retire legacy po podmianie.

**DoD każdej fazy:** mapowanie 1:1 na realne pola (zero phantomów), katalog-first,
podgląd z backendu gdzie dostępny, sekcja downstream, uczciwe stany zerowe, retire
legacy, testy natywnej ścieżki, guardy/lint/type-check, pełne regresje obu stosów,
determinizm, zrzut żywej aplikacji.
