# KARTA ZADANIA D14 — DELTA BACKENDOWA: CERTYFIKAT ZGODNOŚCI PROJEKTU (E13, TODO P39)

**Faza:** U4 · **Epik:** E13 · **Wykonawca:** Opus · **Warstwa:** backend ·
**Wiążące:** CLAUDE.md (NOT-A-SOLVER: certyfikat = czysta kompozycja ISTNIEJĄCYCH
werdyktów zgodności — ZERO nowych ocen, ZERO fizyki; Determinizm: identyczne
wejście → bajtowo identyczny eksport; WHITE BOX: certyfikat cytuje źródła
werdyktów), wzorce: `application/ncrfg_compliance/checker.py`
(`NcRfgComplianceReport`:30, `overall_pass`:42),
`api/ncrfg_ptpiree_tests.py` (`POST /run`:40 — ZBADAJ czym karmi macierz
frontendu i jaki ma kształt odpowiedzi), `network_model/reporting/
protection_report_docx.py` (deterministyczny DOCX przez
`docx_determinism.make_docx_bytes_deterministic`), `analysis/reporting/`
(PDF: `audit2_report.py:105`).

## 0. Rozstrzygnięcia zarządcy (WIĄŻĄCE)
1. Certyfikat generowany WYŁĄCZNIE z istniejących wyników zgodności NC RfG
   (ta sama ścieżka, którą liczy macierz — ZBADAJ i wskaż w raporcie
   plik:linia). Żadnego przeliczania testów w serwisie certyfikatu.
2. Uczciwa bramka kompletności: certyfikat NIE powstaje, gdy są braki —
   odpowiedź z listą braków PL (moduły bez werdyktów, testy „no_module",
   brak klasy modułu itd.); wzór na W-707 „lista braków przed generacją".
   Przy `overall_pass == False` certyfikat POWSTAJE, ale z jednoznacznym
   werdyktem negatywnym (dokument stwierdza stan — nie tylko sukces).
3. Eksport: JSON (widok) + DOCX (deterministyczny — użyj
   `make_docx_bytes_deterministic`) w pierwszej kolejności; PDF tylko jeżeli
   istniejąca infrastruktura pozwala bez nowych zależności (inaczej TODO
   w raporcie). Dokument PO POLSKU: nagłówek („Certyfikat zgodności projektu
   z wymaganiami NC RfG" + identyfikacja projektu/przypadku), tabela modułów
   (moduł, klasa A/B/C/D, testy: nazwa PL → werdykt → wartości), werdykt
   zbiorczy, założenia i źródła (profil operatora, wersje), odcisk SHA-256
   wejścia w stopce. ZERO kodów projektowych.
4. Determinizm: dwa wywołania na tym samym wejściu → identyczne bajty DOCX
   i identyczny `input_hash` (test bajtowy obowiązkowy).

## 1. Zakres
1. `application/analyses/certyfikat_zgodnosci.py` — serwis: budowa widoku
   certyfikatu (JSON: sekcje dokumentu + braki + hash) i renderery eksportu.
2. Końcówki w rodzinie OZE (`api/oze_analysis_runs.py` lub obok macierzy —
   spójnie z tym, skąd macierz bierze dane; uzasadnij wybór w raporcie):
   `.../compliance-certificate` (JSON) i `.../compliance-certificate.docx`
   (bajty, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`);
   404/422 PL.
3. Testy ≥ 14: certyfikat z kompletu werdyktów (pozytywny i negatywny),
   braki blokują generację z listą PL, determinizm bajtowy DOCX (dwukrotny
   render), hash stabilny, nagłówki/etykiety PL w dokumencie (odczyt DOCX
   w teście), 404/422, content-type.

## 2. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD`. Baza pełnego pytest: 6027 passed, ZERO failed. Środowisko:
pusty venv worktree → `/root/.cache/pypoetry/virtualenvs/
mv-design-pro-backend-D2vgvUMQ-py3.11/bin/python`. PEŁNE suity z przekierowaniem
do pliku (`... -q > pelny_pytest.log 2>&1`), NIGDY na goły potok. Celowane +
PEŁNY pytest ZERO failed; ruff/black/mypy na twoich plikach; guardy: arch,
solver_boundary, pcc_zero, no_codenames, trace_determinism (venv główny).
Po pełnym pytest NATYCHMIAST commit:
`feat(api): certyfikat zgodności projektu NC RfG z eksportem DOCX (D14)`
BEZ push. Raport standardowy (plik:linia; decyzja lokalizacji końcówki;
status PDF).
