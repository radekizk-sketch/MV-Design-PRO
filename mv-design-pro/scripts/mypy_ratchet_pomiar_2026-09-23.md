# Pomiar długu typów po naprawie pustej bramki mypy — 2026-09-23

Karta: MYPY-PUSTA-BRAMKA. Guard: `scripts/mypy_ratchet_guard.py`. Samotest:
`scripts/test_mypy_ratchet_guard.py`. Konfiguracja: `backend/pyproject.toml`, sekcje
`[tool.mypy]` i `[[tool.mypy.overrides]]`.

## Przyczyna (skrót)

Zapadka wołała `mypy src` z katalogu `backend`. Kod importuje pakiety z `src/` jako
moduły najwyższego poziomu (`from werdykt.kontrakt import ...`), a `src/__init__.py`
robi z `src` pakiet. mypy nadawał więc plikom nazwy `src.werdykt.kontrakt`, import
`werdykt.kontrakt` nie trafiał w żaden plik, a globalne `ignore_missing_imports = true`
zamieniało go po cichu w `Any`. Typy MIĘDZY modułami nie były sprawdzane wcale; pin
`BASELINE_ERRORS = 0` znaczył „0 błędów wewnątrz pojedynczych modułów".

## Sonda — przed i po

Plik tymczasowy (tylko w scratchpadzie, nigdy w repo), dopisany do KOPII `backend/src`
razem z `pyproject.toml`:

```python
# src/werdykt/_sonda_miedzymodulowa.py
from werdykt.kontrakt import Wielkosc

def sonda(w: Wielkosc) -> int:
    return w  # BLAD CELOWY: model pydantic z innego modulu zwrocony jako int
```

| Konfiguracja | Wywołanie | Wynik |
|---|---|---|
| przed naprawą | `mypy src` (jak guard) | `Success: no issues found in 731 source files` — sonda NIEWIDOCZNA |
| przed naprawą | `mypy src/werdykt` | `Success: no issues found in 8 source files` — sonda NIEWIDOCZNA |
| przed naprawą, bez `ignore_missing_imports` | `mypy src` (mini-drzewo) | `Cannot find implementation or library stub for module named "pakiet_a.model"  [import-not-found]` — mechanizm |
| po naprawie | `mypy src` (jak guard) | `src/werdykt/_sonda_miedzymodulowa.py:7: error: Incompatible return value type (got "Wielkosc", expected "int")  [return-value]` · `Found 278 errors in 52 files (checked 733 source files)` (= 277 + sonda) |
| po naprawie | `mypy src/werdykt` | ten sam błąd sondy · `Found 1 error in 1 file (checked 8 source files)` |

Ta sama sonda na mini-drzewie o układzie backendu (pakiet z `__init__.py`, katalog
przestrzeni nazw, `from`/`import as`, import własny nierozwiązany, biblioteka z listy
wyciszeń) jest przypięta w samoteście — z sekcjami mypy kopiowanymi z prawdziwego
`pyproject.toml` i z kontrolą negatywną na konfiguracji sprzed naprawy.

## Konfiguracja finalna i dlaczego ta

```toml
[tool.mypy]
# ... bez zmian: python_version, warn_unused_configs, disallow_untyped_defs, plugins,
#     warn_return_any = false
mypy_path = "$MYPY_CONFIG_FILE_DIR/src"
explicit_package_bases = true
# globalne `ignore_missing_imports = true` USUNIĘTE

[[tool.mypy.overrides]]
module = ["boto3.*", "celery.*", "google.cloud.*", "networkx.*", "openpyxl.*",
          "reportlab.*", "scipy.*"]
ignore_missing_imports = true
```

Warianty sprawdzone sondą (mini-drzewo, ta sama konfiguracja bazowa):

| Wariant | Wynik |
|---|---|
| tylko `explicit_package_bases` | błąd między modułami nadal niewidoczny (import dalej nierozwiązany) |
| tylko `mypy_path` | mypy PRZERYWA: `Source file found twice under different module names: "src.pakiet_a.model" and "pakiet_a.model"` |
| `mypy_path` + `explicit_package_bases` | błąd między modułami wykryty; nazwy modułów liczone od `src` (`werdykt.kontrakt`) |
| to samo + `PYTHONPATH=src:.` | wynik identyczny na mini-drzewie; na całym `src` 279/53 bez `PYTHONPATH` (05:53) i z `PYTHONPATH` (06:02) |

- Lista sprawdzanych plików BEZ ZMIAN: `mypy src` przed = 729 plików, po = 729 plików
  w tym samym oknie czasowym 05:4x-05:53 (= liczba `src/**/*.py`; później drzewo urosło
  do 730-734 przez pracę innych wykonawców).
  `src/__init__.py` (sam docstring) dostaje w nowym trybie nazwę modułu `__main__` —
  bez skutków dla pomiaru.
- Naprawa w `pyproject.toml`, nie w wywołaniu guarda, więc poprawne jest też
  `poetry run mypy src` z CLAUDE.md.
- Globalne wyciszenie zastąpione IMIENNYM: przy globalnym każdy przyszły rozjazd
  bazy modułów znowu byłby cichy. Lista = zmierzony zbiór importów bez typów
  (bieg bez wyciszenia): `scipy`, `reportlab`, `networkx`, `openpyxl`, `celery`
  (untyped), `boto3`, `google.cloud` (nieinstalowane, import leniwy w
  `infrastructure/cloud_backup.py`). Poza tą listą ZERO nierozwiązanych importów, w tym
  zero importów własnych.
- Guard dostał trzy twarde bramki wiarygodności: każdy `[import-not-found]` /
  `[import-untyped]` = FAILED niezależnie od progu; komunikat wczytania konfiguracji
  (`pyproject.toml: ...`) = pomiar odrzucony (mypy przy zepsutym `[tool.mypy]` NIE
  przerywa, tylko liczy na ustawieniach domyślnych — zmierzone); „Success" też musi
  mieć co najmniej 100 sprawdzonych plików (przy niezerowym progu fałszywy „Success"
  wyglądałby na spadek długu do zera).

## Komenda pomiaru

```bash
cd mv-design-pro/backend
PYTHONPATH=src:. /root/.cache/pypoetry/virtualenvs/mv-design-pro-backend-D2vgvUMQ-py3.11/bin/python \
  -m mypy src --cache-dir <pusty katalog>          # zimny cache
# guard (to samo wywołanie, cache backend/.mypy_cache):
PYTHONPATH=src:. <python venv> ../scripts/mypy_ratchet_guard.py
```

mypy 1.19.1 (compiled), wtyczka `pydantic.mypy`, Python 3.11, 4 rdzenie.

## Pomiary (drzewo w ruchu — inni wykonawcy edytowali `src/` w trakcie)

| Bieg (UTC) | Konfiguracja | Błędy / pliki | Sprawdzone | Czas | Uwagi |
|---|---|---|---|---|---|
| 05:4x | przed naprawą | 0 / 0 (`Success`) | 729 | 44 s zimny, 15 s guard | pusta bramka |
| 05:53 | po naprawie (konfiguracja w pliku tymczasowym) | 279 / 53 | 729 | 44 s zimny | |
| 06:02 (A) | po naprawie (`pyproject.toml`) | 279 / 53 | 730 | 38 s zimny | |
| 06:05 (B) | po naprawie | 286 / 54 | 730 | 43 s zimny | +7 w `werdykt/decyzja.py` (plik zapisany 06:06:08, `werdykt/kontrakt.py` 06:06:14 — W TRAKCIE biegu) |
| 06:14 (C) | po naprawie | **277 / 51** | 730 | 70 s zimny | −2 `ZrodloWartosci` w `ncrfg_ptpiree/{contracts,engine}.py` (zmienione 06:09 i 06:12) |
| ~06:17 | guard po naprawie | 277 / 51, OK | 730 | 83 s | pin 277/51 |

Pliki w toku w oknie pomiarów (mtime 05:43-06:12): `werdykt/{decyzja,kontrakt,wyjasnienie,
etykiety,dokument,proweniencja,__init__}.py`, `catalog/profiles/nc_rfg/{__init__,loader}.py`,
`network_model/solvers/ncrfg_ptpiree/{contracts,engine}.py`,
`application/solvers/solver_capability_registry.py` (bieg o 05:57 złapał go w połowie
edycji: 20 × `name-defined`), `analysis/ssci_stability/*`, `application/analyses/{ochrona_lom,
frt_trajektorie,frt_sekwencja,v126_katalog,v126_gotowosc,werdykt_projektowy}.py`,
`api/{v126_academic,v125_contracts,canonical_run_views,analysis_run_exports}.py`,
`enm/canonical_analysis.py`, `solver_input/provenance.py`.

**Pin: 277 / 51** (bieg C). Przy scalaniu guard sam poda liczbę bieżącą — zapadka
dwustronna zażąda korekty, jeśli drzewo się zmieniło.

`werdykt/` w trybie projektu (bieg C): **0 błędów**. Bieg B pokazał 7 błędów
między modułami w `werdykt/decyzja.py` (`Too many arguments for "powod_metody"`,
`Module has no attribute "powod_poza_domena"`, …) w chwili, gdy inny wykonawca zmieniał
sygnatury w `werdykt/` — dokładnie ta klasa błędu, którą stara bramka przepuszczała jako
„Success". W `--strict` (`MYPYPATH=src mypy --strict --follow-imports=silent -p werdykt`,
05:5x) werdykt miał 5 błędów `implicit re-export` (`ClaimKind`, `EvidenceTier`,
`FieldQuality` z `solver_input.provenance`); pełny bieg `--strict` o ~06:18: 0 w `werdykt/`.

## Tabela: pakiet × kod błędu (bieg C, 277 / 51)

| pakiet | `arg-type` | `union-attr` | `assignment` | `attr-defined` | `operator` | `misc` | `call-arg` | `type-var` | `var-annotated` | `return-value` | razem | pliki |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `application` | 55 | 5 | 24 | 4 | 13 | 2 | 3 | · | · | · | **106** | 17 |
| `network_model` | 1 | 29 | 8 | 18 | 2 | 2 | · | 2 | · | · | **62** | 7 |
| `infrastructure` | 16 | · | 13 | 1 | · | · | · | · | · | · | **30** | 5 |
| `api` | 1 | 22 | · | 5 | · | · | · | · | · | 1 | **29** | 7 |
| `analysis` | 4 | · | 10 | 2 | · | 2 | · | · | 1 | · | **19** | 5 |
| `enm` | 3 | 8 | 6 | 1 | · | · | · | · | · | · | **18** | 6 |
| `solver_input` | 1 | 6 | 1 | · | · | · | · | · | · | · | **8** | 2 |
| `domain` | · | · | 2 | 2 | · | · | · | · | · | · | **4** | 1 |
| `compliance` | · | · | · | 1 | · | · | · | · | · | · | **1** | 1 |
| **razem** | **81** | **70** | **64** | **34** | **15** | **6** | **3** | **2** | **1** | **1** | **277** | **51** |

Pakiety bez błędów: `catalog`, `diagnostics`, `protection`, `reference_engine`,
`solvers`, `werdykt`, `whitebox`.

## Top 20 plików (bieg C)

| # | plik | błędy | kody |
|---:|---|---:|---|
| 1 | `src/application/proof_engine/proof_generator.py` | 39 | arg-type 21, operator 13, assignment 3, misc 2 |
| 2 | `src/network_model/solvers/power_flow_oltc.py` | 26 | union-attr 23, type-var 2, arg-type 1 |
| 3 | `src/infrastructure/persistence/repositories/analysis_run_repository.py` | 20 | assignment 10, arg-type 10 |
| 4 | `src/application/proof_engine/latex_renderer.py` | 19 | assignment 11, arg-type 8 |
| 5 | `src/network_model/solvers/power_flow_newton_internal.py` | 19 | attr-defined 14, assignment 5 |
| 6 | `src/analysis/lf_sensitivity/builder.py` | 9 | assignment 9 |
| 7 | `src/api/projects.py` | 9 | union-attr 9 |
| 8 | `src/enm/domain_operations.py` | 9 | union-attr 8, assignment 1 |
| 9 | `src/solver_input/v126_contracts.py` | 7 | union-attr 6, arg-type 1 |
| 10 | `src/application/equipment_proof/generator.py` | 6 | arg-type 6 |
| 11 | `src/application/solvers/lv_temperature_correction.py` | 6 | assignment 3, arg-type 3 |
| 12 | `src/application/analyses/nn_device_selection.py` | 6 | attr-defined 3, assignment 2, arg-type 1 |
| 13 | `src/api/catalog.py` | 6 | union-attr 6 |
| 14 | `src/api/audit2_station_config.py` | 6 | union-attr 6 |
| 15 | `src/application/analyses/lista_materialowa.py` | 5 | union-attr 5 |
| 16 | `src/network_model/solvers/v126_academic.py` | 5 | operator 2, misc 2, union-attr 1 |
| 17 | `src/network_model/solvers/power_flow_oltc_studies.py` | 5 | union-attr 5 |
| 18 | `src/application/proof_engine/proof_inspector/inspector.py` | 4 | arg-type 4 |
| 19 | `src/analysis/normative/evaluator.py` | 4 | arg-type 4 |
| 20 | `src/domain/result_builder_v1.py` | 4 | assignment 2, attr-defined 2 |

## `attr-defined` na klasach własnych — kandydaci na realne błędy wykonania

Posortowane wg pewności (sprawdzone odczytem kodu 2026-09-23, bez uruchamiania):

1. **Realny defekt produktu:** `api/archive_diff.py:206,214,253,261` woła
   `ProjectArchiveService.load_archive_from_bytes` / `.build_archive` — tych metod NIE MA
   w `application/project_archive/service.py` (jest `export_project`, `import_project`,
   `preview_archive`). `AttributeError` łapie `except (ArchiveError, Exception)`, więc
   porównanie archiwów zawsze kończy się HTTP 400 „Blad odczytu archiwum". Plik
   niezmieniany od 2026-09-20 — nie jest to edycja w toku.
2. **Refaktor w toku u innego wykonawcy:** `NcRfgProfile.classify_module` zastąpione
   funkcją `klasyfikuj_modul` w `catalog/profiles/nc_rfg/loader.py` (zapis 05:55), a
   wołające `compliance/nc_rfg_modul.py:70` i `application/analyses/dokument_studium.py:234`
   jeszcze nie zaktualizowane. Stara bramka przepuściłaby to jako „Success".
3. **Prawdopodobnie kolizja nazw (wzorzec z KD-12), nie błąd wykonania:**
   `network_model/solvers/power_flow_newton_internal.py` (14 × `PVSpec`/`PQSpec`),
   `application/analyses/nn_device_selection.py:367-383` (`gate` przypisany w gałęziach
   różnym typom), `analysis/power_flow_interpretation/builder.py:446-448`,
   `domain/result_builder_v1.py:409-410`.
4. **Niezweryfikowane:** `network_model/solvers/machine_sc_iec60909.py:386,405,416`
   (`SynchronousMachineSource.p_per_pole_mw`), `enm/adapter_dynamiki.py:249`
   (`ENMElement.bus_ref`), `infrastructure/persistence/repositories/run_batch_repository.py:75`
   (`FromClause.delete`), `api/grid_source_preview.py:792` (`object` nieiterowalny, obok
   `# type: ignore` na inny kod), `network_model/solvers/short_circuit_iec60909.py:646`
   (`object.node_id_to_index`, obok `# type: ignore` na inny kod).

## Rdzeń FROZEN

20 z 277 błędów leży w plikach chronionych hashem `scripts/solver_diff_guard.py`:
`power_flow_newton_internal.py` (19), `short_circuit_iec60909.py` (1). Ich naprawa
wymaga zgody właściciela (bramka B-01).

## Pomiary informacyjne (nie wchodzą do pinu)

| Bieg | Wynik | Czas |
|---|---|---|
| `mypy src --strict` | 1091 błędów w 184 plikach (732 sprawdzone): `type-arg` 649, `no-any-return` 111, `arg-type` 81, `union-attr` 70, `assignment` 64, `attr-defined` 50, `unused-ignore` 34, `operator` 15, `misc` 6, `no-untyped-call` 3, `call-arg` 3, `type-var` 2 | 89 s |
| `mypy src --warn-unused-ignores` | 312 = 277 + 35 nieużywanych `# type: ignore` (w `src/` jest ich 85) | 94 s |

`[tool.mypy]` NIE ma `strict = true` — zdanie „`pyproject.toml` konfiguruje mypy w trybie
strict" w docstringu guarda (i „mypy (strict)" w CLAUDE.md) było deklaracją bez pokrycia;
docstring guarda sprostowany. Przejście na `strict` to osobna decyzja (dług +814).

## Plan zejścia (karty per pakiet, kolejność wg wartości)

Zasady każdej karty: naprawa u źródła, bez `# type: ignore`, bez poszerzania sygnatur do
`Any`, bez wykluczeń; karta obniża pin o zmierzoną liczbę (guard sam tego zażąda).

1. `api` (29) — najpierw `archive_diff.py` (realny defekt, pkt 1 wyżej), potem
   `union-attr` na repozytoriach `X | None` (`projects.py`, `catalog.py`,
   `audit2_station_config.py`, `solver_input.py`): zwężenie przy wstrzyknięciu zależności.
2. `compliance` (1) + `application/analyses/dokument_studium.py` — domknięcie refaktoru
   `classify_module` → `klasyfikuj_modul` (należy do wykonawcy tego refaktoru).
3. `application` (106) — `proof_engine/proof_generator.py` (`float | None` do
   `ProofValue.create`, arytmetyka na `str | float | complex`), `latex_renderer.py`,
   `proof_inspector/inspector.py`, `equipment_proof/generator.py`; potem
   `analyses/*`, `solvers/lv_temperature_correction.py`.
4. `infrastructure` (30) — `analysis_run_repository.py` (`str` do pól `Literal[...]`,
   `object` do kolumn ORM), `document_store_repository.py`, `run_batch_repository.py`.
5. `network_model` (62) — `power_flow_oltc.py` / `power_flow_oltc_studies.py`
   (`TapChanger | None` bez zwężenia), `v126_academic.py`, `machine_sc_iec60909.py`;
   pliki FROZEN (20) tylko za zgodą właściciela.
6. `analysis` (19), `enm` (18), `solver_input` (8), `domain` (4).

## Ryzyka

- **Czas biegu w CI:** zbiór plików bez zmian, więc koszt jak dotąd — 38-44 s na zimno
  lokalnie przy spokojnej maszynie, 70-94 s pod obciążeniem innych wykonawców. CI nie
  trzyma cache mypy między biegami, więc każdy bieg jest zimny.
- **Drzewo w ruchu:** pin 277/51 z biegu 06:14; do chwili scalenia inni wykonawcy mogą
  zmienić liczbę w obie strony — zapadka zapali się i poda liczbę bieżącą.
- **Samotest uruchamia prawdziwy mypy** (2 biegi na mini-drzewie, ~7-8 s łącznie) — jest
  wolniejszy od typowych samotestów guardów.
- **Nowa biblioteka bez stubów** zapali guard (`import-untyped`) — zamierzone: decyzja
  „stuby `types-*` albo wpis imienny w `[[tool.mypy.overrides]]`".

## Pomiar na drzewie scalonym (Fable, odbiór 2026-09-23)

Na czystym worktree commitu `57c00d36` (HEAD gałęzi w chwili odbioru, bez zmian AB-1a w toku): **275 błędów w 49 plikach** — pin ustawiony na 275/49. Wartości 277/51 wyżej pochodzą z drzewa w ruchu (inni wykonawcy). Przy scaleniu fali AB-1a pin jest mierzony ponownie na drzewie integracji.
