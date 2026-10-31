# e²TANGO / e²YANKEE — referencja estetyczna i symbolika elektroenergetyczna

**Status:** materiał porównawczy dla Opusa i bramki B-02. **Właściciel wiążąco ustalił docelowy kierunek wizualny e²TANGO (2026-10-31); wybór stylu nie jest do dyskusji, parametry realizacji są do decyzji Opusa.**  
**Zakres:** ekrany e²TANGO 600/800/1000/1200, e²TANGO-2000 jako materiał pomocniczy, edytor Studio, miniSCADA oraz publikacje o e²YANKEE.  
**Czego nie robimy:** kopii 1:1 całego HMI, bitmap/ikon producenta, sprzętowego menu, rzeczywistego sterowania.  
**Źródła i ograniczenia:** [REJESTR_ZRODEL.md](REJESTR_ZRODEL.md), E01–E15.

## DECYZJA WŁAŚCICIELA — WIĄŻĄCA (2026-10-31)

**WYBRANY KIERUNEK WIZUALNY: e²TANGO (Elektrometal Energetyka). TO NIE JEST KANDYDAT DO AKCEPTACJI PRZEZ OPU­SA.**

Docelowy SLD MV-DESIGN-PRO ma posiadać estetykę inspirowaną synoptyką e²TANGO: precyzyjne, smukłe linie; czytelne, zwarte, normowo poprawne znaki aparatów; ciemny ekran inżynierski; oszczędny kolor stanu; minimalizm bez nadmiarowych obwiedni, kółek, ozdobnych kafli oraz animacji. Dopuszczalny jest osobny wydruk monochromatyczny.

**Rozdzielenie kompetencji:** właściciel ustalił kierunek estetyczny i nie deleguje wyboru stylu na Opusa. **Opus odpowiada za konkretną geometrię, proporcje, grubości linii, skalowanie LOD0–LOD2, integrację, zachowanie poprawności wg ENEA/IEC i testowalną rekomendację wykonawczą.** Zamiast odrzucać e²TANGO jako kierunek, Opus może odrzucać nieudane sposoby jego realizacji. Wybór konkretnego kształtu wymaga technicznego dowodu; nie kopiować nieuprawnionych materiałów producenta. Werdykt wizualny B-02 pozostaje po stronie właściciela.

**Granica produktu:** narzędzie obliczeniowo-symulacyjne i projektowe, **nie SCADA**. Nie implementować łączności online, RTU, komend do urządzeń, historian ani dyspozytorskich paneli.

---

## 1. Przedmiot inspiracji: NIE e²YANKEE zamiast e²TANGO

Trzy różne powierzchnie produktowe:

1. **e²TANGO (panel polowy):** mały ekran synoptyki aparatu/pola, bardzo duża gęstość informacji, czarne tło, cienkie białe linie, czerwone/zielone kwadratowe/krótkie znaczniki położenia, etykiety Q i pomiary w ograniczonej przestrzeni. **Wzorzec pierwszoplanowy.**
2. **e²TANGO-Studio:** edytor synoptyki, konfiguracji i blokad, symulator logiki bez sprzętu, możliwość elementów użytkownika, pogląd ekranu panelu (starszy katalog). **Wzorzec projektowania scenariuszy i precyzji rysowania**, nie importu vendor.
3. **e²YANKEE:** pełny system SCADA, widok stacji → pole, kolory stanów (czerwony zamknięty, zielony otwarty, żółty ? nieznany), prezentacja pomiarów/alarmów. **Wzorzec czytelności stanu**, lecz nie architektura aplikacji.

Te rodziny nie są jednym „stylem komponentów”; dokumentacja nie podaje jednolitego pliku biblioteki symboli.

## 2. Co potwierdzają dokumenty producenta

### 2.1 Skala i precyzja

- Katalog e²TANGO wymienia bazę **55 schematów synoptycznych** i **5 konfigurowalnych ekranów**; oznacza to 55 układów, **nie 55 osobnych ikon i nie 55 stanów jednego aparatu** (E02/E11).
- Starsza tabela modelowa podaje **640×480 px dla e²TANGO-600/800** i **800×480 px dla 1000/1200** (E11); nie przenosić na nasz rysunek pikselowy jako stałego LOD.
- Oficjalne przykłady pokazują pola z wieloma aparatami i wartościami pomiarowymi na niewielkim ekranie (E01–E03, E10).
- Producent opisuje edycję synoptyki i logiki w e²TANGO-Studio, w tym **symulację logiki bez urządzenia** (E04). To realnie pokrewne narzędziu inżynierskiemu, ale **nie jest solverem zwarć, rozpływu ani analizy sieci**.

### 2.2 Kolory (osobny dowód)

W opracowaniu dotyczącym e²YANKEE (E07, rys. 4–8, tabela „Sygnalizacja pracy łączników”) podano:
- czerwony wyłącznik — **zamknięty**;
- zielony wyłącznik — **otwarty**;
- czerwony / zielony z dodatkiem — **napęd rozbrojony**, przy osobno ustalonym położeniu;
- żółty **?** — brak znanego stanu (utrata łączności lub awaria).
- także stany odłącznika i uwagi pomiarowe.

**Uwaga:** czerwony/zielony opisano dla konkretnej synoptyki e²YANKEE, nie jako wymóg normy ENEA ani dokument dowodzący takiej palety w każdym produkcie Elektrometal. W aplikacji symulacyjnej odróżnić brak wiarygodności wyniku od utraty transmisji z RTU.

## 3. Język wizualny rozpoznawalny na publicznych fotografiach

**O — obserwacja, nie pomiar normowy:**

| Element | Obserwacja na panelach | Co może znaczyć dla MV |
|---|---|---|
| Tło synoptyki | Bardzo ciemne / czarne, bez gradientów | Ciemny tryb inżynierski, bez ogromnych kolorowych kafli |
| Tory główne | Cienkie, jasne linie; pionowe odprowadzenia | Precyzyjna, oszczędna typografia i podział line weight |
| Aparaty | Krótkie kolorowe prostokąty / małe znaki w osi toru | Stan nie powinien zalewać dużych pól kolorem |
| Etykiety | Zwięzłe identyfikatory Q i nazwy pól | Trzymać opis blisko właściciela, bez naruszania portów |
| Pomiar | Zwarta tabela obok synoptyki | Wyłącznie jawnie policzone wyniki ze scenariusza; nie telemetria |
| Hierarchia | Wyraźnie ważniejszy tor niż ozdobne ramki i badge | Najpierw schemat; wartości drugorzędne; warstwy on-demand |
| Kolory statusów | Czerwony/zielony jako dyskretne sygnały | Kolor nie zastępuje kształtu i treści |
| Skala | Czytelność przy bardzo małym ekranie | Testowanie LOD w rzeczywistych pikselach po skalowaniu |

**NIE wyprowadzać z fotografii:** exact SVG path, dokładny promień łuku, grubości 1.5 px, „oficjalny” rozmiar symbolu, współrzędne portów, pełne 55 glifów. Fotografie są rozciągane, kompresowane i zawierają perspektywę.

### 3.1 Fotografie referencyjne (linki, bez kopiowania)

- [e²TANGO-800, fotografia GiS Lębork](https://gislebork.pl/oferta/zabezpieczenia-sn/681-e-tango-800-produkcji-elektrometal-energetyka) — kilka pól na czarnej synoptyce, z pomiarami poniżej.
- [e²TANGO-1000, oficjalna strona produktu](https://elektrometal-energetyka.pl/sterowniki-polowe-e%C2%B2tango/sterownik-polowy-e%C2%B2tango/) — zwarta jedno-/kilkuaparatowa synoptyka.
- [e²TANGO-2000 WN, oficjalna strona](https://elektrometal-energetyka.pl/sterownik-polowy-e%C2%B2tango-2000/) — większe, złożone pole, pomiary P/Q/U/I.
- [e²YANKEE katalog 2025 K-6.3.1](https://elektrometal-energetyka.pl/wp-content/uploads/2025/04/Karta-katalogowa-e2YANKEE-K-6.3.1.pdf) — pola GPZ i GPO/PV.
- [Opracowanie e²YANKEE (rys. 4–8)](https://elektrometal-energetyka.pl/wp-content/uploads/2021/02/2017-Nowoczesne-laboratorium-EAZ.pdf) — tablica znaczeń.

**Licencja:** linki do oceny, nie pliki do redystrybucji. Bez praw nie robić „pixel-perfect copy” vendor i nie używać oryginalnego logo/układu panelu.

## 4. Parametry realizacji wybranego przez właściciela stylu e²TANGO — do ustalenia przez Opusa

Właściciel odrzucił serię wcześniejszych autorskich atlasów jako „brzydkie”. Należy zatem nie dodawać nowych ikon bez dowodu jakości.

### 4.1 Kandydat stylu „e²TANGO engineering”

1. **Rysunek, nie kafle:** symbol aparatu w rzeczywistym torze. Podkład statusu tylko lokalnie, jeśli pomaga; zakaz dużych prostokątów tłumiących geometrię.
2. **Smukłe proporcje:** wyłącznik pozostaje jednoznacznie rozpoznawalny; nie zastępować go piktogramem „X” w gigantycznym boksie.
3. **Stała rodzina linii:** hierarchia szyna / tor / symbol / pomocnicze. Bez drastycznie różnych grubości w różnych LOD.
4. **Kolor oszczędny:** czerwony i zielony do sygnalizacji stanu wyłącznika (jeśli przyjęte), tory bazowe w neutralnej jasnej barwie; wartość napięcia i obliczone przepływy jako osobne tryby nakładki.
5. **Brak nieumocowanych kółek:** kółko w bocznym położeniu nie jest oczywistym znakiem członu wysuwnego; nie używać bez pierwotnego wzorca normowego.
6. **Napęd M** czytelny i spójny ze wzorcem w ENEA, ale rozmiar znaku podlega testowi LOD.
7. **Znak uziemnika** bocznie do toru, w kierunku ziemi; nie włączać szeregowo ani nie odwracać przypadkowo.
8. **Ograniczenie liczby markerów:** status awarii/trip/pozycja członu jako adnotacja o znanej semantyce i priorytecie, nie dekoracja dla każdego pola.
9. **Praca w mono:** symbol musi być fizycznie czytelny bez barw.
10. **Jeden przyjęty standard:** geometrię sprawdzić z ENEA/IEC zanim uzna się stylistykę e²TANGO za produkcyjną.

### 4.2 LOD — raczej hierarchia informacji niż trzy osobne symbole

| LOD | Oczekiwana funkcja | Problem do sprawdzenia |
|---|---|---|
| L0 | Rozpoznanie typu aparatu i wiarygodnego stanu w kontekście linii/stacji | Nie mylić `OPEN` i `UNKNOWN`; za małe kółko/napęd znika |
| L1 | Odczyt aparatu i pozycji, opis Q, układu pola | Kolizje etykiet, pomylenie mechanicznego członu z odłącznikiem |
| L2 | Potwierdzenie komponentów fizycznych: wyłącznik, człon, napęd, uziemnik i opcjonalne adnotacje | Brak rzekomych połączeń elektrycznych w stanie TEST/DISCONNECTED |

LOD **nie może** zmieniać semantyki połączenia: zmiana zoomu to inny poziom widzialności, nie inny graf.

### 4.3 Konfrontacja z istniejącym atlasem użytkownika

W rozmowie pokazano 10 rodzin × 6 stanów w LOD0/LOD1/LOD2. Wcześniejszy krytyczny problem:
- dla unknown/error narysowana ukośna linia może wyglądać jak OPEN;
- zbyt duża powierzchnia kolorowych kafli;
- słaby odczyt detali na LOD0;
- osobne kółko wyłącznika wysuwnego może mylić się ze stykiem lub drugim aparatem;
- symbol M niejednolity (okrąg z M vs kwadrat bez litery).

**Nie zakładać**, że wszystkie te błędy trwają w aktualnym HEAD. Opus porównuje **rzeczywisty renderer po zmianach z 2026-10-30**, nie kopię starszego atlasu.

## 5. Człon wysuwny — najlepszy program badawczy, nie gotowy SVG

Wyłącznik wysuwny = *wyłącznik* + *zespół rozłącznych styków głównych członu* (pozycje praca/próba/odłączony; rzeczywiste detale zależą od produktu). Osobne napędy i obwody pomocnicze **nie powinny być automatycznie rysowane jako tory elektryczne SN**.

### 5.1 Hipotezy poddane decyzji Opusa

- **H1:** symbol wyłącznika bazowy, a wysuwność wyrażona przez dwa niewielkie, zgodne ze wzorcem pary styków rozłącznych na torze. Wymaga autentycznego rysunku i testów LOD.
- **H2:** minimalny znak członu z jednoznacznym statusem pozycji w karcie aparatu, bez zmiany głównego glifu L0. Dobre dla gęstych schematów, ale w L0 musi zachować prawidłowy obraz przerwy fizycznej.
- **H3:** osobna składnia symbolu pola po porównaniu z ENEA Z.10, **nie duplikat wyłącznika**. Tylko jeżeli pola w ENEA wymagają specyficznego przedstawienia.

Żadnej z hipotez **nie wdrażać** bez decyzji i porównania do autoryzowanego pierwowzoru. Nie dorabiać dużej prostokątnej obwiedni ani oznaczenia „WYS.” tylko dlatego, że odrzucono kółko.

## 6. Co realnie zaczerpnąć z e²TANGO-Studio (bez budowania SCADA)

Producent opisuje:
- edytowanie synoptyki oraz blokad;
- pracę nad konfiguracją wielu pól na jednym stanowisku;
- graficzne edytowanie logiki;
- **symulowanie logiki bez sprzętu**;
- podgląd stanu logiki przy połączonym urządzeniu.

**W MV-DESIGN-PRO** analogiczne, ale niezależne elementy to:
- edycja topologii i scenariusza (nie logiki sterownika rzeczywistego);
- walidacja blokad jako **reguł bezpieczeństwa scenariusza**, nie komend wykonawczych;
- natychmiastowa, wersjonowana symulacja zmian i ponowne obliczenia;
- analiza skutków zmiany położenia aparatu: izolacja, wyspy, kierunki przepływów, Ik, zabezpieczenia, naruszenia.
- porównanie wariantów i eksport dowodu wyników.

**Nie wykonywać** parsera plików konfiguracyjnych/algorytmów e²TANGO ani kopiowania kodu zabezpieczeń producenta.

## 7. e²YANKEE — dowody, a nie wzorzec całej aplikacji

Publikacja E07 zaleca cechy HMI: hierarchia ważności, racjonalna ilość informacji, przechodzenie do szczegółu bez utraty orientacji, szybki wybór pola. To są dobre zasady także dla narzędzia inżynierskiego.

W publikacji znajdują się udokumentowane stany wyłącznika, odłącznika, awarii. **Jednak** brak dowodu, że te same grafiki są użyte w nowych panelach e²TANGO. Przenosić **język** i czytelność, nie całą kompozycję SCADA.

## 8. Testy estetyczne / błędy zakazane

Poniższe kryteria to **kandydat do zatwierdzenia Opusa**, nie wynik źródła:

- 3×3 powiększenia realnego glifu w L0, L1, L2 i 100% natywnych rozmiarów. Nie oceniać wyłącznie z gigantycznego PNG.
- Ocena par: fixed vs drawout, open vs unknown, earth open vs earth closed, tripped vs open, rack service vs test vs disconnected.
- Pełny rysunek w skali 0.5×, 0.7× i 1.0× oraz na białym wydruku. Bez chowania portów i opisów.
- Stroke niestabilny (raz 1 px, raz 5 px) → odrzucenie.
- Dekoracyjna ramka, przycisk, badge, osobny kolorowy kafel, który tłumi symbol → odrzucenie.
- Kółko niesugerujące funkcji elektrycznej, nieopisany kwadrat, silnik M wyglądający jak styk → odrzucenie.
- Port geometryczny poza fizyczną osią przewodnika → odrzucenie.
- Stan awarii wyglądający jak otwarty → odrzucenie.
- Uziemnik szeregowy albo skierowany w sposób wywracający znaczenie → odrzucenie.

## 9. Braki materiału potrzebnego do porównania 1:1

Publicznie dostępne fotografie i wykazy **nie udostępniają kompletnej oryginalnej biblioteki wektorowej 55 schematów**. Oryginalne symbole producenta mogą podlegać prawom autorskim. W repo nie umieszczono wycinków bitmap, klonów logo, fontów ani vendor assetów.

Jeśli Opus posiada w swoim środowisku **uprawniony** dostęp do e²TANGO-Studio lub konkretnych rysunków, może audytować geometrię w zgodzie z licencją, ale nie zakładać prawa redystrybucji. W przeciwnym razie opracować **własne, normowe prymitywy**, wizualnie oszczędne.

## 10. Rezultat dla Opusa

Proponowana zasadnicza decyzja do rozważenia: **przyjąć e²TANGO jako visual north star, nie jako bibliotekę do skopiowania**; oprzeć semantykę stanów o jawny model i sprawdzone rozwiązania Schneider; **zatrzymać się na selekcji lokalnych korekt symbolu wyłącznika wysuwnego**, o ile aktualny SLD rzeczywiście je wymaga. W przypadku braku dowodu grafiki wybór = `BRAK DOWODU`, a nie wymyślenie następnego znaku.

### Źródła szczególnie ważne
- [E01 — sterowniki SN](https://elektrometal-energetyka.pl/sterowniki-polowe-e%C2%B2tango/sterownik-polowy-e%C2%B2tango/)
- [E02 — katalog](https://elektrometal-energetyka.pl/wp-content/uploads/2024/04/karta-katalogowa-e2TANGO-K-3.2.17.pdf)
- [E04 — Studio](https://elektrometal-energetyka.pl/e%C2%B2tango-studio/)
- [E05 — centralna sygnalizacja](https://elektrometal-energetyka.pl/centralna-sygnalizacja-rozdzielni-sn-w-sterownikach-polowych-e%C2%B2tango/)
- [E07 — e²YANKEE i tabela kolorów](https://elektrometal-energetyka.pl/wp-content/uploads/2021/02/2017-Nowoczesne-laboratorium-EAZ.pdf)
