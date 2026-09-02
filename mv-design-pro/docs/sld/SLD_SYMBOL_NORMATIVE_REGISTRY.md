# SLD nN — REJESTR NORMATYWNY SYMBOLI CAD (R2)

**Status:** rejestr WIĄŻĄCY dla warstwy schematu nN (L2) po odrzuceniu R2 (właściciel,
2026-09-02, ocena 5/10). Kod: `frontend/src/ui/sld/v3/cad/cadSymbolRegistry.ts`
(`ELECTRICAL_CAD_SYMBOL_REGISTRY`) + renderer `cad/CadSymbol.tsx`. Pakiet wizualny i
przegląd inżynierski: `docs/sld/SLD_CAD_SYMBOL_REFERENCE_PACK_R2.md`.

**Rewizja:** 1.0 (2026-09-02). Kolejność dokumentów: kanon V12.xx → ten rejestr →
`PROJEKCJA_SN_NN_PORTAL_V1.md` (kontrakt danych) → renderer.

---

## 0. Zasady rejestru

1. **Symbol CAD ≠ piktogram aplikacji** (R2 §20). Ten rejestr opisuje WYŁĄCZNIE symbole
   schematu (linie, łuki, styki, uzwojenia, zaciski, połączenia). Piktogramy kreatorów,
   menu, kart i inspektora żyją poza nim i nie wolno ich mieszać z warstwą L2.
2. **Zero wypełnienia jako nośnika stanu** (R2 §4/§14). Stan łączeniowy wynika z geometrii
   noża (kąt wokół przegubu). Wypełnienie tuszem jest dozwolone tylko tam, gdzie IEC
   rysuje element pełny (grot strzałki, kropka połączenia, płyta ogniwa).
3. **Statusy weryfikacji** (R2 §2) — pole `verification_status`:
   - `DRAFT` — geometria robocza, bez potwierdzonego pierwowzoru normatywnego;
   - `ENGINEERING_REVIEWED` — identyfikator IEC 60617 potwierdzony w oficjalnym wykazie
     identyfikatorów IEC (webstore, „IEC 60617 — Graphical symbols for diagrams",
     podgląd z tytułami symboli), geometria zgodna z konwencją rysunkową IEC w ocenie
     przeglądu inżynierskiego tej sesji;
   - `NORMATIVE_VERIFIED` — geometria porównana 1:1 z grafiką w bazie IEC 60617 (DB,
     dostęp licencyjny). **Żaden symbol w tym rejestrze nie ma dziś tego statusu** i
     żaden nie może być opisany jako „zweryfikowany normatywnie" / „zgodny z PN-EN"
     bez wykonania tego porównania. Historyczne arkusze PN-EN 60617 są wycofane; źródłem
     bieżącym jest baza IEC 60617.
4. **Symbol z DANYCH, nie z domysłu.** Wybór symbolu wynika z typu gałęzi ENM i, gdy jest,
   z `materialized_params.device_kind` pozycji katalogu (§8 pakietu). Brak klasy
   funkcjonalnej daje symbol ogólny i komunikat audytu — nie dorysowujemy aparatu,
   którego model nie deklaruje (R2 §6).
5. **Siatka CAD** (R2 §16). Jednostka „u"; aparat 16×24 u, oś toru x = 8; każdy symbol ma
   `anchors.{top,bottom,left,right,center}`, `terminals` na krawędzi gabarytu,
   `nominalWidth/Height`, `minimumSizePx`, `lodPolicy`. Zaciski wszystkich symbolów leżą
   na siatce 1 u (pin: `cad/__tests__/cadSymbolRegistry.test.tsx`).

Wspólne pola geometrii łączników (jedna rodzina, R2 §4/§5):

| Element | Położenie [u] | Uwagi |
|---|---|---|
| zacisk górny `a` | (8, 0) | tor pionowy, prąd z góry |
| styk stały | y = 7 | koniec przewodu górnego |
| przegub noża | (8, 17) | nóż długości 10 u |
| nóż ZAMKNIĘTY | 0° | w osi toru |
| nóż OTWARTY | +30° | końcówka odchylona w prawo, przerwa ≈ 5 u |
| nóż NIEZNANY | +15° + kreska przerywana noża | bez tekstu w symbolu |
| zacisk dolny `b` | (8, 24) | |

Kwalifikatory funkcji (IEC 60617): krzyżyk „×" na końcówce noża = funkcja wyłącznika
(S00219); poprzeczka styku stałego = funkcja odłącznika (S00220); poprzeczka + okrąg na
przegubie = funkcja rozłącznika (S00221); wkładka jako nóż = rozłącznik bezpiecznikowy
(S00368/S00370).

---

## 1. Rejestr symboli

Pola zgodne z mandatem R2 §2: `domain_type`, `symbol_role`, `IEC_reference`, `polish_name`,
`project_designation`, `graphic_variant`, `open_variant`, `closed_variant`, `notes`,
`verification_status`.

### 01 · `cad.wylacznik`
- **domain_type:** `branch.breaker` (SwitchBranch `type=breaker`); `branch.bus_coupler` z
  `device_kind` WYLACZNIK / WYLACZNIK_GLOWNY / WYLACZNIK_ODPLYWOWY
- **symbol_role:** aparat łączeniowy toru pierwotnego z funkcją wyłączania prądów zwarciowych
- **IEC_reference:** S00287 (Circuit-breaker) = S00227 (Make contact / Switch, general) +
  S00219 (Circuit-breaker function)
- **polish_name:** WYŁĄCZNIK
- **project_designation:** QF (identyfikator, nie nazwa)
- **graphic_variant:** styk stały (y = 7) + nóż na przegubie (8, 17) + krzyżyk „×" na
  końcówce noża; 16×24 u; zaciski a(8,0), b(8,24)
- **open_variant:** nóż +30°, krzyżyk obraca się z nożem
- **closed_variant:** nóż w osi, krzyżyk leży na styku stałym (czytany jako „× na torze")
- **notes:** zakaz czarnego/białego prostokąta; dźwignia MCB nie jest elementem symbolu
  IEC (rodzaj wyrobu niesie tabliczka); rozmiar nie koduje prądu
- **verification_status:** ENGINEERING_REVIEWED

### 02 · `cad.odlacznik`
- **domain_type:** `branch.disconnector`; `branch.bus_coupler` z `device_kind` ODLACZNIK
- **symbol_role:** łącznik izolacyjny bez zdolności łączenia prądu obciążenia
- **IEC_reference:** S00288 (Disconnector; Isolator) = S00227 + S00220 (Disconnector function)
- **polish_name:** ODŁĄCZNIK
- **project_designation:** QS
- **graphic_variant:** poprzeczka styku stałego (8 u) + nóż na przegubie; 16×24 u
- **open_variant:** nóż +30°, poprzeczka nieruchoma na styku stałym
- **closed_variant:** nóż w osi, poprzeczka przecina tor (znak „T" odwrócony)
- **notes:** różni się od rozłącznika BRAKIEM okręgu na przegubie; poprzednia biblioteka
  rysowała poprzeczkę przy przegubie (zła strona) — usunięte
- **verification_status:** ENGINEERING_REVIEWED

### 03 · `cad.rozlacznik`
- **domain_type:** `branch.switch` (bez `device_kind` albo `device_kind` ROZLACZNIK);
  `branch.bus_coupler` z `device_kind` ROZLACZNIK
- **symbol_role:** łącznik izolacyjny ze zdolnością łączenia prądu obciążenia
- **IEC_reference:** S00290 (Switch-disconnector; On-load isolating switch) = S00227 +
  S00220 + S00221 (Switch-disconnector function)
- **polish_name:** ROZŁĄCZNIK (rozłącznik izolacyjny)
- **project_designation:** QS
- **graphic_variant:** poprzeczka styku stałego + okrąg r = 2,2 u na przegubie + nóż
- **open_variant:** nóż +30° od okręgu przegubu
- **closed_variant:** nóż w osi; okrąg i poprzeczka pozostają — identyfikacja bez etykiety
- **notes:** położenie okręgu funkcji (na przegubie) do potwierdzenia w bazie IEC przed
  statusem NORMATIVE_VERIFIED
- **verification_status:** ENGINEERING_REVIEWED

### 04 · `cad.lacznik`
- **domain_type:** `branch.bus_coupler` BEZ `device_kind` (klasa funkcjonalna nieznana w
  modelu)
- **symbol_role:** łącznik szyn o nieokreślonej funkcji (symbol ogólny)
- **IEC_reference:** S00227 (Make contact, general symbol; Switch, general symbol)
- **polish_name:** ŁĄCZNIK (ŁĄCZNIK SZYN — funkcja nieokreślona)
- **project_designation:** QBC (identyfikator sprzęgła w projekcji nN)
- **graphic_variant:** styk stały + nóż na przegubie, bez kwalifikatora
- **open_variant:** nóż +30°
- **closed_variant:** nóż w osi = kreska toru w grubości SYMBOLU między szynami w grubości
  BUS (hierarchia grubości daje identyfikację); tabliczka „QBC · ZAMKNIĘTY" obok
- **notes:** rysowany TYLKO, gdy ENM nie niesie klasy; wtedy audyt NN-AUD-18 (INFO)
  nazywa brak danych. Z `device_kind` sprzęgło dostaje symbol REALNEGO aparatu (01/02/03/07)
  — R2 §6. Nie dorysowujemy drugiego aparatu, którego model nie ma.
- **verification_status:** ENGINEERING_REVIEWED

### 05 · `cad.uziemnik`
- **domain_type:** brak elementu ENM w projekcji nN (rezerwacja rodziny; kompozycje pól SN
  niosą uziemnik w bibliotece SN)
- **symbol_role:** łącznik uziemiający tor
- **IEC_reference:** złożenie: S00288 (Disconnector) + S00200 (Earth, general symbol);
  w wykazie podglądowym IEC brak osobnego identyfikatora uziemnika (S01848 to odłącznik
  ZESPOLONY z uziemnikiem — inny element)
- **polish_name:** UZIEMNIK
- **project_designation:** — (brak elementu ENM)
- **graphic_variant:** przegub u góry na przewodzie (8, 4), nóż 10 u zamyka w dół na
  poprzeczkę (y = 14), dalej trzy malejące kreski uziemienia (17/20/23); jeden zacisk a(8,0)
- **open_variant:** nóż −30° (końcówka dolna w prawo)
- **closed_variant:** nóż w osi na poprzeczkę
- **notes:** DRAFT do czasu potwierdzenia pierwowzoru w bazie IEC i pojawienia się
  elementu ENM
- **verification_status:** DRAFT

### 06 · `cad.bezpiecznik`
- **domain_type:** `branch.fuse` (FuseBranch; katalog WKLADKA_NN)
- **symbol_role:** wkładka topikowa w torze (bez stanu łączeniowego)
- **IEC_reference:** S00362 (Fuse, general symbol)
- **polish_name:** BEZPIECZNIK (wkładka topikowa)
- **project_designation:** FU
- **graphic_variant:** prostokąt 6×12 u z przewodem przechodzącym na wylot; 16×24 u
- **open_variant:** — (bez stanu)
- **closed_variant:** — (bez stanu)
- **notes:** przepalenie wkładki to zdarzenie, nie stan łączeniowy; sześciokąt kasety
  z poprzedniej biblioteki nie jest symbolem IEC — usunięty
- **verification_status:** ENGINEERING_REVIEWED

### 07 · `cad.rozlacznikBezpiecznikowy`
- **domain_type:** `branch.switch` z `device_kind` ROZLACZNIK_BEZPIECZNIKOWY (katalog
  APARAT_NN; operacje ENM mapują ten rodzaj na typ `switch`); `branch.bus_coupler` z tym
  samym `device_kind`
- **symbol_role:** rozłącznik izolacyjny z wkładką jako stykiem ruchomym
- **IEC_reference:** S00370 (Fuse switch-disconnector; On-load isolating fuse switch) =
  wkładka (S00362) jako nóż + S00220 + S00221
- **polish_name:** ROZŁĄCZNIK BEZPIECZNIKOWY
- **project_designation:** QS (z wkładką FU w tabliczce)
- **graphic_variant:** poprzeczka styku stałego + okrąg na przegubie + nóż z prostokątem
  wkładki 4,4×7,5 u
- **open_variant:** nóż z wkładką +30°
- **closed_variant:** wkładka w osi toru między poprzeczką a okręgiem
- **notes:** rysowany WYŁĄCZNIE, gdy model niesie `device_kind`; goła wkładka
  (FuseBranch) = 06
- **verification_status:** ENGINEERING_REVIEWED

### 08 · `cad.transformator2u`
- **domain_type:** `transformer` (Transformer2W SN/nN)
- **symbol_role:** źródło sieciowe domeny nN (zacisk hv = strona SN, lv = strona nN)
- **IEC_reference:** S00841 (Transformer with two windings, general symbol — forma 1:
  dwa okręgi)
- **polish_name:** TRANSFORMATOR (dwuuzwojeniowy)
- **project_designation:** T (T1, TA, TB…)
- **graphic_variant:** dwa okręgi r = 6,5 u, środki (8, 9) i (8, 19), zachodzące na 3 u;
  16×28 u; zaciski hv(8,0), lv(8,28)
- **open_variant / closed_variant:** — (bez stanu)
- **notes:** tabliczka (Sn, przekładnia, grupa, uk) jest TEKSTEM obok; moc NIE jest kodowana
  rozmiarem; cienka kreska (SECONDARY < symbol < PRIMARY)
- **verification_status:** ENGINEERING_REVIEWED

### 09 · `cad.przekladnikPradowy`
- **domain_type:** `measurement` z `measurement_type=CT`
- **symbol_role:** przekładnik prądowy w torze pierwotnym (element szeregowy)
- **IEC_reference:** S00850 (Current transformer, general symbol — forma 1: okrąg na
  przewodzie pierwotnym)
- **polish_name:** PRZEKŁADNIK PRĄDOWY
- **project_designation:** CT
- **graphic_variant:** przewód 0→24 u przez okrąg r = 5,5 u w (8, 12); 16×24 u; zaciski a, b
- **open_variant / closed_variant:** — (bez stanu)
- **notes:** przekładnia, klasa, rdzenie, moc — tekstem obok, nigdy w plakietce
- **verification_status:** ENGINEERING_REVIEWED

### 10 · `cad.przekladnikNapieciowy`
- **domain_type:** `measurement` z `measurement_type=VT`
- **symbol_role:** przekładnik napięciowy na odgałęzieniu od toru (element bocznikowy)
- **IEC_reference:** S00878 (Voltage transformer — forma 1: dwa uzwojenia)
- **polish_name:** PRZEKŁADNIK NAPIĘCIOWY
- **project_designation:** VT
- **graphic_variant:** odgałęzienie (jeden zacisk a(8,0)), dwa okręgi r = 4,5 u w (8, 9) i
  (8, 15,5), krótkie wyprowadzenie wtórne 20→23 u zakończone otwarte
- **open_variant / closed_variant:** — (bez stanu)
- **notes:** różni się od CT (okrąg NA przewodzie, dwa zaciski) i od transformatora mocy
  (większy, dwa zaciski w torze)
- **verification_status:** ENGINEERING_REVIEWED

### 11 · `cad.przeksztaltnik`
- **domain_type:** ogniwo przekształtnika w złożeniach 12/13 (samodzielny element ENM nie
  istnieje — falownik jest częścią `generator`)
- **symbol_role:** element ELEKTRYCZNY toru DC→AC
- **IEC_reference:** S00896 (Inverter) na bazie S00213 (Converter, general symbol)
- **polish_name:** FALOWNIK / PRZEKSZTAŁTNIK
- **project_designation:** INV (część elementu PV/BESS)
- **graphic_variant:** kwadrat 12×12 u z przekątną (lewy dolny → prawy górny), „=" w
  trójkącie DC (górny lewy), „~" w trójkącie AC (dolny prawy) — oba KRESKAMI; zaciski
  dc(8,0), ac(8,24)
- **open_variant / closed_variant:** — (bez stanu)
- **notes:** tor PV: źródło DC → przekształtnik → aparat → kabel → szyna (R2 §10)
- **verification_status:** ENGINEERING_REVIEWED

### 12 · `cad.zrodloPvZPrzeksztaltnikiem`
- **domain_type:** `generator` z `gen_type=pv_inverter` (JEDEN element ENM)
- **symbol_role:** źródło PV z falownikiem (technologia źródła + element elektryczny)
- **IEC_reference:** złożenie S00908 (Photovoltaic generator) + S00896 (Inverter)
- **polish_name:** GENERATOR FOTOWOLTAICZNY Z FALOWNIKIEM
- **project_designation:** PV (PV1…)
- **graphic_variant:** ramka 12×12 u z ogniwem (płyta długa cienka + krótka gruba) i dwiema
  strzałkami promieniowania; przewód; przekształtnik 12×12 u; 16×40 u; zacisk ac(8,40)
- **open_variant / closed_variant:** — (bez stanu)
- **notes:** symbol jest złożeniem OBU ogniw tego samego elementu ENM — nie dorysowuje
  osobnego urządzenia; opis obok: nazwa, moc, zdolność (podąża/tworzy napięcie)
- **verification_status:** ENGINEERING_REVIEWED

### 13 · `cad.magazynZPrzeksztaltnikiem`
- **domain_type:** `generator` z `gen_type=bess` (JEDEN element ENM)
- **symbol_role:** magazyn energii z przekształtnikiem dwukierunkowym
- **IEC_reference:** złożenie S01342 (Battery of primary or secondary cells) + S00897
  (Rectifier/inverter)
- **polish_name:** MAGAZYN ENERGII Z PRZEKSZTAŁTNIKIEM
- **project_designation:** BES (BES1…)
- **graphic_variant:** dwie pary płyt (długa cienka / krótka gruba ×2,2), przewód,
  przekształtnik 12×12 u; 16×40 u; zacisk ac(8,40)
- **open_variant / closed_variant:** — (bez stanu)
- **notes:** przekształtnik rysowany tym samym symbolem co falownik (kierunek pracy jest
  daną wyniku, nie geometrii)
- **verification_status:** ENGINEERING_REVIEWED

### 14 · `cad.generator`
- **domain_type:** `generator` z `gen_type` synchronous / wind_inverter / fw_pmsg / fw_dfig /
  fw_scig (maszyna)
- **symbol_role:** maszyna wirująca (generator)
- **IEC_reference:** S00819 (Machine, general symbol) z kodem literowym G i znakiem „~"
- **polish_name:** GENERATOR (maszyna wirująca)
- **project_designation:** G (G1…)
- **graphic_variant:** okrąg r = 7,5 u w (8, 9), litera „G" (7 u) i „~" kreską; 16×24 u;
  zacisk ac(8,24)
- **open_variant / closed_variant:** — (bez stanu)
- **notes:** litera G i „~" są CZĘŚCIĄ symbolu IEC (kod maszyny), nie etykietą aplikacji;
  turbina wiatrowa nie ma glifu IEC — technologia w opisie obok
- **verification_status:** ENGINEERING_REVIEWED

### 15 · `cad.odplywOdbior`
- **domain_type:** `load` (Load ENM = odbiór zagregowany P/Q na końcu odpływu)
- **symbol_role:** odpływ energii od szyn do odbioru zagregowanego
- **IEC_reference:** S00104 (Energy flow from the busbars)
- **polish_name:** ODBIÓR (odpływ do odbioru zagregowanego)
- **project_designation:** nazwa odbioru z ENM (bez klasy oznaczenia)
- **graphic_variant:** przewód 0→9 u + grot pełny 8×7 u; 16×16 u; zacisk a(8,0)
- **open_variant / closed_variant:** — (bez stanu)
- **notes:** jawny rodzaj odbiornika nie istnieje w ENM (Load nie ma typu) — strzałka
  odpływu jest właściwym nośnikiem (R2 §12); z chwilą pojawienia się typu odbiornika w ENM
  rejestr dostaje osobne symbole
- **verification_status:** ENGINEERING_REVIEWED

### 16 · `cad.zabezpieczenie`
- **domain_type:** `protection_assignment` (przekaźnik przypisany do aparatu)
- **symbol_role:** urządzenie wtórne (zabezpieczenie) powiązane z torem
- **IEC_reference:** konwencja dokumentacji zabezpieczeń: prostokąt urządzenia + znaki
  wielkości charakterystycznej w notacji IEC (I>, I>>, I0>, U<, U>, f<, f>, df/dt, Δφ)
  wewnątrz; numery funkcji ANSI/IEEE C37.2 w panelu odpływu
- **polish_name:** ZABEZPIECZENIE (przekaźnik)
- **project_designation:** REL
- **graphic_variant:** prostokąt 15×11 u w polu 16×12 u; łącznik kropkowany do toru; znaki
  funkcji (maks. 2 wiersze, nadmiar „+N") nanosi renderer z danych przypisania
- **open_variant / closed_variant:** — (bez stanu)
- **notes:** DRAFT — brak identyfikatora IEC dla przekaźnika zabezpieczeniowego w wykazie
  podglądowym; okrąg z kodami z poprzedniej biblioteki (plakietka) usunięty
- **verification_status:** DRAFT

### 17 · `cad.zacisk`
- **domain_type:** `bus` poza rozdzielnicą (zacisk toru, stopień ≠ 2 rozgałęzienia) /
  zacisk granicy domeny
- **symbol_role:** punkt przyłączenia bez rozgałęzienia
- **IEC_reference:** S00017 (Terminal)
- **polish_name:** ZACISK
- **project_designation:** —
- **graphic_variant:** okrąg pusty r = 2 u w (4, 4); 8×8 u; zaciski a(4,0), b(4,8)
- **open_variant / closed_variant:** — (bez stanu)
- **notes:** odróżnialny od węzła (18) — pusty vs pełny
- **verification_status:** ENGINEERING_REVIEWED

### 18 · `cad.wezel`
- **domain_type:** `bus` z rozgałęzieniem toru (stopień ≥ 3)
- **symbol_role:** połączenie elektryczne przewodów
- **IEC_reference:** S00020 (T-connection) / S00021 (Double junction of conductors)
- **polish_name:** WĘZEŁ (połączenie przewodów)
- **project_designation:** —
- **graphic_variant:** kropka pełna r = 1,8 u w (4, 4); 8×8 u
- **open_variant / closed_variant:** — (bez stanu)
- **notes:** kropka pełna = połączenie; przewody skrzyżowane bez kropki = brak połączenia
- **verification_status:** ENGINEERING_REVIEWED

---

## 2. Podsumowanie statusów

| Status | Symbole |
|---|---|
| NORMATIVE_VERIFIED | — (0) |
| ENGINEERING_REVIEWED | 01, 02, 03, 04, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 17, 18 (16) |
| DRAFT | 05 uziemnik, 16 zabezpieczenie (2) |

Droga do NORMATIVE_VERIFIED: porównanie geometrii z grafiką bazy IEC 60617 (DB) dla
każdego identyfikatora S00xxx wymienionego wyżej; wynik zapisany per symbol w tym rejestrze
(data, źródło, różnice). Do tego czasu w UI, eksportach i raportach obowiązuje sformułowanie
„symbol wg konwencji IEC 60617 (przegląd inżynierski)", nigdy „zgodny z PN-EN/IEC".

## 3. Grubości kresek warstwy L2 (R2 §13)

| Klasa | px ekranu (kreska nieskalowana) | Zastosowanie |
|---|---|---|
| BUS | 3,0 | szyny rozdzielnic (główna i podrozdzielnic) |
| PRIMARY | 1,6 | tory pierwotne: przewody pól, kable, odcinki incomera |
| symbol | 1,4 | kreska symbolu CAD (`CAD_SYMBOL_STROKE_PX`) |
| SECONDARY | 1,0 | odgałęzienia pomiarowe, łącznik przekaźnika (kropkowany), zaciski |
| RESULT HIGHLIGHT | 6,0 · przezroczystość 0,28 | podświetlenie toru zasilania / wyniku pod torem |

Bez skrajnych kontrastów; jeden tusz na kanwie mono.

## 4. Skala symboli na kanwie

Jedna skala biblioteki: `CAD_U_PX = 2` px ekranu na 1 u (`visualGrammar.ts`) — aparat 16×24 u
= 32×48 px (korpus: nóż 20 px, krzyżyk 12 px ≈ 2× pismo oznaczenia 12 px), transformator
56 px, złożenie PV/BESS 80 px, zacisk/węzeł 16 px. Symbol jest screen-stable (nie skaluje
się z kamerą); na przeglądzie (LOD 0) maleje wyłącznie z sufitem udziału w slocie
(`SYMBOL_SLOT_SHARE`), nigdy poniżej 0,2 px/u. Rozmiar nie koduje żadnego parametru.
