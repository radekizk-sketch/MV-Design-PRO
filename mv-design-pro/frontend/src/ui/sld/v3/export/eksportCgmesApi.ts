/**
 * Pobranie archiwum CGMES modelu sieci z backendu (karta KASACJA-SCL-I-CIM-KLIENT,
 * decyzja K-14/D-41).
 *
 * Plik modelu sieci buduje WYŁĄCZNIE serwer
 * (`GET /api/cases/{case_id}/enm/eksport-cgmes` →
 * `backend/src/application/cgmes/service.py::export_cgmes`). Ten moduł niczego nie
 * liczy ani nie składa: pobiera bajty, rewizję i odcisk WYEKSPORTOWANEGO modelu
 * (nagłówki `X-Model-Rewizja`/`X-Model-Odcisk` — nazwa pliku ma nieść wersję,
 * którą plik faktycznie zawiera, nie wersję migawki przeglądarki) i przekazuje
 * treść odmowy serwera (`detail`, 422 z nazwanymi brakami modelu) bez przeróbek.
 */

export interface PobranyEksportCgmes {
  readonly archiwum: Blob;
  readonly rewizjaModelu: number | null;
  readonly odciskModelu: string | null;
}

export function adresEksportuCgmes(caseId: string): string {
  return `/api/cases/${encodeURIComponent(caseId)}/enm/eksport-cgmes`;
}

async function trescOdmowy(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    if (typeof payload?.detail === 'string' && payload.detail.trim().length > 0) {
      return payload.detail;
    }
  } catch {
    // Ciało odpowiedzi bywa puste albo nie-JSON — wtedy zostaje kod HTTP.
  }
  return `Eksport CGMES: serwer odpowiedział kodem HTTP ${response.status}.`;
}

export async function pobierzEksportCgmes(caseId: string): Promise<PobranyEksportCgmes> {
  const response = await fetch(adresEksportuCgmes(caseId), {
    method: 'GET',
    headers: { Accept: 'application/zip' },
  });
  if (!response.ok) {
    throw new Error(await trescOdmowy(response));
  }
  const rewizja = Number.parseInt(response.headers.get('x-model-rewizja') ?? '', 10);
  return {
    archiwum: await response.blob(),
    rewizjaModelu: Number.isFinite(rewizja) ? rewizja : null,
    odciskModelu: response.headers.get('x-model-odcisk') || null,
  };
}
