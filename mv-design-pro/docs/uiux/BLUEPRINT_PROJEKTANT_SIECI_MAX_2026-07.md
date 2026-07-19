# BLUEPRINT: Projektant sieci SN/nN — opcja MAX, wielowarstwowo „do ostatniego klika"

**Status:** BINDING (projekt architektoniczny; dyrektywa właściciela 2026-07-19:
„jako architekt przemyśl i przeprojektuj w opcji na max każdy krok i każdą realną
operację domenową; rozbuduj i przewiduj do ostatniego klika wielowarstwowo;
rozbuduj katalogi i wszystko inne w opcji max — nie trzymaj starych ram").
**Rejestr:** V12K-048 (nadrzędny nad V12K-047 `PROJEKT_FLOW_BUDOWY_SIECI`).
**Zakres:** cały warsztat projektanta (E1–E8) + KAŻDA kanoniczna operacja domenowa
(`enm/domain_operations*.py`), z rozbudową katalogów i backendu tam, gdzie łańcuch
jest niepełny. Bez edycji kanwy SLD (`ui/sld/**` — wątek V12K-060; nawigacja
model↔schemat pozostaje wspólna).

---

## 0. Zasady nadrzędne (opcja MAX)

1. **Wizja end-to-end (wielowarstwowo).** Każdy element projektujemy przez PEŁEN
   łańcuch warstw: **Kontrakt danych → Katalog → Operacja domenowa → API →
   ENM/Snapshot → SLD → Solver → Analiza → Zabezpieczenia → Raport → Zgodność.**
   Zanim zbudujemy krok, ustalamy: skąd dane pochodzą, jak się wiążą, GDZIE spływają.
2. **Zero fabrykacji (phantom rule) w obie strony.** (a) Kontrolka UI musi mapować
   na realne pole/operację backendu. (b) **Realna zdolność backendu bez punktu
   wejścia to też defekt** — jeśli katalog/solver/analiza istnieją, a nie ma operacji
   domenowej i kreatora, łańcuch jest zerwany i uzupełniamy go end-to-end.
3. **Reużycie zamiast duplikacji.** Framework `kreatory/rama`, pickery katalogu,
   szablony pól producenckich / Reference Engine, kontrakty podglądów R1/R2.
4. **Nie trzymaj starych ram.** Legacy formularze (`*Form.tsx`) przebudowujemy na
   kreatory ui2; retire po podmianie (Opcja 1: `operationFormRegistry` +
   `operationSurfaceRegistry`), bez zmiany kontraktów operacji.
5. **Determinizm i granice FROZEN.** Nowe pola addytywne (`exclude_none`); seedy i
   hash istniejących payloadów bez zmian; fizyka wyłącznie w solverach (WHITE BOX).

---

## 1. Model warstw łańcucha (dla każdego elementu)

| Warstwa | Artefakt | Reguła |
|---------|----------|--------|
| Kontrakt danych | `types/domainOps.ts` (`CanonicalOpName`, payloady) | addytywnie |
| Katalog | `network_model/catalog/*` (namespace + typy immutable) | katalog-first |
| Operacja domenowa | `enm/domain_operations*.py` (mutacja ENM) | jedyne miejsce mutacji |
| API | `/api/execution` (create_run → canonical) / `/api/solver/*-preview` | kontrakt |
| ENM/Snapshot | kolekcje ENM (`shunt_capacitors`, `sources_sn`, …) | single model |
| SLD | `enmToSldAdapter` → glify | wątek V12K-060 |
| Solver | `network_model/solvers/*` (SC/PF/OLTC/machine/inverter) | fizyka tu |
| Analiza | `analysis/*` (reactive_adequacy, arc_flash, grid_strength, …) | interpretacja |
| Zabezpieczenia | protection engine, TCC, koordynacja | interpretacja |
| Raport | `analysis/reporting/*`, proof packs | READ-ONLY |
| Zgodność | compliance / normative (IEC, NC RfG/PTPiREE) | interpretacja |

---

## 2. Pełna macierz: operacja → łańcuch → status → faza

Legenda statusu dostawcy UI: ✅ kreator ui2 · ▲ legacy = do przebudowy · ✗ = brak (gap).

| Operacja domenowa | Katalog | Podgląd backend | Kluczowi odbiorcy downstream | UI | Faza |
|-------------------|---------|-----------------|------------------------------|----|----|
| `add_grid_source_sn` | ZRODLO_SN, TRANSFORMER_WN_SN, tap_changer, switchgear, bay_template | grid-source (Ik″/κ/ip/Ith) | SC IEC 60909, PF slack, OLTC, grid_strength, NC RfG | ✅ `KreatorZrodloZasilania` | done |
| `continue_trunk_segment_sn` | KABEL_SN/LINIA_SN | cable ΔU + Iz (R1) | PF, SC, voltage_profile, losses, SLD | ✅ `KreatorMagistralaSn` | done (G-MAG) |
| `insert_station_on_segment_sn` / `append_station_on_endpoint` | STATION_TEMPLATE, ROZDZIELNIA_SN | — | topologia, SLD blok stacji | ▲ legacy `InsertStationForm` | **G-STA** |
| `add_transformer_sn_nn` | TRAFO_SN_NN, tap_changer (DETC/OLTC) | transformer rated I₁/I₂ (R2) | PF, SC, OLTC studies, losses, raport | ✅ `KreatorTransformatoraSnNn` | done (G-TRF) |
| `add_sn_bay` | switchgear, bay_template, APARAT_SN | — | topologia pola, SLD, zabezpieczenia | ▲ `AddSnBayForm` | G-POLE |
| `insert_section_switch_sn` | APARAT_SN | — | topologia, stany łączników (case), PF | ▲ `InsertSectionSwitchForm` | G-SEK |
| `connect_secondary_ring_sn` / `set_normal_open_point` | — | — | topologia pierścienia, PF (NOP), pewność zasilania | ▲ `ConnectRingForm` | G-RING |
| `insert_branch_pole_on_segment_sn` | — | — | topologia odgałęzień, SLD | ▲ `InsertBranchPoleForm` | G-ODG |
| `insert_zksn_on_segment_sn` | ROZDZIELNIA_SN/ZKSN | — | topologia, SLD | ▲ `InsertZksnForm` | G-ZKSN |
| `start_branch_segment_sn` | KABEL_SN/LINIA_SN | cable ΔU + Iz (R1) | PF, SC, voltage_profile, SLD | ▲ `StartBranchForm` | G-ODG |
| `add_nn_outgoing_field` | KABEL_NN, APARAT_NN | cable ΔU + Iz (R1) | PF nN, losses, ΔU, SLD | ▲ `AddNnOutgoingFieldForm` | G-NN |
| `add_nn_load` | OBCIAZENIE (opc.) | prąd/S z P·cosφ (R1) | PF, losses, energy, arc_flash, boundary | ✅ `KreatorOdbioruNn` | done (G-NN) |
| `add_converter_source` | CONVERTER_PV/BESS/WIND_NN, block-trafo | — | machine SC, inverter PF, NC RfG/FRT, grid_strength, SSCI | ▲ `AddConverterSourceForm` → audyt V12K-051 | **G-OZE (audyt gotowy)** |
| `add_genset_nn` | (genset) | — | machine SC, PF, RMS stability | ▲ `AddDispatchableSourceForm` | G-NN |
| `add_ups_nn` | (UPS) | — | PF, ciągłość zasilania | ▲ `AddDispatchableSourceForm` | G-NN |
| `add_ct` | CT_VERSION | — | zabezpieczenia (przełożenie), TCC | ▲ `AddMeasurementForm` | G-POM |
| `add_vt` | VT_CATALOG | — | zabezpieczenia, pomiary napięciowe | ▲ `AddMeasurementForm` | G-POM |
| `add_relay` / `link_relay_to_field` / `update_relay_settings` | (przekaźnik) | TCC (`calculate_tcc_curve`) | protection engine, koordynacja, selektywność | ▲ `AddRelayForm` | G-ZAB |
| `assign_catalog_to_element` / `update_element_parameters` | wszystkie | wg elementu | wszędzie | inspektor/property-grid | edycja |
| **`add_shunt_compensator_sn`** ✗ | **KOMPENSATOR_SN (istnieje)** | **ΔQ/ΔU (nowy)** | **PF (+jB, istnieje), reactive_adequacy (istnieje), losses, raport** | **✗ BRAK** | **G-KOMP** |
| **`add_surge_arrester_sn`** ✗ | **OGRANICZNIK_SN (istnieje)** | — | **ochrona przepięciowa, raport, zgodność** | **✗ BRAK** | **G-OGR** |

---

## 3. Rejestr braków (gap register) — uzupełniamy end-to-end

### GAP-1 (FLAGSHIP) — Bateria kondensatorów SN: łańcuch zbudowany, brak wejścia
- **Stan:** katalog `mv_shunt_capacitor_catalog.py` (5 typów: rated_mvar/rated_kv/loss_kw),
  `MaterializationContract(KOMPENSATOR_SN)` = `get_shunt_capacitor_type`, solver PF już
  czyta `snapshot["shunt_capacitors"]` i liczy `b_pu = Q_rated/S_base` (+jB), analiza
  `reactive_adequacy` konsumuje. **Brakuje wyłącznie** operacji `add_shunt_compensator_sn`,
  `CanonicalOpName` i kreatora → inżynier NIE MOŻE postawić baterii, choć cała fizyka czeka.
- **Uzupełnienie:** op domenowa materializująca element do `shunt_capacitors`
  (bus_ref, rated_mvar, rated_kv, status, catalog_binding), rejestr op, kreator ui2
  `KreatorKompensatoraSn` (katalog-first, podgląd ΔQ/ΔU z backendu), wiring SLD/raport.

### GAP-2 — Ogranicznik przepięć SN: WSTRZYMANE (ryzyko wyspy, brak konsumenta downstream)
- **Stan:** `OGRANICZNIK_SN` + `get_surge_arrester_type` + picker (`fetchSurgeArresterTypes`)
  istnieją. Głębszy recon (2026-07-19) ustalił, że **żaden solver/analiza NIE konsumuje
  POSTAWIONEGO ogranicznika** — v126_academic koordynację izolacji liczy z odrębnej
  kolekcji `model.insulation` (nie z elementów `surge_arrester`); brak kolekcji
  `surge_arresters` czytanej w `canonical_analysis`/`solver_input`.
- **Decyzja:** NIE budować op+kreatora jako WYSPY (dyrektywa: „buduj ogniwo łańcucha, nie
  wyspę"). Najpierw trzeba dostawić realnego konsumenta postawionego ogranicznika
  (sekcja raportu ochrony przepięciowej / wpięcie w koordynację izolacji), potem wejście.
  Do czasu ustalenia konsumenta faza pozostaje w rejestrze długu, nie w kolejce wdrożeń.

### GAP-5 — Odbiór nN: cosφ jako phantom (control ignorowany przez fizykę)
- **Stan:** `add_nn_load` zapisywał `cos_phi` do `meta`, ale `q_mvar` liczył wyłącznie z
  jawnego `reactive_power_kvar` → odbiór z P + cosφ (bez jawnego Q) miał Q=0, a rozpływ
  mocy ignorował cosφ. Odbiory (`loads`) mają realny łańcuch: PF, arc_flash, boundary, energy.
- **Uzupełnienie (G-NN):** op wyprowadza `q_mvar = P·tan(arccos cosφ)` z tabliczki, gdy Q
  nie podano jawnie (dobór mocy biernej odbioru; input-prep w domenie, nie fizyka sieci);
  kreator ui2 `KreatorOdbioruNn` z podglądem prądu (R1) i sekcją downstream.

### GAP-3 — 16 operacji budowy na legacy formularzach
- Przebudowa na kreatory ui2 wg kontraktu §4; retire legacy po podmianie.

### GAP-4 — Braki podglądów backendu (opcja max, gdzie ma wartość inżynierską)
- Kompensator: podgląd ΔQ dostarczonej i szacunkowej poprawy ΔU (nowy `/api/solver/*`).
- Transformator: R2 już liczy I₁/I₂ — podłączyć w G-TRF; rozważyć podgląd obciążenia %.
- Odpływy nN: R1 (cable ΔU/Iz) — podłączyć w G-NN.

---

## 4. Kontrakt kreatora budowy MAX (wspólny, rozszerzony o warstwowość)

Każdy kreator na `kreatory/rama` spełnia (rozszerzenie kontraktu G-MAG o świadomość
downstream — „do ostatniego klika"):

1. **Cel jednym zdaniem** (po co element w sieci) — język inżynierski (po co / z czego / co daje).
2. **Tor pracy** = kroki, z akcjami naprawczymi przy błędach; uczciwe stany zerowe.
3. **Katalog-first** (picker), zero ręcznych parametrów fizycznych; parametry z katalogu.
4. **Podgląd konsekwencji z backendu** (R1/R2/nowe) — ZERO fizyki w UI.
5. **Warstwa downstream w kreatorze:** sekcja „Co to uruchamia" — jawnie wymienia,
   które analizy/solvery/raporty zaczną korzystać z elementu (np. bateria →
   reactive_adequacy + PF; przekaźnik → koordynacja + TCC). Buduje wizję łańcucha u inżyniera.
6. **Jawny następny krok** = realna operacja domenowa (łańcuchowanie jak w G-MAG,
   wspólna logika `trunkContinuation.ts` / analogiczne).
7. **Zapis = realna operacja domenowa** (`executeDomainOperation`), payload zgodny z kontraktem.
8. **Rejestracja dostawcy (Opcja 1)** + retire legacy.

---

## 5. Katalogi — rozbudowa w opcji MAX

- Wymuszony katalog-first dla wszystkich elementów fizycznych; brak fallbacku „ręczne parametry".
- Reużycie szablonów pól producenckich / Reference Engine (pickery z metadanymi:
  producent, norma, status weryfikacji) zamiast równoległych rozwiązań.
- Braki pokrycia katalogowego (typy odbiorów nN, gensety, UPS) uzupełniamy jako
  osobne, przetestowane kroki katalogu — nie udajemy działania kontrolką bez pokrycia.

---

## 6. Kolejność wdrożenia (fazy) + DoD

1. ✅ **G-KOMP** (GAP-1, flagowy) — WDROŻONE. `add_shunt_compensator_sn` end-to-end:
   op domenowa (materializacja do `shunt_capacitors`, katalog-first), endpoint katalogu
   `/api/catalog/shunt-capacitor-types`, solver podglądu `shunt_compensator_preview`
   (WHITE BOX) + endpoint, kreator `KreatorKompensatoraSn` (podgląd B/I_c z backendu,
   uczciwy stan zerowy, sekcja downstream), launch z menu szyny SN. Domknął najdłuższy
   istniejący, głodny łańcuch (katalog+PF+jB+reactive_adequacy czekały bez wejścia).
2. ✅ **G-TRF** — WDROŻONE (`KreatorTransformatoraSnNn`): katalog-first + R2 (I₁/I₂) + PEŁNA regulacja DETC/OLTC (backend `add_transformer_sn_nn` rozszerzony o materializację TapChanger — domknął łańcuch OLTC dla transformatora spoza GPZ). G-STA (stacja) — kolejny krok.
3. **G-NN + G-OZE** — odpływy/odbiory nN + źródła OZE (machine SC / inverter / NC RfG).
4. **G-SEK/G-RING/G-ODG/G-ZKSN** — sekcjonowanie, pierścienie, odgałęzienia, ZKSN.
5. **G-POLE/G-POM/G-ZAB** — pola SN, CT/VT, przekaźniki + nastawy (TCC/koordynacja).
6. **G-OGR** (GAP-2) — ogranicznik przepięć.

**DoD (każda faza):** kreator ui2 na frameworku mapujący na realną operację; katalog-first;
podgląd z backendu gdzie dostępny; sekcja downstream; jawny następny krok; retire legacy;
testy realnej ścieżki (natywny klik → op); type-check/lint/guardy; pełne regresje obu
stosów; determinizm/hash; zrzut żywej aplikacji do oceny (oba motywy).
