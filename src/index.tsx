import React from 'react';
import { createRoot } from 'react-dom/client';
import Swal from 'sweetalert2';
import App from './App';

// iOS WKWebView: clear Swal body locks after close. Do not remove .swal2-container manually — that can break
// the next touch cycle and feel like buttons need a “second tap”.
function releaseSwalAndFocusLocks() {
  const cls = ['swal2-shown', 'swal2-height-auto', 'swal2-no-backdrop', 'swal2-iosfix'];
  cls.forEach((c) => {
    document.body.classList.remove(c);
    document.documentElement.classList.remove(c);
  });
  document.body.style.removeProperty('padding-right');
  document.documentElement.style.removeProperty('padding-right');
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
  const ae = document.activeElement;
  if (ae instanceof HTMLElement && ae !== document.body) {
    ae.blur();
  }
}

Swal.mixin({
  heightAuto: false,
  // iOS WKWebView: returning focus to the invoking control (e.g. date input) can leave a ghost layer that eats taps.
  returnFocus: false,
  didClose: () => {
    requestAnimationFrame(() => {
      releaseSwalAndFocusLocks();
      requestAnimationFrame(() => releaseSwalAndFocusLocks());
    });
  },
});
// import * as serviceWorkerRegistration from './serviceWorkerRegistration';
// import reportWebVitals from './reportWebVitals';
import { Provider } from 'react-redux';
import { AuthProvider } from './context/AuthContext';
import { AppDataProvider } from './context/AppContext';

const container = document.getElementById('root');

const root = createRoot(container!);
root.render(
  // <React.StrictMode>
    <AppDataProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </AppDataProvider>
  // </React.StrictMode>
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://cra.link/PWA
// serviceWorkerRegistration.unregister();

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
// reportWebVitals();
