# Zrzuty karty W10-2a — lista materiałowa z kosztem i układ kreatora w panelu inspektora

Żywa aplikacja (prawdziwy backend, Playwright, okno 1280×720, motyw ustawiony przed startem
strony: `light_technical` / `dark_scada`), ścieżka speca `frontend/e2e/kreator-oze-max.spec.ts`
z materializacją toru DER-SN w kroku „Dobór toru SN” („Zaproponuj dobór” → „Zastosuj”) i zapisem
źródła. `przed/` — baza `d6c26c3f`; na bazie przycisk doboru był poza zasięgiem, więc spec bazowy
klikał go zdarzeniem syntetycznym wyłącznie po to, by dojść do panelu podsumowania. `po/` — gałąź
karty, kliknięcia natywne. Werdykt wizualny należy do właściciela.

| Plik (`<motyw>` = `light_technical` / `dark_scada`) | Co przedstawia |
|---|---|
| `kreator_oze_dobor_toru_sn_panel_<motyw>.png` | panel inspektora w kroku „Dobór toru SN” |
| `lista_materialowa_okno_<motyw>.png` | okno po zapisie źródła (podsumowanie kreatora w panelu) |
| `lista_materialowa_panel_<motyw>.png` | panel inspektora przewinięty do listy materiałowej |
| `po/koszt_listy_panel_<motyw>.png` | sekcja kosztu listy materiałowej (szablon cennika bez cen → zdanie odmowy) |
