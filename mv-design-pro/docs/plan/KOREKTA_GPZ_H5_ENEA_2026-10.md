# Korekta GPZ-MODEL do układu H5 ENEA Operator (2026-10-22)

Dokument wykonawczy karty GPZ-MODEL (Z-06, Z-10 z `docs/uiux/PLAN_UIUX_PRZEMYSLOWY_2026-10.md` §5). Nie jest nowym programem ani drugim modelem GPZ. Odpowiada na werdykt właściciela z 2026-10-22: GPZ-MODEL z jedną wspólną szyną 110 kV, jednym źródłem zastępczym 110 kV i transformatorami automatycznie równoległymi nie zostaje przyjęty jako wzorzec stacji dwutransformatorowej ENEA Operator. B-02 pozostaje odrzucone.

**Stan źródeł (aktualizacja 2026-10-22, po integracji biblioteki źródeł z PR #486).**
- Oryginał ENEA Operator „Stacje elektroenergetyczne 110 kV. Zeszyt 1. Stacje dwutransformatorowe 110 kV/SN” (wersja 02.2023-2, obowiązuje od 02.04.2024) został pobrany z oficjalnego adresu skryptem `scripts/pobierz_zrodla_techniczne.py` i odczytany: tekst §11.1, §12, §13, §16, §26.8.4, §26.10.4, §26.10.5, §26.11 oraz rysunki Z.1 i Z.2.
- Wynik odczytu, z numerami stron: `docs/zrodla/GPZ_H5_ZRODLA_I_REGULY.md` §Z6. PDF nie są w repozytorium, bo są chronione prawem autorskim.
- Podręcznik W. Dołęgi (rys. 3.37) nie jest dostępny w tym kontenerze: NIEZWERYFIKOWANE.
- Odczyt oryginału koryguje dyrektywę w dwóch punktach (R4, wzorzec B):
  - standard nie określa stanu normalnego łącznika szyn 110 kV, więc jest to jawne wejście projektu (przypadek odbiorczy przyjmuje otwarty);
  - §26.10.5 zna dwa sposoby rezerwowania — ukrytą (łącznik SN otwarty) i jawną (łącznik SN zamknięty, TR rezerwowy bez obciążenia). Oba to jawny wybór, żaden nie jest domyślny.

**Stan kodu.** Inwentarz z plik:linia: `KOREKTA_GPZ_H5_ENEA_2026-10_INWENTARZ.md` (obok). Drzewo: scalenie partii 9–13 z GPZ-MODEL (`88e6d8828`).

---

## A. Tabela rozbieżności

| # | Standard ENEA (wg dyrektywy) | Obecny ENM | Obecny SLD | Błąd | Wymagana korekta | Karta | Dowód korekty |
|---|---|---|---|---|---|---|---|
| R1 | H5: dwie linie 110 kV L1, L2, każda z własną tożsamością i danymi zasilania (§11.1, s. I 18/76; Z.1) | Tryb 110 kV: jedno `Source` na jednej szynie WN (`domain_operations.py:4427`). Szablony go nie używają (`gpz_110_sn.py:74-79`, `transformer_count` 0) | Jedno `hvSystemSource` (`enmToCanonicalGpzAdapter.ts:269`, `sources.find`) | Jedno S″k dla całego GPZ. Brak rozdziału wkładów i niezależnych dróg zasilania | Dwa źródła, po jednym na tor L1/L2: S″k max/min, R/X max/min, Z0/Z1, uziemienie, nazwa linii i stacji zasilającej, sekcja 110 kV | GPZ-MODEL (operacja + szablon H5) | Test ENM: dwa źródła na dwóch sekcjach; SC-01 z rachunkiem niezależnym |
| R2 | Jednosystemowa rozdzielnia 110 kV, dwie sekcje i pole łącznika szyn 110 kV (§11.1, §11.1.1, Z.1) | Jedna szyna `hv_section/001/bus_wn` (`domain_operations.py:4326-4361`). `gpz_hv_sections` niewypełniane (`models.py:1145`) | Jeden odcinek WN rozpięty na zaczepach TR (`compose/gpz.ts:2144-2215`), brak sprzęgła WN w modelu rysunku (`canonicalGpzModel.ts:168-180`) | Fałszywa topologia rozdzielni i stanów ruchowych | Dwie szyny 110 kV (sekcja A, B), `SwitchBranch` typu `bus_coupler` między nimi, `normal_state` otwarty. `gpz_hv_sections` z polami: liniowe L1/L2, transformatorowe TR1/TR2, łącznik szyn | GPZ-MODEL (ENM) + K3 (SLD) | Test ENM struktury H5; SLD: dwa odcinki WN, łącznik WN ze stanem z modelu |
| R3 | L1 zasila sekcję A i TR1, L2 sekcję B i TR2 (Z.1). Stan normalny łącznika 110 kV nie jest ustalony w standardzie (§26.8.4: podziały planowe ODM/KDM) — jawne wejście projektu | TR przypisywane cyklicznie do sekcji SN, wszystkie na wspólnej szynie WN (`domain_operations.py:4367`) | j.w. | Transformatory automatycznie równoległe po stronie 110 kV; zawyżone Ik″ i błędny rozpływ | Jawne przypisanie każdego TR do sekcji 110 kV i sekcji SN w danych wejściowych. Liczba TR nie wyznacza topologii | GPZ-MODEL | SC-01: Ik″ sekcji A tylko z toru L1–TR1 |
| R4 | Rozdzielnia SN dwusekcyjna z polami funkcyjnymi na sekcję: TR, zespół uziemiający, BKR, pomiar napięcia, liniowe; łącznik szyn SN w 1–2 celkach (§13, Z.2, Z.12). Rezerwa ukryta: łącznik SN otwarty; rezerwa jawna: łącznik zamknięty, TR rezerwowy bez obciążenia (§26.10.5) | Sprzęgło `bus_coupler` „Sprzęgło sekcji GPZ i-i+1”, `status` closed, bez `normal_state` (`domain_operations.py:4540-4560`) | Sprzęgło SN rysowane, stan z `status` | Sekcje SN domyślnie zwarte; brak stanu normalnego | Sposób rezerwowania jako jawny wybór stacji; stan normalny łącznika SN i stan TR rezerwowego z niego, z jednego źródła. Pola funkcyjne SN bez domyślnego aparatu. Przełączenie jako jawny wariant scenariusza (W5-C) | GPZ-MODEL + W5-C (scenariusz) | Test: stan normalny = dwie wyspy; SC-05 jako jawny wariant |
| R5 | Łącznik szyn 110 kV, łącznik szyn SN i punkt podziału sieci to różne urządzenia i różne przełączenia | `SwitchBranch.type` bez rozróżnienia poziomu ani roli. `set_normal_open_point` dotyczy pierścienia magistrali (`operacje_lacznikow.py:101`) | `CanonicalGpzCoupler` tylko SN | Scenariusze przełączeń i SZR nierozróżnialne | Rola łącznika wyprowadzana z JEDNEGO źródła: napięcie szyn, które łączy (110 kV → łącznik szyn WN, SN w GPZ → łącznik szyn SN, odcinek magistrali → punkt podziału). Bez drugiego pola, które mogłoby się rozjechać z napięciem szyn | GPZ-MODEL + K3 + W5-C | Test roli parami: 3 role × 2 stany |
| R6 | Dwa tory zasilania mogą należeć do jednej sieci 110 kV. Po zamknięciu łącznika 110 kV obowiązuje model sieci połączonej, nie suma mocy | Rozpływ: dwa źródła sieciowe w jednej wyspie dają odmowę `source.multiple_grid_sources_in_island` (`assembler.py:451`). Zwarcia: Z-bus z dwoma Y_Q liczy się, czyli traktuje równoważniki jak niezależne | — | Zamknięcie łącznika przy dwóch niezależnych równoważnikach dałoby zwarcia z sumy niezależnych źródeł, czego dyrektywa zabrania | Model A (dwa równoważniki): zamknięcie łącznika łączącego wyspy L1 i L2 to jawna odmowa gotowości z przyczyną i akcją „przejdź na model wspólnej sieci nadrzędnej”. Model B: wspólny punkt zasilania 110 kV z jednym źródłem i jawnymi liniami L1, L2 | GPZ-MODEL; model B w §D pkt 6 | Test iniekcji: zamknięty łącznik 110 kV w modelu A daje odmowę, nie wynik |
| R7 | Utrata L1 (SC-02): sekcja A traci zasilanie; bez samoczynnego przejęcia przez L2 | E065 `source.gpz_section_unsupplied` blokuje KAŻDY bieg (`validator.py:2063-2072`) | Sekcja szara | Inżynier nie widzi skutku wyłączenia, tylko odmowę | Sekcja bez źródła = stan „bez napięcia” w wyniku (rozpływ i zwarcia liczone dla części zasilanej; sekcja odcięta oznaczona). Odmowa tylko, gdy żadna część nie ma źródła | GPZ-MODEL + W5-C | SC-02: wynik sekcji B + sekcja A „bez napięcia” |
| R8 | Wkłady zwarciowe torów L1 i L2 (SC-06) | Źródła sieciowe zagregowane do `THEVENIN_GRID` (`short_circuit_iec60909.py:1251`) | Brak | Brak rozbicia wkładu per tor zasilania | Wkład per źródło sieciowe, addytywnie w wyniku. Plik rdzenia B-01: pakiet decyzyjny dla architekta (§D pkt 5) | B-01 | Test: suma wkładów = Ik″, wkład L2 przy zwarciu na A = 0 w stanie normalnym |
| R9 | Uziemienie punktu neutralnego SN, grupa połączeń TR (SC-08) | Brak Z0 daje odmowę 1F/2F-Z (`canonical_analysis.py:1159`), bez wartości domyślnej | — | Zgodne; brak danych Z0 torów 110 kV w szablonie | Pola Z0/Z1 i uziemienia per tor L1/L2 w szablonie H5; uziemienie sieci SN per sekcja | GPZ-MODEL | SC-08: odmowa przy braku Z0, wynik przy komplecie |
| R10 | Odbiór na szynie 15 kV jest odbiorem SN | — | Drzewo: wszystkie `loads` pod tytułem „Odbiory nN” (`SchematContextPanel.tsx:639`); odbiory GPZ nierysowane na SLD | Błędna klasa napięciowa w interfejsie | Grupowanie odbiorów wg napięcia szyny (jedno źródło: `Bus.voltage_kv`); rysowanie odbiorów przyłączonych do sekcji GPZ | K3 / zad. 13 | Test drzewa: odbiór 15 kV w „Odbiory SN”; zrzut SLD |
| R11 | Usunięcie TR nie usuwa stacji | Usunięcie TR kasuje całą Substation z polami (`domain_operations.py:10666-10683`) | Ramka GPZ znika | Utrata integralności modelu | Usunięcie TR zdejmuje go z `transformer_refs` i z pola transformatorowego. Stacja zostaje, a gotowość zgłasza brak TR w H5 | GPZ-MODEL (operacja) | Test: delete TR1 w H5 → stacja, sekcje, TR2 i pola zostają |
| R12 | Aparatura pól tylko z rekordów modelu | Zasada trzech przypadków wdrożona w K3 | „?” dla braku danych | Zgodne | Pola 110 kV H5 tworzone bez domyślnego aparatu; aparat z katalogu albo szablonu tylko jawnie | K3 (bez zmian) | Test: pola H5 bez rekordu aparatu → „?” |
| R13 | „brak” to cztery różne stany | Jeden napis „brak” w tabeli pól GPZ | j.w. | Pole bez odpływu, pole rezerwowe, pole bez wyposażenia i niewykonane obliczenie są nierozróżnialne | Cztery stany z danych: `field_status`, rekord aparatu, istnienie odpływu, istnienie biegu | K4 (blok wyników GPZ) | Test 4 stanów |
| R14 | Moc czynna TR na SLD | Szablon `LF_TRANSFORMER` bez P (`resultLabelTemplates.ts` ~192) | Tylko obciążenie, S, ΔP | P widoczne tylko w tabeli gałęzi | P/Q z kierunkiem w etykiecie TR | K4 | Zrzut + test szablonu |
| R15 | Wyniki z wariantu, który pokazuje SLD | Kontekst wyników per rodzina (K8); blok GPZ czyta zły kontekst po wybraniu biegu zwarciowego | „brak wyniku rozpływu” przy aktualnym rozpływie | Wynik nie z prezentowanego wariantu | Blok GPZ czyta kontekst rodziny rozpływu niezależnie od wybranego biegu zwarciowego; bieg niosący inny scenariusz niż widok jest oznaczony | K8 | Test odbiorowy rozpływ A / zwarcie B |

## B. Wzorzec H5 (stan normalny)

```
   Tor A                                   Tor B
   Linia 110 kV L1 (źródło L1:             Linia 110 kV L2 (źródło L2:
   S″k max/min, R/X, Z0/Z1)                S″k max/min, R/X, Z0/Z1)
        │                                       │
   [pole liniowe 110 kV L1]                [pole liniowe 110 kV L2]
        │                                       │
   ═════╪══ Sekcja A 110 kV ══╡ ŁS-110 ╞══ Sekcja B 110 kV ══╪═════
        │                   (normalnie                       │
   [pole transf. 110 kV TR1]  otwarty)          [pole transf. 110 kV TR2]
        │                                       │
       TR1 110/15 kV (katalog)                 TR2 110/15 kV (katalog)
        │                                       │
   [pole transf. SN TR1]                   [pole transf. SN TR2]
        │                                       │
   ═════╪══ Sekcja A SN ════════╡ ŁS-SN ╞════ Sekcja B SN ═══╪═════
      odpływy SN              (normalnie otwarty,       odpływy SN
                               rezerwa ukryta / SZR)
```

Elementy ENM:

| Element | Liczba | Stan normalny | Źródło danych |
|---|---|---|---|
| `Source` (równoważnik toru) | 2 (L1, L2) | dostępne | warunki zasilania od OSD: S″k max/min, R/X, Z0/Z1. Bez wartości domyślnych |
| `Bus` 110 kV | 2 (sekcja A, B) | — | napięcie 110 kV |
| `SwitchBranch` `bus_coupler` 110 kV | 1 (ŁS-110) | jawne wejście projektu (standard go nie ustala); przypadek odbiorczy: open | — |
| `Transformer` 110/SN | 2 | w pracy | katalog |
| `Bus` SN | 2 (sekcja A, B) | — | napięcie SN szablonu |
| `SwitchBranch` `bus_coupler` SN | 1 (ŁS-SN) | z wybranego sposobu rezerwowania (§26.10.5): ukryta → open, jawna → closed; przypadek odbiorczy: ukryta | — |
| Pola 110 kV (`gpz_hv_sections`) | 5: liniowe L1, L2; transformatorowe TR1, TR2; łącznik szyn | — | bez domyślnego aparatu |
| Pola SN | na sekcję: transformatorowe, zespołu uziemiającego, BKR, pomiaru napięcia, liniowe; łącznik szyn (2 celki wg Z.2) | — | bez domyślnego aparatu |
| Uziemienie punktu neutralnego SN | per sekcja: rezystor / dławik / układ równoległy (§16) | — | dane projektu; brak = odmowa zwarć doziemnych |
| Punkt neutralny 110 kV TR | uziemnik z ogranicznikiem (§12, Z.1) | stan uziemnika jawny | Z0 strony 110 kV zależy od stanu |

**Granica obliczeniowa.** Model obejmuje rozdzielnię 110 kV GPZ i równoważniki torów zasilania na zaciskach pól liniowych. Sieć 110 kV poza GPZ nie jest projektowana. Jej wpływ wchodzi wyłącznie przez dane równoważników (model A) albo przez wspólny punkt zasilania z jawnymi liniami (model B).

**Warianty ruchowe (scenariusze W5-C, jeden model bazowy).**

| Wariant | Zmiana stanu | Model A (dwa równoważniki) | Model B (wspólny punkt zasilania) |
|---|---|---|---|
| SC-01 praca normalna | — | dwie wyspy, wszystko liczone | jedna sieć przez punkt zasilania, liczone |
| SC-02 utrata L1 | pole liniowe L1 otwarte | sekcja A 110 kV, TR1 i sekcja A SN bez napięcia; sekcja B liczona | j.w. |
| SC-03 utrata TR1 + przełączenie rezerwowe SN | TR1 wyłączony, ŁS-SN zamknięty | TR2 zasila obie sekcje SN, jedno źródło, liczone | liczone |
| SC-04 zamknięcie ŁS-110 | ŁS-110 zamknięty | **odmowa z przyczyną**: łączy dwa niezależne równoważniki | liczone na sieci połączonej |
| SC-05a ŁS-SN zamknięty, jeden TR aktywny | TR1 off, ŁS-SN on | liczone | liczone |
| SC-05b ŁS-SN zamknięty, oba TR aktywne | ŁS-SN on | **odmowa z przyczyną** (łączy L1 i L2 przez TR) | liczone (praca równoległa TR) |
| SC-06 wkłady torów | — | wymaga R8 (B-01) | wymaga R8 (B-01) |
| SC-07 MAX/MIN | c_max/c_min, S″k max/min per tor | liczone | liczone |
| SC-08 doziemne | Z0 torów + uziemienie SN | odmowa przy braku Z0 | j.w. |

Dopuszczalność zamknięcia łącznika (warunki napięciowe, blokady §26.11, podanie napięcia na sekcję podtrzymywaną przez OZE/BESS) sprawdza gotowość wariantu. Samoczynnego zamknięcia nie ma: SZR jest wariantem, który projektant zakłada jawnie.

## C. Analiza wpływu na dotychczasowe wyniki

Wyniki oparte na wspólnej szynie 110 kV lub na zwartych sekcjach SN wymagają ponownej walidacji. Zgodność z własną fiksturą nie jest dowodem ich poprawności.

| Wynik / fikstura | Oparty na | Status |
|---|---|---|
| Ik″ 23,469 / 16,781 / 9,047 kA, P TR 3,336 MW (`tests/enm/test_gpz_granica_zasilania.py`, opis `88e6d8828`, strona oceny) | jedna szyna 110 kV, 3 TR | Poprawne arytmetycznie dla układu syntetycznego. Nie są dowodem H5. Przypadek zostaje jako test „układ rozbudowany — jawny schemat” |
| Wszystkie projekty z szablonów `tpl_gpz_sn_*` (3 szablony; `add_grid_source_sn` w 195 plikach testów) | jeden równoważnik SN, sprzęgło SN zamknięte bez stanu normalnego | Do przeglądu. Sekcja 2 zasilana przez zwarte sprzęgło. Przy jednym równoważniku Ik″ obu sekcji jest równe S″k równoważnika — to granica obliczeniowa „GPZ jako jedno źródło”, nie dwie niezależnie zasilane sekcje. Rozpływ różni się tylko spadkiem na sprzęgle. Klasyfikacja: wynik poprawny dla jawnej granicy „sekcje połączone” po jej zadeklarowaniu |
| `tests/golden/golden_network_sn.py` (szyna „bus-wn-110”, S″k 4000 MVA, 2 TR 25 MVA, l. 187-254) i asercja Ik″ ≈ 9 kA w przedziale 5–15 kA (`test_golden_network_sn.py:241-246`) | ręczny graf z dwoma TR na jednej szynie 110 kV | Do ponownej walidacji. Przedział 5–15 kA nie rozróżnia pracy 1 TR od 2 TR równolegle |
| Złote hashe: `tests/golden/parytet_p11/zlote_hashe.json`, `parytet_assemblera/zlote_hashe.json`, N-1 (`test_kontyngencje_n1_service`), wyrocznia `test_pandapower_od19_w3g2.py` | modele z GPZ przeliczone w `88e6d8828` | Hash przelicza się przy każdej zmianie topologii. Przy korekcie każdy przeliczony hash dostaje w commicie przyczynę zmiany i porównanie wartości |
| Piony SLD (`buildScene.test` 23168/46400/46400, `schemat10s7p6`) | geometria jednej szyny WN | Zmieniają się z rysunkiem dwóch sekcji WN |

## D. Plan korekty w istniejących kartach

Kolejność wynika z zależności. Zakres każdej pozycji jest pełny; nic nie jest odkładane poza pozycję 6, która zależy od danych zewnętrznych.

1. **GPZ-MODEL, operacja i szablon** (`enm/domain_operations.py`, `application/station_templates/**`, `enm/validator.py`, `domain/readiness_*`; nie B-01):
   - jawna struktura wejścia GPZ: sekcje 110 kV z torami zasilania, łącznik szyn 110 kV, transformatory z przypisaniem sekcja 110 kV → sekcja SN, sekcje SN, łącznik szyn SN, stany normalne;
   - szablon „ENEA H5” jako wzorzec podstawowy; dotychczasowy układ 2 × 3 jako „układ rozbudowany — jawny schemat”;
   - tryb równoważnika SN jako jawna granica obliczeniowa: równoważnik per sekcja albo jeden równoważnik z zadeklarowanym połączeniem sekcji;
   - odmowa gotowości dla wariantu łączącego dwa niezależne równoważniki (R6);
   - poprawka `delete_element` (R11);
   - rola łącznika z napięcia szyn (R5).
2. **W5-C, warianty** (`enm/scenariusze.py`, gotowość czytająca migawkę po scenariuszu): SC-02…SC-05 jako scenariusze jednego modelu; sekcja bez źródła jako stan „bez napięcia” w wyniku zamiast odmowy całego biegu (R7). Wymaga sprawdzenia, czy bramka gotowości czyta migawkę efektywną (inwentarz pkt 5: niesprawdzone).
3. **K3, SLD** (`ui/sld/v3/compose/gpz.ts`, adapter, model kanoniczny GPZ): dwie sekcje 110 kV, łącznik 110 kV ze stanem z modelu, pola 110 kV, dwa glify źródeł z nazwą linii; odbiory sekcji GPZ rysowane, grupowanie odbiorów wg napięcia (R10).
4. **K4 i K8, wyniki** (zad. 13 wątku): P/Q transformatora na SLD (R14), cztery stany „brak” (R13), kontekst rodziny w bloku GPZ (R15), E065 w obu grupach gotowości, komunikat nie zasłania „Oblicz”.
5. **Pakiet decyzyjny B-01 dla architekta**: wkład per źródło sieciowe w wyniku zwarciowym (R8), addytywnie w `ShortCircuitResult` i `short_circuit_contributions.py`. Formuła: I_Q,k = Y_Q,k · Z_kf · I″k (metoda zastępczego źródła napięcia, IEC 60909-0:2016 §4.2: sieć pasywna, źródła sieciowe jako admitancje). Niezależna weryfikacja: suma wkładów i prądów gałęzi incydentnych = I″k; w stanie normalnym H5 wkład L2 do zwarcia na sekcji A = 0. Do czasu decyzji SC-06 pokazuje wkład przez gałąź transformatora (istniejące `branch_contributions`), z jawną nazwą tej wielkości.
6. **Model B — wspólny punkt zasilania**: jedno źródło na szynie stacji zasilającej 110 kV i jawne linie L1, L2. Standard ENEA linii 110 kV (od 01.10.2026) ustala przewód ACSR (AFL) 240 mm² i kabel ≥ 1000 mm² Cu, ale R, X i B linii każe wyznaczać obliczeniowo dla projektu i mierzyć. Stałych katalogowych R′/X′ więc nie ma (reaktancja zależy od geometrii słupa). Dane linii pochodzą z obliczenia projektowego albo od OSD, z zapisanym pochodzeniem. Rozstrzygnięcie dla architekta: jak pogodzić to z regułą wiązania z katalogiem (reguła 10). Pozycja startuje po dostarczeniu danych; do tego czasu SC-04 i SC-05b dają odmowę z przyczyną (R6), nie wynik.
7. **Dowód odbiorowy** (§10 dyrektywy): jeden przypadek H5 110/15 kV z pkt B; zestawienie węzłów, gałęzi, źródeł i stanów łączników; rozpływ SC-01; zwarcia MAX/MIN obu sekcji; SC-02, SC-03, SC-04; rachunek niezależny dla każdego wariantu; zrzuty SLD obu motywów; raport White Box. Testy odbiorowe muszą być czerwone przy iniekcjach:
   - dwa tory na schemacie, jeden w solverze;
   - łącznik otwarty na schemacie, zwarte sekcje w obliczeniach;
   - wkład przypisany do nieistniejącej wspólnej szyny;
   - wynik z innego wariantu niż SLD.
