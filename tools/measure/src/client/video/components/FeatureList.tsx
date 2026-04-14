import React, { useState, useMemo } from 'react';
import type { VideoAnalysisResult, ExtractedFeature } from '@shared/types';

interface Props {
  result: VideoAnalysisResult;
  onReset: () => void;
}

type SortKey = 'feature_name' | 'value_mm' | 'confidence' | 'feature_type';
type FilterConf = 'all' | 'high' | 'medium' | 'low';

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

const SOURCE_LABEL: Record<string, string> = {
  gemini_vision: 'Gemini Vision',
  web_search: '網路搜尋',
};

const VIEW_ANGLE_LABEL: Record<string, string> = {
  side: '側面',
  front: '正面',
  rear: '後方',
  top: '頂部',
  three_quarter: '3/4 視角',
  unknown: '未知',
};

export default function FeatureList({ result, onReset }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('feature_name');
  const [sortAsc, setSortAsc] = useState(true);
  const [filterConf, setFilterConf] = useState<FilterConf>('all');
  const [search, setSearch] = useState('');

  const sorted = useMemo(() => {
    let list = result.features.filter((f) => {
      if (filterConf !== 'all' && f.confidence !== filterConf) return false;
      if (search && !f.feature_name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'value_mm') {
        cmp = (a.value_mm ?? -1) - (b.value_mm ?? -1);
      } else {
        cmp = String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''));
      }
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [result.features, sortKey, sortAsc, filterConf, search]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((a) => !a);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  function SortArrow({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span style={{ color: 'var(--border)' }}> ↕</span>;
    return <span style={{ color: 'var(--accent)' }}> {sortAsc ? '↑' : '↓'}</span>;
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.object.common_name.replace(/\s+/g, '_')}_features.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCSV() {
    const headers = ['特徵名稱', '類型', '視角', '尺寸(mm)', '單位', '信心度', '來源', '備註'];
    const rows = result.features.map((f) => [
      f.feature_name,
      f.feature_type,
      f.view,
      f.value_mm ?? '',
      f.value_unit ?? 'mm',
      f.confidence,
      SOURCE_LABEL[f.source] ?? f.source,
      f.notes,
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.object.common_name.replace(/\s+/g, '_')}_features.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const highCount = result.features.filter((f) => f.confidence === 'high').length;
  const knownDims = result.features.filter((f) => f.value_mm !== null).length;
  const vehicleLabel = result.vehicle
    ? [result.vehicle.year, result.vehicle.make, result.vehicle.model, result.vehicle.variant].filter(Boolean).join(' ')
    : null;

  return (
    <div className="space-y-5">
      {result.vehicle && (
        <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(31,111,235,0.08)', border: '1px solid rgba(31,111,235,0.25)' }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--accent)' }}>車型識別</p>
              <h2 className="text-xl font-bold">{vehicleLabel}</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                視角：{VIEW_ANGLE_LABEL[result.vehicle.view_angle] ?? result.vehicle.view_angle}
              </p>
            </div>
            <span className="shrink-0 px-2 py-1 rounded text-xs font-medium" style={{ background: '#1f3a5e', color: '#79c0ff' }}>
              Vehicle
            </span>
          </div>

          {result.vehicle_dimensions && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              {result.vehicle_dimensions.length_mm && <Stat label="車長" value={`${result.vehicle_dimensions.length_mm} mm`} />}
              {result.vehicle_dimensions.width_mm && <Stat label="車寬" value={`${result.vehicle_dimensions.width_mm} mm`} />}
              {result.vehicle_dimensions.height_mm && <Stat label="車高" value={`${result.vehicle_dimensions.height_mm} mm`} />}
              {result.vehicle_dimensions.wheelbase_mm && <Stat label="軸距" value={`${result.vehicle_dimensions.wheelbase_mm} mm`} />}
              {result.vehicle_dimensions.front_track_mm && <Stat label="前輪距" value={`${result.vehicle_dimensions.front_track_mm} mm`} />}
              {result.vehicle_dimensions.rear_track_mm && <Stat label="後輪距" value={`${result.vehicle_dimensions.rear_track_mm} mm`} />}
            </div>
          )}
        </div>
      )}

      {/* Object summary card */}
      <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--accent)' }}>已辨識物件</p>
            <h2 className="text-xl font-bold">{result.object.common_name}</h2>
            {(result.object.model_number || result.object.manufacturer) && (
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {[result.object.manufacturer, result.object.model_number].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <span
            className="shrink-0 px-2 py-1 rounded text-xs font-medium"
            style={{
              background: `${CONF_COLOR[result.overall_confidence]}22`,
              color: CONF_COLOR[result.overall_confidence],
            }}
          >
            整體信心：{CONF_LABEL[result.overall_confidence]}
          </span>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{result.object.description}</p>

        {/* Stats row */}
        <div className="flex gap-4 pt-1 text-sm">
          <Stat label="特徵總數" value={result.feature_count} />
          <Stat label="已量化" value={knownDims} />
          <Stat label="高信心" value={highCount} />
          <Stat label="可建模" value={result.modelling_ready ? '是' : '否'} />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="搜尋特徵…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-sm flex-1 min-w-40 outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />
        <select
          value={filterConf}
          onChange={(e) => setFilterConf(e.target.value as FilterConf)}
          className="rounded-lg px-3 py-1.5 text-sm outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
        >
          <option value="all">全部信心度</option>
          <option value="high">高</option>
          <option value="medium">中</option>
          <option value="low">低</option>
        </select>
        <div className="ml-auto flex gap-2">
          <button onClick={exportCSV} className="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            ↓ CSV
          </button>
          <button onClick={exportJSON} className="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors" style={{ background: 'var(--accent)', color: '#fff' }}>
            ↓ JSON
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr style={{ background: 'var(--surface)' }}>
              {[
                { key: 'feature_name' as SortKey, label: '特徵名稱' },
                { key: 'feature_type' as SortKey, label: '類型' },
                { key: 'value_mm' as SortKey, label: '尺寸 (mm)' },
                { key: 'confidence' as SortKey, label: '信心' },
              ].map((col) => (
                <th
                  key={col.key}
                  className="px-3 py-2.5 text-left font-semibold cursor-pointer select-none"
                  style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}
                  onClick={() => toggleSort(col.key)}
                >
                  {col.label}<SortArrow k={col.key} />
                </th>
              ))}
              <th className="px-3 py-2.5 text-left font-semibold" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                來源 / 備註
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center" style={{ color: 'var(--text-muted)' }}>
                  沒有符合條件的特徵
                </td>
              </tr>
            )}
            {sorted.map((feat, i) => (
              <tr
                key={feat.id}
                style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)' }}
              >
                <td className="px-3 py-2.5 font-medium">{feat.feature_name}</td>
                <td className="px-3 py-2.5">
                  <TypeBadge type={feat.feature_type} />
                </td>
                <td className="px-3 py-2.5 font-mono">
                  {feat.value_mm != null
                    ? <><span className="font-semibold">{feat.value_mm.toFixed(2)}</span> <span style={{ color: 'var(--text-muted)' }}>mm</span></>
                    : <span style={{ color: 'var(--text-muted)' }}>—</span>
                  }
                </td>
                <td className="px-3 py-2.5">
                  <span className="font-medium" style={{ color: CONF_COLOR[feat.confidence] }}>
                    {CONF_LABEL[feat.confidence]}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--text-muted)', maxWidth: 220 }}>
                  <span className="font-medium">{SOURCE_LABEL[feat.source] ?? feat.source}</span>
                  {feat.notes && <span> · {feat.notes}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Reset button */}
      <div className="flex justify-center pt-2">
        <button
          onClick={onReset}
          className="px-5 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
        >
          ← 分析新影片
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

const TYPE_COLOR: Record<string, { bg: string; fg: string }> = {
  dimension: { bg: '#1f3a5e', fg: '#79c0ff' },
  hole: { bg: '#1e3a29', fg: '#56d364' },
  slot: { bg: '#3a2a1e', fg: '#e3b341' },
  connector: { bg: '#2e1e3a', fg: '#bc8cff' },
  thread: { bg: '#3a1e1e', fg: '#ff7b72' },
  radius: { bg: '#1e2f3a', fg: '#58a6ff' },
  angle: { bg: '#1e3a35', fg: '#39d353' },
  other: { bg: '#2a2a2a', fg: '#8b949e' },
};

function TypeBadge({ type }: { type: string }) {
  const colors = TYPE_COLOR[type] ?? TYPE_COLOR.other;
  return (
    <span className="px-1.5 py-0.5 rounded text-xs font-medium" style={{ background: colors.bg, color: colors.fg }}>
      {type}
    </span>
  );
}
