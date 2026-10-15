/**
 * Mapowanie szablonów nastaw z katalogu backendu — jednostka zakresu prądowego (PZ-09).
 *
 * Karta BIEG-ZABEZPIECZEN-Z-MODELU: zakresy prądowe szablonów referencyjnych nie mają podstawy
 * jednostki (ampery wtórne, krotność In czy ampery pierwotne), więc katalog podaje `unit: null`
 * i nazwany stan `jednostka_status: "NIEUSTALONA"`. Iloczyn cech: {pole: prądowe bez podstawy,
 * zwłoka z jednostką „s”, pole z nieznanym stanem} × {mapowanie klienta}.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchProtectionTypesByCategory } from '../api';
import type { ProtectionSettingTemplate } from '../types';

describe('szablony nastaw — jednostka zakresu prądowego', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stan NIEUSTALONA przechodzi do klienta, jednostka „A” nie jest dopisywana', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify([
            {
              id: 'template_ref_oc_100',
              name_pl: 'Szablon profilu referencyjnego OC 100 - nadprądowy',
              params: {
                setting_fields: [
                  { name: 'I>', unit: null, jednostka_status: 'NIEUSTALONA', min: 0.1, max: 8.0 },
                  { name: 't>', unit: 's', min: 0.0, max: 5.0 },
                  { name: 'X', unit: null, jednostka_status: 'INNY_STAN', min: 1, max: 2 },
                ],
              },
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const [szablon] = (await fetchProtectionTypesByCategory('TEMPLATE')) as ProtectionSettingTemplate[];
    const [prad, zwloka, nieznany] = szablon.setting_fields!;
    expect(prad).toEqual({ name: 'I>', unit: undefined, jednostka_status: 'NIEUSTALONA', min: 0.1, max: 8.0 });
    expect(zwloka.unit).toBe('s');
    expect(zwloka.jednostka_status).toBeUndefined();
    expect(nieznany.jednostka_status).toBeUndefined();
  });
});
