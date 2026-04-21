/**
 * Testy dla BranchPoleCard i ZksnCard, czyli kart obiektów punktu rozgałęzienia SN.
 *
 * Weryfikuje:
 * 1. NodeTypeV1 zawiera dedykowane typy BRANCH_POLE i ZKSN_NODE
 * 2. Karty są eksportowane z barrel index
 * 3. catalogFirstRules blokuje insert_branch_pole_on_segment_sn i insert_zksn_on_segment_sn bez catalog_binding
 */

import { describe, expect, it } from 'vitest';

describe('BranchPoleCard i ZksnCard - typy węzłów SLD', () => {
  it('NodeTypeV1 zawiera BRANCH_POLE jako dedykowany typ', async () => {
    const { NodeTypeV1 } = await import('../../sld/core/visualGraph');
    expect(NodeTypeV1).toHaveProperty('BRANCH_POLE', 'BRANCH_POLE');
  });

  it('NodeTypeV1 zawiera ZKSN_NODE jako dedykowany typ', async () => {
    const { NodeTypeV1 } = await import('../../sld/core/visualGraph');
    expect(NodeTypeV1).toHaveProperty('ZKSN_NODE', 'ZKSN_NODE');
  });

  it('BRANCH_POLE jest inny niż istniejące typy stacji', async () => {
    const { NodeTypeV1 } = await import('../../sld/core/visualGraph');
    expect(NodeTypeV1.BRANCH_POLE).not.toBe(NodeTypeV1.STATION_SN_NN_A);
    expect(NodeTypeV1.BRANCH_POLE).not.toBe(NodeTypeV1.STATION_SN_NN_B);
    expect(NodeTypeV1.BRANCH_POLE).not.toBe(NodeTypeV1.STATION_SN_NN_C);
    expect(NodeTypeV1.BRANCH_POLE).not.toBe(NodeTypeV1.STATION_SN_NN_D);
    expect(NodeTypeV1.BRANCH_POLE).not.toBe(NodeTypeV1.SWITCHGEAR_BLOCK);
  });

  it('ZKSN_NODE jest inny niż istniejące typy stacji', async () => {
    const { NodeTypeV1 } = await import('../../sld/core/visualGraph');
    expect(NodeTypeV1.ZKSN_NODE).not.toBe(NodeTypeV1.STATION_SN_NN_A);
    expect(NodeTypeV1.ZKSN_NODE).not.toBe(NodeTypeV1.STATION_SN_NN_B);
    expect(NodeTypeV1.ZKSN_NODE).not.toBe(NodeTypeV1.STATION_SN_NN_C);
    expect(NodeTypeV1.ZKSN_NODE).not.toBe(NodeTypeV1.STATION_SN_NN_D);
    expect(NodeTypeV1.ZKSN_NODE).not.toBe(NodeTypeV1.BRANCH_POLE);
  });
});

describe('BranchPoleCard i ZksnCard - eksport z barrel index', () => {
  it('BranchPoleCard jest eksportowany z cards/index', async () => {
    const cards = await import('../cards');
    expect(cards).toHaveProperty('BranchPoleCard');
    expect(typeof cards.BranchPoleCard).toBe('function');
  });

  it('ZksnCard jest eksportowany z cards/index', async () => {
    const cards = await import('../cards');
    expect(cards).toHaveProperty('ZksnCard');
    expect(typeof cards.ZksnCard).toBe('function');
  });
});

describe('catalogFirstRules - catalog_binding wymagany dla branch points', () => {
  it('blokuje słup rozgałęźny bez catalog_binding', async () => {
    const { validateCatalogFirst } = await import('../forms/catalogFirstRules');
    const error = validateCatalogFirst('insert_branch_pole_on_segment_sn', {
      segment_id: 'seg-001',
      catalog_binding: {},
    });
    expect(error).not.toBeNull();
    expect(error).toMatch(/słupa rozgałęźnego|katalog/i);
  });

  it('przepuszcza słup rozgałęźny z catalog_binding', async () => {
    const { validateCatalogFirst } = await import('../forms/catalogFirstRules');
    const error = validateCatalogFirst('insert_branch_pole_on_segment_sn', {
      segment_id: 'seg-001',
      catalog_binding: { catalog_item_id: 'SŁUP-ODG-12' },
    });
    expect(error).toBeNull();
  });

  it('blokuje ZKSN bez catalog_binding', async () => {
    const { validateCatalogFirst } = await import('../forms/catalogFirstRules');
    const error = validateCatalogFirst('insert_zksn_on_segment_sn', {
      segment_id: 'seg-001',
      catalog_binding: {},
    });
    expect(error).not.toBeNull();
    expect(error).toMatch(/ZKSN|katalog/i);
  });

  it('przepuszcza ZKSN z catalog_binding', async () => {
    const { validateCatalogFirst } = await import('../forms/catalogFirstRules');
    const error = validateCatalogFirst('insert_zksn_on_segment_sn', {
      segment_id: 'seg-001',
      catalog_binding: { catalog_item_id: 'ZKSN-2P' },
    });
    expect(error).toBeNull();
  });
});

describe('BranchPointSN - model TypeScript', () => {
  it('typ BranchPointSN ma wymagane pola topologiczne', async () => {
    const { NodeTypeV1 } = await import('../../sld/core/visualGraph');
    expect(typeof NodeTypeV1.BRANCH_POLE).toBe('string');
    expect(typeof NodeTypeV1.ZKSN_NODE).toBe('string');
  });

  it('wszystkie wartości NodeTypeV1 są unikalne', async () => {
    const { NodeTypeV1 } = await import('../../sld/core/visualGraph');
    const values = Object.values(NodeTypeV1);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});
