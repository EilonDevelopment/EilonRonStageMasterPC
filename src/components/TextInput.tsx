import React, { FC, LegacyRef } from 'react';
import Text from './Text';

interface TextInputProps {
  classes?: string;
  inputRef?: React.RefObject<HTMLInputElement>;
  labelClasses?: string;
  inputContainerClasses?: string;
  inputClasses?: string;
  name?: string;
  label?: string;
  direction?: 'col' | 'row';
  enableLabel?: boolean;
  placeholder?: string;
  value: string | number;
  type?: string;
  /** Mobile keypad hint (e.g. `decimal` for numeric + minus/decimal). */
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  min?: string | number;
  max?: string | number;
  step?: string | number;
  pattern?: string;
  autoComplete?: string;
  autoCorrect?: 'on' | 'off';
  autoCapitalize?: 'off' | 'none' | 'sentences' | 'words' | 'characters';
  spellCheck?: boolean;
  enterKeyHint?: React.HTMLAttributes<HTMLInputElement>['enterKeyHint'];
  readOnly?: boolean;
  onBeforeInput?: React.FormEventHandler<HTMLInputElement>;
  // eslint-disable-next-line
  sub?: any;
  error?: boolean;
  // eslint-disable-next-line
  onChange?: (e: any) => void;
}

const TextInput: FC<TextInputProps> = props => {
  const {
    classes='',
    inputRef,
    labelClasses='',
    inputClasses='',
    inputContainerClasses='',
    name = '',
    label = '',
    direction = 'col',
    enableLabel = true,
    placeholder = '',
    value,
    type = 'text',
    inputMode,
    min,
    max,
    step,
    pattern,
    autoComplete,
    autoCorrect,
    autoCapitalize,
    spellCheck,
    enterKeyHint,
    readOnly = false,
    onBeforeInput,
    sub = null,
    error = false,
    // eslint-disable-next-line
    onChange = () => {},
  } = props;

  return (
    <div className={`gap-3 ${direction === 'col' ? 'flex flex-col' : 'grid grid-cols-3 items-center'} ${classes}`}>
      {enableLabel && <Text type='dark' classes={`${labelClasses} ${direction === 'row' && 'text-right'}`} label={label} />}
      <div className={`flex flex-row justify-between border border-medium ${direction === 'row' && 'col-span-2'} ${error ? 'border-red-500' : 'border-gray2'} px-3 py-1.5 ${inputContainerClasses}`}>
        {sub}
        <input
          className={`outline-none bg-transparent text-dark dark:text-light flex-1 w-full ${inputClasses}`}
          ref={inputRef}
          type={type}
          {...(inputMode != null ? { inputMode } : {})}
          {...(min !== undefined ? { min } : {})}
          {...(max !== undefined ? { max } : {})}
          {...(step !== undefined ? { step } : {})}
          {...(pattern !== undefined ? { pattern } : {})}
          {...(autoComplete !== undefined ? { autoComplete } : {})}
          {...(autoCorrect !== undefined ? { autoCorrect } : {})}
          {...(autoCapitalize !== undefined ? { autoCapitalize } : {})}
          {...(spellCheck !== undefined ? { spellCheck } : {})}
          {...(enterKeyHint !== undefined ? { enterKeyHint } : {})}
          name={name}
          placeholder={placeholder}
          value={value}
          readOnly={readOnly}
          onBeforeInput={onBeforeInput}
          onChange={onChange}
        />
      </div>
    </div>
  )
}

export default TextInput;
