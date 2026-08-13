# KREATORY MAX — KOLEJNOŚĆ KROKÓW WEWNĄTRZ KREATORÓW (karta K9, 2026-07-29)

**Status:** WIĄŻĄCY projekt kolejności (program dowodzenia; zatwierdzony przez
nadzorcę przed implementacją K9-A/K9-B). Uzupełnia
`KOLEJNOSC_KROKOW_E1_E8_2026-07-29.md` (przejścia MIĘDZY ekranami) o kolejność
kroków WEWNĄTRZ dwóch kreatorów: źródła OZE i stacji SN/nN. Dyrektywa
właściciela 2026-07-29: „kreator stacji i OZE zrób je bardziej przemyślanie
i więcej opcji inżynierskich wpleć w obecny plan" — opcja MAX, zero fabrykacji.

**Zasada:** każdy krok kreatora mapuje na REALNĄ operację domenową lub endpoint
podglądu. Kontrolka bez dostawcy backendowego nie powstaje (phantom rule);
brak dostawcy = karta backendowa B-*, nigdy udawanie. Readouty (prądy, straty,
grupa połączeń) pochodzą z backendu (podgląd/materializacja) — ZERO fizyki w UI.

Stan „dziś" zmierzony w kodzie (inwentarz delty K9, transkrypt agenta;
decyzje: karta K9 nadzorcy). Pliki bazowe:

- OZE: `frontend/src/ui2/kreatory/zrodlo-oze/KreatorZrodlaOze.tsx`
  (kroki dziś: tech → katalog → [dobor, tylko wariant blokowy] → regulacja → zapis)
- Stacja: `frontend/src/ui2/kreatory/stacja/KreatorStacjiSnNn.tsx`
  (kroki dziś: rodzaj → transformator → rozdzielnica → nn → uziemienie → zapis)
- Operacje: `backend/src/enm/domain_operations_v2.py`
  (`set_der_catalog_bindings` z `DER_BINDING_KEYS` + `DER_PROFILE_KEYS`,
  `set_source_operating_mode`, `set_dynamic_profile`, `update_element_parameters`)
- Szablony stacji: `backend/src/application/station_templates/schema.py`
  (TemplateSchema; biblioteki: prosument_pv, farmy_pv, bess, hybrydowe)
- Podglądy: `backend/src/api/grid_source_preview.py`
  (transformer-rated-currents-preview), `dry_run` + `preview.electrical_impact`
  w kopercie operacji.

---

## K9-A · Kreator źródła OZE — docelowa sekwencja kroków

Cel przebudowy: dziś kreator kończy się na zapisie elementu, a gotowość
obliczeniowa OZE pozostaje zablokowana z definicji (5/14 osi wymaga wiązań
aparaturowych i profili zgodności, których kreator nigdy nie ustawia).
Kreator MAX domyka DRUGI KROK: wiązania + zgodność w tym samym przepływie.

| # | Krok | Co inżynier ustala | Dostawca (zero fabrykacji) | Delta |
|---|------|--------------------|-----------------------------|-------|
| 1 | `tech` (jest) | technologia, wariant przyłączenia (nN / blokowy SN) | jak dziś | O13: panel konsekwencji wariantu (tabela prawdy z modelu — readout, nie fizyka) |
| 2 | `katalog` (jest) | typ falownika/generatora z katalogu | jak dziś | O7: jawna semantyka `quantity` (× jednostek, sumaryczna moc jako readout z katalogu) |
| 3 | `dobor` (jest, wariant blokowy) | tor SN: kabel + TR blokowy | jak dziś | O8/O9/O11: pola `loadability_pu`, `simultaneity_factor`, `uk_percent`, `field_reserve_pu`; S6-analog: podgląd I1/I2 TR z `transformer-rated-currents-preview` |
| 4 | **`aparatura` (NOWY)** | CT, VT, zabezpieczenie pola OZE | `set_der_catalog_bindings` (`ct_catalog_ref`, `vt_catalog_ref`, `protection_catalog_ref` — walidowane katalogiem); `fault_current_data_ref`, `dynamic_model_ref` jako pola jawnie „bez walidacji katalogowej" (dług nazwany w kodzie DO2) | O2/O3 |
| 5 | **`zgodnosc` (NOWY)** | profile NC RfG: `nc_rfg_profile_ref`, `lvrt_curve_ref`, `hvrt_curve_ref`, `pf_curve_ref` | `set_der_catalog_bindings` (podsłownik `profiles`) | O4 |
| 6 | `regulacja` (jest) | tryb pracy źródła (PQ/PV/oddanie mocy), limity P/Q | tryb: `set_source_operating_mode` (wymaga ekspozycji w `types/domainOps.ts` — wspólnie z K5-B); limity: `update_element_parameters` po zapisie | O5, O1 |
| 7 | `zapis` (jest) | podsumowanie + zapis | sekwencja operacji: add_converter_source → set_der_catalog_bindings → set_source_operating_mode | — |
| 8 | **po zapisie: `gotowosc` (NOWY readout)** | podgląd osi gotowości DER | istniejący endpoint readiness (der_readiness) — NIE lokalna kopia reguł | O15 |

Krok `existing_field` (O12 — podpięcie do istniejącego pola zamiast tworzenia
nowego) wchodzi jako wybór w kroku 1 (wariant przyłączenia), nie jako osobny krok.

**Poza K9-A (dług prowadzony):** O6 profil czasowy (`set_dynamic_profile` — UI
wykresu punktów, karta osobna), O14 (kafel warunków OSD już na pulpicie — tylko
link), O16/O17 (B-10 flagi NC RfG / ujednolicenie wariantu blokowego).

## K9-B · Kreator stacji SN/nN — docelowa sekwencja kroków

Cel przebudowy: dziś kreator zbiera parametry jednej operacji; MAX = sekwencja
operacji (stacja → pola → CT/VT → przekaźniki → odpływy nN) + start z szablonu
+ podgląd skutków przed zapisem.

| # | Krok | Co inżynier ustala | Dostawca | Delta |
|---|------|--------------------|----------|-------|
| 0 | **`szablon` (NOWY)** | start z szablonu (prosument PV, farma PV, BESS, hybryda) albo od zera | `station_templates` (TemplateSchema = gotowa lista pól; wybór WYPEŁNIA formularz — dalej edytowalny) | krok 0 |
| 1 | `rodzaj` (jest) | typ stacji, układ szyn | `station_type` (granica dzisiejszego kontraktu; sekcje szyn = B-1, decyzja produktowa) | S3 |
| 2 | `transformator` (jest) | TR: katalog, `n_parallel` vs osobne jednostki, zaczepy | katalog TR; readout grupy połączeń/strat z typu; podgląd I1/I2 z `transformer-rated-currents-preview`; zaczepy stacji = B-2 (dziś: przekierowanie do kreatora transformatora) | S6, S7, S19, S8 |
| 3 | **`pola` (przebudowa `rozdzielnica`)** | edytowalna lista pól SN (rola, aparat) | insert/append_station + aparat per pole; **BEZ zaszytego fallbacku aparatu** — usunięcie fabrykacji `"sw-cb-abb-vd4-17kv-630a"` (DO:4581) to karta B-12, warunek wejścia K9-B | S1, S2 |
| 4 | **`pomiar-zabezpieczenia` (NOWY)** | CT/VT + przekaźnik per pole (kody zabezpieczeń per rola jako readout) | `add_ct`/`add_vt`/`add_relay` po zapisie stacji (atomowość = dług B-3, nazwany) | S9, S10 |
| 5 | `nn` (jest) | tabela odpływów nN z rolami | `add_nn_load` | S11 |
| 6 | `uziemienie` (jest) | uziemienie strony SN, `x_ohm` (cewka Petersena) | parametry operacji stacji | S4, S5 |
| 7 | **`podglad` (NOWY)** | skutki elektryczne przed zapisem; `insert_at` w metrach | koperta z `dry_run` + `preview.electrical_impact` — readout z backendu | S14, S17 |
| 8 | `zapis` (jest) | zapis sekwencji + następny krok: pierścień/NOP | wzorzec łańcuchowania `scheduleNextOperationForm` (jedyny istniejący „dokąd dalej" — kreator odcinka) | S13 |

**Poza K9-B (dług):** S15/S16/S18/S20 → B-4/B-5/B-6/B-7 („zapisz jako szablon"
= B-8; oznaczenia i `construction_type` = B-4/B-5 — tanie, robione równolegle
jako karty backendowe).

## Karty backendowe (kolejność wartości, z inwentarza BRAK-DOSTAWCY)

| Karta | Zakres | Priorytet |
|-------|--------|-----------|
| B-12 | usunięcie zaszytego fallbacku aparatu w DO (fabrykacja) — walidacja jawna zamiast domysłu | PILNE — warunek K9-B krok 3 |
| B-4/B-5 | oznaczenia stacji, `construction_type` | tanie — równolegle z K9-B |
| B-2 | zaczepy (tap changer) w operacji stacji | po K9-B |
| B-3 | CT/VT atomowo w operacji stacji | po K9-B |
| B-8 | „zapisz jako szablon" | po K9-B |
| B-9 | limity P/Q w `add_converter_source` (dziś: `update_element_parameters` po zapisie) | po K9-A |
| B-10 | flagi NC RfG | dług |
| B-11 | klasa CT z ENM | dług |
| B-1/B-6/B-7 | sekcje szyn / `cell_type` / `nn_levels` | decyzja produktowa (AskUserQuestion przy podjęciu) |

## Bramki odbioru K9 (mierzone przez nadzorcę)

1. **K9-A:** przejście na żywej aplikacji: kreator OZE od `tech` do `gotowosc`
   — po zapisie osie gotowości DER przestają być blokowane z definicji
   (der_readiness pokazuje osie aparaturowe jako spełnione dla kompletnego
   przejścia). Nowy spec e2e ćwiczy ścieżkę natywną (klik po krokach).
2. **K9-B:** stacja z szablonu „farma PV" → edycja pól → podgląd skutków →
   zapis → CT/VT/przekaźnik obecne w ENM; zero fallbacku aparatu (B-12
   domknięte); spec e2e od szablonu do zapisu.
3. Wspólne: pełny `npm test` RC=0, type-check, lint, guardy UI
   (no_codenames, forbidden_ui_terms, ui_terminology, dead_click), pełna
   suita e2e RC=0, regresja wstrzykiwana gryzie (spec + guard), determinizm
   nietknięty, wpis V12K-NNN w rejestrze w tym samym commicie.

## Kolejność w programie

K5-A (w toku) → odbiór → K5-B (E-28 nastawy + ekspozycja
`set_source_operating_mode`/`set_dynamic_profile` w `types/domainOps.ts` —
wspólna zależność z K9-A) → **K9-A** → **K9-B** (+ B-12/B-4/B-5 równolegle)
→ K6-A/B → K7-B → K8.
