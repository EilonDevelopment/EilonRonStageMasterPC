import { jsPDF } from 'jspdf';

import type { ReportBranding, ReportBrandingLabels } from './reportBranding';
import {
  buildReportRangeLabel,
  drawReportPdfBrandingFooters,
  drawReportPdfBrandingHeader,
} from './reportBranding';

export type ReportPdfExportRow = {
  Name: string;
  ID: string;
  Status: string;
  Gross: string;
  Net: string;
  Battery: string;
  Time: string;
};

type StatusMeta = { textColor: string };

export async function buildReportLogsPdfDocument(options: {
  rows: ReportPdfExportRow[];
  branding: ReportBranding;
  labels: ReportBrandingLabels & { battery: string; time: string };
  isSingleDayRange: boolean;
  filterStart: Date;
  filterEnd: Date;
  hourStart: string;
  hourEnd: string;
  truncatedNote?: string;
  getStatusMeta: (status: string) => StatusMeta;
}): Promise<jsPDF> {
  const {
    rows,
    branding,
    labels,
    isSingleDayRange,
    filterStart,
    filterEnd,
    hourStart,
    hourEnd,
    truncatedNote,
    getStatusMeta,
  } = options;

  const doc = new jsPDF('p', 'mm', 'a4');
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 10;
  const colWidths = [30, 16, 22, 22, 22, 16, 42];
  const rowHeight = 10;
  const rangeLabel = buildReportRangeLabel(isSingleDayRange, filterStart, filterEnd, hourStart, hourEnd);
  const { headerBottomY } = await drawReportPdfBrandingHeader(doc, branding, labels, rangeLabel, margin);
  let y = headerBottomY;

  const headers = ['Name', 'ID', 'Status', 'Gross', 'Net', labels.battery, labels.time];

  const drawTableHeader = () => {
    doc.setFontSize(8);
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, y, pageW - 2 * margin, rowHeight, 'F');
    headers.forEach((h, i) => {
      doc.text(h, margin + (i === 0 ? 2 : colWidths.slice(0, i).reduce((a, b) => a + b, 0) + 2), y + 5);
    });
    doc.setDrawColor(200, 200, 200);
    let colX = margin;
    colWidths.forEach((w) => {
      doc.line(colX, y, colX, y + rowHeight);
      colX += w;
    });
    doc.line(margin, y + rowHeight, pageW - margin, y + rowHeight);
    y += rowHeight;
  };

  drawTableHeader();
  const maxY = doc.internal.pageSize.getHeight() - margin - 8;

  for (let i = 0; i < rows.length; i += 1) {
    if (y + rowHeight > maxY) {
      doc.addPage();
      y = margin;
      drawTableHeader();
    }
    const r = rows[i];
    const row = [
      [r.Name.slice(0, 14)],
      [r.ID.slice(0, 9)],
      [r.Status.slice(0, 12)],
      String(r.Gross || '').split('\n').map((s) => s.slice(0, 18)),
      String(r.Net || '').split('\n').map((s) => s.slice(0, 18)),
      [r.Battery.slice(0, 7)],
      [r.Time.slice(0, 19)],
    ];
    row.forEach((cellLines, ii) => {
      const x = margin + colWidths.slice(0, ii).reduce((a, b) => a + b, 0) + 2;
      if (ii === 2) {
        const meta = getStatusMeta(r.Status);
        doc.setTextColor(meta.textColor);
        doc.text(cellLines, x, y + 4);
        doc.setTextColor(0, 0, 0);
      } else {
        doc.text(cellLines, x, y + 4);
      }
    });
    let colX = margin;
    colWidths.forEach((w) => {
      doc.line(colX, y, colX, y + rowHeight);
      colX += w;
    });
    doc.line(margin, y + rowHeight, pageW - margin, y + rowHeight);
    y += rowHeight;
  }

  if (truncatedNote) {
    y += 6;
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(truncatedNote, margin, y);
    doc.setTextColor(0, 0, 0);
  }

  drawReportPdfBrandingFooters(doc, branding, labels.generated, margin);
  return doc;
}
