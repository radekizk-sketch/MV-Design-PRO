/**
 * PLIK GENEROWANY — nie edytować ręcznie. Generator: `scripts/import_qet_pole_sn.py`
 * (karta UX-04/POLE-LINIOWE-WZORZEC), źródło: `docs/sld/vendor/qet/import_manifest.json`.
 * Odświeżenie: `python scripts/import_qet_pole_sn.py`; kontrola świeżości:
 * `python scripts/import_qet_pole_sn.py --sprawdz` (test `backend/tests/ci/test_qet_pole_sn_import.py`).
 *
 * Geometria symboli pola liniowego SN przeniesiona 1:1 z elementów QElectroTech
 * (kolekcja `qelectrotech-elements`, autor: The QElectroTech team, licencja CC BY 3.0,
 * https://creativecommons.org/licenses/by/3.0/). Współrzędne w jednostkach świata
 * schematu SLD v3 względem lewego górnego rogu gabarytu (skala 0,4 jednostki QET).
 * Prymitywy noża = rysunek źródła; każde położenie (otwarte, zamknięte, uziemione, nieznane) —
 * kąt obrotu noża (`noz.katy`, stopnie, konwencja SVG `rotate`; otwarte 0° albo jawny kierunek
 * manifestu) wokół przegubu (`noz.cx`, `noz.cy`) i zasięg noża (`noz.zasiegi`: w położeniu
 * zamkniętym i uziemionym koniec noża leży na styku stałym).
 * Jednokładność rysunku (`skalaRysunku` manifestu) przenosi kształt elementu bez zmian; role prymitywów: `przewody`
 * (kreska przewodu toru), `stale` i `noz` (rysunek aparatu — kreska glifu `QET_KRESKA_GLIFU`),
 * `osprzet` (napęd — kreska glifu).
 * Łącznik z położeniem (kafel stanu, `kafelStanu.uklad` manifestu, wzorzec HMI e²TANGO): zawias noża
 * u dołu, styk stały u góry, nóż pionowy = zamknięty; przy styku stałym `znaczniki` rodzaju aparatu
 * (`QET_ZNACZNIK_STYKU`, kotwice `QET_KOTWICE_ZNACZNIKOW`) i `ziemia` — symbol uziemienia skierowany
 * w dół, na końcu pionu odgałęzienia (`QET_ZIEMIA_KAFLA`).
 */
import type { SymbolPort } from '../../core/grid';
import type { CadPrimitive } from '../cadSymbolRegistry';

export type QetSymbolPolaSnId =
  | 'qetBreaker'
  | 'qetBreakerZNapedem'
  | 'qetDisconnector'
  | 'qetLoadBreakSwitch'
  | 'qetFuseSwitch'
  | 'qetEarthSwitch'
  | 'qetThreePositionSwitch'
  | 'qetThreePositionSwitchZNapedem'
  | 'qetCurrentTransformer'
  | 'qetCoreBalanceCt'
  | 'qetVoltageTransformer'
  | 'qetVoltageTransformer2'
  | 'qetVoltageTransformer3'
  | 'qetCableHead'
  | 'qetVoltageIndicator'
  | 'bayReserve';

export type QetPolozenieNoza = 'open' | 'closed' | 'earthed' | 'unknown';

export interface QetZrodloSymbolu {
  readonly sciezka: string;
  readonly upstreamBlobSha: string;
  readonly sha256: string;
}

export interface QetNozSymbolu {
  readonly cx: number;
  readonly cy: number;
  readonly katy: Readonly<Partial<Record<QetPolozenieNoza, number>>>;
  /** Zasięg noża w położeniu — ułamek długości noża źródła: koniec dalszy od przegubu leży
   *  w odległości `zasieg` × długość (ZAMKNIĘTY/UZIEMIONY — dokładnie na styku stałym). */
  readonly zasiegi: Readonly<Partial<Record<QetPolozenieNoza, number>>>;
  readonly prymitywy: readonly CadPrimitive[];
}

/** Rodzaj aparatu rozpoznawany po znaczniku przy styku stałym (wzorzec HMI e²TANGO). */
export type QetRodzajZnacznika = 'wylacznik' | 'odlacznik' | 'rozlacznik' | 'uziemnik';

export interface QetPunkt {
  readonly x: number;
  readonly y: number;
}

/** Znacznik rodzaju aparatu przy styku stałym: `kotwica` = punkt styku, na którym spoczywa nóż
 *  w położeniu `styk` (zamkniętym albo uziemionym). */
export interface QetZnacznikStyku {
  readonly rodzaj: QetRodzajZnacznika;
  readonly styk: 'closed' | 'earthed';
  readonly kotwica: QetPunkt;
  readonly prymitywy: readonly CadPrimitive[];
}

/** Symbol uziemienia łącznika: `kotwica` = punkt przyłączenia (przegub uziemnika albo dolny koniec
 *  kreski zestyku uziemiającego); pierwszy prymityw to pion odgałęzienia, dalej kreski malejące
 *  w dół. */
export interface QetZiemiaSymbolu {
  readonly kotwica: QetPunkt;
  readonly prymitywy: readonly CadPrimitive[];
}

export interface QetProstokat {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface QetDoprowadzenie {
  readonly port: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly powod: string;
}

export interface QetSymbolPolaSn {
  readonly id: QetSymbolPolaSnId;
  readonly namePl: string;
  readonly zlozenie: string | null;
  readonly szerokosc: number;
  readonly wysokosc: number;
  readonly porty: readonly SymbolPort[];
  /** Porty OBWODU WTÓRNEGO (zacisk uzwojenia wtórnego, koniec doprowadzenia rdzenia, cewka
   *  wyłączająca i napęd wyłącznika) — zaczepienie linii pomiarowych i linii wyłączania;
   *  nie są portami toru pola. */
  readonly portyWtorne: readonly SymbolPort[];
  /** Odcinki przewodu od zacisku źródła leżącego wewnątrz gabarytu do portu na krawędzi
   *  (z powodem) — przewód, nie geometria elementu QET. */
  readonly doprowadzenia: readonly QetDoprowadzenie[];
  /** Obwiednia rysunku we WSZYSTKICH położeniach noża, przewodów, osprzętu i portów
   *  (względem gabarytu). */
  readonly obrys: QetProstokat;
  /** Obwiednia rysunku APARATU (glifu: `stale` i `noz` we wszystkich położeniach, bez
   *  przewodów i osprzętu) — miara stopnia symbolu (`stopienSymboli` manifestu). */
  readonly glif: QetProstokat;
  /** Jednolity kafel stanu łącznika z nożem (jeden rozmiar dla wszystkich łączników) albo
   *  `null` dla symbolu bez położenia. */
  readonly kafel: QetProstokat | null;
  /** Przewody toru i obwodu wtórnego w gabarycie (kreska przewodu). */
  readonly przewody: readonly CadPrimitive[];
  /** Rysunek aparatu symbolu toru (kreska glifu); łącznik z kaflem stanu — pusty. */
  readonly stale: readonly CadPrimitive[];
  /** Osprzęt łącznika: napęd (atrybut łącznika, kreska glifu). */
  readonly osprzet: readonly CadPrimitive[];
  readonly noz: QetNozSymbolu | null;
  /** Znaczniki rodzaju aparatu przy stykach stałych łącznika (pusta lista — symbol toru). */
  readonly znaczniki: readonly QetZnacznikStyku[];
  /** Symbol uziemienia skierowany w dół (uziemnik, łącznik trójpołożeniowy) albo `null`. */
  readonly ziemia: QetZiemiaSymbolu | null;
  readonly zrodla: readonly QetZrodloSymbolu[];
}

/** Bok JEDNOLITEGO kwadratowego kafla stanu łączników [jednostki świata, skala bazowa LOD2] —
 *  jedna stała manifestu (`kafelStanu.bokQet` × skala); gabaryt każdego łącznika z nożem. */
export const QET_BOK_KAFLA_STANU = 48;

/** Kreska glifu aparatu [jednostki świata, skala bazowa LOD2] — `kafelStanu.kreskaGlifuQet`
 *  × skala, proporcjonalna do boku kafla stanu (bok/24); przewody mają kreskę przewodu. */
export const QET_KRESKA_GLIFU = 2;

/** Znacznik rodzaju aparatu przy styku stałym [jednostki świata, skala bazowa LOD2] —
 *  `kafelStanu.uklad.znacznik` × skala (decyzja właściciela 2026-10-30): `bok` = większy wymiar
 *  znacznika (linia środkowa), `udzial` = dopuszczalny przedział boku / bok kafla, `margines` =
 *  najmniejsza odległość tuszu znacznika od krawędzi kafla, `odstep` = najmniejsza odległość tuszu
 *  znacznika od tuszu noża poza strefą styku, `strefa` = promień strefy styku (wokół punktu, w którym
 *  nóż spoczywa na styku, i wokół przegubu). Kreska znacznika = `QET_KRESKA_GLIFU` (kreska noża). */
export const QET_ZNACZNIK_STYKU = {
  bok: 12,
  udzial: [0.22, 0.28],
  margines: 4,
  odstep: 1,
  strefa: 5,
} as const;

/** Kotwica znacznika względem punktu styku: `srodek` — środek obwiedni znacznika w punkcie styku,
 *  `od_przegubu` — bok obwiedni zwrócony do przegubu w punkcie styku. */
export const QET_KOTWICE_ZNACZNIKOW = { wylacznik: 'srodek', odlacznik: 'od_przegubu', rozlacznik: 'od_przegubu', uziemnik: 'srodek' } as const;

/** Symbol uziemienia łącznika [jednostki świata, skala bazowa LOD2]: szerokość górnej (najszerszej)
 *  kreski i długość pionu odgałęzienia od punktu przyłączenia. */
export const QET_ZIEMIA_KAFLA = { szerokosc: 12, pion: 3 } as const;

/** Odmiana kroju, której metrykami importer liczy obwiednię i środek liter symboli — odmiana
 *  rysowana przez `CadPrimitiveLayer` (waga `WAGA_LITERY_SYMBOLU`, `cad/CadSymbol.tsx`). */
export const QET_ODMIANA_KROJU_LITER = '700';

export const QET_POCHODZENIE = { repozytorium: 'https://github.com/qelectrotech/qelectrotech-elements', commit: '14a4727f70856d8e79de59a353fa3c52d3e90e21', licencja: 'CC-BY-3.0', licencjaUrl: 'https://creativecommons.org/licenses/by/3.0/', autor: 'The QElectroTech team' } as const;

export const QET_SYMBOLE_POLA_SN: Readonly<Record<QetSymbolPolaSnId, QetSymbolPolaSn>> = {
  qetBreaker: {
    id: 'qetBreaker',
    namePl: 'Wyłącznik',
    zlozenie: null,
    szerokosc: 48,
    wysokosc: 48,
    porty: [
      { name: 'top', x: 24, y: 0, dir: 'N' },
      { name: 'bottom', x: 24, y: 48, dir: 'S' },
    ],
    portyWtorne: [
      { name: 'wylacz', x: 48, y: 24, dir: 'E' },
    ],
    doprowadzenia: [],
    obrys: { x: 18, y: 0, width: 30, height: 48 },
    glif: { x: 18, y: 11, width: 20.8492, height: 27 },
    kafel: { x: 0, y: 0, width: 48, height: 48 },
    przewody: [
      { k: 'line', x1: 24, y1: 0, x2: 24, y2: 17 },
      { k: 'line', x1: 24, y1: 38, x2: 24, y2: 48 },
    ],
    stale: [],
    osprzet: [],
    noz: {
      cx: 24,
      cy: 38,
      katy: { open: 45, closed: 0, unknown: 22.5 },
      zasiegi: { open: 1, closed: 1, unknown: 0.6 },
      prymitywy: [
        { k: 'line', x1: 24, y1: 38, x2: 24, y2: 17, nozStanu: true },
      ],
    },
    znaczniki: [
      {
        rodzaj: 'wylacznik',
        styk: 'closed',
        kotwica: { x: 24, y: 17 },
        prymitywy: [
          { k: 'line', x1: 18, y1: 11, x2: 30, y2: 23 },
          { k: 'line', x1: 30, y1: 11, x2: 18, y2: 23 },
        ],
      },
    ],
    ziemia: null,
    zrodla: [
      { sciezka: '10_electric/91_en_60617/en_60617_07/en_60617_07_13/en_60617_07_13_05.elmt', upstreamBlobSha: '8df98b9b5c2783ea2413b406bef53ded66da628a', sha256: 'a0a9a86444b0d4553cce32f9ea7c0397e3a090d493d86c46ac4af6f6115749a4' },
    ],
  },
  qetBreakerZNapedem: {
    id: 'qetBreakerZNapedem',
    namePl: 'Wyłącznik z napędem silnikowym',
    zlozenie: 'element QET en_60617_07_13_05 (wyłącznik: nóż i krzyżyk styku stałego) + en_60617_02_13_26 (napęd silnikowy M) w układzie kafla',
    szerokosc: 48,
    wysokosc: 48,
    porty: [
      { name: 'top', x: 24, y: 0, dir: 'N' },
      { name: 'bottom', x: 24, y: 48, dir: 'S' },
    ],
    portyWtorne: [
      { name: 'wylacz', x: 48, y: 24, dir: 'E' },
    ],
    doprowadzenia: [],
    obrys: { x: 2, y: 0, width: 46, height: 48 },
    glif: { x: 18, y: 11, width: 20.8492, height: 27 },
    kafel: { x: 0, y: 0, width: 48, height: 48 },
    przewody: [
      { k: 'line', x1: 24, y1: 0, x2: 24, y2: 17 },
      { k: 'line', x1: 24, y1: 38, x2: 24, y2: 48 },
    ],
    stale: [],
    osprzet: [
      { k: 'line', x1: 16, y1: 38, x2: 24, y2: 38, kreskowana: true },
      { k: 'circle', cx: 9, cy: 38, r: 7, fill: 'none' },
      { k: 'letter', x: 8.2986, y: 39.2879, t: 'M', size: 8.4 },
    ],
    noz: {
      cx: 24,
      cy: 38,
      katy: { open: 45, closed: 0, unknown: 22.5 },
      zasiegi: { open: 1, closed: 1, unknown: 0.6 },
      prymitywy: [
        { k: 'line', x1: 24, y1: 38, x2: 24, y2: 17, nozStanu: true },
      ],
    },
    znaczniki: [
      {
        rodzaj: 'wylacznik',
        styk: 'closed',
        kotwica: { x: 24, y: 17 },
        prymitywy: [
          { k: 'line', x1: 18, y1: 11, x2: 30, y2: 23 },
          { k: 'line', x1: 30, y1: 11, x2: 18, y2: 23 },
        ],
      },
    ],
    ziemia: null,
    zrodla: [
      { sciezka: '10_electric/91_en_60617/en_60617_07/en_60617_07_13/en_60617_07_13_05.elmt', upstreamBlobSha: '8df98b9b5c2783ea2413b406bef53ded66da628a', sha256: 'a0a9a86444b0d4553cce32f9ea7c0397e3a090d493d86c46ac4af6f6115749a4' },
      { sciezka: '10_electric/91_en_60617/en_60617_02/en_60617_02_13/en_60617_02_13_26.elmt', upstreamBlobSha: '6af19ab8ebe7f4643033d6db0e9dfbbd8a11c2af', sha256: '380e368975529f40340312b3625581f33926712553eabe84836e8bf987ee94c5' },
    ],
  },
  qetDisconnector: {
    id: 'qetDisconnector',
    namePl: 'Odłącznik',
    zlozenie: 'element QET en_60617_07_13_06 (odłącznik: nóż) + okrąg styku odłączającego en_60617_07_13_07 jako znacznik „○” przy styku stałym',
    szerokosc: 48,
    wysokosc: 48,
    porty: [
      { name: 'top', x: 24, y: 0, dir: 'N' },
      { name: 'bottom', x: 24, y: 48, dir: 'S' },
    ],
    portyWtorne: [],
    doprowadzenia: [],
    obrys: { x: 18, y: 0, width: 20.8492, height: 48 },
    glif: { x: 18, y: 5, width: 20.8492, height: 33 },
    kafel: { x: 0, y: 0, width: 48, height: 48 },
    przewody: [
      { k: 'line', x1: 24, y1: 0, x2: 24, y2: 5 },
      { k: 'line', x1: 24, y1: 38, x2: 24, y2: 48 },
    ],
    stale: [],
    osprzet: [],
    noz: {
      cx: 24,
      cy: 38,
      katy: { open: 45, closed: 0, unknown: 22.5 },
      zasiegi: { open: 1, closed: 1, unknown: 0.6 },
      prymitywy: [
        { k: 'line', x1: 24, y1: 38, x2: 24, y2: 17, nozStanu: true },
      ],
    },
    znaczniki: [
      {
        rodzaj: 'odlacznik',
        styk: 'closed',
        kotwica: { x: 24, y: 17 },
        prymitywy: [
          { k: 'circle', cx: 24, cy: 11, r: 6, fill: 'none' },
        ],
      },
    ],
    ziemia: null,
    zrodla: [
      { sciezka: '10_electric/91_en_60617/en_60617_07/en_60617_07_13/en_60617_07_13_06.elmt', upstreamBlobSha: '58a1758ff8fda670013b32a3a2068633223b4e9c', sha256: '0a1a9c5b8092fcffd965065ef857e5a3518163eb35a15ae0b1dbd2be0acac939' },
      { sciezka: '10_electric/91_en_60617/en_60617_07/en_60617_07_13/en_60617_07_13_07.elmt', upstreamBlobSha: 'cee8fc840450295927176ac3b938eeded5f2fcd5', sha256: '4eb501e6d51aad3bd4e43ca545c20b282a04ba9eaa1d997185c3a5404701a53a' },
    ],
  },
  qetLoadBreakSwitch: {
    id: 'qetLoadBreakSwitch',
    namePl: 'Rozłącznik',
    zlozenie: null,
    szerokosc: 48,
    wysokosc: 48,
    porty: [
      { name: 'top', x: 24, y: 0, dir: 'N' },
      { name: 'bottom', x: 24, y: 48, dir: 'S' },
    ],
    portyWtorne: [],
    doprowadzenia: [],
    obrys: { x: 18, y: 0, width: 20.8492, height: 48 },
    glif: { x: 18, y: 10.28, width: 20.8492, height: 27.72 },
    kafel: { x: 0, y: 0, width: 48, height: 48 },
    przewody: [
      { k: 'line', x1: 24, y1: 0, x2: 24, y2: 10.28 },
      { k: 'line', x1: 24, y1: 38, x2: 24, y2: 48 },
    ],
    stale: [],
    osprzet: [],
    noz: {
      cx: 24,
      cy: 38,
      katy: { open: 45, closed: 0, unknown: 22.5 },
      zasiegi: { open: 1, closed: 1, unknown: 0.6 },
      prymitywy: [
        { k: 'line', x1: 24, y1: 38, x2: 24, y2: 17, nozStanu: true },
      ],
    },
    znaczniki: [
      {
        rodzaj: 'rozlacznik',
        styk: 'closed',
        kotwica: { x: 24, y: 17 },
        prymitywy: [
          { k: 'circle', cx: 24, cy: 13.64, r: 3.36, fill: 'none' },
          { k: 'line', x1: 18, y1: 10.28, x2: 30, y2: 10.28 },
        ],
      },
    ],
    ziemia: null,
    zrodla: [
      { sciezka: '10_electric/91_en_60617/en_60617_07/en_60617_07_13/en_60617_07_13_08.elmt', upstreamBlobSha: 'ca96486920218370b3afffb17a0ae8bfe3f6414c', sha256: '4c915a01c21f75b0de97ea4d60091305f8b5d5a72bb0d4d9f609866ee2a16646' },
    ],
  },
  qetFuseSwitch: {
    id: 'qetFuseSwitch',
    namePl: 'Rozłącznik z bezpiecznikami',
    zlozenie: 'element QET en_60617_07_21_09 (rozłącznik z bezpiecznikami: nóż z wkładką bezpiecznikową) + znacznik rozłącznika z elementu en_60617_07_13_08 (kreska styku z okręgiem) — ten sam znacznik co rozłącznik',
    szerokosc: 48,
    wysokosc: 48,
    porty: [
      { name: 'top', x: 24, y: 0, dir: 'N' },
      { name: 'bottom', x: 24, y: 48, dir: 'S' },
    ],
    portyWtorne: [],
    doprowadzenia: [],
    obrys: { x: 18, y: 0, width: 20.8492, height: 48 },
    glif: { x: 18, y: 10.28, width: 20.8492, height: 27.72 },
    kafel: { x: 0, y: 0, width: 48, height: 48 },
    przewody: [
      { k: 'line', x1: 24, y1: 0, x2: 24, y2: 10.28 },
      { k: 'line', x1: 24, y1: 38, x2: 24, y2: 48 },
    ],
    stale: [],
    osprzet: [],
    noz: {
      cx: 24,
      cy: 38,
      katy: { open: 45, closed: 0, unknown: 22.5 },
      zasiegi: { open: 1, closed: 1, unknown: 0.6 },
      prymitywy: [
        { k: 'line', x1: 24, y1: 38, x2: 24, y2: 17, nozStanu: true },
        { k: 'line', x1: 22.0235, y1: 33.3059, x2: 21.7765, y2: 21.6941, nozStanu: true },
        { k: 'line', x1: 25.9765, y1: 21.6941, x2: 26.2235, y2: 33.3059, nozStanu: true },
        { k: 'line', x1: 26.2235, y1: 33.3059, x2: 22.0235, y2: 33.3059, nozStanu: true },
        { k: 'line', x1: 25.9765, y1: 21.6941, x2: 21.7765, y2: 21.6941, nozStanu: true },
      ],
    },
    znaczniki: [
      {
        rodzaj: 'rozlacznik',
        styk: 'closed',
        kotwica: { x: 24, y: 17 },
        prymitywy: [
          { k: 'circle', cx: 24, cy: 13.64, r: 3.36, fill: 'none' },
          { k: 'line', x1: 18, y1: 10.28, x2: 30, y2: 10.28 },
        ],
      },
    ],
    ziemia: null,
    zrodla: [
      { sciezka: '10_electric/91_en_60617/en_60617_07/en_60617_07_21/en_60617_07_21_09.elmt', upstreamBlobSha: '8079d0cde1116a3efa45064a5211b3cbf92ba2e0', sha256: 'ea22ec9ed0b85e21116bb8b8c2a0c42cdff8c789429ab945898ee7be8f45ac29' },
      { sciezka: '10_electric/91_en_60617/en_60617_07/en_60617_07_13/en_60617_07_13_08.elmt', upstreamBlobSha: 'ca96486920218370b3afffb17a0ae8bfe3f6414c', sha256: '4c915a01c21f75b0de97ea4d60091305f8b5d5a72bb0d4d9f609866ee2a16646' },
    ],
  },
  qetEarthSwitch: {
    id: 'qetEarthSwitch',
    namePl: 'Uziemnik',
    zlozenie: 'element HV hv_uziemnik (nóż, kreska styku stałego) + uziemienie en_60617_02_15_01 pod przegubem',
    szerokosc: 48,
    wysokosc: 48,
    porty: [
      { name: 'top', x: 24, y: 0, dir: 'N' },
    ],
    portyWtorne: [],
    doprowadzenia: [],
    obrys: { x: 18, y: 0, width: 25.0919, height: 44 },
    glif: { x: 18, y: 8, width: 25.0919, height: 27 },
    kafel: { x: 0, y: 0, width: 48, height: 48 },
    przewody: [
      { k: 'line', x1: 24, y1: 0, x2: 24, y2: 8 },
    ],
    stale: [],
    osprzet: [],
    noz: {
      cx: 24,
      cy: 35,
      katy: { open: 45, closed: 0, unknown: 22.5 },
      zasiegi: { open: 1, closed: 1, unknown: 0.6 },
      prymitywy: [
        { k: 'line', x1: 24, y1: 8, x2: 24, y2: 35, nozStanu: true },
      ],
    },
    znaczniki: [
      {
        rodzaj: 'uziemnik',
        styk: 'closed',
        kotwica: { x: 24, y: 8 },
        prymitywy: [
          { k: 'line', x1: 18, y1: 8, x2: 30, y2: 8 },
        ],
      },
    ],
    ziemia: {
      kotwica: { x: 24, y: 35 },
      prymitywy: [
        { k: 'line', x1: 24, y1: 35, x2: 24, y2: 38 },
        { k: 'line', x1: 18, y1: 38, x2: 30, y2: 38 },
        { k: 'line', x1: 19.8, y1: 41, x2: 28.2, y2: 41 },
        { k: 'line', x1: 21.6, y1: 44, x2: 26.4, y2: 44 },
      ],
    },
    zrodla: [
      { sciezka: '10_electric/10_allpole/450_high_voltage/interrupteur_sectionneur_de_terre.elmt', upstreamBlobSha: 'addcaa782655cfe3d85a8f285cb48ec02194fee5', sha256: 'c6f1aa6b7d2e925b28df88b4173491022c62e101ce74638308df4a972633bffb' },
      { sciezka: '10_electric/91_en_60617/en_60617_02/en_60617_02_15/en_60617_02_15_01.elmt', upstreamBlobSha: '4c1c408e1e15c304f08c67cb03a5456b941bc614', sha256: '90623920517cb61c0eee48982fffe94b1669e46d16ddf52b9e8dedca88c18061' },
    ],
  },
  qetThreePositionSwitch: {
    id: 'qetThreePositionSwitch',
    namePl: 'Łącznik trójpołożeniowy',
    zlozenie: 'złożenie z elementów QET en_60617_07_13_06 (odłącznik: nóż) + en_60617_07_13_07 (okrąg styku odłączającego — znacznik „○” funkcji odłącznika przy zestyku szynowym) + en_60617_07_13_07 obrócony o −90° (kreska zestyku — znacznik funkcji uziemnika przy zestyku uziemiającym po prawej) + en_60617_02_15_01 (uziemienie w dół pod zestykiem uziemiającym)',
    szerokosc: 48,
    wysokosc: 48,
    porty: [
      { name: 'top', x: 24, y: 0, dir: 'N' },
      { name: 'bottom', x: 24, y: 48, dir: 'S' },
    ],
    portyWtorne: [],
    doprowadzenia: [],
    obrys: { x: 18, y: 0, width: 23, height: 48 },
    glif: { x: 18, y: 5, width: 17, height: 29 },
    kafel: { x: 0, y: 0, width: 48, height: 48 },
    przewody: [
      { k: 'line', x1: 24, y1: 0, x2: 24, y2: 5 },
      { k: 'line', x1: 24, y1: 28, x2: 24, y2: 48 },
    ],
    stale: [],
    osprzet: [],
    noz: {
      cx: 24,
      cy: 28,
      katy: { open: 45, closed: 0, earthed: 90, unknown: 22.5 },
      zasiegi: { open: 1, closed: 1, earthed: 1, unknown: 0.6 },
      prymitywy: [
        { k: 'line', x1: 24, y1: 28, x2: 24, y2: 17, nozStanu: true },
      ],
    },
    znaczniki: [
      {
        rodzaj: 'odlacznik',
        styk: 'closed',
        kotwica: { x: 24, y: 17 },
        prymitywy: [
          { k: 'circle', cx: 24, cy: 11, r: 6, fill: 'none' },
        ],
      },
      {
        rodzaj: 'uziemnik',
        styk: 'earthed',
        kotwica: { x: 35, y: 28 },
        prymitywy: [
          { k: 'line', x1: 35, y1: 34, x2: 35, y2: 22 },
        ],
      },
    ],
    ziemia: {
      kotwica: { x: 35, y: 34 },
      prymitywy: [
        { k: 'line', x1: 35, y1: 34, x2: 35, y2: 37 },
        { k: 'line', x1: 29, y1: 37, x2: 41, y2: 37 },
        { k: 'line', x1: 30.8, y1: 40, x2: 39.2, y2: 40 },
        { k: 'line', x1: 32.6, y1: 43, x2: 37.4, y2: 43 },
      ],
    },
    zrodla: [
      { sciezka: '10_electric/91_en_60617/en_60617_07/en_60617_07_13/en_60617_07_13_06.elmt', upstreamBlobSha: '58a1758ff8fda670013b32a3a2068633223b4e9c', sha256: '0a1a9c5b8092fcffd965065ef857e5a3518163eb35a15ae0b1dbd2be0acac939' },
      { sciezka: '10_electric/91_en_60617/en_60617_07/en_60617_07_13/en_60617_07_13_07.elmt', upstreamBlobSha: 'cee8fc840450295927176ac3b938eeded5f2fcd5', sha256: '4eb501e6d51aad3bd4e43ca545c20b282a04ba9eaa1d997185c3a5404701a53a' },
      { sciezka: '10_electric/91_en_60617/en_60617_07/en_60617_07_13/en_60617_07_13_07.elmt', upstreamBlobSha: 'cee8fc840450295927176ac3b938eeded5f2fcd5', sha256: '4eb501e6d51aad3bd4e43ca545c20b282a04ba9eaa1d997185c3a5404701a53a' },
      { sciezka: '10_electric/91_en_60617/en_60617_02/en_60617_02_15/en_60617_02_15_01.elmt', upstreamBlobSha: '4c1c408e1e15c304f08c67cb03a5456b941bc614', sha256: '90623920517cb61c0eee48982fffe94b1669e46d16ddf52b9e8dedca88c18061' },
    ],
  },
  qetThreePositionSwitchZNapedem: {
    id: 'qetThreePositionSwitchZNapedem',
    namePl: 'Łącznik trójpołożeniowy z napędem zasobnikowym',
    zlozenie: 'złożenie z elementów QET en_60617_07_13_06 (odłącznik: nóż) + en_60617_07_13_07 (okrąg styku odłączającego — znacznik „○” funkcji odłącznika przy zestyku szynowym) + en_60617_07_13_07 obrócony o −90° (kreska zestyku — znacznik funkcji uziemnika przy zestyku uziemiającym po prawej) + en_60617_02_15_01 (uziemienie w dół pod zestykiem uziemiającym) + en_60617_02_13_20 (napęd energią zmagazynowaną) i en_60617_02_13_01 (napęd ręczny) po lewej stronie osi',
    szerokosc: 48,
    wysokosc: 48,
    porty: [
      { name: 'top', x: 24, y: 0, dir: 'N' },
      { name: 'bottom', x: 24, y: 48, dir: 'S' },
    ],
    portyWtorne: [],
    doprowadzenia: [],
    obrys: { x: 8, y: 0, width: 33, height: 48 },
    glif: { x: 18, y: 5, width: 17, height: 29 },
    kafel: { x: 0, y: 0, width: 48, height: 48 },
    przewody: [
      { k: 'line', x1: 24, y1: 0, x2: 24, y2: 5 },
      { k: 'line', x1: 24, y1: 28, x2: 24, y2: 48 },
    ],
    stale: [],
    osprzet: [
      { k: 'path', d: 'M 8 24 L 16 24 L 16 32 L 8 32 Z', fill: 'none' },
      { k: 'line', x1: 16, y1: 28, x2: 24, y2: 28, kreskowana: true },
      { k: 'line', x1: 12, y1: 41, x2: 12, y2: 32, kreskowana: true },
      { k: 'line', x1: 10.5, y1: 41, x2: 13.5, y2: 41 },
    ],
    noz: {
      cx: 24,
      cy: 28,
      katy: { open: 45, closed: 0, earthed: 90, unknown: 22.5 },
      zasiegi: { open: 1, closed: 1, earthed: 1, unknown: 0.6 },
      prymitywy: [
        { k: 'line', x1: 24, y1: 28, x2: 24, y2: 17, nozStanu: true },
      ],
    },
    znaczniki: [
      {
        rodzaj: 'odlacznik',
        styk: 'closed',
        kotwica: { x: 24, y: 17 },
        prymitywy: [
          { k: 'circle', cx: 24, cy: 11, r: 6, fill: 'none' },
        ],
      },
      {
        rodzaj: 'uziemnik',
        styk: 'earthed',
        kotwica: { x: 35, y: 28 },
        prymitywy: [
          { k: 'line', x1: 35, y1: 34, x2: 35, y2: 22 },
        ],
      },
    ],
    ziemia: {
      kotwica: { x: 35, y: 34 },
      prymitywy: [
        { k: 'line', x1: 35, y1: 34, x2: 35, y2: 37 },
        { k: 'line', x1: 29, y1: 37, x2: 41, y2: 37 },
        { k: 'line', x1: 30.8, y1: 40, x2: 39.2, y2: 40 },
        { k: 'line', x1: 32.6, y1: 43, x2: 37.4, y2: 43 },
      ],
    },
    zrodla: [
      { sciezka: '10_electric/91_en_60617/en_60617_07/en_60617_07_13/en_60617_07_13_06.elmt', upstreamBlobSha: '58a1758ff8fda670013b32a3a2068633223b4e9c', sha256: '0a1a9c5b8092fcffd965065ef857e5a3518163eb35a15ae0b1dbd2be0acac939' },
      { sciezka: '10_electric/91_en_60617/en_60617_07/en_60617_07_13/en_60617_07_13_07.elmt', upstreamBlobSha: 'cee8fc840450295927176ac3b938eeded5f2fcd5', sha256: '4eb501e6d51aad3bd4e43ca545c20b282a04ba9eaa1d997185c3a5404701a53a' },
      { sciezka: '10_electric/91_en_60617/en_60617_07/en_60617_07_13/en_60617_07_13_07.elmt', upstreamBlobSha: 'cee8fc840450295927176ac3b938eeded5f2fcd5', sha256: '4eb501e6d51aad3bd4e43ca545c20b282a04ba9eaa1d997185c3a5404701a53a' },
      { sciezka: '10_electric/91_en_60617/en_60617_02/en_60617_02_15/en_60617_02_15_01.elmt', upstreamBlobSha: '4c1c408e1e15c304f08c67cb03a5456b941bc614', sha256: '90623920517cb61c0eee48982fffe94b1669e46d16ddf52b9e8dedca88c18061' },
      { sciezka: '10_electric/91_en_60617/en_60617_02/en_60617_02_13/en_60617_02_13_20.elmt', upstreamBlobSha: '2f5f838b2563c4aacb697a370ed99f5f946f5a71', sha256: '3d6b970baee6dccc23fa5a951387da2586435d9bc9d3eb1f6bc87ef553d60823' },
      { sciezka: '10_electric/91_en_60617/en_60617_02/en_60617_02_13/en_60617_02_13_01.elmt', upstreamBlobSha: 'cd510c0dc8025bcb2f83be90c9bde092119bcac2', sha256: 'b5ae20d2e5a7fb08d4654909679bb6bf194eb1ad26475a497169eef9d80cb09b' },
    ],
  },
  qetCurrentTransformer: {
    id: 'qetCurrentTransformer',
    namePl: 'Przekładnik prądowy',
    zlozenie: null,
    szerokosc: 48,
    wysokosc: 24,
    porty: [
      { name: 'top', x: 24, y: 0, dir: 'N' },
      { name: 'bottom', x: 24, y: 24, dir: 'S' },
    ],
    portyWtorne: [
      { name: 'wtorny', x: 48, y: 16, dir: 'E' },
    ],
    doprowadzenia: [
      { port: 'wtorny', x1: 48, y1: 12, x2: 48, y2: 16, powod: 'doprowadzenie rdzenia leży między rastrami zacisków — przedłużenie przewodu obwodu wtórnego do najbliższego rastru schematu w dół, skąd biegnie linia pomiarowa' },
    ],
    obrys: { x: 12, y: 0, width: 36, height: 24 },
    glif: { x: 12, y: 0, width: 34, height: 24 },
    kafel: null,
    przewody: [
      { k: 'line', x1: 24, y1: 0, x2: 24, y2: 24 },
      { k: 'line', x1: 36, y1: 12, x2: 48, y2: 12 },
      { k: 'line', x1: 48, y1: 12, x2: 48, y2: 16 },
    ],
    stale: [
      { k: 'circle', cx: 24, cy: 12, r: 12, fill: 'none' },
      { k: 'line', x1: 40, y1: 16, x2: 44, y2: 8 },
      { k: 'line', x1: 42, y1: 16, x2: 46, y2: 8 },
    ],
    osprzet: [],
    noz: null,
    znaczniki: [],
    ziemia: null,
    zrodla: [
      { sciezka: '10_electric/91_en_60617/en_60617_06/en_60617_06_09/en_60617_06_09_10.elmt', upstreamBlobSha: '37de2decfe2a496cd014a1dd411a5e8d52e990ca', sha256: '6d503d4d18bd0e56180c2746bc5cecc64b3d8459a19560c248e0f2fd7b3ad04b' },
    ],
  },
  qetCoreBalanceCt: {
    id: 'qetCoreBalanceCt',
    namePl: 'Przekładnik Ferrantiego',
    zlozenie: null,
    szerokosc: 64,
    wysokosc: 32,
    porty: [
      { name: 'top', x: 32, y: 0, dir: 'N' },
      { name: 'bottom', x: 32, y: 32, dir: 'S' },
    ],
    portyWtorne: [
      { name: 'wtorny', x: 64, y: 16, dir: 'E' },
    ],
    doprowadzenia: [],
    obrys: { x: 16.8, y: 0, width: 47.2, height: 32 },
    glif: { x: 16.8, y: 1.6, width: 43, height: 30.4 },
    kafel: null,
    przewody: [
      { k: 'line', x1: 32, y1: 0, x2: 32, y2: 32 },
      { k: 'line', x1: 47.2, y1: 16, x2: 64, y2: 16 },
    ],
    stale: [
      { k: 'circle', cx: 32, cy: 16.8, r: 15.2, fill: 'none' },
      { k: 'line', x1: 28, y1: 20, x2: 36, y2: 12 },
      { k: 'letter', x: 38.2246, y: 17.7955, t: '3', size: 8 },
      { k: 'line', x1: 53.5, y1: 20.2, x2: 57.7, y2: 11.8 },
      { k: 'line', x1: 55.6, y1: 20.2, x2: 59.8, y2: 11.8 },
    ],
    osprzet: [],
    noz: null,
    znaczniki: [],
    ziemia: null,
    zrodla: [
      { sciezka: '10_electric/91_en_60617/en_60617_06/en_60617_06_13/en_60617_06_13_10.elmt', upstreamBlobSha: '4742b0a5097196c28ac3c07e30ce427a95a36ad2', sha256: 'aa682e01f0d11a98eb7b2d6e75fbc86060f03ace910bca1de13f37e134cabd9c' },
    ],
  },
  qetVoltageTransformer: {
    id: 'qetVoltageTransformer',
    namePl: 'Przekładnik napięciowy',
    zlozenie: null,
    szerokosc: 16,
    wysokosc: 40,
    porty: [
      { name: 'top', x: 8, y: 0, dir: 'N' },
    ],
    portyWtorne: [
      { name: 'wtorny', x: 8, y: 40, dir: 'S' },
    ],
    doprowadzenia: [
      { port: 'wtorny', x1: 8, y1: 36.4, x2: 8, y2: 40, powod: 'zacisk wtórny źródła leży między rastrami zacisków — przedłużenie przewodu obwodu wtórnego do najbliższego rastru schematu w dół, skąd biegnie linia pomiarowa' },
    ],
    obrys: { x: 0, y: 0, width: 16, height: 40 },
    glif: { x: 0, y: 0.4, width: 16, height: 27.6 },
    kafel: null,
    przewody: [
      { k: 'line', x1: 7.948, y1: 28.4, x2: 7.948, y2: 36.4 },
      { k: 'line', x1: 8, y1: 36.4, x2: 8, y2: 40 },
    ],
    stale: [
      { k: 'circle', cx: 8, cy: 8.4, r: 8, fill: 'none' },
      { k: 'circle', cx: 8, cy: 20, r: 8, fill: 'none' },
    ],
    osprzet: [],
    noz: null,
    znaczniki: [],
    ziemia: null,
    zrodla: [
      { sciezka: '10_electric/91_en_60617/en_60617_06/en_60617_06_13/en_60617_06_13_01A.elmt', upstreamBlobSha: 'a883a2e6daec80c241594505c96295c917884adc', sha256: '465d743960ead5eec0f57d26618a67a44747c7d3b6233bfb5e038c614f08235b' },
    ],
  },
  qetVoltageTransformer2: {
    id: 'qetVoltageTransformer2',
    namePl: 'Przekładnik napięciowy o dwóch uzwojeniach wtórnych',
    zlozenie: 'złożenie z dwóch kopii elementu QET en_60617_06_13_01A: kopia bazowa (uzwojenie pierwotne i pierwsze wtórne) + kopia obrócona o 90° przesunięta tak, by jej okręgi stanęły symetrycznie po bokach osi (trzy okręgi: pierwotne u góry, wtórne u dołu i z prawej)',
    szerokosc: 32,
    wysokosc: 40,
    porty: [
      { name: 'top', x: 16, y: 0, dir: 'N' },
    ],
    portyWtorne: [
      { name: 'wtorny', x: 16, y: 40, dir: 'S' },
    ],
    doprowadzenia: [
      { port: 'wtorny', x1: 16, y1: 36.4, x2: 16, y2: 40, powod: 'zacisk wtórny źródła leży między rastrami zacisków — przedłużenie przewodu obwodu wtórnego do najbliższego rastru schematu w dół, skąd biegnie linia pomiarowa' },
    ],
    obrys: { x: 8, y: 0, width: 21.8, height: 40 },
    glif: { x: 8, y: 0.4, width: 21.8, height: 27.6 },
    kafel: null,
    przewody: [
      { k: 'line', x1: 15.948, y1: 28.4, x2: 15.948, y2: 36.4 },
      { k: 'line', x1: 16, y1: 36.4, x2: 16, y2: 40 },
    ],
    stale: [
      { k: 'circle', cx: 16, cy: 8.4, r: 8, fill: 'none' },
      { k: 'circle', cx: 16, cy: 20, r: 8, fill: 'none' },
      { k: 'circle', cx: 21.8, cy: 14.2, r: 8, fill: 'none' },
    ],
    osprzet: [],
    noz: null,
    znaczniki: [],
    ziemia: null,
    zrodla: [
      { sciezka: '10_electric/91_en_60617/en_60617_06/en_60617_06_13/en_60617_06_13_01A.elmt', upstreamBlobSha: 'a883a2e6daec80c241594505c96295c917884adc', sha256: '465d743960ead5eec0f57d26618a67a44747c7d3b6233bfb5e038c614f08235b' },
      { sciezka: '10_electric/91_en_60617/en_60617_06/en_60617_06_13/en_60617_06_13_01A.elmt', upstreamBlobSha: 'a883a2e6daec80c241594505c96295c917884adc', sha256: '465d743960ead5eec0f57d26618a67a44747c7d3b6233bfb5e038c614f08235b' },
    ],
  },
  qetVoltageTransformer3: {
    id: 'qetVoltageTransformer3',
    namePl: 'Przekładnik napięciowy o trzech uzwojeniach wtórnych',
    zlozenie: 'złożenie z dwóch kopii elementu QET en_60617_06_13_01A: kopia bazowa (uzwojenie pierwotne i pierwsze wtórne) + kopia obrócona o 90° przesunięta tak, by jej okręgi stanęły symetrycznie po bokach osi (cztery okręgi w romb: pierwotne u góry, wtórne u dołu, z lewej i z prawej — jak na schemacie ENEA Zeszyt 1, Z.11.1)',
    szerokosc: 32,
    wysokosc: 40,
    porty: [
      { name: 'top', x: 16, y: 0, dir: 'N' },
    ],
    portyWtorne: [
      { name: 'wtorny', x: 16, y: 40, dir: 'S' },
    ],
    doprowadzenia: [
      { port: 'wtorny', x1: 16, y1: 36.4, x2: 16, y2: 40, powod: 'zacisk wtórny źródła leży między rastrami zacisków — przedłużenie przewodu obwodu wtórnego do najbliższego rastru schematu w dół, skąd biegnie linia pomiarowa' },
    ],
    obrys: { x: 2.2, y: 0, width: 27.6, height: 40 },
    glif: { x: 2.2, y: 0.4, width: 27.6, height: 27.6 },
    kafel: null,
    przewody: [
      { k: 'line', x1: 15.948, y1: 28.4, x2: 15.948, y2: 36.4 },
      { k: 'line', x1: 16, y1: 36.4, x2: 16, y2: 40 },
    ],
    stale: [
      { k: 'circle', cx: 16, cy: 8.4, r: 8, fill: 'none' },
      { k: 'circle', cx: 16, cy: 20, r: 8, fill: 'none' },
      { k: 'circle', cx: 21.8, cy: 14.2, r: 8, fill: 'none' },
      { k: 'circle', cx: 10.2, cy: 14.2, r: 8, fill: 'none' },
    ],
    osprzet: [],
    noz: null,
    znaczniki: [],
    ziemia: null,
    zrodla: [
      { sciezka: '10_electric/91_en_60617/en_60617_06/en_60617_06_13/en_60617_06_13_01A.elmt', upstreamBlobSha: 'a883a2e6daec80c241594505c96295c917884adc', sha256: '465d743960ead5eec0f57d26618a67a44747c7d3b6233bfb5e038c614f08235b' },
      { sciezka: '10_electric/91_en_60617/en_60617_06/en_60617_06_13/en_60617_06_13_01A.elmt', upstreamBlobSha: 'a883a2e6daec80c241594505c96295c917884adc', sha256: '465d743960ead5eec0f57d26618a67a44747c7d3b6233bfb5e038c614f08235b' },
    ],
  },
  qetCableHead: {
    id: 'qetCableHead',
    namePl: 'Głowica kablowa',
    zlozenie: null,
    szerokosc: 16,
    wysokosc: 24,
    porty: [
      { name: 'top', x: 8, y: 0, dir: 'N' },
      { name: 'bottom', x: 8, y: 24, dir: 'S' },
    ],
    portyWtorne: [],
    doprowadzenia: [],
    obrys: { x: 4, y: 0, width: 8, height: 24 },
    glif: { x: 4, y: 0, width: 8, height: 20 },
    kafel: null,
    przewody: [
      { k: 'line', x1: 8, y1: 20.8, x2: 8, y2: 24 },
    ],
    stale: [
      { k: 'path', d: 'M 5.6 16 L 5.6 0 L 10.4 0 L 10.4 16 Z', fill: 'ink' },
      { k: 'arc', d: 'M 4 16 A 4 4 0 0 0 12 16' },
    ],
    osprzet: [],
    noz: null,
    znaczniki: [],
    ziemia: null,
    zrodla: [
      { sciezka: '10_electric/91_en_60617/en_60617_03/en_60617_03_03/en_60617_03_03_05.elmt', upstreamBlobSha: '93d917ff316a374b81696b92ddf91501d4da2b49', sha256: '1e2924d7d302763cbafd0808721245d3bbba236070def150ad6045b91b0f6574' },
    ],
  },
  qetVoltageIndicator: {
    id: 'qetVoltageIndicator',
    namePl: 'Pojemnościowy wskaźnik napięcia',
    zlozenie: null,
    szerokosc: 48,
    wysokosc: 16,
    porty: [
      { name: 'top', x: 24, y: 0, dir: 'N' },
      { name: 'bottom', x: 24, y: 16, dir: 'S' },
    ],
    portyWtorne: [],
    doprowadzenia: [],
    obrys: { x: 0, y: 0, width: 24, height: 16 },
    glif: { x: 0, y: 0, width: 24, height: 16 },
    kafel: null,
    przewody: [
      { k: 'line', x1: 24, y1: 0, x2: 24, y2: 16 },
    ],
    stale: [
      { k: 'line', x1: 24, y1: 8, x2: 16, y2: 8 },
      { k: 'line', x1: 16, y1: 0, x2: 16, y2: 16 },
      { k: 'line', x1: 13.2, y1: 0, x2: 13.2, y2: 16 },
      { k: 'line', x1: 8, y1: 8, x2: 12.8, y2: 8 },
      { k: 'arc', d: 'M 0 16 A 8 8 0 0 0 0 0' },
    ],
    osprzet: [],
    noz: null,
    znaczniki: [],
    ziemia: null,
    zrodla: [
      { sciezka: '10_electric/10_allpole/450_high_voltage/signal_capacitif.elmt', upstreamBlobSha: 'fa4f0d85eabef67c8dfcf4cd102fdba3bc7c91d4', sha256: '652e3adf083d3d3379fd71abc6ede79b095d5f03bde319a88b30046fdb26875e' },
    ],
  },
  bayReserve: {
    id: 'bayReserve',
    namePl: 'Koniec kabla niepodłączony',
    zlozenie: null,
    szerokosc: 16,
    wysokosc: 32,
    porty: [
      { name: 'top', x: 8, y: 0, dir: 'N' },
    ],
    portyWtorne: [],
    doprowadzenia: [],
    obrys: { x: 8, y: 0, width: 8, height: 32 },
    glif: { x: 8, y: 0, width: 8, height: 32 },
    kafel: null,
    przewody: [],
    stale: [
      { k: 'line', x1: 8, y1: 0, x2: 8, y2: 28 },
      { k: 'arc', d: 'M 8 28 A 4 4 0 0 0 16 28' },
    ],
    osprzet: [],
    noz: null,
    znaczniki: [],
    ziemia: null,
    zrodla: [
      { sciezka: '10_electric/91_en_60617/en_60617_03/en_60617_03_01/en_60617_03_01_14.elmt', upstreamBlobSha: '0b62c546b2fc8651ae8c8d75cab73e657e9effc6', sha256: 'efbd93c234ca3e7e37f39db946ce13237165a1ccdd471149ea01368e1779c416' },
    ],
  },
};
