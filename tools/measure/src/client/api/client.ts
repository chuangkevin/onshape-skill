// API client for backend communication

export interface ProjectData {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface PhotoData {
  id: number;
  project_id: number;
  filename: string;
  original_name: string;
  angle: string;
  width: number;
  height: number;
  scale_data: string | null;
  created_at: string;
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// Projects
export const createProject = (name: string, description = '') =>
  apiFetch<ProjectData>('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  });

export const listProjects = () => apiFetch<ProjectData[]>('/api/projects');

export const deleteProject = (id: number) =>
  apiFetch<{ deleted: boolean }>(`/api/projects/${id}`, { method: 'DELETE' });

// Photos
export const listPhotos = (projectId: number) =>
  apiFetch<PhotoData[]>(`/api/projects/${projectId}/photos`);

export async function uploadPhotos(projectId: number, files: FileList | File[]): Promise<PhotoData[]> {
  const form = new FormData();
  for (const f of files) form.append('photos', f);
  const res = await fetch(`/api/projects/${projectId}/photos`, { method: 'POST', body: form });
  if (!res.ok) throw new Error('Upload failed');
  return res.json();
}

export const updatePhoto = (projectId: number, photoId: number, data: Record<string, any>) =>
  apiFetch<PhotoData>(`/api/projects/${projectId}/photos/${photoId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

export const deletePhoto = (projectId: number, photoId: number) =>
  apiFetch<{ deleted: boolean }>(`/api/projects/${projectId}/photos/${photoId}`, { method: 'DELETE' });

// Apply scale to all photos in project
export const applyScaleToAll = (projectId: number, scaleData: any) =>
  apiFetch<{ updated: number }>(`/api/projects/${projectId}/apply-scale`, {
    method: 'PATCH',
    body: JSON.stringify({ scale_data: scaleData }),
  });

// Auto contour detection
export const autoContour = (projectId: number, photoId: number, roi?: any) =>
  apiFetch<any>(`/api/projects/${projectId}/photos/${photoId}/auto-contour`, {
    method: 'POST',
    body: JSON.stringify({ roi }),
  });

// Analysis
export const analyzeProject = (projectId: number) =>
  apiFetch<any>(`/api/projects/${projectId}/analyze`, { method: 'POST' });

// Export
export const exportMeasurement = (projectId: number, path?: string, photos?: any[]) =>
  apiFetch<any>(`/api/projects/${projectId}/export`, {
    method: 'POST',
    body: JSON.stringify({ path, photos }),
  });

// Auto-analyze (SSE stream)
export function autoAnalyzeStream(projectId: number, photoId: number): EventSource {
  return new EventSource(`/api/projects/${projectId}/photos/${photoId}/auto-analyze`);
}

// API Keys
export interface ApiKeyInfo {
  suffix: string;
  calls_today: number;
  total_tokens_today: number;
  calls_7d: number;
  calls_30d: number;
}

export const listApiKeys = () => apiFetch<ApiKeyInfo[]>('/api/keys');

export const addApiKey = (key: string) =>
  apiFetch<{ added: boolean; suffix: string }>('/api/keys', {
    method: 'POST',
    body: JSON.stringify({ key }),
  });

export const deleteApiKey = (suffix: string) =>
  apiFetch<{ deleted: boolean }>(`/api/keys/${suffix}`, { method: 'DELETE' });

// FeatureScript generation
export const generateFeatureScript = (measurementJson: any) =>
  apiFetch<{ code: string; method?: 'gemini' | 'fallback' }>('/api/generate-featurescript', {
    method: 'POST',
    body: JSON.stringify(measurementJson),
  });

export const restartVideoAnalysis = (jobId: string) =>
  apiFetch<{ message: string }>(`/api/video/${jobId}/analyze`, {
    method: 'POST',
  });
