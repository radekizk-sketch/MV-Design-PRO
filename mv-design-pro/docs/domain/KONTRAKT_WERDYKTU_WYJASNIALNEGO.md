# KONTRAKT WERDYKTU WYJAŚNIALNEGO (kanon domenowy, przekrojowy)

**Status:** WIĄŻĄCY. **Data:** 2026-09-22. **Zakres:** CAŁY produkt — zgodność NC RfG / WOS /
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

`PodstawaWymagania` jest uogólnieniem `ZrodloWartosci` z profilu regulacyjnego NC RfG
(`catalog/profiles/nc_rfg`, plan AB §6) — JEDEN typ w produkcie, nie dwa.

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
| `NIE_DOTYCZY` | K, W | Kryterium/wymaganie nie stosuje się do przedmiotu. | powód stosowalności: typ, technologia, zakres (np. „wymaganie dotyczy modułów parku energii, oceniany moduł jest synchroniczny") |

### 2.2 Reguła decyzji na poziomie K (jedno miejsce w kodzie)

Kolejność jest wiążąca i deterministyczna; każdy brak nazwany po drodze trafia do
`czego_brakuje` niezależnie od tego, który status wygrał.

1. przedmiot poza zakresem stosowalności → `NIE_DOTYCZY`;
2. brak limitu albo limit o stanie źródła `NIEUSTALONE` → `BRAK_PODSTAWY`
   (wynik i margines wobec przyjętej wartości liczone i pokazywane informacyjnie);
3. brak wielkości zmierzonej/obliczonej (brak biegu, bieg nieaktualny/nieudany, brak danych) →
   `NIE_OCENIONO`;
4. margines `m`, niepewność `u` (gdy oszacowana): `|m| ≤ u` → `NIEJEDNOZNACZNY`;
5. `m ≥ 0` → `SPELNIA`; `m < 0` → `NIE_SPELNIA`. Kryteria logiczne (np. „moduł pozostał
   przyłączony") nie mają marginesu skalarnego — margines jest jawnie „niedefiniowalny" z powodem,
   a o ile to możliwe towarzyszy mu margines wielkości sterującej (np. zapas czasu zadziałania
   zabezpieczenia podnapięciowego modułu).

### 2.3 Reguła agregacji na poziomie W (zakaz „master PASS")

Agregat NIGDY nie zastępuje składników — oceny składowe są częścią rekordu i każdej powierzchni,
która go pokazuje.

1. wymaganie nie stosuje się → `NIE_DOTYCZY`;
2. którakolwiek ocena składowa `NIE_SPELNIA` → `NIE_SPELNIA`; `kryteria_naruszone` = WSZYSTKIE
   takie składniki (z marginesami); wyjaśnienie nazywa każdy z nich;
3. którakolwiek `NIEJEDNOZNACZNY` → `NIEJEDNOZNACZNY`;
4. którakolwiek `BRAK_PODSTAWY` → `BRAK_PODSTAWY`;
5. którakolwiek `NIE_OCENIONO` → `NIE_OCENIONO`;
6. sposób wykazania `BRAK_METODY` (ani certyfikat, ani test/symulacja narzędzia) → `BRAK_DOWODU`;
7. kompletność dowodu ≠ `PELNY` (§3) → `BRAK_DOWODU` (wyjaśnienie podaje wynik obliczeniowy i
   powód niepełności);
8. w przeciwnym razie `SPELNIA`; `kryterium_najblizej_granicy` = składnik o najmniejszym
   MARGINESIE WZGLĘDNYM `m / |limit|` w punkcie krytycznym (marginesy różnych kryteriów mają różne
   jednostki — porównanie tylko w postaci bezwymiarowej; kryteria logiczne nie uczestniczą).

Naruszenie wykazane na modelu niezwalidowanym pozostaje `NIE_SPELNIA` (kierunek zachowawczy:
fałszywy alarm jest tańszy niż fałszywa zgodność), a wyjaśnienie mówi wprost, że naruszenie
wykazano na modelu bez walidacji i wymaga działania projektowego albo walidacji modelu.

## 3. Oś kompletności dowodu (niezależna od statusu kryterium)

`kompletnosc_dowodu ∈ {PELNY, NIEPELNY, NIE_DOTYCZY}` — PEŁNY wyłącznie, gdy spełnione są
WSZYSTKIE warunki:

1. **metoda dowodu właściwa dla rodzaju twierdzenia** (`ClaimKind`): twierdzenie o zachowaniu
   dynamicznym — symulacja na silniku o poziomie `VALIDATED_SIMULATION` w zadeklarowanej domenie
   ORAZ model urządzenia `VALIDATED_AGAINST_TEST` albo `CERTIFIED_MODEL`, albo raport z testu,
   albo certyfikat pokrywający wymaganie; twierdzenie o konfiguracji zadeklarowanej — deklaracja
   (`DECLARATION`) jest właściwą podstawą;
2. **dane wejściowe zwalidowane** — żadna wartość wpływająca na wynik nie ma jakości `ESTIMATED`
   ani `SYSTEM_DEFAULT` (`FieldQuality`), żadna nie jest przyjęta bez źródła (np. założona moc
   zwarciowa sieci — decyzja O-8 planu AB);
3. **podstawa limitów** o stanie `ZWERYFIKOWANE` albo `WSKAZANE` (dokument i jednostka redakcyjna
   wskazane; stan `WSKAZANE` jest wypisywany przy wyniku — treść dokumentu nie jest dołączona do
   repozytorium).

Kompletność `NIEPELNY` zawsze niesie listę powodów. Dokument formalny twierdzący zgodność
(certyfikat, wniosek do OSD) wymaga `SPELNIA` + `PELNY` dla każdego wymagania stosowalnego;
inaczej lista braków jest listą PEŁNYCH rekordów (nie jednozdaniowych komunikatów).

## 4. Pola rekordu

### 4.1 `OcenaKryterium` (poziom K)

| Pole | Treść | Obowiązkowe |
|------|-------|-------------|
| `kryterium_id` | stabilny identyfikator (np. `frt.pozostanie_w_pracy`, `lfsm_o.odpowiedz_p`, `przewod.wytrzymalosc_cieplna`) | zawsze |
| `przedmiot` | CO oceniono: element/moduł (`element_ref`, nazwa) + zdanie („Pozostanie modułu parku energii typu B w pracy podczas zadanego profilu zapadu napięcia") | zawsze |
| `kryterium` | `opis_pl` + `warunek_latex` (render `MathRenderer`) + relacja (`NIE_WIECEJ` / `NIE_MNIEJ` / `PASMO` / `OBWIEDNIA_DOLNA` / `OBWIEDNIA_GORNA` / `LOGICZNE`) | zawsze; `warunek_latex` dla relacji liczbowych |
| `wynik` | wielkość (`wielkosc_pl`, `symbol_latex`), wartość, **jednostka**, punkt krytyczny (chwila `t` / element / przedział), metoda (`SYMULACJA` / `OBLICZENIE` / `DEKLARACJA` / `POMIAR` / `CERTYFIKAT`); dla trajektorii — ekstremum i moment krytyczny | gdy status ≠ `NIE_DOTYCZY`, `NIE_OCENIONO` (dla `BRAK_PODSTAWY` — informacyjnie, jeśli policzony) |
| `limit` | wartość / pasmo / obwiednia (punkty), **jednostka**, `podstawa: PodstawaWymagania`, zakres stosowalności, wersja profilu | gdy relacja liczbowa; brak = `BRAK_PODSTAWY` z nazwanym parametrem |
| `margines` | wartość, **jednostka**, `definicja_latex`, punkt, margines względny; albo `niedefiniowalny` z powodem | gdy wynik i limit istnieją |
| `niepewnosc` | wartość, jednostka, metoda (np. połowienie kroku całkowania); albo jawny powód braku („porównanie wartości zadeklarowanych — niepewność numeryczna nie dotyczy") | zawsze (wartość albo powód) |
| `status_maszynowy` | §2 | zawsze |
| `wyjasnienie` | `WyjasnienieWerdyktu` (§5) | zawsze |
| `dowod` | `StatusDowodu` | zawsze |
| `zakres_waznosci` | `ZakresWaznosci` (§7) | zawsze dla wyników dynamicznych; dla sprawdzeń statycznych — rodzaj analizy i założenia |
| `slad` | odnośniki kroków WHITE BOX (§8) | zawsze, gdy istnieje obliczenie |

### 4.2 `WynikWymagania` (poziom W)

| Pole | Treść |
|------|-------|
| `wymaganie_id`, `nazwa_pl` | identyfikator z katalogu wymagań profilu i nazwa |
| `podstawa` | `PodstawaWymagania` wymagania (dokument, wydanie, jednostka redakcyjna, warstwa, stan źródła) |
| `stosowalnosc` | typ, technologia, `dotyczy`, `powod_pl` (zawsze niepusty) |
| `sposob_wykazania` | `CERTYFIKAT` / `RAPORT_Z_TESTU` / `SYMULACJA` / `OBLICZENIE` / `DEKLARACJA` / `OCENA_OPERATORA` / `DOWOD_LACZONY` / `BRAK_METODY` |
| `oceny_skladowe` | lista `OcenaKryterium` (≥ 1, poza `NIE_DOTYCZY`) |
| `status_maszynowy`, `kompletnosc_dowodu` | §2.3, §3 |
| `kryteria_naruszone`, `kryterium_najblizej_granicy` | §2.3 |
| `wyjasnienie`, `dowod`, `zakres_waznosci`, `slad` | jak na poziomie K, zagregowane |

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

**Kryterium spełnione (dynamika, dowód pełny):**
> Pozostanie w pracy podczas zapadu — kryterium spełnione. Przebieg napięcia w punkcie
> przyłączenia pozostawał nad obwiednią w całym wymaganym przedziale (najmniejszy margines
> +0,037 pu w chwili 182 ms), a moduł nie został odłączony: zabezpieczenie podnapięciowe modułu
> miało zapas czasu 0,41 s do zadziałania. Model: przekształtnik nadążny, wersja …; status modelu:
> VALIDATED_AGAINST_TEST. Zakres ważności: RMS składowa zgodna, zwarcie trójfazowe,
> S_k″ = 120 MVA (z warunków przyłączenia), X/R = 8.

**Wymaganie nie wykazane z powodu jednego składnika (agregacja W):**
> Zdolność do pozostania w pracy podczas zwarcia (NC RfG art. 14 ust. 3) — wymaganie nie zostało
> wykazane. Moduł pozostawał przyłączony przez cały przebieg, ale naruszono kryterium odpowiedzi
> prądu biernego: czas narastania 67 ms wobec wymaganych ≤ 40 ms (przekroczenie 27 ms). Pozostałe
> kryteria: pozostanie w pracy — spełnione (margines +0,037 pu); odbudowa mocy czynnej —
> spełnione (96,4 % P przed zakłóceniem po 1,0 s wobec wymaganych 90 %); ogranicznik prądu —
> zachowany (margines 0,08 pu). Przyczyna wyniku: zbyt późna odpowiedź prądu biernego.

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

- Wynik symulacji używany w ocenie zgodności ma niepewność numeryczną oszacowaną przez bieg
  kontrolny z połowionym krokiem całkowania: `u = |metryka(h) − metryka(h/2)|` (oszacowanie
  zachowawcze błędu dyskretyzacji; zdarzenia z dokładnym czasem, więc różnica nie pochodzi z
  lokalizacji zdarzeń).
- Porównanie wartości zadeklarowanych ma niepewność „nie dotyczy" z jawnym powodem; pomiar (AB-7)
  niesie niepewność z raportu z badania.
- Niepewność modelowa (parametry niezwalidowane) nie jest liczbą wymyślaną — wyraża ją
  `status_modelu` i kompletność dowodu, nie sztuczne pasmo.

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

Jeden wspólny komponent karty werdyktu (warstwa `ui2/wyniki/wzorzec`) jest JEDYNYM miejscem
mapowania statusu maszynowego na etykietę i kolor. Minimum na karcie: **Ocena · Kryterium
(`MathInline`) · Wynik · Limit · Margines (z wzorem) · Wyjaśnienie · Podstawa (ze stanem źródła) ·
Dowód (metoda, poziom, status modelu, status danych)**; zakres ważności i ślad — rozwijane, zawsze
osiągalne jednym kliknięciem. Zdanie wyjaśnienia jest widoczne bez rozwijania (nie w dymku).

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
dokumentu). Minimum bloku: Wymaganie · Ocena · Kryterium · Wynik · Margines · Stan końcowy (gdy
kryterium stanu końcowego istnieje) · Podstawa (dokument / wydanie / jednostka redakcyjna / stan
źródła) · Dowód (metoda, odniesienie do biegu/certyfikatu) · Status modelu · Status danych · Zakres
ważności. Dokument twierdzący zgodność wymaga §3 (PEŁNY) dla każdego wymagania stosowalnego.

## 11. Inwarianty i testy kontraktu (obowiązkowe, falsyfikujące)

| Test | Inwariant |
|------|-----------|
| T1 | rekord K/W bez `wyjasnienie` albo z pustym `zdanie_pl` → błąd walidacji przy konstrukcji |
| T2 | status `SPELNIA` / `NIE_SPELNIA` / `NIEJEDNOZNACZNY` bez `kryterium` (opis + `warunek_latex` dla relacji liczbowej) → błąd |
| T3 | liczba w `wynik` / `limit` / `margines` / `niepewnosc` bez jednostki → błąd (bezwymiarowe jawnie: „—" z nazwą, np. „p.u." albo „1") |
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

Testy T1–T11 są testami ILOCZYNU CECH (status × kompletność × stan źródła × status modelu ×
status danych), nie przykładami pojedynczymi (reguła KLASA, NIE INSTANCJA).

## 12. Strażnik kontraktowy (`werdykt_wyjasnialny_guard`)

Bada KONTRAKT, nie tekst (nie poluje na słowo „spełnia"):

1. **Backend (AST):** każda klasa modelu (pydantic / dataclass) z polem o typie `Literal`
   zawierającym wartość ze słownika werdyktów (`SPELNIA`, `NIE_SPELNIA`, `pass`, `fail`, `PASS`,
   `FAIL`, `zgodny`, `niezgodny`, `OK`, `NOK`, …) musi być typem kanonicznym (`OcenaKryterium` /
   `WynikWymagania`), zawierać pole typu `WyjasnienieWerdyktu`, albo stać na liście enumów
   wewnętrznych z uzasadnieniem (np. wartości publiczne statusu walidacji kanonu V12).
2. **Kontrakt HTTP:** w migawce OpenAPI każdy obiekt odpowiedzi z właściwością-enumem werdyktu
   niesie w tym samym obiekcie odwołanie do schematu wyjaśnienia.
3. **Frontend:** mapa „status maszynowy → etykieta/kolor" (literał obiektu o kluczach ze słownika
   werdyktów) wolno zdefiniować wyłącznie w module karty werdyktu; propsy karty wymagają pełnego
   rekordu (egzekwuje kompilator TypeScript).
4. **Dokumenty formalne:** mapy status → etykieta w rendererach DOCX/PDF wyłącznie w serializerze
   rekordu.

Zapadka: stan zastany z inwentarza (plan AB §8) jest przypięty liczbą i może tylko maleć; nowe
miejsce łamiące kontrakt = czerwony guard. Self-test z przypadkiem pozytywnym i negatywnym dla
każdego z czterech sprawdzeń. Wpięcie: `scripts/guardy_z_ci.py` + właściwe workflow CI.

## 13. Zakres przedmiotowy i migracja

Kontrakt obowiązuje każdy wynik przedstawiany człowiekowi. Inwentarz miejsc, które dziś zwracają
lakoniczny werdykt, z klasyfikacją (migracja natychmiastowa / enum wewnętrzny — pozostaje / legacy
do usunięcia) i przypisaniem do przyrostów: `docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` §8.
