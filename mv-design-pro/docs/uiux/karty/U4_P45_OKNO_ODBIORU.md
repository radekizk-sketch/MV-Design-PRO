# KARTA ZADANIA — OKNO FRONTENDOWE: ZGODNOŚĆ POWYKONAWCZA (P45)

**Faza:** U4 · **Epik:** E11/E13 · **Wykonawca:** Opus · **Warstwa:** frontend ·
**Wiążące:** CLAUDE.md (ZERO fizyki w UI; etykiety WYŁĄCZNIE PL; granica SLD),
wzorce: `ui2/wyniki/jakosc/EkranJakosci.tsx` (wybór przebiegu, sekcje),
`ui2/oze/lom/EkranLom.tsx` (świeży wzorzec tabeli werdyktów ze scalenia #19),
wzorzec `EkranAnalizy`/`TabelaWynikow` (`ui2/wyniki/wzorzec/`),
`ui2/spaces/wyniki/WynikiWarsztat.tsx` (warsztat).

## 1. Cel
Okno „Zgodność powykonawcza" — domknięcie pętli projekt → budowa → odbiór:
wprowadzenie pomiarów z obiektu (wklejenie CSV lub wiersze ręczne), jawne
tolerancje, wybór zakończonego przebiegu rozpływu, raport rozbieżności
z backendu `POST /api/quality/as-built-compliance` (scalenie #20).

## 2. Zakres
1. NOWA zakładka warsztatu `odbior` („Zgodność powykonawcza") w grupie ANALIZ
   za „Porównanie A/B" (`WynikiWarsztat.tsx`: ZAKLADKI + GRUPY_ZAKLADEK,
   testid `mvd-wyniki-zakladka-odbior`; `strings.ts`), test warsztatu
   rozszerzony (wzorzec z asercji zakładki `lom`).
2. Moduł `ui2/wyniki/odbior/` (EkranOdbioru + model + strings + css + api.ts):
   - wybór przebiegu rozpływu (wzorzec selektora z `EkranJakosci` — sekcje PF;
     bez przebiegu → uczciwa instrukcja PL),
   - wejście pomiarów: pole tekstowe na CSV (nagłówek
     `element_ref;wielkosc;wartosc;jednostka`, opis formatu widoczny przy polu,
     średnik lub przecinek, przecinek dziesiętny przy średniku) ORAZ
     alternatywnie edytor wierszy (element_ref, wielkość U/P/Q, wartość,
     jednostka — dodaj/usuń, wzorzec edytora zapadów z
     `ui2/oze/frt/SekcjaSekwencjiZapadow.tsx`),
   - tolerancje JAWNE (napięcie %, moc %) — pola liczbowe z przecinkiem PL,
     wymagane zależnie od mierzonych wielkości (walidacja przed wysłaniem,
     komunikat PL; backend i tak zwróci 422 PL),
   - raport: chipy podsumowania (liczby wg werdyktów, największa odchyłka),
     tabela wierszy (`TabelaWynikow`: element, wielkość, pomiar, model,
     odchyłka bezwzgl. i %, tolerancja, werdykt PL kolorem tokenów --mvd-*),
     sekcja `zalozenia_pl` ZAWSZE widoczna (m.in. Q po |wartości| — V12K-040),
     ślad WHITE BOX per wiersz w trybie zaawansowanym (wzorzec inline jak
     sekcja migotania w `EkranJakosci`),
   - błędy API → komunikat PL z `detail` (konwencja `getJsonZDetalem` —
     klient POST w `odbior/api.ts`, wzorzec POST: poszukaj istniejących
     klientów POST w `ui2/**/api.ts`; jeśli brak — napisz analogicznie
     do GET z `getJsonZDetalem`, body JSON).
3. Testy Vitest ≥ 12: stan bez przebiegu, walidacja tolerancji, parser-side
   serializacja żądania (CSV przechodzi surowe, wiersze → JSON), render
   raportu z fixture 1:1 z kontraktem backendu (`zgodnosc_powykonawcza.py` —
   przeczytaj kształt), werdykty kolorami, założenia widoczne, błąd 422 PL,
   zakładka `odbior` w warsztacie (render + brak regresji klawiatury),
   edytor wierszy (dodaj/usuń), formaty liczb PL.

## 3. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD` (HEAD zawiera scalenie #20 i tę kartę). Bramki (pipefail,
z `mv-design-pro/frontend`): `npm run type-check`, `npm run lint --
--max-warnings 0`, PEŁNY `npm test` — ZERO failed (baza 8510 + twoje ≥12);
guardy: `npm run guard:codenames`; z `mv-design-pro`:
`python scripts/forbidden_ui_terms_guard.py && python scripts/ui_terminology_guard.py
&& python scripts/utf8_mojibake_guard.py`. NIE dotykaj plików SLD. NIE twórz
KATALOGÓW `api/` (tylko plik `api.ts`). Po pełnym vitest NATYCHMIAST commit:
`feat(ui2): okno zgodności powykonawczej (P45)` BEZ push. Raport standardowy.
