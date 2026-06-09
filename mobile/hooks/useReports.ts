import { useState } from 'react';
import { api } from '@/lib/api';

interface ReportRecord {
  id: number;
  status: 'pending' | 'ready' | 'failed';
  pdf_file: string | null;
}

export function useGeneratePDFReport() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  async function generateAndGetUrl(assessmentId: number): Promise<string | null> {
    setIsGenerating(true);
    setPdfError(null);
    try {
      const report = await api.post<ReportRecord>('reports/generate/', {
        assessment_id: assessmentId,
      });

      // Poll until ready (max 30 × 2s = 60s)
      for (let i = 0; i < 30; i++) {
        await new Promise<void>((resolve) => setTimeout(resolve, 2000));
        const status = await api.get<ReportRecord>(`reports/${report.id}/`);
        if (status.status === 'ready' && status.pdf_file) {
          return status.pdf_file;
        }
        if (status.status === 'failed') {
          throw new Error('Report generation failed on server');
        }
      }
      throw new Error('Report generation timed out after 60 seconds');
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : 'Could not generate report');
      return null;
    } finally {
      setIsGenerating(false);
    }
  }

  return { generateAndGetUrl, isGenerating, pdfError };
}
