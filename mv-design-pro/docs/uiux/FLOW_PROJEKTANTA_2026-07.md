# FLOW PROJEKTANTA — GLOBALNA SPECYFIKACJA PROWADZĄCEGO UI (2026-07-18)

**Status:** WIĄŻĄCA specyfikacja programowa (dyrektywa właściciela 2026-07-18)
· podporządkowana kanonowi V12.xx co do ZDOLNOŚCI, nadrzędna wobec wszystkich
ekranów co do UX · uzupełnia `PROGRAM_UIUX_2026-07.md` (sekcja 2.4) ·
konflikt z interpretacją kanonu zarejestrowany jako **V12K-041**.

## 0. Zasady twarde (dyrektywa właściciela — cytat intencji)

> „Stare ekrany nie mogą być kanoniczne, bo były słabe. Od początku projektować
> flow projektanta, żeby UI było prowadzące i intuicyjne. Myśleć globalnie:
> co inżynier na jakim etapie pracy potrzebuje."

1. **Kanon V12.xx = rejestr ZDOLNOŚCI, nie ekranów.** Żaden ekran legacy
   (`ui/**`, most) nie jest wzorcem docelowym ani „kanonicznym dostawcą" —
   jest TYMCZASOWYM dostawcą zdolności z terminem wygaszenia. Parytet przy
   wygaszaniu (Bramka Parytetu) dotyczy ZDOLNOŚCI (co się da zrobić), nigdy
   układu, kompozycji ani stylu starego ekranu.
2. **Każdy nowy ekran projektuje się OD ETAPU FLOW, nie od starego ekranu.**
   Pytanie wyjściowe karty: „na którym etapie pracy jest inżynier i czego
   potrzebuje, żeby przejść dalej?" — nigdy „jak przenieść stary widok".
3. **Kontrakt ekranu prowadzącego** (obowiązkowy dla każdego nowego ekranu):
   (a) deklaracja celu jednym zdaniem u góry,
   (b) stan łańcucha pracy — czego z poprzednich etapów brakuje, ze statusem
       i AKCJĄ NAPRAWCZĄ prowadzącą we właściwe miejsce (wzorzec „Tor pracy"
       z `EkranAnalizTechnicznych` — referencyjna implementacja),
   (c) uczciwe stany zerowe (brak danych = instrukcja, nie pusta tabela),
   (d) następny krok — ekran podpowiada, co zrobić po zakończeniu pracy na nim,
   (e) język inżynierski: każda akcja mówi „po co, z czego, co daje"
       (opis + źródło danych + wymagania, jak karty analiz).
4. **System wizualny:** wyłącznie tokeny `--mvd-*`, jedna skala promieni
   (10 px sekcja / 8 px karta / 999 px chip), etykiety mono, oba motywy.
5. Fizyka i werdykty wyłącznie z backendu (bez zmian — CLAUDE.md).
6. **Zdolność bez realnego dostawcy = defekt uzupełniany NATYCHMIAST end-to-end**
   (dyrektywa właściciela 2026-07-18: „tego typu braki zawsze uzupełniasz
   end-to-end, nigdy nic na potem"). Wykrycie phantoma (componentKey bez
   komponentu, ekran-atrapa, martwa zdolność) ⇒ karta realnego dostawcy
   w TEJ samej kolejce, przed nowymi funkcjami; rejestr „do zlecenia" nie
   jest poczekalnią — pozycje schodzą na bieżąco.

## 1. Etapy pracy inżyniera (globalna mapa)

Rzeczywisty cykl pracy projektanta sieci SN (od zlecenia do odbioru).
Każdy etap: **potrzebuje** (wejścia/decyzje) → **UI prowadzi** (co powłoka ma
podpowiadać) → **pokrycie** (dzisiejszy dostawca) → **luka/plan**.

### E1 · Zlecenie i dane wejściowe
- **Potrzebuje:** założenie projektu; warunki przyłączenia i dane OSD
  (Sk″, U, wymagany cosφ); tryb pracy (AS-IS/projektowy).
- **UI prowadzi:** pulpit projektu z łańcuchem „co dalej" (dane OSD → model);
  brak danych = akcja, nie pusty formularz.
- **Pokrycie:** przestrzeń „Projekt" (ui2) + pulpit projektów (most #dashboard).
- **Luka:** pulpit projektów = legacy; brak kreatora „warunki przyłączenia"
  jako jawnego kroku wejściowego. → karta F-E1.

### E2 · Budowa modelu sieci
- **Potrzebuje:** GPZ z parametrami zwarciowymi, magistrala SN, stacje,
  układy PV/BESS/FW — wszystko z katalogów (zero ręcznych impedancji);
  podgląd konsekwencji doboru (ΔU, prąd znamionowy — z backendu, R1).
- **UI prowadzi:** kanwa SLD v3 + karta techniczna krok-po-kroku (istnieje:
  onboarding „Wybierz wariant GPZ i rozpocznij ciąg SN"); zgodność
  referencyjna NA ŻYWO (Reference Engine) jako asysta, nie kara.
- **Pokrycie:** przestrzenie „Model sieci"/„Schemat (SLD)" — poziom dobry.
- **Luka:** relokacja pozostałej fizyki kreatora (R2: Ik3, prądy znamionowe
  transformatora); podpowiedzi następnego kroku po domknięciu modelu
  (→ Gotowość). → karty R2, F-E2.

### E3 · Gotowość obliczeniowa
- **Potrzebuje:** jedna lista blokerów/ostrzeżeń z akcjami naprawczymi;
  zgodność referencyjna (normy/producenci/OSD) z nawigacją do elementu.
- **UI prowadzi:** bramka „możesz liczyć / napraw to najpierw" + skok
  do obliczeń jednym działaniem.
- **Pokrycie:** przestrzeń „Gotowość" (ui2, REF-A) — poziom dobry.
- **Luka:** brak jawnego „następnego kroku" (przycisk → Obliczenia
  po zielonej bramce). → karta F-E3 (mała).

### E4 · Warianty i obliczenia
- **Potrzebuje:** warianty pracy sieci (przypadki) z konfiguracją PF/SC/OZE;
  uruchomienie i status przebiegów; historia z odciskami (determinizm).
- **UI prowadzi:** „czego brakuje do startu" (model? wariant?), po zakończeniu
  przebiegu — skok do wyników jednym działaniem.
- **Pokrycie:** przestrzeń „Obliczenia" (przypadki + przebiegi, ui2).
- **Luka:** po DONE brak prowadzenia do właściwej zakładki wyników. → F-E4.

### E5 · Interpretacja wyników
- **Potrzebuje:** wyniki per obiekt (rozpływ/zwarcia), dowód WHITE BOX,
  jakość, porównania A/B, analizy specjalistyczne.
- **UI prowadzi:** hub „Analizy techniczne" (przebudowany — referencja
  wzorca); karty mówią czego wymagają i skąd biorą dane.
- **Pokrycie:** warsztat „Wyniki i dowody" (ui2) + hub po przebudowie.
- **Luka:** powierzchnie-dzieci mostu (E-28…E-34) wciąż legacy W WYGLĄDZIE —
  do przeprojektowania od flow (nie od starego ekranu), po jednym wzorcu
  „ekran analizy = werdykt + wartości + założenia + ślad". → epika F-E5.

### E6 · Decyzje projektowe (dobory) — iteracja do E2
- **Potrzebuje:** dobór kabla (ΔU/obciążalność — R1 ✓), dobór kompensacji
  (P42 ✓ z rozdziałem cosφ), nastawy zabezpieczeń; każda decyzja wraca
  do modelu (iteracja) z widocznym skutkiem.
- **UI prowadzi:** z wyniku/werdyktu wprost do miejsca decyzji (np. z analizy
  spadków → konfigurator odcinka); po zmianie modelu — jawna informacja
  o unieważnieniu wyników (Case Immutability).
- **Pokrycie:** częściowe (kompensacja ✓, kabel w kreatorze ✓).
- **Luka:** pętla wynik→decyzja→model bez prowadzenia (ręczna nawigacja);
  nastawy zabezpieczeń w moście. → epika F-E6.

### E7 · Zgodność i uzgodnienia (OZE/OSD)
- **Potrzebuje:** NC RfG (macierz, FRT/HVRT), odpowiedź OSD, zdolność
  przyłączeniowa, certyfikaty.
- **UI prowadzi:** strumień OZE (9 zakładek ✓) + dokumenty z bramką braków
  (422 z listą braków — istnieje).
- **Pokrycie:** dobre (fala 3 OZE + E13).
- **Luka:** wejścia z SLD (`show-ncrfg`) celują w legacy widok NC RfG zamiast
  macierzy ui2 — wymaga mostu nawigacji między-powłokowej. → F-E7.

### E8 · Dokumentacja i odbiór
- **Potrzebuje:** raporty (PDF/DOCX deterministyczne), studium, wniosek OSD,
  zgodność powykonawcza (pomiary z obiektu ✓).
- **UI prowadzi:** dokumentacja jako DOMKNIĘCIE łańcucha: pokazuje z jakiego
  przebiegu/wersji modelu powstaje dokument (reprodukowalność).
- **Pokrycie:** przestrzeń „Dokumentacja" = most (E-25); okna dokumentów OZE ✓.
- **Luka:** przestrzeń dokumentacji do przebudowy od flow (hub dokumentów
  per etap odbioru — analogia huba analiz). → epika F-E8.

## 2. Priorytety przebudów (wg bólu inżyniera, nie wieku kodu)
1. **F-E5** — powierzchnie analiz (E-28…E-34) po wzorcu „ekran analizy";
2. **F-E8** — hub dokumentacji (domknięcie łańcucha, wysoka wartość odbiorowa);
3. **F-E6** — pętla decyzji (wynik→model) + nastawy zabezpieczeń;
4. **F-E1** — pulpit projektu z warunkami przyłączenia;
5. **F-E3/F-E4** — małe karty „następny krok" (szybkie zwycięstwa);
6. **F-E7** — przekierowanie wejść SLD na dostawców ui2.

## 3. Rejestr realizacji

> **Weryfikacja 2026-07-28 (dryf rejestru).** Pięć wierszy stało jako „w toku"/„do zlecenia",
> choć praca była dostarczona w późniejszych kartach — rejestr LIVING nie był aktualizowany
> po scaleniu. Stan każdej pozycji sprawdzony w KODZIE (nie w dokumencie); jeden wiersz
> okazał się częściowy (F-E6.2 — koordynacja), reszta domknięta. Wniosek procesowy: wiersz
> rejestru ma być aktualizowany w tym samym commicie, co dostarczenie karty.
| Karta | Etap | Stan |
|---|---|---|
| (wzorzec) EkranAnalizTechnicznych | E5-hub | ✅ 2026-07-18 (`75c156cb`) |
| R1 ΔU/prąd kabla → backend | E2/E6 | ✅ 2026-07-18 (`2057b47a`) |
| R2 Ik3/prądy znamionowe → backend | E2 | ✅ 2026-07-18 (martwy łańcuch Ik3 usunięty — zdolność = solver IEC 60909 przez grid-source-preview; I1/I2 transformatora → `transformer-rated-currents-preview`, parytet ≤1e-6; 100/√3 = stała katalogowa IEC 61869-3) |
| F-E3 „następny krok" po zielonej bramce | E3 | ✅ 2026-07-18 (PanelGotowosci: sekcja przy zielonej bramce → Obliczenia) |
| F-E4 „następny krok" po DONE | E4 | ✅ 2026-07-18 (SzczegolyPrzebiegu: DONE → Wyniki, zdanie per rodzaj) |
| R3 uziemienie + koordynacja IEC 60255 | E5/E6 | ✅ 2026-07-18 — **EPIKA FIZYKI W UI DOMKNIĘTA** (5 sierot fizyki usuniętych; zdolności backendu: fault_loop/pack Earthing, SelectivityCheck, TCCCurveResponse) |
| F-E5a ekran kontraktu analizy (dostawca E-29…E-34) | E5 | ✅ 2026-07-18 (`5077ba2a` — EkranKontraktuAnalizy ui2: cel inżynierski per obszar, uczciwy stan zerowy z akcją, parytet wierszy 1:1, componentKey=metadana) |
| F-E5b koordynacja zabezpieczeń E-28 od flow (SelectivityCheck + TCC z API) | E5/E6 | ✅ 2026-07-18 — realna `ProtectionCoordinationPage` z ramą prowadzącą; atrapa + `generateIec60255SiCurvePoints` (fizyka IEC 60255 w routerze) USUNIĘTE; E-27 (odrębna zdolność, phantom dostawcy) → tymczasowo kontrakt analizy |
| E-27 „Zabezpieczenia i automatyka" — realny ekran (nastawy + SPZ/SZR) | E5/E6 | ✅ 2026-07-18 (FLOW §0.6 — phantom zlikwidowany w tej samej kolejce: EkranZabezpieczenAutomatyki na ENM BayProtectionControlUnit + panele E-11 jako edycja, następny krok → E-28) |
| F-E5c hub zostaje w środku, gdy dziecko otwiera się w prawym panelu (znalezisko z oględzin F-E5a) | E5 | ✅ 2026-07-18 (`15d397be` — pasek „Zamknij panel analizy" + hub w centrum; dowód hosta panelu: AppRoot→LegacyInspektor) |
| E-27 karta wejścia w hubie analiz (phantom wejścia — brak punktu otwarcia w żywym UI) | E5/E6 | ✅ 2026-07-18 (karta „Zabezpieczenia i automatyka" w grupie zabezpieczeń, wymóg = model sieci) |
| KREATORY: framework ui2 (`kreatory/rama`) + flagowy „Dodaj źródło zasilania" (E2) | E2 | ✅ 2026-07-18 (dyrektywa „całe kreatory od zera, opcja max"; `KreatorZrodloZasilania` zastępuje `AddGridSourceForm`+`GridSourceEditor` scada-*; standard: `KREATORY_STANDARD_2026-07.md`; V12K-042) |
| KREATORY: przebudowa pozostałych 17 kreatorów na framework | E1–E6 | ✅ 2026-07-28 (weryfikacja w kodzie, nie w rejestrze): `ui2/kreatory/` ma **21 kreatorów**, a w `ui/network-build/forms/` nie został ANI JEDEN formularz — jedyny plik `.tsx` to `CableValidationBanner` (baner walidacji, nie kreator). Wiersz stał „w toku" mimo domknięcia w V12K-126 i kartach późniejszych. **Aktualizacja K7-B (2026-07-31):** `CableValidationBanner` też został usunięty — nie był renderowany nigdzie w aplikacji, a liczył dobór przekroju w przeglądarce; katalog `ui/network-build/forms/` nie ma już żadnego `.tsx`. |
| Rozszerzenie ui_no_physics_guard na ui/** | higiena | ✅ 2026-07-22 (H-1) — pomiar: 22 surowe trafienia / 18 linii = 0 klasa-a (realna fizyka) / 9 klasa-b (false-positive: etykieta/komentarz) / 9 klasa-c (stała katalogowa VT IEC 61869-3, precedens R2). `SCAN_DIRS` rozszerzone na `ui/**`+`ui2/**`, jawna allowlista `(plik,linia)→uzasadnienie` (18 wpisów) w `ui_no_physics_guard.py`; guard zielony na HEAD; testy rozszerzone (10, w tym czerwony na wstrzykniętej fizyce w `ui/**`) |
| F-E8.1 Hub Dokumentacji (przestrzeń „Dokumentacja" od flow, Fable osobiście) | E8 | ✅ 2026-07-21 (V12K-093) — `ui2/spaces/dokumentacja/` (HubDokumentacji + MostDokumentacji): cel + Tor pracy (Projekt→Wariant→Wersja→Obliczenie z akcjami) + karty dokumentów w grupach z uczciwym warunkiem + następny krok (wniosek OSD). Karty → REALNI dostawcy (raport E-37, pakiet dowodowy E-36, archiwum → przestrzeń „Projekt"); zero phantomów. Przestrzeń przestała lądować na legacy `navigateToReport`. Testy 16; guardy zielone. |
| **FALA „POZIOM EKSPERTA" (dyrektywa właściciela 2026-07-22: „wróć do pierwotnego domknięcia flow projektanta i poprawiaj to, co nie dojechało poziomem")** — pomiar: 6 kart huba analiz (E-29…E-34) wciąż na ZASTĘPCZYM kontrakcie F-E5a mimo istnienia realnych dostawców/danych; 10 legacy formularzy kreatorów; `show-ncrfg` w legacy E-26 | E5/E7/E2 | ✅ 2026-07-22 (V12K-124..126) — SCALONA W CAŁOŚCI (P-1…P-5); moduł zastępczy `kontrakt-analizy` WYGASZONY (wszystkie kody E-29…E-34 mają realnych dostawców); 10 legacy formularzy → kreatory ui2 |
| P-1 przekierowania: E-33→wkłady zwarć (F2), E-34→bilans IEC + dobór aparatów, show-ncrfg→macierz ui2, tabela pozostałych akcji SLD | E5/E7 | ✅ 2026-07-22 (V12K-124) — E-33/E-34 prowadzą deep-linkiem `setWynikiTab('zwarcia')` do zakładki zwarć warsztatu Wyników (hub analiz, nawigacja analityczna, raport); `show-ncrfg` → `MacierzNcRfg` z preselekcją generatora; tabela audytu akcji SLD w raporcie karty; GAP-y zarejestrowane: `show-results`→E-24 (decyzja produktowa: kontekst elementu), martwy `ReadOnlyPanelRouter`, menu kontekstowe DER na v3 |
| P-2 realne ekrany: E-30 „Zbieżność rozpływu i zaczepy" + E-31 „Stan fazowy SN" (wzorzec ekranu analizy, dane kanoniczne) | E5 | ✅ 2026-07-22 (V12K-125) — `ui2/wyniki/zbieznosc/` (werdykt zbieżności + bilans przebiegu + ślad pętli OLTC + założenia zaczepów; PowerFlowTrace addytywnie `oltc_control`/`solver_method`) i `ui2/wyniki/stan-fazowy/` (napięcia/prądy fazowe + asymetrie z werdyktem z flag solvera; GET results/phase-state); GAP-y: zaczepy poza śladem PF, przebieg iteracji bez szeregu |
| P-4/P-5 kreatory: przebudowa 10 pozostałych legacy formularzy (`ui/network-build/forms/`: Dispatchable/Relay/Measurement/NnOutgoingField/BranchPole/Zksn/StartBranch/AssignCatalog/ChooseSnSegmentFamily/UpdateElementParameters) na framework `kreatory/rama` | E2 | ✅ 2026-07-22 (V12K-126) — 9 kreatorów ui2 (`zrodlo-dyspozycyjne` z torami agregat/UPS, `odgalezienie`+`slup-odgalezny` (decyzja: słup≠odgałęzienie), `zksn`, `przekaznik`, `pomiar`, `pole-nn`, `przypisanie-katalogu`, `edycja-parametrow`); `ChooseSnSegmentFamily` WYGASZONY z dowodem parytetu (konfigurator odcinka pokrywa 100%); 2 phantomy ubite (`updates`→`parameters`; ignorowany `catalog_binding`); legacy `GensetModal`/`UPSModal` i 10 formularzy USUNIĘTE; barrel `network-build/forms` eksportuje już tylko `CableValidationBanner` (a od K7-B/2026-07-31 — nic: baner nie miał konsumenta i liczył fizykę doboru, patrz `DLUG_FIZYKA_W_UI_2026-07.md` §7) |
| F-E8.1-R2 Hub Dokumentacji — druga recenzja (8 pkt: hierarchia, ~40% krócej) | E8 | ✅ 2026-07-21 (V12K-095) — świadome odwrócenie R1: usunięty panel statystyk modelu i 4-krokowy tor pracy; ekran podporządkowany 3 pytaniom (Q1 status obliczeń · Q2 dokumenty — sekcja główna · Q3 pasek procesu); karty skrócone do 1 zdania, ZAWARTOŚĆ > formaty; `podsumowanieModelu`/`wykonaneObliczenia` usunięte (martwy kod). Zero fabrykacji. 13 testów lean; zrzuty ~40% krótsze. |
| F-E8.1-R1 Hub Dokumentacji — runda poprawek recenzji inżyniera (9 pkt) | E8 | ✅ 2026-07-21 (V12K-094) — panel „Analizowany model" (realne liczniki ze snapshotu: napięcia/węzły/gałęzie/transformatory/źródła/generacja/odbiory + wykonane obliczenia + data), zawartość dokumentu z realnych przebiegów, tożsamość wizualna per typ (ikona+akcent), wyróżniony WHITE BOX, jednoznaczne akcje (Otwórz generator/dowód/archiwum), czytelne statusy (Do wygenerowania / Wymaga: …), formaty, pasek procesu. Naprawiony defekt kaskady CSS (kolizja klasy `.mvd-dok-sekcja`). Zero fabrykacji. Testy 20 (+MostDokumentacji 2). |
| F-E8.3 Magazyn wygenerowanych dokumentów (cykl życia) — BACKEND | E8 | ✅ (weryfikacja 2026-07-28) — `backend/src/api/document_store.py` (`GET /api/projects/{id}/documents`, `GET /api/documents/{id}/content`) + `document_store_repository`; hub czyta REALNY magazyn (`ui2/spaces/dokumentacja/api.ts` → `fetchDokumentyProjektu`). Wiersz DUBLOWAŁ pozycję niżej i oba stały „do zlecenia" mimo dostarczenia. |
| F-E8.2 Studium przyłączeniowe OZE w hubie dokumentacji | E8 | ✅ 2026-07-21 (V12K-096) — realny deep-link z huba do istniejącego generatora studium (Wyniki→zakładka „studium", backend `oze_analysis_runs`/`render_dokument_studium_pdf/docx`) przez shell store `wynikiTab` (jednorazowe żądanie, walidacja+czyszczenie). Nowa grupa „Dokumenty przyłączeniowe (OZE)" z jedną lean kartą. Zestawienie materiałowe NIE dodane (brak backendu → F-E8.3). 16 testów (14 hub + 2 wyniki deep-link). |
| F-E8.3b Zestawienie materiałowe / BOM — BACKEND | E8 | ✅ (weryfikacja 2026-07-28) — `backend/src/application/analyses/lista_materialowa.py` (`build_bom_view`) konsumowane przez `api/der_sn_documents.py` z pobraniem pliku. Poprzedni zapis „grep pusty — brak backendu" był PRAWDZIWY W CHWILI PISANIA i przestał być prawdziwy bez aktualizacji wiersza. |
| F-E6.1 pętla decyzji: „Od wyniku do decyzji" (wspólny wzorzec) | E6 | ✅ 2026-07-21 (V12K-097) — akcja „Popraw w modelu" na wierszach wyników z przekroczeniem → hook `usePoprawWModelu` (selekcja elementu + centrowanie SLD + przejście do „Schemat"). W WSPÓLNYM wzorcu `TabelaWynikow`/`EkranAnalizy` (łapie wszystkie ekrany wyników); wpięte w rozpływ (szyny/gałęzie). Świeżość/unieważnienie (`ui2/freshness/`) i nastawy zabezpieczeń (E-27) już istniały. Reuse V12K-073; zero fizyki. 6 testów. |
| F-E6.2 pętla decyzji — rozszerzenie na kolejne ekrany + akcje kontekstowe | E6 | ✅ 2026-07-28 (V12K-261) — DOMKNIĘTE. Akcje kontekstowe per rodzaj przekroczenia: `ui2/wyniki/wzorzec/akcjeNaprawcze.ts`; pętla w 15 z 18 modułów wyników (moduły `analizy` i `dowod` słusznie bez niej — nie mają wierszy z przekroczeniem). **KOREKTA WCZEŚNIEJSZEJ OCENY:** koordynacja NIE była bez naprawy — miała ją od F-K4/Z4 (klik w wiersz → edytor nastaw nadrzędnego), ale NIEWIDOCZNĄ: bez etykiety, bez przycisku, bez sygnału, że cokolwiek się stanie. Werdykt bez widocznego następnego kroku jest ślepym zaułkiem (FLOW §0.2), a niewidoczna akcja to martwy klik z perspektywy projektanta. Wiersz selektywności z werdyktem naruszenia ma teraz kolumnę „Działanie" z przyciskiem „Popraw nastawy" (44 px, tytuł nazywa podstawę inżynierską: przy braku selektywności koryguje się czas zabezpieczenia rezerwowego). Werdykt spełniony przycisku NIE dostaje. |
| F-E1 pulpit projektu z warunkami przyłączenia (kreator „warunki OSD") | E1 | ✅ 2026-07-2x (V12K-100, weryfikacja 2026-07-28): `ui2/spaces/projekt/KafelPrzylaczenia.tsx` — kafel warunków przyłączenia + bilans mocy na pulpicie projektu. Wiersz stał „do zlecenia" mimo dostarczenia. |
| P-3 realne ekrany E-29 „Składowe symetryczne i sieć zerowa" + E-32 „Stabilność dynamiczna" | E5 | ✅ 2026-07-22 (V12K-125) — `ui2/wyniki/skladowe/` (bilans FROZEN solvera z wierszy kanonicznych + Z1/Z2/Z0 WYŁĄCZNIE ze śladu WHITE BOX, krok „Zk", KaTeX read-only + uziemienie punktu neutralnego z ZAMROŻONEJ wersji układu + werdykt raportowalności) i `ui2/wyniki/stabilnosc/` (scenariusz → werdykt STABLE/UNSTABLE backendu → wielkości ze statusami `checks` → ślad automatyki na żądanie; jawna nota: kontrakt bez szeregu czasowego). E-29/E-32 usunięte z dostawcy kontraktu analizy. GAP-y z deltami w raporcie karty (z1/z2/z0 poza śladem = addytywna delta FROZEN to_dict — NIE wykonana bez zatwierdzenia). 44 testy; guardy zielone. |
