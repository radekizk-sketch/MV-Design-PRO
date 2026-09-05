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
 */
const ODCISKI_BAZOWE: Readonly<Record<'referencyjna' | 'podwojona', readonly OdciskiLod[]>> = {
  referencyjna: [
    {
      scena: 'a701991c79abcc0306239b4cb80fd513',
      declutter: '00eb03eda1bc39c491cc280d6f6a9c3a',
      plany: [
        'c65fb4356ef44da5307ed55358ebf1b4',
        '2ed95578f5f403ab6227bc9ee59f505f',
        '1973b6089ddb8e818df4d64ae7ca6991',
        '0e60d57d6c3e1e94e6c205377be042d9',
        '08211a61c49b1f5b7171458039376022',
        '88bb8ac8cbf89618b5ef8df6bec4d668',
        '88bb8ac8cbf89618b5ef8df6bec4d668',
      ],
    },
    {
      scena: 'bdc075cb55899e7b1f1b9b2decf2084f',
      declutter: 'a0dc919370db047c3f81222f8dd9311a',
      plany: [
        '76c8b7d64f0cdcc1a49067f7b005bedb',
        '0567de88219b44faae550b95c0a64ab8',
        'edca883a0c9722fa821df7043cc61b3d',
        'd82559dec4bcb649fd831f35a4d0e511',
        '99ac527d93a6dc8d3cb4b6215eb6f47c',
        '28c505637eab0a69ca9fe20f1b5e6276',
        '28c505637eab0a69ca9fe20f1b5e6276',
      ],
    },
    {
      scena: '365814fa0978d7130b930040690824ea',
      declutter: 'ffc8d354abd8d2c2f01a0a32d9298c58',
      plany: [
        'af5b1cc0f94952e5313e8b903070d56f',
        '8c84b4497a1de90b2e6de3d9c0076f8a',
        '417ae859ca0e6f33823441b1f3b186b6',
        'b22911c6444e88bd4012788595ee162b',
        '0ce4f6d8bbb6659b8038722e421c2ae5',
        '146506e476133ffe0ed75e4a4fa8de56',
        '146506e476133ffe0ed75e4a4fa8de56',
      ],
    },
  ],
  podwojona: [
    {
      scena: 'c362feda72f652e3e91a55c3704f59ee',
      declutter: '96a6141a779dc70afefc853a7480be12',
      plany: [
        '26be52c61f133278c997f834d8c05fc2',
        '7b5a5fcf4b26999c3ce9e76d22917233',
        'f71bd00477056245ff42b60e11ec632a',
        '0b17ea8fbf77c8f7abf2edde6dd9bb01',
        '2dc4641839d0666d6b722129486b91bd',
        '29d42d24bfbdb273fdef233a499f09a0',
        '29d42d24bfbdb273fdef233a499f09a0',
      ],
    },
    {
      scena: 'e81cc97b7eac93312ab9548c562d85dd',
      declutter: '235de096da9cb53dffe633ed6381bbb4',
      plany: [
        '27582e5dd94d1f5b124cdb394e125476',
        '85f568dbdeb499f41084651a84993181',
        '2bfa11a60f2cfcbf6158aa812410412d',
        'de79ade39ca2d2bd9543514ae4d43739',
        '77794d2d858a8129a9ae8ea0e922a7c8',
        'e9bc15dbccc8ac3507b8d72777cee808',
        'e9bc15dbccc8ac3507b8d72777cee808',
      ],
    },
    {
      scena: 'c26590fb30a25dd2a6f19ee4766d6bf5',
      declutter: 'd3554a0688a066a1801642379018678f',
      plany: [
        '5355b948dca2bbcea54ac9bd7ce3c413',
        '70b25ad61cb96c731597c0c50bdc1270',
        '43d8f6bf85f609086df7e7078027ff93',
        'bc7a771c792915639fd90d5848a1d964',
        '561a9ce4dad19abcb71d5d3d27d99a54',
        '572958f56d57bb2efb36ebb016b9f9cc',
        '572958f56d57bb2efb36ebb016b9f9cc',
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
  /** Mediana z kilku przebiegów — odporniejsza na chwilowe zajęcie maszyny CI. */
  function mediana(fn: () => unknown, powtorzenia = 5): number {
    const czasy: number[] = [];
    for (let i = 0; i < powtorzenia; i++) {
      const t0 = performance.now();
      fn();
      czasy.push(performance.now() - t0);
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
