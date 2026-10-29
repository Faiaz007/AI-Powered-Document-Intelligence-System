
'use client';

import { useEffect, useId, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';

interface SearchResult {
  document_id: string;
  filename: string;
  file_type: string;
  score: number | null;
  matched_fields: string[];
  snippet?: string | null;
  matched_snippet?: string | null;
}

interface SearchResponse {
  results: SearchResult[];
}

const DEBOUNCE_MS = 300;
const MAX_RESULTS = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeResults(data: unknown): SearchResult[] {
  const payload = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.results)
      ? data.results
      : null;

  if (!payload) {
    throw new Error('Invalid search response');
  }

  return payload.slice(0, MAX_RESULTS).filter(
    (item): item is SearchResult =>
      isRecord(item) &&
      typeof item.document_id === 'string' &&
      typeof item.filename === 'string' &&
      typeof item.file_type === 'string',
  ).map((item) => ({
    document_id: item.document_id,
    filename: item.filename,
    file_type: item.file_type,
    score:
      typeof item.score === 'number' && Number.isFinite(item.score)
        ? item.score
        : null,
    matched_fields: Array.isArray(item.matched_fields)
      ? item.matched_fields.filter(
        (field): field is string => typeof field === 'string',
      )
      : [],
    snippet:
      typeof item.snippet === 'string' ? item.snippet : null,
    matched_snippet:
      typeof item.matched_snippet === 'string'
        ? item.matched_snippet
        : null,
  }));
}

function humanize(value: string): string {
  return value
    .replace(/_/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function Highlight({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  const terms = [...new Set(query.trim().split(/\s+/).filter(Boolean))]
    .sort((a, b) => b.length - a.length)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  if (!terms.length) return <>{text}</>;

  const regex = new RegExp(`(${terms.join('|')})`, 'giu');

  return (
    <>
      {text.split(regex).map((part, index) =>
        regex.test(part) ? (
          <mark
            key={`${index}-${part}`}
            className="rounded-sm bg-amber-100 px-0.5 text-inherit"
          >
            {part}
          </mark>
        ) : (
          <span key={`${index}-${part}`}>{part}</span>
        ),
      )}
    </>
  );
}

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchedQuery, setSearchedQuery] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  const inputId = useId();
  const helpId = useId();

  const normalizedQuery = query.trim();
  const hasQuery = normalizedQuery.length > 0;
  const isCurrentSearch = searchedQuery === normalizedQuery;

  useEffect(() => {
    if (!normalizedQuery) {
      setResults([]);
      setError(null);
      setLoading(false);
      setSearchedQuery('');
      return;
    }

    const controller = new AbortController();
    let active = true;

    setLoading(true);
    setError(null);
    setResults([]);
    setSearchedQuery('');

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(normalizedQuery)}`,
          {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
          },
        );

        if (!response.ok) {
          throw new Error(`Search request failed (${response.status})`);
        }

        const data: unknown = await response.json();
        const normalizedResults = normalizeResults(data);

        if (!active) return;

        setResults(normalizedResults);
        setSearchedQuery(normalizedQuery);
      } catch {
        if (!active || controller.signal.aborted) return;

        setResults([]);
        setSearchedQuery(normalizedQuery);
        setError('Search failed. Please check your connection and try again.');
      } finally {
        if (active && !controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [normalizedQuery, retryKey]);

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setError(null);
    setSearchedQuery('');
  };

  const showEmpty =
    hasQuery &&
    isCurrentSearch &&
    !loading &&
    !error &&
    results.length === 0;

  const liveText = loading
    ? 'Searching documents'
    : error
      ? 'Search failed'
      : isCurrentSearch && hasQuery
        ? `${results.length} ${results.length === 1 ? 'result' : 'results'} found`
        : '';

  return (
    <section
      aria-label="Document search"
      className="w-full space-y-4"
    >
      <div>
        <label
          htmlFor={inputId}
          className="sr-only"
        >
          Search documents
        </label>

        <div className="relative">
          <Search
            size={18}
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400"
          />

          <input
            id={inputId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') clearSearch();
            }}
            placeholder="Search documents..."
            aria-describedby={helpId}
            aria-controls={`${inputId}-results`}
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-xl border border-neutral-200 bg-white py-3 pl-11 pr-20 text-sm text-neutral-900 shadow-sm outline-none transition placeholder:text-neutral-400 hover:border-neutral-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
          />

          {loading && (
            <Loader2
              size={17}
              aria-hidden="true"
              className="absolute right-11 top-1/2 -translate-y-1/2 animate-spin text-blue-600"
            />
          )}

          {query && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>

        <p
          id={helpId}
          className="mt-2 text-xs leading-relaxed text-neutral-500"
        >
          Search by invoice number, supplier, customer, or filename.
        </p>
      </div>

      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {liveText}
      </p>

      {loading && results.length === 0 && (
        <div
          aria-hidden="true"
          className="overflow-hidden rounded-xl border border-neutral-200 bg-white"
        >
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="animate-pulse space-y-3 border-b border-neutral-100 px-4 py-4 last:border-0"
            >
              <div className="h-4 w-2/5 rounded bg-neutral-200" />
              <div className="h-3 w-4/5 rounded bg-neutral-100" />
              <div className="h-3 w-1/4 rounded bg-neutral-100" />
            </div>
          ))}
        </div>
      )}

      {error && !loading && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-4"
        >
          <p className="text-sm font-medium text-red-800">
            Unable to search documents
          </p>

          <p className="mt-1 text-xs leading-relaxed text-red-700">
            {error}
          </p>

          <button
            type="button"
            onClick={() => setRetryKey((key) => key + 1)}
            className="mt-3 rounded-md text-sm font-semibold text-red-800 underline underline-offset-4 hover:text-red-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            Try again
          </button>
        </div>
      )}

      {showEmpty && (
        <div className="rounded-xl border border-dashed border-neutral-300 px-4 py-10 text-center">
          <Search
            size={24}
            aria-hidden="true"
            className="mx-auto text-neutral-400"
          />

          <p className="mt-3 text-sm font-semibold text-neutral-900">
            No documents found
          </p>

          <p className="mx-auto mt-1 max-w-sm break-words text-xs leading-relaxed text-neutral-500">
            No matches for “{searchedQuery}”. Try another invoice number,
            supplier name, or filename.
          </p>
        </div>
      )}

      {results.length > 0 && isCurrentSearch && (
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs text-neutral-500">
              <span className="font-semibold text-neutral-800">
                {results.length}
              </span>{' '}
              {results.length === 1 ? 'result' : 'results'} for{' '}
              <span className="font-medium text-neutral-700">
                “{searchedQuery}”
              </span>
            </p>

            {loading && (
              <span className="shrink-0 text-xs text-neutral-500">
                Updating...
              </span>
            )}
          </div>

          <ul
            id={`${inputId}-results`}
            aria-label="Search results"
            aria-busy={loading}
            className="max-h-96 divide-y divide-neutral-100 overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-sm"
          >
            {results.map((result) => {
              const snippet =
                result.snippet ?? result.matched_snippet;

              const relevance =
                result.score !== null &&
                  result.score >= 0 &&
                  result.score <= 1
                  ? Math.round(result.score * 100)
                  : null;

              return (
                <li
                  key={result.document_id}
                  className="px-4 py-4 transition-colors hover:bg-neutral-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 break-words text-sm font-semibold leading-5 text-neutral-900">
                      <Highlight
                        text={result.filename}
                        query={searchedQuery}
                      />
                    </p>

                    <span className="shrink-0 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-neutral-600">
                      {result.file_type}
                    </span>
                  </div>

                  {snippet && (
                    <p className="mt-2 line-clamp-2 break-words text-xs leading-relaxed text-neutral-600">
                      <Highlight
                        text={snippet}
                        query={searchedQuery}
                      />
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {result.matched_fields.map((field) => (
                      <span
                        key={field}
                        className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-600"
                      >
                        {humanize(field)}
                      </span>
                    ))}

                    {relevance !== null && (
                      <span className="ml-auto whitespace-nowrap text-xs tabular-nums text-neutral-500">
                        {relevance}% relevance
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
