'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Loader2 } from 'lucide-react';

export interface JobUpdate {
  status?: string;
  progress?: number;
  error?: string;
  [key: string]: unknown;
}

interface ProgressTrackerProps {
  jobId: string;
  label?: string;
  initialProgress?: number;
  onUpdate?: (jobId: string, update: JobUpdate) => void;
}

const STATUS = {
  uploaded: { label: 'Uploaded', text: 'text-neutral-600', bar: 'bg-neutral-400', Icon: Clock, spin: false },
  processing: { label: 'Processing', text: 'text-blue-700', bar: 'bg-blue-600', Icon: Loader2, spin: true },
  completed: { label: 'Completed', text: 'text-emerald-700', bar: 'bg-emerald-600', Icon: CheckCircle2, spin: false },
  failed: { label: 'Failed', text: 'text-red-700', bar: 'bg-red-600', Icon: AlertCircle, spin: false },
} as const;

const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

export default function ProgressTracker({ jobId, label, initialProgress = 0, onUpdate }: ProgressTrackerProps) {
  const [progress, setProgress] = useState(clamp(initialProgress));
  const [status, setStatus] = useState<string>('uploaded');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    const poll = async () => {
      let finished = false;
      try {
        const res = await fetch(`/api/process/${jobId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: JobUpdate = await res.json();
        if (cancelled) return;

        failures = 0;
        setOffline(false);
        if (typeof data.progress === 'number') setProgress(clamp(data.progress));
        if (typeof data.status === 'string') setStatus(data.status);
        setErrorText(typeof data.error === 'string' ? data.error : null);
        onUpdateRef.current?.(jobId, data);
        finished = data.status === 'completed' || data.status === 'failed';
      } catch {
        if (cancelled) return;
        failures += 1;
        setOffline(true);
      }

      // Stop polling once the job is done; back off while the server is unreachable.
      if (!cancelled && !finished) {
        const delay = Math.min(2000 * 2 ** Math.min(failures, 3), 10000);
        timer = setTimeout(poll, delay);
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);

  const config = STATUS[status as keyof typeof STATUS] ?? STATUS.uploaded;
  const shown = status === 'completed' ? 100 : progress;
  const { Icon } = config;

  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className={`inline-flex items-center gap-1.5 font-medium ${config.text}`}>
          <Icon size={14} aria-hidden="true" className={config.spin ? 'animate-spin' : undefined} />
          {config.label}
        </span>
        <span className="tabular-nums text-neutral-500">{shown}%</span>
      </div>

      <div
        role="progressbar"
        aria-label={label ? `Progress for ${label}` : 'Processing progress'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={shown}
        className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200"
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${config.bar}`}
          style={{ width: `${shown}%` }}
        />
      </div>

      {status === 'failed' && (
        <p className="mt-2 text-xs text-red-700">{errorText ?? 'Processing failed. Try uploading the file again.'}</p>
      )}
      {offline && status !== 'completed' && status !== 'failed' && (
        <p className="mt-2 text-xs text-amber-800">Can’t reach the server. Retrying…</p>
      )}

      {/* Announces status changes only (not every percentage tick). */}
      <span role="status" className="sr-only">
        {label ? `${label}: ` : ''}
        {config.label}
      </span>
    </div>
  );
}