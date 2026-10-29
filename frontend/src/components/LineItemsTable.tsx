'use client';

export interface LineItem {
  description?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  amount?: number | null;
}

interface LineItemsTableProps {
  items: LineItem[];
  currency?: string | null;
}

/** Formats a number using an ISO currency code when one is known, otherwise as a plain 2-decimal number. */
export function formatMoney(value: unknown, currency?: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const code = typeof currency === 'string' && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : null;
  try {
    return new Intl.NumberFormat(
      'en-US',
      code ? { style: 'currency', currency: code } : { minimumFractionDigits: 2, maximumFractionDigits: 2 },
    ).format(n);
  } catch {
    return n.toFixed(2);
  }
}

const isMissing = (v: unknown) => v === null || v === undefined || v === '';

export default function LineItemsTable({ items, currency }: LineItemsTableProps) {
  if (!items || items.length === 0) return null;

  const money = (v: number | null | undefined) => (isMissing(v) ? '—' : formatMoney(v, currency));

  return (
    <section aria-label="Line items">
      <h4 className="mb-2 text-sm font-semibold text-neutral-900">
        Line items <span className="font-normal text-neutral-500">({items.length})</span>
      </h4>
      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <table className="w-full min-w-[28rem] border-collapse text-sm">
          <caption className="sr-only">Line items extracted from the invoice</caption>
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Description</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Qty</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Unit price</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {items.map((item, i) => (
              <tr key={i}>
                <td className="px-3 py-2 text-neutral-900">{item.description || '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums text-neutral-700">
                  {isMissing(item.quantity) ? '—' : item.quantity}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-neutral-700">{money(item.unit_price)}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums text-neutral-900">{money(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}