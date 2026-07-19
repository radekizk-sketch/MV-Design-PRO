# STANDARD KREATORÓW ui2 — 2026-07 (WIĄŻĄCY)

**Status:** BINDING · **Właściciel:** Fable (zarządca) · **Data:** 2026-07-18
**Podstawa:** dyrektywa właściciela „Dodaj źródło zasilania i całe kreatory zrób
od nowa, opcja max" (2026-07-18); FLOW_PROJEKTANTA_2026-07 §0.3 (kontrakt ekranu
prowadzącego); Program UI/UX 2026-07. Rejestr konfliktów: V12K-042.

## 0. Cel i zasada nadrzędna

Wszystkie kreatory budowy sieci (dodawanie/edycja elementów modelu przez
operacje domenowe) są przebudowywane od zera na **wspólnym frameworku ui2**
(`frontend/src/ui2/kreatory/rama`), tokenami `--mvd-*`, w obu motywach.
Stare formularze `frontend/src/ui/network-build/forms/**` (klasy `scada-*` i
twarde heksy `#050810`, `#00e5ff`, …) NIE są kanoniczne — były źródłem
„kolorowego bałaganu" zgłoszonego przez właściciela. Każdy kreator jest
podmieniany metodą Opcja 1 (podmiana dostawcy w `operationFormRegistry`),
kontrakt operacji domenowej pozostaje bez zmian, a legacy jest retirowany
(usunięcie sierot + przeniesienie intencji testów).

## 1. Framework (`ui2/kreatory/rama`)

Reużywalne prymitywy — jedyne dozwolone budulce nowych kreatorów:

| Element | Rola |
|---|---|
| `KreatorRama` | Rama prowadząca: nagłówek (eyebrow · tytuł · **cel jednym zdaniem** · odznaka · opcjonalny pasek kroków) → ciało → stopka (walidacja + akcje). |
| `KreatorSekcja` / `KreatorInfo` / `KreatorSiatka` | Sekcja z tytułem · pasek objaśnienia · responsywna siatka pól (1/2/3 kol., zwija się na wąskim panelu). |
| `PoleTekstowe`, `PoleLiczbowe`, `PoleWyboru`, `PolePrzelacznik`, `PolePrzelacznikBinarny`, `PoleKatalogu` | Pola: każde niesie widoczną **pomoc** (po co / z czego / co daje), błąd i stan wymagalności. `PoleKatalogu` prezentuje status pobrania i uczciwy błąd katalogu (katalog-first). |
| `RzadWartosci`, `KreatorPodsumowanie`, `KreatorGotowosc`, `KreatorNastepnyKrok` | Wartość read-only · podsumowanie **liczone przez backend** · lista gotowości (kompletne/ostrzeżenie/brak) · sekcja jawnego następnego kroku. |

Model wspólny (`rama/model.ts`): `OpcjaWyboru`, `StanGotowosci`,
`WierszGotowosci`, `BladPola`, `StatusPobrania`, `KrokKreatora`.

## 2. Kontrakt kreatora prowadzącego (obowiązkowy)

Każdy kreator MUSI (FLOW §0.3):
1. **Cel jednym zdaniem** w nagłówku — po co ten element, z czego liczy, co daje.
2. **Katalog-first** — parametry z katalogu, nie z ręcznego wpisu; ręczne
   wartości tylko w strefie eksperckiej i tylko gdy kanon operacji na to pozwala.
3. **Uczciwe stany** — braki jako „nie skonfigurowano"/„do konfiguracji", nigdy
   udawane wartości; podsumowania liczbowe wyłącznie z backendu (ZERO fizyki w UI).
4. **Lista gotowości** — kontrola kompletności danych wejściowych przed zapisem.
5. **Jawny następny krok** — co inżynier robi po zapisaniu (kolejny etap flow).
6. **Język inżynierski PL** — bez surowych identyfikatorów kodowych w strefie
   pierwszoplanowej (guard `ui_terminology_guard` na `ui2/**`).

## 3. Procedura przebudowy pojedynczego kreatora (Opcja 1)

1. RECON: legacy form + shared editor + payload operacji domenowej (kontrakt).
2. Wyodrębnij CZYSTĄ logikę (walidacja, payload, podgląd, gotowość, formatery,
   katalog) do `zrodloModel`-podobnego modułu — **kontrakt bez zmian**.
3. Zbuduj ekran na frameworku (`KreatorRama` + sekcje + pola).
4. Podmień dostawcę: `operationFormRegistry[<op>] = <NowyKreator>`; zaktualizuj
   `componentName` w `operationSurfaceRegistry` (metadana).
5. Retiruj legacy: usuń formularz + shared editor + osierocone testy; **przenieś
   intencję** do testów czystego modelu + testu realnej ścieżki (Zero-Debt §5).
6. Bramki: type-check; lint; PEŁNY vitest ZERO failed; `ui_no_physics_guard`,
   `ui_terminology_guard`, `forbidden_ui_terms_guard`, `utf8_mojibake_guard`,
   `dead_click_guard`, `v12xx_canon_guard`, `guard:codenames` = 0.
7. Zrzuty oba motywy → strona oceny.

## 4. Rejestr realizacji

| Operacja domenowa | Kreator ui2 | Status |
|---|---|---|
| `add_grid_source_sn` | `KreatorZrodloZasilania` (`ui2/kreatory/zrodlo`) | ✅ flagowy — framework + retirement `AddGridSourceForm`/`GridSourceEditor` |
| `add_sn_bay` | `AddSnBayForm` (legacy) | do przebudowy |
| `add_transformer_sn_nn` | `AddTransformerForm` (legacy) | do przebudowy |
| `add_converter_source` | `AddConverterSourceForm` (legacy, 1365 w.) | do przebudowy |
| `add_nn_load` | `AddNnLoadForm` (legacy) | do przebudowy |
| `add_nn_outgoing_field` | `AddNnOutgoingFieldForm` (legacy) | do przebudowy |
| `add_genset_nn` / `add_ups_nn` | `AddDispatchableSourceForm` (legacy) | do przebudowy |
| `add_relay` | `AddRelayForm` (legacy) | do przebudowy |
| `add_ct` / `add_vt` | `AddMeasurementForm` (legacy) | do przebudowy |
| `continue_trunk_segment_sn` | `KreatorMagistralaSn` (ui2, kreatory/rama) | ✅ przebudowane (V12K-047, G-MAG) |
| `insert_station_on_segment_sn` | `InsertStationForm` (legacy, 1884 w.) | do przebudowy |
| `start_branch_segment_sn` | `StartBranchForm` (legacy) | do przebudowy |
| `insert_section_switch_sn` | `KreatorLacznikaSekcyjnego` (ui2, kreatory/rama) | ✅ przebudowane (V12K-053, G-SEK) |
| `connect_secondary_ring_sn` / `set_normal_open_point` | `ConnectRingForm` (legacy) | do przebudowy |
| `insert_branch_pole_on_segment_sn` | `InsertBranchPoleForm` (legacy) | do przebudowy |
| `insert_zksn_on_segment_sn` | `InsertZksnForm` (legacy) | do przebudowy |
| `assign_catalog_to_element` | `AssignCatalogForm` (legacy) | do przebudowy |
| `update_element_parameters` | `UpdateElementParametersForm` (legacy) | do przebudowy |

**Priorytet dalszej przebudowy** (wg bólu inżyniera / częstości użycia):
`add_transformer_sn_nn` → `add_sn_bay` → `add_converter_source` →
`add_nn_load` → `insert_station_on_segment_sn` → reszta segmentów/aparatów.
Prace mechaniczne (port na framework) mogą iść kartami do wykonawców;
framework, flagowiec i ten standard są robotą zarządcy (opcja max).
