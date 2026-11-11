# Analiza odrzucenia partii UI-01 / UI-02 / UI-04 (decyzja właściciela 2026-10-21)

Status: odpowiedź wykonawcy programu UI/UX na decyzję właściciela z 21.10.2026 („UI-01/02/04
nieprzyjęte, B-02 bez zmian”). Dokument NIE jest nową mapą drogową i nie tworzy nowych kart:
każda korekta jest przypisana do istniejącej karty K1–K9 planu
`docs/uiux/PLAN_UIUX_PRZEMYSLOWY_2026-10.md` i zapisana tam w §5. Werdykt wizualny (B-02)
należy do właściciela; tu są dowody i propozycje do rozpatrzenia.

Metoda: sześć niezależnych sond tylko do odczytu (kod, model ENM, ziarna e2e, testy) oraz
własny pomiar pikseli zrzutów. Każde ustalenie ma `plik:linia`. Tam, gdzie czegoś nie
uruchomiono (solver, e2e), jest to napisane wprost. Ścieżki frontendu liczone od
`frontend/src`, backendu od `backend/src`.

## 0. Wynik w skrócie

Zarzuty właściciela potwierdzone w kodzie: §2 (widok całej sieci), §3 (identyczne kadry
stacji), §4 (kadr pola), §5 (GPZ — pkt 2, 3, 4, 6, 7, 8), §6 (inspektor jako zbiór
przycisków), §7 (kontekst wyników, brak warstw), §8 (formularz OZE wprowadza w błąd).
Dwa zarzuty wymagają korekty opisu przyczyny, nie złagodzenia:
- §6 „drzewo podświetla odgałęźną, inspektor pokazuje Przelotową” — to NIE jest rozjazd
  identyfikatorów zaznaczenia (wszystkie trzy powierzchnie czytają to samo ID). Przyczyna
  jest gorsza dla odbioru: ziarno e2e nadało stacjom nazwy sprzeczne z ich rodzajem
  wyprowadzonym z topologii, drzewo ucina nazwę i pokazuje tylko rodzaj, a inspektor pokazuje
  tylko nazwę. Dowód odbiorowy był więc mylący z winy danych testowych (Z-11).
- §7 „Rozpływ mocy” kontra „Przebieg: Zwarcie 3F” — dane są poprawne, ale cztery powierzchnie
  mają cztery niezależne źródła „który bieg” bez wspólnego klucza (Z-14).

Ustalenia wykraczające poza zarzuty (ważniejsze niż kosmetyka):
1. **Karta K3 (geometria stacji, partia 1 planu) nie została wykonana**, a K2 (kadrowanie,
   partia 2) ją wyprzedziło. Stacja sekcyjna typu D ma w modelu ENM dwie sekcje szyn
   i sprzęgło, a rysunek pokazuje jedną szynę „Sekcja 1” ze sprzęgłem jako zwykłym polem
   (Z-03). UI-04 nie mogło być przyjęte na geometrii, która nie pokazuje sekcji.
2. **Rysunek GPZ przedstawia sieć inną niż model** (Z-06): wspólna „Szyna WN · 110 kV” zasila
   na rysunku trzy transformatory, a w modelu każdy transformator ma własną, niepołączoną
   szynę 110 kV bez źródła; źródło jest na 15 kV. Dodatkowo operacja domenowa GPZ przy
   źródle po stronie 110 kV podpina je tylko do szyny pierwszego transformatora — TR2 i TR3
   są wtedy ślepe i nie biorą udziału w rozpływie ani zwarciu. To defekt modelu, nie tylko
   rysunku.
3. **Sprzęgło sekcji GPZ jest w modelu, a nie ma go na rysunku** — operacja tworzy gałąź
   `bus_coupler`, adapter wymaga rekordu pola `COUPLER`, którego operacja nie tworzy
   (predykaty niesparowane, reguła „KLASA, NIE INSTANCJA” pkt 3) (Z-07).
4. **Zmiana NOP w wariancie nie istnieje** (krok 10 scenariusza): `OperatingScenario` nie ma
   stanów łączników, mimo że ADR-017 przewiduje warstwę SCENARIO dla stanu łączeniowego.
5. **Testy odbiorowe K2 akceptowały defekt z założenia**: e2e dopuszcza sąsiada „w całości
   w kadrze”, vitest kamery ma przypadek „bliższy sąsiad wchłonięty w całości” jako
   oczekiwany (Z-20).

Wspólna przyczyna metodyczna: odbiór mierzył geometrię (prostokąt w oknie, brak obcięć),
a nie tożsamość elektryczną (czy na kadrze jest właściwy obiekt, jego sekcje, aparaty z
modelu, a nic, czego model nie ma). Fikstury rysowały aparaty „z konwencji” (seed bez
`primary_devices`), więc rysunek wyglądał kompletnie bez danych.

## 1. Zarzuty — dziewięć punktów na każdą wadę

Oznaczenia: (1) dowód, (2) przyczyna, (3) skutek dla projektanta, (4) czy w planie,
(5) karta, (6) korekta karty albo uzasadnione odrzucenie, (7) kryterium odbioru,
(8) ryzyko regresji lub konfliktu z kanonem, (9) czy potrzebna decyzja B-01/B-02.

### Z-01 Widok całej sieci: rysunek zajmuje ułamek kanwy, rama arkusza dominuje (§2)

1. Zrzut `zrzuty/przed-po/po/ui01-powloka-1440x900-ciemny.png`: obwiednia przewodów sieci
   zajmuje 27% powierzchni kanwy (pomiar pikseli: x 575–1090, y 286–700 przy kanwie
   262–1430 × 140–815); piksele przewodów to 0,34% kanwy. Rama arkusza z polami A–C/1–3
   rysowana bezwarunkowo: `ui/sld/v3/canvas/SldCanvasV3.tsx:3367` (`SheetFrame`, bez propa
   ukrycia, `ui/sld/v3/sheet/Frame.tsx:177-225`). Odcinki magistrali biegną po krawędzi ramy.
2. Przyczyna: ekran roboczy i arkusz dokumentacyjny to jedna i ta sama scena — scena jest
   układana na arkuszu (`sheetSizeFor(scene)`, `SldCanvasV3.tsx:2718`), a „Dopasuj widok”
   (`'tresc'`, `:2427`, `:2312-2350`) kadruje treść przesuniętą o margines ramy (`:2374`).
   Przy kadrze całej sieci skala spada poniżej 0,6, więc obowiązuje LOD 0 (`camera.ts:145`):
   stacje jako mini-glify, NOP tylko jako marker w glifie (`scene/buildScene.ts:3695-3703`,
   symbol NOP dopiero przy `lod !== 0`), kabel i linia napowietrzna nierozróżnione
   (`meta.dashed` nigdzie nie ustawiane z typu linii; `sheet/projectLegend.ts:32-39`
   pomija „napowietrzną”, bo rysunek jej nie ma). Grubości: magistrala 2,4, odgałęzienie 1,6
   z podłogą ekranową 1,5 px (`compose/preview.tsx:63-80`, `:143-160`).
3. Skutek: projektant nie widzi struktury sieci (które stacje na której magistrali, gdzie
   NOP, jakie łączniki otwarte, gdzie źródła OZE, kabel czy napowietrzna) bez przybliżania;
   widok przeglądowy nie służy do pracy.
4. W planie częściowo: W5-UI-04 („widok przeglądowy vs szczegółowy”) przypisany do K2;
   rozdzielenia widoku roboczego i dokumentacyjnego nie rozstrzyga żaden dokument (sonda:
   0 trafień w planie i kontrakcie).
5. Karty: K2 (kadr i tryb widoku), K4 (treść warstwy struktury: NOP, stany łączników, rodzaj
   przewodu, źródła), K3 (rodzaj przewodu jako dana segmentu w scenie).
6. Korekta K2: tryb widoku kanwy „roboczy / arkusz” jako stan tego samego `SldCanvasV3`
   (bez nowego renderera): w trybie roboczym rama, pola odniesienia i tabliczka nie są
   rysowane, a kadr liczy się z treści bez marginesu ramy; tryb arkusza i eksport
   (`sheet/exportFrame.ts`) bez zmian. Korekta K4: na LOD 0 warstwa struktury pokazuje
   symbol NOP, stan łączników sekcyjnych, rodzaj stacji, źródła PV/FW/BESS i rodzaj przewodu
   (linia napowietrzna przerywana — wymaga pola rodzaju odcinka w meta segmentu z ENM, K3).
   Progi LOD i grubości przewodów do skorygowania w K2 tak, by przy kadrze całej sieci
   przewód był ≥ 2 px, a etykieta stacji ≥ 13 px (standard §8).
7. Odbiór: przy 1440×900 i 1920×1080 obwiednia rysunku całej sieci ≥ 80% mniejszego wymiaru
   kanwy; na kadrze widoczne: GPZ, każda magistrala, każdy NOP z symbolem, każda stacja z
   rodzajem, każde źródło OZE, rozróżnienie kabel/napowietrzna; ten sam kadr w trybie arkusza
   pokazuje ramę; eksport PDF bez zmian (hash).
8. Ryzyko: odciski scen i zrzutów determinizmu SLD (tryb roboczy jako nowy stan — istniejące
   odciski dotyczą trybu arkusza, więc zostają); kontrakty `minSymbolSize`, `kadrTresci`.
9. B-02: tak (werdykt wizualny). B-01: nie.

### Z-02 Kadry „Stacja Sekcyjna” i „Stacja Końcowa” identyczne (§3)

1. Pomiar pikseli: `k2-kadrowanie/k2-stacja-sekcyjna-*.png` i `k2-stacja-koncowa-*.png` —
   region x 390–1057, y 225–774 identyczny w obu motywach (różnica `None`); w całej kanwie
   różni się tylko pasek „Sieć › Stacja … 4/5 | 5/5”. Właściciel ma rację co do faktu.
2. Przyczyna: kamera przy kolizji z sąsiadem WCHŁANIA go w całości i kadruje SUMĘ prostokątów:
   `ui/sld/v3/canvas/camera.ts:889` (`poszerzony = suma(kadr, uciete[0].p)`), przyjęte, gdy
   cel zajmuje ≥ 50% mniejszego wymiaru (`dominuje`, `KADR_UDZIAL_DOMINACJI = 0.5`, `:744`,
   `:891`), z zejściem na LOD 1, gdy na LOD 2 brak rozwiązania (`:996-1003`). Dla sekcyjnej
   najbliższym sąsiadem jest końcowa, dla końcowej — sekcyjna; suma jest ta sama, więc środek
   i skala identyczne. Zbiór przeszkód to KAŻDA inna stacja modelu
   (`canvas/zakresKadru.ts:561-565`, `:612-621`) — nie ma pojęcia „sąsiad elektrycznie
   potrzebny”. Komunikat „Ukryto 17 opisów” to skutek mniejszej skali sumy (plan etykiet,
   `SldCanvasV3.tsx:2825-2878`).
3. Skutek: dwuklik stacji nie pokazuje jej schematu; poprzednia/następna prowadzi do tego
   samego obrazu; nazwy pól ukryte — nie da się zweryfikować konfiguracji rozdzielnicy.
4. W planie: tak (UI-04, W5-UI-15, K2), ale reguła wchłaniania była zaprojektowana w K2 jako
   poprawna.
5. Karta: K2.
6. Korekta K2: kadr stacji kadruje WYŁĄCZNIE stację (szyny, pola, aparaty, transformator,
   strona nN), z oddechem; sąsiedzi nigdy nie są wchłaniani — zamiast tego przyciemnienie
   tego, co wpadło w okno (już istniejące „kurtyny”), albo kadr „wnętrze stacji” na LOD 2
   z izolacją reszty sceny. Sąsiad wchodzi do kadru tylko wtedy, gdy jest elektrycznie
   wymagany do zrozumienia stacji (np. GPZ dla pola zasilającego — decyzja karty z listą
   przypadków), nigdy z powodu bliskości na arkuszu. Zakaz zejścia LOD poniżej 2 dla kadru
   stacji. Udział celu: ≥ 70% mniejszego wymiaru kanwy.
7. Odbiór: dla każdej z 4 stacji ziarna (i 53 stacji fikstur generowanych w vitest): zbiór
   stacji widocznych w kadrze = {cel}; wszystkie nazwy pól i aparatów celu widoczne (licznik
   ukrytych opisów = 0 dla celu); viewBox i zbiór widocznych `ownerRef` różne dla każdej pary
   stacji; nawigacja poprzednia/następna zmienia zbiór widocznych refów.
8. Ryzyko: testy `camera.kadr.test.ts:179-257,375-400` zakładają wchłanianie — do
   przepisania z zachowaniem intencji „bez uciętego sąsiada” (sąsiad ma być poza kadrem albo
   przyciemniony, nie wchłonięty). Kadry innych celów (magistrala, tor) używają tej samej
   funkcji — iloczyn cel × sąsiedztwo musi być w testach.
9. B-02: tak. B-01: nie.

### Z-03 Stacja sekcyjna rysowana z jedną szyną; karta K3 niewykonana (§3, §9 K3)

1. Model: operacja `insert_station_on_segment_sn` typ „D” tworzy dwie szyny SN i sprzęgło
   (`enm/domain_operations.py:7015-7022`, gałąź `bus_coupler` `:7096-7102`, pole SPRZEGLO
   `:7199`, `bus_refs: [sn_bus_id, sn_bus_b_id]` `:7470`). Rysunek:
   `ui/sld/v3/compose/station.ts:1608-1614` — jedna szyna `${station.id}#sn-bus` od
   pierwszego do ostatniego zaczepu; sprzęgło to kolumna pola (`station.ts:2054,2074,2092`).
   Zrzut: „S02 · Sekcja 1 · 15 kV” z „FS1 · sprzęgła” jako zwykłym polem. Historia gałęzi:
   brak commitu karty K3 (`git log` — 0 trafień „K3/GEOMETRIA-STACJI”).
2. Przyczyna: K3 (partia 1) nie została zlecona ani wykonana; K2 (partia 2) zbudowano na
   geometrii sprzed K3. Rozdział sekcji istnieje tylko dla GPZ (`compose/gpz.ts:839`
   `layoutSections`). Dodatkowo kadr „sekcja” dla stacji D nie działa: dwie szyny 15 kV to
   remis w `shared/stationBusResolution.ts` (`pickStationBus`), więc `kompozytSzyny` zwraca
   `null` (`canvas/zakresKadru.ts:356-360`).
3. Skutek: schemat stacji fałszuje jej konfigurację — projektant nie widzi, które pola są na
   której sekcji ani że sprzęgło łączy dwie sekcje; nie można zweryfikować układu
   rozdzielnicy (cel UI-05: „schemat stacji SN/nN ma służyć weryfikacji konfiguracji”).
4. W planie: tak (M6, W5-UI-07, K3 partia 1).
5. Karta: K3.
6. Korekta planu: K3 wykonywana PRZED ponownym odbiorem K2; K2 przyjmowane dopiero na
   geometrii K3. Zakres K3 uzupełniony o: sekcje szyn stacji SN/nN z `bus_refs` i rekordów pól
   (sekcja pola = szyna, do której pole jest przyłączone), sprzęgło jako łącznik między
   sekcjami ze stanem z modelu, kadr „sekcja” dla stacji wielosekcyjnej (rozstrzygnięcie
   remisu przez sekcję, nie odmowę), pole rezerwowe (Z-05), rozróżnienie toru głównego
   i odgałęzienia w stacji przelotowej/odgałęźnej (meta `mainTrunkStationIds` już jest,
   `zakresKadru.ts:582-596`).
7. Odbiór: dla stacji D scena ma dokładnie dwa segmenty szyny SN o `ownerRef` równych
   `bus_refs` z ENM, pola przypięte do właściwej sekcji (iloczyn: rola pola × sekcja), sprzęgło
   łączy oba segmenty, jego stan z modelu (otwarte/zamknięte/nieznane — trzy rysunki); dla
   stacji przelotowej, odgałęźnej i końcowej — różne sylwetki zgodne z rodzajem z
   `enm/rodzaj_stacji.py` (R1–R4); zrzuty 4 rodzajów × 2 motywy.
8. Ryzyko: odciski scen (`kosztSceny`, determinizm SLD), etykiety wyników przypinane dziś do
   `#sn-bus` (`resultRefBridge.ts` odmawia dla stacji dwusekcyjnej — po K3 punkt wyniku na
   sekcję). Kanon: `SLD_CAD_SPEC_V3` §19.3 (rodzaj z topologii) — zgodne.
9. B-02: tak. B-01: nie (bez zmian solvera i modelu).

### Z-04 Powrót nie przywraca zaznaczenia; „Sieć” to nowy kadr, nie powrót (§3 pkt 7)

1. Stos kadrów: `canvas/historiaKadrow.ts` — wpis `{transform, lod, sciezka}`, bez
   zaznaczenia; `useKadrowanieWidoku.ts:179-190,258-268`. Escape zdejmuje zaznaczenie, nie
   kamerę (`SldCanvasV3Workspace.tsx:1511-1519`). Ogniwo „Sieć” wywołuje nowy kadr sieci
   (`kadrujPoziom` → `'siec'`), nie zdjęcie wpisu ze stosu. „Wstecz” z 5/5 wraca do 4/5, nie
   do stanu sprzed wejścia w stację.
2. Przyczyna: K2 zdefiniowało historię jako historię kamery, nie kontekstu pracy.
3. Skutek: po zajrzeniu do stacji projektant traci miejsce i zaznaczenie w sieci.
4. W planie: tak (UI-04 „bez utraty kontekstu”, K1/K8 R01).
5. Karta: K2.
6. Korekta K2: wpis historii = kamera + LOD + ścieżka + zaznaczenie (ref domenowy); „Sieć”
   w ścieżce wraca do wpisu, z którego weszło się w stację; przejścia poprzednia/następna
   nie odkładają osobnych wpisów (jedna sesja przeglądu stacji = jeden wpis powrotu).
7. Odbiór e2e natywny: zaznacz odcinek w sieci → dwuklik stacji → następna ×2 → „Sieć”:
   viewBox i zaznaczenie identyczne jak przed dwuklikiem.
8. Ryzyko: małe; test `kadrowanieWidoku.workspace.test.tsx:135` do rozszerzenia.
9. Nie.

### Z-05 Kadr pola: dwa podobnie wyróżnione pola, przewód wychodzi z kadru, rezerwa jak czynne (§4)

1. Zrzut `k2-kadrowanie/k2-pole-ciemny.png`. Tło kolumn to barwa ROLI pola, nie zaznaczenia
   (`compose/gpz.ts:2500` `panelePolGpz`, `GpzAdnotacjeWarstwa.tsx` ~106-125) — oba pola
   liniowe mają tę samą barwę, zaznaczone nie odróżnia się. Prawe pole ma podpis „koniec toru”
   (`scene/buildScene.ts:5064-5105`), a rysuje się jak czynne. Stos aparatów DS-CB-CT-DS-ES
   i głowica kablowa z konwencji (`compose/apparatusSequence.ts:95,101`), bo ziarno nie
   wypełnia `primary_devices`, `bay_number`, `protection_ref`. Stan `READY_FOR_TRUNK`
   (`enm/domain_operations.py:4533`) nie jest czytany przez kompozycję (grep: 0).
2. Przyczyna: (a) rysunek pola nie rozróżnia „aparat z modelu” od „aparat z konwencji”;
   (b) brak sylwetki pola rezerwowego (dana jest w modelu, nikt jej nie czyta); (c) cel kadru
   `'pole'` (`zakresKadru.ts:652-664`) bez wyróżnienia zaznaczenia na tle roli.
3. Skutek: projektant nie wie, które aparaty są zamodelowane (i liczone w EAZ/doborze), a
   które są tylko rysunkiem; wolne pole wygląda jak czynny odpływ.
4. W planie: tak (M6 „sylwetka pola rezerwowego”, W5-UI-08, K3); rozróżnienie „z modelu /
   z konwencji” — nie.
5. Karta: K3 (rysunek), K6 (inspektor pola).
6. Korekta K3: aparat bez rekordu w modelu nie jest rysowany jako aparat z modelu — albo
   pomijany, albo rysowany jako „miejsce aparatu bez danych” (jedna jawna sylwetka, opis
   „brak danych aparatu”), zgodnie z zasadą zero fabrykacji; pole o `field_status`
   `READY_FOR_TRUNK`/rezerwowe ma własną sylwetkę (bez głowicy kablowej i bez odpływu);
   wyróżnienie zaznaczenia niezależne od barwy roli. Przewód odpływu w kadrze pola kończy się
   strzałką kierunku z nazwą celu (`outgoing_destination_ref`), zamiast biec poza kadr.
7. Odbiór: iloczyn rola pola × aparat z modelu/bez danych × rezerwa/czynne — scena ma
   różne sylwetki; e2e: kadr pola pokazuje oznaczenie, funkcję, sekcję, aparaty ze stanami
   z modelu, CT, uziemnik, głowicę i dalsze przyłączenie z nazwą.
8. Ryzyko: fikstury i zrzuty GPZ (dziś rysowane z konwencji) zmienią wygląd; kanon
   `SLD_CAD_SPEC_V3` sekwencji aparatów — do sprawdzenia, czy konwencja jest tam wymagana
   (wtedy konflikt do `REJESTR_KONFLIKTOW.md`).
9. B-02: tak.

### Z-06 GPZ: rysunek pokazuje wspólną szynę 110 kV, model ma trzy ślepe szyny; źródło na 15 kV (§5 pkt 2, 6)

1. Model: każdy transformator dostaje własną szynę `transformer/{n}/bus_110`
   (`enm/domain_operations.py:4248-4302`), bez gałęzi między nimi. Źródło: na szynie SN
   sekcji 1, chyba że katalog źródła ma `short_circuit_input_side == "HV_110"` — wtedy na
   `gpz_hv_bus_refs[0]`, czyli TYLKO na szynie pierwszego transformatora
   (`:4358-4365`). Katalog ziarna `src-gpz-15kv-250mva-rx010`
   (`network_model/catalog/mv_source_catalog.py:77-95`) nie ma tej danej → źródło na 15 kV.
   Rysunek: jedna ciągła „Szyna WN · 110 kV” nad TR1–TR3 (`compose/gpz.ts:1976-1990`,
   `:2132-2150`). Adapter sam opisuje rozbieżność (`enmToCanonicalGpzAdapter.ts:206-213`)
   i odmawia punktu wyniku przy > 1 szynie WN (`:218-221`). Kanon modelu:
   `enm/models.py` (`Substation.gpz_hv_sections`: „pusta lista = single 110 kV bus (kanon)”).
2. Przyczyna: (a) operacja domenowa GPZ tworzy szynę 110 kV per transformator, sprzecznie
   z kanonem jednej szyny WN; (b) renderer rysuje jedną szynę, której model nie ma;
   (c) przy źródle po stronie 110 kV TR2 i TR3 nie mają zasilania od strony WN.
3. Skutek elektryczny (wnioskowanie z topologii, solvera nie uruchamiano): przy źródle na
   15 kV transformatory są ślepymi pniami bez przepływu — rysunek sugeruje zasilanie, którego
   nie ma. Przy źródle na 110 kV cały rozpływ i prąd zwarciowy płyną przez TR1; TR2 i TR3
   nie pracują równolegle → zaniżony prąd zwarciowy na sekcjach i przeciążenie TR1 w
   obliczeniu. Projektant zobaczyłby na rysunku trzy transformatory pracujące równolegle,
   a obliczenie odpowiadałoby jednemu.
4. W planie: nie (plan nie ma karty modelu GPZ; GPZ-PARYTET był kartą rysunku).
5. Karta: K3 (rysunek) z warunkiem wstępnym w backendzie, który prowadzi sesja główna
   (operacja domenowa GPZ). Bez rozwijania strony WN: tylko poprawna topologia istniejących
   elementów.
6. Korekta: (a) operacja GPZ tworzy jedną szynę 110 kV wspólną dla transformatorów
   (kanon `gpz_hv_sections` pusta = jedna szyna) albo jawne sekcje WN z `gpz_hv_sections`;
   źródło po stronie 110 kV na tej szynie; (b) przy źródle zastępczym na 15 kV
   (`short_circuit_input_side` SN) transformatory WN/SN nie mogą być rysowane jako tor
   zasilania — rysunek pokazuje źródło zastępcze sekcji, a transformatory jako elementy
   bez zasilania od strony WN z jawną informacją albo operacja w ogóle ich nie tworzy;
   wybór należy do architekta (decyzja modelowa, patrz pkt 9); (c) renderer rysuje szynę WN
   wyłącznie z szyn modelu (jedna szyna — jeden odcinek; kilka — kilka odcinków).
7. Odbiór: test domenowy — GPZ z 3 TR i źródłem 110 kV: rozpływ obciąża wszystkie TR
   proporcjonalnie do impedancji; Ik″ na sekcji przy zamkniętym sprzęgle odpowiada trzem TR
   równolegle (sonda liczbowa z podstawą IEC 60909); rysunek: liczba odcinków szyny WN =
   liczba szyn WN w modelu.
8. Ryzyko: zmiana wyników zwarciowych i rozpływowych każdej sieci zbudowanej tą operacją
   z ≥ 2 TR i źródłem 110 kV (fikstury golden, odciski ENM). Kanon jest po stronie korekty.
9. **B-01 (tryb architekta)**: zmiana operacji domenowej zmienia wyniki obliczeń — decyzja
   architekta po pełnej regresji, sondzie liczbowej, determinizmie i iniekcjach, zgodnie
   z dyrektywą 2026-10-15. Pytanie modelowe (b) do architekta, nie do właściciela.

### Z-07 GPZ: sprzęgło sekcji w modelu, brak na rysunku (§5 pkt 4)

1. `enm/domain_operations.py:4457-4491` tworzy gałąź `bus_coupler` (zamkniętą) między
   sekcjami, ale nie tworzy rekordu pola z rolą `COUPLER`. Adapter
   `ui/sld/v2/canvas/enmToCanonicalGpzAdapter.ts:531-545` (`buildCouplers`) bierze sprzęgła
   wyłącznie z pól `bay_role === 'COUPLER'` → pusta lista. Zrzut: sekcje 1 i 2 bez połączenia.
2. Przyczyna: dwa niezależne predykaty „co jest sprzęgłem” (gałąź `bus_coupler` w modelu,
   pole `COUPLER` w adapterze) — reguła „KLASA, NIE INSTANCJA” pkt 3.
3. Skutek: projektant widzi dwie niezależne sekcje, choć model je łączy; nie widzi stanu
   sprzęgła (kluczowego dla Ik″ i rezerwowania).
4. W planie: nie.
5. Karta: K3 (adapter i rysunek).
6. Korekta K3: sprzęgło GPZ i stacji wielosekcyjnej z JEDNEGO źródła — gałęzi
   `bus_coupler` łączącej szyny sekcji (stan z gałęzi); pole `COUPLER`, gdy istnieje, dokłada
   aparaturę, nie warunkuje istnienia sprzęgła.
7. Odbiór: iloczyn {gałąź jest / brak} × {pole COUPLER jest / brak} × stan {otw., zamk.,
   nieznany} — rysunek sprzęgła zawsze, gdy jest gałąź; iniekcja usunięcia gałęzi →
   sprzęgło znika.
8. Ryzyko: odciski scen GPZ. Brak konfliktu z kanonem (`models.py:1155`: „sprzęgło
   międzysekcyjne to zwykły `SwitchBranch` (`type="bus_coupler"`)”).
9. B-02: tak.

### Z-08 GPZ: aparaty transformatorów i uziemniki z konwencji, nie z modelu (§5 pkt 3, 7)

1. Wieże TR: stosy DS+CB+CT+ES rysowane z konwencji (`compose/gpz.ts:1317`, `:1957-2040`),
   stan `unknown` (`:1131-1137`), a ziarno GPZ nie tworzy pól WN/TR ani łączników po stronie
   transformatora (`enm/domain_operations.py:4493-4585`). Uziemnik pola liniowego: stan tylko
   z `primary_devices`, ziarno go nie tworzy; rysowany z konwencji
   (`compose/apparatusSequence.ts:101`). Barwa czerwonych/zielonych kwadratów na wieżach —
   znaczenie niezweryfikowane (sonda nie rozstrzygnęła).
2. Przyczyna: jak Z-05 — konwencja rysunkowa w miejscu danych modelu.
3. Skutek: rysunek sugeruje aparaty, których model nie ma, z barwami, które czytelnik
   odczytuje jako stan. To łamie zakaz fabrykacji.
4. W planie: częściowo (K3 adapter: stany DER zaszyte; reszta — nie).
5. Karta: K3.
6. Korekta K3: jak Z-05 — bez aparatów z konwencji udających dane; jeżeli wieża TR nie ma
   aparatów w modelu, rysowane jest samo połączenie TR–szyna z jawną informacją „aparatura
   pola transformatora niezamodelowana”. Barwa stanu tylko dla stanu z modelu; legenda.
7. Odbiór: iniekcja — dodanie rekordu aparatu do modelu zmienia rysunek z „brak danych” na
   aparat ze stanem; usunięcie — odwrotnie; test negatywny: żadna barwa stanu bez rekordu.
8. Ryzyko: odciski GPZ; zgodność z `KONTRAKT_NEGATYWNY_GPZ`.
9. B-02: tak.

### Z-09 GPZ: tablice „brak” w geometrii schematu (§5 pkt 8)

1. Teksty i tablica w `compose/gpzAdnotacje.ts:85-120`, `:298`, `:355`; rama GPZ zawsze
   rezerwuje tablicę i belkę (`compose/gpz.ts:2400-2440`); warstwa
   `GpzAdnotacjeWarstwa.tsx:97-135` chowa teksty tylko poniżej progu skali. Zrzut: ok. 40%
   wysokości ramy GPZ to wiersze „brak wyniku rozpływu mocy” i tablica pełna „brak”.
2. Przyczyna: wyniki są elementem geometrii schematu, nie warstwą.
3. Skutek: schemat GPZ spychany w dół, czytelność spada, a powtarzany „brak” jest szumem.
4. W planie: częściowo (UI-06 bloki danych, UI-07 warstwy — K4).
5. Karta: K4.
6. Korekta K4: blok wyników GPZ jako blok danych warstwy wyników (zwijany, poza geometrią
   ramy schematu); bez wyniku jeden wiersz stanu zamiast tablicy; z wynikiem — tablica.
7. Odbiór: geometria schematu GPZ identyczna z blokiem wyników zwiniętym i rozwiniętym
   (odcisk geometrii schematu niezależny od warstwy); bez wyniku: 1 wiersz.
8. Ryzyko: odciski GPZ (zmiana geometrii ramy) — planowana, z atrybucją.
9. B-02: tak.

### Z-10 GPZ: te same oznaczenia pól w obu sekcjach (obserwacja ze zrzutu)

1. Zrzut: „Pole liniowe GPZ 1” i „Pole liniowe GPZ 2” w sekcji 1 i w sekcji 2. Nazwa domyślna
   numerowana w obrębie sekcji: `enm/domain_operations.py:838-855`
   (`_build_gpz_line_field_names`).
2. Przyczyna: domyślna nazwa pola nie zawiera numeru sekcji (inna gałąź tej samej operacji,
   `:4521`, numeruje „{sekcja}.{pole}” — dwie reguły nazewnictwa w jednej operacji).
3. Skutek: oznaczenie pola niejednoznaczne w drzewie, tabelach, wynikach i dokumentacji.
4. W planie: nie.
5. Karta: K3 — warunek backendowy po stronie sesji głównej (operacja domenowa GPZ), razem
   z Z-06.
6. Korekta: jedna reguła nazwy domyślnej z numerem sekcji; drzewo i SLD pokazują oznaczenie
   unikalne w stacji.
7. Odbiór: test domenowy — nazwy pól GPZ unikalne w obrębie stacji dla każdej liczby sekcji.
8. Ryzyko: odciski ENM fikstur (nazwy w hashu) — planowana zmiana z atrybucją.
9. B-01: nie (nazwa nie wpływa na obliczenia); decyzja architekta przy Z-06.

### Z-11 „Drzewo podświetla odgałęźną, inspektor pokazuje Przelotową” (§6)

1. Wszystkie trzy powierzchnie czytają `useSelectionStore.selectedElements[0].id`:
   drzewo `ui/shell/context-panels/SchematContextPanel.tsx:128,535,654`, kanwa
   `SldCanvasV3Workspace.tsx:2299-2301,2385`, inspektor `ui2/legacy/LegacyInspektor.tsx:38,53`.
   Spec klika natywnie uchwyt nazwy „Stacja Przelotowa”
   (`e2e/uiux-przed-po-screenshot.spec.ts:85`). Ziarno nadaje tej stacji 4 pola liniowe
   `['IN','OUT','FEEDER','FEEDER']` (`e2e/siecKadrowStacji.ts:108`), a stacja nazwana
   „Odgałęźna” ma jedno pole (`:140-145`). Reguła topologiczna (`enm/rodzaj_stacji.py`
   R2: ≥ 3 pola liniowe ⇒ odgałęźna; R4: 0–1 ⇒ końcowa; lustro `ui/shared/rodzajStacji.ts:189`)
   daje „odgałęźna” i „końcowa”. Drzewo pokazuje rodzaj z topologii
   (`SchematContextPanel.tsx:630,980`) i ucina nazwę do „Sta…”; inspektor pokazuje tylko
   nazwę (`PanelElementuKanwy.tsx:256-257`).
2. Przyczyna: (a) ziarno odbiorowe z nazwami sprzecznymi z rodzajem — dowód mylący;
   (b) drzewo ucina nazwę (Z-21); (c) inspektor nie pokazuje rodzaju stacji ani jego
   podstawy (wiersze „Rodzaj stacji / Podstawa rodzaju” istnieją tylko w nieużywanej tu
   ścieżce `ui2/adapters/inspectorAdapter.ts:341-356`).
3. Skutek: projektant nie wie, czy patrzy na ten sam obiekt; rodzaj stacji (istotny dla
   konfiguracji pól i rezerwowania) widoczny tylko w drzewie.
4. W planie: częściowo (UI-15 jeden kontekst — K6; W5-UI-12 drzewo — K7); defekt ziarna — nie.
5. Karty: K9 (ziarno), K6 (inspektor), K7 (drzewo).
6. Korekta: K9 — ziarna odbiorowe mają nazwy zgodne z rodzajem z topologii albo neutralne
   oznaczenia (np. „ST-01”), a deklarowany typ zgodny z wyprowadzonym (inaczej walidator
   zgłasza W043 — wtedy to świadomy przypadek testowy, nie tło zrzutu); K6 — nagłówek
   inspektora stacji: oznaczenie, nazwa, rodzaj z topologii i jego podstawa; K7 — wiersz
   drzewa: nazwa pełna, rodzaj jako drugi plan.
7. Odbiór: e2e — klik w SLD, drzewo, tabeli wyników i liście gotowości wskazuje ten sam ref
   (porównanie ID w DOM), a nazwa i rodzaj są identyczne w drzewie i inspektorze.
8. Ryzyko: zmiana nazw w ziarnie zmienia zrzuty dokumentacji (planowane).
9. Nie.

### Z-12 Inspektor stacji to zbiór przycisków, nie karta techniczna (§6)

1. Na kanwie nad inspektorem `PanelElementuKanwy` (`LegacyInspektor.tsx:42-51`): linia
   kontekstu, „Działania” — 10 przycisków (`ui/sld/shared/akcjeElementu.ts:75`), „Wyniki” —
   tylko U szyny SN (`ui/sld/shared/daneElementuKanwy.ts:157`). Ścieżka bez okna
   (`InspectorEngineeringView.tsx:2440-2507`, `tech-card/buildTechCardSubject.ts:268`) ma dla
   stacji tylko liczniki. W ENM istnieją, a nie są pokazane: parametry transformatora
   (`enm/models.py:429`: Sn, U_HV/U_LV, u_k, P_k, P_0, i_0, grupa połączeń, zaczepy),
   `construction_type`, `designation`, `nn_voltage_levels`, sekcje, rodzina rozdzielnicy
   i aparaty pól, CT/VT, `protection_ref`, wyniki poza U (Ik″, obciążenie TR).
2. Przyczyna: UI-02b (moja partia) przeniosło do inspektora pasek działań i formularz źródła,
   ale nie zbudowało karty technicznej per rodzaj elementu — pełną kartę ma tylko pole
   i odcinek (`PanelElementuKanwy.tsx:267-561`).
3. Skutek: projektant nie odczyta konfiguracji stacji bez otwierania kreatora.
4. W planie: tak (UI-14, K6).
5. Karta: K6.
6. Korekta K6: inspektor stacji — sekcje w kolejności pracy: Identyfikacja (oznaczenie,
   nazwa, rodzaj i podstawa, wykonanie), Rozdzielnica SN (sekcje z napięciem, tabela pól:
   nr, rola, aparat główny, U_r, I_r, zdolność wyłączalna, stan, zabezpieczenie/CT),
   Transformator (dane tabliczki z katalogu z podaniem źródła), Strona nN (sekcje, odpływy,
   odbiory, źródła), Przyłączenia (odcinki kablowe z typem i długością), Wyniki (U, Ik″,
   obciążenie TR, z flagą świeżości), Działania na dole, zwinięte do menu. Dane wyłącznie
   z ENM i wyników backendu.
7. Odbiór: dla każdego rodzaju elementu (stacja, pole, aparat, transformator, odcinek,
   źródło, łącznik) lista wymaganych pól karty pokryta testem parytetu z modelem ENM; zrzut
   1440×900 — na pierwszym ekranie inspektora identyfikacja i rozdzielnica, nie przyciski.
8. Ryzyko: `InspectorEngineeringView.tsx` (3409 linii) — wspólne źródło danych z
   `daneElementuKanwy.ts`, bez trzeciej ścieżki.
9. B-02: tak.

### Z-13 Szerokość inspektora: kod 340–560, kontrakt 340–420 (§6)

1. `ui2/shell/useShellStore.ts:33-35` (`RIGHT_MIN 340`, `RIGHT_MAX 560`,
   `RIGHT_DEFAULT 360`), `clampRightWidth` `:85`; kontrakt UI-02 (`KONTRAKT…:52-53`):
   340–420. Szerokość stała w px, bez wzoru od okna; 560 tylko ręcznym przeciąganiem
   (`PanelLayout.tsx:43-52,86-88`), odwracalne („Przywróć układ domyślny”, `:277`), trwałe per
   przestrzeń.
2. Przyczyna: K1 przyjęło górną granicę z tabel audytowych, odchylając się od kontraktu bez
   wpisu konfliktu.
3. Skutek: małe — zachowanie poprawne (bez automatycznego poszerzania), ale niezgodne
   z kontraktem.
4. W planie: tak (M4: 340–420, domyślnie 360).
5. Karta: K1.
6. Korekta K1: granica przeciągania 340–420 (kontrakt); 560 wyłącznie jako jawne polecenie
   „Szeroki inspektor” dla tabel (np. tabela pól K6), odwracalne tym samym poleceniem,
   z zapisem. Albo — jeśli właściciel uzna 560 za zbędne — usunięte.
7. Odbiór: e2e przeciągnięcia natywnego: zatrzymanie na 420; polecenie szerokie → 560 →
   powrót do poprzedniej szerokości.
8. Ryzyko: małe.
9. Decyzja właściciela (nie B-01/B-02): czy tryb 560 ma istnieć.

### Z-14 Kontekst wyników: selektor „Rozpływ mocy”, pasek „Przebieg: Zwarcie 3F” (§7)

1. Pasek stanu: najnowszy zakończony bieg przypadku (`ui2/shell/shellStatus.ts:119-140`).
   Selektor panelu dolnego: lokalny `useWynikiPaneluStore.wybranyRunId`
   (`ui2/shell/panelDolny/ZakladkaWyniki.tsx:90-110`, `wynikiPanelu.ts:124-135`, własna pamięć
   podręczna). Nakładka SLD: `useRawResultOverlayStore` z `?run=`/`activeRunId`
   (`ui2/legacy/useLegacyOrchestrator.ts:670-740`). Ekrany pełne:
   `usePowerFlowResultsStore.runHeader` (`ui2/wyniki/rozplyw/adapters/rozplywAdapter.ts:358`).
   Spec liczy rozpływ, potem zwarcie, i ręcznie wybiera rozpływ
   (`e2e/ui02-panel-dolny.spec.ts:250-309`). Świeżość liczona w trzech miejscach (status
   przypadku, `model_revision` biegu, zdarzenia magistrali). Zaznaczenie nie niesie `run_id`.
2. Przyczyna: brak jednego „kontekstu wyniku” {przypadek, bieg, rewizja modelu biegu}.
   Zakładka Wyniki (moja partia) dołożyła czwarte źródło zamiast skorzystać z jednego.
3. Skutek: SLD może pokazywać bieg A, tabela bieg B, pasek bieg C — projektant nie wie, do
   czego odnosi się liczba; dowód może dotyczyć innego biegu niż oglądany wynik.
4. W planie: tak (K1/K8 R01: „wynik i inspektor wskazują tę samą referencję”).
5. Karta: K8.
6. Korekta K8: jeden magazyn kontekstu wyniku {case_id, run_id, rodzaj analizy,
   model_revision biegu, input_hash}, z którego czytają: pasek stanu, selektor panelu, nakładka
   SLD, ekrany pełne, zakładka Dowody; świeżość z jednego predykatu (rewizja biegu ≠ rewizja
   bieżąca ⇒ nieaktualny); zmiana biegu w dowolnym miejscu zmienia go wszędzie; pasek stanu
   pokazuje bieg oglądany, nie ostatni.
7. Odbiór e2e: dwa biegi (PF, SC) → wybór PF w panelu → pasek, nakładka SLD, ekran rozpływu
   i Dowody pokazują ten sam `run_id` (porównanie atrybutu DOM); zmiana kabla → wszystkie
   cztery w stanie „nieaktualny”.
8. Ryzyko: średnie — wiele konsumentów `activeRunId`; FROZEN API wyników nietknięte (zmiana
   tylko we froncie).
9. Nie.

### Z-15 Wyniki na SLD jako przełączane warstwy (§7)

1. Przełącznik „Warstwy (6)”: `ui/sld/v3/canvas/layers.ts:28-47` — dwie warstwy wynikowe
   (strzałki i liczby). Stan: U — jest (`resultLabelTemplates.ts:185-186`); I — częściowo;
   kierunek P/Q — jest, ale ignoruje `resultsStale` (`SldCanvasV3.tsx:2736,3548`); % obciążenia
   — tylko tekst, bez barwy (`resultLabelTemplates.ts:194,214`); straty i ΔU — tylko w
   etykietach, limit 3 wiersze; miejsce zwarcia i wkłady — są, strzałki bez flagi świeżości
   (`:2745-2762`); przekroczenia — częściowo (`resultLabels.ts:480-489`); strefy EAZ —
   komponent `ui/sld-overlay/ProtectionZoneMarker.tsx` używany tylko w demo i testach (martwy
   dla kanwy); legenda domyślnie wyłączona, skali obciążenia brak. Synchronizacja: tabela panelu
   → SLD (zaznacz i kadruj, `ui2/shell/zaznaczElementModelu.ts:21-30`) — jest; SLD → tabela —
   jest (wspólne zaznaczenie), przewinięcie wiersza niezmierzone; ekran zwarć ma osobny
   przycisk „Pokaż na schemacie”.
2. Przyczyna: K4 (warstwy, bloki, legenda) nie wykonana; warstwy wynikowe są dwie zbiorcze.
3. Skutek: projektant nie odczyta na schemacie obciążenia ani spadku napięcia bez etykiet;
   nie zobaczy stref EAZ.
4. W planie: tak (UI-06, UI-07, K4, R04).
5. Karta: K4 (warstwy), K8 (synchronizacja ekranów pełnych).
6. Korekta K4: warstwy per wielkość (U, I, P/Q z kierunkiem, obciążenie % z barwą i skalą,
   ΔU, straty, zwarcie: miejsce i wkłady, przekroczenia, strefy EAZ z modelu zabezpieczeń),
   każda z flagą świeżości i trzema stanami (brak / nieaktualny / zero); `ProtectionZoneMarker`
   wpięty w kanwę albo skasowany i zastąpiony warstwą v3 (bez dwóch dróg). K8: klik wiersza
   każdego ekranu pełnego zaznacza i kadruje element na SLD bez opuszczania SLD.
7. Odbiór: iloczyn warstwa × stan wyniku (brak, nieaktualny, zero, wartość) × LOD; e2e:
   przełączenie warstwy obciążenia pokazuje skalę i barwy z wyniku backendu; zmiana kabla →
   każda warstwa w stanie nieaktualnym.
8. Ryzyko: `ui_no_physics_guard`, `overlay_no_physics_guard` — barwa z progów podanych przez
   backend (werdykt wyjaśnialny), nie liczona we froncie.
9. B-02: tak.

### Z-16 Formularz OZE w inspektorze: komunikat o kreatorze SN wprowadza w błąd (§8)

1. Formularz wysyła na stałe `nn_side` (`ui/network-build/inspektor-elementu/FormularzSzkicuDer.tsx:40,165,208`)
   do `POST /generators` (`api/generators.py:650` → `add_converter_source`,
   `enm/domain_operations_v2.py:6288`): tworzy generator na szynie nN stacji i pole źródłowe nN;
   nie wysyła transformatora blokowego, kabla, aparatu pola (`source_field.catalog_binding`),
   trybu regulacji (bierze z katalogu), pakietu baterii dla BESS ani danych NC RfG. Komunikat
   „przyłączenie SN wymaga pełnego kreatora” to goły `<span>` (`:407-409`), bez przejścia.
   Backend obsługuje SN (`api/generators.py:71,621`, wariant `block_transformer`); pełna ścieżka
   SN istnieje w `KreatorZrodlaOze` (`_add_converter_source_der_sn`,
   `domain_operations_v2.py:5774+`: szyna nN, TR blokowy, pole SN z aparatem, CT/VT,
   uziemnik, przekaźnik, kabel, generator, tryb regulacji, NC RfG). Presety BESS kończą się
   na 1 MW (`FormularzSzkicuDer.tsx:241`).
2. Przyczyna: UI-02b dołożyło szybki formularz nN, nie wiążąc go z istniejącym kreatorem SN.
3. Skutek: projektant może wnioskować, że SN jest niedostępne; BESS z formularza nie ma
   baterii; tryb regulacji niewidoczny.
4. W planie: częściowo (UI-14 — K6).
5. Karta: K6.
6. Korekta K6: formularz nazwany jawnie „Przyłączenie po stronie nN stacji”; w miejscu
   komunikatu przycisk „Przyłącz po stronie SN…” otwierający `KreatorZrodlaOze` z preselekcją
   stacji, rodzaju i mocy (wzorzec `ui2/oze/PrzylaczZrodloPrzycisk.tsx:43`); BESS wymaga
   pakietu baterii z katalogu albo jest kierowany do kreatora; tryb regulacji pokazany (z
   katalogu, ze źródłem danej). Bez drugiej ścieżki SN w formularzu.
7. Odbiór e2e (krok 5–6 scenariusza): BESS 2,5 MW przez kreator SN do pola stacji → w modelu
   pole SN z aparatem, TR blokowy, kabel, generator; bieg PF i SC zawiera wkład BESS
   (WHITE BOX), SLD rysuje BESS (nie PV), inspektor źródła pokazuje tor przyłączenia.
8. Ryzyko: małe; katalog — sprawdzić, czy istnieje falownik BESS 2,5 MW (niesprawdzone).
9. Nie.

### Z-17 Zasilanie liczone przeszukiwaniem grafu we froncie (§9 K4)

1. `ui/sld/v2/canvas/SupplyPathHighlighter.ts:106` wołany z `SldCanvasV3Workspace.tsx`
   ~573/587; endpoint backendu K6a istnieje (`GET …/enm/topologia/zasilenie`, `…/tor`,
   adapter `ui2/adapters/topologiaZasilenia.ts`).
2. Przyczyna: K4 niewykonane; K2 użyło K6a tylko dla toru, nie dla zasilenia.
3. Skutek: zieleń przewodów nie jest dowodem zasilenia (transformatory zawsze przechodzone,
   brak stanu „nierozstrzygnięty”) — ryzyko błędnego wniosku przy łączeniach.
4. W planie: tak (K4 R03).
5. Karta: K4.
6. Korekta: bez zmian zakresu R03; kolejność — przed ponownym odbiorem K2 (kadr toru i barwa
   zasilenia muszą mieć jedno źródło).
7. Odbiór: grep — 0 wywołań BFS jako źródła zasilenia; iniekcja otwarcia łącznika w backendzie
   zmienia barwę; stan nierozstrzygnięty widoczny.
8. Ryzyko: `overlay_no_physics_guard`.
9. Nie.

### Z-18 Edycja wyposażenia pola SN bez operacji domenowej (§9 K5, W5-C)

1. `ui2/kreatory/pole/KreatorPolaSn.tsx:438` `BEZ_DOPOSAZENIA`; `add_sn_bay` bez pola
   wyposażenia (`ui2/kreatory/stacja/KartaWyposazeniaPola.tsx:50-61`). Dodanie CT/VT działa
   (`add_ct`/`add_vt`, `domain_operations.py:5695`); zmiana typu aparatu przez
   `assign_catalog_to_element`.
2. Przyczyna: brak operacji domenowej „ustaw wyposażenie pola” (aparaty główne, uziemnik,
   głowica, ogranicznik przepięć jako rekordy modelu z wiązaniem katalogowym).
3. Skutek: krok 4 scenariusza przerwany; aparaty pól rysowane z konwencji (Z-05, Z-08).
4. W planie: tak (§4 K5 — zgłoszenie do sesji głównej).
5. Karta: K5 (front) + backend sesji głównej (W5-C).
6. Korekta: bez budowy po stronie tej gałęzi (granica W5-C). Zakres operacji zgłaszanej:
   `set_bay_equipment(bay_ref, devices: [{rola, catalog_ref, stan_normalny}])` z walidacją
   zgodności z rodziną rozdzielnicy (`allowed_apparatus_kinds`), U_r/I_r/I_k, rekordy
   `primary_devices`, zdarzenie rewizji i unieważnienie wyników.
7. Odbiór: K5 zapisuje wyposażenie tą operacją; SLD rysuje aparaty z rekordów (Z-05).
8. Ryzyko: po stronie sesji głównej.
9. Nie (zakres architekta).

### Z-19 Zmiana NOP w wariancie nie istnieje (krok 10 scenariusza)

1. `set_normal_open_point` (`enm/domain_operations.py:9119`) mutuje model (nowa rewizja).
   `OperatingScenario` (`enm/scenariusze.py:838-848`) nie ma stanów łączników; docstring
   `:20-26` wprost; `out_of_service` nie zamknie łącznika normalnie otwartego. ADR-017
   (`docs/adr/ADR-017-effective-state-resolution.md:8,15`) przewiduje warstwę SCENARIO stanu
   łączeniowego.
2. Przyczyna: warstwa SCENARIO stanu łączników z ADR-017 niewdrożona w `OperatingScenario`.
3. Skutek: wariant „NOP w innym miejscu” wymaga zmiany modelu bazowego — porównanie
   wariantów (krok 13) nie porównuje topologii.
4. W planie UI/UX: nie (zdolność backendu).
5. Karta: K8 (porównanie wariantów, front) — backend po stronie sesji głównej (stan
   łączników, granica W5-C).
6. Korekta: zgłoszenie do sesji głównej: pole stanów łączników w `OperatingScenario`
   z konsumentem w `EffectiveNetworkSnapshot` i `switching_snapshot_hash`; K8 dostaje
   porównanie dwóch przypadków o różnym NOP.
7. Odbiór: dwa przypadki na jednym modelu, różny NOP → różny rozpływ, model bazowy
   niezmieniony (ta sama rewizja).
8. Ryzyko: determinizm odcisku stanu łączeniowego (ADR-017).
9. B-01 w trybie architekta (zmiana warstwy rozwiązywania stanu efektywnego).

### Z-20 Testy odbiorowe akceptowały defekt (§9 K9)

1. e2e `k2-kadrowanie-nawigacja.spec.ts:191-215`: krawędzie stacji w oknie, rozmiar ≥ 50%
   mniejszego wymiaru, sąsiad nie „ucięty” — sąsiad „cały” dozwolony; każda iteracja zaczyna
   od kadru sieci, więc kadrów dwóch stacji nikt nie porównuje; poprzednia/następna — tylko
   licznik. vitest `camera.kadr.test.ts:179-257,375-400` przyjmuje wchłanianie jako oczekiwane.
   `zakresKadru.test.ts` sprawdza zbiory refów, nie kamerę.
2. Przyczyna: kryterium odbioru było geometryczne („prostokąt w oknie”), nie elektryczne
   („na kadrze jest ten obiekt, jego sekcje i aparaty z modelu, i nic więcej”).
3. Skutek: zielone testy przy obrazie wadliwym — właściciel słusznie odrzuca dowód.
4. W planie: tak (K9, §10 kontraktu).
5. Karta: K9 i każda karta rysunku (K2, K3, K4).
6. Korekta K9 (dotyczy wszystkich kart): asercje tożsamości elektrycznej zamiast samej
   geometrii — zbiór widocznych `ownerRef` porównany z oczekiwanym zbiorem z modelu ENM,
   rozróżnialność kadrów różnych celów, brak elementów rysowanych bez rekordu w modelu,
   licznik ukrytych opisów celu = 0; fikstury bez nazw sprzecznych z rodzajem i z rekordami
   aparatów; zrzut + operacja natywna + test dla każdego z 10 przypadków (§3).
7. Odbiór: iniekcja wchłaniania sąsiada, iniekcja jednej szyny w stacji D, iniekcja wspólnej
   szyny WN — każda czerwona w teście karty.
8. Ryzyko: brak.
9. Nie.

### Z-21 Drzewo obiektów ucina nazwy (§9 K1/UI-03, K7)

1. Zrzuty 1440×900: „Sta… · stacja odgałęź…”, „Pole lin… · pole liniowe w…”; przyczyna
   zmierzona w planie §2 (`ui2/nav/tree.css:130-133`, `ContextTree.tsx:321`); lewy panel
   220–260 px.
2. Przyczyna: wiersz drzewa ma nazwę i rodzaj w jednej linii o stałej szerokości; nazwa
   ucinana pierwsza.
3. Skutek: identyfikacja obiektu niemożliwa bez najechania (Z-11).
4. W planie: tak (W5-UI-12, K7; UI-03 K1).
5. Karta: K7.
6. Korekta K7: nazwa (oznaczenie) ma pierwszeństwo przed rodzajem; rodzaj w drugiej linii
   albo jako ikona z opisem; ucinanie tylko rodzaju; podpowiedź z pełną nazwą.
7. Odbiór: e2e przy 1440×900 i 1100×700 — `scrollWidth ≤ clientWidth` dla nazw 4 stacji
   ziarna i 4 pól GPZ.
8. Ryzyko: małe.
9. B-02: tak.

## 2. Scenariusz projektanta (12 kroków) — WYBÓR → DZIAŁANIE → ZMIANA MODELU → OBLICZENIE → PREZENTACJA → DOKUMENTACJA

| Krok | Stan | Ścieżka z dowodem albo przerwa | Karta |
|---|---|---|---|
| 1 Sieć 15 kV z GPZ | ciągła z wadą rysunku | kreatory `ui2/kreatory/zrodlo`, `magistrala`, import XLSX → `add_grid_source_sn`, `add_gpz_section`, `add_sn_bay` (`enm/domain_operations.py:170-200`) → rewizje `enm/rewizje.py`; rysunek GPZ niezgodny z modelem i model GPZ z ≥ 2 TR wadliwy | Z-06, Z-07, Z-10 → K3 + sesja główna |
| 2 Wybór stacji | przerwana dla odbioru | klik/dwuklik na SLD, drzewo; kadr stacji wchłania sąsiada | Z-02 → K2 |
| 3 Konfiguracja stacji | przerwana | dane w ENM (`enm/pola.py`, `rodzaj_stacji.py`), ale rysunek sekcyjnej z jedną szyną, inspektor bez karty technicznej | Z-03 → K3, Z-12 → K6 |
| 4 Aparatura pola SN | przerwana | CT/VT: `KreatorPomiaru.tsx` → `add_ct`/`add_vt` (`:5695`); typ aparatu: `assign_catalog_to_element`; edycja wyposażenia pola — brak operacji (`KreatorPolaSn.tsx:438`) | Z-18 → K5 + sesja główna |
| 5 BESS 2,5 MW | ciągła przez kreator SN | `KreatorZrodlaOze` → `_add_converter_source_der_sn` (`domain_operations_v2.py:5774+`); formularz inspektora mylący; katalog falownika 2,5 MW niesprawdzony | Z-16 → K6 |
| 6 Dobór urządzeń i kabla | ciągła | `ui2/kreatory/przypisanie-katalogu`, `mv_cable_line_catalog.py`, `assign_catalog_to_element`, `update_element_parameters` (`:9972`); werdykt `/api/quality/design-verdict` | — |
| 7 Rozpływ z wynikami na sieci | ciągła z wadami prezentacji | `POST /api/execution/study-cases/{id}/runs`, `/execute` (`api/execution_runs.py:198,255`) → `power_flow_newton.py` → `ui2/wyniki/rozplyw`, SLD; strzałki bez flagi świeżości, etykiety TR bez P/Q/I, kontekst biegu niespójny | Z-14 → K8, Z-15 → K4 |
| 8 Miejsce zwarcia i wkłady | ciągła | `short_circuit_iec60909.py`, `POST /api/proof/sc3f/contributions` (`api/proof_pack.py:360`), `api/fault_scenarios.py`, `ui2/wyniki/zwarcia`; na SLD miejsce i strzałki wkładów bez flagi świeżości | Z-15 → K4 |
| 9 Zabezpieczenia i charakterystyki | ciągła w warstwie `ui/` | `api/protection_coordination.py`, `protection_runs.py`; `ui2/wyniki/koordynacja/EkranKoordynacji.tsx:26,113` osadza `ui/protection-coordination` i `TimeCurrentChart`; strefy EAZ na SLD — martwy komponent | Z-15 → K4, K8 (rama wykresu UI-18) |
| 10 Zmiana NOP w wariancie | **brak** | `set_normal_open_point` mutuje model; `OperatingScenario` bez stanów łączników (`enm/scenariusze.py:20-26,838-848`) | Z-19 → K8 + sesja główna |
| 11 Nowy rozpływ, limity, strefy EAZ | częściowa | rozpływ jak krok 7 na nowej rewizji (zamiast wariantu); limity w werdykcie wyjaśnialnym; warstwa EAZ — K4 | Z-15, Z-19 |
| 12 Dynamika | technicznie wpięta, bez werdyktu | `DYNAMIKA_RMS` (`enm/canonical_analysis.py:560`), `api/dynamika.py`, `ui2/wyniki/dynamika`; oceny `NIE_OCENIONO`; obecność `UNVALIDATED_MODEL` w wyniku niewykazana; kursor czasu nie przenosi stanu na SLD | K8 (R08); walidacja modelu — poza UI |
| 13 Porównanie wariantów i dokumentacja z dowodami | częściowa | `api/comparison.py:196`, `ui2/wyniki/porownanie` (porównuje biegi, nie topologie); raport `analysis-runs/{id}/export/report/*`, dowody `export/proof/*`, `pakiet-dowodowy`; Dowody nie związane z oglądanym biegiem | Z-14, Z-19 → K8 |

Liczenie kroków: właściciel wymienił 12 kroków w treści i 13 punktów na liście (krok
„nowy rozpływ, limity, EAZ” jest osobno) — tabela ma wszystkie 13.

## 3. Dowody ponownego odbioru (10 przypadków)

Warunki: realny backend, operacja natywna, te same dane (ziarno odbiorowe z nazwami zgodnymi
z rodzajem i z rekordami aparatów, bez uproszczeń maskujących), okna 1440×900 i 1920×1080,
powłoka dodatkowo 1100×700 i 1180×780, oba motywy. Każdy przypadek: zrzut + operacja
użytkownika + test z asercją tożsamości elektrycznej.

| # | Przypadek | Operacja natywna | Test (asercja) |
|---|---|---|---|
| 1 | Cała sieć | „Dopasuj widok” w trybie roboczym | obwiednia ≥ 80% mniejszego wymiaru; widoczne NOP, rodzaje stacji, źródła, rodzaj przewodu (Z-01) |
| 2 | Sekcyjna → Końcowa | dwuklik sekcyjnej, „następna”, „Sieć” | zbiory widocznych refów = {cel}; kadry różne; powrót przywraca kamerę i zaznaczenie (Z-02, Z-04) |
| 3 | Pojedyncze pole SN | klik pola, „Dopasuj widok” | aparaty tylko z rekordów modelu, stany z modelu, rezerwa jako rezerwa, dalsze przyłączenie z nazwą (Z-05) |
| 4 | GPZ 2 sekcje / 3 TR | otwarcie GPZ | szyny WN = szyny modelu; sprzęgło z gałęzi; TR → sekcja z `lv_bus_ref`; bez tablic „brak” w geometrii (Z-06…Z-10) |
| 5 | Inspektor stacji | klik stacji | identyfikacja, rodzaj z podstawą, tabela pól, transformator, wyniki — parytet z ENM (Z-11, Z-12) |
| 6 | OZE/BESS | BESS 2,5 MW przez kreator SN z inspektora | tor w modelu (pole, TR blokowy, kabel), wkład w PF/SC, SLD rysuje BESS (Z-16) |
| 7 | Wyniki rozpływu | bieg PF, warstwy U/obciążenie | jeden `run_id` we wszystkich powierzchniach; skala i legenda; trzy stany (Z-14, Z-15) |
| 8 | Wyniki zwarcia | bieg SC 3F na wybranym węźle | miejsce zwarcia i wkłady na SLD, flaga świeżości, dowód tego samego biegu (Z-14, Z-15) |
| 9 | Zmiana wariantu | drugi przypadek z innym NOP | model bazowy ta sama rewizja; różne wyniki; porównanie (Z-19 — zależne od backendu sesji głównej) |
| 10 | Oba motywy | każdy z powyższych | kontrast ≥ 4,5:1 tekstu danych, barwy stanów rozróżnialne w obu motywach |

## 4. Kolejność wynikająca z zależności (bez nowej mapy drogowej)

Kolejność kart planu pozostaje; korekta dotyczy tego, że K3 (partia 1) musi być wykonana
przed ponownym odbiorem K2, a K4 R03 przed ponownym odbiorem kadru toru. Warunki backendowe
po stronie sesji głównej: model GPZ (Z-06, Z-10 — tryb B-01 architekta), operacja wyposażenia
pola (Z-18, W5-C), stany łączników w scenariuszu (Z-19, ADR-017).
