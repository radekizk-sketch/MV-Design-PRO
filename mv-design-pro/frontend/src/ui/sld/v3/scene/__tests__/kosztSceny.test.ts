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
 */
const ODCISKI_BAZOWE: Readonly<Record<'referencyjna' | 'podwojona', readonly OdciskiLod[]>> = {
  referencyjna: [
    {
      scena: 'a7c566690bc47f43e7c6494b68a5eb09',
      declutter: '8715508fce9e188144ed82cc2ee11348',
      plany: [
        '632c1a54eb61195cf6c9624ead7bbfa7',
        'eab5d3278e6ee1e81d6ddb500261347c',
        '7cbc3b66a2d6ba3b09932c1c3b95f88b',
        'ddc7214f70617056c1913bf41030bac7',
        '2090840c41e45bcbe3e1173badf1ce5a',
        'a0b09a5af0017d1b5673c4f6b198d547',
        'a0b09a5af0017d1b5673c4f6b198d547',
      ],
    },
    {
      scena: 'bbfbe78396089ff687565b75ff7f6c55',
      declutter: '3acb01e2f33122f9d38b28e537cd01f2',
      plany: [
        '37994213b2c575807453514ffecdea40',
        '52bacb1e52b7dbffcf8a6229426d192b',
        'ac93c57d28112d73cb029bd6073b2a89',
        'c24a5a89cae0e4b18e343648b174d543',
        '1a0b254edcd693c1b747dc18f8eb3b00',
        '547f5ea3a5d3693a6e952e82c686e717',
        '547f5ea3a5d3693a6e952e82c686e717',
      ],
    },
    {
      scena: 'af1dac6d0644171f95adbab8b82f20ac',
      declutter: '07c11089d7c932c5245b2c0ab07f208c',
      plany: [
        'b2f045922746e328f00bcaa2f97a368d',
        'a0687b60110dac560e5c1a388974c273',
        'a0abfe0f841f3ee6b7b80e3bb878e305',
        '03d06ff336d573695d2c41529639ec7f',
        'a804315e42a65dde65cd165714e62490',
        '32bbf23bcf18400985551c04c328d0b1',
        '32bbf23bcf18400985551c04c328d0b1',
      ],
    },
  ],
  podwojona: [
    {
      scena: '161f9762f835fe0a20f07ffd41216cc6',
      declutter: '83af32526845ee87c15a904f4967ef62',
      plany: [
        '167339a75e4cca2fe570dbced978415f',
        'b0939ff8a3c8638ad8de5b6fee2b57d7',
        '53ccd7d7a2f5a2c8b94e467e6fa3fba4',
        'c8328cec63152de3c1f22445df47f3fd',
        'd8d78a8e2c9d9fc08b17ceea60e863f8',
        'cecec226759adfa890cd204361806a2a',
        'cecec226759adfa890cd204361806a2a',
      ],
    },
    {
      scena: '374c98d9f7cde5438e1638edf3ca443d',
      declutter: '74c389320f53a6cc48137f9a02dbf8db',
      plany: [
        'd6bbe75ddbd4279b2b24b85d98dc9e0d',
        'b5f1255f161e2c3e4c96640bd3580ab1',
        '1aae6d6ab2d74ae15b00893c013b878d',
        'b1ddeeafe5b3520437ba166f4cbf17f9',
        'ed2dbc339a378acfeb8e1d3f02ff2adc',
        '1c86ee2bc8220bb7155433381a6ebae6',
        '1c86ee2bc8220bb7155433381a6ebae6',
      ],
    },
    {
      scena: '1a1ec3e4774b224fe363273668542c3f',
      declutter: '610e7bc0b840db2f50bbd6700b938125',
      plany: [
        'bb63776976c8776e27d78f490fa9487f',
        '285d204e220a07c8da379c209f26a9cd',
        '5d13cdf2316ed73d289d9ee56d715c53',
        '4f9ff672374e80e4fecacd6f825570fd',
        'ba2e688913d41b65c4f330562bc79045',
        '24bb366572f2a47bdc197d8d8408054f',
        '24bb366572f2a47bdc197d8d8408054f',
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
