'use client';

import type { ReactNode } from 'react';
import LineItemsTable, { formatMoney, type LineItem } from '@/components/LineItemsTable';

export interface InvoiceData {
  invoice_number?: string | null;
  invoice_date?: string | null;
  supplier_name?: string | null;
  customer_name?: string | null;
  subtotal?: number | string | null;
  tax?: number | string | null;
  total?: number | string | null;
  currency?: string | null;
  confidence?: number | null;
  line_items?: LineItem[] | null;
  [key: string]: unknown;
}

interface ResultsTableProps {
  data: InvoiceData | null | undefined;
}

const DETAIL_FIELDS = [
  { label: 'Invoice number', key: 'invoice_number' },
  { label: 'Invoice date', key: 'invoice_date' },
  { label: 'Supplier', key: 'supplier_name' },
  { label: 'Customer', key: 'customer_name' },
  { label: 'Currency', key: 'currency' },
] as const;

const AMOUNT_FIELDS = [
  { label: 'Subtotal', key: 'subtotal' },
  { label: 'Tax', key: 'tax' },
  { label: 'Total', key: 'total' },
] as const;

const isMissing = (v: unknown) => v === null || v === undefined || v === '';

function Row({ label, children, strong = false }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 px-3 ${strong ? 'py-3' : 'py-2.5'}`}>
      <dt className={`shrink-0 text-sm ${strong ? 'font-medium text-neutral-900' : 'text-neutral-500'}`}>{label}</dt>
      <dd className={`min-w-0 break-words text-right ${strong ? 'text-base font-semibold' : 'text-sm font-medium'} text-neutral-900`}>
        {children}
      </dd>
    </div>
  );
}

const NotFound = () => <span className="font-normal italic text-neutral-400">Not found</span>;

function Confidence({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, Math.round(value * 100)));
  const tone =
    pct >= 85
      ? { bar: 'bg-emerald-600', word: 'high' }
      : pct >= 60
        ? { bar: 'bg-amber-500', word: 'medium' }
        : { bar: 'bg-red-600', word: 'low' };

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="text-neutral-500">Extraction confidence</span>
        <span className="font-medium tabular-nums text-neutral-900">
          {pct}% <span className="font-normal text-neutral-500">({tone.word})</span>
        </span>
      </div>
      <div
        role="meter"
        aria-label="Extraction confidence"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200"
      >
        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function ResultsTable({ data }: ResultsTableProps) {
  if (!data) return null;

  const lineItems = Array.isArray(data.line_items) ? data.line_items : [];

  return (
    <div className="space-y-5">
      <section aria-label="Extracted invoice information">
        <h4 className="mb-2 text-sm font-semibold text-neutral-900">Extracted information</h4>

        <dl className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
          {DETAIL_FIELDS.map(({ label, key }) => (
            <Row key={key} label={label}>
              {isMissing(data[key]) ? <NotFound /> : String(data[key])}
            </Row>
          ))}
        </dl>

        <dl className="mt-3 divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-neutral-50">
          {AMOUNT_FIELDS.map(({ label, key }) => (
            <Row key={key} label={label} strong={key === 'total'}>
              {isMissing(data[key]) ? <NotFound /> : <span className="tabular-nums">{formatMoney(data[key], data.currency)}</span>}
            </Row>
          ))}
        </dl>
      </section>

      {typeof data.confidence === 'number' && <Confidence value={data.confidence} />}

      <LineItemsTable items={lineItems} currency={data.currency} />
    </div>
  );
}