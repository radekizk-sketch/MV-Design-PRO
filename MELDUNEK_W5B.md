# Meldunek — karta W5-B (typowany model pola `Bay` zamiast `meta.field_specs`), dokończenie

Gałąź: `claude/mv-design-pro-twin-audit-u4lhy0-karta-w5b-typowany-bay`.
Data: 2026-10-16.

## 1. Wynik i dowód

Karta jest domknięta przez wykonawcę na drzewie scalonym z gałęzią integracji
`claude/mv-design-pro-twin-audit-u4lhy0-integracja-pr477-481` (czubek `91d769420`, scalenie
`--no-ff` jako `5d05eb0fa`). Typowany rekord pola `Bay` (`backend/src/enm/models.py`) jest
jedynym nośnikiem pól stacji SN, GPZ, nN i rozdzielnic odgałęźnych; dostęp przez akcesor
`backend/src/enm/pola.py`. Dawne słowniki `Substation.meta.field_specs`,
`Substation.meta.nn_field_specs` i `BranchPointSN.materialized_params.switchgear_field_specs`
czyta wyłącznie migracja przy wczytaniu (`backend/src/enm/migrations/field_specs_promocja.py`,
wołana z `backend/src/enm/store.py`), która przenosi je na `bays` i usuwa stare klucze. Powrót
dawnych kluczy do kodu albo fikstur blokuje strażnik
`scripts/meta_field_specs_resurrection_guard.py` (krok w `.github/workflows/p0-extended-guards.yml`).

Bramki uruchomione na czubku gałęzi (kody wyjścia łapane bezpośrednio, wyjścia w plikach):

| Bramka | Polecenie | Wynik |
|---|---|---|
| Pełna regresja backendu | `poetry run pytest -q -p no:cacheprovider -m "not pandapower and not andes"` w trzech równoległych częściach (podział plików `tests/**/test_*.py` modulo 3, 823 pliki) | RC=0 / RC=0 / RC=0; 6959 + 8265 + 14103 = **29 327 passed**, 40 deselected, 0 failed, 0 errors (drzewo `3e59282c2`, backend po poprawce wydajności) |
| Pełny vitest | `npm test` | RC=0; 884 pliki testów zaliczone (1 pominięty), **13 319 testów passed** (1 skipped, 14 todo — stan sprzed karty) |
| Type-check frontendu | `npm run type-check` | RC=0 (powtórzony po ostatniej zmianie spec e2e) |
| Lint frontendu | `npm run lint` (`--max-warnings 0`) | RC=0 |
| Guardy CI | `python scripts/guardy_z_ci.py` | patrz §1a (bieg końcowy) |
| Zapadka mypy | `python scripts/mypy_ratchet_guard.py` | RC=0; 221 błędów w 33 plikach (próg 221/33 — dług typów nie urósł) |
| E2e ekranów pól (realny backend) | `npm run test:e2e -- e2e/tr2w-bez-pola.spec.ts e2e/kreator-stacji-max.spec.ts e2e/etykieta-stacji-rodzaj.spec.ts e2e/stan-ruchowy-pola-brak-telemetrii.spec.ts e2e/s95-budowa-z-kanwy.spec.ts e2e/wyspy-menu-sld.spec.ts e2e/sld-editor-real-backend-flex.spec.ts e2e/critical-run-flow.spec.ts e2e/industrial-template-mass-flow.spec.ts e2e/restart-po-biegu.spec.ts e2e/pasma-rozplywu-jakosc.spec.ts` | RC=0; **18 passed** (6,7 min) |
| Specy zrzutów pól | `E2E_KATALOG_ZRZUTOW=…/docs/audit/visual/w5b/po npm run test:e2e -- e2e/pola-w-torze-zrzuty-screenshot.spec.ts e2e/kreator-stacji-pole-tr-screenshot.spec.ts e2e/etykieta-stacji-zrzuty.spec.ts` oraz `… e2e/kreator-stacji-zrzuty.spec.ts` | RC=0 (5 passed) i RC=0 (3 passed) |

### 1a. Guardy CI — bieg końcowy

Wynik wpisany po zakończeniu biegu na czubku gałęzi (patrz §6).

## 2. Regresja wydajności wykryta przez e2e i usunięta u źródła

Pierwszy bieg e2e ekranów pól na drzewie scalonym dał RC=1: `industrial-template-mass-flow`
(50 szablonów stacji, OZE, analizy, dowody, eksporty) przekraczał limit czasu. Przyczyna:
akcesory typowanego modelu pól liczyły napięcia szyn i zbiór stacji GPZ od nowa przy każdym
pytaniu „czy to pole nN", a widoki logiczne terminali skanowały całą zajętość pól dla każdego
zacisku; dodatkowo (stan sprzed karty) walidacja referencyjna szukała nazwy pola pełnym
przeszukaniem migawki dla każdego znaleziska (O(n²) na walidację).

Naprawa (commit `3e59282c2`, 20/n): `PoziomPol` (napięcia szyn + stacje GPZ) zbierany raz
i przekazywany przez pętle we wszystkich konsumentach (`enm/pola.py`, `zajetosc_pol.py`,
`tor_pola.py`, `pole_transformatorowe.py`, `rodzaj_stacji.py`, `topology.py`, `validator.py`,
`domain_operations.py`, obie migracje, `reference_engine/compliance.py`,
`proof_engine/packs/audit2_skladanie.py`, `analyses/lv_domain/graph_view.py`); grupowanie pól
po stacji w jednym przejściu (`pola_wg_stacji`); indeks zacisk → pole
(`pola_wg_wlasnego_zacisku`); kontekst terminali budowany raz na widok logiczny; indeks pól po
`ref_id` w `reference_engine/validation.py`.

Pomiar (TestClient, 22 kolejne aplikacje szablonów stacji, czas 22. aplikacji):

| Drzewo | Czas 22. aplikacji |
|---|---|
| gałąź integracji `91d769420` | 2593 ms |
| rodzic W5-B przed scaleniem | 7884 ms |
| scalenie przed poprawką | 11 140 ms |
| po poprawce (`3e59282c2`) | **2314 ms** |

Po poprawce e2e `industrial-template-mass-flow` przechodzi (w komplecie 18 passed powyżej).

## 3. Inwentarz konsumentów dawnych słowników pól — przed i po

Pomiar: `git grep -l -E "field_specs|nn_field_specs|switchgear_field_specs"` na trzech drzewach.

| Drzewo | `backend/src` | `frontend/src` produkcyjne | `frontend/src` testy | pozostałe (skrypty, dokumenty, fikstury) |
|---|---|---|---|---|
| baza karty `f3c435b6` (przed) | 22 pliki | 22 pliki | 35 plików | 16 plików |
| gałąź integracji `91d769420` (przed scaleniem) | 24 pliki | 23 pliki | 36 plików | 16 plików |
| czubek W5-B (po) | 5 plików, wszystkie częścią migracji: `enm/migrations/field_specs_promocja.py` (jedyny czytelnik), `enm/migrations/klucze_meta_pola.py` (zbiór przenoszonych kluczy), `enm/store.py` (import migracji przy wczytaniu), docstringi `enm/models.py` i `enm/pola.py` | **0** | **0** | strażnik wskrzeszenia i jego test, allowlista `config/grep_zero_kod_allowlist.txt` (wyłącznie moduł migracji), dokumenty planu i audytu (opis historyczny) |

Żaden konsument (readiness/walidator, wejścia solverów, API, SLD, frontend) nie czyta
`meta.field_specs`; zasada jednego modelu pilnowana strażnikiem w CI.

## 4. Przebieg dokończenia (commity 17/n–21/n po scaleniu)

- `5d05eb0fa` — scalenie `--no-ff` gałęzi integracji (PR #477–#481).
- `11974df2a` (17/n) — fikstury przegenerowane narzędziami repo (`--sprawdz` zielone), piny
  zmierzone na drzewie scalonym (budżet `tsconfig_gate_guard` 61, piny
  `test_solver_input_substitute_guard`, hashe kontyngencji gn01/gn03), typowanie
  `HierarchyTree.test.ts`.
- `005f37e4d` (18/n) — katalog zrzutów spec kadrów pól sterowany `E2E_KATALOG_ZRZUTOW`.
- `0de498527` (19/n) — dwa testy pól rozjechane przez scalenie, naprawione u źródła.
- `3e59282c2` (20/n) — regresja wydajności (§2).
- 21/n — zrzuty „po” na drzewie scalonym, `kreator-stacji-zrzuty.spec.ts` z tą samą zmienną
  katalogu, ten meldunek.

## 5. Zrzuty „po” do werdyktu B-02

Katalog `mv-design-pro/docs/audit/visual/w5b/po/` (realny backend, oba motywy), wytworzone na
drzewie scalonym: kreator stacji (szablon, pola, podgląd), kreator pól bez pola
transformatorowego / domyślne / warianty aparatu, pola w torze (sieć, przelotowa, odgałęźna,
sekcyjna, końcowa), rodzaj stacji (drzewo, gotowość, schemat, stacja). Zrzuty „przed”:
`docs/audit/visual/w5b/przed/`. Oceny jakości wizualnej nie wystawiam — werdykt należy do
właściciela (bramka B-02).

## 6. Czego nie zrobiono i dlaczego

- Kod gotowości W044 pozostaje w walidatorze jako obrona: na typowanym modelu stan, który
  zgłasza, jest nieosiągalny przez operacje domenowe (migracja przy wczytaniu go usuwa). Nie
  usunąłem kodu, bo jego kasacja zmienia rejestr kodów gotowości (kontrakt), a karta nie
  obejmuje zmiany kontraktu.
- Starsze commity gałęzi (sprzed tej sesji) niosą w stopce identyfikator modelu. Nie
  przepisałem historii — karta zakazuje amend, rebase i push --force. Nowe commity tej sesji
  stopki z identyfikatorem modelu nie mają.
- Gałąź integracji miała na własnym drzewie czerwone piny i testy (budżet tsconfig, piny
  substytutów wejścia solvera, hashe kontyngencji) — zmierzone i przypięte na drzewie scalonym
  z komentarzem źródła pomiaru (17/n), nie odłożone.
- Brak werdyktu wizualnego (B-02) — z definicji należy do właściciela.
