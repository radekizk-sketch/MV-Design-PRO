"""Testy modułu wiedzy ENEA (UI bez symulacji fizyki)."""
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { EneaSourceDocuments } from '../EneaSourceDocuments';

const CATALOG = {
  as_of: '2026-10-23',
  sources: [
    {
      id: 'ENEA-SN-KAB',
      title: 'Elektroenergetyczne linie kablowe średniego napięcia',
      family: 'standard', area: 'SN', effective_from: '2026-07-01',
      effective_to: null, url: 'https://www.operator.enea.pl/media/4774/',
      index_url: 'https://www.operator.enea.pl/standards', engineering_scope: 'kable SN',
    },
    {
      id: 'ENEA-SN-Z1',
      title: 'Stacje transformatorowe SN/nN',
      family: 'standard', area: 'SN', effective_from: '2025-01-01',
      effective_to: null, url: 'https://www.operator.enea.pl/media/683/',
      index_url: 'https://www.operator.enea.pl/standards', engineering_scope: 'stacje',
    },
    {
      id: 'ENEA-IRIESD-TJ',
      title: 'IRiESD — tekst ujednolicony',
      family: 'iriesd', area: 'SN', effective_from: '2026-10-19',
      effective_to: null, url: 'https://www.operator.enea.pl/media/5188/',
      index_url: 'https://www.operator.enea.pl/iriesd', engineering_scope: 'OZE',
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('pokazuje dokumenty z istniejącego API i filtruje kategorię oraz nazwę', async () => {
  const fetchSpy = vi.fn(async () => ({
    ok: true, json: async () => ({ source_catalog: CATALOG }),
  }));
  vi.stubGlobal('fetch', fetchSpy);
  const user = userEvent.setup();
  render(<EneaSourceDocuments />);
  expect(fetchSpy).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Dokumenty źródłowe ENEA' }));
  expect(await screen.findByText('Elektroenergetyczne linie kablowe średniego napięcia')).toBeTruthy();
  expect(screen.getByText('Liczba dokumentów: 2')).toBeTruthy();
  await user.type(screen.getByRole('searchbox', { name: 'Szukaj dokumentu' }), 'stacje');
  expect(screen.getByText('Liczba dokumentów: 1')).toBeTruthy();
  expect(screen.queryByText('Elektroenergetyczne linie kablowe średniego napięcia')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'IRiESD' }));
  await user.clear(screen.getByRole('searchbox', { name: 'Szukaj dokumentu' }));
  expect(screen.getByText('IRiESD — tekst ujednolicony')).toBeTruthy();
  const link = screen.getByRole('link', { name: 'IRiESD — tekst ujednolicony' });
  expect(link.getAttribute('href')).toBe('https://www.operator.enea.pl/media/5188/');
  expect(link.getAttribute('rel')).toContain('noreferrer');
  await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
});
