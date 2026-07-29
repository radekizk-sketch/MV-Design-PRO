# OPINIA ZESPOŁU EKSPERTÓW — WARSTWA ETYKIET WYNIKOWYCH W4 (L2) (2026-07-24) — WIĄŻĄCA

Status: **WIĄŻĄCA**. Werdykt: kierunek bardzo dobry — wartości obliczeniowe
odseparowane od geometrii jako niezależna warstwa prezentacyjna (właściwa
architektura). Obecna implementacja W4 = demonstrator techniczny, nie gotowa
warstwa inżynierska: kotwiczenie poprawne, brakuje semantyki, hierarchii
informacji, integracji z analizami i interakcji.

## Wymagania (1–19, skondensowane bez utraty treści)

1. **Warstwa kontekstowa per analiza:** zawartość etykiet zmienia się wg
   aktywnej analizy. Rozpływ mocy — źródła: P, Q, S, cosφ, tryb pracy;
   linie: P, Q, I, obciążenie [%], ΔU; transformatory: S, obciążenie,
   straty, pozycja zaczepu; odbiory: P, Q, I.
2. **Etykiety powiązane z typem obiektu:** różne szablony treści dla
   źródła (P = +5,648 MW / Q = +0,92 Mvar), linii (I = 182 A / 68 % /
   ΔU = 0,42 %), transformatora (S = 1,84 MVA / 73 %), odbioru
   (P = −420 kW / Q = −185 kvar). Kolor/pozycja NIE są jedynym wyróżnikiem.
3. **Znak przepływu mocy (konsekwentnie):** +P = generacja, −P = pobór —
   natychmiastowe rozpoznanie kierunku bilansu (zasada już przyjęta w W4,
   utrzymać wszędzie).
4. **Moc bierna obowiązkowo dostępna:** Q, P/Q lub S/cosφ — zwłaszcza dla
   PV, BESS, generatorów, transformatorów. Sama moc czynna dla SN
   niewystarczająca.
5. **Tryb zwijania wg LOD:** L0 — bez wyników; L1 — najważniejsza wartość;
   L2 — 2–3 wartości; klik — pełny panel wynikowy. Nie pokazywać wszystkiego
   naraz.
6. **Etykiety interaktywne:** klik etykiety otwiera White Box lub panel
   wyników elementu (P, Q, S, cosφ, I, napięcie, kąt, źródło danych,
   solver, timestamp).
7. **Pochodzenie wyniku:** każda wartość identyfikowalna co do modułu
   (Load Flow / IEC 60909 / Termika / Q(U)). Nie zakładać, że użytkownik
   pamięta aktywny moduł.
8. **Walidacja nieaktualnych wyników:** zmiana kabla/TR/odbioru/źródła bez
   ponownego biegu solvera ⇒ etykiety oznaczone „⚠ wyniki nieaktualne".
   Zakaz prezentowania starych wyników jako aktualnych.
9. **Progi kolorystyczne (opcjonalne):** zielony = poprawna, żółty =
   zbliżanie do limitu, czerwony = przekroczenie — dla obciążenia, napięć,
   prądów, spadków, zwarć. Kolor dodatkiem, nie jedynym nośnikiem.
10. **Tryb porównawczy:** poprzednia → bieżąca wartość (5,61 MW → 5,64 MW)
    lub Δ (+35 kW) — natychmiastowy wpływ zmiany projektu.
11. **Etykiety NIE wpływają na layout (INWARIANT):** geometria identyczna
    przy warstwie ON i OFF; zakaz przesuwania pól, wydłużania kabli, zmiany
    kotwic. Wyniki są wyłącznie nakładką.
12. **Priorytety etykiet przy kolizji:** źródła → transformatory → linie
    główne → odbiory → elementy pomocnicze. Nigdy odwrotnie.
13. **Warstwy analityczne osobne:** Rozpływ, Zwarcia, Termika, Spadki
    napięcia, Bilans mocy, Ochrona, Arc Flash — każda generuje własne
    etykiety (nie jedna warstwa).
14. **Agregacja:** elementy bardzo blisko ⇒ „+3 wyniki", klik rozwija listę.
15. **Mini trend:** po ponownym biegu opcjonalnie ↑ / ↓ / → dla napięcia,
    obciążenia, prądu — bez otwierania raportu.
16. **Pełna integracja z White Box:** z etykiety przejście do łańcucha
    A model → B równania → C podstawienie → D wynik (najmocniejsza funkcja
    systemu, dostępna wprost ze schematu).
17. **Filtry widoczności:** tylko P / tylko Q / tylko prądy / tylko napięcia
    / tylko przeciążenia / tylko źródła / tylko transformatory / tylko
    przekroczenia.
18. **Eksport bez utraty pozycji etykiet:** PDF, SVG, PNG, DXF, raport.
19. **Metryki do raportu wdrożenia:** liczba etykiet, kolizji, calloutów,
    ukrytych etykiet, średnia/maksymalna odległość od kotwicy, czas
    rozmieszczania — obiektywna ocena kolejnych wersji.

## PRIORYTETY P0 (właściciel)
1. Zawartość etykiet powiązana z aktywnym typem analizy.
2. Prezentacja P, Q, S, I, U zależnie od elementu.
3. Pełna interakcja z White Box.
4. Walidacja nieaktualnych wyników.
5. Warstwa wynikowa NIGDY nie zmienia geometrii schematu.
6. Filtry widoczności wyników.
7. Priorytety wyświetlania i obsługa kolizji.

## UWAGA STRATEGICZNA (WIĄŻĄCA)
Warstwa wynikowa NIE jest projektowana wyłącznie dla rozpływu. Od początku
JEDEN uniwersalny system etykiet dla wszystkich modułów obliczeniowych:
rozpływ, zwarcia IEC 60909, spadki napięcia, obciążalność cieplna,
selektywność i zabezpieczenia, Arc Flash, analizy OZE (Q(U), cosφ(P),
ograniczenia P), przyszłe moduły jakości energii. Jedna wspólna architektura
prezentacji wyników — nie osobne implementacje per solver.

## PROGRAM „WYNIKI-SLD" (fazy — zarządca Fable, wykonawcy Opus)
- **R1 (P0.1+P0.2+P0.5, wym. 1–4, 11):** kontrakt treści etykiet per typ
  elementu × typ analizy (rejestr szablonów treści, NIE per-solver forki);
  P/Q/S/cosφ/I/obciążenie/ΔU/straty/zaczep z ISTNIEJĄCYCH wyników backendu
  (zero fizyki w UI); znak +/− konsekwentnie; utrzymany dowód
  bajt-inwariancji geometrii (test §9 z W4 rozszerzony o nowe treści);
  zwijanie wg LOD (wym. 5) na bazie istniejącej histerezy S8.
- **R2 (P0.4+P0.7, wym. 8, 12, 14, 19):** staleness z ISTNIEJĄCEGO
  mechanizmu inwalidacji wyników case (model change ⇒ status; zakaz
  równoległego trackera) — etykiety „⚠ wyniki nieaktualne"; priorytety
  kolizji źródła→TR→linie→odbiory→pomocnicze w deklutterze warstwy;
  agregacja „+N wyniki"; metryki rozmieszczania do raportu akceptacji.
- **R3 (P0.3+P0.6, wym. 6, 7, 9, 17):** klik etykiety → istniejący panel
  wyników elementu / deep-link White Box (reuse inspektorów, zero nowych
  ścieżek danych); badge pochodzenia wyniku (moduł+timestamp z runu);
  filtry widoczności; progi kolorystyczne z ISTNIEJĄCYCH kontraktów
  severity (zakaz progów liczonych w UI).
- **R4 (wym. 10, 13, 15, 18):** osobne warstwy analityczne (SC/termika/ΔU/
  bilans/ochrona/Arc Flash) na wspólnym rejestrze szablonów; tryb
  porównawczy (Δ między runami — reuse istniejących porównań A/B); mini
  trend; eksport PDF/SVG/PNG/DXF z warstwą (reguła 18 gramatyki: eksport
  nie jest drugim rendererem).
