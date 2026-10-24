# MV-DESIGN PRO — nN / program biblioteki CAD / źródła i odbiór 2026-10-24

> **Werdykt właścicielski:** 1/10, biblioteka odrzucona. **B-02 odrzucone.**
> Nowy PR dotyczy wyłącznie technicznie sprawdzalnego potoku źródło → geometria → porty → atlas.
> **Nie oznaczać tego pakietu jako „pełna biblioteka” ani jako IEC-NORMATIVE-VERIFIED.**

## 1. Stan zastany repo (main)

- `frontend/src/ui/sld/v3/cad/cadSymbolRegistry.ts`: 20 kanonicznych definicji CAD;
  `CadSymbol.tsx`: renderer prymitywów i stanów.
- `frontend/src/ui/sld/v3/lv-domain/symbolRegistry.ts`: mapowanie typu urządzenia ENM na glif.
- `LvDomainProjectionV1` i `LvDomainView`: osobna, atomowo wersjonowana projekcja nN;
  `SldCanvasV3`: projekcja SN. Nie wprowadzać trzeciej kanwy produkcyjnej.
- PR #498: poprzedni atlas, **odrzucony 1/10**, nie służy jako źródło prawdy.

## 2. Zweryfikowane biblioteki źródłowe — ocena techniczna

| Źródło | Rzeczywiste zasoby / mechanizm | Licencja | Użycie i ograniczenie |
|---|---|---|---|
| [QElectroTech elements](https://github.com/qelectrotech/qelectrotech-elements) | Pliki `.elmt` z geometrią źródłową, `terminal`, etykietami PL, różnymi formami IEC i aparatury | Kolekcja CC BY 3.0, wyraźny zakaz treningu ML; oryginalny plik `ELEMENTS.LICENSE` | **Główna baza kandydatów**; każda geometria i mapa portów pozostaje DRAFT, nie jest IEC certyfikowana |
| [SynergyCodes ng-diagram-single-line-diagram](https://github.com/synergycodes/ng-diagram-single-line-diagram) | `src/tools/build-symbols.mjs`, konwerter `.elmt`→SVG/typowany rejestr, podział korpusu i odcinków przyłączeniowych, siatka | kod MIT, oryginalne glify QET CC BY | **Wzorzec architektury importu**, lecz dostarczony zestaw `symbols.config.mjs` jest dla WN 110 kV+, a nie ENEA nN; nie kopiować całego edytora |
| [Elora Grid](https://github.com/elora-grid/electrical-symbol-library) | Oryginalne ilustracje SVG/DXF i źródłowy katalog referencji, nie oficjalne symbole IEC; zestaw różni między grafikami a funkcjami ochronnymi | grafiki CC BY 4.0, narzędzia MIT; zewnętrzne materiały nie są licencjonowane | Pomocnicza inspiracja / klasyfikacja; kontrola licencji i dowodów dla każdego rekord-u |
| [KiCad libraries](https://www.kicad.org/libraries/download/) | Symbole schematów obwodów, parametry pinów; domena elektroniki | CC BY-SA 4.0 (sprawdzić konkretne pliki i wyjątki) | Uzupełnienie sterowania i elektroniki, **nie** referencyjna rozdzielnica ENEA |
| [EPLAN Electric P8](https://www.eplan.help/en-US/Infoportal/Content/Plattform/2026/Content/htm/symboleditorgui_h_mitsymbolvariantenarbeiten.htm) | warianty A–H, identyczna funkcja/liczba punktów przyłączeniowych między wariantami; edytor i zasady symboli | treści i biblioteki proprietarne | Wzorzec funkcjonalny i jakościowy, **bez prawa do kopiowania ich chronionej biblioteki** |
| [IEC 60617 DB](https://webstore.iec.ch/en/publication/2723) | Autorytatywna baza graficznych symboli elektrotechnicznych | licencjonowana | Ostateczny arbitraż grafiki i identyfikatora IEC. **Brak dostępnej tutaj licencjonowanej pary 1:1; status NORMATIVE_VERIFIED = 0** |

**Nie mylić liczby ilustracji, funkcji ANSI i normowych symboli IEC.** Publiczna biblioteka jest materiałem źródłowym, nie automatycznym dowodem zgodności.

## 3. Standardy ENEA — dla kompozytów, nie dla kopiowania całych arkuszy

Źródło aktualnych dokumentów: [wykaz standardów ENEA Operator](https://www.operator.enea.pl/uslugi-dystrybucyjne/instrukcje-i-standardy/standardy-w-sieci-dystrybucji).

| Dokument | Zastosowanie w bibliotece | Podstawa / status |
|---|---|---|
| [SN/nn do 630 kVA, zeszyt 1](https://www.operator.enea.pl/media/683/stacje-elektroenergetyczne-sredniego-napiecia-zeszyt-1-stacje-transformatorowe-kompaktowe) | Profil rozdzielnicy nN i relacji SN → TR → nN. Rozłącznik izolacyjny 1250 A, możliwość 12 pól listwowych wielkości 2; CT na szynach za łącznikiem głównym; osobna szyna PEN. | §4.2–4.6, rys. 1 i 2; od 01.01.2025 |
| [SN/nn do 400 kVA „uproszczone”, zeszyt 2](https://www.operator.enea.pl/media/684/stacje-elektroenergetyczne-sredniego-napiecia-zeszyt-2-stacje-transformatorowe-kompaktowe) | ODRĘBNY profil. Łącznik główny 910 A, do 5 pól odpływowych; nie dziedziczy układu 630 kVA. | §4.4–4.5, rys. 1 i 2; od 01.01.2025 |
| [Stacje słupowe SN/nn, zeszyt 3](https://www.operator.enea.pl/media/685/stacje-elektroenergetyczne-sredniego-napiecia-zeszyt-3-stacje-transformatorowe-slupowe) | Odrębne wyposażenie rozdzielnicy i kabel SN/nN; **nie stosować jako standardowego wzorca dla nowych stacji, gdy ENEA zaleca prefabrykowane**. | §2, §4.4, załączniki; od 02.04.2024 |
| [Szafy/złącza nN z pomiarem](https://www.operator.enea.pl/media/693/szafy-kablowe-oraz-zlacza-kablowe-nn-z-ukladem-pomiarowo-rozliczeniowym-energii) | Własne złożenia ZK/SK, przekładniki, listwy, układ pomiarowy i zaciski PEN. | schematy i wymagania; od 01.02.2024 |
| Układy pomiarowe energii elektrycznej, aktualna wersja na portalu ENEA | Liczniki, zaciski, zabezpieczenia obwodów napięciowych/prądowych, AMI. | dokument od 02.04.2024, analiza szczegółowa **OTWARTA** |
| Linie kablowe nN, aktualna wersja na portalu ENEA | Przyłącza i odpływy kablowe z osprzętem nN. | wersja od 01.10.2025, analiza szczegółowa **OTWARTA** |
| Linie napowietrzne nN, aktualna wersja na portalu ENEA | Odrębne zakończenia przyłączy i aparatury linii. | wersja od 01.04.2026, analiza szczegółowa **OTWARTA** |

**Rys. 1 = schemat funkcjonalny, rys. 2 = rozmieszczenie aparatury w stacji 630 kVA.** Nie kopiować skalowania/montażu z rysunku wymiarowego do schematu jednokreskowego ani odwrotnie. Nie kopiować chronionych plansz PDF do publicznego repo.

## 4. Potok wykonany w PR

```text
QET oryginalny .elmt (CC BY 3.0; źródło i autor)
  └─ import_qet_nn.py (XML, allowlist prymitywów, bez DTD/ENTITY)
       ├─ CandV1: CadPrimitive[] + porty + SHA256
       ├─ wszystkie fazy/funkcje/stan = NIEZNANE (jawne)
       ├─ provenance DRAFT / właściciel zatwierdza
       └─ build_qet_nn_atlas.py → SVG w HTML atlasie offline
              └─ CI: siedem oryginalnych źródeł, testy + archiwum dowodowe
```

Do obejrzenia po CI: zakładka **Actions** dla PR #499, artefakt `nn-qet-atlas-do-oceny`.

**Brak:** połączonej produkcyjnej implementacji ENM → LvDomainProjectionV1 → `CadSymbol`; biblioteka jest wyłącznie źródłowa/eksperymentalna.

## 5. Obowiązkowy rejestr rodzin do ukończenia (nie nazywać „gotowe”)

| Rodzina | Status pierwszego etapu | Wymóg P0 |
|---|---|---|
| Wyłączniki ogólne, MCB | 2 pliki QET źródłowe, DRAFT | IEC wariant, 1P/2P/3P/4P, dane wyzwalaczy, porty |
| RCD, RCBO | 2 pliki QET źródłowe, DRAFT | prawidłowa klasa funkcji, 1P+N/3P+N, stan |
| Bezpiecznik, odłącznik i rozłącznik bezpiecznikowy | 3 pliki QET źródłowe, DRAFT | w szczególności listwowy NH wielkości 2, ruch 1P, złożenie ENEA |
| Rozłącznik izolacyjny główny ENEA | brak osobnego zatwierdzonego źródła | 1250 A / 910 A to cechy aparatu, symbol według funkcji |
| CT, VT, licznik, AMI, listwy | tylko w starej bibliotece jako kandydaci | sprawdzenie IEC, pomiarów i układów wtórnych |
| SPD, uziemienia, PE, PEN, N | niezaimplementowane nowe źródła | **zakaz przełączania PEN i PE**, potencjały i węzły topologii |
| Styczniki, przekaźniki, NO/NC/CO | niezaimplementowane nowe źródła | stan normalny vs rzeczywisty; strony sterowania |
| Transformator, maszyny, PV/BESS, falownik | rejestr dotychczasowy | rozdzielić symbole funkcjonalne i składanie toru źródeł |
| Pola rozdzielnicy 630 i 400 | brak gotowych ENM-driven szablonów | 12/5 miejsc to pojemność: rezerwa ≠ fizyczny aparat |
| ZK/SK, układy przemysłowe | brak | osobne konfiguracje, inne niż GPZ i SN/nN ENEA |

## 6. Definicja odbioru

1. **Symbol źródłowy**: źródłowy plik QET, SHA-256, autor, licencja, lista portów oraz porównanie renderu w tej samej skali. Importer odrzuca nieobsługiwane prymitywy — nie pomija ich po cichu.
2. **Norma**: identyfikator IEC 60617 i autoryzowana grafika, podpisany wynik porównania geometrycznego, żaden symbol nie ma tego statusu obecnie.
3. **ENM**: komplet funkcji portów, L1/L2/L3/N/PE/PEN, bieguny 1–4 i odrębne stany; obecna bramka `qetAdmissionGate.ts` blokuje fikcyjne domysły.
4. **ENEA**: konfiguracje 630/400, słupowe i ZK/SK muszą wynikać z oryginalnego dokumentu i rzeczywistych urządzeń, nie ze stałego rysunku; wymagane testy A/B oraz brak sprzęgła tam, gdzie nie ma go w modelu.
5. **Jakość ekranu**: widok L2 nN, jasny/ciemny, A3/A4 SVG/PDF, rozstawy, czytelność i etykiety bez kolizji; brak ukończonego odbioru.
6. **E2E**: ENM → LvDomainProjectionV1 → kanoniczny renderer → wyniki i eksport; żaden wynik PASS tej ścieżki nie jest jeszcze deklarowany.

Wersja 1/10 pozostaje **ODRZUCONA**, a nowy PR to **prototyp źródłowy**, bez uprawnień do produkcyjnego zastąpienia symboli. Bramka B-02 otworzy się wyłącznie po decyzji właściciela.
