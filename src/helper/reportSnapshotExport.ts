import { format } from 'date-fns';
import { jsPDF } from 'jspdf';

import type { ReportBranding, ReportBrandingLabels } from './reportBranding';
import {
  buildCsvBrandingLines,
  drawReportPdfBrandingFooters,
  drawReportPdfBrandingHeader,
} from './reportBranding';

export type SnapshotExportRow = {
  rowNum: string | number;
  inTotalSum: boolean;
  Name: string;
  ID: string;
  Status: string;
  Gross: string;
  Net: string;
  Battery: string;
  Time: string;
};

export type SnapshotGroupExport = {
  id: string;
  title: string;
  total: string;
  alerts: Record<string, number>;
  rows: SnapshotExportRow[];
};

export type SnapshotMeta = {
  generatedAt: Date;
  prrId: string;
  prrStatus: string;
  batteryStr: string;
  totalSumDual: string;
  totalSumLegend: string;
};

export function buildMonitorSnapshotCsv(options: {
  branding: ReportBranding;
  labels: ReportBrandingLabels;
  meta: SnapshotMeta;
  rows: SnapshotExportRow[];
  groupRows: SnapshotGroupExport[];
}): string {
  const { branding, labels, meta, rows, groupRows } = options;
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const generatedLabel = format(meta.generatedAt, 'yyyy-MM-dd HH:mm:ss');
  const preamble = buildCsvBrandingLines(branding, labels, generatedLabel);
  const lines: string[] = [...preamble];
  lines.push(`PRR,${esc(meta.prrId)},${esc(meta.prrStatus)},Battery,${esc(meta.batteryStr)}`);
  lines.push(`Total Sum,${esc(meta.totalSumDual)}`);
  if (meta.totalSumLegend) lines.push(esc(meta.totalSumLegend));
  lines.push('');
  lines.push('#,Name,ID,Status,Gross,Net,Battery,Time');
  rows.forEach((r) => {
    lines.push([r.rowNum, r.Name, r.ID, r.Status, r.Gross, r.Net, r.Battery, r.Time].map(esc).join(','));
  });
  groupRows.forEach((g) => {
    lines.push('');
    lines.push(`Group ${esc(g.id)} - ${esc(g.title)},Total Weight,${esc(g.total)},Alerts,${esc(JSON.stringify(g.alerts))}`);
    lines.push('#,Name,ID,Status,Gross,Net,Battery,Time');
    g.rows.forEach((r) => {
      lines.push([r.rowNum, r.Name, r.ID, r.Status, r.Gross, r.Net, r.Battery, r.Time].map(esc).join(','));
    });
  });
  return lines.join('\r\n');
}

export async function buildMonitorSnapshotPdfDocument(options: {
  branding: ReportBranding;
  labels: ReportBrandingLabels;
  meta: SnapshotMeta;
  rows: SnapshotExportRow[];
  groupRows: SnapshotGroupExport[];
}): Promise<jsPDF> {
  const { branding, labels, meta, rows, groupRows } = options;
  const doc = new jsPDF('p', 'mm', 'a4');
  const margin = 12;
  const pageW = doc.internal.pageSize.getWidth();
  const generatedLabel = format(meta.generatedAt, 'yyyy-MM-dd HH:mm:ss');
  const extraLines = [
    `PRR: ${meta.prrId} | Status: ${meta.prrStatus} | Battery: ${meta.batteryStr}`,
    `Total Sum: ${meta.totalSumDual}`,
    ...(meta.totalSumLegend ? [meta.totalSumLegend] : []),
  ];

  const { headerBottomY } = await drawReportPdfBrandingHeader(
    doc,
    branding,
    labels,
    generatedLabel,
    margin,
    { extraLines },
  );

  const headers = ['#', 'Name', 'ID', 'Status', 'Gross', 'Net', 'Battery', 'Time'];
  const colWidths = [9, 26, 14, 19, 26, 26, 14, 36];
  const rowHeight = 10;
  let y = headerBottomY;
  const maxY = doc.internal.pageSize.getHeight() - margin - 8;

  const ensureSpace = (needed = rowHeight) => {
    if (y + needed <= maxY) return;
    doc.addPage();
    y = margin;
  };

  const drawTableHeader = () => {
    doc.setFontSize(8);
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, pageW - margin * 2, rowHeight, 'F');
    headers.forEach((h, i) => {
      doc.text(h, margin + (i === 0 ? 2 : colWidths.slice(0, i).reduce((a, b) => a + b, 0) + 2), y + 5);
    });
    y += rowHeight;
  };

  const drawSnapshotDataRow = (r: SnapshotExportRow) => {
    ensureSpace(rowHeight);
    if (r.inTotalSum) {
      doc.setFillColor(245, 248, 252);
      doc.rect(margin, y, pageW - margin * 2, rowHeight, 'F');
    }
    const row = [
      [String(r.rowNum).slice(0, 6)],
      [String(r.Name).slice(0, 22)],
      [String(r.ID).slice(0, 22)],
      [String(r.Status).slice(0, 22)],
      String(r.Gross || '').split('\n').map((s) => s.slice(0, 22)),
      String(r.Net || '').split('\n').map((s) => s.slice(0, 22)),
      [String(r.Battery).slice(0, 22)],
      [String(r.Time).slice(0, 22)],
    ];
    doc.setTextColor(0, 0, 0);
    row.forEach((cellLines, ii) => {
      const x = margin + colWidths.slice(0, ii).reduce((a, b) => a + b, 0) + 2;
      doc.text(cellLines, x, y + 4);
    });
    y += rowHeight;
  };

  ensureSpace(rowHeight);
  drawTableHeader();
  rows.forEach((r) => drawSnapshotDataRow(r));

  groupRows.forEach((g) => {
    const totalLines = String(g.total).split('\n');
    const headerBlockH = 10 + totalLines.length * 4;
    ensureSpace(headerBlockH + rowHeight);
    y += 6;
    const alertLabel = `OK:${g.alerts.OK || 0} U:${g.alerts.UNDERLOAD || 0} O:${g.alerts.OVERLOAD || 0} D:${g.alerts.DANGER || 0} E:${g.alerts['TR.ERR'] || 0}`;
    doc.setFontSize(9);
    doc.text(`Group ${g.id} - ${g.title}`, margin, y);
    y += 4;
    doc.text('Total Weight:', margin, y);
    if (g.total === 'Tr.Err') {
      doc.text('Tr.Err', margin + 26, y);
      y += 4;
    } else {
      totalLines.forEach((line) => {
        doc.text(line, margin + 26, y);
        y += 4;
      });
    }
    doc.text(alertLabel, margin, y);
    y += 5;
    doc.setFontSize(8);
    ensureSpace(rowHeight);
    drawTableHeader();
    g.rows.forEach((r) => drawSnapshotDataRow(r));
    y += 2;
  });

  drawReportPdfBrandingFooters(doc, branding, labels.generated, margin);
  return doc;
}
