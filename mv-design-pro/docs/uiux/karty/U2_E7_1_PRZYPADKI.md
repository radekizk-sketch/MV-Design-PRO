# KARTA ZADANIA E7.1 — MENEDŻER PRZYPADKÓW OBLICZENIOWYCH (W-501)

**Faza:** U2 · **Epik:** E7 · **Wykonawca:** Opus · **Wiążące:** `AUDYT_RADY_SPECJALISTOW`
(W-501: tabela porównawcza konfiguracji, dziedziczenie, JAWNE ZAŁOŻENIA na karcie przypadku),
`SPEC_POWIAZANIA_WARSTW` §3 (jeden aktywny przypadek), `MODEL_INTERAKCJI` §2.

## 1. Cel
Nowe okno przestrzeni „Obliczenia": lista przypadków obliczeniowych z konfiguracją i statusem
wyników, karta przypadku z JAWNYMI założeniami (współczynnik napięciowy c, temperatura,
stan łączeń — „założenia są częścią wyniku"), aktywacja przypadku, utworzenie/klonowanie
(przez istniejące API study-cases), tabela porównawcza konfiguracji 2+ przypadków (czym się
różnią). Zastąpi most CaseConfigPage+RunHistoryPanel (podmiana = scalenie zarządcy).

## 2. Pliki (TYLKO `frontend/src/ui2/spaces/obliczenia/**`)
`MenedzerPrzypadkow.tsx` (lista + szczegóły), `KartaPrzypadku.tsx` (konfiguracja + sekcja
„Założenia" z wartościami i pochodzeniem; parametry z istniejących typów `StudyCase` —
zbadaj `ui/study-cases/types.ts` i API; pola nieobecne w typach → sekcja „wkrótce",
NIE zgaduj), `PorownanieKonfiguracji.tsx` (2+ przypadki → tabela różnic), `NowyPrzypadek.tsx`
(dialog: nazwa, zakres analizy, dziedziczenie „jak {nazwa}, ale…" przez klonowanie —
istniejące API clone jeśli jest; brak → tylko nowy, TODO-KARTA), `adapters/przypadkiAdapter.ts`
(read-only ze store'ów study-cases; akcje aktywacji/utworzenia przez istniejące API/akcje
store — udokumentuj plik:linia), `strings.ts`, `index.ts`, `__tests__/` (≥ 24 testy).

## 3. Zasady i kryteria
Gramatyka §2 (klik=selekcja+szczegóły, 2×klik=aktywuj, prawy=menu: Aktywuj/Klonuj/Porównaj);
zmiana aktywnego przypadku przez ISTNIEJĄCĄ akcję store (atomowa dla całej powłoki — SPEC §3.2);
statusy wyników tagami PL (aktualne/nieaktualne/brak — spójne z E15.2); słownik V12K-026;
zero fizyki; zero snake_case w UI. Kryteria: (1) lista+karta+założenia z realnych typów,
(2) porównanie konfiguracji, (3) aktywacja emituje się przez store (test: `useAppStateStore`
odzwierciedla zmianę), (4) dialog nowego przypadku woła API (mock) z walidacją nazwy,
(5) pełne bramki jak E1.1 §8. Commit `feat(ui2/obliczenia): menedżer przypadków W-501 (E7.1)`
BEZ push. Raport standardowy z mapowaniami plik:linia.
