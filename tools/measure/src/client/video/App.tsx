import React, { useState } from 'react';
import VideoUploader from './components/VideoUploader';
import AnalysisProgress from './components/AnalysisProgress';
import FeatureList from './components/FeatureList';
import type { VideoAnalysisResult } from '@shared/types';

type Step = 'upload' | 'analyzing' | 'done';

export default function App() {
  const [step, setStep] = useState<Step>('upload');
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<VideoAnalysisResult | null>(null);

  function handleUploaded(id: string) {
    setJobId(id);
    setStep('analyzing');
  }

  function handleDone(r: VideoAnalysisResult) {
    setResult(r);
    setStep('done');
  }

  function handleReset() {
    setStep('upload');
    setJobId(null);
    setResult(null);
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Header */}
      <header className="border-b px-6 py-3 flex items-center gap-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <a href="/" className="text-sm opacity-60 hover:opacity-100 transition-opacity">
          ← 照片量測工具
        </a>
        <span style={{ color: 'var(--border)' }}>|</span>
        <h1 className="text-base font-semibold">影片辨識 · 自動特徵擷取</h1>
        <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#1f3a5e', color: '#79c0ff' }}>
          Gemini 2.5 Flash
        </span>
      </header>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2 py-4 text-sm" style={{ color: 'var(--text-muted)' }}>
        <StepDot active={step === 'upload'} done={step !== 'upload'} label="1. 上傳" />
        <div className="h-px w-8" style={{ background: 'var(--border)' }} />
        <StepDot active={step === 'analyzing'} done={step === 'done'} label="2. AI 分析" />
        <div className="h-px w-8" style={{ background: 'var(--border)' }} />
        <StepDot active={step === 'done'} done={false} label="3. 特徵清單" />
      </div>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {step === 'upload' && (
          <VideoUploader onUploaded={handleUploaded} />
        )}
        {step === 'analyzing' && jobId && (
          <AnalysisProgress jobId={jobId} onDone={handleDone} onError={handleReset} />
        )}
        {step === 'done' && result && (
          <FeatureList result={result} onReset={handleReset} />
        )}
      </main>
    </div>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  const bg = done ? 'var(--success)' : active ? 'var(--accent)' : 'var(--border)';
  const fg = done || active ? '#fff' : 'var(--text-muted)';
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold"
        style={{ background: bg, color: fg }}
      >
        {done ? '✓' : ''}
      </span>
      <span style={{ color: active ? 'var(--text)' : 'var(--text-muted)' }}>{label}</span>
    </span>
  );
}
