# Koordynacja wątków 2026-10-15 (sesja główna)

## Własność plików do czasu scalenia (kto pierwszy na gałąź programu)

| Obszar | Właściciel teraz | Gałąź | Kolejność |
|---|---|---|---|
| `network_model/catalog/**` (TR stacyjne/blokowe Tier 2, przekształtniki, turbiny, flagi `ptpire_certified` kabli/aparatury), `solver_input/provenance.py` | karta KATALOG-KOMPLETNY-PROWENIENCJA (sesja główna) | `…-u4lhy0-katalog` (`b1f5aad6` + część 2 w toku) | 1 |
| `application/station_templates/**`, `api/station_templates.py`, `StationTemplateWizard.tsx` (skład DER, dobór TR do sumy w torze, jawny TR blokowy) | karta PR-478 (sesja główna) | `…-u4lhy0-gpt478` (`f536e83f` + część 2 w toku) | 1 |
| karta pola E-11, picker rodzin rozdzielnic, `field_read_model.py` (kasacja werdyktu bez rachunku) | PR-481 (zrobione) | `…-u4lhy0-integracja-pr477-481` | 1 |
| plan A/B §14, KARTY_OTWARTE (8 kart), STAN_REPO §3/§7 I | PR-PLAN (zrobione) | jw. | 1 |
| pętla zwarcia nN TT/IT, c_min nN | sesja W5-E-TTIT | `…-karta-w5e-ttit` | przed kartami C-TOLERANCJA-NN i OCHRONA-PRZECIWPORAZENIOWA-TT-RCD |
| scenariusz 630 kVA (karty z ODBIOR_SCENARIUSZA_630KVA) | sesja partii 7 | `…-karta-partia7` | 2 — po scaleniu wiersza 1 |

## Punkty styku (ryzyko błędów)

1. Szablon stacji: „dokłada CT/VT/przekaźnik do pola z bezpiecznikiem”, „dobór automatyczny”, „nazwa stacji przepada” (PROWADZENIE-AUTO-BACKEND / PROWADZENIE-KREATORY) — te same pliki co PR-478 (`apply.py`, `schema.py`, kreator). Partia 7 buduje na gałęzi po PR-478.
2. Katalog transformatorów: prąd załączenia z charakterystyki producenta (ZABEZPIECZENIA-NN-I-TRANSFORMATORA) — nowe pola dopisywać na katalogu z KATALOG (proweniencja: status z rodzaju źródła; DATASHEET tylko dla ZWERYFIKOWANY). Pozycje normatywne Tier 2 nie mają krzywej załączenia — brak danych producenta = analiza wariantowa wg decyzji §3.
3. Katalog kabli nN (R0/X0, Ith, RCD) — karta KATALOG zmienia tylko flagi `ptpire_certified`; nowe pola kabli nN dopisuje partia 7 po scaleniu KATALOG.
4. Pętla zwarcia nN i c_min: jedno źródło stałych c (karta C-TOLERANCJA-NN w KARTY_OTWARTE) — W5-E-TTIT i OCHRONA-PRZECIWPORAZENIOWA nie wprowadzają drugiej stałej.

## Decyzje właściciela 2026-10-15 (dla wszystkich wątków)

- Katalog ma być kompletny dla każdego szablonu; wartości tylko ze źródłem (karta producenta albo norma).
- Transformatory bez karty producenta: pozycje normatywne (straty = limity Tier 2 UE 548/2014 + 2019/1783; u_k serii Siemens GEAFOL 6 %/8 %), proweniencja jawna; karty producentów dopisywane później.
- Szablony bez pozycji ze źródłem: przeprojektować na pozycje ze źródłem, nie blokować.
- Fable zablokowany; maksymalna oszczędność tokenów.
