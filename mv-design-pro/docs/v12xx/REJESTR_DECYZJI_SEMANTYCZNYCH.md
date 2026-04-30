# Rejestr decyzji semantycznych V12.xx

Status: aktywny  
Zakres: kontrakt zamrozony `MV-DESIGN-PRO V12.xx - Semantyczny Rdzen Elektroenergetyczny v8`

## Zasada zmiany kontraktu

Kazda zmiana po zamrozeniu kontraktu v8 wymaga wpisu w tym rejestrze przed merge.

Wpis musi wskazac:

| Pole | Wymaganie |
|---|---|
| Kod decyzji | `V12S-XXX` |
| Obszar | semantyka / diagnostyka / gotowosc / solver / raport / SLD / overlay / migracja |
| Powod | Dlaczego zmiana jest konieczna inzyniersko |
| Kontrakt zmieniony | Nazwa interfejsu, projekcji, reguly albo guardu |
| Wplyw na semanticHash | tak / nie + uzasadnienie |
| Wplyw na diagnosticsHash | tak / nie + uzasadnienie |
| Wplyw na readinessHash | tak / nie + uzasadnienie |
| Wplyw na inputHash | tak / nie + uzasadnienie |
| Wplyw na reportEligibilityHash | tak / nie + uzasadnienie |
| Wplyw na viewHash | tak / nie + uzasadnienie |
| Wplyw na overlayHash | tak / nie + uzasadnienie |
| Migracja | Wymagana migracja danych albo `nie dotyczy` |
| Test regresji | Nazwa testu blokujacego regresje |
| Status | proponowana / zatwierdzona / wygaszona |

## Zakres pierwszego wdrozenia M0-M4

Pierwszy zakres produkcyjny obejmuje kregoslup projektanta sieci:

- GPZ uproszczony.
- GPZ pelny jako struktura semantyczna, z jawna blokada brakow WN, jezeli dane sa niekompletne.
- Szyna SN i sekcja szyn.
- Pole odplywowe SN.
- Pole transformatorowe.
- Pole pomiarowe.
- Pole sprzeglowe.
- Odcinek kablowy SN.
- Odcinek napowietrzny SN.
- Stacja koncowa SN/nN.
- Stacja przelotowa SN/nN.
- Transformator SN/nN.
- Strona nN jako odrebna domena.
- SLD z projekcji semantycznej.
- Inspektor z Karta semantyczna.
- Menu z polityki akcji.

Nie zaczynamy od rozszerzen OZE, FRT, stabilnosci ani raportow, jezeli przeplyw
`GPZ -> szyna SN -> pole SN -> odcinek SN -> stacja SN/nN` nie dziala na SLD.

## Decyzje zamrozone

| Kod | Status | Obszar | Powod | Kontrakt zmieniony | semanticHash | diagnosticsHash | readinessHash | inputHash | reportEligibilityHash | viewHash | overlayHash | Migracja | Test regresji |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| V12S-001 | zatwierdzona | semantyka / governance | ENM ma pozostac jedyna prawda domenowa, a UI nie moze interpretowac elementow lokalnie. | `EngineeringSemanticModel`, `SldBaseProjectionViewModel`, `ContextActionPolicy` | tak, gdy zmienia sie struktura lub funkcja elektroenergetyczna | nie | nie | posrednio, przez semanticHash | nie | nie | nie | M1-M4 | `no-ui-derived-semantics.test.ts` |
| V12S-002 | zatwierdzona | SLD / solver | Zmiana SLD, layoutu, LOD albo etykiety nie moze uniewazniac obliczen. | `SldBaseProjectionViewModel`, `ResultBinding` | nie | nie | nie | nie | nie | tak | mozliwe, jesli overlay jest liczony na nowym widoku | nie dotyczy | `sld-view-change-does-not-invalidate-calculation-results.test.ts` |
| V12S-003 | zatwierdzona | wyniki / solver | Zmiana funkcji pola, polaczenia lub semantyki modelu musi uniewaznic wynik liczony na starym modelu. | `ResultBinding`, `ResultFreshnessState` | tak | nie | mozliwe | tak dla nowego wejscia solvera | mozliwe | nie | tak dla nakladek wynikowych | nie dotyczy | `semantic-change-invalidates-result.test.ts` |
| V12S-004 | zatwierdzona | migracja legacy | Adapter legacy nie moze cicho podnosic starego elementu do pelnego modelu technicznego. | `LegacySemanticMappingStatus`, `EngineeringCompleteness` | tak, gdy zmienia sie jawne mapowanie elementu | tak | tak | mozliwe | tak | mozliwe | mozliwe | M0-M4 | `architectureGuards.test.ts` |
| V12S-005 | zatwierdzona | workflow projektanta | Kontrakt v8 nie jest spelniony bez minimalnej rzeczywistej sciezki projektanta. | M0-M4 acceptance criteria | tak, bo dotyczy funkcji i polaczen | tak | tak | tak | tak | tak | tak | M2-M4 | `engineer-workflow-gpz-bay-segment-through-station.test.tsx` |
| V12S-006 | zatwierdzona | diagnostyka / migracja | Migracja legacy wymaga widoku porownawczego ENM kontra EngineeringSemanticModel i nie moze cicho awansowac elementu do pelnego modelu. | `SemanticDiagnosticsReport`, `LegacySemanticMappingStatus` | nie, raport czyta projekcje | tak, bo pokazuje wynik diagnostyki | mozliwe | nie | tak, jezeli mapowanie zmienia raportowalnosc | mozliwe, przez klasy renderu | mozliwe | M0-M4 | `semantic-diagnostics-report.test.ts` |
| V12S-007 | zatwierdzona | semantyka / governance | Domena musi egzekwowac pasma napieciowe na koncach galezi i ciaglosc SN przez stacje przelotowa. Egzekucja tylko w adapterze FE narusza V12S-001 (ENM jako jedyna prawda domenowa). | `enm.validator.validate_branch_endpoints_voltage`, `enm.validator.validate_through_station_continuity`, `enm.exceptions.DomainInvariantError`, `wizard_actions.service.apply` | tak, bo zmienia sie jawne reguly polaczen | tak | tak | nie | mozliwe | nie | nie | nie dotyczy | `test_voltage_band_endpoint_validation.py`, `test_through_station_continuity_domain.py` |
| V12S-008 | zatwierdzona | semantyka / domain ops | Generator.connection_variant musi byc walidowany krzyzowo z station_ref i blocking_transformer_ref. Enum bez walidacji refow jest pozorna semantyka. | `Generator.model_validator(mode="after")`, `domain.eligibility_models.ELIG_GEN_CONNECTION_VARIANT_INCONSISTENT` | tak, dotyczy struktury polaczenia generatora | tak | tak | nie | mozliwe | nie | nie | nie dotyczy | `test_converter_source_domain_ops.py` |
| V12S-009 | zatwierdzona | governance / migracja | Katalog-first jest twardy w action envelope (rejekcja CREATE_BRANCH/TRANSFORMER/SOURCE bez catalog_ref), miekki w modelu (kompatybilnosc z importem XLSX i draft=True). Element draft pozostaje LogicalSketch i nie awansuje do MODEL_TECHNICZNY_PELNY (V12S-004). | `wizard_actions.service.apply`, `LogicalSketch` flag | nie, model nie zmienia struktury | tak | tak | tak, bo blokuje wejscie solvera bez katalogu | tak, bo bez katalogu raport techniczny zablokowany | nie | nie | nie dotyczy | `test_catalog_gate.py`, `catalogFirstRules.test.ts` |
| V12S-010 | zatwierdzona | semantyka / wyniki | Jednolity ENM hash uniemozliwia rozniczkowe uniewaznianie wynikow. Split na piec ortogonalnych hashy: semanticHash (topologia + role + pasma + catalog_ref), inputHash (wejscia obliczeniowe), caseHash (parametry przypadku), variantHash (delty wariantu jako overlay, nie oddzielny model), switchingSnapshotHash (tylko stany lacznikow). Stary compute_enm_hash zostaje jako alias compute_input_hash (deprecation w docstring, BEZ runtime warning - determinizm). | `enm.hash.compute_semantic_hash`, `compute_input_hash`, `compute_case_hash`, `compute_variant_hash`, `compute_switching_snapshot_hash`, `ENMHeader` (5 nowych pol Optional[str]) | tak, semanticHash to nowy kontrakt | tak | tak | tak, bo inputHash to nowy kontrakt | tak, bo reportEligibility czyta caseHash + variantHash | nie | tak, bo overlay liczy variantHash | golden network pin pieciu hashy | `test_hash_chain_split.py` |
| V12S-011 | zatwierdzona | wyniki / solver boundary | Wyniki solverow musza niesc element_ref_id (additive, optional, populated w warstwie result_mapping). Solver dalej liczy po UUID (WHITE BOX nietkniety). FE/proof czyta wynik po stabilnym ref_id zamiast UUID lookup. | `application.result_mapping`, `resultset_v1_schema.json`, frozen result dataclasses (additive field) | nie, semantyka bez zmian | nie | nie | nie | tak, bo raport czyta po ref_id | nie | nie | nie dotyczy | `test_result_mapping_ref_id.py`, `proof-hash-chain.spec.ts` |

## Diagnostyka semantyczna modelu

Na czas migracji aktywnym narzedziem czyszczenia dlugu jest raport `SemanticDiagnosticsReport`.

Raport musi pokazywac:

- elementy ENM bez odpowiadajacego elementu semantycznego,
- elementy semantyczne bez roli,
- elementy semantyczne bez portow wymaganych dla funkcji,
- elementy semantyczne bez pozycji sieciowej,
- elementy semantyczne bez katalogu albo kontraktu rownowaznego,
- elementy widoczne w ENM, ale nierenderowalne produkcyjnie,
- elementy renderowane jako szkic logiczny,
- elementy renderowane jako blokada semantyczna,
- mapowania legacy ze statusem `ZMAPOWANY_PELNIE`, `ZMAPOWANY_CZESCIOWO`, `WYMAGA_DECYZJI_UZYTKOWNIKA`, `NIEZGODNY_Z_KANONEM` albo `ODRZUCONY`.

Element legacy ze statusem innym niz `ZMAPOWANY_PELNIE` nie moze automatycznie otrzymac `MODEL_TECHNICZNY_PELNY`, produkcyjnego renderu, pelnych obliczen ani raportowalnosci. Naruszenie tej zasady jest traktowane jako ciche mapowanie legacy i blokuje bramke M4.

## Bramki M0-M4

| Faza | Bramka |
|---|---|
| M0 | Wykryto lokalne odczyty ENM w SLD/Inspektorze/menu, generyczne renderery i lokalne menu. |
| M1 | Dziala adapter ENM -> EngineeringSemanticModel, semanticHash i diagnostyka naruszen. |
| M2 | SLD, Inspektor i menu czytaja projekcje semantyczna albo projekcje pochodne z semanticHash. |
| M3 | Nowe operacje tworza role, porty, pozycje i kompletność; katalog-first blokuje pelne obliczenia bez materializacji. |
| M4 | Brak generycznych rendererow, brak lokalnych menu, brak topologii z geometrii, importy surowego ENM w aktywnej sciezce sa zablokowane. |

## Warunek blokujacy

Kontrakt v8 jest spelniony dopiero wtedy, gdy mozna utworzyc i poprawnie zobaczyc na SLD minimalna rzeczywista siec:

`GPZ uproszczony -> szyna SN -> pole odplywowe SN -> odcinek kablowy SN -> stacja przelotowa SN/nN -> dalszy odcinek SN z pola wyjsciowego oraz transformator SN/nN ze strona nN jako odrebna domena`.

Jezeli ten przeplyw nie dziala, semantyka pozostaje abstrakcja i nie jest uznana za zakonczona.
