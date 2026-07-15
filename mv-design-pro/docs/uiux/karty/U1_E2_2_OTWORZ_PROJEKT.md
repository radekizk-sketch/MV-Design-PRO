# KARTA ZADANIA E2.2 — NOWY / OTWÓRZ PROJEKT (W-102)

**Faza:** U1 · **Epik:** E2 · **Wykonawca:** Sonnet · **Wiążące:**
`AUDYT_RADY_SPECJALISTOW_2026-07.md` (W-102 — start od celu), `MODEL_INTERAKCJI` §2,
`SPEC_KREATORY_2026-07.md` Z3 (gotowe przykłady na starcie).

## 1. Cel
Ekran startowy przestrzeni „Projekt" bez otwartego projektu: wybór celu („Co projektujesz?":
nowa sieć / przyłączenie OZE / rozbudowa / audyt istniejącej — audyt W-102), lista istniejących
projektów, wejście od gotowego przykładu (P-01…P-05 — kafle, akcja przez callback).

## 2. Pliki (TYLKO `frontend/src/ui2/spaces/projekt/otworz/**`)
`OtworzProjekt.tsx` (trzy sekcje: cel → przykłady → istniejące projekty), `CelProjektu.tsx`
(4 kafle celu z opisem PL i konsekwencją: „ustawia domyślną przestrzeń i tryb"),
`ListaProjektow.tsx` (tabela: nazwa, ostatnia zmiana; klik = zaznacz, 2× klik/Enter = otwórz),
`adapters/projektyAdapter.ts` (read-only z istniejącego modułu `ui/projects/**` — znajdź store/API
listy projektów; brak jednoznacznego źródła → adapter-szkielet TODO-KARTA + lista z propsów),
`strings.ts`, `index.ts`, `__tests__/` (≥ 12 testów: sekcje, interakcje, stany pusty/ładowanie/
gotowy, wybór celu → callback `onWybierzCel(cel)`).
**ZAKAZ:** modyfikacji pozostałych `ui2/**`, `ui/**` (odczyt ok), backendu; komponent sterowany
propsami (`projekty`, `onOtworzProjekt(id)`, `onNowyProjekt(cel)`, `onWczytajPrzyklad(idPrzykladu)`);
przykłady P-01…P-05 jako stałe PL z opisami z `SPEC_KREATORY_2026-07.md` §4 (bez implementacji
wczytywania — callback; realizacja = E3).

## 3. Kryteria
1. Wszystkie stany + gramatyka §2 (klik/2×klik/Enter/Esc nie dotyczy — brak dialogu; fokus i ARIA listy).
2. Etykiety PL dokładne: „Co projektujesz?", „Nowa sieć SN", „Przyłączenie źródła OZE",
   „Rozbudowa istniejącej sieci", „Audyt istniejącej sieci", „Zacznij od gotowego przykładu",
   „Istniejące projekty", „Otwórz", „Nazwa", „Ostatnia zmiana". Zakaz identyfikatorów kodowych
   (guard E1.6 już to egzekwuje w ui2).
3. Pełne bramki jak E1.1 §8. Commit lokalny `feat(ui2/spaces): nowy/otwórz projekt W-102 (E2.2)`,
   BEZ push. Raport standardowy.
