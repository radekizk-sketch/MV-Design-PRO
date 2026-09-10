# KARTA B-02 / W3-E — Przebudowa dwóch powierzchni analitycznych (2026-09-10)

**Status:** KANONICZNY, ŻYWY (karta bramki B-02 właściciela; podlega misji
`MISJA_DOMKNIECIA_PRODUKTU_2026-09.md`, mapie `MAPA_DOMKNIECIA_PRODUKTU_2026-09.md` — domena 10 #20,
domena 5 #8, domena 1 #17 — oraz karcie `KARTA_W3_KONWERGENCJA_FIZYKI_2026-09.md` §0 poz. 4/5/6/12).
Baza: gałąź `claude/mv-design-pro-twin-audit-u4lhy0` po fali 2 W3 (`ba401660`, szczyt pushu `989d9d74`).

**Źródło:** dyrektywa właściciela z 2026-09-10 „MV-DESIGN-PRO — B-02 / W3-E — PRZEBUDOWA DWÓCH POWIERZCHNI
ANALITYCZNYCH — V12.6 — KOREKTA WARTOŚCI INŻYNIERSKIEJ I CZYTELNOŚCI" — pełna treść w Załączniku A
(verbatim). Inwentarz obu powierzchni zmierzony na drzewie `9b5212d7` (= `ba401660` po przepisaniu sygnatur) (badanie tylko-odczyt: agent Explore +
odczyt solvera V12.6, agregatu werdyktu, widoków jakości, warsztatu wyników) — streszczony w §1.

**Zasada nadrzędna karty:** pierwszy ekran odpowiada na pytanie „co i na jakiej podstawie policzę?",
drugi „co z obliczenia wynika i na jakiej podstawie tak oceniono?". Oba przestają być katalogiem funkcji
i tworzą jeden ciąg pracy inżynierskiej: PRZEDMIOT → STAN MODELU → DANE → KRYTERIUM → OBLICZENIE →
WYNIK → OCENA WYMAGANIA → WNIOSEK PROJEKTOWY.

---

## §0 Rozstrzygnięcia architekta (wiążące)

| # | Pytanie | Decyzja | Uzasadnienie |
|---|---|---|---|
| 1 | Skąd katalog analiz Ekranu A? | **Z backendu.** Nowa przestrzeń katalogu `GET /api/catalog/v126/analysis-catalog` (`application/analyses/v126_katalog.py`): per rodzaj — grupa inżynierska, nazwa, pytanie inżynierskie, badany zakres, główne wielkości, podstawa oceny (tylko tam, gdzie solver FROZEN ją realnie stosuje), dane wejściowe z rozdziałem źródeł (z modelu / od użytkownika / domyślne solvera). Front NIE trzyma własnego katalogu (`PREZENTACJA` traci pola `pytanie`/`kryterium`/`norma` — zostaje wyłącznie mapowanie ścieżek ładunku wyniku na prezentację, czyli sprawa warstwy prezentacji). `analysis-types` zostaje jako lista kodów (parytet CI). | Prompt §3.1/§9: „zachowaj backend-driven analysis catalog", „nie twórz lokalnego katalogu analiz w UI". |
| 2 | Grupy kart | **Tylko grupy uzasadnione katalogiem backendu**: `jakosc_energii_i_stabilnosc` (harmoniczne, SSCI), `uziemienia_i_izolacja` (uziom stacji, dobór punktu neutralnego, detekcja doziemień, koordynacja izolacji), `aparatura_i_stany_przejsciowe` (TRV, rozruch silników), `niezawodnosc_i_niepewnosc` (wskaźniki niezawodności, niepewność). Grupa = pole rodzaju w katalogu backendu, front tylko grupuje po nim. Rodzaje wycofane (`benchmark_validation`, `voltage_stability`, `hosting_capacity`, `opf_loss_lcc`) w katalogu mają `prezentowany: false` + powód — rejestr FE `nieprezentowane.ts` ZOSTAJE jako druga strona pary (test parytetu CI). | Prompt §3.1: grupowanie wg realnego znaczenia inżynierskiego, nie kodów. |
| 3 | Gotowość do obliczeń (Ekran A, blok E) | **Z backendu, jedną funkcją dla ekranu i dla uruchomienia.** `application/analyses/v126_gotowosc.py::ocen_gotowosc_v126(enm, rodzaj, parametry)` zwraca listę WARUNKÓW (kod, opis PL, spełniony, elementy) i BRAKÓW; `GET /api/cases/{case_id}/v126/gotowosc[?analysis_type=]` ją wystawia, a `POST …/runs/v126/{rodzaj}` odmawia 422 DOKŁADNIE tą samą funkcją (predykaty parami — reguła KLASA §3). Dotychczasowe bramki 422 (`generator.q_missing`, `generator.converter_card_missing`, `generator.harmonic_spectrum_missing`, brak węzłów) przechodzą do niej bez zmiany semantyki. | Prompt §3.3 E: „GOTOWOŚĆ POTWIERDZONA + lista sprawdzonych warunków / NIEPOTWIERDZONA + Brak: …". |
| 4 | Dane wejściowe podstawiane przez solver z powietrza (uziom stacji 60×40 m, ρ 100 Ω·m, I_k 10 kA; TRV f_n 12 kHz, τ 0,18 ms; krotność załączania 8×; wyposażenie przekaźnika = wszystkie metody) | **Zakaz fabrykacji egzekwowany w gotowości:** wielkość, której nie ma w modelu i której projektant nie podał, jest BRAKIEM (gotowość NIEPOTWIERDZONA, uruchomienie odmówione 422 z listą braków), a nie „domyślną solvera". Domyślną solvera zostaje wyłącznie parametr, który solver dokumentuje jako parametr metody (rozstrojenie dławika 5 %, tłumienie 0, energia niepewności k = 2). Wartości wyprowadzalne Z MODELU (napięcie znamionowe łącznika = najwyższe Un modelu; sposób uziemienia punktu neutralnego z `Bus.grounding`/`Transformer.*_neutral`) backend PROPONUJE w gotowości (`proponowane`) z nazwanym źródłem; front wstawia je do formularza jako wartości do potwierdzenia. Solver FROZEN nietknięty (B-01) — bramka stoi PRZED solverem. | Prompt §3.3 C/§9: rozdział źródeł danych, zero fabrykacji; CLAUDE.md „Zero fabrykacji (phantom rule)". |
| 5 | Ekran B — źródło danych | **Rozszerzenie agregatu werdyktu projektowego** (`application/analyses/werdykt_projektowy.py`): każde kryterium dostaje `grupa` (znaczenie techniczne) oraz `elementy[]` — pozycje oceny PER ELEMENT o wspólnym kształcie: przedmiot (element, nazwa, rodzaj), wielkość (nazwa, symbol, jednostka), wartość obliczona, wartość odniesienia (+ rodzaj odniesienia), margines, podstawa oceny, wynik (`SPELNIA` / `NIE_SPELNIA` / `BRAK_PODSTAW`), wniosek (1–2 zdania), uzasadnienie dostawcy, odwołanie do dowodu. Odpowiedź `GET /api/quality/design-verdict` rozszerzona ADDYTYWNIE (`grupy`, `ocena`, `pozycje[].grupa`, `pozycje[].elementy`); dotychczasowi konsumenci (`co-wymaga-uwagi`) czytają ją bez zmian. Żadnego drugiego modelu wyników: pozycje są projekcją istniejących widoków dostawców (walidacja energetyczna, warunki przyłączenia, wytrzymałość cieplna, wiarygodność Ik″, raport DER-SN) — tych samych, które już zasilają werdykt. | Prompt §4.4/§9: pozycja oceny z wartością, odniesieniem, marginesem, podstawą, wynikiem, wnioskiem; „nie twórz drugiego modelu wyników". |
| 6 | Ekran B a „Werdykt projektowy" | **Jeden ekran.** „Ocena techniczna wyników" (`ui2/wyniki/ocena/`) ZASTĘPUJE zakładkę „Werdykt projektowy" (ten sam agregat, pełniejsza prezentacja) i hub „Pozostałe analizy / Analizy techniczne" (jego tor pracy przechodzi do nagłówka PODSTAWA OCENY i stanu blokującego; jego karty i łącza — do nawigacji). `EkranWerdyktu` i `EkranAnalizTechnicznych` skasowane (bez warstwy zgodności). Identyfikator zakładki `werdykt` zostaje w kodzie (deep-linki, testy) — to identyfikator, nie napis. | Prompt §1: „nie mogą się funkcjonalnie dublować"; zasady inżynierskie pkt 1 (bez kompatybilności wstecznej). |
| 7 | Stan blokujący Ekranu B | Brak ZAKOŃCZONEGO biegu rozpływu i zwarciowego (żadne źródło biegowe agregatu niedostępne) ⇒ jeden stan **BRAK WYNIKÓW DO OCENY** (projekt / wariant / rewizja) + [PRZEJDŹ DO OBLICZEŃ]. Bieg nieaktualny wobec modelu ⇒ ekran renderuje pozycje jako BRAK PODSTAW z powodem „model zmieniony po biegu" + akcja przeliczenia (nie stan blokujący — projektant ma widzieć, CO utracił ważność). | Prompt §5. |
| 8 | Nawigacja warsztatu Wyników | **Dwa poziomy: OBSZAR → ANALIZA.** Obszary (wyłącznie z realnymi dostawcami): Ocena wyników · Rozpływ mocy · Zwarcia · Zabezpieczenia · Stabilność · Analizy specjalistyczne · OZE i przyłączenia · Porównania i dowody. Trzydzieści dwie zakładki ZOSTAJĄ (identyfikatory i deep-linki bez zmian), zmienia się wyłącznie ich układ. Zakładka „Pozostałe analizy" znika z nawigacji; most widoków klasycznych (powierzchnie trasowe E-27, taby `compare`/`trace`/`ncrfg-tests`) jest osiągalny z obszaru „Zabezpieczenia" („Przegląd zabezpieczeń i automatyki") i „Porównania i dowody" (widoki klasyczne), a otwarcie powierzchni trasowej przestrzeni Wyników przełącza warsztat na jej gospodarza. | Prompt §6: „obszar pracy → grupa funkcjonalna → konkretna analiza… nie usuwaj funkcji". |
| 9 | Nazwy ekranów | Ekran A: **„Analizy specjalistyczne"** (zakładka i tytuł; katalog kodu `akademickie/` zostaje — identyfikator). Ekran B: **„Ocena techniczna wyników"**. | Prompt §3/§4.1/§7. |
| 10 | Język UI | Formalny polski. Zakazane w napisach widocznych: backend, frontend, workflow, readiness, evidence, case, cockpit, PASS/WARN/FAIL (stany: SPEŁNIA / NIE SPEŁNIA / BRAK PODSTAW DO OCENY SPEŁNIENIA WYMAGANIA; gotowość: POTWIERDZONA / NIEPOTWIERDZONA). Kody kontraktu w kodzie/API/testach bez zmian. Strażnik: `scripts/ui_terminology_guard.py` + test napisów nowych ekranów (iloczyn: każdy stan × każdy napis). | Prompt §7. |
| 11 | Zasada normowa | Podstawa oceny pokazywana WYŁĄCZNIE, gdy znane są: wielkość, warunki obowiązywania, wartość graniczna i źródło — wszystkie z backendu (`podstawa_oceny` katalogu V12.6 z literałów solvera FROZEN; `norma_pl`/`limit_fail` agregatu werdyktu). Rodzaj bez progu w solverze (niezawodność, niepewność) mówi to wprost (`bez_podstawy_pl`), nigdy nie dostaje progu w UI. | Prompt §8. |
| 12 | Nietykalne | Solver `network_model/solvers/**` (B-01), kontrakty FROZEN odpowiedzi biegów (pola wyłącznie addytywne), tożsamość ENM, `ResultSet`, kontrakt świeżości E15.2, granica solvera, proweniencja, wycofania `hosting_capacity`/`opf_loss_lcc` (410), rejestr `nieprezentowane.ts`. | Prompt §9. |
| 13 | Gotowość harmonicznych: brak karty przekształtnika a brak widma (wykryte przy fixturze z parametrami sceny) | **Brak nazwany PO PRZYCZYNIE z JEDNEJ oceny karty** (`pominiete_zrodla_v126`, ta sama, którą most buduje wejście): przekształtnik BEZ karty katalogowej (bez mocy znamionowej) dostaje `generator.converter_card_missing` BEZ klucza parametru — widmo ręczne nie zastępuje S_n, z której liczy się prąd bazowy wstrzyknięcia; przekształtnik Z kartą bez widma dostaje `generator.harmonic_spectrum_missing` z kluczem `harmonic_spectra`. Przed naprawą każdy kandydat bez wejścia był meldowany jako „brak widma" z kluczem formularza, a bieg po wypełnieniu formularza dalej odmawiał 422 (fabrykacja remedium). Test iloczynu cech: brak karty × karta bez widma × widmo ręczne, także oba w jednym modelu (`tests/application/analyses/test_v126_gotowosc.py`). Na złotej sieci harnessu `gen_pv` nie ma karty, więc harmoniczne i SSCI zostają NIEPOTWIERDZONE z nazwaną przyczyną — fixtura `gotowosc_v126_scena_akademickie_parametry.json` jest uczciwa, nie „na ładnie" (pin `tests/ci/test_fixtury_harnessu.py`). | Prompt §3.3 E (lista braków ma prowadzić do usunięcia braku); CLAUDE.md „Zero fabrykacji"; reguła KLASA §3. |

---

## §1 Inwentarz (stan PRZED, drzewo `9b5212d7`)

### Ekran A — „Analizy akademickie" (`frontend/src/ui2/wyniki/akademickie/`)
- `EkranAnalizAkademickich.tsx` (1272 wierszy): lista rozwijana `<select data-testid="mvd-akad-rodzaj">` (10 z 14 rodzajów — 4 wycofane rejestrem), „Parametry projektowe" zwijane, przycisk „Uruchom analizę", po biegu: przebieg → werdykt (cytat statusu solvera) → wielkości → obiekty → braki → wiarygodność → ślad/dowód/raport (zwijane) → dane odniesienia. Brak: katalogu kart, przedmiotu, rozdziału źródeł danych, gotowości z listą warunków.
- Dane: `api.ts` (7 rodzin końcówek `api/v126_academic.py`), `prezentacja.ts` (pytanie/kryterium/norma/wielkości/tabele per rodzaj — **lokalny katalog w UI**), `parametry.ts` (pola per rodzaj, parytet CI z `parameters.get` solvera), `katalog.ts` (przestrzenie nazw danych odniesienia), `nieprezentowane.ts`, `model.ts`, `strings.ts`, `useNazwaObiektu.ts`.
- Gotowość: WYŁĄCZNIE bramki w `POST …/runs/v126/{rodzaj}` (410 rodzaj wycofany; 422: brak węzłów, `generator.q_missing` dla niezawodności i SSCI, `generator.harmonic_spectrum_missing`, `generator.converter_card_missing`). Solver domyślnie podstawia: uziom 60×40 m / ρ 100 Ω·m / I_k 10 kA / t 0,5 s (`V126EarthingInput()`), TRV f_n 12 kHz / τ 0,18 ms, krotność załączania 8×, wyposażenie przekaźnika = 4 metody, sposób uziemienia `petersen_tuned`.
- Testy: 7 plików vitest (`EkranAnalizAkademickich`, `model`, `parametry`, `prezentacja.straznik`, `slownikSegmentow`, `wygaszenie`, fixtura `odpowiedziSolvera.json`), CI `backend/tests/ci/test_v126_rodzaje_parytet.py`; e2e `v126-jezyk-screenshot`, `v126-okna-zrzuty`, `v126-wygaszenie-zrzuty` (wszystkie klikają `mvd-akad-rodzaj`).
- Nawigacja: zakładka `akademickie` warsztatu (brama trybu eksperckiego) + powierzchnie trasowe E-40…E-50 (`WorkspaceSurfaceRouter.tsx`, `screenCanonRegistry.ts`).

### Ekran B — „Pozostałe analizy" → „Analizy techniczne" (`frontend/src/ui2/wyniki/analizy/`)
- `EkranAnalizTechnicznych.tsx`: TOR PRACY (projekt / wariant / wersja układu / zakończone obliczenie z akcjami), ANALIZY (3 grupy, 8 kart E-27…E-34 — 6 z nich to deep-linki do zakładek warsztatu), WIDOKI KLASYCZNE (3 łącza mostu). **Zero pobrań** — ekran nie ma żadnych wyników; „ocena" = chip „dane dostępne / wymaga przebiegu".
- `MostAnalizTechnicznych.tsx`: gospodarz zakładki `pozostale` (hub / router powierzchni klasy B/C / pasek powrotu). Wstrzyknięcie: `AppRoot.tsx` → `LegacySurface space="wyniki"`.
- Werdykt projektowy (`ui2/wyniki/werdykt/`, `GET /api/quality/design-verdict`): odrębna pierwsza zakładka; per KRYTERIUM (10 kryteriów, 3 stany + „nie dotyczy", element wiodący, liczniki, źródła z aktualnością, zakres poza automatem). Brak pozycji per element, brak wartości/odniesienia/marginesu, brak wniosku.
- Dostawcy per element (istniejące widoki, konsumowane dziś wyłącznie przez ekran „Jakość wyników" i agregat werdyktu): walidacja energetyczna (`observed_value`, `limit_warn/fail`, `margin_pct`, `why_pl`, `white_box`), warunki przyłączenia (`wartosc`, `wymagana`, `jednostka`), wytrzymałość cieplna (`i2t_a2s` vs `i2t_dopuszczalne_a2s`, `margines_procent`, `powod_decyzji_pl`, dowód per gałąź), wiarygodność Ik″ (`ikss_ka`, pasmo `[lower_ka; upper_ka]`, `why_pl`), raport DER-SN (`status`, `message_pl`).
- Nawigacja warsztatu: 32 zakładki w 2 klastrach („Analizy sieci" 20, „OZE i przyłączenia" 12), start na `pozostale` bez aktywnego przebiegu.
- Testy: `EkranAnalizTechnicznych.test.tsx` (17), `mostAnalizTechnicznych.test.tsx` (11), `ekranWerdyktu.test.tsx` (12), `wynikiWarsztat.test.tsx` (odwołania do `pozostale`); e2e `nastawy-i-akcje-oze` (droga do E-28 przez `pozostale`), `mosty-parytet`, `deep-link-wyniki`, `critical-run-flow`.

---

## §2 Kontrakty (backend, addytywne)

### 2.1 `GET /api/catalog/v126/analysis-catalog` (`api/v126_academic.py`, katalog `application/analyses/v126_katalog.py`)
`items[]` — jedna pozycja per rodzaj `V126AnalysisType` (komplet 14; test parytetu):
`kod`, `nazwa_pl`, `grupa: {kod, nazwa_pl}`, `pytanie_pl`, `zakres_pl`, `wielkosci_glowne[] {symbol, nazwa_pl, jednostka}`,
`podstawa_oceny[] {wielkosc_pl, symbol, jednostka, warunek_pl, wartosc_graniczna, zrodlo_pl}` (puste + `bez_podstawy_pl`, gdy solver
nie stosuje progu), `dane: {z_modelu[] {nazwa_pl, elementy_pl}, od_uzytkownika[] {klucz, nazwa_pl, jednostka, wymagane},
domyslne_solvera[] {klucz, nazwa_pl, wartosc, jednostka, uzasadnienie_pl}}`, `prezentowany`, `powod_wycofania_pl`,
`katalog_odniesienia` (przestrzeń nazw danych odniesienia albo `null`). Wartości graniczne = literały solvera FROZEN
(`_power_quality`: 8 %/5 %/5 %; `_insulation`: margines ≥ 20 %, TOV ≤ U_r; `_motor_starting`: ΔU ≤ 15 %, I²t ≤ 1,
M_r > M_obc; `_transient`: margines ≥ 10 %; `_earthing`: U_dot ≤ U_dot,dop, U_kr ≤ U_kr,dop; `_petersen_design`:
I_res ≤ 10 % I_C; `_ner_design`: E ≤ E_n) — pilnuje test parytetu literałów.

### 2.2 `GET /api/cases/{case_id}/v126/gotowosc?analysis_type=` (`application/analyses/v126_gotowosc.py`)
`{case_id, model_hash, rewizja, przedmiot: {liczba_szyn, liczba_galezi, liczba_transformatorow, liczba_zrodel_przeksztaltnikowych,
poziomy_napiec_kv[], czestotliwosc_hz, punkt_przylaczenia: {ref, nazwa} | null}, analizy[] {kod, gotowosc: 'POTWIERDZONA' |
'NIEPOTWIERDZONA' | 'WYCOFANA', warunki[] {kod, opis_pl, spelniony, elementy[]}, braki[] {kod, opis_pl, elementy[],
klucz_parametru | null}, dane_z_modelu[] {nazwa_pl, wartosc_pl, elementy[]}, proponowane: {klucz: {wartosc, zrodlo_pl}}}}`.
Parametry użytkownika przekazywane jako zapytanie `?parametry=<json>` (te same, które trafią do `V126RunRequest.parameters`),
żeby gotowość i uruchomienie oceniały IDENTYCZNE wejście.

### 2.3 `GET /api/quality/design-verdict` — rozszerzenie
Nowe pola: `grupy[] {kod, nazwa_pl}` (kolejność prezentacji), `ocena: {oceniono, spelnia, nie_spelnia, brak_podstaw}` (per element),
`pozycje[].grupa`, `pozycje[].wielkosc_pl`, `pozycje[].symbol`, `pozycje[].jednostka`, `pozycje[].elementy[]`:
`{element_id, element_nazwa, element_rodzaj, wartosc, odniesienie, odniesienie_rodzaj_pl, jednostka, margines_pct, wynik,
uzasadnienie_pl, wniosek_pl, dowod: {rodzaj, run_id, element_id} | null}`. Stare pola bez zmian.

---

## §3 Ekran A — „Analizy specjalistyczne" (`ui2/wyniki/akademickie/`)
1. **Katalog kart** (widoczny, bez listy rozwijanej): grupy z katalogu backendu; karta = NAZWA · PYTANIE INŻYNIERSKIE · BADANY
   ZAKRES · GŁÓWNE WIELKOŚCI · PODSTAWA OCENY (tylko gdy katalog ją niesie; inaczej zdanie „solver nie stosuje progu
   normatywnego") · STAN DANYCH (z gotowości: „gotowość potwierdzona" / „brak: …").
2. **Widok analizy A–G**: (A) PRZEDMIOT — projekt, wariant, rewizja modelu, przypadek (ze store'ów), obszar (przedmiot z gotowości:
   liczba szyn/gałęzi/transformatorów, poziomy napięć, punkt przyłączenia); (B) PYTANIE; (C) DANE WEJŚCIOWE — z modelu / z przypadku /
   od użytkownika (formularz, wartości proponowane z modelu oznaczone źródłem) / domyślne solvera / BRAKUJĄCE; (D) GOTOWOŚĆ —
   POTWIERDZONA + lista warunków albo NIEPOTWIERDZONA + lista braków; (E) KRYTERIA — tabela podstawy oceny; (F) ZAKRES OBLICZEŃ —
   badany zakres + główne wielkości; (G) URUCHOMIENIE — przycisk aktywny wyłącznie przy gotowości POTWIERDZONEJ; wynik jak dziś
   (werdykt → wielkości → obiekty → wiarygodność → ślad/dowód/raport) pod widokiem.
3. Brama trybu eksperckiego zostaje (V126-JEZYK) — ekran nie schodzi na tor podstawowy do czasu werdyktu właściciela.

## §4 Ekran B — „Ocena techniczna wyników" (`ui2/wyniki/ocena/`)
1. Nagłówek PODSTAWA OCENY: projekt · wariant · rewizja modelu (nr + skrót odcisku) · przypadek · przebieg rozpływu (id, stan
   ZAKOŃCZONY, czas, aktualność) · przebieg zwarciowy (jw.) · pakiet wyników (kryteria z biegów rozpływu/zwarć/modelu).
2. Podsumowanie: OCENIONO n · SPEŁNIA WYMAGANIA n · NIE SPEŁNIA WYMAGAŃ n · BRAK PODSTAW DO OCENY n (liczniki per element z backendu).
3. Grupy techniczne (tylko z pozycjami): Napięcia · Obciążalność · Bilans mocy i straty · Zwarcia · Wytrzymałość toru ·
   Warunki przyłączenia · Dobory toru źródła. Pozycja = PRZEDMIOT OCENY · WIELKOŚĆ · WARTOŚĆ OBLICZONA · WARTOŚĆ
   ODNIESIENIA/GRANICZNA · MARGINES · PODSTAWA OCENY · WYNIK OCENY · WNIOSEK; akcje: Pokaż na schemacie / Popraw w modelu
   (`usePoprawWModelu`), Dowód obliczeń (`onOtworzDowod(run, element)`), identyfikator ENM w trybie eksperckim.
4. Kryteria poza automatem — sekcja jak dotąd (jawny zakres). Stan blokujący — §0 poz. 7.

## §5 Nawigacja (`ui2/spaces/wyniki/WynikiWarsztat.tsx`)
Pasek obszarów (poziom 1) + pasek analiz obszaru (poziom 2); identyfikatory zakładek, deep-linki (`setWynikiTab`), brama trybu,
hydratacja K2 i klawiatura bez zmian semantyki (strzałki w obrębie obszaru). Start bez aktywnego przebiegu = „Ocena techniczna wyników".

## §6 Weryfikacja i DoD
- Backend: pytest FULL (`-m "not pandapower"` + wyrocznia pandapower), OpenAPI snapshot zregenerowany (nowe ścieżki: 2), testy:
  katalog (komplet rodzajów, parytet literałów granicznych z solverem), gotowość (iloczyn: rodzaj × brak danej × parametr
  użytkownika × wartość z modelu; parytet z 422 trasy POST), werdykt (pozycje per element dla każdego dostawcy × każdy stan).
- Frontend: tsc 0, eslint 0, vitest FULL, testy nowych ekranów (katalog kart, widok A–G, gotowość, uruchomienie zablokowane
  bez gotowości; Ekran B: stan blokujący, nieaktualny bieg, mało/dużo pozycji, przekroczenia, brak podstaw, akcje, tryb
  ekspercki), test nawigacji (każda z 32 zakładek osiągalna z obszaru; deep-linki), strażnik napisów (zakazane słowa).
- Guardy: `guardy_z_ci.py` komplet; `ui_terminology_guard`, `forbidden_ui_terms_guard`, `no_codenames_guard`, `ui_no_physics_guard`,
  `dead_click_guard`, `empty_state_cta_guard`, `docs_guard`.
- E2E (realny backend): sceny harnessu `akademickie` (katalog + widok analizy + wynik) i `ocena` (przebiegi realne z sieci
  wzorcowej) w obu motywach; zrzuty w `docs/audit/visual/sceny/`; specy `v126-*` przepisane z listy rozwijanej na karty.
- Dokumentacja: ta karta, `INWENTARZ_FUNKCJI_2026-07.md` (S17, wiersz 218), `MAPA_DOMKNIECIA_PRODUKTU_2026-09.md` (10 #20, 5 #8,
  1 #17, aneks domeny „Jakość"), `REJESTR_KONFLIKTOW.md` (wiersz B02-W3E), `docs/INDEX.md`.
- Odbiór: **werdykt właściciela B-02** na zrzutach obu ekranów (light + dark) — agent nie certyfikuje jakości wizualnej.

### §6.1 Dowody wykonania (2026-09-10, drzewo po rebase na `20890e88`)
- Backend (drzewo z `backend/` i `scripts/` bajt w bajt identycznymi przed i po rebase — `git diff --stat` pusty): pełny
  `pytest tests/ -m "not pandapower"` **14 538 passed / 0 failed** (1 skipped = `test_przejecie_jest_atomowe_takze_na_postgresie`,
  bramka `MV_TEST_POSTGRES_URL` — biegnie w osobnym jobie CI `postgres-dialect`; 1 xfailed = IEEE 13-bus PLANNED; 30 deselected =
  marker pandapower) w 788 s; wyrocznia pandapower (`-m pandapower`, pp-venv) RC=0; celowane: gotowość/fixtury/API V12.6/parytet
  rodzajów 133 passed (w tym nowe testy klasy harmonicznych: brak karty × karta bez widma × widmo ręczne, także oba w jednym modelu).
- Guardy: `guardy_z_ci.py` na drzewie po rebase — **93 guardy zielone + lint 4/4 (black/ruff src, tests, ../scripts) + npm type-check + npm lint
  + 767 testów własnych guardów**, RC=0 (bieg na drzewie przed rebase: jedyny czerwony `npm run lint` = nieużyta dyrektywa eslint-disable
  `SekcjaNastaw.tsx:223`, naprawiona w `20890e88` — stąd rebase przed pozostałymi etapami). Pin `solver_input_substitute_guard`
  przepięty z pomiaru: pola 3471 → 3506, pliki 484 → 486, `application` 234 → 236 (dwa nowe moduły gotowości i katalogu), zapadka
  58/260 i wykluczenia 13/31 bez zmian. Docs guardy (`docs_guard`, `v12xx_canon_guard`, `local_truth_guard`, `api_lifecycle_guard`) RC=0.
- Frontend: tsc 0, eslint 0 na plikach zmienionych; vitest modułów karty (akademickie 156 w 6 plikach, ocena 37, warsztat Wyników 43,
  most widoków klasycznych 13, spaces/wyniki razem) **284 passed w 14 plikach**; pełny vitest — patrz §6.2.
- E2E (realny backend, `playwright-run-real.mjs`): harness `v126-jezyk-screenshot` (6) + `v126-wygaszenie-zrzuty` (4) + `v126-okna-zrzuty`
  (1, ŻYWA aplikacja: katalog kart → karta „Bezpieczeństwo uziomu stacji" NIEPOTWIERDZONA → formularz z fixtury → POTWIERDZONA → realny bieg
  → ślad → rodzaj bez parametrów z REALNEJ gotowości = `uncertainty_sensitivity`) **12 passed**; `wszystkie-sceny-screenshot` dla scen
  `akademickie`/`ocena`/`ocena-przekroczenia` **6 passed** (oba motywy, zero błędów konsoli, zero 4xx); pełny zestaw — patrz §6.2.
- Zrzuty (PNG poza repo, kanałem sesji do werdyktu B-02): `docs/audit/visual/sceny/scena_{akademickie,ocena,ocena-przekroczenia}_{light,dark}.png`,
  `docs/sld/audyt-2026-08/v126-{katalog-kart,analiza-uziom-niepotwierdzona,analiza-uziom-potwierdzona,wynik-uziom,slad-whitebox,
  wynik-uncertainty-sensitivity}-{jasny,ciemny}.png`, `v126-jezyk-{werdykt-kryterium,obiekty,slad}-{light,dark}.png`,
  `v126-wygaszenie-{katalog,uziom}-{jasny,ciemny}.png`.
- Recenzje równoległych kart fali 3 (agenci-recenzenci, tylko odczyt): W3-G1/W3-G2/W3-G3/TRACE-V2 — każda PRZYJĄĆ Z POPRAWKAMI; lista
  poprawek w planie odbioru fali 3 (poza tą kartą).
### §6.2 Pełny łańcuch przedpushowy (2026-09-10, drzewo po rebase = drzewo pushu)
- pełny vitest: 894 plików / **12 224 passed** / 14 todo (jawnie odroczone klucze parytetu GPZ programu SLD) w 1470 s; e2e realny backend (ścieżka krytyczna `critical-run-flow` + `critical-oze-evidence`, harness
  `wszystkie-sceny-screenshot` + `creator-screenshot` + `dowody-oze-screenshot`, specy `v126-*` i 7 speców przepiętych na pomocnika
  obszar → zakładka + `deep-link-wyniki`): **130 passed** (6,4 min, 2 workery, zero flaky).
- Werdykt wizualny: należy do właściciela (B-02) — ta karta NIE certyfikuje jakości wizualnej.

## §7 Podział pracy
Fable (architekt): §2 kontrakty backendu, oba ekrany, nawigacja, harness/fixtury, dokumentacja, odbiór. Agenci (worktree, commit
bez push, podpis sesji przy odbiorze): przepisanie testów istniejących na nowy kanon (warsztat, werdykt → ocena, kasacja testów
huba), specy e2e `v126-*`, strażnik napisów.


---

## Załącznik A — dyrektywa właściciela (2026-09-10, verbatim)

```text
Tak. Te dwa ekrany powinny zostać potraktowane łącznie, bo dziś oba cierpią na ten sam problem: pokazują strukturę programu zamiast procesu oceny inżynierskiej. Pierwszy ekran służy do wyboru i uruchomienia analizy specjalistycznej, drugi powinien służyć do interpretacji wyników zakończonych obliczeń. Nie mogą się funkcjonalnie dublować.

Poniżej gotowy prompt dla Fable jako zarządcy.

# MV-DESIGN-PRO — B-02 / W3-E
# PRZEBUDOWA DWÓCH POWIERZCHNI ANALITYCZNYCH
# V12.6 — KOREKTA WARTOŚCI INŻYNIERSKIEJ I CZYTELNOŚCI
<rola>
Działaj jako Lead Principal Engineer, System Architect i zarządca programu MV-DESIGN-PRO.
Masz przeprowadzić ukierunkowaną przebudowę dwóch istniejących ekranów:
A. ekranu wyboru i uruchamiania analiz specjalistycznych,
   obecnie prezentowanego jako „Analizy akademickie”;
B. ekranu interpretacji wyników zakończonych obliczeń,
   obecnie prezentowanego jako „Pozostałe analizy / Analizy techniczne”.
Nie wykonuj kosmetycznej korekty CSS.
Nie twórz kolejnej makiety oderwanej od rzeczywistego modelu i API.
Nie zmieniaj poprawnie działającego backendu bez potrzeby.
Celem jest uzyskanie dwóch odrębnych, ale spójnych powierzchni pracy projektanta SN.
</rola>
# 1. PODZIAŁ ODPOWIEDZIALNOŚCI
Te dwa ekrany mają mieć jednoznacznie różne funkcje.
EKRAN A
„Analizy specjalistyczne”
Odpowiada na pytanie:
„Jaką analizę chcę wykonać, czego ona dotyczy, czy mam dane potrzebne do jej wykonania i jakie kryteria będą oceniane?”
EKRAN B
„Ocena techniczna wyników”
Odpowiada na pytanie:
„Co wynika z już zakończonych obliczeń, jakie wymagania zostały ocenione i jakie są wnioski projektowe?”
Nie wolno mieszać tych dwóch odpowiedzialności.
Ekran A przygotowuje i uruchamia analizę.
Ekran B interpretuje istniejące wyniki.
</podzial_odpowiedzialnosci>
# 2. WSPÓLNA ZASADA PROJEKTOWA
Każda powierzchnia analityczna ma prowadzić użytkownika według ciągu:
PRZEDMIOT
→ STAN MODELU
→ DANE
→ KRYTERIUM
→ OBLICZENIE
→ WYNIK
→ OCENA WYMAGANIA
→ WNIOSEK PROJEKTOWY
Interfejs nie może ograniczać się do:
„wybierz → uruchom”
ani do:
„wyniki istnieją → pokaż kartę”.
Każdy komunikat ma mieć znaczenie techniczne.
Nie używaj pustych statusów typu:
„gotowe”,
„dobrze”,
„zgodne”,
„ostrzeżenie”,
„błąd”
bez wskazania, czego konkretnie dotyczą.
</wspolna_zasada>
# 3. EKRAN A — ANALIZY SPECJALISTYCZNE
## 3.1. Usuń obecny model oparty głównie na liście rozwijanej
Dziesięć analiz nie może być ukrytych w pojedynczej liście wyboru.
Zastąp ją widocznym katalogiem analiz.
Analizy pogrupuj według rzeczywistego znaczenia inżynierskiego, a nie według kolejności implementacji.
Przykładowe grupy:
- jakość napięcia;
- harmoniczne;
- asymetria;
- stabilność;
- wrażliwość;
- stan sieci;
- analizy porównawcze;
- analizy specjalne.
Nie twórz grup, których nie uzasadnia rzeczywisty katalog backendu.
## 3.2. Każda analiza ma być reprezentowana przez kartę
Karta powinna pokazywać maksymalnie istotne informacje:
NAZWA ANALIZY
PYTANIE INŻYNIERSKIE
np.
„Czy poziomy harmonicznych napięcia w badanych węzłach spełniają wymagania przyjętej podstawy oceny?”
BADANY ZAKRES
np.
PCC / szyna SN / wskazane węzły / cały obszar sieci
GŁÓWNE WIELKOŚCI
np.
THD_U, U_h, I_h
PODSTAWA OCENY
tylko wtedy, gdy rzeczywiście istnieje i jest obsługiwana przez kontrakt analizy
STAN DANYCH
np.
„Dane wymagane do analizy są dostępne”
lub
„Brak danych harmonicznych dla INV-04”
Nie pokazuj samych kolorowych znaczników bez tekstu.
## 3.3. Widok wybranej analizy
Po wejściu do analizy pokaż następującą strukturę:
A. PRZEDMIOT ANALIZY
- projekt;
- aktywny wariant pracy sieci;
- rewizja modelu;
- przypadek obliczeniowy;
- badany element;
- badany obszar;
- napięcie znamionowe;
- PCC, jeżeli dotyczy.
B. PYTANIE INŻYNIERSKIE
Musi wynikać z rodzaju analizy i rzeczywistego badanego obiektu.
Unikaj tekstów ogólnych.
C. DANE WEJŚCIOWE
Jawnie rozdziel:
- dane z modelu;
- dane z aktywnego przypadku;
- dane podawane przez użytkownika;
- wartości domyślne solvera;
- dane brakujące.
D. GOTOWOŚĆ DO OBLICZEŃ
Nie pokazuj samego:
„gotowe”.
Pokaż:
GOTOWOŚĆ DO OBLICZEŃ: POTWIERDZONA
oraz listę sprawdzonych warunków.
Albo:
GOTOWOŚĆ DO OBLICZEŃ: NIEPOTWIERDZONA
Brak:
- ...
- ...
E. KRYTERIA OCENY
Dla każdego kryterium:
- wielkość;
- symbol;
- jednostka;
- wartość graniczna;
- warunki obowiązywania;
- podstawa techniczna lub normowa.
Nie pokazuj samej nazwy normy bez wymagania, które z niej wynika.
F. ZAKRES OBLICZEŃ
Użytkownik ma przed uruchomieniem wiedzieć, co system rzeczywiście policzy.
G. URUCHOMIENIE
Przycisk uruchomienia analizy ma być dostępny dopiero po jednoznacznym przedstawieniu:
- przedmiotu;
- zakresu;
- danych;
- kryteriów;
- gotowości.
</ekran_A>
# 4. EKRAN B — OCENA TECHNICZNA WYNIKÓW
Obecny ekran:
„Pozostałe analizy”
→ „Analizy techniczne”
→ „Od projektu do analizy”
jest niewystarczający.
Obecny czteroelementowy „tor pracy” zajmuje dużą część ekranu, ale nie przedstawia wartości inżynierskiej.
## 4.1. Zmień funkcję ekranu
Docelowa nazwa powierzchni:
OCENA TECHNICZNA WYNIKÓW
Nie „Pozostałe analizy”.
Termin „Pozostałe” nie określa funkcji ani zakresu.
## 4.2. Informacje o pochodzeniu wyniku ogranicz do zwartego nagłówka
Nie buduj dużych kart:
1. Projekt
2. Wariant
3. Wersja układu
4. Zakończone obliczenie
Zastąp je zwartym blokiem:
PODSTAWA OCENY
Projekt:
...
Wariant pracy sieci:
...
Rewizja modelu:
...
Przypadek obliczeniowy:
...
Przebieg obliczeniowy:
...
Stan:
ZAKOŃCZONY
Czas wykonania:
...
Pakiet wyników:
...
Te informacje mają służyć identyfikowalności wyniku, a nie być główną zawartością strony.
## 4.3. Główna część ekranu ma przedstawiać wynik techniczny
Na początku pokaż syntetyczne podsumowanie:
OCENIONO: n wymagań
SPEŁNIA WYMAGANIA: n
NIE SPEŁNIA WYMAGAŃ: n
BRAK PODSTAW DO OCENY: n
Nie używaj PASS / WARN / FAIL.
## 4.4. Każdy wynik oceny musi zawierać
PRZEDMIOT OCENY
np.
„Napięcie w węźle BUS-17”
WIELKOŚĆ OCENIANĄ
np.
U
WARTOŚĆ OBLICZONĄ
np.
14,18 kV
WARTOŚĆ ODNIESIENIA LUB GRANICZNĄ
np.
14,25 kV
MARGINES
np.
0,07 kV
PODSTAWĘ OCENY
np.
wymaganie wynikające z konkretnego kontraktu technicznego / normy / IRiESD
WYNIK OCENY
SPEŁNIA WYMAGANIE
lub
NIE SPEŁNIA WYMAGANIA
lub
BRAK PODSTAW DO OCENY SPEŁNIENIA WYMAGANIA
WNIOSEK
jedno lub dwa formalne zdania techniczne.
## 4.5. Grupowanie wyników
Wyniki grupuj według ich znaczenia technicznego, np.:
- napięcia;
- obciążalność;
- zwarcia;
- wytrzymałość toru;
- zabezpieczenia;
- warunki przyłączenia;
- stabilność;
- jakość energii.
Pokazuj wyłącznie grupy mające wyniki dla danego przebiegu.
Nie renderuj pustych sekcji tylko dlatego, że istnieją w katalogu.
## 4.6. Powiązanie z siecią
Dla wyniku dotyczącego konkretnego elementu zapewnij możliwość:
- wskazania elementu na SLD;
- przejścia do elementu;
- odczytania jego identyfikatora ENM;
- przejścia do danych wejściowych;
- przejścia do dowodu obliczeniowego.
Nie twórz drugiej tożsamości elementów w warstwie wynikowej.
ENM pozostaje źródłem tożsamości.
</ekran_B>
# 5. STAN BRAKU ZAKOŃCZONYCH OBLICZEŃ
Obecny ekran pokazuje dużą strukturę strony nawet wtedy, gdy:
„nie wykonano obliczeń”.
To należy uprościć.
Jeżeli nie istnieje zakończony przebieg obliczeniowy:
nie pokazuj pustych tabel,
nie pokazuj pustych analiz,
nie pokazuj pozornych wyników,
nie pokazuj dużej pustej powierzchni.
Pokaż jeden jednoznaczny stan:
BRAK WYNIKÓW DO OCENY
Nie istnieje zakończony przebieg obliczeniowy dla:
Projekt:
...
Wariant:
...
Rewizja modelu:
...
Aby wykonać ocenę techniczną wyników, należy najpierw przeprowadzić obliczenia.
[ PRZEJDŹ DO OBLICZEŃ ]
To jest stan blokujący, a nie ostrzeżenie.
</brak_wynikow>
# 6. NAWIGACJA
Oba zrzuty pokazują nadmiernie rozbudowany poziomy zestaw zakładek.
Przeanalizuj rzeczywistą architekturę informacji.
Nie usuwaj funkcji.
Ogranicz jednak jednoczesne prezentowanie kilkudziesięciu równorzędnych zakładek.
Wprowadź logiczne grupowanie.
Użytkownik nie powinien musieć skanować kilkudziesięciu nazw, aby znaleźć właściwą analizę.
Priorytet:
1. obszar pracy;
2. grupa funkcjonalna;
3. konkretna analiza.
Nie:
1. lista wszystkich funkcji systemu na jednym poziomie.
</nawigacja>
# 7. JĘZYK INTERFEJSU
Zakaz anglicyzmów dotyczy wyłącznie tekstów widocznych dla użytkownika.
W UI stosuj formalny polski język techniczny i normowy.
Nie stosuj w UI takich określeń jak:
backend,
frontend,
workflow,
readiness,
evidence,
case,
cockpit,
PASS,
WARN,
FAIL,
jeżeli istnieje jednoznaczny polski odpowiednik.
Nie spolszczaj z tego powodu:
- nazw klas;
- API;
- struktur danych;
- nazw plików;
- testów;
- identyfikatorów;
- nazw technicznych w kodzie;
- dokumentacji wewnętrznej.
Nie wykonuj refaktoryzacji kodu tylko z powodów językowych.
</jezyk_ui>
# 8. ZASADA NORMOWA
Nie wolno generować pozornej oceny normowej.
Jeżeli system pokazuje:
PN-EN 50160
IEC 61000-3-6
IEEE 519
IRiESD
NC RfG
to dla ocenianego wymagania musi być możliwe ustalenie:
- czego wymaganie dotyczy;
- której wielkości dotyczy;
- jakie są warunki jego stosowania;
- jaka wartość jest stosowana w ocenie;
- skąd ta wartość pochodzi.
Jeżeli aktualny system nie posiada wiarygodnych danych potrzebnych do takiej oceny:
pokaż:
BRAK PODSTAW DO OCENY SPEŁNIENIA WYMAGANIA
Nie wymyślaj wartości granicznych.
</zasada_normowa>
# 9. NIE NARUSZAĆ ARCHITEKTURY
Zachowaj:
- backend-driven analysis catalog;
- istniejące kontrakty API, jeżeli są prawidłowe;
- ENM identity;
- TwinModel invariants;
- ResultSet;
- freshness contract;
- solver boundary;
- istniejące mechanizmy provenance;
- istniejące dowody obliczeniowe;
- usunięcie hosting_capacity i opf_loss_lcc z powierzchni.
Nie twórz:
- lokalnego katalogu analiz w UI;
- drugiego modelu wyników;
- drugiej tożsamości elementów;
- fikcyjnych danych demonstracyjnych w produkcyjnym widoku;
- wartości normowych wpisanych bez kontroli do komponentów UI.
</architektura>
# 10. WERYFIKACJA
Po implementacji zweryfikuj oba tryby:
A. jasny;
B. ciemny.
Sprawdź co najmniej:
- czytelność hierarchii;
- czytelność typografii;
- kontrast;
- szerokość kolumn;
- długość tekstów;
- zachowanie dla małej i dużej liczby wyników;
- zachowanie dla braku wyników;
- zachowanie dla brakujących danych;
- zachowanie dla wyniku przekraczającego kryterium;
- zachowanie dla wielu jednoczesnych przekroczeń;
- powiązanie wyniku z SLD;
- identyfikowalność model → przebieg → ResultSet → ocena.
</weryfikacja>
# 11. KRYTERIUM ODBIORU B-02
Nie przedstawiaj kolejnej wersji właścicielowi jako ukończonej, jeżeli użytkownik nadal musi domyślać się:
- czego dotyczy analiza;
- jaki element sieci jest analizowany;
- jakie dane są używane;
- jakie wymaganie jest oceniane;
- jaka wartość została obliczona;
- jaka wartość stanowi podstawę oceny;
- jaki jest wynik oceny;
- jaki jest wniosek projektowy.
Minimalny kontrakt odbioru:
EKRAN A
ANALIZA
→ PRZEDMIOT
→ DANE
→ KRYTERIUM
→ GOTOWOŚĆ
→ URUCHOMIENIE
EKRAN B
PRZEBIEG
→ WYNIK
→ WARTOŚĆ ODNIESIENIA
→ OCENA WYMAGANIA
→ WNIOSEK
→ DOWÓD
Dopiero gdy oba ciągi są czytelne bez znajomości implementacji systemu, powierzchnie mogą zostać przedstawione do ponownego odbioru właścicielskiego.
</kryterium_odbioru>
# 12. SPOSÓB REALIZACJI
Najpierw otwórz rzeczywisty kod obu powierzchni i ich zależności.
Następnie:
1. ustal obecne źródła danych;
2. ustal, które dane wymagane przez nowy widok już istnieją;
3. oddziel problem danych od problemu prezentacji;
4. zaprojektuj docelową strukturę obu ekranów;
5. zaimplementuj ją na rzeczywistych danych;
6. zachowaj istniejące inwarianty;
7. wykonaj testy proporcjonalne do zakresu zmiany;
8. wykonaj niezależną ocenę obu ekranów;
9. przedstaw zrzuty jasnego i ciemnego motywu;
10. przedstaw dowód, że dane na ekranach pochodzą z rzeczywistych kontraktów.
Nie kończ na propozycji.
Doprowadź zadanie do stanu gotowego do ponownego werdyktu właściciela B-02.
</sposob_realizacji>

Najważniejsza zmiana względem obecnego stanu jest taka:

pierwszy ekran ma odpowiadać „co i na jakiej podstawie policzę?”, a drugi „co z obliczenia wynika i na jakiej podstawie tak oceniono?”.

Wtedy oba ekrany przestają być katalogiem funkcji i zaczynają tworzyć jeden spójny ciąg pracy inżynierskiej.
```
