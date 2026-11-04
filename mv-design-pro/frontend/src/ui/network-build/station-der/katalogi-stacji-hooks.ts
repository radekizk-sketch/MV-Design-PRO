/**
 * React Query hooks katalogów konfiguracji stacji i odczytów stacji z modelu sieci.
 *
 * Katalogi (niezmienne w sesji): staleTime Infinity. Pakiet dowodów i uziemienie SN pól
 * czytają MODEL — pakiet przy każdym wejściu na ekran, uziemienie z rewizją modelu w kluczu.
 * Karta JEDNA-SCIEZKA-EDYCJI: zapis danych stacji idzie operacjami domenowymi modelu
 * (magazyn „konfiguracji stacji" obok modelu i jego mutacje skasowane).
 */

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { katalogiStacjiQueryKeys } from '../../../query-client';
import {
  fetchKatalogiStacjiSnapshot,
  fetchUziemienieSnStacji,
  generatePakietRozszerzenProjektu,
  generateRaportRozszerzen,
  type KatalogiStacjiSnapshot,
  type PakietRozszerzenProjektu,
  type PakietRozszerzenStacji,
  type RaportRozszerzenResponse,
  type UziemienieSnStacjiResponse,
} from './katalogi-stacji-api';

export function useKatalogiStacjiSnapshot(): UseQueryResult<KatalogiStacjiSnapshot, Error> {
  return useQuery({
    queryKey: katalogiStacjiQueryKeys.catalogSnapshot(),
    queryFn: fetchKatalogiStacjiSnapshot,
    staleTime: Infinity, // Katalogi wersjonowane, nigdy stale w trakcie sesji.
    gcTime: 60 * 60_000, // 1h.
  });
}

/**
 * Uziemienie punktu neutralnego sieci SN stacji — z MODELU (karta UX-04/POLE-ZU,
 * `enm.uziemienie_sekcji`). Rewizja modelu w kluczu: zmiana modelu = nowy odczyt.
 */
export function useUziemienieSnStacji(
  projectId: string | null,
  stationId: string | null,
  rewizja: number | null,
): UseQueryResult<UziemienieSnStacjiResponse, Error> {
  return useQuery({
    queryKey: katalogiStacjiQueryKeys.uziemienieSn(projectId ?? '', stationId ?? '', rewizja),
    queryFn: () => fetchUziemienieSnStacji({ projectId: projectId!, stationId: stationId!, pola: [] }),
    enabled: Boolean(projectId && stationId),
    staleTime: 30_000,
  });
}

/**
 * Generowanie pakietu dowodów walidacji rozszerzeń projektu na żądanie (przycisk) —
 * pakiet składa backend z modelu sieci. Wynik trafia
 * też do pamięci zapytania `projectProofPack`, z której czytają pozostałe ekrany.
 */
export function useGeneratePakietRozszerzenProjektu() {
  const qc = useQueryClient();
  return useMutation<PakietRozszerzenProjektu, Error, string>({
    mutationFn: generatePakietRozszerzenProjektu,
    onSuccess: (data, projectId) => {
      qc.setQueryData(katalogiStacjiQueryKeys.projectProofPack(projectId), data);
    },
  });
}

/**
 * Pakiet dowodów projektu jako zapytanie (ekrany, które pokazują jego część bez przycisku,
 * np. bilans eksportu stacji w kontroli modelu). Operacja backendu jest bez skutków
 * ubocznych i deterministyczna, więc wolno ją wykonać przy wejściu na ekran.
 */
export function usePakietRozszerzenProjektu(
  projectId: string | null,
): UseQueryResult<PakietRozszerzenProjektu, Error> {
  return useQuery({
    queryKey: katalogiStacjiQueryKeys.projectProofPack(projectId ?? ''),
    queryFn: () => generatePakietRozszerzenProjektu(projectId!),
    enabled: Boolean(projectId),
    // Pakiet zależy też od MODELU (odbiory, transformatory, źródła), którego zmiany nie
    // unieważniają tego klucza — odczyt przy każdym wejściu na ekran, bez pamięci 30 s.
    staleTime: 0,
  });
}

export interface RaportRozszerzenProjektuArgs {
  readonly projectName: string;
  readonly pakiety: readonly PakietRozszerzenStacji[];
}

export interface RaportRozszerzenStacji {
  readonly stationId: string;
  readonly stationNazwa: string;
  readonly textPl: string;
  readonly report: RaportRozszerzenResponse;
}

/**
 * Raport walidacji rozszerzeń dla KAŻDEJ stacji pakietu projektu (jeden raport na stację).
 * Nazwa stacji w dokumencie pochodzi z pakietu backendu (`station_nazwa`, nazwa z modelu),
 * nie z wyszukiwania w interfejsie; operatora raport nie zmyśla (pole zostaje puste).
 */
export function useGenerateRaportRozszerzenProjektu() {
  return useMutation<readonly RaportRozszerzenStacji[], Error, RaportRozszerzenProjektuArgs>({
    mutationFn: async ({ projectName, pakiety }) => {
      const raporty: RaportRozszerzenStacji[] = [];
      for (const pakiet of pakiety) {
        const report = await generateRaportRozszerzen({
          project_name: projectName,
          station_id: pakiet.station_id,
          station_name: pakiet.station_nazwa,
          proof_pack: pakiet,
          generated_at_iso: '1970-01-01T00:00:00Z',
          formats: ['json', 'text_pl', 'latex'],
        });
        raporty.push({
          stationId: pakiet.station_id,
          stationNazwa: pakiet.station_nazwa,
          textPl: report.text_pl ?? '',
          report,
        });
      }
      return raporty;
    },
  });
}

