import React, { FC } from "react";
import { IonIcon } from "@ionic/react";

import Text from "../Text";

interface ButtonProps {
  title: string;
  // eslint-disable-next-line
  icon?: any;
  iconColorDisable?: boolean;
  classes?: string;
  textClasses?: string;
  onAction: () => void;
}

const Button: FC<ButtonProps> = props => {
  const {
    title,
    icon = null,
    iconColorDisable = false,
    classes = '',
    textClasses = '',
    onAction
  } = props;

  return (
    <div
      className={`flex flex-row items-center gap-1 cursor-pointer ${classes}`}
      onClick={onAction}
    >
      {icon && <IonIcon color={iconColorDisable ? "" : 'dark'} className="text-xl" src={icon} /> }
      <Text type="dark" label={title} classes={textClasses} />
    </div>
  )
}

export default Button;
