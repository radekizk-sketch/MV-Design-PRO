# Plan programu UIUX-PRZEMYSLOWY (2026-10-16)

Status: plan wykonawczy kontraktu `docs/uiux/KONTRAKT_UIUX_PRZEMYSLOWY_2026-10.md` (wiążący).
Prowadzący: sesja główna programu. Materiał dowodowy pomiarów i wzorców:
`docs/uiux/przemyslowy/` — `WZORCE_ZRODLA.md` (materiały producentów z cytowanymi źródłami,
oznaczenia [F] fakt źródłowy / [I] interpretacja), `POMIAR_POWLOKA.md`, `POMIAR_SLD.md`,
`POMIAR_KREATOR_INSPEKTOR.md`, `POMIAR_WYNIKI_E2E.md` (pomiar kodu z `plik:linia`, stan drzewa
po scaleniu karty W5-B, commit `a16835bc`). Ścieżki kodu poniżej od `frontend/src`, chyba że
podano `backend/`.

## 1. Macierz WZORZEC → PROBLEM → ROZWIĄZANIE → DOWÓD (kontrakt §1)

| # | Wzorzec (źródło w `WZORCE_ZRODLA.md`) | Problem w MV-DESIGN-PRO (pomiar) | Rozwiązanie | Dowód działania |
|---|---|---|---|---|
| M1 | Pasek studium ETAP (uruchom, alerty, raport, opcje wyświetlania) [ETAP-WS]; Study Case toolbar PF [PF-DM] | Pięć poziomych pasów nad kanwą: `ui2/shell/TitleBar.tsx`, `CaseBar.tsx`, `ui/shell/WorkflowContextStrip.tsx`, `PrzelacznikPodgladu.tsx`, `NastepnyKrokSchematu.tsx`; gotowość pokazana w 7 miejscach; „Kontrola” 2× w jednym pasku | Trzy pasy: pasek projektu (nazwa, przypadek, świeżość wyników, Oblicz ze stanem), pasek narzędzi przestrzeni, pasek stanu; liczniki modelu w panelu na żądanie | e2e 1440×900: pełne nazwy poleceń, brak poziomego przewijania, nazwa projektu nieprzysłonięta (pomiar `getBoundingClientRect`) |
| M2 | — (defekt CSS) | „Widok” przykrywa nazwę projektu: klasa `.mvd-menu` zdefiniowana dwukrotnie — `ui2/shell/shell.css:87` (`relative`) i `ui2/spaces/obliczenia/przypadki.css:354` (`fixed`) | Selektory modułowe bez kolizji + strażnik zdublowanych selektorów globalnych | test strażnika + e2e geometrii paska |
| M3 | Tryby Edit/Study ETAP — tryb zmienia funkcję, nie zasłania kontrolek [ETAP-WS] | Tryby Podstawowy/Rozszerzony/Ekspercki tylko ukrywają kontrolki; „Rozszerzony” ma 0 konsumentów różnicujących | Jedno rozwiązanie kontekstowe: tryb pracy Edycja/Podgląd przestrzeni + przełącznik „Szczegóły audytowe” | vitest konsumentów; brak trzech trybów w DOM |
| M4 | Okna dokowane, widoki dzielone PF [PF-NDG] | Panel dolny jest atrapą („zawartość w kolejnym kroku”, `ui2/shell/AppShell.tsx:285-312`); inspektor 280–560 px domyślnie 320 i zwinięty | Panele regulowane: lewy 220–260 (domyślnie 240), inspektor 340–420 (domyślnie 360), dolny z treścią: Problemy (gotowość backendu), Wyniki (tabela elementów), Przebiegi, Dziennik operacji | e2e: przeciąganie krawędzi natywnie, zapis rozmiarów, treść zakładek z backendu |
| M5 | Design View / Detailed stacji PF [PF-NMD §2.1.2]; nawigacja między reprezentacjami elementu [PF-NMD] | Brak kadru stacji/sekcji/pola/magistrali/toru — tylko „treść” i „arkusz” (`ui/sld/v3/canvas/SldCanvasV3.tsx:2419-2436`); kotwica nigdy nie przybliża (`camera.ts:446`); dwuklik stacji tylko na L0 i tylko nN | Cele kadrowania: sieć, magistrala, stacja, sekcja szyn, pole, tor; kotwica z przybliżeniem do zakresu; dwuklik stacji → wnętrze stacji z kadrem stacji | vitest kamery + e2e natywny dwuklik/klik → kadr zawiera prostokąt elementu |
| M6 | Auto-Build z regułami odstępów ETAP [ETAP-SLD]; Diagram Layout Tool PF [PF-NMD §2.1.1] | Pasma wysokości wspólne dla wiersza arkusza (`ui/sld/v3/layout/bands.ts:184-185`) → pustka pod stacją; pola liniowe zawsze z głowicą kablową (`compose/apparatusSequence.ts:83-91`) — wolne pole wygląda jak czynne; stacja sekcyjna z jedną szyną (`compose/station.ts:1569-1578`) | Pasma per stacja; sylwetka pola rezerwowego (z modelu: brak przyłączonego odcinka); sekcje szyn i sprzęgło w stacji z modelu `Bay` jak w `compose/gpz.ts` | testy kontraktowe sceny (sekcje, wolne pole, wysokość bloku) + zrzuty |
| M7 | Datablocks ETAP (dane + wyniki, szablony, auto jednostki/precyzja, widoczność wg zoomu) [ETAP-SLD]; Result Box PF [PF-FAQ] | Etykiety wyników: stała kolejność, brak wyboru zestawu, brak zapisu (`canvas/resultLabelTemplates.ts`, `layers.ts:26-55`) | Bloki danych per rodzaj elementu (kabel, TR, źródło, węzeł) z wyborem wielkości, zapisem zestawu użytkownika, wartości z modelu i wyników backendu | vitest rejestru bloków (zero arytmetyki fizycznej, guard `ui_no_physics`) + e2e zmiany zestawu |
| M8 | Kolorowanie PF wg napięcia/obciążenia z legendą [PF-NMD §2.3–2.4] | Zieleń przewodów bez wyniku: energizacja liczona przeszukiwaniem grafu we froncie (`ui/sld/v2/canvas/SupplyPathHighlighter.ts:106-190`), zawsze włączona; brak/nieaktualny/zero nierozróżnialne | Warstwy tematyczne: struktura, rozpływ, napięcia, obciążenie, zwarcia, zabezpieczenia, stan łączeniowy, problemy; skala i legenda; trzy stany (brak / nieaktualny / zero); stan zasilania wyłącznie z backendu (`enm/topology.derive`) | vitest warstw + e2e: przed obliczeniem brak barw wynikowych |
| M9 | Wyszukiwanie topologiczne/oznaczanie w grafice PF, nawigator urządzeń EPLAN [PF-NDG], [EPL-NAV] | Brak toru źródło→element w v3; backend `enm/topology.py:134 derive` niewystawiony w API | Endpoint toru i zasilenia z `derive` (stany łączników, wiele źródeł, „nierozstrzygnięte” jawnie); podświetlenie toru i nawigacja poprzedni/następny/pole/stacja/EAZ/wyniki | pytest endpointu + e2e zaznaczenie pola → tor |
| M10 | Element dialog PF z kartami / property editor ETAP [PF/ETAP — częściowo niepotwierdzone] | 7 równoległych inspektorów; przy zaznaczeniu działa `ui/network-build/InspectorEngineeringView.tsx` (3409 linii) przez `ui2/legacy/LegacyInspektor.tsx:37-38`; cofanie lokalne (`ui/history/HistoryStore.ts`), przyciski ukryte | Jeden inspektor z zakładkami Dane, Katalog, Połączenia, Zabezpieczenia, Wyniki, Dowody; zapis operacjami domenowymi; cofnij/ponów jako operacje domenowe na rewizjach ENM | e2e: SLD/drzewo/tabela/gotowość wskazują ten sam obiekt; cofnięcie przywraca rewizję w backendzie |
| M11 | Type Library PF, biblioteka ETAP, przełączana hierarchia artykułów EPLAN [EPL-BOM] | Domyślny aparat pola = najsłabszy z listy dowolnego producenta (`ui2/kreatory/stacja/stacjaModel.ts:965-975`); `allowed_apparatus_kinds` rodziny (`backend/.../switchgear_family.py:164`) nieużywane; brak filtrów `/mv-apparatus-types`; „FABRYCZNE” znaczy tylko „należy do szablonu” | Selektor katalogowy: filtry producent/rodzina/U_r/I_r/rodzaj/funkcja/zdolność zwarciowa/źródło; porównanie 2–3 wariantów; zgodność z konfiguracją z backendu; domyślne aparaty z rodziny rozdzielnicy | pytest filtrów i reguł + e2e zmiany aparatu |
| M12 | Network Model Manager PF — tabele z sortowaniem, filtrowaniem, edycją grupową [PF-DM] | Brak tabeli pól w kreatorze; brak tabeli wyników elementów przy SLD | Tabela pól (nr, rola, typ, aparat, U_r, I_r, zdolność, zgodność, działania) i tabela wyników w panelu dolnym | e2e: wiersz → podświetlenie pola na schemacie |
| M13 | ETAP Star: wykresy z opcjami i zapisem, sekwencja powiązana ze schematem [ETAP-OC], [ETAP-SQOP] | 11 wykresów, eksport 0/11; wykresy zwarciowe bez osi z jednostkami, legend, granic | Wspólna rama wykresu: osie z jednostkami, legenda, granice, eksport PNG/CSV, punkt → element | vitest ramy wykresu |
| M14 | — (kontrakt §6 UI-19) | Dowód: Wzór → Dane → Podstawienie → Wynik → Uwagi, bez sekcji A/B/C/D | Układ A dane wejściowe, B wzory i model, C podstawienie i wyniki pośrednie, D wynik/ograniczenia/weryfikacja, z `*_latex` przez `MathRenderer` | vitest układu dowodu |

Wzorce niepotwierdzone źródłowo (lista w `WZORCE_ZRODLA.md`, sekcja „Niepotwierdzone”) nie są
argumentem — tam rozwiązanie wynika z pomiaru kodu i zadania projektanta. Rozróżnienie wyniku
nieaktualnego od braku wyniku nie ma wzorca źródłowego i jest projektowane od zadania (M8).

## 2. Wykaz wad 15 ekranów W5-B (kontrakt §7) z przyczyną w kodzie

| Ekran | Zrzut „przed” (`docs/audit/visual/w5b/po/`) | Wada | Przyczyna (pomiar) | Karta |
|---|---|---|---|---|
| W5-UI-01 Kreator: szablon | `kreator-stacji-szablon-*` | Opisy dominują nad wyborem; dziewięć kroków w dwóch rzędach | `ui2/kreatory/stacja/KreatorStacjiSnNn.tsx` `KROKI` :163-173, nagłówek z akapitem opisu | K5 |
| W5-UI-02 Kreator: pola | `kreator-stacji-pola-*` | Lista rozwijana aparatu, opisy zamiast parametrów, „FABRYCZNE” przy każdej pozycji | `aparatyDlaPola`/`aparatDomyslnyRoli` (`stacjaModel.ts:965`, `KreatorStacjiSnNn.tsx:705`); `backend/.../apparatus_vocabulary.py:100-107` | K5 |
| W5-UI-03 Kreator: podgląd | `kreator-stacji-podglad-*` | Opis operacji zamiast zestawienia skutków; odświeżanie tylko w kroku „pola”; błąd = „INVALID” bez przyczyny | `stacjaPodglad.ts:70-86`, `KreatorStacjiSnNn.tsx:1127-1160`, `:2552` | K5 |
| W5-UI-04 Cała sieć | `pola-w-torze-siec-*` | Kadr całej sieci z etykietami, brak widoku przeglądowego vs szczegółowego | dopasowanie „treść” = bbox całej sceny (`SldCanvasV3.tsx:2283-2318`) | K2 |
| W5-UI-05 Stacja przelotowa | `pola-w-torze-przelotowa-*` | Pustka, ramka z tras magistrali, pola F01–F04 „w powietrzu” | pasma wiersza (`layout/bands.ts:184-185`), pola zawsze z głowicą (`compose/apparatusSequence.ts:83-91`), kadr kółkiem w specu | K2, K3 |
| W5-UI-06 Stacja odgałęźna | `pola-w-torze-odgalezna-*` | Tor główny i odgałęzienie nierozróżnione | brak warstwy toru (`buildScene.ts:4538-4647` tylko kanały) | K3, K4 |
| W5-UI-07 Stacja sekcyjna | `pola-w-torze-sekcyjna-*` | Sprzęgło jak zwykłe pole z jednej sekcji | jedna szyna stacji `#sn-bus` (`compose/station.ts:1569-1578`) | K3 |
| W5-UI-08 Stacja końcowa | `pola-w-torze-koncowa-*` | Wolne pole wygląda jak czynne wyprowadzenie | brak sylwetki pola rezerwowego (grep: 0) | K3 |
| W5-UI-09 Kreator bez pola TR | `kreator_stacja_pola_bez_pola_tr_*` | Powtarzane ostrzeżenia; naprawa dokłada pole z wadliwym aparatem; brak w RMU; spec na harnessie | `stacjaModel.ts:745`, `:927-942`, `KreatorStacjiSnNn.tsx:1977`; `e2e/kreator-stacji-pole-tr-screenshot.spec.ts:61-75` | K5, K9 |
| W5-UI-10 Domyślne pola | `kreator_stacja_pola_domyslne_*` | Niekompatybilne domyślne aparaty | filtr U_n i rodzaju bez rodziny/producenta/I_r/Ik | K5 |
| W5-UI-11 Warianty aparatu | `kreator_stacja_pola_warianty_aparatu_*` | Brak porównania; bezpiecznik jako zamiennik wyłącznika | `backend/.../bay_templates.py:215` — tylko rodzaj aparatu | K5 |
| W5-UI-12 Drzewo | `rodzaj_stacji_po_drzewo_*` | „Stacja …”, „Pole lin…” ucinane; brak wyszukiwania tekstowego | `ui2/nav/tree.css:130-133`, `ContextTree.tsx:321`, `treeFilters.ts:43-52` | K7 |
| W5-UI-13 Gotowość | `rodzaj_stacji_po_gotowosc_*` | „Postęp 100%” przy ostrzeżeniach; grupowanie po celu, nie po elemencie; „Napraw…” nie prowadzi do parametru | `ui2/spaces/gotowosc/PanelGotowosci.tsx:524-528`, `grupowanieCelow.ts`, `akcjeNaprawcze.ts:428-535` | K7 |
| W5-UI-14 Schemat z gotowości | `rodzaj_stacji_po_schemat_*` | Klik problemu nie przełącza na schemat i nie kadruje | `ui2/AppRoot.tsx:381-386`, kotwica bez przybliżenia, ponowne wskazanie bez kadru (`SldCanvasV3Workspace.tsx:2140-2147`) | K2, K7 |
| W5-UI-15 Widok stacji | `rodzaj_stacji_po_stacja_*` | Stacja nie dominuje, ucięte fragmenty sąsiadów | brak kadru stacji; zrzut przybliżany kółkiem (`e2e/etykieta-stacji-zrzuty.spec.ts:69-98`) | K2, K9 |

## 3. Karty i zależności

Zasady wspólne kart: SldCanvasV3 jedynym rendererem; zero fizyki w UI (`ui_no_physics_guard`,
`overlay_no_physics_guard`); bez atrap katalogowych i wartości zastępczych; zapis wyłącznie
operacjami domenowymi ENM; kontrakty FROZEN i rdzenie solverów nietknięte; determinizm zrzutów;
nowe testy interakcji natywnym klikiem; typografia danych roboczych ≥ 13 px, bez kapitalików
i rozstrzelenia w plikach karty (§8); jeden zestaw tokenów (`ui2/theme/tokens.css`).

Partia 1 (niezależne zbiory plików):
- **K1 POWLOKA** — UI-01, UI-02, UI-03, §8 tokeny, §9 zachowanie powłoki. Pliki: `ui2/shell/**`,
  `ui/shell/**`, `ui2/theme/**`, `index.css`, `tailwind.config.js`, `ui2/legacy/Legacy{Chrome,
  PasekNarzedzi,Warsztat}.tsx`, `ui2/AppRoot.tsx` (część powłoki).
- **K3 GEOMETRIA-STACJI** — UI-05, W5-UI-05/07/08. Pliki: `ui/sld/v3/{layout,compose,scene}/**`.
- **K5 KREATOR-STACJI** — UI-09…UI-13, W5-UI-01/02/03/09/10/11. Pliki: `ui2/kreatory/**`,
  backend `api/catalog.py` (filtry), katalog aparatów (odniesienie do rodziny), reguły zgodności
  aparatu z rolą i rodziną w warstwie aplikacji.
- **K6a TOPOLOGIA-API** — backend: endpoint zasilenia i toru z `enm/topology.derive` (UI-08, §8).

Partia 2 (po partii 1):
- **K2 KADROWANIE-NAWIGACJA** — UI-04, UI-08 (front), W5-UI-04/14/15: cele kadru, dwuklik
  stacji, tor na schemacie, nawigacja po torze. Pliki: `ui/sld/v3/canvas/**`, `SldCanvasV3Workspace.tsx`.
- **K4 BLOKI-WARSTWY** — UI-06, UI-07, §8 barwy wynikowe: bloki danych, warstwy tematyczne,
  legenda/skala, trzy stany, energizacja z backendu (kasacja `SupplyPathHighlighter` jako źródła
  zasilania).
- **K6 INSPEKTOR** — UI-14, UI-15, UI-16: jeden inspektor, cofnij/ponów operacjami domenowymi,
  kopiowanie konfiguracji pola SN, edycja grupowa.
- **K7 DRZEWO-GOTOWOSC** — W5-UI-12/13/14.
- **K8 WYNIKI** — UI-17, UI-18, UI-19: tabela wyników w panelu dolnym, rama wykresów, dowód A–D.

Partia 3:
- **K9 WERYFIKACJA** — §10 testy 1–8 (e2e natywne, realny backend, 4 rozdzielczości × 2 motywy ×
  inspektor), zrzuty przed/po 15 ekranów w tych samych warunkach (W5-UI-09…11 przeniesione
  z harnessu na realny backend), audyt ekspercki §11, `MELDUNEK_UIUX_PRZEMYSLOWY.md`.

Meldunki pośrednie po każdej scalonej partii: `MELDUNEK_UIUX_PRZEMYSLOWY.md` w katalogu głównym
`mv-design-pro/`.

## 4. Uzupełnienia kart z recenzji SLD i systemu (2026-10-21)

Źródło: recenzja na `9d5168ea3` (PR #484, `docs/audit/MV_DESIGN_PRO_RECENZJA_SLD_SYSTEMU_2026-10-20.md`
na gałęzi `codex/raport-sld-systemu-2026-10-20`), punkty sprawdzone w kodzie przez sesję główną.
Odbiór każdego punktu: natywny klik, realny backend, zrzuty.

- **K2 (R02, front)** — poziom „stacja SN” w nawigacji sieć → stacja → pole z powrotem do kadru sieci;
  ocena i przejęcie trafnych części PR #483 (`1024eb1e`: lista stacji w porządku magistrali,
  poprzednia/następna stacja, kadr L2). Realizowane w partii 2026-10-21.
- **K1/K8 (R01)** — przebieg sieć → stacja → rozpływ → wyniki → dowód bez utraty SLD, selekcji i kadru;
  wynik i inspektor wskazują tę samą referencję. Panel dolny (Wyniki, Dowody) realizowany w partii
  2026-10-21; TCC i wywód — K8.
- **K3 (adapter)** — `ui/sld/v2/canvas/enmToSldAdapter.ts` ~4282–4284 zaszywa `cbState:'closed'`,
  `dsState:'closed'`, `esState:'open'` dla pól DER bez danej ENM; mapowanie `bay_role 'OZE'` → `DER_PV`
  (~4569) rysuje pole BESS bez `meta.field_role` jako PV. Stan z ENM albo jawnie nieznany; rodzaj
  źródła z modelu.
- **K4 (R03)** — zasilenie liczone BFS-em klienta (`SldCanvasV3Workspace.tsx` ~573/587 →
  `ui/sld/v2/canvas/SupplyPathHighlighter.ts:106`), bez stanu „nieznany”, transformatory przechodzone
  zawsze, aparaty/TR/DER poza nakładką. Przepięcie na `ui2/adapters/topologiaZasilenia.ts` (K6a),
  kasacja BFS jako źródła zasilenia, kolor opisany jako stan topologiczny (nie napięcie), stan
  nierozstrzygnięty widoczny.
- **K4 (R04)** — strzałki rozpływu i zwarć (`SldCanvasV3.tsx` ~3369–3392, `flowPlacements` ~2640) nie
  reagują na `resultsStale` (flaga działa tylko na etykiety i baner ~3415–3432); etykiety TR
  (`canvas/resultLabelTemplates.ts:193`) bez P, Q, I i kierunku. Każda widoczna warstwa wyniku
  (etykiety, strzałki PF/SC, OLTC, różnice) z flagą świeżości niezależną od widoczności etykiet; test
  iloczynu: zmiana kabla × łącznika × wariantu × kombinacje warstw.
- **K6 (R02, P13)** — selekcja globalna przekazuje do inspektora `id`/ownerRef zamiast `deviceRef`
  (Workspace ~2599): klik aparatu nie prowadzi do tego samego aparatu w inspektorze ui2.
- **K8 (R08)** — `ui2/wyniki/dynamika/WykresPrzebiegow.tsx:103–170` ma tylko `syncId`; kursor czasu ma
  przenosić stan aparatów i liczby z tego samego przebiegu na SLD, z rozróżnieniem próbek przed i po
  zdarzeniu.
- **K5** — edycja wyposażenia pola (`KreatorPolaSn.tsx:438` `BEZ_DOPOSAZENIA`) wymaga operacji domenowej
  w backendzie; jej zakres zgłasza meldunek karty K5 (backend operacji łączników W5-C oraz wytrzymałość
  aparatury i CT prowadzi sesja główna).

## 5. Korekty kart po decyzji właściciela 2026-10-21 (UI-01/02/04 nieprzyjęte) — do rozpatrzenia

Źródło i dowody (`plik:linia`, pomiar pikseli zrzutów, sondy kodu i modelu ENM):
`docs/uiux/ANALIZA_ODRZUCENIA_UI01_UI02_UI04_2026-10-21.md` (wady Z-01…Z-21, scenariusz 13 kroków,
10 przypadków ponownego odbioru). Bez nowych kart i bez nowej mapy drogowej — poniżej wyłącznie
korekty zakresu, kolejności i kryteriów odbioru istniejących kart. Status: propozycja do
rozpatrzenia przez właściciela; B-02 pozostaje odrzucone.

**Kolejność (korekta §3).** K3 była w partii 1 i nie została wykonana, a K2 z partii 2 ją wyprzedziło.
Ponowny odbiór K2 następuje dopiero na geometrii K3; K4 R03 (zasilenie z backendu) przed ponownym
odbiorem kadru toru.

**Kryterium wspólne wszystkich kart rysunku (K2, K3, K4, K9).** Odbiór mierzy tożsamość elektryczną,
nie tylko geometrię: zbiór widocznych `ownerRef` porównywany ze zbiorem oczekiwanym z modelu ENM;
rozróżnialność kadrów różnych celów; zero elementów rysowanych bez rekordu w modelu (aparat bez
danych = jawna sylwetka „brak danych”, nie aparat z konwencji); licznik ukrytych opisów celu = 0.
Fikstury odbiorowe mają nazwy zgodne z rodzajem wyprowadzonym z topologii (albo neutralne
oznaczenia) i rekordy aparatów.

- **K1** — prawy inspektor: przeciąganie 340–420 px zgodnie z kontraktem UI-02; 560 px wyłącznie jako
  jawne, odwracalne polecenie dla tabel albo usunięte (decyzja właściciela) (Z-13).
- **K2** — (a) tryb widoku kanwy „roboczy / arkusz” w tym samym `SldCanvasV3`: w trybie roboczym bez
  ramy, pól odniesienia i tabliczki, kadr z treści bez marginesu ramy; arkusz i eksport bez zmian;
  progi LOD i grubości tak, by w kadrze całej sieci przewód ≥ 2 px, etykieta stacji ≥ 13 px (Z-01);
  (b) kadr stacji kadruje wyłącznie stację, bez wchłaniania sąsiadów (`camera.ts:889`), bez zejścia
  poniżej LOD 2, udział celu ≥ 70% mniejszego wymiaru; sąsiad tylko, gdy elektrycznie wymagany —
  lista przypadków w karcie (Z-02); (c) wpis historii = kamera + LOD + ścieżka + zaznaczenie; „Sieć”
  wraca do wpisu sprzed wejścia; przegląd stacji poprzednia/następna = jeden wpis powrotu (Z-04).
- **K3** — wykonanie karty z partii 1, uzupełnione o: sekcje szyn stacji SN/nN z `bus_refs` i pól,
  sprzęgło jako łącznik między sekcjami ze stanem z modelu, kadr „sekcja” dla stacji wielosekcyjnej
  (Z-03); sprzęgło GPZ i stacji z JEDNEGO źródła — gałęzi `bus_coupler` (Z-07); szyna WN rysowana
  wyłącznie z szyn modelu (Z-06c); aparaty pól i wież TR tylko z rekordów modelu, sylwetka pola
  rezerwowego z `field_status`, wyróżnienie zaznaczenia niezależne od barwy roli, odpływ w kadrze
  pola zakończony nazwą celu (Z-05, Z-08); rodzaj odcinka (kabel/napowietrzna) w meta segmentu (Z-01).
  Warunki backendowe po stronie sesji głównej: topologia operacji GPZ — jedna szyna WN wspólna dla
  transformatorów zgodnie z kanonem `gpz_hv_sections`, źródło 110 kV na tej szynie, rozstrzygnięcie
  roli transformatorów przy źródle zastępczym 15 kV (Z-06a/b, tryb B-01 architekta: zmiana wyników
  obliczeń); jedna reguła nazwy domyślnej pól GPZ z numerem sekcji (Z-10).
- **K4** — warstwy per wielkość (U, I, P/Q z kierunkiem, obciążenie z barwą i skalą, ΔU, straty,
  zwarcie: miejsce i wkłady, przekroczenia, strefy EAZ), każda z flagą świeżości i trzema stanami;
  `ProtectionZoneMarker` wpięty w kanwę v3 albo skasowany na rzecz warstwy v3 (Z-15); na LOD 0 warstwa
  struktury z NOP, stanem łączników sekcyjnych, rodzajem stacji, źródłami OZE (Z-01); blok wyników GPZ
  poza geometrią ramy schematu, zwijany, bez wyniku jeden wiersz (Z-09); R03 bez zmian zakresu,
  przed ponownym odbiorem K2 (Z-17).
- **K5** — bez zmian zakresu; operacja domenowa wyposażenia pola zgłoszona sesji głównej z zakresem:
  `set_bay_equipment(bay_ref, devices)` z walidacją rodziny rozdzielnicy i U_r/I_r/I_k (Z-18, W5-C).
- **K6** — karta techniczna per rodzaj elementu; dla stacji: identyfikacja z rodzajem z topologii
  i jego podstawą, rozdzielnica SN (sekcje, tabela pól z aparatem, U_r, I_r, zdolnością, stanem,
  zabezpieczeniem/CT), transformator z katalogu, strona nN, przyłączenia, wyniki ze świeżością;
  działania na końcu (Z-11, Z-12); formularz OZE jawnie „po stronie nN”, przycisk otwierający
  `KreatorZrodlaOze` z preselekcją w miejscu komunikatu, BESS z pakietem baterii albo przez kreator,
  tryb regulacji widoczny (Z-16).
- **K7** — wiersz drzewa: nazwa (oznaczenie) przed rodzajem, ucinany tylko rodzaj (Z-21).
- **K8** — jeden magazyn kontekstu wyniku {case_id, run_id, rodzaj analizy, rewizja modelu biegu,
  input_hash} dla paska stanu, panelu dolnego, nakładki SLD, ekranów pełnych i Dowodów; świeżość
  z jednego predykatu; pasek pokazuje bieg oglądany (Z-14); klik wiersza każdego ekranu pełnego
  zaznacza i kadruje element na SLD (Z-15); porównanie przypadków o różnym NOP po wdrożeniu stanów
  łączników w `OperatingScenario` przez sesję główną (ADR-017 warstwa SCENARIO, Z-19).
- **K9** — kryterium wspólne powyżej; 10 przypadków ponownego odbioru z analizy §3 (zrzut + operacja
  natywna + test), okna 1440×900 i 1920×1080, powłoka 1100×700 i 1180×780, oba motywy; iniekcje
  wchłaniania sąsiada, jednej szyny stacji D i wspólnej szyny WN muszą być czerwone (Z-20).
