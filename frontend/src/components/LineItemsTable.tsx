'use client';

import { Plus, Trash2, Edit2 } from 'lucide-react';

interface LineItem {
  description?: string;
  quantity?: number;
  unit_price?: number;
  amount?: number;
}

interface LineItemsTableProps {
  items: LineItem[];
}

export default function LineItemsTable({ items }: LineItemsTableProps) {
  if (!items || items.length === 0) return null;

  return (
    <div className="mt-6">
      <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
        <Plus size={16} /> Line Items ({items.length})
      </h4>
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
            <th className="pb-2">Description</th>
            <th className="pb-2 text-right">Qty</th>
            <th className="pb-2 text-right">Unit Price</th>
            <th className="pb-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} className="border-b border-gray-100">
              <td className="py-2 text-sm">{item.description || '—'}</td>
              <td className="py-2 text-sm text-right">{item.quantity || '—'}</td>
              <td className="py-2 text-sm text-right">
                {item.unit_price !== undefined ? `$${item.unit_price.toFixed(2)}` : '—'}
              </td>
              <td className="py-2 text-sm text-right">
                {item.amount !== undefined ? `$${item.amount.toFixed(2)}` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}