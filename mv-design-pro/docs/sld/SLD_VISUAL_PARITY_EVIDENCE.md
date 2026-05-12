# SLD Visual Parity Evidence

**Status:** dowody częściowe: użytkownik dostarczył zrzuty referencyjne w wątku,
ale nie są jeszcze zapisane jako pliki w repo.  
**Decyzja:** używać tych zrzutów jako bieżącego kierunku UX/SLD, ale nie deklarować
pixel-level parity do czasu zapisania referencji i uruchomienia golden image snapshots.

## Co jest obecnie udowodnione

| Obszar | Dowód | Wniosek |
|---|---|---|
| GPZ canonical renderer | Testy DOM + `data-parity-key` | renderer ma mierzalny fundament strukturalny |
| Header operatorski GPZ | `gpz.header.*` | można weryfikować obecność transmisji, nazwy, bilansu, alarmów i sterowania |
| Strona WN/SN | `gpz.hv`, `gpz.bus.hv`, `gpz.bus.sn` | można weryfikować rozdział strony 110 kV i SN |
| Aparatura pola SN | `gpz.apparatus.*` | można weryfikować obecność CB/DS/CT/ES/głowicy |
| Stacja mini-RMU | `station.mini.*` | stacja w oddaleniu jest mierzalnym mini-blokiem, nie pojedynczym rombem |
| DER w mini-bloku | `station.mini.der_*` | badge PV/BESS/FW są wykrywalne strukturalnie |

## Czego nie wolno jeszcze twierdzić

1. Że render jest zgodny piksel w piksel z Mikronika MIKRA, Sygnity, ABB MicroSCADA, ETAP albo DIgSILENT.
2. Że osiągnięto pełny visual parity bez porównania ze zrzutami referencyjnymi.
3. Że audyt 10/10 obejmuje estetykę operatorską, jeżeli audyt nie oglądał obrazu side-by-side.
4. Że testy DOM są równoważne golden snapshots.

## Artefakty referencyjne

| ID | Plik | Źródło | Zakres | Status |
|---|---|---|---|---|
| REF-THREAD-001 | obraz w wątku Codex | użytkownik | GPZ-8 PGL z rozdzielnią, sekcjami, TR i polami SN | użyte jako referencja kierunku |
| REF-THREAD-002 | obraz w wątku Codex | użytkownik | GPZ + duża sieć terenowa z magistralami i stacjami | użyte jako referencja kierunku |
| REF-THREAD-003 | obraz w wątku Codex | użytkownik | stacja z przyłączem OZE/PV i aparaturą | użyte jako referencja kierunku |
| REF-THREAD-004 | obraz w wątku Codex | użytkownik | szeroki widok sieci terenowej ze stacjami, NMO i odgałęzieniami | użyte jako referencja kierunku |
| REF-FILE-001 | brak | brak | GPZ | do zapisania w `reference_screenshots/` |
| REF-FILE-002 | brak | brak | stacja SN/nN | do zapisania w `reference_screenshots/` |
| REF-FILE-003 | brak | brak | sieć terenowa | do zapisania w `reference_screenshots/` |
| REF-FILE-004 | brak | brak | DER przy stacji | do zapisania w `reference_screenshots/` |

## Wnioski z aktualnych referencji użytkownika

| ID | Obserwacja | Wymaganie dla renderu | Status |
|---|---|---|---|
| OBS-001 | Status transmisji nie może dominować nad nazwą GPZ, szczególnie gdy jest nieznany | ukryć `TRANSMISJA NIEZNANA`; pokazywać tylko realny status transmisji | wdrożone |
| OBS-002 | GPZ musi wyglądać jak rozdzielnia z sekcjami, polami i transformatorami, nie jak mała etykieta na pustej ramce | powiększyć/ustabilizować renderer GPZ względem LOD i danych ENM | do dalszej pracy |
| OBS-003 | Stacja terenowa musi być mini-rozdzielnicą RMU, ale bez nachodzenia etykiet | poprawić skalę, hierarchy text i collision avoidance mini-bloku | do dalszej pracy |
| OBS-004 | Sieć terenowa ma mieć ortogonalne korytarze magistrala -> stacja -> odcinek -> stacja | layout corridor + route anchoring do portów | do dalszej pracy |
| OBS-005 | Wyniki/statusy nie mogą zasłaniać schematu | warstwy wyników tylko na żądanie i z LOD | do dalszej pracy |

## Artefakty testowe

| ID | Plik testu | Zakres | Typ dowodu |
|---|---|---|---|
| TEST-001 | `frontend/src/ui/sld/v2/renderer/__tests__/visualParityChecklist.test.tsx` | GPZ + mini-RMU | strukturalny DOM |
| TEST-002 | pending | GPZ fixtures x LOD | golden image snapshot |
| TEST-003 | pending | mini-RMU x footprint | golden image snapshot |
| TEST-004 | pending | duża sieć terenowa | visual regression |

## Plan domknięcia pixel-level parity

1. Zapisać referencje z wątku jako pliki w `docs/sld/reference_screenshots/`, jeżeli prawa do użycia w repo są potwierdzone.
2. Oznaczyć każdy zrzut metadanymi i powiązać z punktami checklisty.
3. Dodać renderer fixtures:
   - GPZ 1xTR,
   - GPZ 2xTR,
   - GPZ 2 sekcje + sprzęgło,
   - GPZ z alarmem,
   - GPZ z brakiem transmisji,
   - mini-RMU końcowa/przelotowa/odgałęźna/sekcyjna/OZE.
4. Dodać Playwright albo image-snapshot pixel-diff.
5. Przyjąć próg tolerancji i dokumentować różnice celowe.
6. Dopiero wtedy zmienić status z “fundament strukturalny” na “zweryfikowany parytet wizualny”.

## Werdykt

Aktualny stan: **operator-grade fundament strukturalny aspirujący do SCADA OSD**.  
Status “pixel-level visual parity”: **niezweryfikowany**.
