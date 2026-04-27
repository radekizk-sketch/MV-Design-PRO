import type { TechnicalIconName } from '../icons/technicalIconRegistry';

export type CanonicalScreenCode =
  | 'E-00' | 'E-01' | 'E-02' | 'E-03' | 'E-04' | 'E-05' | 'E-06' | 'E-07' | 'E-08' | 'E-09'
  | 'E-10' | 'E-11' | 'E-12' | 'E-13' | 'E-14' | 'E-15' | 'E-16' | 'E-17' | 'E-18' | 'E-19'
  | 'E-20' | 'E-21' | 'E-22' | 'E-23' | 'E-24' | 'E-25' | 'E-26' | 'E-27' | 'E-28' | 'E-29'
  | 'E-30' | 'E-31' | 'E-32' | 'E-33' | 'E-34' | 'E-35' | 'E-36' | 'E-37' | 'E-38' | 'E-39';

export interface CanonicalScreenDefinition {
  code: CanonicalScreenCode;
  label: string;
  icon: TechnicalIconName;
  area: string;
}

export const CANONICAL_SCREEN_REGISTRY: Readonly<Record<CanonicalScreenCode, CanonicalScreenDefinition>> = {
  'E-00': { code: 'E-00', label: 'Pulpit projektu', icon: 'ikona-ekran-pulpit-projektu', area: 'MODEL_SIECI' },
  'E-01': { code: 'E-01', label: 'Główne środowisko pracy SLD', icon: 'ikona-ekran-sld', area: 'SCHEMAT_TOPOLOGIA' },
  'E-02': { code: 'E-02', label: 'Panel modelu sieci', icon: 'ikona-ekran-panel-modelu', area: 'MODEL_SIECI' },
  'E-03': { code: 'E-03', label: 'Inspektor techniczny', icon: 'ikona-ekran-inspektor-techniczny', area: 'MODEL_SIECI' },
  'E-04': { code: 'E-04', label: 'Gotowość modelu', icon: 'ikona-ekran-gotowosc-modelu', area: 'STUDIA_OBLICZENIOWE' },
  'E-05': { code: 'E-05', label: 'Menu obiektu na SLD', icon: 'ikona-ekran-menu-obiektu', area: 'SCHEMAT_TOPOLOGIA' },
  'E-06': { code: 'E-06', label: 'Nakładki wynikowe SLD', icon: 'ikona-ekran-nakladki-wynikowe', area: 'WYNIKI_ANALIZY' },
  'E-07': { code: 'E-07', label: 'Przypadki obliczeniowe', icon: 'ikona-ekran-przypadki-obliczeniowe', area: 'STUDIA_OBLICZENIOWE' },
  'E-08': { code: 'E-08', label: 'Warianty pracy', icon: 'ikona-ekran-warianty-pracy', area: 'STUDIA_OBLICZENIOWE' },
  'E-09': { code: 'E-09', label: 'Migawki modelu i historia uruchomień', icon: 'ikona-ekran-migawki-historia', area: 'HISTORIA_AUDYT' },
  'E-10': { code: 'E-10', label: 'Główny Punkt Zasilający', icon: 'ikona-ekran-gpz', area: 'MODEL_SIECI' },
  'E-11': { code: 'E-11', label: 'Pole SN', icon: 'ikona-ekran-pole-sn', area: 'MODEL_SIECI' },
  'E-12': { code: 'E-12', label: 'Odcinek sieci SN', icon: 'ikona-ekran-odcinek-sn', area: 'MODEL_SIECI' },
  'E-13': { code: 'E-13', label: 'Stacja transformatorowa SN/nN', icon: 'ikona-ekran-stacja-sn-nn', area: 'MODEL_SIECI' },
  'E-14': { code: 'E-14', label: 'Złącze kablowe SN', icon: 'ikona-ekran-zksn', area: 'MODEL_SIECI' },
  'E-15': { code: 'E-15', label: 'Słup rozgałęźny', icon: 'ikona-ekran-slup-rozgalezny', area: 'MODEL_SIECI' },
  'E-16': { code: 'E-16', label: 'Odgałęzienie', icon: 'ikona-ekran-odgalezienie', area: 'MODEL_SIECI' },
  'E-17': { code: 'E-17', label: 'Punkt normalnie otwarty', icon: 'ikona-ekran-punkt-normalnie-otwarty', area: 'SCHEMAT_TOPOLOGIA' },
  'E-18': { code: 'E-18', label: 'Transformator SN/nN', icon: 'ikona-ekran-transformator', area: 'MODEL_SIECI' },
  'E-19': { code: 'E-19', label: 'Strona nN stacji', icon: 'ikona-ekran-strona-nn', area: 'MODEL_SIECI' },
  'E-20': { code: 'E-20', label: 'Obciążenie nN', icon: 'ikona-ekran-obciazenie-nn', area: 'MODEL_SIECI' },
  'E-21': { code: 'E-21', label: 'Źródło fotowoltaiczne', icon: 'ikona-ekran-zrodlo-pv', area: 'ZRODLA_PRZYLACZENIA' },
  'E-22': { code: 'E-22', label: 'Magazyn energii', icon: 'ikona-ekran-magazyn-energii', area: 'ZRODLA_PRZYLACZENIA' },
  'E-23': { code: 'E-23', label: 'Farma wiatrowa', icon: 'ikona-ekran-farma-wiatrowa', area: 'ZRODLA_PRZYLACZENIA' },
  'E-24': { code: 'E-24', label: 'Profile operatora i źródeł', icon: 'ikona-ekran-profile', area: 'ZRODLA_PRZYLACZENIA' },
  'E-25': { code: 'E-25', label: 'Charakterystyki regulacyjne', icon: 'ikona-ekran-charakterystyki-regulacyjne', area: 'ZRODLA_PRZYLACZENIA' },
  'E-26': { code: 'E-26', label: 'Charakterystyki FRT/LVRT/HVRT', icon: 'ikona-ekran-frt-lvrt-hvrt', area: 'ZRODLA_PRZYLACZENIA' },
  'E-27': { code: 'E-27', label: 'Zabezpieczenia i automatyka', icon: 'ikona-ekran-zabezpieczenia-automatyka', area: 'ZABEZPIECZENIA_AUTOMATYKA' },
  'E-28': { code: 'E-28', label: 'Koordynacja zabezpieczeń', icon: 'ikona-ekran-koordynacja-zabezpieczen', area: 'ZABEZPIECZENIA_AUTOMATYKA' },
  'E-29': { code: 'E-29', label: 'Sieć zerowa i składowe symetryczne', icon: 'ikona-ekran-siec-zerowa', area: 'WYNIKI_ANALIZY' },
  'E-30': { code: 'E-30', label: 'Rozpływ mocy', icon: 'ikona-ekran-rozplyw-mocy', area: 'WYNIKI_ANALIZY' },
  'E-31': { code: 'E-31', label: 'Stan fazowy SN', icon: 'ikona-ekran-stan-fazowy', area: 'WYNIKI_ANALIZY' },
  'E-32': { code: 'E-32', label: 'Stabilność dynamiczna', icon: 'ikona-ekran-stabilnosc-dynamiczna', area: 'WYNIKI_ANALIZY' },
  'E-33': { code: 'E-33', label: 'Wkłady źródeł', icon: 'ikona-ekran-wklady-zrodel', area: 'WYNIKI_ANALIZY' },
  'E-34': { code: 'E-34', label: 'Weryfikacja cieplna i dynamiczna', icon: 'ikona-ekran-weryfikacja-cieplna-dynamiczna', area: 'WYNIKI_ANALIZY' },
  'E-35': { code: 'E-35', label: 'Wyniki i porównania', icon: 'ikona-ekran-wyniki-porownania', area: 'WYNIKI_ANALIZY' },
  'E-36': { code: 'E-36', label: 'Uzasadnienie inżynierskie', icon: 'ikona-ekran-uzasadnienie', area: 'RAPORTY_UZASADNIENIA' },
  'E-37': { code: 'E-37', label: 'Raporty OSD i audytowe', icon: 'ikona-ekran-raporty-osd-audytowe', area: 'RAPORTY_UZASADNIENIA' },
  'E-38': { code: 'E-38', label: 'Katalogi techniczne', icon: 'ikona-ekran-katalogi-techniczne', area: 'KATALOGI_TECHNICZNE' },
  'E-39': { code: 'E-39', label: 'Historia i audyt', icon: 'ikona-ekran-historia-audyt', area: 'HISTORIA_AUDYT' },
};

export const CANONICAL_SCREEN_CODES = Object.keys(CANONICAL_SCREEN_REGISTRY) as CanonicalScreenCode[];
