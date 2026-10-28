'use client';

import { useEffect, useState } from 'react';
import { Clock, CheckCircle2, AlertCircle } from 'lucide-react';

interface ProgressTrackerProps {
  jobId: string;
  initialProgress?: number;
}

export default function ProgressTracker({ jobId, initialProgress = 0 }: ProgressTrackerProps) {
  const [progress, setProgress] = useState(initialProgress);
  const [status, setStatus] = useState<string>('uploaded');

  useEffect(() => {
    const pollStatus = async () => {
      try {
        const res = await fetch(`/api/process/${jobId}`);
        if (res.ok) {
          const data = await res.json();
          setProgress(data.progress);
          setStatus(data.status);
        }
      } catch {
        // Silent fail, will retry
      }
    };

    const interval = setInterval(pollStatus, 2000);
    pollStatus();
    return () => clearInterval(interval);
  }, [jobId]);

  const statusConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    uploaded: { color: 'text-blue-600', icon: <Clock size={16} />, label: 'Uploaded' },
    processing: { color: 'text-blue-600', icon: <Clock size={16} className="animate-spin" />, label: 'Processing' },
    completed: { color: 'text-green-600', icon: <CheckCircle2 size={16} />, label: 'Completed' },
    failed: { color: 'text-red-600', icon: <AlertCircle size={16} />, label: 'Failed' },
  };

  const config = statusConfig[status] || statusConfig.uploaded;

  return (
    <div className="mt-3 space-y-2">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500">{config.label}</span>
        <span className="text-gray-500">{progress}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-500 ${config.color.replace('text-', 'bg-')}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}