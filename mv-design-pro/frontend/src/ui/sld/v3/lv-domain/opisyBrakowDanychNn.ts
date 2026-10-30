/**
 * Opisy pozycji listy braków danych analiz obwodu nN (domena nN, pętla zwarcia, SWZ,
 * równoważnik SN) — JEDEN słownik frontu, lustro backendu
 * `application/analyses/fault_loop/service.py::opis_braku_danych_nn`
 * (`OPISY_BRAKOW_DANYCH_NN_PL`, `OPISY_BRAKOW_PREDYKATU_PL`, nazwy pól transformatora).
 * Parytet kluczy i tekstów przypina `backend/tests/application/analyses/
 * test_opisy_brakow_danych_nn.py`. Kod maszynowy zostaje w danych i atrybutach
 * `data-*`; tekst dla projektanta nigdy go nie pokazuje.
 */

export const OPISY_BRAKOW_DANYCH_NN: Readonly<Record<string, string>> = {
  station: 'brak stacji w modelu sieci',
  transformer: 'brak transformatora stacji',
  transformer_not_in_station: 'wskazany transformator nie należy do stacji',
  route: 'brak trasy do źródła w aktualnej topologii',
  lv_earthing_system: 'brak układu uziemienia sieci nN transformatora',
  upstream_network_topology_invalid: 'topologia sieci SN niepoprawna (źródło poza szyną modelu) — równoważnik nieobliczalny',
  upstream_network_singular: 'sieć SN osobliwa — brak drogi do źródła',
  upstream_hv_bus: 'szyna SN transformatora poza rozwiązywalną siecią',
  upstream_network_source: 'brak źródła zasilania sieci SN',
  lv_bus: 'stacja bez szyny w paśmie nN',
  lv_bus_ref: 'transformator bez szyny strony nN',
  worst_point_bus_ref: 'brak policzalnego najgorszego punktu odpływu',
  breaker: 'brak wyłącznika obwodu',
  breaker_catalog_binding: 'wyłącznik obwodu bez powiązania z katalogiem aparatów',
  'lv_neutral.r_ohm': 'brak rezystancji uziemienia roboczego R_B punktu neutralnego',
  earth_electrode_r_ohm: 'brak rezystancji uziomu ochronnego R_A',
  rcd: 'brak wyłącznika różnicowoprądowego obwodu',
  b0_siemens_per_km: 'brak pojemności doziemnej (susceptancji zerowej b_0) odcinka',
  'header.defaults.frequency_hz': 'brak częstotliwości znamionowej sieci w nagłówku modelu',
  transformer_zero_sequence_lv_local_ground: '„Grupa połączeń” bez lokalnie uziemionego punktu gwiazdowego strony nN — pętla L-PE/L-PEN nie ma drogi powrotnej przez transformator (np. Dyn ją daje)',
  pk_kw_sprzeczne_z_uk_percent: '„Straty obciążeniowe Pk” sprzeczne z „Napięciem zwarcia uk” (Pk/Sn większe niż uk)',
  sn_mva: '„Moc znamionowa”',
  uk_percent: '„Napięcie zwarcia uk”',
  ulv_kv: '„Napięcie DN”',
  vector_group: '„Grupa połączeń”',
};

/** Opis kodu spoza słownika — uczciwe zdanie zamiast kodu maszynowego. */
export const BRAK_SPOZA_SLOWNIKA_NN = 'brak danej spoza słownika aplikacji';

/** Miejsce braku z przedrostka pozycji (`swz`, `upstream:<transformator>`, `<element>`). */
function miejsceBraku(przedrostek: string): string {
  if (przedrostek === 'swz') return 'ocena samoczynnego wyłączenia zasilania';
  const dwukropek = przedrostek.indexOf(':');
  if (dwukropek > 0 && przedrostek.slice(0, dwukropek) === 'upstream') {
    return `równoważnik sieci SN transformatora ${przedrostek.slice(dwukropek + 1)}`;
  }
  return `element ${przedrostek}`;
}

/** Opis pozycji listy braków (`kod` albo `<przedrostek>:<kod>`) — nigdy kod maszynowy. */
export function opisBrakuDanychNn(wpis: string): string {
  const dwukropek = wpis.lastIndexOf(':');
  const przedrostek = dwukropek >= 0 ? wpis.slice(0, dwukropek) : '';
  const kod = dwukropek >= 0 ? wpis.slice(dwukropek + 1) : wpis;
  const opis = OPISY_BRAKOW_DANYCH_NN[kod] ?? BRAK_SPOZA_SLOWNIKA_NN;
  return przedrostek ? `${opis} (${miejsceBraku(przedrostek)})` : opis;
}

/** Lista braków jako jedno zdanie (separator `; `) albo `null` dla pustej listy. */
export function opisyBrakowDanychNn(wpisy: readonly string[] | undefined): string | null {
  return wpisy && wpisy.length > 0 ? wpisy.map(opisBrakuDanychNn).join('; ') : null;
}
