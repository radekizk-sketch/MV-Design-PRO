# Zrzuty karty W10-2a — lista materiałowa z kosztem i układ kreatora w panelu inspektora

Żywa aplikacja (prawdziwy backend, Playwright, okno 1280×720), ścieżka speca
`frontend/e2e/kreator-oze-max.spec.ts` z materializacją toru DER-SN w kroku „Dobór toru SN”
(„Zaproponuj dobór” → „Zastosuj”) i zapisem źródła. Werdykt wizualny należy do właściciela.

| Plik | Co przedstawia |
|---|---|
| `przed/kreator_oze_dobor_toru_sn_panel.png` | baza `d6c26c3f`: krok „Dobór toru SN” w panelu inspektora |
| `przed/lista_materialowa_okno_{light,dark}.png` | baza: okno po zapisie źródła (podsumowanie kreatora w panelu) |
| `przed/lista_materialowa_panel_{light,dark}.png` | baza: panel inspektora po przewinięciu do listy materiałowej |
| `po/kreator_oze_dobor_toru_sn_panel.png` | po zmianie: ten sam krok w panelu inspektora |
| `po/lista_materialowa_okno_{light,dark}.png` | po zmianie: okno po zapisie źródła |
| `po/lista_materialowa_panel_{light,dark}.png` | po zmianie: lista materiałowa (nazwy typów, opis parametrów) |
| `po/koszt_listy_panel_{light,dark}.png` | po zmianie: sekcja kosztu listy materiałowej (szablon cennika bez cen) |

Motyw ciemny przełączany atrybutem `data-theme` na korzeniu dokumentu w trakcie speca.
