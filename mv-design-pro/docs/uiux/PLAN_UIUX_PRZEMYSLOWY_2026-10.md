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
