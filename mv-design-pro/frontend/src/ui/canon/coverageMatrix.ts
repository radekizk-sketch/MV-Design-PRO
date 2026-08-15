import type { CanonicalScreenCode, KodDziedzinyEkranu } from '../workspace/screenCanonRegistry';
import type { TechnicalIconName } from '../icons/technicalIconRegistry';

export type CoverageStatus = 'pełne pokrycie';

export interface CoverageMatrixRow {
  scope: string;
  area: KodDziedzinyEkranu;
  screen: CanonicalScreenCode;
  icon: TechnicalIconName;
  panel: string;
  menu: string;
  click: string;
  result: string;
  report: string;
  status: CoverageStatus;
}

export const COVERAGE_MATRIX: readonly CoverageMatrixRow[] = [
  { scope: 'GPZ uproszczony i pełny', area: 'MODEL_SIECI', screen: 'E-10', icon: 'ikona-ekran-gpz', panel: 'Panel modelu sieci', menu: 'Menu GPZ', click: 'Utwórz GPZ lub klik GPZ na SLD', result: 'Kontrola GPZ i parametry zasilania', report: 'Raport modelu i audytu', status: 'pełne pokrycie' },
  { scope: 'Pola SN', area: 'MODEL_SIECI', screen: 'E-11', icon: 'ikona-ekran-pole-sn', panel: 'Drzewo GPZ i pól', menu: 'Menu pola SN', click: 'Klik pola SN na SLD', result: 'Wyniki pola, kontrola i zabezpieczenia', report: 'Raport pola i nastaw', status: 'pełne pokrycie' },
  { scope: 'Magistrale i odgałęzienia', area: 'MODEL_SIECI', screen: 'E-12', icon: 'ikona-ekran-odcinek-sn', panel: 'Drzewo odcinków', menu: 'Menu odcinka', click: 'Klik odcinka lub portu', result: 'Prądy, spadki napięcia i obciążalność', report: 'Raport topologii', status: 'pełne pokrycie' },
  { scope: 'ZKSN', area: 'MODEL_SIECI', screen: 'E-14', icon: 'ikona-ekran-zksn', panel: 'Lista złączy', menu: 'Menu ZKSN', click: 'Klik ZKSN', result: 'Parametry, przepływy i kontrola', report: 'Raport elementów sieci', status: 'pełne pokrycie' },
  { scope: 'Słupy rozgałęźne', area: 'MODEL_SIECI', screen: 'E-15', icon: 'ikona-ekran-slup-rozgalezny', panel: 'Lista punktów rozgałęzień', menu: 'Menu słupa rozgałęźnego', click: 'Klik słupa', result: 'Parametry odcinków i odgałęzień', report: 'Raport topologii', status: 'pełne pokrycie' },
  { scope: 'Stacje SN/nN', area: 'MODEL_SIECI', screen: 'E-13', icon: 'ikona-ekran-stacja-sn-nn', panel: 'Drzewo stacji', menu: 'Menu stacji', click: 'Klik stacji', result: 'Obciążenie, napięcia i transformator', report: 'Raport stacji', status: 'pełne pokrycie' },
  { scope: 'Strona nN', area: 'MODEL_SIECI', screen: 'E-19', icon: 'ikona-ekran-strona-nn', panel: 'Sekcja stacji', menu: 'Menu strony nN', click: 'Klik strony nN', result: 'Sumy obciążeń nN', report: 'Raport stacji', status: 'pełne pokrycie' },
  { scope: 'Obciążenia', area: 'MODEL_SIECI', screen: 'E-20', icon: 'ikona-ekran-obciazenie-nn', panel: 'Lista obciążeń', menu: 'Menu obciążenia', click: 'Klik obciążenia', result: 'P, Q, profil i wpływ na przepływ', report: 'Raport obciążeń', status: 'pełne pokrycie' },
  { scope: 'Układy PV', area: 'ZRODLA_PRZYLACZENIA', screen: 'E-21', icon: 'ikona-ekran-zrodlo-pv', panel: 'Lista układów PV/BESS/FW', menu: 'Menu układu PV', click: 'Klik układu PV', result: 'Zgodność, wkład zwarciowy i profil', report: 'Raport zgodności', status: 'pełne pokrycie' },
  { scope: 'Magazyny energii', area: 'ZRODLA_PRZYLACZENIA', screen: 'E-22', icon: 'ikona-ekran-magazyn-energii', panel: 'Lista magazynów', menu: 'Menu źródła', click: 'Klik magazynu', result: 'Tryby P/Q, FRT i wkład zwarciowy', report: 'Raport zgodności', status: 'pełne pokrycie' },
  { scope: 'Farmy wiatrowe PMSG/DFIG/SCIG', area: 'ZRODLA_PRZYLACZENIA', screen: 'E-23', icon: 'ikona-ekran-farma-wiatrowa', panel: 'Lista farm', menu: 'Menu źródła', click: 'Klik farmy', result: 'Typ generatora, wkład i FRT', report: 'Raport zgodności', status: 'pełne pokrycie' },
  { scope: 'Profile operatora', area: 'ZRODLA_PRZYLACZENIA', screen: 'E-24', icon: 'ikona-ekran-profile', panel: 'Profile wymagań', menu: 'Menu źródła', click: 'Klik profilu operatora', result: 'Wymagania przyłączeniowe', report: 'Raport zgodności', status: 'pełne pokrycie' },
  { scope: 'Profile źródeł', area: 'ZRODLA_PRZYLACZENIA', screen: 'E-24', icon: 'ikona-ekran-profile', panel: 'Profile źródeł', menu: 'Menu źródła', click: 'Klik profilu źródła', result: 'Charakterystyka źródła', report: 'Raport zgodności', status: 'pełne pokrycie' },
  { scope: 'Profile Q(U)', area: 'ZRODLA_PRZYLACZENIA', screen: 'E-25', icon: 'ikona-ekran-charakterystyki-regulacyjne', panel: 'Charakterystyki regulacyjne', menu: 'Menu źródła', click: 'Klik krzywej Q(U)', result: 'Kontrola napięcia', report: 'Raport zgodności', status: 'pełne pokrycie' },
  { scope: 'Profile cos φ(P)', area: 'ZRODLA_PRZYLACZENIA', screen: 'E-25', icon: 'ikona-ekran-charakterystyki-regulacyjne', panel: 'Charakterystyki regulacyjne', menu: 'Menu źródła', click: 'Klik krzywej cos φ(P)', result: 'Regulacja mocy biernej', report: 'Raport zgodności', status: 'pełne pokrycie' },
  { scope: 'Profile FRT/LVRT/HVRT', area: 'ZRODLA_PRZYLACZENIA', screen: 'E-26', icon: 'ikona-ekran-frt-lvrt-hvrt', panel: 'Charakterystyki odporności', menu: 'Menu źródła', click: 'Klik pasma wymagań', result: 'Ocena pozostania przyłączonym', report: 'Raport zgodności', status: 'pełne pokrycie' },
  { scope: 'Przypadki obliczeniowe', area: 'STUDIA_OBLICZENIOWE', screen: 'E-07', icon: 'ikona-ekran-przypadki-obliczeniowe', panel: 'Lista przypadków', menu: 'Menu przypadku', click: 'Klik przypadku', result: 'Zakres analiz', report: 'Raport uruchomienia', status: 'pełne pokrycie' },
  { scope: 'Warianty pracy', area: 'STUDIA_OBLICZENIOWE', screen: 'E-08', icon: 'ikona-ekran-warianty-pracy', panel: 'Lista wariantów', menu: 'Menu wariantu', click: 'Klik wariantu', result: 'Konfiguracja ruchowa', report: 'Raport porównawczy', status: 'pełne pokrycie' },
  { scope: 'Migawki stanów łączników', area: 'HISTORIA_AUDYT', screen: 'E-09', icon: 'ikona-ekran-migawki-historia', panel: 'Oś czasu', menu: 'Menu migawki', click: 'Klik migawki', result: 'Stan łączników', report: 'Raport audytu', status: 'pełne pokrycie' },
  { scope: 'Pełne zwarcia 3F/1F/2F/2F+Z', area: 'WYNIKI_ANALIZY', screen: 'E-35', icon: 'ikona-analiza-zwarcia', panel: 'Wyniki zwarciowe', menu: 'Menu wyniku', click: 'Klik miejsca zwarcia', result: 'Prądy zwarciowe i przekroczenia', report: 'Raport zwarciowy', status: 'pełne pokrycie' },
  { scope: 'Sieć zerowa', area: 'WYNIKI_ANALIZY', screen: 'E-29', icon: 'ikona-ekran-siec-zerowa', panel: 'Wyniki składowych', menu: 'Menu wyniku', click: 'Klik składowej', result: 'Parametry składowej zerowej', report: 'Raport zwarciowy', status: 'pełne pokrycie' },
  { scope: 'Pojemności doziemne', area: 'WYNIKI_ANALIZY', screen: 'E-29', icon: 'ikona-analiza-siec-zerowa', panel: 'Parametry sieci zerowej', menu: 'Menu odcinka', click: 'Klik odcinka', result: 'Pojemność doziemna i sumy', report: 'Raport zwarciowy', status: 'pełne pokrycie' },
  { scope: 'Cewka Petersena', area: 'MODEL_SIECI', screen: 'E-10', icon: 'ikona-obiekt-gpz', panel: 'Uziemienie punktu neutralnego', menu: 'Menu GPZ', click: 'Klik układu uziemienia', result: 'Stopień kompensacji', report: 'Raport zwarciowy', status: 'pełne pokrycie' },
  { scope: 'Rozpływ mocy NR', area: 'WYNIKI_ANALIZY', screen: 'E-30', icon: 'ikona-ekran-rozplyw-mocy', panel: 'Wyniki rozpływu', menu: 'Menu wyniku', click: 'Klik toru', result: 'P, Q, U, I i straty', report: 'Raport rozpływu', status: 'pełne pokrycie' },
  { scope: 'GS diagnostyczny', area: 'STUDIA_OBLICZENIOWE', screen: 'E-04', icon: 'ikona-ekran-gotowosc-modelu', panel: 'Diagnostyka obliczeń', menu: 'Menu przypadku', click: 'Klik diagnostyki', result: 'Zbieżność i przyczyny problemów', report: 'Raport diagnostyczny', status: 'pełne pokrycie' },
  { scope: 'FD wydajnościowy', area: 'STUDIA_OBLICZENIOWE', screen: 'E-04', icon: 'ikona-ekran-gotowosc-modelu', panel: 'Tryby obliczeń', menu: 'Menu przypadku', click: 'Klik trybu', result: 'Szybki wynik obliczeń', report: 'Raport diagnostyczny', status: 'pełne pokrycie' },
  { scope: 'Stan fazowy SN', area: 'WYNIKI_ANALIZY', screen: 'E-31', icon: 'ikona-ekran-stan-fazowy', panel: 'Wyniki fazowe', menu: 'Menu wyniku', click: 'Klik fazy lub toru', result: 'A/B/C i asymetria', report: 'Raport fazowy', status: 'pełne pokrycie' },
  { scope: 'Stabilność dynamiczna', area: 'WYNIKI_ANALIZY', screen: 'E-32', icon: 'ikona-ekran-stabilnosc-dynamiczna', panel: 'Wyniki dynamiczne', menu: 'Menu wyniku', click: 'Klik zdarzenia', result: 'Krzywe czasowe i marginesy', report: 'Raport dynamiczny', status: 'pełne pokrycie' },
  { scope: 'Zabezpieczenia', area: 'ZABEZPIECZENIA_AUTOMATYKA', screen: 'E-27', icon: 'ikona-ekran-zabezpieczenia-automatyka', panel: 'Lista zabezpieczeń', menu: 'Menu zabezpieczenia', click: 'Klik przekaźnika', result: 'Nastawy i czasy działania', report: 'Raport nastaw', status: 'pełne pokrycie' },
  { scope: 'Automatyka SPZ/SZR/SCO/FDIR', area: 'ZABEZPIECZENIA_AUTOMATYKA', screen: 'E-27', icon: 'ikona-ekran-zabezpieczenia-automatyka', panel: 'Lista automatyk', menu: 'Menu automatyki', click: 'Klik automatyki', result: 'Logika działania i blokady', report: 'Raport automatyki', status: 'pełne pokrycie' },
  { scope: 'Selektywność', area: 'ZABEZPIECZENIA_AUTOMATYKA', screen: 'E-28', icon: 'ikona-ekran-koordynacja-zabezpieczen', panel: 'Krzywe czasowo-prądowe', menu: 'Menu koordynacji', click: 'Klik krzywej', result: 'Margines selektywności', report: 'Raport selektywności', status: 'pełne pokrycie' },
  { scope: 'Wyniki na SLD', area: 'WYNIKI_ANALIZY', screen: 'E-06', icon: 'ikona-ekran-nakladki-wynikowe', panel: 'Nakładki wynikowe', menu: 'Menu wyniku', click: 'Klik wartości na SLD', result: 'Wartości na torach i węzłach', report: 'Raport wyników', status: 'pełne pokrycie' },
  { scope: 'Uzasadnienie inżynierskie', area: 'RAPORTY_UZASADNIENIA', screen: 'E-36', icon: 'ikona-ekran-uzasadnienie', panel: 'Lista uzasadnień', menu: 'Menu uzasadnienia', click: 'Klik uzasadnienia', result: 'Ślad danych, wzory i decyzje', report: 'Proof-pack formalny', status: 'pełne pokrycie' },
  { scope: 'Raporty OSD i audytowe', area: 'RAPORTY_UZASADNIENIA', screen: 'E-37', icon: 'ikona-ekran-raporty-osd-audytowe', panel: 'Lista raportów', menu: 'Menu raportu', click: 'Klik raportu', result: 'Raport formalny', report: 'PDF/JSON/paczka audytowa', status: 'pełne pokrycie' },
];
