'use client';

import { useId, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { FileImage, FileSpreadsheet, FileText, UploadCloud, X } from 'lucide-react';

interface FileUploaderProps {
  files?: File[];
  onFilesChange: (files: File[]) => void;
  disabled?: boolean;
}

const ACCEPTED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.xlsx', '.xls', '.csv'];

function getExtension(name: string) {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i).toLowerCase();
}

function fileKey(f: File) {
  return `${f.name}:${f.size}:${f.lastModified}`;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function FileIcon({ name }: { name: string }) {
  const ext = getExtension(name);
  const props = { size: 18, 'aria-hidden': true, className: 'shrink-0 text-neutral-400' } as const;
  if (['.xlsx', '.xls', '.csv'].includes(ext)) return <FileSpreadsheet {...props} />;
  if (['.jpg', '.jpeg', '.png', '.tiff', '.tif'].includes(ext)) return <FileImage {...props} />;
  return <FileText {...props} />;
}

export default function FileUploader({ files = [], onFilesChange, disabled = false }: FileUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const hintId = useId();

  const addFiles = (incoming: File[]) => {
    if (incoming.length === 0) return;

    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const f of incoming) {
      if (ACCEPTED_EXTENSIONS.includes(getExtension(f.name))) accepted.push(f);
      else rejected.push(f.name);
    }

    const known = new Set(files.map(fileKey));
    const fresh = accepted.filter((f) => {
      const key = fileKey(f);
      if (known.has(key)) return false;
      known.add(key);
      return true;
    });

    setSkipped(rejected);
    if (fresh.length > 0) onFilesChange([...files, ...fresh]);
  };

  const handleDragEnter = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (disabled) return;
    dragDepth.current += 1;
    setDragActive(true);
  };

  const handleDragOver = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!disabled) e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragActive(false);
  };

  const handleDrop = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    if (disabled) return;
    addFiles(Array.from(e.dataTransfer.files));
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow re-selecting the same file after removing it
    addFiles(selected);
  };

  const removeFile = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  const zoneState = disabled
    ? 'cursor-not-allowed border-neutral-200 bg-neutral-50 opacity-60'
    : dragActive
      ? 'border-blue-600 bg-blue-50'
      : 'border-neutral-300 hover:border-neutral-400 hover:bg-neutral-50';

  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        aria-describedby={hintId}
        className={`flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${zoneState}`}
      >
        <span
          className={`mb-3 flex h-11 w-11 items-center justify-center rounded-full ${dragActive ? 'bg-blue-100 text-blue-700' : 'bg-neutral-100 text-neutral-500'
            }`}
        >
          <UploadCloud size={22} aria-hidden="true" />
        </span>
        <span className="text-sm font-medium text-neutral-900">
          {dragActive ? 'Release to add files' : 'Drag and drop files here, or click to browse'}
        </span>
        <span id={hintId} className="mt-1 text-xs text-neutral-500">
          PDF, JPG, PNG, TIFF, XLSX, XLS or CSV. You can add several files at once.
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS.join(',')}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleInputChange}
      />

      {skipped.length > 0 && (
        <p role="alert" className="mt-3 text-sm text-amber-800">
          Skipped {skipped.length} unsupported {skipped.length === 1 ? 'file' : 'files'}: {skipped.join(', ')}
        </p>
      )}

      {files.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium text-neutral-900" aria-live="polite">
              {files.length} {files.length === 1 ? 'file' : 'files'} selected
            </h3>
            <button
              type="button"
              onClick={() => onFilesChange([])}
              disabled={disabled}
              className="rounded text-sm text-neutral-600 underline-offset-2 hover:text-neutral-900 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear all
            </button>
          </div>
          <ul aria-label="Selected files" className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
            {files.map((file, i) => (
              <li key={fileKey(file)} className="flex items-center gap-3 px-3 py-2.5">
                <FileIcon name={file.name} />
                <span className="min-w-0 flex-1 truncate text-sm text-neutral-800" title={file.name}>
                  {file.name}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-neutral-500">{formatSize(file.size)}</span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  disabled={disabled}
                  aria-label={`Remove ${file.name}`}
                  className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}