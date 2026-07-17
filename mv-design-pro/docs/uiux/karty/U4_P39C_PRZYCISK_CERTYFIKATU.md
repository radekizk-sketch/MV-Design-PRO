# KARTA ZADANIA — PRZYCISK CERTYFIKATU ZGODNOŚCI W MACIERZY NC RfG (E13, domknięcie D14)

**Faza:** U4 · **Epik:** E11/E13 · **Wykonawca:** Opus · **Warstwa:** frontend ·
**Wiążące:** CLAUDE.md (ZERO fizyki; etykiety WYŁĄCZNIE PL; granica SLD).

## 1. Cel
W macierzy NC RfG (`ui2/oze/macierz/MacierzNcRfg.tsx`) — akcja „Certyfikat
zgodności": pobranie widoku `POST /api/oze-analysis/compliance-certificate`
(JSON; ZBADAJ kształt żądania `CertyfikatZgodnosciRequest` i odpowiedzi
w `backend/src/application/analyses/certyfikat_zgodnosci.py` +
`api/oze_analysis_runs.py`) oraz pobranie pliku
`.../compliance-certificate.docx` (blob → zapis pliku przeglądarkowo).

## 2. Zakres
1. Klient w `ui2/oze/api.ts`: `pobierzCertyfikat` (JSON) i
   `pobierzCertyfikatDocx` (blob; obsługa błędów PL z `detail` — w tym 422
   z listą braków).
2. UI w macierzy: przycisk „Certyfikat zgodności" aktywny gdy bieg zgodności
   zakończony (stan z `ncRfgStore`); klik → panel/sekcja podglądu (werdykt
   zbiorczy, identyfikacja, liczba modułów/testów, braki jeżeli 422 — lista
   PL z uczciwym wyjaśnieniem „certyfikat nie może powstać") + przycisk
   „Pobierz DOCX" (nazwa pliku: `certyfikat-zgodnosci-<data>.docx`).
   Zero martwych klików; stany: brak biegu → przycisk nieaktywny z tytułem
   wyjaśniającym PL.
3. Testy Vitest ≥ 8: przycisk nieaktywny bez biegu, podgląd z fixture 1:1
   z kontraktem, lista braków 422, błąd API PL, pobranie DOCX (mock blob +
   URL.createObjectURL), etykiety PL.

## 3. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD` (HEAD zawiera scalenie #24). Baza vitest: 8553, ZERO failed.
Brak node_modules → symlink do głównego repo (NIE commituj). PEŁNY vitest
z przekierowaniem do pliku, NIGDY na goły potok; NIE edytuj src w trakcie.
Bramki (pipefail, z frontend/): type-check, lint --max-warnings 0, PEŁNY
npm test ZERO failed, guard:codenames; z mv-design-pro: forbidden_ui_terms,
ui_terminology, utf8_mojibake. NIE dotykaj SLD. Po pełnym vitest NATYCHMIAST
commit: `feat(ui2): certyfikat zgodności w macierzy NC RfG (E13)` BEZ push.
Raport standardowy (plik:linia).
