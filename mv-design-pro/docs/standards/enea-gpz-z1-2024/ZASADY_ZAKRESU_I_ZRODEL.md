# Co jest normą ENEA, a co regułą graficzną MV-DESIGN-PRO

## 1. Przedstawienie dowodu

Każde ustalenie musi zawierać `ID → obiekt/screenshot → wymaganie źródłowe → co pokazuje model i SLD → diagnoza → korekta → test`.

Stany:
- **POTWIERDZONE** — widać na zrzucie rozbieżność w oznaczeniu albo jawny brak, który standard bezpośrednio reguluje;
- **DO SPRAWDZENIA** — zrzut nie ujawnia danych katalogu/modelu/konfiguracji; nie przypisywać mu niezgodności z góry;
- **UX/SLD** — niezgodność z zaakceptowaną specyfikacją graficzną, ale nie z normą ENEA;
- **POZA ZAKRESEM** — dotyczy fizycznego wykonawstwa i nie musi być widoczne na SLD, lecz może być walidowane w danych urządzenia.

## 2. Źródła

Oficjalny PDF: [ENEA Zeszyt 1 2024](https://www.operator.enea.pl/uslugi-dystrybucyjne/instrukcje-i-standardy/standardy-w-sieci-dystrybucji) — wybierz „Stacje elektroenergetyczne 110 kV Zeszyt 1”, wersja 02.2023–2. Odwołania do wersji 2024 mają pierwszeństwo przed schematami z publikacji książkowych lub starej dokumentacji. Bibliografia Dołęgi to materiał objaśniający, nie obowiązująca specyfikacja ENEA.

Załączniki źródłowe nie udzielają licencji na reprodukowanie całych rysunków w repo. Zamiast przechowywać rysunki PDF w repo, używaj oficjalnego łącza i własnych tabel kryteriów.

## 3. NIE przedstawiać jako wymagań ENEA

- Odstęp szyna → pierwszy aparat **48 jednostek sceny**: projektowe ustalenie B-02.
- Proporcje szerokości `W` pól, kolory HEX, wysokości ramek i skala symbolu TR/CT: standard wizualny MV-DESIGN-PRO.
- Wyrównanie wszystkich ramek do jednego dolnego poziomu: reguła schematu, a nie obowiązek konstrukcyjny.
- To, że symbole na jednym kadrowaniu muszą przypominać fizyczną wielkość urządzeń: nie jest wymaganiem IEC 60617. Symbole powinny mieć spójną czytelność i właściwą geometrię; „TR większy od CT” to decyzja UX dla wzajemnej hierarchii symboli.
- Kody ANSI są dopuszczalnym skrótem funkcji, nie zastępują jednak kontraktu pomiarów i sterowania.

## 4. Kluczowe rozróżnienie wymiarów

§13 ENEA wymaga **fizycznej** szerokości celki zazwyczaj 60–80 cm, dla pól transformatorowych i łącznika szyn dopuszcza do 100 cm. Nie wolno bezpośrednio przekładać tych centymetrów na szerokości pikselowe rozdzielnicy SLD. W ekranie mogą być różne obszary opisu aparatury, lecz połączone z jednym rzeczywistym polem.

§13 nakazuje **dwie sekcje A i B** dla rozpatrywanego wzorca GPZ. Przy innym OSD lub odmiennym szablonie nie zmieniaj globalnego oznaczenia wszystkich obiektów w produkcie. Wykonaj wariant ENEA w kreatorze i SLD, zachowując trwałe ID modelu.

## 5. Z.7 / Z.17 — ostrożność co do wtórnych zabezpieczeń

§13 mówi, że przekładników napięciowych nie należy wyposażać we **wkładki bezpiecznikowe**. Jednocześnie na rysunkach załączników występują oznaczenia zabezpieczeń i rozłączania po stronie obwodów wtórnych. Nie wolno bezrefleksyjnie przenosić bezpiecznika do toru pierwotnego przekładnika. Rozstrzygnąć typ elementu i miejsce połączenia na schemacie, a następnie w katalogu.

Skrócony SLD L0/L1 nie musi odtwarzać wszystkich przewodów wtórnych z rysunku Z.7/Z.17. Wymaga jednak identyfikacji aparatury i powiązań, a rozwinięta karta/edycja wtórnych muszą reprezentować rzeczywiste uzwojenia i urządzenia. Odróżniać `3U0` od napięcia fazowego.

## 6. Nie wymuszać niewidocznych parametrów

Prąd znamionowy pola, klasa izolacji, wytrzymałość zwarciowa, budowa celki, aparat do SPZ/ZS/LRW i liczba uzwojeń mogą być w danych katalogowych, choć nie ma ich na panoramicznym SLD. Sprawdź kontrakt katalog → ENM → inspektor → konfigurator → wynik/walidacja. Brak napisu na obrazie nie dowodzi braku parametru.
