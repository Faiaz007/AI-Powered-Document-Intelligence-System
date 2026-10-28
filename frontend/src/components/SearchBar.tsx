'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, Plus } from 'lucide-react';

interface SearchResult {
  document_id: string;
  filename: string;
  file_type: string;
  score: number;
  matched_fields: string[];
}

interface SearchBarProps {}

export default function SearchBar({}: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async () => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
      }
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const timer = setTimeout(search, 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={18} className="absolute left-3 top-3 text-gray-400" />
        <input
          type="text"
          placeholder="Search documents..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm transition-all"
        />
        {loading && <Plus size={16} className="animate-spin absolute right-3 top-3 text-blue-500" />}
      </div>
      {results.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
          {results.map((r) => (
            <div key={r.document_id} className="p-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer">
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-900">{r.filename}</span>
                <span className="text-xs text-gray-500">{r.file_type}</span>
              </div>
              <div className="mt-1 text-xs text-gray-600">
                Matched in: {r.matched_fields.join(', ')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}