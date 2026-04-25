export function formatGeneratorTypeLabelPl(genType: string | null | undefined): string {
  switch (genType) {
    case 'pv_inverter':
      return 'Zrodlo przeksztaltnikowe PV';
    case 'bess':
      return 'Zrodlo przeksztaltnikowe BESS';
    case 'wind_inverter':
      return 'Zrodlo przeksztaltnikowe FW';
    case 'fw_pmsg':
      return 'Farma wiatrowa PMSG';
    case 'fw_dfig':
      return 'Farma wiatrowa DFIG';
    case 'fw_scig':
      return 'Farma wiatrowa SCIG';
    case 'synchronous':
      return 'Generator synchroniczny';
    default:
      return genType ?? 'Generator';
  }
}

export function formatGeneratorTypeShortLabelPl(genType: string | null | undefined): string {
  switch (genType) {
    case 'pv_inverter':
      return 'PV';
    case 'bess':
      return 'BESS';
    case 'wind_inverter':
      return 'FW';
    case 'fw_pmsg':
      return 'PMSG';
    case 'fw_dfig':
      return 'DFIG';
    case 'fw_scig':
      return 'SCIG';
    case 'synchronous':
      return 'GEN';
    default:
      return 'OZE';
  }
}
