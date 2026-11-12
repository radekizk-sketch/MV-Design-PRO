/**
 * Kadr sekcji szyn GPZ obejmuje CAŁĄ sekcję (karta UX-04/ROZDZIELNICA-SN-KOREKTA, kryterium K1).
 *
 * Wada z oględzin zrzutu `po/rozdzielnica-gpz-sekcja-1-*`: kadr sekcji ucinał wieżę TR lewą
 * krawędzią, wiersze tabeli pól u góry i urywał się na sprzęgle; kadr sekcji 2 nie obejmował
 * celki sprzęgła wcale (rekord pola sprzęgła wskazuje jedną sekcję, a sprzęgło Z.12 łączy dwie).
 *
 * Wyrocznia liczona NIEZALEŻNIE od `zakresKadru` — wprost z rekordów ENM i z geometrii sceny:
 *  - każde tło pola sekcji (`gpz_section_id`) i pola niosącego łącznik, którego koniec stoi
 *    na szynie sekcji (sprzęgło), leży w prostokącie kadru;
 *  - transformator pola TR sekcji (rola `TR`; symbol) i jego połączenie strony WN (granica zasilania WN
 *    albo tor pola WN, `#hv-connector`) leżą w kadrze;
 *  - odcinki szyny sekcji (`<sekcja>#…`) leżą w kadrze;
 *  - tabela pól GPZ jest w kadrze cała albo wcale (nigdy przecięta).
 * Iloczyn cech: fikstura GPZ × sekcja × poziom szczegółu {1, 2}.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import type { BoundingBox } from '../../../v2/viewport/ViewportController';
import { buildSceneV3, type SceneV3 } from '../../scene/buildScene';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { prostokatyZakresu, zakresCelu } from '../zakresKadru';

const FIKSTURY = [
  'gpz110kvPolaSzablonow',
  'gpz110kvBkr',
  'gpz110kvPoleZuZ13',
  'gpz110kvPoleZuZ14',
  'gpz110kvPoleZuZ15',
  'gpzFeeder',
] as const;

function wczytaj(nazwa: string): EnergyNetworkModel {
  const plik = JSON.parse(readFileSync(`public/test-fixtures/${nazwa}.enm.json`, 'utf8'));
  return plik.enm ?? plik;
}

type Prost = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
const EPS = 1e-6;
const wKadrze = (r: Prost, k: BoundingBox): boolean =>
  r.x >= k.minX - EPS && r.y >= k.minY - EPS && r.x + r.width <= k.maxX + EPS && r.y + r.height <= k.maxY + EPS;
const rozlaczne = (r: Prost, k: BoundingBox): boolean =>
  r.x + r.width <= k.minX + EPS || r.x >= k.maxX - EPS || r.y + r.height <= k.minY + EPS || r.y >= k.maxY - EPS;

describe('kadr sekcji szyn GPZ — cała sekcja, sprzęgło, wieża TR, tabela pól cała albo wcale', () => {
  for (const nazwa of FIKSTURY) {
    for (const lod of [1, 2] as const) {
      it(`${nazwa} × L${lod}`, () => {
        const enm = wczytaj(nazwa);
        const sceny: Record<0 | 1 | 2, SceneV3> = { 0: buildSceneV3(enm, 0), 1: buildSceneV3(enm, 1), 2: buildSceneV3(enm, 2) };
        const scena = sceny[lod];
        const gpz = (enm.substations ?? []).find((s) => s.station_type === 'gpz');
        const sekcje = gpz?.gpz_sections ?? [];
        // Pusta wyrocznia = fałszywa pewność: fikstura MA sekcje GPZ.
        expect(sekcje.length).toBeGreaterThan(0);
        const panele = scena.meta.gpzAdnotacje?.panele ?? [];
        const tabela = scena.meta.gpzAdnotacje?.tabela?.rect ?? null;
        const transformatory = new Set((enm.transformers ?? []).map((t) => t.ref_id));
        let sprawdzonePanele = 0;
        for (const sekcja of sekcje) {
          const wynik = zakresCelu('sekcja', enm, [sekcja.section_id], sceny[2]);
          expect(wynik.dostepny, `sekcja ${sekcja.section_id}`).toBe(true);
          if (!wynik.dostepny) continue;
          const kadr = prostokatyZakresu(sceny, wynik.zakres).celByLod[lod];
          expect(kadr, `sekcja ${sekcja.section_id} nienarysowana na L${lod}`).not.toBeNull();
          if (!kadr) continue;
          const lacznikiSekcji = new Set(
            (enm.branches ?? [])
              .filter((b) => b.type === 'bus_coupler' && (b.from_bus_ref === sekcja.bus_ref || b.to_bus_ref === sekcja.bus_ref))
              .map((b) => b.ref_id),
          );
          const polaSekcji = (enm.bays ?? []).filter(
            (b) =>
              b.gpz_section_id === sekcja.section_id ||
              b.bus_ref === sekcja.bus_ref ||
              (b.equipment_refs ?? []).some((r) => lacznikiSekcji.has(r)),
          );
          const refyPol = new Set(polaSekcji.map((b) => b.ref_id));
          for (const panel of panele.filter((p) => refyPol.has(p.bayRef))) {
            sprawdzonePanele += 1;
            expect(wKadrze(panel.rect, kadr), `tło pola ${panel.bayRef} poza kadrem sekcji ${sekcja.section_id}`).toBe(true);
          }
          const trSekcji = polaSekcji.filter((b) => b.bay_role === 'TR').flatMap((b) => (b.equipment_refs ?? []).filter((r) => transformatory.has(r)));
          for (const tr of trSekcji) {
            const glif = scena.symbols.find((s) => s.symbolId === 'transformer2W' && s.meta?.ownerRef === tr);
            expect(glif, `brak symbolu transformatora ${tr}`).toBeDefined();
            if (glif) {
              const def = SYMBOL_DEFS.transformer2W;
              expect(wKadrze({ x: glif.x, y: glif.y, width: def.width, height: def.height }, kadr), `transformator ${tr}`).toBe(true);
            }
            for (const seg of scena.segments.filter((s) => s.meta?.ownerRef === `${tr}#hv-connector`)) {
              for (const pt of seg.points) {
                expect(wKadrze({ x: pt.x, y: pt.y, width: 0, height: 0 }, kadr), `połączenie WN ${tr}`).toBe(true);
              }
            }
          }
          for (const seg of scena.segments.filter((s) => (s.meta?.ownerRef ?? '').startsWith(`${sekcja.section_id}#`))) {
            for (const pt of seg.points) {
              expect(wKadrze({ x: pt.x, y: pt.y, width: 0, height: 0 }, kadr), `szyna ${seg.meta?.ownerRef}`).toBe(true);
            }
          }
          if (tabela) {
            expect(wKadrze(tabela, kadr) || rozlaczne(tabela, kadr), `tabela pól przecięta kadrem sekcji ${sekcja.section_id}`).toBe(true);
          }
        }
        expect(sprawdzonePanele).toBeGreaterThan(0);
      });
    }
  }
});
