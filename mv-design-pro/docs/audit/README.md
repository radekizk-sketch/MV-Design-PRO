# Audit Index PR-A..PR-G

Status: indeks dokumentacyjny po etapach PR-A..PR-G. Nie jest wygenerowanym raportem i nie zawiera lokalnych sciezek absolutnych.

## Szybka mapa

| Temat | Dokument |
| --- | --- |
| Runtime audit SLD i odciecie statycznego ekranu | [MV_DESIGN_PRO_SLD_RUNTIME_AUDIT.md](./MV_DESIGN_PRO_SLD_RUNTIME_AUDIT.md) |
| Kontrakty GPZ, pol i aparatury | [MV_DESIGN_PRO_SLD_GPZ_CONTRACT_AUDIT.md](./MV_DESIGN_PRO_SLD_GPZ_CONTRACT_AUDIT.md) |
| Kontrakty stacji SN/nN i rozdzielnic | [MV_DESIGN_PRO_SLD_STATION_SWITCHGEAR_AUDIT.md](./MV_DESIGN_PRO_SLD_STATION_SWITCHGEAR_AUDIT.md) |
| Warianty PV/BESS i NOP | [MV_DESIGN_PRO_SLD_SOURCE_CONNECTION_AUDIT.md](./MV_DESIGN_PRO_SLD_SOURCE_CONNECTION_AUDIT.md) |
| Zbiorcze test evidence PR-A..PR-G | [MV_DESIGN_PRO_END_TO_END_AUDIT.md](./MV_DESIGN_PRO_END_TO_END_AUDIT.md) |
| Wiazacy kontrakt runtime SLD | [../sld/SLD_SYSTEM_SPEC_CANONICAL.md](../sld/SLD_SYSTEM_SPEC_CANONICAL.md) |

## Zakres PR-A..PR-G

| Etap | Zakres | Evidence |
| --- | --- | --- |
| PR-A | Odciecie statycznego `EngineeringSldScreen` i powrot trasy SLD do aktywnego potoku ENM -> SLD. | Runtime audit, guard `sldCanonicalHygiene`. |
| PR-B | Jawne role GPZ, pola liniowe GPZ, pomiar szyny, sprzeglo sekcyjne i aparatowy kontrakt FE/BE. | GPZ contract audit, testy field/switchgear. |
| PR-C | Stacje SN/nN jako bloki rozdzielnic z polami, a nie pojedyncze ikony transformatora. | Station switchgear audit, testy station builder. |
| PR-D | Kanoniczne warianty PV/BESS oraz semantyka NOP bez heurystyk renderera. | Source connection audit, testy reader/validation. |
| PR-E | Publiczny jezyk UI i korekta mojibake na aktywnych powierzchniach. | Zbiorczy audit E2E, guardy terminologii. |
| PR-F | Regresja: projekcja, layout, kontrakty, deterministycznosc, typy i walidacje. | Zbiorczy audit E2E, sekcja Test Evidence. |
| PR-G | Real-backend E2E, raport/eksport i glowne przeplywy uzytkownika. | Zbiorczy audit E2E, sekcje Test Evidence i E2E Startup Repair. |

## Reguly czytania

- `EngineeringSldScreen`, `canonicalSnSldModel` i `canonicalSnSldSymbols` sa nazwami odrzuconego, statycznego artefaktu audytowego. Nie sa kanonem produktu.
- Kanoniczna sciezka produktu to ENM snapshot -> projekcja -> layout -> `SLDView` / `SLDViewCanvas`, opisana w `../sld/SLD_SYSTEM_SPEC_CANONICAL.md`.
- Raporty audit moga zawierac historyczne wycinki komend jako dowod. Nie nalezy ich odswiezac tylko po to, aby zmienic lokalne outputy lub sciezki.
- Snapshoty, goldeny i hashe sa evidence runtime/testow. Ten indeks nie aktualizuje ich i nie ustanawia nowych baseline'ow.
