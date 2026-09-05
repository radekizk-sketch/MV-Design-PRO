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
 */
const ODCISKI_BAZOWE: Readonly<Record<'referencyjna' | 'podwojona', readonly OdciskiLod[]>> = {
  referencyjna: [
    {
      scena: '5e21b3783479f53bf24865353b3039f9',
      declutter: '7d91c9d82be60afebad119a6613214f1',
      plany: [
        '864628e39c5e7f7d39866b9f96f72df7',
        '592ce95ac3ec762039bb6343e1980bbe',
        '51332014af52785cef1ea80502b48079',
        'dc2427d0450613e194fa1ca87df5e465',
        '6e1c72374037309d98f66930923ca4ed',
        'bc8a53c5cb2e82bc49d816490ac9ada1',
        'bc8a53c5cb2e82bc49d816490ac9ada1',
      ],
    },
    {
      scena: '72006d9806cd10a3d5affcbbdf255087',
      declutter: '4f5d6db8e5de9cce1efb5e60a5da641c',
      plany: [
        '701d452c45dc483b77a3d3dbc7e929e8',
        '3a6471f9deb945c1950446273e081e16',
        '48ab9be216762654758f0d0380c41549',
        '4092bb300d5fef3600ce719d821bcf41',
        '4da29c3c7372bcbb6da249702bc00021',
        'a1934438b0de91701cc3dd78f7feb734',
        'a1934438b0de91701cc3dd78f7feb734',
      ],
    },
    {
      scena: 'b3b6a81ea7e7167da0cd9cbdca2f40c7',
      declutter: 'f4fafb0a333677561d87e3bae33779b3',
      plany: [
        'fab4ad5d52269cfd7069e9ac450d4a1c',
        'aeda12152422307e0d07423082a1c89f',
        'c9c17668e15643f2f4ca25e94ebb3d23',
        'fc3e5b1b8dff42e0a6ba35e2e8664caa',
        '5fbb17bdc76d6e774c533b548e7fff49',
        '11011b29a97542187bbe74eb5374dc26',
        '11011b29a97542187bbe74eb5374dc26',
      ],
    },
  ],
  podwojona: [
    {
      scena: '36bef2d9f0e094b0bd9af1c588f307ca',
      declutter: '82aefe98f3ba04a482e8064a64d52018',
      plany: [
        '007cc650810069daa6f1f0f3d63b53aa',
        'e779c5b0ae7e1246a08ca200f5776c78',
        'c98ba76f3738a3e0029435fdba244ff0',
        'aabf4d4246f0d8bc2724688bfb1af872',
        '976b0c7f7d9e301f8362dd47b91f76d7',
        '6bb532edb0d9f796c8955203f7619c97',
        '6bb532edb0d9f796c8955203f7619c97',
      ],
    },
    {
      scena: '0367b6eee395a712b13ab28f57474a86',
      declutter: '773557c807e0f251d6be9da08be8bf4d',
      plany: [
        '764adc3abf82f6f75e4ee484f23c8ef5',
        '961b9f90b1a1967425f0c8dc8527ebf0',
        'c474f0d3685803850adf8c9564c5eb21',
        '1a12d5206149fce498f19d0f8f4bfe3e',
        '1ce0e1a8dd211540317fa2a87f128a95',
        '1f342302285b841e8b1076ee979e8c9f',
        '1f342302285b841e8b1076ee979e8c9f',
      ],
    },
    {
      scena: '843ab7a7f81a6117cb3c3623a5e834b1',
      declutter: '462555a6804e09a9fa1167ef59f7fdaf',
      plany: [
        '0cb03dd5aa09dc6d59bb3997bf8204ba',
        'cc59b08c98c788bb930ef20d99500850',
        'b3f5333bda61171d7fb75d4ed69dd47f',
        '6541bd0da176ed89189f20dbc071caab',
        '71ba4e2132ced4c0c1cea60a3b6a9649',
        '77c2d726d002282336992f77498a4537',
        '77c2d726d002282336992f77498a4537',
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
