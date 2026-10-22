# Normy obliczeń zwarciowych — IEC 60909 (wydania 2016 i 2026)

**Data stanu:** 2026-10-22. **Status:** pakiet dokumentacyjno-implementacyjny, **nie jest aktywnym wyborem profilu normy**.

## Szybki dostęp

| Artefakt | Przeznaczenie |
|---|---|
| [IEC_60909_0_2026_DOSSIER.md](IEC_60909_0_2026_DOSSIER.md) | Bibliografia, pewne fakty, spis klauzul, zakres i fizyka Z0 |
| [MAPA_IEC_60909_2016_2026.md](MAPA_IEC_60909_2016_2026.md) | Mapa referencji i nieweryfikowanych różnic |
| [KONTRAKT_SELEKTORA_IEC60909.md](KONTRAKT_SELEKTORA_IEC60909.md) | Docelowy selektor w StudyCase, API, dowodach i UI |
| [MACIERZ_TESTOW_IEC60909_2026.md](MACIERZ_TESTOW_IEC60909_2026.md) | Testy fizyki 3F/2F/2F-Z/1F-Z, gałęzi, źródeł, UI i raportu |
| [rejestr_iec60909.json](rejestr_iec60909.json) | Dane strukturalne dla narzędzi, **nieaktywny rejestr informacyjny** |
| [PRZEKAZANIE_DLA_OPUS_55.md](PRZEKAZANIE_DLA_OPUS_55.md) | Granice scalania, weryfikacja pakietu i bramka wydania 2026 |

## Zasady

1. **Nie oznaczać profilu 2026 jako zaimplementowanego ani zweryfikowanego** na podstawie spisu treści, przedmowy lub parafrazy wydań wcześniejszych.
2. **Nie kopiować treści normy** do publicznego repozytorium; licencjonowany egzemplarz u uprawnionego audytora, w repo tylko indeks klauzul, własne interpretacje i wyniki weryfikacji.
3. **Nie mylić IEC z krajowym oznaczeniem PN-EN/PN-EN IEC**: polska adopcja, data wycofania i obowiązywanie w Polsce muszą być osobno potwierdzone przez PKN.
4. **Nie naruszać kanonu V12.xx**, ADR-007, niezmienności ENM, wyników frozen i zakazu ponownego liczenia fizyki w UI.
5. **Nie wykorzystywać 60909-0 do normowego obliczania 1F-Z w sieci izolowanej / rezonansowo uziemionej**; w tych sieciach konieczne oddzielne opracowanie zakresu metody.
6. Opisany selektor jest **produktem docelowym**, a nie wykonanym interfejsem. Do włączenia wymagany jest pełny dowód numeryczny i przekrojowe testy E2E.

Źródło metryki: https://webstore.iec.ch/en/publication/68454
