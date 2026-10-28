// Подключение к Firebase: база Firestore и вход. Ключи проекта в config.js.
// Доступ к данным закрывают правила базы (firestore.rules): вопросы видит только ведущий.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInAnonymously, onAuthStateChanged, signOut,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, setDoc, deleteDoc, onSnapshot, runTransaction,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from './config.js';

// Экран гостя держит свой вход (без аккаунта) отдельно от входа ведущего:
// на планшете, где вошёл ведущий, экран гостя всё равно не получит его права.
const app = initializeApp(firebaseConfig, location.pathname.includes('/gost/') ? 'guest' : undefined);
export const auth = getAuth(app);
// Копия базы в памяти устройства: пропал интернет, экран работает дальше и догоняет потом.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export {
  GoogleAuthProvider, signInWithPopup, signInAnonymously, onAuthStateChanged, signOut,
  doc, collection, setDoc, deleteDoc, onSnapshot, runTransaction,
};
