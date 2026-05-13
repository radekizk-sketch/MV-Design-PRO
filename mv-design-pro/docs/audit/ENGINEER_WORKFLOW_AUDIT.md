# ENGINEER_WORKFLOW_AUDIT — Audyt flow inżyniera

**Status:** AKTUALNY (audyt 2026-05-13)
**Wersja:** 1.0
**Data:** 2026-05-13
**Zakres:** End-to-end ścieżka projektanta sieci SN od „nowy projekt" do „raport PDF/DOCX".
**Powiązane:**
- `docs/sld/SLD_ENGINEER_WORKFLOW_END_TO_END.md` — docelowy flow 14-krokowy
- `docs/plan/PLAN_E2E_INDUSTRIAL_2026-05.md` § 2 — opis docelowego flow
- `docs/audit/AUDYT_BRAKI_2026-05.md` § 8 — dead clicks i luki UX

---

## 1. Aktualny flow vs. docelowy (mapping)

Numeracja kroków zgodna z `/goal` (14 kroków idealnego flow):

| # | Krok docelowy | Status w kodzie | Dead clicks / luki UX | Programistyczność |
|---|---------------|------------------|----------------------|-------------------|
| 1 | Start projektu | ✅ `POST /api/projects` + `ui/projects/` | brak | OK |
| 2 | Definicja GPZ / źródła zasilania | ⚠️ Częściowy | „Wybór typu GPZ" jest formularzem z 10 polami — programistyczne. Inżynier oczekuje wyboru z biblioteki vendor templates. | DUŻO programistyczności |
| 3a | Parametry zwarciowe — tryb uproszczony (S″k SN) | ❌ BRAK toggle uproszczone/zaawansowane | Operator zawsze musi wpisać 110 kV grid + TR + impedancje. Nawet dla prostego case'u SN. | DUŻO programistyczności |
| 3b | Parametry zwarciowe — tryb zaawansowany (110 kV + TR + GPZ) | ✅ wszystkie pola w wizardzie | OK | OK |
| 4 | Wybór standardów operatora (ENEA pierwsza) | ⚠️ YAML profile istnieją (`backend/src/catalog/profiles/nc_rfg/{enea,energa,pge,pse,tauron}.yaml`), ale brak UI selektora operatora na początku projektu | Operator wybierany dopiero przy DerConfigurator — za późno | LUKA |
| 5 | Wybór katalogowych typów kabli/linii | ✅ `CatalogBrowser` + `catalog/v1_spec` | OK | OK |
| 6 | Budowa magistrali SN | ⚠️ SLD edytor istnieje, ale brak intuicyjnego „extend trunk" tool | Trzeba kliknąć na end-point + wybrać „add line" z menu — 3 kliknięcia zamiast drag | LUKA UX |
| 7 | Wstawianie stacji na końcu odcinka albo split z preview/cancel/commit | ❌ Brak explicit split preview | Operacja split istnieje (`split_line`) ale bez preview. Po splicie nie ma cancel. | DUŻO programistyczności |
| 8 | Stacje przelotowe / odbiorowe / PV / BESS / FW | ✅ `StationConfigurator` (10 zakładek) | OK funkcjonalnie, ale 10 zakładek przytłacza | UMIARKOWANA programistyczność |
| 9 | Odgałęzienia / ZK SN / słupy rozgałęźne / NOP | ⚠️ NOP w `logical_views`, ZK SN symbol istnieje, ale brak narzędzia „add branch from existing trunk" | Trzeba ręcznie wymuszać orientation; ZK SN trudno dodać | LUKA UX |
| 10 | Obliczenia rozpływu mocy i zwarć | ✅ POST `/api/analysis-runs` + executeRun | OK | OK |
| 11 | Dobór i koordynacja zabezpieczeń | ⚠️ ⚠️ ⚠️ Protection Engine v1 istnieje ALE solver_input/eligibility.py:169 zwraca BLOKER „not implemented (stub)" | **DEAD CLICK** — przycisk Protection działa, ale eligibility check zawsze fail | KRYTYCZNE |
| 12 | Wizualizacja wyników na SLD | ⚠️ Overlay istnieje, ale wizualnie nieprzemysłowy | Patrz `SLD_VISUAL_QUALITY_AUDIT.md` § 3.1 (tor mocy nieczytelny) | UMIARKOWANA |
| 13 | Dowód obliczeń i raport | ✅ Proof Inspector + LaTeX + JSON + PDF | ⚠️ Brak DOCX export dla proof engine | LUKA |
| 14 | Eksport CAD/SCADA/report | ⚠️ ZIP project export OK; brak eksportu SLD do PDF/SVG/DXF | Patrz `SLD_VISUAL_QUALITY_AUDIT.md` § 2.5 | KRYTYCZNE |

---

## 2. Konkretne dead clicks (zinwentaryzowane)

| Lokalizacja | Akcja | Problem | Priorytet |
|-------------|-------|---------|-----------|
| Protection panel — przycisk „Uruchom protection" | klik aktywuje protection run | Eligibility check zawsze zwraca BLOCKER „not implemented (stub)". Komunikat błędu jest generyczny | P0 |
| SLD Toolbar — przycisk „Drukuj" | jeśli istnieje | Brak eksportu PDF/SVG — przycisk nieaktywny lub brak | P0 |
| GpzSwitchgearRenderer — kliknięcie pola na zoom 0.15× | otworzyć inspector | Pole zajmuje 5px ekranowych, klikanie niemożliwe | P1 |
| StationOnRunRenderer — kliknięcie stacji | otworzyć StationInternalView | StationInternalView nie jest dopięty do głównego SLD | P1 |
| Wizard K7 (uziemienia i Z0) | read-only — pokazuje braki | Brak fix-action — operator widzi „brak Z0" ale nie ma jak go uzupełnić bezpośrednio | P2 |
| Catalog Browser — usuwanie typu z instancjami | klik delete | Blokowane przez UI (instances > 0), ale komunikat błędu nie sugeruje akcji | P2 |

---

## 3. Programistyczność (zbędna złożoność dla projektanta)

### 3.1 Tryb uproszczony vs zaawansowany — BRAK

**Problem:** Inżynier projektujący prostą sieć SN nie potrzebuje pełnych danych 110 kV. Wystarczy moc zwarciowa S″k po stronie SN.

**Aktualnie:** Zawsze wymagane: U_n 110, S_n TR, u_k%, P_k, R/X 110, X/R 110.

**Docelowo:**
- Toggle: „Tryb uproszczony" / „Tryb zaawansowany"
- Tryb uproszczony: tylko S″k_SN [MVA] + R/X_SN — wystarczające dla SC IEC 60909
- Tryb zaawansowany: pełny model 110 kV → TR → SN (jak teraz)

**Plan:** P1 w `PLAN_E2E_INDUSTRIAL_2026-05.md`

### 3.2 Wybór operatora na początku projektu

**Problem:** Wymagania NC RfG / IRiESD różnią się per OSD (ENEA / Energa / PGE / PSE / Tauron). Wymagania wpływają na: krzywe FRT, zakres Q, profil cos φ, ramp rate, dead band itd.

**Aktualnie:** Operator wybierany dopiero przy konfigurowaniu DER (PV/BESS/FW). Niespójność: jeśli sieć ma 2 DER-y w różnych OSD?

**Docelowo:** Na początku projektu (K1 wizarda) — wybór operatora z listy. Domyślnie **ENEA Operator** (mając na uwadze że ENEA jest pierwsza w priorytecie wg `/goal`).

**Źródło wymagań:** `backend/src/catalog/profiles/nc_rfg/{enea,energa,pge,pse,tauron}.yaml` — istnieją 5 profili (potwierdzone w repo).

**Plan:** P1 — UI selektor + propagacja `operator_id` do study case.

> **Uwaga:** dokumentacja narracyjna ENEA Operator (IRiESD, NC RfG, deklaracje) **wymaga źródła** — nie fabrykować. YAML jest źródłem prawdy w repo. Dokument w `docs/operator_profiles/ENEA_OPERATOR_PROFILE.md` (jeśli powstanie) musi cytować IRiESD Enea Operator + NC RfG.

### 3.3 Wstawianie stacji — brak split-preview

**Problem:** Obecnie split istnieje, ale bez preview / cancel / commit. Operator nie widzi co się stanie z odcinkiem przed wykonaniem.

**Docelowo:**
1. Kliknij na odcinek SN
2. Wybierz „Wstaw stację"
3. **Preview** — odcinek dzieli się na 2, stacja w pozycji kursora (drag), długości segmentów aktualizują się
4. **Cancel** lub **Commit**
5. Po commit: idempotency_key wygenerowany deterministycznie + ENM_OP

**Plan:** P1 — F2 (SLD rework) + extension domainOpsClient

### 3.4 10-zakładkowy StationConfigurator

**Problem:** 10 zakładek (Podstawowe / Topologia / RozdSN / Pola / Transformator-multi-voltage / RozdNN / Odbiory / Zabezpieczenia / Pomiary / Gotowość) przytłacza nowego użytkownika.

**Docelowo:**
- Sticky header z minimum (nazwa, typ stacji, moc TR, status)
- Default view: tylko 3 zakładki krytyczne (Podstawowe / Topologia / Gotowość)
- Expand to all 10 dla designer / auditor mode
- Wizard mode: 3-kroki dla typowych stacji

**Plan:** P2 — UX optimization (follow-up)

### 3.5 Catalog Browser — UX dla niewprawnego użytkownika

**Problem:** Lista typów (lines/cables/transformers) jest długa. Bez search/filter trudno znaleźć typ.

**Docelowo:**
- Filter by: vendor / rating range / voltage / mm²
- „Ostatnio użyte" sekcja
- Visual symbol preview per type

**Plan:** P2 — UX optimization

---

## 4. Operator profile / standardy (binding ENEA first)

**Status:** ⚠️ ⚠️ — wymaga doklejenia UI selektora i dokumentacji narracyjnej.

**Co JEST w repo:**
- `backend/src/catalog/profiles/nc_rfg/enea.yaml` (potwierdzone)
- Cztery inne OSD: energa, pge, pse, tauron (potwierdzone)
- Loader Python: `loader.py`
- Audit2 integration: `audit2_validation.py` + `qu_regulation.py` używają profili

**Czego BRAKUJE w repo:**
- UI selektor operatora na K1 wizarda
- Dokumentacja narracyjna profilu ENEA: NIE FABRYKOWAĆ (oznacz jako **BLOCKER — wymaga źródła IRiESD Enea Operator**)
- Eksport raportu z nagłówkiem „Operator: ENEA Operator" (zgodnie z profil_operatora w canonicaltyzmie V12.xx)

**Plan:**
- P1: dodaj UI selektor operatora na K1 wizarda (default ENEA)
- P1: dodaj dokumentację narracyjną — **wymaga źródła** (IRiESD ENEA + NC RfG Polski)
- P2: ekosystem reportowy z nagłówkiem operatora

---

## 5. Acceptance criteria (workflow)

System osiąga industrial-grade flow gdy:

- [ ] Krok 1–14 (wg `/goal`) działa bez dead clicków
- [ ] Toggle „Tryb uproszczony" / „Tryb zaawansowany" dla parametrów zwarciowych
- [ ] Wybór operatora na K1 wizarda (default ENEA Operator)
- [ ] Wstawianie stacji ma preview / cancel / commit
- [ ] Stacje SN/NN i odgałęzienia widoczne jako pełne sub-SLD przy zoom > 1×
- [ ] PV/BESS/FW z PCC wizualnie powiązane z polem/stacją
- [ ] Protection bez stuba SI-100 (Protection przycisk działa do końca)
- [ ] Wyniki widoczne na SLD jako overlay (V/φ/I/P)
- [ ] Proof generuje JSON + LaTeX + PDF + DOCX
- [ ] Eksport SLD do PDF/SVG działa
- [ ] E2E test `critical-run-flow.spec.ts` (real backend) PASS

---

## 6. Top 5 P0 dla workflow

1. **Protection SI-100 stub removal** — bez tego krok 11 jest dead.
2. **Toggle uproszczony/zaawansowany dla parametrów zwarciowych** — radykalnie upraszcza flow.
3. **UI selektor operatora na K1** — domyślnie ENEA.
4. **Split-preview dla stacji** — eliminuje surprise dla projektanta.
5. **Eksport SLD do PDF/SVG** — bez tego diagram nie istnieje poza przeglądarką (krok 14).

---

**KONIEC AUDYTU FLOW INŻYNIERA**
