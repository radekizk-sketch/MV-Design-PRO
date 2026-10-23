# Meldunek — karta B01-RUNDA-3 (O-59, plan A/B §12.2 (d), (k), (l), (m))

Gałąź: `claude/mv-design-pro-twin-audit-u4lhy0-karta-b01-runda3`, baza `aa89f63a` (runda 1).
Commity karty: `1677c09e` (kod, testy, fikstury, piny), `39d98b48` (plan A/B §12.2 i STAN_REPO),
`75e7d336` (piny dwóch strażników po pierwszym biegu bramki), ten commit (meldunek).
Czubek kodu przed meldunkiem: `75e7d336`.

## 1. Wynik i dowody (kody wyjścia łapane bezpośrednio, plik wyniku + sentinel)

| Bramka | Wynik | RC |
|---|---|---|
| Pełna regresja backendu `OPENBLAS_NUM_THREADS=1 pytest -m "not pandapower and not andes"`, drzewo karty (`39d98b48`; `75e7d336` zmienia wyłącznie `scripts/`) | 27 217 passed, 10 failed, 6 errors, 37 deselected (5559 s) | 1 |
| Ta sama regresja na bazie `aa89f63a` | 27 177 passed, 10 failed, 6 errors, 37 deselected | 1 |
| Zbiór czerwonych karta vs baza (`diff` posortowanych identyfikatorów) | **identyczny, 16 pozycji — zero nowych czerwonych**; +40 passed = nowy test klasy | — |
| `python ../scripts/guardy_z_ci.py` (z `backend/`, czubek `75e7d336`) | 106/106 strażników, black/ruff jak CI, `type-check` i `lint` npm, samotesty `../scripts` 3341 passed — **KOMPLET ZIELONY** | 0 |
| `mypy_ratchet_guard` | 203 błędy w 32 plikach (pin 203/32; było 223/34 — dokładnie −20) | 0 |
| `solver_diff_guard` | PASS, 7 plików; odcisk odświeżony raz (`--init`), zmieniły się dokładnie 2 linie | 0 |
| `resultset_v1_schema_guard`, `nazwa_bez_identyfikatora_guard`, `solver_boundary_guard` | zielone w komplecie `guardy_z_ci` | 0 |
| Front `npm run type-check` / `npm run lint` | 0 błędów | 0 / 0 |
| Vitest plików czytających zmienione fikstury i ekran dowodu (`src/ui2/wyniki`, `src/ui/proof`, `src/harness-fixtures`, `src/ui2/oze/{ncrfg,wniosek,macierz}`) | 111 plików, 1730 testów | 0 |
| `eksport_fixtur_harnessu.py --sprawdz` przed regeneracją | rozjazd wyłącznie `zwarcia_rozplyw_scena_zwarcia.json` | 1 → po regeneracji zgodne |
| Nowy test klasy `tests/network_model/solvers/test_odmowy_strukturalne_rdzeni.py` | 40 passed | 0 |
| `docs_guard` | 0 naruszeń | 0 |

**Czerwień bazy (zmierzona na czystym `aa89f63a`, nie naprawiana w tej karcie — wypisana osobno zgodnie z kartą):**
- 6 × ERROR `tests/test_protection_settings_w3c2_identity.py::test_tozsamosc_przed_po_dla_istniejacych_wejsc[*]` —
  `git show a16f8d2b:…` kończy się kodem 128: obiektu nie ma w płytkim klonie kontenera (środowisko, nie kod).
- 8 × FAILED `tests/enm/migrations/test_nn_field_specs_promocja_aparat.py` — testy odwołują się do
  `_materializuj_aparat` / `materialize_catalog_binding`, których moduł po `3c246c08` już nie ma (test nieaktualny
  wobec kodu partii 6).
- FAILED `tests/domain/test_rejestr_kodow_bram_katalogowych.py` — kod `catalog.assign_failed` emitowany bez wpisu
  w `READINESS_CODES`.
- FAILED `tests/enm/test_nazwy_jedno_zrodlo.py::test_jeden_predykat_nazwy_w_calym_src` — lokalny predykat nazwy
  w `enm/validator.py:100` (`if nazwa`), wprowadzony w `3c246c08`.
Trzy ostatnie dotyczą plików gorących partii integracji 6 (rejestr kodów, walidator ENM) — do integratora.

## 2. Inwentarze klas (reguła KLASA, NIE INSTANCJA)

### (d) mypy w rdzeniach — 20 błędów + znalezisko spoza zgody
- `power_flow_newton_internal.py` ×19: zmienna pętli `spec` współdzielona przez pętle po `PVSpec`,
  `BusVoltageLimitSpec`, `BranchLimitSpec`, `TransformerTapSpec` (`validate_input`, 17 wierszy) i po
  `PQSpec`/`PVSpec` (`build_power_spec_v2`, 4 wiersze). Rozwiązanie: osobne nazwy zmiennych pętli (`pv_spec`,
  `bus_limit`, `branch_limit`, `tap`). **Forma spoza listy dozwolonych** (adnotacja / cast / isinstance / assert):
  zmiana nazwy zmiennej lokalnej jest równoważna semantycznie, a każda z dozwolonych form wymagałaby albo
  `type: ignore`, albo unii, której atrybutów mypy i tak by nie przepuścił. Zgłaszam jawnie.
- `short_circuit_iec60909.py` ×1 (`:646`): parametry `builder: object | None`, `z_bus: object | None` →
  `AdmittanceMatrixBuilder | None` (import tylko pod `TYPE_CHECKING`) i `np.ndarray | None`; zdjęte 3
  `type: ignore`. Ścieżka `builder=None` bez zmian (gałąź `build_zbus(graph)` zostaje, mypy zawęża po niej).
- **Znalezisko poza zgodą:** `v126_academic.py` ma 5 błędów mypy (`:1818` ×2, `:2129` ×2, `:2212`) — operacje na
  `float | None` i iteracja po `Any | None`. Nie należą do (d) i ich naprawa dotyka zachowania przy `None`;
  NIE ruszane — pozycja do decyzji B-01.

### (k) identyfikator maszynowy w treści komunikatu rdzenia
Inwentarz zmierzony (f-napisy, sklejanie `+ ", ".join(...)`, wyjątki i pola `message_pl`):
- `short_circuit_iec60909.py`: 4 × „Fault node '{id}' does not exist in graph” (3F, 1F, 2F, 2F+N) →
  `OdmowaWejsciaRdzenia` z rekordem `zwarcie.wezel_zwarcia_spoza_grafu` + odwołanie (węzeł).
- `power_flow_newton_internal.py`: 8 f-napisów z karty (`:337` węzeł bilansujący, `:387` granice Q węzła PV,
  `:391` granice napięcia, `:395` granica gałęzi bez wartości, `:399`/`:403` przekładnia spoza grafu / na
  nie-transformatorze, `:407` granica gałęzi spoza grafu, `:1292` przekładnia ≤ 0) **oraz 7 komunikatów tej
  samej klasy z innym nośnikiem**, których pomiar karty nie liczył: 6 × „duplicate …: " + ", ".join(ids)” (PQ, PV,
  bocznik, granice napięcia, przekładnia, granice gałęzi) i „both PQ and PV: " + join. Razem 16 rekordów
  walidatora (`odmowy_wejscia`) + rekord przekładni ≤ 0. Dwa komunikaty bez identyfikatora (moc bazowa, węzeł
  bilansujący z zadaniem PQ/PV) też przeszły na rekordy, żeby walidator miał jeden kształt; ich treść przeszła
  na polski (zmiana tekstu, nie predykatu).
- „Unsupported branch type: {branch.branch_type}” (NR `_get_branch_admittances_ohm`) — przejrzane, **zostawione**:
  wartość wyliczenia rodzaju gałęzi (nie identyfikator elementu), ścieżka nieosiągalna z danych (gałąź grafu to
  zawsze `LineBranch` albo `TransformerBranch`) — błąd programu, 500 z dziennikiem, nie komunikat dla projektanta.
- `v126_academic.py` (`:714-715`, jeden komunikat w 2 liniach) → `message_pl` bez identyfikatorów
  + `converter_ref`/`bus_ref` w wyniku (ten sam kształt co sąsiednia gałąź „brak pól karty”), `missing_fields`
  bez zmian; przedmiot oceny SSCI z nazwami z modelu składa już istniejąca granica
  `application/v126_artifacts.py::wynik_v126_dla_powierzchni` (test przypina).
- Pozostałe miejsca rdzeni z identyfikatorem w strukturze, nie w treści (klucz ≠ tekst): `contingency`
  `f"{a}+{b}"`, `parameter` `f"{ref}.uk_percent"` (front rozkłada `<ref>.<klucz>` na nazwę), klucze kroków.
- **Ta sama klasa w rdzeniu spoza zgody:** `short_circuit_core.py:76` („Fault node '{id}' does not exist in
  graph”) — rdzeń B-01 bez zgody w tej karcie, NIE ruszany. Poza rdzeniami (karta KOMUNIKATY-BEZ-ID):
  `machine_sc_iec60909.py:191`, `application/solvers/short_circuit_binding.py:162`, `core/ybus.py:250`.

**Droga do projektanta — pomiar:** odmowy walidatora NR/GS/FD trafiały do `run.error_message` biegu
kanonicznego (`enm/canonical_analysis.py::execute_run`, `except ODMOWY_OBLICZENIA_BIEGU`) i do 422 przez
`odmowa_rdzenia_b01`; nie wchodzą do hasha śladu (odmowa = brak wyniku). Złotych migawek odmów nie ma —
regeneracja nie była potrzebna.

**Rekord i zdanie z nazwą:** `network_model/odmowa_danych.py` (liść stdlib): `OdwolanieElementu(rodzaj, ref)`,
`RekordOdmowy(kod, tresc, odwolania)`, `OdmowaWejsciaRdzenia(OdmowaDanychError)` z `rekordy`. Zdanie składa
`enm/zdania_odmow_rdzenia.py` (`zdanie_odmowy`: treść + „Dotyczy: <nazwy z grafu>”, element spoza grafu niczego
nie dokłada). Wpięcie we wszystkie miejsca wywołań rdzeni na drodze do projektanta: bieg kanoniczny rozpływu
(`_solve_power_flow_with_method` — NR/GS/FD, pętla OLTC, studia OLTC), bieg kanoniczny zwarć
(`_wynik_solvera_punktu`), wiązanie zwarcia (`execute_short_circuit`, `wynik_zwarcia_1f_ze_snapshotu`,
`zwarcie_3f_ze_snapshotu`) i estymacja stanu (macierz admitancji NR). Ramy NR/GS/FD są zamrożone i podnoszą
goły `ValueError` z treściami — dlatego warstwa aplikacji woła ten sam walidator strukturalny przed solverem
(`sprawdz_wejscie_rozplywu`, ten sam predykat `options.validate`). Pominięte świadomie: przestarzałe adaptery
`analysis/power_flow/solver.py` i `solver_input/audit2_pf_wrapper.py` — wołane wyłącznie z testów (grep).

### (m) nazwa elementu z identyfikatora
- Tytuł kroku „Prąd zwarciowy Thevenina w gałęzi {branch_id}” → `{branch.name}`; klucz `thevenin_flow_{id}`
  bez zmian.
- Predykat `branch.name or branch_id` (K_T) usunięty → `{branch.name}`.
- Wymóg niepustej nazwy w walidatorze wejścia zwarć (`_sprawdz_wejscie`, wspólny dla 4 rodzajów): gałąź
  w eksploatacji bez nazwy (`jest_nazwa`) → `zwarcie.galaz_bez_nazwy` przed biegiem; predykat „w eksploatacji”
  ten sam co w obu pętlach śladu (jedno źródło, test przypina gałąź odstawioną).
- Wpis `DOZWOLONE` w `tests/enm/test_nazwy_jedno_zrodlo.py` dla SC → usunięty (zostają 2 wpisy NC RfG — pozycja
  (c)); `nazwa_bez_identyfikatora_guard`: 2 wpisy SC zdjęte (12 → 10).
- Front: obejście `odnosnikiTytulu` / `tytulZNazwami` / wiersz „Tytuł kroku w zapisie solvera”
  (`ui2/wyniki/dowod/*`) skasowane — rdzeń podaje nazwę sam, obejście byłoby martwe.
- **Hash śladu/dowodu SC3F:** zmierzone regeneracją fikstur narzędziami repo — `eksport_fixtur_harnessu.py
  --sprawdz` rozjechał wyłącznie `zwarcia_rozplyw_scena_zwarcia.json`, diff = 3 linie `title` (UUID → „Linia SN 1”,
  „TR 110/15”, „TR 15/0.4”), ZERO zmian odcisków; pozostałe fikstury harnessu (w tym `skladowe_scena_slad.json`
  z krokami K_T) i companions SLD zgodne. Tytuł nie wchodzi do żadnego hasha.

### (l) polskie znaki w `v126_academic.py`
Ręczny przegląd wszystkich literałów modułu (nie tylko trafień słownika): 9 zamian — 6 ze skanu
(`:160` Nieobsługiwany, `:623` obowiązkowych pól, `:701` przekształtnika ×2, `:714` (razem z (k)), `:753` pól,
pętli prądowej, indukcyjność, `:881` poniżej) + 3 „nieskonczone/NaN” (`:875-877`), których słownik nie znał.
Formy `indukcyjnosc`, `nieistniejacy`, `nieskonczona/e/y`, `obowiazkowych` dopisane do `polskie_znaki_slownik.py`
(skan całego `src`: 0 nowych naruszeń poza rdzeniami). Pin pliku zdjęty (6 → 0). Klucze, kody i identyfikatory
nietknięte (`dane niekompletne` to wartość statusu). Literał „krotka/krótka” nie występuje. Komentarz `:868`
(„ponizej”) to nie literał — nie ruszany. Fikstura `odpowiedziSolvera.json` regenerowana generatorem repo:
diff = 1 linia `message_pl`.

## 3. Testy jako iloczyn cech
`test_odmowy_strukturalne_rdzeni.py` (40 przypadków): rdzeń {zwarcia × 3F/1F/2F/2F+N, NR, GS, FD, V12.6 SSCI} ×
komunikat {16 rekordów walidatora (tabela + test kompletności kodów modułu), przekładnia ≤ 0, węzeł zwarcia spoza
grafu, gałąź bez nazwy, węzeł przyłączenia spoza modelu, tytuły kroków} × droga {wyjątek rdzenia, walidator
tekstowy dla ram NR/GS/FD, granica biegu kanonicznego, wiązanie zwarcia (`ShortCircuitBindingError` z przyczyną),
krok śladu, wynik powierzchni V12.6} × stan {nazwa nadana, pusta, same spacje, element spoza grafu, gałąź
odstawiona}. Wyrocznia: treść bez identyfikatora i kodu, rekord z kodem i odwołaniem.

Iniekcje (drzewo kopii, przywrócenie `cmp` bajt w bajt): M1 identyfikator w tytule Thevenina → 2 czerwone;
M2 bez wymogu nazwy → 9; M3 wymóg nazwy także dla gałęzi odstawionej → 1; M4 brak walidacji strukturalnej przed
solverem → 16; M5 zdanie bez nazw → 25; M6 rekord PV bez odwołania → 1; M7 V12.6 bez `converter_ref`/`bus_ref` → 1.

## 4. Przegląd diffu rdzeni linia po linii (336 linii +/− w `network_model/solvers/`)
- **`short_circuit_iec60909.py`**: importy (`TYPE_CHECKING`, `jest_nazwa`, rekordy odmowy, `AdmittanceMatrixBuilder`
  pod `TYPE_CHECKING`) — typ; 2 stałe kodów — tekst; `_sprawdz_wejscie` — predykat węzła zwarcia bez zmian (ten sam
  warunek `not in graph.nodes`, ta sama pozycja w kolejności sprawdzeń w każdej z 4 funkcji) + **nowy predykat nazwy
  (zmiana zachowania usankcjonowana pozycją (m): nazwana odmowa grafu z gałęzią w eksploatacji bez nazwy)**; 2 tytuły
  kroków — tekst; 2 adnotacje parametrów i 3 zdjęte `type: ignore` — typ; 4 × zastąpienie `if/raise` wywołaniem
  `_sprawdz_wejscie` — tekst komunikatu i typ wyjątku (`OdmowaWejsciaRdzenia` ⊂ `ValueError`). Liczby: żadna linia
  rachunku nie zmieniona.
- **`power_flow_newton_internal.py`**: import rekordów i 17 stałych kodów — typ/tekst; `validate_input` rozdzielony na
  `odmowy_wejscia` (te same predykaty, ta sama kolejność, ten sam `continue` w pętli przekładni) + cienki
  `validate_input` zwracający treści rekordów (sygnatura bez zmian — konsumują ją zamrożone NR/GS/FD); nazwy zmiennych
  pętli — mypy; `raise` przekładni ≤ 0 — tekst i typ wyjątku; `build_power_spec_v2` — nazwa zmiennej pętli. Ostrzeżenie
  `slack.u_pu outside typical range` bez zmian (bez identyfikatora; trafia do wyniku — nie ruszane).
- **`v126_academic.py`**: 9 literałów — tekst; 2 klucze dodane do słownika wyniku gałęzi „węzeł przyłączenia spoza
  modelu” (`converter_ref`, `bus_ref` — addytywnie, kształt sąsiedniej gałęzi) — rekord.

Konsekwencja jawna typu wyjątku: odmowy rdzeni zwarć i NR są teraz `OdmowaDanychError`, więc tam, gdzie wywołanie
nie było owinięte `odmowa_rdzenia_b01`, API odpowiada 422 (odmowa danych) zamiast 500. To kierunek zapisany
w docstringu `odmowa_danych.py` („znika po decyzji B-01 — rdzeń rzuca odmowę sam”).

`solver_diff_guard`: odciski `short_circuit_iec60909.py` i `power_flow_newton_internal.py` odświeżone raz;
`v126_academic.py` NIE jest w `PROTECTED_FILES` strażnika (karta zakładała trzy odciski — są dwa).
Sankcje O-59 dopisane do `solver_boundary_guard.SANCTIONED_CHANGES` (oba pliki).

## 5. Czego nie zrobiono i dlaczego
- 5 błędów mypy w `v126_academic.py` — poza zgodą (d), zmieniałyby zachowanie przy `None` → decyzja B-01.
- `short_circuit_core.py:76` (ta sama klasa (k)) — rdzeń B-01 bez zgody w tej karcie → do następnej rundy.
- Komunikaty z kluczami pól w treści v126 (`Brakuje: current_loop_bandwidth_hz…`) — klucz pola, nie identyfikator
  elementu; `missing_fields` niesie strukturę, granicę tłumaczenia buduje karta KOMUNIKATY-BEZ-ID.
- Pozostałe 31 plików PL-ZNAKI poza B-01 i predykaty NC RfG (`ncrfg_ptpiree/engine.py`) — wg karty: PL-ZNAKI-2 i
  pozycja (c).
- Czerwień bazy (16 pozycji, §1) — karta każe ją wypisać; trzy z nich w plikach gorących integratora.
- Testy z `match=` na „not in graph” w `test_graph`, `test_station`, `test_audit2_solver_adjuster`,
  `sld_substrate_power_flow` (wymienione w karcie) — pomiar: to asercje `x not in graph…` na zbiorach, nie `match=`
  komunikatu rdzenia; nie wymagały zmiany. Jedyne `match="Fault node"` na komunikacie rdzenia
  (`test_short_circuit_iec60909.py:243`) przepisane do rekordu; `test_pr18_sc_integration.py:348` dotyczy komunikatu
  warstwy wiązania (`short_circuit_binding.py:162`, poza rdzeniem) — bez zmian.
- Zapis decyzji O-59 w rejestrze planu A/B §7 — do integratora (jak w rundzie 1).
