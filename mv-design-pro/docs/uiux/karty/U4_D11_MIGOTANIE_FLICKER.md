# KARTA ZADANIA D11 — DELTA BACKENDOWA: MIGOTANIE I SZYBKIE ZMIANY NAPIĘCIA (P37)

**Faza:** U4 · **Epik:** E11 · **Wykonawca:** Opus · **Warstwa:** backend
(catalog addytywnie + application + api) · **Wiążące:** CLAUDE.md (NOT-A-SOLVER:
ocena wg IEC 61000-3-7 = deterministyczna arytmetyka normatywna na wynikach
FROZEN solvera zwarciowego — wzorzec `grid_strength` (SCR=Sk/Sn to ta sama klasa
interpretacji); No-Heuristics: współczynniki i limity WYŁĄCZNIE udokumentowane
ze źródłem; Catalog-first: współczynnik emisji migotania z katalogu, nie z
parametru zapytania; WHITE BOX), wzorce:
`application/analyses/grid_strength.py` (D1), `api/quality_analysis_runs.py`.

## 0. Rozstrzygnięcia zarządcy (WIĄŻĄCE — z rekonesansu)
1. Stan zastany: obliczeń Pst/Plt NIE ma nigdzie (jedyne wystąpienie —
   placeholdery `flicker_pst/plt: None` w `network_model/solvers/v126_academic.py:301`
   — NIE dotykaj). Sk''(MVA) per węzeł czyta się z przebiegu zwarciowego jak
   `grid_strength._sk_mva_by_bus` (`grid_strength.py:92`); moce zainstalowane
   źródeł falownikowych per węzeł — `_installed_mva_by_bus` (`grid_strength.py:67`).
2. Katalog — ADDYTYWNIE (wzorzec `pq_curve` z D4, `catalog/types.py:314`):
   pole `flicker_c: float | None = None` na `ConverterType`
   (`catalog/types.py:1017`) — współczynnik emisji migotania c(ψk) z certyfikatu
   urządzenia (bezwymiarowy, >0; walidacja jak inne pola). Uzupełnij WYBRANE
   rekordy katalogu przekształtników (`mv_converter_catalog.py`) wartościami
   z adnotacją statusu weryfikacji jak w istniejących rekordach (rekord
   analityczny do potwierdzenia kartą producenta); rekordy bez `flicker_c` →
   uczciwe „brak współczynnika w katalogu" w odpowiedzi (INFO, moduł pomijany
   w sumowaniu z jawnym wpisem).
3. Formuły (udokumentuj źródło w docstringu: IEC/TR 61000-3-7, punkt):
   - emisja pojedynczego źródła: `Pst_i = c_i · (Sn_i / Sk'')` (Sk'' w punkcie
     przyłączenia z przebiegu zwarciowego),
   - sumowanie wielu źródeł w tym samym węźle: prawo sumowania
     `Pst = (Σ Pst_i^m)^(1/m)` z wykładnikiem m=3 (ogólny wykładnik zalecany
     IEC/TR 61000-3-7 dla źródeł tego rodzaju — zacytuj punkt),
   - `Plt = Pst` dla emisji ciągłej źródeł OZE (założenie konserwatywne —
     udokumentuj; jeżeli znajdziesz w normie współczynnik konwersji z punktem —
     użyj go ze źródłem),
   - ocena vs poziomy planowania SN (IEC/TR 61000-3-7): stałe modułu ze
     źródłem (typowo Pst=0,9 / Plt=0,7 dla MV — ZWERYFIKUJ i zacytuj punkt;
     nie możesz zacytować → limit None + uczciwy INFO „podaj wymaganie OSD").
   Szybkie zmiany napięcia d(%): `d ≈ (Sn/Sk'')·100` przy załączeniu pełnej mocy
   (konserwatywnie, kmax=1 ze źródłem lub jawnym założeniem w `zalozenia_pl`).
4. ZERO nowej fizyki: wszystkie wielkości wejściowe (Sk'', Sn) pochodzą z wyniku
   FROZEN solvera i katalogu; formuły to normatywna arytmetyka oceny emisji
   (interpretacja), analogicznie do SCR w D1.

## 1. Cel
Ocena emisji migotania (Pst/Plt) i szybkich zmian napięcia od źródeł
falownikowych (FW/PV/BESS) w punktach przyłączenia wg IEC/TR 61000-3-7, na
bazie zakończonego przebiegu zwarciowego (`short_circuit_sn`): per węzeł z
generacją falownikową — wkłady modułów, suma wg prawa sumowania, porównanie
z poziomami planowania, werdykt PL. Determinizm: `input_hash` SHA-256, stała
kolejność węzłów/modułów, zaokrąglenie `_ROUND = 6`.

## 2. Zakres
1. Catalog: pole `flicker_c` (§0.2) + walidacja + rekordy + testy katalogowe
   (istniejące opublikowane typy bez pola muszą działać bez zmian).
2. `application/analyses/migotanie.py` — serwis `build_migotanie_view(run)`:
   wymaga przebiegu zwarciowego FINISHED (wzorzec walidacji:
   `grid_strength.py:128-145`, komunikaty PL); odpowiedź per węzeł: Sk'',
   lista modułów (Sn, c, Pst_i lub powód pominięcia), Pst/Plt sumaryczne,
   d(%) szybkiej zmiany, limity + werdykt PL („w granicach planowania" /
   „przekroczenie poziomu planowania" / „ocena niemożliwa — brak
   współczynnika/limitu"), `zalozenia_pl`, ślad WHITE BOX (formuła →
   podstawienie → wynik dla każdego modułu i sumy), `input_hash`.
3. Końcówka `GET /api/quality/flicker?run_id=` w `api/quality_analysis_runs.py`
   (konwencja rodziny: `_require_run` linia 28, 404/422 PL).
4. Testy ≥ 14 w `tests/application/analyses/test_migotanie.py` (+ API):
   jeden moduł z c → Pst=c·Sn/Sk (rachunek ręczny w teście), dwa moduły w węźle
   → prawo sumowania m=3 (rachunek ręczny), moduł bez c → pominięty z INFO,
   węzeł bez Sk'' → uczciwy brak oceny, przekroczenie limitu → werdykt PL,
   d(%) rachunek ręczny, determinizm (dwukrotny bieg → identyczny wynik+hash),
   zły rodzaj przebiegu → 422 PL, 404, katalog: walidacja flicker_c (≤0 →
   błąd), stare typy bez pola działają.

## 3. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD` (HEAD = commit tej karty lub nowszy). Baza pełnego pytest:
5915 passed, ZERO failed (± scalenia D9/D10 — liczy się ZERO failed).
Celowane + PEŁNY pytest ZERO failed; ruff/black/mypy na twoich plikach; guardy:
arch, solver_boundary, pcc_zero, load_flow_no_heuristics, catalog_binding,
catalog_enforcement, catalog_gate, catalog_metadata (pipefail; przy >600 s
odczytaj wynik i NATYCHMIAST commit+raport). ZERO zmian w
`network_model/solvers/**`, `enm/**`. Commit
`feat(api): ocena migotania i szybkich zmian napięcia IEC 61000-3-7 (D11)`
BEZ push. Raport standardowy: rozstrzygnięcia recon (plik:linia) + wykaz
źródeł (norma + punkt) dla KAŻDEJ stałej normatywnej.
