'use client';

import { Currency, Tag, Users, Building2, FileText } from 'lucide-react';

interface ResultsTableProps {
  data: any;
}

export default function ResultsTable({ data }: ResultsTableProps) {
  if (!data) return null;

  const fields = [
    { label: 'Invoice Number', key: 'invoice_number', icon: <FileText size={16} /> },
    { label: 'Invoice Date', key: 'invoice_date', icon: <CalendarIcon size={16} /> },
    { label: 'Supplier', key: 'supplier_name', icon: <Building2 size={16} /> },
    { label: 'Customer', key: 'customer_name', icon: <Users size={16} /> },
    { label: 'Subtotal', key: 'subtotal', icon: <Currency size={16} /> },
    { label: 'Tax', key: 'tax', icon: <Currency size={16} /> },
    { label: 'Total', key: 'total', icon: <Currency size={16} /> },
    { label: 'Currency', key: 'currency', icon: <Tag size={16} /> },
  ];

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-900">Extracted Information</h4>
      <div className="space-y-2">
        {fields.map((field) => {
          const value = data[field.key];
          const isMoney = ['subtotal', 'tax', 'total'].includes(field.key);
          return (
            <div key={field.key} className="flex items-center justify-between bg-gray-50 p-3 rounded border border-gray-100">
              <div className="flex items-center gap-2">
                {field.icon}
                <span className="text-sm text-gray-600">{field.label}</span>
              </div>
              <span className={`text-sm font-medium ${isMoney ? 'text-blue-600' : 'text-gray-900'}`}>
                {value === null || value === undefined ? (
                  <span className="text-gray-400 italic">Not found</span>
                ) : isMoney ? (
                  `$${Number(value).toFixed(2)}`
                ) : (
                  value
                )}
              </span>
            </div>
          );
        })}
        <div className="flex items-center justify-between bg-gray-50 p-3 rounded border border-gray-100">
          <div className="flex items-center gap-2">
            <Tag size={16} className="text-gray-400" />
            <span className="text-sm text-gray-600">Confidence</span>
          </div>
          <span className="text-sm font-medium text-gray-900">
            {Math.round((data.confidence || 0) * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}

function CalendarIcon({ size }: { size: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}