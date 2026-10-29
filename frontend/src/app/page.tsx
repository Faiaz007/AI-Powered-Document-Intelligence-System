'use client';

import { useCallback, useRef, useState } from 'react';
import { AlertCircle, FileText, Loader2, Search, Upload, X } from 'lucide-react';
import FileUploader from '@/components/FileUploader';
import ProgressTracker, { type JobUpdate } from '@/components/ProgressTracker';
import ResultsTable, { type InvoiceData } from '@/components/ResultsTable';
import ValidationErrors, { type ValidationIssue } from '@/components/ValidationErrors';
import SearchBar from '@/components/SearchBar';

type Job = { id: string; filename: string; status: string; progress: number };
type ResultData = { structured?: InvoiceData; validation_errors?: ValidationIssue[] };
type ResultItem = { id: string; filename: string; data: ResultData };

const FINISHED = ['completed', 'failed'];
const card = 'rounded-xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6';

/**
 * Pulls the extraction payload out of a completed /api/process/:id response.
 * Accepts { result: {...} }, { data: {...} }, or the structured payload at the top level.
 * If your API returns results from a different endpoint, adjust this one function.
 */
function extractResult(update: JobUpdate): ResultData | null {
  const candidate = (update.result ?? update.data ?? update) as ResultData | null;
  return candidate && typeof candidate === 'object' && candidate.structured ? candidate : null;
}

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  const handleFilesChange = (next: File[]) => {
    setFiles(next);
    setError(null);
  };

  const handleUpload = async () => {
    if (files.length === 0 || uploading) return;
    setUploading(true);
    setError(null);

    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));
    const names = files.map((f) => f.name);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(
          typeof detail?.detail === 'string' ? detail.detail : 'Upload failed. Check your files and try again.',
        );
      }
      const data = await res.json();

      const ids: string[] = data.job_ids ?? [];
      const newJobs: Job[] = ids.map((id, idx) => ({
        id,
        filename: data.filenames?.[idx] ?? names[idx] ?? id,
        status: 'uploaded',
        progress: 10,
      }));
      setJobs((prev) => [...newJobs, ...prev]);
      setFiles([]);
    } catch (err) {
      setError(
        err instanceof TypeError
          ? 'Can’t reach the server. Check your connection and try again.'
          : err instanceof Error
            ? err.message
            : 'Upload failed',
      );
    } finally {
      setUploading(false);
    }
  };

  // Called by each ProgressTracker as it polls. Keeps job status live and collects results.
  const handleJobUpdate = useCallback((jobId: string, update: JobUpdate) => {
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId
          ? {
            ...j,
            status: typeof update.status === 'string' ? update.status : j.status,
            progress: typeof update.progress === 'number' ? update.progress : j.progress,
          }
          : j,
      ),
    );

    if (update.status === 'completed') {
      const filename = jobsRef.current.find((j) => j.id === jobId)?.filename ?? jobId;
      fetch(`/api/results/${jobId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data) return;
          const payload: ResultData = { structured: data.structured, validation_errors: data.validation_errors };
          setResults((prev) =>
            prev.some((r) => r.id === jobId) ? prev : [{ id: jobId, filename, data: payload }, ...prev],
          );
        })
        .catch(() => {});
    }
  }, []);

  const dismissJob = (id: string) => setJobs((prev) => prev.filter((j) => j.id !== id));
  const clearFinished = () => setJobs((prev) => prev.filter((j) => !FINISHED.includes(j.status)));
  const hasFinished = jobs.some((j) => FINISHED.includes(j.status));

  return (
    <main id="main" className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-8 sm:mb-10">
          <h1 className="text-2xl font-semibold tracking-tight">docintel</h1>
          <p className="mt-1 text-sm text-neutral-600">
            AI-powered invoice processing, extraction, validation, and search
          </p>
        </header>

        {error && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            <AlertCircle size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
              className="shrink-0 rounded p-0.5 text-red-700 hover:bg-red-100"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="space-y-8 lg:col-span-2">
            <section aria-labelledby="upload-heading" className={card}>
              <h2 id="upload-heading" className="mb-4 flex items-center gap-2 text-base font-semibold">
                <Upload size={18} aria-hidden="true" className="text-neutral-500" /> Upload documents
              </h2>

              <FileUploader files={files} onFilesChange={handleFilesChange} disabled={uploading} />

              <div className="mt-5">
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={uploading || files.length === 0}
                  aria-busy={uploading}
                  className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-500"
                >
                  {uploading ? (
                    <>
                      <Loader2 size={16} aria-hidden="true" className="animate-spin" />
                      Uploading…
                    </>
                  ) : (
                    <>
                      <FileText size={16} aria-hidden="true" />
                      {files.length > 0 ? `Upload ${files.length} ${files.length === 1 ? 'file' : 'files'}` : 'Upload files'}
                    </>
                  )}
                </button>
              </div>
            </section>

            {jobs.length > 0 && (
              <section aria-labelledby="jobs-heading" className={card}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 id="jobs-heading" className="text-base font-semibold">
                    Processing <span className="font-normal text-neutral-500">({jobs.length})</span>
                  </h2>
                  {hasFinished && (
                    <button
                      type="button"
                      onClick={clearFinished}
                      className="rounded text-sm text-neutral-600 underline-offset-2 hover:text-neutral-900 hover:underline"
                    >
                      Clear finished
                    </button>
                  )}
                </div>

                <ul className="space-y-3">
                  {jobs.map((job) => {
                    const finished = FINISHED.includes(job.status);
                    const hasResult = results.some((r) => r.id === job.id);
                    return (
                      <li key={job.id} className="rounded-lg border border-neutral-200 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate text-sm font-medium" title={job.filename}>
                            {job.filename}
                          </span>
                          {finished && (
                            <button
                              type="button"
                              onClick={() => dismissJob(job.id)}
                              aria-label={`Dismiss ${job.filename}`}
                              className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                            >
                              <X size={16} aria-hidden="true" />
                            </button>
                          )}
                        </div>
                        <ProgressTracker
                          jobId={job.id}
                          label={job.filename}
                          initialProgress={job.progress}
                          onUpdate={handleJobUpdate}
                        />
                        {job.status === 'completed' && !hasResult && (
                          <p className="mt-2 text-xs text-neutral-500">Finished, but no extracted data was returned.</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>

          <aside aria-labelledby="search-heading" className="lg:col-span-1">
            <section className={`${card} lg:sticky lg:top-6`}>
              <h2 id="search-heading" className="mb-4 flex items-center gap-2 text-base font-semibold">
                <Search size={18} aria-hidden="true" className="text-neutral-500" /> Search documents
              </h2>
              <SearchBar />
            </section>
          </aside>
        </div>

        {results.length > 0 && (
          <section aria-labelledby="results-heading" className="mt-10">
            <h2 id="results-heading" className="mb-4 text-base font-semibold">
              Results <span className="font-normal text-neutral-500">({results.length})</span>
            </h2>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              {results.map((r) => {
                const issues = r.data.validation_errors;
                const issueCount = Array.isArray(issues) ? issues.length : null;
                return (
                  <article key={r.id} className={`${card} space-y-5`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="min-w-0 truncate text-sm font-semibold" title={r.filename}>
                        {r.filename}
                      </h3>
                      {issueCount !== null && (
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${issueCount > 0 ? 'bg-amber-100 text-amber-900' : 'bg-emerald-50 text-emerald-800'
                            }`}
                        >
                          {issueCount > 0
                            ? `${issueCount} validation ${issueCount === 1 ? 'issue' : 'issues'}`
                            : 'No validation issues'}
                        </span>
                      )}
                    </div>
                    <ResultsTable data={r.data.structured} />
                    {issueCount !== null && issueCount > 0 && <ValidationErrors errors={issues as ValidationIssue[]} />}
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}