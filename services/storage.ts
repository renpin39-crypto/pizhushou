import { CaptionRow, HistorySession, ProcessingStats } from '../types';
import { v4 as uuidv4 } from 'uuid';

const STORAGE_KEY = 'caption_rewriter_history';

// Helper to strip large image data to prevent LocalStorage quota exceeded errors
const stripImageData = (data: CaptionRow[]): CaptionRow[] => {
  return data.map(row => ({
    ...row,
    imageData: undefined // Remove base64 data
  }));
};

export const saveSession = (data: CaptionRow[], stats: ProcessingStats): HistorySession => {
  try {
    const sessions = getSessions();
    
    const newSession: HistorySession = {
      id: uuidv4(),
      timestamp: Date.now(),
      name: `Session ${new Date().toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
      stats,
      data: stripImageData(data)
    };

    // Keep only last 20 sessions to be safe
    const updatedSessions = [newSession, ...sessions].slice(0, 20);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSessions));
    
    return newSession;
  } catch (error) {
    console.error("Failed to save history:", error);
    throw new Error("保存历史记录失败，可能是存储空间已满。");
  }
};

export const getSessions = (): HistorySession[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error("Failed to load history:", error);
    return [];
  }
};

export const deleteSession = (id: string): HistorySession[] => {
  const sessions = getSessions().filter(s => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  return sessions;
};
