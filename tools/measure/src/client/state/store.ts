import type { DrawingShape, FeatureAnnotation, ManualDimension, ScaleCalibration, ViewAngle } from '@shared/types.js';

export interface AppState {
  // Project
  projectId: number | null;
  projectName: string;

  // Photos
  photos: PhotoState[];
  activePhotoIndex: number;

  // Active tool
  activeTool: ToolType;

  // Undo/redo stacks (per photo)
  undoStack: DrawingShape[][];
  redoStack: DrawingShape[][];
}

export interface PhotoState {
  id: number;
  filename: string;
  originalName: string;
  angle: ViewAngle;
  scale: ScaleCalibration | null;
  drawings: DrawingShape[];
  features: FeatureAnnotation[];
  dimensions: ManualDimension[];
}

export type ToolType = 'select' | 'polyline' | 'arc' | 'hole' | 'scale' | 'edit-contour';

type Listener = () => void;

class Store {
  private state: AppState = {
    projectId: null,
    projectName: '',
    photos: [],
    activePhotoIndex: -1,
    activeTool: 'select',
    undoStack: [],
    redoStack: [],
  };

  private listeners: Listener[] = [];

  getState(): Readonly<AppState> {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }

  // ── Mutations ──

  setProject(id: number, name: string): void {
    this.state = { ...this.state, projectId: id, projectName: name };
    this.notify();
  }

  setPhotos(photos: PhotoState[]): void {
    this.state = {
      ...this.state,
      photos,
      activePhotoIndex: photos.length > 0 ? 0 : -1,
      undoStack: photos.map(() => []),
      redoStack: photos.map(() => []),
    };
    this.notify();
  }

  setActivePhoto(index: number): void {
    this.state = { ...this.state, activePhotoIndex: index };
    this.notify();
  }

  setActiveTool(tool: ToolType): void {
    this.state = { ...this.state, activeTool: tool };
    this.notify();
  }

  getActivePhoto(): PhotoState | null {
    const { photos, activePhotoIndex } = this.state;
    return activePhotoIndex >= 0 ? photos[activePhotoIndex] : null;
  }

  // Drawing mutations
  addDrawing(shape: DrawingShape): void {
    const i = this.state.activePhotoIndex;
    if (i < 0) return;

    const photos = [...this.state.photos];
    photos[i] = { ...photos[i], drawings: [...photos[i].drawings, shape] };

    const undoStack = [...this.state.undoStack];
    // No undo entry needed — undo removes last drawing
    const redoStack = [...this.state.redoStack];
    redoStack[i] = []; // Clear redo on new action

    this.state = { ...this.state, photos, undoStack, redoStack };
    this.notify();
  }

  removeDrawing(shapeId: string): void {
    const i = this.state.activePhotoIndex;
    if (i < 0) return;
    const photos = [...this.state.photos];
    photos[i] = {
      ...photos[i],
      drawings: photos[i].drawings.filter((d) => d.id !== shapeId),
    };
    this.state = { ...this.state, photos };
    this.notify();
  }

  undo(): void {
    const i = this.state.activePhotoIndex;
    if (i < 0) return;
    const drawings = [...this.state.photos[i].drawings];
    if (drawings.length === 0) return;

    const removed = drawings.pop()!;
    const photos = [...this.state.photos];
    photos[i] = { ...photos[i], drawings };

    const redoStack = [...this.state.redoStack];
    redoStack[i] = [...(redoStack[i] || []), removed];

    this.state = { ...this.state, photos, redoStack };
    this.notify();
  }

  redo(): void {
    const i = this.state.activePhotoIndex;
    if (i < 0) return;
    const redos = this.state.redoStack[i] || [];
    if (redos.length === 0) return;

    const restored = redos[redos.length - 1];
    const photos = [...this.state.photos];
    photos[i] = { ...photos[i], drawings: [...photos[i].drawings, restored] };

    const redoStack = [...this.state.redoStack];
    redoStack[i] = redos.slice(0, -1);

    this.state = { ...this.state, photos, redoStack };
    this.notify();
  }

  setScale(scale: ScaleCalibration): void {
    const i = this.state.activePhotoIndex;
    if (i < 0) return;
    const photos = [...this.state.photos];
    photos[i] = { ...photos[i], scale };
    this.state = { ...this.state, photos };
    this.notify();
  }

  addFeature(feature: FeatureAnnotation): void {
    const i = this.state.activePhotoIndex;
    if (i < 0) return;
    const photos = [...this.state.photos];
    photos[i] = { ...photos[i], features: [...photos[i].features, feature] };
    this.state = { ...this.state, photos };
    this.notify();
  }

  removeFeature(featureId: string): void {
    const i = this.state.activePhotoIndex;
    if (i < 0) return;
    const photos = [...this.state.photos];
    photos[i] = {
      ...photos[i],
      features: photos[i].features.filter((f) => f.id !== featureId),
    };
    this.state = { ...this.state, photos };
    this.notify();
  }

  addDimension(dim: ManualDimension): void {
    const i = this.state.activePhotoIndex;
    if (i < 0) return;
    const photos = [...this.state.photos];
    photos[i] = { ...photos[i], dimensions: [...photos[i].dimensions, dim] };
    this.state = { ...this.state, photos };
    this.notify();
  }

  removeDimension(dimId: string): void {
    const i = this.state.activePhotoIndex;
    if (i < 0) return;
    const photos = [...this.state.photos];
    photos[i] = {
      ...photos[i],
      dimensions: photos[i].dimensions.filter((d) => d.id !== dimId),
    };
    this.state = { ...this.state, photos };
    this.notify();
  }

  setPhotoAngle(angle: ViewAngle): void {
    const i = this.state.activePhotoIndex;
    if (i < 0) return;
    const photos = [...this.state.photos];
    photos[i] = { ...photos[i], angle };
    this.state = { ...this.state, photos };
    this.notify();
  }
}

export const store = new Store();
