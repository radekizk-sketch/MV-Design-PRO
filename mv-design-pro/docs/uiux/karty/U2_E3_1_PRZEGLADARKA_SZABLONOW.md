# KARTA ZADANIA E3.1 — PRZEGLĄDARKA SZABLONÓW STACJI (część W-203)

**Faza:** U2 · **Epik:** E3 · **Wykonawca:** Sonnet · **Wiążące:** `SZABLONY_STACJI_2026-07.md`
(taksonomia ról A–E, §3 przeglądarka), `SPEC_KREATORY_2026-07.md` Z1/Z2/Z4, `MODEL_INTERAKCJI` §2,
`AUDYT_RADY_SPECJALISTOW` (W-203).

## 1. Cel
Przeglądarka biblioteki 57+ szablonów stacji w nowej powłoce (przestrzeń „Model sieci"):
drzewko ról A–E → kafle wariantów (miniatura pól, moc, liczba pól, opis zastosowania PL) →
panel szczegółów → „Zastosuj i edytuj" (callback). Fundament kreatora stacji.

## 2. Pliki (TYLKO `frontend/src/ui2/spaces/model/szablony/**`)
`PrzegladarkaSzablonow.tsx` (układ: drzewko grup + kafle + szczegóły), `GrupyRol.ts` (mapowanie
10 kategorii backendu → role A–E wg SZABLONY_STACJI §1; kategorie bez roli → „B. Dystrybucja"
z TODO-KARTA), `KafelSzablonu.tsx` (miniatura = schematyczny rząd pól SVG z danych szablonu,
deterministyczny), `SzczegolySzablonu.tsx` (pola/aparaty/transformator + parametry edytowalne),
`FiltrySzablonow.tsx` (moc, napięcie, liczba pól — czyste funkcje), `PorownanieSzablonow.tsx`
(2 zaznaczone → tabela różnic), `api/szablonyClient.ts` (cienki klient ISTNIEJĄCEGO API
`GET /api/station-templates` + `/{id}` — sprawdź istniejący klient w `ui/network-build/**`
i użyj go, jeśli jest; typy z odpowiedzi backendu, zero zgadywania pól — zbadaj
`backend/src/api/station_templates.py` dla kształtu), `strings.ts`, `index.ts`, `__tests__/`
(≥ 24 testy; API mokowane fixture'ami o kształcie realnej odpowiedzi).

## 3. Zasady
Gramatyka §2 (klik=podgląd, 2×klik=„Zastosuj i edytuj" przez callback `onZastosuj(idSzablonu)` —
sama aplikacja szablonu = istniejący endpoint apply, wywołanie w karcie integracyjnej);
prawy klik = menu (Porównaj / Pokaż wymagania danych). Stany: ładowanie/błąd (z akcją
„Spróbuj ponownie")/pusty/gotowy. Etykiety PL (guard E1.6); grupy dokładnie: „A. Zasilanie
sieci", „B. Dystrybucja SN/nn", „C. Odbiorcze", „D. Źródła i magazyny", „E. Specjalne".
Tokeny --mvd-*; zero Date.now/random (miniatura deterministyczna z danych).

## 4. Kryteria
1. Drzewko A–E z licznikami szablonów; wybór grupy filtruje kafle (testy mapowania 10 kategorii).
2. Kafle + szczegóły z realnego kształtu API (fixture 1:1); filtry (3) z testami czystych funkcji.
3. Porównanie 2 szablonów: tabela różnic (pola, aparaty, transformator).
4. Pełne bramki jak E1.1 §8 (pipefail). Commit `feat(ui2/model): przeglądarka szablonów stacji (E3.1)`
   BEZ push. Raport standardowy + mapowanie kształtu API (plik:linia backendu).
