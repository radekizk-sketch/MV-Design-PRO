import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { EneaQuestionPanel } from '../EneaQuestionPanel';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('pytanie po polsku zwraca werdykt wraz z punktem i stroną źródła', async () => {
  const fetchSpy = vi.fn(async (_url: string) => ({
    ok: true,
    json: async () => ({
      question: 'Czy nowa stacja słupowa z kablowym podejściem?',
      as_of: '2026-10-23',
      status: 'POTWIERDZONE_W_KARCIE',
      verdict: 'NIEDOPUSZCZONE',
      answer_pl: 'Nie należy stosować nowych stacji słupowych z kablowym podejściem SN.',
      scope_pl: 'Nowo budowane stacje SN/nN.',
      rule_id: 'ENEA-ST3-002-A',
      sources: [{
        source_id: 'ENEA-SN-Z3',
        title: 'Stacje słupowe',
        section: '2. Zakres opracowania',
        page_pdf: 3,
        page_printed: '3/14',
        edition: '06.2021-2',
        effective_from: '2024-04-02',
        url: 'https://www.operator.enea.pl/media/685/#page=3',
        excerpt: null,
        sha256: null,
        provenance: 'karta_wymagania_zweryfikowana',
        needs_manual_interpretation: false,
      }],
      indexed_documents: 0,
      catalog_documents: 27,
      requires_review: true,
      suggested_documents: [],
    }),
  }));
  vi.stubGlobal('fetch', fetchSpy);
  const user = userEvent.setup();
  render(<EneaQuestionPanel />);
  await user.type(
    screen.getByRole('textbox', { name: 'Pytanie inżynierskie' }),
    'Czy nowa stacja słupowa z kablowym podejściem?',
  );
  await user.click(screen.getByRole('button', { name: 'Sprawdź w standardach' }));
  expect(await screen.findByText('Werdykt: NIEDOPUSZCZONE')).toBeTruthy();
  expect(screen.getByText(/2. Zakres opracowania/)).toBeTruthy();
  expect(screen.getByText(/s. 3\/14/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Stacje słupowe' }).getAttribute('href'))
    .toContain('#page=3');
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  expect(String(fetchSpy.mock.calls[0][0])).toContain('/api/reference/enea/pytanie?');
});

it('brak zaindeksowanego dokumentu nie jest komunikowany jako brak przepisu', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({
      as_of: '2026-10-23',
      status: 'BRAK_INDEKSU',
      verdict: null,
      answer_pl: 'Brak lokalnego indeksu PDF.',
      scope_pl: 'Wymagana kontrola oficjalnego źródła.',
      rule_id: null,
      sources: [],
      suggested_documents: [],
      indexed_documents: 0,
      catalog_documents: 27,
      requires_review: true,
    }),
  })));
  const user = userEvent.setup();
  render(<EneaQuestionPanel />);
  await user.type(screen.getByRole('textbox', { name: 'Pytanie inżynierskie' }), 'Jakie uziemienie?');
  await user.click(screen.getByRole('button', { name: 'Sprawdź w standardach' }));
  expect(await screen.findByText('Nie potwierdzono wymagania')).toBeTruthy();
  expect(screen.getByText(/Brak trafienia nie oznacza braku przepisu/)).toBeTruthy();
});
