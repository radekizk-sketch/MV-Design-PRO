# Kontrakt UI: Profil napięciowy (BUS-centric)

**Wersja:** 1.0  
**Status:** CANONICAL  
**Pakiet:** P21 — Voltage Profile (BUS-centric)  
**Referencje:** SYSTEM_SPEC.md, ARCHITECTURE.md, RESULTS_BROWSER_CONTRACT.md  
**Standard:** benchmark / DIgSILENT benchmark parity

---

## 1. Cel dokumentu

Zdefiniowanie **kanonicznego kontraktu UI** dla widoku **Profil napięć (węzĹ‚y)** prezentującego profil napięciowy wyĹ‚ącznie **per BUS** (węzeĹ‚ sieci), zgodnie z praktyką benchmark / benchmark.

**Zasada fundamentalna (BINDING):**
- Widok **BUS-centric** — jeden wiersz = jeden BUS (węzeĹ‚).
- Brak agregacji po liniach, transformatorach, stacjach.
- Brak nowych obliczeĹ„ fizycznych — tylko **normalizacja i agregacja wynikĂłw load flow**.

---

## 2. Zakres (IN / OUT)

**W ZAKRESIE:**
- Tabela napięć per BUS (U_nom, U, p.u., Î”%).
- Statusy PASS / WARNING / FAIL / NOT_COMPUTED wg progĂłw.
- Ranking â€žnajgorszych węzĹ‚Ăłwâ€ť wg |Î”%|.
- Deterministyczne sortowanie wierszy.

**POZA ZAKRESEM:**
- Obliczenia solvera, korekty fizyki, nowe modele.
- Wyniki per linia/trafo/ĹşrĂłdĹ‚o.
- Implementacja frontendu (tylko kontrakt).

---

## 3. Tabela: Profil napięć (BUS)

### 3.1 Kolumny (OBOWIĄZKOWE)

| Kolumna | Opis | Format |
|---------|------|--------|
| BUS | Nazwa/ID węzĹ‚a | String |
| U_nom [kV] | Napięcie znamionowe | Float (2-3 dec) |
| U [kV] | Napięcie obliczone | Float (3 dec) |
| U [p.u.] | Napięcie per-unit | Float (3 dec) |
| Î”% | OdchyĹ‚ka względem U_nom | Float (2 dec) |
| Status | PASS / WARNING / FAIL / NOT_COMPUTED | Enum |

**Opcjonalnie (jeĹ›li dostępne):**
- P [MW], Q [MVAr] — wstrzyknięcia węzĹ‚owe.

### 3.2 Obliczenia prezentacyjne

- **U [p.u.]** = `U / U_nom` jeĹ›li brak bezpoĹ›rednio z wynikĂłw.
- **Î”%** = `(U - U_nom) / U_nom * 100`.
- Brak U lub U_nom â‡’ **NOT_COMPUTED**.

---

## 4. Progi i statusy

**Konfiguracja progĂłw (domyĹ›lna):**
- `voltage_warn_pct` = **5.0%**
- `voltage_fail_pct` = **10.0%**

**Interpretacja:**
- **FAIL** gdy `|Î”%| â‰Ą fail`
- **WARNING** gdy `|Î”%| â‰Ą warn`
- **PASS** w pozostaĹ‚ych przypadkach
- **NOT_COMPUTED** gdy brak danych napięciowych

---

## 5. Determinizm i sortowanie

**Wymagane sortowanie (BINDING):**
1. FAIL
2. WARNING
3. PASS
4. NOT_COMPUTED
5. W ramach statusu: malejąco po `|Î”%|`
6. Dla remisĂłw: rosnąco po `bus_id`

**Determinism:** ten sam input â‡’ identyczna kolejnoĹ›ć wierszy i identyczny JSON.

---

## 6. Ranking â€žnajgorszych węzĹ‚Ăłwâ€ť

- Ranking wyznaczany po **|Î”%|**.
- WyĹ›wietlany w podsumowaniu (np. â€žWorst Busâ€ť + wartoĹ›ć |Î”%|).
- **NOT_COMPUTED** nie bierze udziaĹ‚u w rankingu.

---

## 7. Integracja z Results Browser

**ĹšcieĹĽka UI:**
- **Results → Profil napięć (węzĹ‚y)**

**Wymagania integracyjne:**
- Dostęp z Results Browser dla aktywnego Case/Run.
- Wiersze synchronizowane z SLD i Element Inspector (BUS-only).

---

## 8. ObsĹ‚uga brakĂłw danych

- Brak U lub U_nom â‡’ **NOT_COMPUTED**.
- Wiersze z NOT_COMPUTED **nie są ukrywane**.
- UI musi wskazywać brak danych (np. â€žbrak obliczeĹ„â€ť / â€žbrak U_nomâ€ť).

---

## 9. Uwagi koĹ„cowe (benchmark / benchmark parity)

- Widok odpowiada **Voltage Profile** znanemu z benchmark / benchmark.
- Brak wynikĂłw na liniach/transformatorach — wyĹ‚ącznie BUS-centric.
- Dane ĹşrĂłdĹ‚owe: wynik load flow + metadane modelu (U_nom).

---

**KONIEC KONTRAKTU P21**

