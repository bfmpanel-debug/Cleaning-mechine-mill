
export interface LogEntry {
  waktuSistem: string;
  nomorMesin: string;
  namaOperator: string;
  tanggalCleaning: string;
}

export type ViewState = 'HOME' | 'UPDATE' | 'CHECK';

export interface ApiResponse {
  status: 'success' | 'error';
  data?: LogEntry[];
  message?: string;
}
