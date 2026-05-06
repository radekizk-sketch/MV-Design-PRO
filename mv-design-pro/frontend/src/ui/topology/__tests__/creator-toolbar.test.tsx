import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CreatorToolbar } from '../CreatorToolbar';
import { CREATOR_TOOLS, EDITOR_OBJECT_TYPES } from '../editorPalette';

describe('CreatorToolbar V2', () => {
  it('render snapshot — evidence UI toolbar/palette', () => {
    const onToolChange = vi.fn();
    const { container } = render(
      <CreatorToolbar
        activeTool={'continue_trunk_segment_sn'}
        onToolChange={onToolChange}
        hasSource={true}
        hasCanonicalTrunkStart={true}
        hasRing={true}
      />,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('renderuje wymagane narzędzia kanoniczne', () => {
    const onToolChange = vi.fn();
    render(
      <CreatorToolbar
        activeTool={null}
        onToolChange={onToolChange}
        hasSource={true}
        hasCanonicalTrunkStart={true}
        hasRing={true}
      />,
    );

    expect(screen.getByTestId('creator-tool-select')).toBeDefined();
    expect(screen.getByTestId('creator-tool-move')).toBeDefined();
    expect(screen.getByTestId('creator-tool-continue_trunk_segment_sn')).toBeDefined();
    expect(screen.getByTestId('creator-tool-insert_station_on_segment_sn')).toBeDefined();
    expect(screen.getByTestId('creator-tool-start_branch_segment_sn')).toBeDefined();
    expect(screen.getByTestId('creator-tool-connect_secondary_ring_sn')).toBeDefined();
    expect(screen.getByTestId('creator-tool-set_normal_open_point')).toBeDefined();
    expect(screen.getByTestId('creator-tool-add_converter_source_pv')).toBeDefined();
    expect(screen.getByTestId('creator-tool-add_converter_source_bess')).toBeDefined();
    expect(screen.getByTestId('creator-tool-edit_properties')).toBeDefined();
    expect(screen.getByTestId('creator-tool-assign_catalog')).toBeDefined();
    expect(screen.getByTestId('creator-tool-delete_element')).toBeDefined();
  });

  it('pokazuje przycisk Dodaj GPZ tylko bez źródła', () => {
    const onToolChange = vi.fn();

    const { rerender } = render(
      <CreatorToolbar
        activeTool={null}
        onToolChange={onToolChange}
        hasSource={false}
        hasCanonicalTrunkStart={false}
        hasRing={false}
      />,
    );

    expect(screen.getByTestId('creator-tool-add_grid_source_sn')).toBeDefined();

    rerender(
      <CreatorToolbar
        activeTool={null}
        onToolChange={onToolChange}
        hasSource={true}
        hasCanonicalTrunkStart={false}
        hasRing={false}
      />,
    );

    expect(screen.queryByTestId('creator-tool-add_grid_source_sn')).toBeNull();
  });

  it('wywołuje zmianę aktywnego narzędzia po kliknięciu', () => {
    const onToolChange = vi.fn();

    render(
      <CreatorToolbar
        activeTool={null}
        onToolChange={onToolChange}
        hasSource={true}
        hasCanonicalTrunkStart={false}
        hasRing={false}
      />,
    );

    fireEvent.click(screen.getByTestId('creator-tool-connect_secondary_ring_sn'));
    expect(onToolChange).toHaveBeenCalledWith('connect_secondary_ring_sn');
  });

  it('kliknięcie "Usuń z modelu" aktywuje narzędzie delete_element', () => {
    const onToolChange = vi.fn();

    render(
      <CreatorToolbar
        activeTool={null}
        onToolChange={onToolChange}
        hasSource={true}
        hasCanonicalTrunkStart={false}
        hasRing={false}
      />,
    );

    fireEvent.click(screen.getByTestId('creator-tool-delete_element'));
    expect(onToolChange).toHaveBeenCalledWith('delete_element');
  });
  it('nie utrwala technicznych semantyk STACJA_A/B/C/D w palecie', () => {
    const blob = JSON.stringify(EDITOR_OBJECT_TYPES);
    expect(blob).not.toContain('STACJA_A');
    expect(blob).not.toContain('STACJA_B');
    expect(blob).not.toContain('STACJA_C');
    expect(blob).not.toContain('STACJA_D');
  });

  it('ukrywa continue_trunk bez jawnego portu pola GPZ albo otwartego terminala', () => {
    const onToolChange = vi.fn();

    render(
      <CreatorToolbar
        activeTool={null}
        onToolChange={onToolChange}
        hasSource={true}
        hasCanonicalTrunkStart={false}
        hasRing={false}
      />,
    );

    expect(screen.queryByTestId('creator-tool-continue_trunk_segment_sn')).toBeNull();
  });
});

describe('editorPalette', () => {
  // grep guard: forbidden token assertion (zakaz wprowadzania PCC do palety)
  it('nie zawiera zakazanych terminów', () => {
    const blob = JSON.stringify({ tools: CREATOR_TOOLS, objects: EDITOR_OBJECT_TYPES }).toUpperCase();
    expect(blob.includes('P' + 'CC')).toBe(false);
  });

  it('definiuje wszystkie minimalne typy obiektów', () => {
    const ids = EDITOR_OBJECT_TYPES.map((item) => item.id).sort();
    expect(ids).toEqual([
      'BESS',
      'GPZ',
      'PUNKT_ROZGALEZNY',
      'PV',
      'STACJA_KONCOWA',
      'STACJA_ODGALEZNA',
      'STACJA_PRZELOTOWA',
      'STACJA_SEKCYJNA',
      'ZKSN',
    ]);
  });

  it('mapuje delete_element na kanoniczną operację delete_element', () => {
    const deleteTool = CREATOR_TOOLS.find((tool) => tool.id === 'delete_element');
    expect(deleteTool?.canonicalOp).toBe('delete_element');
  });
});
