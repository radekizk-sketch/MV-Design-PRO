# Przekazanie stanu sesji architekta — 2026-10-23

Gałąź archiwalna `claude/mv-design-pro-twin-audit-u4lhy0-przekazanie`. NIE DO SCALENIA
do programu ani do `main` — zawiera karty, notatki sesji i zrzuty z katalogu roboczego
kontenera, które inaczej przepadłyby przy jego wygaszeniu. Kolejna sesja czyta ten plik
i wznawia pracę od punktu „Kolejne kroki”.

## Stan gałęzi (zweryfikowany przed zapisem)

| Gałąź (`claude/mv-design-pro-twin-audit-u4lhy0` + sufiks) | Commit | Stan |
|---|---|---|
| program (bez sufiksu) | `d543faf3c` | 9/9 workflowów CI zielonych; fast-forward z `c64f40f0c` wykonany 2026-10-23 ~05:40 UTC |
| `-partia-2` | `db1c688a5` | partia 2 (LINIA-110, PODSTAWA-Q, poprawki, dane przyjęte wkładów) + scalenie programu `d543faf3c`; **bramka B-01 NIEDOKOŃCZONA** (patrz niżej) |
| `-dane-przyjete-ekrany` | `753e1763a` (+ ewentualny commit `WIP:` wykonawcy) | karta DANE-PRZYJETE-EKRANY na bazie `b6142a2d0`; recenzja zwróciła 2 defekty klasy (niżej) |
| `-karta-uiux-przemyslowy` | `fa129e7dd` | wątek UX; KOORDYNACJA wpis 15; aparatura WN scalona |
| `-determinizm-historii` | `d543faf3c` | wchłonięta przez program |
| `-aparatura-wn-wklad-sn` | `ec4de7748` | gałąź materiałowa dla wątku UX |
| `-linia-110`, `-podstawa-q` | `dda21faa1`, `5504358e3` | wchłonięte w `-partia-2` |
| `-gpt481`, `-gptplan`, `-guardskladnia`, `-mu`, `-sceny`, `-szybkie2`, `-tb`, `-tolnn`, `-tolnn2`, `-zasada4` | jak w `git ls-remote` | starsze gałęzie robocze kart, wypchnięte wyłącznie dla zachowania pracy; ich treść jest w programie albo zastąpiona — przed użyciem sprawdź `git merge-base --is-ancestor <gałąź> origin/claude/mv-design-pro-twin-audit-u4lhy0` |

## Partia 2 — co zostało do zrobienia

1. Bramka scalenia: `cd mv-design-pro/backend && poetry run python ../scripts/bramka_scalenia.py
   --baza d543faf3c --glowa db1c688a5 --procesy 2` (bieg trwa > 30 min — uruchamiaj z limitem
   czasu ≥ 2 h). Poprzednie dwa biegi przerwane bez czerwieni: pełny dysk, potem limit 30 min
   przy 91 % pytest.
2. Rozstrzygnięcia w scaleniu `db1c688a5` (sprawdzone): odcisk `short_circuit_iec60909.py`
   przeliczony `solver_diff_guard --init` (PASS, 31 plików); pin samotestu strażnika podstawień
   590 plików / network_model 190 (pomiar guardem); samotesty 102 zielone;
   `eksport_fixtur_harnessu.py --sprawdz` rc=0.
3. Po zielonej bramce: CI 9 workflowów na `-partia-2`; przy pełnej zieleni fast-forward programu
   (`git merge-base --is-ancestor` najpierw, bez force).

## Karta DANE-PRZYJETE-EKRANY — recenzja (do naprawy)

Zrzuty: `zrzuty/zrzuty_dp/`. Dwa defekty klasy:
1. Kolumna wartości pokazuje „bez wartości liczbowej” dla położeń przewodów fazowych,
   odgromowego i typu odgromowego, choć wartość robocza istnieje (współrzędne, nazwa typu).
   Para danych przyjętych w backendzie ma nieść czytelną postać wartości nieskalarnej;
   inwentarz wszystkich emiterów `dane_przyjete`; test iloczynu skalar × wektor × tekst × brak.
2. Uzasadnienie zawiera wzór ASCII („ωμ0/(2π)·ln 1,25”) — wbrew kontraktowi prezentacji
   inżynierskiej V12.7; wzór do pola `*_latex` pary, render przez `ui/proof/MathRenderer`;
   przegląd całej klasy uzasadnień założeń roboczych.
Po naprawie: niezależna weryfikacja sesji głównej, scalenie po partii 2.

## Kolejka kart po partii 2 (z audytu PR #488, karty w `karty/`)

- A BILANS-THEVENIN (fazorowy bilans prądów, kierunek z fazora prądu);
- B SLACK 1e6 w `core/ybus.py:188` + inwentarz klasy 1e6;
- C CZESTOTLIWOSC; D PROFIL-NORMY (IEC 60909-0:2016 osobny profil);
- ZEROWA-POJEMNOSCI — po karcie UX GPZ-H5-SKLADOWA-ZEROWA;
- przegląd konsumentów I_b; mała karta `NAZWY_RODZAJOW_GENERATORA_PL` jako słownik kanoniczny.
- Później: żywe zrzuty menu i GPZ (oba motywy) do B-02; `e2e/czasy_specow.json`;
  nagłówek STAN_REPO; dokument `karty/ROZPATRZENIE_RECENZJI_SLD_SYSTEMU_2026-10-21.md` do repo.

## Koordynacja z wątkiem UX

`mv-design-pro/docs/uiux/KOORDYNACJA_WATKOW_2026-10.md` na `-karta-uiux-przemyslowy`
(wpisy 14–15). Najwyższy priorytet wątku UX: tabela „Wkłady” bez źródła sieciowego — wiersze
mają pochodzić z `wklady_zrodel`, nie z `compute_machine_contributions`. Czerwone guardy gałęzi
UX wypisane we wpisie 15.

## Zawartość katalogu

- `karty/` — karty zleceń, inwentarze, notatki koordynacji i wznowienia z katalogu roboczego.
- `zrzuty/zrzuty_dp/`, `zrzuty/zrzuty_partia2/` — zrzuty obu motywów do oceny B-02
  (werdykt wizualny należy do właściciela).

## Aktualizacja: commit WIP karty DANE-PRZYJETE-EKRANY

Wykonawca zacommitował pracę jako `5703c2d29` („WIP:”, wypchnięty na `-dane-przyjete-ekrany`;
kopia patcha w `wip_dane_przyjete/` jest odtąd zbędna). Oba defekty z recenzji usunięte
(pole czytelnej wartości nieskalarnej w parze, wzory do pola LaTeX + MathRenderer; fixtury
i snapshot OpenAPI przegenerowane; 38 nowych testów, 6 iniekcji czerwonych). Do dokończenia:
1. Naprawa selektora „najnowszy przebieg” (`frontend/src/ui/study-cases/porzadekPrzebiegow.ts`,
   11 selektorów; backend zwraca listę od najnowszego, ekrany brały ostatni element) —
   NIEPRZETESTOWANA: vitest po tej zmianie nie przebiegł; starsze testy selektorów mogą
   zakładać kolejność rosnącą.
2. Bieg backendu na plikach dotkniętych zmianą: przerwany przy ~34 % z 9 czerwonymi
   (spodziewane piny tekstów/odcisków — przejrzeć z uzasadnieniem, nie maskować).
3. Zrzuty po naprawie selektora; obecne w `zrzuty/zrzuty_dp2/` (walidacja energetyczna pokazuje
   jeszcze stary bieg).
4. Niezależna weryfikacja sesji głównej, potem scalenie po partii 2.

## Aktualizacja: bramka B-01 partii 2 ZIELONA

`bramka_scalenia.py --baza d543faf3c --glowa db1c688a5 --procesy 2` (log:
`bramka_partia2_db1c688a5.log`): pytest backendu 38 798 passed (RC=0, 48 min 54 s); vitest
237 plików / 4 604 testy (RC=0); guardy_z_ci 3 908 samotestów + guardy (RC=0). Punkt 1 sekcji
„Partia 2 — co zostało” jest ZAMKNIĘTY. Zostało: CI 9 workflowów na `db1c688a5`
(wystartowało 2026-10-23 06:39 UTC, w kolejce) → przy pełnej zieleni fast-forward programu:
`git merge-base --is-ancestor origin/claude/mv-design-pro-twin-audit-u4lhy0 db1c688a5 &&
git push origin db1c688a5:claude/mv-design-pro-twin-audit-u4lhy0` (bez force).

## Aktualizacja: plan A/B i prompt kontynuacji

Czubek `-partia-2` to teraz `0e7a5e7d6` (= `db1c688a5` + aktualizacja planu A/B §7 i §14.4 oraz
`docs/prompts/PROMPT_KONTYNUACJI_2026-10-23.md`; tylko dokumenty, guardy dokumentów zielone).
Fast-forward programu robisz na `0e7a5e7d6` po pełnej zieleni CI na tym commicie. Nowa sesja
zaczyna od promptu z `docs/prompts/PROMPT_KONTYNUACJI_2026-10-23.md` (część A — wątek prowadzący,
część B — wątek UI/UX); do czasu fast-forwardu plik jest na gałęzi `-partia-2`.
