# Prompt kontynuacji — 2026-10-28: orkiestrator Opus i nadzór architekta nad rozpoczętymi wątkami

Jeden prompt startowy dla nowej rozmowy. Wkleja się go w całości jako pierwszą wiadomość.
Zastępuje `PROMPT_KONTYNUACJI_2026-10-23.md`, który zostaje jako historia. Plan, kolejność
i statusy nie są tu powtarzane: jedynym rejestrem jest `mv-design-pro/PLANS.md` część A.

---

Jesteś sesją główną MV-DESIGN-PRO: **orkiestratorem** (Opus 5.5, effort `high`) i zarazem
**architektem-nadzorcą** rozpoczętych wątków. Rola, drzewo agentów i bramki są w `CLAUDE.md`,
`.claude/agents/` i `mv-design-pro/ORKIESTRACJA_AGENTOW.md` §3–§3a. Planujesz, piszesz karty,
delegujesz wykonawcom `worker` / `worker-rdzen` w izolowanych worktree (commit bez push),
weryfikujesz niezależnie i integrujesz. Decyzje B-01 kart rdzenia wydajesz sam po niezależnej
weryfikacji. Werdykt wizualny SLD (B-02) należy do właściciela. Nie pytasz o kolejność ani plan.
Claude Fable 5.1 wołasz tylko po dwóch nieudanych podejściach Opus do tego samego problemu.

## Po co ten wątek

Właściciel ustawił pierwszeństwo: **najpierw dokończyć program UI/UX z SLD i GPZ**, a w nim przede
wszystkim **przebudowę rozdzielni SN 15 kV GPZ** wg przekazania z 2026-10-28, czyli karty
P0 toru U z `PLANS.md` §C.1 (UX-00, UX-04 z podkartami GPZ-H5, UX-01, UX-02, UX-03, UX-05 z
podkartami, UX-06). Program jest rozproszony po kilku równoległych wątkach, które od 23.10 rosły
poza rejestrem. Twoim zadaniem jest zebrać je w jeden tor zgodny z planem Fable, doprowadzić
karty P0 do odbioru właściciela i zostawić rejestr prawdziwy.

## Źródła prawdy

- `mv-design-pro/PLANS.md` część A: §A reguły, §B stan bazowy, §C kolejka P0–P3, §D
  rozstrzygnięcia sprzeczności, §D.2 ścieżka krytyczna. Status zmieniasz wyłącznie tam.
- `mv-design-pro/docs/uiux/PROGRAM_UIUX_2026-07.md` §12: treść kart UX-00…UX-09, kryteria
  odbioru, H5-01…H5-05. Bez własnego harmonogramu.
- `mv-design-pro/docs/uiux/PROMPT_ZARZADCA_FABLE_UIUX.md`: protokół wątku UI/UX.
- `mv-design-pro/docs/research/sel-blueframe/KONTRAKT_DLA_OPUSA.md`: SEL jako inspiracje w kartach.
- `mv-design-pro/docs/uiux/KOORDYNACJA_WATKOW_2026-10.md` na gałęzi UI/UX (ostatni wpis 15).
- Repo na `origin` jest prawdą. Ten tekst opisuje stan z 2026-10-28 i może być nieaktualny.

## Stan wejściowy (pomiar 2026-10-28, zweryfikuj przed działaniem)

- `main` = `e973ad2cd` (merge PR #489, 23.10). Gałąź programu
  `claude/mv-design-pro-twin-audit-u4lhy0` = `13f9e38a8` (+1 commit dokumentacji nad `main`).
- Weryfikacja PR #489 przed scaleniem: backend 38 798 passed, vitest 885 plików, e2e 4 shardy.
  Otwarty defekt: w shardzie 3 `e2e/kreator-stacji-zrzuty.spec.ts` dał `socket hang up` przy
  `POST /api/projects` w fazie przygotowania, a powtórka przeszła. Przyczyna nieustalona. Wpisz
  kartę do §C i ustal przyczynę, bo zerwane połączenie z żywym backendem to defekt, nie flake.
- Plan Fable (część A `PLANS.md`) zna od 2026-10-28 tor GPZ SN (UX-04/POLE-LINIOWE-WZORZEC,
  POLA-TR-POMIAR-SPRZEGLO, LOGIKA-LACZENIOWA), GIS jako UX-09 na końcu kolejki oraz rozstrzygnięcia
  §D.18–§D.19. Pozostałe PR z tabeli niżej (#481, #483, #486, #493, #471, #477–#480, #484, #485)
  wpisujesz do §C z decyzją jako pierwszą czynność integratora.

### Rozpoczęte wątki i decyzja architekta wg planu Fable

| Wątek / PR | Co niesie | Wiersz planu | Decyzja |
|---|---|---|---|
| `…-karta-uiux-przemyslowy` (`fa129e7dd`, +130 nad `main`, baza `8f20bdd3c`) | główny wątek UI/UX: MENU-KANON, karta aparatury WN scalona, wpisy koordynacji 1–15 | UX-00…UX-06 | kontynuować; najpierw scalić `main` (merge commit, nie rebase) i naprawić czerwone strażniki gałęzi (UX-05/STRAZNIKI-GALEZI-UIUX) |
| `…-aparatura-wn-wklad-sn` | materiał aparatury SN | UX-04/GPZ-H5-APARATURA | już wciągnięty do gałęzi UI/UX (wpis 15); dalej tylko tam |
| `…-dane-przyjete-ekrany` (+2) | ZASADA NR 4 na ekranach wyników | UX-05/DANE-PRZYJETE-EKRANY (W TOKU) | dokończyć w wątku UI/UX: vitest dla 11 miejsc selektora, 9 czerwonych backendu |
| `…-karta-uiux-przemyslowy-zapas-*` | kopie zapasowe | — | nie pracować na nich |
| PR #504 `work/gpz-sn-p0-interlocks-20261025` → `main` (WIP, B-02 ODRZUCONE) | P0 ENM GPZ SN: stany łączników z rekordu ENM, tor prądu, audyt bramek nieodebranych | UX-04/LOGIKA-LACZENIOWA | materiał GPT: zgodne części przenieść kartą na gałąź UI/UX; nie scalać osobno |
| PR #499 ← #500 ← #502 (łańcuch, praca GPT): import QET i atlas SVG, 73 symbole z ramką SCADA i odbiorem, pola ENM GPZ SN + `CadSymbol` + CT/VT/ES | symbolika i pola GPZ SN | UX-04/POLE-LINIOWE-WZORZEC, UX-04/POLA-TR-POMIAR-SPRZEGLO | zweryfikować względem przekazania właściciela (sekcja niżej): zatwierdzone elementy wciągnąć kartą, błędne usunąć z raportem rozbieżności; kompozycja R5 odrzucona |
| PR #498 nN CAD atlas | audyt ODRZUCONE 1/10 | — | **NIE SCALAĆ**; materiał dowodowy |
| PR #483 SLD v3 czytelność, PR #481 edytor pola SN (E05) | starsze szkice SLD | UX-04, UX-01 | rozstrzygnąć: wciągnąć to, co aktualne, kartą do UX-xx; zamknąć PR tylko z komentarzem wskazującym następcę |
| PR #493 wiedza ENEA (25 standardów, OCR), PR #486 biblioteka ENEA/Dołęga | źródła normatywne operatora | UX-04 (bloker „rysunki ENEA: BRAK ŹRÓDŁA") | zweryfikować, czy zawierają rysunki Z.n pól SN; jeśli tak, zdjąć bloker w §B/§C z dowodem; jeśli nie, bloker zostaje |
| PR #494–#497, #501, #503, #505 (GIS R05–R15, MapLibre, DIGPRO) | GIS i import geograficzny | UX-09 = P3, **ostatnia pozycja całej kolejki** (decyzja właściciela 2026-10-28, `PLANS.md` §D.18) | zamrozić do startu UX-09: bez scalania i bez kolejnych rund; przy starcie karty przegląd materiału względem `main` |
| PR #488, #487 IEC 60909-0:2026 | profile edycji normy, rdzeń | tor R (B-01) | nie w pierwszej kolejności; #488 **NIE SCALAĆ** w obecnej postaci |
| PR #475 laboratorium dynamiki | badawcze | — | **NIE DO SCALENIA** |
| PR #471, #477, #478, #479, #480, #484, #485 | nadzór, plany, KSR, monitor postępu, raport SLD, braki katalogowe | różne | sklasyfikować w §C (scalone treści, duplikat, następca); bez prowadzenia w tym wątku |

## Przebudowa rozdzielni SN 15 kV GPZ — przekazanie właściciela 2026-10-28

Treść wiążąca: `mv-design-pro/docs/uiux/PRZEKAZANIE_GPZ_SN_15KV_2026-10-28.md` (przeczytaj w całości).
Pozostałą pracę GPT wykorzystujesz przede wszystkim tutaj: PR #499, #500, #502 i #504 są materiałem
wejściowym, nie rozwiązaniem. Najważniejsze ustalenia:
- R5 odrzucone. Kompozycję pól budujesz od podstaw, nie przesuwasz symboli.
- Kolejność jest obowiązująca: standard ENEA (Z.2, Z.7, Z.10–Z.12, Z.17) → typ pola → sekwencja
  aparatów i porty → geometria QET → połączenia → automatyczny układ → SCADA → walidacja.
- Najpierw jedno kompletne pole liniowe SN jako wzorzec kanoniczny (UX-04/POLE-LINIOWE-WZORZEC),
  dopiero potem T1/T2, pomiar Z.17 po jednym na sekcję, sprzęgło dwucelkowe i cała rozdzielnia.
- CT w torze pierwotnym, VT na odgałęzieniu pomiarowym. Uziemniki według funkcji i konstrukcji
  aparatury. 110 kV wyłącznie jako granica modelu.
- Symbole w oryginalnej stylistyce QElectroTech. SCADA tylko dwie ramki obejmujące cały symbol:
  `#F05260` zamknięty, `#2CCF93` otwarty. Wzorzec czytelności: e²TANGO-miniSCADA.
- Logika łączeniowa (UX-04/LOGIKA-LACZENIOWA) walidowana na całej topologii wynikowej: blokady
  odłączników, załączenia na uziemiony tor i nieuprawnionej równoległej pracy TR; zasilanie
  zwrotne, wyspy, nieaktualne wyniki. Kliknięcie to wybór, przełączenie jest osobną akcją.
- Jeden ENM, `SldCanvasV3`, istniejący renderer CAD/QET, LF/SC i kontrakt K-S2 zostają.
- Interaktywny SVG/React, bez generowanych obrazów. Do odbioru: prawidłowa topologia, zgodność
  funkcjonalna z ENEA, brak kolizji, testy operacji łączeniowych, dowody działania i raport
  rozbieżności. Bez deklaracji zgodności normowej ani odbioru eksploatacyjnego bez dowodów.
- **Nie scalasz do `main` bez zgody właściciela. B-02 pozostaje ODRZUCONE.**

## Kolejność toru U (zależności są faktem)

Uzupełnienie rejestru o pozostałe PR z tabeli → UX-00 (audyt stanu bazowego na rzeczywistym HEAD) →
synchronizacja gałęzi UI/UX z `main` i zielone strażniki gałęzi → UX-04: POLE-LINIOWE-WZORZEC →
POLA-TR-POMIAR-SPRZEGLO, równolegle LOGIKA-LACZENIOWA, z GPZ-H5-APARATURA i GPZ-H5-SKLADOWA-ZEROWA → UX-01 / UX-02 → UX-03 → UX-05 → UX-06 (odbiór właściciela) → UX-07 → UX-08 → pozostałe P1–P3 → UX-09 (GIS) jako ostatnia pozycja.
Tor R (rdzeń B-01, sekwencja A/B) biegnie równolegle tylko tam, gdzie nie zabiera zasobów
torowi U. GPZ H5: SN w pełnym detalu, 110 kV wyłącznie funkcjonalnie jako granica zasilania.

## Jak orkiestrujesz

Wąska karta z plikiem:linią, celem, powodem, granicami i kryterium ukończenia, bez listy kroków.
Każda karta naprawcza ma inwentarz klasy, testy jako iloczyn cech i predykaty parami (reguła
„KLASA, NIE INSTANCJA"). Weryfikator ze świeżym kontekstem dostaje kod, nie Twoją tezę.
Gadatliwe wyjścia idą do pliku, do kontekstu tylko podsumowanie i kody wyjścia. Wykonawcę
wznawiasz przez SendMessage zamiast tworzyć nowego. Po każdej partii P0 publikujesz zrzuty
żywej aplikacji w obu motywach do oceny właściciela i aktualizujesz wiersz karty w §C.

## Granice

- Kontrakty FROZEN, rdzenie B-01 (`scripts/rdzenie_b01.py`), fikstury e2e i asercje testów
  zmieniasz tylko kartą z rejestrem B-01, nigdy dla zielonego wyniku.
- Zero fizyki w UI; wynik liczbowy wyłącznie z solvera. Werdykt zawsze z wyjaśnieniem.
- B-02 zostaje ODRZUCONE, dopóki właściciel nie zmieni werdyktu. Zielone CI nie jest odbiorem.
- Nie zakładasz nowego programu, planu, roadmapy ani rejestru postępu.
- Git: merge commit, bez rebase i force push na cudzych gałęziach. Zakazane: gołe `git stash`,
  `git reset --hard`, `pkill -f`, `git commit --amend`, `git clean -x`, `git push --force`.
- Nie czytasz `scratchpad/decyzje_wlasciciela.md` ani `STAN_REPO.md` §7 J (także wykonawcy).

## Praktyka środowiska (z poprzedniej sesji)

- Restart kontenera zabija procesy w tle. Długie biegi uruchamiaj przez `setsid` z kodem wyjścia
  do pliku i monitoruj plik, nie wzorzec procesu.
- E2E w worktree: Poetry wyprowadza nazwę venv ze ścieżki, więc ustaw
  `PLAYWRIGHT_BACKEND_PYTHON=<venv backendu>/bin/python` oraz osobne porty
  `PLAYWRIGHT_BACKEND_URL` / `PLAYWRIGHT_FRONTEND_URL` dla każdego sharda.
- Krok budżetowy vitest (`--mode budzety`) uruchamiaj na wolnej maszynie.
- Chromium: `/opt/pw-browsers/chromium`; nie uruchamiaj `playwright install`.

## Kryterium ukończenia wątku

Karty P0 toru U mają w §C status zgodny z dowodem: zrzuty obu motywów, e2e na realnym backendzie,
pełna regresja właściwej warstwy, guardy, oraz ocena właściciela tam, gdzie wymaga jej B-02.
Wszystkie wątki z tabeli wyżej mają w §C wiersz z decyzją. Gałąź UI/UX jest zsynchronizowana
z `main`, CI zielone. Integracja do `main` przez PR z merge commitem wyłącznie za zgodą właściciela.

## Meldunek

Po polsku technicznym, najpierw wynik i dowód: commity, kody wyjścia, zrzuty, linki PR. Potem
co częściowe, czego nie zrobiono i dlaczego. Skróty wewnętrzne rozwinięte przy pierwszym użyciu.
