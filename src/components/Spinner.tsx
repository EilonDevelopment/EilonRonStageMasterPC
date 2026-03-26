import React, { FC } from 'react';
import { IonSpinner } from '@ionic/react';

interface SpinnerProps {
  visible: boolean;
  type?: 'part' | 'whole';
}

const Spinner: FC<SpinnerProps> = props => {
  const { visible, type = 'part' } = props;

  return <div>
    {visible &&
      <IonSpinner name="crescent" color="dark" />
    }
  </div>
}

export default Spinner;
