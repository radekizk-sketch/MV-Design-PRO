# Mapa danych i punktów integracji — pomiar przed wdrożeniem

**Pomiar repo wykonano na main w dniu 2026-11-12.** To lista orientacyjnych miejsc wejścia, NIE twierdzenie o zawartości roboczych gałęzi Opusa. Wykonawca ma zweryfikować aktualny stan każdej gałęzi przed zapisaniem zmian.

| Obszar | Znane miejsce w repo (main) | Co zbadać |
|---|---|---|
| Obliczenia postprocesowe | \`backend/src/network_model/solvers/short_circuit_core.py\` | \`ShortCircuitPostProcessResult\`, \`m_factor/n_factor\`, \`_thermal_mn_factors\`, \`compute_post_fault_quantities\`, wyznaczanie \`kappa\`, \`Ith\`; zakres prawdziwości \`n=1\` i czasu Tk |
| Solver i kontrakt wyników | \`backend/src/network_model/solvers/short_circuit_iec60909.py\` | \`EXPECTED_SHORT_CIRCUIT_RESULT_KEYS\`, \`ikss_a\`, \`ip_a\`, \`ith_a\`, \`ib_a\`, \`kappa\`, \`tk_s\`, \`tb_s\`, \`contributions\`, \`branch_contributions\`, \`white_box_trace\`; czy model faktycznie oblicza potrzebne źródłowe współczynniki |
| Maszyny i źródła | \`backend/src/network_model/solvers/machine_sc_iec60909.py\` | Aktualne modele prądu wyłączalnego, udziałów synchronicznych/asynchronicznych/DFIG/PF; współczynniki \`μ\`, \`q\`, \`λ\` i dostępność danych |
| Obliczenia krokowe | \`backend/src/application/proof_engine/packs/sc_symmetrical.py\` | Istniejący przekaz \`m_factor/n_factor\` do uzasadnienia obliczeń; nie tworzyć drugiego źródła wyników |
| Istniejący audyt fizyki | \`docs/audit/AUDYT_FIZYKI_2026-07.md\` | Sprawdzić wcześniej udokumentowaną decyzję \`n=1\` i ograniczenia |
| Wymagania produktu | \`PLANS.md\`, \`docs/uiux/PROGRAM_UIUX_2026-07.md\` | Podłączyć jako zakres istniejącej karty wyników/wykresów, bez dodatkowego programu |
| UI wykresów i dowodów | Ustalić na bieżącej gałęzi wykonawcy | Punkt zwarcia i wskazanie, zakres, inspektor, tabela, eksport SVG/PDF/TikZ, identyfikatory modelu i rewizja. Nie zgadywać komponentu po historycznej ścieżce. |

## Kontrakty bezwzględne

1. **Jedna prawda wyniku:** przyjmuje się wartości solvera wraz z identyfikatorem scenariusza, rodzaju zwarcia, punktu, rewizji, źródeł i warunków. Nie liczyć \`m,n,\mu,q,\lambda\` powtórnie w React na bazie wymyślonych przybliżeń.
2. **Jedna prawda geometrii wykresu:** wspólny model danych dla UI, eksportu i kroków obliczeń, bez rozjazdu legend i próbek.
3. **Rozdzielenie prądu miejsca zwarcia od prądu gałęziowego:** dobór wyłącznika, kabel, szyna i CT muszą używać właściwego pomiaru/gałęzi. Nie przypisywać całego \`Ik\` każdego punktu wszystkim elementom.
4. **Brak danych = jawna przyczyna:** szczególnie \`Z0\`, \`Ik\`, \`Tk\`, \(I_{cw}\), charakterystyka ograniczania prądu i parametry maszyny.
5. **Warunki normowe:** rys. 7 — jednakowe kąty impedancji; rys. 13/14 — maszyny właściwego typu; rys. 15/16 — wariant wirnika i serie; rys. 18/19 — właściwe czasy, \(m,n\), przyjęte dopuszczalne uproszczenia.
6. **Nie ingerować w P0 solvera bez zgody właściciela karty:** wykryte błędy fizyki dokumentować z minimalnym reproduktorem i przekazać do odrębnej naprawy istniejącego rdzenia.
7. **Bez dublowania prac:** naprawę niespójności inspektora zwarć prowadzi wykonawca inspektora/nawigacji; karta wykresów udostępnia poprawne dane i przeprowadza test kontraktowy.
8. **Bez niezweryfikowanego twierdzenia o IEC 2026:** tytuły/numery rysunków i wzory dotyczą edycji 2016.

## Uwaga dotycząca audytu dawnych oznaczeń

W repo mogą istnieć wcześniejsze opisy odwołujące się do niezgodnej numeracji wzorów IEC; wykonawca ma cytować rzeczywistą edycję 2016 i nie poprawiać „pod normę” bez kontroli w jej oryginalnym tekście. Nie utrwalać błędnej osi rysunku 7 z wcześniejszej wiadomości.
