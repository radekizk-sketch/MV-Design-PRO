/**
 * KOSZT SCENY I PŁYNNOŚĆ GESTU — pin tożsamości bajtowej + budżet (karta S9-9).
 *
 * CO ZAMYKA TA KARTA (audyt `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md`, wiersz
 * S9-9). Plan etykiet (`canvas/labelLegibility.ts`) jest liczony w ŚCIEŻCE GESTU
 * — `SldCanvasV3` przelicza go przy każdej zmianie skali kamery, czyli przy
 * każdym kliknięciu kółka myszy. Rozstrzygał kolizje przeglądem LINIOWYM całego
 * zbioru przeszkód, więc koszt rósł kwadratowo z liczbą etykiet: zmierzone
 * 0,13 s (54 stacje), 0,45 s (107) i 1,03 s (160) NA JEDNĄ KLATKĘ. Ten sam
 * mechanizm i ten sam koszt miał silnik etykiet przy budowie sceny
 * (`layout/declutter.ts`). Oba liczą teraz predykat indeksem przestrzennym
 * (`core/rectIndex.ts`).
 *
 * DLACZEGO ODCISKI, A NIE „testy zachowania". Optymalizacja ma prawo zmienić
 * WYŁĄCZNIE czas. Rysunek techniczny — pozycje i treść etykiet, zbiór odrzuconych
 * — musi zostać CO DO BAJTU ten sam, bo od niego zależy odbiór (`accept:sld-v3`),
 * eksport i porównania wizualne. Odciski niżej policzono na drzewie SPRZED
 * optymalizacji (commit bazowy 1dd788f4) i wpisano tu ręcznie — są dowodem
 * równoważności, a nie zapisem stanu po zmianie.
 *
 * GDY TEN TEST ZAŚWIECI NA CZERWONO. To znaczy, że scena albo plan etykiet
 * ZMIENIŁY SIĘ merytorycznie. Jeśli zmiana jest zamierzona (nowa reguła układu,
 * nowa etykieta), odciski aktualizuje się ŚWIADOMIE, w tym samym commicie co
 * zmiana i z uzasadnieniem — nigdy „żeby przeszło". Jeśli zmiany nie planowano,
 * to jest regresja rysunku.
 *
 * CZEGO TEN PLIK NIE MIERZY (uczciwie). Budżet czasu liczony jest w jsdom na
 * maszynie CI — to NIE jest pomiar klatki przeglądarki: nie ma tu układu,
 * rasteryzacji ani rywalizacji o wątek główny. Mierzymy to, czego jsdom mierzyć
 * MOŻE i co jest właściwym przedmiotem tej karty: czas SYNCHRONICZNYCH przeliczeń,
 * które ścieżka gestu wykonuje na wątku głównym między zdarzeniem a renderem.
 * Próg jest luźny (poniżej), bo służy wykryciu POWROTU kosztu kwadratowego,
 * a nie stopniowaniu wydajności.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { planSceneLabels } from '../../canvas/labelLegibility';
import { sheetSizeFor } from '../../sheet/outline';
import { declutterLabels } from '../../layout/declutter';
import { buildSceneV3, sceneObstacleRects, type SceneLod } from '../buildScene';
import { synthLargeTrunk } from './syntheticNetworks';
import type { EnergyNetworkModel } from '../../../../../types/enm';
import { czasProcesoraMs } from '../../../../../test/czasProcesora';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURA = resolve(
  here,
  '..',
  '..',
  '..',
  'v2',
  'geometry',
  '__tests__',
  'fixtures',
  'sldSubstrate52s.enm.json',
);

const siecReferencyjna = JSON.parse(readFileSync(FIXTURA, 'utf8')).enm as EnergyNetworkModel;
/** Sieć podwojona — ta sama maszyneria co w testach skalowalności (rodzina H). */
const siecPodwojona = synthLargeTrunk(siecReferencyjna, 2);

/** Drabina skal gestu: od kadru „cała sieć" po zoom roboczy. */
const SKALE = [0.05, 0.1, 0.2, 0.4, 0.8, 1.5, 3] as const;
const LODY: readonly SceneLod[] = [0, 1, 2];

const odcisk = (v: unknown): string =>
  createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 32);

interface OdciskiLod {
  readonly scena: string;
  readonly declutter: string;
  readonly plany: readonly string[];
}

/**
 * ODCISKI RYSUNKU — pin tożsamości bajtowej sceny, declutteru i planu etykiet.
 *
 * POCHODZENIE (S9-9): policzone na drzewie SPRZED optymalizacji indeksu
 * przestrzennego (1dd788f4) i wpisane ręcznie jako DOWÓD, że optymalizacja
 * zmieniła wyłącznie czas.
 *
 * AKTUALIZACJA ŚWIADOMA (karta PROPORCJE, 2026-08-07) — WSZYSTKIE odciski
 * przeliczone, bo karta ZMIENIA RYSUNEK w trzech miejscach naraz i każda z
 * tych zmian jest zamierzona:
 *   (1) sufit powiększenia pisma (`core/text.ts` `maxEnlargement`) — plan
 *       etykiet przy skalach 0,05/0,1/0,2 nie rysuje już napisów, których nie
 *       da się narysować proporcjonalnie (zamiast rysować je 2,8–7,5× większe
 *       od symbolu, który opisują) ⇒ zmienia się `plany` na małych skalach;
 *   (2) podpis pola niesie OZNACZNIK („F01 · liniowe" zamiast „pole liniowe")
 *       ⇒ zmienia się TREŚĆ etykiet i szerokość rezerwacji kolumn, więc także
 *       geometria sceny i wynik declutteru;
 *   (3) kod stacji pada w bloku RAZ (opis sekcji), więc pasmo nazw traci
 *       wiersz z gołym kodem ⇒ krótsze pasmo, inna wysokość bloku stacji.
 * AKTUALIZACJA ŚWIADOMA (karta BLOK-PUSTY, 2026-08-07) — WSZYSTKIE odciski
 * przeliczone ponownie, bo karta zmienia rysunek w dwóch miejscach:
 *   (4) prostokąt etykiety niesie TUSZ, nie rezerwację slotu (`layout/labels.ts`
 *       `tuszWSlocie`) ⇒ zmieniają się prostokąty wierszy pasma nazw, a przez
 *       nie wynik declutteru i planu (mniej fałszywych kolizji: wiersz zajmował
 *       dotąd CAŁĄ szerokość kolumny, choć rysował napis 7,57× węższy);
 *   (5) rezerwacja strony nN bloku stacji liczona `max`, nie sumą
 *       (`layout/measure.ts` `nnSideBelowBusHeight`) ⇒ blok stacji z odbiorem
 *       nN i DER na nN krótszy o 32 j.św., więc inna geometria sceny.
 * Odciski są tu po to, żeby rysunek nie zmienił się PRZYPADKIEM — nie po to,
 * żeby go zamrozić. Zmiana wchodzi w TYM SAMYM commicie co zmiana kodu, z
 * uzasadnieniem wyżej; gdyby którykolwiek z tych mechanizmów wrócił do stanu
 * sprzed karty, test zapali się natychmiast.

 * AKTUALIZACJA ŚWIADOMA (karta BLOK-LATERAL-WLASNOSC, 2026-08-08) — WSZYSTKIE
 * odciski przeliczone ponownie, bo karta zmienia rysunek w JEDNYM miejscu:
 *   (6) podpis odcinka (`segment-span`, `segment-lateral`) nosi `ownerRef`
 *       ODCINKA, który opisuje, a nie stacji, przy której akurat stoi ramka
 *       (`scene/buildScene.ts`, 5 miejsc emisji) ⇒ zmienia się CIĄG `ownerRef`
 *       w 49 etykietach sceny referencyjnej, a przez to odcisk sceny, wynik
 *       declutteru (etykiety wchodzą do niego w całości) i plan etykiet.
 * DOWÓD, ŻE TO JEDYNA ZMIANA: zrzut sceny L0/L1/L2 z `ownerRef` etykiet
 * `segment-*` zastąpionym stałą jest CO DO BAJTU identyczny przed i po karcie
 * (sha256 `06f0c88b5f80b060bb34a4c048505e63192256b0155976079f9fa2549729bc00`
 * w obu fazach) — żadna współrzędna, żaden prostokąt i żadna treść napisu się
 * nie ruszyły. Gdyby karta przy okazji przesunęła cokolwiek na rysunku, ten
 * zrzut by się rozjechał.
 *
 * AKTUALIZACJA ŚWIADOMA (BLOK-LATERAL-WLASNOSC, runda poprawkowa 2026-08-08) —
 * WSZYSTKIE odciski przeliczone po raz kolejny, bo karta zmienia rysunek w
 * JEDNYM miejscu:
 *   (7) adnotacje KOŃCA ODCINKA („koniec otwarty", odsyłacze ciągu dalszego)
 *       dostały własny `OwnerKind` `'segment-endpoint'` zamiast pożyczanego
 *       `'port-caption'` (`layout/labels.ts`, `scene/buildScene.ts`) ⇒ zmienia
 *       się CIĄG `ownerKind` w 15 etykietach sceny referencyjnej, a przez to
 *       odcisk sceny, declutteru i planu etykiet.
 * DOWÓD, ŻE TO JEDYNA ZMIANA: zrzut sceny L0/L1/L2 z `ownerKind` i `labelRole`
 * tych etykiet zastąpionymi stałą jest CO DO BAJTU identyczny przed i po
 * (sha256 `faac9ae0624c693850dab3ab442d52f26a779701a5c7bcf3beb9b40cb6faf45c`
 * w obu fazach). Nowy rodzaj dostał w `LABEL_PRIORITY` TĘ SAMĄ wagę (40) i w
 * `LABEL_ROLE_BY_OWNER_KIND` TĘ SAMĄ rolę („dane") co rodzaj, który zastąpił,
 * więc ani odgruzowywanie, ani próg czytelności nie widzą różnicy — rozdział
 * dotyczy WYŁĄCZNIE celu kliknięcia.
 *
 * AKTUALIZACJA ŚWIADOMA (karta SLOT-DRYF-PRZĘSŁA, 2026-08-08) — WSZYSTKIE
 * odciski przeliczone ponownie. TA KARTA, w odróżnieniu od trzech poprzednich,
 * ZMIENIA GEOMETRIĘ (i tylko dlatego nie ma tu zrzutu „identyczny co do bajtu
 * po zamaskowaniu jednego pola" — nie byłoby czego maskować):
 *   (8) rezerwacja slotu etykiety przęsła jest wyśrodkowana na kablu, który
 *       etykieta opisuje (przęsło GŁOWICA→GŁOWICA, `layout/segments.ts`
 *       `segmentSpanEndsX`), a nie na odcinku tap-do-tap (ŚRODEK BLOKU→ŚRODEK
 *       BLOKU) ⇒ zmieniają się prostokąty 37 etykiet przęseł sieci
 *       referencyjnej, a przez nie odcisk sceny, declutteru i planu;
 *   (9) kanały zejść lateralnych omijają BLOKI, a etykieta przęsła ustępuje im
 *       WZDŁUŻ własnego kabla (`layout/columns.ts` `przesunSlotyPozaKanaly`)
 *       zamiast rozpychać kolumny ⇒ kolumny wierszy z kanałami stoją inaczej.
 *
 * POMIAR PRZED/PO (wymóg §0 R2 karty; `scripts/pomiar_slotu.tsx`, L2, sieć
 * referencyjna · sieć podwojona):
 *   · błąd środka podpisu wobec środka opisywanego kabla: mediana 180 → 4
 *     j.św. (38% → 1% długości tego kabla), max 824 → 284;
 *   · podpisy leżące poza zakresem X swojego kabla: 0 → 0;
 *   · KOLIZJE prostokątów etykiet: 0 → 0 (kanon C-11 utrzymany);
 *   · etykiety ODRZUCONE przez silnik (`declutter.dropped`): 0 → 0 na obu
 *     sieciach × L0/L1/L2 — pierwsze podejście karty gubiło tu 1 podpis
 *     („S12 ↔ S13" wchodził w grot łącznika ciągu dalszego na sieci
 *     podwojonej), co było powodem ODRZUCENIA tamtego wariantu, nie
 *     zaktualizowania progu;
 *   · wskaźnik „Ukryto N opisów" (`plan.hiddenDetail`) BEZ ZMIAN na całej
 *     drabinie skal: referencyjna 1/164/333, podwojona 1/323/659;
 *   · bbox arkusza ZMALAŁ: referencyjna 8344×5254 → 8296×5254, podwojona
 *     14536/14622 → 14488/14574 szerokości; długość toru 119368 → 116592.
 *
 * AKTUALIZACJA ŚWIADOMA (SLOT-DRYF-PRZĘSŁA, runda poprawkowa 2026-08-08) —
 * odciski przeliczone ponownie po jednej zmianie:
 *  (10) przęsło wychodzące z GPZ (i z pola odpływowego GPZ) bywa ŁAŃCUCHEM
 *       segmentów ENM, a podpis opisuje OSTATNI z nich — rezerwacja centruje
 *       się teraz na KAWAŁKU niosącym ref podpisu (`zakresKawalkaLancucha`,
 *       `scene/buildScene.ts`), a nie na całym przęśle przyciętym do prawej
 *       krawędzi GPZ. Zmienia się prostokąt JEDNEJ etykiety na sieci
 *       referencyjnej („GPZ ↔ S01": [408..743] → [337..672]).
 * POWÓD: to był OSTATNI podpis, którego wystawanie poza własny kawałek
 * przekraczało minimum geometryczne (135 wobec 111 j.św. = szer. napisu −
 * dł. kawałka). Po zmianie nadmiar ponad minimum wynosi 0 dla WSZYSTKICH 37
 * podpisów przęseł — i to jest asercja, nie deklaracja
 * (`layout/__tests__/slotDryfPrzesla.test.ts`, miara M2).
 * Bez zmian: kolizje 0, `declutter.dropped` 0 na obu sieciach × L0/L1/L2,
 * „Ukryto N opisów" 1/164/333 i 1/323/659, bbox 8296×5254 i 14488/14574.
 *
 * AKTUALIZACJA ŚWIADOMA (RAMKA-TNIE-PODPISY, 2026-08-09) — przeliczone
 * WYŁĄCZNIE odciski PLANU: 17 z 42 pozycji. Odciski SCENY i DECLUTTERU są
 * BAJTOWO NIETKNIĘTE (6 z 6 i 6 z 6) — i to jest tu najważniejsza liczba:
 * karta rusza WARSTWĘ RENDERU, więc geometria świata nie miała prawa drgnąć,
 * a wyrocznia to potwierdza, zamiast tego deklarować.
 *
 * CO SIĘ ZMIENIŁO W PLANIE (trzy mechanizmy, wszystkie w
 * `canvas/labelLegibility.ts`):
 *  (11a) `PlannedLabel.rect` niesie teraz TUSZ także dla pisma NATURALNEGO
 *        (dotąd: surowy slot sceny). Różnica realna dla jednej etykiety —
 *        opis zbiorczy GPZ, którego tekst jest szerszy od slotu;
 *  (11b) pismo naturalne jest SKRACANE do własnego slotu (dotąd nie było
 *        skracane wcale, więc malowało się „na wylot" 39,5 j.św. poza lewą
 *        krawędź arkusza);
 *  (11c) obrys arkusza jest przeszkodą planu, a pasmo nazw stacji przesuwa
 *        się w całości, gdy po powiększeniu wyszłoby poza arkusz.
 *
 * KIERUNEK ZMIANY jest zgodny z regułą nie-rosnącą §15.1: nic nie urosło.
 * Liczba narysowanych etykiet i porzuconych tożsamości jest IDENTYCZNA jak
 * przed kartą na obu sieciach i całej drabinie skal (pomiar: plan z arkuszem
 * nieskończonym vs plan z granicą — te same liczby, patrz
 * `sheet/__tests__/obrysArkusza.contract.test.tsx` „INIEKCJA (−)"). Zmienia
 * się POŁOŻENIE kilku prostokątów i POSTAĆ kilku napisów (skrócone ZE ZNAKIEM
 * „…" wg S9-7/C-6) — czyli dokładnie to, co karta miała zmienić.
 *
 * ODCISKI NIEZMIENIONE tam, gdzie zmiana nie sięga — 25 z 42, w tym CAŁA
 * skala 0,05 (przy niej sufit proporcji odrzuca wszystkie tożsamości, więc
 * nie ma czego mieścić w arkuszu) i skale ≥1,5 na L1/L2 (pismo naturalne
 * mieści się w slotach). Gdyby zmieniły się wszystkie 42, byłby to sygnał,
 * że naprawa sięga dalej, niż opisuje.
 *
 * AKTUALIZACJA ŚWIADOMA (SLD-nN-TOPOLOGIA karta T1, 2026-08-14) — przeliczone
 * WYŁĄCZNIE odciski SCENY (6 z 6, referencyjna+podwojona × L0/L1/L2).
 * Odciski DECLUTTERU i PLANU są BAJTOWO NIETKNIĘTE (6 z 6 i 42 z 42) — karta
 * rusza WYŁĄCZNIE klasyfikację odcinków (`meta.kind`/`meta.elementKind`),
 * zero zmian `scene.labels`, więc silnik etykiet (który czyta wyłącznie
 * `labels`, nie `segments`) nie ma prawa drgnąć, i wyrocznia to potwierdza.
 *
 * CO SIĘ ZMIENIŁO (jeden mechanizm, `scene/buildScene.ts`
 * `classifyStationSegmentKind`, plan §0 pkt 2(b)): szyna nN kolektorowa
 * (`#lv-bus`) dostaje TERAZ `kind:'bus'`/`elementKind:'bus'` — SYMETRYCZNIE
 * z `#sn-bus` (obie są odcinki, do których dotykają porty WIELU pól/aparatów
 * tej samej stacji; dotąd `#lv-bus` dostawała `kind:'lv'`/`elementKind:
 * 'segment'`, jak zwykły przewód — werdykt B-02, defekt (b)). Dodatkowo:
 * krawędzie LITERALNE nN (aparaty/kable odpływów) dostają `kind:'lv'` z
 * DOMENY GRAFU zamiast domyślnego `'sn'` (defekt (a)) — na TEJ fixturze
 * (`sldSubstrate52s.enm.json`, ZERO danych strukturalnych P0.1 nN — żaden
 * transformator nie ma osobnego terminala LV odrębnego od szyny nN stacji)
 * ten drugi mechanizm nie ma czego zmienić (zero aparatów/kabli odpływów w
 * modelu), więc CAŁA różnica sceny to WYŁĄCZNIE 53 segmenty `#lv-bus`
 * (dowód: `git stash` + diff tablic `symbols`/`segments`/`labels`/`bbox`
 * przed/po, meldunek karty T1 — 53 diffy, wszystkie identycznego kształtu
 * `kind:'lv'→'bus'`/`elementKind:'segment'→'bus'`, WSPÓŁRZĘDNE i WSZYSTKO
 * inne bajtowo identyczne; zero diffów symboli, zero diffu bbox).
 *
 *
 * AKTUALIZACJA ŚWIADOMA (LV DOMAIN PROJECTION po B-02, 2026-09-01) — WSZYSTKIE
 * odciski przeliczone ponownie (sceny, declutter, plany; obie sieci × L0/L1/L2),
 * bo karta zmienia rysunek KAŻDEJ stacji z transformatorem w JEDNYM mechanizmie
 * (`compose/station.ts` + `layout/measure.ts::planLvTerminal`):
 *   1. na zacisku nN (`#lv-bus`) stoi PORTAL domeny nN (`lvPortal`, pion
 *      `#lv-portal-drop` 2×GRID) — NA OSI portu LV (w obrysie kolumny TR,
 *      zero dodatkowej szerokości stacji; pomiar 2026-09-01: wariant „portal
 *      ZA blokiem" łamał arkusz L0 tej fixtury z 2 na 3 wiersze i porzucał
 *      WSZYSTKIE nazwy stacji jako nieczytelne); strzałka odbioru ZA portalem,
 *      rząd DER strony nN (20 stacji) ZA strzałką (trunk z prawego końca
 *      zacisku, zero przecięć — `junction_dot_probe` 0);
 *   2. wnętrze rozdzielnicy nN (aparat główny, sekcje, sprzęgła, odpływy,
 *      agregaty T5a) NIE jest już rysowane w projekcji SN — żyje w projekcji
 *      nN (`lv-domain/`); na tej fixturze (zero danych P0.1) nic nie ubyło;
 *   3. rezerwacja B4 (`nnSideBelowBusHeight` = max{portal, rząd DER, odbiór})
 *      rośnie (portal także dla stacji bez odbioru i bez DER), a kolumna pola
 *      TR z odgałęzieniem bocznym (ES/VT/SA w porcie LV) rezerwuje pas na
 *      lateral + jego etykietę QE, pod który schodzi zacisk nN (pomiar W1c:
 *      portal na wysokości portu LV nachodził na ES/VT/SA, a zacisk pod
 *      samym symbolem porzucał etykiety QE) ⇒ inne pasma ⇒ inne plany etykiet
 *      na KAŻDEJ skali; szerokości kolumn BEZ zmian (łamanie arkusza
 *      identyczne jak przed portalem: 2 wiersze [6,6], szerokość 8296).
 * Dowód nietrywialności: `totalVerticalSegmentLength` 21064/37272/37272 →
 * 22672/45656/45656 (`buildScene.test.ts`, uzasadnienie tamże); zero nowych
 * kolizji (sekcja „budżet" tego pliku, `sceneConformance`, `w1cMatrixGen`).
 * Kolejność `plany` odpowiada `SKALE`.
 *
 * AKTUALIZACJA ŚWIADOMA (SUB-52s, 2026-09-04) — WSZYSTKIE odciski przeliczone
 * ponownie (sceny, declutter, plany; obie sieci × L0/L1/L2). DWIE NIEZALEŻNE
 * przyczyny w regenerowanej fixturze `sldSubstrate52s.enm.json`:
 *   (12) TOPOLOGIA — substrat miał stację (dawna „Stacja L6-3") odciętą od
 *        źródła za otwartym łącznikiem NO: ENMValidator E003 (wyspa, BLOCKER),
 *        nie funkcja fixtury. Naprawa (`sld_substrate_52s.py` krok 5d) spina
 *        koniec tego odgałęzienia z końcem SĄSIEDNIEGO („Stacja L7-4") nową
 *        gałęzią kablową — łącznik NO zostaje otwarty (rezerwa), ale
 *        odgałęzienie ma teraz DRUGĄ drogę do źródła. To zmienia przydział
 *        rodzic/głębokość drzewa BFS dla stacji tego rejonu (dowód:
 *        `sldNetwork53.ts` po regeneracji — S52/S53 zamieniają się
 *        identyfikatorem i rodzicem), więc inaczej wypada rezerwacja kanału
 *        pionowego między wierszami (`totalVerticalSegmentLength` 22672/45656/
 *        45656 → 20936/43912/43912, SPADEK — `buildScene.test.ts`, uzasadnienie
 *        tamże) — zmienia się scena, a przez nią declutter i plan.
 *   (13) DRYF NIEZALEŻNY OD TEJ KARTY — transformator GPZ (katalog
 *        `tr-wn-sn-110-15-25mva-yd11`): `hv_neutral` {type:directly_grounded}
 *        → null, `i0_percent` 0,2 → 0,35 (dowód: `git show HEAD:<stara
 *        fixtura>` vs regenerowana, pola transformatora GPZ id-stripped —
 *        WSZYSTKO inne na GPZ identyczne). Materializacja katalogu tego
 *        transformatora (`_materialize_catalog_payload`/dane katalogowe SN/WN)
 *        zmieniła się MIĘDZY ostatnim zatwierdzeniem fixtury (LV DOMAIN
 *        PROJECTION, 2026-09-01) a dniem dzisiejszym, NIEZALEŻNIE od tej karty
 *        (SUB-52s dotyka wyłącznie `insert_station_on_segment_sn` — stacje SN/
 *        nN — i `connect_secondary_ring_sn`; `git diff` na `sld_substrate_52s.py`
 *        nie rusza wywołania `add_grid_source_sn`, jedynego miejsca budowy GPZ;
 *        `_apply_station_neutral_grounding`, jedyny setter `hv_neutral`, nigdy
 *        nie jest wołany z `add_grid_source_sn`). Usunięcie symbolu
 *        `neutralEarthing` z bloku GPZ na L1/L2 (`buildScene.gpzCollapsed.
 *        test.ts`, uzasadnienie tamże) pochodzi WYŁĄCZNIE stąd, nie z (12).
 * Każda karta regenerująca tę fixturę odziedziczy (13), dopóki katalog/
 * materializacja transformatora GPZ nie zostaną ujednolicone osobną kartą —
 * poza zakresem SUB-52s (walidator E063/E003, nie katalog transformatorów WN).
 *
 * AKTUALIZACJA ŚWIADOMA (SLD-LOC, 2026-09-05) — WSZYSTKIE odciski przeliczone
 * ponownie (sceny, declutter, plany; obie sieci × L0/L1/L2). PRZYCZYNA:
 * naprawa lokalności pionowej kotwic stacji (karta SLD-LOC — defekt: dopisanie
 * stacji na ogonie JEDNEGO ciągu magistrali przesuwało pionowo kotwice
 * WSZYSTKICH innych, niepowiązanych stacji, bo fallback-numeracja stacji bez
 * jawnej nazwy [`stationCodeFromName`, WSZYSTKIE 54 stacje tej fixtury — żadna
 * nie pasuje do regexów jawnego kodu] dzieliła JEDEN licznik GLOBALNY między
 * WSZYSTKIMI ciągami sieci). Naprawa (`enmToSldAdapter.ts`
 * `fallbackSequenceBaseByRunId`, `buildStations`, pełny docstring tam z
 * trzema zbadanymi wariantami rozmiaru bloku): baza numeracji KAŻDEGO ciągu
 * = jego INDEKS w `sortedRuns` (kolejność UKŁADU, `compareLineRunsForLayout`
 * — STRUKTURALNA właściwość ciągu: prefiks syntetyczny id, `run_kind`, id
 * jako remis — NIE zależy od liczby stacji ciągu) × rozmiar bloku
 * (`Math.max` liczby stacji najliczniejszego ciągu TEJ sieci, policzony PER
 * BUDOWA — jedyny z trzech wariantów, który na PEŁNEJ regresji katalogu
 * testów SLD v3 nie łamie ŻADNEGO z trzech niezależnych niezmienników
 * geometrycznych spoza kart tej naprawy). Jednoznaczna Z KONSTRUKCJI (zero
 * kolizji kodów) i LOKALNA (dopisanie stacji do ciągu A nie zmienia indeksu
 * ani rangi ciągu B w `sortedRuns` — jego `run_kind`/id, jedyne kryteria
 * sortowania, są niezależne od LICZBY stacji, które niesie). Magistrala
 * (`gpz/<hash>/corridor_01`, 12 stacji T1..T12, `run_kind=main_trunk`)
 * PRZETWARZANA JEST ZAWSZE PIERWSZA w `sortedRuns` (kindRank 0), więc jej
 * baza = `0×BLOK+1 = 1` NIEZALEŻNIE od rozmiaru bloku — kody „S01".."S12"
 * ZOSTAJĄ BEZ ZMIAN względem dawnego licznika globalnego. Delta odcisków
 * pochodzi z INNYCH (nie-magistrala) ciągów: ich baza = indeks×12 (block=12,
 * zmierzone maksimum stacji w jednym ciągu tej sieci) zamiast ciągłego
 * zliczania globalnego licznika — te same DWUCYFROWE szerokości kodu, ale
 * inne KONKRETNE wartości (np. „S25" zamiast „S16"). Kod fallback jest
 * TREŚCIĄ pasma nazw stacji na KAŻDYM LOD (`scene/buildScene.ts:1105`),
 * więc zmienia się scena na każdym LOD, a przez nią declutter i plan. Pełny
 * pomiar i uzasadnienie mechanizmu: `buildScene.test.ts` (F9.7 `vertical_
 * length_probe`, ta sama fixtura, `totalVerticalSegmentLength`
 * 20936/43912/43912 → 21040/44016/44016, delta jednolita +104 na L0/L1/L2 —
 * dowód, że to JEDEN mechanizm, nie kilka). Zero nowych kolizji: macierz
 * lokalności (`buildScene.p1Recenzja.test.ts`, karta SLD-LOC L4 — 9/9
 * kombinacji topologia×edycja `pionowe=0`); `busbar_label_probe`
 * (`buildScene.test.ts`) — 53 etykiety, 53 UNIKALNE teksty (dawny globalny
 * licznik dawał tu tylko 12 unikalnych — regresja odwrotna wobec defektu,
 * nie nowa); `crossings.test.ts` junction_dot_probe, `buildScene.
 * w3Labels.test.ts` anty-dryf, `obszarBezpieczny.contract.test.tsx`,
 * `buildScene.sheetRows.test.ts` S9-1 — wszystkie BEZ ZMIAN (dwie odrzucone
 * próby rozmiaru bloku — stała mała=10, stała duża=1000 — łamały te same
 * niezmienniki, patrz docstring w adapterze); `npm run accept:sld-v3` ALL
 * PASS (sufit `VERTICAL_LENGTH_BASELINE`/`VERTICAL_LENGTH_BY_CAUSE_BASELINE`,
 * ery LV DOMAIN PROJECTION, nigdy nie obniżony przy SUB-52s, pochłania
 * deltę bez zmiany progu).
 *
 * AKTUALIZACJA ŚWIADOMA (SLD-SUBSTRAT, 2026-09-25) — WSZYSTKIE odciski
 * przeliczone (sceny, declutter, plany; obie sieci × L0/L1/L2). Dwie przyczyny,
 * rozdzielone pomiarem na fiksturach etapowych (ta sama sieć, zmiany wejścia
 * dokładane KLASAMI, zrzuty sceny w meldunku karty):
 *   (14) REGENERACJA FIKSTURY z budowniczego (pierwsza od 2024fb4b, 2026-09-05):
 *        ziarno odcinka SN obejmuje od CV-4.3 K1 (11aebfaa) typ katalogowy i nazwę
 *        odcinka, więc WSZYSTKIE identyfikatory odcinków, szyn, stacji i źródeł nN
 *        są nowe (922 ziarna, odwzorowanie 1:1 po pozycji w zrzucie ENM, zero
 *        konfliktów). Sama zmiana identyfikatorów (etap S1: stara treść, nowe
 *        identyfikatory) daje DOKŁADNIE odciski końcowe — nazwy (PL-ZNAKI, #140/#141,
 *        8d17613c), komunikaty katalogowe (#142), pola addytywne modelu i zaokrąglenie
 *        susceptancji (reguła zapisu liczb fikstur) NIE zmieniają sceny (etapy S2–S4 =
 *        S1 co do bajtu). Mechanizm: kolejność ciągów odgałęzień w układzie rozstrzyga
 *        remis `id.localeCompare` (`compareLineRunsForLayout`), a z niej płyną kody
 *        fallback stacji odgałęzień (SLD-LOC) i kolejność pakowania pasm —
 *        `totalVerticalSegmentLength` 21040/44016/44016 → 22752/45728/45728 (+1712
 *        jednolicie na L0/L1/L2, `buildScene.test.ts` F9.7).
 *   (15) NAPRAWA predykatu prześwitu kanału (`layout/columns.ts` `naruszaPrzeswit`):
 *        odstęp RÓWNY prześwitowi przestał być kolizją, więc znikają FAŁSZYWE notatki
 *        STOP „kanał zejścia lateralu przecina slot etykiety przęsła" — na starej
 *        fiksturze sieci podwojonej 4 na każdym LOD (6/30/30 → 2/26/26), na nowej
 *        fiksturze referencyjnej 1 na każdym LOD. DOWÓD, ŻE TO JEDYNA ZMIANA NAPRAWY:
 *        scena z `meta.stopNotes` zastąpionym pustą listą jest CO DO BAJTU identyczna
 *        przed i po naprawie (obie sieci, obie fikstury, L0/L1/L2), a declutter i plan
 *        etykiet są identyczne — geometria rysunku nietknięta.
 *
 * AKTUALIZACJA ŚWIADOMA (SLD-SUBSTRAT, kontynuacja, 2026-09-30) — przeliczone odciski;
 * z 54 wpisów tablicy 16 bez zmian. Zmiana DANYCH rusza scenę i etykiety na KAŻDYM LOD
 * (wiersz 4 pasma nazw stacji), zmiana KODU — scenę na każdym LOD, a etykiety WYŁĄCZNIE
 * na L2 (sonda: kod HEAD i kod nowy na nowej fiksturze dają identyczne odciski
 * declutteru i 7 z 7 planów na L0 i L1, 0 z 7 na L2). Atrybucja liść po liściu (sonda
 * 2×2 kod HEAD/nowy × fikstura stara/nowa, meldunek karty):
 *  · DANE (substrat budowany ścieżką produktu — magazyn modelu z promocją pól nN i
 *    uzupełnieniem katalogowym): 33 stacje dostają odbiór katalogowy odpływów nN
 *    (`#lv-load-drop` + `loadArrow` + wydłużona `#lv-bus`, wiersz 4 pasma nazw
 *    „granica modelu — bez odbiorów nN" → „Odbiór ΣP…"), 20 stacji — wyższą sumę
 *    odbioru, 4 wiersze DER przesunięte przez strzałkę odbioru; 199 aparatów pól nN
 *    bez wiązania (53 wyłączniki główne, 126 odpływów, 20 pól źródłowych).
 *  · KOD: aparat nN BEZ wiązania katalogowego nie jest już UNRESOLVED (199 notatek STOP
 *    grafu elektrycznego znika, status SLD_VALID); łącznik sekcyjny „Łącznik sekcyjny
 *    NO (rezerwa)" dostaje symbol (dwa półodcinki przycięte do jego portów) i nazwę na
 *    L2; odcinek powiązania „Rezerwa pierścieniowa (odcinek NOP)" zamyka dwa końce
 *    ogonów — dwa słupki „koniec otwarty" i ich etykiety zastępują dwa znaki
 *    powiązania i dwa odsyłacze „powiązanie" (L2). Etykiety zmieniają się WYŁĄCZNIE na
 *    L2, stąd declutter/plany L0/L1 bez zmian — i tak wychodzi w odciskach.
 *
 * AKTUALIZACJA ŚWIADOMA (ETYKIETA-STACJI-PRZELOTOWEJ, 2026-09-30) — przeliczone odciski;
 * z 54 wpisów tablicy 16 bez zmian (L0: declutter i 7 z 7 planów w obu sieciach).
 * Sonda 2×2 (kod HEAD/nowy × fikstura przed/po regeneracji): regeneracja fikstury NIE
 * rusza żadnego odcisku; zmienia je WYŁĄCZNIE kod — jedna reguła rodzaju stacji
 * (`ui/shared/rodzajStacji.ts`) w miejsce prezentacji „ostatnia w ciągu ⇒ końcowa":
 *  · „Stacja L6-3" i „Stacja L7-4" (końce odcinka powiązania „Rezerwa pierścieniowa
 *    (odcinek NOP)") — oba pola liniowe prowadzą do innych stacji ⇒ sylwetka L0 i podpis
 *    L1/L2 „stacja końcowa" → „stacja przelotowa" (w sieci podwojonej po dwie kopie);
 *  · 12 notatek STOP `station.type.terminal`/niezgodności deklaracji znika ze sceny L1/L2
 *    (13 → 1, w podwojonej 26 → 2) — niezgodność deklaracji z topologią melduje odtąd
 *    walidator (ostrzeżenie W043 z akcją naprawy), a nie notatka rysunku z identyfikatorem.
 *
 * AKTUALIZACJA ŚWIADOMA (GPT-478, 2026-10-15) — przeliczone odciski; z 54 wpisów tablicy
 * 18 bez zmian (L0: scena, declutter i 7 z 7 planów w obu sieciach). Przyczyna WYŁĄCZNIE
 * w DANYCH (kod SLD nietknięty): kontrola O-53 sumuje źródła zasilane przez ten sam
 * transformator (V12K-022), więc konfiguracja mieszana PV 0,5 MW + BESS 0,5 MW (Σ S_n
 * 1,1 MVA) na czterech stacjach odgałęzień substratu nie mieści się w 630 kVA — budowniczy
 * (`sld_substrate_52s.py` krok 5(d)) przepina ich transformator na 1250 kVA, a fikstura
 * regenerowana narzędziem repo. Jedyna różnica wejścia (diff fikstury): parametry tych
 * czterech transformatorów (pozycja, S_n, u_k, straty) i wynik rozpływu substratu — zmienia
 * to scenę i etykiety L1/L2; L0 bez zmian.
 * Dawniej budowniczy dokładał magazyn mimo przekroczenia mocy transformatora.
 *
 * AKTUALIZACJA ŚWIADOMA (GPZ-PARYTET cz. 3, 2026-10-21) — przeliczone odciski; z 54 wpisów
 * tablicy zmienione wszystkie 54. Pomiar (archiwa `git archive` przebiegane tym testem w trybie
 * budżetów): ostatni zielony punkt `6c940d2e8^`, PIERWSZY czerwony `6c940d2e8` (GPZ-PARYTET
 * „14 odroczonych kluczy parytetu GPZ zamkniętych zachowaniem albo kontraktem negatywnym";
 * 54 z 54 wpisów inne), czerwień przeniesiona przez cz. 2 (`2df442be0`: uzwojenia, stan
 * łączników z modelu) bez przeliczenia, bo test biegnie wyłącznie w kroku budżetów, którego
 * tamte karty nie uruchomiły. Wkład tej karty, zmierzony porównaniem pełnych scen drzewa bazowego
 * `2df442be0` i drzewa karty (JSON scen L0/L1/L2 obu sieci): WYŁĄCZNIE `state` dwóch
 * przekładników prądowych toru transformatora GPZ bez pola modelu (pole WN TR i pole TR) —
 * „nieznany" → brak stanu, bo przekładnik nie jest łącznikiem (ta sama reguła co dla toru
 * z polem modelu, `compose/gpz.ts` `stanAparatuPolaGpz`, przypięte w
 * `buildScene.gpzPoleTr.test.ts`). Zmienia to scenę L1/L2 obu sieci; L0, declutter i 21
 * planów na sieć identyczne z bazą `2df442be0`.
 *
 * AKTUALIZACJA ŚWIADOMA (GEOMETRIA-STACJI, 2026-10-22) — przeliczone odciski; z 54 wpisów
 * tablicy zmienione wszystkie 54. Pomiar: ten test w trybie budżetów na drzewie HEAD karty
 * (archiwum `git archive`) — 8 z 8 zielonych, czyli czerwień wnosi wyłącznie kod tej karty.
 * Przyczyny (każda zmienia scenę i etykiety na KAŻDYM LOD obu sieci): (1) aparaty pola
 * wyłącznie z rekordów modelu — stos konwencji roli zniknął, pole bez rekordów ma jedną
 * sylwetkę „brak danych wyposażenia pola" (§0 pkt 4); na L0 pole GPZ dostaje aparat ciągłości
 * z rekordu albo tę sylwetkę zamiast wyłącznika z konwencji; (2) odcinek szyny SN stacji
 * niesie ref sekcji `${busRef}#sn-bus` zamiast `${stationRef}#sn-bus` (§0 pkt 1), więc
 * zmienia się tożsamość segmentów i etykiet szyn; (3) niższe stosy pól przesuwają kotwice
 * etykiet, a za nimi plan etykiet przy każdej skali gestu.
 *
 * AKTUALIZACJA ŚWIADOMA (partia integracji 12, 2026-10-21) — trzy odciski SCENY sieci
 * podwojonej (L0/L1/L2); declutter i plany bez zmian, sieć referencyjna bez zmian. Przyczyna
 * WYŁĄCZNIE w treści komunikatów niezmienników elektrycznych (`electrical/invariants.ts`,
 * `terminalGraph.ts`, partia 10: odmowy bez identyfikatorów — nazwa elementu zamiast
 * `ref`), które scena niesie; sieć podwojona ma naruszenia niezmienników, referencyjna nie.
 * Sonda: oba pliki przywrócone do stanu sprzed partii 10 → 8 z 8 testów tego pliku zielone.
 *
 * AKTUALIZACJA ŚWIADOMA (partia integracji 12, karta W2C-PLAN-ETYKIET, 2026-10-21) — 6 odcisków
 * PLANU etykiet (obie sieci); odciski SCENY i DECLUTTERU bez zmian. Przyczyna WYŁĄCZNIE w
 * `canvas/labelLegibility.ts` (`najlepszeDopasowanie`): plan próbuje pełnego tekstu po każdej
 * stronie kotwicy, zanim skróci napis — dawniej skracał po stronie zadeklarowanej („TV1” →
 * „T…”, czytane jak transformator). Sonda: ten plik sprzed karty → 8 z 8 testów zielone.
 *
 * AKTUALIZACJA ŚWIADOMA (styk K2b×K3, 2026-10-22) — przeliczone odciski; z 54 wpisów tablicy
 * zmienione 38. Pomiar (archiwum `git archive 8fe7fe9c4`, ten test w trybie budżetów): drzewo
 * scalenia K2b+K3 `8fe7fe9c4` było CZERWONE (38 z 54 wpisów innych niż pin karty K3 — pin
 * liczony na drzewie samego K3, scalenie z K2b dołożyło punkt NO korytarza na każdym poziomie
 * i podpisy „NO", a krok budżetów po scaleniu nie biegł). Wkład tej karty względem drzewa
 * scalenia, zmierzony odciskami liczonymi z pominięciem nowego pola `obrysKotwicy` etykiet:
 * sceny L0/L1/L2, declutter i plany identyczne poza planem L2 przy skali 0,4 obu sieci —
 * tam 1 (referencyjna) i 2 (podwojona) podpisy „PV 500 kW", dotąd PORZUCONE przez plan
 * (`droppedIdentity` 1 → 0 i 2 → 0), stoją pełnym tekstem przy symbolu źródła (drugie
 * przejście stron przy obrysie, `canvas/labelLegibility.ts`). Pozostałe różnice odcisków
 * scen/declutteru/planów L1/L2 to samo pole `obrysKotwicy` podpisów DER, „NO", oznaczeń
 * sprzęgieł, uziemnika lateralu, przekładnika szyny GPZ i łącznika toru (geometria `rect`
 * bez zmian; para obrys↔symbol sceny przypięta w `canvas/__tests__/stronyPrzySymbolu.test.ts`).
 *
 * AKTUALIZACJA ŚWIADOMA (scalenie gałęzi programu, partie 9–13, z gałęzią UI/UX + naprawa
 * styku K2b×K3, 2026-10-22) — przeliczone odciski; z 54 wpisów tablicy zmienione 9 względem
 * pinu naprawy styku K2b×K3 (`73ef5e665`). Sonda na drzewie scalonym (ten test w trybie
 * budżetów): (A) `electrical/invariants.ts` i `electrical/terminalGraph.ts` z `73ef5e665`
 * (komunikaty niezmienników sprzed partii 10) → różnią się WYŁĄCZNIE 6 odcisków planu
 * (L1 @4, L2 @3, L2 @4 obu sieci); (B) dodatkowo `canvas/labelLegibility.ts` z `73ef5e665`
 * (bez reguły W2C-PLAN-ETYKIET „pełny tekst po każdej stronie przed skrótem") → 0 różnic
 * z pinem `73ef5e665`. Wkład scalenia = dokładnie te dwie przyczyny programu: 3 odciski
 * SCENY sieci podwojonej (treść komunikatów niezmienników, partia 10) i 6 odcisków PLANU
 * (reguła W2C, złożona z drugim przejściem stron przy obrysie symbolu — pełny tekst po każdej
 * stronie przed skrótem obowiązuje w obu przejściach). Declutter bez zmian.
 *
 * AKTUALIZACJA ŚWIADOMA (GPZ-MODEL, 2026-10-22, na bazie GEOMETRIA-STACJI i W5-C) —
 * przeliczone odciski; z 54 wpisów tablicy zmienione wszystkie 54. Pomiar (ten test
 * w trybie budżetów, archiwa `git archive` drzew):
 *  · PINY BAZY były nieaktualne już przed kartą: na drzewie GEOMETRIA-STACJI `8fe7fe9c4`
 *    i na bazie karty `f7235700e` ten test jest czerwony (6 z 8 przypadków); na bazie
 *    38 z 54 wpisów różni się od odcisków liczonych kodem bazy na fiksturze bazy (zgodne
 *    tylko declutter i plany L0 obu sieci). Czerwień nie wyszła wcześniej, bo test biegnie
 *    wyłącznie w kroku budżetów.
 *  · KOD karty na fiksturze bazy: wobec kodu bazy na tej samej fiksturze różnią się
 *    WYŁĄCZNIE sceny L1/L2 obu sieci (4 z 54; declutter i 21 planów na sieć identyczne),
 *    a jedyna różnica sceny to prawy koniec szyny WN GPZ 160 → 200 — szyna WN mieści własny
 *    podpis „Szyna WN · 110 kV" (`compose/gpz.ts`; bez tego glif źródła nad szyną WN
 *    zasłaniał podpis).
 *  · DANE: substrat ma GPZ z równoważnikiem sieci 110 kV i transformatorem WN/SN (tryb A)
 *    zamiast fikcji „równoważnik na szynach SN + TR obok" (`sld_substrate_52s.py`): źródło
 *    nad szyną WN, ziarno GPZ (ładunek operacji) daje nowe ref-y całej sieci — stąd 54 z 54
 *    wpisów innych na nowej fiksturze (także treść fikstury bazy z samymi nowymi
 *    identyfikatorami: 0 z 54 zgodnych z kodem karty na fiksturze bazy, kolejność remisu
 *    `id.localeCompare`).
 *  · KOD karty, drugi krok (po scaleniu z GEOMETRIA-STACJI, sonda trzech wariantów kodu na
 *    tej samej fiksturze): (1) podpis kabla GPZ→S0 odsuwany także od TUSZU etykiet GPZ
 *    (`buildScene.ts` `odsunPodpisOdElementowGpz`) zmienia WYŁĄCZNIE L2 obu sieci — scenę,
 *    declutter i 7 planów (18 z 54 wpisów): etykiet sceny 913 → 914 i 1815 → 1816, bo
 *    podpis kabla, dotąd stawiany na etykiecie GPZ i zdejmowany declutterem, zostaje;
 *    (2) reguła (f) planu etykiet (`labelLegibility.ts` `ustapSasiadow`) zmienia WYŁĄCZNIE
 *    plan L2 przy skali 0,4 obu sieci (2 z tych 18): tożsamości porzucone od kolizji 1 → 0
 *    i 2 → 0. Pozostałe 36 wpisów (L0, L1) bez zmian.
 *
 * AKTUALIZACJA ŚWIADOMA (scalenie GPZ-MODEL `73e56f4ad` z drzewem scalonym programu, partie
 * 9–13 + styk K2b×K3, 2026-10-22) — przeliczone odciski; z 54 wpisów tablicy zmienione
 * wszystkie 54 względem pinu programu (`182d7df30`) i 37 względem pinu GPZ-MODEL. Pomiar
 * sondą odcisków (te same funkcje co ten test, archiwa `git archive` obu stron, fikstura
 * podana jawnie):
 *  · KOD GPZ-MODEL na fiksturze programu (kod scalony vs kod `182d7df30`, fikstura
 *    `182d7df30`): różnią się WYŁĄCZNIE sceny L1/L2 obu sieci (4 z 54) — prawy koniec szyny
 *    WN GPZ 160 → 200 (`compose/gpz.ts`); reguły podpisu kabla GPZ i ustąpienia sąsiada nie
 *    działają na fiksturze bez szyny 110 kV GPZ.
 *  · FIKSTURA: substrat scalony = substrat GPZ-MODEL (GPZ z równoważnikiem 110 kV i
 *    transformatorem WN/SN, nowe ref-y całej sieci) + pola addytywne programu
 *    (`loads[].earth_electrode_r_ohm`, `transformers[].lv_voltage_tolerance`,
 *    `sources[].c_max/c_min/lv_voltage_tolerance`, skrót nagłówka) — kod scalony daje na obu
 *    fiksturach odciski identyczne (0 z 54 różnic), więc pola programu nie zmieniają rysunku;
 *    zmiana fikstury tłumaczy pozostałe 50 z 54 różnic względem pinu programu.
 *  · KOD PROGRAMU na fiksturze GPZ-MODEL (kod scalony vs kod `73e56f4ad`): 37 z 54 —
 *    (A) `electrical/invariants.ts` i `electrical/terminalGraph.ts` w wersji `73e56f4ad`
 *    (komunikaty niezmienników sprzed partii 10) → różnią się od pinu scalonego WYŁĄCZNIE
 *    3 sceny sieci podwojonej (L0/L1/L2); (B) wszystkie pliki źródłowe `src/` (poza testami
 *    i fiksturami) w wersji `73e56f4ad` → 0 z 54 różnic z pinem GPZ-MODEL, więc całą
 *    różnicę niesie kod źródłowy programu. Pozostałe 34 (sceny, declutter i plany L1/L2 obu
 *    sieci) leżą w L1/L2, gdzie działają zmiany programu opisane we wpisach wyżej (pole
 *    `obrysKotwicy` i drugie przejście stron przy obrysie symbolu ze styku K2b×K3, reguła
 *    W2C planu); dalej sondą ich nie rozkładano. Etykiet sceny jak w GPZ-MODEL: 55/520/914
 *    (referencyjna) i 108/1030/1816 (podwojona), czyli bez etykiet zgubionych ani dodanych.
 *
 * AKTUALIZACJA ŚWIADOMA (GPZ-H5-SLD pkt 3c, 2026-10-22) — przeliczone 4 z 54 wpisów:
 * odciski SCENY L1/L2 obu sieci. Przyczyna: karta tabeli pól GPZ niesie stan danych pola
 * (`KartaPolaGpz.stanDanych` i `stanX` — napis „pole bez aparatu w modelu" zamiast „brak"),
 * a karty siedzą w `scene.meta.gpzAdnotacje` (na L0 blok GPZ jest zwinięty, bez adnotacji).
 * Pomiar sondą (kod karty vs kod bazy `82735bfc1`, ta sama fikstura): odcisk sceny z
 * wyjętym `meta.gpzAdnotacje` jest IDENTYCZNY na wszystkich 6 scenach; symbole, odcinki,
 * etykiety, węzły, skrzyżowania i bbox bez zmian. Declutter (6) i plany (42) bez zmian.
 *
 * AKTUALIZACJA ŚWIADOMA (GPZ-H5-SLD etap 2, 2026-10-22) — przeliczone WSZYSTKIE 54 wpisy.
 * Przyczyna: bilans, alarmy i tabela „Pola GPZ" przechodzą ze schematu do karty GPZ
 * inspektora (wymaganie 1), oznaczenia pól GPZ stoją w pionowym pasmie po lewej stronie
 * toru, odczep T zostaje wyłącznie na pionie kabla odgałęzienia. Pomiar sondą (kod karty vs
 * kod bazy `d82493842`, ta sama fikstura, porównanie po właścicielu: symbole rodzaj +
 * ownerRef + x + y, etykiety właściciel + tekst + rect): liczby elementów BEZ ZMIAN na
 * wszystkich 6 scenach (symbole 65/375/375 i 138/757/757, odcinki 114/600/600
 * i 232/1198/1198, etykiety 55/520/914 i 108/1030/1816 — żadna etykieta zgubiona ani
 * dodana); poza GPZ KAŻDY element przesunięty o jednakowy wektor wiersza arkusza — wiersz
 * pierwszy (−8, −200), kolejne (0, −200): rama GPZ niższa o 200 (belka bez wierszy
 * bilansu, bez tabeli), a węższa szyna SN GPZ przesuwa start korytarza wiersza pierwszego
 * o 8. Skrzyżowań sceny 0 przed i po (sieć referencyjna nie ma skrzyżowań sn×sn, więc
 * reguła odczepu T nie zabiera jej żadnej kropki — `buildScene.odczepTOdgalezienia.test.ts`).
 * Odcinki poza GPZ (punkty, ten sam porównywacz): ten sam wektor wiersza dla wszystkich
 * poza 3 (referencyjna) i 3–5 (podwojona) — dwa odcinki ciągu GPZ → S0 (`…/segment`,
 * `…/segment_L`: tor pola GPZ przesunięty przez pasmo oznaczenia, objazd pod dołem bbox GPZ —
 * ten sam rozkład co pin F9.7 w `buildScene.test.ts`) oraz odcinki przechodzące między
 * wierszem pierwszym a drugim arkusza (początek z wektorem (−8, −200), koniec z (0, −200)).
 *
 * AKTUALIZACJA ŚWIADOMA (GPZ-H5-SLD etap 3, 2026-10-22, scalenie backendu H5 `88557ceb7`) —
 * przeliczone WSZYSTKIE 54 wpisy. Rozkład przyczyn sondą (zrzut sceny L0/L1/L2, porównanie
 * pełnego JSON-u): (1) KOD po scaleniu (scalony backend + etap 3) na fiksturze SPRZED
 * scalenia vs kod `d253b8e8b` — sceny L0, L1 i L2 bajt-identyczne (kod nie zmienia rysunku
 * tej sieci); (2) FIKSTURA przegenerowana
 * przez backend H5 — strona 110 kV jest sekcją modelu z polem liniowym, transformator ma
 * pola po obu stronach: symbole 65→70 / 375→381 / 375→381, odcinki 114→119 / 600→605 /
 * 600→605, etykiety 55 / 520→523 / 914→917, węzły 7→12 / 18→23 / 18→23, skrzyżowania 0;
 * GPZ szerszy (bbox 8024 → 8968), więc arkusz łamie się inaczej (wiersze 6+6 → 5+7).
 *
 * AKTUALIZACJA ŚWIADOMA (GPZ-H5-SLD etap 3 (d), 2026-10-22) — przeliczone 6 z 54 wpisów:
 * odciski SCENY L0/L1/L2 obu sieci. Przyczyna: pozycja normalna łącznika przechodzi do glifu
 * na każdym glifie łączeniowym (klasa odstępstwa od pozycji normalnej) — łącznik toru
 * `sw/8ffea56f…/switch` (punkt normalnie otwarty sieci referencyjnej; w sieci podwojonej
 * także jego kopia `…01ab/switch`) niesie teraz `pozycjaNormalna: 'open'` przy stanie
 * `open` (bez odstępstwa). Pomiar sondą: odcisk sceny z wyjętym polem `pozycjaNormalna`
 * symboli = poprzedni pin na wszystkich 6 scenach; declutter (6) i plany (42) bez zmian.
 *
 * AKTUALIZACJA ŚWIADOMA (GPZ-H5-INTEGRACJA, 2026-10-22) — przeliczone WSZYSTKIE 54 wpisy.
 * Przyczyna: etykietą źródła 110 kV jest nazwa źródła z modelu (`Source.name`), nie tożsamość
 * GPZ `meta.source_id` (`enmToCanonicalGpzAdapter.ts`, decyzja architekta), a nazwa źródła
 * to nazwa toru (`add_grid_source_sn`). Na tej fiksturze tabliczka źródła z „GPZ Referencyjny
 * 110 kV" + „Tor zasilania: Linia 110 kV zasilająca" + „kier. …" staje się „Linia 110 kV
 * zasilająca" + „kier. …" (wiersz toru znika, bo tor = nazwa). DOWÓD (sonda 2×2): kod sprzed
 * zmiany odczytu na fiksturze sprzed i po regeneracji — 8/8 testów pliku zielone na starych
 * pinach (sama zmiana nazwy w fiksturze nie rusza sceny, gdy etykietą był `meta.source_id`);
 * kod po zmianie: scena z nazwą = `meta.source_id` vs nazwą toru, symbole/odcinki/etykiety
 * parami w tej samej kolejności — CAŁY świat pod tabliczką przesunięty o jednakowy wektor
 * (0, −16) (L1: 380 z 381 symboli, 1380 z 1381 punktów odcinków, 518 z 519 etykiet poza
 * tabliczką; jedyny symbol i punkt w miejscu to glif źródła), etykiet 523 → 522 (L1),
 * 917 → 916 (L2), L0 55 bez zmian liczby.
 */
const ODCISKI_BAZOWE: Readonly<Record<'referencyjna' | 'podwojona', readonly OdciskiLod[]>> = {
  referencyjna: [
    {
      scena: '27905963a7a791b09fa771290e7b16da',
      declutter: '1b26bb304ec7e9bf58358708a80ab2c2',
      plany: [
        '926a2d090e65e811e55a88f75e392bc8',
        'f84a6d4d1ab3cb178f06baeabca30d8a',
        '4754e422039b3d8792c1755fd5ec9dc6',
        '8b5b0bc59801c68682ffeaea6e20cd32',
        '652e71741f4e892f53ab706628133f4b',
        'c4083c19ffbcaa76767f57d51e128467',
        'c4083c19ffbcaa76767f57d51e128467',
      ],
    },
    {
      scena: '45b9fc27e7e9b1f31d6ee280fa667da3',
      declutter: '3d3fcb99b9d069923c790af4f363c55a',
      plany: [
        'a13fe841fc8435c10dee107a7cd3ef4c',
        '9ff5ac0d5bdb82b7f976fc7187706a55',
        '9afbe1ea4a75191506fc532764340973',
        'cff0574536ba790d286bdf333865ebbf',
        '5f2385a6a2af17a93bebc76664f52915',
        '62c3297539aaba90981f3eab7684fafe',
        '62c3297539aaba90981f3eab7684fafe',
      ],
    },
    {
      scena: 'aa41804c259f292b4a979e76e284c61b',
      declutter: 'cb6ddfbba8489228ec559042cd242e5d',
      plany: [
        '08f5ccfc750aaee6b9380cb58b9b81fe',
        'f01c24a8f858a59eeed1387a6d75a820',
        'c3a390a079d432b4affdf6d071588e9c',
        'a80d8e3e0085052b0a4d83e9e44de278',
        'ccc59dd1b9f3aad1e532269639ce4491',
        'a98e690d487758148798455296fb3633',
        'a98e690d487758148798455296fb3633',
      ],
    },
  ],
  podwojona: [
    {
      scena: '2581f2992833f9d05298c7f45d42b99e',
      declutter: '5db586bfc0f69e05d11cd93c43628ddb',
      plany: [
        '7893da6ccf0af84d9e7567fa84972d48',
        'd164931453c692bd07853d5ffcba244e',
        '3fc47fbfa1eb816890c4a677ceaf7c73',
        '6058a8e9be1015c6dfcb1a1bed6d201c',
        '7fa16bda5436501453fcbd8457806eaa',
        '2644d61ebaa5c82e0104c92bfa4e3477',
        '2644d61ebaa5c82e0104c92bfa4e3477',
      ],
    },
    {
      scena: '5195ccbc06223cb93be82bd9051959b5',
      declutter: 'b13ffb5d550f80eac88843012b63553e',
      plany: [
        'ab8317ff23137c3acabda809253010ff',
        'df8d2a042bb9c6762323412ef8f833ac',
        'edc69aa14b8f6f3206410871fdf35e09',
        'fa51dfa479df09112a300a388cda0d7d',
        'c1926862b897867f4b59c7b1622d572c',
        '8941e74d66314d6acaeb010744e33b53',
        '8941e74d66314d6acaeb010744e33b53',
      ],
    },
    {
      scena: '27807dc9f7278852f52abfb4ba69a58a',
      declutter: '2dea48f3f0b00785def29d64ff2f365d',
      plany: [
        '994306aa2da3e2628655c7b27e27a03e',
        'a5ba799b69b75796716a61cf0d300e57',
        '52fa8e0210881b5fe4a0a18f9a390659',
        'dbc2a83b34c26e2cb4ca668cdef0e620',
        'ad4b579a9245123ada0a44b9415ecb2a',
        '9208131f562ab59e4c430c18463a481d',
        '9208131f562ab59e4c430c18463a481d',
      ],
    },
  ],
};

const SIECI = [
  ['referencyjna', siecReferencyjna],
  ['podwojona', siecPodwojona],
] as const;

describe('S9-9 — tożsamość bajtowa sceny, declutteru i planu etykiet', () => {
  it.each(SIECI)('sieć %s: odciski scen L0/L1/L2 jak przed optymalizacją', (nazwa, model) => {
    const policzone = LODY.map((lod) => odcisk(buildSceneV3(model, lod)));
    expect(policzone).toEqual(ODCISKI_BAZOWE[nazwa].map((o) => o.scena));
  });

  it.each(SIECI)('sieć %s: odciski wyniku silnika etykiet L0/L1/L2', (nazwa, model) => {
    const policzone = LODY.map((lod) => {
      const scena = buildSceneV3(model, lod);
      return odcisk(declutterLabels(scena.labels, sceneObstacleRects(scena)));
    });
    expect(policzone).toEqual(ODCISKI_BAZOWE[nazwa].map((o) => o.declutter));
  });

  it.each(SIECI)('sieć %s: odciski PLANU etykiet — iloczyn LOD × skala gestu', (nazwa, model) => {
    // ILOCZYN CECH (reguła KLASA §2): defekt indeksu ujawnia się dopiero przy
    // etykietach POWIĘKSZONYCH (małe skale) — same skale robocze przechodzą
    // ścieżką szybką i niczego nie dowodzą. Stąd pełna drabina skal × 3 LOD.
    const policzone = LODY.map((lod) => {
      const scena = buildSceneV3(model, lod);
      const przeszkody = sceneObstacleRects(scena);
      return SKALE.map((skala) => odcisk(planSceneLabels(scena.labels, przeszkody, skala, sheetSizeFor(scena))));
    });
    expect(policzone).toEqual(ODCISKI_BAZOWE[nazwa].map((o) => o.plany));
  });
});

describe('S9-9 — budżet przeliczeń synchronicznych ścieżki gestu', () => {
  /** Mediana CZASU PROCESORA z kilku przebiegów (`src/test/czasProcesora.ts`: zegar ścienny
   *  liczy też czekanie w kolejce planisty systemu, czyli obciążenie maszyny, nie koszt kodu). */
  function mediana(fn: () => unknown, powtorzenia = 5): number {
    const czasy: number[] = [];
    for (let i = 0; i < powtorzenia; i++) {
      czasy.push(czasProcesoraMs(fn));
    }
    czasy.sort((a, b) => a - b);
    return czasy[Math.floor(czasy.length / 2)];
  }

  /** Najdroższa skala gestu (etykiety powiększone) na danej sieci. */
  function najgorszyPlan(model: EnergyNetworkModel): number {
    const scena = buildSceneV3(model, 2);
    const przeszkody = sceneObstacleRects(scena);
    return Math.max(...SKALE.map((s) => mediana(() => planSceneLabels(scena.labels, przeszkody, s, sheetSizeFor(scena)))));
  }

  it('plan etykiet mieści się w budżecie klatki na sieci podwojonej (107 stacji)', () => {
    // PRÓG 100 ms wprost z kryterium odbioru karty („zero klatek > 100 ms przy
    // zoomie"). Zmierzone po naprawie: ~26 ms (przed naprawą: 451 ms — próg
    // przekroczony 4,5-krotnie). Zapas jest celowy: to wykrywacz POWROTU kosztu
    // kwadratowego, nie miernik wydajności maszyny.
    expect(najgorszyPlan(siecPodwojona)).toBeLessThan(100);
  });

  it('koszt planu rośnie LINIOWO, nie kwadratowo, z rozmiarem sieci', () => {
    // Kryterium ILORAZOWE zamiast bezwzględnego — nie zależy od szybkości
    // maszyny. Sieć podwojona ma 2× więcej etykiet: koszt liniowy daje ~2×,
    // kwadratowy ~4×. Próg 3× rozdziela te dwa reżimy.
    //
    // MEDIANA ILORAZÓW, NIE ILORAZ JEDNEJ PARY (SLOT-DRYF-PRZĘSŁA, runda
    // poprawkowa 2026-08-08 — defekt PIERWOTNY tego testu, napotkany przy
    // przeliczaniu odcisków). Poprzednia wersja brała JEDNĄ parę pomiarów i
    // porównywała ich iloraz z progiem. Oba składniki to pojedyncze cyfry
    // milisekund w jsdom, więc iloraz jest ZDOMINOWANY przez szum planisty:
    // zmierzone dziewięć kolejnych ilorazów BEZ ŻADNEJ zmiany kodu dało
    // 1,22 · 1,59 · 1,92 · 1,98 · 2,07 · 2,31 · 3,10 · 3,20 · 5,70 (i tak
    // samo na drzewie SPRZED tej karty: 1,24 … 4,38). Trzy z dziewięciu
    // przekraczają próg 3 — test przewracał się losowo, mierząc obciążenie
    // maszyny, a nie złożoność algorytmu. PODŁOGA `bazowy < 2 ms` tego nie
    // ratowała: na tej maszynie bazowy to 3–5 ms, czyli podłoga nigdy nie
    // odpalała, a szum i tak sięgał progu.
    //
    // NAPRAWA U ŹRÓDŁA, NIE ROZLUŹNIENIE PROGU: próg zostaje 3×, zmienia się
    // ESTYMATOR — mediana z `PROBEK_ILORAZU` niezależnych par. Moc detekcyjna
    // ZOSTAJE: koszt kwadratowy daje ~4× w KAŻDEJ próbce, więc jego mediana
    // też jest ~4× i próg łapie go tak samo pewnie jak wcześniej; zmienia się
    // tylko odporność na pojedynczy wyskok. Zmierzone mediany: 2,07 · 2,28
    // (drzewo po karcie) i 2,45 · 2,61 (drzewo sprzed karty).
    //
    // CZAS PROCESORA ZAMIAST ZEGARA ŚCIENNEGO (partia integracji 3, 2026-09-25). Mediana
    // nie wystarczyła: pełny vitest przy obciążeniu ~10 na 4 CPU dał medianę 3,28 i czerwień
    // bez żadnej zmiany na mierzonej ścieżce. Szum siedział w KAŻDYM pomiarze — zegar
    // ścienny liczy czekanie procesu w kolejce planisty. Dziewięć prób na tej samej maszynie:
    // iloraz z zegara 0,28 … 5,03, z czasu procesora 2,03 … 2,28. Próg 3× i mediana zostają;
    // koszt kwadratowy daje ~4× czasu procesora tak samo jak zegara, więc moc detekcyjna
    // jest nietknięta.
    const PROBEK_ILORAZU = 5;
    const ilorazy: number[] = [];
    for (let i = 0; i < PROBEK_ILORAZU; i++) {
      const bazowy = najgorszyPlan(siecReferencyjna);
      // PODŁOGA BEZWZGLĘDNA (wzorzec z V12K-325): przy pomiarze bazowym
      // poniżej 2 ms iloraz jest nierozstrzygalny — próbkę pomijamy.
      if (bazowy < 2) continue;
      ilorazy.push(najgorszyPlan(siecPodwojona) / bazowy);
    }
    // Wszystkie próbki pod podłogą ⇒ maszyna zbyt szybka na ten pomiar;
    // asercji nie wykonujemy (moc detekcyjna zostaje — koszt kwadratowy tej
    // podłogi nie osiąga).
    if (ilorazy.length === 0) return;
    ilorazy.sort((a, b) => a - b);
    const medianaIlorazu = ilorazy[Math.floor(ilorazy.length / 2)];
    expect(medianaIlorazu).toBeLessThan(3);
  });
});
