// @vitest-environment node
/**
 * Karta UX-04/ROZDZIELNICA-SN-KOREKTA — D3c (raster celek wyklucza nakładanie) i D3b (granica
 * zasilania WN) na scenie z fikstur GPZ wygenerowanych przez backend (szablony ENEA Z.7–Z.17).
 *
 * Iloczyn cech: fikstura GPZ {pola szablonów, BKR, BKR gwiazda uziemiona, ZU Z.13/Z.14/Z.15,
 * odpływ, stacje typów A–D, stacje konstrukcji pól} × LOD {1, 2} (podłoże 52 stacji pominięte: jego
 * GPZ ma jedno tło pola, wyrocznia par byłaby pusta). Wyrocznie: tła pól (obrysy celek) rozłączne PARAMI
 * po wszystkich parach, także w samej osi X (raster: każda celka, w tym kolumna wieży
 * transformatora nad szyną, ma własną kolumnę); transformator bez pola WN TR
 * w modelu ma kreskowaną granicę zasilania z opisem, nigdy ramkę „?" w torze WN.
 */
import { readFileSync } from 'node:fs';


import { describe, expect, it } from 'vitest';

import { SYMBOL_DEFS } from '../../symbols/defs';
import { buildSceneV3, pathTerminationLabelGaps, sceneSegmentEndpointGaps } from '../buildScene';

const FIKSTURY = [
  'gpz110kvPolaSzablonow',
  'gpz110kvBkr',
  'gpz110kvBkrGwiazdaUziemiona',
  'gpz110kvPoleZuZ13',
  'gpz110kvPoleZuZ14',
  'gpz110kvPoleZuZ15',
  'gpzFeeder',
  'stacjeTypowAbcd',
  'stacjeKonstrukcjiPol',
] as const;

function wczytaj(nazwa: string): Parameters<typeof buildSceneV3>[0] {
  const plik = JSON.parse(readFileSync(`public/test-fixtures/${nazwa}.enm.json`, 'utf8'));
  return plik.enm ?? plik;
}

const nachodza = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('GPZ — raster celek i granica zasilania na scenie (fikstury backendu × LOD)', () => {
  for (const nazwa of FIKSTURY) {
    for (const lod of [1, 2] as const) {
      it(`${nazwa} × L${lod}`, () => {
        const enm = wczytaj(nazwa);
        const scena = buildSceneV3(enm, lod);
        const panele = scena.meta.gpzAdnotacje?.panele ?? [];
        // Fikstura bez teł pól nie sprawdzałaby niczego (pusta wyrocznia = fałszywa pewność).
        expect(panele.length).toBeGreaterThan(1);
        // Obrysy celek rozłączne parami (wszystkie pary).
        for (let i = 0; i < panele.length; i += 1) {
          for (let j = i + 1; j < panele.length; j += 1) {
            expect(nachodza(panele[i].rect, panele[j].rect), `${panele[i].bayRef} × ${panele[j].bayRef}`).toBe(false);
          }
        }
        // Raster: każda celka (pole pod szyną, wieża transformatora nad szyną, sprzęgło) ma
        // własną kolumnę — przedziały X teł pól rozłączne parami, niezależnie od wysokości.
        for (let i = 0; i < panele.length; i += 1) {
          for (let j = i + 1; j < panele.length; j += 1) {
            const a = panele[i].rect;
            const b = panele[j].rect;
            expect(a.x < b.x + b.width && b.x < a.x + a.width, `kolumny ${panele[i].bayRef} × ${panele[j].bayRef}`).toBe(false);
          }
        }
        // Granica zasilania WN: transformator GPZ bez symboli pola WN TR ma kreskowane połączenie
        // i opis stanu danych; żaden tor WN nie niesie ramki „?".
        for (const tr of scena.meta.transformers ?? []) {
          const symbolePolaWn = scena.symbols.filter((s) => s.meta?.testId?.startsWith(`${tr.hvBayTestId}-`));
          const polaczenie = scena.segments.find((s) => s.meta?.ownerRef === `${tr.transformerRef}#hv-connector`);
          expect(polaczenie, tr.transformerRef).toBeDefined();
          if (symbolePolaWn.length === 0) {
            expect(polaczenie!.meta?.dashed).toBe(true);
            expect(scena.labels.some((l) => l.ownerRef === `${tr.transformerRef}#granica-zasilania-wn#name-row-0`)).toBe(true);
          } else {
            expect(polaczenie!.meta?.dashed).toBeFalsy();
          }
        }
        // D1 × zakończenie toru: głowica pola zasilającego nad szyną (glif odbity, `w-gore`) ma
        // koniec kabla u GÓRY — połączony z transformatorem, więc bez podpisu „koniec toru" i bez
        // odrzuconych etykiet wieży (dawniej podpis pod głowicą i wiersze tabliczki TR wypadały).
        const glowiceWGore = scena.symbols.filter((s) => s.symbolId === 'qetCableHead' && s.kierunekToru === 'w-gore');
        // Przesłanka niepusta: fikstura szablonów ma pole TR Z.7 z głowicą w wieży.
        if (nazwa === 'gpz110kvPolaSzablonow') expect(glowiceWGore.length).toBeGreaterThan(0);
        for (const g of glowiceWGore) {
          expect(scena.labels.some((l) => l.ownerRef === `${g.meta?.ownerRef}#termination`), g.meta?.testId).toBe(false);
        }
        expect(pathTerminationLabelGaps(scena)).toEqual([]);
        // Tor pola zasilającego nad szyną ciągły: przerwy na pasy odgałęzień (VT za wyłącznikiem,
        // Z.7) zamknięte przewodami port → port, każdy koniec odcinka na porcie albo odcinku.
        expect(sceneSegmentEndpointGaps(scena)).toEqual([]);
        for (const tr of scena.meta.transformers ?? []) {
          const tor = scena.symbols
            .filter((s) => s.meta?.testId?.startsWith(`${tr.trFieldTestId}-`) && s.kierunekToru === 'w-gore')
            .filter((s) => s.meta?.odgalezienieToru == null);
          const osX = tor.length > 0 ? Math.min(...tor.map((s) => s.x + SYMBOL_DEFS[s.symbolId].width / 2)) : 0;
          const wOsi = tor.filter((s) => s.x + SYMBOL_DEFS[s.symbolId].width / 2 === osX).sort((a, b) => a.y - b.y);
          for (let i = 1; i < wOsi.length; i += 1) {
            const gora = wOsi[i - 1].y + SYMBOL_DEFS[wOsi[i - 1].symbolId].height;
            const dol = wOsi[i].y;
            if (dol <= gora) continue;
            const przewod = scena.segments.some(
              (g) => g.points.length === 2 && g.points.every((p) => p.x === osX)
                && Math.min(g.points[0].y, g.points[1].y) <= gora && Math.max(g.points[0].y, g.points[1].y) >= dol,
            );
            expect(przewod, `${tr.transformerRef}: przerwa toru ${gora}–${dol}`).toBe(true);
          }
        }
        const odrzuconeWiez = scena.meta.stopNotes
          .filter((n) => n.startsWith('label.declutter:'))
          .flatMap((n) => n.match(/[a-z-]+:[^,( ]*transformer[^,( ]*/g) ?? []);
        expect(odrzuconeWiez).toEqual([]);
      });
    }
  }
});
