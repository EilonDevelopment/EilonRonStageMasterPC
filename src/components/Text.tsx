import React, { FC } from 'react';

interface TextProps {
  label: string;
  type?: 'normal' | 'dark' | 'white' | 'xs-white' | 'xs-dark' | 'sm-white' | 'sm-dark' | 'lg-white' | 'xl-white' | '2xl-white' | 'lg-dark' | 'xl-dark' | '2xl-dark';
  classes?: string;
}

const Text: FC<TextProps> = props => {
  const { label, type = '', classes = '' } = props;

  const textStyle = () => {
    switch (type) {
      case '2xl-dark':
        return 'text-dark dark:text-light text-2xl'
      case '2xl-white':
        return 'text-white dark:text-dark text-2xl'
      case 'xl-dark':
        return 'text-dark dark:text-light text-xl'
      case 'xl-white':
        return 'text-white dark:text-dark text-xl'
      case 'lg-white':
        return 'text-white dark:text-dark text-lg'
      case 'lg-dark':
        return 'text-dark dark:text-light text-lg'
      case 'sm-white':
        return 'text-white dark:text-dark text-sm'
      case 'sm-dark':
        return 'text-dark dark:text-light text-sm'
      case 'xs-white':
        return 'text-white dark:text-dark text-xs'
      case 'xs-dark':
        return 'text-dark dark:text-light text-xs'
      case 'white':
        return 'text-white dark:text-dark text-base'
      default:
        return 'text-dark dark:text-light text-base'
    }
  }

  return (
    <span className={`${textStyle()} ${classes}`}>
      {label}
    </span>
  )
}

export default Text;
