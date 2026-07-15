# AUDYT RADY SPECJALISTÓW — ROZBUDOWA KAŻDEGO EKRANU (2026-07)

**Status:** WIĄŻĄCY (rozszerza rejestr okien; wymagania wchodzą do kart zadań epików)
**Data:** 2026-07-15 (dyrektywa właściciela: „weź audyt pełnego zespołu ekspertów i rozbuduj każdy ekran")
**Metoda:** każdy ekran rejestru (`MODEL_INTERAKCJI` §4) przeszedł przegląd 8 perspektyw rady
(Program §3) + specjalistów rundy 2 (pomiarowiec, eksploatacja, kosztorysant, projektant nn,
developer OZE). Zapis: tylko rozbudowy KONKRETNE (co dodać do ekranu), nie ogólniki.
Skróty ekspertów: PROF profesor energetyki · OZE · AN analizy sieciowe · RFG NC RfG · PSE
projektant sieci · PST projektant stacji · ZAB zabezpieczenia · WB audytor WHITE BOX ·
POM pomiarowiec · EKS eksploatacja · KOS kosztorysant · PNN projektant nn · DEV developer OZE.

---

## N1 — Projekt

**W-101 Pulpit projektu**
- PSE: kafel „postęp projektu" wg celu (projekt sieci / wniosek OSD / modernizacja) — ścieżka
  kroków z procentem ukończenia i następnym krokiem (głęboki link).
- DEV: kafel „bilans przyłączeniowy": moc umowna vs generacja vs zdolność — od progu widoczny
  jeszcze przed analizami (z podglądu źródła).
- WB: kafel „spójność": rev modelu, liczba wyników aktualnych/nieaktualnych, ostatni odcisk.
- KOS: kafel „koszty" (po P17): wartość materiałowa projektu + koszt strat rocznych.
- EKS: sekcja „ostatnio otwierane" + szybkie akcje (wznów od miejsca zakończenia pracy).

**W-102 Nowy / otwórz projekt**
- PSE: start od celu („co projektujesz?": nowa sieć / przyłączenie OZE / rozbudowa / audyt
  istniejącej) — ustawia domyślną przestrzeń, przykłady i tryb zaawansowania.
- RFG: przy celu „przyłączenie OZE" od razu pola mocy i punktu przyłączenia → moduł B/C/D.

**W-103 Archiwum projektu**
- WB: podgląd zawartości ZIP przed importem (liczby elementów, rewizje, odciski) + walidacja
  zgodności wersji; diff dwóch archiwów (istniejący `archive_diff` — wpiąć).
- EKS: automatyczna kopia przed importem nadpisującym.

**W-104 Ustawienia** — PROF: jednostki i precyzja prezentacji (miejsca dziesiętne per wielkość:
kA 2, pu 3, %, s 2) globalnie, spójnie z raportami; EKS: katalog kopii, autozapis układu.

**W-110 Powłoka** — patrz `SPEC_UKLAD_PANELI`; audyt dodaje: pasek ostatnich obiektów
(historia selekcji, jak „ostatnie pliki"), wskaźnik trybu zaawansowania zawsze widoczny.
**W-105 (NOWE) Wyszukiwarka poleceń Ctrl+K** — wyszukuje: funkcje, obiekty modelu (po nazwie),
okna, gotowe przykłady, pozycje pomocy; z podpowiedzią trybu.

## N2 — Model sieci

**W-201/202 Kreator sieci**
- PSE: widok „profil trasy" odcinka (długości skumulowane, przekroje po trasie); ostrzeżenie
  o przekroczeniu zasięgu zabezpieczenia przy wydłużaniu magistrali (czułość na końcu).
- AN: podgląd na żywo obciążenia i spadku napięcia wzdłuż budowanej magistrali (lekki podgląd
  z ostatniego rozpływu; oznaczony jako szacunek do czasu przeliczenia).
- ZAB: przy wstawianiu łącznika sekcyjnego — podpowiedź lokalizacji wg podziału prądów
  zwarciowych i czasu przywracania zasilania.
- OZE: krok DER rozbudowany o sprawdzenie „czy potrzebny TR blokowy" (moc vs próg) i tryb
  pracy falowników z profilem operatora.

**W-203 Kreator stacji** — PST: edytor pól rozdzielnicy jak w widoku elewacji (kolejność pól
przeciąganiem, sprzęgło, pole pomiarowe, rezerwy); POM: sekcja układów pomiarowych
(rozliczeniowy/kontrolny, klasa, przekładnie) z walidacją kompletności; ZAB: zakładka
zabezpieczeń pola z nastawami wstępnymi z kreatora nastaw (W-622).
**W-204 Kreator DER** — RFG: wynik wstępny „wymogi modułu B/C/D" jako lista kontrolna;
OZE: dobór liczby falowników z mocy i typu; krzywa Q(U)/cosφ(P) edytowalna wykresem.
**W-205/206 Katalog + karta typu** — PROF: karta typu z pełnym zestawem parametrów i ich
definicjami (symbol, jednostka, norma); KOS: cena jednostkowa (opcjonalna, dla P17);
WB: pochodzenie danych typu (karta katalogowa producenta / norma / założenie).
**W-207 Siatka właściwości** — AN: kolumna „wpływ": które analizy unieważnia zmiana pola
(z macierzy propagacji); multi-edycja z podglądem różnic przed zapisem.
**W-208 Drzewo topologii** — PSE: tryby drzewa: zasilania (od GPZ) / administracyjny (stacje) /
obwodowy (magistrale); liczniki gotowości per gałąź; filtr „tylko z problemami".
**W-209 Inspektor ENM** — WB: tylko tryb ekspercki; surowe rekordy + rewizje.
**W-210 Import XLSX** — PSE: mapowanie kolumn z podglądem, raport odrzuconych wierszy
z powodami, import na sucho (walidacja bez zapisu).
**W-211 (NOWE, P8) Dobór przekroju** — AN/PSE: kryteria obciążalność/ΔU/I″k/I²t, tabela
kandydatów z katalogu ze statusem per kryterium, dowód WHITE BOX wybranego.
**W-212 (NOWE, P15) Dobór przekładników** — POM: prądowe (klasa, moc wtórna, współczynnik
graniczny vs I″k — nasycenie), napięciowe; arkusz doboru do dokumentacji.

## N3 — Schemat

**W-301 Rama SLD** — granica wątku SLD bez zmian; audyt dodaje wymagania RAMY (nie wnętrza):
pasek nakładek (wyniki/warstwy) sterowany z powłoki, przełącznik wariantów łączeniowych,
mini-mapa nawigacyjna, synchronizacja podziału widoku (schemat obok wyników).

## N4 — Gotowość

**W-401 Panel gotowości** — PSE: grupowanie braków wg celu („do zwarć brakuje: …", „do wniosku
OSD brakuje: …"); postęp per cel. EKS: przypisanie braku do osoby (notatka).
**W-402 Problemy walidacji** — AN: filtry wg wagi/typu/gałęzi; akcje zbiorcze („uzupełnij R_uz
dla 4 stacji jedną wartością…" z rozwagą — każda zmiana operacją domenową).
**W-403 Kwalifikacja analiz** — AN: macierz analiza × przypadek (co można uruchomić gdzie);
z każdej komórki start przebiegu.
**W-404 (NOWE, P20) Asystent braków** — „chcę osiągnąć X" → wygenerowana ścieżka kroków
z głębokimi linkami i szacunkiem pozostałej pracy.

## N5 — Obliczenia

**W-501 Przypadki** — AN: tabela porównawcza konfiguracji przypadków (co się różni); dziedziczenie
(przypadek pochodny: „jak K1, ale NOP-3 zamknięty"); PROF: pola założeń (c_max/c_min, temperatura,
stan łączeń) jawnie na karcie przypadku — założenia są częścią wyniku.
**W-502 Scenariusze zwarć** — ZAB: zestawy scenariuszy (wszystkie szyny 3F / rozpływ prądów
zwarciowych dla nastaw / minimalne 2F dla czułości); mapa miejsc zwarć na schemacie.
**W-503 Przebiegi** — EKS: kolejka z postępem, przerwanie, historia z czasem trwania;
WB: każdy przebieg z parametrami wejściowymi (pełna odtwarzalność).
**W-504 (NOWE, P16) Tryb przełączeń** — EKS: sekwencja łączeń krok po kroku z warunkami
blokad, stan sieci po każdym kroku (zasilone/niezasilone), generowana instrukcja przełączeń.

## N6 — Wyniki i dowody

**W-601 Przeglądarka wyników** — AN: widok „co się zmieniło" vs poprzedni przebieg (delta
z progiem istotności); eksport widoku do raportu jednym działaniem.
**W-602 Inspektor wyniku** — WB: zakładka Powiązania: element → wyniki → dowód → raporty,
w obie strony; PROF: założenia przebiegu widoczne przy każdej liczbie.
**W-603 Rozpływ** — AN: tabela gałęziowa (obciążenie %, straty, kierunek), profil napięcia
z zaznaczeniem naruszeń, bilans mocy sekcji; OZE: praca falowników (P/Q/cosφ, ograniczenia).
**W-604 Zwarcia** — ZAB: rozpływ prądu zwarciowego po gałęziach (dla nastaw), wkłady źródeł
osobno (sieć/maszyny/falowniki); PROF: I″k, ip, Ith, Sk z jawnym c i X/R.
**W-605 Wrażliwość** — AN: ranking wpływu parametrów, wykres tornado; link do elementu.
**W-606 Analizy specjalne** — AN: wspólny wzorzec ekranu wyników (tabela + wykres + założenia
+ dowód) dla: niesymetrycznego, stanu fazowego, estymacji stanu (tryb ekspercki z residuami
pomiarów), harmonicznych (widmo THD per szyna), rozruchu silników (przebieg napięcia),
niezawodności (SAIDI/SAIFI per wariant).
**W-607 Jakość wyników** — WB: flagi sanity bounds z wyjaśnieniem progu; walidacja energetyczna
(bilans P/Q zamknięty) jako warunek publikacji raportu.
**W-608 Dowód WHITE BOX** — PROF: pełny łańcuch wzór→dane→podstawienie→wynik→jednostki
z numeracją równań i odsyłaczami do norm; tryb objaśnień (P22) rozszerza o teorię;
WB: eksport dowodu z odciskiem; nawigacja z każdego kroku do danych źródłowych.
**W-609 Porównanie A/B** — AN: dowolne dwa przebiegi (nie tylko przypadki), delta z progiem,
podświetlenie różnic na schemacie (przez publiczne API nakładek).
**W-610/611 Zabezpieczenia + TCC** — ZAB: wykres TCC z tolerancjami charakterystyk, punkty
pracy z przebiegów zwarciowych, marginesy selektywności w tabeli par; arkusz nastawień (P13)
do eksportu; czułość ziemnozwarciowa (P14) ze sposobem uziemienia punktu neutralnego.
**W-612 Pętla zwarciowa nn** — PNN: tabela obwodów z warunkiem samoczynnego wyłączenia,
najgorszy punkt, dobór zabezpieczenia z katalogu.
**W-613 Zwarcia maszyn** — AN: wkłady silników z krzywą zanikania; wpływ na dobór aparatów.
**W-614 NC RfG / PTPiREE** — RFG: lista testów wg modułu z werdyktem i wykresami (FRT na tle
obwiedni wymagań); braki danych → asystent braków; raport zgodności do OSD jednym działaniem.
**W-615 OZE zaawansowane** — OZE: energia łuku (kategorie PPE/odzież), siła sieci (SCR
w punkcie przyłączenia z progiem), adekwatność Q (mapa U–Q), oddziaływania podsynchroniczne
(obwiednie impedancji) — każdy wg wspólnego wzorca W-606.
**W-616 (NOWE, P2) Zdolność przyłączeniowa** — DEV: mapa/tabela szyn z dostępną mocą
przyłączeniową per kryterium (napięcie/obciążalność/zwarcia), ranking punktów (P19).
**W-622 (NOWE, P13) Kreator nastaw** — ZAB: propozycja nastaw z warunkami (czułość,
selektywność, przeciążalność) i dowodem; przeniesienie do modelu operacją domenową.

## N7 — Dokumentacja

**W-701 Centrum raportów** — PROF: kompozycja raportu z sekcji (założenia, model, wyniki,
dowody, wnioski) z podglądem; numeracja rysunków/tabel; WB: raport zawsze z rev modelu
i odciskami; RFG: szablon „raport zgodności NC RfG".
**W-707 (NOWE, P10) Generator wniosku OSD** — DEV/RFG: kompletacja: bilans mocy, zwarcia
w punkcie przyłączenia, schemat (eksport światła technicznego), zgodność NC RfG, zestawienia —
z listą braków przed generacją (link do asystenta braków).
**W-702 Zestawienia materiałowe** — KOS: agregacja po typach z długościami/sztukami; eksport
arkusza; (po P17) ceny i wartość.
**W-704 (NOWE, P17) Przedmiar i kosztorys** — KOS: pozycje z zestawień × cennik katalogowy,
koszt strat rocznych z rozpływu, porównanie kosztów wariantów (A/B przypadków).
**W-703 Bilans mocy** — RFG: układ zgodny z formularzami OSD; DEV: warianty bilansu
(zima/lato, z/bez magazynu).
**W-705 (NOWE, P21) Dziennik projektu** — WB: chronologia operacji/przebiegów/decyzji
z autorem i rewizją; filtr; eksport do dokumentacji.
**W-706 (NOWE, P9) Karta doboru aparatu** — PST: zestawienie parametrów granicznych aparatu
z wynikami (I″k vs I_dyn/I_th, obciążenie vs In, zdolność łączeniowa) ze statusem i dowodem.

## Rozszerzenie rejestru okien (delta po audycie — wchodzi do MODEL_INTERAKCJI §4)

| ID | Okno | Przestrzeń | Epik | Tryb min. | Źródło |
|---|---|---|---|---|---|
| W-105 | Wyszukiwarka poleceń (Ctrl+K) | wszystkie | E1 | Podstawowy | SPEC_UKLAD_PANELI §2.2 |
| W-211 | Dobór przekroju kabla/linii | N2 | E3/E4 | Podstawowy | P8 |
| W-212 | Dobór przekładników | N2 | E4/E10 | Rozszerzony | P15 |
| W-404 | Asystent braków | N4 | E6 | Podstawowy | P20 |
| W-504 | Tryb przełączeń | N5 | E7/E14 | Rozszerzony | P16 |
| W-616 | Zdolność przyłączeniowa + ranking punktów | N6 | E11 | Podstawowy | P2/P19 |
| W-617 | Harmoniczne (jakość energii) | N6 | E11 | Rozszerzony | P1 |
| W-618 | Rozruch silników | N6 | E8 | Rozszerzony | P3 |
| W-619 | Niezawodność N-1 (SAIDI/SAIFI) | N6 | E8 | Rozszerzony | P4 |
| W-620 | Bezpieczeństwo uziemień | N6 | E10 | Podstawowy | P5 |
| W-621 | Koordynacja izolacji / przepięcia | N6 | E10 | Ekspercki | P6 |
| W-622 | Kreator nastaw zabezpieczeń | N6 | E10 | Podstawowy | P13/P14 |
| W-704 | Przedmiar i kosztorys | N7 | E13 | Rozszerzony | P17 |
| W-705 | Dziennik projektu | N7 | E2/E13 | Rozszerzony | P21 |
| W-706 | Karta doboru aparatu | N7 | E4/E9 | Podstawowy | P9 |
| W-707 | Generator wniosku OSD | N7 | E13 | Podstawowy | P10 |

## Egzekwowanie

Każda rozbudowa z tego audytu jest WYMAGANIEM karty zadania danego okna (zarządca cytuje
właściwą sekcję w karcie). Recenzja rady specjalistów przy odbiorze okna sprawdza checklistą
zgodność z tym audytem; pominięcie rozbudowy wymaga jawnej zgody właściciela (weto z §2.0).
