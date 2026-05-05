# Konfigurator PV / BESS / FW — kontrakt kanoniczny

**Status:** kanon BINDING — implementacja w PR-6 (PV), PR-7 (BESS), PR-8 (FW)
**Wersja:** v1.0

---

## 1. Cel

PV / BESS / FW nie są ikonami. Każde źródło / magazyn / farma wiatrowa ma pełną kartę inżynierską z:
- konfiguracją elektryczną (P, Q, U, ramp),
- modelami falowników / PCS / turbin,
- krzywymi FRT / LVRT / HVRT,
- profilem zgodności przyłączeniowej (NC RfG / wymagania OSD),
- gotowością do 9 typów obliczeń.

UI **nigdy nie fałszuje wyników**. Brak modułu obliczeniowego (np. stabilność, FRT) → status „brak modułu obliczeniowego”.

---

## 2. Wspólny model przyłączenia (BINDING)

Każde DER musi być przyłączone do **konkretnego portu**:

| Wariant | Port | Wymagania |
|---|---|---|
| DER po SN | port `sn_der_pv` / `sn_der_bess` / `sn_der_fw` w polu DER stacji albo bezpośrednio w GPZ | wymaga transformatora bloku, jeśli napięcie urządzenia ≠ napięcie szyny SN |
| DER po nN | port `nn_der_pv` / `nn_der_bess` / `nn_der_fw` w rozdzielnicy nN | wymaga rozdzielnicy nN o napięciu zgodnym z urządzeniem |
| DER przez transformator dedykowany | port pola SN + transformator dedykowany | nowa stacja blokowa |

Reguła walidacji (PR-6): jeżeli napięcie urządzenia ≠ napięcie szyny → propozycja transformatora, **nigdy** niejawne tworzenie.

---

## 3. PV / FV — karty (PR-6)

### 3.1 Karta 1: Dane podstawowe

| Pole | Typ |
|---|---|
| Nazwa źródła | text |
| Typ instalacji | enum: instalacja PV / farma PV / moduł wytwórczy / źródło hybrydowe |
| Punkt przyłączenia | enum: pole SN / rozdzielnia SN GPZ / szyna nN / transformator dedykowany / PCC |
| Moc zainstalowana DC | kWp |
| Moc AC | kW |
| Moc maksymalna w punkcie przyłączenia | kW |
| Status pracy | enum |
| Status kompletności | wnioskowane |

### 3.2 Karta 2: Topologia przyłączenia

- Połączenie do szyny / pola.
- Transformator blokowy (jeśli występuje).
- Kabel SN/nN.
- Rozdzielnica źródła.
- Punkt pomiarowy.
- Punkt regulacji napięcia.
- Punkt zgodności przyłączeniowej (PCC).
- Endpointy (porty).

### 3.3 Karta 3: Falowniki

| Pole | Typ |
|---|---|
| Producent / model (z katalogu) | enum |
| Liczba falowników | int |
| Moc pojedynczego | kW |
| Zakres napięcia AC | V |
| Zakres częstotliwości | Hz |
| Maksymalny prąd | A |
| Ograniczenie P | % |
| Zakres Q | kvar |
| Tryb regulacji | enum: stały cos φ / stała Q / Q(U) / P(f) / regulacja napięcia / ograniczenie mocy czynnej |
| Fault current contribution: sposób modelowania | enum |
| Fault current contribution: wartość / krotność | float |
| Fault current contribution: czas trwania | s |
| Status danych do zwarć | wnioskowane |

### 3.4 Karta 4: Plant controller / regulator parku

- Tryb sterowania parku.
- Regulacja napięcia w PCC.
- Regulacja Q.
- Regulacja cos φ.
- P(f).
- Ramp rate.
- Ograniczenia mocy.
- Komunikacja / SCADA.

### 3.5 Karta 5: FRT / LVRT / HVRT

- Krzywa LVRT/FRT (punkty czas-napięcie, minimalny czas pozostania w pracy, warunki odłączenia).
- Krzywa HVRT (punkty czas-napięcie, warunki odłączenia).
- Wymagania reakcji mocy biernej.
- Odzysk mocy czynnej po zakłóceniu.
- Parametry symulacji.
- Status danych.

**Reguła:** wymagania prawne nie są hardkodowane. UI wczytuje z `catalog/profiles/<operator>.yaml`. Brak profilu → status „brak profilu wymagań”.

### 3.6 Karta 6: Zgodność przyłączeniowa (NC RfG)

- Typ modułu wytwórczego (A / B / C / D wg profilu).
- Maksymalna moc.
- Napięcie przyłączenia.
- Punkt przyłączenia.
- Operator / profil wymagań.
- Lista wymagań (częstotliwość / napięcie / FRT/HVRT / regulacja P / regulacja Q / pracy z siecią / modele symulacyjne / testy zgodności).
- Status: kompletne / częściowe / brak danych / nie dotyczy / brak profilu wymagań.

**Etykieta UI:** „Zgodność przyłączeniowa". „NC RfG" jako doprecyzowanie techniczne, nie skrót w nagłówku.

### 3.7 Karta 7: Gotowość obliczeń

Macierz 6 typów obliczeń (per PV) × statusy: zwarcia / rozpływ / napięcia / stabilność / FRT-HVRT / raport.

Każdy z linkiem „Pokaż braki" + „Pokaż na SLD".

---

## 4. BESS — karty (PR-7)

### 4.1 Karta 1: Dane podstawowe

| Pole | Typ |
|---|---|
| Nazwa magazynu | text |
| Punkt przyłączenia | enum |
| Moc czynna ładowania | kW |
| Moc czynna rozładowania | kW |
| Pojemność energii | kWh |
| Zakres SoC (min/max) | % |
| SoC initial | % |
| Status pracy | enum: ładowanie / rozładowanie / czuwanie / ograniczenie / niedostępny |
| Status kompletności | wnioskowane |

### 4.2 Karta 2: PCS / falowniki

- Liczba PCS, moc pojedynczego.
- Zakres napięcia / częstotliwości.
- Maksymalny prąd.
- Zdolność Q.
- Tryb pracy: grid-following / grid-forming (jeśli model wspiera).
- Tryby regulacji: P/Q, U/Q, cos φ, P(f), regulacja napięcia, wsparcie częstotliwości, ograniczenie mocy.
- Parametry zwarciowe PCS.
- Dane dynamiczne.

### 4.3 Karta 3: Bateria

- Technologia (Li-Ion NMC / LFP / inne).
- Pojemność nominalna i użyteczna.
- Sprawność.
- Limity C-rate (charge / discharge).
- Limity temperatury (jeśli model wspiera).
- Degradacja (jeśli model wspiera).
- Harmonogram pracy (jeśli model wspiera).

### 4.4 Karta 4: Transformator i przyłącze

- Transformator dedykowany SN/nN (jeśli występuje).
- Napięcie po stronie BESS i po stronie sieci.
- Kabel / linia do PCC.
- Pole SN albo odpływ nN.
- Przekładniki / pomiary.
- Zabezpieczenia.

### 4.5 Karta 5: Stabilność i wsparcie sieci

- Tryb regulacji.
- Droop P/f, Q/U.
- Ograniczenie prądu / mocy.
- Czas reakcji.
- Model dynamiczny.
- Parametry odtwarzania mocy po zakłóceniu.
- Status danych.

### 4.6 Karta 6: FRT / HVRT

(Identyczna struktura co PV.)

### 4.7 Karta 7: Gotowość obliczeń

Macierz 6 typów × statusy.

---

## 5. FW — karty (PR-8)

### 5.1 Karta 1: Dane podstawowe

- Nazwa farmy.
- Typ turbiny: asynchroniczna / DFIG / full converter / inne.
- Liczba turbin, moc pojedynczej.
- Moc farmy.
- Punkt przyłączenia.

### 5.2 Karta 2: Sieć wewnętrzna

- Kolektory SN.
- Kable wewnętrzne.
- Transformatory turbin.
- Transformator główny.
- Rozdzielnia farmy.
- Pole przyłączeniowe.
- PCC.

### 5.3 Karta 3: Sterowanie i regulacja

- Regulator farmy.
- Q(U), P(f).
- cos φ.
- Ograniczanie mocy.
- Ramp rate.
- Zdolność Q.
- Napięcie w PCC.

### 5.4 Karta 4: Modele dynamiczne

- Model turbiny.
- Model konwertera.
- Model regulatora farmy.
- Limity, opóźnienia, parametry stabilności.

### 5.5 Karta 5: FRT / HVRT

(Identyczna struktura co PV / BESS.)

### 5.6 Karta 6: Zgodność przyłączeniowa

(Identyczna struktura co PV.)

### 5.7 Karta 7: Gotowość obliczeń

Macierz 6 typów × statusy.

**Uwaga:** Repozytorium nie posiada solverów stabilności / FRT / HVRT / NC RfG. PR-8 dostarcza:
- schema danych w `enm/der_fw.py`,
- UI placeholder z statusem „brak modułu obliczeniowego",
- walidację schematu danych.

Pełna implementacja numeryczna wymaga osobnych goalów.

---

## 6. Reguły walidacji DER (BINDING)

1. Każde DER musi mieć przypisany port (`sn_der_*` lub `nn_der_*`).
2. Napięcie urządzenia musi być spójne z napięciem szyny / portu.
3. Brak danych falownika / PCS → status zwarciowy = „brak danych".
4. Brak krzywych FRT/HVRT → status FRT-HVRT = „brak danych".
5. Brak profilu wymagań NC RfG → status zgodności = „brak profilu wymagań".
6. UI nie pokazuje fałszywych wyników. Brak modułu = `⊘ brak modułu obliczeniowego`.

---

**Koniec dokumentu.**
