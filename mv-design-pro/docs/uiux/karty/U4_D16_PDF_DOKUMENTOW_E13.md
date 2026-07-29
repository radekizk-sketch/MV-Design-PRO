# KARTA ZADANIA D16 — DELTA BACKENDOWA: EKSPORT PDF CERTYFIKATU I WNIOSKU OSD (E13)

**Faza:** U4 · **Epik:** E13 · **Wykonawca:** Opus · **Warstwa:** backend ·
**Wiążące:** CLAUDE.md (kompozycja bez nowych ocen; determinizm wg PRECEDENSU
repo dla PDF: „Treść dokumentu jest deterministyczna, ale format binarny nie"
— `tests/e2e/test_pf_exports_deterministic.py:19`; ZERO nowych zależności),
wzorce: `network_model/reporting/power_flow_report_pdf.py` (reportlab,
`export_power_flow_result_to_pdf`), `application/analyses/
certyfikat_zgodnosci.py` (D14 — widok), `wniosek_osd.py` (D15 — widok),
`api/oze_analysis_runs.py` (końcówki .docx D14/D15).

## 1. Cel
Domknięcie świadomego TODO z D14: warianty PDF dla certyfikatu zgodności
i wniosku OSD — rendery reportlab Z WIDOKÓW D14/D15 (zero nowej logiki
merytorycznej; układ sekcji 1:1 z DOCX, PL).

## 2. Zakres
1. Renderery `render_certyfikat_pdf(widok)` i `render_wniosek_pdf(widok)` —
   umiejscowienie wg istniejącej struktury raportów (ZBADAJ czy obok
   serwisów D14/D15, czy w `network_model/reporting/` — spójnie z tym,
   gdzie żyją inne render_*_pdf; uzasadnij w raporcie). Fonty/układ jak
   istniejące raporty PDF (bez nowych zasobów).
2. Końcówki `.../compliance-certificate.pdf` i `.../osd-application.pdf`
   w `api/oze_analysis_runs.py` (content-type `application/pdf`; ta sama
   bramka braków co JSON/DOCX — 422 PL).
3. Determinizm: TREŚĆ deterministyczna — test wg wzorca
   `test_pf_exports_deterministic.py` (ekstrakcja tekstu/struktury lub
   porównanie po normalizacji jak w precedensie; ZBADAJ jak dokładnie tamte
   testy weryfikują PDF i zrób tak samo). Jeżeli istnieje prosty sposób na
   determinizm bajtowy reportlab bez nowych zależności (stały
   `CreationDate`/`ID` przez API canvas) — zastosuj i przetestuj bajtowo;
   jeżeli nie — precedens treściowy wystarcza (decyzja w raporcie).
4. Testy ≥ 10: PDF powstaje dla obu dokumentów (nagłówek %PDF, niepusty),
   zawiera kluczowe etykiety PL (ekstrakcja tekstu), bramka braków 422,
   determinizm wg §2.3, content-type, 404.

## 3. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD`. Baza pytest: 6066, ZERO failed. Środowisko: venv główny
(D2vgvUMQ) przy pustym venv; pełny pytest do pliku, NIGDY na goły potok;
po biegu NATYCHMIAST commit. Celowane + PEŁNY pytest ZERO failed;
ruff/black/mypy na twoich plikach; guardy: arch, solver_boundary, pcc_zero,
no_codenames (venv główny). ZERO nowych zależności. Commit:
`feat(api): eksport PDF certyfikatu i wniosku OSD (D16)` BEZ push.
Raport standardowy (plik:linia; decyzja determinizmu bajtowego vs treściowego).
