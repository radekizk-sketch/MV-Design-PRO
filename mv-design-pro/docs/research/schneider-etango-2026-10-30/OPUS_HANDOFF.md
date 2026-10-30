# Claude Opus — kontrakt niezależnego przeglądu pakietu Schneider × e²TANGO

**Rodzaj zadania:** audyt architektoniczny i inżynierski; **wyłącznie decyzja o przydatności, nie automatyczna implementacja**.  
**Data:** 2026-10-30. **Repo:** `radekizk-sketch/MV-Design-PRO`. **Pakiet:** `mv-design-pro/docs/research/schneider-etango-2026-10-30/`.

## Misja

Właściciel MV-DESIGN-PRO chce **profesjonalnego, dokładnego, atrakcyjnego i normowo czytelnego SLD** w estetyce znanej z e²TANGO (Elektrometal Energetyka). Oczekuje poprawnego, eleganckiego wyłącznika wysuwnego i spójnej prezentacji wszystkich aparatów bez przygodnych kółek i nieczytelnych znaków. Jako materiał techniczny zgromadzono Schneider EcoStruxure Power Operation 2024 oraz e²TANGO/e²YANKEE.

**Pamiętaj, że produkt jest systemem inżynierskim do modelowania, symulacji, obliczeń i projektowania SN, a NIE prawdziwą SCADA.** Nie przenoś sterowania obiektem, RTU, historian, ani logiki telemetrycznej tylko po to, by przypominać e²TANGO.

Zespół GPT-6 przygotował materiały badawcze i dowody. **Ty, Opusie, jesteś jedynym architektem decydującym, które rozwiązania przyjąć, odrzucić, przerobić i które odłożyć bez wdrożenia**. Nie musisz zgadzać się z sugestiami. Każde rozstrzygnięcie uzasadnij dowodowo.

## Obowiązujący porządek lektury

1. **Najpierw stan bieżącej pracy**, nie sam pakiet: `CLAUDE.md` → `mv-design-pro/STAN_REPO.md` → `mv-design-pro/PLANS.md` → aktywny worktree/branch → istniejące dokumenty UI/UX, szczególnie `UX04_POLE_LINIOWE_WZORZEC.md`, jeżeli są dostępne (na `main` 2026-10-30 tego pliku nie znaleziono; może być na innej gałęzi).
2. Konstytucja `docs/architecture/PRODUCT_CAPABILITY_CONSTITUTION.md`, SLD kanon `docs/sld/SLD_CAD_SPEC_V3.md`.
3. **[README.md](README.md)**, **[REJESTR_ZRODEL.md](REJESTR_ZRODEL.md)**.
4. **[SCHNEIDER_ANALIZA_TECHNICZNA.md](SCHNEIDER_ANALIZA_TECHNICZNA.md)**, **[ETANGO_ANALIZA_WIZUALNA.md](ETANGO_ANALIZA_WIZUALNA.md)**.
5. **[MACIERZ_DECYZJI_I_TESTY.md](MACIERZ_DECYZJI_I_TESTY.md)**.
6. Faktyczny kod `sld/v3`, `cb_drawout.svg`, `ports.json`, `SldCanvasV3`, mapowanie stanu, scenariuszy i przebiegów solvera.

**Zasada źródłowa:** tekst producenta != prawo do kopiowania bitmap. Status `OK` w starym IEC parity != dowód wizualny normy. Rozbieżności aktualnych dokumentów rozstrzygaj przez kod i właściwe źródło normowe.

## Granice mandatu

- **TAK:** niezależny adversarial review i decyzje; wybór najlepszej drogi, szacowanie ryzyka i zakresu; wskazanie konkretnych fragmentów kodu, źródeł, testów; wniosek, że nie trzeba nic zmieniać, jest dopuszczalny.
- **NIE:** automatyczna realizacja wdrożenia w ramach tego PR badawczego; refaktor SLD „przy okazji”; zmiana rdzenia zwarć/rozpływów; ponowne projektowanie całej biblioteki; wprowadzanie mechanizmów SCADA; kopiowanie proprietary TGML/ikon.
- **B-01:** zmiany zamrożonej fizyki wyłącznie według reguł repo.
- **B-02:** zatwierdzenie wyglądu należy do właściciela; sam wygenerowany SVG ani zielony CI nie są werdyktem.
- **Jakość:** realizm obliczeń wyżej niż efekty wizualne; widoczna semantyka równie ważna jak „ładny” symbol.

## Co szczególnie masz niezależnie zbadać

### A. Symbol wyłącznika wysuwnego

- Czy w aktywnym rendererze rzeczywiście występuje kółko z atlasu, `cb_drawout.svg` z ramką lub jeszcze inny glif?
- Czy źródło normowe ENEA / IEC wymaga symbolu członu konkretnej konstrukcji? Czy wyłącznik z członem to kompozycja, a nie zmiana glifu wyłącznika?
- Czy wyodrębnienie styku wtyk–gniazdo zaproponowane na podstawie nazewnictwa Schneider ma wiarygodną geometrię? Jeśli nie — **BRAK DOWODU, nie wymyślaj**.
- Jakie oznaczenia występują przy napędzie M, wyzwalaniu, położeniu członu, uziemniku i wyłączniku stałym?
- Jak zachować czytelność w LOD0 (na małej skali), nie marnując siatki i nie tworząc dekoracyjnej „ramki mechanizmu”?

### B. Styl e²TANGO — preferencja właściciela

- Ustal konkretną paletę, hierarchię i logikę glifu **bez kopiowania OEM assetów**.
- Wybierz 1–2 kandydatów **minimalnych**, nie kolejny atlas 60 eksperymentalnych ikon.
- Porównaj do rzeczywistego zrzutu e²TANGO, ale pokaż, co jest obserwacją, co autorskim projektem, a co normowym wzorcem.
- Sprawdź konflikt starego opisu palety `closed green/open red` względem nowszego atlasu i źródła e²YANKEE `closed red/open green`; źródłem prawdy jest aktywny renderer i decyzje właściciela.

### C. Model symulacji, nie SCADA

- Czy istnieje jeden kanoniczny stan `breaker/rack/earth` w ENM + scenariuszu?
- Czy konfiguracja `rack=TEST, breaker=CLOSED` przerywa tory główne w **solverze** i w **SLD**, czy tylko w grafice?
- Czy brak danych/nieznany wynik jest reprezentowany epistemicznie, a nie jako logicznie „OPEN”?
- Czy zmiana stanu uruchamia poprawny nowy przebieg analizy bez używania nieaktualnych wyników?
- Czy backfeed, NO, wyspy, wieloźródłowość są prawidłowo obsługiwane?
- Czy `trip` jest poparty modelowanym zabezpieczeniem, czy w UI pojawia się fabrykowana wartość?

### D. Geometria i testy

- Jeden renderer produkcyjny i jeden kanoniczny graf: brak nowej równoległej warstwy symboli.
- Testy portów, nachodzenia etykiet, identyfikatorów, LOD, druku i regeneracji snapshotu.
- Zrzuty z rzeczywistego `SldCanvasV3`, a nie fantazyjne SVG narysowane osobno.
- Pełny komentarz do źródła każdego przyjętego kształtu.
- Zero deklaracji „zgodne IEC” bez dowodu normowego.

## Oczekiwany wynik Twojej pracy — konkretny artefakt decyzyjny

Opracuj w swoim zwyczajowym śladzie architektonicznym (bez autoimplementacji):
1. **Decyzja wejściowa:** stan rzeczywisty repo i gałęzi UX04, źródła prawdy i ewentualne konflikty.
2. **Ocena materiału GPT-6:** błędy faktyczne, pominięcia, nieudowodnione interpretacje, użyteczne wnioski.
3. **Macierz D-01..D-26:** status `PRZYJĄĆ / ZMODYFIKOWAĆ / ODRZUCIĆ / BRAK DOWODU`, uzasadnienie + referencja.
4. **Jeden zatwierdzony przez Ciebie kierunek symbolu** albo uzasadniony „brak dowodu do wyboru”; bez generowania wariantów, których sam nie obronisz.
5. **Minimalna propozycja zmian** (jeżeli potrzebna) w istniejących plikach, bez redesignu całego produktu.
6. **Definicja zakończenia** i wyrocznie: IEC/ENEA, zgodność modelu z geometrią, testy regresji i odbiór B-02.
7. **Rejestr dowodów i ryzyk**: brak licencji, brak geometrii, brak danych, konflikty dokumentacji.
8. **Prezentacja dla właściciela**: krótkie A/B porównanie najlepszego kandydata z bieżącym symbolem na rzeczywistym SLD w LOD0–LOD2, jeśli i tylko jeśli masz zweryfikowaną podstawę do wygenerowania takiego kandydata.

## Brak przesądzania technologii

Nie każę Ci tworzyć nowego stanu, interfejsu, typu ani drugiej biblioteki. Jeśli istniejące ENM/SldCanvasV3 obsługują wszystkie wymagania, Twoją decyzją może być **brak zmiany logiki i tylko korekta glifu**. Jeżeli fizyka jest błędna, udowodnij błąd i rozstrzygnij zgodnie z B-01 zamiast przykrywać go kolorem.

**Najważniejszy głos właściciela:** „Twoje symbole są po prostu brzydkie”; wrażliwość na kółko przy wyłączniku wysuwnym; preferencja w kierunku e²TANGO. Nie oceniaj sukcesu przez liczbę wariantów, stron, badge ani podmienionych kolorów — sukcesem będzie **jeden poprawny, elegancki i czytelny symbol w prawidłowym schemacie obliczeniowym**.

---

**Uwaga do ewentualnych przyszłych prac:** oddziel kontrakt decyzyjny od późniejszego wdrożenia. W tym przekazaniu właściciel zlecił zebranie dokumentacji przez GPT-6 i decyzję Opusa „co bierzemy”. Implementacja nie jest automatycznie zlecona tym dokumentem.
