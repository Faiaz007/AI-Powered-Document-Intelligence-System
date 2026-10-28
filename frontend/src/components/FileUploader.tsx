'use client';

import { useState, useEffect, useCallback } from 'react';

interface FileUploaderProps {
  onFilesSelected: (files: File[]) => void;
}

export default function FileUploader({ onFilesSelected }: FileUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const allowedTypes = ['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.xlsx', '.xls', '.csv'];

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files);
    const validFiles = files.filter((f) => {
      const ext = f.name.toLowerCase().substring(f.name.lastIndexOf('.'));
      return allowedTypes.includes(ext);
    });
    if (validFiles.length > 0) {
      setSelectedFiles(validFiles);
      onFilesSelected(validFiles);
    }
  }, [onFilesSelected]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter((f) => {
      const ext = f.name.toLowerCase().substring(f.name.lastIndexOf('.'));
      return allowedTypes.includes(ext);
    });
    if (validFiles.length > 0) {
      setSelectedFiles(validFiles);
      onFilesSelected(validFiles);
    }
  }, [onFilesSelected]);

  const removeFile = (index: number) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
  };

  return (
    <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 hover:bg-blue-50 transition-colors"
      onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
      onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
      onDrop={handleDrop}
    >
      <div className="flex flex-col items-center justify-center w-full">
        {dragActive ? (
          <div className="bg-blue-100 rounded-full p-4 mb-4 text-blue-600">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          </div>
        ) : (
          <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center mb-4 text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          </div>
        )}
        <p className={dragActive ? 'text-blue-600 font-medium' : 'text-gray-600'}>
          {dragActive ? 'Drop files here' : 'Click to upload or drag and drop'}
        </p>
        <p className="text-xs text-gray-500 mt-2">
          PDF, JPG, PNG, TIFF, XLSX, XLS, CSV
        </p>
        <input
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.tiff,.tif,.xlsx,.xls,.csv"
          className="hidden"
          onChange={handleFileSelect}
        />
        <button
          onClick={(e) => {
            e.preventDefault();
            const input = e.currentTarget.parentElement?.querySelector('input');
            if (input) (input as HTMLInputElement).click();
          }}
          className="mt-4 px-6 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Browse files
        </button>
      </div>

      {selectedFiles.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-semibold text-gray-900 mb-3 text-left">Selected files:</h4>
          <ul className="space-y-2">
            {selectedFiles.map((file, i) => (
              <li key={i} className="flex items-center justify-between bg-gray-50 p-3 rounded text-sm">
                <span className="text-gray-700 truncate">{file.name}</span>
                <button
                  onClick={() => removeFile(i)}
                  className="text-gray-400 hover:text-red-600"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}