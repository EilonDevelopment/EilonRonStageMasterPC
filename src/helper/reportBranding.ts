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
  logo: string;
  logoCsvNote: string;
  range: string;
  generated: string;
};

/** Shared i18n labels for PDF/CSV branding (Reports + Monitor snapshot). */
export function resolveReportBrandingLabels(
  t: (key: string) => string,
  reportTitle: string,
): ReportBrandingLabels {
  const tr = (key: string, fallback: string) => {
    const value = t(key);
    return !value || value === key ? fallback : value;
  };
  return {
    reportTitle,
    project: tr('Report.BrandingProject', 'Project'),
    artist: tr('Report.BrandingArtist', 'Artist'),
    city: tr('Report.BrandingCity', 'City'),
    user: tr('Report.BrandingUser', 'User'),
    website: tr('Report.BrandingWebsite', 'Website'),
    logo: tr('Report.BrandingLogo', 'Logo'),
    logoCsvNote: tr('Report.BrandingLogoCsvNote', 'Included in PDF export only'),
    range: tr('Report.BrandingRange', 'Range'),
    generated: tr('Report.BrandingGenerated', 'Generated'),
  };
}

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

/** Normalize user-entered website into a clickable http(s) URL, or null when invalid. */
export function normalizeReportWebsiteUrl(raw: string): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  try {
    const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname) return null;
    return u.toString();
  } catch {
    return null;
  }
}

type PdfMetaField = {
  label: string;
  value: string;
  href?: string | null;
};

function drawPdfLabeledField(
  doc: jsPDF,
  x: number,
  y: number,
  field: PdfMetaField,
  maxWidth: number,
  lineH: number,
): number {
  const prefix = `${field.label}: `;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text(prefix, x, y);
  const prefixW = doc.getTextWidth(prefix);
  const valueX = x + prefixW;
  const valueMaxW = Math.max(12, maxWidth - prefixW);
  const valueLines = doc.splitTextToSize(field.value, valueMaxW);
  const href = field.href ?? null;

  if (href) {
    doc.setTextColor(37, 99, 235);
    valueLines.forEach((line: string, idx: number) => {
      doc.textWithLink(line, valueX, y + idx * lineH, { url: href });
    });
  } else {
    doc.text(valueLines, valueX, y);
  }

  return valueLines.length * lineH;
}

export async function createReportQrDataUrl(website: string): Promise<string | null> {
  const url = normalizeReportWebsiteUrl(website) ?? String(website ?? '').trim();
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
  if (branding.logoDataUrl) {
    lines.push(`${escapeCsv(labels.logo)},${escapeCsv(labels.logoCsvNote)}`);
  }
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

export type DrawReportPdfBrandingOptions = {
  extraLines?: string[];
};

export async function drawReportPdfBrandingHeader(
  doc: jsPDF,
  branding: ReportBranding,
  labels: ReportBrandingLabels,
  rangeLabel: string,
  margin = 12,
  options?: DrawReportPdfBrandingOptions,
): Promise<DrawPdfBrandingResult> {
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - margin * 2;
  const headerTop = margin;
  const logoW = 38;
  const logoH = 16;
  const qrSize = 24;
  const qrX = pageW - margin - qrSize;
  const hasLogo = !!branding.logoDataUrl;
  const textLeft = hasLogo ? margin + logoW + 5 : margin;
  const textRight = qrX - 4;
  const textWidth = Math.max(70, textRight - textLeft);
  const colMid = textLeft + textWidth * 0.52;
  const lineH = 4.6;
  let qrDataUrl: string | null = null;

  if (branding.showQr && branding.website) {
    qrDataUrl = await createReportQrDataUrl(branding.website);
  }

  const websiteHref = normalizeReportWebsiteUrl(branding.website);
  const leftFields: PdfMetaField[] = [];
  const rightFields: PdfMetaField[] = [];
  if (branding.projectTitle) leftFields.push({ label: labels.project, value: branding.projectTitle });
  if (branding.artist) leftFields.push({ label: labels.artist, value: branding.artist });
  if (branding.city) leftFields.push({ label: labels.city, value: branding.city });
  if (branding.user) rightFields.push({ label: labels.user, value: branding.user });
  if (branding.website) {
    rightFields.push({
      label: labels.website,
      value: branding.website,
      href: websiteHref,
    });
  }
  rightFields.push({ label: labels.range, value: rangeLabel });

  const metaRows = Math.max(leftFields.length, rightFields.length);
  const extraCount = options?.extraLines?.length ?? 0;
  const headerBlockH = Math.max(
    logoH,
    qrDataUrl ? qrSize : 0,
    14 + metaRows * lineH + extraCount * lineH + 6,
  );

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.roundedRect(margin, headerTop - 1, contentW, headerBlockH, 2, 2, 'FD');

  if (hasLogo) {
    try {
      doc.addImage(
        branding.logoDataUrl,
        imageFormatFromDataUrl(branding.logoDataUrl),
        margin + 3,
        headerTop + 2,
        logoW,
        logoH,
        undefined,
        'FAST',
      );
    } catch {
      /* ignore invalid logo data */
    }
  }

  if (qrDataUrl) {
    try {
      doc.addImage(qrDataUrl, 'PNG', qrX, headerTop + 2, qrSize, qrSize, undefined, 'FAST');
      const qrHref = normalizeReportWebsiteUrl(branding.website);
      if (qrHref) {
        doc.link(qrX, headerTop + 2, qrX + qrSize, headerTop + 2 + qrSize, { url: qrHref });
      }
    } catch {
      qrDataUrl = null;
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(30, 41, 59);
  doc.text(labels.reportTitle, textLeft, headerTop + 7);
  doc.setFont('helvetica', 'normal');

  let yMeta = headerTop + 13;

  for (let i = 0; i < metaRows; i += 1) {
    const rowY = yMeta;
    let rowH = lineH;
    if (leftFields[i]) {
      const h = drawPdfLabeledField(doc, textLeft, rowY, leftFields[i], colMid - textLeft - 2, lineH);
      rowH = Math.max(rowH, h);
    }
    if (rightFields[i]) {
      const h = drawPdfLabeledField(doc, colMid, rowY, rightFields[i], textRight - colMid, lineH);
      rowH = Math.max(rowH, h);
    }
    yMeta += rowH;
  }

  yMeta += 2;
  if (options?.extraLines?.length) {
    options.extraLines.forEach((line) => {
      const wrapped = doc.splitTextToSize(line, contentW - 6);
      doc.text(wrapped, margin + 3, yMeta);
      yMeta += wrapped.length * lineH;
    });
  }

  const headerBottomY = headerTop + headerBlockH;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.35);
  doc.line(margin, headerBottomY + 1, pageW - margin, headerBottomY + 1);
  doc.setTextColor(0, 0, 0);

  return { startY: headerTop, headerBottomY: headerBottomY + 6, qrDataUrl };
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
  const websiteHref = normalizeReportWebsiteUrl(branding.website);
  const footerLeft = branding.website ? branding.website : branding.projectTitle || '';
  const footerRight = `${generatedLabel}: ${generatedAt}`;

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    const y = pageH - margin / 2;
    if (footerLeft) {
      if (websiteHref && footerLeft === branding.website) {
        doc.setTextColor(37, 99, 235);
        doc.textWithLink(footerLeft, margin, y, { url: websiteHref });
      } else {
        doc.setTextColor(100, 100, 100);
        doc.text(footerLeft, margin, y);
      }
    }
    doc.setTextColor(100, 100, 100);
    doc.text(footerRight, pageW - margin, y, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }
}
