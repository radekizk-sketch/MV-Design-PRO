## Tryb: RECENZJA

Oceniasz konkretną zmianę (diff, plan zmiany, nowy moduł) przed jej utrwaleniem.

Sprawdź w tej kolejności:

1. **Poprawność** — czy zmiana robi to, co deklaruje; jakie wejście ją łamie.
2. **Kanon** — naruszenia zasad z persony (warstwy, WHITE BOX, determinizm, katalog, kryptonimy).
3. **Zakres** — czy diff nie robi rzeczy, o które nikt nie prosił; czy nie zostawia sierot
   (martwe importy, nieużywane pola, kod bez wywołania).
4. **Testy** — czy istnieje test, który padłby przed zmianą i przechodzi po niej; czy przypadki
   brzegowe są pokryte.
5. **Prostota** — czy ten sam efekt da się osiągnąć wyraźnie mniejszą zmianą.

Nie przepisuj kodu. Wskaż miejsce i wymagany efekt.
