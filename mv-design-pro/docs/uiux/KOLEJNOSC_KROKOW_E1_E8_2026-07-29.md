# KOLEJNOŚĆ KROKÓW INTERFEJSU PER ETAP E1–E8 (karta K4, 2026-07-29)

**Status:** WIĄŻĄCY projekt kolejności (program dowodzenia K0–K8; zatwierdzony przez
nadzorcę przed implementacją). Uzupełnia `FLOW_PROJEKTANTA_2026-07.md` (mapa etapów)
o KOLEJNOŚĆ kroków wewnątrz etapów i przejścia między nimi. Stan „dziś" zmierzony
w kodzie i na żywej aplikacji po kartach K1–K3 (hydratacja, jedno lądowisko wyników).

**Zasada:** każdy wiersz tabeli to jeden krok pracy inżyniera. Krok bez drogi wejścia
albo bez „dokąd dalej" = zerwanie łańcucha do naprawy. Ekrany są przystankami,
projektujemy przepływ.

---

## Sekwencja pierwszego użycia (świeży użytkownik, pusta powłoka)

| # | Co inżynier ma | Czego potrzebuje | Krok UI | Dokąd dalej | Stan dziś |
|---|---|---|---|---|---|
| P1 | nic (pierwsze uruchomienie) | założyć projekt od CELU pracy | `OtworzProjekt` (W-102: cel → przykłady → istniejące) w przestrzeni „Projekt" | pulpit projektu | **ZERWANE — E1a**: ekran istnieje, NIE jest wpięty; stan „brak projektu" prowadzi do legacy `#dashboard` |
| P2 | projekt założony | warunki przyłączenia OSD (Sk″, U, cosφ) | `KafelPrzylaczenia` na pulpicie | model (schemat) | ✅ istnieje (F-E1/V12K-100) |
| P3 | warunki wpisane | pierwszy element modelu | pulpit → „Model sieci"/„Schemat"; kanwa: CTA „Wstaw GPZ" | E2 | ✅ (empty-state CTA tworzy GPZ) |

**Naprawa E1a (implementacja K4):** przestrzeń „Projekt" bez aktywnego projektu
renderuje `OtworzProjekt` zamiast gołego stanu; akcje REALNE: nowy projekt (POST
`/api/projects` + aktywacja + pulpit), istniejący projekt (aktywacja + hydratacja K2
+ pulpit). Sekcja „gotowe przykłady": TYLKO jeśli istnieje realny dostawca
(reference patterns API) — zero fabrykacji; przy braku dostawcy sekcja nie renderuje
się, dług nazwany. Legacy `#dashboard` zostaje jako most (bez nowych wejść).

## E1 · Zlecenie i dane wejściowe

| # | Co ma | Czego potrzebuje | Krok UI | Dokąd dalej | Stan |
|---|---|---|---|---|---|
| 1 | zlecenie | projekt (nazwa, tryb AS-IS/TO-BE, Un) | OtworzProjekt → cel | pulpit | E1a (wyżej) |
| 2 | projekt | warunki OSD | KafelPrzylaczenia | schemat | ✅ |
| 3 | wracający użytkownik | kontekst odtworzony | hydratacja powłoki (K2) | tam, gdzie skończył | ✅ K2 |

## E2 · Budowa modelu sieci (kolejność kroków budowy)

| # | Co ma | Czego potrzebuje | Krok UI | Dokąd dalej | Stan |
|---|---|---|---|---|---|
| 1 | pustą kanwę | źródło zasilania | CTA „Wstaw GPZ" → parametry z warunków OSD | magistrala | ✅ |
| 2 | GPZ | ciąg SN | kreator odcinka (katalog-first), łańcuchowanie `scheduleNextOperationForm` | stacje | ✅ (wzorzec łańcuchowania — JEDYNY kreator z prawdziwym „dokąd dalej") |
| 3 | magistralę | stacje SN/nN | kreator stacji (menu kanwy / karty) | pola, transformator | ✅ |
| 4 | stację | pola SN, pomiar (CT/VT), zabezpieczenie | kreatory pól/pomiaru/przekaźnika | koordynacja | ⚠ wejścia tylko z ProcessPanel (audyt §3) — poza zakresem K4, karta H-2 okolice |
| 5 | odbiory/OZE | źródła OZE | KreatorZrodlaOze | macierz NC RfG | ✅ (najlepiej domknięty) |
| 6 | model z grubsza | domknięcie pierścienia / NOP | `connect_secondary_ring_sn` | gotowość | ⚠ prawie nieosiągalny z kanwy (audyt §4) — dług nazwany |
| 7 | model gotowy | sygnał „co dalej" | **brak jawnego przejścia E2→E3** | gotowość | **LUKA K4-E2**: po domknięciu modelu nic nie prowadzi do bramki gotowości (F-E2 nigdy niedostarczone) |

**Naprawa K4-E2 (implementacja):** trwały, nienachalny „następny krok" w przestrzeni
Schemat: gdy model niepusty, wskazanie „Sprawdź gotowość obliczeniową →" (przejście
do przestrzeni Gotowość jednym kliknięciem). Bez fizyki, bez oceny w UI — sama nawigacja.

## E3 · Gotowość → E4 · Obliczenia → E5 · Wyniki (przejścia jednym działaniem)

| # | Co ma | Czego potrzebuje | Krok UI | Dokąd dalej | Stan |
|---|---|---|---|---|---|
| 1 | model | werdykt „możesz liczyć" | PanelGotowosci (bramka z akcjami naprawczymi) | Obliczenia | ✅ F-E3: sekcja przy zielonej bramce → Obliczenia |
| 2 | zieloną bramkę | wariant + typ analizy | przestrzeń Obliczenia: przypadek → „Oblicz" | bieg | ✅ |
| 3 | bieg DONE | wyniki | SzczegolyPrzebiegu „→ Wyniki" ORAZ automatyczne lądowisko po DONE | warsztat ui2, zakładka wg rodzaju | ✅ F-E4 + K3 (jedno lądowisko; zakładka wg typu) |
| 4 | wynik na ekranie | świeżość względem modelu | FreshnessBadge + panel „Co się zmieniło" | decyzja (E6) | ✅ K3 (pierwszy raz widoczny) |

## E6 · Decyzje projektowe (pętla wynik → model)

| # | Co ma | Czego potrzebuje | Krok UI | Dokąd dalej | Stan |
|---|---|---|---|---|---|
| 1 | przekroczenie w wyniku | skok do miejsca decyzji | „Popraw w modelu" (`usePoprawWModelu`, 15/18 modułów) | schemat/kreator | ✅ F-E6.1/6.2 |
| 2 | brak selektywności | korekta nastaw | E-28 „Popraw nastawy" | zapis do ENM | **⚠ nastawy bez wykonawcy** (audyt §3) — karta H-2, poza K4 |
| 3 | zmieniony model | świadomość unieważnienia | badge „nieaktualne" + „Przelicz" | E4 | ✅ K3 |

## E7 · Zgodność OZE/OSD · E8 · Dokumentacja

| # | Co ma | Czego potrzebuje | Krok UI | Dokąd dalej | Stan |
|---|---|---|---|---|---|
| 1 | bieg + moduły OZE | macierz NC RfG | strumień OZE (9 zakładek) | dokumenty | ✅ |
| 2 | werdykty OZE | akcje wyjściowe | 8 pół-ogniw (audyt §6) | kreatory/nastawy | ⚠ karta H-3, poza K4 |
| 3 | komplet wyników | dokumenty | Hub Dokumentacji (Tor pracy: Projekt→Wariant→Wersja→Obliczenie) | wniosek OSD | ✅ F-E8.1 |

## Zakres implementacyjny karty K4 (poza dokumentem)

1. **E1a**: wpięcie `OtworzProjekt` (jak wyżej; zero fabrykacji dla przykładów).
2. **K4-E2**: jawne przejście Schemat → Gotowość (nawigacyjny „następny krok").
3. **Bramka odbioru**: przejście klikane przez nadzorcę na żywej aplikacji od pustej
   powłoki do wyników, bez wiedzy zakulisowej + nowy spec e2e „pierwsze użycie"
   (OtworzProjekt → nowy projekt → pulpit → schemat), pełne suity zielone.

## Poza zakresem K4 (dług prowadzony w programie)

Wejścia kreatorów pomiaru/przekaźnika (H-2), pierścień wtórny z kanwy, 8 pół-ogniw
OZE (H-3), 3 wyspy kreatorów (H-4), stany zerowe z akcją (H-5), chrom (H-6),
mieszanka motywów legacy.
