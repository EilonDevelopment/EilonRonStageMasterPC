import React, { FC } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { NumericKeypadVariant } from '../helper/numericFieldInput';
import { applyNumericKeypadKey } from '../helper/numericFieldInput';

type Props = {
  open: boolean;
  title: string;
  value: string;
  variant: NumericKeypadVariant;
  onChange: (next: string) => void;
  onDone: () => void;
  onCancel: () => void;
};

const KEY_CLASS =
  'min-h-[48px] rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-lg font-semibold text-slate-900 dark:text-slate-100 active:opacity-80 shadow-sm';

const DONE_KEY_CLASS = `${KEY_CLASS} dark:bg-primary dark:text-white dark:border-primary`;

const NumericKeypadOverlay: FC<Props> = ({ open, title, value, variant, onChange, onDone, onCancel }) => {
  const { t } = useTranslation();

  if (!open || typeof document === 'undefined') return null;

  const press = (key: string) => {
    if (key === 'done') {
      onDone();
      return;
    }
    onChange(applyNumericKeypadKey(value, key, variant));
  };

  const isLcIds = variant === 'lc-ids';
  const isDigitsComma = variant === 'digits-comma';
  const showDecimalKeys = variant !== 'digits' && variant !== 'lc-ids' && variant !== 'digits-comma';
  const showMinus = variant === 'signed-decimal';

  const portal = (
    <div
      className="fixed inset-0 z-[100000] flex flex-col justify-end bg-black/40"
      role="presentation"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="rounded-t-2xl bg-white dark:bg-slate-900 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl border-t border-slate-200 dark:border-slate-700 max-h-[55vh]"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 mb-2 px-1">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{title}</span>
          <button type="button" className="text-xs font-medium text-primary px-2 py-1" onClick={() => onCancel()}>
            {t('Common.Cancel')}
          </button>
        </div>
        <div className="mb-2 min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-right text-xl font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums break-all">
          {value === '' ? <span className="text-slate-400">…</span> : value}
        </div>
        <div className="grid grid-cols-4 gap-2">
          <button type="button" className={`${KEY_CLASS} col-span-1`} onClick={() => press('7')}>
            7
          </button>
          <button type="button" className={KEY_CLASS} onClick={() => press('8')}>
            8
          </button>
          <button type="button" className={KEY_CLASS} onClick={() => press('9')}>
            9
          </button>
          <button type="button" className={`${KEY_CLASS} text-red-600 dark:text-red-400`} onClick={() => press('bksp')}>
            ⌫
          </button>

          <button type="button" className={KEY_CLASS} onClick={() => press('4')}>
            4
          </button>
          <button type="button" className={KEY_CLASS} onClick={() => press('5')}>
            5
          </button>
          <button type="button" className={KEY_CLASS} onClick={() => press('6')}>
            6
          </button>
          <button type="button" className={`${KEY_CLASS} text-amber-700 dark:text-amber-400`} onClick={() => press('clear')}>
            C
          </button>

          <button type="button" className={KEY_CLASS} onClick={() => press('1')}>
            1
          </button>
          <button type="button" className={KEY_CLASS} onClick={() => press('2')}>
            2
          </button>
          <button type="button" className={KEY_CLASS} onClick={() => press('3')}>
            3
          </button>
          {showMinus ? (
            <button type="button" className={KEY_CLASS} onClick={() => press('-')}>
              −
            </button>
          ) : (
            <span className="min-h-[48px]" aria-hidden />
          )}

          <button type="button" className={KEY_CLASS} onClick={() => press('0')}>
            0
          </button>
          {isLcIds ? (
            <>
              <button type="button" className={KEY_CLASS} onClick={() => press(',')}>
                ,
              </button>
              <button type="button" className={KEY_CLASS} onClick={() => press('-')}>
                -
              </button>
              <button
                type="button"
                className={DONE_KEY_CLASS}
                onClick={() => press('done')}
              >
                {t('Common.Okay')}
              </button>
            </>
          ) : isDigitsComma ? (
            <>
              <button type="button" className={KEY_CLASS} onClick={() => press(',')}>
                ,
              </button>
              <span className="min-h-[48px]" aria-hidden />
              <button
                type="button"
                className={DONE_KEY_CLASS}
                onClick={() => press('done')}
              >
                {t('Common.Okay')}
              </button>
            </>
          ) : showDecimalKeys ? (
            <>
              <button type="button" className={KEY_CLASS} onClick={() => press('.')}>
                .
              </button>
              <button type="button" className={KEY_CLASS} onClick={() => press(',')}>
                ,
              </button>
              <button
                type="button"
                className={DONE_KEY_CLASS}
                onClick={() => press('done')}
              >
                {t('Common.Okay')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={`${DONE_KEY_CLASS} col-span-3`}
              onClick={() => press('done')}
            >
              {t('Common.Okay')}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(portal, document.body);
};

export default NumericKeypadOverlay;
