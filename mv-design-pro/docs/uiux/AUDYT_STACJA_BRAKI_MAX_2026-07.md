# AUDYT: realne braki funkcji stacji SN/nN — opcja MAX (2026-07-21)

**Status:** BINDING (dyrektywa właściciela 2026-07-21 „opcja MAX — realne braki").
Panel 7 soczewek (projektant sieci, zwarciowiec, zabezpieczenia, rozdzielnie, katalogi,
przyłączenia/OZE, UX/IA). Wynikł z sekcji E audytu `AUDYT_EKSPERCKI_2026-07-21.md`
(REALNE BRAKI FUNKCJI stacji). Każdy brak oceniony pod kątem **rzeczywistego pokrycia
backendu** (zero fabrykacji) i **ryzyka wyspy** (czy istnieje konsument danych).

## Zasada nadrzędna
„Do ostatniego klika / nigdy wyspy": każdy brak wdrażamy tylko wtedy, gdy istnieje (lub
dobudujemy osobnym krokiem) REALNY konsument danych — solver/analiza/pakiet dowodowy/raport.
Kontrolka bez konsumenta = phantom (zakazane).

## Rekonesans pokrycia backendu (fakty z kodu)

| Zdolność | Model domenowy | Konsument (fizyka/analiza) | Ryzyko wyspy |
|----------|----------------|----------------------------|--------------|
| **Uziemienie punktu neutralnego** | ✅ `GroundingConfig` (isolated/petersen_coil/directly_grounded/resistor_grounded + r_ohm/x_ohm) na `Transformer.hv_neutral`/`lv_neutral` (`enm/models.py:21,289`) | ✅ `eligibility_service.py:546` (`has_grounding` gate) · `proof_engine/packs/earthing_ground_fault_sn.py` (pakiet dowodowy uziemienia) · `field_read_model.py:1269` (`_map_grounding_type`) | **NISKIE** — konsumenci istnieją, brakuje tylko konfiguracji w kreatorze |
| **Pętla zwarcia nN (IEC 60364)** | — (parametry jawne) | ✅ `fault_loop_iec60364.py` + `fault_loop_builder.py` + `api/fault_loop.py` (TN-S/TN-C-S/TN-C; TT/IT deferred) + `analysis_run/service.py` | ŚREDNIE — endpoint bierze składowe R/X ręcznie, nie z modelu |
| **Ograniczniki przepięć (SPD)** | ✅ apparatus `SURGE_ARRESTER` + `earthing_role: surge_ground` (`enm/models.py:893,912`); kolekcja `insulation` (v126) | ✅ **WDROŻONE (V12K-083)** — most `build_v126_insulation_from_enm` (model → IEC 60071 `_insulation`); SLD rysuje I koordynacja izolacji liczy z tego samego elementu | **ZAMKNIĘTE** — GAP-2 domknięty, konsument liczbowy = `_insulation` |
| **Układ pomiarowy CT/VT + licznik** | ✅ `Measurement` (CT/VT) + `MeasurementRating` (`models.py:45,516`) + `BayMeasurements` | ✅ zabezpieczenia (`ProtectionAssignment.ct_ref/vt_ref`, `requires_ct_vt`) | NISKIE dla CT/VT ochronnych; ŚREDNIE dla licznika rozliczeniowego (konsument = raport/zgodność) |
| **Sekcjonowanie nN / dwie sekcje** | częściowe (GPZ sekcje: `Sekcja GPZ`, `add_bus_section`); stacja `sectional` = sprzęgło bez II sekcji | PF (open switch → radialny) | ŚREDNIE — operacja domenowa II sekcji do dobudowy |
| **Praca równoległa transformatorów** | ⚠ `generators.n_parallel` istnieje; `transformers` — BRAK `n_parallel` w allowliście (`domain_operations.py:6066`) | PF (Y-bus per gałąź) | ŚREDNIE — model transformatora bez krotności; wymaga rozbudowy |
| **Potrzeby własne stacji** | ✅ reużycie `add_nn_load` (odbiór nN) | ✅ PF | NISKIE — mały odbiór nN, istniejąca operacja |

## Plan fazowy (priorytet wg wartości normatywnej × niskie ryzyko wyspy)

- **G-STK-1 — Uziemienie punktu neutralnego (FLAGSHIP, ta runda).** Kreator konfiguruje
  układ uziemienia neutralnego transformatora (TN/TT/IT + typ pracy punktu neutralnego:
  izolowany / cewka Petersena / bezpośrednio / przez rezystor + R/X) → operacja materializuje
  `GroundingConfig` na `lv_neutral` (nN) i/lub `hv_neutral` (SN) → **istniejący** łańcuch
  konsumenta (eligibility `has_grounding` → pakiet dowodowy earthing/ground-fault → field read
  model). Zero wyspy. PanelTeorii (skutki układu dla prądu zwarcia doziemnego / napięć dotyku).
- **G-STK-2 — Układ pomiarowo-rozliczeniowy.** Punkt pomiarowy (przekładniki + licznik)
  obowiązkowy dla OZE; reużycie `Measurement`/`MeasurementRating`. Konsument: raport zgodności
  + pole pomiarowe. (Kolejna runda; CT/VT ochronne już są.)
- **G-STK-3 — Potrzeby własne stacji.** Mały odbiór nN reużywający `add_nn_load`. (Kolejna runda.)
- **G-STK-4 — Pętla zwarcia nN z modelu.** Zbudować `FaultLoopInput` z modelu (Z trafo +
  neutralne + przewody) zamiast ręcznych składowych — domyka G-STK-1 „do ostatniego klika".
- **G-STK-5 — Dwusekcyjna stacja sekcyjna (P5).** Operacja domenowa II sekcji szyny + sprzęgło
  między sekcjami.
- **G-STK-6 — Praca równoległa transformatorów.** `n_parallel` na modelu transformatora +
  konsumpcja w PF (równoległe gałęzie).
- **G-STK-7 — SPD (ograniczniki). ✅ WDROŻONE (V12K-083).** Konsument USTALONY: `_insulation`
  (IEC 60071, margines BIL) w v126_academic. Most `build_v126_insulation_from_enm` czyta
  aparaty `SURGE_ARRESTER` z pól modelu → `V126InsulationInput` (MCOV/U_res/TOV/energia z
  `mv_surge_arrester_catalog` po `catalog_ref`; `network_neutral` z uziemienia punktu
  neutralnego), wpięty w `build_v126_input_from_enm`. UI `V126AcademicSurface` przestaje
  wysyłać fabrykowany ogranicznik (model napędza; pusty model = uczciwy stan zerowy). Element
  modelu już NIE jest wyspą — rysowany na SLD I liczony w koordynacji izolacji.

## Uzasadnienie kolejności
Flagship G-STK-1 ma najwyższą wartość normatywną (układ uziemienia determinuje prądy zwarcia
doziemnego, napięcia dotyku, dobór zabezpieczeń ziemnozwarciowych) PRZY najniższym ryzyku wyspy
(pełny łańcuch konsumenta już istnieje). G-STK-7 (SPD) świadomie ostatni — bez pewnego konsumenta
liczbowego byłby phantomem.
