# KARTA ZADANIA — OKNO WNIOSKU OSD (W-707, E13)

**Faza:** U4 · **Epik:** E13 · **Wykonawca:** Opus · **Warstwa:** frontend ·
**Wiążące:** CLAUDE.md (ZERO fizyki; etykiety WYŁĄCZNIE PL; granica SLD),
wzorce: `ui2/oze/macierz/MacierzNcRfg.tsx` (P39c — sekcja certyfikatu, pobranie
DOCX `zapiszBlob`, `CertyfikatBrakiError`), `ui2/wyniki/odbior/EkranOdbioru.tsx`
(wybór przebiegu + formularz), `ui2/spaces/wyniki/WynikiWarsztat.tsx`.

## 1. Cel
Okno „Wniosek OSD" — kompletacja wniosku o warunki przyłączenia z backendu
D15: `POST /api/oze-analysis/osd-application` (JSON) i `.../osd-application.docx`
(ZBADAJ kształt `WniosekOsdRequest` i odpowiedzi w
`backend/src/application/analyses/wniosek_osd.py` + `api/oze_analysis_runs.py`).

## 2. Zakres
1. NOWA zakładka warsztatu `wniosek` („Wniosek OSD", grupa OZE za `osd`) —
   `WynikiWarsztat.tsx` + `strings.ts` + rozszerzenie testu warsztatu
   (wzorzec zakładki `odbior`/`lom`).
2. Moduł `ui2/oze/wniosek/` (EkranWniosku + model + strings + css; klienci
   w `ui2/oze/api.ts` wzorem certyfikatu — JSON + blob, błędy PL z `detail`,
   422 braki jako obiekt z listą):
   - formularz: wybór zakończonego przebiegu ROZPŁYWU i przebiegu
     ZWARCIOWEGO (runStore, filtry rodzaju jak EkranOdbioru/EkranJakosci),
     węzeł przyłączenia (pole tekstowe z opisem PL), nazwa projektu
     (wymagana), nazwa przypadku / wnioskodawca / adres (opcjonalne),
     `run_request` NC RfG z `ncRfgStore.ostatnieWejscia` (jak certyfikat
     P39c; brak zakończonego biegu NC RfG → przycisk nieaktywny z tytułem
     wyjaśniającym PL),
   - wynik: sekcje wniosku (bilans mocy, zwarcia punktu, zgodność NC RfG)
     w tabelach/opisach PL, adnotacje o schemacie i zestawieniach widoczne
     (`zalozenia_pl`), odciski sekcji w trybie zaawansowanym,
   - braki 422 → uczciwa lista PL („wniosek nie może powstać"),
   - „Pobierz DOCX" (`wniosek-osd-<data>.docx`).
3. Testy Vitest ≥ 12: przycisk nieaktywny bez biegów (każdy z braków),
   formularz waliduje nazwę projektu, render sekcji z fixture 1:1
   z kontraktem, braki 422, błąd API PL, pobranie DOCX (mock blob),
   zakładka `wniosek` w warsztacie (render + klawiatura bez regresji),
   etykiety PL.

## 3. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD` (HEAD zawiera scalenie #26). Baza vitest: 8564 (po
konfirmacji #25r — liczy się ZERO failed). Brak node_modules → symlink
do głównego repo (NIE commituj). PEŁNY vitest z przekierowaniem do pliku
(log usuń przed commitem), NIGDY na goły potok; NIE edytuj src w trakcie;
po pełnym biegu NATYCHMIAST commit. UWAGA: w tle zarządcy może biec pełna
suita — przed startem TWOJEGO pełnego vitest sprawdź `ps aux | grep -E
"vitest|pytest" | grep -v grep` i jeżeli biegnie, poczekaj pętlą
`until ! ps aux | grep -E "vitest|pytest" | grep -v grep > /dev/null; do
sleep 30; done` (nigdy dwie pełne suity równolegle).
Bramki (pipefail, z frontend/): type-check, lint --max-warnings 0, PEŁNY
npm test ZERO failed, guard:codenames; z mv-design-pro: forbidden_ui_terms,
ui_terminology, utf8_mojibake. NIE dotykaj SLD. Commit:
`feat(ui2): okno wniosku OSD (W-707)` BEZ push. Raport standardowy.
