/**
 * KARTA SZYNY-STACJI-LUSTRO — ILOCZYN CECH jednej reguły przynależności szyny do stacji.
 *
 * Cechy (model `iloczyn` w pliku parytetu, zbiory oczekiwane policzone przez backend
 * `enm.tor_pola.szyny_stacji`):
 *   zacisk pola SN {każdy z czterech kluczy, zacisk = szyna pola, pusty `field_ref`, brak
 *   `bus_ref`, białe znaki} × aparat pola nN {z szyny głównej, łańcuch w ODWROTNEJ
 *   kolejności gałęzi, z obcej szyny z deklaracją tej stacji, z deklaracją innej stacji,
 *   na zacisku wyłącznika głównego} × podrozdzielnica nN jako osobna `Substation` × szyna
 *   bez stacji × kolejność gałęzi {każdy obrót listy, odwrócona}.
 * Stacja A niesie jednocześnie zaciski pól SN i aparaty pól nN — kombinacja, na której
 * rozjeżdżały się dwie dawne połówki reguły (`szynaNalezyDoStacji`, `stationLoadBusRefs`).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { stacjaSzyn, szynyStacji, type GalazDlaSzyn, type StacjaDlaSzyn } from '../szynyStacji';

const here = dirname(fileURLToPath(import.meta.url));
const { iloczyn } = JSON.parse(readFileSync(resolve(here, 'fixtures/szynyStacjiParytet.json'), 'utf8')) as {
  readonly iloczyn: {
    readonly model: { readonly substations: readonly StacjaDlaSzyn[]; readonly branches: readonly GalazDlaSzyn[] };
    readonly stacje: Readonly<Record<string, readonly string[]>>;
  };
};
const { model, stacje: oczekiwane } = iloczyn;
const stacja = (ref: string): StacjaDlaSzyn => model.substations.find((s) => s.ref_id === ref)!;
const posortowane = (s: ReadonlySet<string>): string[] => [...s].sort();

function kolejnosci(galezie: readonly GalazDlaSzyn[]): (readonly GalazDlaSzyn[])[] {
  const obroty = galezie.map((_, i) => [...galezie.slice(i), ...galezie.slice(0, i)]);
  return [...obroty, ...obroty.map((o) => [...o].reverse())];
}

describe('szynyStacji — iloczyn cech (zbiory z backendu)', () => {
  it.each(Object.keys(oczekiwane))('%s: zbiór lustra = zbiór backendu w KAŻDEJ kolejności gałęzi', (ref) => {
    for (const galezie of kolejnosci(model.branches)) {
      expect(posortowane(szynyStacji(stacja(ref), galezie))).toEqual(oczekiwane[ref]);
    }
  });

  it('stacja A: zaciski pól SN i szyny za aparatami pól nN w JEDNYM zbiorze', () => {
    const szyny = szynyStacji(stacja('A/stacja'), model.branches);
    for (const zacisk of ['A/zacisk-in', 'A/zacisk-out', 'A/zacisk-oze', 'A/zacisk-pomiar', 'A/zacisk-tr']) {
      expect(szyny.has(zacisk)).toBe(true);
    }
    for (const zaAparatem of ['A/zacisk-wg-nn', 'A/odp-1', 'A/sekcja', 'A/odp-2', 'A/odp-3', 'B/board']) {
      expect(szyny.has(zaAparatem)).toBe(true);
    }
  });

  it('zacisk = szyna pola, pusty field_ref, brak bus_ref, pusta szyna główna — nie wchodzą', () => {
    const szyny = szynyStacji(stacja('A/stacja'), model.branches);
    for (const ref of ['A/zacisk-bez-refu', 'A/zacisk-bez-szyny', '  ', ' A/zacisk-tr ']) {
      expect(szyny.has(ref)).toBe(false);
    }
  });

  it('aparat z deklaracją pola INNEJ stacji nie dopisuje szyn; deklaracja tej stacji dopisuje oba końce', () => {
    const szyny = szynyStacji(stacja('A/stacja'), model.branches);
    expect(szyny.has('X/obca')).toBe(false);
    expect(szyny.has('Y/szyna-obca')).toBe(true);
  });

  it('szyna bez stacji nie należy do żadnej stacji', () => {
    for (const s of model.substations) expect(szynyStacji(s, model.branches).has('Z/wolna')).toBe(false);
    expect(stacjaSzyn(model.substations, model.branches).has('Z/wolna')).toBe(false);
  });
});

describe('stacjaSzyn — szyna wspólna dwóch stacji (podrozdzielnica nN)', () => {
  it('szyna podrozdzielnicy za aparatem pola stacji należy do PIERWSZEJ stacji modelu (jak topologia backendu)', () => {
    expect(stacjaSzyn(model.substations, model.branches).get('B/board')).toBe('A/stacja');
    expect(stacjaSzyn([...model.substations].reverse(), model.branches).get('B/board')).toBe('B/podrozdzielnica');
  });

  it('mapa = suma zbiorów lustra, każda szyna dokładnie raz', () => {
    const mapa = stacjaSzyn(model.substations, model.branches);
    const suma = new Set(model.substations.flatMap((s) => [...szynyStacji(s, model.branches)]));
    expect([...mapa.keys()].sort()).toEqual([...suma].sort());
    expect(mapa.get('B/odp-bus')).toBe('B/podrozdzielnica');
  });
});
