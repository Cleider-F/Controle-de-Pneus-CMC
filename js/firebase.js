import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";

import {
  getFirestore,
  enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import { getStorage } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDIUS5Z_2e_V3qwzvTOxPzH2O5QRPCGcGM",
  authDomain: "controle-de-pneus-cmc.firebaseapp.com",
  projectId: "controle-de-pneus-cmc",
  storageBucket: "controle-de-pneus-cmc.firebasestorage.app",
  messagingSenderId: "947294126166",
  appId: "1:947294126166:web:ea857f0e12a46a99053bf7"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const storage = getStorage(app);

/**
 * OFFLINE / CACHE (IndexedDB)
 * - Permite usar offline e sincronizar quando voltar internet.
 * - Pode falhar em alguns casos (múltiplas abas abertas, modo privado etc).
 * - Não pode quebrar o app.
 */
enableIndexedDbPersistence(db).catch((err) => {
  // Erros "normais" de acontecer:
  // - failed-precondition: outra aba já habilitou persistence
  // - unimplemented: navegador não suporta IndexedDB
  if (err?.code === "failed-precondition" || err?.code === "unimplemented") {
    console.warn("Offline cache não foi habilitado:", err.code);
    return;
  }

  // Qualquer outro erro, loga pra depurar
  console.error("Erro ao habilitar offline cache:", err);
});
