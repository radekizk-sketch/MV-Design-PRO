# FABLE — karta wykonawcza KSR-GLOBAL-2026-10-11
**Przedmiot:** integracja profesjonalnego konfiguratora stacji SN/nN z całym MV-DESIGN PRO. **Status:** DO WYKONANIA, nie implementacja.

1. Przeczytaj `CLAUDE.md`, `AGENTS.md`, `STAN_REPO.md`, `docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` §5, §7, §12, §14, `docs/domain/KONFIGURATOR_ROZDZIELNIC_SN_RMU.md` i **całą** `docs/spec/KSR_GLOBAL_KONFIGURATOR_STACJI_2026-10-11.md`.
2. Sprawdź bieżący HEAD, PR #477 i #478, zmiany równoległe POLA-W-TORZE, SLD-SUBSTRAT, BIEG-ZABEZPIECZEN-Z-MODELU, GOTOWOSC-DER-BACKEND i POLE-ZAJĘTE. Nie deklaruj scalonych zmian bez SHA.
3. Otwórz istniejący `StationConfigurator.tsx` (17 etapów), karty, `StationTemplateWizard.tsx`, `AddDerWizard.tsx`, `SldCanvasV3.tsx`, katalog OEM i ENM. Nie kopiuj demonstracyjnego HTML jako kodu produkcyjnego. Jeśli HTML nie jest dostępny, wykonaj najpierw specyfikację i poproś o źródło makiety; nie odtwarzaj schematu z obrazka.
4. Zbuduj mapę AS-IS → LUKA → OWNER → OPERACJA → KONSUMENT → TEST. Odróżnij brak danych katalogowych od błędu implementacji.
5. Wdrażaj według G0–G8 z §6 specyfikacji, na gałęziach i z atomowymi commitami. Każdy etap zawiera działającą pionową ścieżkę ENM → katalog → SLD V3 → solver input → wynik → raport, odpowiednio do zmiany.
6. Wymagaj kompletnego toru prądu, fizycznych terminali i głowic, blokad, CT/VT/EAZ, PV/BESS/PCS/PCC, stanów łączeniowych, dwóch projekcji SLD SN/nN i wersjonowania biegów. Nie wolno rysować wymyślonego aparatu ani podstawiać zer.
7. Testy T01–T20 specyfikacji: najpierw negatywne, potem naprawa, następnie mutacja. Po każdej partii zaktualizuj rejestr planu Fable o SHA, faktyczne PASS/FAIL, ryzyko i stan zależności.
8. Nie zmieniaj B-01, nie rozszerzaj normowego statusu solvera i nie oznaczaj katalogu OEM jako potwierdzonego bez dokumentów. Normy 2026 wymagają osobnej walidacji.
9. Dostarcz PR z opisem zakresu, migracji, testów, ryzyk, listą ekranów i porównaniem stanu przed/po; dołącz dowód Playwright na realnym backendzie, a nie obrazek.
10. WERDYKT: `ACCEPTED` tylko przy spełnieniu P0, testów i pełnego dowodu. W przeciwnym razie `REJECTED` z precyzyjną przyczyną i natychmiastową korektą w ramach tej samej pracy.

**Zakaz:** drugi ENM, drugi SLD, zgadywane pola ZPUE/Siemens/ABB/Schneider, fikcyjne obciążenia i zwarcia, gotowość z frontowego procentu, ukrycie błędu przez etykietę „do uzupełnienia”.
