// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { isConnectionNodeLikeId } from './connectionNode';

describe('isConnectionNodeLikeId', () => {
  it('wykrywa identyfikatory węzła przyłączenia', () => {
    expect(isConnectionNodeLikeId('connection_node')).toBe(true);
    expect(isConnectionNodeLikeId('bus_connection_node_main')).toBe(true);
    expect(isConnectionNodeLikeId('connection_source')).toBe(true);
    expect(isConnectionNodeLikeId('x_connection_node')).toBe(true);
    expect(isConnectionNodeLikeId('punkt_przylaczenia_01')).toBe(true);
  });

  it('nie oznacza zwykłych elementów sieci', () => {
    expect(isConnectionNodeLikeId('bus_gpz_110')).toBe(false);
    expect(isConnectionNodeLikeId('line_sn_1')).toBe(false);
    expect(isConnectionNodeLikeId(null)).toBe(false);
    expect(isConnectionNodeLikeId(undefined)).toBe(false);
  });
});
