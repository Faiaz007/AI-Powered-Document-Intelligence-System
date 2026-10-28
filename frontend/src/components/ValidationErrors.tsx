'use client';

import { AlertTriangle, Info } from 'lucide-react';

interface ValidationError {
  field_name: string;
  error_type: string;
  severity: string;
  description: string;
}

interface ValidationErrorsProps {
  errors: ValidationError[];
}

export default function ValidationErrors({ errors }: ValidationErrorsProps) {
  if (!errors || errors.length === 0) return null;

  const severityColors: Record<string, string> = {
    high: 'bg-red-100 text-red-700 border border-red-200',
    medium: 'bg-orange-100 text-orange-700 border border-orange-200',
    low: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
  };

  return (
    <div className="mt-6">
      <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
        <AlertTriangle size={16} className="text-orange-600" />
        Validation Issues ({errors.length})
      </h4>
      <div className="space-y-3">
        {errors.map((error, i) => (
          <div key={i} className={`p-3 rounded border ${severityColors[error.severity] || severityColors.low}`}>
            <div className="flex justify-between items-start mb-1">
              <span className="text-xs font-medium uppercase">{error.field_name}</span>
              <span className="text-xs font-bold">{error.severity}</span>
            </div>
            <p className="text-sm text-gray-800">{error.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}