# KARTA ZADANIA — OKNA FRONTENDOWE FALI 3: SEKWENCJE ZAPADÓW (P43), OCHRONA LoM (P46), MIGOTANIE (P37)

**Faza:** U4 · **Epik:** E11/E10 · **Wykonawca:** Opus · **Warstwa:** frontend ·
**Wiążące:** CLAUDE.md (ZERO fizyki w UI; etykiety WYŁĄCZNIE PL, zero kodów
projektowych; granica SLD — NIE dotykaj `ui/sld/**`, `ui/sld-editor/**`,
`engine/sld-layout/**`), wzorce: `ui2/oze/frt/EkranFrt.tsx` (D6/P41),
`ui2/wyniki/jakosc/EkranJakosci.tsx` (W-607), `ui2/oze/api.ts` (klient),
`ui2/spaces/wyniki/WynikiWarsztat.tsx` (warsztat, GRUPY_ZAKLADEK),
wzorzec `EkranAnalizy`/`TabelaWynikow` (`ui2/wyniki/wzorzec/`).

## 1. Cel — trzy okna na trzech NOWYCH końcówkach backendu (już scalone)
1. **P43 — sekwencja zapadów FRT**: rozszerzenie istniejącego ekranu
   `EkranFrt` o sekcję „Sekwencja zapadów" —
   `GET /api/oze-analysis/frt-sequence?der_ref=&operator_id=&sekwencja=`
   (+ opcjonalnie `run_id`, `bus_ref` → sekcja „Kontekst siły sieci");
   `sekwencja` = pary `głębokość:czas` po przecinku (w UI edytor listy zapadów:
   głębokość p.u. + czas s, dodaj/usuń wiersz; serializacja z kropką dziesiętną,
   PREZENTACJA z przecinkiem PL). Odpowiedź: `zapady[]` (parametry, werdykt_pl,
   trajektoria/marginesy jak D6), `werdykt_sekwencji_pl`, `zalozenia_pl`,
   `kontekst_sily_sieci` (lub `kontekst_sily_sieci_powod_pl`), `input_hash`.
   Werdykt sekwencji wyeksponowany (odznaka jak w macierzy NC RfG); założenia
   (brak modelu stanu między zapadami) ZAWSZE widoczne — uczciwość.
2. **P46 — ochrona LoM**: NOWA zakładka warsztatu „Praca wyspowa" (id `lom`,
   grupa OZE, za `osd`) + moduł `ui2/oze/lom/` (EkranLom) —
   `GET /api/oze-analysis/lom-protection?case_id=` (aktywny przypadek ze store
   study-cases — wzorzec pobierania jak inne ekrany OZE; bez aktywnego przypadku
   → uczciwy stan pusty PL). Odpowiedź: `summary` (overall_status, fields_total,
   by_status, modules_without_field), `fields[]` (bay_ref/bay_name, funkcje LoM,
   `checks[]`: label_pl, value+unit, window_pl, message_pl, severity, source_pl),
   `normative_sources`, `zalozenia_pl`. Tabela pól wg wzorca `TabelaWynikow`
   (wiersz=pole, status kolorem tokenów --mvd-*), rozwinięcie wiersza →
   porównania (checks) z oknami normatywnymi i źródłami; sekcja założeń.
3. **P37 — migotanie**: rozszerzenie `EkranJakosci` o TRZECIĄ sekcję
   „Migotanie i szybkie zmiany napięcia" — `GET /api/quality/flicker?run_id=`
   (przebieg ZWARCIOWY — wybór przebiegu jak sekcja sanity-bounds tego ekranu).
   Odpowiedź: `summary` (assessed/exceeded/not_assessed), `buses[]` (sk_mva,
   pst/plt + limity planning_level, d_percent, verdict_pl, `modules[]`:
   sn_mva, flicker_c, pst_i, included, info_pl), `zalozenia_pl`, `white_box`.
   Tabela węzłów wg wzorca; moduły pominięte (bez flicker_c) pokazane jawnie
   z powodem PL; wartości z przecinkiem PL; ślad WHITE BOX w trybie
   zaawansowanym (wzorzec `SladAnalizy`).

## 2. Wymagania wspólne
- Klient: rozszerz `ui2/oze/api.ts` (frt-sequence, lom-protection) i klienta
  jakości `ui2/wyniki/jakosc/api.ts` (flicker) — konwencja `getJsonZDetalem`,
  komunikaty błędów PL z `detail`.
- Zakładka `lom`: `WynikiWarsztat.tsx` (ZAKLADKI + GRUPY_ZAKLADEK grupa OZE,
  testid `mvd-wyniki-zakladka-lom`), `strings.ts` (`zakladkaLom: 'Praca
  wyspowa'`), test warsztatu rozszerzony (istniejący wzorzec:
  `spaces/wyniki/__tests__/wynikiWarsztat.test.tsx` — sekcja „Zdolność
  przyłączeniowa" pokazuje jak dołączyć nową zakładkę do asercji).
- Barrel `ui2/oze/index.ts` — sufiksy antykolizyjne jak dotychczas.
- Recharts (jeśli wykresy): `isAnimationActive={false}`, tokeny `var(--mvd-*)`,
  normalizacja `recharts\d+` w testach. Formatery PL (przecinek) jak wzorzec.
- Testy Vitest ≥ 20 łącznie (P43 ≥6, P46 ≥8, P37 ≥6): stany puste PL, render
  danych z fixture 1:1 z kontraktem API, błąd API → komunikat PL, edytor
  sekwencji (dodaj/usuń/serializacja), werdykty/odznaki, zakładka lom
  w warsztacie (render + klawiatura bez regresji).

## 3. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD` (HEAD zawiera scalenie #18 i tę kartę). Bramki (pipefail):
`npm run type-check`, `npm run lint -- --max-warnings 0`, PEŁNY
`npm test` (vitest `--no-file-parallelism`) — ZERO failed (baza ~8473+);
guardy z `mv-design-pro`: `npm run guard:codenames` (z frontend/),
`python scripts/forbidden_ui_terms_guard.py`, `python scripts/ui_terminology_guard.py`,
`python scripts/utf8_mojibake_guard.py`. NIE dotykaj plików SLD. Przy >600 s
odczytaj wynik i NATYCHMIAST commit+raport. Commit
`feat(ui2): okna fali 3 — sekwencje zapadów FRT, ochrona LoM, migotanie (P43/P46/P37)`
BEZ push. Raport standardowy (plik:linia, liczby testów, guardy).
