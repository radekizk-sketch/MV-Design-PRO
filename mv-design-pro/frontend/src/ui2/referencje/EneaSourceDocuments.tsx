/* Publiczne źródła ENEA w istniejącym panelu referencji.
 * Oddzielne metadane od walidacji: obecność PDF nie oznacza implementacji reguły.
 */
import { useEffect, useMemo, useState } from 'react';
import { fetchReferencePack, type EneaSourceCatalog } from './api';
import { EneaQuestionPanel } from './EneaQuestionPanel';

type Group = 'sn' | 'nn' | 'gpz' | 'iriesd';
const GROUP_LABELS: Record<Group, string> = {
  sn: 'Sieć SN',
  nn: 'Sieć nN',
  gpz: 'GPZ — kontekst',
  iriesd: 'IRiESD',
};

export function EneaSourceDocuments(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<Group>('sn');
  const [term, setTerm] = useState('');
  const [catalog, setCatalog] = useState<EneaSourceCatalog | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!open || catalog) return;
    let active = true;
    fetchReferencePack('osd_enea')
      .then((pack) => {
        if (active) {
          setCatalog(pack.source_catalog ?? null);
          setError(!pack.source_catalog);
        }
      })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [open, catalog]);

  const shown = useMemo(() => (catalog?.sources ?? []).filter((doc) => {
    if (group === 'iriesd') return doc.family === 'iriesd';
    if (doc.family !== 'standard') return false;
    if (group === 'gpz') return doc.area === 'WN' || doc.area === '110/SN';
    return doc.area === (group === 'sn' ? 'SN' : 'nN');
  }).filter((doc) => `${doc.title} ${doc.engineering_scope}`.toLocaleLowerCase('pl').includes(term.trim().toLocaleLowerCase('pl'))), [catalog, group, term]);

  return (
    <section className="mvd-enea-sources" aria-label="Dokumenty ENEA Operator">
      <button type="button" className="mvd-refwybor-akcja" onClick={() => setOpen(!open)}
        aria-expanded={open}>
        {open ? 'Ukryj dokumenty ENEA' : 'Dokumenty źródłowe ENEA'}
      </button>
      {open && (
        <div className="mvd-enea-body">
          <p className="mvd-refwybor-stan">
            Oficjalne odnośniki. Samo umieszczenie dokumentu w wykazie nie oznacza,
            że jego wymagania zostały wdrożone do walidatora.
          </p>
          {error && <p role="alert">Nie udało się pobrać katalogu. Sprawdź połączenie z serwerem.</p>}
          {!catalog && !error && <p>Wczytywanie katalogu dokumentów…</p>}
          <EneaQuestionPanel />
          {catalog && (
            <>
              <p className="mvd-refwybor-stan">Wykaz zweryfikowano: {catalog.as_of}.
                Przed zastosowaniem sprawdź aktualną wersję u operatora.</p>
              <div className="mvd-enea-filters" role="group" aria-label="Grupa dokumentów">
                {(Object.keys(GROUP_LABELS) as Group[]).map((g) => (
                  <button key={g} type="button" className="mvd-refwybor-akcja"
                    aria-pressed={group === g} onClick={() => setGroup(g)}>
                    {GROUP_LABELS[g]}
                  </button>
                ))}
              </div>
              <label className="mvd-enea-search-label" htmlFor="mvd-enea-search">
                Szukaj dokumentu
              </label>
              <input id="mvd-enea-search" className="mvd-enea-search" type="search"
                value={term} onChange={(event) => setTerm(event.target.value)}
                placeholder="np. linie kablowe, uziemienia" />
              <p className="mvd-refwybor-stan">Liczba dokumentów: {shown.length}</p>
              <ul className="mvd-enea-list">
                {shown.map((doc) => (
                  <li key={doc.id}>
                    <a href={doc.url ?? doc.index_url} target="_blank" rel="noreferrer">
                      {doc.title}
                    </a>
                    <span className="mvd-enea-meta">
                      {doc.effective_to ? 'Archiwalny · ' : ''}
                      {doc.effective_from ? 'Od ' + doc.effective_from : 'Data niepodana w wykazie'}
                      {!doc.url ? ' · odnośnik do wykazu' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
