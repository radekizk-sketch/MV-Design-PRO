# RAPORT AUDIT — iter K20-1 (baseline po seed-gn20.mjs)

**Data:** 2026-05-14
**Branch:** `claude/cleanup-documentation-sld-7zVRd`
**Commits:** e42bd72 (seeder) + 1adb144 (DER fix)
**Stan sieci:**
- 1 GPZ Główny 110/15 kV (2 sekcje)
- 20/20 stacje PASS (mix słupowe/kontenerowe/wnętrzowe)
- 8/20 DER PASS (PV nn_side OK, BESS/FW catalogs missing)
- 104 buses, 82 branches, 21 transformers
- is_radial=true

**Screenshots:** `full_K20_1920x1080.png`, `full_K20_4k.png`, `canvas_only_*.png`

---

## § 1  OCENY 7 SPECJALISTÓW

### S1 — Projektant sieci SN/WN (waga 0.20)
**Ocena: 4.5/10**

✅ Topology budowa K20 OK (20 stacji wpiętych w trunk SN)
✅ Sekcja 1 + Sekcja II GPZ widoczne
✅ Cable SN trunk wyprowadza się z LINE_OUT bay

❌ **NO-GO L1:** Layout 4×5 grid w prawym dolnym rogu — brak hierarchical
layout. Wszystkie 20 stacji upchnięte w klaster zamiast rozłożone
geograficznie wzdłuż trunk SN. Nie wygląda jak schemat sieci ENEA.

❌ **NO-GO L2:** Sekcja II nie ma własnego LINE_OUT bay/wyprowadzenia
(tylko Sekcja 1 ma trunk). Brak symetrii topologii.

⚠️ WARN L3: Brak ZKSN słupów (branch points) — wszystkie stacje inline.
Brak odgałęzień (BRANCH_1/BRANCH_2 ports).

⚠️ WARN L4: Brak Q9 sprzęg between sekcjami (sectional coupling breaker).

### S2 — Profesor energetyki (waga 0.15)
**Ocena: 5.0/10**

✅ Single NetworkModel singleton (PowerFactory rule)
✅ Catalog binding 100% (src/cable/tr catalogs OK)
✅ WHITE BOX foundation (trace store empty ale jest infrastructure)

❌ **NO-GO E1:** Brak load attachment — load_count=0. 14/20 stacji
deklaruje odbiór (bytowy/komunalny/przemysłowy/rolniczy) w STATION_CONFIGS
ale żaden load nie został dodany. Seeder pomija K11 load attachment.

⚠️ WARN E2: Generator_count=0 mimo 8 DER PASS w seeder log — possible
race condition w refreshFromBackend (snapshot przed DER persist).

### S3 — Specjalista OZE (waga 0.15)
**Ocena: 3.5/10**

✅ PV nN attachment działa (7 stacji × PV inverter)
✅ Connection variant nn_side OK
✅ DER badges visible w mini-block (kropki yellow/blue)

❌ **NO-GO O1:** BESS catalog brakuje — `conv-bess-sn-1mw-15kv` zwraca
empty error_code. Block transformer 15 kV path nieobsługiwany dla 5
stacji (S05/S12/S18 + S07/S14 nn).

❌ **NO-GO O2:** FW catalog brakuje — `conv-fw-sn-1mw-15kv` zwraca
empty error_code. DEDICATED_MV_CONNECTION nieobsługiwany dla 3 stacji
(S06/S13/S20).

❌ **NO-GO O3:** PV LV_BEHIND_STATION_TRANSFORMER + PV
SOURCE_CONNECTION_STATION zwraca `converter.connection_variant_missing`
— policy walidator odrzuca te warianty dla PV (S08/S10).

⚠️ WARN O4: Brak K11 setpoints (cos_phi, P, Q, limits) — DER bez params.

### S4 — Specjalista NC RFG (waga 0.10)
**Ocena: 4.0/10**

✅ ENEA enea.yaml profile nieuruchamiany w seederze (no fabrication)
✅ catalog references zgodne z `enea.yaml`-driven catalogs

❌ **NO-GO N1:** Brak operator_profile attribution per case — case config
zwraca `operator_profile_id":"enea"` ale brak walidacji że stacje są
zgodne z ENEA wymaganiami (S_n, P_n limits per typ).

⚠️ WARN N2: NC RFG kategorie A/B/C/D nie są przyporządkowane
(small/medium/large/huge generators) — wymagane do NC RFG compliance check.

### S5 — Inżynier zabezpieczeń (waga 0.15)
**Ocena: 2.5/10**

❌ **NO-GO P1:** Protection_count=0 — żaden bay nie ma protection_relay.
Brak SCO/SPZ/SZR/AAR badges. P0.2 ProtectionRunButton FE foundation
istnieje ale nie jest wired do K20 case.

❌ **NO-GO P2:** Brak IDMT curves (IEC 60255) — protection_settings
proof pack istnieje (backend) ale nie ma run dla K20.

❌ **NO-GO P3:** Brak Si-100 / Si-150 protection relays w katalogu
(plus stub removal P0.2 ~5 OD nie wykonane).

⚠️ WARN P4: Brak fault loop nN wizualizacji (P0.5 panel istnieje ale
nie wired per station).

### S6 — Specjalista schematów PN-EN 60617 (waga 0.15)
**Ocena: 5.5/10**

✅ Symbol library 32+ symboli (PN-EN 60617 partial)
✅ Wyłącznik (Q) kwadrat IEC OK
✅ Trafo SN/nN dwa okręgi widoczne
✅ Inverter PV okrąg + sinus

❌ **NO-GO S1:** Layout density za duża — 20 stacji upchnięte w grid
4×5, symbole < 24 px @ LOD-2 w klastrze. Naruszenie ETAP/DIgSILENT min
24 px symbol size.

❌ **NO-GO S2:** Brak galvanic chain continuity — cable runs widoczne ale
nie są port-based (start/end na PORT), tylko bus-to-bus. P0.3 LayoutEngine
port-based F2 (~25 OD architektoniczny rework) **NIE WYKONANE**.

⚠️ WARN S3: Etykiety pól (Q01, IN, OUT, TR) niewidoczne w klastrze
(za małe fonty, zlewają się).

### S7 — Audytor norm i certyfikacji (waga 0.10)
**Ocena: 6.0/10**

✅ Polish UI 100% — etykiety "Schemat 1: topologia", "Sekcja 1/II",
"Stacja inline", "GPZ 15 kV" — wszystkie po polsku
✅ Zero codenames — sprawdzone w transcript scr
✅ Determinism — backend hash stable
✅ Frozen API — brak naruszenia

❌ **NO-GO A1:** WHITE BOX trace overlay nie jest wired do mini-block
(brak markerów Z_loop, Y_pcc, Ik_min/max per station).

⚠️ WARN A2: 64+ guard scripts — brak weryfikacji po K20 build.

---

## § 2  OCENA AGREGOWANA

| # | Specjalista | Waga | Ocena | Wkład |
|---|------------|------|-------|-------|
| 1 | Projektant SN/WN | 0.20 | 4.5 | 0.90 |
| 2 | Prof. energetyki | 0.15 | 5.0 | 0.75 |
| 3 | OZE | 0.15 | 3.5 | 0.53 |
| 4 | NC RFG | 0.10 | 4.0 | 0.40 |
| 5 | Zabezpieczenia | 0.15 | 2.5 | 0.38 |
| 6 | Schematy PN-EN | 0.15 | 5.5 | 0.83 |
| 7 | Normy | 0.10 | 6.0 | 0.60 |
| **Σ** | | **1.00** | | **4.38 / 10** |

**Stan: 4.38/10** — improvement z 0/10 baseline (no model) do 4.38/10
(K20 topology built), ale daleko od 10/10 SCADA-CAD grade.

---

## § 3  KRYTYCZNE NO-GO (kolejność priorytetowa)

| # | Kod | Specjalista | Blocker | OD |
|---|-----|------------|---------|-----|
| 1 | L1 | Projektant | Layout 4×5 klaster — wymaga port-based hierarchical | 25 (P0.3) |
| 2 | S2 | Schematy | Galvanic chain — port-based edges | (część L1) |
| 3 | O1 | OZE | BESS catalog brakuje | 3 |
| 4 | O2 | OZE | FW catalog brakuje | 3 |
| 5 | P1 | Zabezpieczenia | Protection_count=0 — zero relays | 5 |
| 6 | E1 | Prof. | Loads niezatachalowane | 3 |
| 7 | O3 | OZE | PV LV_BEHIND_STATION / SOURCE_CONNECTION nieobsługiwane | 5 |
| 8 | L2 | Projektant | Sekcja II bez LINE_OUT | 2 |
| 9 | P3 | Zabezpieczenia | Si-100 protection_eligibility stub | 5 (P0.2) |
| 10 | A1 | Normy | WHITE BOX overlay niewired | 5 |

**Suma OD krytycznych: ~56 OD**

---

## § 4  WARN (do poprawy w kolejnych iter)

| # | Kod | Specjalista | Improvement |
|---|-----|------------|-------------|
| 1 | L3 | Projektant | Brak ZKSN słupów / branch points |
| 2 | L4 | Projektant | Brak Q9 sprzęg sectional |
| 3 | E2 | Prof. | Generator_count race condition |
| 4 | O4 | OZE | DER setpoints (cos_phi, P/Q limits) |
| 5 | N2 | NC RFG | Kategorie A/B/C/D nieprzyporządkowane |
| 6 | P4 | Zabezpieczenia | Fault loop nN per station |
| 7 | S3 | Schematy | Etykiety pól nieczytelne |
| 8 | A2 | Normy | Guard scripts weryfikacja po build |

---

## § 5  TODO NEXT ITERATION (K20-2)

1. **Add BESS/FW catalogs** (V12K-* conflict log or seed allowed catalogs)
2. **Add ZKSN słupy** (insert_zksn_on_segment_sn × 3–5 punktów)
3. **Add Q9 sprzęg** sectional coupling
4. **Add loads** per STATION_CONFIGS (K11 expand z bytowy/przemysłowy)
5. **Run protection per case** (kontynuacja P0.2 stub removal)
6. **Layout improvement** — częściowy LayoutEngine F2 (P0.3 partial)

**Trigger end-of-loop:** 7 specjalistów ≥ 9.5 przez **3 kolejne iter**.
**Status iter K20-1:** 4.38/10, **10 NO-GO** krytycznych. **Loop NIE zakończony.**

---

**Konkluzja:** Iter K20-1 ustabilizował K20 topology (20 stacji)
ale **NIE osiąga SCADA-CAD grade**. Foundation gotowa do dalszych
iteracji. Główny blocker: **P0.3 LayoutEngine port-based** (~25 OD).
