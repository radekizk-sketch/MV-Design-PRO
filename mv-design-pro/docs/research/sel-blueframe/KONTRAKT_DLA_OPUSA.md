# MV-DESIGN PRO — szczegółowy kontrakt P0 inteligentnego „+” dla Opusa

> **NIE JEST TO OSOBNY PLAN.** Jedynym planem wykonawczym UI/UX jest
> [`PROGRAM_UIUX_2026-07.md` §12](../../uiux/PROGRAM_UIUX_2026-07.md#12-zintegrowana-kolejka-wykonawcza--uiux-przemyslowy-decyzja-wlasciciela-2026-10-23).
> Ten dokument jest **szczegółową kartą techniczną i zestawem testów dla UX-01/UX-02/UX-03/UX-06**,
> nie tworzy nowych priorytetów, ról ani równoległego rejestru postępu.
> Opus 5.5 zarządza jednym programem. Po każdym wdrożeniu dowody i status wracają
> do JEDNEJ tabeli §12.3, a GIS pozostaje P3/STOP.

**Podzadanie P0 (UX-01/02):** przenieś najlepszą ergonomię edytora SEL Power System Model, w pierwszej kolejności **inteligentny znak „+” w punktach elektrycznych na kanwie SN**. NIE kopiuj gotowego SEL, nie twórz nowego SLD, nie rozwijaj teraz GIS. Materiały źródłowe, obrazy i filmy są zebrane w tym samym katalogu: [GALERIA_I_FILMY.md](GALERIA_I_FILMY.md) oraz [REJESTR_32_FUNKCJE.md](REJESTR_32_FUNKCJE.md).

## 0. Zasady uruchomienia prac

1. W pierwszym kroku przeczytaj `CLAUDE.md`, `AGENTS.md`, `STAN_REPO.md`, decyzje `docs/v12xx`, rejestr B-01/B-02 i lokalny stan Git. Te pliki pozostają nadrzędne wobec tego dokumentu.
2. Potwierdź bieżący HEAD i obecność integracji PR #489; **założenie właściciela o scaleniu jest robocze, nie dowód statusu GitHub**. Nie nadpisuj równoległych prac.
3. Najpierw odtwórz zachowanie istniejącego SLD V3 na rzeczywistym ENM i wskaż braki. **Nie zaczynaj od makiet graficznych**.
4. Korzystaj wyłącznie z istniejącego `SldCanvasV3`, symboli i topologii z repo. Zero alternatywnej kanwy, osobnego SVG-schematy jako produktu, nowego grafu domenowego czy zastępczego silnika fizyki.
5. Jeden kanoniczny model elektryczny SN–TR–nN, dwie projekcje rysunkowe SN/nN i portal po stronie nN transformatora.
6. GPZ/110 kV tylko w zakresie potrzebnym do poprawnego zasilania sieci SN. NIE projektować szczegółowo rozdzielnic WN/110 kV.
7. Pełna anonimizacja danych i zrzutów. UI po polsku, język inżynierski. Obliczenia wyłącznie z rzeczywistych danych i solverów.
8. **GIS nie jest priorytetem: P3 / STOP.** Zakaz równoległego wdrażania GIS, GeoJSON, nowych widoków mapowych, geokodowania i importu zmian z map. Film MDI i SEL-02 to wyłącznie referencja na przyszłość.

## 1. Aktualna infrastruktura — nie projektuj drugi raz

| Istniejący element | Lokalizacja w repo (`mv-design-pro/`) | Do czego wykorzystać |
|---|---|---|
| Kanwa SLD | `frontend/src/ui/sld/v3/canvas/SldCanvasV3.tsx` | ten sam renderer, kamera, pozycje i zdarzenia kliknięć |
| Otoczenie kanwy | `frontend/src/ui/sld/v3/canvas/SldCanvasV3Workspace.tsx` | selekcja `ownerRef`, menu, inspektor, stan wyników |
| Rejestr operacji z menu | `frontend/src/ui/sld/v2/command/SldCommandService.ts` | `SLD_MENU_REGISTRY`, `getMenuActions`, blokady |
| Wykonawca domenowy | `frontend/src/ui/sld/shared/sldActionExecutor.ts` | `useSldActionExecutor`, `buildSldOperationContext`, predykaty startu |
| Kontroler menu | `frontend/src/ui/context-menu/SldContextMenuController.tsx` | istniejąca lista i pozycjonowanie; bez drugiej kopii |
| Model portów | `backend/src/enm/models.py`; `frontend/src/types/enm.ts` | `Port`, `PortRef`, rzeczywisty adres elektryczny |
| Reguły portów | `docs/sld/SLD_PORTS_AND_ENDPOINTS.md` | zajętość, typy, połączenia po torze pola |
| Domena budowy | `docs/ui/UX_KREATOR_SIECI_SN_OD_GPZ.md`; `docs/domain/OPERACJE_DOMENOWE_V1.md` | istniejące operacje `insert_station_on_segment_sn`, `start_branch_segment_sn`, `continue_trunk_segment_sn`, `insert_section_switch_sn` |
| Kanon SLD | `docs/sld/SLD_CAD_SCADA_REBUILD.md` | zakaz wyprowadzania linii bezpośrednio z gołej szyny GPZ |

Potwierdzone w odczytanym kodzie: `SldCanvasV3Workspace` rozpoznaje kontekst elementu modelu i wywołuje wspólną ścieżkę menu, a `SldCommandService` ma akcje dodania pola, ciągu, stacji, ZKSN, źródła oraz odgałęzienia. Nie przypisuj im nowego modelu danych, jeśli wystarczy nowy sposób ich wywołania.

## 2. Produkt oczekiwany przez użytkownika

### 2.1 Plus na wolnym punkcie rozbudowy

- Plus widoczny dyskretnie na: wolnym porcie pola, końcu dopuszczalnego ciągu SN, kanonicznym miejscu wstawienia na odcinku i w obszarze dodawania pola do istniejącej rozdzielnicy.
- Nie rysuj aktywnego plusa na szynie GPZ bez pola, na porcie już zajętym, na abstrakcyjnej ikonce stacji bez konkretnego pola, na nieaktywnym segmencie ani na mieszanej projekcji SN/nN.
- Kliknięcie plusa wyświetla krótkie menu operacji dostępnych w tym **konkretnym punkcie**: przedłuż kabel, zakończ stacją, wstaw ZKSN, rozpocznij odgałęzienie itd. Lista to istniejący `getMenuActions`, filtrowany na danych bieżącego ENM.
- Brak wolnego pola = opis powodu i wejście „Dodaj pole liniowe”, bez błędnego automatycznego domysłu.
- Uchwyt i lista uwzględniają klawiaturę, mysz i dotyk; nie opierają dostępności tylko na `hover`.

### 2.2 Jedna zmiana elektryczna — jeden zapis

- Po wybraniu pozycji system wypełnia kontekst istniejącej operacji: `modelRef`, `PortRef`, typ terminala, stacja, poziom napięcia i przypadek/rewizja.
- Backend przeprowadza walidację niezależnie od filtrowania w UI, aktualizuje połączenia, aparaty i katalogowe powiązania jako spójną operację. W razie błędu — brak częściowo stworzonej sieci.
- `SldCanvasV3` renderuje aktualny ENM; kamerę utrzymuje na miejscu pracy, wskazuje nowy obiekt, pokazuje nowy stan gotowości i poprawną aktualność wyników.
- Nie zapisuj wyłącznie symbolu, linii SVG ani drugiej listy segmentów w React.

### 2.3 Inspektor i walidacja SEL-style

- Wybrany element nie traci tożsamości podczas przejścia drzewo ↔ SLD ↔ wyniki.
- Inspektor po prawej prezentuje nazwę/typ, parametry elektryczne, katalog, zaciski, zajętość, stan oraz źródło i status danych. Każda edycja zapisuje się istniejącą operacją domenową; nie rozbudowuj pięciu formularzy tego samego elementu.
- Zwinięty dolny panel pokazuje liczbę błędów; rozwinięcie pokazuje *konkretne* błędy modelu, katalogu, połączeń i gotowości. Kliknięcie błędu wskazuje odpowiedni aparat/pole/odcinek i właściwą akcję naprawczą.
- Motyw ciemny inspirowany Blueframe: duża spokojna kanwa, niewielkie menu i inspektor; tekst nie może ginąć. Zbudować także motyw jasny o tej samej strukturze.

### 2.4 Granice fizyki

- Nie wolno wyprowadzać prądu z graficznej ciągłości kreski — liczy ENM/solver.
- Kierunki toru przez głowicę kablową i właściwe aparaty pola.
- Wstawianie stacji pośredniej dzieli istniejący odcinek zachowując jawną sumę długości, spadek napięcia, parametry impedancyjne i ekrany wyników; jeśli wymagane dane nieznane — jawnie odmów.
- PV/BESS/FW przez właściwe pole i transformator blokowy, bez sztucznych parametrów.
- B-02 pozostaje odrzucone; odbiór właściciela jest osobny od zielonego CI.

## 3. Testy funkcjonalne — obowiązkowe (na rzeczywistej ścieżce produktu)

| ID | Akcja projektanta | Test poprawności |
|---|---|---|
| **T+01** | Plus na wolnym porcie pola GPZ → kabel SN | oba `PortRef`, wpis ENM, jeden tor przez pole; brak plusa na gołej szynie |
| **T+02** | Plus na końcu kabla → stacja przelotowa SN/nN | dwa pola liniowe + pole TR, port wejściowy/wyjściowy i możliwość kontynuacji |
| **T+03** | Wstaw stację w 35% istniejącego odcinka SN | suma długości, parametry fizyczne, poprawność zmiany rozpływu/zwarć, stary wynik nieaktualny |
| **T+04** | Próba w zajętym porcie | brak zdublowanego przewodu; jasna przyczyna i legalna alternatywa |
| **T+05** | Uchwyt odgałęzienia → nowy odcinek | prawdziwy węzeł/topologia, prawidłowe porty i pełna ścieżka solvera |
| **T+06** | Połączenie pierścieniowe SN | wskazanie zgodnych końców, jawny punkt normalnie otwarty, brak zwarcia przez rysunek |
| **T+07** | Dodanie PV/BESS/FW do stacji | tor przez pole i TR przy wymaganym napięciu; brak danych ≠ zgadywane liczby |
| **T+08** | Przejście SN → portal nN | dwa SLD jednej sieci SN–TR–nN, bez mieszanego widoku |
| **T+09** | Wymuszona odmowa backendu | ENM, wersja, SLD i dane pozostały bez częściowego zapisu |
| **T+10** | Mysz/klawiatura/dotyk, oba motywy, mała szerokość | funkcjonalny +, czytelne menu, widoczny aparat, poprawne kadrowanie |

Oprócz testów pojedynczych przeprowadź **E2E pełnej ścieżki**: GPZ → pole SN → kabel SN → stacja przelotowa → wyjście SN → stacja końcowa → TR → projekcja nN → PV/BESS → rozpływ/zwarcie/ocena zabezpieczeń → raport. Testy ekranu to dowód tylko wtedy, gdy elementy są rzeczywiście w modelu ENM i po uruchomieniu solvera powstaje poprawny wynik (lub jawna odmowa).

## 4. Artefakty wymagane od Opusa

1. Realna funkcjonalność „+” z poziomu `SldCanvasV3`, podpięta do wspólnego wykonawcy domenowego.
2. Jeden inspektor i walidacja zsynchronizowane z selekcją obiektu (o ile aktualnie są już zaimplementowane, korzystaj z nich, nie duplikuj).
3. Tabela `JEST → POWINNO BYĆ → WYKONANE → DOWÓD` dla wszystkich P0 z rejestru 32 funkcji.
4. Testy T+01…T+10, regresja obecnych funkcji kanwy, dwóch projekcji i analiz. Oddzielne logi błędów od fałszywie zielonych wyników.
5. Zrzuty **prawdziwej aplikacji po zmianach**, ten sam przypadek w obu motywach, przed i po, z pełnym widocznym torem prądowym.
6. Meldunek: pliki/commity, testy uruchomione i pominięte, problemy, defekty fizyki, decyzje właściciela i stan B-02.

## 5. Priorytety i zakaz „scope creep”

**P0 — TERAZ:** system plusów, kontekst działań, backendowe porty i atomowy zapis, panel właściwości i walidacja z konkretnym obiektem, regresja E2E.  
**P1 — NASTĘPNIE:** szkic, wariant przed/po, cofanie, kopiowanie ustawień zgodnego typu, porównanie wyników; wyłącznie na kanonicznej sieci.  
**P2 — JEŚLI NIE BLOKUJE P0/P1:** szablony katalogowe i raporty na podstawie już istniejących danych.  
**P3 — ZAKAZ W TEJ MISJI:** GIS/GeoJSON/CIM jako nowy moduł, warstwa geograficzna, mapy, wizualna oś trasy, DNP3, SCADA, szczegółowa rozdzielnia WN. Materiały pozostają w galerii jako inspiracja do przyszłego osobnego mandatu.

## 6. Krótka instrukcja dla Opusa (do skopiowania do sesji)

**Najpierw przeczytaj główny Program UI/UX §12 i uruchom/ kontynuuj UX-00…UX-06.**
Po wykonaniu tej karty nie twórz nowego harmonogramu, status przechodzi do głównego programu.

> W repozytorium MV-DESIGN PRO przeczytaj `mv-design-pro/docs/research/sel-blueframe/README.md`, `GALERIA_I_FILMY.md`, `REJESTR_32_FUNKCJE.md` i `KONTRAKT_DLA_OPUSA.md`. Wykorzystaj już osadzone ekrany SEL i własne zrzuty aplikacji. Zrealizuj P0 inteligentnych punktów „+” na istniejącej kanwie `SldCanvasV3`, wyłącznie przez kanoniczny ENM, `PortRef` i istniejący `sldActionExecutor`. Zapewnij właściwy panel parametrów, walidację, zachowanie kadru i działającą ścieżkę projektanta. Nie twórz drugiej kanwy, nie wchodź w pełne 110 kV. GIS to P3: tylko zachowaj odniesienia, **nic z GIS nie implementuj**. Wykonaj T+01…T+10 i rzeczywiste E2E, pokaż zrzuty obu motywów oraz raport dowodowy. B-02 pozostaje odrzucone do decyzji właściciela.

**Źródła SEL:** [oficjalny opis PSM](https://selinc.com/software/distribution-management-system-dms/details/) i [film PSM](https://video.selinc.com/support/detail/video/1740181918198970918/sel-dms%E2%80%94power-system-model-psm). Zewnętrzne filmy zostały zinwentaryzowane według oficjalnych opisów, bez fikcyjnych klatek i znaczników czasu.
