# Kontrakt UI: Profil napięciowy (BUS-centric)

**Wersja:** 1.0  
**Status:** CANONICAL  
**Pakiet:** P21 — Voltage Profile (BUS-centric)  
**Referencje:** SYSTEM_SPEC.md, ARCHITECTURE.md, RESULTS_BROWSER_CONTRACT.md  
**Standard:** benchmark / DIgSILENT benchmark parity

---

## 1. Cel dokumentu

Zdefiniowanie **kanonicznego kontraktu UI** dla widoku **Profil napięć (węzły)** prezentującego profil napięciowy wyłącznie **per BUS** (węzeł sieci), zgodnie z praktyką benchmark / benchmark.

**Zasada fundamentalna (BINDING):**
- Widok **BUS-centric** — jeden wiersz = jeden BUS (węzeł).
- Brak agregacji po liniach, transformatorach, stacjach.
- Brak nowych obliczeń fizycznych — tylko **normalizacja i agregacja wyników load flow**.

---

## 2. Zakres (IN / OUT)

**W ZAKRESIE:**
- Tabela napięć per BUS (U_nom, U, p.u., Δ%).
- Statusy PASS / WARNING / FAIL / NOT_COMPUTED wg progów.
- Ranking „najgorszych węzłów” wg |Δ%|.
- Deterministyczne sortowanie wierszy.

**POZA ZAKRESEM:**
- Obliczenia solvera, korekty fizyki, nowe modele.
- Wyniki per linia/trafo/źródło.
- Implementacja frontendu (tylko kontrakt).

---

## 3. Tabela: Profil napięć (BUS)

### 3.1 Kolumny (OBOWIĄZKOWE)

| Kolumna | Opis | Format |
|---------|------|--------|
| BUS | Nazwa/ID węzła | String |
| U_nom [kV] | Napięcie znamionowe | Float (2-3 dec) |
| U [kV] | Napięcie obliczone | Float (3 dec) |
| U [p.u.] | Napięcie per-unit | Float (3 dec) |
| Δ% | Odchyłka względem U_nom | Float (2 dec) |
| Status | PASS / WARNING / FAIL / NOT_COMPUTED | Enum |

**Opcjonalnie (jeśli dostępne):**
- P [MW], Q [MVAr] — wstrzyknięcia węzłowe.

### 3.2 Obliczenia prezentacyjne

- **U [p.u.]** = `U / U_nom` jeśli brak bezpośrednio z wyników.
- **Δ%** = `(U - U_nom) / U_nom * 100`.
- Brak U lub U_nom ⇒ **NOT_COMPUTED**.

---

## 4. Progi i statusy

**Konfiguracja progów (domyślna):**
- `voltage_warn_pct` = **5.0%**
- `voltage_fail_pct` = **10.0%**

**Interpretacja:**
- **FAIL** gdy `|Δ%| ≥ fail`
- **WARNING** gdy `|Δ%| ≥ warn`
- **PASS** w pozostałych przypadkach
- **NOT_COMPUTED** gdy brak danych napięciowych

---

## 5. Determinizm i sortowanie

**Wymagane sortowanie (BINDING):**
1. FAIL
2. WARNING
3. PASS
4. NOT_COMPUTED
5. W ramach statusu: malejąco po `|Δ%|`
6. Dla remisów: rosnąco po `bus_id`

**Determinism:** ten sam input ⇒ identyczna kolejność wierszy i identyczny JSON.

---

## 6. Ranking „najgorszych węzłów”

- Ranking wyznaczany po **|Δ%|**.
- Wyświetlany w podsumowaniu (np. „Worst Bus” + wartość |Δ%|).
- **NOT_COMPUTED** nie bierze udziału w rankingu.

---

## 7. Integracja z Results Browser

**Ścieżka UI:**
- **Results → Profil napięć (węzły)**

**Wymagania integracyjne:**
- Dostęp z Results Browser dla aktywnego Case/Run.
- Wiersze synchronizowane z SLD i Element Inspector (BUS-only).

---

## 8. Obsługa braków danych

- Brak U lub U_nom ⇒ **NOT_COMPUTED**.
- Wiersze z NOT_COMPUTED **nie są ukrywane**.
- UI musi wskazywać brak danych (np. „brak obliczeń” / „brak U_nom”).

---

## 9. Uwagi końcowe (benchmark / benchmark parity)

- Widok odpowiada **Voltage Profile** znanemu z benchmark / benchmark.
- Brak wyników na liniach/transformatorach — wyłącznie BUS-centric.
- Dane źródłowe: wynik load flow + metadane modelu (U_nom).

---

**KONIEC KONTRAKTU P21**

