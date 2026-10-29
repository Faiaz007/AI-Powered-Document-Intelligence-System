'use client';

import { useState } from 'react';
import { Upload, FileText, Search, RefreshCw, AlertCircle } from 'lucide-react';
import FileUploader from '@/components/FileUploader';
import ProgressTracker from '@/components/ProgressTracker';
import ResultsTable from '@/components/ResultsTable';
import ValidationErrors from '@/components/ValidationErrors';
import SearchBar from '@/components/SearchBar';

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [jobs, setJobs] = useState<Array<{ id: string; filename: string; status: string; progress: number }>>([]);
  const [results, setResults] = useState<Array<{ id: string; filename: string; data: any }>>([]);
  const [error, setError] = useState<string | null>(null);

  const handleFilesSelected = (selectedFiles: File[]) => {
    setFiles(selectedFiles);
    setError(null);
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setError(null);

    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();

      const newJobs = data.job_ids.map((id: string, idx: number) => ({
        id,
        filename: data.filenames[idx],
        status: 'uploaded',
        progress: 10,
      }));
      setJobs((prev) => [...prev, ...newJobs]);
      setFiles([]);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-10 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">docintel</h1>
            <p className="mt-1 text-sm text-neutral-500">
              AI-powered invoice processing, extraction, validation, and search
            </p>
          </div>
        </header>

        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-8">
            <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
                <Upload size={18} className="text-neutral-500" /> Upload Documents
              </h2>
              <FileUploader onFilesSelected={handleFilesSelected} />
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={handleUpload}
                  disabled={uploading || files.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
                >
                  {uploading ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <FileText size={16} />
                      Upload {files.length > 0 ? `${files.length} file${files.length > 1 ? 's' : ''}` : 'files'}
                    </>
                  )}
                </button>
                {files.length > 0 && (
                  <span className="text-xs text-neutral-500">
                    {files.length} file{files.length > 1 ? 's' : ''} selected
                  </span>
                )}
              </div>
            </section>

            {jobs.length > 0 && (
              <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-base font-semibold">Processing Jobs</h2>
                <div className="space-y-3">
                  {jobs.map((job) => (
                    <div key={job.id} className="rounded-lg border border-neutral-200 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium">{job.filename}</span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            job.status === 'completed'
                              ? 'bg-emerald-50 text-emerald-700'
                              : job.status === 'failed'
                              ? 'bg-red-50 text-red-700'
                              : 'bg-blue-50 text-blue-700'
                          }`}
                        >
                          {job.status}
                        </span>
                      </div>
                      <ProgressTracker jobId={job.id} initialProgress={job.progress} />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="lg:col-span-1">
            <section className="sticky top-6 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
                <Search size={18} className="text-neutral-500" /> Search Documents
              </h2>
              <SearchBar />
            </section>
          </aside>
        </div>

        {results.length > 0 && (
          <section className="mt-8 space-y-6">
            <h2 className="text-base font-semibold">Results</h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {results.map((r) => (
                <div key={r.id} className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
                  <h3 className="mb-4 text-sm font-semibold">{r.filename}</h3>
                  <ResultsTable data={r.data.structured} />
                  {r.data.validation_errors?.length > 0 && (
                    <div className="mt-4">
                      <ValidationErrors errors={r.data.validation_errors} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
