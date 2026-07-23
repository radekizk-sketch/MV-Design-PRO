# GRAMATYKA MINI-RMU (L0) — 19 reguł konstrukcyjnych (dyrektywa właściciela 2026-07-23) — WIĄŻĄCE

1. Ścisła zgodność semantyczna z symboliką L1/L2 — L0 = uproszczenie TEGO SAMEGO obiektu, nie nowy język.
2. TOR MOCY najważniejszy: linia SN przechodzi przez stację CIĄGLE i jednoznacznie; symbol nie przerywa ani nie maskuje toru.
3. Geometria jednoznacznie wskazuje wejście i wyjście toru — sposób włączenia stacji rozpoznawalny bez zoomu.
4. Mini-RMU = integralny fragment toru, nie ikona nałożona na linię (moc płynie PRZEZ stację).
5. Markery (TR/DER/NO/…) uzupełniające — nie dominują nad przebiegiem linii SN.
6. Każdy marker ma STAŁĄ kotwicę względem obrysu — niezależną od orientacji sieci, sąsiadów, layoutu.
7. Priorytety markerów + reguły rozmieszczania; nowe atrybuty (BESS, ATS, regulator, kompensacja, PQ…) bez kolizji i bez zmiany znaczeń istniejących.
8. Markery WYŁĄCZNIE z modelu danych (właściwości obiektu, nie nazwy/ręczne parametry).
9. Rozszerzalność: nowe typy stacji/wyposażenia bez nowych ikon ad-hoc i bez przebudowy geometrii bazowej.
10. Minimalne odstępy marker–marker i marker–obrys zdefiniowane (czytelność przy najmniejszych rozmiarach).
11. Te same grubości linii i proporcje co symbole L1/L2.
12. Proporcje symbolu transformatora zrewidować — nie może dominować wnętrza.
13. Obrys, promienie, marginesy, siatka konstrukcyjna = parametry GLOBALNE silnika, nie wartości lokalne renderera.
14. Gramatyka opisana FORMALNIE jako specyfikacja reguł konstrukcyjnych; renderer implementuje reguły, nie ręczne ikony.
15. Identyczne cechy modelu → identyczny symbol, niezależnie od kolejności danych/orientacji/layoutu.
16. PEŁNA MACIERZ dopuszczalnych kombinacji cech (typ×TR×DER×NO×rozszerzenia) + automatyczna walidacja reprezentacji.
17. Weryfikacja czytelności przy minimalnym rozmiarze widoku całości — każdy marker rozpoznawalny bez zoomu.
18. JEDNA gramatyka w CAŁYM systemie (SLD, wyniki, zwarcia, rozpływ, eksport, wydruki, porównania) — zero lokalnych wyjątków.
19. ZASADA NADRZĘDNA: na żadnym LOD nie wolno utracić ciągłego toru mocy od źródła/GPZ przez wszystkie pola/rozdzielnie/linie/odgałęzienia/stacje/TR/punkty sekcyjne/DER.
