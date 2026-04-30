/**
 * useEnmHashChain — pięć ortogonalnych hashy ENM (V12S-010).
 *
 * Backend (V12S-010) eksponuje pięć niezależnych hashy:
 *   semantic   topologia + role + pasma napięciowe + catalog_ref
 *   input      wejścia obliczeniowe (R, X, B, ratingi, długości…)
 *   case       parametry przypadku obliczeniowego
 *   variant    delta wariantu (overlay)
 *   switching  stany łączników (open/closed)
 *
 * Hashe są ortogonalne — zmiana parametru długości linii zmienia tylko
 * `input`, nie `semantic`. Pozwala to na różnicowe unieważnianie wyników.
 *
 * FE konsumuje hashe OPCJONALNIE — dopóki backend nie populuje
 * `enmHashChain` w storze, hook zwraca `null` i UI pokazuje placeholder.
 */

import { useAppStateStore, type EnmHashChainState } from './store';

export type EnmHashChain = EnmHashChainState;

/**
 * Zwraca aktualny chain hashy lub `null` gdy brak danych.
 *
 * Wartość pochodzi z `useAppStateStore.enmHashChain`, ustawianego
 * przez `setEnmHashChain` (np. po pobraniu wyników solverów lub
 * nagłówka aktywnej migawki ENM).
 */
export function useEnmHashChain(): EnmHashChain | null {
  return useAppStateStore((s) => s.enmHashChain);
}

/** Skrócona prezentacja hashu — pierwsze 8 znaków lub '—' gdy brak. */
export function shortHash(value: string | null | undefined): string {
  if (!value) return '—';
  return value.length > 8 ? value.slice(0, 8) : value;
}
