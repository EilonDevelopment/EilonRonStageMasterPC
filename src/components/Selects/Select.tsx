import React, { FC } from "react";
import { ISelectOption } from "../../helper/types";


interface SelectProps {
  list: ISelectOption[];
  value: string | number;
  classes?: string;
  disabled: boolean
  onChange: (value: string | number) => void;
}

const Select: FC<SelectProps> = (props) => {
  const { list, disabled, value, classes = '', onChange } = props;

  const handleChange = (e: any) => {
    onChange(e.target.value)
  }

  return (
    <select
      className={`form-control rounded outline-none ${classes}`}
      value={value}
      disabled={disabled}
      onChange={(e: any) => handleChange(e)}
    >
      {
        list.map((item, index) => (
          <option key={index} value={item.value} >{item.label}</option>
        ))
      }
    </select>

  )
}

export default Select;