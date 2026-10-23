import { useState, type FormEvent } from 'react';
import { askEneaQuestion, type EneaQuestionAnswer } from './api';

/** Pytanie i odpowiedź dokumentowa; ocena bez fikcyjnej interpretacji. */
export function EneaQuestionPanel(): JSX.Element {
  const [question, setQuestion] = useState('');
  const [asOf, setAsOf] = useState('');
  const [result, setResult] = useState<EneaQuestionAnswer | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (question.trim().length < 3 || pending) return;
    setPending(true);
    setResult(null);
    setError('');
    try {
      const response = await askEneaQuestion(question.trim(), asOf || undefined);
      setResult(response);
    } catch {
      setError('Nie udało się sprawdzić dokumentów. Ponów zapytanie po sprawdzeniu połączenia.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mvd-enea-question" aria-label="Zapytaj o standard ENEA">
      <h3>Zapytaj o wymaganie ENEA</h3>
      <form onSubmit={submit}>
        <label htmlFor="mvd-enea-question-text">Pytanie inżynierskie</label>
        <textarea
          id="mvd-enea-question-text"
          rows={3}
          maxLength={600}
          value={question}
          placeholder="Czy mogę wykonać nową stację słupową z kablowym podejściem SN?"
          onChange={(event) => setQuestion(event.target.value)}
        />
        <label htmlFor="mvd-enea-asof-date">Stan wymagań na dzień (opcjonalnie)</label>
        <input id="mvd-enea-asof-date" type="date" value={asOf}
          onChange={(event) => setAsOf(event.target.value)} />
        <button className="mvd-refwybor-akcja" type="submit"
          disabled={pending || question.trim().length < 3}>
          {pending ? 'Sprawdzanie źródeł…' : 'Sprawdź w standardach'}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {result && (
        <div className="mvd-enea-answer" role="region" aria-label="Wynik sprawdzenia standardów">
          <p className="mvd-enea-verdict">
            {result.verdict ? 'Werdykt: ' + result.verdict.replaceAll('_', ' ') :
              result.status === 'ZNALEZIONO_FRAGMENTY' ? 'Znaleziono odniesienia' :
              'Nie potwierdzono wymagania'}
          </p>
          <p>{result.answer_pl}</p>
          <p><strong>Zakres:</strong> {result.scope_pl}</p>
          <p className="mvd-enea-meta">
            Stan na {result.as_of} · W indeksie: {result.indexed_documents}/{result.catalog_documents} dokumentów.
            {result.rule_id && ' Karta: ' + result.rule_id + '.'}
          </p>
          {result.sources.length > 0 && (
            <div>
              <strong>Podstawa źródłowa</strong>
              <ol className="mvd-enea-evidence">
                {result.sources.map((item) => (
                  <li key={item.source_id + '-' + item.page_pdf}>
                    <a href={item.url} target="_blank" rel="noreferrer">
                      {item.title}
                    </a>
                    <div className="mvd-enea-meta">
                      {item.edition ? 'Wersja ' + item.edition + ' · ' : ''}
                      {item.section ? item.section + ' · ' : ''}
                      {item.page_printed ? 's. ' + item.page_printed : 'PDF s. ' + item.page_pdf}
                      {item.effective_from ? ' · obowiązuje od ' + item.effective_from : ''}
                    </div>
                    {item.excerpt && <p>Fragment do weryfikacji: {item.excerpt}</p>}
                    {item.needs_manual_interpretation &&
                      <p className="mvd-enea-meta">Fragment odnaleziony automatycznie — wymaga interpretacji.</p>}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {result.sources.length === 0 && result.suggested_documents.length > 0 && (
            <div>
              <strong>Dokumenty do sprawdzenia</strong>
              <ul className="mvd-enea-evidence">
                {result.suggested_documents.map((item) => (
                  <li key={item.source_id}>
                    <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.requires_review &&
            <p className="mvd-enea-note">Zakres indeksu jest niepełny lub wynik wymaga oceny inżynierskiej. Brak trafienia nie oznacza braku przepisu.</p>}
        </div>
      )}
    </section>
  );
}
