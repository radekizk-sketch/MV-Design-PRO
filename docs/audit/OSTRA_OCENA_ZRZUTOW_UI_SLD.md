# Ostra ocena zrzutów UI/SLD — MV-DESIGN-PRO

Materiał audytu: `mv-design-ui-implementation-1600x970.png`, `mv-design-ui-implementation-1600x970-v2.png`, `mv-design-ui-implementation-1600x970-v3.png`, `mv-design-ui-implementation-1600x970-v4.png`. Najpełniejszy wariant oceny to `v4`; pozostałe zrzuty pokazują stany pośrednie i błędy synchronizacji widoku.

## 1. Werdykt końcowy

Ocena 0-10:

- poprawność merytoryczna elektroenergetyczna: 2/10
- czytelność schematu: 4/10
- zgodność z pracą projektanta sieci SN: 2/10
- gotowość do obliczeń: 1/10
- jakość interfejsu przemysłowego: 4/10
- spójność modelu z widokiem: 1/10

Werdykt: tego ekranu nie wolno dopuścić do dalszej rozbudowy funkcjonalnej bez zatrzymania i przebudowy semantyki SLD, stanu modelu oraz gotowości obliczeń. Można zachować kierunek ciemnego interfejsu, układ paneli i próbę inspektora technicznego, ale obecny ekran myli projektanta co do liczby elementów, kompletności modelu, roli GPZ, stanu zabezpieczeń i gotowości do obliczeń.

Najpoważniejszy problem nie jest estetyczny. Widok jednocześnie pokazuje rozbudowaną sieć z GPZ, polami, odcinkami, stacjami i źródłami, a w górnym pasku i pasku stanu raportuje zera: `Elementy: 0`, `Pola SN: 0`, `Stacje SN/nN: 0`, `Długość SN: 0.00 km`, `Transformatory: 0`, `Odbiorcy nN: 0`, `Węzły: 0`, `Gałęzi: 0`. To dyskwalifikuje ekran jako narzędzie inżynierskie, bo projektant nie wie, czy patrzy na model, makietę, niezsynchronizowany wariant, czy uszkodzony widok.

## 2. Najcięższe błędy

- Co jest źle: model i widok raportują sprzeczne liczby elementów. Lewy panel pokazuje GPZ, pola, odcinki, 7 stacji SN/nN i 2 źródła, środek pokazuje schemat z obiektami, a górne liczniki oraz pasek stanu pokazują zera.  
  Dlaczego jest to merytorycznie groźne: projektant nie może ustalić, czy obiekty istnieją w `NetworkModel`, czy są tylko grafiką. Taki stan unieważnia zaufanie do topologii, walidacji i wyników.  
  Co zobaczy projektant: sieć na schemacie, ale równocześnie komunikaty `Elementy: 0`, `Pola SN: 0`, `Stacje SN/nN: 0`, `Węzły: 0`, `Gałęzi: 0`.  
  Jaka powinna być zasada naprawy: jeden model ma zasilać lewy panel, SLD, inspektor, liczniki i pasek stanu; każda liczba musi być wyprowadzona z tego samego źródła danych i aktualizowana deterministycznie.

- Co jest źle: przycisk `Oblicz` i stan `Wynik OK` sugerują gotowość mimo blokad i niekompletności. Ekran pokazuje gotowość około 78%, trzy blokady i brak danych, ale główna akcja obliczeń pozostaje wyróżniona.  
  Dlaczego jest to merytorycznie groźne: projektant może uruchomić albo uznać za ważne obliczenia dla modelu, który nie spełnia warunków wejściowych. Przy zwarciach IEC 60909 to prowadzi do fałszywego poczucia poprawności.  
  Co zobaczy projektant: zielony `Wynik OK`, aktywne `Oblicz`, a obok lista braków: brak nastaw zabezpieczeń, brak danych kabla, brak uziemienia stacji.  
  Jaka powinna być zasada naprawy: obliczenia muszą być zablokowane albo oznaczone jako niekwalifikowane, dopóki walidacja nie wskaże kompletnego toru zasilania, danych impedancyjnych, transformatorów, linii, uziemień, stanów łączników i nastaw wymaganych dla danego typu analizy.

- Co jest źle: GPZ jest pokazany jako uproszczone źródło z podpisem `Źródło SN 110/15 kV`, bez realnej struktury stacji WN/SN.  
  Dlaczego jest to merytorycznie groźne: GPZ nie jest stacją terenową ani abstrakcyjnym symbolem zasilania. Dla sieci SN projektant musi widzieć tor WN/SN, transformator, sekcje szyn SN, pola, ewentualne sprzęgło i przypisanie odpływów do sekcji.  
  Co zobaczy projektant: pojedynczy symbol nad szyną SN, który miesza poziom 110/15 kV z opisem źródła SN.  
  Jaka powinna być zasada naprawy: renderer GPZ musi pokazać funkcjonalny układ: zasilanie zewnętrzne, transformator WN/SN, szyny SN, sekcje, sprzęgło, pola SN i wyprowadzenie magistrali z konkretnego pola.

- Co jest źle: pola SN są graficznie zbyt umowne i nie pokazują pełnej kolejności aparatów. Pole sprzęgłowe `L-03` wygląda jak pole liniowe, a pola liniowe nie ujawniają wyłącznika, odłącznika, przekładników, uziemnika, głowicy i portu w jednoznacznej kolejności.  
  Dlaczego jest to merytorycznie groźne: funkcja pola decyduje o topologii, selektywności, zdolności łączeniowej i możliwości obliczeń. Zastąpienie funkcji podobnymi kreskami myli projektanta.  
  Co zobaczy projektant: pięć pól przy jednej szynie, ale bez pewności, które aparaty istnieją i w jakiej kolejności pracują.  
  Jaka powinna być zasada naprawy: każde pole ma być renderowane według roli inżynierskiej i danych domeny; pole sprzęgłowe musi mieć osobną semantykę i nie może wyglądać jak odpływ liniowy.

- Co jest źle: stacje SN/nN są pokazane jako powtarzalne bloki ikonowe, a nie jako realne układy funkcjonalne. Transformator, strona SN, strona nN, zabezpieczenia i odbiory nie są rozdzielone wystarczająco czytelnie.  
  Dlaczego jest to merytorycznie groźne: projektant nie wie, czy okrąg oznacza transformator, węzeł, rozdzielnię, zacisk czy symbol stacji. Nie widać poprawnego osadzenia transformatora między stroną SN i nN.  
  Co zobaczy projektant: `ST-01`, `ST-02`, `ST-04`, `ST-05`, `ST-06` jako powtarzalne znaki z prostokątami i strzałkami.  
  Jaka powinna być zasada naprawy: stacja SN/nN ma być blokiem funkcjonalnym z nazwanymi stronami napięciowymi, transformatorem, polami, nN, odbiorami i stanami braków.

- Co jest źle: normalnie otwarty punkt i odgałęzienia są niejednoznaczne. Oznaczenie `NOP` pojawia się przy odcinku, ale nie widać jednoznacznego aparatu, stanu otwarcia, dwóch stron zasilania ani roli w pierścieniu.  
  Dlaczego jest to merytorycznie groźne: dla sieci SN punkt normalnie otwarty decyduje o promieniowej pracy, rezerwie, rozpływach i miejscu zwarcia. Nieczytelny NOP niszczy interpretację topologii.  
  Co zobaczy projektant: pomarańczowy punkt i etykietę przy linii, bez pewności, czy to rozłącznik, stan ostrzegawczy, węzeł czy blokada danych.  
  Jaka powinna być zasada naprawy: NOP musi być aparatem łączeniowym z jawnie pokazanym stanem, stronami przyłączenia, identyfikatorem pola i konsekwencją dla toru zasilania.

- Co jest źle: inspektor techniczny przeczy liście blokad. Lewy panel wskazuje dla `L-04` brak nastaw zabezpieczeń, a prawy inspektor pokazuje zabezpieczenie `REF615`, funkcje `50, 51, 67N, 50N` i `Nastawy: Zdefiniowane`.  
  Dlaczego jest to merytorycznie groźne: użytkownik nie wie, czy zabezpieczenia są kompletne, częściowe czy zablokowane. To bezpośrednio wpływa na ocenę gotowości i późniejszą koordynację zabezpieczeń.  
  Co zobaczy projektant: jeden ekran z dwoma sprzecznymi stanami tego samego pola.  
  Jaka powinna być zasada naprawy: blokady, inspektor i gotowość muszą wskazywać ten sam status z poziomem kompletności, konkretnym polem danych i wymaganą akcją naprawczą.

- Co jest źle: ekran nie pokazuje warunków zwarcia IEC 60909. Nie ma jawnego miejsca zwarcia, typu zwarcia, toru zasilania, impedancji źródła, transformatora, linii, stanu łączników ani kompletności danych dla punktu obliczeniowego.  
  Dlaczego jest to merytorycznie groźne: bez tych danych projektant nie może zweryfikować, co właściwie ma zostać policzone i czy wynik byłby audytowalny.  
  Co zobaczy projektant: przyciski `Oblicz`, `Wyniki` i tryb `Zwarcie`, ale bez warunków obliczeń.  
  Jaka powinna być zasada naprawy: przed obliczeniem zwarcia ekran musi pokazać panel warunków obliczeniowych i blokady brakujących danych dla wybranego punktu zwarcia.

## 3. Ocena piksel po pikselu

### Górny pasek

Górny pasek ma dobrą intencję: projekt, przypadek, wariant, migawka, wynik i akcja obliczeń są blisko siebie. Problem jest zasadniczy: pasek pokazuje `Projekt: Nowy projekt`, `Przypadek: P1 - Normalny`, `Wariant: W1 - Bazowy`, a dolny pasek równocześnie pokazuje `Projekt: — nie otwarto` i `Przypadek: nie wybrano`. To jest błędne. Projektant nie może mieć dwóch prawd o aktywnym projekcie i przypadku.

Stan `Wynik OK` jest groźny, bo występuje przy niekompletnym modelu. Zielony kolor ma w narzędziu przemysłowym znaczyć stan zweryfikowany, a tutaj stoi obok blokad. `Oblicz` nie powinien być główną aktywną akcją, gdy gotowość schematu wynosi około 78%, a trzy elementy wymagają uzupełnienia.

### Lewy panel modelu

Lewy panel jest lepszy niż środek pod względem hierarchii: pokazuje GPZ, pola SN, odcinki, stacje i źródła. To jest kierunek, który można zachować. Błąd polega na tym, że panel nie jest zsynchronizowany z licznikami i statusem modelu.

Lista blokad jest zbyt ogólna. `Pole L-04: brak nastaw zabezpieczeń`, `Odcinek SN-05: brak danych o kablu`, `Stacja SN 06: brak uziemienia SN` to dobre początki, ale powinny prowadzić do konkretnego pola danych, katalogu albo karty elementu. Status `3 elementy wymagają uzupełnienia danych` nie wystarcza jako prowadzenie projektanta.

Ikony kolorów są niebezpiecznie wieloznaczne. Zielone kropki, żółte trójkąty i czerwone znaki są obecne, ale nie ma natychmiastowej informacji, czy oznaczają kompletność, alarm, blokadę obliczeń, awarię, brak katalogu czy stan łącznika.

### Środek schematu

Środek jest najważniejszy i tu ekran nie zalicza odbioru. Schemat w `v4` jest czytelniejszy niż w `v2`, ale nadal wygląda jak demonstracyjna topologia, nie jak przemysłowy SLD.

GPZ jest sprowadzony do źródła i jednej szyny SN. Brakuje struktury stacji WN/SN, transformatora, sekcji, rzeczywistego sprzęgła i pól z pełną aparaturą. Sieć odchodzi z pola `L-04`, ale nie widać, dlaczego akurat to pole zasila odcinek `SN-01` i jakie aparaty są w torze.

Stacje terenowe są ikonami. Nie ma wyraźnego rozdziału strony SN i nN, transformatora SN/nN, rozdzielnicy nN i odbiorów. PV i BESS są pokazane obok stacji, ale ich strona napięciowa, przyłączenie, zabezpieczenie i wpływ na zwarcie nie są jednoznaczne.

### Symbole aparatów

Symbole aparatów nie spełniają poziomu schematu jednokreskowego dla projektanta. Są graficznie spójne, ale semantycznie za ubogie. Odłącznik, wyłącznik, uziemnik, przekładniki i głowica nie są rozpoznawalne jako pełna sekwencja pola.

Pole sprzęgłowe jest szczególnie problematyczne. `L-03 (Sprzęgłowe)` wygląda jak kolejne pole na tej samej szynie, a nie jak funkcjonalne sprzęgło sekcji. To myli projektanta i może prowadzić do błędnej interpretacji zasilania rezerwowego.

### Połączenia

Połączenia mają ogólny kierunek elektryczny, ale nie są wystarczająco jednoznaczne. Linia od `L-04` przechodzi do `ST-01`, dalej do `ST-02` i odgałęzień, ale nie widać pełnej logiki pierścienia, punktu normalnie otwartego ani stanów łączników.

Odcinki z linią przerywaną i ciągłą nie są opisane wystarczająco konsekwentnie. Legenda sugeruje typy linii, lecz na schemacie przerywanie miesza się z wyborem, blokadami i odgałęzieniami. Etykieta `NOP SN-05 (Kabel)` jest stłoczona przy linii i nie pokazuje aparatu normalnie otwartego.

Połączenia miejscami przechodzą blisko etykiet i przez obszar zaznaczenia, który zakrywa sens fragmentu przy `ST-05` i `SN-06`. To nie jest tylko problem wizualny. Projektant ma widzieć, gdzie jest węzeł, gdzie aparat i gdzie odcinek sieci.

### Etykiety

Etykiety są częściowo czytelne, ale nie mają wystarczającej hierarchii. `GPZ WSCHÓD`, `Szyna SN 15 kV`, `L-01` do `L-05`, `ST-01` do `ST-06` są widoczne, natomiast nazwy użytkowe i funkcje obiektów są zbyt skrótowe.

Identyfikatory typu `L-04`, `ST-05`, `SN-06` dominują tam, gdzie projektant potrzebuje znaczenia: nazwy pola, relacji do stacji, poziomu napięcia, stanu łącznika, typu kabla i kompletności danych. Etykiety linii z długościami są pomocne, ale nie wystarczają do weryfikacji obliczeń.

### Inspektor prawy

Inspektor ma dobry kierunek, bo rozdziela kartę semantyczną, inspektor techniczny i zabezpieczenia. Jednak obecna treść jest niespójna z blokadami. Dla zaznaczonego `L-04` inspektor pokazuje `Nastawy: Zdefiniowane`, podczas gdy blokada mówi o braku nastaw zabezpieczeń.

Porty opisane jako `Góra` i `Dół` są błędne jako podstawowy język inżynierski. To są kierunki ekranowe, nie nazwy elektryczne. Projektant potrzebuje portu od strony szyny, portu odpływu, pola, zacisku, sekcji szyn albo kierunku do odcinka.

`Kompletność: Częściowa (64%)` jest wartościowa tylko wtedy, gdy inspektor pokazuje brakujące pola danych. Obecnie procent jest liczbą bez audytowalnej listy przyczyn.

### Pasek stanu

Pasek stanu dyskwalifikuje ekran przez sprzeczność z resztą widoku. Pokazuje `Projekt: — nie otwarto`, `Przypadek: nie wybrano`, `Węzły: 0`, `Gałęzi: 0`, mimo że ekran zawiera topologię i wybrany przypadek w górnym pasku.

W narzędziu klasy PowerFactory lub ETAP pasek stanu jest miejscem kontroli aktywnego modelu, przypadku i wyniku. Tutaj pasek działa jak odłączony komponent. To musi zostać zatrzymane przed dalszą rozbudową.

### Legenda i minimapa

Legenda jest zbyt mała i zbyt słabo powiązana z rzeczywistymi stanami. Widać oznaczenia typu kabla, linii napowietrznej i blokady, ale nie ma pełnego objaśnienia kolorów, stanu normalnego, awaryjnego, zwarciowego, punktu normalnie otwartego i alarmu.

Minimapa albo panel orientacyjny nie daje realnej wartości dla większej sieci. Przy dużej sieci projektant będzie potrzebował wyszukiwania po obiekcie, filtrów po poziomie napięcia, blokadach i obszarach, a nie tylko małego podglądu.

### Komunikaty gotowości

Komunikaty gotowości są za mało konkretne. `3 elementy wymagają uzupełnienia danych` jest informacją wstępną, ale nie jest wystarczającą instrukcją. Dla każdego braku ekran ma wskazywać element, kartę, pole danych, wymagane źródło danych i wpływ na obliczenia.

Gotowość 78% bez jednoznacznej listy kryteriów jest ryzykowna. Projektant nie wie, czy 78% oznacza gotowość topologii, danych katalogowych, impedancji, zabezpieczeń, uziemienia, obliczeń zwarciowych czy tylko wypełnienie formularzy.

### Przyciski obliczeń i wyników

Przyciski `Oblicz` i `Wyniki` są zbyt mocne wobec stanu modelu. Ekran powinien najpierw wymusić wybór analizy, punktu obliczeniowego i kompletność danych. Tryb `Zwarcie` nie pokazuje warunków IEC 60909, więc przycisk obliczeń sugeruje gotowość, której nie ma.

Brakuje rozdzielenia: obliczenia dopuszczone, obliczenia zablokowane, wyniki nieaktualne, wyniki z poprzedniego przypadku, wyniki wymagające przeliczenia. Zielony `OK` bez tych rozróżnień jest błędny.

## 4. Błędy elektroenergetyczne

- GPZ jest potraktowany jak uproszczone źródło, a nie jak stacja WN/SN z transformatorem, sekcjami szyn, polami i sprzęgłem.
- Podpis `Źródło SN 110/15 kV` miesza pojęcia. 110/15 kV opisuje transformację WN/SN, nie zwykłe źródło SN.
- Magistrala SN nie ma jednoznacznego wyprowadzenia z kompletnego pola SN z pełną aparaturą.
- Pole sprzęgłowe nie ma czytelnej funkcji sprzęgła sekcji.
- Pola liniowe nie pokazują kompletnej kolejności aparatów i ich funkcji.
- Stacje SN/nN są ikonami, a nie układami funkcjonalnymi z transformatorem, stroną SN, stroną nN, zabezpieczeniami i odbiorami.
- Transformator SN/nN nie jest jednoznacznie osadzony między stroną SN i nN.
- PV i BESS nie mają jednoznacznego poziomu napięcia, toru przyłączenia, zabezpieczeń i wpływu na analizę zwarciową.
- Punkt normalnie otwarty nie jest pokazany jako aparat łączeniowy z jawnym stanem i stronami zasilania.
- Odgałęzienia i pierścień nie są jednoznaczne, więc topologia pracy normalnej i rezerwowej jest niepewna.
- Braki danych kabla, uziemienia i nastaw zabezpieczeń nie są powiązane z blokadą konkretnego typu obliczeń.
- Brakuje widocznych warunków obliczeń IEC 60909: miejsca zwarcia, typu zwarcia, toru zasilania, impedancji źródła, transformatora, linii, uziemienia i stanów łączników.

## 5. Błędy interfejsu dla projektanta

- Ekran pokazuje sprzeczne stany projektu, przypadku, wariantu i liczby elementów.
- Zielony `Wynik OK` występuje przy blokadach, co niszczy znaczenie koloru zielonego.
- Aktywny `Oblicz` sugeruje gotowość, której model nie spełnia.
- Czerwony i żółty sygnalizują braki, ale nie prowadzą projektanta do dokładnego pola danych.
- Identyfikatory techniczne dominują nad nazwami użytkowymi i funkcją inżynierską.
- Inspektor pokazuje dane zabezpieczenia sprzeczne z blokadą zabezpieczenia.
- Procenty kompletności nie są audytowalne, bo nie pokazują składowych.
- Porty opisane kierunkami ekranowymi utrwalają myślenie graficzne zamiast elektrycznego.
- Legenda nie wyjaśnia wystarczająco stanów, blokad, NOP, trybów pracy i znaczenia kolorów.
- Zrzut `v2` pokazuje przygaszony schemat przy aktywnych panelach, co wygląda jak stan pośredni albo uszkodzone zaznaczenie, a nie kontrolowany tryb pracy.
- Zrzut początkowy pokazuje pusty schemat mimo pełnego drzewa modelu, co jest krytyczną sprzecznością stanu.
- Ekran nie jest gotowy na dużą sieć, bo brak widocznych mechanizmów filtrowania po blokadach, sekcjach, typach obiektów i zależnościach zasilania.

## 6. Minimalne warunki zaliczenia następnej wersji

- Lewy panel, SLD, inspektor, górne liczniki i pasek stanu pokazują identyczną liczbę GPZ, pól SN, odcinków, stacji, transformatorów, źródeł, węzłów i gałęzi.
- Jeżeli na SLD widać element, jego licznik nie może wynosić zero.
- Jeżeli pasek stanu mówi `projekt nie otwarto`, SLD nie może pokazywać aktywnej topologii projektu.
- Jeżeli przypadek nie jest wybrany, górny pasek nie może pokazywać `P1 - Normalny` jako aktywnego przypadku.
- Przycisk `Oblicz` jest zablokowany albo oznaczony jako niekwalifikowany, dopóki każda blokada danych nie zostanie usunięta albo jawnie sklasyfikowana jako nieistotna dla wybranej analizy.
- Zielony `Wynik OK` pojawia się tylko wtedy, gdy istnieje aktualny wynik dla aktywnego modelu, przypadku, wariantu i typu analizy.
- Każda blokada wskazuje element, kartę, pole danych, wymagane źródło danych i wpływ na obliczenia.
- GPZ pokazuje zasilanie zewnętrzne, transformator WN/SN, szyny SN, sekcje, sprzęgło, pola SN i wyprowadzenia odpływów.
- Każde pole SN pokazuje rolę i kolejność aparatów zgodną z danymi domeny.
- Pole sprzęgłowe ma symbol i połączenie odróżnialne od pola liniowego.
- Każda stacja SN/nN pokazuje stronę SN, transformator, stronę nN, odbiory albo źródła oraz braki danych.
- Każdy transformator SN/nN jest narysowany między stroną SN i nN, a nie jako nieopisany okrąg.
- Każdy punkt normalnie otwarty jest aparatem z jawnym stanem i dwoma stronami sieci.
- Żaden przewód nie przecina aparatu, etykiety ani panelu informacyjnego.
- Żadna etykieta nie nachodzi na przewód, ikonę blokady ani zaznaczenie.
- Kolor czerwony jest używany wyłącznie dla alarmu, błędu, blokady, stanu niebezpiecznego albo wyniku przekroczenia.
- Inspektor nie może pokazywać `Nastawy: Zdefiniowane`, jeżeli lista blokad dla tego elementu mówi o braku nastaw.
- Warunki IEC 60909 pokazują miejsce zwarcia, typ zwarcia, tor zasilania, impedancje, źródło, transformator, linie, uziemienie, stany łączników i kompletność danych.
- Tryby `Normalny`, `Awaryjny` i `Zwarcie` zmieniają widoczną semantykę ekranu, a nie tylko zaznaczenie przycisku.
- Wszystkie teksty widoczne dla użytkownika są po polsku technicznym, bez nazw roboczych i śmieciowych etykiet.

## 7. Lista zadań dla zespołu

### Natychmiast zatrzymać

- Zatrzymać rozbudowę funkcji obliczeniowych na tym ekranie, dopóki stan modelu i widoku nie będzie spójny.
- Zatrzymać eksponowanie `Wynik OK` i aktywnego `Oblicz` przy niekompletnym modelu.
- Zatrzymać renderowanie GPZ jako pojedynczego źródła bez struktury stacji WN/SN.
- Zatrzymać używanie ikon stacji SN/nN jako zamiennika układu funkcjonalnego.
- Zatrzymać niespójność blokad zabezpieczeń między lewym panelem i inspektorem.

### Naprawić przed kolejną prezentacją

- Zsynchronizować liczniki, pasek stanu, lewy panel, SLD i inspektor z jednym źródłem danych.
- Przebudować kartę gotowości tak, aby każda blokada prowadziła do elementu i pola danych.
- Zablokować albo zdegradować przycisk obliczeń przy braku danych wymaganych dla aktywnej analizy.
- Dodać panel warunków obliczeń IEC 60909 dla trybu zwarcia.
- Przerysować GPZ zgodnie ze standardem: transformator WN/SN, szyny, sekcje, sprzęgło, pola.
- Rozróżnić graficznie i semantycznie pola liniowe, transformatorowe i sprzęgłowe.
- Pokazać NOP jako aparat łączeniowy, nie jako pomarańczową kropkę przy etykiecie.
- Przepisać porty `Góra` i `Dół` na nazwy elektryczne.
- Uporządkować etykiety tak, aby żadna nie kolidowała z przewodem ani blokadą.

### Poprawić po ustabilizowaniu semantyki

- Rozbudować legendę o stany łączników, alarmy, blokady, kompletność danych, NOP i tryby pracy.
- Dodać filtrowanie dużej sieci po blokadach, poziomie napięcia, sekcji, typie obiektu i analizie.
- Dodać widok śladu danych: skąd pochodzi typ kabla, transformator, zabezpieczenie, nastawa i uziemienie.
- Rozwinąć inspektor o audytowalną listę składowych kompletności.
- Uporządkować tryby `Normalny`, `Awaryjny`, `Zwarcie`, aby zmieniały widoczne warunki i walidację.

### Zostawić bez zmian

- Zachować ciemny, techniczny kierunek interfejsu.
- Zachować podział na lewy panel modelu, środek SLD, prawy inspektor i pasek stanu.
- Zachować próbę hierarchii: projekt, przypadek, wariant, migawka i wynik w górnym pasku.
- Zachować ideę blokad danych i gotowości, ale przebudować ich treść i powiązanie z modelem.
- Zachować ideę inspektora semantycznego i technicznego, ale wymusić spójność z blokadami i modelem.
