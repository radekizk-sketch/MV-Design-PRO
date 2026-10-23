# Rejestr 32 wzorców SEL Blueframe i adaptacji do MV-DESIGN PRO

Oznaczenia: **[SEL]** — potwierdzony opis producenta lub widoczny interfejs; **[WNIOSEK]** — inferencja, nie przypisywać producentowi; **[MV]** — propozycja wyłącznie dla naszego produktu. Podstawowe referencje: [galeria](GALERIA_I_FILMY.md), [interfejs SEL, punkty 1–6](https://selinc.com/software/distribution-management-system-dms/details/), [film PSM](https://video.selinc.com/support/detail/video/1740181918198970918/sel-dms%E2%80%94power-system-model-psm).

**GIS jest P3 (poza aktualną misją)** niezależnie od tego, że MDI jest wizualnie atrakcyjny. Nie zwiększać zakresu prac o mapy, importy i geografię.

## A — kanwa i edycja topologii (12)

| ID | Mechanizm | SEL: podstawa / niepewność | Adaptacja MV-DESIGN PRO | Priorytet |
|---|---|---|---|---|
| A01 | Widoczny uchwyt **+** | [SEL] screenshot SEL-01 + Autodirected Layout w opisie | [MV] uchwyt tylko w fizycznie dopuszczalnym `PortRef`/punkcie edycji | **P0** |
| A02 | Wybór elementu w punkcie przyłączenia | [SEL] opis producenta | [MV] lista operacji zależna od typu portu, poziomu napięcia i zajętości | **P0** |
| A03 | Automatyczna łączność | [SEL] opis producenta | [MV] atomowa operacja ENM, nie lokalne połączenie kresek SVG | **P0** |
| A04 | Automatyczne rozmieszczenie | [SEL] opis producenta | [MV] przyrostowy layout już istniejącej projekcji `SldCanvasV3`, zachowanie kadru | **P0** |
| A05 | Kontynuacja i rozbudowa odcinka | [SEL] edytor tworzy i łączy węzły; konkretny gest niepotwierdzony | [MV] oddzielić „kontynuuj z końca” od „wstaw w środek odcinka” | **P0** |
| A06 | Dozwolone typy i blokady | [WNIOSEK] mechanizm autodirected layout sugeruje filtrowanie | [MV] resolver zgodności i wolnych portów, powód niedostępności przed kreatorem | **P0** |
| A07 | Zaznaczenie elementu i panel | [SEL] niebieskie zaznaczenie i właściwości po prawej | [MV] ta sama tożsamość ENM w selekcji, drzewie, inspektorze i wynikach | **P0** |
| A08 | Przybliżanie i przesuwanie | [SEL] narzędzia widoczne na zrzucie | [MV] zachować istniejącą kamerę, LOD i menu skrótów | P1 |
| A09 | Kanwa kontekstowa stacji/ciągu | [SEL] producent mówi o dedykowanych kanwach ciągów | [MV] osobne projekcje SN oraz nN jednej sieci, portal SN→nN | **P0** |
| A10 | Konfiguracja na rysunku | [SEL] opis producenta | [MV] uruchomienie istniejącej operacji i inspektora bez przełączania ekranu | **P0** |
| A11 | Szkic → zatwierdzenie lub porzucenie | [SEL] Draft/Publish All/Discard Draft widoczne | [MV] wariant projektu, zapis i porównanie; bez komend do rzeczywistej sieci | P1 |
| A12 | Cofnij/ponów | [SEL] widoczny symbol cofnięcia; ponów niepotwierdzone | [MV] wersjonowane operacje ENM, nie lokalna geometria | P1 |

## B — inspektor, nawigacja i jakość danych (8)

| ID | Mechanizm | SEL: podstawa / niepewność | Adaptacja MV-DESIGN PRO | Priorytet |
|---|---|---|---|---|
| B01 | Drzewo hierarchii systemu | [SEL] screenshot SEL-01, opis „System Hierarchy” | [MV] GPZ → sekcja SN → pole → ciąg → stacja → zaciski i nN | **P0** |
| B02 | Wyszukiwanie obiektu | [SEL] ikona szukania, opcja Search | [MV] jeden indeks po nazwie, typie, numerze; centrowanie SLD | P1 |
| B03 | Stały inspektor obiektu | [SEL] Properties, pola i urządzenie | [MV] techniczne właściwości z katalogu, powiązania, rewizje, źródła danych | **P0** |
| B04 | Groups | [SEL] zakładka widoczna; zachowanie nieustalone | [MV] opcjonalne grupy analityczne bez nowej topologii | P2 |
| B05 | Panel walidacji pod kanwą | [SEL] Validation (0), opis aktywnej walidacji | [MV] jedna lista błędów ENM/gotowości/katalogu i skok do elementu | **P0** |
| B06 | Jawny status elementu | [SEL] In Service, Enabled | [MV] stan łącznika ≠ gotowość ≠ stan danych ≠ telemetria | **P0** |
| B07 | Ustawienia początkowe | [SEL] producent podaje „default settings” | [MV] nigdy nie fabrykować parametrów elektrycznych; brak parametru = jawne NIEUSTALONE | **P0** |
| B08 | Kopiowanie parametrów | [SEL] opis MDI przewiduje copy/paste | [MV] kopiowanie zgodnych danych katalogowych między aparatami bez kopiowania ich ID | P1 |

## C — import danych i szablony (5)

| ID | Mechanizm | SEL: podstawa / niepewność | Adaptacja MV-DESIGN PRO | Priorytet |
|---|---|---|---|---|
| C01 | Import GIS/GeoJSON/CIM | [SEL] MDI, film V10 | [MV] przyszły import do ENM z walidacją tożsamości; **nie wdrażać teraz** | **P3 / STOP** |
| C02 | Mapowanie atrybutów GIS | [SEL] SEL-02 i opis MDI | [MV] przyszłe typowanie źródła i atrybutów; **nie wdrażać teraz** | **P3 / STOP** |
| C03 | Wskazanie źródła danej | [SEL] „mapped source” i „user-defined” | [MV] pokazuj katalog / import / decyzja projektanta / wartość robocza na istniejących formularzach | **P0** |
| C04 | Instancje szablonów | [SEL] filmy V05/V07 | [MV] istniejący katalog stacji/pól → niezależna instancja ENM; bez konfiguracji DNP3 | P2 |
| C05 | Aktualizacja danych z GIS | [SEL] producent opisuje aktualizację systemu z GIS | [MV] przyszły import różnicowy, konflikt tożsamości; **nie wdrażać teraz** | **P3 / STOP** |

## D — analiza, porównania, raporty (7)

| ID | Mechanizm | SEL: podstawa / niepewność | Adaptacja MV-DESIGN PRO | Priorytet |
|---|---|---|---|---|
| D01 | Symulator bez ingerencji w sieć | [SEL] film V02 i opis producenta | [MV] hipotetyczny wariant sieci i obliczenia, nigdy rzeczywisty rozkaz łączeniowy | P1 |
| D02 | Jedna topologia w wielu widokach | [SEL] PSM → widok FLISR po wdrożeniu | [MV] ta sama scena SLD V3, różne nakładki obliczeniowe | **P0** |
| D03 | Kolorowe sygnały stanów | [SEL] FLISR status indicators | [MV] nakładki oparte na wynikach solvera, bez udawania SCADA | P1 |
| D04 | Stan przed/po | [SEL] raport diagramów stanów | [MV] porównanie dwóch rewizji/konfiguracji ENM, z wynikami i zmianą topologii | P1 |
| D05 | Sekwencja przełączeń | [SEL] Control Sequence Plan w raporcie FLISR | [MV] wyłącznie symulowana sekwencja operacji projektu i kontrola topologii | P1 |
| D06 | Raport zdarzeń i porównań | [SEL] raporty automatyczne | [MV] pakiet dowodowy model+wyniki+założenia+wersja normy | P2 |
| D07 | Bieżące sterowanie urządzeniami | [SEL] FLISR/DNP3/SCADA | [MV] poza zakresem narzędzia projektowego; nie wdrażać | ODRZUCONA |

## Kolejność i dowody

- **P0, obowiązkowo:** A01–A07, A09–A10, B01/B03/B05–B07, C03, D02; testy T+01…T+05 i kontrola aktualności wyników.
- **P1:** warianty i nawigacja, pomocnicze interakcje, analiza przełączeń **wyłącznie w modelu projektu**.
- **P2:** lepsze katalogi/szablony i raportowanie, tylko po P0.
- **P3:** GIS i geografia odłożone; opis zachowany, **zero implementacji bez osobnego polecenia właściciela**.
- Ocena każdej pozycji: (1) czy pokazana w źródle, (2) czy ma odpowiednik w repo, (3) czy użytkownik wykona realną operację, (4) czy wynik pochodzi z backendu, (5) czy test i dowód E2E istnieje.

## Ograniczenie badań

Odczytano oficjalne strony SEL, oficjalne opisy wskazanych filmów i udostępniony zrzut. **Nie uzyskano strumieni filmowych umożliwiających pełny audyt klatka-po-klatce**, dlatego nie wolno podawać wymyślonych znaczników czasu ani prezentować wniosków UX jako dosłownie stwierdzonego działania SEL.
