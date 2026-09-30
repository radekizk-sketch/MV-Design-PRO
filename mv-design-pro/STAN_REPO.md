# STAN_REPO.md — ŻYWY REJESTR STANU MV-DESIGN-PRO

> **TO JEST PIERWSZE CZYTANIE DLA KAŻDEGO AGENTA.** Ten plik mówi, gdzie jesteśmy, i odsyła do dokumentów, które
> niosą pomiar. **Repo > specy > ten rejestr** (gdy rejestr jest nieaktualny, prawdą jest świeży skan repo).
> Kanon i hierarchia dokumentów: `CLAUDE.md` („Document Hierarchy"). Misja właściciela (nadrzędna operacyjnie):
> `docs/plan/MISJA_DOMKNIECIA_PRODUKTU_2026-09.md` (część I 2026-09-09, część II 2026-09-16). Program bieżący:
> `docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` (decyzje O-1…O-56, sekwencja §5, rejestr postępu §7, bramki §12).
> **Wznowienie po przerwie: §7 (pakiet wznowienia A–L) — czytaj przed jakąkolwiek pracą.**

> **ZASADA NR 3 (nadrzędna): NIC NA POTEM + WSZYSTKO WSZĘDZIE.** Wykryte = naprawione natychmiast, w tej samej
> pracy. Zakaz „follow-on" / „osobny przebieg" / „bounded increment" / jawnego błędu zamiast funkcji / okrajania
> zakresu / wyłączania kategorii spod zakresu. Rozmiar → orkiestracja teraz, nie odroczenie.

**Ostatnia aktualizacja:** 2026-09-30 · **Gałąź:** `claude/mv-design-pro-twin-audit-u4lhy0` (czubek: commit pakietu wznowienia, rodzic `9cc212b9`;
`main` = `a45c88f9`) · **Poprzednie wersje rejestru:** 2026-09-16 (HEAD `c307e95f`, w historii git tego pliku),
2026-05-29 (`docs/audit/archive/STAN_REPO_2026-05-29.md`, zawierała deklaracje sprzeczne z kodem).
**Cykl życia:** aktualizowany przy każdej partii integracji; szczegółowe pomiary żyją w wierszach rejestru
`docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` §7 i w `docs/evidence/CONVERGENCE_EVIDENCE.md` (§A CI, §E karty, §F
dowody, §G ustalenia adwersaryjne, §I decyzje właściciela).

---

## 1. ZDROWIE SYSTEMU (pomiar łańcuchami partii 5, 2026-09-29/30)

| Sprawdzenie | Wynik |
|---|---|
| Backend `pytest -m "not pandapower and not andes"` | **26 608 passed**, 37 deselected, 0 failed (łańcuch p5 na `e233886a`; `backend/src` identyczny z `3840e239`); rdzeń dynamiki po DETERMINIZM-KATA-FAZORA — testy celowane 2 830 passed, 37 deselected (drzewo `3840e239` + poprawka; pliki testowe importujące manifest i harness mutacji, ponownie po przenumerowaniu M67–M69: 133 passed) |
| Wyrocznia pandapower (`-m pandapower`, osobne środowisko) | **30 passed** (łańcuch p5b) |
| Wyrocznia dynamiki ANDES (`-m andes`, osobne środowisko) | job CI zielony na `82595588` (2026-09-25); lokalnie nie powtarzana w tej sesji |
| `scripts/guardy_z_ci.py` | **105** wywołań strażników wołanych przez CI + black/ruff + `type-check` + `lint` + **2 920** samotestów — KOMPLET ZIELONY (łańcuch p5b na `3840e239`) |
| Frontend | tsc 0, eslint 0 (w `guardy_z_ci`); pełny vitest 879/879 plików, 12 716 passed + 14 todo, RC=0 (łańcuch p5b na `3840e239`); pełny e2e na realnym backendzie 510 przypadków: 509 passed, 1 failed — `industrial-template-mass-flow` (bieg zwarciowy sieci 50 stacji 866 049 ms przy limicie 240 s: nadsubskrypcja wątków BLAS; po naprawie WATKI-BLAS-E2E spec zielony, 19 553,4 ms) |
| CI (GitHub, 9 workflowów) | `82595588`: 8/9 zielonych, czerwony pełny e2e (9 przypadków — naprawione w partii 5); czubek — §7 H |
| Skala (pomiar 2026-09-30) | 10 792 funkcje testowe backendu; 102 skrypty strażników + 58 plików samotestów; 857 plików testów frontu (`__tests__`), 104 speki e2e |

---

## 2. CO JEST ZROBIONE (z dowodem)

Pełna klasyfikacja per zdolność i domenę: `docs/plan/MAPA_DOMKNIECIA_PRODUKTU_2026-09.md` §3 (12 tabel) + §3a
(rodziny A–L). Rejestr przyrostów z commitami i dowodami od 2026-09-22: `docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` §7.
Skrót stanu wycinków (mapa §8, korekta kolejności w `docs/plan/SYNTEZA_DOMKNIECIA_PRODUKTU_2026-09.md` §5):

- **W1 — jedna prawda sieci** (2026-09-09): import XLSX → ENM przez jeden kompilator grafu, kasacja legacy ORM
  (19 tabel), kreatora, SLD ORM, `designer`/`design_synth`, raportów legacy; guard wskrzeszenia. Wcześniej CV-1
  (projekt jest właścicielem ENM), CV-2 (rewizje z dziennika + koperta), CV-3 (scenariusze `apply_scenario`, warianty),
  CV-4.1–4.3 (jeden assembler, `TopologyService` jedna implementacja, K7 S''kQmin, PERF-SC-50 153 s → 7,7 s).
- **W2 (+B, +C) — zero fabrykacji ekranów** (2026-09-09): stabilność bez wartości domyślnych, macierz DER bez
  martwego kliku, widmo harmoniczne z karty, hinty roadmapowe skasowane.
- **W3 — konwergencja duplikatów fizyki** (fale 1–3, 2026-09-09/16) z W3-J (jedno źródło progów napięcia) i V12.7
  (prezentacja inżynierska po werdykcie B-02 8,5/10).
- **W6-0** (2026-09-16/18): S-1/S-4 (stopień dowodowy wyniku NC RfG i stabilności, koniec stanu `no_module`),
  S-2 (autorytet liczb zwarciowych), S-3 (jeden tor NC RfG, kasacja drugiego silnika i wyspy station-der), S-5.
- **Powierzchnie analityczne B-02** (2026-09-10): werdykt właściciela 8,5/10.
- **Program A/B** (od 2026-09-22; plan §7): werdykt wyjaśnialny ze strażnikiem, profil regulacyjny v1 (AB-1a),
  kontrakty dziedziny częstotliwości (AB-H0, O-53), rdzeń zdarzeń dynamiki RMS (AB-1b.1a/b), model statyczny odbiorów
  (AB-1b.3a), rdzeń dynamiki w ścieżce produkcyjnej projektanta (AB-P1, ekran E-32, tryb sieci bez werdyktu),
  determinizm kąta fazora i estymaty niepewności częstotliwości.
- **Klasy jakości produktu** (plan §7): #135, #140–#145, PL-ZNAKI, ETYKIETY-TR, MAGISTRALA-OCENA, PASMO-1KV,
  NAZWY-JEDNO-ZRODLO, archiwum projektu, PROOFPACK-KONTRAKT, S95-START, #151 (połknięte wyjątki, budżet 0).
- **Rdzenie FROZEN** (B-01): IEC 60909 (3F/2F/1F, MAX/MIN, wkłady), NR/GS/FD, protection IEC 60255, NC RfG/PTPiREE
  (T01–T20), FRT/HVRT, `stability_rms`, WLS, phase state SN, V12.6 — zmiany wyłącznie decyzją właściciela.
  Wiążąca lista plików: `scripts/rdzenie_b01.py` (samotest `scripts/test_rdzenie_b01.py`); POZOSTAŁE pliki
  `network_model/solvers/**` NIE są rdzeniami B-01 (m.in. `dynamika/**`, `cable_ampacity_derating.py`,
  `fault_loop_builder.py`, `equipment_checks/**`) — edycja jak każdego solvera: WHITE BOX, testy, determinizm.

---

## 3. RZECZYWISTY DŁUG (klasy, nie instancje — mapa §4; synteza §0; otwarte P0/P1 — §7 I)

| Dług | Gdzie zmierzono | Wycinek / karta |
|---|---|---|
| Dynamika bez werdyktu: FRT/HVRT i stabilność kątowa „nie ocenione” na E-32 (tryb sieci, poziom UNVALIDATED_MODEL); `stability_rms` i `frt_hvrt` jako rdzenie B-01 do kasacji; regulacja GFL z profilu typowego; bieg synchronicznie w żądaniu HTTP | plan §5, §7 (AB-P1), §12.2 | AB-1b.2 → AB-1d_min → AB-1c → AB-1d; DYNAMIKA-W-TLE; B-01 |
| BESS bez stanu energii i sprawności; brak profili maszyny synchronicznej i turbiny typu 2; brak QSTS; flicker w złej warstwie; brak EN 50160 | mapa §3 dom. 5/6, synteza §2 | KATALOG-DYNAMIKI-BRAKI, W6-3…W6-8, AB-2…AB-7 |
| Zabezpieczenia poza modelem; brak 67/67N/21/87/25/50BF/grup/TRIP; ocena na syntetycznym urządzeniu | mapa dom. 4, synteza §1 p. 20; §7 I | BIEG-ZABEZPIECZEN-Z-MODELU (w toku), W4 |
| Aparat pola poza torem prądowym (stacja przelotowa i końcowa, wyłącznik główny nN) | §7 I | POLA-W-TORZE (w toku) |
| Uziemienie ×6, `meta.field_specs`, TT/IT bez fizyki, rozpływ niesymetryczny bez konsumenta | mapa dom. 1/7 | W5 (W5-A, W5-D → W5-B/C/E/T) |
| SLD: semantyka w kliencie, trzy magazyny nadpisań; elementy modelu nierysowane; fikstury bez generatora | mapa dom. 8; §7 I | SLD-SUBSTRAT (w toku), W7 |
| Dane nieautorytatywne: sieć złota z nieistniejącymi pozycjami katalogu; gotowość DER we froncie z `?? 0`; ciche zera zasilające decyzję | §7 I | SIEC-ZLOTA-KATALOG, GOTOWOSC-DER-BACKEND, CICHE-ZERO |
| V12.6: N-1 bez rozpływu, stałe bez podstawy, kąt fazora zerowego | plan §12.2 (g), (h); §7 I | AB-H0b (prezentacja), B-01 |
| Sieć kompensowana G01 end-to-end (NOT_BUILT) | mapa dom. 3/7 | W8 (CV-6) |
| Dobór przekroju, BOM, pakiet do podpisu, rejestr założeń, koszty (OD-16), `NetworkVariation` | mapa §5 „wyjścia do Excela" | W10 |
| Dane zewnętrzne (karty producentów, IRiESD/programy ramowe, BIL, degradacja baterii) | mapa §7 OD-17/OD-21; plan §12.1 | właściciel |

---

## 4. ZADANIE BIEŻĄCE

Partia integracji 6 (POLE-ZAJĘTE, DOWOD-CIEPLNY i karty kończone przez wykonawców: ODMOWA-DANYCH-422, POLA-W-TORZE,
SLD-SUBSTRAT faza 2, AB-1b.3b, BIEG-ZABEZPIECZEN-Z-MODELU) na czubku gałęzi po partii 5; scalenie PR #474 do `main` po zielonym
CI. Szczegóły, kolejność i pierwsze uruchomienie wykonawców: §7 E i K.

## 5. KOLEJNOŚĆ DALSZEJ PRACY

§7 D (graf zależności i ścieżka krytyczna po syntezie architekta 2026-09-30) i §7 E. Decyzje właściciela: §7 J.

## 6. ZASADY UTRZYMANIA TEGO REJESTRU

1. Liczby wyłącznie z pomiaru (data + drzewo); żadnych deklaracji „PODPIĘTE"/„DZIAŁA" bez konsumenta w ścieżce
   użytkownika (ZASADA NR 1).
2. Każda partia integracji aktualizuje §1 (zdrowie), §4 (zadanie bieżące) i §7 (pakiet wznowienia); szczegóły idą
   do rejestru planu §7 i do evidence, nie tutaj.
3. Sprzeczność między tym rejestrem a kodem = defekt rejestru; naprawiany w tej samej kolejce, z wpisem supersesji.
4. Treść kart wykonawczych nieukończonych żyje w repo (`docs/plan/KARTY_OTWARTE_2026-09.md`, `docs/plan/KARTA_*`),
   nie w katalogu roboczym sesji — odwołania `scratchpad/…` w starszych dokumentach są proweniencją artefaktów
   sesyjnych (nieutrwalonych), dowodem wykonania jest commit i wiersz rejestru.

---

## 7. PAKIET WZNOWIENIA (checkpoint 2026-09-30, mandat „EMERGENCY EXECUTION, INTEGRATION & RESUME READINESS” pkt IX)

> **Zasada wznowienia.** Nowa sesja NIE powtarza zakończonych audytów i nie analizuje całego repozytorium od
> nowa. Kolejność: (1) delta od checkpointu — `git fetch`, porównanie czubków z tabelą A, stan PR #474 i CI;
> (2) odbiór prac w toku z gałęzi zdalnych WIP (tabela A.3) albo ponowne uruchomienie ich kart; (3) kolejność
> z części E. Każda liczba poniżej pochodzi z pomiaru z datą i drzewem; rozjazd z repo = defekt tego rejestru
> (§6 pkt 3), naprawiany w tej samej kolejce.

### A. Stan Git

**A.1 Repozytorium i gałęzie.** `radekizk-sketch/MV-Design-PRO`. `main` = `8f7ed3c2` — PR #474 scalony
2026-09-30 commitem scalającym (drzewo `main` bitowo równe drzewu zweryfikowanego czubka `2be588ea`;
wcześniej `a45c88f9` — PR #476, 2026-09-24). Gałąź programu `claude/mv-design-pro-twin-audit-u4lhy0` —
odtworzona z `main` po scaleniu: nad `8f7ed3c2` poprawka 2 karty PRZENOSNOSC-NIEPEWNOSCI (`11e6e51b`),
karta SKONCZONOSC-CHWILI-ZERO (`e206781a`, `f53533b8`) — przeniesione bez zmian treści z `1f2da48a`,
`6e09d740`, `0f38d197` (drzewo bitowo równe `0f38d197`, na którym przeszła weryfikacja z części H) —
oraz karta GRANICE-IMPORTOW + AUTOTESTY-W-DRZEWIE (`f1c27d8a`, `ce138c51` z `4a7329ad`, `1ca6ca08`) i commit
dokumentowy; wypchnięcie jest przewinięciem, bo `8f7ed3c2` ma `2be588ea` za rodzica. Jedyna
gałąź, na którą sesja wykonawcza pushuje kod do scalenia (`git push origin
HEAD:claude/mv-design-pro-twin-audit-u4lhy0`, ponowienia 2/4/8/16 s); gałęzie `…-wip-*` (A.3) wyłącznie
zabezpieczają pracę w toku (mandat pkt VII.4).

**A.2 Pull requesty.** #474 — scalony 2026-09-30 (`8f7ed3c2`) przy komplecie 28 sprawdzeń CI zielonym na
`2be588ea` w przebiegach push i pull_request (pełny `pytest`, walidacja fizyczna dynamiki z pełnym
zestawem mutacji, wyrocznie ANDES i pandapower, PostgreSQL 16, pełne e2e i ścieżka krytyczna na realnym
backendzie, front, kontrakty SLD); CI `main` po scaleniu — część H. Następny PR z tej gałęzi (poprawka 2
i SKONCZONOSC-CHWILI-ZERO, potem partie 6 i 7) czeka na decyzję właściciela o trybie scalania: po
scaleniu #474 system uprawnień sesji oznaczył scalanie bez przeglądu człowieka, więc sesja nie otwiera
i nie scala kolejnych PR bez tej decyzji. #475 — gałąź badawcza dynamiki, **NIE DO SCALENIA** bez
osobnej kwalifikacji (mandat pkt I). #476 — scalony.

**A.3 Praca w toku zabezpieczona na gałęziach zdalnych** (migawka drzewa roboczego wykonawcy jako commit nad
bazą; kontynuacja = `git fetch origin <gałąź>` + nowe drzewo robocze z tej gałęzi):

| Gałąź zdalna (`claude/mv-design-pro-twin-audit-u4lhy0-…`) | Karta | Baza | Uwagi |
|---|---|---|---|
| `wip-odmowa-422-gotowy` | ODMOWA-DANYCH-422 `1a235fa3` | `e233886a` | karta domknięta przez wykonawcę (2026-09-30 ~04:15 UTC): strażnik połknięć zielony, `guardy_z_ci.py` komplet zielony, testy celowane 13 389 bez porażki; odbiór integratora w partii 6 |
| `wip-odmowa-422` | migawka historyczna ODMOWA-DANYCH-422 | `e233886a` | `fa08fbeb` — zastąpiona przez `…-gotowy`; do usunięcia po scaleniu partii 6 |
| `wip-pola-w-torze` | POLA-W-TORZE | `e8756f42` (partia 5 + POLE-ZAJĘTE) | migawka `2e68937d` (2026-09-30 ~01:10 UTC) |
| `wip-sld-substrat` | SLD-SUBSTRAT faza 2 | `79869f91` (pierwszy commit karty, odebrany) | migawka `9cb1420a` (2026-09-30 ~01:10 UTC) |
| `wip-ab-1b3b` | AB-1b.3b | `509c4776` | migawka `af47e1da` (2026-09-30 ~01:10 UTC) |
| `wip-nastawy` | BIEG-ZABEZPIECZEN-Z-MODELU | `3840e239` | migawka `19bd8a07` (2026-09-30 ~01:10 UTC) |
| `wip-determinizm` | DETERMINIZM-KATA-FAZORA | `3840e239` | migawka `b82d53e8` sprzed commitu; treść weszła do partii 5 (`b15a2495`) |
| `wip-integracja-p6` | partia 6: POLE-ZAJĘTE `c7e45c33` + fikstury | `e8756f42` | gotowe do partii 6 (przeniesienie na czubek + regeneracja fikstur) |
| `wip-dowod-cieplny-gotowy` | DOWOD-CIEPLNY `53397f31` | `c987ca53` (S95-START sprzed przeniesienia) | gotowe do partii 6 (przeniesienie na czubek) |
| `wip-dowod-cieplny`, `wip-e2e-nazwy` | migawki historyczne | — | zastąpione (`…-gotowy`, partia 5); do usunięcia po scaleniu partii 6 |
| `wip-pola-w-torze-gotowy` | POLA-W-TORZE `71c27cbf` | `c7e45c33` (POLE-ZAJĘTE) | karta domknięta przez wykonawcę (meldunek w rejestrze partii 6); partia 6; zastępuje migawkę `wip-pola-w-torze` |
| `wip-sld-substrat-gotowy` | SLD-SUBSTRAT faza 2 `2eb83c40` | `79869f91` | karta domknięta przez wykonawcę; partia 6; zastępuje migawkę `wip-sld-substrat` |
| `wip-ab-1b3b-gotowy` | AB-1b.3b `f0cabe57` | `509c4776` | karta domknięta przez wykonawcę bez nałożonej poprawki determinizmu i PRZENOSNOSC-NIEPEWNOSCI (kolizja w `silnik.py`, `obserwable.py`) — partia 7 |
| `wip-nastawy-gotowy` | BIEG-ZABEZPIECZEN-Z-MODELU `1551dc49` | `3840e239` | karta domknięta przez wykonawcę; partia 7 |
| `wip-szybkie-testy` | SZYBKIE-TESTY (migawka) | `9cc212b9` | `061bbed6` — praca w toku (analiza porażek izolacji pytest-xdist); karta dokończenia w sesji |
| `wip-przenosnosc-2` | poprawka 2 PRZENOSNOSC-NIEPEWNOSCI + SKONCZONOSC-CHWILI-ZERO | `2be588ea` | `0f38d197` — zastąpiona gałęzią programu nad `8f7ed3c2` (A.1); do usunięcia po scaleniu kontynuacji |
| `wip-partia-6` | partia 6: POLE-ZAJĘTE, POLA-W-TORZE, DOWOD-CIEPLNY, ODMOWA-DANYCH-422, SLD-SUBSTRAT + fikstury przegenerowane | `0f38d197` | `54495b73` — testy świeżości fikstur i złotych parytetów zielone (357); pełna regresja partii i karta SZYNY-STACJI-LUSTRO w toku |
| `wip-autotesty` | AUTOTESTY-W-DRZEWIE `4a7329ad` (pierwszy commit karty GRANICE-IMPORTOW + AUTOTESTY) | `2be588ea` | zastąpiona — karta domknięta, commity na gałęzi programu (A.1); do usunięcia po scaleniu kontynuacji |

**A.4 Drzewa robocze lokalne** (katalog `.claude/worktrees/` kontenera — giną z kontenerem; prawdą jest
tabela A.3): `odbior-p5final` (`int/p5final` — czubek partii 5 z tym pakietem i poprawką 1 karty
PRZENOSNOSC-NIEPEWNOSCI), `odbior-p5` (`int/p5`,
łańcuch p5b na `3840e239`), `odbior-determinizm` (`int/determinizm`, poprawka przed przeniesieniem), `odbior-p6`, `odbior-dowodcieplny`,
`odbior-odmowa422`, `odbior-polawtorze`, `odbior-sldsubstrat`, `odbior-ab1b3b`, `odbior-nastawy`,
`odbior-granice` (`int/granice` — karta GRANICE-IMPORTOW + AUTOTESTY-W-DRZEWIE, domknięta; commity na gałęzi programu),
`odbior-szybkie-testy` (`int/szybkie-testy`, niezacommitowana praca SZYBKIE-TESTY), `odbior-kont1` (`int/kont1` —
kontynuacja nad `8f7ed3c2`, A.1), `odbior-p6b` (`int/p6b` — partia 6), `odbior-ab1b3b-r` (`int/ab1b3b-r` —
karta AB-1b.3b-NA-CZUBKU, wykonawca w toku), `szyny-stacji` (`karta/szyny-stacji` — karta SZYNY-STACJI-LUSTRO,
wykonawca w toku); pozostałe
(`odbior-abp1*`, `odbior-proofpack`, `odbior-s95start`, `odbior-e2enazwy`, `odbior-ci`, `r10`, `fable-b02`,
`agent-*`) — historyczne, bez treści niezintegrowanej. Główny checkout `/home/user/MV-Design-PRO` ma stary
indeks z plikami FROZEN — **nie commitować z niego**.

### B. Macierz wykonania (stan 2026-09-30)

| Stan | Pozycje |
|---|---|
| **DONE + VERIFIED, na gałęzi PR #474** | W1–W3 (w tym W3-J, V12.7), W6-0 (S-1…S-5: stopień dowodowy NC RfG/FRT, koniec `no_module`, autorytet zwarć, jeden tor NC RfG), W5-A i W5-D (uziemienie jedną reprezentacją, model fazowy i rozpływ niesymetryczny jako bieg produktu — `56d1a205`, `d3687ba3`, `ced1b25b`, `03fad2b8`), W6-1…W6-3 (kontrakty czasu, rdzeń dynamiki, urządzenia i adapter), B-02 powierzchnie analityczne; program A/B: AB-0, AB-1a (pakiety 0, A, A2, B, C, D1, D2, E, E1, E2, L), AB-H0 z O-53, AB-1b.1a, AB-1b.1b, AB-1b.3a, AB-P1; klasy jakości #135, #140–#145, PL-ZNAKI, ETYKIETY-TR, MAGISTRALA-OCENA, PASMO-1KV, NAZWY-JEDNO-ZRODLO, archiwum projektu, PROOFPACK-KONTRAKT, S95-START, #151, DETERMINIZM-KATA-FAZORA, WATKI-BLAS-E2E, PRZENOSNOSC-NIEPEWNOSCI (poprawka 1); partie integracji 1–5 (rejestr: `docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` §7) |
| **MERGE READY** | PR #474 jako całość — po zielonym komplecie CI na czubku (część H) |
| **VERIFIED, niezintegrowane** | POLE-ZAJĘTE (`c7e45c33`, gałąź `wip-integracja-p6`), DOWOD-CIEPLNY (`53397f31`, `wip-dowod-cieplny-gotowy`), ODMOWA-DANYCH-422 (`1a235fa3`, `wip-odmowa-422-gotowy`; weryfikacja wykonawcy — odbiór integratora w partii 6), POLA-W-TORZE (`71c27cbf`, `wip-pola-w-torze-gotowy`), SLD-SUBSTRAT faza 2 (`2eb83c40`, `wip-sld-substrat-gotowy`) — partia 6; AB-1b.3b (`f0cabe57`, `wip-ab-1b3b-gotowy`), BIEG-ZABEZPIECZEN-Z-MODELU (`1551dc49`, `wip-nastawy-gotowy`) — partia 7 |
| **IN PROGRESS** | GRANICE-IMPORTOW + AUTOTESTY-W-DRZEWIE (commity wykonawcy `4a7329ad`, `1ca6ca08` na gałęzi programu jako `f1c27d8a`, `ce138c51`; weryfikacja integratora na połączonym drzewie w toku), SZYNY-STACJI-LUSTRO (wykonawca, drzewo `szyny-stacji`), AB-1b.3b-NA-CZUBKU (wykonawca rdzenia, drzewo `odbior-ab1b3b-r`), partia 6 — pełna regresja (`odbior-p6b`), SZYBKIE-TESTY (tabela A.3) |
| **BLOCKED (bramka właściciela)** | B-01: pozycje (a)–(m) planu §12.2 (jedna lista — O-57 pkt 6); B-02: werdykt wizualny zrzutów (część J) |
| **RESEARCH ONLY** | PR #475 (laboratorium dynamiki) |
| **NOT STARTED (karta gotowa)** | AB-1b.2 + AB-1d_min, SIEC-ZLOTA-KATALOG, GOTOWOSC-DER-BACKEND, ENDPOINTY-BEZ-KONSUMENTA, KOMUNIKATY-BEZ-ID, LICZBY-PL, PL-ZNAKI-2, O-53b (treść: `docs/plan/KARTY_OTWARTE_2026-09.md`, `KARTA_AB_1B2_AB_1DMIN_GFL_2026-09.md`) |
| **NOT STARTED (szkic §0 z O-57)** | DYNAMIKA-W-TLE, KATALOG-DYNAMIKI-BRAKI, AB-1c, O-52, CICHE-ZERO (szkice na końcu `KARTY_OTWARTE_2026-09.md`) |
| **NOT STARTED (bez karty)** | AB-H0b (lista pozycji), AB-H1 (może biec od zaraz — O-57 pkt 4), AB-6b (nowy, O-57 pkt 5), dalsza sekwencja A/B od AB-1d (plan §5); W4-1 (= BIEG-ZABEZPIECZEN-Z-MODELU, w toku) i W4-2, W5-B, W5-C, W5-E, W5-T, SZABLONY-NN, W6-K, W6-8, W7–W12, CV-6 G01 |

### C. Rejestr niedokończonych kart

Treść kart (powód, §0 rozstrzygnięć, testy jako iloczyn cech, granice, kryterium ukończenia):
`docs/plan/KARTY_OTWARTE_2026-09.md` (karty mniejsze + reguła biegów weryfikacyjnych),
`docs/plan/KARTA_AB_1B2_AB_1DMIN_GFL_2026-09.md`, `docs/plan/KARTA_AB_1B3_ODBIORY_2026-09.md` (z częścią
AB-1b.3b), `docs/plan/KARTA_W5_MODEL_FAZOWY_I_UZIEMIENIE_2026-09.md`, karty W6 (`KARTA_W6_*`).

| Karta | Priorytet | Stan | Zależy od | Uwagi |
|---|---|---|---|---|
| POLA-W-TORZE | P0 (aparat pola martwy elektrycznie — dwie ścieżki tej samej fizyki) | domknięta przez wykonawcę (`71c27cbf`), odbiór w partii 6 | POLE-ZAJĘTE | uzupełnienie o migrację wyłącznika głównego nN (margines 18 mln % w scenie koordynacji) |
| BIEG-ZABEZPIECZEN-Z-MODELU | P0 (ocena na syntetycznym urządzeniu, nastawy bez jednostek, margines 18 mln %) | domknięta przez wykonawcę (`1551dc49`), odbiór w partii 7 | — | |
| SIEC-ZLOTA-KATALOG | P0 (sieć złota deklaruje katalog, 7 odwołań nie istnieje) | nierozpoczęta | — | zasila sceny harnessu i zrzuty B-02 |
| GOTOWOSC-DER-BACKEND | P0 (próg 87T z `?? 0` daje „niewymagane” przy braku mocy) | nierozpoczęta | — | nowy kod słownika gotowości |
| AB-H0b | P0 (N-1 V12.6 bez etykiety „szacunek bez rozpływu”, stałe V12.6 bez podstawy) | lista pozycji | — | karta do napisania z `KARTY_OTWARTE` |
| AB-1b.3b | P1 (ścieżka krytyczna A/B) | domknięta przez wykonawcę (`f0cabe57`), odbiór w partii 7 | AB-1b.3a | kolizja z determinizmem w `silnik.py`, mutacje M38–M51 |
| AB-1b.2 + AB-1d_min | P1 (ścieżka krytyczna A/B) | nierozpoczęta | AB-1b.3b | mutacje M52–M66 |
| GRANICE-IMPORTOW + AUTOTESTY-W-DRZEWIE | P1 (bramki CI przepuszczają importy względne przekraczające granicę — `dynamika_granica_importow` o jeden poziom za głęboko: `from ..power_flow_newton import …` z rdzenia dynamiki do rdzenia B-01 przechodzi; `enm_store_key`, `scenario_copy`, `no_direct_fault_params`, `legacy_public_path` czytają samo `module`; autotest bramki dynamiki wstrzykuje pliki do prawdziwego pakietu produktu) | domknięta przez wykonawcę (`4a7329ad`, `1ca6ca08`; na gałęzi programu `f1c27d8a`, `ce138c51`), weryfikacja integratora w toku | — | jedno źródło rozwiązywania importów dla bramek; hak audytu w `scripts/conftest.py` odrzucający zapis autotestu do drzewa repo; wiersz rejestru planu §7 po odbiorze |
| SZYNY-STACJI-LUSTRO | P1 (predykaty parami: przynależność szyny do stacji we froncie jako dwie połówki reguły backendu `enm.tor_pola.szyny_stacji` — `szynaNalezyDoStacji` bez szyn za aparatami pól nN, `stationLoadBusRefs` bez zacisków pól SN i zależny od kolejności gałęzi; spotkały się w partii 6) | w toku (wykonawca, drzewo `szyny-stacji` na `54495b73`) | partia 6 | jedno źródło (pole wyprowadzone albo jedno lustro) z testem parytetu z backendem na każdej stacji fikstur generowanych; inwentarz 135 użyć `bus_refs` we froncie |
| AB-1b.3b-NA-CZUBKU | P1 (ścieżka krytyczna A/B: odbiory stanowe muszą spełniać niezmienniki poprawek chwili zero O-58 pkt 1–6 i SKONCZONOSC-CHWILI-ZERO) | w toku (wykonawca rdzenia, drzewo `odbior-ab1b3b-r` na `0f38d197`) | — | przeniesienie `f0cabe57`, tabela klasy rodzaj urządzenia × niezmiennik, mutacje od M75, przenośność sceny w czterech jądrach OpenBLAS; potem partia 7 |
| BIEG-ZABEZPIECZEN-NA-PARTII-6 | P0 (przeniesienie `1551dc49` na partię 6: zacisk zabezpieczenia z toru pola, odmowy `OdmowaDanychError`, szyny stacji z jednego źródła) | karta gotowa, wykonawca po zwolnieniu procesora | partia 6 | konflikty w 10 plikach źródłowych i fiksturach koordynacji — scalenie semantyczne z inwentarzem klasy; potem partia 7 |
| ODMOWA-DANYCH-422 | P1 (obcy `ValueError` jako błąd użytkownika) | domknięta przez wykonawcę (`1a235fa3`) | — | odbiór integratora w partii 6; do listy B-01: odmowy wejścia rdzeni jako typ odmowy danych (dziś tłumaczone na granicy warstwy aplikacji w 13 miejscach) |
| SLD-SUBSTRAT faza 2 | P1 (fikstury SLD bez generatora; element modelu nierysowany) | w toku | — | reguła zapisu liczb w fiksturach (bajty niezależne od maszyny) |
| O-53b | P1 (reguła mocy źródeł × transformator tylko dla jednego źródła) | nierozpoczęta | — | kasacja tras piszących model z pominięciem operacji |
| ENDPOINTY-BEZ-KONSUMENTA | P2 | nierozpoczęta | ODMOWA-DANYCH-422 | |
| KOMUNIKATY-BEZ-ID, LICZBY-PL, PL-ZNAKI-2 | P2 (klasy tekstu dla projektanta) | nierozpoczęte | — | |
| CICHE-ZERO | P1 | szkic §0 | GOTOWOSC-DER-BACKEND | `?? 0` / `?? false` / `or 0.0` / `or False` zasilające decyzję (front 258 + 25, backend 57 + 11 + 3); `false_zero_guard` dziś tylko raportuje → tryb ścisły z budżetem 0 |
| DYNAMIKA-W-TLE | P1 (warunek Pakietu E karty AB-1b.2, AB-1c i AB-6 — O-57 pkt 2) | szkic §0 | — | bieg `DYNAMIKA_RMS` synchronicznie w żądaniu HTTP (`api/execution_runs.py:236-253`); wykonawca w procesie, stan biegu utrwalony, 202 + odpytywanie, anulowanie; kasacja martwej konfiguracji Celery; PERF-DYN-0 |
| KATALOG-DYNAMIKI-BRAKI | P1 (warunek AB-1c i AB-4a) | szkic §0 | dane OD-17 (magazyn) | brak przestrzeni katalogowej maszyny synchronicznej (warunek AB-1c, SPGM-B); BESS bez sprawności i okna SOC (warunek AB-4a; `soc_poczatkowy` → warunek początkowy punktu pracy); profile turbin typu 1/2 istnieją, ale rdzeń nie ma ich modelu (W6-J) → kasacja z bramką wskrzeszenia |
| O-52 | P2 | szkic §0 | ODMOWA-DANYCH-422 (typ odmowy) | łagodne rzutowanie pydantic na granicach danych; strażnik AST `strict=True` |
| AB-1c | P1 (ścieżka krytyczna A/B) | szkic §0 | AB-1b.2, AB-1d_min, KATALOG-DYNAMIKI-BRAKI (maszyna synchroniczna), DYNAMIKA-W-TLE; odpowiedź właściciela o delegację B-01 dla kasacji `frt_hvrt` | profil wzorcowy testowy do odbioru logiki (O-57 pkt 10) |
| AB-H1 | P1 (tor równoległy) | bez karty (plan §5, §11) | AB-H0 ✓, AB-1a ✓ | nowe pakiety `solvers/harmoniczne/`, `core/stemplowanie_galezi.py`; zakaz `dynamika/**` i `v126_academic.py` |
| W5-B → W5-C ∥ W5-E → W5-T → SZABLONY-NN | P1 (program W, tor modelu ENM) | karty do napisania z `KARTA_W5_*` §1 | W5-A ✓, W5-D ✓ | W5-B: `LEGACY_FIELD_COLLECTIONS`/`field_specs` → typowany `Bay`; W5-E bez solvera do OD-25 |
| CV-6 G01 (W8), W4-2, W6-K, W6-8, W7, W9–W12, AB-6b | wg części D | nierozpoczęte | część D | |

### D. Graf zależności i ścieżka krytyczna (plan §5 i §11 po O-57)

**Sekwencja wiążąca A/B** (strażnik `scripts/plan_ab_zaleznosci_guard.py`; ✓ = wykonane):
AB-1a ✓ → AB-H0 ✓ → AB-1b.1 ✓ → AB-P1 ✓ → AB-H1 → AB-1b.3 (3a ✓, 3b w toku) → AB-1b.2 → AB-1d_min → AB-1c →
AB-1d → AB-2 → AB-3 → AB-3b → AB-3c → AB-4a → AB-H2 → W6-K → AB-4b → AB-5 → AB-5b → AB-H3 → AB-6 → AB-6b →
AB-H4 → AB-7. Warunki spoza tokenów sekwencji (wiersze §11): DYNAMIKA-W-TLE przed Pakietem E karty AB-1b.2,
przed AB-1c i AB-6; KATALOG-DYNAMIKI-BRAKI — maszyna synchroniczna przed AB-1c, magazyn (sprawność, okno SOC)
przed AB-4a; W6-K — po W5-A i W5-D (spełnione).

**Ścieżka krytyczna:** AB-1b.3b (w toku) → AB-1b.2 pakiety 0/A/B/C/D → [DYNAMIKA-W-TLE scalona] → AB-1b.2
pakiety E/F (= AB-1d_min)/G/H → [KATALOG-DYNAMIKI-BRAKI: maszyna synchroniczna] → AB-1c (odbiór logiki na
profilu wzorcowym testowym; kasacja `frt_hvrt` po decyzji o delegacji B-01) → AB-1d (L5: dwie drogi niezależne,
ANDES) → AB-2 → AB-3 → … → AB-7.

**Tory równoległe** (jeden wykonawca na tor; granice plików — część F):

| Tor | Kolejność |
|---|---|
| R — rdzeń dynamiki | partia 7: AB-1b.3b → AB-1b.2 (0/A/B/C/D) → DYNAMIKA-W-TLE → AB-1b.2 (E/F/G/H) → AB-1c → AB-1d → AB-2 → AB-3 → AB-3b → AB-3c → AB-4a → W6-K → AB-4b → AB-5 → AB-5b → AB-6 → AB-6b → AB-7 |
| H — dziedzina częstotliwości | AB-H1 (od zaraz) → AB-H2 (po AB-3: migawki punktu pracy) → AB-H3 (z AB-6) → AB-H4 (z AB-7) |
| M — model ENM | partia 6 (POLE-ZAJĘTE, POLA-W-TORZE, SLD-SUBSTRAT faza 2, ODMOWA-DANYCH-422) → W5-B → W5-C ∥ W5-E → W5-T → SZABLONY-NN → W7 → W8 (sieć kompensowana G01) |
| Z — zabezpieczenia | W4-1 = BIEG-ZABEZPIECZEN-Z-MODELU (w toku) → W4-2 (67/67N, 21, 87T, 25, 50BF, grupy, TRIP; po W5-B) → wejście do AB-5 |
| D — dokumenty, UX, higiena | P0: SIEC-ZLOTA-KATALOG, GOTOWOSC-DER-BACKEND, AB-H0b; P1: O-53b, CICHE-ZERO, O-52, ENDPOINTY-BEZ-KONSUMENTA (po ODMOWA-DANYCH-422); P2: KOMUNIKATY-BEZ-ID, LICZBY-PL, PL-ZNAKI-2; W10-1 → W9 → W10-2 → W11 → W12 |

### E. Plan następnych prac w kolejności wykonania

1. **Delta od checkpointu:** `git fetch origin`; czubki gałęzi wobec tabeli A; stan PR #474 i CI na czubku
   (część H). Czy wykonawcy zostawili commity lokalne albo nowsze migawki WIP (porównać `git ls-remote` z A.3).
2. **Scalenie PR #474** do `main`, gdy komplet 9 workflowów jest zielony na czubku (commit scalający, bez
   squasha — rejestr §7 i karty cytują SHA); weryfikacja workflowów na `main`. Czerwone CI = praca teraz
   (naprawa u źródła), nie czekanie.
3. **Odbiór kart w toku** (albo ich wznowienie z gałęzi `wip-*` z kartą z `KARTY_OTWARTE_2026-09.md`):
   ODMOWA-DANYCH-422, POLA-W-TORZE, SLD-SUBSTRAT faza 2, AB-1b.3b, BIEG-ZABEZPIECZEN-Z-MODELU.
4. **Partia 6** (baza: czubek po partii 5): POLE-ZAJĘTE (`wip-integracja-p6`) → DOWOD-CIEPLNY
   (`wip-dowod-cieplny-gotowy`, przeniesienie) → ODMOWA-DANYCH-422 → SLD-SUBSTRAT faza 2 → POLA-W-TORZE;
   jeden łańcuch integratora, jedna regeneracja fikstur, wiersze §7, push, CI.
5. **Partia 7:** AB-1b.3b (przeniesienie na partię 6; duplikaty poprawki determinizmu usuwane przy scaleniu)
   + BIEG-ZABEZPIECZEN-Z-MODELU (po ODMOWA-DANYCH-422 — dziewięć wspólnych plików API i silnika
   zabezpieczeń); łańcuch z walidacją fizyczną i harnessem mutacji.
6. **Karty do napisania przez integratora** (przed uruchomieniem wykonawców): DYNAMIKA-W-TLE,
   KATALOG-DYNAMIKI-BRAKI, AB-1c, CICHE-ZERO, O-52 (szkice §0 w `KARTY_OTWARTE`), AB-H0b (lista pozycji),
   AB-H1 (plan §5 i §11), W5-B (karta W5 §1), korekta karty AB-1b.2 wg O-57 pkt 8.
7. **Jedna wiadomość do właściciela** z decyzjami z części J.
8. **Pierwsze równoległe uruchomienie** — część K; fala 2 po odbiorze fali 1: AB-1b.2 E/F/G/H, W5-B,
   KATALOG-DYNAMIKI-BRAKI, GOTOWOSC-DER-BACKEND, O-53b; potem AB-1c.

### F. Granice własności plików dla kolejnych wykonawców (O-57 pkt 12–13)

Na 4 CPU: do czterech wykonawców naraz plus integrator, jeden ciężki bieg naraz (reguła biegów w
`KARTY_OTWARTE_2026-09.md`). Jeden wykonawca na tor; pliki toru wyłączne.

| Tor | Pliki wyłączne | Zakaz |
|---|---|---|
| R — rdzeń dynamiki (ścieżka krytyczna; jedna karta naraz) | `backend/src/network_model/solvers/dynamika/**`, `enm/adapter_dynamiki.py`, `enm/dynamika_modele.py`, `enm/dynamika_z_katalogu.py`, `enm/scenariusze.py`, `application/contracts/resultset_dynamic_v2.py`, `backend/tests/walidacja_fizyczna/**` (manifest, harness mutacji: M38–M51 AB-1b.3b, M52–M66 AB-1b.2, M67–M74 zajęte, kolejne od M75), `backend/tests/network_model/dynamika/**`, `frontend/src/ui2/wyniki/dynamika/**` | inne tory nie edytują; AB-H1 nie importuje z `dynamika/` |
| H — dziedzina częstotliwości | nowe `network_model/solvers/harmoniczne/**`, `network_model/core/stemplowanie_galezi.py`; `dziedziny/**`, most `solver_input/v126_contracts.py`, `frontend/src/ui2/wyniki/akademickie/**` | `v126_academic.py` (B-01) nietknięty do decyzji §12.2 (b) |
| M — model ENM | `enm/domain_operations.py`, `enm/domain_operations_v2.py`, `enm/migrations/**`, `enm/validator.py`, `application/field_read_model.py`, adaptery SLD wg listy plików karty | `enm/models.py` — wyłącznie pola addytywne uzgodnione z torem R (wspólne `Load`, `Generator`) |
| Z — zabezpieczenia | `application/protection_analysis/**`, `application/analyses/protection/**`, `protection/**`, trasy `api/protection_*`, `frontend/src/ui/protection-coordination/**`, `frontend/src/ui2/kreatory/przekaznik/**` | `protection_iec60255.py` (B-01) |
| D — dokumenty, UX, higiena | per karta: SIEC-ZLOTA-KATALOG (`backend/tests/cgmes/**`, generatory scen, katalog tylko do odczytu), GOTOWOSC-DER-BACKEND (`frontend/src/ui/network-build/station-der/**`, `domain/der_protection_functions.py`, `domain/readiness_bridge.py`), ENDPOINTY (routery i klienci API), klasy tekstu (podział plików spisany przed startem) | — |
| **Pliki gorące — wyłącznie integrator albo jedna karta naraz** | `enm/canonical_analysis.py` (w partiach 6–7 dotyka go pięć kart), `domain/canonical_operations.py` (słownik gotowości — cztery karty), `backend/scripts/eksport_fixtur_harnessu.py`, fikstury `frontend/src/harness-fixtures/generated/**` i `frontend/src/ui/sld/**/fixtures/**`, migawka OpenAPI, piny strażników (`scripts/*_guard.py`, `werdykt_wyjasnialny_allowlist.json`, zapadki mypy/tsconfig/podstawień), wpisy wskrzeszenia w `scripts/legacy_public_path_guard.py` (wykonawca dostarcza łatkę, integrator nakłada) | zmiany z pomiaru przy scaleniu |

Rdzenie B-01 (`scripts/rdzenie_b01.py`) i kontrakty FROZEN — bez zmian w każdej karcie; pozycje wymagające
zmiany rdzenia idą do listy §12.2 planu.

### G. Wykonalne polecenia testowe

Interpreter backendu: venv projektu (`poetry env info -p` w `mv-design-pro/backend`; w kontenerze
2026-09-30: `/root/.cache/pypoetry/virtualenvs/mv-design-pro-backend-D2vgvUMQ-py3.11/bin/python`),
`PYTHONPATH=src:.` w `backend`. Frontend: `npm ci` jeden raz na maszynę (drzewa robocze dowiązują
`frontend/node_modules`). Reguła biegów: wykonawca — testy celowane dotkniętych modułów, komplet strażników,
vitest i e2e dotkniętych ekranów; integrator — pełny łańcuch raz na partię (treść reguły:
`docs/plan/KARTY_OTWARTE_2026-09.md`, „Reguła biegów weryfikacyjnych”). Kody wyjścia łapane bezpośrednio do pliku
stanu (nigdy `cmd | tail; echo $?`), ciężkie biegi pojedynczo w tle z plikiem-znacznikiem końca, procesy
kończone po PID, prywatny `--basetemp`.

Łańcuch partii (integrator; drzewo = katalog `mv-design-pro` partii; porty e2e dowolne wolne):

```bash
export OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1  # maszyna współdzielona — reguła biegów pkt 6
cd "$DRZEWO"                                   # …/mv-design-pro
python scripts/guardy_z_ci.py                   # komplet strażników CI + black/ruff + tsc + eslint + samotesty
cd backend
PYTHONPATH=src:. python -m pytest -q -p no:cacheprovider --basetemp="$BT/fix" \
  tests/ci/test_fixtury_harnessu.py tests/api/test_openapi_snapshot.py          # fikstury (tolerancja) + OpenAPI
PYTHONPATH=src:. python -m pytest -q -p no:cacheprovider --basetemp="$BT/reg" \
  -m "not pandapower and not andes"                                               # pełna regresja (~26 600 testów)
PYTHONPATH=src:. "$PP_VENV/bin/python" -m pytest -q -m pandapower tests         # wyrocznia pandapower (venv: pandapower 3.5.4, scipy<1.17)
PYTHONPATH=src:. python -m tests.walidacja_fizyczna.mutacje M30 M32 …           # harness mutacji (wybrane albo komplet)
cd ../frontend
npx vitest run --no-file-parallelism                                             # pełny vitest
PLAYWRIGHT_REAL_BACKEND=1 PLAYWRIGHT_BACKEND_URL=http://127.0.0.1:18793 \
PLAYWRIGHT_FRONTEND_URL=http://127.0.0.1:5213 VITE_API_URL_DEV=http://127.0.0.1:18793 \
PLAYWRIGHT_BACKEND_PYTHON="$(cd ../backend && poetry env info -p)/bin/python" \
  npx playwright test e2e/ --workers=1 --reporter=line                           # pełny e2e na realnym backendzie
```

Generatory fikstur: `backend/scripts/eksport_fixtur_harnessu.py` (`--sprawdz` porównuje bajtowo — na maszynie
innej niż ta, na której fikstury powstały, zgłasza szum ostatnich cyfr; rozstrzygnięciem repo jest komparator
z tolerancją `tests/ci/test_fixtury_harnessu.py`, a zmiana fikstury wymaga klasyfikacji treść/szum liść po
liściu), migawka OpenAPI z generatora testu, substrat SLD skryptami `frontend/scripts/generate-sld-substrate-*.py`.

### H. Wyniki ostatnich testów i ich ograniczenia

**H.1 Pomiary** (każdy z datą i drzewem; logi łańcuchów zostały w katalogu roboczym sesji, liczby są
przepisane do wierszy rejestru planu A/B §7):

| Bieg | Drzewo | Wynik |
|---|---|---|
| Pełna regresja backendu `-m "not pandapower and not andes"` | łańcuch p5, `e233886a` (`backend/src` identyczny z `3840e239`), 2026-09-29 | **26 608 passed**, 37 deselected, 0 failed |
| Wyrocznia pandapower (`-m pandapower`, venv wyroczni) | łańcuch p5b, `3840e239` | 30 passed |
| `scripts/guardy_z_ci.py` | łańcuch p5b, `3840e239` | 105 strażników, black/ruff, `type-check`, `lint`, 2 920 samotestów — komplet zielony |
| Fikstury harnessu i migawka OpenAPI | łańcuch p5b | 269 passed |
| Pełny vitest | łańcuch p5b | 879/879 plików, 12 716 passed + 14 todo |
| Pełny e2e na realnym backendzie | łańcuch p5b | 510 przypadków: 509 passed, 1 failed — `industrial-template-mass-flow` (bieg zwarciowy sieci 50 stacji 866 049 ms przy limicie 240 s: nadsubskrypcja wątków BLAS; po naprawie WATKI-BLAS-E2E spec zielony, 19 553,4 ms) |
| DETERMINIZM-KATA-FAZORA — testy celowane (każdy plik testowy backendu wołający rdzeń dynamiki) | `3840e239` + poprawka | 2 830 passed, 37 deselected |
| DETERMINIZM-KATA-FAZORA — harness mutacji | j.w. | M30, M32, M67, M68, M69 — 5/5 zabite; manifest i testy mutacji 150 passed |
| DETERMINIZM-KATA-FAZORA — `guardy_z_ci.py` | j.w. | komplet zielony (105 strażników, black/ruff, `type-check`, `lint`, 2 920 samotestów) |
| DETERMINIZM-KATA-FAZORA — e2e ekranów dynamiki | j.w. | 145 passed, zatwierdzone zrzuty bez zmian |
| WATKI-BLAS-E2E — spec `industrial-template-mass-flow` ścieżką konfiguracji Playwrighta | `3840e239` + zmiana karty | 1 passed; `POST …/execute` 19 553,4 ms przy jednym wątku (środowisko procesu backendu odczytane z `/proc`: `OPENBLAS_NUM_THREADS=1`, `OMP_NUM_THREADS=1`; w powłoce zmienne nieustawione), load average 9,0–12,2 (próbki co 30 s) |
| CI GitHub (9 workflowów; 28 sprawdzeń w przebiegach push i pull_request) | `2be588ea` (czubek #474 przy scaleniu) | komplet zielony: pełny `pytest`, walidacja fizyczna dynamiki z pełnym zestawem mutacji, wyrocznie ANDES i pandapower, PostgreSQL 16, pełne e2e i ścieżka krytyczna na realnym backendzie, front, kontrakty SLD |
| CI GitHub po scaleniu #474 | `main` `8f7ed3c2` (drzewo = `2be588ea`) | w chwili tego commitu 8 z 9 workflowów zielonych (Frontend E2E full, Frontend checks, Frontend E2E smoke, SLD Determinism, P0 Extended Guards, Docs, Architecture, Physics Label); `Python tests` w toku — wynik weryfikuje sesja przed kolejnym PR |
| CI GitHub (9 workflowów) | `9dd9e589` (pakiet wznowienia) | 8/9 zielonych; „Python tests” czerwony: job `pytest` w obu przebiegach — 3 z 26 634 (`u_f_est_hz` próbki 0 w trzech węzłach nN fikstury sceny dynamiki i testu sceny przy 1 i 2 wątkach BLAS różne o 0,38–0,57 % poza tolerancją komparatora; test zakazu `sys.path.insert(0, "scripts")` w testach backendu), job mutacji w przebiegu push (ten sam test sceny) — naprawa: karta PRZENOSNOSC-NIEPEWNOSCI |
| PRZENOSNOSC-NIEPEWNOSCI (poprawka 1) — testy celowane (75 plików testowych backendu wołających rdzeń dynamiki, w tym walidacja fizyczna z manifestem, fikstury harnessu, API i adapter dynamiki, SO-1a) | `9dd9e589` + poprawka | 2 283 passed, 3 deselected, 1 failed — `test_biegi_sa_powtarzalne_dla_kazdej_rodziny`: dwa biegi przypadku `gfl` różniły się WYŁĄCZNIE `odcisk_implementacji`, a odcisk drugiego biegu (`6d60b262…`) jest bitowo odciskiem pakietu dynamiki z plikiem `_iniekcja_scipy.py`, który autotest `scripts/test_dynamika_granica_importow_guard.py` wstrzykiwał do prawdziwego pakietu — autotest biegł równolegle w łańcuchu guardów (wada autotestu, karta AUTOTESTY-W-DRZEWIE); ten test osobno 1 passed, cały plik 36 passed, 4 powtórzenia w jednym procesie zielone |
| PRZENOSNOSC-NIEPEWNOSCI (poprawka 1) — harness mutacji | j.w. | M69, M70, M71, M72 — 4/4 zabite |
| PRZENOSNOSC-NIEPEWNOSCI (poprawka 1) — `guardy_z_ci.py`, vitest, e2e | j.w. | guardy: komplet zielony (105 strażników, black/ruff, `type-check`, `lint`, 2 920 samotestów); vitest `ui2/wyniki/dynamika` 50 passed, `ui2/wyniki/wzorzec` + `ui2/spaces/wyniki` 355 passed; e2e ekranów dynamiki na realnym backendzie 145 passed, zatwierdzone zrzuty bez zmian |
| PRZENOSNOSC-NIEPEWNOSCI (poprawka 1) — przenośność między jądrami OpenBLAS | j.w. | 12 wariantów {jądro: domyślne SkylakeX, Haswell, Sandybridge, Prescott, Zen} × {1, 2 wątki}: 0 różnic komparatora fikstur (RTOL 1e-4, pasmo zera 1e-8) przy 697–794 liściach różnych w ostatnich cyfrach, maksymalny względny rozrzut `u_f_est_hz` 9,6e-7 (zapas ×104 do RTOL), 0 różnic kodów jakości; fikstura w repo = wariant domyślny (0 różnic). Fikstury wobec `9dd9e589`: 5 różnic komparatora, wszystkie w próbce `t = 0` (`u_f_est_hz` trzech węzłów nN 6,48–6,50e-8 → 5,13–5,14e-9 Hz; `q_do_pu` transformatora stacji i `q_od_pu` odpływu nN −7,07e-8 / 7,25e-8 → −7,19442e-8 / 7,19442e-8 pu — oba końce tej samej gałęzi zgodne po korekcie algebry) oraz odcisk implementacji; 1 092 pozostałe liście — szum ostatnich cyfr w tolerancji |
| PRZENOSNOSC-NIEPEWNOSCI (poprawka 2) — testy celowane (estymator, próg części pewnej, przenośność, obserwable, kąt prądu, manifest i testy harnessu mutacji) | `2be588ea` + poprawka 2 | 247 passed; pełny zestaw testów rdzenia dynamiki — na drzewie z commitem SKONCZONOSC-CHWILI-ZERO (wiersz niżej) |
| PRZENOSNOSC-NIEPEWNOSCI (poprawka 2) — harness mutacji | j.w. | M69, M70, M71, M72, M73, M74 — 6/6 zabite; M21 (kontrolna) — nieważna |
| PRZENOSNOSC-NIEPEWNOSCI (poprawka 2) — przenośność | j.w. | scena harnessu, 12 wariantów {jądro} × {1, 2 wątki}: 0 różnic komparatora, rozrzut `u_f_est_hz` 9,6e-7 bez zmiany wobec poprawki 1 (scena leży na dnie zaokrągleń), 0 różnic kodów; fikstury sceny wobec `2be588ea` — wyłącznie skróty tożsamości (`odcisk_implementacji`, `result_hash`). SO-1a w czterech jądrach (domyślne, Haswell, Prescott, Zen): na `2be588ea` rozrzut `u_f` ×113 (747 z 7 323 wartości ponad 1e-4 względnie; próbka 54 węzła 110 kV 250× pod propagacją granicy), po poprawce ≤ 27,6 % (312 z 7 323, wyłącznie próbki przy dnie; żadna estymata pod dnem); kody jakości identyczne w obu drzewach; czas CPU biegu SO-1a 41,5–44,9 s → 45,2–46,4 s |
| SKONCZONOSC-CHWILI-ZERO + PRZENOSNOSC-NIEPEWNOSCI (poprawki 1 i 2) — pełny zestaw testów rdzenia dynamiki (59 plików testowych backendu wołających rdzeń dynamiki, punkt pracy albo bieg `DYNAMIKA_RMS`) | `0f38d197` | 2 331 passed, 3 deselected (66 min, jeden wątek BLAS; drzewo bitowo równe czubkowi kontynuacji) |
| j.w. — `guardy_z_ci.py` | j.w. | komplet zielony — 105 strażników, black/ruff, `type-check`, `lint`, 2 920 samotestów (drzewo `int/kont1`) |
| j.w. — e2e ekranów dynamiki na realnym backendzie | j.w. | 145 passed (22,5 min; `dowody-flow-ekspert-screenshot`, `dynamika-rms-flow`, `wszystkie-sceny-screenshot`, `wyniki-jezyk-inzyniera`) bez zmiany zatwierdzonych zrzutów; vitest `ui2/wyniki/dynamika`, `ui2/wyniki/wzorzec`, `ui2/spaces/wyniki` — 19 plików, 405 passed |
| CI GitHub (9 workflowów) | `82595588` (ostatni czubek wypchnięty przed tym pakietem) | 8/9 zielonych; pełny e2e — 9 czerwonych przypadków, naprawione w partii 5 (`7d3a0a41`, `3840e239`) |

**H.2 Ograniczenia:**

1. **CI na czubku** uruchamia push commitu z tym pakietem — wyniku nie da się zapisać w commicie,
   który go wyzwala. Odczyt i reakcja: krok E.1 (checks PR #474).
2. **Pełna regresja backendu nie była powtarzana po poprawce determinizmu.** Zmiana logiki leży wyłącznie
   w `dynamika/{silnik,siec,obserwable}.py` (w `wynik.py`, kontrakcie ResultSet dynamic v2, analizie
   kanonicznej i modelu ORM — tylko docstringi i komentarze); testy celowane obejmują każdy plik testowy
   wołający rdzeń dynamiki (inwentarz grepem po importach `solvers.dynamika`, biegu `DYNAMIKA_RMS` i kanałach
   kątów). Pełną regresję czubka wykonuje job CI „Python tests”.
3. **Wyrocznia ANDES** (`-m andes`) — w tej sesji lokalnie nie uruchamiana; ostatni zielony job CI na
   `82595588`.
4. **Czasy** z tej sesji mierzone na współdzielonej maszynie 4-CPU przy load average 12–15 (równolegle pięciu
   wykonawców) nie są wzorcem wydajności.
5. **Nadsubskrypcja wątków BLAS** (wykryta 2026-09-30). OpenBLAS startuje w każdym procesie numpy tyle wątków,
   ile rdzeni; przy kilku procesach naraz wątki jednego wywołania czekają na siebie nawzajem. Pomiar na tej
   maszynie przy obciążeniu 16–18 (odwrócenie macierzy zespolonej 800×800 ×6): wątki domyślne — 17,6 s
   ścienne i 9,3 s CPU, jeden wątek — 3,9 s i 1,6 s. Bieg zwarciowy sieci 50 stacji w e2e mass-flow:
   866 049 ms przy wątkach domyślnych (łańcuch p5b, limit speku 240 s przekroczony), 19 553,4 ms przy
   jednym wątku i load average 9–12, 6 130,7 ms w łańcuchu p5 (ten sam `backend/src`; obciążenia
   wtedy nie mierzono). Naprawa w backendzie e2e — `9cc212b9` (`playwright.config.ts`: `OPENBLAS_NUM_THREADS=1`, `OMP_NUM_THREADS=1` dla backendu e2e); biegi testów integratora i wykonawców —
   `OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1` (reguła biegów weryfikacyjnych, `KARTY_OTWARTE_2026-09.md`);
   polityka wątków obrazu Dockera — z pomiaru PERF-DYN-0 w karcie DYNAMIKA-W-TLE. Wyniki od liczby wątków
   i od jądra OpenBLAS nie zależą W TOLERANCJI KOMPARATORA FIKSTUR (DETERMINIZM-KATA-FAZORA,
   PRZENOSNOSC-NIEPEWNOSCI); ostatnie cyfry wartości zależą od kolejności sumowania. Korekta 2026-09-30:
   dawne zdanie „wyniki od liczby wątków nie zależą” było za mocne — test obu liczb wątków biegł na
   jednym jądrze, a runner CI (inne jądro) dał `u_f_est_hz` próbki 0 różne o 0,38–0,57 %.
6. **Migawki WIP** (A.3) pochodzą z ~01:10 UTC 2026-09-30; wykonawcy pracowali dalej — przy wznowieniu
   porównać z `git ls-remote` (krok E.1).

### I. Otwarte defekty P0/P1 (P0 — błędna fizyka, liczba, werdykt albo dane nieautorytatywne; P1 — bramka CI, integralność, WHITE BOX)

| # | Klasa | Defekt (miejsce) | Skutek dla projektanta | Naprawa |
|---|---|---|---|---|
| 1 | P0 | Aparat pola stacji poza torem prądowym: stacja wstawiona w odcinek i stacja końca ciągu przyłączają kable i transformator do szyny głównej z pominięciem aparatów pól; migracja `enm/migrations/nn_field_specs_promocja.py` wiesza wyłącznik główny nN jak odpływ na martwej szynie | otwarcie aparatu nic nie zmienia, prąd przez aparat nie płynie; zwarcie i element chroniony na martwej szynie | POLA-W-TORZE (w toku) |
| 2 | P0 | Ocena zabezpieczeń na syntetycznym urządzeniu zamiast przypisań z modelu; nastawy bez jednostek z cichymi wartościami domyślnymi | margines 18 535 590,85 % w porównaniu zabezpieczeń sceny koordynacji harnessu | BIEG-ZABEZPIECZEN-Z-MODELU (w toku) |
| 3 | P0 | Sieć złota `backend/tests/cgmes/golden_enm.py` deklaruje `parameter_source="CATALOG"` z 7 odwołaniami nieistniejącymi w katalogu; ta sama klasa w eksporterze fikstur, parytecie scenariuszy i w kodzie produkcyjnym `SnSegmentSurface.tsx` | ekrany wyników, dowody i zrzuty B-02 pokazują liczby „z katalogu”, którego nie ma | SIEC-ZLOTA-KATALOG |
| 4 | P0 | Próg 87T `(der.nominal_power_kw ?? 0) >= 1600` w `frontend/src/ui/station-der/readiness.ts:183, :434`; gotowość i kryteria stacji/DER liczone we froncie | brak mocy daje „87T niewymagane” | GOTOWOSC-DER-BACKEND, potem CICHE-ZERO |
| 5 | P0 | N-1 V12.6 `max_loading_percent` szacowane bez rozpływu (`network_model/solvers/v126_academic.py:1063-1101`, rdzeń B-01) — liczba nieprezentowana od karty W3-E (`application/v126_artifacts.py::bez_rankingu_n1`), rekord `ranking_n1` i ekran analiz akademickich niosą od karty B01-RUNDA-1 jawną metodę „szacunek bez rozpływu”; stałe awaryjności i MTTR V12.6 bez podstawy; granice Q w `reactive_adequacy` z domysłu | liczby wyglądające na wynik obliczeń | AB-H0b (prezentacja i proweniencja poza rdzeniem); naprawa rdzenia — B-01 (g) |
| 6 | P1 | Globalny handler `ValueError` → HTTP 422 | błąd programu podany jako „błąd danych” | ODMOWA-DANYCH-422 (`1a235fa3`, partia 6) |
| 7 | P1 | Trasy `PUT /enm`, `/enm/ops`, `/enm/ops/batch`, `/wizard/apply-step` zapisują model z pominięciem operacji domenowych; reguła mocy źródeł × transformator (O-53) sprawdzana per źródło, bez sumy na transformatorze | model sprzeczny z regułą mocy i z kontraktem operacji | O-53b |
| 8 | P1 | Backend przyjmuje dwa kable z jednego pola liniowego stacji | model sprzeczny z kanonem pola | POLE-ZAJĘTE — zweryfikowane, partia 6 |
| 9 | P1 | Element modelu nierysowany na kanwie SLD (ZKSN przed pierwszą stacją ciągu, stacja z pomiarem z szablonu 1000 kVA); fikstury SLD v3 i substrat 52 stacji bez generatora | schemat niekompletny, kontrakty SLD na nieaktualnych danych | SLD-SUBSTRAT faza 2 (w toku) |
| 10 | P1 | `?? 0` / `?? false` / `or 0.0` zasilające decyzję (258 trafień w 114 plikach do klasyfikacji) | cichy brak danych jako zero | CICHE-ZERO |
| 11 | P1 (B-01) | WLS `state_estimation_wls.py:493` — przy wyjątku z `scipy.stats.chi2` cicha aproksymacja Wilsona–Hilferty’ego progu χ² | ślad obliczeń nie pokazuje przybliżenia (WHITE BOX) | naprawione (karta B01-RUNDA-1, decyzja B-01 z 2026-09-30, pozycja (j)): jawny import `chi2`, kasacja ścieżki awaryjnej i `_normal_ppf`, wpis `WYJATKI_B01` zdjęty; progi i hashe wyniku WLS bez zmiany |
| 12 | P1 (B-01) | `v126_academic.py:441-443, :482, :532` — kąt 0° fazora o module zero | faza nieokreślona publikowana jako liczba (widok audytowy E-40) | decyzja właściciela, plan §12.2 (h) |
| 13 | P1 (CI) | Pełny e2e czerwony na `82595588` (generator pakietu dowodowego HTTP 500, 8 speków na surowych identyfikatorach) | — | naprawione w partii 5 (`d7fcc325`, `7d3a0a41`); potwierdzenie — CI na czubku (część H) |
| 14 | P1 (CI) | `Python tests` czerwony na `9dd9e589` w obu przebiegach (3 z 26 634: fikstura sceny dynamiki i test scen przy 1 i 2 wątkach — `u_f_est_hz` próbki 0 z innego jądra OpenBLAS o 0,38–0,57 % poza tolerancją; ścieżka `scripts` dopisana do `sys.path` w teście); walidacja fizyczna — mutacje czerwona w przebiegu push (ten sam test scen). Przyczyny: próbka `t = 0` w punkcie pracy rozpływu z residuum 2,2e-9 przy tolerancji 1e-10, różnica skończona pochodnej w szumie; odsłonięta przy naprawie — stan `t = 0` po korekcie algebry poza równowagą urządzeń (`max \|f\|` 2,9e-5 1/s przy `eps_init` 1e-6) | liczby i kody jakości częstotliwości zależne od maszyny; w stanie ustalonym fałszywa ROZRÓŻNIALNA odchyłka częstotliwości | PRZENOSNOSC-NIEPEWNOSCI poprawka 1 (commit z tym wierszem; potwierdzenie — CI na czubku); poprawka 2 (estymata na progu części pewnej) — tabela C |
| 15 | P1 (WHITE BOX, odmowa nazwana) | Bramka równowagi `silnik._bramka_rownowagi` porównywała normy residuów z `eps_init` warunkiem `norma > eps_init` — residuum algebry NaN (prąd urządzenia nieokreślony) przechodziło; liczby chwili 0 (napięcia i moce `PunktPracy`, stany z `stan_poczatkowy`) bez strażnika skończoności | zamiast nazwanej odmowy z adresem — „krok niezbieżny” albo „napięcie nieskończone” w pierwszym kroku, bez wskazania przyczyny | SKONCZONOSC-CHWILI-ZERO (`6e09d740`, `0f38d197`) |

### J. Dane zewnętrzne i decyzje właściciela

**Bramka B-01** (edycja rdzeni z `scripts/rdzenie_b01.py` wyłącznie za zgodą; zgłaszać razem): jedna lista
pozycji (a)–(m) w `docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` §12.2 (O-57 pkt 6 — ten pakiet i opis PR do niej
odsyłają, nie powtarzają jej). Razem z nią jedno pytanie (O-57 pkt 7): czy delegacja z 2026-09-22 (O-5) obejmuje
kasację `stability_rms` i zdjęcie jego wpisu z listy rdzeni (pozycja (i)) oraz kasację `frt_hvrt/**` w AB-1c.

**Bramka B-02** (werdykt wizualny wyłącznie właściciela): zrzuty w repo `docs/audit/visual/` — `flow-ekspert/`
(w tym 26 kadrów przegenerowanych po karcie #145 w `7d3a0a41` i `e32-dynamika-{light,dark}.png` z AB-P1),
`sceny/`, `dowody/`, `sld_audyt/`, `nn/`, `kreatory/`, `schemat-10/`, `konfigurator/`; strona oceny generowana
`docs/audit/visual/generuj_strone_oceny.py`. Zrzuty „przed/po” kart S95-START (menu stacji) i SLD-SUBSTRAT
leżały w katalogu sesji i nie przetrwały — do odtworzenia specami przy odbiorze tych kart.

**Dane zewnętrzne** (bramka danych właściciela, plan §12.1, OD-17/OD-21): dane producentów regulacji źródeł
nadążnych (GFL) dla AB-1b.2 (do tego czasu profile typowe z jakością `ESTIMATED`), IRiESD i programy ramowe
OSD, poziomy izolacji (BIL), degradacja baterii; luki katalogu dynamiki — BESS bez sprawności i SOC, brak
profili maszyny synchronicznej i turbiny wiatrowej typu 2 (do tego czasu nazwana odmowa, nie wartość
domyślna).

**Decyzje poza B-01:** właściciel słownika gotowości — nowy kod dla progu 87T przy braku mocy (karta
GOTOWOSC-DER-BACKEND); scalenie PR #474 do `main` po zielonym CI (mandat pkt V upoważnia sesję wykonawczą
do scalenia zmian niezależnie odebranych — commit scalający, bez przepisywania historii).

### K. Plan pierwszego równoległego uruchomienia wykonawców

Warunek: karty w toku (część C) odebrane albo wznowione; baza = czubek po partii 7 dla toru R, po partii 6
dla pozostałych. Cztery karty naraz + integrator:

| Wykonawca | Karta | Tor i pliki | Uwagi |
|---|---|---|---|
| R1 (rdzeń) | AB-1b.2 pakiety 0/A/B/C/D | R | Pakiet E dopiero po scaleniu DYNAMIKA-W-TLE; mutacje M52–M66 |
| H1 (rdzeń) | AB-H1 | H | parytet Y(h = 1) z trzema budowniczymi admitancji bez ich modyfikacji; zakaz `dynamika/**` i `v126_academic.py` |
| D1 | DYNAMIKA-W-TLE | `api/execution_runs.py`, nowy `application/execution/`, persystencja stanu biegu, `ui2/wyniki/dynamika/api.ts`; w `enm/canonical_analysis.py` wyłącznie punkt wejścia (uzgodnienie z R1) | PERF-DYN-0; kasacja martwej konfiguracji Celery |
| D2 | SIEC-ZLOTA-KATALOG | `backend/tests/cgmes/**`, generatory scen, `SnSegmentSurface.tsx`; katalog tylko do odczytu | P0 — zasila zrzuty B-02 |

Integrator w tym czasie: karty z kroku E.6, wiersze §7, odbiory. Nie uruchamiać więcej wykonawców, niż
maszyna obsłuży (4 CPU: pełna regresja backendu — 26 608 testów — trwała 1 h 45 min w łańcuchu p5).

### L. Prompt wznowienia (do wklejenia nowej sesji wykonawczej)

```text
Jesteś głównym inżynierem wykonawczym MV-DESIGN-PRO (zarządca, wykonawca i integrator; architekt
strategiczny wyłącznie doradza). Obowiązuje mandat „EMERGENCY EXECUTION, INTEGRATION & RESUME READINESS”
i reguły CLAUDE.md (ZERO DŁUGU, NIC NA POTEM, KLASA NIE INSTANCJA, bramki B-01 i B-02, zero fabrykacji).

Punkt wznowienia: gałąź claude/mv-design-pro-twin-audit-u4lhy0, czubek: commit pakietu wznowienia, rodzic `9cc212b9` (partia integracji 5
z DETERMINIZM-KATA-FAZORA i WATKI-BLAS-E2E + pakiet wznowienia); main = a45c88f9; PR #474 otwarty (stan CI zapisany
w STAN_REPO.md §7 H); PR #475 — nie do scalenia.

Najpierw przeczytaj mv-design-pro/STAN_REPO.md §7 (pakiet wznowienia A–L) — i NIE powtarzaj zakończonych
audytów ani analizy całego repozytorium. Zacznij od delty: git fetch; porównaj czubki i gałęzie
claude/mv-design-pro-twin-audit-u4lhy0-wip-* z tabelą A.3; sprawdź CI PR #474 na czubku.

Pierwsze zadanie: jeśli CI PR #474 jest zielone w komplecie — scal PR commitem scalającym i sprawdź
workflowy na main; jeśli czerwone — napraw u źródła i wypchnij. Następnie odbierz albo wznów karty w toku
(ODMOWA-DANYCH-422, POLA-W-TORZE, SLD-SUBSTRAT faza 2, AB-1b.3b, BIEG-ZABEZPIECZEN-Z-MODELU — treść kart:
mv-design-pro/docs/plan/KARTY_OTWARTE_2026-09.md i KARTA_AB_1B3_ODBIORY_2026-09.md, praca w toku na
gałęziach wip-*), złóż partię 6 w kolejności z STAN_REPO.md §7 E i uruchom pierwszą falę wykonawców wg §7 K.

Granice: rdzenie z scripts/rdzenie_b01.py bez zmian (pozycje do decyzji właściciela — plan §12.2);
werdykt wizualny SLD wyłącznie właściciel; push wyłącznie na gałąź programu; bez force push, bez gołego
git stash i git reset --hard; procesy kończone po PID; pełny łańcuch integratora raz na partię.
```
