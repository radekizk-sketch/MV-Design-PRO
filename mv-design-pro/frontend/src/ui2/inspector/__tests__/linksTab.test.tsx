import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LinksTab } from '../LinksTab';
import { INSPECTOR_STRINGS } from '../strings';
import type { PowiazaniaObiektu } from '../inspectorModel';

const powiazania: PowiazaniaObiektu = {
  wchodzace: [{ cel: { id: 'TR-1', typ: 'transformator' }, etykieta: 'Transformator T1', relacja: 'zasila' }],
  wychodzace: [{ cel: { id: 'LINE-3', typ: 'linia' }, etykieta: 'Linia L3', relacja: 'odpływ' }],
};

describe('LinksTab — nawigacja dwukierunkowa (W-602)', () => {
  it('pokazuje sekcje „Wchodzące" i „Wychodzące"', () => {
    render(<LinksTab powiazania={powiazania} onNawiguj={() => {}} />);
    expect(screen.getByText(INSPECTOR_STRINGS.powiazaniaWchodzace)).toBeInTheDocument();
    expect(screen.getByText(INSPECTOR_STRINGS.powiazaniaWychodzace)).toBeInTheDocument();
  });

  it('klik pozycji wchodzącej → onNawiguj(cel)', () => {
    const onNawiguj = vi.fn();
    render(<LinksTab powiazania={powiazania} onNawiguj={onNawiguj} />);
    fireEvent.click(screen.getByText('Transformator T1'));
    expect(onNawiguj).toHaveBeenCalledWith({ id: 'TR-1', typ: 'transformator' });
  });

  it('klik pozycji wychodzącej → onNawiguj(cel)', () => {
    const onNawiguj = vi.fn();
    render(<LinksTab powiazania={powiazania} onNawiguj={onNawiguj} />);
    fireEvent.click(screen.getByText('Linia L3'));
    expect(onNawiguj).toHaveBeenCalledWith({ id: 'LINE-3', typ: 'linia' });
  });

  it('brak powiązań → stan pusty', () => {
    render(<LinksTab powiazania={{ wchodzace: [], wychodzace: [] }} onNawiguj={() => {}} />);
    expect(screen.getByText(INSPECTOR_STRINGS.brakPowiazan)).toBeInTheDocument();
  });

  it('tylko wchodzące: sekcja wychodzących nie jest renderowana', () => {
    render(
      <LinksTab
        powiazania={{ wchodzace: powiazania.wchodzace, wychodzace: [] }}
        onNawiguj={() => {}}
      />,
    );
    expect(screen.getByText(INSPECTOR_STRINGS.powiazaniaWchodzace)).toBeInTheDocument();
    expect(screen.queryByText(INSPECTOR_STRINGS.powiazaniaWychodzace)).not.toBeInTheDocument();
  });
});
