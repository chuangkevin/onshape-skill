import React, { useCallback, useState, useRef } from 'react';

interface Props {
  onUploaded: (jobId: string) => void;
}

type UploadMode = 'video' | 'photos';

export default function VideoUploader({ onUploaded }: Props) {
  const [mode, setMode] = useState<UploadMode>('video');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = mode === 'video'
    ? 'video/mp4,video/quicktime,video/webm,video/x-msvideo,video/mpeg'
    : 'image/jpeg,image/png,image/webp';

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArr = Array.from(files);
      if (fileArr.length === 0) return;
      setError(null);
      setUploading(true);

      try {
        const formData = new FormData();
        let endpoint: string;

        if (mode === 'video') {
          formData.append('video', fileArr[0]);
          endpoint = '/api/video/upload';
          setProgress('上傳影片中…');
        } else {
          fileArr.forEach((f) => formData.append('photos', f));
          endpoint = '/api/video/upload-photos';
          setProgress(`上傳 ${fileArr.length} 張照片中…`);
        }

        const res = await fetch(endpoint, { method: 'POST', body: formData });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Upload failed: ${res.status}`);
        }

        const { job_id } = await res.json();

        // Start analysis
        setProgress('啟動 AI 分析…');
        const analyzeRes = await fetch(`/api/video/${job_id}/analyze`, { method: 'POST' });
        if (!analyzeRes.ok) {
          const body = await analyzeRes.json().catch(() => ({}));
          throw new Error(body.error ?? 'Failed to start analysis');
        }

        onUploaded(job_id);
      } catch (err: any) {
        setError(err?.message ?? 'Upload failed');
        setUploading(false);
        setProgress(null);
      }
    },
    [mode, onUploaded],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (uploading) return;
      handleFiles(e.dataTransfer.files);
    },
    [uploading, handleFiles],
  );

  return (
    <div className="space-y-6">
      {/* Mode tabs */}
      <div className="flex rounded-lg overflow-hidden border text-sm" style={{ borderColor: 'var(--border)' }}>
        {(['video', 'photos'] as UploadMode[]).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setError(null); }}
            className="flex-1 py-2 font-medium transition-colors"
            style={{
              background: mode === m ? 'var(--accent)' : 'var(--surface)',
              color: mode === m ? '#fff' : 'var(--text-muted)',
            }}
          >
            {m === 'video' ? '🎬 影片上傳' : '🖼️ 多張照片'}
          </button>
        ))}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center py-16 cursor-pointer transition-colors select-none"
        style={{
          borderColor: dragging ? 'var(--accent)' : 'var(--border)',
          background: dragging ? 'rgba(31,111,235,0.08)' : 'var(--surface)',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={mode === 'photos'}
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />

        {uploading ? (
          <div className="text-center space-y-3">
            <Spinner />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{progress}</p>
          </div>
        ) : (
          <div className="text-center space-y-2">
            <div className="text-5xl">{mode === 'video' ? '🎬' : '🖼️'}</div>
            <p className="font-medium">
              {mode === 'video' ? '拖曳影片或點擊選擇' : '拖曳照片或點擊選擇（最多 20 張）'}
            </p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {mode === 'video'
                ? 'MP4 · MOV · WebM · AVI，最大 500 MB'
                : 'JPEG · PNG · WebP，每張最大 50 MB'}
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: 'var(--error)' }}>
          {error}
        </div>
      )}

      {/* Tips */}
      <div className="rounded-lg p-4 text-sm space-y-1" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <p className="font-medium mb-2">拍攝建議</p>
        {[
          '環繞物件拍攝多角度（頂部、正面、側面）',
          '在畫面中放置已知尺寸的比例尺或尺',
          '光線充足、背景乾淨效果最佳',
          '拍攝任何可見的型號標籤或銘牌',
        ].map((tip) => (
          <p key={tip} style={{ color: 'var(--text-muted)' }}>• {tip}</p>
        ))}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div
      className="w-8 h-8 rounded-full border-2 border-t-transparent mx-auto animate-spin"
      style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
    />
  );
}
