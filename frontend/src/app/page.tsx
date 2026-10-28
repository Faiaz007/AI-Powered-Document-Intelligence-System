'use client';

import { useState } from 'react';
import { Upload, FileText, BarChart3, Search, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
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
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
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
    <div className="min-h-screen bg-gray-50 p-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">docintel</h1>
        <p className="text-gray-600 mt-2">
          AI-powered invoice processing, extraction, validation, and search
        </p>
      </header>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-800 rounded flex items-center gap-3">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Upload size={20} /> Upload Documents
            </h2>
            <FileUploader onFilesSelected={handleFilesSelected} />
            <div className="mt-4">
              <button
                onClick={handleUpload}
                disabled={uploading || files.length === 0}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center gap-2 transition-colors"
              >
                {uploading ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <FileText size={18} />
                    Upload {files.length} document{files.length > 1 ? 's' : ''}
                  </>
                )}
              </button>
              {files.length > 0 && (
                <p className="text-sm text-gray-500 mt-2">
                  {files.length} file{files.length > 1 ? 's' : ''} selected
                </p>
              )}
            </div>
          </section>

          {jobs.length > 0 && (
            <section>
              <h2 className="text-xl font-semibold mb-4">Processing Jobs</h2>
              <div className="space-y-3">
                {jobs.map((job) => (
                  <div key={job.id} className="p-4 bg-white border border-gray-200 rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-sm font-medium text-gray-900">{job.filename}</span>
                      <span className={`text-xs font-medium px-2 py-1 rounded ${
                        job.status === 'completed' ? 'bg-green-100 text-green-700' :
                        job.status === 'failed' ? 'bg-red-100 text-red-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
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

        <div className="lg:col-span-1">
          <section className="sticky top-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <BarChart3 size={20} /> Search Documents
            </h2>
            <SearchBar />
          </section>
        </div>
      </div>

      {results.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold mb-4">Results</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {results.map((r) => (
              <div key={r.id} className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4">{r.filename}</h3>
                <ResultsTable data={r.data.structured} />
                {r.data.validation_errors.length > 0 && (
                  <ValidationErrors errors={r.data.validation_errors} />
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}