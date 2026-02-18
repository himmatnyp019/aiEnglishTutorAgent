
export enum ConnectionStatus {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR'
}

export interface TranscriptionEntry {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface AudioVisualizerProps {
  analyser: AnalyserNode | null;
  isActive: boolean;
}
