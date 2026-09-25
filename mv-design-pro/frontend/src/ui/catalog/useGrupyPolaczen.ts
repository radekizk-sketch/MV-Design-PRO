/**
 * Slownik grup polaczen IEC 60076-1 z backendu (`GET /api/catalog/grupy-polaczen`) dla
 * kazdego pola wyboru grupy (kreator transformatora ui2, karta transformatora
 * konfiguratora stacji, edycja parametrow). `null` = slownik jeszcze nie pobrany albo
 * niedostepny — pole pokazuje wtedy tylko wartosc biezaca, a backend i tak odmawia
 * wartosci spoza slownika (`transformer.invalid_vector_group`, E-W5-02).
 */
import { useEffect, useState } from 'react';

import { fetchGrupyPolaczen } from './api';

export function useGrupyPolaczen(): readonly string[] | null {
  const [grupy, setGrupy] = useState<readonly string[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchGrupyPolaczen()
      .then((lista) => {
        if (!cancelled) setGrupy(lista);
      })
      .catch(() => {
        if (!cancelled) setGrupy(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return grupy;
}
