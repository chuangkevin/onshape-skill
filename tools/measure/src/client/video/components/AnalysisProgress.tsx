import React, { useEffect, useRef, useState } from 'react';
import type { VideoAnalysisResult, VideoJobStatus, ObjectIdentification, ExtractedFeature } from '@shared/types';
import { restartVideoAnalysis } from '../../api/client';

interface Props {
  jobId: string;
  onDone: (result: VideoAnalysisResult, notice?: string) => void;
  onReset: () => void;
}

interface ProgressState {
  status: VideoJobStatus;
  message: string;
  frameCount: number;
  object: ObjectIdentification | null;
  featureCount: number;
}

const STEPS: { key: VideoJobStatus; label: string; icon: string }[] = [
  { key: 'extracting', label: '影格擷取', icon: '🎞️' },
  { key: 'analyzing', label: 'AI 物件辨識', icon: '🔍' },
  { key: 'searching', label: '網路搜尋尺寸', icon: '🌐' },
  { key: 'done', label: '完成', icon: '✅' },
];

const STATUS_ORDER: VideoJobStatus[] = ['queued', 'extracting', 'analyzing', 'searching', 'done'];

function stepIndex(status: VideoJobStatus): number {
  return STATUS_ORDER.indexOf(status);
}

function isAlreadyRunningError(message: string): boolean {
  return /already in status/i.test(message || '');
}

export default function AnalysisProgress({ jobId, onDone, onReset }: Props) {
  const [state, setState] = useState<ProgressState>({
    status: 'queued',
    message: '等待中…',
    frameCount: 0,
    object: null,
    featureCount: 0,
  });
  const esRef = useRef<EventSource | null>(null);
  const mountedRef = useRef(true);
  const retryTokenRef = useRef(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  async function retryAnalysis() {
    setRetrying(true);
    setErrorMessage(null);
    const token = ++retryTokenRef.current;
    try {
      await restartVideoAnalysis(jobId);
      if (!mountedRef.current || token !== retryTokenRef.current) return;
      setState((s) => ({ ...s, status: 'analyzing', message: '重新啟動 Gemini 分析…' }));
      esRef.current?.close();
      const es = new EventSource(`/api/video/${jobId}/stream`);
      esRef.current = es;
      bindEventSource(es);
    } catch (err: any) {
      if (!mountedRef.current || token !== retryTokenRef.current) return;
      const message = err?.message || '重新啟動分析失敗';
      if (isAlreadyRunningError(message)) {
        setState((s) => ({ ...s, status: 'analyzing', message: '重新接上進行中的分析…' }));
        esRef.current?.close();
        const es = new EventSource(`/api/video/${jobId}/stream`);
        esRef.current = es;
        bindEventSource(es);
      } else {
        setErrorMessage(message);
      }
    } finally {
      if (mountedRef.current && token === retryTokenRef.current) {
        setRetrying(false);
      }
    }
  }

  function bindEventSource(es: EventSource) {
    es.onmessage = (e) => {
      if (!mountedRef.current) return;
      try {
        const event = JSON.parse(e.data);
        switch (event.type) {
          case 'status':
            setState((s) => ({ ...s, status: event.status, message: event.message }));
            break;
          case 'frames':
            setState((s) => ({ ...s, frameCount: event.frame_count }));
            break;
          case 'object':
            setState((s) => ({ ...s, object: event.object }));
            break;
          case 'features':
            setState((s) => ({ ...s, featureCount: (event.features as ExtractedFeature[]).length }));
            break;
          case 'done':
            es.close();
            onDone(event.result as VideoAnalysisResult);
            break;
          case 'error':
            es.close();
            console.error('[video stream] error:', event.message);
            if (event.result) {
              onDone(event.result as VideoAnalysisResult, `分析未完全成功：${event.message}`);
            } else {
              setState((s) => ({ ...s, status: 'error', message: event.message }));
              setErrorMessage(event.message);
            }
            break;
        }
      } catch {}
    };

    es.onerror = () => {
      if (!mountedRef.current) return;
      setState((s) => ({ ...s, message: '連線中斷，重新連線中…' }));
    };
  }

  useEffect(() => {
    mountedRef.current = true;
    const es = new EventSource(`/api/video/${jobId}/stream`);
    esRef.current = es;
    bindEventSource(es);

    return () => {
      mountedRef.current = false;
      retryTokenRef.current += 1;
      esRef.current?.close();
    };
  }, [jobId, onDone]);

  const currentIdx = stepIndex(state.status);

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center">
        <div className="text-4xl mb-2">🤖</div>
        <h2 className="text-lg font-semibold">Gemini AI 正在分析…</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{state.message}</p>
      </div>

      {/* Step progress */}
      <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {STEPS.map((step, idx) => {
          const stepIdx = stepIndex(step.key);
          const isDone = currentIdx > stepIdx;
          const isActive = currentIdx === stepIdx;
          return (
            <div key={step.key} className="flex items-center gap-3">
              <span className="text-lg w-6 text-center">
                {isDone ? '✓' : isActive ? <SpinnerSmall /> : step.icon}
              </span>
              <span
                className="text-sm font-medium"
                style={{ color: isDone ? 'var(--success)' : isActive ? 'var(--text)' : 'var(--text-muted)' }}
              >
                {step.label}
              </span>
              {step.key === 'extracting' && state.frameCount > 0 && (
                <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>
                  {state.frameCount} 影格
                </span>
              )}
              {step.key === 'analyzing' && state.featureCount > 0 && (
                <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>
                  {state.featureCount} 特徵
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Object identified */}
      {state.object && (
        <div className="rounded-xl p-4 space-y-2" style={{ background: 'rgba(31,111,235,0.08)', border: '1px solid rgba(31,111,235,0.25)' }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>已辨識物件</p>
          <p className="font-semibold">{state.object.common_name}</p>
          {state.object.model_number && (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>型號：{state.object.model_number}</p>
          )}
          {state.object.manufacturer && (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>製造商：{state.object.manufacturer}</p>
          )}
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{state.object.description}</p>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(248,81,73,0.10)', border: '1px solid rgba(248,81,73,0.30)' }}>
          <p className="font-semibold" style={{ color: 'var(--error)' }}>分析失敗</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{errorMessage}</p>
          <div className="flex gap-2">
            <button onClick={retryAnalysis} disabled={retrying} className="rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60" style={{ background: '#1f6feb', color: '#fff' }}>
              {retrying ? '重試中…' : '重試分析'}
            </button>
            <button onClick={onReset} className="rounded-lg px-3 py-1.5 text-sm font-medium" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              重新上傳
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SpinnerSmall() {
  return (
    <span
      className="inline-block w-4 h-4 rounded-full border border-t-transparent animate-spin"
      style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
    />
  );
}
