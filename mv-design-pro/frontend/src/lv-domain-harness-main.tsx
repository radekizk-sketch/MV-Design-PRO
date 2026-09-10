/**
 * Harness zrzutowy projekcji nN — `LvDomainView` na scenariuszach §47.
 *
 * Wzorzec IDENTYCZNY z `screenshot-harness-main.tsx` (standalone entry HTML,
 * parametry w query, `data-status` na korzeniu dla Playwright) — WŁASNA kanwa
 * domeny nN, ZERO fetch/routing/kamery. Dane WYŁĄCZNIE z
 * `lv-domain/fixtures/scenariusze.ts` (JSON wyeksportowane z backendu —
 * jedno źródło prawdy energizacji; harness nie modyfikuje projekcji).
 *
 * Parametry:
 *  - `?scenariusz=<slug>` — jeden z `SLUGI_SCENARIUSZY` (domyślnie 01);
 *  - `?lod=0|1|2` — poziom szczegółowości (domyślnie 2, pełny);
 *  - `?theme=light|dark` — motyw (paleta kanwy idzie z motywu);
 *  - `?mono=1` — paleta monochromatyczna (druk A4/A3, §44);
 *  - `?overlay=loads|voltageDrop|shortCircuit|swz` — nakładka startowa;
 *  - `?wybor=<ref>` — element wybrany na start (podświetlenie toru zasilania).
 *
 * Used by: e2e/lv-domain-screenshot.spec.ts.
 */
import { createRoot } from 'react-dom/client';
// Ten sam dostawca React Query co `main.tsx` (jeden klient z `./query-client`):
// komponenty montowane w harnessie czytają katalogi backendu przez `useQuery`
// (od karty FAB-J m.in. kreator OZE i snapshot audytu 2) — bez dostawcy strona
// harnessu padała przy montażu i korzeń z `data-status` nigdy nie powstawał
// (5 czerwonych specyfikacji `creator-screenshot` w CI). Klasa: KAŻDE wejście
// `*-harness-main.tsx`, nie tylko kreatora.
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './query-client';

import { LvDomainView } from './ui/sld/v3/lv-domain/LvDomainView';
import { paletaMono, paletaNnDlaMotywu } from './ui/sld/v3/lv-domain/visualGrammar';
import { SCENARIUSZE_NN, TYTULY_SCENARIUSZY, jestSlugiemScenariusza, type SlugScenariusza } from './ui/sld/v3/lv-domain/fixtures/scenariusze';
import type { PoziomLod } from './ui/sld/v3/lv-domain/visualGrammar';
import type { LvDomainOverlayId } from './ui/sld/v3/lv-domain/types';
import type { ThemeMode } from './ui2/theme/themeMode';

const params = new URLSearchParams(window.location.search);

const theme: ThemeMode = params.get('theme') === 'light' ? 'light_technical' : 'dark_scada';
const mono = params.get('mono') === '1';
document.documentElement.setAttribute('data-theme', theme);
const paleta = mono ? paletaMono() : paletaNnDlaMotywu(theme);
document.documentElement.style.background = paleta.tlo;
document.body.style.background = paleta.tlo;

const OVERLAY_IDS: readonly LvDomainOverlayId[] = ['loads', 'voltageDrop', 'shortCircuit', 'swz'];

function readOverlay(): LvDomainOverlayId | null {
  const raw = params.get('overlay');
  return (OVERLAY_IDS as readonly string[]).includes(raw ?? '') ? (raw as LvDomainOverlayId) : null;
}

function readScenariusz(): SlugScenariusza {
  const raw = params.get('scenariusz');
  return jestSlugiemScenariusza(raw) ? raw : '01_single_tr';
}

function readLod(): PoziomLod {
  const raw = params.get('lod');
  if (raw === '0') return 0;
  if (raw === '1') return 1;
  return 2;
}

function HarnessRoot(): JSX.Element {
  const slug = readScenariusz();
  const lod = readLod();
  const projection = SCENARIUSZE_NN[slug];
  return (
    <div
      id="lv-domain-harness-root"
      data-testid="lv-domain-harness-root"
      data-scenariusz={slug}
      data-tytul={TYTULY_SCENARIUSZY[slug]}
      data-lod={lod}
      data-theme-mode={theme}
      data-mono={mono ? 'true' : 'false'}
    >
      <LvDomainView
        projection={projection}
        initialOverlay={readOverlay()}
        initialSelectedRef={params.get('wybor')}
        lod={lod}
        theme={theme}
        mono={mono}
        width={window.innerWidth}
        height={window.innerHeight}
      />
    </div>
  );
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('lv-domain-harness: brak elementu #root');
rootEl.style.background = paleta.tlo;
createRoot(rootEl).render(
  <QueryClientProvider client={queryClient}>
    <HarnessRoot />
  </QueryClientProvider>,
);
