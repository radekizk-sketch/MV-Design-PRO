# KARTA ZADANIA U5-UI-HIGIENA — HIGIENA GRANICY WARSTW W UI (sierota FRT + guard zero-fizyki)

**Faza:** U5 · **Epik:** higiena/dług · **Wykonawca:** Opus (worktree izolowany) ·
**Warstwa:** frontend + scripts (guard) + tests/ci · **Wiążące:** CLAUDE.md
(granica warstw — ZERO fizyki w prezentacji; Zero-Debt), wzorzec guarda:
`scripts/overlay_no_physics_guard.py` (skan katalogu, słowa-klucze w kontekście
obliczeń, konteksty dozwolone, kody wyjścia 0/1/2).

## 0. Rozstrzygnięcia zarządcy (WIĄŻĄCE)
1. **Geneza:** przy wygaszeniu E-26 (W5b-3) `ComplianceSurface` zastąpiono `EkranFrt`;
   `FrtHvrtCurves` (`frontend/src/ui/protection-curves/FrtHvrtCurves.tsx`) został
   BEZ konsumenta (potwierdzone grepem — tylko własny test). Osobno usunięto
   `ui/sensitivity/` bo `sensitivityAnalyzer.ts` liczył FIZYKĘ w prezentacji
   (linearyzacja `deltaU=dUdP·P+dUdQ·Q`). Ten drugi defekt przetrwał latami, bo
   NIE MA guarda „zero fizyki w UI". Karta domyka oba: sierotę i lukę guarda.
2. **Część A (sierota) — DELETE, nie zostawiaj:** usuń `FrtHvrtCurves.tsx` +
   `__tests__/FrtHvrtCurves.test.tsx`. NAJPIERW potwierdź grepem brak konsumenta
   w `src/**` poza własnym testem (`grep -rn FrtHvrtCurves src | grep -v FrtHvrtCurves.tsx | grep -v FrtHvrtCurves.test`).
   Jeśli pojawi się JAKIKOLWIEK inny konsument — STOP, zgłoś zarządcy, NIE usuwaj.
   `NcRfgProfileId`/`buildEnvelope` żyły tylko w tym pliku → znikają razem z nim.
3. **Część B (guard) — KONSERWATYWNIE, ZERO false-positives:** nowy
   `scripts/ui_no_physics_guard.py` wzorowany 1:1 na `overlay_no_physics_guard.py`
   (ta sama struktura: PHYSICS_PATTERNS obliczeniowe, SKIP dla komentarzy/importów/
   typów/stringów testowych, kody 0/1/2). ZAKRES skanu:
   `frontend/src/ui/**` ORAZ `frontend/src/ui2/**`. WYKLUCZENIA (udokumentowane
   w docstringu, z uzasadnieniem): `ui/sld/**`, `ui/sld-editor/**`,
   `ui/sld-overlay/**` (geometria/współrzędne wykresu i layout SLD to NIE fizyka
   sieci; sld-overlay ma już własny guard), `ui/engine/**`/`engine/sld-layout/**`
   (algorytmy layoutu), `**/__tests__/**`, `**/*.test.*`. Wzorce wykrywają
   ARYTMETYKĘ na wielkościach elektrycznych sieci (voltage/current/impedance/
   power/admittance/susceptance/reactance/jacobian oraz skróty dUdP/dUdQ/deltaU)
   w kontekście obliczeniowym — NIE formatowanie/zaokrąglanie/skalowanie osi
   wykresu. **WYMÓG TWARDY: guard MUSI dać exit 0 na bieżącym HEAD** (po
   usunięciu `ui/sensitivity/` nie powinno być naruszeń). Jeżeli guard zapala się
   na istniejącym, legalnym kodzie prezentacyjnym (np. skalowanie osi, procent
   z gotowej wartości backendu) — dostrój wzorce/konteksty tak, by były zielone,
   a KAŻDY plik dodany do allowlisty musi mieć komentarz z uzasadnieniem
   „to nie fizyka sieci, bo …". Guard NIE może maskować realnej fizyki.
4. **Wpięcie + test:** dodaj `scripts/ui_no_physics_guard.py` do listy bramek
   UI w `CLAUDE.md` (sekcja „UI & terminology guards" quick-ref) oraz test
   walidujący w `backend/tests/ci/` (wzorzec istniejących testów guardów
   w `tests/ci/` — guard zielony na repo + wykrywa sztuczny przykład fizyki).

## 0.5 AKTUALIZACJA ZARZĄDCY (2026-07-18, po eskalacji wykonawcy — WIĄŻĄCA)
Wykonawca słusznie wykazał, że przesłanka Rozstrzygnięcia 3 („po usunięciu
`ui/sensitivity/` brak fizyki w UI") jest NIEPRAWDZIWA: w `ui/**` istnieje realna
fizyka sieci w warstwie prezentacji (ΔU, Ik3, prąd doziemny PN-EN 50522, krzywe
IEC 60255) — spis w `docs/uiux/DLUG_FIZYKA_W_UI_2026-07.md`. Wymóg „guard zielony
na HEAD dla `ui/**` bez maskowania" jest wewnętrznie sprzeczny przy tym stanie.
Rozstrzygnięcie zarządcy (synteza opcji 3 + 1 z raportu wykonawcy):
- **CZĘŚĆ A pozostaje** jak w karcie (sierota FrtHvrtCurves) — DOSTARCZONA,
  zintegrowana przez zarządcę (cherry-pick).
- **CZĘŚĆ B — ZAKRES GUARDA ZAWĘŻONY do `frontend/src/ui2/**`** (warstwa docelowa
  clean-room; tam toczy się rozwój i tam trafiłby nowy defekt klasy
  `sensitivityAnalyzer`). Guard MUSI dać exit 0 na `ui2/**` HEAD. Dostrojenie
  anty-false-positive: USUŃ z detekcji goły token `current` (wszechobecny
  nie-fizycznie: `aria-current`, Tailwind `*-current`, `data-testid`, setter
  Reacta `(current) => …`); wykrywaj SILNE sygnały fizyki sieci: `Math.sqrt(3)`/
  `√3` przy zmiennych elektrycznych, arytmetyka na impedance/admittance/reactance/
  susceptance, `dUdP`/`dUdQ`/`deltaU`, wzory zwarciowe (`Ik3`/`Ik`/`Sk`), wzór
  spadku napięcia. Docstring guarda: jawnie „zakres = ui2 (greenfield); `ui/**`
  ma śledzony dług relokacji fizyki — patrz DLUG_FIZYKA_W_UI_2026-07.md; zakres
  rozszerzy się na `ui/**` po zamknięciu epiki relokacji".
- **`ui/**` — NIE allowlistować jako „to nie fizyka" (byłoby kłamstwem).**
  Dług spisany w inwentarzu (Zero-Debt pkt 4: tracked, z przyczyną i planem);
  egzekwowany przy migracji `ui/**` → `ui2` (fizyka idzie do backendu, wtedy
  guard łapie ją w ui2). Osobna epika „relokacja fizyki UI → backend" — do
  zaplanowania po epice wygaszania (nie mieszać z bieżącym refaktorem).
- Wpięcie do bramek + test guarda (`tests/ci/`) — jak w karcie, dla zakresu ui2.

## 1. Zakres plików
- USUŃ: `frontend/src/ui/protection-curves/FrtHvrtCurves.tsx`,
  `frontend/src/ui/protection-curves/__tests__/FrtHvrtCurves.test.tsx`.
- NOWY: `scripts/ui_no_physics_guard.py`.
- EDYCJA: `CLAUDE.md` (dopisanie guarda do listy).
- NOWY test: `backend/tests/ci/test_ui_no_physics_guard.py`.

## 2. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD` (HEAD zawiera commit tej karty lub nowszy). Środowisko:
symlink `node_modules` (NIE commituj), venv główny D2vgvUMQ dla Pythona.
- Część A: `npm run type-check`, `npm run lint -- --max-warnings 0`, pełny
  `npm test` ZERO failed (do pliku, nie na goły potok; pętla `until` przed
  pełnym biegiem; po biegu NATYCHMIAST commit).
- Część B: `python scripts/ui_no_physics_guard.py; echo $?` = **0 na HEAD**;
  `pytest tests/ci/test_ui_no_physics_guard.py -q` zielony; pozostałe guardy
  bez regresji: `overlay_no_physics_guard`, `no_raw_ids_in_ui_guard`,
  `forbidden_ui_terms_guard`, `ui_terminology_guard`, `utf8_mojibake_guard`,
  `v12xx_canon_guard` (venv główny).
Commit (BEZ push): `chore(ui): usuniecie sieroty FrtHvrtCurves + guard zero-fizyki
w UI (U5-UI-HIGIENA)`. Raport standardowy: plik:linia, potwierdzenie braku
konsumenta FRT, wynik guarda na HEAD, lista ewentualnych allowlist z uzasadnieniem,
wyniki pełnego vitest i testu guarda.

## 3. ZAMKNIĘCIE (2026-07-18, tryb orkiestracji: wykonawca Opus + zarządca Fable)
- **Część A** (`24ab180e`, cherry-pick z `73542c1b`): sierota `FrtHvrtCurves` +
  test usunięte (297 linii). Weryfikacja zarządcy: brak konsumenta (grep pusty),
  type-check 0, pełny vitest 663 plików / 8900 passed / 0 failed.
- **Eskalacja wykonawcy** → decyzja zarządcy §0.5 + inwentarz długu
  `DLUG_FIZYKA_W_UI_2026-07.md` (`2c29e174`).
- **Część B** (`6d51be37`, cherry-pick z `4e5fafb0`): `ui_no_physics_guard.py`
  (zakres `ui2/**`, anty-false-positive `current`, wykrywa √3/impedancję/dUdP·dUdQ/
  deltaU), wpięcie do CLAUDE.md, test `tests/ci/test_ui_no_physics_guard.py`
  (5 passed). Niezależna weryfikacja zarządcy: guard exit 0 na HEAD; **potwierdzone
  że NIE jest ślepy** — wykrywa realną fizykę w `ui/**` (`cableSelectionContract.ts`
  4 trafienia, `earthingFaultCurrent.ts` 1), zielony na ui2 bo ui2 jest czysty;
  regresja 6 guardów exit 0. **KARTA ZAMKNIĘTA.** Dług fizyki w `ui/**` = osobna
  epika relokacji (inwentarz), egzekwowana przy migracji ui/**→ui2.
