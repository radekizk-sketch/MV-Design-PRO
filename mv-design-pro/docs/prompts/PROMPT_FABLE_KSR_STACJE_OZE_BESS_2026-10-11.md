# FABLE — DYREKTYWA PROJEKTOWO-WYKONAWCZA KSR: jedna konfiguracja stacji SN/nN, PCC, OZE i BESS

**Adresat:** Fable, Lead Principal Power Systems Engineer, Chief Domain Architect i integrator produktu MV-DESIGN-PRO. Wykonawcy i recenzenci zgodnie z obowiązującym `CLAUDE.md`, `mv-design-pro/AGENTS.md` i `ORKIESTRACJA_AGENTOW.md`.
**Cel:** zaprojektować, sfalsyfikować, wdrożyć i odebrać spójną ścieżkę użytkownika od inwentaryzacji lub budowy stacji do obliczeń, EAZ, schematu i dokumentacji. Nie twórz nowego produktu, drugiego ENM ani kolejnej warstwy przechowywania. Jednocześnie nie dopasowuj architektury do lokalnego niedoboru UI.

## 0. Mandat i źródła prawdy

1. Zacznij od faktycznego HEAD gałęzi integracyjnej Fable i porównania z `main`, otwartymi PR #477 oraz #478, gałęziami WIP i zapisanymi kartami; zanotuj SHA, stan drzew i zakres nieodebranych zmian. **PR #478 jest szkicem naprawy, NIE wynikiem odebranym.** PR #477 to plan zwarć/EAZ/dynamiki, nie wykonanie.
2. Przeczytaj kolejno: `STAN_REPO.md` §7, `docs/plan/MISJA_DOMKNIECIA_PRODUKTU_2026-09.md`, `docs/plan/MAPA_DOMKNIECIA_PRODUKTU_2026-09.md` §3/§3a/§8, `docs/plan/SYNTEZA_DOMKNIECIA_PRODUKTU_2026-09.md`, `docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` §5/§7/§11–13, `docs/plan/KARTY_OTWARTE_2026-09.md`, `docs/v12xx/KANON_V12_XX.md`, `docs/system/SPEC_*.md`, `docs/domain/KONFIGURATOR_ROZDZIELNIC_SN_RMU.md`, `docs/sld/STACJE_ELEKTROENERGETYCZNE_PROJECT_STANDARD.md`.
3. Materiał wejściowy (nieautorytatywny, dopóki nie sprawdzisz na bieżącej bazie): `docs/analysis/KSR_AUDYT_GLOBALNY_OZE_BESS_2026_10_11.md` na gałęzi PR #478, lista KSR-G01…G14. Nie zgaduj brakujących katalogów, wersji norm ani wariantów fabrycznych. Proweniencja i data źródła są obowiązkowe.
4. **Zakres:** projektowanie i weryfikacja SN i nN; granica zasilania WN reprezentowana równoważnikiem/istniejącym GPZ, ale **bez projektowania WN/SN**. Wszelkie przykłady są anonimowe. Język projektanta polski normowy. Istniejący `SldCanvasV3` jest obowiązującym rendererem — brak makiet z fikcyjnym SLD.
5. Istniejące bramki są nienaruszalne: B-01 (zamrożone rdzenie, zmiany tylko po jawnej zgodzie i procedurze), B-02 (werdykt wizualny właściciela). Nie przesuwaj ich na „zielony” na podstawie testów snapshotowych.

## 1. Zanim zaprojektujesz: falsyfikowalna inwentaryzacja AS-IS

Wyprowadź rzeczywisty łańcuch wywołań i pisarzy dla: `frontend/src/ui/network-build/station-templates/StationTemplateWizard.tsx`; `station-configurator/StationConfigurator.tsx`; `station-der/AddDerWizard.tsx`; `backend/src/application/station_templates/{schema,apply}.py`; `backend/src/api/{station_templates,switchgear_config,audit2_station_config}.py`; `backend/src/domain/switchgear_config.py`; `backend/src/network_model/catalog/switchgear/{families,factory_configuration,family_validation}.py`; `backend/src/enm/{models,domain_operations,domain_operations_v2,pole_katalogowe,store}.py`; `backend/src/solver_input/{builder,eligibility}.py`; `backend/src/application/analyses/protection/`; `backend/src/network_model/solvers/`; `frontend/src/ui/sld/v3/{scene,canvas}/`; eksportów i raportów.

Dla każdego elementu podaj: istniejący obiekt/port/stan w ENM, jednoznaczne źródło katalogowe, trasę HTTP i konsumenta, operację mutującą, zależności obliczeń, stan trwałego zapisu, test pozytywny i test, który powinien upaść po wprowadzeniu błędu. Rozróżnij **POTWIERDZONE W KODZIE**, **POTWIERDZONE W BIEGU**, **HIPOTEZA**, **BRAK DANYCH**, **ODRZUCONE**. Weryfikuj również to, co może już być poprawione na innej gałęzi — nie dubluj pracy.

## 2. Projekt docelowy: trzy warianty i decyzja architekta

Zaproponuj co najmniej trzy realistyczne warianty scalenia konfiguratora z ENM i katalogami, bez drugiego modelu sieci:
A. Bezpośrednie operacje kanoniczne ENM + katalogowy plan pola jako wejście;
B. Jeden kanoniczny agregat konfiguracji stacji przechowywany w ramach modelu/projekcji ENM;
C. Istniejący projektowy magazyn konfiguracji jako świadoma projekcja tylko edycyjna, z materializacją i walidacją do ENM.
Porównaj: jednoznaczność tożsamości danych, atomowość zmian, trwałość, zgodność z W5, przywrócenie stanu, inwalidację wyników, koszt migracji/likwidacji prototypów, testowalność i realną kompatybilność z kanonem. Wybierz JEDEN kierunek na podstawie repo, podaj decyzję architektoniczną, kontrakt domenowy i plan usunięcia duplikacji. Wariant niezgodny z nadrzędną specyfikacją musi zostać odrzucony, nawet gdy jest prostszy.

## 3. Niezmienniki, które mają obowiązywać w CAŁYM produkcie

**KSR-01 Trwałość / tożsamość.** Nie wolno publikować jako zatwierdzonego stanu konfiguracji istniejącej tylko w `api/switchgear_config.py::_config_store`. Stwierdź, którzy konsumenci rzeczywiście korzystają z prototypu, a którzy z ORM/ENM. Zaprojektuj jeden kanoniczny zapis, klucz projektu i stacji, rewizję, transakcję, zapis–odczyt po restarcie, historię i invalidację wyników. Nie twórz trzeciego magazynu.

**KSR-02 Funkcja pola ≠ aparat.** Zastąp założenia `LINE_IN/OUT/BRANCH -> CB`, `TRANSFORMER_SN_NN -> CB+CT+RELAY` i `PV/BESS -> TR w TYM polu` warunkami wynikającymi z `CompleteMvBayTemplate`, producenta, dopuszczalnego wyposażenia, zacisków i REALNEJ ścieżki galwanicznej. Różnicuj wyłącznik, rozłącznik, rozłącznik bezpiecznikowy, odłącznik, uziemnik, CT, VT, głowicę, VPIS. Udział TR wynika z trasy połączenia i wariantu napięcia, a nie z ikony pola.

**KSR-03 Dwa tryby pracy projektanta.** Rozróżnij inwentaryzację istniejącej sieci (parametry i aparaty rzeczywiście obecne, również historyczne, z poziomem wiarygodności) od projektowania nowej stacji/pola i od PCC ku sieci istniejącej. Oba tryby modyfikują TEN SAM ENM, ale mają odrębne wymagania proweniencji i zakazu domyślnego zatwierdzania katalogów.

**KSR-04 Zgodność fizyczna.** Każda stacja końcowa, przelotowa, odgałęźna, rozdzielcza, abonencka, OZE, BESS i hybrydowa ma pełne połączenia: zacisk / głowica kabla / aparat / szyna / transformator (jeśli istnieje) / odbiór lub źródło / PCC. Sekcje, sprzęgła OPEN/CLOSED, uziemniki i NOP zmieniają rzeczywisty graf. Napięcia strony SN i nN wynikają z rzeczywistych katalogów i warunków przyłączenia. Uziemienie GPZ **nie może milcząco przyjmować `isolated` jako faktu**; nN **nie może milcząco przyjmować 0,4 kV** dla brakujących danych TR. Brak parametrów → kod gotowości z akcją, nigdy autorytatywny wynik.

**KSR-05 PV/BESS/wiatr/generator synchroniczny.** Parametryzacja jawna per jednostka i grupa: liczba urządzeń, identyfikacja katalogowa, `P_n`, `S_n`, `U_n`, moce i limity `P/Q`, wariant przyłączenia, TR blokowy, `u_k`, połączenie transformatora, profil regulacji i sterowania, przyporządkowanie PCC, klasa NC RfG/Ptpiree wyłącznie z właściwej podstawy. Dla BESS także `E_n` [MWh], `SOC_0`, `SOC_min/max`, sprawności, granice ładowania/rozładowania, ograniczenia PCS i zakres GFL/GFM. Sprawdź, które parametry kod naprawdę posiada, a których brak w katalogu; brak nie może zostać podstawiony stałą.

**KSR-06 Spójność mieszanki DER.** Zgodność liczby PV/BESS, katalogu, mocy TR, torów fizycznych, gotowości i podglądu. PR #478 podlega odbiorowi adwersaryjnemu przeciwko `O-53b` (sumy mocy), `POLA-W-TORZE`, `GOTOWOSC-DER-BACKEND`, `SIEC-ZLOTA-KATALOG`. Testy dla 4×PV+1×BESS i 10×PV+3×BESS, po zmianie składu; wykaz poprawnego wyboru TR lub nazwanej odmowy. Opis szablonu nie jest dowodem mocy baterii MWh.

**KSR-07 Jedna fizyka.** Obliczenia przepływu (NR/GS/FD/BFS), IEC 60909, doziemne i składowe sekwencyjne, obciążalność kabli i TR, I²t, dobór wyłączalności oraz EAZ mają pochodzić z kanonicznych biegów i aktualnego grafu. `k_sc` bez źródła jest `DEFAULT_FORBIDDEN` dla decyzji doborowej. Nie kopiuj obliczeń do formularzy lub SLD. Zsynchronizuj tę kartę z PR #477 i SC-P0-IB / SC-P0-C / SC-P0-SNN / SOL-P0-EAZ-PRAD / SOL-P0-EAZ-CT; nie poprawiaj fizyki w eksporcie. Wydanie normy 2026 wymaga osobnego dowodu względem dokumentów źródłowych.

**KSR-08 Gotowość zabezpieczeń.** Tor EAZ od rzeczywistego CT/VT, zacisku, przekaźnika, jego nastaw i charakterystyki, wiązania z rzeczywistym aparatem oraz pełnego czasu wyłączenia; zachowanie przy zasilaniu zwrotnym BESS, SPZ/SZR, zaniku i izolacji wyspy. Dodatkowo pola muszą mieć odzwierciedlone obwody wtórne, blokady i wymaganą aparaturę, gdy dane istnieją; brak DTR/e²TANGO/charakterystyki/cewki nie może generować pozytywnego werdyktu.

**KSR-09 Dynamika i zakres stosowalności.** Nie deklaruj zwalidowanej odpowiedzi FRT/GFL/GFM/BESS bez wyroczni właściwej rodziny, zakresu ważności i śladu. Znana granica `dynamika/urzadzenia/magazyn.py` przy osiągnięciu SOC nie jest implementacją pełnego BMS — przekroczenie zakresu propaguj do wyników i raportu jako jawne ograniczenie. Nie dubluj istniejącego AB-1b.2 i W6-F.

**KSR-10 SLD i dokumentacja.** `SldCanvasV3` jest WYŁĄCZNIE projekcją ENM, a nie źródłem topologii. Każda operacja, aparat, port, sekcja i połączenie widoczne na SLD ma klucz modelu i odwrotną nawigację do konfiguratora. Symbole według PN-EN 60617, kolejność aparatów zgodnie z kontraktem. LOD 0/1/2 mogą zmieniać szczegółowość, nie fizyczną łączność; żadnych fikcyjnych źródeł i domyślnych aparatów. Raport PDF/DOCX oraz dowód A–D zawierają te same wyniki, proweniencję katalogu, numer biegu i stan gotowości.

## 4. Oczekiwane rozwiązanie projektowe i pełna edycja danych

Zaprojektuj jeden uporządkowany tok użytkownika: (1) istniejąca sieć lub projekt nowej stacji, (2) położenie i topologia na istniejącym ENM, (3) producent/rodzina/konfiguracja fabryczna/blok RMU albo jawna konfiguracja modularna, (4) wyposażenie pól i połączenia, (5) TR oraz strona nN, (6) PCC, typ i liczba PV/BESS/wiatr/maszyna, (7) aparatura CT/VT, EAZ, sterowanie, obwody wtórne, (8) automatyczna ocena gotowości i kompletności, (9) obliczenia i warianty, (10) SLD/wyniki/dowód/raport, (11) trwały zapis i ponowne otwarcie. Minimalizuj ręczne wpisy przez listy zweryfikowanych pozycji i pola dziedziczone z katalogu; każde dziedziczenie ma podany dokument, wydanie i możliwość jawnego uzasadnionego nadpisania. Pokazuj wartości wejściowe i obliczone osobno. UI ciemny, czytelny, całkowicie po polsku, bez nazw projektowych.

Dostarcz **faktyczny kontrakt**: graf encji i portów, niezmienniki, typowane request/response, model błędów/FixAction, mechanizm atomowego zapisu, mapowanie szablonu katalogowego na ENM, macierz wpływu zmiany na bieg/SLD/dowód. Dla brakujących danych: status i dokładna akcja, nie zgadywanie. Trzy warianty kierunkowe UX ocenione przeciwko prawdziwej ścieżce zadaniowej; wybierz jeden i dopiero potem wdrażaj.

## 5. Wymagane testy, wyrocznie, negatywne sondy

Zastosuj macierz **KSR-G01…G14** z audytu wraz z:
- warunki graniczne napięcia 15/20 kV i TR 15/0,4; otwarcie/zamknięcie sprzęgła i uziemnika; rozgałęzienie i zasilanie zwrotne; brak CT, katalogu, k_sc, czasu wyłącznika, typu neutralnego;
- test mutacyjny „usuń aparat z toru” oraz „podmień rodzaj pola”; zatwierdzenie musi odrzucić konfigurację niefizyczną;
- test trwałości między procesami: zapis API → restart/ponowne połączenie → identyczny ENM + SLD + powiązania z wynikami;
- test wzajemnej zgodności preview/API/ENM/solver/SLD/raport dla źródeł PV, BESS, hybrydy, wiatru i maszyny synchronicznej; brak jednostki katalogowej albo mocy MWh oznacza jawny brak gotowości, nie wygenerowaną liczbę;
- piny niezmienników `S_n`, `P`, `Q`, bilansów KCL/KVL, prądu zwarcia przy zaciskach EAZ, wytrzymałości zwarciowej, inwalidacji wyników oraz zgodności White Box z wynikiem serwera;
- kontrprzykłady odmów (brak danych, przekroczone S_n/I_n, uszkodzona ścieżka, SOC poza zakresem, niepoparte wydanie normy, złe napięcie TR);
- wyrocznie numeryczne niezależne dla każdej użytej metody; raportuj wersję normy i zakres porównania. Nie uznawaj samopotwierdzających fikstur za zewnętrzną wyrocznię;
- testy regresji całej klasy szablonów, w tym typowe SN/nN, rozdzielcze i RMU, a nie tylko dwóch hybryd.

Każdy test ma: identyfikator, wejścia, oczekiwany rezultat, źródło oczekiwania, kod elementu, wynik CI, jeden test negatywny/mutacyjny. Nie deklaruj PASS bez uruchomionego biegu. Nie osłabiaj testów na zielono przez pomijanie.

## 6. Orkiestracja i raport wykonania

Podziel wykonanie na niezależne karty z jednym integratorem Fable (podział wg granic własności, nie według ekranów):
- **KSR-P0-ZAPIS**: trwałość konfiguracji, kanoniczny ENM, transakcje, inwalidacja;
- **KSR-P0-POLA**: wyposażenie producenta/RMU, tor galwaniczny i głowice; powiązanie z `POLA-W-TORZE`;
- **KSR-P0-ZRODLA**: katalogowa mieszanka PV/BESS i zdolności TR/PCC; odbiór PR #478, `O-53b`;
- **KSR-P0-DANE**: uziemienie SN, napięcie nN, brak domyślnych parametrów; `CICHE-ZERO`, W5;
- **KSR-P1-BESS-EAZ**: pełna konfiguracja PCS/SOC/sterowania i pomiarów, EAZ, GFL/GFM i własność wyniku; `AB-1b.2`, `W6-F`, `BIEG-ZABEZPIECZEN-Z-MODELU`;
- **KSR-P1-SLD-RAPORT**: kompletność wizualizacji i dowodów z jednego ENM; `SLD-SUBSTRAT`, B-02.

Zależności: KSR-P0-ZAPIS i ustalenie kanonu modelu → KSR-P0-POLA/KSR-P0-ZRODLA → KSR-P0-DANE + EAZ → KSR-P1-SLD-RAPORT. Niezależne przeglądy mogą iść równolegle, ale dowód E2E musi dotyczyć jednej scalonej gałęzi. Zależności merytoryczne z `SC-P0-SNN`, `O-53b`, `W5`, `AB-1b.2`, `W6-F` są obowiązujące; nie twórz duplikatów kart.

**Artefakty zakończenia:** (a) delta AS-IS z plikami i wierszami, (b) porównanie kierunków A/B/C i wybrany kontrakt, (c) plan aktualizacji kanonicznych kart i statusów w `STAN_REPO.md`/planie A/B/mapie §8 bez restartu, (d) implementacja z dowodem kompilacji i E2E, (e) macierz zgodności norm i katalogów z dokumentami, (f) logi testów, mutacji i wyroczni, (g) dowody SLD do B-02, (h) PR z zakresem, numerami commitów i uczciwym statusem. Niedostępna dokumentacja producenta/normy → jawny brak i blokada autorytatywnego twierdzenia; B-01 i B-02 → STOP odpowiednich obszarów, nie obchodzenie bramek.

**Definicja ukończenia:** projektant tworzy lub aktualizuje rzeczywistą stację SN/nN z OZE/BESS, otrzymuje spójny tor prądowy, wybór z katalogu z proweniencją, wykonuje obliczenia i EAZ z jednego modelu, ogląda ten sam tor na istniejącym SLD V3, drukuje dowód i otwiera po restarcie identyczny projekt. Wynik zawiera źródła i ograniczenia. Zero nowych magazynów prawdy, fikcyjnych aparatów, cichego uziemienia, „autorytatywnych” wyników na domyśle oraz nieodebranych deklaracji DONE.
