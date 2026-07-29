# PROMPT RUNDY: Dokończenie łańcucha DER/maszyn + kolejne ogniwa (opcja MAX)

**Status:** BINDING (prompt kontynuacji; dyrektywa właściciela 2026-07-19:
„zaprojektuj następny prompt kontynuacji i wykonaj bez zatrzymywania").
**Rejestr:** V12K-055 (runda kontynuacyjna po G-SCM F1/F2).
**Poprzednie rundy:** `PROMPT_RUNDA_AUDYT_MAX_2026-07.md`,
`PLAN_SC_MASZYNY_DER_2026-07.md` (G-SCM), `BLUEPRINT_PROJEKTANT_SIECI_MAX_2026-07.md`.

---

## 0. Zasady nadrzędne (przypomnienie — obowiązują łącznie)

1. **Wizja end-to-end, do ostatniego klika, wielowarstwowo** (kontrakt danych → katalog
   → operacja domenowa → API → ENM/Snapshot → SLD → solver → analiza → zabezpieczenia →
   raport → zgodność). Buduj ogniwo łańcucha, nie wyspę.
2. **Phantom rule w obie strony:** kontrolka UI bez pola backendu = phantom; realna
   zdolność backendu bez punktu wejścia = też defekt. ZERO fizyki w UI (liczba z solvera).
3. **Zero-Debt:** każdy wykryty defekt/dług naprawiasz end-to-end od razu; wykluczenie ≠
   naprawa; test maskujący defekt = dwa defekty (napraw oba, realna ścieżka).
4. **Hunt forward-phantomów** = najwyższa wartość (zdolność backendu niekonsumowana w
   kanonicznym przepływie). Weryfikuj empirycznie PRZED twierdzeniem (lekcja GAP-OZE-1).
5. **Determinizm i FROZEN:** pola addytywne (`exclude_none`), seed/hash istniejących
   payloadów bez zmian; solver SC WATCHED nietknięty; nowa fizyka tylko w solverach (WHITE BOX).
6. **Weryfikacja przed scaleniem:** pełna regresja właściwej warstwy (backend pytest /
   frontend vitest), type-check/lint, właściwe guardy, determinizm/hash. Kody wyjścia
   łapane bezpośrednio (nie przez pipe). Commit + push na `claude/power-network-design-ui-ir91mv`.
7. **Autonomia:** dziel na fazy, buduj, weryfikuj, commituj, pushuj bez pytania. Wyjątek:
   realne rozstrzygnięcia produktowe → AskUserQuestion (jak Opcja A dla G-SCM F2).

---

## 1. Stan wejściowy rundy (fakty)

- **G-SCM F1 (wdrożone, V12K-054):** `map_enm_to_network_graph` buduje źródła SC z
  `enm.generators` (InverterSource / Synchronous / Asynchronous). Całkowite I″k z wkładem
  DER poprawne i konsumowane wszędzie.
- **G-SCM F2 (wdrożone, Opcja A):** `SC3FProofPack` + `POST /api/proof/sc3f/pack` —
  pierwszy pakiet dowodowy 3F, fizyka serwerowa, rozbicie maszynowe μ/q/i_b dla maszyn
  wirujących.
- **Odkryty defekt walidacji (F-follow-1, poniżej):** `add_genset_nn`/`add_ups_nn`
  zapisują `gen_type="GENSET"`/`"UPS"` (wielkie litery) — **model `Generator` je ODRZUCA**
  → agregaty/UPS dziś NIE przechodzą walidacji ENM. To blokuje cały łańcuch maszyn
  wirujących (SC synchroniczny + rozbicie μ/q/i_b) dla agregatów.
- Blueprint: pozostałe kreatory do przebudowy (G-STA, G-RING, G-ODG, G-ZKSN, G-POLE,
  G-POM, G-ZAB, G-OZE-UI) — rejestr w `KREATORY_STANDARD_2026-07.md`.

---

## 2. Kolejność wykonania rundy (fazy + DoD)

### KROK 1 — G-SCM F-follow-1: normalizacja gen_type agregatu/UPS (defekt walidacji)
**Cel:** agregaty/UPS przechodzą walidację ENM i wpinają się w łańcuch SC maszyn wirujących.
- `add_genset_nn`: `gen_type="synchronous"` (nie „GENSET"); dołóż tabliczkę SC do
  `materialized_params` (`sn_mva=P/cosφ`, `un_kv`=napięcie szyny, `xd_subtransient_pu`,
  `cos_phi`) — z jawnymi wartościami z payloadu/kreatora lub domyślnymi IEC (udokumentuj).
- `add_ups_nn`: rozstrzygnięcie modelowe — UPS jako `gen_type` akceptowany przez model
  (np. „bess"/inwerter — UPS to źródło przekształtnikowe) LUB pominięcie w SC z jawnym
  komentarzem. Jeśli akceptowalny gen_type nie istnieje → NIE zmyślaj; udokumentuj i
  rozważ rozszerzenie enum (osobny, przetestowany krok) — to może być AskUserQuestion.
- **Weryfikacja:** test — agregat z `add_genset_nn` → waliduje się w ENM → F1 buduje
  SynchronousMachineSource → SC ma wkład agregatu → F2 proof ma sekcję μ/q/i_b.
  Determinizm: istniejące payloady bez tabliczki → domyślne IEC, brak zmiany dla sieci
  bez agregatów. Pełna regresja backendu.

### KROK 2 — G-SCM F3: sekcja downstream w kreatorach (do ostatniego klika)
- Kreator OZE (`AddConverterSourceForm`/przyszły `KreatorZrodlaOze`) i kreator agregatu:
  sekcja „Co to uruchamia" wymienia wpływ na zwarcie (udział w I″k, dobór aparatury,
  pakiet dowodowy 3F). Tekst kierunkowy, ZERO fizyki w UI. Guardy UI zielone.

### KROK 3 — Kolejne ogniwo blueprintu (wybierz wg bólu inżyniera / forward-phantom)
- Preferencja: faza z realnym forward-phantomem lub najczęściej używany kreator
  (`add_sn_bay` G-POLE / `insert_station_on_segment_sn` G-STA / `add_nn_outgoing_field`).
- Recon PRZED budową: kontrakt operacji + konsumenci downstream + czy istnieje phantom.
- Kreator ui2 wg `KREATORY_STANDARD_2026-07.md`; retire legacy; testy realnej ścieżki.

#### Stan wykonania KROK 3 (2026-07-19)
- ✅ **G-RING (V12K-056)** wdrożone: `KreatorPierscienia` zastąpił `ConnectRingForm`
  (2 kroki: connect_secondary_ring_sn → set_normal_open_point). Retire + regresja 9013/0.

#### Kolejka pozostałych kreatorów (recon rozmiarów + sprzężeń — dla następnej rundy)
Legacy self-contained (pełne pola inline, NIE cienkie wrappery) — port = reimplementacja
pól na `kreatory/rama` + wierne odwzorowanie logiki. **Uwaga: kreatory branch-point mają
sprzężenie z nawigacją SLD** (`branchPointSelectionFromMaterialization`,
`centerSldOnElement`, `openRouteSurface` E-14) — port wymaga wiernego odwzorowania tej
integracji (osobna, staranna jednostka, nie pośpiech na końcu maratonu):

| Kreator legacy | w. | Operacja | Uwagi portu |
|---|---|---|---|
| `InsertZksnForm` | 368 | `insert_zksn_on_segment_sn` | katalog `mv_branch_points`, wariant 1/2-port, cable-only, ratio; **sprzężenie SLD-nav** |
| `InsertBranchPoleForm` | 360 | `insert_branch_pole_on_segment_sn` | słup rozgałęźny (linia napow.); **sprzężenie SLD-nav** |
| `StartBranchForm` | 529 | `start_branch_segment_sn` | start odgałęzienia, segment-katalog jak G-MAG |
| `AddSnBayForm` | 491 | `add_sn_bay` | pole SN, switchgear/bay_template (G-POLE, wysoka częstość) |
| `AddNnOutgoingFieldForm` | 321 | `add_nn_outgoing_field` | odpływ nN, R1 ΔU |
| `AddDispatchableSourceForm` | 267 | `add_genset_nn`/`add_ups_nn` | **wrapper nad GensetModal/UPSModal** (reużywane); backend już naprawiony (F-follow-1) — dostarczy F3 downstream SC |
| `AddConverterSourceForm` | 1365 | `add_converter_source` | **flagowy OZE** (G-OZE-UI); audyt V12K-051 gotowy; dostarcza F3 downstream SC |
| `InsertStationForm` | 1884 | `insert_station_on_segment_sn` | **flagowy** (G-STA) |
| `AddRelayForm`/`AddMeasurementForm` | 348/396 | relay/CT/VT | G-ZAB/G-POM |

**F-follow-2 (dług DER, jawny):** katalog x″d/k_sc (agregat/przekształtnik) zamiast
domyślnych IEC; DFIG Typ3 vs Typ4; klasyfikacja UPS w raportach; silniki-odbiory §6.7.

**DoD każdej fazy:** kod + testy realnej ścieżki; type-check/lint; właściwe guardy;
pełna regresja warstwy; determinizm/hash; rejestr V12K + aktualizacja planu; commit + push.

---

## 3. Bramki zamknięcia rundy
- Wszystkie fazy rundy scalone i wypchnięte; rejestr konfliktów zaktualizowany.
- Backend: `poetry run pytest -q` = 0 failed. Frontend (jeśli dotknięty): `npm run test:ci`
  = 0 failed, type-check + guardy UI zielone.
- Brak nowego długu (mypy/guard) wprowadzonego przez rundę; znaleziska uboczne
  udokumentowane („nigdy cicho").
