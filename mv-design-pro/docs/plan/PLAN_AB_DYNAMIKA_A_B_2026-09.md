# Program A/B — dynamika, jakość energii i zgodność modułów wytwarzania typu A i B w sieciach nN/SN

**Status:** WIĄŻĄCY (plan operacyjny, podporządkowany kanonowi V12.xx i misji domknięcia produktu).
**Data:** 2026-09-22 (AB-0), rozszerzony 2026-09-23 (poprawka „zakaz lakonicznych werdyktów" +
mandat kontynuacji: pełna dynamika RMS + harmoniczne + supraharmoniczne + multi-physics).
**Prowadzi:** Fable (orkiestrator, architekt, integrator, strażnik kanonu i Git/CI); jedynym
subagentem wykonawczym i recenzującym jest Claude Opus 5.5 (mandat kontynuacji §1; niedostępność
Opusa = STOP danego etapu, nigdy podmiana na inny model).
**Podstawa:** mandat właściciela „DOCELOWA DYNAMIKA DLA MODUŁÓW TYPU A I B / NC RfG + WOS +
PTPiREE + ANALIZY PROJEKTOWE SIECI SN" (§0–§65), analiza luk A/B wykonana na `ef9f6228`, poprawka
„EXPLAINABLE COMPLIANCE RESULT CONTRACT" (2026-09-22) oraz mandat „FABLE — CONTINUATION
ORCHESTRATOR MANDATE … FULL DYNAMICS + PROTECTION + AUTOMATION + HARMONICS + SUPRAHARMONICS"
(2026-09-23, §0–§107).
**Rozszerza:** `FINAL_DYNAMICS_CAPABILITY_FREEZE.md` (mapa fal W6-A…W6-K) — ten plan zawęża
priorytety do A+B, dodaje zdolności spoza macierzy zamrożenia (źródło testowe U/f/θ, profil
regulacyjny, wynik zgodności per wymaganie z wyjaśnieniem, dziedzina częstotliwościowa) i ustala
kolejność wdrażania. Fale W6 pozostają nazwami porządkowymi; przyrosty AB-n wskazują, którą ich
część realizują. **Ten plan NIE restartuje roadmapy i nie zastępuje programu A/B** — harmoniczne i
supraharmoniczne są wpisane W program jako jego zależności (mandat kontynuacji §0, §4, §93).

Ten dokument jest też **powierzchnią pamięci** programu: rejestr postępu (§7) aktualizuje się
przy każdym commicie programu; macierze luk (§3a–§3c), inwentarz werdyktów (§8) i delta grafu
zależności (§11) są uzupełniane z wyników przeglądów Opus 5.5.

---

## 1. Mandat w skrócie (zakres wiążący)

- Zakres: **wyłącznie moduły typu A i B w sieciach nN/SN**. Typy C, D, WN 110 kV, stabilność
  przesyłowa, funkcje OSP/dużych bloków → `DEFER` (nie implementujemy, nie wpływają na
  architekturę bieżącej implementacji). Kontrakty mają być rozszerzalne (zakres typów jako
  zbiór otwarty), żeby C/D nie wymagały przepisania rdzenia.
- Cel produktu (mandat kontynuacji §5): odpowiedzieć, **co stanie się w tej konkretnej sieci
  SN/nN z tymi konkretnymi urządzeniami przy tym stanie pracy, zakłóceniu, zmianie topologii
  lub nastaw — w częstotliwości podstawowej, w dynamice RMS oraz w dziedzinie harmonicznej i
  supraharmonicznej — dlaczego, z jakim marginesem, który element/regulator/zabezpieczenie/
  częstotliwość/rezonans/źródło emisji ogranicza układ i czy wymaganie da się na tej podstawie
  wykazać.**
  `PGM + SIEĆ SN + ZAKŁÓCENIE + STEROWANIE + ZABEZPIECZENIA → WYNIK + KRYTERIUM + DOWÓD`.
- Jeden ENM (mandat kontynuacji §8): ta sama szyna, linia, kabel, transformator, PPM, PV, BESS,
  wiatr, źródło synchroniczne, odbiór, kondensator, dławik, filtr, aparat jest widoczna w wielu
  domenach fizycznych; urządzenie ma `fundamental_model`, `short_circuit_model`, `dynamic_model`,
  `harmonic_model`, `supraharmonic_model` — ale pozostaje TYM SAMYM urządzeniem ENM. Zakaz
  drugiego ENM, osobnej aplikacji harmonicznej, osobnego „projektu jakości energii".
- Rozdział warstw normatywnych: **NC RfG** (rozporządzenie 2016/631) → **WOS** (krajowe wymogi
  ogólnego stosowania, wersja) → **procedura PTPiREE** (wersja) → **WiPWC** (warunki i procedury
  wykorzystania certyfikatów PTPiREE, wersja) → **OSD** (IRiESD, warunki przyłączenia, Bank
  Nastaw). Zakaz logiki `if rfg:`; wymagania są PROFILEM NAD silnikami, nie osobnym silnikiem.
- Wymaganie ma zakres `TYPE_A` / `TYPE_B` / oba; niewymagane → `NIE_DOTYCZY` z powodem, nigdy
  `NIE_SPELNIA`.
- Dynamika: RMS/składowa zgodna (bez PWM/IGBT/EMT w pętli czasu). Harmoniczne i supraharmoniczne:
  dziedzina częstotliwości (Y(f), widma, transfer), sprzęgana z RMS przez migawki punktu pracy —
  nigdy częstotliwość przełączania w DAE. Brak EMT ≠ brak analizy supraharmonicznej; nie
  deklarujemy przebiegu chwilowego, którego nie liczymy.
- Standard dowodu (§58 mandatu, §100 mandatu kontynuacji, wspólny dla wszystkich domen): równanie
  + implementacja + jednostki + domena + wyrocznia + benchmark + mutacja + CI. Zakaz „najpierw
  funkcja, walidacja później"; brak taryfy ulgowej dla harmonicznych.
- **Werdykt wyjaśnialny** (poprawka 2026-09-22, kontrakt
  `docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md`): status maszynowy nigdy nie jest samodzielnym
  wynikiem dla człowieka; każdy wynik = przedmiot + domena fizyczna + kryterium + wynik z jednostką
  + limit z podstawą + margines + punkt krytyczny + przyczyna + wyjaśnienie + podstawa + dowód +
  status modelu + status danych + niepewność + zakres ważności + ślad.
- Fail-closed: brak danych → `UNVALIDATED_INPUT` / `MODEL_MISSING` / `OUTSIDE_DOMAIN` /
  `REQUIREMENT_UNVERIFIED` z pełnym wyjaśnieniem; nigdy fabrykowany wynik (tło 0, impedancja
  domyślna sieci, model 50 Hz w 100 kHz, „typowe" widmo jako model certyfikowany).

## 2. Delegacja i rejestr decyzji

Właściciel, 2026-09-22: *„jesteś architektem i wykonawcą podejmuj decyzje jak główny zarządca.
zawsze robimy maksymalnie dla wartości inżynierskiej całego produktu. w razie potrzeby rozbuduj
plan fable ale docelowo kontynuuj główny plan, wdrażaj z maksymalną dbałością o prawidłowy wynik
elektrotechniczny, matematyczny, użytkowy end to end. każdy napotkany brak wdrażasz i
rozbudowujesz end to end"*.

Na tej podstawie architekt rozstrzyga bramkę właściciela z analizy luk A/B. Decyzje dotyczące
zamrożonych rdzeni (B-01) są podjęte z tej delegacji i każda edycja rdzenia niesie parytet /
dowód w commicie.

### 2.1 Decyzje O-1…O-10 (AB-0, 2026-09-22) — z korektami poprawki 2026-09-22

| Id | Decyzja | Uzasadnienie inżynierskie | Skutek |
|----|---------|---------------------------|--------|
| **O-1** (OD-5) | Progi klas modułów wg **krajowego WOS (decyzja Prezesa URE 2018)**: A 0,8 kW ≤ P < 200 kW; B 200 kW ≤ P < 10 MW; C 10 MW ≤ P < 75 MW; D P ≥ 75 MW **albo U przyłączenia ≥ 110 kV (włącznie)**. Maksima NC RfG dla Europy kontynentalnej (1 MW / 50 MW / 75 MW) zostają w warstwie NC RfG jako granice dopuszczalne dla wartości krajowych. | Narzędzie projektuje przyłączenia w Polsce; klasyfikacja wg maksimów UE przypisywała instalacji 500 kW typ A (wg WOS: B), a 20 MW typ B (wg WOS: C), czyli błędny zestaw wymagań. Reguła „> 110 kV" przepuszczała moduł 100 kW na 110,0 kV jako typ A. | Jedno źródło progów w warstwie WOS profilu regulacyjnego; kasacja klasyfikacji po stronie UI (ranking/studium). |
| **O-2′** (OD-21; **skorygowana 2026-09-22**) | Każda wartość wymagania niesie **stan źródła**: `ZWERYFIKOWANE` (dokument, wydanie i jednostka redakcyjna potwierdzone w repo), `WSKAZANE` (dokument i jednostka wskazane, treść niepotwierdzona w repo), `NIEUSTALONE` (brak wskazania — wartość przeniesiona z dawnego profilu). **Liczenie nigdy nie jest blokowane.** Werdykt zgodności wobec limitu o stanie `WSKAZANE` jest wydawany i jawnie oznaczony; wobec limitu o stanie `NIEUSTALONE` werdykt zgodności NIE jest wydawany — status `BRAK_PODSTAWY` z nazwanym parametrem, warstwą, stanem i potrzebnym dokumentem, a wynik obliczeniowy wobec przyjętej wartości jest pokazywany informacyjnie. Dokument formalny twierdzący zgodność wymaga stanu `ZWERYFIKOWANE` albo `WSKAZANE` każdego użytego limitu. | Pierwotne O-2 dopuszczało „spełnia" wobec liczby nieznanego pochodzenia z samym oznaczeniem — poprawka właściciela (§12, §17, §37) wymaga, by brak podstawy był stanem werdyktu, nie przypisem. Blokada liczenia odebrałaby produktowi wartość (marginesy, trajektorie), przemilczenie byłoby fałszem. | Stan źródła w profilu, w śladzie solvera PTPiREE, w każdym rekordzie oceny i w dokumentach. Dokumenty z OD-21 podnoszą stan do `ZWERYFIKOWANE` bez zmiany kodu; dziś WSZYSTKIE parametry warstwy zastanej (statyzm, strefa martwa, rampa, zakres Q, cosφ, obwiednie LVRT/HVRT, odbudowa P) i kryteria akceptacji procedury (tolerancje) mają stan `NIEUSTALONE` → wymagania oceniane wobec nich kończą się `BRAK_PODSTAWY` do czasu dołączenia dokumentów. |
| **O-3** | **LFSM-O jest wymaganiem zdolności od typu A** (dla PPM i SPGM); obowiązek wykazania: certyfikat urządzenia pokrywa wymaganie → `CERTYFIKAT`; bez certyfikatu → wymagany test/symulacja (T01). Rozdzielamy „wymagalność zdolności" od „sposobu wykazania" (`AcceptedEvidenceMethod` = `sposob_wykazania`). Tak samo dla pozostałych wymagań typu A bez testu w katalogu T01–T20 (zakres częstotliwości, RoCoF, warunki przyłączenia, stała moc, dopuszczalne obniżenie mocy przy spadku f): bez certyfikatu i bez metody obliczeniowej → `BRAK_DOWODU` **z wyjaśnieniem, jaka metoda byłaby właściwa i czego brakuje**, nigdy „zgodny". | Moduł typu A dostawał certyfikat „zgodny" na samej deklaracji T12 (dowód: sonda `probe_cert.py`, 2026-09-22). | Wynik zgodności per wymaganie (§4, §6); bramka certyfikatu czyta pełne rekordy braków. |
| **O-4** (OD-33) | **Jedna obwiednia FRT** na profil, w profilu regulacyjnym, z proweniencją. Kasacja obwiedni `application/stability/voltage_trajectory.py` i kopii frontowej `frtEnvelopeValidator.ts`. | Trzy sprzeczne obwiednie dla tej samej normy. | Obwiednia wersjonowana; do czasu dokumentu stan `NIEUSTALONE` (→ `BRAK_PODSTAWY` werdyktu, O-2′). |
| **O-5** (OD-20, OD-15b; B-01) | Zgoda na: (a) ocenę T14/T15/T16/T17 z wyniku kanonicznego biegu dynamiki; (b) kasację `solvers/frt_hvrt/**` i `solvers/stability_rms/**` po migracji ścieżek użytkownika; (c) korektę LFSM-O w GFL (jednostronność dla źródeł bez magazynu, moc dostępna, Pref z profilu, filtr pomiaru f). Do czasu (a) T14/T15 nie mogą orzekać `pass` bez symulacji → `no_data` z powodem. | Tautologia T14/T15; MVP FRT z fałszywym werdyktem „w obwiedni" (dowód: `probe_frt_mvp.py`); `stability_rms` żyje wyłącznie w testach (dług wg ZASADY NR 1). | Edycje `network_model/solvers/**` z parytetem i testami klasy. |
| **O-6** | Bramka korygująca P0 wykonywana **od razu w AB-1a/AB-1c**, nie osobno: (i) werdykt FRT oceniany wobec obwiedni profilu na przebiegu z silnika kanonicznego; (ii) test maskujący `tests/enm/test_ncrfg_model_bridge.py:379-380` przepisany; (iii) blokada certyfikatu typu A bez podstawy (O-3). | ZASADA NR 3: wykryte = naprawione. | — |
| **O-7** | Polityka wyroczni PPM: dwie niezależne drogi (półanalityczna + narzędzie zewnętrzne ANDES tam, gdzie struktury modeli dają się dopasować) = L5 w zadeklarowanej domenie; porównanie z pomiarem jako `VALIDATED_AGAINST_TEST` w AB-7. **Minimalna wyrocznia GFL (AB-1d_min) poprzedza AB-1c** — werdykt FRT nie może powstać na modelu bez wyroczni. | Standard §58; dziś żadna rodzina PPM nie ma wyroczni. | AB-1d_min, AB-1d. |
| **O-8** (OD-12) | Założone S_k″ źródła sieciowego propaguje stan `UNVALIDATED_INPUT` do wyniku zgodności (widoczny w werdykcie z wartością przyjętą). | Wiarygodność liczby zależy od danych wejściowych (R9 §M: rozpiętość 10,25 %). | Oś „status danych" w dowodzie (§4). |
| **O-9** (OD-11) | Pozostaje otwarte; punkty pracy przy granicach Q oznaczane jako poza zakresem ważności wyniku zgodności do czasu naprawy przełączeń PV→PQ. | Mechanizm odtworzony niezależnie w rundzie A1/K1. | Warunek domeny w kryteriach. |
| **O-10** | Kolejny etap: **AB-1** (profil regulacyjny nad silnikiem + pionowy wycinek FRT typu B), rozszerzony o źródło testowe U/f/θ i zdarzenia przypisania stanu (potrzebne już dla stanowiska FRT). | Usuwa fałszywe werdykty ze ścieżki użytkownika; tworzy warstwę wielokrotnego użytku dla wszystkich kolejnych testów A/B. | §5. |

### 2.2 Delta decyzji — poprawka „zakaz lakonicznych werdyktów" (2026-09-22) i mandat kontynuacji (2026-09-23)

| Id | Decyzja | Uzasadnienie | Skutek |
|----|---------|--------------|--------|
| **O-11** | **Kontrakt werdyktu wyjaśnialnego** (`docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md`) jest kontraktem DOMENOWYM całego produktu: `OcenaKryterium` (poziom K) i `WynikWymagania` (poziom W) nie mogą istnieć bez `WyjasnienieWerdyktu`; status maszynowy (`SPELNIA` / `NIE_SPELNIA` / `NIEJEDNOZNACZNY` / `NIE_OCENIONO` / `BRAK_PODSTAWY` / `BRAK_DOWODU` / `NIE_DOTYCZY`) jest wyłącznie enumem do agregacji, filtrów i API. Wprowadzany od AB-1a (nie odkładany na UI). | Stała zasada właściciela 2026-09-22; poprzednia forma „wynik per wymaganie = status" była zbyt lakoniczna. | §4, §6, §8; testy T1–T13 i strażnik kontraktowy z §11–§12 kontraktu. |
| **O-12** | Dwie niezależne osie: `status_maszynowy` (wynik kryterium na danych) i `kompletnosc_dowodu` (`PELNY` / `NIEPELNY` z powodami). `SPELNIA` na poziomie wymagania wymaga obu; kryteria spełnione przy dowodzie niepełnym → `BRAK_DOWODU` z wyjaśnieniem, co jest spełnione obliczeniowo i czego brakuje. Naruszenie wykazane na modelu niezwalidowanym pozostaje `NIE_SPELNIA` z zastrzeżeniem (kierunek zachowawczy). | §14, §17, §18 poprawki: „brak symulacji ≠ spełnia", „UNVALIDATED_MODEL ≠ pełny dowód". | Bramka certyfikatu i wniosku do OSD czyta obie osie. |
| **O-13** | Zakaz „master PASS": wymaganie z wieloma kryteriami (FRT: pozostanie w pracy, aktywacja prądu biernego, wielkość prądu biernego, ogranicznik prądu, odbudowa P, stan końcowy) niesie WSZYSTKIE oceny składowe; agregat negatywny nazywa wszystkie naruszone kryteria, agregat pozytywny wskazuje kryterium o najmniejszym marginesie względnym. | §28–§30 poprawki; §11 mandatu kontynuacji (sześć kryteriów FRT mierzonych osobno). | AB-1c. |
| **O-14** | Niepewność numeryczna metryk symulacyjnych używanych w ocenie = bieg kontrolny z połowionym krokiem całkowania (`u = |m(h) − m(h/2)|`); `|margines| ≤ u` → `NIEJEDNOZNACZNY`. Porównanie deklaracji: niepewność „nie dotyczy" z powodem. | §21 poprawki: nie wymuszać wniosku binarnego tam, gdzie dane na to nie pozwalają. | AB-1b (rdzeń liczy metryki i ich niepewność), AB-1c. |
| **O-15** | Zakres ważności jest polem każdego wyniku dynamicznego i częstotliwościowego (domena fizyczna, model, technologia, symetria zakłócenia, parametry sieci ze statusem danych, regulator, ograniczniki, wykluczenia). Wynik dla zwarcia trójfazowego w składowej zgodnej nie jest opisywany jako obejmujący zwarcia niesymetryczne (te — W6-K). | §20 poprawki; §7 mandatu kontynuacji (`PhysicsDomain` jawny). | Kontrakt wyniku; UI i raport. |
| **O-16** | Jeden kontrakt dla UI i dokumentów formalnych: karta werdyktu (`ui2/wyniki/wzorzec`) i serializer bloku dokumentu czytają TEN SAM rekord; zdanie wyjaśnienia powstaje w JEDNYM generatorze backendu z pól rekordu. Strażnik kontraktowy `werdykt_wyjasnialny_guard` (AST + OpenAPI + moduł mapowania etykiet + renderery) z zapadką na inwentarzu §8. | §22–§24, §32 poprawki. | AB-1a (guard + karta), migracja przekrojowa §8. |
| **O-17** | Warstwa **WiPWC** (Warunki i Procedury Wykorzystania Certyfikatów PTPiREE, wersja) jest źródłem reguły „certyfikat urządzenia pokrywa wymaganie dla typu X" (`certyfikat_pokrywa_typy`), a nie procedura testowania; rejestr certyfikowanych falowników (`ptpireeCertifiedInverters`, dziś wersje `WiPWC 1.2`/`1.3` w interfejsie) przenosi się do warstwy katalogowej backendu z wersją i stanem źródła. Warstwa **OSD** dostaje **Bank Nastaw** (nastawy zabezpieczeń DER wymagane przez OSD: progi U/f, czasy, LoM) jako parametry z proweniencją — czytane przez AB-5 (zabezpieczenia w pętli czasu) i przez ocenę FRT (nastawy U< modułu). | §95 mandatu kontynuacji; dziś reguła certyfikatu jest zaszyta w `nc_rfg.yaml` bez dokumentu źródłowego, a rejestr certyfikatów żyje w interfejsie. | AB-1a (warstwy `wipwc.yaml`, `operatorzy/<id>.yaml: bank_nastaw`), AB-5. |
| **O-18** | **`ComplianceStimulus ≠ PhysicalNetworkDisturbance`**: badanie zgodności odbywa się na źródle testowym U/f/θ (emulator sieci narzuca profil z wymagania — tryb stanowiska), zaś zakłócenie fizyczne (zwarcie w sieci z impedancją, miejscem, czasem wyłączenia) jest osobnym rodzajem scenariusza (tryb sieci). Oba są scenariuszami TEGO SAMEGO silnika; wynik nazywa tryb w zakresie ważności; wynik trybu sieci może uzupełnić ocenę wymagania wyłącznie tam, gdzie kryterium wymagania jest zdefiniowane dla przebiegu w punkcie przyłączenia (np. obowiązek pozostania w pracy, gdy U_PCC(t) ≥ obwiednia). | §95 mandatu kontynuacji; mieszanie obu trybów prowadziło do fałszywego „w obwiedni" (frt_hvrt MVP). | AB-1b (emulator + zdarzenia przypisania stanu), AB-1c (dwa tryby ekranu FRT). |
| **O-19** | **Domena fizyczna jawna** (`PhysicsDomain`: `POWER_FLOW`, `SHORT_CIRCUIT`, `RMS_DYNAMICS`, `SEQUENCE_DOMAIN`, `HARMONIC_FREQUENCY_DOMAIN`, `SUPRAHARMONIC_FREQUENCY_DOMAIN`) jest polem każdego wyniku i każdej sekcji modelu urządzenia w katalogu (`fundamental` / `short_circuit` / `dynamic` / `harmonic` / `supraharmonic` / `certification` / `measurement` / `validation`, każda z własnym statusem `VALIDATED` / `UNVALIDATED` / `MEASURED` / `CERTIFIED` / `UNKNOWN` / `OUTSIDE_DOMAIN`). Zakaz mieszania fazora RMS 50 Hz, RMS harmonicznego, widma, przebiegu chwilowego i EMT. | §6–§8, §68 mandatu kontynuacji. | Kontrakt wyniku i katalogu (AB-1a: pola addytywne; AB-H0). |
| **O-21** (ETAP 6, po audycie §3b) | Istniejący tor harmoniczny (`network_model/solvers/v126_academic.py::_power_quality`, `_ybus(harmonic)`, skan Z i „rezonanse") jest **POZORNY** (dowody P1–P14 audytu: brak przekładni transformatora, R transformatora bez U², sieć zastąpiona admitancją 1e6 S na pierwszej szynie, brak kondensatorów/odbiorów/źródła, 18 zaszytych rzędów z cichym odrzucaniem pozostałych, suma koherentna faz 0, THD wobec U_n zamiast U₁ z rozpływu, 188 „rezonansów" dla jednego; scena demonstracyjna pokazuje THD_U 3049 % przypięte jako złote). Decyzja: **nowy pakiet `network_model/solvers/harmoniczne/`** na kanonicznym budowniczym admitancji `core/ybus.py` rozszerzonym o częstotliwość (AB-H1), z wyroczniami niezależnymi; po pokryciu ekranu E-40 nowym solverem — kasacja funkcji harmonicznych z `v126_academic.py` (B-01 z delegacji planu, parytet niemożliwy i niepożądany — akceptacja wyłącznie wyroczniami). Do tego czasu (AB-1a) wynik E-40 nie jest werdyktem: `compatibility_status` → `NIE_OCENIONO` z wyjaśnieniem „solver bez wyroczni, model niezwalidowany", etykieta sanity „zweryfikowany" → „w paśmie wiarygodności" (dotyczy też pasm zwarciowych), złota fikstura 3049 % nie może być przypięta jako poprawna (test plauzybilności THD < 100 % zastępuje pin). Klasyfikacja szczegółowa: §3b. | Audyt Opus 5.5 (ETAP 5): „jeden solver i jest błędny"; §92 mandatu kontynuacji (VERIFY → REPRODUCE → FALSIFY → DECIDE). | AB-1a (uczciwość natychmiast), AB-H0/H1 (nowy solver), §11. |
| **O-22** (OD-37) | **Silnik indukcyjny i modele odbiorów są rodziną modeli produktu:** AB-1b.3 wprowadza architekturę odbiorów (stały PQ z przejściem do stałej impedancji poniżej U_min, ZIP z parytetem rozpływu, czuły częstotliwościowo, złożony) — bez tego głęboki zapad w stałym PQ kończy się odmową algebry, co blokuje FRT w trybie sieci; silnik indukcyjny (utyk, ponowny rozruch, prąd pozwarciowy) jako przyrost **AB-3b** PRZED AB-5, bo utyk silników steruje odbudową napięcia po zwarciu i zachowaniem zabezpieczeń. | Przegląd Opus 5.5 (ETAP 4) #22 i (c)8: OD-37 do rozstrzygnięcia przed AB-5. | AB-1b.3, AB-3b. |
| **O-23** | **AB-1b dzieli się na trzy części** (1b.1 zdarzenia rdzenia — w tym **zdarzenia warunkowe** jako prymityw silnika, 1b.2 fizyka GFL, 1b.3 odbiory); zdarzenie warunkowe (dozór g(t)=0 lokalizowany z dokładnością zdarzeń planowanych) jest wspólną zależnością AB-1c (wyzwolenie U< modułu, licznik podtrzymania I_q), AB-2 (aktywacja LFSM), AB-4 (BMS) i AB-5 (przekaźniki) — nie powstaje w AB-5. Ogranicznik prądu GFL działa dziś na ZADANIU przed członami inercyjnymi o różnych stałych czasowych, więc rzeczywisty \|I\| przekracza i_max o 4–7 % (sonda P1) — naprawa (ogranicznik na rzeczywistym wektorze prądu, anti-windup) i mutacja „limit przed inercją, T_p ≫ T_iq" należą do AB-1b.2, a AB-1d_min obejmuje stan przejściowy ogranicznika i odniesienie ΔU do filtrowanego U_pre. Konwencja osi: w ramce PLL rdzenia d = składowa bierna, q = czynna — kontrakt kanałów nazywa osie jawnie (`i_czynny_pu`, `i_bierny_pu`), nigdy „I_d/I_q" bez konwencji. | Przegląd (ETAP 4) #2d, #3, (c)2–3. | §5. |
| **O-24** | **Nowy przyrost AB-5b** (mapuje W6-D/W6-E zamrożenia): kryterium stabilności kątowej Φ zdefiniowane fizycznie (kąt względny / energia, nie `delta_max_rad` w ramce synchronicznej), CCT automatyczne z przeglądem monotoniczności przed bisekcją i M_CCT = t_CCT − t_clear, analiza małosygnałowa z zadeklarowaną domeną — dla synchronicznych modułów typu A/B (kogeneracja, biogaz, mała hydroenergetyka w SN); PRZED AB-6 (najgorszy przypadek potrzebuje Φ). Metryki zadeklarowane a nigdy nieprodukowane (`cct_s`, `rocof_max_hz_s` w `ResultSetDynamicV1`, N-4) dostają producentów odpowiednio w AB-5b i AB-2 — do tego czasu są jawnie `None` z powodem, nie polami-obietnicami. | Przegląd (ETAP 4) #17–#19, (a)9, (c)9; linia DEFER §5 implikowała Φ/CCT w zakresie bez przypisania. | §5. |
| **O-25** | **Uczciwość natychmiastowa w AB-1a** (ZASADA NR 3; fałszywe werdykty żyją na ścieżce użytkownika — sonda P3: 0,06 pu przez 3 s → „w obwiedni"): werdykty `frt_trajektorie`/`frt_sekwencja` → `NIE_OCENIONO` z powodem („trajektoria nie jest rozwiązaniem sieci; kryterium v > 0,05 wobec profilu wejściowego jest tautologią"), werdykt toru T1 (`_execute_dynamic_stability` z kątów wpisanych przez użytkownika, syntetyczne U(t)/f(t), `automation_trace` z narracją „wyłączone przez zabezpieczenia") → `NIE_OCENIONO` z powodem; tor T1 (`enm/canonical_analysis.py::_execute_dynamic_stability`, `application/automation/trace.py`, `application/stability/*`, `ui2/wyniki/stabilnosc`) trafia do inwentarza kasacji AB-1c obok `frt_hvrt`, `stability_rms`, `voltage_trajectory`, `frtEnvelopeValidator.ts`. Rozbieżności kontraktu W6-A z kodem i testami (próbka f w chwili zdarzenia przypięta jako ROZRÓŻNIALNA wbrew §5.2; publikowana tylko próbka prawostronna wbrew §5.3; otwarta gałąź publikuje dokładne 0 wbrew F-13) rozstrzyga AB-1b.1 zgodnie z kontraktem (próbki obustronne, f w chwili zdarzenia NIEDOSTĘPNA, prąd otwartej gałęzi „niedostępny", nie 0). Wartość zastępcza f = 50,0 Hz przy niedostępności → `None` z kodem jakości; konsument bez odczytu `jakosc_f` = błąd kontraktu (test). | Przegląd (ETAP 4) (a)3–7, (b)1–2, (b)6, (c)1. | AB-1a, AB-1b.1, AB-1c. |
| **O-20** | **Harmoniczne i supraharmoniczne wchodzą do programu A/B jako zależności istniejących przyrostów** (pomocnicze karty `AB-H0…AB-H4` w tym samym workstreamie, §5): kontrakty dziedziny częstotliwości i modele źródeł widmowych (AB-H0) w fundamencie AB-1; solver Y(f) z rozpływem harmonicznym, skanem częstotliwościowym i rezonansem (AB-H1) jako zależność AB-4 (BESS harmoniczny) i AB-6 (przemiatania); supraharmoniczne (AB-H2) jako zależność AB-4 i AB-7; filtry i analiza udziałów (AB-H3) w AB-6; import widm z pomiaru i walidacja (AB-H4) w AB-7; sprzężenie RMS↔widmo przez migawki punktu pracy w AB-3/AB-4/AB-6. Nic z istniejącej sekwencji AB-1…AB-7 nie zostaje zastąpione. Do decyzji ADOPT/ADAPT/REWRITE/KEEP_RESEARCH_ONLY/REJECT istniejącego kodu harmonicznego (moduł „E-40", katalog widm) — audyt Opus 5.5, §3b. | §36–§67, §93 mandatu kontynuacji; „harmoniczne = THD" i „dodamy później" są niewykonaniem mandatu (§104). | §5, §9, §11. |

## 3. Najważniejsze ustalenia analizy luk A/B (stan `ef9f6228`)

1. Zwalidowany rdzeń DAE (L5 D-01…D-07, L4 D-08…D-10; R10 = W6-F ACCEPTED DONE — nie otwierać
   ponownie bez rzeczywistej regresji; zachować fail-closed dependencies, wyspę bez źródła
   wykrywaną przed Newtonem, numerical firewall, harness mutacji, niezależne wyrocznie, kontrakt
   częstotliwości szyny, dowód CCT, skorygowane taktowanie ANDES, CI na dokładnym SHA,
   odtwarzalność dowodu) jest osiągalny tylko przez API; werdykty FRT na ścieżce użytkownika
   liczą namiastki (`frt_hvrt` MVP, algebra PTPiREE, syntetyczna trajektoria).
2. Fałszywie pozytywny werdykt FRT „w obwiedni" przy 187 naruszeniach obwiedni profilu
   (margines liczony względem stałej 0,05 pu, `frt_hvrt/engine.py:102-105`).
3. T14/T15 = tautologia (`simulated_voltage = limiting.voltage_pu`), przypięta testem maskującym.
4. Typ A: certyfikat „zgodny" na samej deklaracji T12; brak testów zakresu f, RoCoF, warunków
   przyłączenia; T01 niewymagany dla PPM A/B.
5. Dwa sprzeczne modele LFSM-O (rozpływ: Pref = P₀, jednostronnie; dynamika: Pref = S_n,
   symetrycznie — PV podnosi moc przy podczęstotliwości ponad moc dostępną).
6. Żadna rodzina PPM nie ma wyroczni (C2–C5, H4).
7. Brak warstwy regulacyjnej: 5 identycznych YAML, bez wersji WOS/PTPiREE, bez źródeł, progi =
   maksima UE; klasyfikacja zdublowana w UI (`ui2/oze/ranking/rankingModel.ts::klasaNcRfg`).
8. (poprawka 2026-09-22) Wynik zgodności planowany jako status bez wyjaśnienia; istniejące
   powierzchnie wyników pokazują lakoniczne werdykty — inwentarz i klasyfikacja w §8.

### 3a. Macierz luk dynamiki RMS (przegląd Opus 5.5, ETAP 4, 2026-09-23)

Pełny raport z dowodami wykonanymi (E1: SO-1A 10 passed; E2: manifest/obserwable/bramki 90
passed; sondy P1–P3): `docs/audit/ab-raw/MACIERZ_LUK_DYNAMIKI_OPUS_2026-09-23.md`. Skrót (stan na
`ef9f6228`; kolumna „Plan" = przyrost po korekcie ETAP 6):

| # | Zdolność | Stan w repo | Plan |
|---|----------|-------------|------|
| 1 | zwarcie → wyłączenie → stan pozwarciowy z obserwablami | CZĘŚCIOWE: tylko zwarcie 3F na szynie (`dynamika/zdarzenia.py:142-203`), brak miejsca zwarcia w linii (x·L), brak fazora prądu (tylko moduł), próbki zdarzeń tylko prawostronne, brak predykatu izolacji zwarcia | AB-1b.1 (predykat izolacji, próbki obustronne), W6-K (niesymetria), adapter x·L w AB-1b.1 |
| 2a–2f | FRT sześć kryteriów | 2a BRAK w rdzeniu (GFL nigdy się nie odłącza) + POZORNE na ścieżce użytkownika (P3); 2b BRAK (brak opóźnienia aktywacji i metryki); 2c CZĘŚCIOWE (I_q wobec progu, nie ΔU od U_pre; kanał wsparcia niepublikowany); 2d POZORNE (ogranicznik na zadaniu; \|I\| do +7,4 %; test przypinający ślepy przez T_p = 2·T_iq); 2e CZĘŚCIOWE (mechanizm bez metryk); 2f BRAK | AB-1b.2 (fizyka), AB-1d_min (wyrocznia z ogranicznikiem), AB-1c (kryteria) |
| 3 | szybki prąd zwarciowy (I_d/I_q, \|I\| ≤ I_max, strefa martwa, wzmocnienie, opóźnienie, zależność od U, nasycenie, priorytet, zwolnienie) | osie d/q w ramce PLL: d = bierna, q = czynna (ryzyko błędnej etykiety); brak opóźnienia i podtrzymania; strefa martwa = próg; nasycenie tylko na zadaniu | AB-1b.2 |
| 4 | metryki odbudowy P (start, gradient, czas do k·P_pre, przeregulowanie, stan końcowy, ograniczenie dostępnością) | BRAK metryk; okno GFL [0, S_n] bez P_available w ENM (`enm/dynamika_modele.py:215-254`) | AB-1b.2 (metryki + pole P_available), AB-1c |
| 5 | LFSM-O jako symulacja | POZORNE/CZĘŚCIOWE: strefa martwa symetryczna w oknie [0, S_n] (PV podnosi P przy f < f_n), f z PLL bez filtru, brak opóźnienia/rampy, brak stymulusa (szyna sztywna ma stałe f), T01 = porównanie nastaw | AB-1b.1 (emulator), AB-2 |
| 6 | regulatory P/Q/U | CZĘŚCIOWE: tylko Q = Q_zad, P = P_zad, Q(U) z nasyceniem; brak cosφ(P), cosφ = const, U = U_zad, ograniczeń tempa, punktu pomiaru; 4 tryby rozpływu vs 1 prawo dynamiki (COSPHI_P cicho zmienia prawo po t = 0); skoki nastaw odrzucane | AB-1b.1 (D13), AB-3 |
| 7 | BESS | CZĘŚCIOWE: dSOC/dt z η; granice SOC = odmowa (nie zachowanie BMS); brak kanałów E/I, trybów, wyroczni | AB-4 (+ zdarzenia warunkowe z AB-1b.1) |
| 8 | utrata źródła | CZĘŚCIOWE: pełne, nieodwracalne wyłączenie; jednoczesne przez zdarzenia w tym samym t; częściowa BRAK | AB-1b.1 |
| 9 | skoki obciążenia / generacji / nastaw | LOAD_STEP ISTNIEJE; GENERATION_STEP i skoki nastaw BRAK (odrzucane) | AB-1b.1 (D13) |
| 10 | zdarzenia topologiczne + reinicjalizacja | ISTNIEJE (L5) dla elementów czynnych i zamkniętych; zamknięcie sprzęgła / elementu normalnie otwartego BRAK (adapter porzuca gałęzie nieczynne); ponowne przyłączenie źródła BRAK; RECLOSE bez kontroli | AB-1b.1 (gałęzie nieaktywne w adapterze), AB-5 |
| 11 | SO-1A | wykonuje się, ale jest fizycznie niespójny: wyłącznik `wyl-pole` nie izoluje zwarcia (pierścień dalej zasila szynę), zwarcie znika przez `t_usuniecia_s` | AB-1b.1 (predykat spójności izolacji + poprawiona sieć G17) |
| 12–13 | SO-1B; IEC 60255 w pętli czasu | BRAK (tylko statyczne t = f(I)) | AB-5 |
| 14 | automatyka i dziennik działań | BRAK w dynamice; POZORNA narracja `automation_trace` z czasu wpisanego przez użytkownika | AB-5 (SPZ, SZR, odciążanie, generation shedding, dziennik), AB-1a (narracja → NIE_OCENIONO), AB-1c (kasacja) |
| 15 | wyspa | CZĘŚCIOWE: podział i odmowa bez źródła (L5); brak klasyfikacji GFL/GFM i bilansu P/Q (wyspa tylko z GFL kończy się kodem numerycznym); f = 50,0 Hz jako liczba przy niedostępności | AB-5 (D11), AB-1b.1 (f → None z kodem jakości) |
| 16 | ponowne przyłączenie ΔU/Δf/Δθ | BRAK | AB-5 (D12) |
| 17–19 | stabilność kątowa Φ, małosygnałowa, CCT | równania ISTNIEJĄ (L5), kryterium Φ BRAK (`delta_max_rad` to kąt bezwzględny); małosygnałowa tylko narzędzie testowe; CCT tylko w testach, bez kontroli monotoniczności | AB-5b (O-24) |
| 20–21 | częstotliwość szyny; RoCoF | f szyny ISTNIEJE (L5); f_PLL niepublikowana; UI pokazuje syntetyczne f(t) toru T1; RoCoF BRAK (bez rozdziału bus/pll/rotor) | AB-1b.2 (f_PLL), AB-2 (RoCoF ×3, okno/filtr z danych), AB-1a/AB-1c (T1) |
| 22 | modele odbiorów | tylko stały PQ; ZIP odrzucany; głęboki zapad → odmowa algebry (blokuje FRT w trybie sieci) | AB-1b.3, AB-3b (O-22) |
| 23–24 | GFL minimum; GFM | GFL CZĘŚCIOWE (PLL bez wyroczni, ogranicznik POZORNY); GFM CZĘŚCIOWE (droop/VSM, nasycenie nie \|I\| = i_max, bez wyroczni; tożsamość GFL/GFM z dwóch źródeł: rodzina ENM vs `control_mode` katalogu) | AB-1d_min/1d, AB-4 (wyrocznia GFM), AB-1b.2 (jedna tożsamość: rodzina ENM, `control_mode` walidowany) |
| 25–26 | przemiatania min_p M(p); porównanie A/B | BRAK | AB-6 |
| 27 | emulator U/f/θ + zdarzenia przypisania stanu | BRAK | AB-1b.1 |
| 28 | niepewność i zakres ważności per wynik | CZĘŚCIOWE: `u_f_est` tylko błąd algebry; połowienie kroku tylko do sterowania krokiem; metryki na siatce wyjściowej (20 ms w SO-1A — minima między próbkami gubione); domeny manifestu tylko D-01…D-10 SMIB | AB-1b.2 (metryki na gęstej siatce + niepewność), O-14/O-15 |

Sprzeczności i dwa źródła prawdy (przegląd (a)): trzy modele LFSM-O (rozpływ / PTPiREE /
dynamika + nadpisania BESS i GFM) → jedna definicja w AB-2; obwiednia FRT w czterech miejscach
(`voltage_trajectory.py`, `frtEnvelopeValidator.ts`, profil, niejawne v > 0,05 w `frt_hvrt`) →
O-4; cztery żywe tory czasowe (rdzeń, `frt_hvrt`, T1, `stability_rms`) → O-5/O-25; cztery tryby
Q rozpływu vs jedno prawo dynamiki → AB-3; tożsamość GFL/GFM → AB-1b.2; kontrakt W6-A vs kod →
O-25; nazewnictwo prądu gałęzi jedno- vs dwustronne (OD-35) → AB-1b.1; metryki zadeklarowane a
nieprodukowane → O-24; sprzeczności wewnątrz planu (kasacja `voltage_trajectory` przy żywym T1;
Φ/CCT bez przyrostu; U< modułu wymagające zdarzeń warunkowych) → O-24/O-25/O-23.

### 3b. Macierz luk harmonicznych i supraharmonicznych (audyt Opus 5.5, ETAP 5, 2026-09-23)

Pełny raport z sondami P1–P14 i dowodami wykonanymi:
`docs/audit/ab-raw/AUDYT_HARMONICZNE_SUPRAHARMONICZNE_OPUS_2026-09-23.md`. Werdykt audytu: **jeden
solver (`v126_academic.py::_power_quality`, :393-520) i jest błędny**; supraharmoniczne,
interharmoniczne, filtry, import widm i parametry pomiaru nie istnieją nigdzie w repozytorium;
żaden wynik harmoniczny nie ma niezależnej wyroczni; złota fikstura harnessu przypina THD_U 3049 %.

Klasyfikacja (decyzja Fable po audycie; O-21):

| Element | Klasa | Przyrost |
|---------|-------|----------|
| `_power_quality` (rozpływ harmoniczny), `_ybus(harmonic)`, skan Z i flagi rezonansu (`v126_academic.py:240-296, 393-520`) | REWRITE → nowy pakiet `network_model/solvers/harmoniczne/` na `core/ybus.py`(f); kasacja funkcji z v126 po pokryciu E-40 | AB-H1 |
| `_grid_source_shunt_admittance` (:298-332) — stały podział R = 0,15·Z, X = 0,99·Z | ADAPT: R/X z `Source` ENM (`rx_ratio`, `r_ohm`, `x_ohm`), także na torze harmonicznym | AB-H1 |
| SSCI Z_conv(f) (:551-675) | ADAPT: model literaturowy z założeniami zostaje; Z_grid na wspólnym Y(f) (dziś ×1400 dla szyny 0,4 kV — P13) | AB-H1 |
| `V126HarmonicSourceInput` (`solver_input/v126_contracts.py:103-114`) | REWRITE → typowany model źródła (rodzaj, f ∈ ℝ⁺, moduł, faza, punkt pracy, proweniencja, wersja, status walidacji) | AB-H0 |
| `ConverterType.harmonic_spectrum_percent` (`catalog/types.py:1397`) — 0 z 179 kart ma widmo | ADAPT: faza, prąd odniesienia, widma per punkt pracy, dokument, status | AB-H0 |
| most ENM → wejście (`v126_contracts.py:737-944`) | ADAPT: kondensatory (`ShuntCapacitor` dziś niemapowany), impedancja źródła, modele odbiorów, grupa połączeń, prąd z punktu pracy (dziś znamionowy), `wind_inverter` | AB-H1 |
| bramka gotowości `_warunki_harmoniczne` i kod `generator.harmonic_spectrum_missing` | ADOPT | — |
| widma ręczne (API `harmonic_spectra`, formularz UI) | ADAPT: faza; odrzucanie rzędów nieobsługiwanych (dziś 2..50 przyjmowane i cicho porzucane) | AB-H0 |
| surowe nadpisanie `parameters.harmonic_sources` (`api/v126_academic.py:179-184`) z fałszywą proweniencją `KATALOG` | REJECT | AB-1a (kasacja) |
| limity 8/5/5 % i katalog `harmonic-limits` (solver :455-460, `v126_katalog.py:244-246`, api :420-425) | REWRITE → rejestr wymagań jakości energii z dokumentem/wydaniem/poziomem napięcia/punktem/statystyką; limity indywidualne dziś tylko wyświetlane, nigdy oceniane | AB-H0 |
| T20 THD_U ≤ 8 % (`ncrfg_ptpiree/engine.py`, `procedura_ptpiree.yaml:44-45`) | REJECT kryterium (THD napięcia urządzenia wobec wartości napięcia zasilającego o stanie NIEUSTALONE) → kontrola emisji prądu w punkcie przyłączenia wobec limitów przydzielonych przez OSD; do AB-H1: `BRAK_PODSTAWY` (O-2′) | AB-1a (stan), AB-H1 (nowe kryterium) |
| migotanie (`application/analyses/migotanie.py`) | ADAPT: forma Pst = c·S_n/S_k i sumowanie m = 3 poprawne z wyroczniami ręcznymi; przeniesienie do warstwy solverów, c(ψ_k), Plt ≠ Pst, poziom planowania ≠ limit emisji (przydział etapu 2, tło) | AB-H1 |
| VUF (`power_flow_unbalanced`), pasma ±10 % U_n EN 50160 | ADOPT (poza zakresem harmonicznych; wydanie i statystyka do rejestru) | AB-H0 |
| prezentacja E-40 (`ui2/wyniki/akademickie/prezentacja.ts:238-270`) | ADAPT: U_h, I_h, Z(f), rezonanse; tekst „następny krok" wskazuje nieistniejący widok skanu i filtr | AB-H1 |
| zakładki `widmo`/`z-f`/`flicker` (`ui/workspace/types.ts:801`), oś DER „THDi/THDu" (niemontowana), `PowerQualityMeter` tylko w UI | REJECT do czasu realnego zaplecza | AB-1a (kasacja) |
| wpis rejestru zdolności (`solver_capability_registry.py:219-231`: „implemented", wersja 1.0, test odniesienia = determinizm) | ADAPT: status `UNVALIDATED`, wersja i test zgodne ze stanem | AB-1a |
| testy (determinizm z fikturą 110/15 kV między szynami 15 kV i asercją `thd >= 0`; most tautologiczny — zero źródeł; złota fikstura 3049 %) | REWRITE | AB-1a (plauzybilność), AB-H1 (wyrocznie) |
| twierdzenia karty (`v126_katalog.py:346-349,393`: „rzędy 2–49", „moc zwarciowa źródła", „wykrywanie rezonansów") i `MAPA_DOMKNIECIA:239` | REWRITE (twierdzenia fałszywe) | AB-1a |

Luki regulacyjne (każdy limit jakości energii w repo bez wydania / poziomu napięcia / punktu
pomiaru / statystyki; IEEE 519 stosowane do każdej szyny i niewiążące w Polsce; TDD bez tabeli
I_sc/I_L; IEC 61000-3-12 (nN, 16–75 A) cytowana dla przekształtników SN; brak tabel rozporządzenia
systemowego, limitów IRiESD, przydziału IEC/TR 61000-3-6, poziomów kompatybilności IEC 61000-2-2/
2-12, jakiegokolwiek dokumentu supraharmonicznego) → rejestr wymagań jakości energii AB-H0 z zerowym
przenoszeniem (nN→SN, urządzenie→instalacja, kompatybilność→emisja). Luki modeli (kabel R(f)/
naskórkowość/dielektryk/model rozłożony; transformator R, przekładnia, grupa połączeń, gałąź
magnesująca; źródło sieci; kondensator z p %; dławik; filtry; odbiory; silniki; admitancja Nortona
przekształtnika; X″·h maszyny; składowe i harmoniczne potrójne; flagi zakresu ważności) → AB-H1.
Luki wyroczni (żadna) → AB-H1: sieć 2- i 3-szynowa ręcznie, przekładnia transformatora, rezonans
równoległy h_r = √(S_k/Q_c), rezonans szeregowy filtra rozstrojonego, ćwierćfalowa kabla, sieć
benchmarkowa IEEE, OpenDSS jako kontrola zewnętrzna. Luki pomiarowe (brak elementu miernika
jakości w ENM — `Measurement` tylko CT/VT; brak importu widma/PQDIF/COMTRADE; brak parametrów
pomiaru; brak metryk model–pomiar) → AB-H4. Luki CI/mutacji (zadanie mutacji tylko dynamika; brak
strażnika cichego odrzucania rzędów, odniesienia 1e6 i braku przekładni; złota fikstura fałszywa;
E2E tylko zrzuty) → AB-H1/AB-1a.

### 3c. Macierz luk multi-physics (ETAP 4–5)

| Zdolność | Stan | Klasa | Przyrost |
|----------|------|-------|----------|
| rozpływ → harmoniczne (U₁, P/Q per źródło) | BRAK (THD wobec U_n; prąd znamionowy) | nowe | AB-H1 |
| RMS → migawka punktu pracy → model widmowy | BRAK (`dynamika/kontrakty.py:207-217` przyjmuje `PunktPracy` tylko jako wejście; brak wyjścia widmowego) | nowe | AB-3/AB-4 (migawki), AB-H2 |
| częstotliwość przełączania nigdy w DAE | ISTNIEJE (przez nieobecność) | ADOPT jako niezmiennik z guardem | AB-H0 |
| łańcuch PF → RMS → migawka → widmo → rozwiązanie harmoniczne | BRAK | nowe | AB-6 (E2E-MP1/MP2/MP3) |
| jedna admitancja dla PF / SC / harmonicznych | BRAK (zdublowane Y w omach w v126 vs `core/ybus.py`) | REWRITE | AB-H1 (parytet Y(h=1) z rozpływem) |
| sekcje modelu urządzenia per domena ze statusem | CZĘŚCIOWE (przekształtnik: podstawowa + SSCI + puste widmo + `flicker_c` z literatury; `catalog/der_dynamic`; migawka wykazu PTPiREE; brak statusu per sekcja) | ADAPT | AB-H0 |
| SSCI Z_conv / Z_grid | CZĘŚCIOWE (Z_grid błędne dla nN) | ADAPT | AB-H1 |
| emisja BESS zależna od SOC | BRAK | nowe | AB-4/AB-H2 |
| statystyki szeregów czasowych EN 50160 (95 % z 10-minutowych) | BRAK | nowe | AB-H4 (po QSTS) |

## 4. Architektura docelowa (§61/§62 mandatu; §6–§8, §65–§66, §74–§77 mandatu kontynuacji)

```
                              JEDEN ENM (topologia, urządzenia z sekcjami modeli per domena)
                                                │
      ┌───────────────┬──────────────────┬──────┴────────┬───────────────────────┬──────────────────────────┐
  POWER FLOW     SHORT CIRCUIT     RMS/DAE DYNAMICS   SEQUENCE DOMAIN   HARMONIC FREQ. DOMAIN   SUPRAHARMONIC FREQ. DOMAIN
 (stan ustalony)  (IEC 60909)  (jeden silnik: scenariusz  (niesymetria,   (Y(f), rozpływ harm.,     (E(f, punkt pracy),
                                = zdarzenia + stymulus /   W5/W6-K)        skan Z_th(f), rezonans,   propagacja, transfer,
                                zakłócenie fizyczne)                        udziały, filtry)          sprzężenie fazowe)
      └───────────────┴──────────────────┴───────────────┴───────────────────────┴──────────────────────────┘
                                                │  PhysicsDomain jawny w każdym wyniku
             Observables → Metrics (+niepewność) → Criteria (parametry z profilu, z podstawą)
                        → Margins → Evidence (metoda · poziom · status modelu · status danych)
                        → VerdictExplanation → EngineeringResult (OcenaKryterium)
                                                │
      dla zgodności: EngineeringResult → RegulatoryProfile → Applicability (typ × technologia)
                        → AcceptedEvidenceMethod (certyfikat / test / symulacja / obliczenie)
                        → ComplianceResult (WynikWymagania: oceny składowe + agregacja + kompletność dowodu)
                        → certyfikat / wniosek OSD / raport (ten sam rekord)
```

Zasady:

- jeden silnik na domenę fizyczną; test/badanie = szablon scenariusza + kryterium, nigdy osobny
  silnik; `ComplianceStimulus` (źródło testowe U/f/θ) ≠ `PhysicalNetworkDisturbance` (O-18);
- kryteria to czyste funkcje na wyniku biegu w warstwie analizy (interpretacja, zero fizyki);
  metryki i ich niepewność liczy rdzeń (O-14); wymagania nie liczą fizyki;
- `ComplianceResult` nie istnieje bez `VerdictExplanation` (O-11); brak parametru wymagania =
  `BRAK_PODSTAWY` z nazwanym parametrem (O-2′), nigdy liczba z kodu; brak metody = `BRAK_DOWODU`
  z nazwaną metodą właściwą (O-3);
- sprzężenie RMS ↔ widmo: trajektoria RMS → migawka punktu pracy (P, Q, U, SOC, tryb, ogranicznik)
  → wybór modelu widmowego urządzenia → rozwiązanie w dziedzinie częstotliwości; częstotliwość
  przełączania nigdy nie wchodzi do DAE;
- agregacja wielu źródeł widmowych ma JAWNĄ metodę (suma fazorowa / statystyczna / obwiednia
  zachowawcza) zależną od rodzaju danych; tło sieci jest wejściem (`U_background`, `U_plant`,
  `U_combined`), nigdy domyślnym zerem;
- ślad WHITE BOX per domena: dynamika (`WARUNEK POCZĄTKOWY → MODEL → ZDARZENIE → DAE → OBSERWABLA →
  METRYKA → KRYTERIUM → MARGINES → PRZYCZYNA → WYJAŚNIENIE`), harmoniczne (`WIDMO ŹRÓDŁA →
  CZĘSTOTLIWOŚĆ → MODELE ELEMENTÓW → Y(f) → ROZWIĄZANIE → WIDMO SZYN/GAŁĘZI → METRYKA → KRYTERIUM →
  MARGINES → UDZIAŁ ŹRÓDŁA → WYJAŚNIENIE`), rezonans (`TOPOLOGIA → Z_element(f) → Y(f) → Z_th(f) →
  MAKSIMUM → ELEMENTY ODPOWIEDZIALNE → WRAŻLIWOŚĆ → SKUTEK INŻYNIERSKI`), supraharmoniczne (`PUNKT
  PRACY → MODEL EMISJI → MODEL SIECI(f) → TRANSFER → WIDMO ODBIORNIKA → METRYKA PASMA → KRYTERIUM →
  MARGINES → WYJAŚNIENIE`);
- wspólny szkielet wariantów (`PARAMETR → BIEG → METRYKA → MARGINES`) dla dynamiki (CCT, FRT, nadir
  f, RoCoF, odbudowa), harmonicznych (THD, U_h, I_h, wzmocnienie rezonansowe) i supraharmonicznych
  (szczyt, metryka pasma, transfer); najgorszy przypadek liczony osobno per metryka — zakaz
  jednego sztucznego wskaźnika łączącego domeny;
- jedna przeglądarka wyników i jeden SLD: kliknięcie szyny/urządzenia otwiera wyniki PF, SC,
  dynamiki, harmonicznych, skanu częstotliwościowego, supraharmonicznych — bez „drugiego świata".

## 5. Przyrosty programu

Sekwencja bazowa (mandat kontynuacji §4, skorygowana po ETAP 4–6): **AB-1a → AB-1b.1 → AB-1b.2 →
AB-1b.3 → AB-1d_min → AB-1c → AB-1d → AB-2 → AB-3 → AB-3b → AB-4 → AB-H1 → AB-5 → AB-5b → AB-H2 →
AB-H3 → AB-6 → AB-H4 → AB-7** (+ W6-K po W5; AB-H0 wewnątrz AB-1). Karty `AB-H0…AB-H4` są pomocniczą
numeracją zależności harmonicznych/supraharmonicznych WEWNĄTRZ tej sekwencji, nie osobną roadmapą;
fale migracji werdyktów WW-0…WW-4 (§8) biegną równolegle od AB-1a. Nic z pierwotnej sekwencji nie
zostało zastąpione — podział AB-1b i dodanie AB-3b/AB-5b wynikają z macierzy §3a.

| Przyrost | Zakres | Realizuje (fale/macierz) | DoD |
|----------|--------|--------------------------|-----|
| **AB-1a** | **Uczciwość natychmiastowa (O-21, O-25):** werdykty `frt_trajektorie`/`frt_sekwencja` i toru T1 → `NIE_OCENIONO` z powodem; E-40 `compatibility_status` → `NIE_OCENIONO`, etykieta „zweryfikowany" → „w paśmie wiarygodności", złota fikstura 3049 % → test plauzybilności, wpis rejestru zdolności `UNVALIDATED`, kasacja nadpisania `harmonic_sources`, zakładek/osi/miernika bez zaplecza, fałszywych twierdzeń karty E-40. Profil regulacyjny v1: warstwy NC RfG / WOS / procedura PTPiREE / **WiPWC** / OSD (IRiESD, warunki przyłączenia, **Bank Nastaw**), wersje, stan źródła; progi URE + D ≥ 110 kV; jedna obwiednia; kryteria solvera PTPiREE z profilu (zero liczb w kodzie); T01 dla PPM/SPGM A/B bez certyfikatu; T14/T15 bez symulacji → `no_data`; **kontrakt werdyktu wyjaśnialnego jako typy domenowe** (`OcenaKryterium`, `WynikWymagania`, `WyjasnienieWerdyktu`, `PodstawaWymagania`, `StatusDowodu`, `StatusModelu`, `StatusDanych`, `ZakresWaznosci`, `PhysicsDomain`) + generator zdania + testy T1–T13 + strażnik kontraktowy; każdy test PTPiREE emituje `OcenaKryterium` (kryterium, wynik z jednostką, limit z podstawą, margines, wyjaśnienie); wynik zgodności per wymaganie z agregacją O-13 i kompletnością dowodu O-12; bramka certyfikatu/wniosku OSD per wymaganie; klasyfikacja wyłącznie w backendzie; kasacja martwego pola `compliance_tests` (OD-26); wewnętrzna numeracja testów T01–T20 nazwana w kontrakcie jako identyfikatory repozytorium (nie numeracja procedury); karta werdyktu w `ui2/wyniki/wzorzec` i serializer bloku dokumentu (jeden rekord). | O-1…O-4, O-6(ii)(iii), O-11…O-17, O-19 (pola addytywne), OD-26 | pełna regresja backend + frontend, guardy (w tym nowy), e2e dotkniętych ścieżek, parytet klasyfikacji, testy iloczynu cech |
| **AB-H0** (w AB-1) | Kontrakty dziedziny częstotliwości: `PhysicsDomain` w wyniku i katalogu; sekcje modelu urządzenia per domena ze statusem (O-19); modele źródeł widmowych `CURRENT_SPECTRUM` / `VOLTAGE_SPECTRUM` / `NORTON_EQUIVALENT` / `THEVENIN_EQUIVALENT` / `MEASURED_SPECTRUM` / `FREQUENCY_DEPENDENT_EQUIVALENT` (częstotliwość, amplituda, faza, punkt pracy, źródło, wersja, status walidacji); `SupraharmonicBand` (f_min, f_max, rozdzielczość, pasmo agregacji, metoda pomiaru, dokument, wersja — bez zaszytej definicji); parametry pomiaru jako część danych widma; wymagania jakości energii w profilu regulacyjnym z dokładnym dokumentem/wersją/poziomem napięcia/podmiotem/punktem pomiaru/agregacją/pasmem/jednostką (zero przenoszenia limitów nN→SN, urządzenie→instalacja, kompatybilność→emisja). Decyzje wobec istniejącego kodu wg audytu §3b. | §7, §48, §54, §61, §68–§70 mandatu kontynuacji | kontrakty z testami, katalog z proweniencją per sekcja |
| **AB-1b.1** (rdzeń — zdarzenia) | **Zdarzenia warunkowe** (dozór g(t) = 0 lokalizowany z dokładnością zdarzeń planowanych; prymityw dla U< modułu, licznika podtrzymania I_q, aktywacji LFSM, BMS, przekaźników); zdarzenie przypisania stanu (D13) z reinicjalizacją algebry; skoki generacji i nastaw P/Q/U; częściowa utrata źródła; urządzenie źródła testowego U/f/θ jako `ComplianceStimulus` (skok, rampa, skok fazy — rampy bez czasu w protokole) odrębny od `PhysicalNetworkDisturbance` (O-18); adapter zachowuje gałęzie otwarte i wyłączone jako *nieaktywne* (odblokowuje zamknięcie sprzęgła i SZR); predykat spójności izolacji zwarcia (usunięcie zwarcia bez odcięcia węzła = odmowa) + poprawiona sieć G17 SO-1A; miejsce zwarcia x·L (podział linii w adapterze); próbki obustronne w chwili zdarzenia, f w chwili zdarzenia NIEDOSTĘPNA, prąd otwartej gałęzi „niedostępny", f = None z kodem jakości zamiast 50,0 Hz (O-25); prąd gałęzi dwustronny nazwany wg OD-35. | D13, Z-1, D11 (część), §10, §19, §20 mandatu kontynuacji; przegląd §3a #1, #8–#11, #27 | manifest walidacji (ciągłość stanu poza stanami przypisanymi; lokalizacja zdarzeń warunkowych z tą samą dokładnością), mutacja „predykat izolacji wyłączony → SO-1A odrzucony", L5 rdzenia zachowane |
| **AB-1b.2** (rdzeń — fizyka GFL) | Ogranicznik na rzeczywistym wektorze prądu (anti-windup na stanach prądu) + flaga `ogranicznik_aktywny`; opóźnienie aktywacji I_q, ΔU wobec filtrowanego U_pre, osobna strefa martwa, podtrzymanie/zwolnienie; pole P_available (nasłonecznienie/wiatr) w ENM i oknie GFL; kanały nazwane jawnie (`i_czynny_pu`, `i_bierny_pu`, `i_bierny_wsparcia_pu`, \|I\|, `f_pll`) z konwencją osi w kontrakcie (O-23); metryki FRT i odbudowy P na gęstej siatce **z niepewnością z połowienia kroku (O-14)**; jedna tożsamość GFL/GFM (rodzina ENM; `control_mode` katalogu walidowany na zgodność); mutacja „limit przed inercją, T_p ≫ T_iq". | C2 (kanały), E1/E6 (metryki), §11–§13, §29–§30, §32 mandatu kontynuacji; przegląd §3a #2–#4, #23–#24, #28 | niezmiennik \|I(t)\| ≤ i_max na każdym kroku w przemiataniu T_p/T_iq × P; manifest; mutacje |
| **AB-1b.3** (rdzeń — odbiory) | Architektura modeli odbiorów (O-22): stały PQ z przejściem do stałej impedancji poniżej zadeklarowanego U_min, ZIP z parytetem rozpływu w t = 0, czuły częstotliwościowo, złożony; kontrakt rodziny silnika indukcyjnego (implementacja AB-3b); nazwana odmowa przy braku parametrów. | C6 zamrożenia, §31 mandatu kontynuacji; przegląd §3a #22 | parytet rozpływ ↔ dynamika w t = 0; wyrocznia tłumienia odbioru |
| **AB-1d_min** | Minimalna wyrocznia GFL dla FRT: układ źródło testowe–GFL, punkt stały w zapadzie z ogranicznikiem (rozwiązanie półanalityczne) **łącznie ze stanem przejściowym ogranicznika i odniesieniem ΔU do filtrowanego U_pre (O-23)**, odpowiedź członów inercyjnych I_q z opóźnieniem; manifest D-11; mutacje (znak, ogranicznik, czas zdarzenia, wzmocnienie I_q, odbudowa, baza, opóźnienie = 0); bramka CI. | H4 (GFL), C2 | poziom L4 dla wycinka FRT-B w zadeklarowanej domenie PRZED wydaniem jakiegokolwiek werdyktu FRT |
| **AB-1c** | Kryteria FRT §18 mandatu / §11 mandatu kontynuacji jako sześć osobnych `OcenaKryterium` (pozostanie w pracy wobec obwiedni ORAZ wobec zabezpieczenia U</U> modułu modelowanego jako zdarzenie warunkowe z AB-1b.1 z nastawami z Banku Nastaw / modelu; aktywacja prądu biernego (t_act = pierwsza chwila ΔI_q ≥ x·ΔI_q,cel na gęstej siatce); wielkość prądu biernego; zachowanie ogranicznika; odbudowa P; stan końcowy) + agregat wymagania bez „master PASS" (O-13), z niepewnością i `NIEJEDNOZNACZNY` (O-14); T14/T16/T17 z wyniku kanonicznego; ekran FRT w dwóch trybach (stanowisko = `ComplianceStimulus`, sieć = `PhysicalNetworkDisturbance`, O-18) na biegu kanonicznym z kartą werdyktu; kasacja `frt_hvrt`, `stability_rms`, `voltage_trajectory`, obwiedni FE **oraz toru T1** (`_execute_dynamic_stability`, `application/automation/trace.py`, `application/stability/*`, `ui2/wyniki/stabilnosc` — ekran stabilności przechodzi na bieg kanoniczny); guard wskrzeszenia. | E2, E6, OD-20a/b, OD-33, O-25 | e2e ścieżki FRT na realnym backendzie (E2E-R1); zero równoległych torów FRT i stabilności |
| **AB-1d** | Pełna wyrocznia GFL: droga druga (ANDES tam, gdzie struktury modeli dają się dopasować), manifest D-11+, porównanie dróg, L5 w domenie. | H4 (GFL), C2 | poziom L5 dla wycinka FRT-B |
| **AB-2** | LFSM-O jednostronne (moc dostępna P_available z AB-1b.2, Pref z profilu, filtr pomiaru f, próg odrębny od strefy martwej, opóźnienie, rampa, nasycenie, powrót), JEDNA definicja dla rozpływu, PTPiREE i dynamiki (dziś trzy modele + nadpisania BESS/GFM); scenariusze skoku, rampy f(t)=f₀+kt i powrotu na źródle testowym; zakres częstotliwości z czasami; RoCoF (OD-30) w rozdziale bus_rocof / pll_rocof / rotor_rocof, chwilowy i pomiarowy (okno, filtr, interwał z danych), jako obserwabla i kryterium; producent `rocof_max_hz_s` (O-24); zaprzestanie/ograniczenie P na polecenie (D13); skoki obciążenia/generacji i nastaw — typ A i B. | E3, B3, D13, §14, §18, §30 mandatu kontynuacji | wyrocznie analityczne odpowiedzi P(f) dla skoku, rampy i powrotu; mutacja „strefa martwa symetryczna → przypadek podczęstotliwości musi paść"; parytet statyka–dynamika (E2E-R2) |
| **AB-3** | Regulatory Q(U), cosφ(P), cosφ = const, Q=Q_zad, P=P_zad, U=U_zad (działanie całkujące) z dynamiką (strefa martwa, nachylenie, stałe czasowe, ograniczenia tempa, nasycenie, priorytet P/Q w pracy normalnej, punkt pomiaru zdalny) — JEDNA biblioteka charakterystyk dla rozpływu i dynamiki (usuwa ciche przejście COSPHI_P → droop po t = 0); testy skoku U; **migawka punktu pracy regulatora jako wejście modeli emisji (AB-H2)**. | — (nowe), §15, §65 mandatu kontynuacji; przegląd §3a #6 | parytet rozpływ ↔ dynamika per tryb, wyrocznia odpowiedzi skokowej (E2E-R3) |
| **AB-3b** | Silnik indukcyjny jako model odbioru (O-22): utyk, ponowny rozruch, prąd pozwarciowy, interakcja z odbudową napięcia; wyrocznia analityczna utyku. | §31 mandatu kontynuacji; przegląd §3a #22 | wyrocznia utyku; parytet w t = 0 |
| **AB-H1** (zależność AB-4/AB-6) | Solver dziedziny częstotliwości: Y(f) dla f∈ℝ⁺ (h·f₁ i lista dowolna — interharmoniczne), modele elementów R(f), L(f), C(f), G(f) (kabel: naskórkowość, zbliżenie, straty dielektryczne — tylko z danymi, inaczej jawna kwalifikacja jakości modelu; transformator Z_TR(f) z połączeniem uzwojeń i domeną; kondensator/dławik z zakresem ważności); rozpływ harmoniczny Y(f)V=I z U_h, I_h i fazami; THD_U/THD_I z definicji (jedna z wielu metryk); widok pojedynczych harmonicznych (źródło dominujące, szyna krytyczna, kierunek propagacji); skan Z_th(f) z rezonansami/antyrezonansami i analizą przyczynową (element dominujący, wrażliwość na długość kabla / C / L / TR / sprzęgło / BESS / PV / topologię); tło jako wejście. Wyrocznia: mała sieć analityczna + niezależny solver macierzowy nie dzielący funkcji budowy Y(f); mutacje §81 (znak susceptancji, Hz/kHz, zgubione źródło, R stałe zamiast R(f), brak kondensatora, błędne połączenie TR, pominięte tło, zły bin częstotliwości, pomylenie wartości szczytowej z RMS). | §37–§47, §49–§50, §79, §81 mandatu kontynuacji | E2E-H1, H4, H5, H6 |
| **AB-4** | BESS: granice BMS jako zachowanie przez zdarzenia warunkowe (AB-1b.1), dE/dt = F(P, η_ch, η_dis) z jawną konwencją znaków, SOC_min ≤ SOC ≤ SOC_max, kanały E i I, tryby ładowanie/rozładowanie/postój, regulacja P/Q/Q(U), LFSM-O gdy dotyczy, FRT, ogranicznik, GFL, GFM tam, gdzie model reprezentuje zdolność; wyrocznia C4 + **samodzielna wyrocznia GFM** (droop/VSM, ograniczanie, praca wyspowa; nasycenie dokładnie \|I\| = i_max); **model harmoniczny i supraharmoniczny BESS E(f, P, Q, U, SOC, tryb)** z migawek RMS (AB-H2). | C4, E7, §16, §33, §55–§56 mandatu kontynuacji; przegląd §3a #7, #24 | bilans energii (W6-A Z4), mutacja η_ch ↔ η_dis; E2E-R4, E2E-SH2, E2E-MP2 |
| **AB-H2** (zależność AB-4/AB-7) | Supraharmoniczne: emisja E(f, P, Q, U, tryb) (PV, PCS BESS, wiatr, ładowarki EV, przemienniki, UPS), propagacja I_s(f) → Y(f) → V_i(f), transfer H_{i←j}(f), tłumienie/wzmocnienie/rezonans, sprzężenie fazowe Y_abc(f) tam, gdzie dane tego wymagają (nigdy ze składowej zgodnej), zależność od punktu pracy; mutacje §82. | §53–§59, §82 mandatu kontynuacji | E2E-SH1, SH3, SH4, SH6 |
| **AB-5** | Zabezpieczenia w pętli czasu (D14/D15, OD-34): maszyna stanów IEC 60255 (pobudzenie, akumulator ∫dt/t(I) = 1, odpad, reset wg IEC 60255-151, zatrzask, zwłoka wyłącznika) — nie t_trip=f(I(t)) per krok; SO-1B (zwarcie → I/U → przekaźnik → wyzwolenie → wyłącznik → topologia → kontynuacja RMS); zdarzenia topologiczne LINE/TRANSFORMER/COUPLER OPEN/CLOSE, SOURCE_TRIP, BREAKER_TRIP, RECLOSE (gałęzie nieaktywne z AB-1b.1); automatyka jawnie: cykle SPZ, SZR, sprzęgła, odciążanie, generation shedding, LoM (RoCoF/78/U/f), logika wyspowa, sekwencje wielozdarzeniowe, z **schematem dziennika działań** (czas, wyzwalacz, urządzenie, przyczyna, stan przed, stan po); wyspa w trakcie biegu (D11: wykrycie wysp, klasyfikacja źródeł tworzących/nadążnych, bilans P/Q PRZED Newtonem, U, f; wyspa z odbiorem bez źródła tworzącego → nazwana odmowa fizyczna, nie kod numeryczny); ponowne przyłączenie (D12: ΔU, Δf, Δθ z wyjaśnieniem; kontrola synchronizacji); utrata źródła (PV/BESS/synchroniczne/jednoczesna/częściowa); nastawy z Banku Nastaw OSD. SO-1A (zadany t_clear) pozostaje osobną zdolnością — nie dowodzi SO-1B. | W6-B/W6-C w zakresie DER, §17, §19–§25 mandatu kontynuacji; przegląd §3a #12–#16 | wyrocznia t_trip wobec całki IDMT na prądzie stałym odcinkami i zanikającym; mutacja „akumulator → t_trip = f(I(t)) per krok musi paść na prądzie zanikającym"; mutacja „GFL policzone jako tworzące → musi paść"; E2E-R5…R9 |
| **AB-5b** | Stabilność kątowa i CCT dla synchronicznych modułów A/B (O-24): kryterium Φ (kąt względny / energia; zgodność z równymi polami na SMIB), metryki tłumienia i oscylacji, CCT automatyczne z przeglądem monotoniczności przed bisekcją (przypadek niemonotoniczny = odmowa nazwana), M_CCT = t_CCT − t_clear, producent `cct_s`; analiza małosygnałowa (okres, tłumienie, wpływ H, D, impedancji źródła, regulatorów) wystawiona z zadeklarowaną domeną jako osobny zwalidowany kontrakt (dziś narzędzie tylko testowe). | W6-D/W6-E zamrożenia, §26–§28 mandatu kontynuacji; przegląd §3a #17–#19 | wyrocznia równych pól; wartości własne vs dopasowanie ringdown; mutacje |
| **AB-H3** (w AB-6) | Filtry pasywne (strojone, górnoprzepustowe, gałęzie tłumiące) z porównaniem przed/po i ilościową redukcją; analiza udziałów (dekompozycja źródeł, wrażliwość transferu, macierz udziałów — nigdy przyczynowość z samej korelacji amplitud); wrażliwość harmoniczna w szkielecie przemiatań. | §45, §51–§52 mandatu kontynuacji | E2E-H2, H3, H7 |
| **AB-6** | Wspólny szkielet wariantów `PARAMETR → BIEG → METRYKA → MARGINES` (§83) z wykonawcą wsadowym i niepewnością metryk (O-14): przemiatania S_k″, X/R, P, Q, U, SOC, t_fault, t_breaker, nastawy regulatorów i zabezpieczeń, topologia, długość kabla, C, L, filtr; najgorszy przypadek min_p M(p) osobno per metryka (FRT, CCT z AB-5b, nadir f, RoCoF, odbudowa, THD, U_h, I_h, wzmocnienie rezonansowe, szczyt supraharmoniczny, metryka pasma, transfer); porównanie biegów A/B na wspólnych wielkościach (U, f, RoCoF, P, Q, prądy, SOC, działania zabezpieczeń, marginesy FRT, CCT). | F2/F3, §34–§35, §83–§84 mandatu kontynuacji; przegląd §3a #25–#26 | mapa parametryczna; mutacja na argmin; E2E-R10, E2E-MP3 |
| **AB-H4** (w AB-7) | Import widm z pomiaru (CSV, XLSX, eksport analizatora jakości energii) z parametrami pomiaru (częstotliwość próbkowania, rozdzielczość, okno, agregacja, RBW, czas, poziom szumu, kalibracja); walidacja harmoniczna (błąd amplitudy, fazy, THD, harmonicznych indywidualnych, częstotliwości rezonansu, maksymalny błąd widmowy) i supraharmoniczna (błąd częstotliwości i amplitudy szczytu, energii pasma, stosunku transferu, odległość widmowa); czas–częstotliwość (STFT, spektrogram) jako pozycja późniejsza — nie przed statyczną dziedziną częstotliwości. | §60–§64 mandatu kontynuacji | E2E-H8, E2E-SH7 |
| **AB-7** | Status modelu urządzenia (`UNVALIDATED_MODEL` / `VALIDATED_AGAINST_TEST` / `CERTIFIED_MODEL`) rozdzielony od „równanie zwalidowane" i od „dowód zgodności przyjęty" (§96); import pomiarów czasowych U(t), I(t), P(t), Q(t), f(t) i widmowych U(f), I(f), Spectrum(f); metryki model–pomiar wspólne dla RMS i widma. | §50–§52 mandatu, §97 mandatu kontynuacji | E2E-R (pomiar), E2E-H8, E2E-SH7 |
| **W6-K** | Zwarcia niesymetryczne w dziedzinie czasu (FRT niesymetryczne) — po W5; dziedzina składowych symetrycznych także dla Y_abc(f). | D2 | — |
| **Modele odbiorów** (architektura przewidziana od AB-1b, przyrost po AB-5) | stały P/Q, ZIP, czułe częstotliwościowo, złożone, silnik indukcyjny (utyk, ponowny rozruch, prąd pozwarciowy, interakcja z odbudową napięcia). | §31 mandatu kontynuacji | wyrocznia analityczna silnika |

Poza zakresem A/B (DEFER, bez rozwijania): T02/T03/T04/T19/T20 jako wymagania C/D (dla B tylko na
żądanie OSD), T06–T08 jako wymagania C/D, T18 (praca wyspowa/rozruch autonomiczny jako wymagania
OSP), PSS/HYGOV/duże turbiny, turbiny wiatrowe typu 1/2 (W6-J), kryterium Φ i CCT poza jednostkami
synchronicznymi A/B, EMT.

## 6. Karta AB-1a — rozstrzygnięcia projektowe

1. **Pakiet** `catalog/profiles/nc_rfg/` pozostaje jedynym miejscem profilu; dane dzielą się na
   warstwy: `warstwy/nc_rfg.yaml` (wymagania i granice dopuszczalne rozporządzenia),
   `warstwy/wos.yaml` (progi krajowe i parametry krajowe), `warstwy/procedura_ptpiree.yaml`
   (wersja procedury i kryteria akceptacji testów), `warstwy/wipwc.yaml` (wersja WiPWC, reguły
   pokrycia wymagań certyfikatem per typ, rejestr certyfikowanych urządzeń z wersją listy),
   `operatorzy/<id>.yaml` (tożsamość operatora, wersja IRiESD, nadpisania OSD, Bank Nastaw),
   `warstwy/zastane.yaml` (parametry o nieustalonym pochodzeniu — JEDNA kopia dawnych pięciu, stan
   `NIEUSTALONE`). Profil efektywny operatora = złożenie warstw z zachowaniem proweniencji każdej
   wartości (`ZrodloWartosci` = `PodstawaWymagania` kontraktu werdyktu — jeden typ).
2. **Klasyfikacja** jest krajowa (WOS), nie zależy od operatora: jedna funkcja
   `klasyfikuj_modul(p_max_kw, napiecie_kv)`; typ D od 110 kV włącznie; moc < 0,8 kW → `None`
   (urządzenie nie jest modułem wytwarzania energii; wynik `nie_dotyczy` z powodem). UI nie
   klasyfikuje — odpowiedzi backendu niosą klasę. Technologia (PPM / SPGM) jest jawnym polem
   wyniku (rodzina `Morski_PPM` → PPM, `SyPGM` → SPGM); stosowalność wymagania = typ × technologia.
3. **Solver PTPiREE** (B-01, delegacja O-5) nie zawiera ani jednej liczby kryterium: tolerancje,
   progi i czasy odniesienia pochodzą z profilu; brak parametru → `no_data` z powodem; stan
   źródła kryterium w każdym kroku śladu i w wyniku testu. Tautologia T14/T15 usunięta: bez wyniku
   biegu dynamiki werdykt `no_data`. T12 orzeka wobec czasu zaprzestania generacji z NC RfG art.
   13 ust. 6 (nowe pole wejścia `cease_generation_time_s`), nie z rampy mocy. Stosowalność testu
   wynika z JEDNEGO predykatu `WymaganieRegulacyjne.sposob_wykazania(typ, technologia, certyfikat)`
   (reguła predykatów parami), z zakresu procedury (`default_for_modules`) i z reguł procedury
   „wymagany bez certyfikatu" (`required_without_certificate_for`); T17 (szybki prąd zwarciowy)
   dotyczy modułów parku energii typu B, nie modułów synchronicznych. Kontrakt wyniku V2
   (`NcRfgPtpireeTestResultV2`, solver `ncrfg-ptpiree-whitebox-2.0`): klasa `None` poniżej progu,
   status `nie_dotyczy`, technologia, wersja i skrót profilu, źródło kryterium.
4. **Każdy test PTPiREE emituje `OcenaKryterium`** (poziom K kontraktu werdyktu): przedmiot,
   kryterium z `warunek_latex`, wynik z jednostką, limit z podstawą i stanem źródła, margines
   (gdzie definiowalny), niepewność („nie dotyczy — porównanie deklaracji" z powodem), status,
   wyjaśnienie z generatora, dowód (metoda `DEKLARACJA` / `CERTYFIKAT`, poziom `EvidenceTier`,
   status modelu `NIE_DOTYCZY`, status danych), zakres ważności („porównanie danych
   zadeklarowanych z wymaganiem — nie wykazuje zachowania dynamicznego"), ślad.
5. **Wynik zgodności per wymaganie** (`WynikWymagania`, moduł `application/ncrfg_compliance/
   ocena_wymagan.py`): wymaganie × typ × technologia × certyfikat (WiPWC) × testy × przydatność
   dowodowa → status maszynowy wg §2.3 kontraktu + `kompletnosc_dowodu` + oceny składowe + agregacja
   O-13 + wyjaśnienie; certyfikat i wniosek do OSD czytają ten wynik (lista braków = pełne rekordy).
   Dziś oczekiwany stan po AB-1a (uczciwy): typ A bez certyfikatu → `BRAK_DOWODU` dla wymagań bez
   metody (13.1a, 13.1b, 13.3, 13.4, 13.7) i `BRAK_PODSTAWY` dla LFSM-O (parametry zastane);
   typ B → FRT `NIE_OCENIONO` (bez biegu) do AB-1c; z certyfikatem pokrywającym typ → `SPELNIA`
   z metodą `CERTYFIKAT` (podstawa WiPWC ze stanem źródła).
6. **Strażnik kontraktowy** `werdykt_wyjasnialny_guard.py` (kontrakt §12) wpięty do
   `guardy_z_ci.py` i CI; zapadka na inwentarzu §8.

## 7. Rejestr postępu

| Data | Przyrost | Commit | Stan | Dowód |
|------|----------|--------|------|-------|
| 2026-09-22 | AB-0 | (ten dokument) | plan i decyzje zapisane | — |
| 2026-09-22 | AB-1a (w toku) | — (nie zacommitowane, worktree r10) | warstwy profilu `warstwy/*.yaml` + `operatorzy/*.yaml`, loader z proweniencją i `klasyfikuj_modul`, refaktor solvera PTPiREE (kryteria z profilu, `criterion_source`, T12 wg art. 13 ust. 6, T14/T15 `no_data`, T01 A/B bez certyfikatu, T17 tylko PPM B, kontrakt V2); do dostosowania do kontraktu werdyktu (p. 4–5 karty) i migracji konsumentów | sonda solvera 2026-09-22 (4 moduły A/B/poniżej progu/SPGM) |
| 2026-09-22 | poprawka „zakaz lakonicznych werdyktów" | (ten commit) | kontrakt `docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md`, decyzje O-2′, O-11…O-16, §4, §5, §6, §8 | — |
| 2026-09-23 | mandat kontynuacji (ETAP 1–6) | (ten commit) | stan odzyskany (`ef9f6228` = origin); plan rozszerzony o pełną dynamikę, harmoniczne, supraharmoniczne, multi-physics, §95; przegląd luk dynamiki (Opus, 28 pozycji, sondy P1–P3), audyt harmoniczny (Opus, sondy P1–P14) i pięć inwentarzy werdyktów (Opus, 283 wiersze) zintegrowane: decyzje O-21…O-25, podział AB-1b, AB-3b, AB-5b, klasyfikacja kodu harmonicznego, fale WW-0…WW-4, delta grafu §11; komplet bramek CI na drzewie docs-only zielony (`guardy_z_ci.py`: 104 guardy, black/ruff, type-check, lint, 1058 self-testów) | `docs/audit/ab-raw/*`, `docs/audit/INWENTARZ_WERDYKTOW_LAKONICZNYCH_2026-09-23.md` |

## 8. Inwentarz powierzchni z lakonicznym werdyktem i klasyfikacja migracji

Pełny inwentarz (283 wiersze `plik:linia` z elementami obecnymi/brakującymi, konsumentami i
klasą): `docs/audit/INWENTARZ_WERDYKTOW_LAKONICZNYCH_2026-09-23.md`. Sumy (stan `ef9f6228`,
zapadka strażnika): **MIGRACJA 181** (A 27 · B 12 · C 42 · D 66 · E 34), **ENUM_WEWNETRZNY 54**
(lista dozwolona z uzasadnieniem), **LEGACY_USUNAC 48** (kasacja). Żaden żywy werdykt nie
niesie zakresu ważności; stan źródła limitu niesie wyłącznie `criterion_source` solvera NC RfG
i `zrodlo_k` wytrzymałości cieplnej; najbliżej kontraktu są `werdykt_projektowy.OcenaElementu`
(ekran „Ocena") i panel dowodu cieplnego.

Fale migracji (wszystkie z klasy MIGRACJA — natychmiastowe, prowadzone równolegle do AB-1b
przez wykonawców Opus 5.5 na kontrakcie z AB-1a; kolejność wg ryzyka fałszywego werdyktu na
ścieżce użytkownika):

| Fala | Zakres (wiersze inwentarza) | Kiedy |
|------|-----------------------------|-------|
| **WW-0** | kontrakt `werdykt/` + generator + strażnik; rodzina NC RfG (A11–12, B19, C3–11, D1–8, D11–13, E31–32, E55 `ui/ncrfg-tests/api.ts`); FRT (A13, C9–10, D4, D16–17) i tor T1 (C49, D54–55) → `NIE_OCENIONO` (O-25); werdykt projektowy jako struktura odniesienia z Ls/E/D/niepewnością i naprawą `_WYNIK_Z_STATUSU` (WARN→SPELNIA, `.get(status, SPELNIA)`) (C1–2, D36–37); **kasacja wszystkich 48 pozycji LEGACY_USUNAC** (z bramkami wskrzeszenia w `legacy_public_path_guard`; `protection_iec60255` zachowuje silnik IDMT) | AB-1a |
| **WW-1** | rodzina jakości rozpływu/zwarć i korzeń wspólny (`TabelaWynikow` komórka bez slotu limit/źródło/margines, `SladSekcyjny`): B3–5, B9, B15–16, B21; C12–14, C16–18, C22–23; D21–24, D26–29, D38–42, D45–46, D53, D56–57, D60; E80; jedna reguła oceny odchylenia napięcia zamiast sześciu; „zweryfikowany" → „w paśmie wiarygodności" | równolegle z AB-1b.1 |
| **WW-2** | zabezpieczenia i koordynacja (A3; C37, C39–40; D47–49; E1, E3–12): progi 1,5/1,2/CTI i Δt 0,3/0,2 s z rejestru z podstawą, agregacja selektywności w backendzie z najgorszą parą, ERROR ≠ FAIL, 0 par ≠ PASS | równolegle z AB-1b.2 |
| **WW-3** | łańcuch nN i aparatura (A5, A7–10, A36–38; C25, C27–36, C48; D25, D44, D61–63; E41–43, E46, E48, E75–77): `SwzStatus` jako kod maszynowy, margines z jednostką, proweniencja po stronie serwera (nie z żądania), `(True, "")` i „PASS = policzono" usunięte, brak podstawy ≠ FAIL | równolegle z AB-1b.3 |
| **WW-4** | kreatory, przestrzenie, DER-SN, wzorce referencyjne, porównanie, V12.6 (A17–30, A33; B17; C50, C52, C56; D64–68, D71–74, D77; E33–38, E49, E58, E61–62, E71–72): werdykty liczone w UI przeniesione do backendu (progi 5 %, 0,8/1,5/3,0, dopasowanie DER, heurystyka porównania, progi punktacji), wyniki V12.6 na kontrakcie (limity z `v126_katalog` dołączone do rekordu; harmoniczne wg O-21) | równolegle z AB-1d_min/AB-1c |

Reguła wykonania każdej fali: inwentarz klasy przed naprawą (komplet wierszy fali), test jako
iloczyn cech (status × kompletność × stan źródła × status modelu × status danych), predykaty
parami, zero tekstu werdyktu poza generatorem, zapadka strażnika obniżona w tym samym commicie.

## 9. Scenariusze end-to-end programu (bramki odbioru)

| Id | Scenariusz | Przyrost |
|----|-----------|----------|
| E2E-R1 | PPM-B FRT na źródle testowym: zapad wg obwiedni profilu, sześć kryteriów, agregat, karta werdyktu, certyfikat/wniosek | AB-1c |
| E2E-R2 | LFSM-O: skok, rampa, powrót; parytet z rozpływem | AB-2 |
| E2E-R3 | Q(U): skok U, odpowiedź regulatora | AB-3 |
| E2E-R4 | BESS FRT + SOC: ładowanie → zapad → wsparcie Q → odbudowa → stan końcowy z bilansem energii | AB-4 |
| E2E-R5 | SO-1A: zwarcie w sieci z zadanym t_clear | AB-1c (tryb sieci) / AB-5 |
| E2E-R6 | SO-1B: wyłączenie z zabezpieczeń w pętli czasu | AB-5 |
| E2E-R7 | Utrata generacji (PV / BESS / synchroniczne / częściowa) | AB-5 |
| E2E-R8 | Wyspa w trakcie biegu: wykrycie, bilans, odmowa bez źródła | AB-5 |
| E2E-R9 | Ponowne przyłączenie z ΔU / Δf / Δθ | AB-5 |
| E2E-R10 | Przemiatanie najgorszego przypadku (S_k″, X/R, t_clear, SOC, nastawy) | AB-6 |
| E2E-H1 | Jedno źródło harmoniczne: rozpływ harmoniczny, U_h/I_h, THD, ślad | AB-H1 |
| E2E-H2 | Wiele falowników: agregacja z jawną metodą, udziały | AB-H3 |
| E2E-H3 | Tło + nowy moduł: U_background / U_plant / U_combined | AB-H3 |
| E2E-H4 | Skan częstotliwościowy Z_th(f) z rezonansami i przyczyną | AB-H1 |
| E2E-H5 | Rezonans kabel/kondensator: wrażliwość na długość i C | AB-H1 |
| E2E-H6 | Topologia OPEN/CLOSED: przesunięcie rezonansu | AB-H1 |
| E2E-H7 | Filtr przed/po z ilościową redukcją | AB-H3 |
| E2E-H8 | Model vs pomiar harmoniczny | AB-H4 / AB-7 |
| E2E-SH1 | Jedno źródło supraharmoniczne + propagacja | AB-H2 |
| E2E-SH2 | BESS: ładowanie / rozładowanie / postój — zmiana widma | AB-4 / AB-H2 |
| E2E-SH3 | Sieć słaba / silna | AB-H2 |
| E2E-SH4 | Przemiatanie długości kabla | AB-H2 / AB-6 |
| E2E-SH5 | Ocena filtra | AB-H3 |
| E2E-SH6 | Sprzężenie fazowe Y_abc(f) | AB-H2 / W6-K |
| E2E-SH7 | Model vs pomiar supraharmoniczny | AB-H4 / AB-7 |
| E2E-MP1 | PF → RMS FRT → migawka stanu podczas FRT → widmo | AB-4 / AB-6 |
| E2E-MP2 | BESS: praca → zwarcie → wsparcie Q → odbudowa → nowy punkt pracy → nowe widmo | AB-4 |
| E2E-MP3 | Zmiana topologii → odpowiedź RMS → skan częstotliwościowy → nowy punkt rezonansu | AB-6 |

## 10. Standard dowodu i wyrocznie per domena

| Domena | Wyrocznie niezależne | Mutacje (minimum) | CI |
|--------|----------------------|-------------------|----|
| RMS/DAE | analityczna (SMIB, punkt stały GFL w zapadzie, odpowiedź P(f)), niezależne całkowanie, ANDES tam, gdzie porównywalne, niezależne drogi CCT, pomiar (AB-7) | znak, ogranicznik, czas zdarzenia, wzmocnienie I_q, odbudowa, przeliczenie baz, reinicjalizacja topologii, akumulator przekaźnika | manifest walidacji + harness mutacji na dokładnym SHA (R10) |
| Harmoniczne | mała sieć analityczna, niezależny solver macierzowy (bez wspólnych funkcji budowy Y(f)), narzędzie zewnętrzne tylko przy porównywalnej fizyce, pomiar | §81 mandatu kontynuacji | bramka jak wyżej |
| Supraharmoniczne | analityczny transfer 2-węzłowy, pomiar | pominięty punkt pracy, zła interpolacja widma, skala osi ×1000, złe sprzężenie fazowe, zgubione tłumienie wysokoczęstotliwościowe, zły kierunek transferu | bramka jak wyżej |

## 11. Delta grafu zależności (§94 mandatu kontynuacji) — bez restartu

| Istniejący workstream | Nowa zdolność | Dlaczego potrzebna | Zależność | Stan bieżący | Cel | Dowód |
|-----------------------|---------------|--------------------|-----------|--------------|-----|-------|
| AB-1a | kontrakt werdyktu wyjaśnialnego (`werdykt/`), uczciwość natychmiastowa (FRT, T1, E-40), warstwy WiPWC i Bank Nastaw, kasacja 48 pozycji legacy | fałszywe werdykty żyją na ścieżce użytkownika (P3 FRT, THD 3049 %, T1 z kątów użytkownika); 181 lakonicznych werdyktów | — | plan + kontrakt (ten commit); kod profilu i solvera PTPiREE w toku | AB-1a wg karty `KARTA_AB_1A_WERDYKT_I_PROFIL_2026-09.md` | regresja, guardy, T1–T13, zapadka |
| AB-1 (fundament) | AB-H0: `PhysicsDomain`, sekcje modelu urządzenia per domena, typowane źródła widmowe, `SupraharmonicBand`, rejestr wymagań jakości energii z proweniencją | jeden ENM w wielu domenach; zero przenoszenia limitów; dziś limity 8/5/5 % bez dokumentu/wydania/poziomu/punktu/statystyki | AB-1a (typ podstawy) | kontrakty V12.6 z widmem bez fazy i punktu pracy; 0/179 kart z widmem | kontrakty + katalog z proweniencją per sekcja | testy kontraktu, niezmienniki katalogu |
| AB-1b | podział 1b.1/1b.2/1b.3; zdarzenia warunkowe jako prymityw; emulator jako `ComplianceStimulus`; ogranicznik na rzeczywistym prądzie; P_available; kanały nazwane; gałęzie nieaktywne; predykat izolacji; odbiory | 12 fałszywych ryzyk werdyktu z §3a(b); \|I\| > i_max o 7 %; głęboki zapad blokuje FRT w trybie sieci | R10 (rdzeń L5) | rdzeń L5 dla SMIB/3F; GFL bez wyroczni | manifest z nowymi twierdzeniami, mutacje | L5 rdzenia zachowane |
| AB-1d_min (przed AB-1c) | wyrocznia GFL z ogranicznikiem i ΔU od U_pre | werdykt FRT nie może powstać na modelu bez wyroczni | AB-1b.2 | brak wyroczni PPM | L4 w domenie | manifest D-11 |
| AB-1c | sześć kryteriów FRT, dwa tryby ekranu, kasacja czterech torów | cztery żywe tory czasowe; „master PASS" zakazany | AB-1b.1, AB-1d_min | `frt_hvrt` MVP na ścieżce użytkownika | jeden tor | E2E-R1, guard wskrzeszenia |
| AB-2 | jedna definicja LFSM-O (trzy modele dziś), RoCoF ×3 chwilowy/pomiarowy, producent `rocof_max_hz_s` | PV podnosi P przy podczęstotliwości; metryka zadeklarowana bez producenta | AB-1b.1 (emulator), AB-1b.2 (P_available) | trzy modele, brak stymulusa | jedna definicja + wyrocznie | E2E-R2, mutacja symetrii |
| AB-3 (+ AB-3b) | biblioteka charakterystyk Q/P wspólna dla rozpływu i dynamiki; U = U_zad; tempo; silnik indukcyjny (OD-37 rozstrzygnięte O-22) | ciche przejście COSPHI_P → droop; utyk silników steruje odbudową i zabezpieczeniami | AB-1b.3 | 4 tryby vs 1 prawo | jedna biblioteka | parytet per tryb; wyrocznia utyku |
| AB-4 | BMS przez zdarzenia warunkowe, kanały E/I, wyrocznia GFM, E(f, P, Q, U, SOC, tryb) | SOC jako odmowa zamiast zachowania; GFM bez wyroczni; emisja bez punktu pracy | AB-1b.1, AB-H2 | dSOC/dt + odmowa | pełny BESS | E2E-R4, SH2, MP2 |
| AB-4 / AB-6 | AB-H1: `solvers/harmoniczne/` (Y(f) na `core/ybus.py`, f ∈ ℝ⁺, U_h/I_h z fazą, THD/TDD z definicji, skan Z_th(f) z ekstremami i przyczyną, udziały źródeł, filtry, tło jako wejście, migotanie w solverze) + kasacja funkcji z v126 | jeden solver harmoniczny jest POZORNY (P1–P14); brak wyroczni | AB-H0, AB-1a (uczciwość) | `_power_quality` błędny | nowy solver z wyroczniami i mutacjami §81 | E2E-H1, H4–H6; parytet Y(h=1) z rozpływem |
| AB-5 (+ AB-5b) | maszyna stanów IEC 60255, automatyka jawna z dziennikiem, klasyfikacja wysp GFL/GFM + bilans przed Newtonem, synchronizacja; Φ, CCT z monotonicznością, małosygnałowa | SO-1B nie istnieje; wyspa tylko z GFL kończy się kodem numerycznym; Φ/CCT bez przyrostu | AB-1b.1, AB-3b | statyczne t = f(I); CCT tylko w testach | pętla czasu + kryteria formalne | E2E-R5–R9; wyrocznia całki IDMT; równe pola |
| AB-4 / AB-7 | AB-H2: supraharmoniczne (E(f, punkt pracy), propagacja do 150 kHz, transfer, Y_abc(f)) | zero trafień w repo; mandat wymaga pełnej zdolności | AB-H0, AB-H1, AB-3 (migawki) | BRAK | pełna dziedzina | E2E-SH1–SH6, mutacje §82 |
| AB-6 | AB-H3: filtry przed/po, macierz udziałów, wrażliwość harmoniczna; wykonawca wsadowy; niepewność metryk | analiza przyczynowa rezonansu i najgorszy przypadek per metryka | AB-H1, AB-1b.2 | BRAK | wspólny szkielet wariantów | E2E-H2, H3, H7, R10, MP3 |
| AB-7 | AB-H4: miernik jakości energii w ENM, import widm (CSV/XLSX/analizator) z parametrami pomiaru, metryki model–pomiar RMS + widmo; status modelu rozdzielony od „równanie zwalidowane" i „dowód przyjęty" | brak pomiaru w produkcie; walidacja L5 tylko rdzenia | AB-H1, AB-H2 | `Measurement` tylko CT/VT | walidacja pomiarowa obu domen | E2E-H8, SH7 |
