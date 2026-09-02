# MV-DESIGN-PRO — PLAN SYSTEMU SYMBOLI SLD (SN + nN), pakiet §179 poz. 10 (mandat §100–§103, §160)

**Status:** PROPOZYCJA DO PRZEGLĄDU WŁAŚCICIELA — plan pakietu referencyjnego; NIE jest rejestrem wiążącym. Rejestr wiążący dla nN (R2.1, geometria ze schematu referencyjnego właściciela) pozostaje w `docs/sld/SLD_SYMBOL_NORMATIVE_REGISTRY.md` i jest tu ZACHOWANY jako podstawa; symbole SN dostają status DRAFT do czasu zatwierdzenia pakietu przez właściciela (procedura jak R2 §21/§27: „najpierw zatwierdź pakiet, potem migruj renderer").
**Data:** 2026-09-02 · **Autor:** Fable · **Nadrzędny:** `MV_DESIGN_PRO_SLD_PRESENTATION_ARCHITECTURE.md` §2.3, §4
**Uczciwość normatywna:** żaden symbol poniżej nie jest „zweryfikowany normatywnie" (0 × NORMATIVE_VERIFIED w repo — audyt A7-05). Identyfikatory IEC 60617 podane tylko tam, gdzie istniejący rejestr R2.1 już je niesie; pozostałe oznaczono „do potwierdzenia w bazie IEC 60617" — bez zgadywania numerów.

---

## 1. Zasady pakietu
1. **Jeden rejestr** `ElectricalCadSymbolRegistry` (model `CadSymbolDef` z R2: `id`, `domainType`, `functionalClass`, `standardReference`, `polishName`, `projectDesignation`, `terminals` na siatce 1 u, `anchors`, `body` z prymitywów (linia/łuk/okrąg/ścieżka — zero ikon aplikacji, bitmap, czcionek ikon), `states` przez geometrię, `nominalWidth/Height`, `minimumSizePx`, `lodPolicy`, `verificationStatus`).
2. **Symbol z danych**: klasa funkcjonalna z katalogu/typu twin (`functional_class`), przestrzeń katalogu (`APARAT_NN_MCB` vs `APARAT_NN`), nigdy z nazwy/roli pola; brak klasy = symbol ogólny + komunikat audytu.
3. **Stan wyłącznie geometrią** (kąt noża; UNKNOWN = nóż −15° + kreska przerywana; TRIPPED = otwarty + znacznik; INTERMEDIATE = kąt pośredni); wypełnienie tuszem tylko tam, gdzie IEC rysuje element pełny.
4. **Jedna rodzina łączników** (styk stały u góry y = 7, przegub (8,17), nóż 11,5 u, otwarcie w górę-lewo −30°, kwalifikatory funkcji nieruchome na styku stałym: „×" wyłącznik, poprzeczka odłącznik, poprzeczka + okrąg rozłącznik, wkładka na nożu, wyzwalacze przy nożu) — wg R2.1, wprost z pierwowzoru właściciela.
5. **Hierarchia grubości**: BUS > SYMBOL > przewód > etykieta; screen-stable typografia (14/11/9,5 px) — z gramatyki wizualnej nN.
6. **Statusy weryfikacji**: DRAFT → ENGINEERING_REVIEWED (identyfikator w oficjalnym wykazie IEC + zgodność z pierwowzorem) → NORMATIVE_VERIFIED (porównanie 1:1 z bazą IEC 60617, dostęp licencyjny — decyzja właściciela o zakupie).
7. **Test rozpoznawalności bez etykiet** (klucz §22 z pakietu R2) rozszerzony na SN: każdy symbol musi być rozróżnialny od pozostałych w mono na 24 px.

## 2. Lista symboli (mandat §100 + odkryte w audycie) — CURRENT → PROPOSED

Legenda CURRENT: R1 = glify SN `v3/symbols`, R2 = rejestr CAD nN `v3/cad`, R4 = `canonical_symbols` (martwe), — = brak. Stany: c/o/u = closed/open/unknown; pełny = REST/OPEN/CLOSED/TRIPPED/INTERMEDIATE/UNKNOWN. LOD: 0 = blok/kolaps, 1 = pole, 2 = aparat.

| # | Symbol (PL / EN) | Typ domenowy twin | Oznaczenie | CURRENT | PROPOSED (rejestr wspólny) | Stany | LOD | Odniesienie / status docelowy |
|---|---|---|---|---|---|---|---|---|
| 01 | wyłącznik mocy / breaker | `Breaker` (SN, nN ACB/MCCB) | QF (Q) | R1 `breaker` (kwadrat, fill) + R2 `cad.wylacznik` | `cad.wylacznik` (nóż + „×") dla SN i nN | pełny | 1–2 | S00287 (R2.1, ENGINEERING_REVIEWED) |
| 02 | wyłącznik instalacyjny / MCB | `Breaker(functional_class=MCB)` | QF (F) | R2 `cad.wylacznikInstalacyjny` | bez zmian | pełny | 2 | S00227 + kwalifikatory (R2.1) |
| 03 | odłącznik / disconnector | `Disconnector` | QS | R1 + R2 `cad.odlacznik` | `cad.odlacznik` | pełny | 2 | S00288 (R2.1) |
| 04 | rozłącznik / switch-disconnector | `LoadBreakSwitch` | QS | R1 `loadBreakSwitch` + R2 `cad.rozlacznik` | `cad.rozlacznik` | pełny | 2 | S00290 (R2.1) |
| 05 | łącznik ogólny / switch | `Switch` bez klasy | Q | R2 `cad.lacznik` | bez zmian (+ audyt „brak klasy") | pełny | 2 | S00227 (R2.1) |
| 06 | uziemnik / earthing switch | `EarthSwitch` | QE | R1 `earthSwitch` + R2 `cad.uziemnik` (DRAFT) | `cad.uziemnik` — z elementem twin (koniec DRAFT) | c/o/u | 2 | S00288 + S00200 (R2.1) — po pojawieniu się encji: ENGINEERING_REVIEWED |
| 07 | bezpiecznik / fuse | `Fuse` | FU (F) | R1 + R2 `cad.bezpiecznik` | `cad.bezpiecznik` | bez stanu | 2 | S00362 (R2.1) |
| 08 | rozłącznik bezpiecznikowy / fuse-switch | `FuseSwitch` | QF/FU | R1 `fuseSwitch`, `nnFuseSwitch` + R2 | `cad.rozlacznikBezpiecznikowy` | pełny | 2 | S00370 (R2.1) |
| 09 | stycznik / contactor | `Contactor` (nowa encja) | KM | — | `cad.stycznik` (styk zwierny z kwalifikatorem stycznika) | c/o/u | 2 | do potwierdzenia w bazie IEC 60617; DRAFT |
| 10 | reklozer / recloser | `Recloser` | Q (SPZ) | R1 `recloser` | `cad.reklozer` (wyłącznik + znacznik SPZ) | pełny | 1–2 | do potwierdzenia; DRAFT |
| 11 | szyna / busbar | `BusbarSection` | — | segment `bus/busGpz` (SN), `szynaSekcji` (nN) | prymityw magistrali (grubość BUS) z zaciskami sekcji | — | 0–2 | prymityw rysunkowy, nie symbol IEC |
| 12 | sekcja szyn + sprzęgło / bus section + coupler | `BusbarSection` × `Breaker/Disconnector` sprzęgła | QBC | GPZ `busbarTopology`, nN `sections[]` | kontener sekcji + aparat sprzęgła z rejestru (01/03/04) w szczelinie | jak aparat | 1–2 | — |
| 13 | transformator dwuuzwojeniowy / transformer 2W | `PowerTransformer` (2 końcówki) | T | R1 `transformer2W` + R2 `cad.transformator2u` | `cad.transformator2u` (dwa okręgi, zaciski SN/nN, grupa jako tekst tabliczki) | — | 0–2 | S00841 (R2.1) |
| 14 | transformator trójuzwojeniowy / 3W | `PowerTransformer` (3 końcówki) | T | R4 (martwe) | `cad.transformator3u` (trzy okręgi) | — | 1–2 | do potwierdzenia; DRAFT |
| 15 | przełącznik zaczepów / tap changer | `TapChanger` na TR | — | adnotacja `oltcGlyph` | strzałka regulacji na symbolu TR (OLTC) / znacznik DETC | — | 2 | do potwierdzenia; DRAFT |
| 16 | przekładnik prądowy / CT | `CurrentTransformer` (+ rdzenie) | TA (BI) | R1 + R2 `cad.przekladnikPradowy` | `cad.przekladnikPradowy`; liczba rdzeni jako tekst tabliczki | — | 2 | S00850 (R2.1) |
| 17 | przekładnik napięciowy / VT | `PotentialTransformer` | TV (BU) | R1 + R2 `cad.przekladnikNapieciowy` | `cad.przekladnikNapieciowy`; układ (gwiazda/otwarty trójkąt) jako tabliczka | — | 2 | S00878 (R2.1) |
| 18 | przekładnik Ferrantiego / core-balance CT | `CurrentTransformer(arrangement=ferranti)` | TA0 | — (tylko pole `ct_arrangement`) | `cad.przekladnikFerrantiego` (pierścień na przewodzie) | — | 2 | do potwierdzenia; DRAFT |
| 19 | ogranicznik przepięć / surge arrester | `SurgeArrester` | F (SPD) | R1 `surgeArrester` (tylko z danych) | `cad.ogranicznik` | — | 2 | do potwierdzenia; DRAFT |
| 20 | dławik / reactor | `ShuntReactor` / `SeriesReactor` (nowe encje) | L | — (R4 martwe) | `cad.dlawik` | — | 2 | do potwierdzenia; DRAFT |
| 21 | bateria kondensatorów / capacitor bank | `ShuntCompensator` (ISTNIEJE w ENM) | C | — (menu `add-compensator` bez symbolu) | `cad.bateriaKondensatorow` | c/o (łącznik baterii) | 2 | do potwierdzenia; DRAFT |
| 22 | cewka Petersena / Petersen coil | `PetersenCoil` (urządzenie punktu neutralnego) | L_N | R1 `neutralEarthing` (`earthingKind`) | `cad.cewkaPetersena` + `cad.rezystorUziemiajacy` + `cad.uziemienieBezposrednie` (trzy symbole punktu neutralnego) | — | 2 | do potwierdzenia; DRAFT |
| 23 | kabel / cable | `ACLineSegment(kind=cable)` | W | segment `sn/snTrunk`, nN `W` | prymityw przewodu (grubość PRZEWÓD) + etykieta techniczna | — | 0–2 | prymityw |
| 24 | linia napowietrzna / overhead line | `ACLineSegment(kind=overhead)` | W | segment + `branchPole` | prymityw + rozróżnienie graficzne (np. znacznik słupa) | — | 0–2 | prymityw; DRAFT |
| 25 | głowica kablowa / cable head | `CableHead` | — | R1 `cableHead` | `cad.glowicaKablowa` | — | 2 | do potwierdzenia; DRAFT |
| 26 | mufa / cable joint | `CableJoint` | — | R1 `jointSleeve` | `cad.mufa` (na przewodzie, bez podziału topologii) | — | 2 | do potwierdzenia; DRAFT |
| 27 | zacisk / terminal | `Terminal` | — | R2 `cad.zacisk` | bez zmian | — | 2 (audyt: nazwy zacisków) | S00017 (R2.1) |
| 28 | węzeł łączności / junction (kropka) | `ConnectivityNode` z ≥3 zaciskami | — | R1 `junction`, R2 `cad.wezel` | `cad.wezel` | — | 1–2 | S00020/S00021 (R2.1) |
| 29 | punkt rozgałęźny SN (słup/ZKSN) / branch point | `Junction(kind=branch_pole | zksn)` | — | R1 `branchJunction`, `branchPole` | `cad.punktRozgalezny` (słup) i `cad.zksn` (złącze kablowe z aparatami z rejestru) | — | 1–2 | konwencja PL; DRAFT |
| 30 | generator synchroniczny / generator | `SynchronousMachine` | G | R1 `derGenerator` + R2 `cad.generator` | `cad.generator` | — | 1–2 | S00819 (R2.1) |
| 31 | przekształtnik (falownik/PCS) / converter | `PowerElectronicsConnection` | — | R2 `cad.przeksztaltnik` | bez zmian; PCS jako OSOBNY element (dziś złożenie z baterią) | — | 2 | S00896 (R2.1) |
| 32 | źródło PV / PV | `EnergySourceUnit(PV)` + PEC | G (PV) | R1 `derPv`, R2 złożenie | `cad.modulPv` + `cad.przeksztaltnik` (złożenie z danych: moduły osobno, gdy w modelu) | — | 1–2 | R2.1 (złożenie) |
| 33 | bateria / battery | `EnergySourceUnit(BATTERY)` | — | R2 w złożeniu `magazynZPrzeksztaltnikiem` | `cad.bateria` (osobno) + PCS (31) | — | 2 | S01342 (R2.1) |
| 34 | turbina wiatrowa / wind | `EnergySourceUnit(WIND)` | G (FW) | R1 `derWind` | `cad.turbinaWiatrowa` | — | 1–2 | do potwierdzenia; DRAFT |
| 35 | odbiór / load | `EnergyConsumer` | — | R1 `loadArrow`, R2 `cad.odplywOdbior` | `cad.odbior` (strzałka) | — | 1–2 | S00104 (R2.1) |
| 36 | silnik / motor | `AsynchronousMachine` (nowa encja) | M | — (R4 martwe) | `cad.silnik` (okrąg „M" z symbolem 3~) | — | 2 | do potwierdzenia; DRAFT |
| 37 | licznik / meter | `Meter` | — | R1 `meter` | `cad.licznik` (kWh) + powiązanie z rdzeniem pomiarowym CT/VT | — | 2 | do potwierdzenia; DRAFT |
| 38 | przekaźnik / IED / relay | `ProtectionRelay` | — | R1 `protectionRelay`, R2 `cad.zabezpieczenie` (DRAFT) | `cad.zabezpieczenie` z kodami ANSI (≤2 wprost, ≥3 licznik) + tor wyzwalania do wyłącznika | — | 2 | konwencja (kody ANSI); ENGINEERING_REVIEWED po rejestrze ANSI/IEC 61850 |
| 39 | zasilanie systemowe / external grid | `ExternalGrid` | — | R1 `gridSource`, `gpzCollapsed` | `cad.siecZasilajaca` (symbol sieci) + blok GPZ zwinięty (L0) | stany źródła | 0–1 | do potwierdzenia; DRAFT |
| 40 | punkt przyłączenia / grid connection point | `GridConnectionPoint` (obiekt umowy, na terminalu) | PP | — (termin zakazany; `zaciskGranicy`) | znacznik na zacisku (nie aparat) z etykietą umowy | — | 1–2 | konwencja PL; DRAFT — zależy od decyzji ADR-024 |
| 41 | rozdzielnica nN (wyrób) / LV board | `Substation(kind=LV_BOARD)` | RG | nN kontener sekcji | kontener z tabliczką wyrobu (In, Icw, IP) | — | 0–2 | prymityw |
| 42 | SZR / ATS | `TransferSwitch` (nowa encja) | — | — | `cad.szr` (łącznik dwupołożeniowy z automatyką) | pełny | 2 | do potwierdzenia; DRAFT |
| 43 | wskaźnik napięcia / VPIS | `VoltageIndicator` | — | R1 `voltageIndicator` | `cad.wskaznikNapiecia` | — | 2 | do potwierdzenia; DRAFT |
| 44 | RCD / wyłącznik różnicowoprądowy | `ResidualCurrentDevice` (nowa encja nN) | QF (RCD) | — | `cad.rcd` (aparat z kwalifikatorem różnicowym) | pełny | 2 | do potwierdzenia; DRAFT |
| 45 | portal nN (nawigacja) | — (element nawigacyjny) | — | R1 `lvPortal` | zachować jako element nawigacyjny, NIE symbol IEC (poza rejestrem symboli) | — | 1–2 | konwencja własna |

## 3. Stany, LOD, oznaczenia
- Stany §4 architektury prezentacji; mapowanie z `OperationalState` w projekcji.
- LOD per symbol z `lodPolicy` (min. rozmiar w px, widoczność etykiet).
- Oznaczenia projektowe: IEC 81346 (=,+,-) jako pole `designation` twin; kolejność odpływów/pól z klucza domenowego (numer oznaczenia → `ref_id`), nie z rysunku (audyt A7 §9 pkt 1 — pytanie do właściciela o konwencję numeracji OSD).

## 4. Procedura zatwierdzenia (jak R2 §21/§27)
1. Harness pakietu (`sld-symbol-pack-harness`) renderuje tablicę CURRENT → PROPOSED × stany × mono/kolor dla WSZYSTKICH 45 pozycji (SN i nN).
2. Porównanie wektorowe z rysunkiem referencyjnym właściciela (R2.1 §12) dla rodziny łączników; brakujące rodziny (dławik, kondensator, silnik, stycznik, SZR, RCD, głowica, mufa, słup, ZKSN, GPZ) — propozycja geometrii do decyzji właściciela.
3. Werdykt właściciela per symbol (B-02) → status; dopiero potem migracja renderera SN.
4. Kasacja rejestrów R1/R4/R5/R6 po parytecie snapshotów sceny.

## 5. Decyzje właściciela
1. Zakup/dostęp do bazy IEC 60617 dla statusu NORMATIVE_VERIFIED (bez tego maksimum = ENGINEERING_REVIEWED, uczciwie).
2. Konwencja oznaczeń (IEC 81346 vs zwyczaj OSD) i klucz porządkowania pól/odpływów.
3. Przyjęcie geometrii łączników R2.1 (pierwowzór właściciela) jako jedynej dla SN.
