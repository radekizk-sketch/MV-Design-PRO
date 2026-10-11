# KSR — przekrojowa specyfikacja inżynierska konfiguratora stacji SN/nN, OZE/BESS
**Wersja:** KSR-SPEC-2026-10-11 · **Status:** PROJEKT DO IMPLEMENTACJI, NIE WDROŻONE · **Właściciel:** Fable (integrator) · **Repo:** `radekizk-sketch/MV-Design-PRO`.

## 0. Kontrakt rezultatu
Nie budujemy nowego kreatora ani alternatywnego SLD. Rozwijamy istniejące 17 etapów `StationConfigurator.tsx` jako jedną powierzchnię edycji **kanonicznego ENM**. Ten sam fizyczny obiekt i ten sam stan konfiguracji są konsumowane przez: katalog, BOM, graf fizyczny, graf stanów łączeniowych, SLD V3, rozpływy, zwarcia, dynamikę RMS, nN, EAZ, analizę gotowości, dowody i raporty. Makieta HTML `MV_DESIGN_PRO_KSR_PROTOTYP.html` jest **wyłącznie wzorcem ergonomii i interakcji**; nie jest źródłem aparatury, wartości katalogowych ani danych fizycznych. Źródło demonstracyjne znajduje się w Bibliotece właściciela i musi być dostarczone wykonawcy; brak pliku nie usprawiedliwia rekonstrukcji jego zawartości z obrazka.

### Warunki nienegocjowalne
1. SN/nN; sieć nadrzędna WN wyłącznie jako graniczny równoważnik. Brak kreatora WN.
2. SLD: tylko `frontend/src/ui/sld/v3/canvas/SldCanvasV3.tsx`, snapshot ENM i kanoniczne symbole. Zero lokalnych rysunków imitujących pole.
3. Rodzina → kompletne pole → fabryczne/opcjonalne aparaty → porty → BOM → ENM → SLD. Nigdy `rola pola -> wymyślony wyłącznik`.
4. `list_offered_switchgear_families()`, `CompleteMvBayTemplate`, `FactoryConfiguration`, `FieldInstance`, `family_validation` są punktami odniesienia; nazwy/ścieżki zweryfikować na HEAD przed edycją.
5. Status `requires_catalog` nie może zostać awansowany do `offered` przez interfejs. Wymiary, klasy IAC/LSC, Ik, Ith, Ipk, Ir i wyposażenie wyłącznie z katalogu lub jawnie opisanej dokumentacji źródłowej.
6. Dane istniejące, projektowane, wariantowe i archiwalne zachowują odrębną tożsamość i datę odniesienia. Reguły dotyczące nowej aparatury i czynników fluorowanych wymagają daty uruchomienia oraz podstawy prawnej; nie odrzucać automatycznie obiektu istniejącego.
7. Stan operacyjny aparatu nie jest operacją sterowania rzeczywistym obiektem. Symulacja ≠ SCADA z prawem zdalnego łączenia.
8. Każdy wynik wiąże się z `model_revision`, `scenario_ref`, `study_run_ref`, wersją metody i proweniencją. Po zmianie zależnych danych wynik jest NIEAKTUALNY.
9. Normy wersjonowane; zgodność z IEC 60909-0:2026 wymaga osobnego dowodu walidacji, a nie zmiany etykiety.
10. Nie zmieniać rdzeni B-01 bez właściwej zgody, parytetu, wyroczni i testów mutacyjnych.

## 1. Pomiary stanu istniejącego i zależności
**Zweryfikowane na gałęzi domyślnej przy opracowaniu specyfikacji:** `StationConfigurator.tsx` ma 17 kroków: `basic`, `sn-switchgear`, `bays`, `apparatus`, `ct`, `vt`, `measurements`, `transformer`, `earthing`, `nn-switchgear`, `der-sources`, `power-quality`, `protection`, `nc-rfg`, `infrastructure`, `network-analysis`, `readiness`. Istnieją `StationConfigBaysCard.tsx`, `StationConfigSnSwitchgearCard.tsx`, `StationConfigReadinessCard.tsx`, `StationTemplateWizard.tsx`, `AddDerWizard.tsx`, `SldCanvasV3.tsx` oraz `backend/src/network_model/catalog/switchgear/families.py`. Katalog zawiera m.in. Rotoblok, Rotoblok Air/VCB, RELF, TPM, TPM Air, ABB SafeRing/SafePlus, Siemens NXAIR/8DJH, Schneider SM6/RM6/RM AirSeT. **Istnienie rodziny w kodzie nie jest dowodem dopuszczenia jej wariantów do projektu.**

Przed implementacją Fable tworzy macierz `źródło → właściciel → odczyt → zapis → odbiorca → test` dla każdego pola danych. Audytuje `backend/src/api/switchgear_config.py`, `audit2_station_config.py`, magazyny konfiguracji i trwałość projektu. Wykryty magazyn tymczasowy nie może być drugim źródłem prawdy.

## 2. Model pojęciowy i niezmienniki
```text
Project / Revision / Scenario
  Station (istniejąca/projektowana, funkcja, konstrukcja, Un)
    SwitchgearInstance (rodzina, wersja katalogu, konfiguracja fabryczna)
      BusSection (rzeczywiste sekcje i sprzęgła)
      FieldInstance (katalogowe kompletne pole, wybrane opcje)
        DeviceInstance (CB/LBS/DS/ES/fuse/CT/VT/sensor/relay wg BOM)
          Terminal (stabilny ref, funkcja, domena napięciowa)
    CableTermination ↔ CableSegment ↔ CableTermination
    Transformer ↔ LVSwitchgear ↔ LVFeeder
    DER / PV / BESS / PCS / PCC / BlockTransformer
    ProtectionChain / CTCore / VTSecondary / TripCircuit
  TopologySnapshot / OperatingState / StudyRun / Evidence / Report
```
To jest **mapa relacji**, nie nakaz tworzenia nowych tabel lub klas o tych nazwach. Najpierw odwzorować na istniejące ENM, a nowe encje dodać tylko dla rzeczywistej luki.

**INV-01:** każde zakończenie kabla ma port konkretnego pola/urządzenia; żaden kabel nie kończy się na ikonie stacji.  
**INV-02:** nie ma drugiego kabla na tym samym jednokablowym porcie bez jawnie dopuszczonej konfiguracji; rozgałęzienie tylko w fizycznym węźle.  
**INV-03:** tor szyna–aparat–zacisk–głowica–kabel–głowica–zacisk–aparat–szyna jest odtwarzalny z ENM, nie z geometrii SLD.  
**INV-04:** pola modularne i fabryczne bloki RMU są rozróżnione; nie istnieje dowolne składanie bloku.  
**INV-05:** aparaty i ich stany zmieniają graf operacyjny; rozłącznik bez zdolności wyłączania prądu zwarciowego nie staje się wyłącznikiem.  
**INV-06:** sprzęgło i sekcje szyn zachowują stan OPEN/CLOSED, a źródła DER mogą odwracać kierunek mocy.  
**INV-07:** CT/VT mają fizyczne położenie, rdzenie, przekładnie, obciążenia wtórne i przypisanie do EAZ.  
**INV-08:** TR SN/nN ma jawne Un, Sn, uk, grupę, zaczepy i połączenie z domeną nN; brak danych ≠ zero.  
**INV-09:** PV i BESS mają niezależne liczniki jednostek, P/S/E, transformator, port, PCC, ograniczenia regulacji i scenariusz; E nie jest wyprowadzane z nazwy szablonu.  
**INV-10:** skutek edycji propaguje się do solver input, ważności biegów, EAZ i raportu; nie wolno pokazywać starego wyniku jako aktualnego.  
**INV-11:** w każdym raporcie występują wersja modelu, podstawa, dane wejściowe, metoda, dowód, status i ograniczenia.  
**INV-12:** błędy P0/P1 są typowane i mają `FixAction` prowadzące do konkretnego obiektu.

## 3. Kontrakty danych (propozycja adaptacji, NIE gotowe API)
```ts
type SourceState = 'CATALOG_VERIFIED' | 'PROJECT_DECLARED' | 'CALCULATED'
  | 'REQUIRES_CATALOG' | 'MISSING' | 'ESTIMATED';
type Validity = 'CURRENT' | 'STALE' | 'NOT_RUN' | 'BLOCKED' | 'OUTSIDE_DOMAIN';
interface EngineeringDatum<T> {
  value: T | null; unit: string | null; sourceState: SourceState;
  evidenceRef?: string; editable: boolean; uncertainty?: string;
}
interface StationSelection {
  stationRef: string; modelRevision: string; scenarioRef: string;
  switchgearRef?: string; selectedFieldRef?: string; selectedTerminalRef?: string;
}
interface ValidationIssue {
  code: string; severity: 'P0' | 'P1' | 'P2';
  objectRef: string; explanationPl: string; missingInputs: string[];
  fix: { stepId: string; objectRef: string; fieldKey?: string };
}
interface StudyResultHeader {
  studyRunRef: string; modelRevision: string; scenarioRef: string;
  methodVersion: string; validity: Validity; evidenceRef?: string;
}
```
Nie wprowadzać tych typów równolegle do istniejących kontraktów. Fable ma wykonać mapowanie, wykazać luki i wybrać **jeden** właścicielski model. Wszystkie jednostki po stronie API są jawne; frontend stosuje `pl-PL` i nie zmienia semantyki liczby.

### Kontrakt zapisu
`request(stationRef, expectedRevision, command, payload) → validated event/updated snapshot/newRevision | typed conflict`. Zapis atomowy: walidacja katalogu + operacja ENM + przebudowa zależności + unieważnienie odpowiednich biegów + zdarzenie audytowe. Powtórzenie komendy idempotentne lub jawnie odrzucone. Cofnięcie jako operacja domenowa z nową rewizją, nie lokalne odwrócenie koloru.

## 4. Zestaw ekranów i operacje
**Powłoka:** ciemny SCADA Neon, polskie nazwy, 17 istniejących etapów, lewa nawigacja 230–270 px, centrum z realnym SLD/tabelą, inspektor 320–400 px, pasek stanu. Skalowanie 1366/1600/1920/2560; brak mieszania jasnego i ciemnego motywu. Wartości katalogowe/projektowe/obliczone odróżnione semantycznie.

| Etap istniejący | Wymagana powierzchnia | Krytyczna operacja i wynik |
|---|---|---|
| basic | istniejąca/projektowana, punkt wstawienia, porty, Un | walidacja rzeczywistego odcinka i portów |
| sn-switchgear | rodzina, fabryczny blok lub moduły, sekcje, Ir/Ik | filtr rodzin oferowanych; kontrola konfiguracji |
| bays | tabela pól i ich funkcji | dodanie/kopia/usunięcie z nowymi ref i analizą zależności |
| apparatus | inspektor BOM pola | opcje tylko z potwierdzonego szablonu |
| ct | przekładnia, rdzenie, klasy, obciążenia | kontrola zdolności odwzorowania i przypisania EAZ |
| vt | przekładnia, układ, klasy, obwody | kontrola zasilania pomiarów i EAZ |
| measurements | pomiar rozliczeniowy i telemechanika | przypisanie sygnałów do fizycznych aparatów |
| transformer | katalog TR, Sn, Un, uk, grupa, zaczepy | aktualizacja obu domen i zależnych analiz |
| earthing | układ uziemienia SN/nN i połączenia | brak zgadywania sposobu uziemienia |
| nn-switchgear | szyny, sekcje, incomer, odpływy, sprzęgło | projekcja LOD 0/1/2 z jednego grafu |
| der-sources | PV, wiatr, SPGM, BESS, PCS, PCC | wielokrotne źródła, fizyczny tor, osobne P/S/E |
| power-quality | profile P/Q, Q(U), cosφ(P), P(f), PQ | tylko wyniki zweryfikowanych analiz |
| protection | EAZ, CT/VT, obwody wyłączenia, TCC | wynik backendu, marginesy, blokady |
| nc-rfg | profil WOS/PTPiREE/OSD, status dowodów | typ A/B, status BRAK_PODSTAWY bez fikcyjnej zgodności |
| infrastructure | SCADA, napędy, stany, blokady | symulacja stanu bez sterowania rzeczywistym obiektem |
| network-analysis | LF, SC, nN, dynamika, analiza wysp | run ID, rewizja, ważność, White Box |
| readiness | gotowość domen, dowody, raport | typowane błędy z bezpośrednią naprawą |

### Karta pola — minimalny zakres
Funkcja, nazwa i numer pola, rodzina, katalogowy kod jednostki, wersja źródła, status dopuszczenia, sekcja szyn, aparaty i ich kolejność fizyczna, porty, głowice, kable, uziemnik, CT/VT, EAZ, obwody sterowania, napięcia/prądy znamionowe, IAC/LSC tylko z dokumentu, wymiary tylko z dokumentu, BOM, niezgodności i przyciski „Pokaż na SLD”, „Otwórz EAZ”, „Otwórz kabel”.

### Stacje i konfiguracje
Końcowa, przelotowa, odgałęźna, sekcyjna, rozdzielcza, transformatorowa, abonencka, przemysłowa, źródłowa i hybrydowa — jako funkcje i przypadki sieciowe, **nie automatyczne warianty OEM**. Konstrukcja słupowa/wnętrzowa/kontenerowa/szafowa tylko przy dopuszczonym rozwiązaniu. Rodziny ZPUE, Siemens, ABB, Schneider i inne z istniejącego rejestru; brak karty = brak autorytatywnego wyboru.

### BESS — obowiązkowe rozdzielenie
PCS: Pn, Sn, Un, charakterystyka P–Q, limit prądowy, tryb GFL/GFM (wyłącznie potwierdzony). Bateria: En, SOC, sprawność, P ładowania/rozładowania. Przyłączenie: TR blokowy, pole, zacisk, kabel, PCC. Scenariusz: eksport/import, ograniczenia SOC, praca wyspowa tylko przy potwierdzonej zdolności i modelu. Nie wyciągać fizyki BESS z deklaracji typu źródła.

## 5. Spójność między warstwami — macierz skutków
| Zmiana | ENM / katalog | SLD | Solwery | EAZ | Raport |
|---|---|---|---|---|---|
| wybór rodziny | walidacja wszystkich pól i opcji | nowa projekcja po zatwierdzeniu | kontrola parametrów i ważności | zgodność CT/VT/aparatów | nowe BOM, status |
| dodanie/usunięcie pola | nowe/wycofane ref i porty | przebudowa z ENM | zmiana topologii | powiązania obwodów | aktualizacja |
| podłączenie kabla | dwa potwierdzone końce | pełny tor | R/X/C, zwarcie, ampacity | kierunek pomiaru i selektywność | lista kabli |
| zmiana TR | Un/Sn/uk i porty | SN–TR–nN | LF/SC/nN/dynamika | prądy i nastawy | parametry i obliczenia |
| zmiana liczby PV/BESS | niezależne instancje | wszystkie źródła | PF/SC/dynamika/PQ | koordynacja | sumy i dowody |
| przełączenie sprzęgła | stan aparatu w scenariuszu | symbol i topologia | wyspy, PF/SC | blokady | stan scenariusza |
| zmiana nastaw EAZ | obiekt nastaw | opis/overlay | bieg ochrony | wynik selektywności | karta nastaw |

## 6. Karty wykonawcze i kolejność zależności
**KSR-G0 (P0):** ustalenie HEAD, przegląd PR #477/#478, `STAN_REPO.md`, kanonu i API; mapa właścicieli danych, testy czerwone odtwarzające braki. Nie dopuszczać statusu DONE bez commitów i testów.

**KSR-G1 (P0):** kanoniczna tożsamość stacja–rozdzielnica–pole–aparat–port–kabel, atomowe komendy, odmowy domenowe, rewizje; zamknięcie duplikatów magazynów. Zależności: POLA-W-TORZE, POLE-ZAJĘTE, SLD-SUBSTRAT.

**KSR-G2 (P0):** catalog-first, konfiguracje modularne/RMU, pełny BOM, dowody OEM, hard error i kontrola kompatybilności. Zależność G1.

**KSR-G3 (P0):** integracja React 17 etapów, tabela pól, inspektor, kontekst wyboru, SLD V3 bez alternatywnego renderer'a. Zależności G1/G2 i odbiór SLD-SUBSTRAT.

**KSR-G4 (P0):** gotowość per domena, odświeżanie wyników, unieważnianie StudyRun, raport i White Box; backend jako źródło statusów. Zależności G1–G3, GOTOWOSC-DER-BACKEND.

**KSR-G5 (P1, bez odraczania wykrytych defektów):** PV/BESS/PCC, 4×PV+1×BESS i 10×PV+3×BESS, E/P/S/SOC, TR, przepływ zwrotny, praca wyspowa, profil wymagań. Zależności G1–G4, PR #478 po niezależnym odbiorze.

**KSR-G6 (P1):** CT/VT/EAZ/sterowanie, obwody wyłączenia, gotowość do doboru nastaw, dowód czasu wyłączenia; nie tworzyć własnego solvera. Zależność BIEG-ZABEZPIECZEN-Z-MODELU.

**KSR-G7 (P1):** nN LOD0/1/2, odpływy, uziemienie, SWZ, dokumentacja i BOM. Zależność G1–G4 i W5.

**KSR-G8 (P1):** testy pełnej ścieżki, deterministyczne migawki, audyt regresji, dokumentacja dowodowa, aktualizacja planu i statusu z faktycznymi SHA. Integrator odpowiada za odbiór.

Nie traktować P1 jako „kiedyś”; kolejność to graf zależności, nie pozwolenie na pozostawienie błędów.

## 7. Testy falsyfikacyjne i wyrocznie
| ID | Scenariusz | Wyrocznia / kryterium |
|---|---|---|
| T01 | stacja przelotowa 2L+T, 15 kV | dwa różne końce kabli, jeden TR, brak fikcyjnych łączników |
| T02 | zamiana rodziny OEM | stare pola nie pozostają automatycznie zgodne |
| T03 | blok RMU + niedozwolona dodatkowa jednostka | typowana odmowa, zero mutacji ENM |
| T04 | dwie linie na zajętym porcie | odmowa backendu, nie tylko frontend |
| T05 | wyłącznik wysuwny w położeniu TEST | graf operacyjny nie przewodzi przez styki główne |
| T06 | zamknięcie uziemnika przy zasilonym torze | zablokowana operacja scenariusza z uzasadnieniem |
| T07 | zamknięcie sprzęgła | przeliczenie wysp/topologii i unieważnienie run |
| T08 | PV/BESS z odwróceniem P | brak strzałki przepływu bez run; po run poprawny znak |
| T09 | 4 PV+1 BESS → 10 PV+3 BESS | ENM/SLD/solver input/raport mają identyczną liczebność |
| T10 | brak En lub SOC w BESS | właściwa gotowość z brakiem; bez syntetycznego 0 |
| T11 | CT brak rdzenia EAZ lub złe obciążenie | brak pozytywnego werdyktu EAZ |
| T12 | brak katalogowego Ik/IAC/LSC | brak dopuszczenia i brak wymyślonej wartości |
| T13 | zmiana uk TR | LF/SC/EAZ/nN/report STALE zgodnie z grafem zależności |
| T14 | restart serwera po zapisie | ENM i wybór pola identyczne, historia rewizji zachowana |
| T15 | równoległa edycja z nieaktualną rewizją | jawny konflikt, zero utraty zmian |
| T16 | SLD kliknięcie i powrót z EAZ | zachowany ref i zaznaczenie; brak osobnej topologii |
| T17 | projekt istniejący z aparatem historycznym | odróżnienie od wymagań dla nowego uruchomienia |
| T18 | brak podstawy normowej | wynik informacyjny może istnieć, formalny werdykt zgodności nie |
| T19 | generowanie raportu po zmianie modelu | jawnie nieaktualny, brak eksportu jako „aktualny” |
| T20 | 2 powtórzenia snapshot/raport przy tych samych danych | deterministyczny wynik, stabilne referencje |

Wymagane: pytest domena/API, testy mutacyjne, `tsc --noEmit`, ESLint, vitest, Playwright z realnym backendem, `scripts/guardy_z_ci.py`, generator OpenAPI i migawki SLD. Testy celowane wykonawcy, pełny odbiór integratora według `KARTY_OTWARTE_2026-09.md`. Wszelkie liczby PASS podawać wyłącznie po faktycznym biegu na wskazanym SHA.

## 8. Kryteria odbioru
**STOP P0:** osierocone porty; wymyślony aparat; niezweryfikowana konfiguracja OEM; drugi ENM; fałszywy wynik; zły tor SN–TR–nN; BESS bez fizycznego PCC; operacja uziemienia dopuszczona w niedozwolonym stanie; stary wynik jako aktualny; utrata rewizji; naruszenie B-01.  
**Odbiór P1:** kompletność ekranów i katalogów, realne CT/VT/EAZ, dokumentacja, weryfikowalne ograniczenia DER, brak martwych przycisków, polskie jednostki i etykiety, dostępność klawiaturą.  
**Dowód:** commit, test, scenariusz, zrzut z realnej aplikacji, wyrocznia, jawne ograniczenia. „9/10” nie zastępuje żadnego dowodu.

## 9. Powiązania z planem Fable
Ten dokument jest kartą przekrojową do `docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` §14. Nie restartuje programu A/B ani nie zmienia automatycznie §5/§11. PR #477 (plan SC/EAZ/dynamika) i PR #478 (skład PV/BESS) były **OPEN/DRAFT na 2026-10-11**; przed scaleniem rozwiązać zależności i konflikty, bez twierdzenia, że ich poprawki już są na `main`. Stan `STAN_REPO.md` z 2026-09-30 jest historyczny i wymaga świeżego pomiaru przed implementacją.
