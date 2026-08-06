/**
 * KARTA WN-WYNIK — klasa „wynik jednego poziomu napięcia na szynie innego
 * poziomu" (zgłoszenie właściciela: etykieta „U 15,02 kV" na szynie WN 110 kV).
 *
 * Test jest ILOCZYNEM CECH, nie przykładem z karty:
 *   {szyna WN GPZ · szyna SN sekcji GPZ · szyna SN stacji · szyna nN stacji}
 *   × {wynik obecny · wynik nieobecny}
 * plus dwie reguły domykające klasę:
 *   (a) ODMOWA zamiast podstawienia — payload kluczowany refem RYSUNKU
 *       (`…#hv-bus`, `…#sn-bus`) NIE daje etykiety, bo backend takich kluczy
 *       nie emituje, a schodzenie do nich mogłoby trafić klucz innego obiektu;
 *   (b) POZIOM NAPIĘCIA — wartość U przypięta do szyny pochodzi z TEJ szyny,
 *       więc jej rząd wielkości zgadza się z `Bus.voltage_kv` (miara sondy
 *       `bus_result_voltage_level_probe` w `scripts/sld_v3_acceptance.mjs`).
 *
 * Fixtura REALNA (`sldSubstrate52s` — GPZ 110/15 kV + 52 stacje SN/nN, jedyna
 * w repo z pełnym kompletem trzech poziomów napięcia); WSZYSTKIE refy odczytane
 * ze sceny i z migawki — zero refów wymyślonych. Wartości U wprost z
 * `Bus.voltage_kv` odpowiedniej szyny (odczyt rozpływu odwzorowany odchyłem
 * +0,13 %, ten sam co w sondzie akceptacyjnej) — zero fizyki w teście.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import type { RawOverlayElement, RawOverlayPayload } from '../../../../sld-overlay/rawResultOverlayStore';
import { buildSceneV3 } from '../../scene/buildScene';
import { buildResultLabelsFromScene, orientedSegmentRefs, resultRefForSegment } from '../resultLabels';
import { buildResultRefBridge } from '../resultRefBridge';

const here = dirname(fileURLToPath(import.meta.url));
const enm = (
  JSON.parse(
    readFileSync(
      resolve(here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json'),
      'utf8',
    ),
  ) as { readonly enm: EnergyNetworkModel }
).enm;

const scene = buildSceneV3(enm, 2);
const singleHop = new Set(orientedSegmentRefs(enm).keys());
const bridge = buildResultRefBridge(enm);
const busVoltageByRef = new Map((enm.buses ?? []).map((b) => [b.ref_id, b.voltage_kv]));

/** Punkt wyniku, którego szuka warstwa dla danego refu rysunku — DOKŁADNIE ta
 *  sama kolejność co `buildResultLabelsFromScene` (most, potem `busResultRef`). */
function punktWyniku(ownerRef: string): string | undefined {
  const binding = bridge.get(ownerRef);
  if (binding) return binding.resultRef;
  const seg = scene.segments.find((s) => s.meta?.ownerRef === ownerRef);
  return seg ? resultRefForSegment(seg.meta) : undefined;
}

/** Ref rysunku (`ownerRef` sceny) pierwszego odcinka o podanym sufiksie. */
function refRysunku(sufiks: string): string {
  const seg = scene.segments.find((s) => s.meta?.ownerRef?.endsWith(sufiks));
  if (!seg?.meta?.ownerRef) throw new Error(`brak odcinka „${sufiks}" w scenie referencyjnej`);
  return seg.meta.ownerRef;
}

function elementSzyny(refId: string, un: number): RawOverlayElement {
  return {
    ref_id: refId,
    kind: 'bus',
    badges: [],
    severity: 'INFO',
    metrics: { U_kV: { code: 'U_kV', value: un * 1.0013, unit: 'kV', format_hint: 'fixed2' } },
  };
}

function payload(elements: Record<string, RawOverlayElement>): RawOverlayPayload {
  return { run_id: 'wn-wynik', analysis_type: 'load_flow', elements };
}

/** Cztery RODZINY szyn rysunku — po jednej realnej reprezentantce ze sceny. */
const RODZINY = [
  { nazwa: 'szyna WN GPZ (110 kV)', ownerRef: refRysunku('#hv-bus') },
  { nazwa: 'szyna SN sekcji GPZ (15 kV)', ownerRef: refRysunku('#bus-primary') },
  { nazwa: 'szyna SN stacji (15 kV)', ownerRef: refRysunku('#sn-bus') },
  { nazwa: 'szyna nN stacji (0,4 kV)', ownerRef: refRysunku('#lv-bus') },
] as const;

describe('WN-WYNIK — wynik szyny pochodzi z TEJ szyny (iloczyn cech: rodzina × obecność wyniku)', () => {
  it('scena referencyjna niesie WSZYSTKIE trzy poziomy napięcia (inaczej iloczyn cech byłby pozorny)', () => {
    const poziomy = new Set(
      RODZINY.map(({ ownerRef }) => busVoltageByRef.get(punktWyniku(ownerRef) ?? '')).filter((u) => u != null),
    );
    expect([...poziomy].sort((a, b) => (a as number) - (b as number))).toEqual([0.4, 15, 110]);
  });

  for (const { nazwa, ownerRef } of RODZINY) {
    it(`${nazwa} × wynik OBECNY ⇒ etykieta z punktu wyniku TEJ szyny, zgodna z jej poziomem napięcia`, () => {
      const ref = punktWyniku(ownerRef);
      expect(ref).toBeDefined();
      const un = busVoltageByRef.get(ref!);
      expect(un).toBeDefined();

      const entries = buildResultLabelsFromScene(
        scene,
        payload({ [ref!]: elementSzyny(ref!, un!) }),
        singleHop,
        undefined,
        bridge,
      );
      const wpis = entries[ownerRef];
      expect(wpis?.resultRef).toBe(ref);
      expect(wpis?.kind).toBe('bus');

      // POZIOM NAPIĘCIA: liczba z etykiety zgadza się co do rzędu z Un szyny.
      const linia = wpis!.lines.find((l) => l.prefix === 'U');
      expect(linia).toBeDefined();
      const u = Number(/^(-?\d+(?:,\d+)?)\s/.exec(linia!.text)![1].replace(',', '.'));
      expect(Math.abs(u / un! - 1)).toBeLessThan(0.5);
    });

    it(`${nazwa} × wynik NIEOBECNY ⇒ BRAK etykiety (uczciwe „brak wyniku", nigdy wartość innej szyny)`, () => {
      // Payload niesie wynik WSZYSTKICH POZOSTAŁYCH rodzin — gdyby warstwa
      // schodziła do „czegokolwiek, co pasuje", ta szyna dostałaby cudzą liczbę.
      const inne: Record<string, RawOverlayElement> = {};
      for (const rodzina of RODZINY) {
        if (rodzina.ownerRef === ownerRef) continue;
        const r = punktWyniku(rodzina.ownerRef);
        const un = r ? busVoltageByRef.get(r) : undefined;
        if (r && un != null) inne[r] = elementSzyny(r, un);
      }
      const entries = buildResultLabelsFromScene(scene, payload(inne), singleHop, undefined, bridge);
      expect(entries[ownerRef]).toBeUndefined();
    });

    it(`${nazwa} × payload kluczowany refem RYSUNKU ⇒ BRAK etykiety (odmowa zamiast podstawienia)`, () => {
      // Backend kluczuje `Bus.ref_id`; ref rysunku (`…#hv-bus`) w payloadzie nie
      // istnieje. Gdyby warstwa go akceptowała, każdy przyszły zbieg nazw
      // przypiąłby szynie wielkość innego obiektu.
      const un = busVoltageByRef.get(punktWyniku(ownerRef) ?? '') ?? 15;
      const entries = buildResultLabelsFromScene(
        scene,
        payload({ [ownerRef]: elementSzyny(ownerRef, un) }),
        singleHop,
        undefined,
        bridge,
      );
      expect(entries[ownerRef]).toBeUndefined();
    });
  }

  /* TRZECIA OŚ ILOCZYNU: {z mostem refów · BEZ mostu}. Most (wołający z
     migawką) przechwytuje szyny stacji zanim dojdzie do `resultRefForSegment`,
     więc bez tej osi reguła odmowy byłaby nieodróżnialna od stanu sprzed karty
     — sprawdzone iniekcją (przywrócenie fallbacku NIE ruszyło asercji z mostem).
     Wołający bez mostu to realna ścieżka API (`bridge` jest opcjonalny). */
  describe('bez mostu refów — odmowa obowiązuje tak samo', () => {
    it('szyna SN stacji: payload kluczowany refem RYSUNKU ⇒ BRAK etykiety (dawniej: wpis o refie rysunku, czyli kanał zgadywania)', () => {
      const ownerRef = refRysunku('#sn-bus');
      const entries = buildResultLabelsFromScene(
        scene,
        payload({ [ownerRef]: elementSzyny(ownerRef, 15) }),
        singleHop,
      );
      expect(entries[ownerRef]).toBeUndefined();
    });

    it('szyna WN GPZ: payload kluczowany KANONICZNYM Bus.ref_id ⇒ etykieta jest (odmowa nie psuje ścieżki udowodnionej)', () => {
      const ownerRef = refRysunku('#hv-bus');
      const ref = punktWyniku(ownerRef)!;
      const un = busVoltageByRef.get(ref)!;
      const entries = buildResultLabelsFromScene(scene, payload({ [ref]: elementSzyny(ref, un) }), singleHop);
      expect(entries[ownerRef]?.resultRef).toBe(ref);
    });
  });

  it('INIEKCJA: wynik szyny SN wstawiony pod klucz szyny WN ⇒ etykieta szyny WN niesie liczbę SPOZA jej poziomu (dowód, że reguła poziomu ma co wykrywać)', () => {
    const wnOwner = refRysunku('#hv-bus');
    const wnRef = punktWyniku(wnOwner)!;
    const snRef = punktWyniku(refRysunku('#bus-primary'))!;
    const un = busVoltageByRef.get(wnRef)!;
    const usn = busVoltageByRef.get(snRef)!;

    const entries = buildResultLabelsFromScene(
      scene,
      // Element pod kluczem szyny WN, ale z wartością szyny SN — dokładnie
      // defekt ze zgłoszenia („U 15,02 kV" na 110 kV).
      payload({ [wnRef]: elementSzyny(wnRef, usn) }),
      singleHop,
      undefined,
      bridge,
    );
    const linia = entries[wnOwner]!.lines.find((l) => l.prefix === 'U')!;
    const u = Number(/^(-?\d+(?:,\d+)?)\s/.exec(linia.text)![1].replace(',', '.'));
    expect(Math.abs(u / un - 1)).toBeGreaterThanOrEqual(0.5);
  });
});
