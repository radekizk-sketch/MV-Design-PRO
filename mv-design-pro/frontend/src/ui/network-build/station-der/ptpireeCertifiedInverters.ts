/**
 * Rejestr certyfikatow PTPiREE dla falownikow i konwerterow DER.
 *
 * To nie jest karta katalogowa urzadzenia. Wykaz PTPiREE potwierdza wpis
 * certyfikatu NC RfG/WOS w procesie przylaczeniowym, ale nie zastepuje danych
 * wykonawczych: Un, Sn, Ik, modelu dynamicznego, przekladnikow ani nastaw.
 */

export type PtpireeSourceVersion = 'WiPWC 1.2' | 'WiPWC 1.3';
export type PtpireeWosVersion = 'WOS 2018' | 'WOS 2025';
export type PtpireeModuleType = 'A' | 'B' | 'C' | 'D';

export interface PtpireeCertifiedDeviceSource {
  readonly id: string;
  readonly version: PtpireeSourceVersion;
  readonly titlePl: string;
  readonly publishedAt: string;
  readonly acceptedFrom?: string;
  readonly acceptedUntil?: string;
  readonly sourceUrl: string;
  readonly sourcePageUrl: string;
  readonly sourceRecordCount: number;
}

export interface PtpireeCertifiedInverterItem {
  readonly id: string;
  readonly sourceId: string;
  readonly sourceVersion: PtpireeSourceVersion;
  readonly sourceUrl: string;
  readonly sourcePage: number;
  readonly sourceRow: number;
  readonly documentNumber: string;
  readonly acceptanceDate: string;
  readonly wosVersion?: PtpireeWosVersion;
  readonly manufacturer: string;
  readonly deviceKind: string;
  readonly model: string;
  readonly moduleTypes: readonly PtpireeModuleType[];
  readonly firmware: string | null;
  readonly sourceExcerpt?: string;
  readonly certificateStatus: 'ptpiree_verified';
  readonly electricalDataStatus: 'requires_datasheet';
}

const SOURCE_PAGE_URL = 'https://ptpiree.pl/kodeksy-sieci/wykaz-certyfikatow/';
const WIPWC_1_3_URL = 'https://ptpiree.pl/wp-content/uploads/2026/05/2026-05-08-Wykaz-urzadzen_1.3.pdf';
const WIPWC_1_2_URL = 'https://ptpiree.pl/wp-content/uploads/2026/05/2026-05-06-Wykaz-urzadzen_1.2.pdf';

export const PTPIREE_CERTIFIED_DEVICE_SOURCES: readonly PtpireeCertifiedDeviceSource[] = Object.freeze([
  {
    id: 'ptpiree-wipwc-1-3-2026-05-08',
    version: 'WiPWC 1.3',
    titlePl: 'Wykaz urządzeń akceptowany od 01.11.2024',
    publishedAt: '2026-05-08',
    acceptedFrom: '2024-11-01',
    sourceUrl: WIPWC_1_3_URL,
    sourcePageUrl: SOURCE_PAGE_URL,
    sourceRecordCount: 727,
  },
  {
    id: 'ptpiree-wipwc-1-2-2026-05-06',
    version: 'WiPWC 1.2',
    titlePl: 'Wykaz urządzeń akceptowany do 31.12.2026',
    publishedAt: '2026-05-06',
    acceptedUntil: '2026-12-31',
    sourceUrl: WIPWC_1_2_URL,
    sourcePageUrl: SOURCE_PAGE_URL,
    sourceRecordCount: 8350,
  },
]);

const MANUAL_PTPIREE_CERTIFIED_INVERTERS: readonly PtpireeCertifiedInverterItem[] = Object.freeze([
  {
    id: 'ptpiree-1-3-altenergy-ezhi',
    sourceId: 'ptpiree-wipwc-1-3-2026-05-08',
    sourceVersion: 'WiPWC 1.3',
    sourceUrl: WIPWC_1_3_URL,
    sourcePage: 1,
    sourceRow: 8,
    documentNumber: '4479923053408',
    acceptanceDate: '05.02.2029',
    wosVersion: 'WOS 2025',
    manufacturer: 'ALTENERGY POWER SYSTEM INC.',
    deviceKind: 'Falownik',
    model: 'EZHI - tylko z modułem zdalnego pozyskiwania danych VCB-5131LN-WB',
    moduleTypes: ['A'],
    firmware: 'REV 1.0',
    certificateStatus: 'ptpiree_verified',
    electricalDataStatus: 'requires_datasheet',
  },
  {
    id: 'ptpiree-1-3-altenergy-ezhi-m',
    sourceId: 'ptpiree-wipwc-1-3-2026-05-08',
    sourceVersion: 'WiPWC 1.3',
    sourceUrl: WIPWC_1_3_URL,
    sourcePage: 1,
    sourceRow: 9,
    documentNumber: '4479923053408',
    acceptanceDate: '05.02.2029',
    wosVersion: 'WOS 2025',
    manufacturer: 'ALTENERGY POWER SYSTEM INC.',
    deviceKind: 'Falownik',
    model: 'EZHI-M - tylko z modułem zdalnego pozyskiwania danych VCB-5131LN-WB',
    moduleTypes: ['A'],
    firmware: 'REV 1.0',
    certificateStatus: 'ptpiree_verified',
    electricalDataStatus: 'requires_datasheet',
  },
  {
    id: 'ptpiree-1-3-altenergy-ezhi-l',
    sourceId: 'ptpiree-wipwc-1-3-2026-05-08',
    sourceVersion: 'WiPWC 1.3',
    sourceUrl: WIPWC_1_3_URL,
    sourcePage: 1,
    sourceRow: 10,
    documentNumber: '4479923053408',
    acceptanceDate: '05.02.2029',
    wosVersion: 'WOS 2025',
    manufacturer: 'ALTENERGY POWER SYSTEM INC.',
    deviceKind: 'Falownik',
    model: 'EZHI-L - tylko z modułem zdalnego pozyskiwania danych VCB-5131LN-WB',
    moduleTypes: ['A'],
    firmware: 'REV 1.0',
    certificateStatus: 'ptpiree_verified',
    electricalDataStatus: 'requires_datasheet',
  },
  {
    id: 'ptpiree-1-3-dunext-dn3h-25k-h3',
    sourceId: 'ptpiree-wipwc-1-3-2026-05-08',
    sourceVersion: 'WiPWC 1.3',
    sourceUrl: WIPWC_1_3_URL,
    sourcePage: 3,
    sourceRow: 27,
    documentNumber: '25-377-00',
    acceptanceDate: '31.12.2026',
    wosVersion: 'WOS 2018',
    manufacturer: 'Dunext Technology Suzhou Co., Ltd.',
    deviceKind: 'Falownik fotowoltaiczny z opcją akumulatora',
    model: 'DN3H-25K-H3',
    moduleTypes: ['A'],
    firmware: 'V1.00',
    certificateStatus: 'ptpiree_verified',
    electricalDataStatus: 'requires_datasheet',
  },
  {
    id: 'ptpiree-1-3-ecoflow-powerocean-plus-29k9',
    sourceId: 'ptpiree-wipwc-1-3-2026-05-08',
    sourceVersion: 'WiPWC 1.3',
    sourceUrl: WIPWC_1_3_URL,
    sourcePage: 4,
    sourceRow: 35,
    documentNumber: '4929471.01COC V2.0',
    acceptanceDate: '31.12.2026',
    wosVersion: 'WOS 2018',
    manufacturer: 'EcoFlow Inc.',
    deviceKind: 'Inwerter hybrydowy',
    model: 'EcoFlow PowerOcean Plus EF HD-P3-29K9-S1',
    moduleTypes: ['A'],
    firmware: '3.0.4.5',
    certificateStatus: 'ptpiree_verified',
    electricalDataStatus: 'requires_datasheet',
  },
  {
    id: 'ptpiree-1-3-solax-x3-aelio-50k',
    sourceId: 'ptpiree-wipwc-1-3-2026-05-08',
    sourceVersion: 'WiPWC 1.3',
    sourceUrl: WIPWC_1_3_URL,
    sourcePage: 61,
    sourceRow: 660,
    documentNumber: 'A3 50720988 0001',
    acceptanceDate: '27.03.2031',
    wosVersion: 'WOS 2025',
    manufacturer: 'SolaX Power Network Technology (Zhejiang) Co., Ltd',
    deviceKind: 'Hybrydowy falownik fotowoltaiczny',
    model: 'X3-AELIO-50K',
    moduleTypes: ['A', 'B'],
    firmware: 'Master: 1.00, Manager: 1.00',
    certificateStatus: 'ptpiree_verified',
    electricalDataStatus: 'requires_datasheet',
  },
  {
    id: 'ptpiree-1-3-solax-x3-aelio-60k',
    sourceId: 'ptpiree-wipwc-1-3-2026-05-08',
    sourceVersion: 'WiPWC 1.3',
    sourceUrl: WIPWC_1_3_URL,
    sourcePage: 61,
    sourceRow: 661,
    documentNumber: 'A3 50720988 0001',
    acceptanceDate: '27.03.2031',
    wosVersion: 'WOS 2025',
    manufacturer: 'SolaX Power Network Technology (Zhejiang) Co., Ltd',
    deviceKind: 'Hybrydowy falownik fotowoltaiczny',
    model: 'X3-AELIO-60K',
    moduleTypes: ['A', 'B'],
    firmware: 'Master: 1.00, Manager: 1.00',
    certificateStatus: 'ptpiree_verified',
    electricalDataStatus: 'requires_datasheet',
  },
  {
    id: 'ptpiree-1-3-srne-hesp4880shd3',
    sourceId: 'ptpiree-wipwc-1-3-2026-05-08',
    sourceVersion: 'WiPWC 1.3',
    sourceUrl: WIPWC_1_3_URL,
    sourcePage: 62,
    sourceRow: 675,
    documentNumber: '4487623053405',
    acceptanceDate: '31.09.2029',
    wosVersion: 'WOS 2025',
    manufacturer: 'SRNE Solar Co., Ltd',
    deviceKind: 'Falownik hybrydowy',
    model: 'HESP4880SHD3',
    moduleTypes: ['A'],
    firmware: 'V9.40',
    certificateStatus: 'ptpiree_verified',
    electricalDataStatus: 'requires_datasheet',
  },
  {
    id: 'ptpiree-1-3-sungrow-sg250hx-20-logger4000',
    sourceId: 'ptpiree-wipwc-1-3-2026-05-08',
    sourceVersion: 'WiPWC 1.3',
    sourceUrl: WIPWC_1_3_URL,
    sourcePage: 63,
    sourceRow: 690,
    documentNumber: 'LS260035GCC-0',
    acceptanceDate: '15.02.2031',
    wosVersion: 'WOS 2025',
    manufacturer: 'SUNGROW POWER SUPPLY CO., LTD.',
    deviceKind: 'Falownik fotowoltaiczny z interfejsem komunikacyjnym',
    model: 'SG250HX-20 + Logger4000',
    moduleTypes: ['B'],
    firmware: 'LCD_MALACHITE-S_V11_V01_A; MDSP_MALACHITE-S_V11_V01_A',
    certificateStatus: 'ptpiree_verified',
    electricalDataStatus: 'requires_datasheet',
  },
  {
    id: 'ptpiree-1-3-sungrow-sg250hx-20-cd',
    sourceId: 'ptpiree-wipwc-1-3-2026-05-08',
    sourceVersion: 'WiPWC 1.3',
    sourceUrl: WIPWC_1_3_URL,
    sourcePage: 64,
    sourceRow: 697,
    documentNumber: 'LS260036GCC-0',
    acceptanceDate: '15.02.2031',
    wosVersion: 'WOS 2025',
    manufacturer: 'SUNGROW POWER SUPPLY CO., LTD.',
    deviceKind: 'Falownik fotowoltaiczny',
    model: 'SG250HX-20',
    moduleTypes: ['C', 'D'],
    firmware: 'LCD_MALACHITE-S_V11_V01_A; MDSP_MALACHITE-S_V11_V01_A',
    certificateStatus: 'ptpiree_verified',
    electricalDataStatus: 'requires_datasheet',
  },
  {
    id: 'ptpiree-1-3-weco-smart-3ph-15k',
    sourceId: 'ptpiree-wipwc-1-3-2026-05-08',
    sourceVersion: 'WiPWC 1.3',
    sourceUrl: WIPWC_1_3_URL,
    sourcePage: 65,
    sourceRow: 709,
    documentNumber: 'A3 50706748 0001',
    acceptanceDate: '31.12.2026',
    wosVersion: 'WOS 2018',
    manufacturer: 'WeCo SRL',
    deviceKind: 'Falownik hybrydowy',
    model: 'SMART-3PH-15K',
    moduleTypes: ['A'],
    firmware: 'V0.1',
    certificateStatus: 'ptpiree_verified',
    electricalDataStatus: 'requires_datasheet',
  },
  {
    id: 'ptpiree-1-3-wuxi-wattsonic-matic-10kw-50a',
    sourceId: 'ptpiree-wipwc-1-3-2026-05-08',
    sourceVersion: 'WiPWC 1.3',
    sourceUrl: WIPWC_1_3_URL,
    sourcePage: 66,
    sourceRow: 715,
    documentNumber: '6179601.01COC V1.1',
    acceptanceDate: '31.12.2026',
    wosVersion: 'WOS 2018',
    manufacturer: 'Wuxi Wattsonic Energy Technology Co., LTD.',
    deviceKind: 'Inwerter hybrydowy',
    model: 'MATIC-10KW-50A',
    moduleTypes: ['A'],
    firmware: 'V01.0.0',
    certificateStatus: 'ptpiree_verified',
    electricalDataStatus: 'requires_datasheet',
  },
  {
    id: 'ptpiree-1-2-zucchetti-azzurro-3ph-100ktl-v4',
    sourceId: 'ptpiree-wipwc-1-2-2026-05-06',
    sourceVersion: 'WiPWC 1.2',
    sourceUrl: WIPWC_1_2_URL,
    sourcePage: 832,
    sourceRow: 8348,
    documentNumber: 'U24-0355',
    acceptanceDate: '31.12.2026',
    manufacturer: 'Zucchetti Centro Sistemi SpA',
    deviceKind: 'Falownik fotowoltaiczny',
    model: 'AZZURRO 3PH 100KTL-V4',
    moduleTypes: ['A', 'B', 'C', 'D'],
    firmware: 'V000001',
    certificateStatus: 'ptpiree_verified',
    electricalDataStatus: 'requires_datasheet',
  },
  {
    id: 'ptpiree-1-2-zucchetti-azzurro-3ph-110ktl-v4',
    sourceId: 'ptpiree-wipwc-1-2-2026-05-06',
    sourceVersion: 'WiPWC 1.2',
    sourceUrl: WIPWC_1_2_URL,
    sourcePage: 833,
    sourceRow: 8349,
    documentNumber: 'U24-0355',
    acceptanceDate: '31.12.2026',
    manufacturer: 'Zucchetti Centro Sistemi SpA',
    deviceKind: 'Falownik fotowoltaiczny',
    model: 'AZZURRO 3PH 110KTL-V4',
    moduleTypes: ['A', 'B', 'C', 'D'],
    firmware: 'V000001',
    certificateStatus: 'ptpiree_verified',
    electricalDataStatus: 'requires_datasheet',
  },
]);

function mergePtpireeInverters(
  items: readonly PtpireeCertifiedInverterItem[],
): readonly PtpireeCertifiedInverterItem[] {
  const seen = new Set<string>();
  const merged: PtpireeCertifiedInverterItem[] = [];
  for (const item of items) {
    const sourceKey = `${item.sourceId}:${item.sourceRow}`;
    if (seen.has(sourceKey)) continue;
    seen.add(sourceKey);
    merged.push(item);
  }
  return Object.freeze(merged);
}

export const PTPIREE_CERTIFIED_INVERTERS: readonly PtpireeCertifiedInverterItem[] =
  MANUAL_PTPIREE_CERTIFIED_INVERTERS;

let loadedPtpireeInverters: readonly PtpireeCertifiedInverterItem[] | null = null;

export async function loadPtpireeCertifiedInverters(): Promise<
  readonly PtpireeCertifiedInverterItem[]
> {
  if (loadedPtpireeInverters) return loadedPtpireeInverters;
  const generated = await import('./ptpireeCertifiedInverters.generated');
  loadedPtpireeInverters = mergePtpireeInverters([
    ...MANUAL_PTPIREE_CERTIFIED_INVERTERS,
    ...generated.PTPIREE_GENERATED_CERTIFIED_INVERTERS,
  ]);
  return loadedPtpireeInverters;
}

export function getPtpireeCertifiedInverter(
  id: string | null | undefined,
  registry: readonly PtpireeCertifiedInverterItem[] = PTPIREE_CERTIFIED_INVERTERS,
): PtpireeCertifiedInverterItem | null {
  if (!id) return null;
  return registry.find((item) => item.id === id) ?? null;
}

export function getPtpireeSource(id: string): PtpireeCertifiedDeviceSource | null {
  return PTPIREE_CERTIFIED_DEVICE_SOURCES.find((item) => item.id === id) ?? null;
}

export function getPtpireeSourceRecordCount(): number {
  return PTPIREE_CERTIFIED_DEVICE_SOURCES.reduce(
    (sum, source) => sum + source.sourceRecordCount,
    0,
  );
}

export function formatPtpireeCertificateLabel(
  item: PtpireeCertifiedInverterItem | null,
): string {
  if (!item) return 'brak certyfikatu PTPiREE';
  return `${item.manufacturer} ${item.model} (${item.documentNumber})`;
}

export function filterPtpireeCertifiedInverters(
  query: string,
  registry: readonly PtpireeCertifiedInverterItem[] = PTPIREE_CERTIFIED_INVERTERS,
): readonly PtpireeCertifiedInverterItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return registry;
  const compactQuery = normalized.replace(/[^a-z0-9]+/g, '');
  return registry.filter((item) => {
    const haystack = [
      item.manufacturer,
      item.model,
      item.documentNumber,
      item.deviceKind,
      item.sourceVersion,
      item.sourceExcerpt ?? '',
      item.moduleTypes.join(' '),
    ].join(' ').toLowerCase();
    const compactHaystack = haystack.replace(/[^a-z0-9]+/g, '');
    return haystack.includes(normalized) || compactHaystack.includes(compactQuery);
  });
}
