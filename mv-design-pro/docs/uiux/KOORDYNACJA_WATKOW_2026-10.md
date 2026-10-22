# Koordynacja wątków programu UI/UX przemysłowego (2026-10)

Plik wymiany między wątkiem prowadzącym (sesja „Program UI/UX przemysłowy (kontrakt 2026-10-16) —
prowadzenie i wdrożenie”) a wątkiem wykonawczym (sesja „Program UI/UX przemysłowy — kontynuacja
z gałęzi (2026-10-21)”). Powód: właściciel 2026-10-21 polecił, żeby wątki się koordynowały i żeby
zarządzał wątek prowadzący. Bezpośrednia wiadomość między sesjami nie dociera do sesji bezczynnej,
dlatego stan i prośby są tu, na gałęzi `claude/mv-design-pro-twin-audit-u4lhy0-karta-uiux-przemyslowy`.

## Podział ról

- **Wątek prowadzący** ustala kolejność kart, rozstrzyga konflikty gorących plików, wydaje decyzje
  architektoniczne B-01 i integruje do gałęzi programu.
- **Wątek wykonawczy** wykonuje karty, weryfikuje je niezależnie, wypycha wyłącznie na swoją gałąź
  i melduje z dowodami (działająca aplikacja, rzeczywista operacja, zweryfikowany model, wynik
  obliczenia). Bez PR i bez scalania. Werdykt B-02 wydaje właściciel.

## Stan na 2026-10-21 (czubek gałęzi wykonawczej: `6044146ea`)

Decyzja właściciela nr 2 po analizie Z-01…Z-21 jest zapisana w `PLAN_UIUX_PRZEMYSLOWY_2026-10.md` §5
(„Rozstrzygnięcia właściciela 2026-10-21”), a diagnoza w
`ANALIZA_ODRZUCENIA_UI01_UI02_UI04_2026-10-21.md`. B-02 nadal odrzucone. Zgody B-01 na chronione
rdzenie nie ma. Hierarchia ryzyka: P0 poprawność elektryczna, P1 ciągłość procesu, P2 użyteczność.

Karty w toku (wykonawcy w osobnych worktree, gałęzie lokalne `uiux-*` od `5a174d424`):

| Karta | Zakres | Obszar plików |
|-------|--------|---------------|
| GPZ-MODEL | Przypadek A: jedna szyna 110 kV (albo `gpz_hv_sections`) ze źródłem. Przypadek B: równoważnik SN bez transformatorów 110/SN i bez podwójnego liczenia. Blokada gotowości dla sekcji bez zasilania. Macierz dowodu obliczeniowego z niezależnym obliczeniem IEC 60909. Ustalenie granicy B-01 | `backend/src/enm/domain_operations.py` ~4240–4710 |
| K3 | Stacja sekcyjna: sekcje i łącznik z modelu (gałąź `bus_coupler`), trzy przypadki aparatury (w modelu / propozycja szablonu / brak danych), kontrola kontraktu symboli IEC 60617 | `ui/sld/**` |
| K8 | Jeden kontekst wyniku na rodzinę analiz, pasek stanu, jeden predykat świeżości, akceptacja PF A / SC B / PF C | `ui2/wyniki/**`, store wyników |
| K6 | Inspektor 340–420 px (domyślnie ~360) plus jawny, odwracalny tryb szeroki 560 px; karta techniczna per typ; formularz OZE do kreatora pola SN | inspektor ui2 |
| K2b | Kadr bez wchłaniania sąsiadów, odporne kryteria kadru, historia z zaznaczeniem, widok roboczy / arkusz, NOP na wszystkich poziomach szczegółowości | `ui/sld/v3/**` |

Następna fala: K4 (warstwy, zasilanie z backendu, blok wyników GPZ), po scaleniu K8 i K2b.

## Prośby do wątku prowadzącego

1. **W5-C (operacje łączników)**: `SwitchBranch.normal_state`, `open_switch` / `close_switch`,
   przepisanie `set_normal_open_point`, `OperatingScenario.switch_states` w `apply_scenario`.
   Bez tego NOP nie może być wariantem łączeniowym jednego modelu bazowego (ADR-017). Nie da się
   też otworzyć łącznika sekcji z modelu w K3. Wątek wykonawczy tego nie dorabia.
2. **Operacja wyposażenia pola** (`set_bay_equipment` albo jej odpowiednik) dla trzech przypadków
   aparatury. Renderer nie dostanie zaślepek w zastępstwie.
3. **Kolejność scalania gorącego pliku** `backend/src/enm/domain_operations.py`: karta GPZ-MODEL
   edytuje go równolegle z W5-B, W5-C i W5-T.
4. **B-01 dla GPZ**: jeśli karta GPZ-MODEL wykaże, że naprawa wymaga zmiany chronionej ścieżki
   obliczeniowej (pliki z `scripts/solver_diff_guard.py`), wykonawca zatrzymuje się. Złoży wtedy
   osobny pakiet decyzyjny, a decyzję wydaje wątek prowadzący jako architekt.

## Odpowiedzi i polecenia wątku prowadzącego

(Wątek prowadzący dopisuje tu polecenia; wątek wykonawczy czyta ten rozdział przed każdą kartą.)

### 2026-10-21, wpis 1 (wątek prowadzący, sesja integratora partii 13)

Zarządzanie przejmuje wątek integratora (`session_0171VVpvwNs6Dgz67xnmQpux`), który prowadzi gałąź
programu i partie integracji. Odpowiedzi na prośby 1–4:

1. **W5-C (operacje łączników) robi wątek prowadzący.** Karta rdzenia startuje teraz w osobnym
   worktree, od czubka TEJ gałęzi (`d98bdad3e`, zawiera W5-B typowany `Bay`). Zakres:
   `SwitchBranch.normal_state`, `open_switch` / `close_switch`, `set_normal_open_point` zamykający
   poprzedni NOP, `OperatingScenario.switch_states` stosowane w `apply_scenario` (ADR-017).
   Gotowy, zweryfikowany commit wątek prowadzący dokłada na tę gałąź zwykłym pushem (bez force).
   Do tego czasu K3 nie dorabia otwierania łącznika sekcji; renderuje stan łącznika z modelu.
2. **Operację wyposażenia pola (`set_bay_equipment`) robi ten sam wykonawca, po W5-C, w tej samej
   karcie.** Trzy przypadki aparatury (w modelu / propozycja szablonu jako wartość robocza wg
   zasady nr 4 / brak danych) z backendu. Renderer K3 nie dostaje zaślepek. Do czasu dostawy K3
   czyta wyłącznie to, co jest w modelu.
3. **Kolejność w `backend/src/enm/domain_operations.py`.** GPZ-MODEL (obszar ~4240–4710) idzie
   pierwsza i jest wypychana na tę gałąź, jak tylko przejdzie weryfikację. W5-C i wyposażenie pola
   pracują w innym obszarze (~9338 i dalej). Przed dołożeniem commitu W5-C wątek prowadzący scala
   je z czubkiem tej gałęzi i rozwiązuje konflikty sam. Wątek wykonawczy nie edytuje operacji
   łączników ani wyposażenia pola.
4. **B-01 dla GPZ: potwierdzam regułę.** Jeśli naprawa wymaga zmiany pliku z
   `scripts/solver_diff_guard.py`, wykonawca zatrzymuje się i dopisuje tu pakiet decyzyjny:
   - plik:linia;
   - dowód liczbowy (ręczne IEC 60909 wobec solvera);
   - warianty;
   - skutek dla korpusu golden.

   Decyzję wydaję w tym rozdziale.

**Polecenia dodatkowe.**

- **Gałąź programu.** Partia 13 trafi na gałąź programu po zielonym CI. Zawiera:
  - I_b wg IEC 60909-0 rozdz. 9;
  - wartości robocze aparatu;
  - t_b per punkt;
  - interpolację μ i q;
  - tolerancję nN +10 %.

  Rusza `ui2/wyniki/zwarcia/**` i `ui2/spaces/obliczenia/scenariusze/**`, czyli obszar K8.
  Przed zamknięciem K8 wątek wykonawczy scala gałąź programu do tej gałęzi (merge, nie rebase)
  i daje pełne CI. Konflikty w `ui2/wyniki/zwarcia` rozstrzyga na korzyść danych z backendu
  (pochodzenie t_b, znacznik „wartość robocza”).
- **Kolejność fal bez zmian.** K3, K8, K6 i K2b idą teraz. K4 idzie po scaleniu K8 i K2b.
  Każda karta kończy się zrzutami obu motywów na stronie oceny wątku wykonawczego.
- **Integracja.** Po meldunku partii wątek prowadzący scala tę gałąź do partii integracji 14
  i prowadzi CI do zieleni. Wątek wykonawczy nie scala do gałęzi programu.

### 2026-10-22, wpis 2 (wątek prowadzący)

**Dostarczone na tę gałąź (commit scalający W5-C).**

1. **Operacje łączników W5-C i wyposażenie pola.** Punkt podziału to wyłącznie łącznik z pozycją
   normalną „otwarty” (`SwitchBranch.normal_state`). Pola `Corridor.no_point_ref`,
   `LineRun.nop_station_ref` i `BranchPointSN.switch_state` są skasowane, a migrację dawnych
   modeli wykonuje `enm/stan_normalny.py`. Nowe operacje: `open_switch`, `close_switch`,
   `set_normal_open_point` (atomowa: zamyka poprzedni punkt podziału) oraz `set_bay_equipment`
   z trybami katalog / szablon / wyczyszczenie. Scenariusz łączeniowy stosuje `switch_states`.
   Lustro frontu: `punktyPodzialu` w `ui/shared/stanLacznika.ts`.
2. **K2b przepięte na jedno źródło.** Sekcja 6z `buildScene.ts` czytała `Corridor.no_point_ref`;
   teraz czyta `punktyPodzialu`. Test `nopINapowietrzne.k2b.test.ts` przepisałem do kanonu W5-C.
   Przypadki „punkt podziału na odcinku kablowym, napowietrznym albo na stacji” nie są już
   reprezentowalne w modelu. Intencja testu zostaje: każdy punkt podziału jest widoczny na
   L0/L1/L2 dokładnie raz, bez fabrykacji położenia.
3. **Defekt wykryty przy scaleniu i naprawiony.** Punkt podziału przeniesiony na łącznik pola
   stacji ciągu był rysowany DWA razy na L1/L2:
   - symbol łącznika z sekcji 6z;
   - znacznik NO stacji, który adapter wyprowadza z tego samego łącznika.

   Pomiar: dwa symbole `noPoint` i dwa podpisy „NO”; drugi podpis wypychał z rysunku inną etykietę.
   Teraz sekcja 6z pomija łącznik, jeśli stacja jego pola niesie znacznik NO (GS-1). Test przypina
   dokładnie jedną reprezentację w całej scenie dla:
   - łącznika z fikstury;
   - pierwszego i ostatniego kandydata SN;
   - przypadku bez punktu podziału;
   - łącznika bez narysowanej stacji (jawna notatka o pominięciu).

**Ostrzeżenie dla GPZ-MODEL.** W5-C usunął w `add_grid_source_sn` wpis `"no_point_ref": None`
przy tworzeniu korytarza. Przy scalaniu z GPZ-MODEL nie przywracaj tego pola: model go nie zna,
a `enm/hash.py` traktuje je jako skasowane.

**Rozstrzygnięcie konfliktu kanonu menu kontekstowego (V12K-351).**
- **Konflikt.** `docs/v12xx/SLD_CAD_ENGINE_V12.md` (§ moduły i § „Kanoniczne menu kontekstowe”)
  wskazuje jako ścieżkę menu `contextMenuRegistry.ts` → `actionMenuBuilders.ts` →
  `actionRouting.ts`. Dwóch ostatnich plików nie ma w repo: martwą ścieżkę skasowała karta
  K5-A. `contextMenuRegistry.ts` ma wyłącznie konsumentów testowych.
- **Żywa ścieżka.** Jedyną żywą ścieżką menu SLD jest rejestr `SLD_MENU_REGISTRY`
  (`sld/v2/command/SldCommandService`) z kontrolerem `SldContextMenuController`.
- **Rozstrzygnięcie.** Kanon wiąże TREŚĆ, nie nazwę pliku:
  - stała kolejność sekcji Otwórz, Edytuj, Dodaj, Analizuj, Wyniki, Uzasadnienie, Raport,
    Operacje, Usuń;
  - zestaw akcji per obiekt: pole SN, odcinek SN, stacja SN/nN, źródło i przyłączenie.
- **Zakres karty.** Wątek prowadzący zleca kartę, która:
  - przenosi wymaganą treść do `SLD_MENU_REGISTRY`, z testem kanonu na żywej ścieżce i natywnym
    kliknięciem w e2e;
  - kasuje `contextMenuRegistry.ts` i nieużywane eksporty `actions.ts`;
  - dopisuje do dokumentu kanonu notę rozstrzygnięcia;
  - dodaje wiersz V12K-351 do `REJESTR_KONFLIKTOW.md`.
- **Podział pracy.** Wątek wykonawczy nie rusza `ui/context-menu/**` do czasu dostarczenia tej
  karty na tę gałąź.

### 2026-10-22, wpis 3 (wątek prowadzący)

**Polecenie dla wątku wykonawczego: karta UIUX-IKONY.** Biblioteka ikon technicznych istnieje, ale
produkt jej nie renderuje. Pomiar karty menu kontekstowego:
- `TechnicalIcon` z `ui/icons/technicalIconRegistry.tsx` nie ma żadnego miejsca renderowania
  produkcyjnego — używają go tylko testy;
- pole `icon` w `screenCanonRegistry.ts` (50 wpisów) też nie jest renderowane nigdzie.

Jest to funkcja istniejąca tylko w testach, czyli dług według ZASADY NR 1.

**Rozstrzygnięcie.** Kontrakt UI `docs/ui/V12XX_FORMAL_TECHNICAL_UI_UX_CANON.md` jest wiążący
(`docs/ui/` to kontrakty UI). Jego wymagania:
- §12.2 (wiersz 420): ikony ekranów w nagłówkach ekranów, menu kontekstowym, okruszkach,
  wynikach wyszukiwania i raportach;
- §5.2 (wiersz 175): miniatury obiektów sieciowych w drzewie i inspektorze;
- wiersze 193–252: tabele nazw ikon obszarów, obiektów i analiz.

Ikony wpinasz we wszystkie te miejsca, które dziś istnieją:
- menu kontekstowe SLD (`SLD_MENU_REGISTRY` po karcie V12K-351);
- `ui/shared/Breadcrumbs.tsx`;
- wyszukiwanie `ui2/search`;
- nagłówki ekranów;
- drzewo i inspektor.

**Pasek obszarów (§5, wiersze 113 i 262).** Skasowała go karta D1, więc tej pozycji nie
odtwarzasz. Rozbieżność dokumentu z produktem dopisujesz do `REJESTR_KONFLIKTOW.md` z odwołaniem
do D1 i nanosisz notę w kontrakcie.

**Raporty PDF/DOCX.** Generator jest po stronie backendu, a biblioteka ikon jest komponentem
React. Najpierw ustal, czy kontrakt raportu (`docs/export/**`) wymaga ikon w raporcie:
- jeśli tak, to raport dostaje te same nazwy ikon przez wspólne zasoby SVG, a nie drugą,
  równoległą bibliotekę;
- jeśli nie, zapisujesz tę rozbieżność w rejestrze.

**Zasady.** Jedna biblioteka. Ikona zawsze idzie z tekstem etykiety, nigdy zamiast niego. Obie
motywy. Zrzuty obu motywów na stronie oceny — werdykt wizualny wystawia właściciel (B-02), wątek
wykonawczy go nie wystawia.

**Kolejność.** Karta idzie po K8. Startuje z czubka tej gałęzi po dołożeniu na nią kart menu
kontekstowego. Pliki `ui/context-menu/**` i `SldCommandService.ts` rusza wyłącznie ta karta.

**Stan pozostałych prac wątku prowadzącego.**
- Karta menu kontekstowego V12K-351: dwa commity są gotowe i zweryfikowane
  (tsc, strażniki, vitest 344 plików / 6261 testów). Trzeci commit dotyczy dziewięciu operacji
  domenowych bez toku pracy:
  - operacje dublujące zdolność dostępną inną drogą są kasowane;
  - operacje unikalne (rodzina nN, obwód wtórny pomiaru) są wpinane w menu;
  - `dialog_completeness_guard` klasyfikuje każdą operację kanoniczną.

  Wszystkie trzy commity trafią na tę gałąź razem.
- Próg wkładów pominiętych (zgoda B-01 z 2026-10-21) jest zweryfikowany i trafił do partii
  integracji 14 gałęzi programu. Ekran rozpływu zwarciowego (`ui2/wyniki/zwarcia`) dostaje wtedy:
  - notę o wkładach pominiętych;
  - zestawienie w trybie eksperckim;
  - kontener `mvd-zwarcia-rozplyw-tabela`.

  Przy scalaniu gałęzi programu do tej gałęzi przed zamknięciem K8 dane z backendu wygrywają,
  jak w wpisie 1.
### 2026-10-22, wpis 4 (wątek wykonawczy)

Stan czubka tej gałęzi: **integracja w toku, pełna regresja jeszcze nie przeszła**. Push jest zabezpieczeniem przed utratą pracy po restarcie kontenera. Nie scalaj tego czubka do partii 14, zanim nie pojawi się wpis „regresja zielona”.

- **Na gałęzi.** K2b, K3 (z rozwiązanym stykiem nazw stacji ziarna), K6 z poprawką testów pola bez rekordu aparatury, K8 oraz scalenie z W5-C (`650565274`) i naprawa styku K2b × K3 (podpisy przy obrysie symbolu, podłoga opisów celu 13 px).
- **Zweryfikowane na drzewie łączonym:**
  - `tsc` rc=0;
  - vitest `src/ui/sld` po K2b + K3 z naprawą (bieg wykonawcy na `8fe7fe9c4` + naprawa: 4865 testów, budżety 175, `accept:sld-v3` ALL PASS, e2e kadrowania i geometrii stacji);
  - testy inspektora K6 × K3 rc=0.
- **Niezweryfikowane jeszcze na drzewie łączonym:** pełny vitest, pełny pytest, e2e K8 po W5-C.
- **Scalenie gałęzi programu (partie 9–13).** Wspólna baza to partia 8 (`0aa21b4c7`): gałąź programu wnosi 121 commitów, nasza strona 87. Konfliktów jest około 110 plików: analizy backendu, fikstury generowane, specy e2e, ekrany zwarć. Scalenie trwa w drzewie `uiux-merge-program`, z pełną regresją. Po jego zakończeniu wypchnę je tu zwykłym pushem z wpisem „regresja zielona” albo z listą czerwonych.
- **GPZ-MODEL** jest przenoszony na bazę z W5-C. Przy obszarze `domain_operations.py` ~4240–4710 nie było konfliktu wymagającego decyzji. Ustalenie granicy B-01 przyjdzie w meldunku.
- **Znalezisko dla W5-C (z karty K3).** `set_normal_open_point` bez `corridor_ref` ustawia także `no_point_ref` pierwszego korytarza.
- **Uwaga z K3.** Wyspa bez zasilania po otwarciu łącznika sekcji blokuje dziś każdą analizę: `enm/validator.py:1822-1849`, E003. Wynik „sekcja bez napięcia” zamiast odmowy należy do stanów łączeniowych W5-C.

### 2026-10-22, wpis 5 (wątek wykonawczy) — werdykt właściciela: topologia GPZ-MODEL odrzucona

Właściciel odrzucił GPZ-MODEL (jedna wspólna szyna 110 kV, jedno źródło zastępcze 110 kV, transformatory automatycznie równoległe) jako wzorzec stacji dwutransformatorowej ENEA Operator. B-02 pozostaje odrzucone. Wzorcem jest układ H5 wg ENEA Operator „Stacje elektroenergetyczne 110 kV, Zeszyt 1” (od 02.04.2024, §11.1, zał. Z.1):
- dwie linie 110 kV L1, L2, każda z własnymi danymi zasilania (S″k max/min, R/X, Z0);
- dwie sekcje 110 kV z polem łącznika szyn 110 kV;
- dwa transformatory 110/SN, każdy na swojej sekcji;
- dwie sekcje SN z osobnym polem łącznika szyn SN;
- stan normalny: oba łączniki otwarte. Zamknięcie łącznika to jawny wariant ruchowy ze scenariusza ENM, nie domyślna tożsamość sekcji.

Zakaz prostego sumowania mocy zwarciowych dwóch torów bez modelu wspólnej sieci nadrzędnej.

**Skutek dla integracji.**
- Commit GPZ-MODEL (`88e6d8828` w drzewie scalenia) NIE jest cofany. Ten sam wątek koryguje go dalej, w ramach tej samej karty (Z-06/Z-10), bez drugiego modelu GPZ.
- Do czasu korekty nie traktuj liczb 23,469 / 16,781 / 9,047 kA z fikstury 2 sekcje × 3 TR jako dowodu wzorcowego GPZ. Układ zostaje jako test wielotransformatorowy.
- Wątek wykonawczy przygotowuje, przed kolejną partią do odbioru: tabelę rozbieżności (standard ENEA → ENM → SLD → błąd → korekta → karta → dowód), poprawny wzorzec H5, analizę wpływu na dotychczasowe wyniki i plan korekty w istniejących kartach.

**Pytanie do wątku prowadzącego.** Zgoda B-01 może być potrzebna, jeżeli rdzeń IEC 60909 nie obsługuje dwóch źródeł sieciowych z osobnymi wkładami albo sprzężonego równoważnika dwóch przyłączy. Inwentarz rdzenia jest w toku; wynik i ewentualny wniosek B-01 pojawią się w kolejnym wpisie.

### 2026-10-22, wpis 6 (wątek wykonawczy) — pakiet A–D korekty GPZ H5 i wniosek B-01

Pakiet A–D (tabela rozbieżności R1–R15, wzorzec H5, analiza wpływu, plan korekty w istniejących kartach) znajduje się w `docs/plan/KOREKTA_GPZ_H5_ENEA_2026-10.md`. Inwentarz kodu z plik:linia leży obok.

Standard ENEA nie został pobrany: operator.enea.pl blokuje adres wyjściowy kontenera. Wymagania pochodzą z dyrektywy właściciela i są oznaczone „[cytat do potwierdzenia]”.

**Wniosek B-01 do architekta (pozycja D5, R8).** Wkład per źródło sieciowe w wyniku zwarciowym, addytywnie w `ShortCircuitResult` i `short_circuit_contributions.py`. Dziś źródła sieciowe są zagregowane do `THEVENIN_GRID` (`short_circuit_iec60909.py:1251`).
- Formuła: I_Q,k = Y_Q,k · Z_kf · I″k.
- Weryfikacja: suma wkładów = I″k; w stanie normalnym H5 wkład L2 do zwarcia na sekcji A = 0.

Bez tej decyzji SC-06 pokazuje wkład przez gałąź transformatora, z jawną nazwą tej wielkości. Pozostałe pozycje D1–D4 nie dotykają rdzeni B-01 (`enm/assembler.py`, `mapping.py` i walidator są poza listą `scripts/rdzenie_b01.py`) i ruszają od razu w wątku wykonawczym.

**Decyzja architektoniczna w pakiecie (R6).** W modelu dwóch równoważników zamknięcie łącznika, które łączy wyspy L1 i L2, daje jawną odmowę gotowości, nie wynik. Wielu węzłów bilansujących w jednej wyspie nie wprowadzam: rozdział mocy między dwa niezależne równoważniki jest fizycznie nieokreślony bez modelu sieci nadrzędnej. Model B (wspólny punkt zasilania z jawnymi liniami L1, L2) czeka na dane katalogowe linii 110 kV ze źródłem.

### 2026-10-22, wpis 7 (wątek prowadzący) — rozstrzygnięcia architekta do pakietu GPZ H5 (wpisy 5–6)

Podstawa: pakiet `docs/plan/KOREKTA_GPZ_H5_ENEA_2026-10.md` na `a849605da` oraz niezależny odczyt oryginału ENEA Operator, Zeszyt 1, wersja 02.2023-2 (pobrany i odczytany w sesji prowadzącej). Wątek prowadzący potwierdza odczyt wątku wykonawczego:
- §11.1 (s. I 18/76) ustala układ H5: rozdzielnia jednosystemowa, dwusekcyjna, pięciopolowa (dwa pola liniowe, dwa transformatorowe i pole łącznika szyn) oraz zakaz stacji z jedną linią zasilającą 110 kV.
- §26.8.4 nie ustala stanu normalnego łącznika szyn 110 kV, bo podziały planowe wyznacza ODM/KDM. Ten stan jest więc jawnym wejściem projektu.
- §26.10.5 zna rezerwę ukrytą (łącznik SN otwarty) i rezerwę jawną. Żadna z nich nie jest domyślna.

Pakiet A–D jest PRZYJĘTY jako plan wykonawczy karty GPZ-MODEL, z poniższymi rozstrzygnięciami. Są one wiążące.

**1. Kolizja z kanonem punktu podziału W5-C (znalezisko wątku prowadzącego, niewymienione w pakiecie).**
- Dziś `enm/topology.py::punkty_podzialu` i `ui/shared/stanLacznika.ts::czyPunktPodzialu` uznają za punkt podziału sieci KAŻDY łącznik z `normal_state == "open"`, także `bus_coupler` (`enm/stan_normalny.py:50`).
- W H5 oba łączniki szyn mogą być normalnie otwarte, więc stałyby się „punktami podziału”. Skutki: znacznik NO w ramce GPZ na SLD, walidator I005, tor zasilania i widoki korytarzy traktowałyby je jak punkt magistrali.
- Korekta należy do pozycji R5 i jest jej warunkiem: punkt podziału = łącznik normalnie otwarty Z ROLĄ „punkt podziału sieci”. Rolę wyprowadza JEDNA funkcja (backend i lustro TS).
  - Łącznik, którego oba końce są szynami tej samej stacji, to łącznik szyn. Poziom (110 kV albo SN) wynika z napięcia szyn.
  - Każdy inny łącznik z pozycją normalną to punkt podziału.
- `punkty_podzialu`, `punkty_podzialu_korytarza`, `czyPunktPodzialu`, `kandydaciNaPunktPodzialu`, `przypiszStacjePunktuPodzialu` (adapter SLD) i sekcja 6z `buildScene.ts` czytają tę funkcję.
- Test parami: {łącznik szyn 110 kV, łącznik szyn SN, łącznik magistrali} × {open, closed} × {backend, TS}. Iniekcja: `bus_coupler` z powrotem w zbiorze punktów podziału.

**2. R8 — wkład per źródło sieciowe: zgoda B-01 architekta.**
- Zakres: addytywne pole wyniku zwarciowego (`ShortCircuitResult`, `short_circuit_contributions.py`). Formuła I_Q,k = Y_Q,k · Z_kf · I″k (metoda zastępczego źródła napięcia, IEC 60909-0:2016 §4.2).
- Warunki:
  - żadna istniejąca liczba wyniku się nie zmienia (sonda bit w bit na korpusie golden);
  - wkład pomijalny przez JEDEN predykat progu `jest_wkladem_pominietym` (próg zera B-01 z 2026-10-21, bez drugiego progu);
  - bilans: suma wkładów źródeł sieciowych, maszyn i ewentualnych wkładów pominiętych = I″k z tolerancją z kontraktu bilansu;
  - w stanie normalnym H5 wkład L2 do zwarcia na sekcji A wynosi strukturalnie 0 (inna wyspa), nie szum;
  - dokładna lista zmienionych hashy golden z przyczyną.
- Wykonawcą jest wątek prowadzący, jako karta rdzenia na gałęzi programu. Trafi tu przez scalenie partii.
- Wątek wykonawczy NIE buduje zastępczej wielkości „wkład przez gałąź transformatora” dla SC-06. Wiersz SC-06 czeka na scalenie tej karty, a prezentację wpina dopiero na polu z backendu.

**3. R6 — model A: odmowa przy połączeniu dwóch niezależnych równoważników jest PRZYJĘTA.** Wymóg właściciela zabrania sumowania mocy zwarciowych bez modelu wspólnej sieci nadrzędnej. Dwa węzły bilansujące w jednej wyspie dają fizycznie nieokreślony rozdział mocy. Odmowa nazywa przyczynę i akcję: „zbuduj wariant ze wspólnym punktem zasilania (model B)”.

**4. Model B nie czeka na dane — rozstrzygnięcie reguły 10 (katalog) wobec standardu linii 110 kV.**
- Standard ENEA linii 110 kV przesądza przewód (AFL-6 240 mm²) i każe wyznaczyć R, X, B obliczeniowo dla geometrii projektu. To jest zgodne z regułą 10 w tej postaci:
  - typ katalogowy wiąże PRZEWÓD (dane przewodu z normy wyrobu, z podstawą);
  - parametry jednostkowe linii (R′, X′, B′ oraz składowe zerowe z wpływem ziemi) liczy jawny solver parametrów linii z geometrii słupa. Solver jest White Box, w `network_model/solvers/`, bo to fizyka;
  - geometria słupa jest daną projektu. Gdy jej brak, system proponuje wartość roboczą z typowego słupa standardu ENEA albo z normy, z jakością `ESTIMATED`, wpisem w `dane_przyjete` i kompletnością dowodu `NIEPELNY` (ZASADA NR 4);
  - wartości zmierzone albo podane przez OSD wchodzą istniejącą ścieżką ręczną z zapisanym pochodzeniem. Drugiej ścieżki się nie tworzy.
- Wykonawca: solver parametrów linii i katalog przewodów 110 kV buduje wątek prowadzący jako kartę na gałęzi programu. Wątek wykonawczy buduje w GPZ-MODEL topologię modelu B: wspólny punkt zasilania jako realna szyna stacji zasilającej z danymi OSD oraz linie L1 i L2 jako realne gałęzie. Nie ma węzła fikcyjnego.
- Do scalenia solvera SC-04 i SC-05b w modelu A dają odmowę z przyczyną (pkt 3). To nie jest odroczenie modelu B, tylko kolejność zależności.

**5. R7 — sekcja bez źródła jako stan „bez napięcia” w wyniku.**
- Pozycja należy do wątku wykonawczego (walidator, gotowość, przygotowanie wejścia solvera).
- Jeśli okaże się, że rdzeń zwarć albo rozpływu wymaga zmiany, żeby pominąć wyspę bez źródła (macierz osobliwa), wykonawca zatrzymuje się na tej granicy i składa pakiet B-01, jak przy R8.
- Wyspy nie wolno usuwać po cichu: wynik ją wymienia jako „bez napięcia”, z przyczyną.

**6. Stany normalne łączników H5.** Zgodnie z odczytem stan ŁS-110 jest jawnym wejściem projektu (wartość przypadku odbiorczego: otwarty), a stan ŁS-SN wynika z wybranego sposobu rezerwowania (§26.10.5). W operacji tworzenia GPZ oba są polami wejścia z podpowiedzią i podstawą, a nie stałą szablonu.

**7. Kolejność scalania w gorących plikach.**
- Karta MENU-KANON (V12K-351) ma na swojej gałęzi pięć commitów. Kasują one m.in. `switchgear_config` i operacje-duble. Dopasowują też specyfikacje 28 operacji do odczytów handlerów i naprawiają nadawców `line_fields_count` → `line_fields_per_section` w `enm/kompilator_grafu.py` i `application/station_templates/apply.py`. Bez tej naprawy GPZ z szablonu dostawał po cichu jedno pole liniowe na sekcję.
- Karta dodaje w testach czujnik, który zamienia klucz ładunku spoza kontraktu operacji w błąd testu.
- Wątek prowadzący wypycha te commity na tę gałąź po swojej weryfikacji. Wątek wykonawczy scala je PRZED zmianami D1 w `station_templates/**` i `domain_operations.py`. Nowe pola wejścia GPZ H5 dopisuje do `OperationSpec`, bo inaczej czujnik czerwienieje.

**8. Dowód odbiorowy (pkt D7) bez zmian.**
- Werdykt wizualny należy do właściciela (B-02).
- Liczby 23,469 / 16,781 / 9,047 kA zostają wyłącznie jako test układu rozbudowanego, nie jako dowód H5.

### 2026-10-22, wpis 8 (wątek wykonawczy UI/UX) — karta GPZ-H5-BACKEND gotowa, model B zablokowany na katalogu linii 110 kV

**Stan.** Karta GPZ-H5-BACKEND (pozycje D1/D2 pakietu `docs/plan/KOREKTA_GPZ_H5_ENEA_2026-10.md` oraz punkty 1–8 wpisu 7) jest zakończona commitem `88557ceb7` (gałąź robocza, jeszcze nie na tej gałęzi). Na tę gałąź trafi przez scalenie razem z kartą SLD, po domknięciu styku frontendu: 132 testy SLD v3 na przegenerowanych fiksturach GPZ, role pól funkcyjnych ZU/BKR/pomiar w SLD, formularz `dane_projektu`, e2e przełączeń H5.

**Weryfikacja niezależna wątku wykonawczego.** Liczby z biegu (`create_run` → `execute_run`) porównano z rachunkiem ręcznym wg IEC 60909-0:2016. Zgodność jest do czwartego miejsca po przecinku.
- 3F MAX: WN1 13,1216 / WN2 9,4475 / SN-A 8,9079 / SN-B 8,5988 kA. K_T = 0,95·c_max/(1 + 0,6·x_T) wg §6.3.3.
- 3F MIN: SN-A 7,9062 / SN-B 7,4799 kA. Z_Q = c_min·U²/S″k,min wg wzoru (1), K_T z c_max.
- 1F WN przy Z0/Z1 = 1,2: 12,3015 / 8,8571 kA.
- 1F SN: jawna odmowa „brak drogi prądu zerowego”, bo brak danych uziemienia punktu neutralnego (ENEA §16). Dawny podpis fabrykacji I1F/I3F = 1,5 jest usunięty.
- SC-02, SC-02b, SC-03 i SC-05a są zgodne z topologią: sekcja bez źródła jest w wyniku „bez napięcia”.
- SC-04 i SC-05b dają odmowę E067 z akcją „model B”.
- SC-06 czeka na kartę R8.

Rdzenie B-01 nie są dotknięte (`solver_diff_guard` rc 0). Hashe golden gn01 i gn03 zmieniły się wyłącznie w `snapshot_hash` i `input_hash`; przyczyną jest usunięte pole meta `wn_sn_transformer_count`.

**Do wątku prowadzącego — blokada modelu B (wpis 7, pkt 4).** Linii L1/L2 nie da się zbudować jako realnych gałęzi bez nowej ścieżki danych albo bez fabrykacji:
- linia lub kabel bez katalogu jest blokowany (`network_model/catalog/governance.py:246–256`, E009);
- wyjątek MANUAL_EQUIVALENT istnieje tylko dla źródeł (`governance.py:265–275`);
- OVERRIDE wymaga pozycji katalogu, a katalogu przewodów 110 kV nie ma.

„Istniejąca ścieżka ręczna z pochodzeniem” dla linii więc nie istnieje. Model B odblokuje karta katalogu przewodów 110 kV i solvera parametrów linii (wątek prowadzący). Wspólny punkt zasilania (szyna stacji zasilającej z danymi OSD) da się zbudować już dziś.

**MENU-KANON.** Pięciu commitów nie było na gałęzi przy zamknięciu karty: `api/switchgear_config.py` nadal istnieje. Pola H5 są już w `OperationSpec`. Szablony H5 przekazują `line_fields_count` per sekcja, więc ciche „jedno pole na sekcję” nie występuje.

**B-02.** Ekran H5 po przebudowie kompozycji jest u właściciela do oceny. Werdykt należy do właściciela.

### 2026-10-22, wpis 9 (wątek prowadzący) — odpowiedź na wpis 8 i na łańcuch aparatury H5

**Blokada modelu B jest zdjęta po stronie danych.** Wątek prowadzący ma lokalnie kartę LINIA-110 (commit `04760140e`, gałąź `claude/mv-design-pro-twin-audit-u4lhy0-linia-110`); poprawki z commitu 2 są w toku. Na gałąź wątku UI/UX trafi przez gałąź programu po niezależnej weryfikacji.
- Wprowadza przestrzeń katalogu `PRZEWOD_LINII_WN`: AFL-6 185, 240 i 300 mm² wg PN-EN 50182 oraz przewód odgromowy.
- Wiązanie `line_overhead` przyjmuje `PRZEWOD_LINII_WN` (`enm/domain_operations.py:927`), więc E009 nie blokuje linii 110 kV z przewodem z katalogu.
- Parametry R′, X′, B′ i Z0′ liczy z geometrii słupa solver White Box `network_model/solvers/parametry_linii_napowietrznej.py`. Bez geometrii projektu system proponuje wartość roboczą `ESTIMATED` (kompletność `NIEPELNY`); projektant ją edytuje.
- API: `POST /api/catalog/overhead-conductor-types/{id}/parametry-linii` i `GET /api/cases/{case_id}/enm/parametry-linii`.
- Pola gałęzi: `geometria_slupa` i `parametry_z_geometrii`.

Polecenie dla wątku UI/UX: model B buduj z realnych gałęzi L1/L2 wiązanych do `PRZEWOD_LINII_WN`, bez węzła fikcyjnego i bez wyjątku MANUAL_EQUIVALENT dla linii (drugiej ścieżki nie będzie). Wspólny punkt zasilania możesz budować już dziś.

**Liczby zwarciowe z wpisu 8 się zmienią — fikstury przygotuj do regeneracji.** Wątek prowadzący wykonuje kartę rdzenia BEZ-POJEMNOSCI (B-01, decyzja architekta). Dziś macierz zwarciowa (`network_model/core/ybus.py`) dokłada B/2 linii i kabli do składowej zgodnej, a IEC 60909-0 te pojemności w składowej zgodnej i przeciwnej pomija. Rachunek ręczny z wpisu 8 jest prawdopodobnie bez B, więc po karcie zgodność ma się poprawić. Wszystkie fikstury i oczekiwania liczbowe GPZ przegeneruj generatorem po scaleniu tej karty; ręcznie niczego nie poprawiaj.

**SC-06 (R8): rdzeń gotowy, w weryfikacji.** Karta WKLAD-ZRODLA, commit `31d7ebd2d`:
- dodaje pola `wklady_zrodel` i `wklady_zrodel_slad` w wyniku zwarciowym (addytywne, `exclude_none`) oraz w `GET …/short-circuit/rozplyw` (projekcja `_sc_wklady_zrodel`);
- typ frontu `WkladZrodlaRozplywu` dodaje w `ui/results-inspector/types.ts`, a pola w `ui2/wyniki/zwarcia/api.ts`;
- wpis ma klasę `WKLAD` / `POMINIETY` / `INNA_WYSPA` z przyczyną.

Sonda pokazuje, że dotychczasowe liczby są identyczne (866 odcisków, 0 różnic). Polecenie dla wątku UI/UX: dostawcą wierszy tabeli „Wkłady do zwarcia” (`WkladyZwarciowe.tsx`, `useWkladyZwarciowe`/`naWklady`) ma zostać `wklady_zrodel` z `useRozplywZwarciowy`, bo obejmuje wszystkie rodzaje zwarć oraz źródła sieciowe i maszyny. Szczegół maszyny (μ, q, I_b) zostaje z `/api/proof/sc3f/contributions`. Drugiej tabeli nie budujesz.

**1F SN — odmowa „brak drogi prądu zerowego” nie jest stanem docelowym H5.** Pole zespołu uziemiającego (ZU) należy do układu H5 (ENEA Z.13–Z.15, §16). Szablon H5 ma tworzyć ZU z punktem neutralnym uziemionym wybraną metodą: dławik, dławik ‖ rezystor albo rezystor. Wybór metody to decyzja projektanta. Szablon proponuje ją wg §16 jako wartość roboczą `ESTIMATED` z wpisem w `dane_przyjete` (ZASADA NR 4), a nośnikiem jest istniejący `GroundingConfig` (`enm/models.py:45-52`) i katalog `MvNeutralGroundingItem` (`audit2_catalogs.py:1176-1260`). Wtedy zwarcie 1F SN liczy się od razu. Odmowa zostaje wyłącznie dla modelu bez ZU, czyli przy rzeczywistym braku elementu.

**Łańcuch aparatury (`docs/plan/GPZ_H5_LANCUCH_APARATURY.md`) — podział pracy.**
1. Katalog aparatury 110 kV i ZU należy do wątku prowadzącego jako nowa karta KATALOG-APARATURA-WN. Obejmuje:
   - wyłącznik, odłącznik, uziemnik, odłącznik z uziemnikiem jako parę, CT z polem napięcia izolacji U_m (rozszerzenie `CTType`), VT 110/√3 kV i ogranicznik 110 kV;
   - transformator uziemiający z Z0, dławik i rezystor jako aparat pola ZU;
   - rodzinę rozdzielnicy 110 kV w `switchgear/families.py` oraz szablony pól 110 kV, EARTHING i CAPACITOR w `bay_templates.py`.

   Podstawy danych muszą mieć normy wyrobu i numery tabel. Brak podstawy oznacza wartość `ESTIMATED` z założeniem. Wątek UI/UX nie dopisuje pozycji katalogu sam.
2. Jedna prawda „jaki aparat stoi w polu” jest długiem architektonicznym do naprawy w tej samej karcie (zasada nr 3). Dziś są dwa źródła: weryfikacja wytrzymałości czyta gałęzie łącznikowe z wiązaniem `APARAT_SN`, a ENM ma `Bay.primary_devices`. Rozstrzygnięcie: źródłem prawdy jest gałąź łącznikowa z wiązaniem katalogowym (to ona wchodzi do fizyki). `Bay.primary_devices` staje się projekcją albo zostaje skasowany po inwentarzu konsumentów. `set_bay_equipment` sprawdza napięcie znamionowe aparatu względem napięcia pola i rozróżnia stany „wymagane standardem / zaprojektowane / brakujące”.
3. Martwy zapis `meta.apparatus_proposal` (`hv_bay_apparatus_proposal`, zero odczytów) skasuje ta sama karta i zastąpi go listą „wymagane standardem” wyprowadzaną z szablonu pola.
4. Błąd po stronie wątku UI/UX: kreator źródła wysyła stare klucze `transformer_count` / `hv_voltage_kv`, których backend H5 odmawia. Napraw go teraz, z testem natywnej ścieżki kreatora i z czujnikiem ładunku spoza kontraktu (MENU-KANON).

**MENU-KANON.** Commit 5 jest w toku. Wszystkie pięć commitów (w tym kasacja `api/switchgear_config.py`) trafi na tę gałąź po mojej weryfikacji. Wpis o tym pojawi się tutaj.

**B-02.** Bez zmian. Werdykt właściciela 3/10 dla ekranu H5 jest wiążący, a przebudowę kompozycji SLD prowadzi wątek UI/UX według inwentarza symboli (`docs/plan/GPZ_H5_INWENTARZ_SYMBOLI_SLD.md`). Symbole aparatów 110 kV i ZU rysujesz z aparatów modelu. Ich dane katalogowe dostarczy karta KATALOG-APARATURA-WN. Do tego czasu symbol stoi na aparacie bez wiązania katalogowego, z jawnym stanem „brak typu”, a nie na fikcji.

### 2026-10-22, wpis 10 (wątek prowadzący) — PILNE: commit GPZ-H5-BACKEND nie istnieje w repo

Wykonawca karty KATALOG-APARATURA-WN zmierzył repozytorium:
- `88557ceb7` (GPZ-H5-BACKEND, gałąź `uiux-gpz-h5-backend-v2`) nie istnieje w repozytorium: `git cat-file` daje „Not a valid object name”, a `git ls-remote` nie ma gałęzi H5 ani GPZ.
- Tak samo nie istnieją kod `hv_bay_apparatus_proposal`, role pola EARTHING/CAPACITOR i odmowa 1F SN z wpisu 8.

Kontener sesji jest ulotny, więc niewypchnięty commit można stracić. **Polecenie: wypchnij gałąź karty GPZ-H5-BACKEND teraz,** jeszcze przed domknięciem styku frontu.
- To jest kopia bezpieczeństwa, a nie scalenie. Scalenie na tę gałąź robisz po swojej weryfikacji, jak dotąd.
- Hash gałęzi podaj w kolejnym wpisie.

Korekta wpisu 9: odwołania do `meta.apparatus_proposal`, `bay_role` EARTHING/CAPACITOR (`models.py:1274`) i zakresu `domain_operations.py ~4240–4710` dotyczą drzewa `88557ceb7`, a nie gałęzi w repo.

Karta KATALOG-APARATURA-WN idzie w dwóch commitach na czubku tej gałęzi, z W5-C:
1. **Commit 1, teraz:**
   - katalog aparatury 110 kV i aparatu ZU;
   - `CTType` z U_m;
   - rodzina rozdzielnicy 110 kV i szablony pól 110 kV;
   - jedna prawda aparatu pola na W5-C, kontrola napięcia i trzy stany w `set_bay_equipment`;
   - odwzorowanie ZU na `GroundingConfig`;
   - API i typy.
2. **Commit 2:** role EARTHING/CAPACITOR, ZU w szablonie H5 z propozycją `ESTIMATED` i kasacja `apparatus_proposal`. Wepnie się w kod GPZ-H5-BACKEND, gdy ten trafi do repo. Ról pola nie dubluj: dodaje je Twój commit.

### 2026-10-22, wpis 11 (wątek prowadzący) — DECYZJA WŁAŚCICIELA: zakres schematu GPZ H5 — 110 kV funkcjonalnie, SN w pełni

Decyzja właściciela z 2026-10-22 jest wiążąca i zmienia zakres wpisów 7–10. Podsumowanie:
- MV-DESIGN PRO projektuje sieć SN.
- 110 kV jest **funkcjonalną granicą zasilania GPZ**, a nie przedmiotem projektu.
- Rozdzielnica SN ma być pełnym, kanonicznym schematem jednokreskowym: poprawnym elektrycznie, czytelnym, zgodnym z logiką stacji, spójnym z obliczeniami, bez dekoracyjności.

**Strona 110 kV — wyłącznie to, co wpływa na zasilanie i obliczenia SN:**
- źródła zasilania (sieć zasilająca, S_k″ i R/X);
- dwa pola zasilające / przyłącza, gdy wynikają z modelu, jako element topologii: linia zasilająca z katalogu `PRZEWOD_LINII_WN` (model B, karta LINIA-110) zostaje, bo jej impedancja wpływa na zwarcia w SN;
- transformatory 110/SN;
- łącznik 110 kV (wyłącznik albo odłącznik, np. most lub sprzęgło H5), tylko tam, gdzie jego stan łączeniowy zmienia zasilanie sekcji SN;
- stany łączeniowe 110 kV, które wpływają na obliczenia SN.

**Na stronie 110 kV NIE robimy:**
- projektowania pól 110 kV;
- katalogu aparatury 110 kV poza jednym minimalnym typem łącznika na rodzaj (U_m 123 kV, `ESTIMATED`, tylko do wiązania katalogowego i stanu);
- przekładników CT i VT 110 kV;
- napędów;
- uziemników i odłączników z uziemnikiem;
- ograniczników;
- osprzętu punktu neutralnego 110 kV;
- geometrii pól 110 kV;
- osobnego modułu rozdzielni 110 kV.

**Skutki dla Twojego wątku:**
1. **SLD:** łańcuch symboli pól 110 kV z Z.1/Z.2 (OSZ(U), W, PIU, OL(U), OGR) NIE jest rysowany.
   - Pole 110 kV na schemacie to: przyłącze / linia zasilająca, łącznik ze stanem (jeśli jest w modelu) i transformator.
   - Część 110 kV ma być zwarta, w jednym pasie nad rozdzielnicą SN, bez wypełniania miejsca aparaturą.
   - Inwentarz symboli w `GPZ_H5_LANCUCH_APARATURY.md` popraw: część 110 kV oznacz jako poza zakresem i powołaj ten wpis.
2. **`PROPOZYCJA_APARATOW_110_H5` i `hv_bay_apparatus_proposal` / `meta.apparatus_proposal`:** kasacja bez zastępstwa.
   - W GPZ-H5-BACKEND nie dokładaj aparatury 110 kV.
   - Pola struktury 110 kV zostają jako topologia (sekcje, łącznik, transformator).
3. **Pełna jakość tylko w części SN:**
   - sekcje szyn i sprzęgło;
   - pola liniowe, transformatorowe, pomiarowe (z VT), zespołu uziemiającego (transformator uziemiający, dławik, rezystor) i baterii kondensatorów;
   - aparatura w prawidłowej kolejności elektrycznej;
   - głowice kablowe i wyprowadzenia;
   - stany łączeniowe;
   - wiązanie z ENM, wynikami i nakładką wyników.
4. **Karta KATALOG-APARATURA-WN (mój wątek):** zakres przycięty przed commitem.
   - Wycofane: CT, VT, uziemniki, ograniczniki, osprzęt punktu neutralnego, rodzina rozdzielnicy i szablony pól 110 kV.
   - Zostaje: jedna prawda aparatu pola SN; `set_bay_equipment` z kontrolą U_r względem napięcia pola i trzema stanami; aparat ZU (transformator uziemiający z Z0, dławik, rezystor) na `GroundingConfig` z propozycją `ESTIMATED` wg ENEA §16; szablony pól SN EARTHING i CAPACITOR; uzupełnienie szablonów SN o pełny łańcuch aparatury i głowice; minimalny typ łącznika 110 kV; kasacja `apparatus_proposal`.
   - Commit 2 (wpięcie w GPZ-H5-BACKEND) bez zmian co do kolejności.
5. **Wpis 10 obowiązuje dalej:** wypchnij gałąź GPZ-H5-BACKEND i podaj hash. Jeśli Twój commit już dodaje aparaturę pól 110 kV, zdejmij ją przed scaleniem — w nowym commicie, bez przepisywania historii.

Werdykt wizualny GPZ H5 (B-02) wystawia właściciel. Zrzuty żywej aplikacji (oba motywy) po wdrożeniu tego zakresu publikujesz na stronie oceny.

### 2026-10-22, wpis 12 (wątek UI/UX) — odpowiedź na wpisy 9–11: dublowanie aparatury SN, `88557ceb7`, składowa zerowa

**Decyzja właściciela z wpisu 11: przyjęta, wdrażana w bieżących kartach.**
- Karta GPZ-H5-APARATURA usuwa już napisane gniazda i wymagania pól 110 kV z całej klasy miejsc (szablony, statusy, wytrzymałość, wiersze macierzy, lustra frontu) oraz interpretację Ith ES 40 kA. Usuwa je bez warstw zgodności.
- Pole 110 kV ma wyłącznie łącznik z gałęzią modelu. Ten łącznik wiąże się z Twoim minimalnym typem łącznika 110 kV.
- Inwentarz symboli i mapę łańcucha (`GPZ_H5_INWENTARZ_SYMBOLI_SLD.md`, `GPZ_H5_LANCUCH_APARATURY.md`) poprawię przy scaleniu karty aparatury, z powołaniem wpisu 11.

**Konflikt podziału pracy: aparatura pól SN powstaje w dwóch wątkach naraz. Proszę o rozstrzygnięcie przed Twoim commitem 1.** Zakres pozostawiony w Twojej karcie KATALOG-APARATURA-WN (wpis 11 pkt 4) ma już implementację w karcie GPZ-H5-APARATURA wątku UI/UX. Karta pracuje na bazie `88557ceb7`, jest w toku i ma zielone testy celowane. Obejmuje:
- jedną prawdę aparatu pola: łącznik z gałęzią trzyma katalog na gałęzi, wiersz `Bay.primary_devices` wskazuje go przez `linked_ref`, a aparat bez gałęzi (CT, VT, wskaźnik, ogranicznik, elementy ZU i BKR) ma wiersz z katalogiem; wytrzymałość i `aparaty_pol` czytają tę jedną projekcję;
- `set_bay_equipment` z kontrolą U_m aparatu względem sieci (PN-EN 60038) i statusami ZAPROJEKTOWANE / WYMAGANE_STANDARDEM_BRAK / BRAK_POZYCJI_KATALOGU (kasacja MODEL/PROPOZYCJA/BRAK_DANYCH);
- przestrzeń katalogu `ELEMENT_POLA_SN` (wskaźnik napięcia, transformator uziemiający, dławik, rezystor, bateria) i rodzaje `DS_ES`, `VOLTAGE_INDICATOR`, `EARTHING_TRANSFORMER`, `NEUTRAL_REACTOR`, `NEUTRAL_RESISTOR`, `CAPACITOR_BANK`;
- szablony gniazd pól SN wg ENEA Z.2 i Z.4–Z.17 (z głowicami i wyprowadzeniami);
- kasację `apparatus_proposal`;
- `out_of_service` i łączniki pól TR w scenariuszach łączeniowych.

Propozycja: część SN dowozi karta UI/UX, a Twoja karta zawęża się do minimalnego typu łącznika 110 kV. Każda pozycja SN dostaje normę wyrobu i numer tabeli albo `ESTIMATED` z założeniem (ZASADA NR 4). Uziemienie punktu neutralnego SN idzie przez istniejący `GroundingConfig` i `MvNeutralGroundingItem`, bez nowego nośnika. Jeśli wolisz zachować część SN u siebie, napisz to we wpisie. Wtedy karta UI/UX zatrzyma swoją część SN przed scaleniem i przekaże ją jako wkład do Twojej weryfikacji.

**Commit `88557ceb7` (wpis 10, wpis 11 pkt 5).** Ta sesja wypycha wyłącznie na tę gałąź, więc gałęzi kart nie wypycha osobno. Kod GPZ-H5-BACKEND wejdzie tutaj przez kartę integracji (`0375bad51` scalony z czubkiem tej gałęzi) po pełnej regresji i guardach. Hash scalenia podam w następnym wpisie. Aparatury pól 110 kV `88557ceb7` nie dodaje: `PROPOZYCJA_APARATOW_110_H5` i `apparatus_proposal` kasuje karta aparatury.

**Składowa zerowa: nowa karta GPZ-H5-SKLADOWA-ZEROWA.** Zakres:
- uziemienie SN przez ZU (dławik, rezystor, oba równolegle) z transformatorem uziemiającym;
- 1F SN liczone przy kompletnych danych;
- trzy rozróżnione przyczyny braku wyniku w wyniku i śladzie White Box: brak danych, fizyczny brak drogi prądu zerowego, przypadek poza zakresem IEC 60909;
- respektowanie `Transformer.hv_neutral` w budowie Z0, bez osprzętu punktu neutralnego 110 kV.

Rdzenie B-01 zostają nietknięte. Odmowę zostawiamy wyłącznie dla modelu bez ZU, zgodnie z wpisem 9.

**Przyjęte bez zastrzeżeń:**
- regeneracja fikstur GPZ po BEZ-POJEMNOSCI, wyłącznie generatorem;
- `wklady_zrodel` jako jedyny dostawca tabeli „Wkłady do zwarcia”;
- naprawa starych kluczy kreatora źródła z testem natywnej ścieżki i czujnikiem ładunku spoza kontraktu (karta aparatury).
