/**
 * Jedno źródło polskich etykiet kategorii typów katalogowych (`TypeCategory`).
 *
 * Pełny słownik (`Record`, nie `Partial` i nie rzutowanie): nowa kategoria w `TypeCategory`
 * bez etykiety jest błędem kompilacji. Konsumenci: zakładki i karta szczegółów
 * `TypeLibraryBrowser`, nagłówek okna wyboru typu `TypePicker`.
 */
import type { TypeCategory } from './types';

export const ETYKIETY_KATEGORII_TYPOW: Readonly<Record<TypeCategory, string>> = {
  LINE: 'Typy linii napowietrznych',
  HV_OVERHEAD_CONDUCTOR: 'Typy przewodów linii 110 kV',
  CABLE: 'Typy kabli SN',
  SYSTEM_SOURCE: 'Typy zasilania systemowego SN',
  TRANSFORMER: 'Typy transformatorów SN/nN',
  SWITCH_EQUIPMENT: 'Typy aparatury łączeniowej SN',
  MV_APPARATUS: 'Typy aparatury SN',
  LV_APPARATUS: 'Typy aparatury nN',
  LV_RCD: 'Typy wyłączników różnicowoprądowych nN',
  LV_CABLE: 'Typy kabli nN',
  LOAD: 'Typy obciążeń',
  CT: 'Typy przekładników prądowych',
  VT: 'Typy przekładników napięciowych',
  MEASUREMENT_TRANSFORMER: 'Typy przekładników pomiarowych',
  PV_INVERTER: 'Typy falowników źródeł fotowoltaicznych',
  BESS_INVERTER: 'Typy falowników magazynów energii',
  CONVERTER: 'Typy konwerterów',
  PROTECTION_DEVICE: 'Typy zabezpieczeń',
  PTPIREE_CERTIFICATE: 'Wykaz certyfikatów PTPiREE',
  BRANCH_POLE: 'Typy słupów rozgałęźnych SN',
  ZKSN: 'Typy złączy kablowych SN (ZKSN)',
  SURGE_ARRESTER: 'Typy ograniczników przepięć SN',
  SHUNT_CAPACITOR: 'Typy baterii kondensatorów SN',
};
