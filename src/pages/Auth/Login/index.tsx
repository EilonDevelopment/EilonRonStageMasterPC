import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonCol,
  IonContent,
  IonInput,
  IonLabel,
  // IonItem,
  // IonLabel,
  IonPage,
  IonRow
} from '@ionic/react';
import React, { FC, useState } from 'react';
import 'react-phone-number-input/style.css'
import PhoneInput from 'react-phone-number-input'
import { useTranslation } from 'react-i18next';

const Login: FC = () => {
  const { t } = useTranslation();

  const [authState, setAuthState] = useState<string>('login')
  // eslint-disable-next-line
  const [phoneNumber, setPhoneNumber] = useState<any>(null);
  const [code, setCode] = useState<string>('');

  const handleSendCode = () => {
    setAuthState('confirm')
  }

  const handleConfirm = () => {
    console.log('handleConfirm')
  }

  return (
    <IonPage>
      <IonContent>
        <div className="card-container">
          <IonCard>
            <IonRow>
              <IonCol size-md="9" size="12" className="welcome">
                <IonCardHeader>
                  <IonCardTitle> {t('Auth.Title')} </IonCardTitle>
                </IonCardHeader>
                <IonCardContent>
                  {authState === 'login' && <>
                    <PhoneInput
                      value={phoneNumber}
                      onChange={setPhoneNumber}
                    />
                    <IonButton onClick={handleSendCode}>{t('Auth.Login.ButtonTitle')}</IonButton>
                  </>}
                  {authState === 'confirm' && <>
                    <div className='flex flex-row items-center'>
                      <IonLabel>{t('Auth.Confirm.Code')}</IonLabel>
                      <IonInput value={code} onIonChange={e => setCode(e.detail.value ? e.detail.value : '')} />
                    </div>
                    <div className='grid grid-cols-2'>
                      <IonButton onClick={handleConfirm} >{t('Auth.Confirm.ConfirmButton')}</IonButton>
                      <IonButton onClick={handleSendCode} >{t('Auth.Confirm.ResendButton')}</IonButton>
                    </div>
                  </>}
                </IonCardContent>
              </IonCol>
            </IonRow>
          </IonCard>
        </div>
      </IonContent>
    </IonPage>
  )
}

export default Login;
