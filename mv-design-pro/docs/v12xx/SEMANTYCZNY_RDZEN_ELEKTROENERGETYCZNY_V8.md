# MV-DESIGN-PRO V12.xx - Semantyczny rdzen elektroenergetyczny V8

Status: kontrakt zamrozony kierunkowo  
Data: 2026-04-28  
Implementacja frontendowa: `src/ui/engineering-semantic/`

## 1. Zasada nadrzedna

ENM pozostaje jedyna prawda domenowa. `EngineeringSemanticModel` jest deterministyczna, tylko-do-odczytu projekcja ENM, uzytych materializacji katalogowych i ontologii elektroenergetycznej. Nie przyjmuje mutacji uzytkownika, nie zapisuje danych projektowych i nie moze posiadac stanu rozbieznego wzgledem ENM.

Jezeli komponent UI potrzebuje wiedziec, czym jest element, nie wolno mu tego ustalac z nazwy, typu komponentu, CSS, geometrii, etykiety ani lokalnego enum. Musi otrzymac te informacje z `EngineeringSemanticModel` albo z projekcji pochodnej wskazujacej `semanticHash`.

## 2. Rozdzielone projekcje i hashe

| Warstwa | Hash | Znaczenie |
|---|---|---|
| Semantyka elektroenergetyczna | `semanticHash` | struktura sieci, role, porty, terminale, domeny, polaczenia fizyczne, graf fizyczny, konteksty uziemienia |
| Diagnostyka semantyczna | `diagnosticsHash` | wynik diagnostyki liczony osobno od rdzenia semantyki |
| Gotowosc | `readinessHash` | gotowosc elementow i blokady procesowe |
| Wejscie solvera | `inputHash` | przypadek, wariant, migawka lacznikow, materializacje, typ analizy, ustawienia solvera i zalozenia |
| Raportowalnosc | `reportEligibilityHash` | raportowalnosc elementow, wynikow, uzasadnien i paczek raportowych |
| Bazowy widok SLD | `viewHash` | renderery, layout, LOD, symbole, trasy i etykiety |
| Nakladka SLD | `overlayHash` | markerowa warstwa wynikowa albo audytowa liczona wzgledem `baseViewHash` |

`semanticHash` nie obejmuje diagnostyki, gotowosci, raportowalnosci, solver input, rendererow, ikon, layoutu, LOD, stylu, aktywnej nakladki ani kolejnosci prezentacji UI.

## 3. Polityka hashowania

`semanticHashPolicy.ts` jest biblioteka uzywana przez projekcje. Nie jest dokumentem pomocniczym. Kazda deterministyczna projekcja ma uzywac `CanonicalHashPolicy<T>`.

Zaden deterministyczny hash nie obejmuje:

- `generatedAt`, `createdAt`, `updatedAt`, `buildStartedAt`, `buildFinishedAt`,
- `author`,
- tekstow UI, tlumaczen i etykiet wyswietlanych,
- kolejnosci prezentacji w UI,
- kolejnosci renderowania.

Listy sa sortowane kanonicznie po identyfikatorach, z wyjatkiem pol, w ktorych kolejnosc jest trescia inzynierska albo geometryczna, np. `primaryPath` i `pathPoints`.

`catalogSnapshotRef` jest kontekstem katalogowym, ale `semanticHash` zalezy od `usedCatalogMaterializationHash`, czyli materializacji faktycznie uzytych przez elementy modelu.

## 4. Kontrakty elementow

Kazdy element semantyczny musi miec:

- `refId`,
- `elementKind`,
- `engineeringRole`,
- `functionalRole`,
- `networkPosition`,
- `voltageDomain`,
- `completeness`,
- `reportEligibility`,
- `dataQualityState`,
- porty i terminale wymagane przez role.

Port nie przechowuje kierunku graficznego SLD ani listy polaczonych elementow. Port opisuje role przylaczeniowa, domene napieciowa, system fazowy i polityke polaczen. Polaczenia sa wylacznie w `EngineeringConnection`.

Polaczenie produkcyjne musi miec `validatedByRuleRefs`. Puste `validatedByRuleRefs` oznacza, ze polaczenie nie spelnia kanonu.

## 5. GPZ, pole SN i transformator

GPZ nie jest stacja SN/nN. `GpzSemanticStructure` rozroznia tryb uproszczony i pelny:

- GPZ uproszczony wymaga `supplyShortCircuitModelRefId`,
- GPZ pelny moze wyliczac model zwarciowy z transformatora WN/SN i sieci zasilajacej.

Pole SN ma jawna funkcje `MvBayFunction` i polityke `MvBayFunctionPolicy`. Pole odplywowe liniowe moze wyprowadzac odcinek SN. Pole transformatorowe prowadzi do transformatora. Pole pomiarowe nie prowadzi toru mocy. Pole sprzeglowe laczy sekcje szyn. Pole wymagajace aparatu glownego bez aparatu moze byc szkicem, ale nie pelnym modelem technicznym.

Transformator ma `highSide` i `lowSide` jako `EngineeringSide`. Strony maja role, domene napieciowa, system fazowy, porty, terminale i `earthingContextRefId`. `voltageRatio` jest etykieta techniczna; wartosci liczbowe wynikaja ze stron i materializacji katalogowej.

## 6. Solver, wynik i raport

`CalculationInputSnapshot` musi zawierac `caseHash`, `variantHash`, `switchingSnapshotHash`, `analysisType`, `solverKind`, `solverSettingsHash`, `assumptionsHash` i `calculationGraphHash`.

`ResultBinding` jest pelnym lancuchem:

`elementRefId -> semanticHash -> inputSnapshotRefId -> inputHash -> proofRefId -> reportEligibility`

Wynik bez `elementRefId` nie moze byc pokazany jako wynik elementu na SLD. Wynik bez `semanticHash` albo `inputSnapshotRefId` nie moze byc aktualny ani raportowy.

Raportowalnosc jest liczona per typ raportu i obejmuje elementy, wyniki, uzasadnienia oraz cala paczke raportowa.

## 7. SLD jako projekcja

`SldBaseProjectionViewModel` jest widokiem bazowym powiazanym z `semanticHash`. `SldOverlayProjection` jest osobna projekcja nakladki powiazana z `baseViewHash`.

`SldSymbolInstance.elementKind` i `SldSymbolInstance.engineeringRole` sa kopiami diagnostycznymi z `EngineeringElement`. Nie sa zrodlem semantyki. Niezgodnosc kopii z modelem semantycznym blokuje render.

`SldRoute` jest przebiegiem graficznym `EngineeringConnection`. Trasa wynika z polaczenia. Polaczenie nigdy nie wynika z trasy ani z punktow `x/y`.

## 8. Szkic logiczny a blokada semantyczna

`SZKIC_LOGICZNY` jest dozwolonym, jawnym stanem niepelnego elementu planowanego. Nie jest bledem semantycznym.

`BLOKADA_SEMANTYCZNA` oznacza blad albo nierozpoznanie funkcji elektroenergetycznej. Taki element nie dostaje normalnego symbolu produkcyjnego.

## 9. Procedura zmiany kontraktu

Kazda zmiana po zamrozeniu wymaga:

- wpisu w `REJESTR_DECYZJI.md`,
- wskazania zmienianego albo naruszanego kontraktu,
- migracji danych,
- testu regresji,
- aktualizacji `schemaVersion`,
- uzasadnienia, czy zmienia `semanticHash`, `diagnosticsHash`, `readinessHash`, `inputHash`, `reportEligibilityHash`, `viewHash` albo `overlayHash`.

## 10. Bramki M0-M4

M0: wykryc lokalne odczyty ENM w SLD, Inspektorze i menu; wykryc generyczne renderery i lokalne menu.  
M1: zbudowac adapter ENM -> `EngineeringSemanticModel`, `semanticHash` i diagnostyke.  
M2: przelaczyc SLD, Inspektor i menu na projekcje semantyczne oraz polityki akcji.  
M3: nowe operacje domenowe musza tworzyc role, porty, pozycje sieciowe, kompletnosc i status katalogowy.  
M4: usunac generyczne renderery, lokalne menu, topologie z geometrii i produkcyjne importy surowego ENM w SLD.

## 11. Testy kontraktowe

Kontrakt V8 jest chroniony przez testy w `src/ui/engineering-semantic/__tests__/`, w tym testy:

- `calculation-input-snapshot-includes-case-hash.test.ts`,
- `calculation-input-snapshot-includes-solver-settings-hash.test.ts`,
- `result-binding-full-chain.test.ts`,
- `report-eligibility-covers-elements-results-proofs.test.ts`,
- `equivalent-contract-applicability-scope.test.ts`,
- `engineering-connection-validated-by-rules.test.ts`,
- `engineering-side-earthing-context.test.ts`,
- `transformer-element-rated-power-and-ratio.test.ts`,
- `gpz-supply-short-circuit-model-required.test.ts`,
- `mv-bay-main-switching-device-policy.test.ts`,
- `sld-overlay-requires-base-view-hash.test.ts`,
- `sld-symbol-role-copy-matches-semantic-model.test.ts`,
- `sld-route-is-not-topology.test.ts`,
- `engineering-quantity-normalization-precision.test.ts`,
- `projection-hashes-ignore-audit-timestamps.test.ts`,
- `architectureGuards.test.ts`,
- `enm-adapter.test.ts`,
- `enmSnapshotToSldSymbols.semantic.test.ts`.

## 12. Stan wdrozenia M1/M2

M1 ma aktywna implementacje frontendowa:

- `src/ui/engineering-semantic/enmAdapter.ts` buduje `EngineeringSemanticModel` z ENM,
- `src/ui/engineering-semantic/diagnostics.ts` buduje osobna `EngineeringDiagnosticsProjection`,
- `src/ui/engineering-semantic/architectureGuards.ts` pilnuje zakazu lokalnej semantyki poza modelem/projekcja z `semanticHash`,
- `src/ui/engineering-semantic/sldProjectionAdapter.ts` buduje `SldBaseProjectionViewModel` z modelu semantycznego i istniejacej projekcji SLD,
- `src/ui/sld/enmSnapshotToSldSymbols.ts` zwraca teraz rownolegle `semanticModel`, `diagnostics` i `sldBaseProjection`.

Ten etap nie zmienia ENM i nie tworzy drugiej prawdy. SLD nadal moze uzywac istniejacych symboli wizualnych, ale dostaje rownolegle bazowy widok semantyczny z tym samym `semanticHash`.

M2 jest rozpoczety przez mostek SLD:

- symbole SLD maja kopie diagnostyczne `elementKind` i `engineeringRole` pochodzace z `EngineeringElement`,
- trasy SLD wskazuja `EngineeringConnection.connectionId`,
- role symboli sa testowane wzgledem modelu semantycznego,
- trasa graficzna pozostaje widokiem, a nie topologia.

Kolejny krok M2: przepiecie Inspektora technicznego i menu kontekstowego na `EngineeringSemanticModel` oraz polityki akcji, bez lokalnego rozpoznawania funkcji po nazwie, typie komponentu albo geometrii.

## 14. Guardy architektoniczne Worker 4

Guardy testuja granice warstw, a nie wyglad UI:

- `SldRoute.pathPoints` nie wystarcza do topologii bez istniejacego `EngineeringConnection`,
- `EngineeringSemanticModel` nie moze zawierac `violations`, `diagnosticsHash` ani hashy projekcji pochodnych,
- `diagnosticsHash` ignoruje pola czasu oraz teksty komunikatow UI,
- polityka menu albo Inspektora oparta na golym `ElementType` jest blokowana; dopuszczalny jest `EngineeringElement`, `EngineeringSemanticModel` albo `semanticHash`.
