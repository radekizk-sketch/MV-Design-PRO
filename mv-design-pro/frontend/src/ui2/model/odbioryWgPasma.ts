/**
 * Karta GPZ-H5-SLD (pkt 2): grupowanie odbiorów wg PASMA NAPIĘCIOWEGO ich szyny
 * (`Load.bus_ref` → `Bus.voltage_kv` → `pasmoNapieciowe`). Dawniej każda lista odbiorów
 * modelu nosiła tytuł „Odbiory nN", więc odbiór przyłączony do szyny sekcji SN GPZ (albo do
 * szyny 110 kV) stał w grupie nN — opis niezgodny z modelem.
 *
 * Jedna funkcja dla wszystkich miejsc, które dzielą odbiory na grupy (drzewo schematu,
 * panel procesu budowy sieci); pasmo z JEDNEGO predykatu (`pasmoNapieciowe`). Szyna bez
 * napięcia w modelu (albo odbiór bez szyny w modelu) trafia do jawnej grupy braku danych —
 * nigdy do nN z domysłu.
 */
import { pasmoNapieciowe, type Pasmo } from './pasmaNapieciowe';

export type KluczGrupyOdbiorow = Pasmo | 'brak';

export const TYTUL_GRUPY_ODBIOROW: Readonly<Record<KluczGrupyOdbiorow, string>> = {
  WN: 'Odbiory WN',
  SN: 'Odbiory SN',
  nN: 'Odbiory nN',
  brak: 'Odbiory — szyna bez napięcia w modelu',
};

/** Porządek grup: od najwyższego napięcia, grupa braku danych na końcu. */
const PORZADEK: readonly KluczGrupyOdbiorow[] = ['WN', 'SN', 'nN', 'brak'];

export interface GrupaOdbiorow<T> {
  readonly klucz: KluczGrupyOdbiorow;
  readonly tytul: string;
  readonly odbiory: readonly T[];
}

export interface SzynaZNapieciem {
  readonly ref_id: string;
  readonly voltage_kv?: number | null;
}

/** Pasmo szyny odbioru; `'brak'` gdy szyny nie ma w modelu albo nie niesie napięcia. */
export function pasmoSzynyOdbioru(
  busRef: string | null | undefined,
  napiecieSzyny: ReadonlyMap<string, number | null | undefined>,
): KluczGrupyOdbiorow {
  if (!busRef) return 'brak';
  return pasmoNapieciowe(napiecieSzyny.get(busRef)) ?? 'brak';
}

/** Odbiory w grupach pasm (puste grupy pominięte, kolejność odbiorów w grupie zachowana). */
export function grupujOdbioryWgPasma<T>(
  odbiory: readonly T[],
  busRefOdbioru: (odbior: T) => string | null | undefined,
  szyny: readonly SzynaZNapieciem[],
): readonly GrupaOdbiorow<T>[] {
  const napiecieSzyny = new Map(szyny.map((szyna) => [szyna.ref_id, szyna.voltage_kv]));
  return grupujWgKluczaPasma(odbiory, (odbior) => pasmoSzynyOdbioru(busRefOdbioru(odbior), napiecieSzyny));
}

/** Te same grupy dla odbiorów, których pasmo jest już policzone (`pasmoSzynyOdbioru`). */
export function grupujWgKluczaPasma<T>(
  odbiory: readonly T[],
  kluczOdbioru: (odbior: T) => KluczGrupyOdbiorow,
): readonly GrupaOdbiorow<T>[] {
  const wgKlucza = new Map<KluczGrupyOdbiorow, T[]>();
  for (const odbior of odbiory) {
    const klucz = kluczOdbioru(odbior);
    const lista = wgKlucza.get(klucz) ?? [];
    lista.push(odbior);
    wgKlucza.set(klucz, lista);
  }
  return PORZADEK.filter((klucz) => wgKlucza.has(klucz)).map((klucz) => ({
    klucz,
    tytul: TYTUL_GRUPY_ODBIOROW[klucz],
    odbiory: wgKlucza.get(klucz)!,
  }));
}
