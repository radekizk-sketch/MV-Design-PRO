# KARTA ZADANIA P39 — MACIERZ WYMOGÓW NC RfG PER MODUŁ (rozbudowa W-614)

**Faza:** U4 (otwarcie strumienia OZE — priorytet dyrektywy 2026-07-15) · **Epik:** E11 ·
**Wykonawca:** Opus · **Wiążące:** `PROPOZYCJE_ROZSZERZEN` P39, `MODEL_INTERAKCJI` §2.7
i rejestr W-614, `AUDYT_RADY_SPECJALISTOW` (specjalista OZE/NC RfG), CLAUDE.md
(NOT-A-SOLVER, WHITE BOX read-only, determinizm, PL-only).

## 1. Cel
Interaktywna macierz zgodności NC RfG dla WSZYSTKICH modułów wytwórczych projektu naraz
(dzisiejsza zakładka testów działa na jednym module ręcznie konfigurowanym): wiersze =
wymogi/testy z katalogu procedury PTPiREE, kolumny = moduły (PV/BESS/FW), komórka =
werdykt (spełniony/niespełniony/brak danych/niewymagany) z uzasadnieniem PL, akcjami
naprawczymi i odnośnikiem do śladu WHITE BOX. Podsumowanie per moduł i per projekt.

## 2. Dane (rekonesans wykonany — mapowania wiążące)
- Kontrakt API (istnieje, bez delty backendowej dla rdzenia): katalog testów+operatorów
  `GET /api/ncrfg-tests/catalog`, bieg `POST /api/ncrfg-tests/run` —
  `backend/src/api/ncrfg_ptpiree_tests.py:16,40`; typy frontowe 1:1:
  `ui/ncrfg-tests/api.ts:1-147` (`NcRfgModuleInput`, `NcRfgRunResult` z
  `modules[].tests[]`: verdict, summary_pl, required_reason_pl, metrics, fix_actions,
  trace_refs; `white_box_trace[]`; `deterministic_hash`). Bieg przyjmuje WIELE modułów
  (`modules: [...]`) — dzisiejszy fronton wysyła jeden (`ui/workspace/surfaces/
  NcRfgTestsTab.tsx:444`).
- Budowa wejścia modułu z modelu: wzór `buildModuleInput` —
  `NcRfgTestsTab.tsx:140-186` (źródło: `StationDerConnection`; zbadaj skąd pochodzi
  lista DER — store/snapshot). UWAGA: `inferVoltageKv` (`NcRfgTestsTab.tsx:129-132`)
  ZGADUJE 15 kV, gdy strona nie jest nN — w nowym oknie ZAKAZ zgadywania: napięcie
  z modelu (szyna przyłączenia); brak → moduł oznaczony „brak danych: napięcie
  przyłączenia" z akcją naprawczą, nie cichą wartością domyślną.
- Zdolności modułu (has_lvrt_curve itd.): dziś ręczne przełączniki. W macierzy:
  wartości wstępne z katalogu urządzenia, jeśli osiągalne read-only (zbadaj
  `der.catalogs.*` — `NcRfgTestsTab.tsx:135`); pozostałe edytowalne w panelu modułu
  (formularz per moduł, stan lokalny okna, zero mutacji modelu); każda wartość ręczna
  oznaczona „dane deklarowane" (uczciwość źródła danych).
- Werdykty PL: `VERDICT_LABELS` — `NcRfgTestsTab.tsx:108-113`.

## 3. Pliki (TYLKO `frontend/src/ui2/oze/macierz/**`)
`MacierzNcRfg.tsx` (kompozycja: nagłówek [operator OSD + wersja procedury + odcisk
deterministyczny w trybie eksperckim], macierz test×moduł, panel szczegółu komórki),
`SzczegolWerdyktu.tsx` (uzasadnienie PL, metryki z jednostkami, akcje naprawcze jako
lista, odnośniki śladu → `onOtworzDowod(proof_ref)`), `PanelModulu.tsx` (dane wejściowe
modułu: z modelu / z katalogu / deklarowane — trzy jawne pochodzenia), `macierzModel.ts`
(typy + adapter `zbudujModuly` nad realnym źródłem DER + `mapujMacierz` nad
`NcRfgRunResult`), `api.ts` NIE tworzyć — REUŻYĆ `ui/ncrfg-tests/api.ts` (import),
`strings.ts`, `macierz.css` (tokeny --mvd-*), `index.ts`, `__tests__/` (≥ 24 testy;
fixtures 1:1 z `NcRfgRunResult` — moduł zgodny, niezgodny, brak danych; macierz 3 moduły
× katalog testów; werdykt „niewymagany" z powodem).

## 4. Zasady i kryteria
Zero fizyki i zero lokalnych ocen — werdykty WYŁĄCZNIE z odpowiedzi solvera (analiza
interpretacyjna działa w backendzie); fronton tylko prezentuje. Bieg uruchamiany jawnym
przyciskiem „Przeprowadź testy zgodności" (stan: w trakcie/błąd/wynik z odciskiem).
Kryteria: (1) macierz renderuje katalog testów × moduły z werdyktami i legendą PL,
(2) komórka → szczegół (uzasadnienie, metryki, akcje naprawcze, ślad przez callback),
(3) moduł bez napięcia przyłączenia → jawny stan braku danych (bez 15 kV z powietrza),
(4) podsumowanie per moduł (X/Y wymaganych spełnionych) i per projekt, (5) pełne bramki
jak E1.1 §8 (pipefail; pełny vitest foreground; guardy). Commit
`feat(ui2/oze): macierz wymogów NC RfG per moduł (P39)` BEZ push. Raport standardowy.
TODO-KARTA (rejestrowane, poza zakresem): „certyfikat zgodności projektu" jako dokument
(E13/W-707), wpięcie do pulpitu OZE (P47), delta backendowa dla profili wymogów B/C/D
wg mocy (jeśli katalog procedury ich nie rozróżnia — zbadać i zapisać w raporcie).
