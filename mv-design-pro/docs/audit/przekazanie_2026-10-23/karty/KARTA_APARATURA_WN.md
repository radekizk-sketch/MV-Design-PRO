# Karta KATALOG-APARATURA-WN — aparatura pól 110 kV i zespołu uziemiającego, jedna prawda aparatu pola

Worktree: /tmp/claude-0/-home-user-MV-Design-PRO/72c31ae8-8c05-5345-a2a0-6f7019e05b56/scratchpad/wt/aparwn
(gałąź `claude/mv-design-pro-twin-audit-u4lhy0-aparatura-wn`, baza = czubek gałęzi programu; `frontend/node_modules` = dowiązanie, nie commituj).
Jeden commit lokalny bez push. Autor radekizk-sketch <radek.izk@gmail.com>, `--cleanup=verbatim`, stopka:
    Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_0171VVpvwNs6Dgz67xnmQpux

## Po co
Właściciel ocenił ekran GPZ H5 na 3/10 (B-02); wzorzec H5 wg ENEA Operator Zeszyt 1 wymaga rzeczywistej aparatury
w polach 110 kV i pola zespołu uziemiającego SN (Z.13–Z.15, §16). Pomiar wątku UI/UX
(`docs/plan/GPZ_H5_LANCUCH_APARATURY.md` i `docs/zrodla/ODCZYT_ENEA_H5_SPECYFIKACJA.md` na gałęzi
`claude/mv-design-pro-twin-audit-u4lhy0-karta-uiux-przemyslowy` — czytaj przez `git show`) wykazał: katalog ma aparaturę
tylko do 24 kV, brak ZU jako aparatu, dwa źródła prawdy „jaki aparat stoi w polu”, martwy zapis `meta.apparatus_proposal`.
Rozstrzygnięcie architekta: wpis 9 w `docs/uiux/KOORDYNACJA_WATKOW_2026-10.md` (ta sama gałąź).

## Rozstrzygnięcie (§0, wiążące)
1. Katalog (istniejące przestrzenie i typy — rozszerzasz, nie tworzysz równoległych; reguła 10 i
   `SPEC_KATALOGI_I_MATERIALIZACJA_PARAMETROW.md`): wyłącznik, odłącznik, uziemnik, odłącznik z uziemnikiem 110 kV
   (U_m 123 kV); CT z polem napięcia izolacji U_m (rozszerzenie `CTType` — addytywne) i CT 110 kV z rdzeniami jak w
   ENEA Z.1/Z.2 (150-300/1/1/1/1 A, kl. 0,2 FS5 / 5P20); VT 110/√3 / 0,1/√3 / 0,1/√3 kV; ogranicznik 110 kV
   (Ur ≥ 96 kV — ustal z odczytu), ogranicznik i odłącznik punktu neutralnego 110 kV (72,5 kV wg Z.1); transformator
   uziemiający SN z Z0, dławik (z regulacją) i rezystor jako aparat pola ZU. Każda dana: podstawa (norma wyrobu z numerem
   tabeli: PN-EN 62271-100/-102, PN-EN 61869-2/-3, PN-EN 60099-4, PN-EN 60076-6, standard ENEA z punktem/stroną) albo
   `ESTIMATED` z jawnym założeniem.
2. Rodzina rozdzielnicy 110 kV w `switchgear/families.py`; szablony pól 110 kV (linia, transformator, sprzęgło, pomiar),
   EARTHING i CAPACITOR w `bay_templates.py` (+ `BAY_PRIMARY_APPARATUS_KINDS_BY_ROLE`).
3. Jedna prawda aparatu pola: źródłem jest gałąź łącznikowa / element z wiązaniem katalogowym (to wchodzi do fizyki
   i weryfikacji wytrzymałości). `Bay.primary_devices` — inwentarz konsumentów, potem projekcja z modelu albo kasacja
   (bez warstwy zgodności). `set_bay_equipment` sprawdza napięcie znamionowe aparatu względem napięcia pola i niesie
   stan „wymagane standardem / zaprojektowane / brakujące”; lista „wymagane standardem” wyprowadzana z szablonu pola.
4. Martwy zapis `meta.apparatus_proposal` (`hv_bay_apparatus_proposal`) — skasuj, zastąp punktem 3.
5. ZU w modelu: nośnik punktu neutralnego to istniejący `GroundingConfig` (`enm/models.py:45-52`) + katalog
   `MvNeutralGroundingItem` (`audit2_catalogs.py:1176-1260`) — połącz z aparatem ZU, bez drugiego nośnika. Metoda
   uziemienia to decyzja projektanta; brak decyzji → propozycja wg ENEA §16 jako `ESTIMATED` w `dane_przyjete`
   (ZASADA NR 4), żeby zwarcie 1F SN liczyło się od razu. Wpięcie w ścieżkę Z0 zwarć: tylko przez istniejące dane
   wejściowe solvera (bez zmian rdzeni B-01 — `scripts/rdzenie_b01.py`; jeśli bez zmiany rdzenia się nie da — STOP
   i meldunek z plik:linia).
6. API (OpenAPI, macierz API) i typy frontu dla nowych pozycji; formularzy/SLD nie budujesz — w meldunku wypisz, gdzie
   wątek UI/UX ma czytać nowe pola.

## Testy
Iloczyn cech: {rodzaj aparatu} × {pole 110 kV, pole SN} × {zgodne napięcie, niezgodne} × {wymagany/zaprojektowany/brakujący};
ZU: {dławik, dławik‖rezystor, rezystor, brak decyzji → ESTIMATED} × zwarcie 1F SN liczy się; jedna prawda: zmiana aparatu
w gałęzi widoczna w projekcji pola i w weryfikacji wytrzymałości. Iniekcje (czerwień): aparat 24 kV w polu 110 kV
przyjęty; brak oznaczenia ESTIMATED; projekcja pola rozjechana z gałęzią. Determinizm.

## Granice
Nie ruszaj rdzeni B-01, `ui/sld/**`, `ui2/**` poza typami/adapterami API, operacji GPZ wątku UI/UX
(`enm/domain_operations.py` ~4240–4710) poza punktem 3–4 (tam dozwolone minimum, z opisem w meldunku), katalogu
przewodów linii 110 kV (karta LINIA-110, inny worktree). Zakazy: `git stash`, `reset --hard`, `pkill -f`, `--amend`,
`clean -x`, push; nie czytaj `scratchpad/decyzje_wlasciciela.md` ani `STAN_REPO §7 J`. Logi: `scratchpad/aparwn/`.

## Kryterium ukończenia (kody wyjścia łapane bezpośrednio)
Pełna regresja backend `-n 3 --dist loadfile -m "not pandapower and not andes"` rc=0; vitest pełny, tsc, eslint rc=0;
guardy `catalog_*`, `physics_label`, `werdykt_wyjasnialny`, `canonical_ops`, `api_lifecycle`, `docs`, `mypy_ratchet`,
`solver_diff` + samotesty rc=0; black/ruff rc=0. Meldunek: źródła z numerami, inwentarz klasy (oba źródła prawdy
aparatu i ich konsumenci), wyniki iniekcji, hash commitu.

## ZMIANA ZAKRESU 2026-10-22 (decyzja właściciela, nadrzędna wobec §0 pkt 1–2)
110 kV = funkcjonalna granica zasilania. Wycofane: CT/VT 110 kV, CTType.U_m (o ile nie służy SN), uziemniki,
odłączniki z uziemnikiem, ograniczniki, osprzęt punktu neutralnego 110 kV, rodzina rozdzielnicy 110 kV, szablony pól 110 kV.
Zostaje: jeden minimalny typ łącznika 110 kV na rodzaj (W, OS; U_m 123 kV; ESTIMATED) do wiązania katalogowego i stanu;
pkt 3–6 w pełni dla SN; szablony SN EARTHING, CAPACITOR i uzupełnienie łańcucha aparatury SN (z głowicami kablowymi).
Wpis 11 w KOORDYNACJA (ba416b71f).
