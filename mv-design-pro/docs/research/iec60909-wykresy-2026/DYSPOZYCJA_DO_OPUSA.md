# Krótka dyspozycja dla Opusa — istniejąca karta wykresów zwarciowych

1. Przeczytaj pakiet \`docs/research/iec60909-wykresy-2026/\` i sprawdź punkty normy w uprawnionym egzemplarzu IEC 60909-0:2016.
2. Zbadaj aktualną gałąź wyników zwarć oraz istniejący backend. Nie zakładaj, że dane z historycznego main odpowiadają bieżącemu wykonawcy. Nie buduj drugiego solvera.
3. W istniejącym widoku „Zwarcia” dołóż trzy rodzaje analiz: \`Oddziaływanie cieplne\`, \`Prąd wyłączalny\`, \`Rodzaje zwarć\`. Wykresy \`q\` i \`λ\` dostępne tylko w właściwych kartach maszyn, \`κ\` bez duplikacji.
4. **P0 fizyka:** prąd gałęziowy różny od prądu w węźle zwarcia; \(I_{th}\), \(J\) i czas \(T_k\) powiązane; \(\mu,q,\lambda\) tylko dla właściwych maszyn; mapa rys. 7 warunkowa (osie X=Z2/Z1, Y=Z2/Z0).
5. **P0 obliczenia:** brak pozornej interpolacji, obliczeń m/n w React, kopiowania krzywych IEC lub „przykładowych” danych jako wyników.
6. Użyj istniejących kontraktów danych/śladu/eksportów, jednego punktu zwarciowego i jednego numeru rewizji. Bez nowej głównej zakładki i bez przebudowy UI zaakceptowanego kierunkowo.
7. Zrób niezależne rachunki i testy WYK-01…WYK-18; błędy rdzenia przekaż do odpowiedniej karty P0 bez samodzielnego przebudowania solvera.
8. Przedstaw rzeczywiste zrzuty i raport różnic; bieżącej B-02 nie oznaczaj jako zamkniętej bez odbioru właściciela.
9. Wykonawcom badającym dokumentację i repo przydziel tanie podagenty. Decyzje architektoniczne, ocenę normową i integrację zatwierdza Opus.
10. PR zawiera **wyłącznie dokumentację do wykorzystania**. Nie scalać go automatycznie ani nie tworzyć alternatywnego planu w repo.
