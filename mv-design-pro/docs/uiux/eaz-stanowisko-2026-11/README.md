# MV-DESIGN-PRO — pełne stanowisko EAZ, koordynacji i nastaw (11.2026)

**Status:** SPECYFIKACJA DO WDROŻENIA przez Opusa; dokumentacja, nie implementacja ani potwierdzenie odbioru. Mandat właściciela 2026-11-12: pełna rozbudowa **istniejącego stanowiska**, porównywalna funkcjonalnie w odpowiednich obszarach z DIgSILENT PowerFactory / ETAP Star / NEPLAN / EasyPower / narzędziami IED. „Wszystko co konkurencja” znaczy **pełny użyteczny dla projektanta SN zakres inżynierski udokumentowany w atlasie**, nie bezkrytyczne kopiowanie produktów ani zlecenie stworzenia SCADA/110 kV.

## Hierarchia i odpowiedzialność

Obowiązują: `CLAUDE.md`, kanon V12.xx, `docs/adr/ADR-022-protection-domain-in-model.md`, `docs/uiux/KONTRAKT_PREZENTACJI_INZYNIERSKIEJ_V12_7.md`, `docs/uiux/PROGRAM_UIUX_2026-07.md`, `PLANS.md` §C, `docs/sld/SLD_CAD_SPEC_V3.md`. **`PLANS.md` jedynym rejestrem postępu; ten katalog nie jest równoległym planem.** Właściciel rozstrzyga B-02. Opus projektuje szczegóły i integruje; tani agenci zbierają dowody, nie decydują o fizyce.

Przed zmianą kodu: porównać najnowszą gałąź stanowiska 50/51 z `main`; sprawdzić równoległe prace EAZ 51N/67N, inspektora, nawigacji, zwarć OZE, CT/VT. Wyniki inwentarza mają rozróżniać: **działa / częściowo / luka / równoległy wykonawca**. Nie odtwarzać istniejących funkcji drugi raz.

## Pomiary wykonane na main 2026-11-12

- `frontend/src/ui2/wyniki/koordynacja/EkranKoordynacji.tsx`: rama stanowiska.
- `frontend/src/ui/protection-coordination/ProtectionCoordinationPage.tsx`: rzeczywista strona.
- `frontend/src/ui/protection-coordination/TccChart.tsx`: rysowanie krzywych z backendu.
- `frontend/src/ui/protection-curves/TimeCurrentChart.tsx`: wspólny renderer krzywych.
- `docs/uiux/karty/FE5B_KOORDYNACJA_E28_OD_FLOW.md`: wcześniejsza karta podmiany atrapy.
- `docs/adr/ADR-022-protection-domain-in-model.md`: zaakceptowana domena `ProtectionDevice`, `ProtectionFunction`, `SettingGroup`, `TripMatrix`, rdzenie CT, uzwojenia VT; TCC to projekcja.
- `docs/twin/MV_DESIGN_PRO_PROTECTION_ARCHITECTURE.md`: historyczny audyt; zgłoszone duplikaty IDMT i brakujące kontrakty trzeba **zmierzyć aktualnie**, nie przyjmować, że nadal istnieją.

Stan na zrzutach użytkownika: 1440×900 jasny i 1280×720 ciemny, wątek 2026-11-12, ekran `Koordynacja nadprądowa 50/51`. Szczegółowe obserwacje: [01_AUDYT_DWOCH_KADROW.md](01_AUDYT_DWOCH_KADROW.md).

## Spis specyfikacji

1. [01_AUDYT_DWOCH_KADROW.md](01_AUDYT_DWOCH_KADROW.md) — poprawki dokładnie wskazanych elementów obrazu.
2. [02_ATLAS_KONKURENCJI_I_ZRODEL.md](02_ATLAS_KONKURENCJI_I_ZRODEL.md) — udowodnione funkcje konkurencji, URL i status dowodowy.
3. [03_KONTRAKT_DOMENY_I_DANYCH.md](03_KONTRAKT_DOMENY_I_DANYCH.md) — model, rewizje, CT/VT, IED, zakresy nastaw, przejścia SLD.
4. [04_SILNIK_OCEN_I_PRADY_CT.md](04_SILNIK_OCEN_I_PRADY_CT.md) — prądy widziane przez oba zabezpieczenia, selektywność, minima/maksima, logika wyłączeń i OZE.
5. [05_EKRANY_I_INTERAKCJE.md](05_EKRANY_I_INTERAKCJE.md) — precyzyjny kontrakt ekranu i responsywności.
6. [06_FUNKCJE_EAZ_I_WYKRESY.md](06_FUNKCJE_EAZ_I_WYKRESY.md) — 50/51, 51N, 67N, admitancyjne, 87T, 50BF, SCO itd.
7. [07_PRZYPADKI_SIECI_I_SCENARIUSZE.md](07_PRZYPADKI_SIECI_I_SCENARIUSZE.md) — punkty zwarć, OZE, sprzęgła, CT, Z0 i scenariusze.
8. [08_TESTY_I_ODBIOR_B02.md](08_TESTY_I_ODBIOR_B02.md) — testy EAZ-001…EAZ-040 i dowody.
9. [09_KONTRAKT_REALIZACJI_OPUS.md](09_KONTRAKT_REALIZACJI_OPUS.md) — praca z tanimi agentami, etapy integracji w istniejącym programie, bramki.

## Kryterium produktu

**Jeden widok roboczy EAZ**: wybór obiektu i rzeczywistego IED → nastawy ASSET i ich grupy → wybór zwarcia/scenariusza → prądy widziane przez właściwe CT/VT → krzywe i charakterystyki z solvera → kolejność wyłączeń, czułość, selektywność, rezerwa i ocena aparatury → dowód tabelaryczny → dokumentacja. W każdej warstwie te same ID elementów, biegi, rewizje i stan aktualności.

**Wynik jednostkowy ≠ pełna ocena zakresu.** Kolor zielony ma zawsze określoną podstawę i zakres, brak danych nie jest sukcesem.

## Źródła normowe i prawa

Użytkownik udostępnił PN-EN 60909-0:2016, PN-EN 60909-3:2010, PN-EN 62271-1:2018 oraz zmianę PN-EN 50160:2023-10/A1:2025-04; są to źródła dla odpowiednich elementów zwarciowych, aparaturowych i napięciowych. **Pełne IEC 60255-151, IEC 60255-181 i IEC 60255-187-1 nie zostały potwierdzone jako udostępnione** — znane są katalogi IEC i źródła producentów. Nie odtwarzać z pamięci tabel norm, współczynników, tolerancji ani kryteriów. Brak dostępu do danego tekstu normy zgłosić jawnie i zapewnić odpowiedni test na potwierdzonym źródle.

Brak reprodukcji schematów produktów konkurencji i tekstu płatnych norm w PR. Przykłady i wykresy wdrożeniowe są oryginalne i obliczane z backendu.

**B-02 dla SLD GPZ nie jest tym PR akceptowane ani zamykane.**
