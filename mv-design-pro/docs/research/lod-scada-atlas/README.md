# Atlas referencyjny LOD / SCADA / SLD

**Zakres:** interfejsy do wizualizacji sieci elektroenergetycznych i przemysłowych w systemach CAD/CAE, SCADA, DMS, EMS, ADMS i GIS.  
**Data przeglądu publicznych źródeł:** 2026-11-11.  
**Status:** **RESEARCH ONLY — dokumentacja zewnętrzna, niewiążąca, bez decyzji projektowych.**

## Zawartość

1. [REJESTR_DOWODOW.md](./REJESTR_DOWODOW.md) — 44 oznaczonych rekordów z bezpośrednimi źródłami producentów, definicjami i ograniczeniami.
2. [REJESTR_DOWODOW.csv](./REJESTR_DOWODOW.csv) — te same 44 obserwacje w formacie tabelarycznym do analizy maszynowej.
3. [KARTY_SYSTEMOW.md](./KARTY_SYSTEMOW.md) — szczegółowe karty produktów, słownik funkcjonalny oraz niepotwierdzone twierdzenia.
4. [MATERIALY_I_KONTEKST.md](./MATERIALY_I_KONTEKST.md) — dokumenty pomocnicze, odniesienia do kontekstu repo, źródła historyczne i indeks ilustracji.

## Granice tego PR

- Jest to **zbiór obserwacji**, a nie projekt rozwiązania dla MV-DESIGN-PRO, roadmapa, przepis na UI, backlog ani standard branżowy.
- Nie zawiera oceny produktów w punktach, rankingu, listy „wdrożyć/odrzucić”, rekomendowanej liczby LOD, progów powiększenia, polityki etykiet ani schematu komponentów.
- Fable **samodzielnie** ocenia źródła, porównuje stan kodu i opracowuje wszelkie rozwiązania, wykorzystując obowiązujący kanon i istniejący plan projektu.
- **Nie edytowano** `mv-design-pro/PLANS.md`, żadnej implementacji, specyfikacji wiążącej, dokumentów PR #528 ani kart UX. Materiał znajduje się w `docs/research`, tak jak obecna biblioteka SEL Blueframe.
- Nie kopiowano treści chronionych instrukcji ani ilustracji producentów; zamieszczono odnośniki i krótkie, własnymi słowami napisane opisy.
- Nazwy firm lub dokumentów nie stanowią dowodu używania danego SCADA przez ENEA Operator.

## Istniejące dokumenty repo będące kontekstem (bez zmiany ich rangi)

- [PLANS.md](../../../PLANS.md) — jedyny rejestr statusów i priorytetów.
- [AGENTS.md](../../../AGENTS.md), [KANON_V12_XX](../../v12xx/KANON_V12_XX.md) — obowiązujące zasady.
- [PROGRAM_UIUX_2026-07.md](../../uiux/PROGRAM_UIUX_2026-07.md) — istniejące karty UI/UX.
- [SLD_CAD_SPEC_V3.md](../../sld/SLD_CAD_SPEC_V3.md) — specyfikacja SLD projektu.
- [PR #528](https://github.com/radekizk-sketch/MV-Design-PRO/pull/528) — wcześniejsza wizja F01–F43 / W01–W22 / U01–U08, bez kopiowania treści ani zmiany statusu.
- [sel-blueframe](../sel-blueframe/) — istniejący niezależny zbiór badań zewnętrznych.

## Przekazanie do Fable

W repo znajduje się wyłącznie neutralna baza danych porównawczych. Każda przyszła decyzja projektowa, ocena wykonalności i aktualizacja istniejącej pracy należą do Fable, a nie do niniejszego atlasu.
