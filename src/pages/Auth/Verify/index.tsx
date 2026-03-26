import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonPage, IonRow } from '@ionic/react';
import React, { FC } from 'react';

const Verify: FC = () => {
  return (
    <IonPage>
      <IonContent>
        <div className="card-container">
          <IonCard>
            <IonRow>
              <IonCol size-md="9" size="12" className="welcome">
                <IonCardHeader>
                  <IonCardTitle> Welcome to Eilon Engineering&apos;s Secured Cloud </IonCardTitle>
                </IonCardHeader>
                <IonCardContent>
                </IonCardContent>
              </IonCol>
            </IonRow>
          </IonCard>
        </div>
      </IonContent>
    </IonPage>
  )
}

export default Verify;
