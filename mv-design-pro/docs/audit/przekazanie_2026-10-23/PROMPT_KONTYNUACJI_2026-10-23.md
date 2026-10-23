# Prompt kontynuacji obu wątków — 2026-10-23

Dwa prompty startowe dla nowych rozmów: **A** — wątek prowadzący (architekt programu, integrator
B-01), **B** — wątek wykonawczy UI/UX przemysłowy. Każdy wkleja się w całości jako pierwszą
wiadomość nowej sesji. Stan, na którym oba stoją: plan A/B `docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md`
§7 (wiersze 2026-10-21…23) i §14.4; przekazanie z dowodami, kartami i zrzutami na gałęzi archiwalnej
`claude/mv-design-pro-twin-audit-u4lhy0-przekazanie` (`mv-design-pro/docs/audit/przekazanie_2026-10-23/PRZEKAZANIE.md`,
nie do scalenia).

---

## A. Wątek prowadzący — architekt programu

Jesteś architektem i integratorem MV-DESIGN-PRO (rola z `CLAUDE.md`, drzewo agentów z
`.claude/agents/`, metody z `mv-design-pro/ORKIESTRACJA_AGENTOW.md` §3–§3a). Prowadzisz gałąź
programu `claude/mv-design-pro-twin-audit-u4lhy0` i koordynujesz wątek UI/UX przez
`mv-design-pro/docs/uiux/KOORDYNACJA_WATKOW_2026-10.md` na gałęzi
`claude/mv-design-pro-twin-audit-u4lhy0-karta-uiux-przemyslowy` (ostatni wpis: 15). Decyzje
B-01 kart rdzenia wydajesz sam po niezależnej weryfikacji; werdykt wizualny B-02 należy do
właściciela. Nie pytasz o kolejność ani o plan — decydujesz i meldujesz wynik z dowodem.

**Stan wejściowy (zweryfikuj na `origin` przed działaniem — repo jest prawdą, ten tekst nie):**
- Program: `d543faf3c`, CI 9/9 zielone (partia zwarć + karta DETERMINIZM-HISTORII-PROCESU).
- Partia 2 (`…-partia-2`): LINIA-110, PODSTAWA-Q, dane przyjęte wkładów, scalenie programu i ten
  dokument z aktualizacją planu. Bramka scalenia `d543faf3c..db1c688a5` zielona (pytest 38 798,
  vitest 4 604, guardy). Brakuje: pełnej zieleni CI 9 workflowów na czubku gałęzi → wtedy
  fast-forward programu (`git merge-base --is-ancestor` najpierw, nigdy force).
- Karta DANE-PRZYJETE-EKRANY (`…-dane-przyjete-ekrany`, `753e1763a` + `5703c2d29` WIP):
  dyskretny zapis danych przyjętych przy każdym wyniku; dwa defekty z recenzji naprawione.
  Niedokończone: naprawa selektora „najnowszy przebieg” w 11 miejscach
  (`frontend/src/ui/study-cases/porzadekPrzebiegow.ts`) bez biegu vitest; bieg backendu przerwany
  z 9 czerwonymi (prawdopodobnie piny tekstów/odcisków — każdy z uzasadnieniem, bez maskowania);
  zrzuty obu motywów po naprawie selektora. Po domknięciu: Twoja weryfikacja, scalenie po partii 2.
- Kolejka kart rdzenia z audytu PR #488 (plan §14.4): BILANS-THEVENIN, Y0-WYSPY (tylko rdzeń:
  SLACK `core/ybus.py:188` + inwentarz klasy 1e6), CZESTOTLIWOSC, PROFIL-NORMY, ZEROWA-POJEMNOSCI
  (po GPZ-H5-SKLADOWA-ZEROWA wątku UI/UX), przegląd konsumentów I_b, słownik
  `NAZWY_RODZAJOW_GENERATORA_PL`. Otwarte karty §14.2: SC-WYROCZNIA-SN-TR-NN, KSR-SKLAD-DER,
  SZABLONY-BEZ-DOMYSLOW, KSR-KRYTERIA-POMIAR.
- Później: żywe zrzuty menu i GPZ (oba motywy) do oceny B-02; `e2e/czasy_specow.json`; nagłówek
  STAN_REPO; dokument rozpatrzenia recenzji SLD z 2026-10-21 (na gałęzi przekazania, `karty/`) do repo.

**Cel sesji:** partia 2 i karta danych przyjętych w programie z zielonym CI, potem kolejne karty
rdzenia z kolejki — każda z inwentarzem klasy, testami jako iloczynem cech, iniekcjami, sondą
liczbową zmienionych wartości z podstawą normową (IEC 60909-0:2016; wydanie 2026 tylko jako
odrębny zablokowany profil) i wierszem w §7 planu. Wątek UI/UX dostaje rozstrzygnięcia przez
kolejne wpisy koordynacji; najwyższy priorytet po jego stronie to tabela „Wkłady do zwarcia” bez
źródła sieciowego (wpis 15 pkt 3).

**Granice (twarde):** bez PR i bez scalania do `main` bez decyzji właściciela; PR #475 i #488 nie
do scalenia; nie czytasz `scratchpad/decyzje_wlasciciela.md` ani `STAN_REPO §7 J` (także
subagenci); zakaz force push, `git commit --amend`, rebase cudzych gałęzi, gołego `git stash`,
`git reset --hard`, `git clean -x`, `pkill -f`; nie scalasz niezwalidowanego laboratorium dynamiki;
kontrakty FROZEN tylko z podniesieniem wersji; determinizm i fikstury wyłącznie generatorem
(`backend/scripts/eksport_fixtur_harnessu.py`, `--sprawdz`); tekst norm tylko parafrazą; commit
jako `radekizk-sketch <radek.izk@gmail.com>`, `--cleanup=verbatim`, bez identyfikatorów modeli.
Zielone CI nie jest wystarczającym dowodem — dowodem jest Twoja niezależna weryfikacja.

**Praktyka środowiska:** jeden ciężki bieg naraz (pytest `-n 2`, vitest
`--poolOptions.forks.maxForks=2 --poolOptions.forks.minForks=1`); bramka scalenia
`scripts/bramka_scalenia.py --baza X --glowa Y --procesy 2` trwa ~65 min — uruchamiaj w tle
z limitem ≥ 2 h; prywatny `--basetemp` usuwany po biegu (pełny dysk zabił już jeden bieg); po
dodaniu pliku w zakresie strażnika podstawień pin samotestu
`scripts/test_solver_input_substitute_guard.py` mierzysz guardem; Ubuntu 26.04 (CI) różni się
od kontenera o 1 ulp w `abs(complex)` — wyrocznie porównujące dokładnie liczą przez
`network_model/core/modul_zespolony.py`; Chromium: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium`,
bez `playwright install`.

**Kryterium ukończenia meldunku:** dla każdej karty — commit, kody wyjścia bramek, sonda,
iniekcje, CI na czubku; uczciwie, co niedomknięte i dlaczego.

---

## B. Wątek wykonawczy UI/UX przemysłowy

Jesteś wykonawcą programu UI/UX przemysłowego (kontrakt `docs/uiux/KONTRAKT_UIUX_PRZEMYSLOWY_2026-10.md`,
plan `docs/uiux/PLAN_UIUX_PRZEMYSLOWY_2026-10.md`). Pracujesz i wypychasz wyłącznie na gałąź
`claude/mv-design-pro-twin-audit-u4lhy0-karta-uiux-przemyslowy` (czubek `fa129e7dd` na
2026-10-23 — sprawdź `origin`). Kolejność kart i rozstrzygnięcia B-01 wydaje wątek prowadzący
we wpisach `docs/uiux/KOORDYNACJA_WATKOW_2026-10.md`; Ty meldujesz tam stan i prośby nowym
wpisem. Zakres GPZ H5 wg decyzji właściciela (wpis 11): sieć SN w pełni; 110 kV wyłącznie
funkcjonalnie — źródła, pola/przyłącza zasilające, transformatory 110/SN, łączniki i topologia
wpływające na SN; bez projektowania pól 110 kV, przekładników, napędów, uziemników i osobnego
modułu 110 kV.

**Najpierw przeczytaj wpisy 11–15 koordynacji.** Wynika z nich kolejka:
1. Czerwone strażniki gałęzi (wpis 15 pkt 2) — naprawa u źródła przed kolejnym pushem:
   `domain_ops_unified_guard` (`KreatorPolaSn.test.tsx:451`), `tsconfig_gate_guard`
   (`czujnikLadunkow.test.ts:42,44`), `werdykt_wyjasnialny_guard` (`generatorSnModel.ts:141` —
   próg 1 kV liczony we froncie, rozstrzygnięcie ma przyjść z backendu;
   `StationConfiguratorSurface.tsx:831`; `PanelKartWidmowych.tsx:214`), ruff
   `scripts/pobierz_zrodla_techniczne.py`, `inwentarz_katalogow_guard` (regeneracja
   `backend/scripts/inwentarz_katalogow.py`).
2. Tabela „Wkłady do zwarcia” pomija źródło sieciowe (wpis 15 pkt 3) — wiersze z `wklady_zrodel`,
   szczegół maszyny z `/api/proof/sc3f/contributions`; projektant widzi dziś fałszywy 100 %
   udział generatora. Blok danych przyjętych w `ui2/wyniki/zwarcia/**` należy do karty
   DANE-PRZYJETE-EKRANY linii programu — nie przenosisz go i nie duplikujesz.
3. Karta GPZ-H5-APARATURA (cała aparatura pól SN, wpis 13 pkt 1 z warunkami B-01; defekty z
   wpisu 14 pkt 1–2: U_m 6 kV = 7,2 kV, rola `surge_ground` ogranicznika, sprzęgło GPZ z
   `catalog_ref: None` w `enm/domain_operations.py`, pickery ui2 bez filtra napięciowego,
   `KartaTechniczna.tsx` ukrywająca `null` — „brak danych” / „nie dotyczy” z
   `network_model/catalog/rodzaje_aparatury.py`). Materiał wejściowy: gałąź
   `…-aparatura-wn-wklad-sn` (`ec4de7748`, nie do scalenia, przenosisz wybiórczo).
4. Karta GPZ-H5-SKLADOWA-ZEROWA (wpis 13 pkt 2) — cała strona `enm/mapping.py` składowej
   zerowej: ZU z `GroundingConfig`, `Transformer.hv_neutral`, usunięcie `1e6`, trzy przyczyny
   braku wyniku; testy iloczynu z wpisu 13; rdzenie B-01 nietknięte.
Zmiany rdzenia linii programu (`modul_zespolony`, polityka 1 wątku BLAS, `kat_deg` = `None`,
`build(*, siec_zwarciowa)`) dotrą do Ciebie przez scalenie programu — wyrocznie porównujące
dokładnie z `abs()` liczby zespolonej przepisujesz na `modul_zespolony`.

**Granice:** bez PR i bez scalania; push tylko na swoją gałąź; rdzenie B-01 bez zgody wątku
prowadzącego nietknięte; zero fizyki w UI (wartości z backendu); ZASADA NR 4 — brak danej
katalogowej = wartość robocza `ESTIMATED` z wpisem w `dane_przyjete`, kompletność `NIEPELNY`;
werdykt zawsze z wyjaśnieniem; B-02 wystawia właściciel — publikujesz zrzuty żywej aplikacji
w obu motywach, nie certyfikujesz wyglądu. Te same zakazy git i zasady commitów co w części A.

**Kryterium ukończenia karty:** pełna regresja właściwej warstwy, guardy (`scripts/guardy_z_ci.py`),
determinizm, iniekcje, zrzuty; wpis w koordynacji z hashami i kodami wyjścia.
