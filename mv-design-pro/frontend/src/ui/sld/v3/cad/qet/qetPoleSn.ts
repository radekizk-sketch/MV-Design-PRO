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
 * Rysunek źródła = położenie OTWARTE; pozostałe położenia — kąty obrotu noża (`noz.katy`,
 * stopnie, konwencja SVG `rotate`) wokół przegubu (`noz.cx`, `noz.cy`). Jednokładność rysunku
 * (`skalaRysunku` manifestu) przenosi kształt elementu bez zmian; role prymitywów: `przewody`
 * (kreska przewodu toru), `stale` i `noz` (rysunek aparatu — kreska glifu `QET_KRESKA_GLIFU`),
 * `osprzet` (napęd, cewka wyłączająca — kreska glifu).
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
  /** Rysunek aparatu poza nożem (kreska glifu). */
  readonly stale: readonly CadPrimitive[];
  /** Osprzęt łącznika: napęd silnikowy, cewka wyłączająca (kreska glifu). */
  readonly osprzet: readonly CadPrimitive[];
  readonly noz: QetNozSymbolu | null;
  readonly zrodla: readonly QetZrodloSymbolu[];
}

/** Bok JEDNOLITEGO kwadratowego kafla stanu łączników [jednostki świata, skala bazowa LOD2] —
 *  jedna stała manifestu (`kafelStanu.bokQet` × skala); gabaryt każdego łącznika z nożem. */
export const QET_BOK_KAFLA_STANU = 48;

/** Kreska glifu aparatu [jednostki świata, skala bazowa LOD2] — `kafelStanu.kreskaGlifuQet`
 *  × skala, proporcjonalna do boku kafla stanu (bok/24); przewody mają kreskę przewodu. */
export const QET_KRESKA_GLIFU = 2;

export const QET_POCHODZENIE = { repozytorium: 'https://github.com/qelectrotech/qelectrotech-elements', commit: '14a4727f70856d8e79de59a353fa3c52d3e90e21', licencja: 'CC-BY-3.0', licencjaUrl: 'https://creativecommons.org/licenses/by/3.0/', autor: 'The QElectroTech team' } as const;

export const QET_SYMBOLE_POLA_SN: Readonly<Record<QetSymbolPolaSnId, QetSymbolPolaSn>> = {
  qetBreaker: {
    id: 'qetBreaker',
    namePl: 'Wyłącznik',
    zlozenie: 'złożenie z elementów QET en_60617_07_13_05 (wyłącznik) + en_60617_07_15_01 (cewka wyłączająca) — cewka po prawej stronie osi, zacisk sterujący na prawej krawędzi kafla',
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
    obrys: { x: 14.4, y: 0, width: 33.6, height: 48 },
    glif: { x: 14.4, y: 10.7781, width: 14.4, height: 29.2219 },
    kafel: { x: 0, y: 0, width: 48, height: 48 },
    przewody: [
      { k: 'line', x1: 24, y1: 16, x2: 24, y2: 0 },
      { k: 'line', x1: 24, y1: 40, x2: 24, y2: 48 },
      { k: 'line', x1: 48, y1: 24, x2: 44, y2: 24 },
    ],
    stale: [
      { k: 'line', x1: 19.2, y1: 11.2, x2: 28.8, y2: 20.8 },
      { k: 'line', x1: 28.8, y1: 11.2, x2: 19.2, y2: 20.8 },
    ],
    osprzet: [
      { k: 'path', d: 'M 44 16 L 44 32 L 36 32 L 36 16 Z', fill: 'none' },
    ],
    noz: {
      cx: 24,
      cy: 40,
      katy: { open: 0, closed: 19.179, unknown: 9.5895 },
      prymitywy: [
        { k: 'line', x1: 24, y1: 40, x2: 14.4, y2: 12.4, nozStanu: true },
      ],
    },
    zrodla: [
      { sciezka: '10_electric/91_en_60617/en_60617_07/en_60617_07_13/en_60617_07_13_05.elmt', upstreamBlobSha: '8df98b9b5c2783ea2413b406bef53ded66da628a', sha256: 'a0a9a86444b0d4553cce32f9ea7c0397e3a090d493d86c46ac4af6f6115749a4' },
      { sciezka: '10_electric/91_en_60617/en_60617_07/en_60617_07_15/en_60617_07_15_01.elmt', upstreamBlobSha: '23118a6a8946dda5c1e996ee3ebaa58dac883b57', sha256: '58cac65d52590eb5931ebd395a5eeaaef8f9c9d43406db8e39421baaa8580d81' },
    ],
  },
  qetBreakerZNapedem: {
    id: 'qetBreakerZNapedem',
    namePl: 'Wyłącznik z napędem silnikowym',
    zlozenie: 'złożenie z elementów QET en_60617_07_13_05 (wyłącznik) + en_60617_02_13_26 (napęd silnikowy) + en_60617_07_15_01 (cewka wyłączająca) — linia sprzężenia mechanicznego napędu (kreskowana) zaczepiona w przegubie styku ruchomego, cewka po prawej stronie osi',
    szerokosc: 48,
    wysokosc: 48,
    porty: [
      { name: 'top', x: 24, y: 0, dir: 'N' },
      { name: 'bottom', x: 24, y: 48, dir: 'S' },
    ],
    portyWtorne: [
      { name: 'wylacz', x: 48, y: 16, dir: 'E' },
    ],
    doprowadzenia: [],
    obrys: { x: 2, y: 0, width: 46, height: 48 },
    glif: { x: 14.4, y: 2.7781, width: 14.4, height: 29.2219 },
    kafel: { x: 0, y: 0, width: 48, height: 48 },
    przewody: [
      { k: 'line', x1: 24, y1: 8, x2: 24, y2: 0 },
      { k: 'line', x1: 24, y1: 32, x2: 24, y2: 48 },
      { k: 'line', x1: 48, y1: 16, x2: 44, y2: 16 },
    ],
    stale: [
      { k: 'line', x1: 19.2, y1: 3.2, x2: 28.8, y2: 12.8 },
      { k: 'line', x1: 28.8, y1: 3.2, x2: 19.2, y2: 12.8 },
    ],
    osprzet: [
      { k: 'line', x1: 16, y1: 32, x2: 24, y2: 32, kreskowana: true },
      { k: 'circle', cx: 9, cy: 32, r: 7, fill: 'none' },
      { k: 'letter', x: 8.2986, y: 33.26, t: 'M', size: 8.4 },
      { k: 'path', d: 'M 44 8 L 44 24 L 36 24 L 36 8 Z', fill: 'none' },
    ],
    noz: {
      cx: 24,
      cy: 32,
      katy: { open: 0, closed: 19.179, unknown: 9.5895 },
      prymitywy: [
        { k: 'line', x1: 24, y1: 32, x2: 14.4, y2: 4.4, nozStanu: true },
      ],
    },
    zrodla: [
      { sciezka: '10_electric/91_en_60617/en_60617_07/en_60617_07_13/en_60617_07_13_05.elmt', upstreamBlobSha: '8df98b9b5c2783ea2413b406bef53ded66da628a', sha256: 'a0a9a86444b0d4553cce32f9ea7c0397e3a090d493d86c46ac4af6f6115749a4' },
      { sciezka: '10_electric/91_en_60617/en_60617_02/en_60617_02_13/en_60617_02_13_26.elmt', upstreamBlobSha: '6af19ab8ebe7f4643033d6db0e9dfbbd8a11c2af', sha256: '380e368975529f40340312b3625581f33926712553eabe84836e8bf987ee94c5' },
      { sciezka: '10_electric/91_en_60617/en_60617_07/en_60617_07_15/en_60617_07_15_01.elmt', upstreamBlobSha: '23118a6a8946dda5c1e996ee3ebaa58dac883b57', sha256: '58cac65d52590eb5931ebd395a5eeaaef8f9c9d43406db8e39421baaa8580d81' },
    ],
  },
  qetDisconnector: {
    id: 'qetDisconnector',
    namePl: 'Odłącznik',
    zlozenie: null,
    szerokosc: 48,
    wysokosc: 48,
    porty: [
      { name: 'top', x: 24, y: 0, dir: 'N' },
      { name: 'bottom', x: 24, y: 48, dir: 'S' },
    ],
    portyWtorne: [],
    doprowadzenia: [],
    obrys: { x: 14.4, y: 0, width: 16.8, height: 48 },
    glif: { x: 14.4, y: 10.7781, width: 16.8, height: 29.2219 },
    kafel: { x: 0, y: 0, width: 48, height: 48 },
    przewody: [
      { k: 'line', x1: 24, y1: 16, x2: 24, y2: 0 },
      { k: 'line', x1: 24, y1: 40, x2: 24, y2: 48 },
    ],
    stale: [
      { k: 'line', x1: 16.8, y1: 16, x2: 31.2, y2: 16 },
    ],
    osprzet: [],
    noz: {
      cx: 24,
      cy: 40,
      katy: { open: 0, closed: 19.179, unknown: 9.5895 },
      prymitywy: [
        { k: 'line', x1: 24, y1: 40, x2: 14.4, y2: 12.4, nozStanu: true },
      ],
    },
    zrodla: [
      { sciezka: '10_electric/91_en_60617/en_60617_07/en_60617_07_13/en_60617_07_13_06.elmt', upstreamBlobSha: '58a1758ff8fda670013b32a3a2068633223b4e9c', sha256: '0a1a9c5b8092fcffd965065ef857e5a3518163eb35a15ae0b1dbd2be0acac939' },
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
    obrys: { x: 14.4, y: 0, width: 14.4, height: 48 },
    glif: { x: 14.4, y: 10.7781, width: 14.4, height: 29.2219 },
    kafel: { x: 0, y: 0, width: 48, height: 48 },
    przewody: [
      { k: 'line', x1: 24, y1: 11.2, x2: 24, y2: 0 },
      { k: 'line', x1: 24, y1: 40, x2: 24, y2: 48 },
    ],
    stale: [
      { k: 'circle', cx: 24, cy: 16, r: 4.8, fill: 'none' },
      { k: 'line', x1: 19.2, y1: 11.2, x2: 28.8, y2: 11.2 },
    ],
    osprzet: [],
    noz: {
      cx: 24,
      cy: 40,
      katy: { open: 0, closed: 19.179, unknown: 9.5895 },
      prymitywy: [
        { k: 'line', x1: 24, y1: 40, x2: 14.4, y2: 12.4, nozStanu: true },
      ],
    },
    zrodla: [
      { sciezka: '10_electric/91_en_60617/en_60617_07/en_60617_07_13/en_60617_07_13_08.elmt', upstreamBlobSha: 'ca96486920218370b3afffb17a0ae8bfe3f6414c', sha256: '4c915a01c21f75b0de97ea4d60091305f8b5d5a72bb0d4d9f609866ee2a16646' },
    ],
  },
  qetFuseSwitch: {
    id: 'qetFuseSwitch',
    namePl: 'Rozłącznik z bezpiecznikami',
    zlozenie: null,
    szerokosc: 48,
    wysokosc: 48,
    porty: [
      { name: 'top', x: 24, y: 0, dir: 'N' },
      { name: 'bottom', x: 24, y: 48, dir: 'S' },
    ],
    portyWtorne: [],
    doprowadzenia: [],
    obrys: { x: 16.8, y: 0, width: 12, height: 48 },
    glif: { x: 16.8, y: 12.4, width: 12, height: 27.6 },
    kafel: { x: 0, y: 0, width: 48, height: 48 },
    przewody: [
      { k: 'line', x1: 24, y1: 48, x2: 24, y2: 40 },
      { k: 'line', x1: 24, y1: 12.4, x2: 24, y2: 0 },
    ],
    stale: [
      { k: 'circle', cx: 24, cy: 17.2, r: 2.4, fill: 'none' },
      { k: 'line', x1: 19.2, y1: 12.4, x2: 28.8, y2: 12.4 },
    ],
    osprzet: [],
    noz: {
      cx: 24,
      cy: 40,
      katy: { open: 0, closed: 14.0362, unknown: 7.0181 },
      prymitywy: [
        { k: 'line', x1: 24, y1: 40, x2: 18, y2: 16, nozStanu: true },
        { k: 'line', x1: 20.4, y1: 35.2, x2: 16.8, y2: 22, nozStanu: true },
        { k: 'line', x1: 21.6, y1: 20.8, x2: 25.2, y2: 34, nozStanu: true },
        { k: 'line', x1: 25.2, y1: 34, x2: 20.4, y2: 35.2, nozStanu: true },
        { k: 'line', x1: 21.6, y1: 20.8, x2: 16.8, y2: 22, nozStanu: true },
      ],
    },
    zrodla: [
      { sciezka: '10_electric/91_en_60617/en_60617_07/en_60617_07_21/en_60617_07_21_09.elmt', upstreamBlobSha: '8079d0cde1116a3efa45064a5211b3cbf92ba2e0', sha256: 'ea22ec9ed0b85e21116bb8b8c2a0c42cdff8c789429ab945898ee7be8f45ac29' },
    ],
  },
  qetEarthSwitch: {
    id: 'qetEarthSwitch',
    namePl: 'Uziemnik',
    zlozenie: null,
    szerokosc: 48,
    wysokosc: 48,
    porty: [
      { name: 'top', x: 24, y: 0, dir: 'N' },
    ],
    portyWtorne: [],
    doprowadzenia: [],
    obrys: { x: 16, y: 0, width: 16, height: 38 },
    glif: { x: 16, y: 10, width: 16, height: 28 },
    kafel: { x: 0, y: 0, width: 48, height: 48 },
    przewody: [
      { k: 'line', x1: 24, y1: 0, x2: 24, y2: 10 },
    ],
    stale: [
      { k: 'line', x1: 22, y1: 38, x2: 26, y2: 38 },
      { k: 'line', x1: 19, y1: 34, x2: 29, y2: 34 },
      { k: 'line', x1: 32, y1: 30, x2: 16, y2: 30 },
      { k: 'line', x1: 20, y1: 10, x2: 28, y2: 10 },
      { k: 'line', x1: 24, y1: 20, x2: 24, y2: 30 },
    ],
    osprzet: [],
    noz: {
      cx: 24,
      cy: 20,
      katy: { open: 0, closed: 25.2011, unknown: 12.6006 },
      prymitywy: [
        { k: 'line', x1: 20, y1: 11.5, x2: 24, y2: 20, nozStanu: true },
      ],
    },
    zrodla: [
      { sciezka: '10_electric/10_allpole/450_high_voltage/interrupteur_sectionneur_de_terre.elmt', upstreamBlobSha: 'addcaa782655cfe3d85a8f285cb48ec02194fee5', sha256: 'c6f1aa6b7d2e925b28df88b4173491022c62e101ce74638308df4a972633bffb' },
    ],
  },
  qetThreePositionSwitch: {
    id: 'qetThreePositionSwitch',
    namePl: 'Łącznik trójpołożeniowy',
    zlozenie: 'złożenie z elementów QET en_60617_07_13_07 (odłącznik dwukierunkowy) + en_60617_02_15_01 (uziemienie) nad zestykiem prawym',
    szerokosc: 48,
    wysokosc: 48,
    porty: [
      { name: 'top', x: 16, y: 0, dir: 'N' },
      { name: 'bottom', x: 24, y: 48, dir: 'S' },
    ],
    portyWtorne: [],
    doprowadzenia: [
      { port: 'top', x1: 16, y1: 24, x2: 16, y2: 0, powod: 'zacisk szynowy QET leży 60 jednostek QET pod górną krawędzią kafla stanu, bo symbol uziemienia nad zestykiem uziemiającym sięga 30 jednostek nad poziom zacisków — przewód zestyku szynowego przedłużony do krawędzi kafla' },
    ],
    obrys: { x: 11.2, y: 0, width: 25.6, height: 48 },
    glif: { x: 11.2, y: 12, width: 25.6, height: 29.6 },
    kafel: { x: 0, y: 0, width: 48, height: 48 },
    przewody: [
      { k: 'line', x1: 24, y1: 41.6, x2: 24, y2: 48 },
      { k: 'line', x1: 16, y1: 24, x2: 16, y2: 32 },
      { k: 'line', x1: 16, y1: 24, x2: 16, y2: 0 },
    ],
    stale: [
      { k: 'line', x1: 32, y1: 24, x2: 32, y2: 32 },
      { k: 'line', x1: 11.2, y1: 32, x2: 20.8, y2: 32 },
      { k: 'line', x1: 27.2, y1: 32, x2: 36.8, y2: 32 },
      { k: 'circle', cx: 24, cy: 40.8, r: 0.8, fill: 'none' },
      { k: 'line', x1: 36, y1: 18, x2: 28, y2: 18 },
      { k: 'line', x1: 32, y1: 24, x2: 32, y2: 18 },
      { k: 'line', x1: 34.8, y1: 16, x2: 29.2, y2: 16 },
      { k: 'line', x1: 33.6, y1: 14, x2: 30.4, y2: 14 },
      { k: 'line', x1: 31.8, y1: 12, x2: 32.2, y2: 12 },
    ],
    osprzet: [],
    noz: {
      cx: 24,
      cy: 40.8,
      katy: { open: 0, closed: -42.2737, earthed: 42.2737, unknown: 0 },
      prymitywy: [
        { k: 'line', x1: 24, y1: 40, x2: 24, y2: 30.4, nozStanu: true },
      ],
    },
    zrodla: [
      { sciezka: '10_electric/91_en_60617/en_60617_07/en_60617_07_13/en_60617_07_13_07.elmt', upstreamBlobSha: 'cee8fc840450295927176ac3b938eeded5f2fcd5', sha256: '4eb501e6d51aad3bd4e43ca545c20b282a04ba9eaa1d997185c3a5404701a53a' },
      { sciezka: '10_electric/91_en_60617/en_60617_02/en_60617_02_15/en_60617_02_15_01.elmt', upstreamBlobSha: '4c1c408e1e15c304f08c67cb03a5456b941bc614', sha256: '90623920517cb61c0eee48982fffe94b1669e46d16ddf52b9e8dedca88c18061' },
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
    zrodla: [
      { sciezka: '10_electric/91_en_60617/en_60617_06/en_60617_06_09/en_60617_06_09_10.elmt', upstreamBlobSha: '37de2decfe2a496cd014a1dd411a5e8d52e990ca', sha256: '6d503d4d18bd0e56180c2746bc5cecc64b3d8459a19560c248e0f2fd7b3ad04b' },
    ],
  },
  qetCoreBalanceCt: {
    id: 'qetCoreBalanceCt',
    namePl: 'Przekładnik Ferrantiego',
    zlozenie: null,
    szerokosc: 48,
    wysokosc: 32,
    porty: [
      { name: 'top', x: 24, y: 0, dir: 'N' },
      { name: 'bottom', x: 24, y: 32, dir: 'S' },
    ],
    portyWtorne: [
      { name: 'wtorny', x: 48, y: 16, dir: 'E' },
    ],
    doprowadzenia: [],
    obrys: { x: 12, y: 0, width: 36, height: 32 },
    glif: { x: 12, y: 4.6, width: 33, height: 24 },
    kafel: null,
    przewody: [
      { k: 'line', x1: 24, y1: 0, x2: 24, y2: 32 },
      { k: 'line', x1: 36, y1: 16, x2: 48, y2: 16 },
    ],
    stale: [
      { k: 'circle', cx: 24, cy: 16.6, r: 12, fill: 'none' },
      { k: 'line', x1: 21, y1: 19, x2: 27, y2: 13 },
      { k: 'letter', x: 28.5016, y: 17.11, t: '3', size: 5.4 },
      { k: 'line', x1: 40.5, y1: 19, x2: 43.5, y2: 13 },
      { k: 'line', x1: 42, y1: 19, x2: 45, y2: 13 },
    ],
    osprzet: [],
    noz: null,
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
    zrodla: [
      { sciezka: '10_electric/91_en_60617/en_60617_03/en_60617_03_01/en_60617_03_01_14.elmt', upstreamBlobSha: '0b62c546b2fc8651ae8c8d75cab73e657e9effc6', sha256: 'efbd93c234ca3e7e37f39db946ce13237165a1ccdd471149ea01368e1779c416' },
    ],
  },
};
