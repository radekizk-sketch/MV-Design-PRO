# Uruchomienie UX SLD — Przewodnik operacyjny

## Cel

Dokument opisuje krok po kroku jak wygląda typowe uruchomienie projektu sieci SN/nN
w systemie MV-Design-PRO z perspektywy inżyniera OSD.

## Scenariusz uruchomieniowy (kanoniczny)

### Krok 1: Utwórz GPZ (add_grid_source_sn)

- Kliknij prawym przyciskiem na wolne pole SLD → „Dodaj źródło SN (GPZ)"
- Wypełnij: nazwa, napięcie znamionowe, moc zwarciowa Sk'' [MVA], stosunek R/X
- Po zatwierdzeniu: Snapshot zawiera nowe źródło + szynę główną GPZ
- SLD renderuje symbol GPZ

### Krok 2-4: Kontynuuj magistralę 3× (continue_trunk_segment_sn)

- Kliknij prawym na terminal magistrali → „Dodaj odcinek magistrali SN"
- Podaj: typ przewodu (z katalogu), długość [km]
- Powtórz 3 razy
- Po każdym kroku: nowy segment w Snapshot, SLD aktualizuje magistralę

### Krok 5: Wstaw stację SN/nN (insert_station_on_segment_sn)

- Kliknij prawym na segment magistrali → „Wstaw stację SN/nN"
- Wariant pełny: wybierz typ stacji, transformator z katalogu, układ pól
- Po zatwierdzeniu: segment podzielony, stacja w Snapshot, pola rozdzielcze utworzone

### Krok 6: Dodaj odgałęzienie (start_branch_segment_sn)

- Kliknij prawym na szynę SN z portem BRANCH → „Dodaj odgałęzienie SN"
- Podaj: typ przewodu, długość
- Po zatwierdzeniu: nowa gałąź w Snapshot

### Krok 7: Wstaw stację na odgałęzieniu

- Jak krok 5, ale na nowym odgałęzieniu

### Krok 8-9: Zamknij ring + NOP

- Kliknij na terminal końcowy → „Połącz pierścień wtórny"
- Wskaż terminal docelowy
- Po zatwierdzeniu: ring zamknięty w Snapshot
- Ustaw NOP: kliknij na łącznik → „Ustaw punkt normalnie otwarty"

### Krok 10: Dodaj odbiór nN (add_nn_load)

- Na szynie nN stacji → „Dodaj odbiór"
- Podaj: moc P [kW], moc bierna Q [kvar], typ odbioru
- Po zatwierdzeniu: odbiór w Snapshot

### Krok 11: Dodaj PV (add_converter_source)

- Na szynie nN → „Dodaj źródło PV (nN)"
- Podaj: moc zainstalowana [kWp], falownik z katalogu
- Wymagane: wariant przyłączenia (nn_side lub block_transformer)
- Readiness: jeśli brak transformatora w ścieżce → blokada

### Krok 12: Dodaj BESS (add_converter_source)

- Na szynie nN → „Dodaj źródło BESS (nN)"
- Podaj: moc [kW], pojemność [kWh], SOC limits
- Analogicznie do PV

### Krok 13: Dodaj zabezpieczenie (add_relay)

- Na wyłączniku pola SN → „Dodaj zabezpieczenie"
- Wybierz: typ przekaźnika z katalogu, nastawy
- Wymagane: powiązanie z wyłącznikiem (RELAY_TO_CB)

### Krok 14: Uruchom rozpływ mocy (run_power_flow)

- Menu główne → „Uruchom rozpływ mocy"
- Readiness: musi być spełniona (brak BLOCKER)
- Wynik: napięcia węzłowe, prądy gałęziowe, straty

### Krok 15: Uruchom zwarcie (run_short_circuit)

- Menu główne → „Uruchom obliczenia zwarciowe"
- Typy: SC_3F (domyślnie), SC_1F, SC_2F
- Wynik: prądy zwarciowe Ik'', ip, Ith + WhiteBox

## Warunki poprawności

- Każdy krok produkuje snapshot delta (snapshot_before ≠ snapshot_after)
- Po każdym kroku SLD jest aktualny
- Panel „Braki danych" aktualizuje się natychmiast
- 100× powtórzenie daje identyczny hash końcowego Snapshot
- 0 błędów 500 w całym scenariuszu

## Powiązane dokumenty

- [BRAKI_DANYCH_FIXACTIONS.md](./BRAKI_DANYCH_FIXACTIONS.md) — panel naprawy braków
- [KATALOG_WIAZANIE_I_MATERIALIZACJA.md](./KATALOG_WIAZANIE_I_MATERIALIZACJA.md) — wiązanie katalogowe
- [SCENARIUSZ_URUCHOMIENIOWY_E2E.md](../tests/SCENARIUSZ_URUCHOMIENIOWY_E2E.md) — test E2E
