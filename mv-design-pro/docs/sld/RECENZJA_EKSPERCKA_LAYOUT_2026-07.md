# RECENZJA EKSPERCKA LAYOUTU SLD (2026-07-22) — WIĄŻĄCA

Źródło: zespół ekspercki właściciela (projektanci sieci SN, konstruktorzy rozdzielni,
specjaliści zabezpieczeń, operatorzy OSD, UI/UX SCADA, IEC 60617, GoJS).
Oceny: topologia 10/10 · przepływ 9,5/10 · czytelność eksploatacyjna 7,5/10 ·
layout drzewa 6,5/10 · wykorzystanie przestrzeni 6/10 · ergonomia 7/10 ·
gotowość projektowa 8/10. **Wniosek: dźwignia jakości = silnik layoutu**
(klasa EPLAN/Engineering Base/PowerFactory), nie symbolika ani fizyka.

## Mapowanie 15 punktów na program SCHEMAT-10

| Pkt recenzji | Treść (skrót) | Faza | Uwagi kanoniczne |
|---|---|---|---|
| 1 | odstępy pól górnego pasa +20–35% | **S6 (P0)** | stała minimalnego światła w silniku |
| 2 | piony proporcjonalne do długości gałęzi (krótka gałąź → krótki pion) | **S6 (P0)** | koniec „wszystkie piony do tej samej wysokości" |
| 3 | minimalizacja długości pionów/poziomów i liczby załamań (router logiczny) | **S6 (P0)** | cel funkcji kosztu, nie heurystyka ad-hoc |
| 4 | hierarchia widoczna bez czytania opisów | S6 (P0) + S1/S3 (jest częściowo) | wagi kresek + dominanta glifów |
| 5 | aparatura/stacje ważniejsze wizualnie niż przewody | S6 (P0) | skrócenie pionów to główny środek |
| 6 | klastry podobnych gałęzi | **S7 (P1)** | grupowanie wg struktury poddrzewa |
| 7 | stałe minimalne światło między aparatami | **S6 (P0)** | twarda stała + wyrocznia |
| 8 | rytm wg liczby potomków/szerokości poddrzewa/opisów | S6 (P0) | wejścia funkcji szerokości poddrzewa |
| 9 | globalne balansowanie drzewa (środki ciężkości, przesuwanie poddrzew) | **S6 (P0)** | etap „Tree Balancing" po layoucie |
| 10 | eliminacja pustych przestrzeni | **S6 (P0)** | miara wykorzystania arkusza w teście |
| 11 | Compact Tree Layout (Reingold–Tilford / Buchheim / Walker / Compact Orthogonal) | **S6 (P0)** | adaptacja do grzebienia ortogonalnego SN |
| 12 | optymalizacja pod wydruk A0/A1 | **S7 (P1)** | rozszerzenie toru eksportu (po S4) |
| 13 | ≥3 poziomy LOD, płynne przełączanie | **JEST** (S1: L0/L1/L2) + S8 (P2: płynność przejść) | — |
| 14 | prowadzenie oka: źródło→droga→odgałęzienie→koniec w sekundy | S6 (P0) | efekt łączny 2+4+5+9 |
| 15 | inteligentne rozmieszczanie opisów (globalne: kolizje+wolna przestrzeń+sąsiedzi) | **S7 (P1)** | rozszerzenie silnika S2 z odrzucania na PRZEMIESZCZANIE |

**Rozstrzygnięcie kanoniczne do pkt „adaptacyjny layout zależny od zoomu" (P2):**
layout (kotwice) jest STAŁY między poziomami LOD (reguła R3 „JEDNA KOTWICA",
handoff §2) — adaptacyjne jest wyłącznie DETALOWANIE (zawartość glifów, etykiety).
Płynność przejść = animacja/przejścia kamery i detalu, nigdy przemeblowanie.
To świadome odejście od litery pkt P2 na rzecz ciągłości tożsamości (D1 z audytu);
zmiana wymaga decyzji właściciela.

## Twarde niezmienniki energetyczne (z recenzji — obowiązują każdą fazę)
Ciągłość toru prądowego od źródła do ostatniego odbioru; poprawna kolejność
aparatów; brak przeskoków przewodów; brak niejednoznacznych połączeń; IEC 60617;
praktyka OSD. **Optymalizacja layoutu NIGDY nie zmienia logiki sieci** — strażnicy:
sondy `accept:sld-v3` (w tym `lod_path_probe`), wyrocznie zero-kolizji/ortogonalności
(S2), test „JEDNA KOTWICA" (S1), determinizm.

## Kanoniczny potok silnika layoutu (10 etapów z recenzji — cel S6/S7)
1) analiza topologii → 2) szerokość każdego poddrzewa → 3) środek ciężkości →
4) compact tree layout → 5) global tree balancing → 6) orthogonal edge routing →
7) collision detection → 8) label placement → 9) white space optimization →
10) final engineering validation (sondy). Etapy 7–8 istnieją (S2); etap 6 istnieje
(ortogonalność); fazy S6/S7 dobudowują 2–5 i 9 oraz spinają całość deterministycznie.
