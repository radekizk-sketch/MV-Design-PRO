# KARTA ZADANIA D15 — DELTA BACKENDOWA: GENERATOR WNIOSKU OSD (W-707, E13)

**Faza:** U4 · **Epik:** E13 · **Wykonawca:** Opus · **Warstwa:** backend ·
**Wiążące:** CLAUDE.md (NOT-A-SOLVER: wniosek = czysta KOMPOZYCJA istniejących
wyników — ZERO nowych obliczeń; Determinizm: bajtowo identyczny DOCX; WHITE BOX:
każda sekcja cytuje źródło run_id/hash), wzorce: `application/analyses/
certyfikat_zgodnosci.py` (D14 — bramka braków, DOCX deterministyczny,
`make_docx_bytes_deterministic`), `api/oze_analysis_runs.py`
(compliance-certificate:378).

## 0. Rozstrzygnięcia zarządcy (WIĄŻĄCE)
1. W-707 (AUDYT_RADY_SPECJALISTOW_2026-07.md:148): kompletacja wniosku
   o określenie warunków przyłączenia: bilans mocy, zwarcia w punkcie
   przyłączenia, zgodność NC RfG, zestawienia — z listą braków przed
   generacją. Sekcje w D15 WYŁĄCZNIE z istniejących źródeł:
   - **bilans mocy** ← widok walidacji energetycznej przebiegu PF
     (`application/analyses/energy_validation/service.py:118`
     `build_energy_validation_view` — obciążenia, bilans Q, straty; ZBADAJ
     które pola nadają się do bilansu wniosku) + moce zainstalowane źródeł
     z snapshotu (wzorzec `grid_strength._installed_mva_by_bus` z n_parallel),
   - **zwarcia w punkcie przyłączenia** ← przebieg SC FINISHED: Ik''/Sk''
     wskazanego węzła (wzorzec `grid_strength._sk_mva_by_bus:92`),
   - **zgodność NC RfG** ← `NcRfgPtpireeSolver` (ta sama ścieżka co
     macierz/certyfikat D14; werdykt zbiorczy + odesłanie do certyfikatu),
   - **schemat (światło techniczne SLD)** — POZA ZAKRESEM (osobny wątek SLD);
     w dokumencie uczciwa adnotacja „schemat dołączany odrębnie",
   - **zestawienia materiałowe (W-702)** — NIE istnieją jeszcze; sekcja
     pomijana z adnotacją w `zalozenia_pl` (bez atrap).
2. Bramka braków jak D14: brak przebiegu PF/SC, zły rodzaj/status, brak
   modułów NC RfG, brak wskazanego węzła przyłączenia → 422 PL z listą
   braków (deterministyczna kolejność). Wniosek NIE powstaje przy brakach.
3. Wejście (POST, pydantic): identyfikacja (nazwa projektu min 1, nazwa
   przypadku opcjonalna, dane wnioskodawcy opcjonalne — pola tekstowe),
   `pf_run_id`, `sc_run_id`, `bus_ref` punktu przyłączenia,
   `run_request` NC RfG (jak D14). Odpowiedź JSON: sekcje dokumentu +
   `zalozenia_pl` + odciski źródeł (hash per sekcja) + `input_hash`.
4. Eksport DOCX deterministyczny (bajtowy test podwójnego renderu).
   Dokument PO POLSKU, układ sekcji jak §0.1, stopka z odciskami.

## 1. Zakres
1. `application/analyses/wniosek_osd.py` — serwis (widok + render DOCX).
2. Końcówki `POST /api/oze-analysis/osd-application` (JSON) i
   `.../osd-application.docx` w `api/oze_analysis_runs.py` (404/422 PL).
3. Testy ≥ 14: komplet źródeł → wniosek z 3 sekcjami, braki (bez PF, bez SC,
   zły rodzaj, nieznany bus_ref, brak modułów) → 422 z listą PL, determinizm
   bajtowy DOCX, hash stabilny, etykiety PL w DOCX, adnotacje o schemacie
   i zestawieniach obecne, content-type, 404 nieznany przebieg.

## 2. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD`. Baza pełnego pytest: 6043 passed, ZERO failed. Środowisko:
pusty venv worktree → venv główny (D2vgvUMQ); PEŁNE suity z przekierowaniem
do pliku, NIGDY na goły potok; po pełnym pytest NATYCHMIAST commit. Celowane +
PEŁNY pytest ZERO failed; ruff/black/mypy na twoich plikach; guardy: arch,
solver_boundary, pcc_zero, no_codenames, trace_determinism (venv główny).
Commit: `feat(api): generator wniosku OSD z eksportem DOCX (D15)` BEZ push.
Raport standardowy (plik:linia; wykaz pól bilansu z uzasadnieniem).
