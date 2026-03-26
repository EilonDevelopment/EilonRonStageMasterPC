import React, { FC, useEffect, useRef, useState } from "react";
import { ISelectOption } from "../../helper/types";


interface ButtonDropdownProps {
  list: ISelectOption[];
  value: string | number;
  classes?: string;
  classesContainer?: string;
  disabled: boolean;
  onChange: (value: string | number) => void;
}

const ButtonDropdown: FC<ButtonDropdownProps> = (props) => {
  const { list, value, disabled, classes = '', classesContainer = '', onChange } = props;
  const ref = useRef<HTMLUListElement>(null)
  const [isOpen, setIsOpen] = useState<boolean>(false)

  const handleOutsideClick = (e: any) => {
    if (ref.current && !ref.current.contains(e.target)) {
      console.log('-clicked outside-')
      setIsOpen(false)
    }
  }

  useEffect(() => {
    document.addEventListener('mousedown', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [])

  return (
    <div
      style={{ position: 'relative' }}
      className={`${classesContainer}`}
    >
      <button
        className={`dropdown-toggle ${classes}`}
        disabled={disabled}
        onClick={() => {
          console.log("clicked open")
          setIsOpen(!isOpen)
        }}
      >
        PDF Edit
      </button>
      {isOpen && (
        <ul
          ref={ref}
          className="dropdown-list"
        >
          {list.map((item, index) => (
            <button
              className="dropdown-list-item"
              key={index}
              value={item.value}
              onClick={() => onChange(item.value)}
            >
              {item.label}
            </button>
          ))}
        </ul>
      )}
    </div>

  )
}

export default ButtonDropdown;