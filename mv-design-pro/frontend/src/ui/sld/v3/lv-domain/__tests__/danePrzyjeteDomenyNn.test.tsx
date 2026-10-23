/**
 * Dane przyjęte w widoku domeny nN (kontrakt werdyktu §3, ZASADA NR 4 pkt 4).
 *
 * Emitery backendu w projekcji `projection_v1`: równoważnik sieci SN kotwicy
 * (`lv_domain/upstream_equivalent.py`), profil napięć (`voltage_profile_view.py`) i werdykt
 * SWZ TN odpływu (`swz/werdykt.py`). Widok pokazuje każdą parę wspólnym zapisem
 * `StanDanychWyniku` przy wyniku, którego dotyczy: kotwica — nad schematem z nazwą
 * transformatora, profil — przy nakładce spadków napięcia, SWZ — w karcie odpływu.
 *
 * Iloczyn cech: miejsce {kotwica, profil napięć, SWZ TN} × lista {pusta, jeden wpis, wiele
 * źródeł} × {zwinięty, rozwinięty}; dodatkowo: druga kotwica i inne odpływy bez wpisów, profil
 * niewidoczny bez nakładki spadków. Scenariusze projekcji z generatora backendu.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  WARIANTY_LISTY,
  paraDanych,
  sprawdzDanePrzyjete,
} from '../../../../../ui2/wyniki/wzorzec/__tests__/danePrzyjeteIloczyn';
import { LvDomainView } from '../LvDomainView';
import { scenariusz } from '../fixtures/scenariusze';
import type { LvDomainProjectionV1 } from '../types';

afterEach(() => cleanup());

function kopia(slug: Parameters<typeof scenariusz>[0]): LvDomainProjectionV1 {
  return structuredClone(scenariusz(slug)) as LvDomainProjectionV1;
}

describe.each(WARIANTY_LISTY)('domena nN — dane przyjęte — $nazwa', ({ dane }) => {
  it('równoważnik sieci SN: wpisy przy kotwicy, której dotyczą; druga kotwica bez wpisów', async () => {
    const p = kopia('02_two_tr_qbc_open');
    const [pierwsza, druga] = p.upstream_equivalents;
    const bezPary = ({ status_danych: _s, dane_przyjete: _d, ...reszta }: typeof pierwsza) => reszta;
    (p as { upstream_equivalents: unknown }).upstream_equivalents = [
      { ...bezPary(pierwsza), ...paraDanych(dane) },
      bezPary(druga),
    ];
    render(<LvDomainView projection={p} width={1400} height={1000} lod={2} />);
    const blok = screen.getByTestId('lv-domain-dane-przyjete');
    const id1 = `lv-domain-kotwica-${pierwsza.transformer_ref}`;
    const id2 = `lv-domain-kotwica-${druga.transformer_ref}`;
    await sprawdzDanePrzyjete(blok, id1, dane);
    expect(within(blok).queryByTestId(`${id2}-dane`)).not.toBeInTheDocument();
    if (dane.length > 0) {
      const nazwa = p.graph.transformers.find((t) => t.ref_id === pierwsza.transformer_ref)!.name;
      expect(screen.getByTestId(`${id1}-dane-podsumowanie`)).toHaveTextContent(
        `dotyczy: równoważnik sieci SN — ${nazwa}`,
      );
    }
  });

  it('profil napięć: przy nakładce spadków napięcia; bez nakładki niewidoczny', async () => {
    const p = kopia('16_stale_result');
    const profil = p.result_snapshot.voltage_profile!;
    (p.result_snapshot as { voltage_profile: unknown }).voltage_profile = {
      ...profil,
      ...paraDanych(dane),
    };
    const { unmount } = render(
      <LvDomainView projection={p} width={1400} height={1000} lod={2} initialOverlay="voltageDrop" />,
    );
    await sprawdzDanePrzyjete(
      screen.getByTestId('lv-domain-dane-przyjete'),
      'lv-domain-profil-napiec',
      dane,
    );
    unmount();
    render(<LvDomainView projection={p} width={1400} height={1000} lod={2} />);
    expect(screen.queryByTestId('lv-domain-profil-napiec-dane')).not.toBeInTheDocument();
  });

  it('SWZ TN: wpisy w karcie odpływu, którego werdykt dotyczą', async () => {
    const p = kopia('18_swz_overlay');
    const odplywy = p.swz_snapshot.transformers[0].feeders;
    const qf02 = odplywy.find((f) => f.feeder_root_branch_ref === 'QF-02')!;
    (qf02.swz as { swz: unknown }).swz = { ...qf02.swz.swz, ...paraDanych(dane) };
    render(<LvDomainView projection={p} width={1400} height={1000} lod={2} />);
    const uzytkownik = userEvent.setup();
    await uzytkownik.click(screen.getByTestId('lv-domain-node-QF-02'));
    await sprawdzDanePrzyjete(
      screen.getByTestId('lv-domain-feeder-swz-tn'),
      'lv-domain-feeder-swz-tn',
      dane,
    );
    // Inny odpływ (bez wpisów) — karta bez zapisu danych przyjętych.
    await uzytkownik.click(screen.getByTestId('lv-domain-node-QF-01'));
    expect(screen.getByTestId('lv-domain-feeder-panel')).toHaveAttribute('data-feeder-ref', 'QF-01');
    await sprawdzDanePrzyjete(
      screen.getByTestId('lv-domain-feeder-swz-tn'),
      'lv-domain-feeder-swz-tn',
      [],
    );
  });
});
