import React, { FC } from "react";
import { ISelect } from "../../helper/types";

interface SelectButtonsProps {
  value: string | number;
  list: ISelect[],
  classes?: string;
  onSelect: (value: string | number) => void;
}

const SelectButtons: FC<SelectButtonsProps> = props => {
  const { value, list, classes = '', onSelect } = props;

  return (
    <div className={`flex flex-row items-center ${classes}`}>
      {list.map((item, index) => (
        <span
          key={index}
          className={`
            border border-primary p-2
            ${item.value === value ? 'bg-primary text-white' : 'bg-transparent text-primary'}
          `}
          onClick={() => onSelect(item.value)}
        >
          {item.title}
        </span>
      ))}
    </div>
  )
}

export default SelectButtons;
