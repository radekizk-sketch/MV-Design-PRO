/**
 * SLD-GEN-POLA — kontrakt GENERATORA mini-SLD pola.
 *
 * Werdykt właściciela 2026-08-14 (ekran „Pola rozdzielnicy SN"): 3/10, ODRZUCONY —
 * „mini-SLD rysuje cztery identyczne ikony różniące się podpisem". Pomiar stanu
 * sprzed karty: rysunek pola powstawał z ROLI pola i jednego wybranego aparatu,
 * więc kompozycja rodziny (odłączniki, przekładniki, uziemnik, głowica) nie
 * miała jak trafić na rysunek — nawet gdy backend ją wysyłał w każdej odpowiedzi.
 *
 * Testy pokrywają ILOCZYN CECH (reguła KLASA §2), nie przykład z karty:
 *   {rodzina o innym słowniku aparatów} × {rola pola} × {rodzaj aparatu głównego}
 *   × {wyposażenie pola} × {źródło kompozycji: kanoniczna / producencka}
 * plus obie strony wyroczni BOM ↔ scena, kolejność toru i odgałęzienia boczne.
 *
 * Dane wejściowe: fikstury przepisane 1:1 z odpowiedzi backendu
 * (`fixturySzablonowPol.ts` — źródło opisane w jego nagłówku), nie atrapy.
 */
import { describe, expect, it } from 'vitest';

import {
  RODZAJ_Z_KIND_INSTANCJI,
  RODZAJ_Z_KIND_SZABLONU,
  SYMBOL_RODZAJU_BOM,
  bledyKolejnosciToru,
  kolizjeSymboliPola,
  podpisScenyPola,
  roznicaBomScena,
  symbolRodzajuAparatu,
  terminalePola,
  zbudujBomPola,
  zbudujScenePola,
  type PozycjaBom,
  type RodzajAparatuBom,
  type ScenaPola,
} from '../generatorSldPola';
import { SYMBOL_DEFS, type SymbolId } from '../../../../ui/sld/v3/symbols/defs';
import {
  BLOK_RMU_K_K_T,
  SZABLON_SAFERING_LINE_OUT,
  SZABLON_SAFERING_LINE_OUT_PRODUCENCKI,
  SZABLON_SAFERING_TRANSFORMER,
  SZABLON_UNIGEAR_AUX,
  SZABLON_UNIGEAR_COUPLER,
  SZABLON_UNIGEAR_LINE_OUT,
  SZABLON_UNIGEAR_MEASUREMENT,
  SZABLON_UNIGEAR_TRANSFORMER,
  WSZYSTKIE_SZABLONY,
} from './fixturySzablonowPol';

const SZYNA_Y = 100;

function scena(
  bom: readonly PozycjaBom[],
  symbolAparatuGlownego: SymbolId | null = 'breaker',
  sprzeglo = false,
): ScenaPola {
  return zbudujScenePola(bom, { szynaY: SZYNA_Y, symbolAparatuGlownego, sprzeglo });
}

/** Oznaczenia symboli sceny w kolejności rysowania. */
function oznaczenia(s: ScenaPola): string[] {
  return s.symbole.map((symbol) => symbol.oznaczenie);
}

/** Identyfikatory symboli kanonu w kolejności rysowania. */
function symbole(s: ScenaPola): string[] {
  return s.symbole.map((symbol) => symbol.id);
}

describe('SLD-GEN-POLA — BOM czytany z RZECZYWISTEJ kompozycji szablonu', () => {
  it('pole liniowe UniGear: pełny skład celki z oznaczeniami operatorskimi', () => {
    const bom = zbudujBomPola({ szablon: SZABLON_UNIGEAR_LINE_OUT });
    expect(bom.map((p) => `${p.oznaczenie}:${p.rodzaj}`)).toEqual([
      'Q1:ODLACZNIK_SZYNOWY',
      'Q0:APARAT_GLOWNY',
      'T1:PRZEKLADNIK_PRADOWY',
      'Q2:ODLACZNIK_LINIOWY',
      'Q9:UZIEMNIK',
      'GK:GLOWICA_KABLOWA',
    ]);
  });

  it('pole liniowe SafeRing NIE MA przekładnika — bo nie ma go słownik rodziny (RMU)', () => {
    // To jest cała różnica między rodzinami: SafeRing (RMU) nie oferuje CT w
    // celce, UniGear oferuje. Rysunek MUSI to pokazać, bo zmienia dobór
    // zabezpieczeń pola.
    const safering = zbudujBomPola({ szablon: SZABLON_SAFERING_LINE_OUT });
    const unigear = zbudujBomPola({ szablon: SZABLON_UNIGEAR_LINE_OUT });
    expect(safering.some((p) => p.rodzaj === 'PRZEKLADNIK_PRADOWY')).toBe(false);
    expect(unigear.some((p) => p.rodzaj === 'PRZEKLADNIK_PRADOWY')).toBe(true);
    expect(podpisScenyPola(scena(safering))).not.toBe(podpisScenyPola(scena(unigear)));
  });

  it('kompozycja PRODUCENTA ma pierwszeństwo i wnosi VPIS; blokada nie jest aparatem', () => {
    const bom = zbudujBomPola({ szablon: SZABLON_SAFERING_LINE_OUT_PRODUCENCKI });
    expect(bom.map((p) => `${p.oznaczenie}:${p.rodzaj}`)).toEqual([
      'Q0:APARAT_GLOWNY',
      'Q9:UZIEMNIK',
      'VPIS:WSKAZNIK_NAPIECIA',
      'GK:GLOWICA_KABLOWA',
    ]);
    // Blokada ruchowa (`interlock`) jest regułą eksploatacyjną, nie aparatem na
    // torze — świadomie poza rysunkiem, a nie zgubiona po drodze.
    expect(bom.some((p) => p.oznaczenie === 'BLK')).toBe(false);
    // Kompozycje NIE sumują się: aparat kanoniczny nie wchodzi drugi raz.
    expect(bom.filter((p) => p.rodzaj === 'GLOWICA_KABLOWA')).toHaveLength(1);
  });

  it('wyposażenie z kreatora WIĄŻE SIĘ z pozycją rodziny, nie dubluje jej', () => {
    // UniGear ma CT w składzie: wskazanie przekładnika w kroku pomiarów to dobór
    // pozycji katalogowej dla TEJ pozycji, a nie drugi przekładnik w polu.
    const zCt = zbudujBomPola({ szablon: SZABLON_UNIGEAR_LINE_OUT, maCt: true });
    expect(zCt.filter((p) => p.rodzaj === 'PRZEKLADNIK_PRADOWY')).toHaveLength(1);
    expect(zCt.find((p) => p.rodzaj === 'PRZEKLADNIK_PRADOWY')?.zrodlo).toBe('szablon');

    // SafeRing CT nie ma: wskazany przekładnik wchodzi jako pozycja instancji
    // pola, z jawnym źródłem `wyposazenie`.
    const safering = zbudujBomPola({ szablon: SZABLON_SAFERING_LINE_OUT, maCt: true });
    expect(safering.filter((p) => p.rodzaj === 'PRZEKLADNIK_PRADOWY')).toHaveLength(1);
    expect(safering.find((p) => p.rodzaj === 'PRZEKLADNIK_PRADOWY')?.zrodlo).toBe('wyposazenie');
  });

  it('transformator stacji należy do pola TR także wtedy, gdy rodzina go nie wymienia', () => {
    // Pole wyłącznikowe UniGear ma transformator w kompozycji, ale rodzina bez
    // niego (pole liniowe) + transformator stacji też musi go pokazać — inaczej
    // rysunek gubi obiekt, który operacja domenowa realnie tworzy.
    const zRodziny = zbudujBomPola({ szablon: SZABLON_UNIGEAR_TRANSFORMER, maTransformator: true });
    expect(zRodziny.filter((p) => p.rodzaj === 'TRANSFORMATOR')).toHaveLength(1);
    expect(zRodziny.find((p) => p.rodzaj === 'TRANSFORMATOR')?.zrodlo).toBe('szablon');

    const bezSzablonu = zbudujBomPola({ szablon: null, maTransformator: true });
    expect(bezSzablonu.map((p) => p.rodzaj)).toEqual(['TRANSFORMATOR']);
    expect(bezSzablonu[0].zrodlo).toBe('wyposazenie');
  });

  it('BOM jest posortowany po pozycji i deterministyczny', () => {
    const raz = zbudujBomPola({
      szablon: SZABLON_UNIGEAR_LINE_OUT,
      maVt: true,
      maPrzekaznik: true,
    });
    const dwa = zbudujBomPola({
      szablon: SZABLON_UNIGEAR_LINE_OUT,
      maVt: true,
      maPrzekaznik: true,
    });
    expect(raz).toEqual(dwa);
    const pozycje = raz.map((p) => p.pozycja);
    expect([...pozycje].sort((a, b) => a - b)).toEqual(pozycje);
  });
});

describe('SLD-GEN-POLA — wyrocznia DWUSTRONNA BOM ↔ scena (dwa zakazy karty)', () => {
  const przypadki: readonly {
    nazwa: string;
    bom: PozycjaBom[];
    symbol: SymbolId | null;
    sprzeglo?: boolean;
  }[] = [
    {
      nazwa: 'liniowe UniGear (wyłącznik)',
      bom: zbudujBomPola({ szablon: SZABLON_UNIGEAR_LINE_OUT }),
      symbol: 'breaker',
    },
    {
      nazwa: 'liniowe SafeRing (rozłącznik)',
      bom: zbudujBomPola({ szablon: SZABLON_SAFERING_LINE_OUT }),
      symbol: 'loadBreakSwitch',
    },
    {
      nazwa: 'transformatorowe switch-fuse',
      bom: zbudujBomPola({ szablon: SZABLON_SAFERING_TRANSFORMER, maTransformator: true }),
      symbol: 'fuseSwitch',
    },
    {
      nazwa: 'pomiarowe',
      bom: zbudujBomPola({ szablon: SZABLON_UNIGEAR_MEASUREMENT }),
      symbol: 'disconnector',
    },
    {
      nazwa: 'potrzeb własnych (bezpiecznik w składzie)',
      bom: zbudujBomPola({ szablon: SZABLON_UNIGEAR_AUX }),
      symbol: null,
    },
    {
      nazwa: 'sprzęgłowe',
      bom: zbudujBomPola({ szablon: SZABLON_UNIGEAR_COUPLER }),
      symbol: 'breaker',
      sprzeglo: true,
    },
    {
      nazwa: 'producenckie z VPIS',
      bom: zbudujBomPola({ szablon: SZABLON_SAFERING_LINE_OUT_PRODUCENCKI }),
      symbol: 'loadBreakSwitch',
    },
    {
      nazwa: 'liniowe z pełnym wyposażeniem kreatora',
      bom: zbudujBomPola({
        szablon: SZABLON_SAFERING_LINE_OUT,
        maCt: true,
        maVt: true,
        maPrzekaznik: true,
      }),
      symbol: 'recloser',
    },
    {
      nazwa: 'pole bez szablonu i bez aparatu (uczciwy stan pusty)',
      bom: zbudujBomPola({ szablon: null }),
      symbol: null,
    },
  ];

  for (const przypadek of przypadki) {
    it(`${przypadek.nazwa}: żaden aparat nie zniknął i żaden nie został dorysowany`, () => {
      const s = scena(przypadek.bom, przypadek.symbol, przypadek.sprzeglo ?? false);
      expect(
        roznicaBomScena(przypadek.bom, s, { symbolAparatuGlownego: przypadek.symbol }),
      ).toEqual([]);
    });

    it(`${przypadek.nazwa}: kolejność toru zgodna z pozycjami kompozycji`, () => {
      const s = scena(przypadek.bom, przypadek.symbol, przypadek.sprzeglo ?? false);
      expect(bledyKolejnosciToru(przypadek.bom, s)).toEqual([]);
    });

    it(`${przypadek.nazwa}: symbole pola nie nachodzą na siebie`, () => {
      const s = scena(przypadek.bom, przypadek.symbol, przypadek.sprzeglo ?? false);
      expect(kolizjeSymboliPola(s)).toEqual([]);
    });
  }

  it('wyrocznia ŁAPIE pominięty aparat (test wyroczni, nie tylko generatora)', () => {
    const bom = zbudujBomPola({ szablon: SZABLON_UNIGEAR_LINE_OUT });
    const s = scena(bom);
    const okrojona: ScenaPola = { ...s, symbole: s.symbole.slice(1) };
    const bledy = roznicaBomScena(bom, okrojona, { symbolAparatuGlownego: 'breaker' });
    expect(bledy.length).toBeGreaterThan(0);
    expect(bledy.join(' ')).toContain('nie została narysowana');
  });

  it('wyrocznia ŁAPIE aparat dorysowany spoza BOM', () => {
    const bom = zbudujBomPola({ szablon: SZABLON_SAFERING_LINE_OUT });
    const s = scena(bom);
    const zDodatkiem: ScenaPola = {
      ...s,
      symbole: [
        ...s.symbole,
        {
          id: 'currentTransformer',
          x: 0,
          y: SZYNA_Y,
          oznaczenie: 'T1',
          rodzaj: 'PRZEKLADNIK_PRADOWY',
          umiejscowienie: 'TOR',
          boczny: false,
        },
      ],
    };
    const bledy = roznicaBomScena(bom, zDodatkiem, { symbolAparatuGlownego: 'breaker' });
    expect(bledy.length).toBeGreaterThan(0);
    expect(bledy.join(' ')).toContain('bez pozycji w BOM');
  });

  it('wyrocznia kolejności ŁAPIE aparat przestawiony w torze', () => {
    const bom = zbudujBomPola({ szablon: SZABLON_UNIGEAR_LINE_OUT });
    const s = scena(bom);
    const przestawiona: ScenaPola = {
      ...s,
      symbole: s.symbole.map((symbol) =>
        symbol.oznaczenie === 'GK' ? { ...symbol, y: 0 } : symbol,
      ),
    };
    expect(bledyKolejnosciToru(bom, przestawiona).length).toBeGreaterThan(0);
  });

  it('wyrocznia kolizji ŁAPIE dwa symbole postawione w tym samym miejscu', () => {
    const bom = zbudujBomPola({ szablon: SZABLON_UNIGEAR_LINE_OUT });
    const s = scena(bom);
    const zlepiona: ScenaPola = {
      ...s,
      symbole: s.symbole.map((symbol) => ({ ...symbol, x: 0, y: SZYNA_Y })),
    };
    expect(kolizjeSymboliPola(zlepiona).length).toBeGreaterThan(0);
  });
});

describe('SLD-GEN-POLA — cztery role dają CZTERY RÓŻNE rysunki (defekt sprzed karty)', () => {
  const role = {
    'liniowe rozłącznikowe': {
      bom: zbudujBomPola({ szablon: SZABLON_SAFERING_LINE_OUT }),
      symbol: 'loadBreakSwitch' as SymbolId,
    },
    'liniowe wyłącznikowe': {
      bom: zbudujBomPola({ szablon: SZABLON_UNIGEAR_LINE_OUT }),
      symbol: 'breaker' as SymbolId,
    },
    'transformatorowe switch-fuse': {
      bom: zbudujBomPola({ szablon: SZABLON_SAFERING_TRANSFORMER, maTransformator: true }),
      symbol: 'fuseSwitch' as SymbolId,
    },
    pomiarowe: {
      bom: zbudujBomPola({ szablon: SZABLON_UNIGEAR_MEASUREMENT }),
      symbol: 'disconnector' as SymbolId,
    },
  };

  it('podpisy struktury czterech scen są PARAMI różne', () => {
    const podpisy = Object.entries(role).map(([, v]) => podpisScenyPola(scena(v.bom, v.symbol)));
    expect(new Set(podpisy).size).toBe(4);
  });

  it('zbiory symboli czterech ról są PARAMI różne (nie tylko podpisy)', () => {
    const zbiory = Object.entries(role).map(([, v]) =>
      [...new Set(symbole(scena(v.bom, v.symbol)))].sort().join('+'),
    );
    expect(new Set(zbiory).size).toBe(4);
  });

  it('struktura każdej z czterech scen — snapshot STRUKTURY (nie pikseli)', () => {
    const podpisy = Object.fromEntries(
      Object.entries(role).map(([nazwa, v]) => [nazwa, podpisScenyPola(scena(v.bom, v.symbol))]),
    );
    expect(podpisy).toEqual({
      'liniowe rozłącznikowe':
        'Q1:disconnector>Q0:loadBreakSwitch>Q2:disconnector>[Q9:earthSwitch]>GK:cableHead>{przedzial-kablowy}',
      'liniowe wyłącznikowe':
        'Q1:disconnector>Q0:breaker>T1:currentTransformer>Q2:disconnector>[Q9:earthSwitch]>GK:cableHead>{przedzial-kablowy}',
      'transformatorowe switch-fuse':
        'Q1:disconnector>Q0:fuseSwitch>Q2:disconnector>[Q9:earthSwitch]>TR:transformer2W>{strona-nn}',
      pomiarowe: 'Q1:disconnector>[T2:voltageTransformer]>[Q9:earthSwitch]',
    });
  });

  it('ten sam skład + INNY aparat główny = inny rysunek (wybór z katalogu widoczny)', () => {
    const bom = zbudujBomPola({ szablon: SZABLON_UNIGEAR_LINE_OUT });
    const warianty = ['WYLACZNIK', 'ROZLACZNIK', 'ROZLACZNIK_BEZPIECZNIKOWY', 'REKLOZER', 'ODLACZNIK']
      .map((kind) => podpisScenyPola(scena(bom, symbolRodzajuAparatu(kind))));
    expect(new Set(warianty).size).toBe(5);
  });
});

describe('SLD-GEN-POLA — tor pionowy, odgałęzienia i zakończenia', () => {
  it('uziemnik schodzi ODGAŁĘZIENIEM DO ZIEMI (w lewo), nie stoi w torze', () => {
    const bom = zbudujBomPola({ szablon: SZABLON_UNIGEAR_LINE_OUT });
    const s = scena(bom);
    const uziemnik = s.symbole.find((symbol) => symbol.oznaczenie === 'Q9');
    expect(uziemnik?.umiejscowienie).toBe('ZIEMIA');
    expect(uziemnik?.boczny).toBe(true);
    expect(uziemnik!.x).toBeLessThan(0);
    // Terminale: góra na torze, dół w ziemi (zero fizyki — to opis przyłączenia).
    const terminal = terminalePola(bom).find((t) => t.pozycja.oznaczenie === 'Q9');
    expect(terminal).toEqual({ pozycja: expect.anything(), gora: 'TOR', dol: 'ZIEMIA' });
  });

  it('przekładnik napięciowy i VPIS wiszą na odgałęzieniu BOCZNYM (w prawo)', () => {
    const pomiar = scena(zbudujBomPola({ szablon: SZABLON_UNIGEAR_MEASUREMENT }), 'disconnector');
    const vt = pomiar.symbole.find((symbol) => symbol.oznaczenie === 'T2');
    expect(vt?.umiejscowienie).toBe('BOCZNE');
    expect(vt!.x).toBeGreaterThan(0);

    const producencka = scena(
      zbudujBomPola({ szablon: SZABLON_SAFERING_LINE_OUT_PRODUCENCKI }),
      'loadBreakSwitch',
    );
    const vpis = producencka.symbole.find((symbol) => symbol.oznaczenie === 'VPIS');
    expect(vpis?.id).toBe('voltageIndicator');
    expect(vpis?.umiejscowienie).toBe('BOCZNE');
    expect(vpis!.x).toBeGreaterThan(0);
  });

  it('przekaźnik jest ADNOTACJĄ obok toru — bez udziału w ciągłości elektrycznej', () => {
    const bom = zbudujBomPola({ szablon: SZABLON_SAFERING_LINE_OUT, maPrzekaznik: true });
    const s = scena(bom);
    const przekaznik = s.symbole.find((symbol) => symbol.rodzaj === 'PRZEKAZNIK');
    expect(przekaznik?.id).toBe('protectionRelay');
    expect(przekaznik?.umiejscowienie).toBe('ADNOTACJA');
    const terminal = terminalePola(bom).find((t) => t.pozycja.rodzaj === 'PRZEKAZNIK');
    expect(terminal?.gora).toBe('BRAK');
    expect(terminal?.dol).toBe('BRAK');
  });

  it('przedział kablowy rysuje się TYLKO przy głowicy w składzie', () => {
    const zGlowica = scena(zbudujBomPola({ szablon: SZABLON_SAFERING_LINE_OUT }));
    expect(zGlowica.strefaKablowa).not.toBeNull();
    const bezGlowicy = scena(zbudujBomPola({ szablon: SZABLON_UNIGEAR_MEASUREMENT }), 'disconnector');
    expect(bezGlowicy.strefaKablowa).toBeNull();
  });

  it('strona nN pojawia się TYLKO gdy tor kończy się transformatorem', () => {
    const tr = scena(
      zbudujBomPola({ szablon: SZABLON_SAFERING_TRANSFORMER, maTransformator: true }),
      'fuseSwitch',
    );
    expect(tr.kreskaNn).not.toBeNull();
    // Kreska nN leży PONIŻEJ uzwojeń transformatora (tor niedomknięty byłby błędem).
    const transformator = tr.symbole.find((symbol) => symbol.rodzaj === 'TRANSFORMATOR');
    expect(tr.kreskaNn![2]).toBeGreaterThan(transformator!.y);

    const liniowe = scena(zbudujBomPola({ szablon: SZABLON_SAFERING_LINE_OUT }));
    expect(liniowe.kreskaNn).toBeNull();
  });

  it('pole sprzęgłowe przerywa szynę i wraca na nią (kształt „U")', () => {
    const bom = zbudujBomPola({ szablon: SZABLON_UNIGEAR_COUPLER });
    const s = scena(bom, 'breaker', true);
    expect(s.przerwa).not.toBeNull();
    const powrot = s.tor.filter((t) => t[3] === SZYNA_Y && t[1] !== SZYNA_Y);
    expect(powrot).toHaveLength(1);
    expect(powrot[0][2]).toBeCloseTo(s.przerwa![1], 6);
    expect(s.zejscieOtwarte).toBe(false);
  });

  it('tor pola zaczyna się NA SZYNIE i schodzi w dół bez przerwy do pierwszego aparatu', () => {
    const bom = zbudujBomPola({ szablon: SZABLON_UNIGEAR_LINE_OUT });
    const s = scena(bom);
    const pierwszy = s.tor[0];
    expect(pierwszy[1]).toBe(SZYNA_Y);
    const pierwszySymbol = s.symbole[0];
    expect(pierwszySymbol.y).toBeCloseTo(pierwszy[3], 6);
    // Pierwsza pozycja toru ma terminal górny NA SZYNIE.
    expect(terminalePola(bom)[0].gora).toBe('SZYNA');
  });

  it('brak wskazanego aparatu głównego: pusty odcinek toru, ZERO podstawionego symbolu', () => {
    const bom = zbudujBomPola({ szablon: SZABLON_UNIGEAR_LINE_OUT });
    const s = scena(bom, null);
    expect(oznaczenia(s)).not.toContain('Q0');
    expect(symbole(s)).not.toContain('breaker');
    // Reszta składu zostaje — brak dotyczy JEDNEGO aparatu, nie całego pola.
    expect(oznaczenia(s)).toEqual(['Q1', 'T1', 'Q2', 'Q9', 'GK']);
    expect(roznicaBomScena(bom, s, { symbolAparatuGlownego: null })).toEqual([]);
  });

  it('scena jest deterministyczna i przesuwalna bez przeliczania', () => {
    const bom = zbudujBomPola({ szablon: SZABLON_UNIGEAR_TRANSFORMER, maTransformator: true });
    expect(scena(bom)).toEqual(scena(bom));
  });
});

describe('SLD-GEN-POLA — mapowania aparat → symbol są ZAMKNIĘTE w obie strony', () => {
  it('każdy rodzaj BOM ma symbol istniejący w kanonie SLD v3', () => {
    for (const [rodzaj, id] of Object.entries(SYMBOL_RODZAJU_BOM)) {
      expect(SYMBOL_DEFS[id], `rodzaj ${rodzaj} → brak symbolu ${id} w kanonie`).toBeTruthy();
    }
  });

  it('każdy kind kompozycji kanonicznej i producenckiej ma rodzaj BOM', () => {
    // Kindy szablonu MUSZĄ mieć rodzaj (żaden aparat układu kanonicznego nie ma
    // prawa wypaść z rysunku).
    for (const [kind, rodzaj] of Object.entries(RODZAJ_Z_KIND_SZABLONU)) {
      expect(rodzaj, `kind szablonu ${kind} bez rodzaju`).toBeTruthy();
      expect(SYMBOL_RODZAJU_BOM[rodzaj]).toBeTruthy();
    }
    // Kindy producenckie mogą być świadomie NIERYSOWANE — ale lista takich jest
    // zamknięta i nazwana; nowy kind bez decyzji nie przejdzie.
    const nierysowane = Object.entries(RODZAJ_Z_KIND_INSTANCJI)
      .filter(([, rodzaj]) => rodzaj === null)
      .map(([kind]) => kind)
      .sort();
    expect(nierysowane).toEqual(['bus_coupler', 'busbar', 'interlock']);
  });

  it('kompozycje WSZYSTKICH fikstur backendu rysują się w całości', () => {
    // Test na PEŁNYM zbiorze szablonów, nie na jednym przykładzie: gdyby
    // kontrakt wniósł kind bez mapowania, pole straciłoby aparat po cichu.
    for (const szablon of WSZYSTKIE_SZABLONY) {
      const bom = zbudujBomPola({ szablon });
      expect(bom.length, `${szablon.template_ref}: pusty BOM`).toBeGreaterThan(0);
      const s = scena(bom, 'breaker');
      expect(
        roznicaBomScena(bom, s, { symbolAparatuGlownego: 'breaker' }),
        `${szablon.template_ref}`,
      ).toEqual([]);
    }
  });

  it('rodzaje BOM pokrywają się z kluczami tablicy symboli (bez sierot)', () => {
    const zSzablonu = new Set<RodzajAparatuBom>(Object.values(RODZAJ_Z_KIND_SZABLONU));
    const zInstancji = new Set<RodzajAparatuBom>(
      Object.values(RODZAJ_Z_KIND_INSTANCJI).filter((r): r is RodzajAparatuBom => r !== null),
    );
    const wszystkie = new Set<RodzajAparatuBom>([...zSzablonu, ...zInstancji]);
    expect([...wszystkie].sort()).toEqual(Object.keys(SYMBOL_RODZAJU_BOM).sort());
  });
});

describe('SLD-GEN-POLA — blok fabryczny RMU K-K-T (kabel–kabel–transformator)', () => {
  it('trzy jednostki bloku dają trzy RÓŻNE sceny, w kolejności bloku', () => {
    const symbolePol: readonly (SymbolId | null)[] = [
      'loadBreakSwitch',
      'loadBreakSwitch',
      'fuseSwitch',
    ];
    const podpisy = BLOK_RMU_K_K_T.map((szablon, i) =>
      podpisScenyPola(
        scena(
          zbudujBomPola({ szablon, maTransformator: szablon.bay_role === 'TR' }),
          symbolePol[i],
        ),
      ),
    );
    expect(podpisy).toEqual([
      'Q1:disconnector>Q0:loadBreakSwitch>Q2:disconnector>[Q9:earthSwitch]>GK:cableHead>{przedzial-kablowy}',
      'Q1:disconnector>Q0:loadBreakSwitch>Q2:disconnector>[Q9:earthSwitch]>GK:cableHead>{przedzial-kablowy}',
      'Q1:disconnector>Q0:fuseSwitch>Q2:disconnector>[Q9:earthSwitch]>TR:transformer2W>{strona-nn}',
    ]);
    // Jednostki kablowe są identyczne z założenia (pierścień), transformatorowa
    // różni się od obu — blok K-K-T czyta się z rysunku.
    expect(podpisy[0]).toBe(podpisy[1]);
    expect(podpisy[2]).not.toBe(podpisy[0]);
  });
});
