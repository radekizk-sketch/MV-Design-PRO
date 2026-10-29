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
 * stopnie, konwencja SVG `rotate`) wokół przegubu (`noz.cx`, `noz.cy`).
 */
import type { SymbolPort } from '../../core/grid';
import type { CadPrimitive } from '../cadSymbolRegistry';

export type QetSymbolPolaSnId =
  | 'qetBreaker'
  | 'qetDisconnector'
  | 'qetLoadBreakSwitch'
  | 'qetFuseSwitch'
  | 'qetEarthSwitch'
  | 'qetThreePositionSwitch'
  | 'qetCurrentTransformer'
  | 'qetCoreBalanceCt'
  | 'qetVoltageTransformer'
  | 'qetCableHead'
  | 'qetVoltageIndicator';

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
  /** Odcinki przewodu od zacisku źródła leżącego wewnątrz gabarytu do portu na krawędzi
   *  (z powodem) — przewód, nie geometria elementu QET. */
  readonly doprowadzenia: readonly QetDoprowadzenie[];
  /** Obwiednia rysunku we WSZYSTKICH położeniach noża i portów (względem gabarytu). */
  readonly obrys: QetProstokat;
  readonly stale: readonly CadPrimitive[];
  readonly noz: QetNozSymbolu | null;
  readonly zrodla: readonly QetZrodloSymbolu[];
}

export const QET_POCHODZENIE = { repozytorium: 'https://github.com/qelectrotech/qelectrotech-elements', commit: '14a4727f70856d8e79de59a353fa3c52d3e90e21', licencja: 'CC-BY-3.0', licencjaUrl: 'https://creativecommons.org/licenses/by/3.0/', autor: 'The QElectroTech team' } as const;

export const QET_SYMBOLE_POLA_SN: Readonly<Record<QetSymbolPolaSnId, QetSymbolPolaSn>> = {
  qetBreaker: {
    id: 'qetBreaker',
    namePl: 'Wyłącznik',
    zlozenie: null,
    szerokosc: 16,
    wysokosc: 24,
    porty: [
      { name: 'top', x: 8, y: 0, dir: 'N' },
      { name: 'bottom', x: 8, y: 24, dir: 'S' },
    ],
    doprowadzenia: [],
    obrys: { x: 4.8, y: 0, width: 4, height: 24 },
    stale: [
      { k: 'line', x1: 8, y1: 8, x2: 8, y2: 0 },
      { k: 'line', x1: 8, y1: 16, x2: 8, y2: 24 },
      { k: 'line', x1: 7.2, y1: 7.2, x2: 8.8, y2: 8.8 },
      { k: 'line', x1: 8.8, y1: 7.2, x2: 7.2, y2: 8.8 },
    ],
    noz: {
      cx: 8,
      cy: 16,
      katy: { open: 0, closed: 19.179, unknown: 9.5895 },
      prymitywy: [
        { k: 'line', x1: 8, y1: 16, x2: 4.8, y2: 6.8, nozStanu: true },
      ],
    },
    zrodla: [
      { sciezka: '10_electric/91_en_60617/en_60617_07/en_60617_07_13/en_60617_07_13_05.elmt', upstreamBlobSha: '8df98b9b5c2783ea2413b406bef53ded66da628a', sha256: 'a0a9a86444b0d4553cce32f9ea7c0397e3a090d493d86c46ac4af6f6115749a4' },
    ],
  },
  qetDisconnector: {
    id: 'qetDisconnector',
    namePl: 'Odłącznik',
    zlozenie: null,
    szerokosc: 16,
    wysokosc: 24,
    porty: [
      { name: 'top', x: 8, y: 0, dir: 'N' },
      { name: 'bottom', x: 8, y: 24, dir: 'S' },
    ],
    doprowadzenia: [],
    obrys: { x: 4.8, y: 0, width: 4.4, height: 24 },
    stale: [
      { k: 'line', x1: 8, y1: 8, x2: 8, y2: 0 },
      { k: 'line', x1: 8, y1: 16, x2: 8, y2: 24 },
      { k: 'line', x1: 6.8, y1: 8, x2: 9.2, y2: 8 },
    ],
    noz: {
      cx: 8,
      cy: 16,
      katy: { open: 0, closed: 19.179, unknown: 9.5895 },
      prymitywy: [
        { k: 'line', x1: 8, y1: 16, x2: 4.8, y2: 6.8, nozStanu: true },
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
    szerokosc: 16,
    wysokosc: 24,
    porty: [
      { name: 'top', x: 8, y: 0, dir: 'N' },
      { name: 'bottom', x: 8, y: 24, dir: 'S' },
    ],
    doprowadzenia: [],
    obrys: { x: 4.8, y: 0, width: 4, height: 24 },
    stale: [
      { k: 'line', x1: 8, y1: 6.4, x2: 8, y2: 0 },
      { k: 'line', x1: 8, y1: 16, x2: 8, y2: 24 },
      { k: 'circle', cx: 8, cy: 7.2, r: 0.8, fill: 'none' },
      { k: 'line', x1: 7.2, y1: 6.4, x2: 8.8, y2: 6.4 },
    ],
    noz: {
      cx: 8,
      cy: 16,
      katy: { open: 0, closed: 19.179, unknown: 9.5895 },
      prymitywy: [
        { k: 'line', x1: 8, y1: 16, x2: 4.8, y2: 6.8, nozStanu: true },
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
    szerokosc: 16,
    wysokosc: 24,
    porty: [
      { name: 'top', x: 8, y: 0, dir: 'N' },
      { name: 'bottom', x: 8, y: 24, dir: 'S' },
    ],
    doprowadzenia: [],
    obrys: { x: 5.6, y: 0, width: 3.2731, height: 24 },
    stale: [
      { k: 'line', x1: 8, y1: 24, x2: 8, y2: 16 },
      { k: 'line', x1: 8, y1: 6.8, x2: 8, y2: 0 },
      { k: 'circle', cx: 8, cy: 7.6, r: 0.4, fill: 'none' },
      { k: 'line', x1: 7.2, y1: 6.8, x2: 8.8, y2: 6.8 },
    ],
    noz: {
      cx: 8,
      cy: 16,
      katy: { open: 0, closed: 14.0362, unknown: 7.0181 },
      prymitywy: [
        { k: 'line', x1: 8, y1: 16, x2: 6, y2: 8, nozStanu: true },
        { k: 'line', x1: 6.8, y1: 14.4, x2: 5.6, y2: 10, nozStanu: true },
        { k: 'line', x1: 7.2, y1: 9.6, x2: 8.4, y2: 14, nozStanu: true },
        { k: 'line', x1: 8.4, y1: 14, x2: 6.8, y2: 14.4, nozStanu: true },
        { k: 'line', x1: 7.2, y1: 9.6, x2: 5.6, y2: 10, nozStanu: true },
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
    szerokosc: 16,
    wysokosc: 16,
    porty: [
      { name: 'top', x: 8, y: 0, dir: 'N' },
    ],
    doprowadzenia: [],
    obrys: { x: 6.4, y: 0, width: 3.2, height: 13.6 },
    stale: [
      { k: 'line', x1: 7.6, y1: 13.6, x2: 8.4, y2: 13.6 },
      { k: 'line', x1: 7, y1: 12.8, x2: 9, y2: 12.8 },
      { k: 'line', x1: 9.6, y1: 12, x2: 6.4, y2: 12 },
      { k: 'line', x1: 7.2, y1: 4, x2: 8.8, y2: 4 },
      { k: 'line', x1: 8, y1: 0, x2: 8, y2: 4 },
      { k: 'line', x1: 8, y1: 8, x2: 8, y2: 12 },
    ],
    noz: {
      cx: 8,
      cy: 8,
      katy: { open: 0, closed: 25.2011, unknown: 12.6006 },
      prymitywy: [
        { k: 'line', x1: 6.4, y1: 4.6, x2: 8, y2: 8, nozStanu: true },
      ],
    },
    zrodla: [
      { sciezka: '10_electric/10_allpole/450_high_voltage/interrupteur_sectionneur_de_terre.elmt', upstreamBlobSha: 'addcaa782655cfe3d85a8f285cb48ec02194fee5', sha256: 'c6f1aa6b7d2e925b28df88b4173491022c62e101ce74638308df4a972633bffb' },
    ],
  },
  qetThreePositionSwitch: {
    id: 'qetThreePositionSwitch',
    namePl: 'Łącznik trójpołożeniowy',
    zlozenie: 'złożenie z elementów QET en_60617_07_13_07 (odłącznik dwukierunkowy) + en_60617_02_15_01 (uziemienie) na zestyku prawym',
    szerokosc: 48,
    wysokosc: 32,
    porty: [
      { name: 'top', x: 16, y: 0, dir: 'N' },
      { name: 'bottom', x: 24, y: 32, dir: 'S' },
    ],
    doprowadzenia: [
      { port: 'top', x1: 16, y1: 8, x2: 16, y2: 0, powod: 'zacisk szynowy QET leży 20 jednostek QET pod górną krawędzią gabarytu, bo symbol uziemienia na zestyku prawym sięga 10 jednostek nad poziom zacisków (obrys całego symbolu musi mieścić się w gabarycie)' },
    ],
    obrys: { x: 14.4, y: 0, width: 29.6, height: 32 },
    stale: [
      { k: 'line', x1: 24, y1: 25.6, x2: 24, y2: 32 },
      { k: 'line', x1: 16, y1: 8, x2: 16, y2: 16 },
      { k: 'line', x1: 32, y1: 8, x2: 32, y2: 16 },
      { k: 'line', x1: 14.4, y1: 16, x2: 17.6, y2: 16 },
      { k: 'line', x1: 30.4, y1: 16, x2: 33.6, y2: 16 },
      { k: 'circle', cx: 24, cy: 24.8, r: 0.8, fill: 'none' },
      { k: 'line', x1: 38, y1: 12, x2: 38, y2: 4 },
      { k: 'line', x1: 32, y1: 8, x2: 38, y2: 8 },
      { k: 'line', x1: 40, y1: 10.8, x2: 40, y2: 5.2 },
      { k: 'line', x1: 42, y1: 9.6, x2: 42, y2: 6.4 },
      { k: 'line', x1: 44, y1: 7.8, x2: 44, y2: 8.2 },
      { k: 'line', x1: 16, y1: 8, x2: 16, y2: 0 },
    ],
    noz: {
      cx: 24,
      cy: 24.8,
      katy: { open: 0, closed: -42.2737, earthed: 42.2737, unknown: 0 },
      prymitywy: [
        { k: 'line', x1: 24, y1: 24, x2: 24, y2: 14.4, nozStanu: true },
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
    szerokosc: 32,
    wysokosc: 24,
    porty: [
      { name: 'top', x: 16, y: 0, dir: 'N' },
      { name: 'bottom', x: 16, y: 24, dir: 'S' },
    ],
    doprowadzenia: [],
    obrys: { x: 12, y: 0, width: 20, height: 24 },
    stale: [
      { k: 'line', x1: 16, y1: 0, x2: 16, y2: 24 },
      { k: 'line', x1: 20, y1: 12, x2: 32, y2: 12 },
      { k: 'circle', cx: 16, cy: 12, r: 4, fill: 'none' },
      { k: 'line', x1: 24, y1: 16, x2: 28, y2: 8 },
      { k: 'line', x1: 26, y1: 16, x2: 30, y2: 8 },
    ],
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
    doprowadzenia: [],
    obrys: { x: 16, y: 0, width: 32, height: 32 },
    stale: [
      { k: 'circle', cx: 24, cy: 16.4, r: 8, fill: 'none' },
      { k: 'line', x1: 24, y1: 0, x2: 24, y2: 32 },
      { k: 'line', x1: 22, y1: 18, x2: 26, y2: 14 },
      { k: 'letter', x: 27.08, y: 16.74, t: '3', size: 3.6 },
      { k: 'line', x1: 32, y1: 16, x2: 48, y2: 16 },
      { k: 'line', x1: 38, y1: 20, x2: 42, y2: 12 },
      { k: 'line', x1: 40, y1: 20, x2: 44, y2: 12 },
    ],
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
    wysokosc: 48,
    porty: [
      { name: 'top', x: 8, y: 0, dir: 'N' },
    ],
    doprowadzenia: [],
    obrys: { x: 0, y: 0, width: 16, height: 44.4 },
    stale: [
      { k: 'circle', cx: 8, cy: 16.4, r: 8, fill: 'none' },
      { k: 'line', x1: 8, y1: 0, x2: 8, y2: 8 },
      { k: 'circle', cx: 8, cy: 28, r: 8, fill: 'none' },
      { k: 'line', x1: 7.948, y1: 36.4, x2: 7.948, y2: 44.4 },
    ],
    noz: null,
    zrodla: [
      { sciezka: '10_electric/91_en_60617/en_60617_06/en_60617_06_13/en_60617_06_13_01A.elmt', upstreamBlobSha: 'a883a2e6daec80c241594505c96295c917884adc', sha256: '465d743960ead5eec0f57d26618a67a44747c7d3b6233bfb5e038c614f08235b' },
    ],
  },
  qetCableHead: {
    id: 'qetCableHead',
    namePl: 'Głowica kablowa',
    zlozenie: null,
    szerokosc: 16,
    wysokosc: 48,
    porty: [
      { name: 'top', x: 8, y: 0, dir: 'N' },
      { name: 'bottom', x: 8, y: 48, dir: 'S' },
    ],
    doprowadzenia: [],
    obrys: { x: 0, y: 0, width: 16, height: 48 },
    stale: [
      { k: 'line', x1: 12, y1: 16, x2: 12, y2: 0 },
      { k: 'path', d: 'M 16 16 L 0 16 L 8 32 Z', fill: 'none' },
      { k: 'line', x1: 8, y1: 16, x2: 8, y2: 0 },
      { k: 'line', x1: 4, y1: 16, x2: 4, y2: 0 },
      { k: 'line', x1: 8, y1: 32, x2: 8, y2: 48 },
    ],
    noz: null,
    zrodla: [
      { sciezka: '10_electric/91_en_60617/en_60617_03/en_60617_03_04/en_60617_03_04_01.elmt', upstreamBlobSha: '1a6cf258181f1205b6d9cb95262b7335c829b7a7', sha256: 'a0542d6a73d0fb990a24faf9789cbc6c99e2e7e0c541f638f58303fd5929dff5' },
    ],
  },
  qetVoltageIndicator: {
    id: 'qetVoltageIndicator',
    namePl: 'Pojemnościowy wskaźnik napięcia',
    zlozenie: null,
    szerokosc: 16,
    wysokosc: 8,
    porty: [
      { name: 'top', x: 8, y: 0, dir: 'N' },
      { name: 'bottom', x: 8, y: 8, dir: 'S' },
    ],
    doprowadzenia: [],
    obrys: { x: 2, y: 0, width: 6, height: 8 },
    stale: [
      { k: 'line', x1: 8, y1: 0, x2: 8, y2: 8 },
      { k: 'line', x1: 8, y1: 4, x2: 6, y2: 4 },
      { k: 'line', x1: 6, y1: 2, x2: 6, y2: 6 },
      { k: 'line', x1: 5.3, y1: 2, x2: 5.3, y2: 6 },
      { k: 'line', x1: 4, y1: 4, x2: 5.2, y2: 4 },
      { k: 'arc', d: 'M 2 6 A 2 2 0 0 0 2 2' },
    ],
    noz: null,
    zrodla: [
      { sciezka: '10_electric/10_allpole/450_high_voltage/signal_capacitif.elmt', upstreamBlobSha: 'fa4f0d85eabef67c8dfcf4cd102fdba3bc7c91d4', sha256: '652e3adf083d3d3379fd71abc6ede79b095d5f03bde319a88b30046fdb26875e' },
    ],
  },
};
