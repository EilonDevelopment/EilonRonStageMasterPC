import { format } from 'date-fns';
import type { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

import { db } from '../db';
import { normalizeProjectId } from './functions';
import type { IProjectDetail } from './types';

export type ReportBranding = {
  projectTitle: string;
  artist: string;
  city: string;
  user: string;
  website: string;
  logoDataUrl: string;
  showQr: boolean;
};

export type ReportBrandingLabels = {
  reportTitle: string;
  project: string;
  artist: string;
  city: string;
  user: string;
  website: string;
  range: string;
  generated: string;
};

const emptyBranding = (projectTitle = ''): ReportBranding => ({
  projectTitle,
  artist: '',
  city: '',
  user: '',
  website: '',
  logoDataUrl: '',
  showQr: true,
});

export async function loadReportBranding(
  projectIdRaw: string | number | undefined,
  projectTitle = '',
): Promise<ReportBranding> {
  const pid = normalizeProjectId(projectIdRaw);
  if (!pid) return emptyBranding(projectTitle);
  try {
    const row = (await db.project_details.where('project_id').equals(pid).first()) as IProjectDetail | undefined;
    if (!row) return emptyBranding(projectTitle);
    return {
      projectTitle,
      artist: String(row.report_artist ?? '').trim(),
      city: String(row.report_city ?? '').trim(),
      user: String(row.report_user ?? '').trim(),
      website: String(row.report_website_url ?? '').trim(),
      logoDataUrl: String(row.logoheaderpdf ?? '').trim(),
      showQr: row.report_show_qr !== false,
    };
  } catch {
    return emptyBranding(projectTitle);
  }
}

export async function saveReportBranding(
  projectIdRaw: string | number | undefined,
  patch: Partial<IProjectDetail>,
): Promise<void> {
  const pid = normalizeProjectId(projectIdRaw);
  if (!pid) return;
  const existing = (await db.project_details.where('project_id').equals(pid).first()) as IProjectDetail | undefined;
  const payload: IProjectDetail = {
    project_id: pid,
    ...patch,
  };
  if (existing?.id != null) {
    await db.project_details.update(existing.id, payload);
  } else {
    await db.project_details.add(payload);
  }
}

function imageFormatFromDataUrl(url: string): 'JPEG' | 'PNG' {
  return url.startsWith('data:image/png') ? 'PNG' : 'JPEG';
}

export async function createReportQrDataUrl(website: string): Promise<string | null> {
  const url = String(website ?? '').trim();
  if (!url) return null;
  try {
    return await QRCode.toDataURL(url, { margin: 1, width: 180, errorCorrectionLevel: 'M' });
  } catch {
    return null;
  }
}

export function buildReportRangeLabel(
  isSingleDayRange: boolean,
  start: Date,
  end: Date,
  hourStart: string,
  hourEnd: string,
): string {
  if (isSingleDayRange) {
    return `${format(start, 'yyyy-MM-dd')} ${hourStart}-${hourEnd}`;
  }
  return `${format(start, 'yyyy-MM-dd')} → ${format(end, 'yyyy-MM-dd')}`;
}

export function buildCsvBrandingLines(
  branding: ReportBranding,
  labels: ReportBrandingLabels,
  rangeLabel: string,
): string[] {
  const escapeCsv = (v: unknown) => {
    const s = v == null ? '' : String(v);
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines: string[] = [
    `# ${labels.reportTitle}`,
    `${escapeCsv(labels.project)},${escapeCsv(branding.projectTitle)}`,
  ];
  if (branding.artist) lines.push(`${escapeCsv(labels.artist)},${escapeCsv(branding.artist)}`);
  if (branding.city) lines.push(`${escapeCsv(labels.city)},${escapeCsv(branding.city)}`);
  if (branding.user) lines.push(`${escapeCsv(labels.user)},${escapeCsv(branding.user)}`);
  if (branding.website) lines.push(`${escapeCsv(labels.website)},${escapeCsv(branding.website)}`);
  lines.push(`${escapeCsv(labels.range)},${escapeCsv(rangeLabel)}`);
  lines.push(`${escapeCsv(labels.generated)},${escapeCsv(format(new Date(), 'yyyy-MM-dd HH:mm'))}`);
  lines.push('');
  return lines;
}

export type DrawPdfBrandingResult = {
  startY: number;
  headerBottomY: number;
  qrDataUrl: string | null;
};

export async function drawReportPdfBrandingHeader(
  doc: jsPDF,
  branding: ReportBranding,
  labels: ReportBrandingLabels,
  rangeLabel: string,
  margin = 10,
): Promise<DrawPdfBrandingResult> {
  const pageW = doc.internal.pageSize.getWidth();
  let y = margin;
  const textX = margin + (branding.logoDataUrl ? 48 : 0);
  const qrSize = 22;
  const qrX = pageW - margin - qrSize;
  let qrDataUrl: string | null = null;

  if (branding.logoDataUrl) {
    try {
      doc.addImage(
        branding.logoDataUrl,
        imageFormatFromDataUrl(branding.logoDataUrl),
        margin,
        y,
        42,
        18,
        undefined,
        'FAST',
      );
    } catch {
      /* ignore invalid logo data */
    }
  }

  if (branding.showQr && branding.website) {
    qrDataUrl = await createReportQrDataUrl(branding.website);
    if (qrDataUrl) {
      try {
        doc.addImage(qrDataUrl, 'PNG', qrX, y, qrSize, qrSize, undefined, 'FAST');
      } catch {
        qrDataUrl = null;
      }
    }
  }

  doc.setFontSize(14);
  doc.text(labels.reportTitle, textX, y + 5);
  y += 10;
  doc.setFontSize(10);

  const metaLines: string[] = [];
  if (branding.projectTitle) metaLines.push(`${labels.project}: ${branding.projectTitle}`);
  if (branding.artist) metaLines.push(`${labels.artist}: ${branding.artist}`);
  if (branding.city) metaLines.push(`${labels.city}: ${branding.city}`);
  if (branding.user) metaLines.push(`${labels.user}: ${branding.user}`);
  if (branding.website) metaLines.push(`${labels.website}: ${branding.website}`);
  metaLines.push(`${labels.range}: ${rangeLabel}`);

  const maxTextWidth = pageW - textX - margin - (qrDataUrl ? qrSize + 4 : 0);
  metaLines.forEach((line) => {
    const wrapped = doc.splitTextToSize(line, Math.max(40, maxTextWidth));
    doc.text(wrapped, textX, y);
    y += wrapped.length * 5;
  });

  const headerBottomY = Math.max(y + 4, margin + (branding.logoDataUrl || qrDataUrl ? 22 : 0));
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, headerBottomY, pageW - margin, headerBottomY);

  return { startY: margin, headerBottomY: headerBottomY + 6, qrDataUrl };
}

export function drawReportPdfBrandingFooters(
  doc: jsPDF,
  branding: ReportBranding,
  generatedLabel: string,
  margin = 10,
): void {
  const pageCount = doc.getNumberOfPages();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const generatedAt = format(new Date(), 'yyyy-MM-dd HH:mm');
  const footerLeft = branding.website
    ? branding.website
    : branding.projectTitle || '';
  const footerRight = `${generatedLabel}: ${generatedAt}`;

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    const y = pageH - margin / 2;
    if (footerLeft) doc.text(footerLeft, margin, y);
    doc.text(footerRight, pageW - margin, y, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }
}
