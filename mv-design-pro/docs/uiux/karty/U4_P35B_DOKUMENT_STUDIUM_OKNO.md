# KARTA ZADANIA P35b — DOKUMENT STUDIUM W KREATORZE (E13, dopięcie D17)

**Faza:** U4 · **Epik:** E11/E13 · **Wykonawca:** Opus · **Warstwa:** frontend ·
**Wiążące:** CLAUDE.md (ZERO fizyki; etykiety PL; granica SLD), wzorce:
sekcja certyfikatu w `ui2/oze/macierz/MacierzNcRfg.tsx` (P39c — pobranie
blob, braki 422 jako obiekt), `ui2/oze/wniosek/EkranWniosku.tsx` (W-707),
`ui2/oze/studium/KreatorStudium.tsx` + `studiumModel.ts`.

## 1. Cel
Po zakończonym biegu studium w kreatorze (`KreatorStudium`) — akcja
„Dokument studium": `POST /api/oze-analysis/connection-study` (JSON podgląd)
+ pobranie `.docx`/`.pdf` (ZBADAJ kształt żądania/odpowiedzi w
`backend/src/application/analyses/dokument_studium.py` +
`api/oze_analysis_runs.py` connection-study; żądanie buduj 1:1 z parametrów
zakończonego biegu kreatora: catalog_item_id, operator_id, warianty
w kolejności, run_id).

## 2. Zakres
1. Klienci w `ui2/oze/api.ts`: `pobierzDokumentStudium` (JSON),
   `pobierzDokumentStudiumDocx`/`Pdf` (blob); braki 422 (obiekt z listą) →
   klasa błędu wzorem `CertyfikatBrakiError`; błędy PL z `detail`.
2. Kreator: przycisk „Dokument studium" aktywny gdy bieg zakończony
   (przynajmniej jeden wariant policzony); panel podglądu: identyfikacja,
   założenia, tabela podsumowania wariantów (max moc, werdykt pokrycia,
   klasa NC RfG), sekcje błędów wariantów uczciwie; braki 422 → lista PL;
   „Pobierz DOCX" i „Pobierz PDF" (`studium-<data>.docx/.pdf`, wzorzec
   `zapiszBlob`). Przycisk nieaktywny z tytułem PL gdy brak biegu.
3. Testy Vitest ≥ 10: przycisk nieaktywny bez biegu, żądanie 1:1
   z parametrów biegu, podgląd z fixture 1:1 z kontraktem, sekcja błędu
   wariantu, braki 422, błąd API PL, pobrania DOCX i PDF (mock blob),
   etykiety PL, istniejące testy kreatora bez regresji.

## 3. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD` (HEAD zawiera scalenie #32). Baza vitest: 8634, ZERO
failed. Środowisko: symlink node_modules (NIE commituj); pętla `until` przed
pełnym vitest (nigdy dwie pełne suity równolegle — w tle może biec
konfirmacja zarządcy); pełny vitest do pliku (usuń przed commitem); NIE
edytuj src w trakcie; po biegu NATYCHMIAST commit. Bramki (pipefail,
z frontend/): type-check, lint --max-warnings 0, PEŁNY npm test ZERO failed
(twoje ≥10), guard:codenames; z mv-design-pro: forbidden_ui_terms,
ui_terminology, utf8_mojibake. NIE dotykaj SLD. Commit:
`feat(ui2): dokument studium w kreatorze (P35b)` BEZ push.
Raport standardowy (plik:linia).
