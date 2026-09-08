import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyAAkoOgZhbygoF28iHWfYEQHNiB_rdPMOI',
  authDomain: 'silent-scholar-505618-u6.firebaseapp.com',
  projectId: 'silent-scholar-505618-u6',
  storageBucket: 'silent-scholar-505618-u6.firebasestorage.app',
  messagingSenderId: '439848695866',
  appId: '1:439848695866:web:dceb1248260026d597dd03',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
