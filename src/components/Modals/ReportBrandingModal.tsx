import React, { ChangeEvent, FC, useEffect, useState } from 'react';
import { IonIcon, IonToggle } from '@ionic/react';
import { cameraSharp, imageSharp } from 'ionicons/icons';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';

import Modal from './Modal';
import Text from '../Text';
import TextInput from '../TextInput';
import useAppData from '../../hooks/useAppData';
import type { IProjectDetail } from '../../helper/types';
import { loadReportBranding, saveReportBranding } from '../../helper/reportBranding';

export type ReportBrandingFormData = {
  report_artist: string;
  report_city: string;
  report_user: string;
  report_website_url: string;
  report_show_qr: boolean;
  logoheaderpdf: string;
};

interface ReportBrandingModalProps {
  visible: boolean;
  projectId: string;
  projectTitle?: string;
  onClose: () => void;
  onSaved?: () => void;
}

const emptyForm = (): ReportBrandingFormData => ({
  report_artist: '',
  report_city: '',
  report_user: '',
  report_website_url: '',
  report_show_qr: true,
  logoheaderpdf: '',
});

const ReportBrandingModal: FC<ReportBrandingModalProps> = (props) => {
  const { visible, projectId, projectTitle = '', onClose, onSaved } = props;
  const { t } = useTranslation();
  const { isMobile } = useAppData();
  const [form, setForm] = useState<ReportBrandingFormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || !projectId) return;
    let cancelled = false;
    void (async () => {
      const branding = await loadReportBranding(projectId, projectTitle);
      if (cancelled) return;
      setForm({
        report_artist: branding.artist,
        report_city: branding.city,
        report_user: branding.user,
        report_website_url: branding.website,
        report_show_qr: branding.showQr,
        logoheaderpdf: branding.logoDataUrl,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, projectId, projectTitle]);

  const handleChange = (field: keyof ReportBrandingFormData, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleImgLoad = async (type: 'camera' | 'gallery') => {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('skipResumeAlert', '1');
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: type === 'camera' ? CameraSource.Camera : CameraSource.Photos,
        saveToGallery: type === 'camera',
      });
      const dataUrl = image.dataUrl || (`data:image/jpeg;base64,${image.base64String || ''}`);
      if (dataUrl) handleChange('logoheaderpdf', dataUrl);
    } catch (error) {
      console.log('report branding image error: ', error);
    }
  };

  const handleSave = async () => {
    if (!projectId || saving) return;
    setSaving(true);
    try {
      const payload: Partial<IProjectDetail> = {
        report_artist: form.report_artist.trim(),
        report_city: form.report_city.trim(),
        report_user: form.report_user.trim(),
        report_website_url: form.report_website_url.trim(),
        report_show_qr: form.report_show_qr,
        logoheaderpdf: form.logoheaderpdf,
      };
      await saveReportBranding(projectId, payload);
      onSaved?.();
      onClose();
    } catch (err) {
      console.error('[ReportBrandingModal] save failed', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      header={t('Report.BrandingTitle')}
      classes={`${isMobile ? 'w-[95vw] max-w-[640px]' : 'w-[640px]'} border border-secondary rounded-md overflow-auto`}
      contentClasses="py-2 px-6 gap-3"
      footerClasses="!justify-center"
      okTitle={t('Common.Save')}
      cancelTitle={t('Common.Cancel')}
      onClose={onClose}
      onAction={() => { void handleSave(); }}
    >
      <Text label={t('Report.BrandingSubtitle')} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <TextInput
          label={t('Report.BrandingProject')}
          value={projectTitle}
          readOnly
          onChange={() => undefined}
        />
        <TextInput
          label={t('Report.BrandingArtist')}
          value={form.report_artist}
          onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange('report_artist', e.target.value)}
        />
        <TextInput
          label={t('Report.BrandingCity')}
          value={form.report_city}
          onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange('report_city', e.target.value)}
        />
        <TextInput
          label={t('Report.BrandingUser')}
          value={form.report_user}
          onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange('report_user', e.target.value)}
        />
        <TextInput
          classes="md:col-span-2"
          label={t('Report.BrandingWebsite')}
          value={form.report_website_url}
          onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange('report_website_url', e.target.value)}
          placeholder="https://example.com"
        />
      </div>

      <div className="flex items-center justify-between gap-3 py-1">
        <Text label={t('Report.BrandingShowQr')} />
        <IonToggle
          checked={form.report_show_qr}
          onIonChange={(e) => handleChange('report_show_qr', e.detail.checked)}
        />
      </div>

      <div>
        <Text label={t('Report.BrandingLogo')} />
        <div className="flex flex-row items-center gap-2 w-full mt-1">
          <IonIcon
            src={imageSharp}
            color="primary"
            className="text-3xl rounded cursor-pointer"
            onClick={() => { void handleImgLoad('gallery'); }}
          />
          <IonIcon
            src={cameraSharp}
            color="primary"
            className="text-4xl rounded cursor-pointer"
            onClick={() => { void handleImgLoad('camera'); }}
          />
          {form.logoheaderpdf ? (
            <button
              type="button"
              className="text-sm text-danger underline ml-2"
              onClick={() => handleChange('logoheaderpdf', '')}
            >
              {t('Common.Clear')}
            </button>
          ) : null}
        </div>
        {form.logoheaderpdf ? (
          <div className="min-h-[120px] w-full flex items-center justify-center bg-black/5 rounded overflow-hidden mt-2">
            <img
              src={form.logoheaderpdf.startsWith('data:') ? form.logoheaderpdf : Capacitor.convertFileSrc(form.logoheaderpdf)}
              alt=""
              className="max-w-full max-h-[160px] w-auto h-auto object-contain"
            />
          </div>
        ) : null}
      </div>
    </Modal>
  );
};

export default ReportBrandingModal;
