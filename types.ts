export interface CaptionRow {
  id: string;
  original: string;
  rewritten: string | null;
  status: 'pending' | 'processing' | 'completed' | 'error';
  imagePath?: string;
  imageData?: string; // Data URL for preview and upload
  error?: string;
}

export interface ProcessingStats {
  total: number;
  completed: number;
  failed: number;
}

export interface AppConfig {
  apiKey: string;
  model: string;
  customRules: string; // Extracted from PDF or manually entered
  batchSize: number;
}

export interface HistorySession {
  id: string;
  timestamp: number;
  name: string;
  stats: ProcessingStats;
  data: CaptionRow[]; // Note: imageData will be stripped for storage
}