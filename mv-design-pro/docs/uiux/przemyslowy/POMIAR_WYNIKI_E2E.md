# Eksploracja: UI-17/18/19, §10, infrastruktura zrzutów (2026-10-16, odczyt bez zmian)
Ścieżki względem /home/user/MV-Design-PRO/mv-design-pro.

## UI-17 Wyniki w kontekście elementu
- Inspektor ui2 ma zakładki 'wlasciwosci'|'wyniki'|'dowod'|'powiazania' (frontend/src/ui2/inspector/inspectorModel.ts:16) + FreshnessBadge.tsx. Szczegóły wyniku i dowód elementu z poziomu inspektora obok SLD.
- ElementCalculationProofPanel (ui/proof) wpięty: ui/network-build/InspectorEngineeringView.tsx:2931, ui/workspace/WorkspaceSurfaceRouter.tsx:1087,2411,3039.
- Dolny panel: istnieje (ui2/shell/AppShell.tsx:212-286, data-testid mvd-bottom-panel), ale zakładki tylko 'problemy','przebiegi','dziennik' — BRAK zakładki tabeli wyników wszystkich elementów pod SLD.
- Tabele wyników są w przestrzeni Wyniki (ui2/wyniki/rozplyw/TabelaSzyn.tsx itd.), czyli poza SLD. Nakładka wyników na SLD: ui/sld-overlay; w ui2 import tylko w ui2/wyniki/porownanie/TrybZwarciowy.tsx.
- NIE sprawdzono: czy klik elementu na SLD natywnie otwiera zakładkę 'wyniki' z liczbami (brak przejścia e2e).

## UI-18 Wykresy (Recharts, 11 plików; zliczenia grep label=/unit=, <Legend, ReferenceLine/Area, eksport, klik)
| plik | etyk.osi | legenda | granice | eksport | klik→element |
| ui/protection-curves/TimeCurrentChart.tsx (TCC) | 3 | 1 | 2 | 0 | 2 |
| ui2/wyniki/dynamika/WykresPrzebiegow.tsx | 2 | 1 | 2 | 0 | 0 |
| ui2/wyniki/zwarcia/WykresIkssChart.tsx | 0 | 0 | 0 | 0 | 0 |
| ui2/wyniki/zwarcia/WykresUdzialowChart.tsx | 0 | 0 | 0 | 0 | 0 |
| ui2/wyniki/oltc/WykresProfilChart.tsx | 0 | 1 | 0 | 0 | 0 |
| ui2/wyniki/oltc/WykresSweepChart.tsx | 1 | 1 | 0 | 0 | 0 |
| ui2/wyniki/rozplyw/ProfilNapiecChart.tsx | 0 | 0 | 3 | 0 | 0 |
| ui2/oze/krzywe/WykresPQChart.tsx | 2 | 1 | 3 | 0 | 0 |
| ui2/oze/zdolnosc/WykresZdolnosciChart.tsx | 0 | 0 | 0 | 0 | 0 |
| ui2/oze/obszar/WykresObszaruChart.tsx | 2 | 1 | 0 | 0 | 0 |
| ui2/oze/frt/WykresTrajektoriiChart.tsx | 2 | 1 | 0 | 0 | 2 |
Grep heurystyczny (komponenty-opakowania mogą dodawać osie/legendy poza tymi plikami — nie sprawdzono). Braki: eksport wykresu 0/11; powiązanie punkt→element tylko TCC i FRT; profil napięć bez etykiet osi i legendy; wykresy zwarciowe bez osi/legend/granic; brak wykresu obciążeń gałęzi (brak pliku z Recharts dla loadingu); porównanie przypadków na wykresie — nie znaleziono.
Druga implementacja TCC: ui/protection-coordination/TccChart.tsx (nie Recharts?) — nie sprawdzono, potencjalna duplikacja.

## UI-19 WHITE BOX
- ui2/wyniki/dowod/KrokDowodu.tsx:3 kanon pięciu pól: Wzór → Dane wejściowe → Podstawienie → Wynik → Uwagi (MathBlock z latex, :56,:142,:161). Mapuje się na A/B/C/D, ale nie ma jawnie nazwanych sekcji A–D ani sekcji "ograniczenia/weryfikacja" osobno (Uwagi).
- Źródło LaTeX: dowodModel.ts:266 wzorLatex = krok.formula_latex z GET /api/analysis-runs/{run}/pakiet-dowodowy (pakietApi.ts:12-18; backend api/analysis_runs.py:522,533); nastawy: :583,:597. Eksport .tex: ui/proof/proofLatexApi.ts:2,46.

## §10 testy 1–5 — backend
1. Drzewo/SLD — frontowe; brak e2e łańcucha źródło→TR bez utraty zaznaczenia (nie znaleziono dedykowanego speku; nie sprawdzono wyczerpująco).
2. Aparat w kreatorze — POST /api/cases/{case_id}/enm/domain-ops (api/enm.py:1246); katalog GET /api/catalog/... (api/catalog.py).
3. Długość kabla: operacja update_element_parameters (enm/rejestr_operacji.py:185, enm/domain_operations.py:9972) przez domain-ops; świeżość: result_status NONE/FRESH/OUTDATED wyprowadzany + result_status_reason (api/study_cases.py:9-13); przeliczenie: POST /api/execution/study-cases/{case_id}/runs (api/execution_runs.py:237) + POST /api/execution/runs/{run_id}/execute (:256), power-flow-runs/{id}/execute (api/power_flow_runs.py:398); wyniki /api/analysis-runs/{run}/results/buses|branches (analysis_runs.py:747,752). Spadek napięcia ΔU per gałąź — nie zweryfikowano pola w branches.
4. Zwarcia: /results/short-circuit (:757), /rozplyw (:762), /pasmo (:786), /results/trace (:845), pakiet-dowodowy (:533).
5. EAZ: Measurement (CT/VT) enm/models.py:814-860 (ct_arrangement, ct_cores, vt_arrangement, vt_mounting); ProtectionAssignment :910, ProtectionSettingValue :1453, BayProtectionControlUnit :1525; GET /api/cases/{id}/enm/protection-view (api/enm.py:356); /analysis-runs/{run}/nastawy (:647), /nastawy/dopasowanie (:695); katalog ct-types (catalog.py:267).

## Infrastruktura e2e
- frontend/playwright.config.ts: PLAYWRIGHT_REAL_BACKEND=1 → webServer uvicorn `poetry run python -m uvicorn src.api.main:app` w backend/, health /ready; DATABASE_URL sqlite+pysqlite w mkdtemp (mvd-e2e-*), ENM_STORE_DIR, STATION_USER_TEMPLATES_DIR, CLOUD_BACKUP LOCAL, BLAS=1; frontend `npx vite --port 5173 --strictPort`; workers 1, viewport domyślny 1280×720, reducedMotion; porty z PLAYWRIGHT_BACKEND_URL (8000) / PLAYWRIGHT_FRONTEND_URL (5173); PLAYWRIGHT_REUSE_SERVER=1.
- frontend/scripts/playwright-run.mjs:10-26 wymusza REAL_BACKEND=1, ustawia VITE_API_URL(_DEV).
- Chromium: /opt/pw-browsers/{chromium,chromium-1194,chromium_headless_shell-1194} obecny; resolveChromiumExecutable w scripts/playwright-env.mjs lub PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.
- e2e/katalogZrzutow.ts: bez ZRZUTY_DO_DOKUMENTACJI=1 zrzuty idą do frontend/test-results/zrzuty-dokumentacji/<ścieżka>; ścieżka poza repo przechodzi bez zmian; straznikDrzewa.ts pilnuje drzewa.

### Mapa 15 ekranów (PNG w docs/audit/visual/w5b/po/, każdy w 2 motywach = 30 PNG)
| W5-UI | PNG (+ dark/light | ciemny/jasny) | spec | viewport |
| 01 | kreator-stacji-szablon-{dark,light} | e2e/kreator-stacji-zrzuty.spec.ts:194 | 1440×900 |
| 02 | kreator-stacji-pola-{..} | tamże :220 | 1440×900 |
| 03 | kreator-stacji-podglad-{..} | tamże :254 | 1440×900 |
| 04 | pola-w-torze-siec-{ciemny,jasny} | e2e/pola-w-torze-zrzuty-screenshot.spec.ts:245 | 1600×1000 |
| 05 | pola-w-torze-przelotowa-* | tamże :266 | 1600×1000 |
| 06 | pola-w-torze-odgalezna-* | tamże :266 | |
| 07 | pola-w-torze-sekcyjna-* | tamże :266 | |
| 08 | pola-w-torze-koncowa-* | tamże :266 | |
| 09 | kreator_stacja_pola_bez_pola_tr_{light,dark} | e2e/kreator-stacji-pole-tr-screenshot.spec.ts:110 | 1220×1000 |
| 10 | kreator_stacja_pola_domyslne_* | tamże :84 | |
| 11 | kreator_stacja_pola_warianty_aparatu_* | tamże :100 | |
| 12 | rodzaj_stacji_po_drzewo_* (+ .txt) | e2e/etykieta-stacji-zrzuty.spec.ts:58 | 1600×900 |
| 13 | rodzaj_stacji_po_gotowosc_* | tamże :105 | |
| 14 | rodzaj_stacji_po_schemat_* | tamże :56 | |
| 15 | rodzaj_stacji_po_stacja_* | tamże :98 | |
Mapowanie W5-UI-12…15 na nazwy plików — wnioskowane z treści §7 (przypuszczenie, zgodne z nazwami).
Dane: kreator-stacji-zrzuty i pola-w-torze budują sieć przez POST /api/projects, /api/study-cases, /api/cases/{id}/enm/domain-ops (realny backend); etykieta-stacji przez e2e/etykietaStacjiSiec.ts (zbudujSiecEtykietyStacji, request API) + stan localStorage; motywy: kreator-stacji-zrzuty localStorage mvd-theme-mode (dark_scada/light_technical, :38,:158); pola-w-torze realny przycisk mvd-theme-toggle (:205-213); pole-tr ?theme= w URL harnessu.
UWAGI (defekty/ryzyka):
- kreator-stacji-pole-tr-screenshot.spec.ts:61-75 działa na HARNESSIE (creator-harness-root) z „atrapą harnessu” katalogu, NIE na realnym backendzie — ekrany 09–11 nie spełniają §10 „realny backend”.
- etykieta-stacji-zrzuty.spec.ts:25-27 NIE używa katalogZrzutow() — bez E2E_KATALOG_ZRZUTOW pisze wprost do docs/audit/visual/etykieta-stacji (strażnik drzewa obleje bieg bez ZRZUTY_DO_DOKUMENTACJI=1). ETYKIETA_ETAP=przed|po steruje nazwą.
- 4 różne viewporty (1440×900, 1600×1000, 1220×1000, 1600×900) i dwa słowniki nazw motywu (dark/light vs ciemny/jasny) — „te same warunki” §10 pkt 7 nie są spełnione.

### Komendy (z frontend/)
cd /home/user/MV-Design-PRO/mv-design-pro/frontend
E2E_KATALOG_ZRZUTOW=<abs katalog> npm run test:e2e -- e2e/kreator-stacji-zrzuty.spec.ts e2e/pola-w-torze-zrzuty-screenshot.spec.ts e2e/kreator-stacji-pole-tr-screenshot.spec.ts e2e/etykieta-stacji-zrzuty.spec.ts
(do docs/audit/visual/w5b/po: E2E_KATALOG_ZRZUTOW=$PWD/../docs/audit/visual/w5b/po ZRZUTY_DO_DOKUMENTACJI=1 ...; etykieta: ETYKIETA_ETAP=po). Równolegle: własne PLAYWRIGHT_BACKEND_URL/PLAYWRIGHT_FRONTEND_URL. Wymaga poetry install w backend/ i npm ci. Nie uruchomiono (tylko odczyt).

### dispatchEvent
Jedyne realne wywołanie: e2e/critical-der-config.spec.ts:197 (wheel na kanwie). Pozostałe 10 trafień to komentarze „zero dispatchEvent”. `force: true` / evaluate(.click()): 8 trafień grep "evaluate(.*\.click()|force: true" — nie rozpisano po plikach.

## Wiele rozdzielczości/motywów
Brak e2e z 1366 (grep "1366" e2e/*.ts = 0). Rozdzielczości tylko w vitest: ui/sld/v3/canvas/__tests__/toolbarLayout.contract.test.ts, camera.test.ts, ui2/spaces/wyniki/__tests__/ukladZakladek.test.ts (jsdom, nie render). Macierz §10 pkt 6 (4 rozdzielczości × 2 motywy × inspektor) — nie istnieje.
