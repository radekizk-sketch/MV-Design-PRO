# PDF_REPORT_SUPERIOR_CONTRACT (P24+) — benchmark+

**Status:** CANONICAL  
**Zakres:** P24+ ONLY (reporting superior to benchmark, bez zmian solverĂłw)

## 1. Dlaczego raport jest lepszy niĹĽ benchmark

1. **Jawna Ĺ›cieĹĽka decyzyjna (white-box dla wynikĂłw):**  
   Dla kaĹĽdej decyzji PASS/WARNING/FAIL raport pokazuje ĹşrĂłdĹ‚o danych, ID reguĹ‚y,
   wartoĹ›ć zmierzoną, limit, margines i decyzję. Bez â€žblack boxâ€ť.

2. **NOT COMPUTED â‰  FAIL:**  
   Braki danych są raportowane w osobnej sekcji, bez domysĹ‚Ăłw.

3. **Determinism (byte-identical PDF):**  
   Te same wejĹ›cia → identyczny PDF, z jawnym hashem raportu i stopką
   â€žDeterministic Reportâ€ť.

4. **BUS-centric Voltage Profile + ranking ryzyka:**  
   Jawny ranking TOP 5 najbardziej krytycznych BUS (benchmark nie pokazuje jawnie).

5. **Protection Insight bez wykresĂłw I–t:**  
   Decyzja inĹĽynierska + WHY w tabelach, bez koniecznoĹ›ci interpretacji wykresĂłw.

## 2. Kanoniczny layout raportu (staĹ‚a kolejnoĹ›ć)

1. **Strona tytuĹ‚owa**  
   Projekt / Case / Run / Snapshot, zakres P11–P21, P22 skipped, P24+
2. **Executive Summary (1 strona)**  
   FAIL / WARNING / NOT COMPUTED + TOP 3 ryzyka
3. **Voltage Profile — BUS-centric (P21)**  
   Tabela + ranking krytycznoĹ›ci
4. **Zabezpieczenia — decyzja inĹĽynierska (P22a + P18 + P20)**  
   Tabele + WHY (bez wykresĂłw)
5. **Ocena normatywna (P20)**  
   ReguĹ‚a → wynik → WHY
6. **Jawne braki danych**  
   NOT COMPUTED + brakujące dane
7. **Ĺšlad dowodowy**  
   Referencje do ProofDocument (ID, hash)
8. **Ograniczenia i zastrzeĹĽenia**  
   Jawne, techniczne
9. **Stopka deterministyczna**  
   Wersja systemu + hash raportu

## 3. Mapa sekcji → Pxx

| Sekcja | ĹąrĂłdĹ‚o |
|---|---|
| Executive Summary | P20 + P21 + P22a |
| Voltage Profile | P21 (VoltageProfileView) |
| Zabezpieczenia | P22a (ProtectionInsightView) + P18 |
| Ocena normatywna | P20 (NormativeReport) |
| Ĺšlad dowodowy | P11–P19 (ProofDocument metadata) |

## 4. ReguĹ‚y determinismu (BINDING)

1. Brak losowych metadanych (timestamps, UUID) w rendererze.  
2. StaĹ‚e czcionki i kolejnoĹ›ć sekcji/tabel.  
3. Sortowanie deterministyczne (status → margines → ID).  
4. Jednolity format liczb w caĹ‚ym raporcie.  
5. Stopka: â€žDeterministic Reportâ€ť + hash raportu (SHA-256).

## 5. MUST NOT

- Nie dodawać krzywych I–t.  
- Nie zmieniać solverĂłw ani Result API.  
- Nie dodawać obliczeĹ„ fizycznych w warstwie raportowania.


