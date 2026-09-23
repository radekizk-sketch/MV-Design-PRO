# KONTRAKT WERDYKTU WYJAŚNIALNEGO (kanon domenowy, przekrojowy)

**Status:** WIĄŻĄCY. **Data:** 2026-09-22; korekta 2026-09-23 po przeglądzie adwersarzowym
(Opus 5.5, ETAP 7 mandatu kontynuacji: reguły decyzji K/W nie wytwarzały stanów wymaganych przez
kartę AB-1a, obwiednia FRT była traktowana jako margines zamiast warunku wstępnego, niepewność
z połowienia kroku była opisana błędnie, „p.u." bez bazy, etykiety w dwóch miejscach).
**Zakres:** CAŁY produkt — zgodność NC RfG / WOS /
PTPiREE / OSD, dynamika i FRT, zabezpieczenia i selektywność, zwarcia i wytrzymałość aparatury,
samoczynne wyłączenie zasilania (SWZ), dobór przewodów i obciążalność, spadki napięć, bilans mocy,
CCT, jakość modelu i danych — w API, w interfejsie i w dokumentach formalnych (raport, certyfikat,
wniosek do OSD).

**Podstawa:** stała zasada właściciela z 2026-09-22 („zakaz lakonicznych werdyktów"): *werdykt
typu SPEŁNIA / NIE SPEŁNIA / PASS / FAIL nie może być samodzielnym komunikatem dla użytkownika ani
samodzielnym dowodem; status może istnieć wewnętrznie jako enum maszynowy, ale zawsze musi być
związany z wyjaśnieniem: co oceniono, względem czego, jaki był wynik liczbowy, jaki limit, jaki
margines, jaka przyczyna, jaka podstawa i jaka jakość dowodu.*

**Relacja do istniejącego kanonu (rozszerza, nie zastępuje):**
`docs/uiux/KONTRAKT_PREZENTACJI_INZYNIERSKIEJ_V12_7.md` §5 (werdykt nie szerszy niż zakres), §6
(trójka wartość–granica–margines), §7 (wiarygodność ≠ spełnienie), §8 (hierarchia jawności);
`backend/src/solver_input/provenance.py` (`SourceKind`, `FieldQuality`, `EvidenceTier`,
`ClaimKind`); `backend/src/application/analyses/werdykt_projektowy.py` (`OcenaElementu` —
najpełniejsza dziś struktura oceny: przedmiot · wielkość · wartość · odniesienie · margines ·
podstawa · wynik · wniosek · dowód — punkt wyjścia typu `OcenaKryterium`). Wartości publiczne
statusu walidacji z kanonu V12 (`BLOCKER`/`IMPORTANT`/`INFO`/`OK`/`WARN`/`FAIL`, `enm.severity`)
pozostają enumem maszynowym bez zmian — ten kontrakt nie zmienia wartości kanonu, dokłada
obowiązek wyjaśnienia tam, gdzie status staje się wynikiem dla człowieka (brak konfliktu
hierarchii dokumentów).

---

## 0. Zasada

```
WYNIK INŻYNIERSKI = OCENA + KRYTERIUM + WYNIK (z jednostką) + LIMIT (z podstawą)
                  + MARGINES + PRZYCZYNA + PODSTAWA + DOWÓD + ZAKRES WAŻNOŚCI
```

Nigdy: `WERDYKT = SPEŁNIA`. Status maszynowy służy agregacji, filtrom, sortowaniu i API. **Nie
jest odpowiedzią inżynierską.** Rekord oceny bez wyjaśnienia jest błędem kontraktu (walidacja
typu odrzuca go przy konstrukcji — §11 T1).

Trzy twarde nierówności (inwarianty, każdy przypięty testem §11):

- brak danych ≠ spełnia; brak symulacji ≠ spełnia; brak certyfikatu ≠ spełnia;
- `UNVALIDATED_MODEL` ≠ pełny dowód zgodności urządzenia;
- wynik dla zakresu ważności Z nie jest opisywany jako wynik dla zakresu szerszego niż Z
  (np. zwarcie trójfazowe w składowej zgodnej ≠ zwarcie jednofazowe).

## 1. Dwa poziomy rekordu

| Poziom | Typ kanoniczny (PL) | Nazwa z mandatu (EN) | Co opisuje |
|--------|---------------------|----------------------|------------|
| K — kryterium | `OcenaKryterium` | `MetricResult` + `Margin` + werdykt kryterium | JEDNO kryterium na JEDNYM przedmiocie: wielkość zmierzona/obliczona, limit z podstawą, margines, niepewność, status, wyjaśnienie, dowód, zakres ważności, ślad |
| W — wymaganie | `WynikWymagania` | `ComplianceResult` | JEDNO wymaganie (np. NC RfG art. 14 ust. 3) dla JEDNEGO modułu/obiektu: stosowalność, sposób wykazania, oceny składowe (poziom K, zawsze widoczne), agregacja, kompletność dowodu, wyjaśnienie |

Typy pomocnicze (wspólne dla obu poziomów):

| Typ (PL) | Nazwa z mandatu | Zawartość |
|----------|-----------------|-----------|
| `WyjasnienieWerdyktu` | `VerdictExplanation` | zdanie inżynierskie, przyczyna, czego brakuje, zastrzeżenia |
| `PodstawaWymagania` | `RequirementProvenance` | rodzaj źródła, dokument, wydanie, jednostka redakcyjna, stan źródła |
| `StatusDowodu` | `EvidenceStatus` | metoda dowodu, poziom dowodu, przydatność dowodowa, status modelu, status danych, odniesienie do dowodu |
| `StatusModelu` | `ModelValidationStatus` | `UNVALIDATED_MODEL` / `VALIDATED_AGAINST_TEST` / `CERTIFIED_MODEL` / `NIE_DOTYCZY` |
| `StatusDanych` | `InputDataStatus` | `ZWALIDOWANE` / `UNVALIDATED_INPUT` + lista danych przyjętych (wartość, jednostka, powód) |
| `ZakresWaznosci` | `DomainOfValidity` | rodzaj analizy, model, technologia, symetria zakłócenia, parametry sieci, regulator, ograniczniki, wykluczenia |
| `Niepewnosc` | `Uncertainty` | wartość, jednostka, metoda oszacowania albo jawny powód braku |
| `Stosowalnosc` | `Applicability` | typ modułu, technologia, `dotyczy`, `powod_pl` (zawsze niepusty), `podstawa` reguły stosowalności (np. progi klas WOS) |
| `Etykieta` | — | etykieta PL i semantyka koloru (§9) — liczona w backendzie i niesiona w rekordzie |
| `MetodaDowodu` | `EvidenceMethod` / `AcceptedEvidenceMethod` | JEDEN słownik: `CERTYFIKAT` / `RAPORT_Z_TESTU` / `SYMULACJA` / `OBLICZENIE` / `DEKLARACJA` / `POMIAR` / `OCENA_OPERATORA` / `DOWOD_LACZONY` / `BRAK_METODY` — używany w `wynik.metoda`, `dowod.metoda` i `sposob_wykazania` (trzy podzbiory z pierwszej wersji kontraktu scalone; semantykę pilnują walidatory) |

`PodstawaWymagania` jest uogólnieniem `ZrodloWartosci` z profilu regulacyjnego NC RfG
(`catalog/profiles/nc_rfg`, plan AB §6) — JEDEN typ w produkcie, nie dwa. Pola: `rodzaj`
(`ROZPORZADZENIE_UE` / `NORMA` / `PRAWO_KRAJOWE` / `WOS` / `PROCEDURA_PTPIREE` / `WIPWC` / `OSD` /
`KATALOG_PRODUCENTA` / `ZALOZENIE_PROJEKTOWE` / `NIEUSTALONA`; `PRAWO_KRAJOWE` = ustawa i
rozporządzenie krajowe, np. rozporządzenie systemowe — rejestr jakości energii AB-H0; raport
techniczny IEC/TR jest `NORMA` z uwagą „raport techniczny"), `dokument`, `wydanie`,
`jednostka_redakcyjna`, `status` (`ZWERYFIKOWANE` / `WSKAZANE` / `NIEUSTALONE`), `uwagi_pl`.
**Walidator:** stan `WSKAZANE` albo `ZWERYFIKOWANE` wymaga niepustych `dokument`, `wydanie`
i `jednostka_redakcyjna` (artykuł / ustęp / punkt / rozdział — nie opis słowny parametru);
inaczej stan jest `NIEUSTALONE`. `dokument` jest niepusty ZAWSZE (także przy `NIEUSTALONE` —
nazywa, skąd wartość pochodzi, np. „profil operatorów, rewizja pliku 2024-Q4"); rodzaj
`NIEUSTALONA` nie może mieć stanu mocniejszego niż `NIEUSTALONE`. Przeetykietowanie nie podnosi
stanu (przegląd 2026-09-23 #3).

Jednostki: liczba bez jednostki jest błędem (T3). Wielkości bezwymiarowe zapisuje się jako `"1"`,
`"%"` albo `"p.u. (<baza>)"` z nazwaną bazą — np. `"p.u. (I_n modułu)"`, `"p.u. (U_n)"`,
`"p.u. (S_baz sieci)"`; gołe `"p.u."` jest odrzucane przy konstrukcji (klasa defektu bazy pu
znana z RUNDA9 F-1).

## 2. Statusy maszynowe (słownik zamknięty) i reguły decyzji

### 2.1 Słownik

| Status | Poziom | Znaczenie | Obowiązkowa treść wyjaśnienia |
|--------|--------|-----------|-------------------------------|
| `SPELNIA` | K, W | Kryterium sprawdzone na danych i dotrzymane. Na poziomie W dodatkowo: dowód PEŁNY (§3). | wartość, limit, margines i MIEJSCE najmniejszego marginesu; na poziomie W — kryterium najbliżej granicy |
| `NIE_SPELNIA` | K, W | Kryterium sprawdzone i naruszone. | gdzie (element/chwila/przedział), o ile (margines ujemny z jednostką), względem czego (limit z podstawą); na poziomie W — WSZYSTKIE naruszone kryteria składowe |
| `NIEJEDNOZNACZNY` | K, W | \|margines\| ≤ niepewność — dane nie pozwalają na wniosek binarny. | margines, niepewność, metoda oszacowania niepewności, co rozstrzygnie (np. zwalidowany model, pomiar) |
| `NIE_OCENIONO` | K, W | Ocena niewykonana: brak biegu, bieg nieaktualny, bieg nieudany, brak danych wejściowych. | czego brakuje (konkretne dane / bieg), jak to uzupełnić (akcja naprawcza) |
| `BRAK_PODSTAWY` | K, W | Parametr wymagania nie ma ustalonego pochodzenia (stan `NIEUSTALONE`) albo nie istnieje w żadnej warstwie. Liczenie NIE jest blokowane — wynik obliczeniowy wobec przyjętej wartości jest pokazywany INFORMACYJNIE. | który parametr, z jakiej warstwy powinien pochodzić, jaki ma stan źródła, jakiego dokumentu potrzeba; informacyjny wynik wobec przyjętej wartości |
| `BRAK_DOWODU` | W | Kryteria dające się ocenić są spełnione (albo wymaganie nie ma metody w narzędziu), ale podstawa dowodowa nie wystarcza do twierdzenia o zgodności (§3). | jaka metoda dowodu byłaby właściwa, czego brakuje (certyfikat / raport z testu / walidacja modelu / potwierdzenie danych), wynik obliczeniowy jeśli istnieje |
| `NIE_DOTYCZY` | K, W | Kryterium/wymaganie nie stosuje się do przedmiotu (typ, technologia, moduł istniejący wg art. 4, magazyn energii poza NC RfG — art. 3 ust. 2 lit. d, prawo operatora do określenia wymagania niewykonane, warunek wstępny kryterium nieuruchomiony w scenariuszu). | powód stosowalności: typ, technologia, zakres (np. „wymaganie dotyczy modułów parku energii, oceniany moduł jest synchroniczny"; „magazyn energii nie jest modułem wytwarzania energii w rozumieniu rozporządzenia 2016/631 art. 3 ust. 2 lit. d — wymagania krajowe dla magazynów w osobnej warstwie") |

### 2.2 Reguła decyzji na poziomie K (jedno miejsce w kodzie)

Kolejność jest wiążąca i deterministyczna; każdy brak nazwany po drodze trafia do
`czego_brakuje` niezależnie od tego, który status wygrał. Reguła ma JEDNO ciało
(`werdykt/decyzja.py::status_kryterium`); walidator rekordu wywołuje to samo ciało i odrzuca
rekord, którego status różni się od wyniku reguły (predykaty parami).

1. przedmiot poza zakresem stosowalności (typ, technologia, warunek wstępny kryterium
   niespełniony w scenariuszu — §5.1 FRT) → `NIE_DOTYCZY` z powodem;
2. metoda dowodu niedopuszczalna dla rodzaju twierdzenia (`metody_dopuszczalne(ClaimKind)` —
   JEDNA tabela `METODY_DOPUSZCZALNE_DLA_TWIERDZENIA`, trzy rozłączne zbiory: twierdzenie o
   zachowaniu dynamicznym — `SYMULACJA` / `RAPORT_Z_TESTU` / `POMIAR` / `CERTYFIKAT` /
   `DOWOD_LACZONY`; twierdzenie o konfiguracji zadeklarowanej — `DEKLARACJA` / `OBLICZENIE` /
   `OCENA_OPERATORA` / `RAPORT_Z_TESTU` / `POMIAR` / `CERTYFIKAT` / `DOWOD_LACZONY`, BEZ
   `SYMULACJA` (symulacja nie wykazuje faktu zadeklarowanego); twierdzenie z obliczenia
   statycznego — `OBLICZENIE` / `POMIAR` / `RAPORT_Z_TESTU` / `CERTYFIKAT` / `DOWOD_LACZONY`;
   metoda przydatna jest zawsze metodą dopuszczalną — przypięte testem) → `NIE_OCENIONO`; wartość zadeklarowana, jeśli podana, jest
   pokazywana informacyjnie, a `czego_brakuje` nazywa metodę właściwą (porównanie deklaracji
   nigdy nie daje `SPELNIA` dla zachowania dynamicznego — przegląd #11);
3. brak wielkości zmierzonej/obliczonej (brak biegu, bieg nieaktualny/nieudany, brak danych) →
   `NIE_OCENIONO`; producent, który nie potrafi oszacować niepewności symulacji, NIE podaje
   wyniku (i trafia tutaj) — wynik symulacyjny bez `niepewnosc.wartosc` jest błędem kontraktu
   przy konstrukcji (T14), nie stanem;
4. podstawa o stanie `NIEUSTALONE` — dla relacji liczbowych brak limitu albo
   `limit.podstawa.status == NIEUSTALONE`; dla kryteriów logicznych (bez limitu) `podstawa.status`
   kryterium — → `BRAK_PODSTAWY` (wynik i margines wobec przyjętej wartości liczone i
   pokazywane informacyjnie). Dla relacji liczbowych `podstawa` KRYTERIUM (wymaganie) o stanie
   `NIEUSTALONE` nie zmienia statusu — wpływa na kompletność dowodu (§3) i zastrzeżenia;
5. margines `m`, niepewność `u`: `|m| ≤ u` → `NIEJEDNOZNACZNY`;
6. `m ≥ 0` → `SPELNIA`; `m < 0` → `NIE_SPELNIA`. Kryteria logiczne (np. „moduł pozostał
   przyłączony") nie mają marginesu skalarnego — margines jest jawnie „niedefiniowalny" z powodem;
   margines wielkości sterującej (np. zapas czasu zadziałania zabezpieczenia podnapięciowego
   modułu) jest OSOBNYM kryterium liczbowym tego samego wymagania (np.
   `frt.zapas_zabezpieczenia_u_min`), nie polem kryterium logicznego; o statusie kryterium
   logicznego decyduje wartość logiczna wyniku.

Kolejność 3 → 4 (brak biegu przed brakiem podstawy) jest świadoma: brak biegu da się usunąć
biegiem, brak podstawy — tylko dokumentem; oba braki są nazwane w `czego_brakuje`. Dlatego moduł
typu B bez biegu dynamiki dostaje dla FRT `NIE_OCENIONO` (z zastrzeżeniem o stanie obwiedni), a
LFSM-O porównane z deklaracją wobec parametru zastanego — `BRAK_PODSTAWY`.

### 2.3 Reguła agregacji na poziomie W (zakaz „master PASS")

Agregat NIGDY nie zastępuje składników — oceny składowe są częścią rekordu i każdej powierzchni,
która go pokazuje.

1. wymaganie nie stosuje się (typ × technologia × nowy/istniejący moduł; prawo operatora do
   określenia wymagania niewykonane) → `NIE_DOTYCZY` z powodem;
2. sposób wykazania `BRAK_METODY` (ani certyfikat, ani test/symulacja narzędzia) →
   `BRAK_DOWODU`; to JEDYNY przypadek (poza `NIE_DOTYCZY`), w którym `oceny_skladowe` jest
   puste — wyjaśnienie nazywa metodę właściwą (certyfikat urządzenia albo raport z badania typu);
3. wymaganie stosowalne, ale każda ocena składowa `NIE_DOTYCZY` → `NIE_OCENIONO` (zakaz pustego
   `SPELNIA` — przegląd #6d);
4. którakolwiek ocena składowa `NIE_SPELNIA` → `NIE_SPELNIA`; `kryteria_naruszone` = WSZYSTKIE
   takie składniki (z marginesami); wyjaśnienie nazywa każdy z nich;
5. którakolwiek `NIEJEDNOZNACZNY` → `NIEJEDNOZNACZNY`;
6. którakolwiek `NIE_OCENIONO` → `NIE_OCENIONO`;
7. którakolwiek `BRAK_PODSTAWY` → `BRAK_PODSTAWY`;
8. `pokrycie_programu == CZESCIOWE` (wymaganie wykazywane biegami wymaga pokrycia zbioru
   scenariuszy programu badań z profilu — głębokości i czasy zapadu × poziomy P × Q × punkt pracy
   sprzed zakłócenia × S_k,min; jeden scenariusz nie wykazuje wymagania) → `BRAK_DOWODU`;
   `NIE_DOTYCZY` dla wymagań wykazywanych deklaracją / certyfikatem (walidator: symulacja w
   dowodzie ⇒ `PELNE` albo `CZESCIOWE`);
9. kompletność dowodu ≠ `PELNY` (§3) → `BRAK_DOWODU` (wyjaśnienie podaje wynik obliczeniowy i
   powód niepełności);
10. w przeciwnym razie `SPELNIA`; `kryterium_najblizej_granicy` = składnik o najmniejszym
    MARGINESIE WZGLĘDNYM `m / skala` (§2.4) — gdy żaden składnik nie ma marginesu względnego (sam
    certyfikat, wyłącznie kryteria logiczne), pole jest `None`, a wyjaśnienie podaje powód
    (przegląd #6c); remis rozstrzyga porządek `kryterium_id` (determinizm).

### 2.4 Skala marginesu względnego

Marginesy różnych kryteriów mają różne jednostki, więc porównuje się je bezwymiarowo:
`wzgledny = m / skala`, gdzie `skala` (z jednostką marginesu) i `skala_rodzaj` są polami rekordu:
`TOLERANCJA` — pasmo tolerancji z profilu, gdy zdefiniowane (np. ±1,0 pp statyzmu);
`LIMIT` — `|limit|`, gdy tolerancji nie ma i limit ≠ 0; `NIEPEWNOSC` — `u`, gdy podano wyłącznie
niepewność; przy `limit = 0` bez tolerancji i niepewności `wzgledny = None` (składnik nie
uczestniczy w wyborze). Dzielenie przez `|limit|` obwiedni bliskiej zeru (0,05 pu) zawyżałoby
margines względny — dlatego profil definiuje tolerancje tam, gdzie limit jest mały (przegląd #35).

Naruszenie wykazane na modelu niezwalidowanym pozostaje `NIE_SPELNIA` (kierunek zachowawczy:
fałszywy alarm jest tańszy niż fałszywa zgodność), a wyjaśnienie mówi wprost, że naruszenie
wykazano na modelu bez walidacji i wymaga działania projektowego albo walidacji modelu.

## 3. Oś kompletności dowodu (niezależna od statusu kryterium)

`kompletnosc_dowodu ∈ {PELNY, NIEPELNY, NIE_DOTYCZY}` — PEŁNY wyłącznie, gdy spełnione są
WSZYSTKIE warunki:

1. **metoda dowodu właściwa dla rodzaju twierdzenia** (`ClaimKind` — TRZY rodzaje): twierdzenie
   o zachowaniu dynamicznym (`DYNAMIC_PERFORMANCE`) — symulacja na silniku o poziomie
   `VALIDATED_SIMULATION` nierozstrzygnięta jako leżąca POZA zadeklarowaną domeną
   (`w_domenie_walidacji is not False`; rekord K z wynikiem symulacji MUSI nieść rozstrzygnięcie
   `True`/`False` — `None` dopuszczalne wyłącznie bez wyniku i w dowodzie poziomu W) ORAZ model
   urządzenia `VALIDATED_AGAINST_TEST` albo `CERTIFIED_MODEL`, albo raport z testu, albo pomiar,
   albo certyfikat pokrywający wymaganie; twierdzenie o konfiguracji zadeklarowanej
   (`DECLARED_CONFIGURATION`) — deklaracja albo ocena operatora jest właściwą podstawą;
   **twierdzenie z obliczenia statycznego** (`STATIC_CALCULATION` — zwarcia IEC 60909,
   obciążalność i wytrzymałość przewodów, spadki napięć, rozpływ; przegląd 2026-09-23 wykazał,
   że bez tego rodzaju żadne sprawdzenie statyczne produktu nie mogłoby być `PELNY`) —
   `OBLICZENIE` na zdolności o poziomie `VALIDATED_SIMULATION` (solver zwalidowany, np. golden
   IEC 60909) jest właściwą podstawą, tak samo pomiar, raport z testu i certyfikat;
   `DOWOD_LACZONY` jest przydatny wyłącznie na poziomie W, gdy KAŻDA ocena składowa ma metodę
   przydatną;
2. **dane wejściowe zwalidowane** — żadna wartość wpływająca na wynik nie ma jakości
   `ESTIMATED` ani `SYSTEM_DEFAULT` (`FieldQuality`; każda taka wartość MUSI stać w
   `dane_przyjete` — jeden predykat, dwa miejsca to błąd), żadna nie jest przyjęta bez źródła
   (np. założona moc zwarciowa sieci — decyzja O-8 planu AB);
3. **podstawa limitów** o stanie `ZWERYFIKOWANE` albo `WSKAZANE` (dokument i jednostka redakcyjna
   wskazane; stan `WSKAZANE` jest wypisywany przy wyniku — treść dokumentu nie jest dołączona do
   repozytorium).

Kompletność `NIEPELNY` zawsze niesie listę powodów. Dokument formalny twierdzący zgodność
(certyfikat, wniosek do OSD) wymaga `SPELNIA` + `PELNY` dla każdego wymagania stosowalnego;
inaczej lista braków jest listą PEŁNYCH rekordów (nie jednozdaniowych komunikatów).

Kompletność liczy się na OBU poziomach: `OcenaKryterium` niesie `kompletnosc_dowodu` i
`powody_niepelnosci` (z własnego `dowod`, `podstawa` kryterium i `limit.podstawa`),
`WynikWymagania` — z agregatu składowych i podstawy wymagania (§9 mapuje `SPELNIA` + `NIEPELNY`
także na poziomie K).

### 3a. Dane wejściowe zadeklarowane przez klienta i dokumenty formalne

Wartość, którą klient API przesyła w żądaniu (status certyfikatu, czasy odbudowy, wzmocnienie
prądu biernego, statyzm, THD), jest **daną przyjętą bez źródła** — `StatusDanych` =
`UNVALIDATED_INPUT` z każdą taką wartością w `dane_przyjete` → kompletność `NIEPELNY`. Bieg
„co-jeśli" (`POST /api/ncrfg-tests/run` z ciała żądania) NIGDY nie jest dowodem: jego
`sposob_wykazania` nie może być `CERTYFIKAT`, a kompletność nie może być `PELNY`. Dokument
formalny (certyfikat, wniosek do OSD) powstaje WYŁĄCZNIE z zatwierdzonego modelu (ENM przypadku:
`case_id` + klucz magazynu obowiązkowe) — status certyfikatu wyprowadza serwer z tabliczki
urządzenia dopasowanej do rejestru wykazu PTPiREE (rekord: zakres typów, warunek certyfikatu,
data akceptacji, wersja WiPWC), nigdy z pola żądania (przegląd 2026-09-23 #2). Test przypięty:
klient przysyłający `ptpiree_verified` nie może wytworzyć `PELNY`.

### 3b. Poziomy dowodu — jedna tabela odwzorowań (przegląd #19)

| Poziom manifestu walidacji silnika | `EvidenceTier` (zdolność) | Dopuszczalny `StatusModelu` (urządzenie) dla `PELNY` |
|------------------------------------|---------------------------|------------------------------------------------------|
| L5 w zadeklarowanej domenie (dwie niezależne drogi, R10) | `VALIDATED_SIMULATION` | `VALIDATED_AGAINST_TEST` albo `CERTIFIED_MODEL` |
| L4 (jedna wyrocznia, AB-1d_min) | `UNVALIDATED_MODEL` (zdolność bez drugiej drogi) | — (kompletność `NIEPELNY` z powodem „silnik L4 — druga niezależna droga w toku") |
| poniżej L4 / poza domeną manifestu | `UNVALIDATED_MODEL` albo `NOT_SIMULATED` | — |
| bez obliczenia (deklaracja) | `DECLARATION` | `NIE_DOTYCZY` |

`EvidenceTier.UNVALIDATED_MODEL` (zdolność narzędzia) i `StatusModelu.UNVALIDATED_MODEL` (model
konkretnego urządzenia) są DWOMA osiami o wspólnej nazwie wartości — każdy rekord niesie obie,
generator zastrzeżeń nazywa oś. Predykat `nalezy_do_domeny(bieg, manifest)` (SCR, X/R, głębokość
zapadu, P, zakresy parametrów wobec domeny wyroczni D-11) jest warunkiem koniecznym `PELNY` dla
metody `SYMULACJA` — bieg poza domeną = `NIEPELNY` z nazwanym parametrem poza zakresem.

## 4. Pola rekordu

### 4.1 `OcenaKryterium` (poziom K)

| Pole | Treść | Obowiązkowe |
|------|-------|-------------|
| `kryterium_id` | stabilny identyfikator (np. `frt.pozostanie_w_pracy`, `lfsm_o.odpowiedz_p`, `przewod.wytrzymalosc_cieplna`) | zawsze |
| `przedmiot` | CO oceniono: element/moduł (`element_ref`, nazwa) + zdanie („Pozostanie modułu parku energii typu B w pracy podczas zadanego profilu zapadu napięcia") | zawsze |
| `kryterium` | `opis_pl` + `warunek_latex` (render `MathRenderer`) + relacja (`NIE_WIECEJ` / `NIE_MNIEJ` / `PASMO` / `OBWIEDNIA_DOLNA` / `OBWIEDNIA_GORNA` / `LOGICZNE`) + `warunek_wstepny_pl` (gdy kryterium ma warunek uruchomienia, np. U_PCC(t) ≥ obwiednia) + `warunek_wstepny_podstawa: PodstawaWymagania` (obowiązkowa razem z warunkiem — podstawa obwiedni; stan `NIEUSTALONE` → zastrzeżenie w wyjaśnieniu) | zawsze; `warunek_latex` dla relacji liczbowych; relacja `LOGICZNE` bez limitu (podstawa w `podstawa` kryterium) |
| `podstawa` | `PodstawaWymagania` KRYTERIUM (wymaganie, z którego kryterium wynika) — może różnić się od `limit.podstawa` (wartość z warstwy krajowej / operatora) | zawsze |
| `stosowalnosc` | `Stosowalnosc` (typ, technologia, `dotyczy`, `powod_pl`, `podstawa` reguły stosowalności) | zawsze |
| `wynik` | wielkość (`wielkosc_pl`, `symbol_latex`), wartość, **jednostka**, punkt krytyczny (chwila `t` / element / przedział), `metoda` ∈ {`SYMULACJA`, `OBLICZENIE`, `DEKLARACJA`, `POMIAR`, `CERTYFIKAT`} (podzbiór słownika `MetodaDowodu` egzekwowany walidatorem — wartość z raportu z badania jest `POMIAR`, raport jest dowodem, nie metodą wyniku); dla trajektorii — ekstremum i moment krytyczny; dla kryterium logicznego wartość 1/0 w jednostce `"1"` z opisem stanu | gdy status ≠ `NIE_DOTYCZY`, `NIE_OCENIONO` (dla `BRAK_PODSTAWY` i metody niedopuszczalnej — informacyjnie, jeśli policzony) |
| `limit` | wartość / pasmo / obwiednia (punkty), **jednostka**, `podstawa: PodstawaWymagania`, zakres stosowalności, wersja profilu | gdy relacja liczbowa; brak = `BRAK_PODSTAWY` z nazwanym parametrem |
| `margines` | wartość, **jednostka** (= jednostka wyniku; dla wyniku w `%` margines jest w punktach procentowych `"pp"`), `definicja_latex`, punkt, `skala` + `skala_rodzaj` (§2.4), margines względny; albo `niedefiniowalny` z powodem | gdy wynik i limit istnieją |
| `niepewnosc` | wartość, jednostka, metoda (§6); albo jawny powód braku („porównanie wartości zadeklarowanych — niepewność numeryczna nie dotyczy") — dla metody `SYMULACJA` wartość jest OBOWIĄZKOWA | zawsze (wartość albo powód) |
| `status_maszynowy` | §2 | zawsze |
| `kompletnosc_dowodu`, `powody_niepelnosci` | §3 (liczone, nie wpisywane) | zawsze |
| `etykieta` | `Etykieta` (§9, liczona w backendzie) | zawsze |
| `wyjasnienie` | `WyjasnienieWerdyktu` (§5) | zawsze |
| `dowod` | `StatusDowodu` (metoda, poziom, rodzaj twierdzenia, status modelu, status danych, odniesienie, `w_domenie_walidacji: bool \| None` + `domena_pl` — wynik predykatu `nalezy_do_domeny(bieg, manifest)` §3b; `None` = nie dotyczy (bez biegu); `False` → kompletność `NIEPELNY` z nazwanym parametrem poza domeną) | zawsze |
| `zakres_waznosci` | `ZakresWaznosci` (§7) | zawsze dla wyników dynamicznych; dla sprawdzeń statycznych — rodzaj analizy i założenia |
| `slad` | odnośniki kroków WHITE BOX (§8) | zawsze, gdy istnieje obliczenie |

### 4.2 `WynikWymagania` (poziom W)

| Pole | Treść |
|------|-------|
| `wymaganie_id`, `nazwa_pl` | identyfikator z katalogu wymagań profilu i nazwa |
| `podstawa` | `PodstawaWymagania` wymagania (dokument, wydanie, jednostka redakcyjna, warstwa, stan źródła) |
| `stosowalnosc` | `Stosowalnosc`: typ, technologia, nowy/istniejący moduł (art. 4), `dotyczy`, `powod_pl` (zawsze niepusty), `podstawa` |
| `sposob_wykazania` | `MetodaDowodu` (§1) bez `POMIAR` (pomiar jest metodą WYNIKU; wykazanie wymagania pomiarem to `RAPORT_Z_TESTU`); `BRAK_METODY` = narzędzie nie ma ani certyfikatu pokrywającego, ani testu/symulacji; walidator: `dowod.metoda == sposob_wykazania` |
| `oceny_skladowe` | lista `OcenaKryterium` (≥ 1; pusta WYŁĄCZNIE przy `NIE_DOTYCZY` albo `BRAK_METODY`) |
| `pokrycie_programu`, `pokrycie_programu_pl` | `PELNE` / `CZESCIOWE` / `NIE_DOTYCZY` + zdanie, jaki zbiór scenariuszy programu badań pokryto (§2.3 pkt 8) |
| `status_maszynowy`, `kompletnosc_dowodu`, `powody_niepelnosci` | §2.3, §3 |
| `kryteria_naruszone`, `kryterium_najblizej_granicy` | §2.3 (`None` z powodem, gdy brak marginesu względnego) |
| `etykieta` | §9 |
| `wyjasnienie`, `dowod`, `zakres_waznosci`, `slad` | jak na poziomie K, zagregowane |

Wymagania z wieloma kryteriami NIE łączą artykułów: pozostanie w pracy podczas zwarcia to NC RfG
art. 14 ust. 3 (typ B, PPM i SPGM); szybki prąd zwarciowy — art. 20 ust. 2 lit. b i c (tylko
moduły parku energii; prawo OSD do określenia); odbudowa mocy czynnej po zwarciu — art. 20 ust. 3
lit. a (PPM) i art. 17 ust. 3 (SPGM). Każde z nich jest osobnym `WynikWymagania` z własnymi
składowymi; „FRT" jest nazwą GRUPY prezentacyjnej, nie wymagania (przegląd #7b).

## 5. Wyjaśnienie (`WyjasnienieWerdyktu`)

| Pole | Treść |
|------|-------|
| `zdanie_pl` | 1–3 zdania inżynierskie: co, względem czego, wynik, margines, miejsce. Niepuste zawsze. |
| `przyczyna_pl` | przyczyna wyniku — obowiązkowa dla każdego statusu poza `SPELNIA` (dla `SPELNIA` na poziomie W: kryterium najbliżej granicy) |
| `czego_brakuje` | lista konkretnych braków — obowiązkowa dla `NIE_OCENIONO`, `BRAK_PODSTAWY`, `BRAK_DOWODU`, `NIEJEDNOZNACZNY` |
| `zastrzezenia` | zastrzeżenia wyprowadzone Z PÓL rekordu, nie pisane ręcznie: stan źródła ≠ `ZWERYFIKOWANE`, `UNVALIDATED_MODEL`, `UNVALIDATED_INPUT` (z wartościami), ograniczenie zakresu ważności |

Zdanie i zastrzeżenia składa JEDEN generator w backendzie z pól rekordu (zero tekstu
wymyślonego w UI; UI i dokument formalny pokazują to samo zdanie).

### 5.1 Wzorce treści (przykłady ilustracyjne — liczby NIE pochodzą z profilu)

Fizyka FRT (przegląd #7a): obwiednia z NC RfG art. 14 ust. 3 lit. a jest DOLNĄ GRANICĄ napięcia
w punkcie przyłączenia, PRZY KTÓREJ obowiązek pozostania w pracy obowiązuje — warunkiem wstępnym
kryterium, nie jego marginesem. Na stanowisku (`ComplianceStimulus`) źródło testowe narzuca
przebieg równy obwiedni (i punkty programu badań), więc dodatni „margines napięcia nad
obwiednią" oznaczałby test łagodniejszy niż wymagany (tautologia P3). W trybie sieci
(`PhysicalNetworkDisturbance`) napięcie poniżej obwiedni nie jest naruszeniem — obowiązek nie
został uruchomiony (`NIE_DOTYCZY` dla tego scenariusza z powodem). Kryterium pozostania w pracy
jest LOGICZNE („moduł nie został odłączony przez własne zabezpieczenia ani ogranicznik") z
marginesem wielkości sterującej: zapas czasu/napięcia do zadziałania zabezpieczenia U< modułu
(nastawy z Banku Nastaw albo z modelu).

**Kryterium spełnione (dynamika, dowód pełny):**
> Pozostanie w pracy podczas zapadu (NC RfG art. 14 ust. 3 lit. a) — kryterium spełnione. Źródło
> testowe narzuciło przebieg napięcia równy obwiedni profilu (warunek wstępny spełniony w całym
> przedziale 0–3,0 s), a moduł nie został odłączony: zabezpieczenie podnapięciowe modułu
> (U< = 0,80 U_n, 1,5 s — Bank Nastaw operatora) miało zapas czasu 0,41 s do zadziałania, ogranicznik
> prądu był aktywny 0–0,62 s bez utraty synchronizacji PLL. Model: przekształtnik nadążny,
> wersja …; status modelu: VALIDATED_AGAINST_TEST; niepewność zapasu czasu ±0,004 s (połowienie
> kroku). Zakres ważności: RMS składowa zgodna, zwarcie trójfazowe, S_k,min = 60 MVA (profil:
> minimalna moc zwarciowa punktu przyłączenia, stan WSKAZANE), X/R = 8, pokrycie programu badań:
> PEŁNE (3 głębokości × 2 poziomy P).

**Wymaganie niespełnione z powodu jednego składnika (agregacja W):**
> Szybki prąd zwarciowy przy zwarciach symetrycznych (NC RfG art. 20 ust. 2 lit. b) — wymaganie
> nie jest spełnione. Naruszono kryterium czasu aktywacji prądu biernego: 67 ms od chwili
> przekroczenia strefy martwej ΔU wobec wymaganych ≤ 40 ms (przekroczenie 27 ms; tolerancja
> programu badań ±5 ms). Pozostałe kryteria składowe: wielkość prądu biernego — spełnione
> (ΔI_q = 1,05 ΔU wobec wymaganych ≥ 1,0 ΔU, margines +0,05 p.u. (I_n modułu)); ogranicznik prądu
> — zachowany (|I| = 1,00 p.u. (I_n modułu) ≤ 1,10, margines +0,10). Przyczyna wyniku: zbyt późna
> odpowiedź prądu biernego (stała czasowa toru I_q). Wynik wykazany na modelu VALIDATED_AGAINST_TEST.

**Brak podstawy (stan dzisiejszy dla parametrów przeniesionych z dawnych profili):**
> LFSM-O — werdykt zgodności niewydany: brak ustalonej podstawy parametru. Wynik obliczeniowy wobec
> przyjętych wartości: statyzm modułu 5,0 % wobec przyjętego 5,0 % (tolerancja ±1,0 pp), próg
> 50,20 Hz. Statyzm, próg i tolerancja pochodzą z warstwy zastanej (stan źródła: NIEUSTALONE —
> pięć identycznych kopii profili operatorów bez wskazania dokumentu). Do wydania werdyktu
> potrzebne: wartość krajowa z WOS (wydanie, jednostka redakcyjna) i kryterium akceptacji z
> programu testów procedury PTPiREE.

**Brak dowodu:**
> Utrzymanie pracy w zakresach częstotliwości (NC RfG art. 13 ust. 1 lit. a) — brak wystarczającego
> dowodu. Moduł typu A nie ma certyfikatu urządzenia z wykazu PTPiREE pokrywającego to wymaganie,
> a narzędzie nie ma testu ani symulacji wykazującej pracę w pasmach 47,5–51,5 Hz przez wymagany
> czas. Właściwa metoda: certyfikat urządzenia albo raport z badania typu.

**Nie dotyczy:**
> Szybki prąd zwarciowy (NC RfG art. 20 ust. 2 lit. b) — nie dotyczy: wymaganie dotyczy modułów
> parku energii, a oceniany moduł typu B jest synchronicznym modułem wytwarzania energii.

**Niejednoznaczny:**
> Odbudowa mocy czynnej — wynik niejednoznaczny, wymaga weryfikacji: 89,8 % P przed zakłóceniem po
> 1,0 s wobec wymaganych 90 % (margines −0,2 pp), niepewność numeryczna ±0,4 pp (różnica wyniku
> przy połowionym kroku całkowania). Rozstrzygnie: bieg z krokiem 0,5 ms albo pomiar.

## 6. Niepewność i stan `NIEJEDNOZNACZNY`

- Wynik symulacji używany w ocenie zgodności pochodzi z biegu kontrolnego o DROBNIEJSZYM kroku
  (`metryka(h/2)`), a jego niepewność numeryczna to `u = |metryka(h) − metryka(h/2)|`. Dla
  całkowania trapezowego (rząd p = 2, rdzeń R10) błąd wartości z kroku drobniejszego wynosi
  ≈ Δ/3, a przy spadku rzędu do 1 na załamaniach (ogranicznik, strefa martwa) ≈ Δ — zatem `u = Δ`
  jest zachowawcze WYŁĄCZNIE dla wartości z biegu drobniejszego (dla `metryka(h)` byłoby to
  ≈ 4/3·Δ, więc raportowanie wartości z grubszego kroku jest zabronione — przegląd #10).
- Bieg kontrolny przy kroku adaptacyjnym: `h_max/2`, tolerancje kroku/2, tolerancja lokalizacji
  zdarzeń warunkowych/2 (zdarzenia warunkowe są lokalizowane przez wyszukiwanie pierwiastka, więc
  ich czas NIE jest dokładny — tylko zdarzenia planowane mają czas dokładny).
- `u` obejmuje WYŁĄCZNIE błąd dyskretyzacji. Metoda `SYMULACJA` bez oszacowanej `u` →
  `NIE_OCENIONO` (walidator; brak niepewności nie może dać `SPELNIA`).
- Porównanie wartości zadeklarowanych ma niepewność „nie dotyczy" z jawnym powodem; pomiar (AB-7)
  niesie niepewność z raportu z badania.
- Niepewność modelowa (parametry niezwalidowane) nie jest liczbą wymyślaną — wyraża ją
  `status_modelu` i kompletność dowodu, nie sztuczne pasmo. Niepewność danych wejściowych
  (np. S_k″ o statusie `UNVALIDATED_INPUT`, rozpiętość 10,25 % z R9) wchodzi do `NIEJEDNOZNACZNY`
  przez przemiatanie wrażliwości AB-6 (margines liczony na krańcach zakresu danej przyjętej), nie
  przez `u`.

## 7. Zakres ważności (`ZakresWaznosci`)

Minimum dla wyniku dynamicznego: rodzaj analizy (RMS, składowa zgodna), technologia i rodzina
modelu urządzenia (z wersją), symetria zakłócenia, parametry sieci (S_k″, X/R — ze statusem
danych), model regulatora, ograniczniki aktywne w przebiegu, wykluczenia (np. „zwarcia
niesymetryczne", „zjawiska elektromagnetyczne (EMT)", „harmoniczne"). Dla sprawdzenia
deklaracji: „porównanie danych zadeklarowanych z wymaganiem — nie wykazuje zachowania
dynamicznego". Wynik NIGDY nie jest opisany szerzej niż jego zakres (§0).

## 8. Ślad WHITE BOX

Każdy rekord pozwala rozwinąć łańcuch
`WEJŚCIE → SYMULACJA/OBLICZENIE → OBSERWABLA → METRYKA → KRYTERIUM → MARGINES → WERDYKT`
(odnośniki do kroków śladu solvera i biegu: `run_id`, wersja silnika, scenariusz, kanał,
definicja metryki, wartość, punkt, warunek, limit z podstawą, definicja marginesu, reguła decyzji
§2). Silnik oceny nigdy nie zwraca samego enuma.

## 9. Prezentacja w interfejsie

Etykietę PL i semantykę koloru liczy BACKEND (`werdykt/etykiety.py`) i niesie je każdy rekord
(`etykieta`); jeden wspólny komponent karty werdyktu (warstwa `ui2/wyniki/wzorzec`) jest JEDYNYM
miejscem mapowania SEMANTYKI (`pozytywna` / `negatywna` / `ostrzegawcza` / `neutralna`) na kolor —
interfejs nie definiuje żadnej mapy „status → etykieta" (przegląd #40). Minimum na karcie: **Ocena · Kryterium
(`MathInline`) · Wynik · Limit · Margines (z wzorem) · Wyjaśnienie · Podstawa (ze stanem źródła) ·
Dowód (metoda, poziom, status modelu, status danych)**; zakres ważności i ślad — rozwijane, zawsze
osiągalne jednym kliknięciem. Zdanie wyjaśnienia jest widoczne bez rozwijania (nie w dymku).

Etykieta zależy od POZIOMU rekordu: na poziomie K „Kryterium …", na poziomie W „Wymaganie …"
(`etykieta(status, kompletnosc, poziom)`); tabela podaje brzmienie dla K, a na poziomie W słowo
„Kryterium" jest ZASTĘPOWANE słowem „Wymaganie" (np. „Wymaganie spełnione", „Wymaganie naruszone";
para `SPELNIA` + `NIEPELNY` na poziomie W nie występuje — reguła W daje wtedy `BRAK_DOWODU`).

| Status + kompletność | Etykieta | Semantyka koloru |
|----------------------|----------|------------------|
| `SPELNIA` + `PELNY` | Kryterium spełnione | pozytywna |
| `SPELNIA` + `NIEPELNY` (poziom K) | Kryterium spełnione — dowód niepełny | ostrzegawcza |
| `NIE_SPELNIA` | Kryterium naruszone | negatywna |
| `NIEJEDNOZNACZNY` | Wynik niejednoznaczny — wymaga weryfikacji | ostrzegawcza |
| `NIE_OCENIONO` | Ocena niewykonana | neutralna |
| `BRAK_DOWODU` | Brak wystarczającego dowodu | ostrzegawcza |
| `BRAK_PODSTAWY` | Brak zweryfikowanej podstawy wymagania | ostrzegawcza |
| `NIE_DOTYCZY` | Nie dotyczy | neutralna |

Zakaz samodzielnych plakietek `PASS` / `FAIL` / `OK` / `ERROR` / „Spełnia" jako wyniku
inżynierskiego. Liczniki zbiorcze („3 z 5 spełnione") są dozwolone wyłącznie obok listy rekordów,
nigdy zamiast niej.

## 10. Dokumenty formalne

Raport, certyfikat i wniosek do OSD renderują TEN SAM rekord (jeden serializer rekordu do bloku
dokumentu) i powstają wyłącznie z zatwierdzonego modelu przypadku (§3a). Minimum bloku: Wymaganie · Ocena · Kryterium · Wynik · Margines · Stan końcowy (gdy
kryterium stanu końcowego istnieje) · Podstawa (dokument / wydanie / jednostka redakcyjna / stan
źródła) · Dowód (metoda, odniesienie do biegu/certyfikatu) · Status modelu · Status danych · Zakres
ważności. Dokument twierdzący zgodność wymaga §3 (PEŁNY) dla każdego wymagania stosowalnego.

## 11. Inwarianty i testy kontraktu (obowiązkowe, falsyfikujące)

| Test | Inwariant |
|------|-----------|
| T1 | rekord K/W bez `wyjasnienie` albo z pustym `zdanie_pl` → błąd walidacji przy konstrukcji |
| T2 | status `SPELNIA` / `NIE_SPELNIA` / `NIEJEDNOZNACZNY` bez `kryterium` (opis + `warunek_latex` dla relacji liczbowej) → błąd |
| T3 | liczba w `wynik` / `limit` / `margines` / `niepewnosc` bez jednostki → błąd (bezwymiarowe jawnie `"1"`, `"%"` albo `"p.u. (<baza>)"`; myślnik i gołe „p.u." odrzucane) |
| T4 | limit bez `podstawa` → błąd; limit o stanie `NIEUSTALONE` → status nie może być `SPELNIA` ani `NIE_SPELNIA` (wymuszony `BRAK_PODSTAWY`) |
| T5 | brak biegu / brak danych / metoda `BRAK` → status nie może być `SPELNIA`; poziom W `SPELNIA` wymaga `PELNY` |
| T6 | `UNVALIDATED_MODEL` → kompletność `NIEPELNY`, zastrzeżenie w wyjaśnieniu i w tekście dokumentu formalnego (test na treści DOCX/PDF) |
| T7 | `UNVALIDATED_INPUT` → zastrzeżenie z wartością przyjętej danej w wyjaśnieniu i w dokumencie |
| T8 | agregat `NIE_SPELNIA` → `kryteria_naruszone` = zbiór WSZYSTKICH składników `NIE_SPELNIA`, każdy nazwany w wyjaśnieniu |
| T9 | agregat `SPELNIA` → `kryterium_najblizej_granicy` ustawione, liczone z marginesu względnego |
| T10 | `NIE_DOTYCZY` → `stosowalnosc.powod_pl` niepusty |
| T11 | `|m| ≤ u` → `NIEJEDNOZNACZNY` (również dla `m ≥ 0`) |
| T12 | determinizm: ten sam wynik solvera → bajtowo ten sam rekord (JSON kanoniczny) |
| T13 | UI i dokument formalny: to samo `zdanie_pl` i te same zastrzeżenia (test porównuje kontrakt API z tekstem wyrenderowanego dokumentu) |
| T14 | metoda `SYMULACJA` bez `niepewnosc.wartosc` → błąd walidacji; metoda niedopuszczalna dla rodzaju twierdzenia (`DEKLARACJA` przy zachowaniu dynamicznym) → `NIE_OCENIONO` mimo wyniku |
| T15 | `"p.u."` bez bazy → błąd walidacji; `WSKAZANE` bez `jednostka_redakcyjna` → błąd walidacji |
| T16 | wymaganie z `BRAK_METODY` i pustymi składowymi → `BRAK_DOWODU`; wymaganie stosowalne z samymi składowymi `NIE_DOTYCZY` → `NIE_OCENIONO`; sam certyfikat → `SPELNIA` z `kryterium_najblizej_granicy = None` i powodem |
| T17 | dana zadeklarowana przez klienta (status certyfikatu, czas odbudowy) → `UNVALIDATED_INPUT` → `NIEPELNY`; klient przysyłający `ptpiree_verified` nie wytwarza `PELNY` |
| T18 | `pokrycie_programu = CZESCIOWE` → nigdy `SPELNIA` na poziomie W |
| T19 | mutacja reguły: zamiana kolejności §2.2 (margines przed stosowalnością; podstawa przed brakiem biegu) i §2.3 (`BRAK_METODY` po `NIE_OCENIONO`) zapala testy |
| T20 | skala marginesu względnego: `TOLERANCJA` > `LIMIT` > `NIEPEWNOSC`; `limit = 0` bez tolerancji → `wzgledny = None`; wybór najbliższego granicy deterministyczny przy remisie |

Testy T1–T20 są testami ILOCZYNU CECH (status × kompletność × stan źródła × status modelu ×
status danych × metoda × relacja), nie przykładami pojedynczymi (reguła KLASA, NIE INSTANCJA).

## 12. Strażnik kontraktowy (`werdykt_wyjasnialny_guard`)

Bada KONTRAKT, nie tekst (nie poluje na słowo „spełnia"):

1. **Backend (AST):** każda klasa modelu (pydantic / dataclass) z polem werdyktu — typu `Literal`
   zawierającym wartość ze słownika werdyktów (`SPELNIA`, `NIE_SPELNIA`, `pass`, `fail`, `PASS`,
   `FAIL`, `zgodny`, `niezgodny`, `OK`, `NOK`, …) ALBO polem `bool`/`str` o nazwie z klasy wzorców
   werdyktu (`spelnia_*`, `*_ok`, `is_adequate`, `*_passed`, `verdict*`, `werdykt*`, `status`
   z wartościami ze słownika) — musi być typem kanonicznym (`OcenaKryterium` / `WynikWymagania`),
   zawierać pole typu `WyjasnienieWerdyktu`, albo stać na liście enumów wewnętrznych
   (`ENUM_WEWNETRZNY`) z uzasadnieniem (np. wartości publiczne statusu walidacji kanonu V12,
   `verdict` solvera PTPiREE wyprowadzany jedną funkcją z `ocena`).
2. **Kontrakt HTTP:** w migawce OpenAPI każdy obiekt odpowiedzi z właściwością-enumem werdyktu
   niesie w tym samym obiekcie odwołanie do schematu wyjaśnienia.
3. **Frontend:** żadna mapa „status maszynowy → etykieta" (literał obiektu o kluczach ze słownika
   werdyktów); mapa „semantyka → kolor" wyłącznie w module karty werdyktu; propsy karty wymagają
   pełnego rekordu (egzekwuje kompilator TypeScript); reguła AST dla porównań z progiem
   (`>`, `<`, `>=`, `<=` na wartości liczbowej) których wynik zasila klasę etykiety/koloru
   werdyktu (`'ok' | 'warning' | 'error'`, `spelnia`/`naruszone`) poza modułem karty = naruszenie
   (klasa wzorca #4 inwentarza: werdykt liczony w UI).
4. **Dokumenty formalne:** mapy status → etykieta w rendererach DOCX/PDF wyłącznie w serializerze
   rekordu.

Zapadka: stan zastany z inwentarza (plan AB §8) jest przypięty LISTĄ TOŻSAMOŚCI
(`moduł:symbol kwalifikowany`, nie `plik:linia` — linie dryfują, a licznik pozwalałby zastąpić
naprawione naruszenie nowym; przegląd #18); lista może tylko maleć, nowa tożsamość łamiąca
kontrakt = czerwony guard. Self-test z przypadkiem pozytywnym i negatywnym dla każdego z czterech
sprawdzeń. Wpięcie: `scripts/guardy_z_ci.py` + właściwe workflow CI.

## 13. Zakres przedmiotowy i migracja

Kontrakt obowiązuje każdy wynik przedstawiany człowiekowi. Inwentarz miejsc, które dziś zwracają
lakoniczny werdykt, z klasyfikacją (migracja natychmiastowa / enum wewnętrzny — pozostaje / legacy
do usunięcia) i przypisaniem do przyrostów: `docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` §8.
