/*
 * Opis kroku śladu rekordu werdyktu dla projektanta (karta #145).
 *
 * DLACZEGO. Silnik prób NC RfG (`network_model/solvers/ncrfg_ptpiree/engine.py`, rdzeń
 * zamrożony — bramka B-01) opisuje odnośnik śladu zdaniem z kluczem technicznym:
 * „krok śladu testu T05 (czas_regulacji_p)". Tego tekstu nie wolno poprawić u źródła, a
 * karta #145 (§0 pkt 3) zabrania pokazywać go surowo — więc widok składa polski opis z
 * DANYCH odnośnika: identyfikator kroku `proof:ncrfg-ptpiree:<test>:<klucz>:<numer>` niesie
 * numer testu i klucz kroku, a klucz ma nazwę z mapy poniżej.
 *
 * Mapa jest TYPOWANA zamkniętą unią kluczy kroków silnika; parytet z kodem silnika (każde
 * `trace.add(test_id, "<klucz>", …)` w `engine.py`) pilnuje test
 * `__tests__/opisKrokuSladu.test.ts` — nowy klucz w silniku zapala czerwień, zanim trafi
 * na ekran jako `snake_case`. Odnośnik innego pochodzenia (LoM, stabilność, dowody V12.6)
 * niesie już polski opis (`opis_pl`) i przechodzi bez zmian.
 */

import type { OdnosnikSladu } from './werdykt';

/** Klucze kroków śladu silnika prób NC RfG (drugi argument `TraceBuilder.add`). */
export type KluczKrokuNcRfg =
  | 'stosowalnosc'
  | 'ocena_kryterium'
  | 'frequency_response'
  | 'tempo_odbudowy'
  | 'czas_regulacji_p'
  | 'zakres_mocy_biernej'
  | 'wspolczynnik_mocy'
  | 'zaprzestanie_generacji'
  | 'pozostanie_w_pracy_bez_biegu'
  | 'odbudowa_p'
  | 'prad_bierny_frt'
  | 'zdolnosci_dodatkowe'
  | 'thd_u';

/** Polska nazwa kroku śladu silnika prób NC RfG — co krok sprawdza. */
export const NAZWY_KROKOW_NCRFG: Readonly<Record<KluczKrokuNcRfg, string>> = {
  stosowalnosc: 'stosowalność testu do modułu',
  ocena_kryterium: 'ocena kryterium (reguła statusu rekordu)',
  frequency_response: 'odpowiedź częstotliwościowa (statyzm i strefa martwa)',
  tempo_odbudowy: 'tempo odbudowy mocy czynnej',
  czas_regulacji_p: 'czas ustalenia regulacji mocy czynnej',
  zakres_mocy_biernej: 'zakres mocy biernej',
  wspolczynnik_mocy: 'współczynnik mocy',
  zaprzestanie_generacji: 'zaprzestanie generacji',
  pozostanie_w_pracy_bez_biegu: 'pozostanie w pracy podczas zakłócenia (bez biegu dynamiki)',
  odbudowa_p: 'odbudowa mocy czynnej po zakłóceniu',
  prad_bierny_frt: 'prąd bierny podczas zakłócenia',
  zdolnosci_dodatkowe: 'zdolności dodatkowe modułu',
  thd_u: 'współczynnik odkształcenia napięcia THDu',
};

/** Identyfikator kroku śladu silnika prób: `proof:ncrfg-ptpiree:<test>:<klucz>:<numer>`. */
const KROK_NCRFG = /^proof:ncrfg-ptpiree:([A-Z0-9]+):([a-z0-9_]+):\d+$/;

function jestKluczemNcRfg(klucz: string): klucz is KluczKrokuNcRfg {
  return Object.prototype.hasOwnProperty.call(NAZWY_KROKOW_NCRFG, klucz);
}

/**
 * Opis odnośnika śladu dla pierwszego planu karty werdyktu. Krok silnika prób NC RfG →
 * „krok śladu testu T05: czas ustalenia regulacji mocy czynnej"; klucz spoza mapy (nowy
 * krok silnika przed aktualizacją mapy — test parytetu go łapie) → opis bez klucza
 * („krok śladu testu T05"). Każdy inny odnośnik → `opis_pl` bez zmian.
 */
export function opisOdnosnikaSladu(odnosnik: OdnosnikSladu): string {
  const dopasowanie = KROK_NCRFG.exec(odnosnik.krok);
  if (dopasowanie === null) return odnosnik.opis_pl;
  const [, test, klucz] = dopasowanie;
  return jestKluczemNcRfg(klucz)
    ? `krok śladu testu ${test}: ${NAZWY_KROKOW_NCRFG[klucz]}`
    : `krok śladu testu ${test}`;
}
