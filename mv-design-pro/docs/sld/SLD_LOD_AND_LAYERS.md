# LOD i warstwy widoczności SLD — kontrakt kanoniczny

**Status:** kanon BINDING
**Wersja:** v1.0

---

## 1. Definicja

**LOD (Level of Detail)** — poziom szczegółowości renderingu zależny od skali zoomu i woli użytkownika. Steruje co jest widoczne, NIE steruje topologią.

**Warstwy** — niezależne kanały informacyjne włączane/wyłączane ręcznie. Steruje co jest renderowane, NIE steruje geometrią.

Engine: `frontend/src/ui/sld/SldLevelOfDetailEngine.ts` (istnieje, wymaga doprecyzowania w PR-12).

---

## 2. Poziomy LOD (5)

### LOD 0 — overview (skala mapy)

| Widoczne | Ukryte |
|---|---|
| GPZ jako blok | Pola SN |
| Główne ciągi jako linie | Aparaty |
| Stacje jako kompaktowe bloki | Pomiary |
| PV/BESS/FW jako małe znaczniki | Etykiety Q |
| Statusy ogólne (energized / dead / alarm) | Q labels |

### LOD 1 — sieć

| Widoczne | Ukryte |
|---|---|
| GPZ + rozdzielnia uproszczona | Aparaty wewnątrz pól |
| Ciąg główny + odgałęzienia | Pomiary szczegółowe |
| Stacje z typem topologicznym (końcowa/przelotowa/odgałęźna/sekcyjna) | Q labels |
| PV/BESS/FW jako obiekty przyłączeniowe | |
| NOP, łączniki sekcyjne | |
| Status zasilania | |

### LOD 2 — obiekty

| Widoczne | Ukryte |
|---|---|
| Pola SN (kontur + nazwa) | Pełna aparatura |
| Aparaty główne (CB) | Pomiary szczegółowe |
| Kable/linie z nazwami | Pełne pomiary I/U/P/Q |
| Stacje z typem topologicznym | |
| Wybrane pomiary tylko dla zaznaczonego obiektu | |

### LOD 3 — szczegół techniczny

| Widoczne | Ukryte |
|---|---|
| Pełna aparatura pola (Q_szynowy, Q_główny, ES, CT, VT, głowica) | — |
| Q labels | |
| Pomiary pola (jeśli warstwa pomiarów włączona) | |
| Parametry odcinka | |
| Status kompletności | |
| Etykiety wynikowe | |

### LOD 4 — inspekcja / diagnostyka

| Widoczne | Ukryte |
|---|---|
| Wszystkie szczegóły techniczne | — |
| Braki danych (znaczniki) | |
| Blokady, ostrzeżenia | |
| Skrócone uzasadnienie inżynierskie | |
| Status raportu | |

---

## 3. Reguły LOD (BINDING)

1. Zmiana zoomu zmienia LOD płynnie albo progowo (granice progu zoom 0.3 / 0.7 / 1.5 / 3.0).
2. Użytkownik może wymusić wyższy LOD niż wynika z zoomu (override).
3. **Selected object może mieć LOD wyższy niż globalny.** Zaznaczona stacja w LOD 1 pokazuje pola jak w LOD 3.
4. Zmiana LOD **nie zmienia** world coordinates ani topologii.
5. Ukrycie szczegółu **nie usuwa** danych z modelu.
6. **NIE wolno** masowo renderować pomiarów `I1/I2/I3/P/Q` pod każdym polem przy LOD 0/1.
7. **NIE wolno** renderować wartości jako `0.00` w miejscu braku obliczeń (kontrakt `formatPolishValue`).

---

## 4. Warstwy widoczności

Każda warstwa to checkbox w lewym panelu. Stan startowy: warstwy aparatury, etykiet, topologii, alarmów ON; warstwy pomiarów, wyników, braków danych OFF.

| ID warstwy | Etykieta UI | Co kontroluje |
|---|---|---|
| `equipment` | Aparatura | wszystkie aparaty pól |
| `labels` | Etykiety | nazwy pól, oznaczenia Q |
| `ports` | Porty | porty/anchory (debug) |
| `measurements` | Pomiary | I/U/P/Q pod polami |
| `results-pf` | Wyniki rozpływowe | nakładka load-flow |
| `results-voltage` | Wyniki napięciowe | nakładka spadków |
| `results-sc` | Wyniki zwarciowe | nakładka SC |
| `stability` | Stabilność / FRT | nakładka stabilności (po PR-9) |
| `missing-data` | Braki danych | znaczniki braków |
| `protection` | Zabezpieczenia | nakładka zabezpieczeń |
| `der` | OZE / BESS / FW | wyróżnienie źródeł |
| `topology` | Topologia pracy | NOP, łączniki sekcyjne |
| `alarms` | Alarmy / blokady | znaczniki alarmów |

---

## 5. Reguły warstw (BINDING)

1. Warstwa nie zmienia geometrii.
2. Warstwa nie zmienia topologii.
3. Warstwa nie zmienia world coordinates.
4. Wyłączenie warstwy nie usuwa danych z modelu.
5. Konflikt etykiet → warstwa o niższym priorytecie chowa etykietę. Priorytet (rosnąco): `measurements < labels < equipment`.

---

## 6. Test kontraktowy

Test: `frontend/src/ui/sld/__tests__/SldLevelOfDetailEngine.test.ts` (istnieje).

Rozszerzenie w PR-12: `lod-policy.test.ts`:
- LOD 0/1: brak pomiarów per pole.
- LOD 3: pełne pomiary, jeśli warstwa pomiarów włączona.
- Selected obiekt: LOD wyższy niż globalny.
- Toggle warstwy: world coordinates niezmienione.

---

**Koniec dokumentu.**
