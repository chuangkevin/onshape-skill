import React, { useState, useMemo } from 'react';
import type { VideoAnalysisResult, ExtractedFeature, VehicleIdentification, PartialVehicleDimensions, ObjectIdentification } from '@shared/types';

interface Props {
  jobId: string;
  result: VideoAnalysisResult;
  onConfirm: (updated: VideoAnalysisResult) => void | Promise<void>;
  onBack: () => void;
}

const CONF_COLOR: Record<string, string> = {
  high: '#3fb950',
  medium: '#d29922',
  low: '#8b949e',
};

const CONF_LABEL: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

const VIEW_ANGLE_LABEL: Record<string, string> = {
  side: '側面',
  front: '正面',
  rear: '後方',
  top: '頂部',
  three_quarter: '3/4 視角',
  unknown: '未知',
};

export default function ConfirmationStep({ jobId, result, onConfirm, onBack }: Props) {
  const [editedObject, setEditedObject] = useState<ObjectIdentification>(result.object);
  const [editedVehicle, setEditedVehicle] = useState<VehicleIdentification | undefined>(result.vehicle);
  const [editedVehicleDims, setEditedVehicleDims] = useState<PartialVehicleDimensions | undefined>(result.vehicle_dimensions);
  const [editedFeatures, setEditedFeatures] = useState<ExtractedFeature[]>(result.features);
  const [submitting, setSubmitting] = useState(false);

  const hasVehicle = Boolean(editedVehicle);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      const updated: VideoAnalysisResult = {
        object: editedObject,
        features: editedFeatures,
        overall_confidence: result.overall_confidence,
        feature_count: editedFeatures.length,
        modelling_ready: result.modelling_ready,
        vehicle: editedVehicle,
        vehicle_dimensions: editedVehicleDims,
      };
      await onConfirm(updated);
    } finally {
      setSubmitting(false);
    }
  }

  function updateFeature(id: string, field: keyof ExtractedFeature, value: any) {
    setEditedFeatures((prev) =>
      prev.map((f) => (f.id === id ? { ...f, [field]: value } : f))
    );
  }

  const highConfFeatures = useMemo(
    () => editedFeatures.filter((f) => f.confidence === 'high' && f.value_mm !== null),
    [editedFeatures]
  );

  const mediumConfFeatures = useMemo(
    () => editedFeatures.filter((f) => f.confidence === 'medium'),
    [editedFeatures]
  );

  const lowConfFeatures = useMemo(
    () => editedFeatures.filter((f) => f.confidence === 'low' || f.value_mm === null),
    [editedFeatures]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl p-4" style={{ background: 'rgba(31,111,235,0.08)', border: '1px solid rgba(31,111,235,0.25)' }}>
        <h2 className="text-xl font-bold mb-2">確認辨識結果</h2>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          請檢查以下 AI 辨識的資料，如有錯誤可直接編輯。確認後將用於生成 FeatureScript。
        </p>
      </div>

      {/* Object Info */}
      <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>物件資訊</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="通用名稱" value={editedObject.common_name} onChange={(v) => setEditedObject((o) => ({ ...o, common_name: v }))} />
          <Field label="型號" value={editedObject.model_number ?? ''} onChange={(v) => setEditedObject((o) => ({ ...o, model_number: v || null }))} />
          <Field label="製造商" value={editedObject.manufacturer ?? ''} onChange={(v) => setEditedObject((o) => ({ ...o, manufacturer: v || null }))} />
          <Field label="描述" value={editedObject.description} onChange={(v) => setEditedObject((o) => ({ ...o, description: v }))} long />
        </div>
      </div>

      {/* Vehicle Info */}
      {hasVehicle && editedVehicle && (
        <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(31,111,235,0.08)', border: '1px solid rgba(31,111,235,0.25)' }}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>車輛識別</h3>
            <span className="px-2 py-1 rounded text-xs font-medium" style={{ background: '#1f3a5e', color: '#79c0ff' }}>
              {VIEW_ANGLE_LABEL[editedVehicle.view_angle] ?? editedVehicle.view_angle}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="品牌" value={editedVehicle.make} onChange={(v) => setEditedVehicle((ve) => ve ? { ...ve, make: v } : ve)} />
            <Field label="型號" value={editedVehicle.model} onChange={(v) => setEditedVehicle((ve) => ve ? { ...ve, model: v } : ve)} />
            <Field label="年份" type="number" value={editedVehicle.year?.toString() ?? ''} onChange={(v) => setEditedVehicle((ve) => ve ? { ...ve, year: v ? parseInt(v, 10) : undefined } : ve)} />
            <Field label="變體" value={editedVehicle.variant ?? ''} onChange={(v) => setEditedVehicle((ve) => ve ? { ...ve, variant: v || undefined } : ve)} />
          </div>
        </div>
      )}

      {/* Vehicle Dimensions */}
      {hasVehicle && editedVehicleDims && (
        <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>車輛尺寸 (mm)</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="車長" type="number" value={editedVehicleDims.length_mm?.toString() ?? ''} onChange={(v) => setEditedVehicleDims((d) => ({ ...d, length_mm: v ? parseFloat(v) : undefined }))} />
            <Field label="車寬" type="number" value={editedVehicleDims.width_mm?.toString() ?? ''} onChange={(v) => setEditedVehicleDims((d) => ({ ...d, width_mm: v ? parseFloat(v) : undefined }))} />
            <Field label="車高" type="number" value={editedVehicleDims.height_mm?.toString() ?? ''} onChange={(v) => setEditedVehicleDims((d) => ({ ...d, height_mm: v ? parseFloat(v) : undefined }))} />
            <Field label="軸距" type="number" value={editedVehicleDims.wheelbase_mm?.toString() ?? ''} onChange={(v) => setEditedVehicleDims((d) => ({ ...d, wheelbase_mm: v ? parseFloat(v) : undefined }))} />
            <Field label="前輪距" type="number" value={editedVehicleDims.front_track_mm?.toString() ?? ''} onChange={(v) => setEditedVehicleDims((d) => ({ ...d, front_track_mm: v ? parseFloat(v) : undefined }))} />
            <Field label="後輪距" type="number" value={editedVehicleDims.rear_track_mm?.toString() ?? ''} onChange={(v) => setEditedVehicleDims((d) => ({ ...d, rear_track_mm: v ? parseFloat(v) : undefined }))} />
          </div>
        </div>
      )}

      {/* Features */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <div className="px-4 py-3" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
          <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>特徵清單 ({editedFeatures.length} 項)</h3>
        </div>

        {highConfFeatures.length > 0 && (
          <FeatureSection title="高信心特徵" features={highConfFeatures} onUpdate={updateFeature} conf="high" />
        )}

        {mediumConfFeatures.length > 0 && (
          <FeatureSection title="中信心特徵" features={mediumConfFeatures} onUpdate={updateFeature} conf="medium" />
        )}

        {lowConfFeatures.length > 0 && (
          <FeatureSection title="低信心 / 缺失尺寸" features={lowConfFeatures} onUpdate={updateFeature} conf="low" />
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-center pt-2">
        <button
          onClick={onBack}
          disabled={submitting}
          className="px-6 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
        >
          ← 返回重新分析
        </button>
        <button
          onClick={handleConfirm}
          disabled={submitting}
          className="px-8 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ background: '#1f6feb', color: '#fff' }}
        >
          {submitting ? '送出中...' : '✓ 確認並生成 FeatureScript'}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  long = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'number';
  long?: boolean;
}) {
  return (
    <div className={long ? 'md:col-span-2' : ''}>
      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg px-3 py-1.5 text-sm outline-none"
        style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
      />
    </div>
  );
}

function FeatureSection({
  title,
  features,
  onUpdate,
  conf,
}: {
  title: string;
  features: ExtractedFeature[];
  onUpdate: (id: string, field: keyof ExtractedFeature, value: any) => void;
  conf: 'high' | 'medium' | 'low';
}) {
  const [expanded, setExpanded] = useState(conf === 'high' || conf === 'medium');

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2.5 flex items-center justify-between text-sm font-medium hover:opacity-80 transition-opacity"
        style={{ background: 'var(--surface)', color: 'var(--text)' }}
      >
        <div className="flex items-center gap-2">
          <span>{expanded ? '▼' : '▶'}</span>
          <span>{title}</span>
          <span className="px-1.5 py-0.5 rounded text-xs font-medium" style={{ background: `${CONF_COLOR[conf]}22`, color: CONF_COLOR[conf] }}>
            {features.length}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {features.map((feat) => (
            <div key={feat.id} className="px-4 py-3 grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>特徵名稱</label>
                <input
                  type="text"
                  value={feat.feature_name}
                  onChange={(e) => onUpdate(feat.id, 'feature_name', e.target.value)}
                  className="w-full rounded px-2 py-1 text-sm outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>尺寸 (mm)</label>
                <input
                  type="number"
                  step="0.01"
                  value={feat.value_mm ?? ''}
                  onChange={(e) => onUpdate(feat.id, 'value_mm', e.target.value ? parseFloat(e.target.value) : null)}
                  className="w-full rounded px-2 py-1 text-sm outline-none font-mono"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  placeholder="—"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>信心度</label>
                <select
                  value={feat.confidence}
                  onChange={(e) => onUpdate(feat.id, 'confidence', e.target.value as 'high' | 'medium' | 'low')}
                  className="w-full rounded px-2 py-1 text-sm outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                >
                  <option value="high">高</option>
                  <option value="medium">中</option>
                  <option value="low">低</option>
                </select>
              </div>

              {feat.notes && (
                <div className="md:col-span-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                  備註: {feat.notes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
