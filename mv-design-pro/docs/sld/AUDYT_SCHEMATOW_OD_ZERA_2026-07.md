# AUDYT SCHEMATÓW OD ZERA — spójność LOD i jeden język wizualny (2026-07-22)

Status: **WIĄŻĄCY** (produkt §3.1 rundy `PROMPT_RUNDA_SCHEMAT_10_2026-07.md`).
Autor: Fable osobiście (dyrektywy #5/#9). Ocena wejściowa właściciela: **2/10**.
Materiał: 4 widoki sieci referencyjnej 52+ stacji (zrzuty 2026-07-22), kod
`ui/sld/v3/**`, `ui/sld/v2/lod`, `engine/sld-layout`, SPEC V3, przyjęty rozjazd
`docs/prompts/REDESIGN_SLD_SCADA_CAD_FULL.md` (§0bis promptu rundy).

---

## §1 Przyczyny źródłowe defektów (zrzut → defekt → kod)

| Defekt | Przyczyna źródłowa | Miejsce |
|--------|--------------------|---------|
| D1 trzy światy | (a) **Dwa równoległe słowniki LOD**: v2 `LodPolicy` ma 5 poziomów (0–4, nazwy PL w pasku statusu), v3 `SceneLod` ma 3 (0–2) — pasek mówi co innego, niż renderuje scena; (b) `buildScene` ma **osobne gałęzie strukturalne per LOD** (early-return `lod===0`; `interStationCorridorY`: `lod===0 ? busAxisY : trunkCorridorYOf` — inna kotwica geometryczna korytarza per poziom); (c) stacja nie ma JEDNEJ rodziny glifów — L0 rysuje goły kwadrat, L1/L2 budują inną sylwetkę | `ui/sld/v2/lod/LodPolicy.ts:18-30`, `ui/sld/v3/scene/buildScene.ts:577,1124-1282` |
| D2 kolizje etykiet | Brak silnika rozmieszczania etykiet — teksty emitowane bez rezerwacji miejsca i bez detekcji nakładek (SPEC V3 W6 wskazał to ryzyko: „lod2 dosypuje teksty w zajęte pasma", ale wyrocznia kolizji NIE powstała) | `buildScene.ts` (emisja captionów), SPEC V3 §W6 |
| D3 spam etykiet typów | Podpis typu/kabla emitowany per przęsło; brak reguły gęstości „raz na korytarz" per LOD | `buildScene.ts` (port-caption/cable captions) |
| D4 „OVERHEAD Al" | Wartość ENUM izolacji (`'OVERHEAD'`) renderowana surowo do treści etykiety zamiast słownika PL („napowietrzna") | `ui/sld/v2/canvas/enmToSldAdapter.ts:319,488-498` → captiony v3 |
| D5 ukośne linie przez arkusz | Przęsła bez pełnego trasowania ortogonalnego w widoku pośrednim (kawałki łączone po współrzędnych, brak manhattanizacji odcinków dołączeń DER/odczepów) | `buildScene.ts` geometria dołączeń |
| D6 GPZ inny język | `gpz_block` budowany osobnym torem stylistycznym (własna ramka, biała paleta, inna typografia) niż stacje/sieć | `buildScene.ts` (GPZ inset) |
| D7 paski sekcji pływające | Znacznik sekcji kotwiczony do współrzędnej szyny, nie do RENDEROWANEJ reprezentacji szyny na danym LOD → dryfuje w treść przy innych poziomach | `buildScene.ts` (section markers) |
| D8 chaos kolorów | Brak jednej tabeli semantyki koloru (napięcie × stan × wyróżnienie); zielony pełni naraz rolę energizacji, SN i „wszystkiego" | `DARK_SCADA_NEON_THEME_SPEC.md` niezaimplementowany jako tokeny kanwy |
| D9 brak widoku operatorskiego | Mapowanie 5 nazw v2 → 3 sceny v3 gubi poziom „jednokreskowy operatorski"; L1 (v3) renderuje główki aparatury per stacja (za dużo), L0 — nic (za mało) | `LodPolicy` ↔ `SceneLod` mapping w `SldCanvasV3Workspace` |
| D10 stos tożsamości | Etykiety S-id, nazwy, RMU, mocy i nN emitowane niezależnie, bez hierarchii typografii i budżetu miejsca per glif | `buildScene.ts` captiony stacji |
| D11 motyw | **ZAMKNIĘTE 2026-07-31 (KD-8 poz. 1):** stała `SLD_V3_BACKGROUND` USUNIĘTA — kanwa czyta paletę MOTYWU (`ui/sld/v3/theme/palette.ts`, warianty `dark_scada`/`light_technical` o zachowanej semantyce WN/SN/nN); paleta dokumentowa eksportu niezależna od motywu ekranu. Wcześniejsze rozstrzygnięcie „ekran zawsze SCADA-dark" (HANDOFF §2 R1) nadpisane słowem właściciela. | `SldCanvasV3.tsx`, `theme/palette.ts` |
| D12 martwe kadry | Krok kolumny layoutu = STAŁY footprint bloku **L0** + gap — kolumny rezerwowane pod najmniejszy rysunek, więc L0 tonie w pustce, a L2 się ciśnie | `engine/sld-layout/layoutEngine.ts:132-146` |

**Wniosek architektoniczny (sedno 2/10):** SPEC V3 §7/P6 zdefiniował „każdy LOD to
kompletny rysunek" i tak to zaimplementowano — jako **trzy osobne rysunki**, bez
wymuszenia wspólnej gramatyki (jednej rodziny glifów, jednej kotwicy, jednych
tokenów). Majowa specyfikacja (§0bis) niosła brakującą połowę: hierarchię obiektów
domenowych i jedną gramatykę wizualną — nigdy nie weszła. Naprawa = małżeństwo obu:
kontrakt LOD z V3 **+** gramatyka obiektowa z majowej specyfikacji.

## §2 Wynik soczewek

1. **Projektant SN:** tor zasilania nieczytelny na każdym poziomie: L0 nie pokazuje
   hierarchii magistrala/odgałęzienie (wszystko tą samą kreską), L2 zalewa aparaturą.
   Sekcje/NOP wymagają szukania. WERDYKT: brak poziomu do pracy projektanta.
2. **Inżynier rozdzielni:** symbole IEC 60617 są (biblioteka F1 v3 ✅), ale stacja
   nie ma kanonicznej sylwetki RMU zwijanej/rozwijanej — na L1 widać „grzebień
   główek" bez obrysu pola, na L0 kwadrat bez tożsamości. WERDYKT: glify OK,
   kompozycja NIE.
3. **Dyspozytor/SCADA:** brak widoku operatorskiego (D9) i tabeli kolorów (D8);
   stany łączników giną w gęstwie. WERDYKT: nie nadaje się do pracy łączeniowej.
4. **Kartografia:** brak hierarchii typografii (D10), brak silnika etykiet (D2),
   brak reguł gęstości (D3), martwe kadry (D12). WERDYKT: to jest render danych,
   nie mapa informacji.
5. **Benchmark PowerFactory/ETAP:** tam overview→feeder→station to TEN SAM rysunek
   z rosnącym szczegółem i stałą kotwicą; typ kabla przy korytarzu raz; stacja =
   spójna sylwetka na każdym poziomie. Nasza kanwa łamie wszystkie trzy zasady.
6. **Architektura kodu:** decyzje gęstości rozsiane po `buildScene` (gałęzie per
   lod), słownik poziomów w v2, polityka w workspace, footprint w engine — **cztery
   miejsca prawdy**. Determinizm jest (goldeny), ale utrwala złą kompozycję.

## §3 MACIERZ PRAWDY LOD (docelowa — bramkuje implementację)

Trzy poziomy sceny (SceneLod bez zmian), JEDEN słownik nazw (koniec mapowania 5→3):

| Warstwa | **L0 „Przegląd sieci"** | **L1 „Widok operatorski"** | **L2 „Stacje i aparatura"** |
|---|---|---|---|
| Magistrale SN | gruby tor (waga 3), kolor napięcia | tor (waga 2) | tor (waga 2) |
| Odgałęzienia | cienki tor (waga 1) | waga 1 | waga 1 |
| Stacja | **glif kompaktowy** (sylwetka RMU mini: obrys + szyna NA WYLOT), S-id — **markery typu/TR/DER/NO** [†GS-1][†GS-2] | **ta sama sylwetka** + aparaty główne pól (wyłącznik/rozłącznik), transformator, nN kreską | **ta sama sylwetka rozwinięta**: pełne pola, przekładniki, uziemniki, głowice |
| GPZ | ta sama gramatyka co stacja (większy glif, sekcje A/B) | sekcje + pola liniowe główkami | pełna rozdzielnia |
| Sekcje/NOP | znacznik NA torze (kotwica = render szyny TEGO LOD) | jw. + stan łącznika | jw. |
| DER | marker (PV/BESS/FW ikona) | ikona + moc | pełny blok przyłącza |
| Etykiety | S-id; nazwa korytarza 1×; NIC katalogowego | nazwa stacji + moc; typ kabla **≤1× na korytarz** | pełne (typ, długość, przekładnie) — z silnikiem kolizji |
| Kolory | JEDNA tabela: napięcie (110 **czerwony** `#D93A2B` / SN zielony / nN niebieski — zmiana V12K-216, dyrektywa właściciela 2026-07-26 „paleta wg praktyki polskich OSD”; do tej zmiany 110 był biały, czyli dzielił barwę z ramką arkusza i legendą, patrz audyt R4) × stan (zał./wył./NOP) × wyróżnienie (selekcja/overlay) — identyczna na WSZYSTKICH LOD | jw. | jw. |
| Kotwica | **środek glifu stacji i oś korytarza IDENTYCZNE na L0/L1/L2** (zoom = skala szczegółu, nie przemeblowanie) | jw. | jw. |
| Kadr | fit do treści (bez martwych pól) | jw. | jw. |

Co ZNIKA przy oddalaniu: szczegół WEWNĄTRZ glifu (agregacja do sylwetki), etykiety
wg budżetu. Co NIGDY nie znika: tor elektryczny (sonda `lod_path_probe` zostaje),
tożsamość i pozycja stacji, znaczniki sekcji/NOP.

> **[†GS-1] (V12K-137, 2026-07-23, DOMKNIĘCIE GAP `S7_GAP_CROSSING_ZERO` §10.4).**
> Wiersz „Stacja L0" ZREALIZOWANY: sylwetka `stationCollapsed` to teraz MINI-RMU
> (obrys 48×48 + wewnętrzna kreska szyny SN), z markerami rozpoznawczymi
> rysowanymi WEWNĄTRZ glifu i wyprowadzonymi z TYPU elementów (spec §19.3, zero
> nazw): **typ stacji** (SN/nN z transformatorem · rozdzielnia sieciowa bez TR ·
> sekcyjna ze sprzęgłem), **transformator** (mini-glif dwuuzwojeniowy), **DER**
> (marker rodzaju PV/BESS/FW/generator — koniec bazy „DER na L0 = 0"), **stan
> NO** (na L0 marker `noOpen` sylwetki zastępuje osobny symbol `noPoint`, który
> pozostaje reprezentacją L1/L2 — TA SAMA kotwica). Rozmiar 48×48 (6×GRID)
> wyprowadzony z czytelności kadru całości (fit sieci referencyjnej skala 0,1203
> ⇒ 5,78px ekranu; 16px dawało 1,93px, nieodróżnialne od kropki). Bramkowane
> `lod0_readability_probe` (rozszerzona o typ/TR/DER/NO + test negatywny) i
> `buildScene.schemat10gs1.test.ts`. Dowód wizualny: `docs/audit/visual/schemat-10/
> gs1-l0.png` (kadr całości) + `gs1-l0-detal.png` (legenda gramatyki).
>
> **[†GS-2] (V12K-137, 2026-07-23, ZGODNOŚĆ Z 19 REGUŁAMI `GRAMATYKA_MINI_RMU_2026-07`).**
> Sylwetka GS-1 doprowadzona do zgodności z 19 wiążącymi regułami konstrukcyjnymi:
> tor mocy biegnie PRZEZ sylwetkę NA WYLOT (szyna port W↔E — mini-RMU = fragment
> toru, reguły 2–4); parametry konstrukcyjne (obrys/kotwice/odstępy/grubości) w
> JEDNYM module globalnym `symbols/miniRmuGrammar.ts` (`MINI_RMU`), renderer bez
> literałów lokalnych (reguły 13–14, formalna sekcja „Specyfikacja konstrukcyjna”
> w gramatyce); kotwice markerów stałe/rozłączne z kanałem routingu, TR
> uzupełniający (reguły 5–7, 10, 12); pełna macierz 40 kombinacji typ×TR×DER×NO
> renderuje się unikalnie (reguły 15–16); czytelność min. rozmiaru zmierzona
> (reguła 17). Bramki: `accept:sld-v3` ALL PASS (204 checki, +3 sondy mini_rmu),
> `symbols.test.tsx` 92 zielone. Dowód: `docs/audit/visual/schemat-10/gs2-l0.png`
> + `gs2-l0-detal.png`.

## §4 Tabela rozstrzygnięć — majowa specyfikacja (§0bis)

| Wymaganie z REDESIGN_SLD_SCADA_CAD_FULL | Decyzja |
|---|---|
| Hierarchia obiektów: GPZBlock/SwitchgearPanel/FeederSpine/SubstationBlock/OZEConnectionBlock | **PRZEJĄĆ** jako model kompozycji glifów w scenie v3 (nie nowe komponenty React — rodziny glifów w buildScene) |
| Gramatyka eTango: paleta/grubości/typografia | **PRZEJĄĆ z aktualizacją**: tokeny wg §3 (tabela kolorów) + `DARK_SCADA_NEON_THEME_SPEC` jako baza ciemna |
| Domenowy layout 5 kroków (zamiast Sugiyamy) | **ZASTĄPIĆ nowszym kanonem**: layout kolumnowy engine jest OK co do zasady — naprawiamy footprint per LOD (D12), nie wymieniamy silnika |
| Symbole IEC 61082/60617 | **JUŻ WYKONANE** (F1 v3) — bez zmian |
| Tryby interakcji/zoom | **JUŻ WYKONANE** (kamera v3) — bez zmian |
| Overlay pomiarowy | **JUŻ WYKONANE LEPIEJ** (rodzina adapterów V12K-085…133) — bez zmian |

## §5 Plan przebudowy — program „SCHEMAT-10" (fazy S1–S5)

Zapis wykonawczy w `PLAN_SLD_REWORK.md` (sekcja SCHEMAT-10). Skrót:

| Faza | Zakres | Zależy od | Wykonawca |
|---|---|---|---|
| **S1 Gramatyka stacji** | Jedna rodzina glifów stacji/GPZ (sylwetka L0→L1→L2, ta sama kotwica); likwidacja osobnych gałęzi świata w buildScene (jedna geometria korytarzy); JEDEN słownik LOD (kasacja mapowania v2 5→3, nazwy z §3); footprint kolumny per LOD (D12) | — | Opus |
| **S2 Silnik etykiet** | Rezerwacja miejsca + detekcja kolizji bounding-box (wyrocznia automatyczna w teście = bramka „zero kolizji"); hierarchia typografii glifu stacji (D10); reguły gęstości (D3: typ ≤1×/korytarz na L1); słownik PL dla enumów (D4); manhattanizacja dołączeń (D5) | S1 (kotwice) | Opus |
| **S3 Semantyka koloru + sekcje** | Tabela kolorów §3 jako tokeny kanwy; znaczniki sekcji/NOP kotwiczone do renderu szyny per LOD (D7); GPZ w gramatyce stacji (D6) | S1 | Sonnet |
| **S4 Motyw + kadr** | Rozstrzygnięcie D11 (rekomendacja: kanwa SCADA-dark jako standard + jasny wariant W EKSPORCIE/wydruku — decyzja właściciela przez AskUserQuestion przed startem); fit-do-treści (D12 reszta) | S1–S3 | Sonnet |
| **S5 Goldeny + dowód** | Wymiana goldenów JEDNYM commitem po zatwierdzeniu wzorca; sekwencja zrzutów zoom-out→in (≥3 kroki, oba kierunki) na sieci 52+ stacji; macierz parytetu funkcji (overlaye mocy/zwarć/OLTC, strzałki, znacznik, menu, edycja, kreatory, deep-linki) — testy | S1–S4 | Fable |

Rygor per faza: pełna regresja SLD (vitest ui/sld+sld-overlay), sld_determinism,
overlay_no_physics, forbidden_ui_terms (D4!), zrzuty do oceny właściciela.

## §6 Kryteria odbioru rundy

Jak w prompcie rundy §5 (zoom bez zmiany tożsamości; zero kolizji MIERZONE testem;
gęstość etykiet; L1 czytelny „na 10 s"; 100% PL; parytet funkcji; ocena właściciela
≥9/10 na zrzutach żywej aplikacji).
