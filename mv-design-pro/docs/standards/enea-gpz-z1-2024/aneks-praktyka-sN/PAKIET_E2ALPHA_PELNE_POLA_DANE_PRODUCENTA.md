# e²ALPHA — zanonimizowane kompletne pola i aparaty z dopuszczonego projektu

**Zatwierdzona referencja projektowa właściciela, 13.11.2026.** Dokładne nazwy elementów i parametry pochodzą z dostarczonych tomów P1 (obwody pierwotne) i P2 (wtórne). Dokumenty te nie znajdują się w repo. **Nie należy przedstawiać wyciągu projektowego jako oficjalnego katalogu producenta dla wszystkich jego wersji.** Projekt jest przyjętym wzorcem wykonawczym w swojej konfiguracji i zakresie modernizacji.

## Co realnie dodano do istniejącego pakietu producenta

**Plik danych:** `backend/src/reference_engine/packs/elektrometal_e2alpha/approved_project_fields.json`

- **86 typów** aparatów, podzespołów i materiałów, z producentem (lub jawnym brakiem), oznaczeniem, parametrami i stroną pochodzenia;
- **7 profili** kompletnych pól lub zakresów modernizacji;
- **10 anonimowych instancji referencyjnych** (identyfikatory są syntetyczne, nie pochodzą ze stacji);
- **4 grupy** wyposażenia wspólnego i pomocniczego, w tym łączność bez adresacji;
- dokładna separacja wyposażenia **pierwotnego** od **wtórnego**;
- osobna etykieta: `approved_project_reference / owner_approved`.

Dane są ładowane przez **istniejący** `reference_engine.registry` po `approved_project_reference_file` z pliku `pack.json`. Zwraca je istniejący endpoint:

`GET /api/reference/packs/elektrometal_e2alpha` → `approved_project_reference`.

Nie tworzono osobnego publicznego endpointu, kopii katalogu producenta ani drugiego silnika oceny. Dodane są typowane struktury Pydantic i weryfikacja referencji urządzeń, ilości oraz unikalności. **Nie są jeszcze montowane jako gotowy `Bay` w kreatorze**; wymagają przypisania do istniejących ENM `BayPrimaryDevice`, `ProtectionDevice`, CT/VT, według właściwej karty wykonawczej.

## Profile pól

| Kod | Rodzaj | Pierwotne | Wtórne | Zakres |
|---|---|---|---|---|
| AIS-VT-3W | Pole pomiaru napięcia | e²ALPHA, człon izolacyjny szyn 630 A, osobny człon VT, 3× ALCE VBF12-FE, 3× wkładka VT 0,5 A | e²TANGO-800 J6, ABB VT Guard PRO, R15, Apator, Eaton, WAGO listwa 10-torowa, Pozyton, zabezpieczenia pomocnicze | Modernizacja istniejącej rozdzielnicy 15 kV, urządzenia 17,5 kV |
| AIS-LINE-CT1 | Pole liniowe z zabezpieczeniowym CT | e²BRAVO 17,5 kV/630 A/25 kA wysuwny, 3× ALCE AB12 200–400/5 A kl. 5P20, 3× VT, Ferranti, uziemnik, człon VT, wskaźnik | e²TANGO-800 J6, R15, RA70, RU-400, Apator, Eaton, listwa WAGO 18-torowa | Modernizacja linii SN |
| AIS-LINE-CT3 | Pole liniowe z pomiarem energii i EAZ | e²BRAVO, 3× ALCE AB12 200–400/5/5/5 A (2 rdzenie 0,2S FS5 i rdzeń 5P20), 3× VT, Ferranti, uziemnik, osprzęt kablowy | jw. i Pozyton SKA-P1, zestaw plombowany Legrand/ETI/Weidmüller | Modernizacja linii SN |
| RETRO-TR-SEC | Obwody wtórne pola TR | **Nie określono pełnego wyposażenia pierwotnego** z samych wtórnych | e²TANGO-800 J10, Lumel ND30, 22-pozycyjna listwa WAGO, Relpol, Apator, Polam, Eaton | Doposażenie istniejącego pola |
| RETRO-ZU | Zespół uziemiający | GS24a, zespół AWSCz (stycznik i rezystor oddzielnie), ETI HVL2/PSH2/NVLI2 | e²TANGO-800 J10, listwa WAGO 19 pozycji, ELBAR, Polam, Promet, Relpol | Modernizacja istniejącego ZU |
| RETRO-COUPLER-SEC | Obwody wtórne sprzęgła | **Nie definiuje pierwotnego toru sprzęgła** | Eaton, Relpol, Weidmüller i materiały połączeniowe | Doposażenie sprzęgła |
| RETRO-AUX-FEEDERS | Wtórne istniejących pól liniowych | Bez rekonstrukcji strony pierwotnej | Apator 4G10-92, Weidmüller, przewody i zakończenia | Doposażenie istniejących pól |

## Kluczowe parametry z projektu — zachować bez nadinterpretacji

- e²BRAVO EV-1: **17,5 kV, 630 A, 25 kA**, wykonanie wysuwne; zasilanie sterowania **220 V DC**.
- ALCE AB12 zabezpieczeniowy: **200–400/5 A**, jeden rdzeń **15 VA kl. 5P20**; `Ith = 25 kA / 1 s`, `Idyn = 62,5 kA`.
- ALCE AB12 pomiarowo-zabezpieczeniowy: **200–400/5/5/5 A**, rdzenie **2× 10 VA 0,2S FS5 i 1× 15 VA 5P20**.
- ALCE VBF12-FE: trzy uzwojenia wtórne; profil pomiaru napięcia i profil pola liniowego mają różne klasy i obciążenia znamionowe; z P1 należy zachować uwagę dotyczącą niejednolitego zapisu uzwojenia trzeciego.
- Projekt modernizacji przewiduje wkładki VT **0,5 A**. **Nie stosować tego automatycznie w nowym GPZ ENEA**, gdzie obowiązuje inne wymaganie §13.
- Zapis „e²DELTA” w opisie i „UMR” w zestawieniu uziemnika **nie oznacza automatycznie dwóch uziemników w jednym polu** — potrzebna korelacja oznaczeń z wybranym aparatem.
- e²TANGO-800 ma różne warianty J6/J10 i różne profile funkcji; nie utożsamiać urządzenia, krzywej zabezpieczenia ani grupy nastaw.
- Dane projektowe dotyczą **modernizacji rozdzielnicy z aparatami 17,5 kV**. Nie zastępują aktualnego katalogowego doboru nowego pola GPZ 24 kV ani warunków ENEA Z.7.

## Co zyskuje kreator MV-DESIGN-PRO po integracji

1. Po wyborze **Elektrometal → e²ALPHA → Typ pola** użytkownik może zobaczyć trzy kompletne, zatwierdzone zestawienia i osobno cztery profile doposażeniowe.
2. Lista wyposażenia jest **hierarchiczna**: aparat pierwotny (rodzina, pozycja, parametry) → CT/VT (rdzenie/uzwojenia) → IED i funkcje → aparatura pomocnicza → obwody montażowe. Nie pokazywać w SLD lampki, przekaźnika sygnalizacyjnego czy szafy transmisyjnej jako aparatu w torze SN.
3. W kreatorze trzeba udostępnić **„Zastosuj wzorzec referencyjny”** (kopiuje *konfigurację* do nowego pola, z nowymi stabilnymi ID ENM), **„Pokaż wyposażenie”**, **„Sprawdź zgodność ENEA”** i **„Wybierz wykonanie handlowe”**.
4. Parametry, których projekt nie potwierdza, nie są automatycznie uzupełniane z parametrów maksymalnych całej rodziny e²ALPHA.
5. **Nie kopiować rzeczywistych nastaw EAZ ani mapy telemechaniki** do nowego pola; tworzyć nastawy robocze z walidacją i obliczeniem przypadku.
6. Nie łączyć SN i nN na jednym SLD, nie zmieniać `computeLayout` ani jedynej domeny aparatów.

## Granica stanu wdrożenia

**Zrobione:** zanonimizowane dane, model typowany, załadowanie w istniejącym rejestrze i dostęp w istniejącym API, testy integralności zapisane do repo.

**Pozostało dla Opusa:** montowanie wzorca w kreatorze, kontrola wariantu handlowego i dopuszczalności do konkretnego GPZ, inspektor aparatury, odwzorowanie na SLD, eksport BOM i e2e z backendem. Bez tych elementów nie deklarować gotowego importera pełnych pól.

**Walidacja wykonawcza:** testy w repo zapisano, ale w tej sesji nie było możliwości ich uruchomienia na zdalnym checkout. Kod pozostaje do weryfikacji CI. B-02 nadal należy do właściciela.
