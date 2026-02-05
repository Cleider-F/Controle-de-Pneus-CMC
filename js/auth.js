import {
collection,
query,
where,
getDocs
} from
"https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import { db } from "./firebase.js";


// LOGIN
window.fazerLogin = async function(){

    const nome = document.getElementById("nome").value.trim();
    const senha = document.getElementById("senha").value.trim();

    if(!nome || !senha){
        alert("Digite usuário e senha");
        return;
    }

    const snap = await getDocs(
        query(
            collection(db,"usuarios"),
            where("nome","==",nome),
            where("senha","==",senha),
            where("ativo","==",true)
        )
    );

    if(!snap.empty){

        localStorage.setItem("logado","true");
        localStorage.setItem("usuario",nome);

        window.location.href = "./app.html";
        return;
    }

    alert("Usuário ou senha inválidos");
};


// LOGOUT
window.logout = function(){

    localStorage.clear();
    window.location.href = "./index.html";

};
