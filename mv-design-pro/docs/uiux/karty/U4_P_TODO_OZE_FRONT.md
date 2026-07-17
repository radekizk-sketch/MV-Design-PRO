# KARTA ZADANIA — KONSOLIDACJA TODO-KART FRONTENDU STRUMIENIA OZE

**Faza:** U4 · **Wykonawca:** Opus · **Warstwa:** frontend ·
**Wiążące:** CLAUDE.md (ZERO fizyki w UI; etykiety WYŁĄCZNIE PL; granica SLD;
zero kodów projektowych). Cztery DROBNE domknięcia zarejestrowanych TODO-KART.

## 1. Zakres (cztery punkty)
1. **Kontekst siły sieci w sekwencji zapadów (TODO #19)**: sekcja
   `ui2/oze/frt/SekcjaSekwencjiZapadow.tsx` — dodaj selektory `run_id`
   (zakończone przebiegi ZWARCIOWE z `ui/study-cases/runStore` — wzorzec
   filtrowania rodzaju jak `useWpiecieWynikow`/EkranJakosci) i `bus_ref`
   (pole tekstowe z opisem PL); klient `pobierzSekwencjeFrt` już przyjmuje
   `runId`/`busRef` (`ui2/oze/api.ts`). Bez wyboru — zachowanie dzisiejsze.
2. **Klasa modułu w podsumowaniu macierzy NC RfG (TODO P39)**: macierz
   (`ui2/oze/macierz/`) — klasa A/B/C/D modułu jest w danych biegu (ZBADAJ
   store `ncRfgStore.ts` i odpowiedź backendu); wyeksponuj w podsumowaniu/
   nagłówku werdyktu modułu (etykieta PL „Klasa modułu"), bez zmian logiki.
3. **Nazwa przypadku w etykiecie przebiegu porównania A/B (TODO E12.1)**:
   `ui2/wyniki/porownanie/` — etykiety przebiegów w selektorach A/B mają
   pokazywać nazwę przypadku obliczeniowego obok znacznika czasu (źródło:
   store przypadków `ui/study-cases/store` po `study_case_id` przebiegu;
   brak → dzisiejsza etykieta, zero zgadywania).
4. **Konwencja formatera energii (TODO P47a)**: w `ui2/oze/pulpit/` energia
   magazynu formatowana ad hoc — ujednolić: jeden formater PL (kWh < 1000,
   MWh ≥ 1000, przecinek PL, jednostka po spacji) w miejscu wspólnym modułu
   oze (lub istniejących formaterach ui2 — ZBADAJ, nie duplikuj), użyty
   w sekcji magazynu; testy formatera z przypadkami granicznymi.
POZA ZAKRESEM (za duże na konsolidację, zostają w rejestrze): mapowanie
moduł→węzeł dla podświetlenia, porównanie zwarć, eksport porównania,
wirtualizacja tabel, certyfikat E13/W-707.

## 2. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD`. Baza pełnego vitest: 8536 passed, ZERO failed. Jeśli brak
`node_modules` w worktree — symlink do głównego repo (NIE commituj). PEŁNE
suity Z PRZEKIEROWANIEM DO PLIKU (`npm test > pelny_vitest.log 2>&1`; potem
`tail`/`grep` pliku) — NIE na goły potok. Bramki (pipefail, z frontend/):
type-check, lint --max-warnings 0, PEŁNY npm test ZERO failed (twoje testy
≥12 łącznie), `npm run guard:codenames`; z `mv-design-pro`:
forbidden_ui_terms, ui_terminology, utf8_mojibake. NIE dotykaj SLD. Po pełnym
vitest NATYCHMIAST commit: `feat(ui2): konsolidacja TODO strumienia OZE —
kontekst SCR, klasa modułu, etykiety, formater energii` BEZ push.
Raport standardowy (plik:linia).
