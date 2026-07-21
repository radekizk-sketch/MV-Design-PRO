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
| KREATORY: przebudowa pozostałych 17 kreatorów na framework | E1–E6 | w toku — priorytet: transformator → pole SN → OZE → obciążenie → stacja → reszta (karty do wykonawców) |
| Rozszerzenie ui_no_physics_guard na ui/** | higiena | do zlecenia (przemiarowanie false-positives po domknięciu epiki) |
| F-E8.1 Hub Dokumentacji (przestrzeń „Dokumentacja" od flow, Fable osobiście) | E8 | ✅ 2026-07-21 (V12K-093) — `ui2/spaces/dokumentacja/` (HubDokumentacji + MostDokumentacji): cel + Tor pracy (Projekt→Wariant→Wersja→Obliczenie z akcjami) + karty dokumentów w grupach z uczciwym warunkiem + następny krok (wniosek OSD). Karty → REALNI dostawcy (raport E-37, pakiet dowodowy E-36, archiwum → przestrzeń „Projekt"); zero phantomów. Przestrzeń przestała lądować na legacy `navigateToReport`. Testy 16; guardy zielone. |
| F-E8.2 Studium przyłączeniowe OZE + zestawienia materiałowe w hubie dokumentacji | E8 | do zlecenia — dołączyć kartę „Studium przyłączeniowe" (dostawca: strumień OZE `oze/studium`, backend `oze_analysis_runs`/`dokument_studium`) + „Zestawienie materiałowe" jako grupa „Zgodność OZE/OSD"; wejście z SLD `show-ncrfg` → macierz ui2 (styk z F-E7). |
| F-E6 pętla decyzji wynik→model + nastawy zabezpieczeń (przestrzeń decyzji) | E6 | do zlecenia — priorytet FLOW §2 #3: z werdyktu/wyniku wprost do miejsca decyzji (konfigurator odcinka / nastawy) + jawne unieważnienie wyników (Case Immutability). |
| F-E1 pulpit projektu z warunkami przyłączenia (kreator „warunki OSD") | E1 | do zlecenia — priorytet FLOW §2 #4: jawny krok wejściowy „warunki przyłączenia i dane OSD (Sk″, U, cosφ)" na pulpicie projektu. |
