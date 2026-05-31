import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

import { auth, db } from "./firebase.js";

async function buscarPerfil(user) {
    try {
        const perfilSnap = await getDoc(doc(db, "usuarios", user.uid));
        return perfilSnap.exists() ? perfilSnap.data() : null;
    } catch (err) {
        console.warn("Perfil do usuário não foi carregado:", err);
        return null;
    }
}

// LOGIN
window.fazerLogin = async function(){

    const email = document.getElementById("email").value.trim();
    const senha = document.getElementById("senha").value.trim();

    if(!email || !senha){
        alert("Digite e-mail e senha");
        return;
    }

    try {
        const credencial = await signInWithEmailAndPassword(auth, email, senha);
        const perfil = await buscarPerfil(credencial.user);

        sessionStorage.setItem("logado", "true");
        sessionStorage.setItem("usuario", perfil?.nome || credencial.user.displayName || credencial.user.email || email);

        window.location.href = "./app.html";
    } catch (err) {
        console.error("Erro no login:", err);
        alert("Usuário ou senha inválidos");
    }
};

// CADASTRO
window.criarConta = async function(){
    const nome = document.getElementById("nomeCadastro").value.trim();
    const email = document.getElementById("emailCadastro").value.trim();
    const senha = document.getElementById("senhaCadastro").value;
    const senha2 = document.getElementById("senhaCadastro2").value;

    if(!nome || !email || !senha || !senha2){
        alert("Preencha todos os campos");
        return;
    }

    if(senha !== senha2){
        alert("As senhas não conferem");
        return;
    }

    if(senha.length < 6){
        alert("A senha deve ter pelo menos 6 caracteres");
        return;
    }

    try {
        const credencial = await createUserWithEmailAndPassword(auth, email, senha);
        await updateProfile(credencial.user, { displayName: nome }).catch((err) => {
            console.warn("Nome do usuário não foi salvo no Auth:", err);
        });

        await setDoc(doc(db, "usuarios", credencial.user.uid), {
            nome,
            email,
            criadoEm: serverTimestamp()
        }).catch((err) => {
            console.warn("Perfil do usuário não foi salvo no Firestore:", err);
        });

        sessionStorage.setItem("logado", "true");
        sessionStorage.setItem("usuario", nome);
        window.location.href = "./app.html";
    } catch (err) {
        console.error("Erro ao criar conta:", err);

        if (err?.code === "auth/email-already-in-use") {
            alert("Este e-mail já possui conta.");
            return;
        }

        if (err?.code === "auth/invalid-email") {
            alert("E-mail inválido.");
            return;
        }

        alert("Erro ao criar conta. Veja o console (F12).");
    }
};

window.recuperarSenha = async function(){
    const email = document.getElementById("email").value.trim();

    if(!email){
        alert("Digite seu e-mail para recuperar a senha.");
        return;
    }

    try {
        await sendPasswordResetEmail(auth, email);
        alert("Link de recuperação enviado para o e-mail.");
    } catch (err) {
        console.error("Erro ao recuperar senha:", err);
        alert("Erro ao enviar recuperação de senha.");
    }
};

window.mostrarCadastro = function(){
    document.getElementById("loginBox").classList.add("hidden");
    document.getElementById("cadastroBox").classList.remove("hidden");
};

window.mostrarLogin = function(){
    document.getElementById("cadastroBox").classList.add("hidden");
    document.getElementById("loginBox").classList.remove("hidden");
};


// LOGOUT
window.logout = async function(){

    await signOut(auth);
    sessionStorage.clear();
    localStorage.removeItem("logado");
    localStorage.removeItem("usuario");
    window.location.href = "./index.html";

};
