# PROMPT RUNDY „SCHEMAT 10/10" — audyt schematów od zera i przebudowa spójności LOD

Status: **WIĄŻĄCY** (dyrektywa właściciela 2026-07-22: „Oceń schemat — dla mnie to jest
20 kroków do tyłu, nie można mieć tak niespójnych LOD; weź audyt schematów i przemyśl
od zera, bo w tej chwili wróciliśmy do 2/10").
Tryb: audyt + projekt docelowy wykonuje **Fable osobiście** (dyrektywy #5 i #9 —
zadanie jakościowe); implementacja fazami przez wykonawców z kartami §0.
Nadrzędne: `PLAN_SLD_REWORK.md`, `SLD_INDUSTRIAL_SPEC_v1`, kanon V12.xx.

---

## §0 Stan zmierzony (dowody 2/10 — oględziny 4 widoków tej samej sieci referencyjnej)

Materiał dowodowy: `docs/audit/visual/sld_substrate_53_L0.png`, `sld_substrate_53_L2.png`,
zrzuty żywej kanwy w trybach „Odcinki i kierunki zasilania" oraz „Pola, aparatura
i zabezpieczenia" (przekazane przez właściciela 2026-07-22).

| # | Defekt | Dowód | Klasa |
|---|--------|-------|-------|
| D1 | **Trzy różne języki wizualne w jednym systemie LOD**: L0 = szkielet z gołych kwadracików na czarnej pustce; tryb pośredni = SIATKA bloków stacji w kolumnach (inna topologia prezentacji!); L2 = pełna aparatura. Stacja zmienia kształt, względną pozycję i tożsamość między poziomami — zoom to podmiana świata, nie przybliżenie. | L0 vs siatka vs L2 | KRYTYCZNA |
| D2 | **Kolizje etykiet tekst-na-tekście**: „Stacja T1"+„WY" renderują się jako „taWY ja T1"; „630 kVA" pod glifami; „Sekcja U" ucięta krawędzią; nazwy stacji wjeżdżają w symbole pól. Brak silnika rozmieszczania etykiet z detekcją kolizji. | L2 zoom | KRYTYCZNA |
| D3 | **Spam etykiet typów**: „Kabel SN · Al", „YAKXS 3×120/16 · 250 m" powtarzane na KAŻDYM przęśle w kadrze — zamiast reguł gęstości per LOD (typ raz na korytarz, szczegół dopiero przy zbliżeniu). | L2 zoom | WYSOKA |
| D4 | **Mieszanka językowa**: „Kabel SN · OVERHEAD Al" — angielskie „OVERHEAD" w UI (kanon: PL, „napowietrzna"). | L2 zoom | WYSOKA |
| D5 | **Ukośne linie przecinające cały arkusz** (artefakty trasowania nieortogonalnego) w widoku pośrednim — łamią konwencję schematu jednokreskowego. | tryb pośredni | WYSOKA |
| D6 | **GPZ w innym języku graficznym** niż reszta sieci (biała wstawka w osobnej ramce, inna typografia) — dwa style na jednym arkuszu. | wszystkie | WYSOKA |
| D7 | **Paski sekcji (żółte) pływające w treści**, oderwane od szyn, ucięte kadrem („Sekcja 1" w środku pola między stacjami). | L2 zoom | WYSOKA |
| D8 | **Semantyka koloru nieokreślona**: wszystko zielone (stan? napięcie? energizacja?), GPZ biały, nN niebieskie tylko miejscami; brak jednej tabeli prawdy kolorów (napięcie × stan × wyróżnienie). | wszystkie | WYSOKA |
| D9 | **Brak poziomu operatorskiego**: L0 puste (kwadraciki + wielka czarna pustka, treść w ~20% kadru), L2 nieczytelne — nie istnieje widok czytelny jak profesjonalny schemat jednokreskowy OSD/SCADA. | L0, L2 | KRYTYCZNA |
| D10 | **Zdublowane tożsamości**: stos „S01" + „Stacja T1" + „RMU·O" + „630 kVA" + „3 nN" bez hierarchii typografii; identyfikator techniczny i nazwa konkurują. | L2 | ŚREDNIA |
| D11 | **Kanwa ignoruje motyw** (stałe ciemne tło niezależnie od light/dark) — do rozstrzygnięcia świadomą decyzją (SCADA-dark jako standard TAK, ale wtedy spójnie z resztą aplikacji i wydrukiem). | zrzuty motywów | ŚREDNIA |
| D12 | **Kadry martwe**: auto-fit zostawia ogromne pustki; brak inteligentnego kadru treści. | L0, tryb pośredni | ŚREDNIA |

Ocena właściciela stanu obecnego: **2/10**. Cel rundy: **≥9/10** potwierdzone oceną
właściciela na zrzutach żywej aplikacji.

---

## §1 Cel rundy (jedno zdanie)

System LOD schematu ma być **JEDNYM językiem wizualnym o rosnącej gęstości szczegółu**:
stacja/przęsło/sekcja zachowuje tożsamość, kotwicę geometryczną i styl na każdym
poziomie, a każdy poziom jest samodzielnie czytelny jak profesjonalny schemat
jednokreskowy klasy PowerFactory/ETAP/SCADA OSD.

## §2 Soczewki audytu (każda z pytaniami kontrolnymi, wynik na piśmie)

1. **Projektant sieci SN** — czy z L0/L1 czytam tor zasilania, sekcje, NOP, kierunki,
   pierścienie w 10 sekund? Czy magistrala i odgałęzienia mają hierarchię grubości?
2. **Inżynier rozdzielni** — czy pole/RMU/aparatura odpowiadają symbolice IEC 60617
   i konwencji rozdzielnic (WE/WY/ODG, wyłącznik vs rozłącznik vs uziemnik czytelne
   bez legendy)? Czy stacja ma kanoniczny glif zwijany (RMU-blok) i rozwijany (pola)?
3. **Dyspozytor/SCADA** — czy istnieje widok operatorski: stany łączników, kolor per
   napięcie, NOP wyróżniony, bez szczegółów katalogowych?
4. **Kartografia / wizualizacja informacji** — hierarchia typografii (nazwa > id >
   parametry), reguły gęstości etykiet per LOD, detekcja kolizji, kadr treści.
5. **Benchmark CAD/ETAP/PowerFactory** — porównanie 1:1 konwencji: co u nich widać
   na overview / feeder view / station view i jak wygląda przejście.
6. **Architektura kodu** — gdzie w `ui/sld/v3` + `engine/sld-layout` żyją decyzje
   LOD/gęstości/etykiet; dlaczego tryb pośredni ma inną topologię prezentacji (siatka);
   koszt ujednolicenia; determinizm i goldeny.

## §3 Produkty rundy (w tej kolejności)

1. **`docs/sld/AUDYT_SCHEMATOW_OD_ZERA_2026-07.md` (WIĄŻĄCY)** — pełny inwentarz
   defektów (zrzut → defekt → przyczyna źródłowa w kodzie z plikiem/linią), wynik
   soczewek §2, oraz JEDNA **macierz prawdy LOD**: dla L0/L1/L2 × {elementy, glify,
   etykiety, kolory, grubości, co ZNIKA a co się AGREGUJE}. Bez tej macierzy żadna
   implementacja nie startuje.
2. **Projekt docelowy „SCHEMAT 10/10"**: definicja poziomów —
   - **L0 Przegląd sieci**: magistrale i sekcje jako grube tory, stacje jako spójne
     kompaktowe glify (ta sama sylwetka co L1/L2 w miniaturze), NOP/kierunki, zero
     szczegółów katalogowych; kadr = treść, nie arkusz;
   - **L1 Operatorski (jednokreskowy)**: aparaty główne pól (wyłącznik/rozłącznik),
     transformatory, DER, stany łączników, kolor per napięcie; etykiety: nazwa stacji
     + moc, typ kabla RAZ na korytarz;
   - **L2 Stacyjny**: pełna aparatura pola, przekładniki, uziemniki, parametry
     katalogowe — czytelność lokalna (zoom), etykiety z detekcją kolizji;
   - **Przejścia**: zoom = ciągłość tożsamości (kotwica geometryczna stacji stała,
     glif rośnie szczegółem), NIGDY podmiana układu (koniec siatki kolumnowej jako
     osobnego świata).
   Semantyka koloru (jedna tabela: napięcie × stan × wyróżnienie), typografia
   (tokeny, hierarchia), reguły etykiet (priorytet, gęstość, kolizje), decyzja D11.
3. **Aktualizacja `PLAN_SLD_REWORK.md`**: fazy implementacji z bramkami (każda faza:
   pełna regresja SLD + guardy determinizmu + NOWE goldeny po zatwierdzeniu wzorca +
   zrzuty do oceny właściciela), **macierz parytetu funkcji** (overlay mocy/zwarć/OLTC,
   strzałki, znacznik zwarcia, menu kontekstowe, edycja CAD, wiązanie kreatorów,
   deep-linki — nic nie ginie w przebudowie).

## §4 Rygor (bez wyjątków)

Zero fizyki w UI; determinizm (same wejście = ten sam render; goldeny wymieniane
świadomie, jednym commitem z uzasadnieniem); guardy `sld_determinism_guards`,
`overlay_no_physics_guard`, `no_codenames`, `forbidden_ui_terms` (D4!); FROZEN
nietknięte; 100% PL w treściach kanwy; symbolika IEC 60617; legenda = dokładnie
użyte glify.

## §5 Kryteria odbioru (2/10 → ≥9/10)

1. Sekwencja zoom-out→in na sieci referencyjnej 52+ stacji: stacja NIE zmienia
   tożsamości wizualnej ani kotwicy (dowód: zrzuty przejścia w ≥3 krokach zoomu,
   oba kierunki).
2. **Zero kolizji** tekst-tekst i tekst-symbol na wszystkich LOD — mierzone
   AUTOMATYCZNIE testem bounding-boxów w DOM (nie okiem).
3. Reguły gęstości etykiet działają: na L1 typ kabla ≤1× na korytarz; pełne
   parametry wyłącznie na L2.
4. L1 czytelny „na 10 sekund" (test soczewki #1) — ocena właściciela.
5. 100% PL; legenda zgodna; D11 rozstrzygnięte i wdrożone spójnie.
6. Wszystkie funkcje z macierzy parytetu działają na nowym renderze (testy).
7. Stała strona zrzutów żywej aplikacji do oceny właściciela po KAŻDEJ fazie.

## §6 Kolejność wykonania

1. Fable: audyt (§2) + macierz LOD + projekt (§3.1–3.2) → push → ocena właściciela
   (AskUserQuestion tylko przy realnych rozstrzygnięciach produktowych, np. D11).
2. Fable: plan faz (§3.3) i karty wykonawcze z §0 rozstrzygnięć.
3. Wykonawcy (Opus — fazy ciężkie, Sonnet — pomiarowe/higiena): implementacja
   faza po fazie, commit bez push, niezależna weryfikacja Fable, cherry-pick,
   pełne bramki, push, zrzuty do oceny.
