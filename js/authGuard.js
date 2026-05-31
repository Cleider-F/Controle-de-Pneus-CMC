import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import { auth, db } from "./firebase.js";

document.documentElement.style.visibility = "hidden";

function limparSessao() {
  sessionStorage.clear();
  localStorage.removeItem("logado");
  localStorage.removeItem("usuario");
}

function redirecionarLogin() {
  limparSessao();
  window.location.href = "./index.html";
}

export const authReady = new Promise((resolve) => {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      redirecionarLogin();
      return;
    }

    sessionStorage.setItem("logado", "true");
    sessionStorage.setItem("usuario", user.displayName || user.email || user.uid);
    document.documentElement.style.visibility = "";
    resolve({ user, perfil: null });

    try {
      const perfilSnap = await getDoc(doc(db, "usuarios", user.uid));
      const perfil = perfilSnap.exists() ? perfilSnap.data() : null;
      if (perfil?.nome) {
        sessionStorage.setItem("usuario", perfil.nome);
      }
    } catch (err) {
      console.warn("Perfil do usuário não foi carregado:", err);
    }
  });
});

window.logout = async function () {
  await signOut(auth);
  limparSessao();
  window.location.href = "./index.html";
};
