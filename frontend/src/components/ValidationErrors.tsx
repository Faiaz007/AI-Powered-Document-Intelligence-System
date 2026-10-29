'use client';

import { AlertTriangle, Info, XCircle } from 'lucide-react';

export interface ValidationIssue {
  field_name: string;
  error_type: string;
  severity: string;
  description: string;
}

interface ValidationErrorsProps {
  errors: ValidationIssue[];
}

const SEVERITY = {
  high: {
    label: 'High',
    Icon: XCircle,
    box: 'border-red-200 bg-red-50',
    badge: 'bg-red-100 text-red-800',
    icon: 'text-red-600',
  },
  medium: {
    label: 'Medium',
    Icon: AlertTriangle,
    box: 'border-amber-200 bg-amber-50',
    badge: 'bg-amber-100 text-amber-900',
    icon: 'text-amber-600',
  },
  low: {
    label: 'Low',
    Icon: Info,
    box: 'border-neutral-200 bg-neutral-50',
    badge: 'bg-neutral-200 text-neutral-800',
    icon: 'text-neutral-500',
  },
} as const;

type SeverityKey = keyof typeof SEVERITY;
const ORDER: SeverityKey[] = ['high', 'medium', 'low'];

const severityOf = (s: string): SeverityKey => {
  const key = (s ?? '').toLowerCase();
  return key === 'high' || key === 'medium' ? key : 'low';
};

const humanize = (s: string) => {
  const text = (s ?? '').replace(/_/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export default function ValidationErrors({ errors }: ValidationErrorsProps) {
  if (!errors || errors.length === 0) return null;

  const sorted = [...errors].sort(
    (a, b) => ORDER.indexOf(severityOf(a.severity)) - ORDER.indexOf(severityOf(b.severity)),
  );

  return (
    <section aria-label="Validation issues">
      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-900">
        <AlertTriangle size={16} aria-hidden="true" className="text-amber-600" />
        Validation issues <span className="font-normal text-neutral-500">({errors.length})</span>
      </h4>
      <ul className="space-y-2">
        {sorted.map((error, i) => {
          const cfg = SEVERITY[severityOf(error.severity)];
          const { Icon } = cfg;
          return (
            <li key={i} className={`rounded-lg border p-3 ${cfg.box}`}>
              <div className="flex items-start gap-2.5">
                <Icon size={16} aria-hidden="true" className={`mt-0.5 shrink-0 ${cfg.icon}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium text-neutral-900">{humanize(error.field_name)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cfg.badge}`}>
                      {cfg.label}
                      <span className="sr-only"> severity</span>
                    </span>
                    {error.error_type && (
                      <span className="text-xs text-neutral-500">{humanize(error.error_type)}</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-neutral-800">{error.description}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}