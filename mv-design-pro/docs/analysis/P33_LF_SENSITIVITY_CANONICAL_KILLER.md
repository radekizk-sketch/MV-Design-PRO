# P33 — Wrażliwość napięć (LF Sensitivity)

**STATUS: BINDING**

## 1. Cel

Pakiet P33 dostarcza deterministyczną analizę wrażliwości napięć na parametry obciążenia oraz parametrów katalogowych elementów, bez ponownego uruchamiania rozpływu mocy.

## 2. Wejścia (read-only)

- ProofDocument P32
- VoltageProfileView P21
- NormativeReport P20

## 3. Zasady post-hoc

Analiza nie uruchamia solvera. Wykorzystuje wartości bazowe z P32 oraz progowe poziomy z P20 i P21.

## 4. Model perturbacji

Parametry analizowane w postaci odchyłek procentowych w górę i w dół:

- moc czynna
- moc bierna
- rezystancja
- reaktancja
- napięcie znamionowe jako parametr oceny

## 5. Równania pomocnicze

$$
\Delta U_{R}=\frac{R\cdot P}{U_{n}}
$$

$$
\Delta U_{X}=\frac{X\cdot Q}{U_{n}}
$$

$$
\Delta U=\Delta U_{R}+\Delta U_{X}
$$

$$
\delta_{U}[\%]=100\cdot\frac{\Delta U}{U_{n}}
$$

## 6. Wyjście

Każdy BUS posiada wpis zawierający:

- identyfikator BUS
- bazową odchyłkę napięcia
- progi ostrzegawcze i krytyczne
- listę driverów uporządkowaną po wpływie
- listę brakujących danych

## 7. NOT COMPUTED

Jeśli dane wejściowe są niekompletne, wpis BUS jest oznaczony jako NOT COMPUTED, a lista braków zawiera nazwy brakujących pól.

## 8. Determinizm

Identyczne wejścia generują identyczny wynik, w tym deterministyczny identyfikator analizy oraz deterministyczną kolejność driverów.
