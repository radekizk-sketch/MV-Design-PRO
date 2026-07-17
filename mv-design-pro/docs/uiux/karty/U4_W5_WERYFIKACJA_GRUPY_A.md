# KARTA ZADANIA W5a — WERYFIKACJA POKRYCIA GRUPY A (wygaszanie mostu, przed W5)

**Faza:** U5 · **Plan:** `docs/uiux/PLAN_WYGASZANIA_MOSTU_WYNIKI.md` (fala W5)
· **Wykonawca:** Opus · **Warstwa:** AUDYT read-only + raport (ZERO zmian
w src poza rejestrem planu) · **Wiążące:** CLAUDE.md; zasada pokrycia 1:1
(inwentarz `INWENTARZ_FUNKCJI_2026-07.md` wiąże).

## 1. Cel
Zanim W5 wygasi trasy dublujące, potrzebny AUDYT pokrycia 1:1 trzech
powierzchni Grupy A względem okien ui2:
1. **AnalysisSurface** (router mostu) vs zakładki Rozpływ/Zwarcia warsztatu
   (`ui2/wyniki/rozplyw`, `zwarcia`): wypisz KAŻDĄ funkcję/kolumnę/akcję
   powierzchni mostu (dane, filtry, eksporty, nawigacje, klawiatura)
   i przypisz odpowiednik ui2 albo BRAK.
2. **ProofSurface** vs zakładka „Dowód obliczeń" (`ui2/spaces/wyniki/
   DowodPrzebiegu.tsx` + `ui2/wyniki/dowod/`): jw.
3. **ComplianceSurface** vs macierz NC RfG (`ui2/oze/macierz/`): jw.

## 2. Wynik
Raport tabelaryczny per powierzchnia (funkcja → odpowiednik ui2 plik:linia →
werdykt POKRYTE/BRAK/CZĘŚCIOWE z opisem) + rekomendacja per trasa:
WYGASIĆ TERAZ / NAJPIERW DOMKNĄĆ (lista brakujących funkcji jako propozycje
kart) / ZOSTAWIĆ. Wpis do `PLAN_WYGASZANIA_MOSTU_WYNIKI.md` §4 (rejestr W5a)
z tabelą werdyktów. ŻADNEGO wygaszania tras w tej karcie — wyłącznie audyt
(decyzja o wygaszeniu = osobna karta W5b na podstawie tego raportu).

## 3. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD`. Jedyna zmiana plikowa: `PLAN_WYGASZANIA_MOSTU_WYNIKI.md`
(+ ewentualnie nic więcej). Guardy dokumentacyjne: `python scripts/
docs_guard.py` i `utf8_mojibake_guard.py` (z mv-design-pro). Commit:
`docs(uiux): audyt pokrycia Grupy A mostu wyników (W5a)` BEZ push.
Raport standardowy (pełne tabele w raporcie, skrót w planie).
