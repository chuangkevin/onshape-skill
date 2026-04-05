// ── View angles ──
export type ViewAngle = 'top' | 'side' | 'front' | 'back' | 'close-up';

// ── Feature types ──
export type FeatureType = 'hole' | 'tab' | 'slot' | 'connector' | 'mounting-point' | 'custom';

// ── Confidence levels ──
export type Confidence = 'high' | 'medium' | 'low';

// ── Data sources ──
export type MeasurementSource = 'official_spec' | 'opencv' | 'user_drawing' | 'gemini_vision';

// ── Point ──
export interface Point {
  x: number;
  y: number;
}

// ── Scale calibration ──
export interface ScaleCalibration {
  pointA_px: Point;
  pointB_px: Point;
  distance_mm: number;
  px_per_mm: number;
}

// ── Drawing shapes ──
export interface PolylineShape {
  type: 'polyline';
  id: string;
  points_px: Point[];
  closed: boolean;
}

export interface ArcShape {
  type: 'arc';
  id: string;
  start: Point;
  mid: Point;
  end: Point;
}

export interface CircleShape {
  type: 'circle';
  id: string;
  center_px: Point;
  radius_px: number;
}

export type DrawingShape = PolylineShape | ArcShape | CircleShape;

// ── Feature annotation ──
export interface FeatureAnnotation {
  id: string;
  type: FeatureType;
  label: string;
  shape: DrawingShape;
  dimension_mm?: number;
}

// ── Manual dimension ──
export interface ManualDimension {
  id: string;
  location: string;
  value_mm: number;
  source: 'user_input' | 'gemini_ocr';
}

// ── Photo ──
export interface Photo {
  id: number;
  project_id: number;
  filename: string;
  original_path: string;
  angle: ViewAngle;
  width: number;
  height: number;
  scale?: ScaleCalibration;
  drawings: DrawingShape[];
  features: FeatureAnnotation[];
  dimensions: ManualDimension[];
  created_at: string;
}

// ── Project ──
export interface Project {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

// ── OpenCV results ──
export interface ContourResult {
  contour_px: Point[];
  contour_mm?: Point[];
  area_px: number;
  bounding_box: { x: number; y: number; width: number; height: number };
}

export interface CircleDetection {
  center_px: Point;
  radius_px: number;
  center_mm?: Point;
  radius_mm?: number;
}

export interface OpenCVResult {
  contours: ContourResult[];
  circles: CircleDetection[];
  error?: string;
}

// ── Gemini analysis results ──
export interface OCRReading {
  value: number;
  unit: string;
  location: string;
  confidence: Confidence;
}

export interface LabelInfo {
  model_number?: string;
  manufacturer?: string;
  specs_text: string[];
}

export interface OfficialSpec {
  [key: string]: number; // e.g., "length": 291, "width": 81.5
}

export interface OverlayInterpretation {
  shape_description: string;
  estimated_dimensions: Record<string, number>;
  features_identified: string[];
}

export interface AnalysisResults {
  ocr_readings: OCRReading[];
  label_info?: LabelInfo;
  official_specs?: OfficialSpec;
  overlay_interpretation?: OverlayInterpretation;
}

// ── Measurement fusion output ──
export interface FusedFeature {
  type: FeatureType;
  center_mm: Point;
  radius_mm?: number;
  points_mm?: Point[];
  label: string;
  source: MeasurementSource;
  confidence: Confidence;
}

export interface FusedView {
  image: string;
  angle: ViewAngle;
  scale_px_per_mm: number;
  contour_mm: Point[];
  features: FusedFeature[];
  source: MeasurementSource;
}

export interface CaliperReading {
  location: string;
  value_mm: number;
  source: MeasurementSource;
  confidence: Confidence;
}

export interface MeasurementJSON {
  part_name: string;
  model_number: string | null;
  official_specs: OfficialSpec;
  views: FusedView[];
  caliper_readings: CaliperReading[];
  confidence: { overall: Confidence };
}

// ── Quality gate ──
export interface QualityReport {
  overall_confidence: number;
  stage_scores: {
    contour: number;
    ocr: number;
  };
  warnings: string[];
  flagged_for_review: boolean;
}

// ── Gemini key pool ──
export interface ApiKeyStats {
  suffix: string;
  calls_today: number;
  total_tokens_today: number;
  calls_7d: number;
  calls_30d: number;
}

export interface UsageRecord {
  api_key_suffix: string;
  model: string;
  call_type: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  project_id?: number;
  created_at: string;
}
