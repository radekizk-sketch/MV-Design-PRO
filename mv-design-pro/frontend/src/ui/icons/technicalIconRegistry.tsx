import { clsx } from 'clsx';
import type { ReactNode } from 'react';

export type TechnicalIconStatus =
  | 'normal'
  | 'active'
  | 'inactive'
  | 'warning'
  | 'error'
  | 'locked'
  | 'audit';

export const areaIconRegistry = {
  'ikona-obszar-model-sieci': 'Model sieci',
  'ikona-obszar-schemat-topologia': 'Schemat i topologia',
  'ikona-obszar-studia-obliczeniowe': 'Studia obliczeniowe',
  'ikona-obszar-wyniki-analizy': 'Wyniki i analizy',
  'ikona-obszar-zabezpieczenia-automatyka': 'Zabezpieczenia i automatyka',
  'ikona-obszar-zrodla-przylaczenia': 'Układy PV/BESS/FW',
  'ikona-obszar-katalogi-techniczne': 'Katalogi techniczne',
  'ikona-obszar-raporty-uzasadnienia': 'Raporty i uzasadnienia',
  'ikona-obszar-historia-audyt': 'Historia i audyt',
} as const;

export const objectIconRegistry = {
  'ikona-obiekt-gpz': 'Główny Punkt Zasilający',
  'ikona-obiekt-szyna': 'Szyna zbiorcza',
  'ikona-obiekt-pole-sn': 'Pole SN',
  'ikona-obiekt-wylacznik': 'Wyłącznik',
  'ikona-obiekt-rozlacznik': 'Rozłącznik',
  'ikona-obiekt-odlacznik': 'Odłącznik',
  'ikona-obiekt-uziemnik': 'Uziemnik',
  'ikona-obiekt-bezpiecznik': 'Bezpiecznik',
  'ikona-obiekt-przekladnik-pradowy': 'Przekładnik prądowy',
  'ikona-obiekt-przekladnik-napieciowy': 'Przekładnik napięciowy',
  'ikona-obiekt-transformator': 'Transformator',
  'ikona-obiekt-kabel-sn': 'Kabel SN',
  'ikona-obiekt-linia-napowietrzna': 'Linia napowietrzna',
  'ikona-obiekt-zksn': 'Złącze kablowe SN',
  'ikona-obiekt-slup-rozgalezny': 'Słup rozgałęźny',
  'ikona-obiekt-stacja-sn-nn': 'Stacja SN/nN',
  'ikona-obiekt-strona-nn': 'Strona nN',
  'ikona-obiekt-obciazenie': 'Obciążenie',
  'ikona-obiekt-zrodlo-pv': 'Źródło fotowoltaiczne',
  'ikona-obiekt-magazyn-energii': 'Magazyn energii',
  'ikona-obiekt-farma-wiatrowa': 'Farma wiatrowa',
  'ikona-obiekt-punkt-normalnie-otwarty': 'Punkt normalnie otwarty',
} as const;

export const analysisIconRegistry = {
  'ikona-analiza-zwarcia': 'Zwarcia',
  'ikona-analiza-rozplyw-mocy': 'Rozpływ mocy',
  'ikona-analiza-napiecie': 'Napięcie',
  'ikona-analiza-prad': 'Prąd',
  'ikona-analiza-siec-zerowa': 'Sieć zerowa',
  'ikona-analiza-stan-fazowy': 'Stan fazowy',
  'ikona-analiza-stabilnosc': 'Stabilność',
  'ikona-analiza-selektywnosc': 'Selektywność',
  'ikona-analiza-frt': 'FRT',
  'ikona-wynik-uzasadnienie': 'Uzasadnienie inżynierskie',
  'ikona-wynik-raport': 'Raport',
  'ikona-dane-katalogowe': 'Dane katalogowe',
  'ikona-dane-reczne': 'Dane ręczne',
  'ikona-dane-oszacowane': 'Dane oszacowane',
} as const;

export const statusIconRegistry = {
  'ikona-stan-blad': 'Błąd krytyczny',
  'ikona-stan-ostrzezenie': 'Ostrzeżenie techniczne',
  'ikona-stan-blokada': 'Blokada',
} as const;

export const screenIconRegistry = {
  'ikona-ekran-pulpit-projektu': 'Pulpit projektu',
  'ikona-ekran-sld': 'Główne środowisko pracy SLD',
  'ikona-ekran-panel-modelu': 'Panel modelu sieci',
  'ikona-ekran-inspektor-techniczny': 'Karta techniczna układu',
  'ikona-ekran-gotowosc-modelu': 'Kontrola modelu',
  'ikona-ekran-menu-obiektu': 'Menu obiektu na SLD',
  'ikona-ekran-nakladki-wynikowe': 'Nakładki wynikowe SLD',
  'ikona-ekran-przypadki-obliczeniowe': 'Zakresy obliczeń',
  'ikona-ekran-warianty-pracy': 'Warianty pracy',
  'ikona-ekran-migawki-historia': 'Wersje modelu i historia obliczeń',
  'ikona-ekran-gpz': 'Główny Punkt Zasilający',
  'ikona-ekran-pole-sn': 'Pole SN',
  'ikona-ekran-odcinek-sn': 'Odcinek sieci SN',
  'ikona-ekran-stacja-sn-nn': 'Stacja transformatorowa SN/nN',
  'ikona-ekran-zksn': 'Złącze kablowe SN',
  'ikona-ekran-slup-rozgalezny': 'Słup rozgałęźny',
  'ikona-ekran-odgalezienie': 'Odgałęzienie',
  'ikona-ekran-punkt-normalnie-otwarty': 'Punkt normalnie otwarty',
  'ikona-ekran-transformator': 'Transformator SN/nN',
  'ikona-ekran-strona-nn': 'Strona nN stacji',
  'ikona-ekran-obciazenie-nn': 'Obciążenie nN',
  'ikona-ekran-zrodlo-pv': 'Źródło fotowoltaiczne',
  'ikona-ekran-magazyn-energii': 'Magazyn energii',
  'ikona-ekran-farma-wiatrowa': 'Farma wiatrowa',
  'ikona-ekran-profile': 'Profile operatora i źródeł',
  'ikona-ekran-charakterystyki-regulacyjne': 'Charakterystyki regulacyjne',
  'ikona-ekran-frt-lvrt-hvrt': 'Charakterystyki FRT/LVRT/HVRT',
  'ikona-ekran-zabezpieczenia-automatyka': 'Zabezpieczenia i automatyka',
  'ikona-ekran-koordynacja-zabezpieczen': 'Koordynacja zabezpieczeń',
  'ikona-ekran-siec-zerowa': 'Sieć zerowa i składowe symetryczne',
  'ikona-ekran-rozplyw-mocy': 'Rozpływ mocy',
  'ikona-ekran-stan-fazowy': 'Stan fazowy SN',
  'ikona-ekran-stabilnosc-dynamiczna': 'Stabilność dynamiczna',
  'ikona-ekran-wklady-zrodel': 'Wkłady źródeł',
  'ikona-ekran-weryfikacja-cieplna-dynamiczna': 'Weryfikacja cieplna i dynamiczna',
  'ikona-ekran-wyniki-porownania': 'Wyniki i porównania',
  'ikona-ekran-uzasadnienie': 'Uzasadnienie inżynierskie',
  'ikona-ekran-raporty-osd-audytowe': 'Raporty OSD i audytowe',
  'ikona-ekran-katalogi-techniczne': 'Katalogi techniczne',
  'ikona-ekran-historia-audyt': 'Historia i audyt',
} as const;

export const technicalIconRegistry = {
  ...areaIconRegistry,
  ...objectIconRegistry,
  ...analysisIconRegistry,
  ...statusIconRegistry,
  ...screenIconRegistry,
} as const;

export type TechnicalIconName = keyof typeof technicalIconRegistry;

const modelNetwork = (
  <>
    <path d="M9 3v18" />
    <circle cx="9" cy="7" r="1.7" />
    <circle cx="9" cy="15" r="1.7" />
    <path d="M9 15h7" />
    <circle cx="17" cy="15" r="1.7" />
  </>
);

const sldTopology = (
  <>
    <path d="M4 6h16" />
    <path d="M12 6v12" />
    <rect x="9.5" y="10" width="5" height="4" rx="0.5" />
    <circle cx="12" cy="18" r="1.5" />
  </>
);

const study = (
  <>
    <path d="M6 3.5h8l4 4V20H6z" />
    <path d="M14 3.5V8h4" />
    <path d="M8 15c1.5-4 3.1 4 4.6 0s3 4 4.4 0" />
    <path d="M8 11h3" />
  </>
);

const results = (
  <>
    <path d="M4 19h16" />
    <path d="M5 15l4-4 3 2 5-7" />
    <circle cx="12" cy="13" r="1.3" />
    <path d="M5 6h5M5 9h3M14 17h5" />
  </>
);

const protection = (
  <>
    <rect x="5" y="3.5" width="8" height="7" rx="0.8" />
    <path d="M8 7h2.5M9 5.5v3" />
    <path d="M13 7h4v4" />
    <path d="M10 13v2.5" />
    <path d="M7 18h6l2-3H9z" />
  </>
);

const sourceConnection = (
  <>
    <circle cx="7" cy="9" r="3.2" />
    <path d="M4.8 9c.8-1.8 1.7 1.8 2.6 0s1.7 1.8 2.4 0" />
    <rect x="12" y="6.5" width="4" height="5" rx="0.5" />
    <path d="M10.2 9h1.8M16 9h4M20 6v6" />
  </>
);

const catalog = (
  <>
    <path d="M7 5h10v13H7z" />
    <path d="M5 7h10M9 3h10v13" />
    <path d="M9 10h5M9 13h7M9 16h4" />
  </>
);

const report = (
  <>
    <path d="M6 3.5h9l3 3V20H6z" />
    <path d="M15 3.5V7h3" />
    <path d="M8 11h6M8 14h8M8 17h5" />
    <circle cx="16.5" cy="16.5" r="2" />
    <path d="M15.4 16.5l.7.7 1.4-1.5" />
  </>
);

const history = (
  <>
    <circle cx="8" cy="8" r="3.5" />
    <path d="M8 5.7V8l1.7 1" />
    <path d="M5 17h14" />
    <circle cx="7" cy="17" r="1.3" />
    <circle cx="12" cy="17" r="1.3" />
    <circle cx="17" cy="17" r="1.3" />
  </>
);

const transformer = (
  <>
    <circle cx="9" cy="12" r="3.3" />
    <circle cx="15" cy="12" r="3.3" />
    <path d="M4 12h2M18 12h2" />
  </>
);

const lineCable = (
  <>
    <path d="M4 10h16" />
    <path d="M4 14h16" />
  </>
);

const lineOverhead = (
  <>
    <path d="M4 12h4m3 0h4m3 0h2" />
    <path d="M6 9v6M18 9v6" />
  </>
);

const noPoint = (
  <>
    <path d="M4 12h6" />
    <path d="M14 12h6" />
    <path d="M10 12l4-4" />
    <text x="14" y="19" fontSize="5" stroke="none" fill="currentColor">NO</text>
  </>
);

const ICON_PATHS: Record<TechnicalIconName, ReactNode> = {
  'ikona-obszar-model-sieci': modelNetwork,
  'ikona-obszar-schemat-topologia': sldTopology,
  'ikona-obszar-studia-obliczeniowe': study,
  'ikona-obszar-wyniki-analizy': results,
  'ikona-obszar-zabezpieczenia-automatyka': protection,
  'ikona-obszar-zrodla-przylaczenia': sourceConnection,
  'ikona-obszar-katalogi-techniczne': catalog,
  'ikona-obszar-raporty-uzasadnienia': report,
  'ikona-obszar-historia-audyt': history,
  'ikona-obiekt-gpz': sourceConnection,
  'ikona-obiekt-szyna': <path d="M3 12h18" strokeWidth={3} />,
  'ikona-obiekt-pole-sn': sldTopology,
  'ikona-obiekt-wylacznik': <><path d="M12 3v18" /><rect x="8.5" y="9" width="7" height="6" rx="0.5" /><path d="M9 15l6-6" /></>,
  'ikona-obiekt-rozlacznik': <><path d="M5 12h5" /><path d="M14 12h5" /><path d="M10 12l4-4" /></>,
  'ikona-obiekt-odlacznik': <><path d="M5 12h5" /><path d="M15 12h4" /><path d="M10 12l5-3" /><circle cx="10" cy="12" r="1.2" /><circle cx="15" cy="12" r="1.2" /></>,
  'ikona-obiekt-uziemnik': <><path d="M12 4v10" /><path d="M8 14h8M9.5 17h5M11 20h2" /></>,
  'ikona-obiekt-bezpiecznik': <><path d="M4 12h5M15 12h5" /><rect x="9" y="9" width="6" height="6" rx="0.5" /></>,
  'ikona-obiekt-przekladnik-pradowy': <><circle cx="12" cy="12" r="4" /><path d="M4 12h4M16 12h4" /><text x="10" y="14" fontSize="5" stroke="none" fill="currentColor">I</text></>,
  'ikona-obiekt-przekladnik-napieciowy': <><circle cx="12" cy="12" r="4" /><path d="M12 4v4M12 16v4" /><text x="9.5" y="14" fontSize="5" stroke="none" fill="currentColor">U</text></>,
  'ikona-obiekt-transformator': transformer,
  'ikona-obiekt-kabel-sn': lineCable,
  'ikona-obiekt-linia-napowietrzna': lineOverhead,
  'ikona-obiekt-zksn': <><rect x="5" y="6" width="14" height="12" rx="0.8" /><path d="M5 12H2M19 12h3M12 18v3" /></>,
  'ikona-obiekt-slup-rozgalezny': <><path d="M12 4l5 8-5 8-5-8z" /><path d="M12 12h8M12 12v8" /></>,
  'ikona-obiekt-stacja-sn-nn': <><rect x="4" y="5" width="16" height="14" rx="1" />{transformer}<path d="M6 8h12" /></>,
  'ikona-obiekt-strona-nn': <><path d="M5 8h14" /><path d="M7 8v8M12 8v8M17 8v8" /></>,
  'ikona-obiekt-obciazenie': <><path d="M12 5v9" /><path d="M8 14h8l-4 5z" /></>,
  'ikona-obiekt-zrodlo-pv': <><path d="M5 7h7v5H5zM6 9h5M8.5 7v5" /><rect x="14" y="8" width="4" height="5" rx="0.5" /><path d="M18 10.5h3" /></>,
  'ikona-obiekt-magazyn-energii': <><rect x="5" y="8" width="8" height="6" rx="0.8" /><path d="M13 10h1.5M7 10h4M7 12h4" /><rect x="16" y="8.5" width="3" height="5" rx="0.5" /></>,
  'ikona-obiekt-farma-wiatrowa': <><circle cx="9" cy="9" r="1.2" /><path d="M9 9l-4-2M9 9l4-2M9 9v5" /><path d="M14 15h6" /></>,
  'ikona-obiekt-punkt-normalnie-otwarty': noPoint,
  'ikona-analiza-zwarcia': <><path d="M4 12h7m3 0h6" /><path d="M12 8l-2 4h4l-2 4" /><path d="M15 7c2 1.5 2 4.5 0 6" /></>,
  'ikona-analiza-rozplyw-mocy': <><path d="M4 12h14" /><path d="M14 8l4 4-4 4" /><text x="6" y="9" fontSize="4.5" stroke="none" fill="currentColor">P/Q</text></>,
  'ikona-analiza-napiecie': <><path d="M4 12h16" /><text x="9" y="9" fontSize="6" stroke="none" fill="currentColor">U</text></>,
  'ikona-analiza-prad': <><path d="M12 4v16" /><text x="14" y="13" fontSize="6" stroke="none" fill="currentColor">I</text></>,
  'ikona-analiza-siec-zerowa': <><path d="M5 8h11M5 12h11M5 16h11" /><text x="18" y="14" fontSize="6" stroke="none" fill="currentColor">0</text></>,
  'ikona-analiza-stan-fazowy': <><path d="M4 8c2-4 4 4 6 0s4 4 6 0 3 0 4 0" /><path d="M4 12c2-4 4 4 6 0s4 4 6 0 3 0 4 0" /><path d="M4 16c2-4 4 4 6 0s4 4 6 0 3 0 4 0" /></>,
  'ikona-analiza-stabilnosc': <><path d="M4 18h16M5 17c4-12 8-12 14-3" /><path d="M15 8v10" /></>,
  'ikona-analiza-selektywnosc': <><path d="M4 18h16M6 16c3-8 5-9 8-12M9 18c3-6 5-7 9-10" /></>,
  'ikona-analiza-frt': <><path d="M4 18h16M6 8v6h5v-3h7" /><path d="M6 8h12" /></>,
  'ikona-wynik-uzasadnienie': report,
  'ikona-wynik-raport': report,
  'ikona-dane-katalogowe': catalog,
  'ikona-dane-reczne': <><path d="M5 17l1 3 3-1L18 10l-4-4z" /><path d="M12 8l4 4" /></>,
  'ikona-dane-oszacowane': <><text x="6" y="15" fontSize="11" stroke="none" fill="currentColor">≈</text><path d="M13 8h6M13 12h5M13 16h6" /></>,
  'ikona-stan-blad': <><path d="M12 3l9 9-9 9-9-9z" /><path d="M9 9l6 6M15 9l-6 6" /></>,
  'ikona-stan-ostrzezenie': <><path d="M12 4l9 16H3z" /><path d="M12 9v5M12 17h.01" /></>,
  'ikona-stan-blokada': <><rect x="5" y="10" width="14" height="10" rx="1.5" /><path d="M8 10V7a4 4 0 018 0v3" /></>,
  'ikona-ekran-pulpit-projektu': modelNetwork,
  'ikona-ekran-sld': sldTopology,
  'ikona-ekran-panel-modelu': modelNetwork,
  'ikona-ekran-inspektor-techniczny': <><rect x="5" y="4" width="14" height="16" rx="1" /><path d="M8 8h8M8 12h6M8 16h5" /><circle cx="16" cy="16" r="1.2" /></>,
  'ikona-ekran-gotowosc-modelu': <><path d="M6 5h12v14H6z" /><path d="M8 9l1.5 1.5L12 8M8 14l1.5 1.5L12 13" /></>,
  'ikona-ekran-menu-obiektu': <><rect x="5" y="5" width="7" height="7" rx="0.8" /><path d="M14 7h5M14 11h4M8.5 12v5" /></>,
  'ikona-ekran-nakladki-wynikowe': results,
  'ikona-ekran-przypadki-obliczeniowe': study,
  'ikona-ekran-warianty-pracy': <><path d="M5 7h8l3 3h3M5 17h8l3-3h3" /><circle cx="5" cy="7" r="1.3" /><circle cx="5" cy="17" r="1.3" /></>,
  'ikona-ekran-migawki-historia': history,
  'ikona-ekran-gpz': sourceConnection,
  'ikona-ekran-pole-sn': sldTopology,
  'ikona-ekran-odcinek-sn': lineCable,
  'ikona-ekran-stacja-sn-nn': transformer,
  'ikona-ekran-zksn': <><rect x="5" y="6" width="14" height="12" rx="0.8" /><path d="M5 12H2M19 12h3M12 18v3" /></>,
  'ikona-ekran-slup-rozgalezny': <><path d="M12 4l5 8-5 8-5-8z" /><path d="M12 12h8" /></>,
  'ikona-ekran-odgalezienie': modelNetwork,
  'ikona-ekran-punkt-normalnie-otwarty': noPoint,
  'ikona-ekran-transformator': transformer,
  'ikona-ekran-strona-nn': <><path d="M5 8h14" /><path d="M7 8v8M12 8v8M17 8v8" /></>,
  'ikona-ekran-obciazenie-nn': <><path d="M12 5v9" /><path d="M8 14h8l-4 5z" /></>,
  'ikona-ekran-zrodlo-pv': <><path d="M5 7h7v5H5zM6 9h5M8.5 7v5" /><rect x="14" y="8" width="4" height="5" rx="0.5" /></>,
  'ikona-ekran-magazyn-energii': <><rect x="5" y="8" width="8" height="6" rx="0.8" /><rect x="16" y="8.5" width="3" height="5" rx="0.5" /></>,
  'ikona-ekran-farma-wiatrowa': <><circle cx="9" cy="9" r="1.2" /><path d="M9 9l-4-2M9 9l4-2M9 9v5" /><path d="M14 15h6" /></>,
  'ikona-ekran-profile': results,
  'ikona-ekran-charakterystyki-regulacyjne': results,
  'ikona-ekran-frt-lvrt-hvrt': <><path d="M4 18h16M6 8v6h5v-3h7" /></>,
  'ikona-ekran-zabezpieczenia-automatyka': protection,
  'ikona-ekran-koordynacja-zabezpieczen': <><path d="M4 18h16M6 16c3-8 5-9 8-12M9 18c3-6 5-7 9-10" /></>,
  'ikona-ekran-siec-zerowa': <><path d="M5 8h11M5 12h11M5 16h11" /><text x="18" y="14" fontSize="6" stroke="none" fill="currentColor">0</text></>,
  'ikona-ekran-rozplyw-mocy': results,
  'ikona-ekran-stan-fazowy': <><path d="M4 8c2-4 4 4 6 0s4 4 6 0 3 0 4 0" /><path d="M4 14c2-4 4 4 6 0s4 4 6 0 3 0 4 0" /></>,
  'ikona-ekran-stabilnosc-dynamiczna': <><path d="M4 18h16M5 17c4-12 8-12 14-3" /></>,
  'ikona-ekran-wklady-zrodel': sourceConnection,
  'ikona-ekran-weryfikacja-cieplna-dynamiczna': <><path d="M4 12h16" /><path d="M8 8l8 8M16 8l-8 8" /><text x="7" y="7" fontSize="4" stroke="none" fill="currentColor">I²t</text></>,
  'ikona-ekran-wyniki-porownania': results,
  'ikona-ekran-uzasadnienie': report,
  'ikona-ekran-raporty-osd-audytowe': report,
  'ikona-ekran-katalogi-techniczne': catalog,
  'ikona-ekran-historia-audyt': history,
};

interface TechnicalIconProps {
  name: TechnicalIconName;
  status?: TechnicalIconStatus;
  size?: 16 | 20 | 24 | 32;
  className?: string;
}

export function TechnicalIcon({
  name,
  status = 'normal',
  size = 24,
  className,
}: TechnicalIconProps) {
  return (
    <svg
      className={clsx(
        status === 'inactive' && 'opacity-50',
        status === 'active' && 'text-scada-sn',
        status === 'warning' && 'text-scada-grounded',
        status === 'error' && 'text-scada-alarm',
        status === 'locked' && 'text-scada-muted',
        className,
      )}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-icon-name={name}
      data-icon-status={status}
    >
      {ICON_PATHS[name]}
      {status === 'warning' && <path d="M17.5 3.5l3 5h-6z" fill="currentColor" stroke="none" />}
      {status === 'error' && <path d="M17 4l3 3M20 4l-3 3" />}
      {status === 'locked' && <><rect x="16" y="3.5" width="5" height="4" rx="0.8" /><path d="M17 3.5V2.8a1.5 1.5 0 013 0v.7" /></>}
      {status === 'audit' && <path d="M17 3.5h3v4h-3z" />}
    </svg>
  );
}

export function hasTechnicalIcon(name: string): name is TechnicalIconName {
  return Object.prototype.hasOwnProperty.call(technicalIconRegistry, name);
}
