# MV-DESIGN-PRO — DOCELOWA ARCHITEKTURA ZABEZPIECZEŃ (mandat §26, §32–§38, §82, §112; pakiet §179 poz. 12)

> **Status od 2026-09-04 (kontrakt MAX PLATFORM):** materiał wejściowy i dowodowy programu konwergencji. Źródło kanoniczne architektury: `../architecture/PRODUCT_CAPABILITY_MODEL.md`, `../architecture/CANONICAL_DIGITAL_TWIN.md`, `../architecture/REVISION_SCENARIO_EXECUTION_MODEL.md`, `../architecture/COMPUTATIONAL_BOUNDARY.md`, `../architecture/FUTURE_CAPABILITY_REVIEW.md`, `../reference-networks/REFERENCE_NETWORK_REGISTRY.md`, `../evidence/CONVERGENCE_EVIDENCE.md`. Przy rozbieżności obowiązuje dokument kanoniczny; w szczególności: nie powstaje nowa klasa `TwinModel` (Canonical Project Twin = rozwinięty ENM), `network_model` jest pochodnym IR, program nie zatrzymuje się po M0, lecz prowadzi konwergencję wycinkami CV-0…CV-6 z bramkami B-01/B-02 i procedurą kasacji.


**Status:** PROPOZYCJA (do przeglądu właściciela; nic nie jest wdrożone)
**Data:** 2026-09-02 · **Gałąź:** `claude/mv-design-pro-twin-audit-u4lhy0` · **HEAD audytu:** `a1ab2959`
**Źródła dowodowe:** A4 (zabezpieczenia, CT/VT, aparatura, TCC, trace — 17 ustaleń, 16 wymagań dodatkowych), A12 (W10, EF-035/038/039/040/041), A5 (LoM, RfG), A11 (SWZ, I²t, nN), A7 (oznaczenie ochrony na SLD, fantom nastaw w szufladzie), A6 (katalog przekaźników z fikcyjnymi identyfikatorami).
**Relacja do innych dokumentów twin:** encje i warstwy — `MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md` §4; solvery — `MV_DESIGN_PRO_SIMULATION_ARCHITECTURE.md`; workflow W10 — `MV_DESIGN_PRO_TARGET_ENGINEERING_WORKFLOW.md`; ograniczenia — `MV_DESIGN_PRO_DESIGN_OPTIMIZATION_ARCHITECTURE.md` §3.

---

## 0. Diagnoza (skrót A4)

| Fakt | Dowód |
|---|---|
| **5 implementacji fizyki IDMT** (IEC 60255): kanon `solvers/protection_iec60255.py:370` + `domain/protection_engine_v1.py:536` + `application/protection_analysis/engine.py:220` + `analyses/protection/overcurrent/calculator.py:124` (tylko SI, `0.02` zaszyte) + `enm/domain_operations_v2.py:107`; trzy poza warstwą solverów | A4-01 |
| **Nastawy nie są częścią modelu w ścieżce użytkownika:** kreator wysyła tylko `relay_type`+`catalog_ref`; `update_relay_settings`/`link_relay_to_field`/`calculate_tcc_curve` zwracają `relay.legacy_write_disabled`, a figurują w rejestrze kanonicznym; nastawy żyją w `StudyCase.ProtectionConfig.overrides` i w request body E-28 | A4-02 (`KreatorPrzekaznika.tsx:184-188`, `domain_operations_v2.py:1026-1092`) |
| **Fantom nastaw SN na żywo:** `SldDetailDrawer.tsx:1833-1835` renderuje `50: 8.0×In/0.05 s`, `51: 1.5×In/1.2 s`, `67: auto/0.4 s` dla każdego aparatu; test pinuje fabrykację | A4-03 |
| `validate_selectivity` (LIVE) czyta `settings.get("Ipickup_a")` ze słownika, gdy ENM ma listę; paruje po indeksie listy; mutuje `enm.meta` | A4-04 |
| TCC/koordynacja = kalkulator zasilany z body (urządzenia z szablonów 400 A/TMS 0,3, nie z modelu) | A4-05 (`api/protection_coordination.py:369-390`) |
| RELAY = przypisanie bez producenta/modelu/wejść; **TRIP MATRIX nie istnieje** (grep = 0); logika = 1 interlock runtime; `breaker_failure_enabled`/`synchrocheck_enabled` zawsze False; `spz=None` zawsze; `arc_protection_enabled: False` zaszyte | A4-06 (`field_read_model.py:753-789`) |
| Funkcje ANSI: pełne tylko 50/51(/50N/51N); **67 bez modelu kierunku** (brak polaryzacji, RCA, kryteriów admitancyjnych); 27/59/81/78/ROCOF = sanity + okna LoM bez solvera; 87T/21/49/46/50BF/25 = stringi | A4-07 |
| Trace protection: SN = jeden aparat lokalny z BFS po porządku identyfikatorów (nie po kierunku przepływu), FUSE wykluczony; nN = brak „który aparat chroni odcinek" | A4-08 (`czas_wylaczenia_galezi.py:70,195-239`) |
| CT jednordzeniowy (`ct_cores` = liczba), katalog bez `rct_ohm`/Vk, Idyn=2,5·Ith wyprowadzone, brak wiązania rdzeń→odbiornik; VT: podwójny predykat 3U0 | A4-09, A4-10 |
| Aparatura SN: dowód = Um/Icu/Idyn/Ith bez Ima/Ics/cyklu/klas E/M/C | A4-11 |
| SWZ: TN-only, per odpływ, gG „spełnia" nieosiągalne (rejestr pusty), brak RCD/TT/IT | A4-12, A11-06 |
| Katalog przekaźników „ABB REX-100/200/300/500" (`ACME_REX*`, sam kod: „syntetyczne") + drugi katalog `devices_v0.json` | A4-13, A6-17 |
| 6 modeli „przekaźnika", 4–5 modeli CT, 6 słowników taksonomii aparatów, 6 reprezentacji SPZ (0 w modelu), 7 miejsc selektywności | A4 §4 |
| Kaskada unieważnienia biegów ochrony po zmianie nastaw nie istnieje (`_get_existing_run … return None`) | A4-15 |
| `BayMeasurements(frequency_hz=50.0)` jako „pomiar" bez źródła | A4-16 |
| Profile anti-islanding OSD nie istnieją; FRT T8/T10/T11/T16–18 = `no_module` mimo istnienia solvera RMS | A4-17 |

**Mandat:** §26 CZĘŚCIOWO · §32 CZĘŚCIOWO · §33 CZĘŚCIOWO · §34 BRAK · §35 BRAK · §36 CZĘŚCIOWO · §37 CZĘŚCIOWO · §38 CZĘŚCIOWO · §82 BRAK · §112 CZĘŚCIOWO.

---

## 1. Inwarianty domeny zabezpieczeń

| ID | Inwariant |
|---|---|
| PR-01 | **Jedna fizyka krzywych.** IDMT/IEEE/DT/I²t/pasma nN liczone wyłącznie w `network_model/solvers/protection_*`; wszystkie inne warstwy są konsumentami. Guard: wzorce `**` z `- 1`, `math.pow`, stałe krzywych poza solverem = czerwień w `domain/`, `application/`, `enm/`, `analysis/`. |
| PR-02 | **Nastawy są danymi assetu w modelu** (IED, grupy nastaw) z rewizją; przypadek/scenariusz wybiera grupę lub nakłada override — nigdy nie jest jedynym miejscem nastaw. |
| PR-03 | **Łańcuch §32 jako obiekty:** aparat pierwotny → rdzeń CT / uzwojenie VT → IED → funkcja → logika/blokady → trip matrix → wyłącznik. Każde ogniwo ma tożsamość i terminal/referencję; read-model Bay v10 jest projekcją tych obiektów, nie źródłem domyślnych. |
| PR-04 | **TCC jest projekcją modelu** (§35): dla wybranego toru backend zbiera aparaty, grupy nastaw i prądy z aktywnych biegów; UI rysuje. Tryb „wariant nastaw" = grupa robocza w scenariuszu, nie body żądania. |
| PR-05 | **Trace protection per element** (§112): dla każdej gałęzi/odbioru SN i nN uporządkowana lista {aparat, IED, funkcja, rdzeń CT, czas przy prądzie tego elementu, rola local/backup}, wyznaczona z kierunku przepływu biegu, nie z porządku identyfikatorów; FUSE/MCB/gG/MCCB są aparatami wyłączającymi. |
| PR-06 | **Brak danych ≠ wartość.** Brak Ik_min ⇒ czułość `NIE_DO_USTALENIA`; brak Rct ⇒ wariant uproszczony oznaczony kodem; brak tabel selektywności producenta ⇒ „nierozstrzygalne"; brak profilu OSD ⇒ brak progów 27/59/81, nie 47,5 Hz z literału. |
| PR-07 | **Zero fabrykacji w prezentacji:** szuflada/inspektor/SLD czytają `protection-view` z modelu; pole bez przypisania = stan zerowy. |
| PR-08 | **Werdykt selektywności/czułości/cieplny jest kryterium definicji gotowego** i ma dostawcę (bieg kanoniczny zabezpieczeń), nie „poza automatem". |
| PR-09 | **Zmiana nastaw unieważnia** (klasa atrybutu PROTECTION_SETTINGS w grafie zależności): koordynację, czasy wyłączenia, cieplne przewodów, arc flash, LoM×SPZ, karty nastaw — i nic poza tym. |
| PR-10 | **Katalog IED z realnymi kartami** (funkcje, wejścia 1/5 A, 100/110 V, zakresy nastaw, krzywe producenta) i statusem weryfikacji; brak identyfikatorów fikcyjnych pod marką producenta. |

---

## 2. Model domenowy (warstwa ASSET twin; addytywne klasy ENM z `exclude_none`)

```
ProtectionDevice (IED)      asset_id, ref_id, designation, container_id (Bay), catalog_binding (IedType@CatalogRevision),
                            manufacturer, model, firmware?, analog_inputs[] (CT/VT core refs, 1 A/5 A, 100/110 V),
                            binary_io[]?, functions[]: ProtectionFunction, setting_groups[]: SettingGroup,
                            active_group_ref, trip_matrix: TripMatrix, logic[]: Interlock, spz: SpzScheme|None,
                            lifecycle, provenance
ProtectionFunction          function_id, ansi_code (50|51|50N|51N|67|67N|27|59|59N|81U|81O|81R|78|87T|87N|49|46|21|25|50BF|50ARC|79|32|40|64|Y0>),
                            stage (I>, I>>, I>>>…), measurement_inputs[] (rdzeń CT / uzwojenie VT / 3I0 źródło / 3U0 źródło),
                            direction: FORWARD|REVERSE|NONE + polarization (VT 3U0 | CT neutral | admittance) + rca_deg + sector_deg,
                            curve: {standard IEC|IEEE|VENDOR, type, tms|td, min_time}, blocked_by[] (function refs, ZSI),
                            starts_spz: bool, blocks_reclose: bool, enabled_in_group[]
SettingGroup                group_id (1–4), settings[]: Setting{function_id, param_id, value, unit, unit_basis: PRIMARY|SECONDARY|PER_UNIT_IN|PER_UNIT_UN, range_ref (z katalogu), provenance}, revision, approved_by?, approved_at?
TripMatrix                  rows[]: {function_id|stage, target_breaker_refs[], delay_s, cbf_upstream_refs[] (50BF: aparaty nadrzędne), remote_trip_refs[]}
Interlock / Logic           logic_id, kind: ELECTRICAL_INTERLOCK|ZSI_BLOCK|ACCELERATION|DIRECTIONAL_BLOCK|LOM_BLOCKS_SPZ|SYNCHROCHECK,
                            inputs[] (function/state refs), output (block/permit/trip), source (catalog|design)
SpzScheme (79)              cycles[]: {kind FAST|SLOW, dead_time_s, reclaim_time_s}, blocked_by[] (I>>, LoM, 50BF), enabled
CtCore                      core_id, role: PROTECTION|MEASUREMENT|BILLING|DIFFERENTIAL|TRANSIENT, ratio, class (5P/10P/PX/TPX/TPY/0,2S…),
                            burden_va, alf|fs, rct_ohm?, vk_v?, consumer_refs[] (IED analog input / miernik / układ rozliczeniowy)
Measurement (CT/VT)         (istniejące) + cores[]: CtCore (CT) | secondaries[]: VtSecondary{winding, ratio, class, burden, arrangement (star|open_delta|residual)} (VT)
ProtectionZone (pochodne)   wyprowadzane przez trace: obszar chroniony funkcji (nie persystowane; do prezentacji i werdyktu)
```

Zasady: `Bay.protection_codes` jest **wyprowadzane** z `ProtectionDevice.functions[]` (nie odwrotnie; 28 plików frontendu czytających `protection_codes` dostaje tę samą listę z projekcji). `ProtectionAssignment` (dzisiejsze) migruje 1:1 do `ProtectionDevice` z jedną grupą nastaw; `ProtectionConfig.overrides` przypadku (`coordination_device:*`) migruje do grup nastaw z markerem pochodzenia. Read-model Bay v10 (`BayMeasurementChain`, `BaySecondaryArchitecture`, `BayProtectionControlUnit`, `SpzState`, `BayInterlockSet`, `BayEarthFaultPath`) **zostaje** jako projekcja zasilana z powyższych obiektów; pola „zawsze False/None" znikają albo dostają dostawcę. `BayMeasurements.frequency_hz=50.0` znika (wartości pomiarowe tylko z warstwy MEASUREMENT z dostawcą).

Przypadek/scenariusz: `Scenario.deltas[]` obejmuje `PROTECTION_SETTING_GROUP_SELECT{device_ref, group_id}` i `PROTECTION_SETTING_OVERRIDE{device_ref, function_id, param_id, value}` — to jedyne miejsce nastaw „scenariuszowych" (rozstrzygnięcie konfliktu §34 vs kanon V11: **model = nastawy bazowe, przypadek = wybór/override**; decyzja PZ-01).

---

## 3. Fizyka (solvery) — jedna biblioteka

| Moduł | Zawartość | Stan |
|---|---|---|
| `solvers/protection_iec60255.py` | IDMT (NI/VI/EI/LI/RI), IEEE C37.112, DT, I²t, `check_selectivity_pair`, `run_protection_coordination`, `denom_guard` | KEEP (kanon; 1084 LOC testów, tożsamość 1440 kombinacji) |
| `solvers/protection_lv_curves.py` | pasma gwarancji normy MCB B/C/D (IEC 60898-1), MCCB (Ir/Isd/Ii/tr/tsd), gG bramki (IEC 60269-1), `GwarancjaNormy` 3-stanowa | KEEP |
| `solvers/protection_directional.py` (NOWY) | kryteria kierunkowe 67/67N: wielkość polaryzująca (3U0 z VT open-delta lub obliczone; prąd neutralny), kąt charakterystyczny RCA, sektor, kryteria sin φ / cos φ dla sieci kompensowanych/rezystorowych, kryteria admitancyjne Y0>/G0>/B0> (sieci z kompensacją — typowe dla OSD w Polsce); wejścia: fazory z SC 1F (składowe) i 3I0/3U0 z `BayMeasurementChain` | NOWY (A4 W3, P0) |
| `solvers/protection_differential_87t.py` (NOWY) | Id>, charakterystyka nachyleń (slope 1/2), Id>>, blokada 2./5. harmoniczną (parametr, wejście z PQ gdy istnieje), kompensacja grupy połączeń i przekładni CT | NOWY (P1) |
| `solvers/protection_threshold_functions.py` (NOWY) | funkcje progowe na wynikach PF/RMS/SC: 27/59/59N/81U/81O/81R(ROCOF)/78, 49 (IEC 60255-149 model cieplny), 46 (składowa przeciwna z SC/PF niesym.), 51V, 32, 40 — porównania z oknami/charakterystykami; bez własnej fizyki sieci | NOWY (P1; dziś sanity/LoM) |
| `solvers/equipment_checks/ct_burden_saturation.py`, `vt_burden_voltage_drop.py` | ALF_eff pełny, spadek w obwodzie VT | KEEP |
| duplikaty: `protection_engine_v1.py:483-560`, `protection_analysis/engine.py:191-227`, `overcurrent/calculator.py:120-126`, `domain_operations_v2.py:97-110` + 5 słowników stałych krzywych | DELETE (po teście tożsamości numerycznej 5→1) |

Wszystkie z jawnym śladem WHITE BOX (krzywa, parametry, M, wynik, `formula_ref`), deterministyczne, pod `solver_boundary_guard` rozszerzonym o wzorce z PR-01.

---

## 4. Analizy (warstwa interpretacji; zero fizyki)

| Analiza | Rola | Wejścia | Istniejący kod |
|---|---|---|---|
| `SettingsProposal` | propozycja nastaw z biegów (I> = k_b·I_obc_max; I>> selektywnie od Ik na końcu odcinka i cieplnie; I0> wg prądu pojemnościowego; U0>; SPZ) wg metodyki Hoppel/IRiESD, per profil OSD | LF (max), SC max/min (c_max/c_min), model, profil OSD | `application/protection_settings/{engine,batch_run}` (KEEP), `line_overcurrent_setting` (scalić: ta sama metodyka I>>) |
| `TccProjection` | `GET /cases/{id}/protection/tcc?path=…` — krzywe wszystkich aparatów toru (IED, FUSE SN VV, MCB/MCCB/gG nN, wyzwalacze) z grupy nastaw + markery prądów z biegów (Ik max/min na początku/końcu strefy, Ib, inrush TR, rozruch silnika) | model, biegi | E-28 analyzer (`coordination/analyzer.py` z `PodstawaKrzywej` N-D5 — KEEP algorytm; wejście z modelu zamiast body) |
| `CoordinationVerdict` | selektywność par (czasowa Δt, prądowa, energetyczna I²t z tabel producenta dla nN), czułość (k przy Ik_min końca strefy), przeciążenie, rezerwa (backup), CBF, koordynacja z SPZ i LoM, blokady ZSI | `TccProjection`, `trace_protection`, tabele selektywności | `check_selectivity_pair` (solver), `sanity_checks`, `base_values` (KEEP) |
| `trace_protection(element_ref, scenario)` | PR-05: lista aparatów local/backup z czasami; kierunek z PF/SC | model, biegi | `czas_wylaczenia_galezi/pola` (KEEP jako rdzeń; rozszerzyć o listę, FUSE, nN) |
| `ThermalLetThrough` | I²t aparatu ↔ k²S² kabla (sprzężenie A11-08); czas wyłączenia z trace, nie parametr ręczny | trace, katalog | `wytrzymalosc_cieplna_przewodow` |
| `ArcFlashTime` | czas łuku = `trace_protection().local.time` (50ARC gdy jest) — nie parametr | trace | `analysis/arc_flash` (zmienić wejście) |
| `LomAndSpz` | okna LoM per profil OSD (cytowane), koordynacja LoM×SPZ (LoM musi wyłączyć przed pierwszym cyklem SPZ), przesunięcie wektora gdy dane | model DER, `SpzScheme` | `ochrona_lom.py` (KEEP; `spz` z modelu zamiast `None`) |
| `LvSelectivity` | MCB–MCCB–gG selektywność energetyczna/prądowa z tabel producenta (katalog z weryfikacją); bez tabel „nierozstrzygalne" | katalog | brak (A4 W7) |
| `CtVtAdequacy` | dobór i sprawdzenie CT/VT dla każdego pola (8+6 kryteriów, nasycenie, obciążenie) | model, biegi | `dobor_przekladnika.py`, `equipment_checks` (KEEP; uogólnić z wytwórcy na każde pole) |
| `SwitchgearAdequacy` | Um, In ciągły vs Ib (PF), Icu/Ics, Ima, Idyn, Ith, cykl O-CO-CO / SPZ, klasy E/M/C (po uzupełnieniu katalogu) | model, biegi | `equipment_proof` (KEEP; +3 sprawdzenia) |
| `SwzVerdict` (nN) | per **odcinek** (po `trace_protection` nN), TN/TT/IT, RCD, gG z pełną t-I (dane), Ia z pasma, t_a | pętla zwarcia, trace | `swz/*`, `fault_loop/*`, `nn_device_selection` (KEEP) |
| `ProtectionScheduleDocs` | karta nastaw per stacja/pole, zestawienie przekaźników i CT/VT, TCC per tor do raportu | model | `pakiet_nastaw.py`, `protection_report_{pdf,docx}`, `protection_tcc_presentation` (KEEP) |

Wszystkie analizy są **biegami** (`Run` z rewizją modelu, grupą nastaw, provenance) — nie liczeniem „w locie" bez rekordu; kryteria trafiają do `ConstraintEngine` (definicja gotowego), a FAIL do remediów (zmiana nastawy z propozycją, zmiana aparatu z kandydatami).

---

## 5. Rejestr funkcji ANSI — stan i cel (kolumny: model / fizyka / interpretacja / UI / test)

| Funkcja | Dziś | Cel (wersja 1 twin) |
|---|---|---|
| 50/51, 50N/51N | ✔/✔/✔/✔/✔ | KEEP; nastawy z modelu; I0 z SC 1F |
| 67/67N | flaga `is_directional` / brak / brak / gap SLD / — | model kierunku + `protection_directional` + werdykt + SLD (P0 — sieci z OZE odwracają kierunek) |
| Y0>/G0>/B0> (admitancyjne), U0> | brak | model + solver kierunkowy (sieci kompensowane) (P0) |
| 27/59/59N, 81U/81O/81R, 78 | model D10 / brak / sanity+LoM / ui2 LoM | `protection_threshold_functions` na PF/RMS; profile OSD z katalogu (P1) |
| 79 (SPZ) | 6 reprezentacji, 0 w modelu | `SpzScheme` w modelu; konsumenci: LoM, cieplne (tk z cyklami), koordynacja (P0) |
| 87T (87N) | `ct_refs_secondary` + gap SLD | model + solver 87T + dobór CT obu stron (P1) |
| 49, 46, 51V, 32, 40 | stringi | funkcje progowe (P1) |
| 50BF, 25 | zawsze False | `TripMatrix.cbf_upstream_refs`, `SYNCHROCHECK` w logice (P0/P1) |
| 21/21N | stringi | `PLANNED` — model i UI deklarują status, brak cichego pominięcia (§5a) |
| 50ARC | `arc_protection_enabled: False` zaszyte | funkcja z czasem łuku do arc flash (P2) |
| 64 (ziemnozwarciowe stojana/REF) | stringi | `PLANNED` — status jawny w rejestrze zdolności (§5a) |

---

## 5a. `ProtectionCapabilityRegistry` (korekta właściciela D-34) — zakres jest deklarowany, nie wyłączany

Rekomendacja „21/21N, 64, 87BB poza zakresem wersji 1" została **zmieniona**: nie wolno wyłączyć funkcji, którą system już posiada i poprawnie liczy, a brak funkcji nie może być milczący. Zakres wyraża się rejestrem stanów, nie listą wykreśleń.

```python
class ProtectionCapabilityStatus(str, Enum):
    SUPPORTED = "SUPPORTED"              # model + fizyka + interpretacja + UI + test — pełna ścieżka użytkownika
    PARTIAL = "PARTIAL"                  # działa w zadeklarowanym podzbiorze; zakres i wykluczenia jawne
    PLANNED = "PLANNED"                  # zaprojektowane, nieimplementowane; UI pokazuje status, nie udaje wyniku
    NOT_IMPLEMENTED = "NOT_IMPLEMENTED"  # brak zdolności; żądanie = jawna odmowa z powodem

@dataclass(frozen=True)
class ProtectionCapability:
    ansi_code: str                       # "67N", "87T", "21", "79", "50BF"...
    status: ProtectionCapabilityStatus
    applicability: tuple[str, ...]       # przedziały napięć, typy sieci, wymagany model fazowy, wymagane pomiary
    requires: tuple[str, ...]            # dane modelu bez których funkcja jest NOT_READY (np. CT obu stron dla 87T)
    physics_ref: str | None              # moduł solvera; None dla PLANNED / NOT_IMPLEMENTED
    interpretation_ref: str | None
    ui_ref: str | None
    test_refs: tuple[str, ...]           # pusty zbiór dla SUPPORTED = naruszenie guardu
    limitations_pl: tuple[str, ...]      # dla PARTIAL — co dokładnie nie jest liczone
```

Reguły wiążące:
1. **Zero regresji funkcjonalnej.** Funkcja licząca dziś poprawnie nie może po migracji dostać statusu niższego niż `PARTIAL` z wypisanym zakresem; obniżenie statusu wymaga decyzji właściciela z uzasadnieniem.
2. **Status jest widoczny w UI przed użyciem**, nie po nieudanym uruchomieniu; `PLANNED` i `NOT_IMPLEMENTED` nigdy nie renderują pola nastaw ani wyniku.
3. **`SUPPORTED` bez testu = naruszenie guardu.** `protection_capability_guard.py` sprawdza: każdy `SUPPORTED` ma niepusty `test_refs`, `physics_ref`, `ui_ref`; każdy `PARTIAL` ma niepuste `limitations_pl`; każda funkcja obecna w UI ma wpis.
4. **Odmowa zamiast przybliżenia.** Żądanie funkcji `PLANNED` / `NOT_IMPLEMENTED` = jawny błąd z powodem i statusem, nigdy wynik z podmienionej funkcji ani zero.
5. **Rejestr jest jednym źródłem** dla: gotowości (`ReadinessService`), doboru nastaw, koordynacji, raportu i inspektora — zakaz drugiej listy funkcji w UI.
6. **Rejestr jest żywy** — wejście funkcji z `PLANNED` do `SUPPORTED` odbywa się przez zmianę wpisu razem z testem, nie przez usunięcie ograniczenia z UI.

---

## 6. Prezentacja i nawigacja

- SLD: oznaczenie funkcji z `ProtectionDevice.functions[]` (dzisiejsze `protectionMarking.ts` KEEP, wejście z projekcji); tor wyzwalania z `TripMatrix` (nie tylko `breaker_ref`); kotwica CT/VT z rdzeni; gaps 67N/87T/51N z realnych wejść.
- Szuflada/inspektor: zakładki „Zabezpieczenia"/„Nastawy" z `protection-view` (stan zerowy gdy brak); usunięcie fantomu `SldDetailDrawer.tsx:1669-1673, 1833-1835` i testu pinującego.
- E-27 (przegląd) i E-28 (koordynacja): jeden ekran „tor zabezpieczeń" = `TccProjection` + `CoordinationVerdict` + edycja grupy nastaw (komenda `set_protection_settings` z walidacją zakresów katalogu) + „Wyznacz nastawy" (bieg `SettingsProposal`) + „Zastosuj propozycję" (komenda z rewizją nastaw).
- Akcje obiektowe: pole/aparat → „TCC toru", „Nastawy", „Co chroni ten odcinek" (trace); obwód nN → „Który aparat chroni", „SWZ".

---

## 7. Katalogi

| Katalog | Cel |
|---|---|
| IED (`IedType`) | realne karty (REF615/REF620/REX640, 7SJ8x, e2TANGO, MiCOM P14x…): lista funkcji, wejścia analogowe (1/5 A; 100/110 V), we/wy binarne, zakresy nastaw per funkcja (z jednostką i podstawą: pierwotne/wtórne/×In), krzywe producenta (przeniesione z `protection_vendors.py`), status weryfikacji; **usunięcie `ACME_REX*` i nazw „ABB REX-100…"**; jeden katalog zamiast dwóch (`mv_auxiliary_catalog` 12 vs `devices_v0.json` 51 — decyzja PZ-06) |
| Krzywe | IEC 60255 A/B, IEEE — jeden słownik stałych w solverze (dziś 5) |
| Profile OSD (`osd_protection_profiles`) | Enea/Tauron/PGE/Energa/Stoen: Δt selektywności, k_b, I0> vs prąd pojemnościowy, U0>, 27/59/81/ROCOF, anti-islanding, wymagania SPZ — z cytowaniem IRiESD i datą wersji |
| Tabele selektywności nN | per producent (MCB–MCCB, gG–MCB), status weryfikacji |
| CT/VT | + `rct_ohm`, `vk_v`, klasy TPX/TPY, rdzenie wielokrotne; Idyn z tabliczki, nie 2,5·Ith gdy dane istnieją |
| Aparatura SN/nN | + Ima, Ics, Icw/tcw, klasy E1/E2/M1/M2/C1/C2, cykl, TRV (IEC 62271-100/-103/-105; IEC 60947-2) |
| Normy nN | IEC 60364-4-41 Tab. 41.1 i t-I gG — dane (zakup/producent, decyzja C-08) |

---

## 8. Inwalidacja i świeżość

Klasy atrybutów (graf zależności, FAZA B §22): `PROTECTION_SETTINGS`, `PROTECTION_DEVICE_BINDING`, `CT_VT_BINDING`, `TRIP_MATRIX` → unieważniają: `SettingsProposal`? (nie — to wejście), `TccProjection`, `CoordinationVerdict`, `trace_protection`, `ThermalLetThrough`, `ArcFlashTime`, `LomAndSpz`, karty nastaw, SLD marking; **nie** unieważniają LF/SC (A2-05: dziś zmiana nastawy unieważnia rozpływ). Bieg zabezpieczeń cytuje `settings_revision`; stary bieg po zmianie nastaw = OUTDATED (A4-15).

---

## 9. Los dzisiejszych ścieżek (P1–P13 z A4 §2.1)

| Ścieżka | Los |
|---|---|
| P1 `protection_engine_v1` → `execute_run_protection` → overlay/ResultSet v1 (PR-26…31, ~2,5 kLOC + 5 plików testów) | DELETE (0 wywołujących; `protection-overlay` zasilić z projekcji, jeśli potrzebny) |
| P2 `protection_analysis` (P15a) + P13 porównania | REPLACE: bieg `CoordinationVerdict` na modelu; A/B = porównanie dwóch biegów jednego rejestru |
| P3 E-28 (`coordination/analyzer.py`) | KEEP algorytm → `TccProjection`/`CoordinationVerdict`; wejście z modelu; `request.devices` tylko jako override scenariusza |
| P4 overcurrent v0 | REPLACE fizyką solvera; scalić z P5 |
| P5 `protection_settings` (Hoppel) + `pakiet_nastaw` | KEEP → `SettingsProposal` |
| P6 `line_overcurrent_setting` (1800 LOC, tylko wzorzec) | scalić z P5 (ta sama metodyka I>>) |
| P7 `czas_wylaczenia_galezi/pola` | KEEP → rdzeń `trace_protection` |
| P8 `validate_selectivity`, `_compute_tcc_curve`, `_compute_tcc_point`, `IEC_CURVES` w domain ops | DELETE (zepsuta; usunąć z rejestru operacji) |
| P9 `protection_read_model` + sanity + base_values | KEEP (projekcja) |
| P10 nN: fault_loop → swz → nn_device_selection / nn_circuit_sheet | KEEP; SWZ per odcinek po trace |
| P11 `ochrona_lom` | KEEP; SPZ z modelu |
| P12 `analysis/protection_curves_it` + `protection_insight` | REPLACE przez `TccProjection` (bez własnej trasy API dziś) |
| `protection_report_model.py` (0 konsumentów), `api/protection_analysis_runs.py` (5 linii), `element-assignment.ts` „nie zaimplementowany", `solver_input` PROTECTION stub, `no_module` ×6 w checkerze RfG | DELETE / zastąpić realnym dostawcą |
| `docs/protection/PROTECTION_SYSTEM_CANONICAL.md` (BINDING, wskazuje legacy `CTRatio`) | ARCHIWUM; zastępuje ten dokument po zatwierdzeniu |

---

## 10. Testy (iloczyn cech) i guardy

- Fizyka: tożsamość numeryczna 5→1 (krzywa × TMS × M) przed kasacją duplikatów; test sektora kierunkowego (kąt × polaryzacja × typ sieci: izolowana/kompensowana/rezystorowa).
- Model: „zapis nastawy ⇒ zmiana TCC ∧ protection-view ∧ czas_wylaczenia ∧ karta nastaw" w jednym teście (predykaty parami); „pole bez IED ⇒ stan zerowy"; „IED z 50BF ⇒ `breaker_failure_enabled=True`".
- Trace: {promieniowa, pierścień NO, 2 źródła} × {CB, recloser, FUSE VV, MCB, gG, MCCB} × {local, backup} × {SN, nN}.
- Koordynacja: {relay–relay, relay–recloser, relay–fuse, fuse–fuse, MCB–MCCB} × {czasowa, prądowa, energetyczna} × {dane pełne, brak tabel ⇒ nierozstrzygalne}.
- Inwalidacja: zmiana nastawy × {LF, SC, koordynacja, trace, arc flash, karta} — dokładnie oczekiwany zbiór OUTDATED.
- Guardy: `solver_boundary_guard` (PR-01), `canonical_ops_guard` bez „disabled ops", `dead_click_guard` obejmujący `modalDispatcher.ts`, test parytetu „funkcje w dokumencie == enum w modelu".

---

## 11. Decyzje wymagające właściciela

| ID | Decyzja | Rekomendacja |
|---|---|---|
| PZ-01 | Nastawy: model (IED, grupy) + przypadek wybiera grupę/override — zdjęcie blokady V11 `relay.legacy_write_disabled` i rewizja Core Rule #4 | tak (hybryda zgodna z PowerFactory) |
| PZ-02 | FUSE (rozłącznik bezpiecznikowy SN VV, wkładki nN) jako aparat wyłączający w trace i czasie wyłączenia | tak |
| PZ-03 | Konwencja kierunkowości dla OSD (67N: sin φ / cos φ; admitancyjne Y0/G0/B0) w profilu domyślnym | profil per OSD w katalogu; domyślnie admitancyjne + sin φ dla sieci kompensowanych |
| PZ-04 | Granulacja trip matrix: stopień→aparat; CBF do wszystkich aparatów zasilających szynę | stopień→aparat; CBF: aparaty zasilające szynę (typowe wymaganie OSD dla GPZ) |
| PZ-05 | Dane normowe (Tab. 41.1, t-I gG) i tabele selektywności producentów — zakup/pozyskanie | zakup normy + tabele producentów; do czasu „nierozstrzygalne" |
| PZ-06 | Kanoniczny katalog IED: jeden, z realnymi kartami; natychmiastowe usunięcie nazw „ABB REX-100…" z UI | tak, natychmiast (fabrykacja pod marką) |
| PZ-07 | Zakres wersji 1 funkcji ANSI | **ROZSTRZYGNIĘTE przez właściciela (D-34): zakres deklarowany, nie wyłączany.** `ProtectionCapabilityRegistry` ze stanami SUPPORTED / PARTIAL / PLANNED / NOT_IMPLEMENTED (§5a); zero regresji funkcjonalnej; 21/21N, 64, 87BB startują jako `PLANNED` z jawnym statusem w UI |
| PZ-08 | SWZ na kanwie nN per odcinek (po trace) zamiast per odpływ | per odcinek |
| PZ-09 | Jednostka zakresów nastaw w szablonach (pierwotne/wtórne) — ustalić i oznaczyć | zakresy z katalogu IED w jednostkach wtórnych + podstawa jawna |
| PZ-10 | Pola runtime read-modelu (stan łączności, komendy, pomiary) — tylko w profilu eksploatacyjnym (warstwa OPERATIONAL/MEASUREMENT), nie w modelu projektowym | tak |
