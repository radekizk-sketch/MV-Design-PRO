# MODUŁ nN — INDEKS DOKUMENTÓW PRZEDIMPLEMENTACYJNYCH (2026-08)

**Status:** WIĄŻĄCY (raport wymagany przed implementacją — §75 zlecenia właściciela).
**Cel programu:** pełne projektowanie i obliczenia sieci nN jako integralna część MV-DESIGN-PRO
— jeden model elektryczny SN↔TR↔nN, bez osobnego kalkulatora.
**Metoda:** audyt 10 obszarów repo wykonany równolegle (agenci, dowody `plik:linia`),
synteza architektoniczna w jednej sesji nadzorczej. Repo > specy > rejestr.

| Dok | Plik | Treść |
|---|---|---|
| A | `A_AUDYT_STANU_NN_2026-08.md` | Stan zastany funkcji nN (EXISTS/PARTIAL/MISSING/DUPLICATED/LEGACY) |
| B | `B_MAPA_REUSE_NN.md` | Co reużywamy, czego nie budujemy od nowa |
| C | `C_PLAN_ROZSZERZENIA_MODELU_NN.md` | Rozszerzenie ENM/katalogu o topologię nN |
| D | `D_KONTRAKT_SN_NN_V1.md` | Kontrakt danych SN↔nN + inwarianty LV-INV-01…12 |
| E | `E_MACIERZ_OBLICZEN_NN.md` | Macierz obliczeń: wejścia→model→solver→wynik→walidacja→konsument |
| F | `F_PLAN_UI_NN_STUDIO.md` | Plan powierzchni UI (nN STUDIO w `ui2`) |
| G | `G_MACIERZ_LUK_BACKENDU_NN.md` | Luki backendu (BACKEND GAP) + rejestr danych normatywnych |
| H | `H_PLAN_IMPLEMENTACJI_NN.md` | Plan plik-po-pliku, fazy P0/P1/P2 |
| I | `I_MACIERZ_TESTOW_NN.md` | Macierz testów (numeryczne + topologiczne + E2E) |

## Zasady nadrzędne programu nN (z zlecenia właściciela, skrót)

1. **ONE ELECTRICAL MODEL** — transformator stacji SN/nN jest automatycznie źródłem strony nN;
   zakaz ponownego pytania o Sn/uk/przekładnię/zaczep/grupę w jakimkolwiek ekranie nN.
2. **Model = graf elektryczny** — dowolna liczba odcinków, rozgałęzień, rozdzielnic, sekcji,
   źródeł; zakaz płaskiej listy odcinków i limitów liczności z UI.
3. **Zero duplikacji formuł** — jedna fizyka w solverach; UI i raport konsumują wynik + provenance.
4. **Zero fake engineering** — brak funkcji ⇒ jawny `BACKEND GAP` z kontraktem, nigdy fikcyjny wynik.
5. **Kolejność:** poprawność elektryczna → kompletność obliczeń → automatyzacja doboru → estetyka UI.
6. **DoD funkcji nN:** MODEL → VALIDATION → SOLVER → RESULT → TRACE → SLD → REVISION → DOCUMENT → TEST.
