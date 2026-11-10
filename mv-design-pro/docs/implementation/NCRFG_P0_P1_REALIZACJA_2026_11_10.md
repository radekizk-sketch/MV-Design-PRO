# NC RfG / WOS / WiPWC / ENEA — P0/P1 rzeczywisty stan implementacji (2026-11-10)

PR implementacyjny: https://github.com/radekizk-sketch/MV-Design-PRO/pull/527
Pełna specyfikacja: https://github.com/radekizk-sketch/MV-Design-PRO/pull/526

## Metoda oceny
100% oznacza: zweryfikowane źródło (wydanie/data/strona), zastosowanie prawne, rzeczywista implementacja zgodna z architekturą bez duplikowania źródeł danych, poprawna obsługa braków, niezależne testy i pełna zielona CI, odbiór API + UI i dowody na rzeczywistym modelu, brak nieudowodnionych twierdzeń SPEŁNIA. Dokumentacja lub sam kod bez walidacji to NIE 100%.

Na początku prac w tej rozmowie P0 oceniono szacunkowo 15%, P1 około 10%. Po kolejnych zmianach procent wymaga ponownej niezależnej walidacji; nie deklarujemy nowego numeru bez uruchomionych testów. GitHub Actions dla gałęzi pozostawały w kolejce; nie ma potwierdzenia przejścia.

## P0 — prace faktycznie wprowadzone
1. WENM: daty wydania warunków, zgłoszenia, modernizacji, oświadczenia PGM A/B/C/D; źródło każdej daty i rygor ISO; zachowane legacy hash. WOS2025 rozpoznawane po właściwym zdarzeniu; bez uruchamiania automatycznej zmiany fizyki.
2. PTPiREE 3.0 rozdział 4 tabela 1 (strony drukowane 5–6): typ i rodzina, test obowiązkowy, warunkowy, warunkowy przy braku certyfikatu. API dla katalogu i zatwierdzonego ENM; bez twierdzenia o wykonaniu prób.
3. WiPWC 1.3 rozdziały 5 i 6 (strony 8 i 13): SYPGM i PPM, typ A–D, cert wymagany/opcjonalny/niedopuszczalny/nie dotyczy. Krzyżowanie z tabelą PTPiREE 3.0. LFSM-O przy PPC zachowuje wymóg badania.
4. WiPWC 1.3 załącznik nr 1 (strony 24–25), §9–10: weryfikacja obecności 21 grup dokumentowych a–u, data wydania i ważność do pięciu lat, daty akceptacji WiPWC1.2, model/firmware i SHA oryginału; wynik nie oznacza uwierzytelnienia podpisu.
5. Bank Nastaw dla Polski v1.1/2024 (załącznik WiPWC1.3): A-nN i B-SN, U/f/LoM i czasy, LFSM-O, B-SN FRT, prąd bierny podczas zwarcia, odbudowa P, resynchronizacja, A-nN Q(U), wskazanie jednostek i stron. Wyłącznie referencja — nie nowe WOS2025 i nie zaakceptowane ustawienia ENEA.
6. PTPiREE: lokalne snapshoty zestawione ze znaną publikacją z 2026-10-26 (WiPWC1.2) i 2026-11-06 (WiPWC1.3), bez udawania aktualizacji 6k+ rzeczywistych rekordów.
7. Certyfikaty w ENM: rzeczywiste firmware instalacji, dowód as-built i numer/protokół, źródłowe porównania katalogu. Nie ma prawa formalnego zatwierdzenia certyfikatu przez app.
8. Audyt warstw: braki w wos.yaml, procedura_ptpiree.yaml, obecnym profilu ENEA i dokumentach programu badań raportowane jako blokery. Żadnego SPELNIA z braku dowodu.

## P1 — prace faktycznie wprowadzone
1. Macierz braków certyfikatów/terenowych prób/dokumentów per PGM z ENM, daty WOS i WiPWC, jawne blokery.
2. Formularzowe / przygotowawcze DI, PGMD, EON, ION, FON, warunkowo LON; brak pozorowanej akceptacji operatora.
3. UI2 OZE: panele źródeł, certyfikatów, dat, braków dowodowych (część prezentacji); obecny ncRfgStore zachowany.
4. Magazyny energii ENEA: odrębny kod bez stosowania NC RfG do standalone BESS, wpis do rejestru dla 50 kW < Pinst <=10 MW (IRiESD I.5.2), 7 dni na zawiadomienie posiadacza MEE w instalacji wytwórczej/odbiorczej (I.5.4) i osobne 14 dni czynności OSD (I.5.3). Nie używa roboczej mocy p_mw jako mocy zainstalowanej.
5. Dokument ENEA IRiESD 2.3 z 19.10.2026, karta 45/2026 i decyzja 19.10.2026 zmieniająca daty wybranych punktów CSiRE; nie nadpisano z tego powodu nastaw EAZ ani wymagań FRT.

## Blokery uniemożliwiające 100% P0
- WOS2025: oficjalny zatwierdzony zestaw wszystkich wartości, wykresów, przypisów i wyjątków w załączniku PSE/URE dostępny jako ZIP; bez pełnego odczytu oryginału nie wolno przenosić liczb z projektu ani WOS2018. Wydanie nadal NIE WSTRZYKNIĘTE do solvera i brak niezależnych testów fizyki.
- PTPiREE wykaz aktualny: pełne oficjalne wiersze/strony/sha zweryfikowane dla publikacji 2026-10/11, różnice do historycznych rekordów, ważność certyfikatu, autentyczność, akredytacja, podpis.
- PTPiREE 3.0 załączniki ZIP: pełne programy ramowe, warunki początkowe, liczby, progi, dokładność, protokoły i scenariusze; 20 testów wewnętrznych != 20 oficjalnie wykonanych prób.
- ENEA: aktualna podstawa dla wszystkich nastaw i opcji operatorskich, indywidualne warunki, profile WOS i warianty sterowania; karta 45/2026 nie dotyczy automatycznie techniki zabezpieczeniowej.
- Brak potwierdzonego przejścia regresji CI, uruchomienia rzeczywistej aplikacji i niezależnej recenzji normatywnej.

## Blokery uniemożliwiające 100% P1
- Rzeczywiste pliki certyfikatów, akredytacje, podpisy, ocena WOS/firmware/typu MWE i decyzja operatora.
- Wykonane i potwierdzone próby terenowe, pomiary P(t), Q(t), U(t), f(t), Id/Iq(t), oscylogramy, kalibracja, raporty i walidacja modeli RMS/EMT.
- Pełne dokumenty PGMD/DI/EON/ION/LON/FON oraz formalne podpisane statusy, proof_pack, historia i kontrola dostępu.
- Pełne wymagania dla BESS (SN/NN, ochrona, telemechanika, PPC/EMS, tryby import/eksport) z obowiązujących regulacji i warunków przyłączenia. Aktualny kod pokrywa wyłącznie obowiązki rejestrowe I.5.
- Certyfikaty i FAT/SAT aparatury SN, CT/VT, EAZ, transformatorów i lokalne sprawdzenie układu.
- Podpisany odbiór testów i scenariuszy w UI, utrzymanie wersji i odtwarzalności decyzji.

## Reguły bezpieczeństwa
Nie dotykać istniejącego solvera ncrfg_ptpiree.engine jako źródła prawa. Nie zastępować 7 warstw loadera, model_bridge, Werdykt ani ENM. Nie klonować licencjonowanych pełnych norm i PDF certyfikatów do repo. Brak podstawy/oryginału/testu = NIE_OCENIONO / NIEUSTALONE; nigdy PASS. Zatwierdzenie źródeł i projektów należy do właściwego człowieka/operatora. Nie merge'ować PR #527 bez CI i niezależnego review.

## Podstawy źródłowe
- https://www.pse.pl/kodeksy/rfg
- https://ptpiree.pl/kodeksy-sieci/procedura-testowania/
- https://ptpiree.pl/wp-content/uploads/2025/12/Procedura-testowania_wer_3.0.pdf
- https://ptpiree.pl/wp-content/uploads/2024/12/wipwc_2024_10_01-1.pdf
- https://ptpiree.pl/wp-content/uploads/2024/12/bn_2024_10_01-1.pdf
- https://ptpiree.pl/kodeksy-sieci/wykaz-certyfikatow/
- https://www.operator.enea.pl/uslugi-dystrybucyjne/iriesd
- https://www.operator.enea.pl/przylaczenie-do-sieci/magazyny-energii-elektrycznej
- https://www.operator.enea.pl/o-spolce/teczka-prasowa/komunikaty/komunikat-enea-operator-sp-z-oo-dotyczacy-instrukcji-ruchu-i-119
