# KARTA ZADANIA P42 — OKNO DOBORU KOMPENSACJI MOCY BIERNEJ (odblokowane po K2)

**Faza:** U4 · **Epik:** E11 · **Wykonawca:** Opus · **Warstwa:** frontend ·
**Wiążące:** CLAUDE.md (ZERO fizyki w UI; etykiety PL; granica SLD), DECYZJA
WŁAŚCICIELA V12K-040 = opcja B (K2 scalone). Backend: `GET /api/oze-analysis/
compensation-sizing?run_id=&bus_ref=&cos_phi_min=&uwzglednij_noc=`
(`api/oze_analysis_runs.py:187`), serwis `application/analyses/
dobor_kompensacji.py`. Wzorce: `ui2/oze/frt/EkranFrt.tsx`, wzorzec
`EkranAnalizy`/`TabelaWynikow`, `ui2/oze/api.ts` (`getJsonZDetalem`).

## 0. WIĄŻĄCY WYMÓG WŁAŚCICIELA — rozdział DWÓCH wielkości cosφ w UI
DTO D8 (po K2) niesie DWIE ODRĘBNE wielkości; UI MUSI je prezentować pod
JEDNOZNACZNIE różnymi nazwami, NIE mylić, NIE pod jedną etykietą:
1. **cosφ przekroju sieciowego** (`cosfi_przekroju` / `_dzien` / `_noc`,
   `q_przekroju_*_mvar`) — cosφ przepływu w przekroju sieci; wielkość
   informacyjna, NIE jest miarą skompensowania odbioru,
2. **cosφ punktu kompensowanego** (`cosfi_punktu` / `_dzien` / `_noc`,
   `q_netto_punktu_*_mvar`, `q_cap_eff_*_mvar`) — z lokalnego bilansu
   `Q_netto = Q_load − Q_cap_eff`; **na tym opiera się DOBÓR** (`spelnia`,
   `dobor`, `decyzja`).
UI wprost oznacza, że dobór baterii jest sterowany wielkością (2); wielkość
(1) pokazana obok z etykietą „cosφ przekroju sieciowego" i notą, że to przepływ
sieci, a nie stopień skompensowania odbioru. Nota `konwencja_kanoniczna`
z DTO (P>0 pobór / Q>0 indukcyjny / Q<0 pojemnościowy) wyświetlona w sekcji
założeń.

## 1. Zakres
1. NOWA zakładka warsztatu `kompensacja` („Dobór kompensacji", grupa OZE za
   `osd`) — `WynikiWarsztat.tsx` + `strings.ts` + test warsztatu (wzorzec
   zakładki `lom`/`odbior`).
2. Moduł `ui2/oze/kompensacja/` (EkranKompensacji + model + strings + css +
   klient w `ui2/oze/api.ts`):
   - wybór przebiegu rozpływu (PF, zakończony) i węzła przyłączenia (bus_ref),
     wymagany cosφ min (pole liczbowe, przecinek PL, domyślnie 0,95),
     przełącznik „uwzględnij scenariusz nocny",
   - stan wyjściowy (`baseline`): dla punktu — Q obciążenia, cosφ punktu,
     cosφ przekroju (OBA, rozdzielone),
   - tabela kandydatów (`TabelaWynikow`, rosnąco po `rated_mvar`): rekord
     katalogu, `q_cap_eff`, `q_netto_punktu`, **cosφ punktu (dzień/noc)** =
     kolumna decyzyjna z werdyktem `spelnia` (kolor tokenów --mvd-*),
     cosφ przekroju jako kolumna informacyjna wyraźnie odróżniona,
   - werdykt doboru (`dobor`/`decyzja`/`powod_braku`): pierwszy kandydat
     spełniający lub uczciwy „brak doboru" z powodem PL,
   - ślad WHITE BOX (`whitebox`) w trybie zaawansowanym (wzorzec SladAnalizy),
   - stany puste PL (bez przebiegu/węzła), błędy API PL z `detail` (404/422).
3. Testy Vitest ≥ 12: stan pusty, render baseline z OBOMA cosφ rozdzielonymi,
   tabela kandydatów z fixture 1:1 z kontraktem (`dobor_kompensacji.py`),
   kolumna decyzyjna = cosφ punktu (asercja, że dobór NIE jest sterowany cosφ
   przekroju), werdykt doboru i brak doboru, scenariusz nocny, błąd API PL,
   nota konwencji kanonicznej widoczna, zakładka w warsztacie (klawiatura bez
   regresji), formaty PL.

## 2. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD` (HEAD zawiera scalenie #39). Baza vitest: 8674, ZERO failed.
Środowisko: symlink node_modules (NIE commituj); pętla `until` przed pełnym
vitest; pełny vitest do pliku (usuń przed commitem); NIE edytuj src w trakcie;
po biegu NATYCHMIAST commit. Bramki (pipefail, z frontend/): type-check, lint
--max-warnings 0, PEŁNY npm test ZERO failed (twoje ≥12), guard:codenames;
z mv-design-pro: forbidden_ui_terms, ui_terminology, utf8_mojibake,
dead_click_guard. NIE dotykaj SLD. Commit:
`feat(ui2): okno doboru kompensacji z rozdziałem cosφ przekroju/punktu (P42)`
BEZ push. Raport standardowy (plik:linia; potwierdzenie rozdziału obu cosφ
w UI zgodnie z Wymogiem 2 właściciela).
