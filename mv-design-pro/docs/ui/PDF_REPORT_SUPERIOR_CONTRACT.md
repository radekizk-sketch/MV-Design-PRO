# PDF_REPORT_SUPERIOR_CONTRACT (P24+) — benchmark+

**Status:** CANONICAL  
**Zakres:** P24+ ONLY (reporting superior to benchmark, bez zmian solverów)

## 1. Dlaczego raport jest lepszy niż benchmark

1. **Jawna ścieżka decyzyjna (white-box dla wyników):**  
   Dla każdej decyzji PASS/WARNING/FAIL raport pokazuje źródło danych, ID reguły,
   wartość zmierzoną, limit, margines i decyzję. Bez „black box”.

2. **NOT COMPUTED ≠ FAIL:**  
   Braki danych są raportowane w osobnej sekcji, bez domysłów.

3. **Determinism (byte-identical PDF):**  
   Te same wejścia → identyczny PDF, z jawnym hashem raportu i stopką
   „Deterministic Report”.

4. **BUS-centric Voltage Profile + ranking ryzyka:**  
   Jawny ranking TOP 5 najbardziej krytycznych BUS (benchmark nie pokazuje jawnie).

5. **Protection Insight bez wykresów I–t:**  
   Decyzja inżynierska + WHY w tabelach, bez konieczności interpretacji wykresów.

## 2. Kanoniczny layout raportu (stała kolejność)

1. **Strona tytułowa**  
   Projekt / Case / Run / Snapshot, zakres P11–P21, P22 skipped, P24+
2. **Executive Summary (1 strona)**  
   FAIL / WARNING / NOT COMPUTED + TOP 3 ryzyka
3. **Voltage Profile — BUS-centric (P21)**  
   Tabela + ranking krytyczności
4. **Zabezpieczenia — decyzja inżynierska (P22a + P18 + P20)**  
   Tabele + WHY (bez wykresów)
5. **Ocena normatywna (P20)**  
   Reguła → wynik → WHY
6. **Jawne braki danych**  
   NOT COMPUTED + brakujące dane
7. **Ślad dowodowy**  
   Referencje do ProofDocument (ID, hash)
8. **Ograniczenia i zastrzeżenia**  
   Jawne, techniczne
9. **Stopka deterministyczna**  
   Wersja systemu + hash raportu

## 3. Mapa sekcji → Pxx

| Sekcja | Źródło |
|---|---|
| Executive Summary | P20 + P21 + P22a |
| Voltage Profile | P21 (VoltageProfileView) |
| Zabezpieczenia | P22a (ProtectionInsightView) + P18 |
| Ocena normatywna | P20 (NormativeReport) |
| Ślad dowodowy | P11–P19 (ProofDocument metadata) |

## 4. Reguły determinismu (BINDING)

1. Brak losowych metadanych (timestamps, UUID) w rendererze.  
2. Stałe czcionki i kolejność sekcji/tabel.  
3. Sortowanie deterministyczne (status → margines → ID).  
4. Jednolity format liczb w całym raporcie.  
5. Stopka: „Deterministic Report” + hash raportu (SHA-256).

## 5. MUST NOT

- Nie dodawać krzywych I–t.  
- Nie zmieniać solverów ani Result API.  
- Nie dodawać obliczeń fizycznych w warstwie raportowania.


