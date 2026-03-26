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
  readOnly?: boolean;
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
    readOnly = false,
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
          min={0}
          name={name}
          placeholder={placeholder}
          value={value}
          readOnly={readOnly}
          onChange={onChange}
        />
      </div>
    </div>
  )
}

export default TextInput;
