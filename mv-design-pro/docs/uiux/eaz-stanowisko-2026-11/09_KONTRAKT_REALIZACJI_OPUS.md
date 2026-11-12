# Kontrakt realizacji przez Opusa — jedna obecna karta EAZ

## Mandat

Właściciel zaakceptował 2026-11-12 **kierunek ekranu trójkolumnowego** oraz **pełny docelowy zakres inżynierski właściwy dla sieci SN**, bazujący na potwierdzonych rozwiązaniach DIgSILENT, ETAP, NEPLAN, EasyPower, CYMTCC, SIPROTEC, PCM600 i SEL. To **misja implementacyjna end-to-end**, a nie tylko analiza. Nie oznacza implementowania wszystkich funkcji każdego produktu, jeśli odnoszą się do SCADA, 110 kV lub nieobsługiwanych analiz.

## Krok 0 — pomiar rzeczywistego stanu

Opus odczytuje aktualne gałęzie/PR i statusy kart: stanowisko 50/51, 51N/67N/admitancyjne, integracja CT/VT i IED, nawigacja/inspektor, zwarcia z OZE, zakres i świeżość wyników. Porównuje ze stanem main oraz własnymi notatkami, dostawcami \`EkranKoordynacji.tsx\`, \`ProtectionCoordinationPage.tsx\`, \`TccChart.tsx\`, \`ADR-022\` i \`PLANS.md\`. Nie zakłada, że historyczny audyt stanowi dzisiejszy fakt.

**Tania delegacja:** równoległe agenty Haiku do (1) przeglądu IEC i źródeł konkurencji, (2) audytu API/DTO, (3) audytu CT/VT i katalogu IED, (4) zmapowania UI/TCC/SLD, (5) testów i znanych błędów. Podagenci podają plik:linia, źródło URL lub numer punktu normy, status dowodowy i propozycję testu; **nie** decydują o architekturze ani nie wdrażają samodzielnie do wspólnych plików.

## Zakres wykonania

1. **P0: poprawność obecnego 50/51.** Kontekst 3F/2F, rzeczywiste prądy dwóch CT, selektywność pojedyncza i zakresowa, czasy całkowite, czułość, robocze/zapisane nastawy, brak fałszywych werdyktów, widoczność Δt na 1280×720.
2. **P0: fizyczne powiązania.** Jeden IED w modelu i katalogu, rdzenie CT/uzwojenia VT z polaryzacją, grupy 1–4 o właściwych zakresach, rzeczywiste trip matrix, obwody wtórne i zapis/odczyt. Właściwy właściciel rdzenia zatwierdza zmianę solvera przed modyfikacją.
3. **P0: następne funkcje.** 50N/51N, 67/67N, admitancyjne (G0/B0/Y0) z prawdziwymi wykresami, polaryzacją i warunkami ziemnopowrotnymi; 87T z kompensacją; LRW/50BF i ZS, SCO i funkcje częstotliwościowe według danych. Kiedy fizyka nie istnieje, najpierw uruchomić/uzgodnić prawdziwe wycinki solvera, a nie rozbudowywać atrapę.
4. **P1: możliwości wzorcowe konkurencji.** Interaktywne etykiety/markery na TCC, edycja z wykresu tylko w bezpiecznym trybie, porównywanie wielu IED, ocena wytrzymałości kabla/TR i CT, analiza najgorszych przypadków, kolejność zadziałania z wyłącznikami, raporty i parametry producenta.
5. **UI/UX i SLD.** Jeden ekran stanowiska z sekcjami funkcji, spójne 1440×900 oraz 1280×720; jedna droga na SLD i powrót; terminologia normowa wyłącznie po polsku; widok 50/51 zachowuje zaakceptowany układ.
6. **Weryfikacja:** EAZ-001…EAZ-040, ręczne przeliczenia, iniekcje, e2e z rzeczywistym backendem i zrzuty; osobno pełna regresja integracyjna.

## Zależności i uprawnienia

- \`ADR-022\` jest nadrzędny; jedna domena ASSET, jeden solver IDMT. Jeśli prace wymagają zmiany rdzenia \`network_model\`, Opus nie zakłada zgody — przedstawia konkretną zmianę i testy właścicielowi karty P0 lub architektowi zgodnie z aktualnym podziałem.
- Nie przestawiać automatycznie głównych wydań norm. Źródła licencjonowane nie są kopiowane do publicznego repo. Wpisać do rejestru założeń brak oficjalnej podstawy dla konkretnego IED/funkcji.
- Nie scalać równoległych gałęzi pod pretekstem „jednego ekranu”; integrator porównuje zmiany, zdejmuje duplikaty i odnotowuje kolizje.
- Bez zmiany \`computeLayout\` / \`SldCanvasV3\` dla funkcji EAZ, chyba że wymaga tego udokumentowany kontrakt istniejącej nawigacji i właściwy właściciel.
- Zaplanować przyrosty w **istniejących kartach \`PLANS.md\`** (jeden plan). Nie otwierać konkurencyjnego programu 50/51 lub katalogu norm.

## Dokładne warunki przyjęcia

- Nie ma dwóch źródeł nastaw, prądów, charakterystyk i ID; FROZEN API wersjonowane, backend zna rzeczywisty zakres oceny.
- Każda funkcja ma: źródło danych, warunki ważności, algorytm/normę, przykład referencyjny, test iniekcyjny, zachowanie przy braku danych, widok i eksport.
- Widok 1280×720 pokazuje widoczny wynik Δt przy zachowaniu wykresu i dostępu do nastaw.
- Każda ocena da się odtworzyć po ID punktu, topologii, typu zwarcia, grupie nastaw i rewizji modelu.
- Ekran widoczny w środowisku z prawdziwym backendem; nie wystarczy wpis o wykonaniu i zielone testy.

**B-02** — niezależny odbiór wizualny właściciela. Po ukończeniu każdej serii Opus przedstawia kod, porównanie przed/po, rzeczywiste zrzuty, otwarte odmowy i dowody; nie deklaruje końcowej akceptacji sam.
