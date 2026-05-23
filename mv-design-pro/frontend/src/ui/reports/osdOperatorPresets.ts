/**
 * osdOperatorPresets — presets dla operatorów OSD (Etap 13 z planu).
 *
 * "Operator (PSE/Energa/Tauron/Enea/PGE) z presets per operator"
 * "Lista załączników per operator (PSE wymaga X, Tauron Y, Enea Z)"
 *
 * 5 operatorów + 1 PSE (przesyłowy):
 * - PSE — Polskie Sieci Elektroenergetyczne (operator przesyłowy WN/NN)
 * - Energa — OSD północ
 * - Tauron — OSD południe
 * - Enea — OSD zachód
 * - PGE — OSD wschód/centrum
 */

export type OsdOperator = 'PSE' | 'ENERGA' | 'TAURON' | 'ENEA' | 'PGE';

export interface OsdAttachment {
  id: string;
  label: string;
  required: boolean;
  description?: string;
}

export interface OsdOperatorPreset {
  operator: OsdOperator;
  name: string;
  fullName: string;
  area: string;
  attachmentTemplate: OsdAttachment[];
  contactEmail: string;
  technicalRequirements: {
    minPowerKva: number;
    maxPowerKva: number;
    requireFrtCurves: boolean;
    requireAntiIslanding: boolean;
    requireQuPProfile: boolean;
    voltageLevelsKv: number[];
  };
}

const COMMON_ATTACHMENTS: OsdAttachment[] = [
  { id: 'sld', label: 'Schemat jednokreskowy (SLD)', required: true, description: 'SVG + PDF z bilansem mocy' },
  { id: 'project_data', label: 'Karta projektowa', required: true },
  { id: 'sep_qualifications', label: 'Uprawnienia SEP projektanta i sprawdzającego', required: true },
  { id: 'power_balance', label: 'Bilans mocy', required: true },
];

export const OSD_OPERATOR_PRESETS: Record<OsdOperator, OsdOperatorPreset> = {
  PSE: {
    operator: 'PSE',
    name: 'PSE',
    fullName: 'Polskie Sieci Elektroenergetyczne S.A.',
    area: 'Cała Polska (sieć przesyłowa WN/NN)',
    contactEmail: 'wnioski.przylaczeniowe@pse.pl',
    attachmentTemplate: [
      ...COMMON_ATTACHMENTS,
      { id: 'sc_calc', label: 'Obliczenia zwarciowe IEC 60909', required: true },
      { id: 'lf_calc', label: 'Obliczenia rozpływu mocy (Newton-Raphson)', required: true },
      { id: 'iec_61850', label: 'Plik SCD IEC 61850 (dla SCADA)', required: true },
      { id: 'protection_settings', label: 'Nastawy zabezpieczeń', required: true },
      { id: 'frt_curves', label: 'Krzywe FRT/HVRT/LVRT', required: true },
    ],
    technicalRequirements: {
      minPowerKva: 1000,
      maxPowerKva: 1_000_000,
      requireFrtCurves: true,
      requireAntiIslanding: true,
      requireQuPProfile: true,
      voltageLevelsKv: [110, 220, 400],
    },
  },
  ENERGA: {
    operator: 'ENERGA',
    name: 'Energa OSD',
    fullName: 'Energa-Operator S.A.',
    area: 'Pomorze, Warmia, Kujawy',
    contactEmail: 'przylaczenia@energa-operator.pl',
    attachmentTemplate: [
      ...COMMON_ATTACHMENTS,
      { id: 'sc_calc', label: 'Obliczenia zwarciowe', required: true },
      { id: 'frt_curves', label: 'Krzywe FRT (dla DER ≥ 800 kVA)', required: false, description: 'Wymagane tylko dla typ B+' },
      { id: 'anti_islanding', label: 'Schemat anti-islanding (27/59/81)', required: true },
    ],
    technicalRequirements: {
      minPowerKva: 1,
      maxPowerKva: 10_000,
      requireFrtCurves: true,
      requireAntiIslanding: true,
      requireQuPProfile: true,
      voltageLevelsKv: [0.4, 15, 20, 110],
    },
  },
  TAURON: {
    operator: 'TAURON',
    name: 'Tauron OSD',
    fullName: 'Tauron Dystrybucja S.A.',
    area: 'Śląsk, Małopolska, Opolszczyzna',
    contactEmail: 'przylaczenia@tauron-dystrybucja.pl',
    attachmentTemplate: [
      ...COMMON_ATTACHMENTS,
      { id: 'sc_calc', label: 'Obliczenia zwarciowe IEC 60909', required: true },
      { id: 'lf_calc', label: 'Obliczenia rozpływu mocy', required: true },
      { id: 'cos_phi_profile', label: 'Profil cos φ(P)', required: true },
      { id: 'qu_profile', label: 'Profil Q(U)', required: true },
      { id: 'anti_islanding', label: 'Anti-islanding (ROCOF)', required: true },
    ],
    technicalRequirements: {
      minPowerKva: 1,
      maxPowerKva: 50_000,
      requireFrtCurves: true,
      requireAntiIslanding: true,
      requireQuPProfile: true,
      voltageLevelsKv: [0.4, 15, 20, 30, 110],
    },
  },
  ENEA: {
    operator: 'ENEA',
    name: 'Enea OSD',
    fullName: 'Enea Operator Sp. z o.o.',
    area: 'Wielkopolska, Lubuskie, Zachodniopomorskie',
    contactEmail: 'przylaczenia@operator.enea.pl',
    attachmentTemplate: [
      ...COMMON_ATTACHMENTS,
      { id: 'sc_calc', label: 'Obliczenia zwarciowe', required: true },
      { id: 'ptpireee_cert', label: 'Certyfikat PTPIREE inwertera', required: false, description: 'Wymagany dla DER PV' },
      { id: 'frt_curves', label: 'Krzywe FRT', required: true },
    ],
    technicalRequirements: {
      minPowerKva: 1,
      maxPowerKva: 50_000,
      requireFrtCurves: true,
      requireAntiIslanding: true,
      requireQuPProfile: true,
      voltageLevelsKv: [0.4, 15, 20, 110],
    },
  },
  PGE: {
    operator: 'PGE',
    name: 'PGE OSD',
    fullName: 'PGE Dystrybucja S.A.',
    area: 'Mazowsze, Łódzkie, Świętokrzyskie, Lubelskie, Podkarpackie',
    contactEmail: 'przylaczenia@pgedystrybucja.pl',
    attachmentTemplate: [
      ...COMMON_ATTACHMENTS,
      { id: 'sc_calc', label: 'Obliczenia zwarciowe IEC 60909', required: true },
      { id: 'lf_calc', label: 'Obliczenia rozpływu mocy', required: true },
      { id: 'frt_curves', label: 'Krzywe FRT/LVRT/HVRT', required: true },
      { id: 'qu_profile', label: 'Profil Q(U) per IRiESD', required: true },
      { id: 'anti_islanding', label: 'Anti-islanding 27/59/81/ROCOF', required: true },
    ],
    technicalRequirements: {
      minPowerKva: 1,
      maxPowerKva: 50_000,
      requireFrtCurves: true,
      requireAntiIslanding: true,
      requireQuPProfile: true,
      voltageLevelsKv: [0.4, 15, 20, 30, 110],
    },
  },
};

export function getOperatorPreset(operator: OsdOperator): OsdOperatorPreset {
  return OSD_OPERATOR_PRESETS[operator];
}

export function getRequiredAttachments(operator: OsdOperator): OsdAttachment[] {
  return OSD_OPERATOR_PRESETS[operator].attachmentTemplate.filter((a) => a.required);
}

export function listOperators(): OsdOperator[] {
  return Object.keys(OSD_OPERATOR_PRESETS) as OsdOperator[];
}

export function validatePowerCompatibility(
  operator: OsdOperator,
  installedPowerKva: number,
): { isCompatible: boolean; reason?: string } {
  const preset = OSD_OPERATOR_PRESETS[operator];
  if (installedPowerKva < preset.technicalRequirements.minPowerKva) {
    return {
      isCompatible: false,
      reason: `Moc ${installedPowerKva} kVA poniżej minimum ${preset.name} (${preset.technicalRequirements.minPowerKva} kVA).`,
    };
  }
  if (installedPowerKva > preset.technicalRequirements.maxPowerKva) {
    return {
      isCompatible: false,
      reason: `Moc ${installedPowerKva} kVA powyżej maksimum ${preset.name} (${preset.technicalRequirements.maxPowerKva} kVA). Skontaktuj się z PSE.`,
    };
  }
  return { isCompatible: true };
}
