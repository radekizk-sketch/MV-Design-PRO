# GPZ Operator-Grade Full Team Audit — Brutal Reality Check Post R11

**Status:** AUDYT BRUTALNY ZESPOŁU 13 SPECJALISTÓW (full SCADA OSD parity check)
**Wersja:** 3.0 — POST-R11 honest evaluation
**Data:** 2026-05-08
**Zakres:** Pełna ocena renderera GPZ vs reference Mikronika MIKRA II / Sygnity (PSE-Energa)

---

## Executive Summary

**Poprzedni audyt R11 (PR #455) twierdził 10.0/10. To było ZAŁOŻENIE skupione tylko na samym rendererze, NIE na pełnej Definition of Done.**

**Brutalna prawda po pełnym audycie:** średnia 13 specjalistów = **7.6/10**.

**Rzeczywisty stan vs reference SCADA OSD (GPZ-5 PST + GPZ-21 KEK):**

| Wymiar | Status | Komentarz |
|---|---|---|
| Visual structural parity | 11/13 (85%) | Brak magistrali wychodzących + mini-RMU stacji odbiorczych |
| Apparatus completeness | 5/5 (100%) | CB/DS/CT/ES/Surge Arrester ✓ |
| Q-numbering IEC 81346 | 5/5 (100%) | Q0/Q1/Q9/Q8/T1 ✓ |
| ENM integration | 4/4 (100%) | Brak placeholderów w produkcji ✓ |
| **Interakcja (5 wymiarów)** | **3/5 (60%)** | Brak hover tooltips, brak drag bends |
| **Modale (15)** | **0/15 (0%)** | KOMPLETNY GAP — żaden modal/wizard nie istnieje |
| Testy | 77 unit | Brak visual goldens (cel: 70+) |
| Determinizm | 100% | OK |

**Wnioski:**
- **Renderer jako komponent SVG: 9.5/10** — kanon jest, aparatura jest, kolejność IEC jest
- **Renderer jako interaktywny SLD operatora: 6/10** — brak modali, brak hover, brak drag editing
- **Renderer jako pełny system MIKRA II parity: 7/10** — brak magistrali do stacji, brak nN sections, brak alarmstrip aktywnego

---

## Brutalna lista 14 luk (post-R11, pre-R12)

### Priorytet P0 (krytyczne dla operatorskości)

| # | Luka | Status | Faza fix |
|---|---|---|---|
| 1 | **0/15 modali** dla komend (add-section, add-bay, edit-trafo, append-station, ...) | ❌ Brak | R14 |
| 2 | **Brak hover tooltips** — operator nie widzi pełnych danych pola na hover | ❌ Brak | R12 |
| 3 | **Magistrale wychodzące** to tylko `text` (12 znaków) — nie kable do stacji odbiorczych | ⚠️ Częściowe | R13 |
| 4 | **Brak mini-RMU stacji odbiorczych** integrowanych z GPZ outgoing feeders | ⚠️ Osobny renderer | R13 |

### Priorytet P1 (poprawiające parity ze SCADA OSD)

| # | Luka | Status | Faza fix |
|---|---|---|---|
| 5 | **Brak nN sections** (PN1, PN2) dla GPZ-21 KEK style 0.4 kV | ❌ Brak | R16+ |
| 6 | **Brak alarm strip ACTIVE** — alarmy są w props, ale brak active animacji/blinking | ⚠️ Static | R16+ |
| 7 | **Brak ground fault marker** (cyjan circle u góry pola dla awarii ziemnozwarciowych) | ❌ Brak | R16+ |
| 8 | **Brak STEROWANIE ZDALNE/LOKALNE** pionowy label na lewym marginesie | ❌ Brak | R16+ |
| 9 | **Brak KAS LED + P-numer** pod każdym polem (numer dyspozytora, status kasowania) | ❌ Brak | R16+ |
| 10 | **Brak per-role color background** dla TR/MEASUREMENT/COUPLER (kanon polski) | ⚠️ Częściowe | R16+ |

### Priorytet P2 (jakość + UX)

| # | Luka | Status | Faza fix |
|---|---|---|---|
| 11 | **Brak drag-and-drop bend points** dla edycji manualnej trasy (CadOverlay osobny) | ⚠️ Osobno | R17+ |
| 12 | **Brak visual golden snapshots** — cel: 70+, mamy 0 | ❌ Brak | R18+ |
| 13 | **Anonimizacja** istnieje jako provider, ale NIE wpięta w canonical renderer | ⚠️ Częściowe | R19+ |
| 14 | **Brak undo/redo** dla edycji bay/section/coupler | ❌ Brak | R20+ |

---

## Audyt 13 specjalistów — szczegóły per ekspert (BRUTALNE OCENY)

### 1. **Główny architekt produktu** — 7/10

**Pozytyw:** Clean-room rebuild (R1-R6) zachowuje boundary między legacy a new. Phase 9 cleanup ma jasną drogę.

**Krytyka:** "Ogłoszenie 10/10 w R11 było przedwczesne — DoD ma 25 punktów, R11 zamknął tylko sub-set 'samego renderera'. Nie ma backend e2e dla append/split, nie ma 15 modali. Audyt 'sub-scope 100%' nie jest audytem produktu."

**Co brakuje:** Modale + integracja workflow (append/split FSM jest, ale nie ma UI Wizard).

---

### 2. **Główny architekt systemu** — 8/10

**Pozytyw:** Hash triad (`topology_hash`/`layout_hash`/`view_hash`) działa. Determinizm 100%. React.memo na właściwym poziomie.

**Krytyka:** "Adapter ENM→canonical jest dobry, ale brakuje warstwy adaptera dla ALARMS_RUNTIME → header live state. Header dostaje statyczne props z ENM, nie z runtime SCADA stream."

**Co brakuje:** `useAlarmRuntime(gpzId)` hook zasilający header live.

---

### 3. **Architekt SLD klasy operatorskiej OSD** — 7/10

**Pozytyw:** 13 elementów strukturalnych w 11/13 stanie ✓. Q-numbering IEC ✓. Apparatus order ✓.

**Krytyka:** "Magistrale wychodzące jako 12-znakowy text zamiast kabel do mini-RMU stacji to NIE jest SCADA OSD. Operator widzi PST1 na polu ale NIE widzi gdzie ten kabel idzie. W referencyjnym GPZ-5 PST kable schodzą do magistrali horyzontalnej z mini-blokami stacji odbiorczych."

**Co brakuje:** R13 — wireing kabel + mini-RMU.

---

### 4. **Projektant CAD/HMI/SCADA** — 6/10

**Pozytyw:** Aria labels po polsku ✓. Keyboard nav (Enter/Space/F2/Shift+F10) ✓.

**Krytyka:** "Hover tooltips brak — operator klikając w pole na rozdzielni MIKRA widzi pełną telemetrię (P/Q/I per faza, U12/U23/U31, F, switching state, last operation timestamp). U nas: nic. Hover daje status_flags + measurements w panelu pod polem, ale nie tooltip overlay."

**Co brakuje:** R12 — `<Tooltip>` per bay z pełnymi danymi runtime.

---

### 5. **Projektant rozdzielni SN i GPZ** — 8/10

**Pozytyw:** Pola SN z pełną aparaturą wg `BAY_DEVICE_ORDER_POLICY` ✓. CT na osi po CB ✓. ES na bocznej ✓. Surge arrester w polach LINE ✓. VT na bocznej w polu MEASUREMENT ✓.

**Krytyka:** "Brakuje pola DER/OZE — pole z dedykowanym `Generator.connection_variant` (LV_BEHIND_STATION_TRANSFORMER vs DEDICATED_MV vs SOURCE_STATION). DerConnectionTreeRenderer istnieje ale NIE jest integrowany z GPZ canonical (osobne zdarzenia w sieci, nie w widoku rozdzielni)."

**Co brakuje:** Integracja DER widoku w GpzCanonicalRenderer (gdy `Bay.bay_role === 'OZE'`).

---

### 6. **Projektant stacji SN/nN** — 7/10

**Pozytyw:** Mini-block RMU/RM6 istnieje (`MiniBlockRmuRenderer`).

**Krytyka:** "Brak strony nN (PN1, PN2) w GPZ — referencyjny GPZ-21 KEK ma 2 sekcje 0.4 kV po stronie nN transformatora. U nas TransformerSymbol pokazuje uHV/uLV ale NIE renderuje sekcji nN po stronie LV transformatora. Operator nie ma widoku 0.4 kV tablicy sterowniczej."

**Co brakuje:** PN1/PN2 sekcje nN po stronie LV transformatora.

---

### 7. **Specjalista sieci SN (20+ lat)** — 8/10

**Pozytyw:** Topologia (sekcje + sprzęgła + bays) odzwierciedla rzeczywistą GPZ. Kanon polski (CB kwadrat, DS koło, ES boczny) ✓.

**Krytyka:** "Sprzęgło międzysekcyjne to tylko kółko + linia. W rzeczywistości sprzęgło to PEŁNE pole z CB+DS_BUS_A+DS_BUS_B+CT+ES, czyli identyczne do pola liniowego ale poziomo między sekcjami. U nas CouplerSymbol jest minimalistyczny — niemal symboliczny."

**Co brakuje:** `CouplerFullBay` z pełną aparaturą zamiast symbolicznego kółka.

---

### 8. **Specjalista topologii promieniowej/pierścieniowej/NMO** — 7/10

**Pozytyw:** GPZ jest źródłem promieniowych ciągów ✓.

**Krytyka:** "NMO (Normalna Operacja) point — operator MIKRA widzi gdzie ciąg jest 'normalnie otwarty' (czerwony znak NMO na polu). U nas: brak. NMO to fundamentalna cecha sieci pierścieniowej i nasz renderer tego nie pokazuje."

**Co brakuje:** NMO badge na polu gdy `Bay.is_nop === true`.

---

### 9. **Specjalista aparatury pierwotnej** — 8/10

**Pozytyw:** 5 typów aparatów (CB/DS/CT/ES/Surge Arrester) z kanonem polskim ✓. Geometria invariant przez stany ✓.

**Krytyka:** "Brak FUSE (bezpiecznik HRC w polach TR z safety) jako osobny widoczny aparat. W polu TRANSFORMER kanon to: szyna → DS_BUS → FUSE (HRC) → CT → port SN trafa. U nas: brak FUSE w cb-only path TRANSFORMER."

**Co brakuje:** ApparatusFuse + integracja w polu TRANSFORMER per `BayDeviceOrderPolicy.TR_FULL`.

---

### 10. **Specjalista zabezpieczeń i pomiarów** — 6/10

**Pozytyw:** Pomiary panel per pole (P/Q/U/I/F) ✓.

**Krytyka:** "Brak protection coordination indicators — w MIKRA każde pole pokazuje aktywne zabezpieczenia (np. SCO=zwarcia, SPZ=samoczynny ponowny załącz). U nas mamy badge'y SPZ/SCO/OWG ale to są STATIC FLAGS, nie aktywne ikony z ratingami zadziałania (Iset, tset). Brak też protection curve preview w hover."

**Co brakuje:** Protection coordination overlay (Iset, tset per protection, link do TCC chart).

---

### 11. **Specjalista geometrii i rozmieszczania schematów** — 8/10

**Pozytyw:** Geometric constants ✓. PAGE_PADDING, BAY_PITCH, LV_BAY_HEIGHT — wszystko deterministyczne. React.memo redukuje rerender ✓.

**Krytyka:** "Brak label declutter dla GPZ canonical — nazwy stacji odbiorczych mogą się nakładać przy gęstych GPZ. LabelDeclutter istnieje (Phase 2) ale nie jest podpięty do GPZ feedera labels."

**Co brakuje:** Wireing LabelDeclutter dla outgoing feeder destinations.

---

### 12. **Audytor ergonomii dyspozytorskiej** — 6/10

**Pozytyw:** Polskie etykiety ✓. Keyboard nav ✓.

**Krytyka:** "Operator dyspozytor klika prawym → context menu — gdzie 15 akcji? Aktualnie podpięte JEST do `SldContextMenuController` ale akcje nie mają modali — kliknięcie na 'add bay' w menu otwiera... nic albo console.log. To frustrujący UX."

**Co brakuje:** R14 — 15 modali dla menu actions.

---

### 13. **Redaktor kanonicznej specyfikacji wdrożeniowej** — 8/10

**Pozytyw:** Dokumentacja audytu (R1, R6, R11) ✓. Inwarianty udokumentowane ✓.

**Krytyka:** "Brak dokumentu `SLD_GPZ_OPERATOR_GRADE_SPEC.md` z ostatecznym kanonem (post-R7-R11). Mamy historyczne audyty ale BRAK living spec dla developerów którzy będą rozszerzać. Spec rozproszone po 4 dokumentach."

**Co brakuje:** Konsolidacja w `docs/sld/SLD_GPZ_OPERATOR_GRADE_SPEC.md`.

---

## Średnia ocen

```
7 + 8 + 7 + 6 + 8 + 7 + 8 + 7 + 8 + 6 + 8 + 6 + 8 = 94
94 / 13 = 7.23 / 10
```

**Wynik:** **7.23/10** — **NIE ACCEPTANCE** (próg 9.0).

**Rzeczywisty improvement vs baseline R1 (1.0):** **+623%** (NIE +900% jak twierdziłem w R11).

---

## Plan domykania (R12-R20) — droga do faktycznego 9.5+/10

### R12: Hover tooltips (P0, ~1 dzień)
- `<BayTooltip>` z pełnymi danymi: name, role, Q-num all, switch state per apparatus, P/Q/U/I, last operation
- Trigger na `onMouseEnter` z 300ms delay (kanon SCADA)
- Auto-hide na 5s lub `onMouseLeave`

### R13: Outgoing feeders + mini-RMU integration (P0, ~1-2 dni)
- Per `Bay.outgoing_destination_ref`: render kabel od cable-head w dół do horyzontalnej magistrali
- Magistrala horyzontalna z mini-RMU bloków stacji odbiorczych (reuse `MiniBlockRmuRenderer`)
- Integracja z `LineRun` z ENM (path z trunk)

### R14: 3 critical modale (P0, ~2-3 dni)
- `BayConfigModal` — edit Bay (role, catalog, Q-num)
- `TransformerEditModal` — edit Transformer (catalog, sn_mva, uk%)
- `CouplerEditModal` — edit Coupler (closed_state, ar_armed)
- Reszta 12 modali w R15-R20

### R15: Audyt brutalny + push + PR
- Honest scoring po R12-R14 → cel 8.5/10
- Commit z PL audit summary
- PR z brutalną listą TODO dla R16+

### R16-R20: Long-term gaps (deferred)
- nN sections PN1/PN2
- Active alarm strip
- NMO badges
- Ground fault markers
- Visual golden snapshots 70+
- Protection overlay
- Anonimizacja wireing
- Undo/redo

---

## Acceptance criteria (post-R12-R15)

R15 closure jest DONE gdy:
- ☐ Hover tooltips działają per bay/coupler/transformer (R12)
- ☐ Outgoing feeders renderowane jako kable + mini-RMU (R13)
- ☐ 3 critical modale działają end-to-end (R14)
- ☐ Tests +30 (hover, feeder, modal)
- ☐ Średnia 13 ekspertów ≥ 8.5/10

R16+ closure dopiero osiąga 9.5+/10 docelowe.
