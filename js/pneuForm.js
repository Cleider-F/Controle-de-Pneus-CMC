import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";

import { db, storage } from "./firebase.js";

/* =========================
   Helpers
========================= */
function $(id) {
  return document.getElementById(id);
}

function getMesId() {
  return localStorage.getItem("mesAtual");
}

function getPneuId() {
  return localStorage.getItem("pneuAtual");
}

function pneuDocRef(mesId, pneuId) {
  return doc(db, "meses", mesId, "pneus", pneuId);
}

function setReadOnly(isReadOnly) {
  const inputs = document.querySelectorAll("input, textarea, select, button");
  inputs.forEach((el) => {
    // não bloqueia botão voltar
    if (el.getAttribute("onclick")?.includes("voltarMes")) return;

    // file input também deve travar
    if (el.id === "f_fotos" || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") {
      el.disabled = isReadOnly;
      el.classList.toggle("bg-slate-100", isReadOnly);
    }
  });

  // esconde botões salvar/finalizar em modo leitura
  const btnSalvar = $("btnSalvar");
  const btnFinal = $("btnFinalizarPneu");
  if (btnSalvar) btnSalvar.style.display = isReadOnly ? "none" : "inline-block";
  if (btnFinal) btnFinal.style.display = isReadOnly ? "none" : "inline-block";
}

function setHeader({ numero, status, mesNome }) {
  $("tituloPneu").textContent = `Pneu #${numero || "—"}`;
  $("subtituloPneu").textContent = `Mês: ${mesNome || "—"} • Status: ${status || "—"}`;
}

/* =========================
   Estado local
========================= */
let modoLeitura = false;
let fotosSelecionadas = []; // File[]
let urlsFotosExistentes = []; // string[]

/* =========================
   Preview de fotos
========================= */
function renderPreviewFotos() {
  const box = $("previewFotos");
  if (!box) return;

  box.innerHTML = "";

  // 1) fotos já salvas no firestore
  urlsFotosExistentes.forEach((url) => {
    const wrap = document.createElement("div");
    wrap.className = "bg-slate-50 border rounded-xl overflow-hidden";
    wrap.innerHTML = `
      <img src="${url}" class="w-full h-28 object-cover" />
    `;
    box.appendChild(wrap);
  });

  // 2) novas fotos selecionadas (local)
  fotosSelecionadas.forEach((file) => {
    const url = URL.createObjectURL(file);
    const wrap = document.createElement("div");
    wrap.className = "bg-slate-50 border rounded-xl overflow-hidden";
    wrap.innerHTML = `
      <img src="${url}" class="w-full h-28 object-cover" />
    `;
    box.appendChild(wrap);
  });
}

function bindFotosInput() {
  const input = $("f_fotos");
  if (!input) return;

  input.addEventListener("change", () => {
    const files = Array.from(input.files || []);

    if (files.length > 4) {
      alert("Selecione no máximo 4 imagens.");
      input.value = "";
      return;
    }

    fotosSelecionadas = files;
    renderPreviewFotos();
  });
}

/* =========================
   Upload Fotos
========================= */
async function uploadFotos(mesId, pneuId) {
  if (!fotosSelecionadas.length) return [];

  // limita 4
  const files = fotosSelecionadas.slice(0, 4);

  const uploads = files.map(async (file, idx) => {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `pneus/${mesId}/${pneuId}/${Date.now()}_${idx}.${ext}`;
    const ref = storageRef(storage, path);

    await uploadBytes(ref, file);
    return await getDownloadURL(ref);
  });

  return await Promise.all(uploads);
}

/* =========================
   Carregar mês (nome)
========================= */
async function carregarMesNome(mesId) {
  try {
    const mesRef = doc(db, "meses", mesId);
    const snap = await getDoc(mesRef);
    if (!snap.exists()) return null;
    return snap.data().nome || null;
  } catch {
    return null;
  }
}

/* =========================
   Carregar pneu
========================= */
async function carregarPneu() {
  const mesId = getMesId();
  const pneuId = getPneuId();

  if (!mesId || !pneuId) {
    alert("Mês ou pneu não identificado. Volte e selecione novamente.");
    return;
  }

  const mesNome = await carregarMesNome(mesId);

  const ref = pneuDocRef(mesId, pneuId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    // Pneu ainda não existe? cria doc mínimo (não trava)
    await setDoc(ref, {
      status: "em_andamento",
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    }, { merge: true });

    setHeader({ numero: "—", status: "em_andamento", mesNome });
    modoLeitura = false;
    setReadOnly(false);
    return;
  }

  const p = snap.data();

  // header
  setHeader({
    numero: p.numero || "—",
    status: p.status || "—",
    mesNome
  });

  // modo leitura
  modoLeitura = (p.status === "finalizado");
  setReadOnly(modoLeitura);

  // planejamento
  $("f_como").value = p.planejamento?.como || "";
  $("f_instrucoes").value = p.planejamento?.instrucoes || "";

  // quando
  $("f_inicio").value = p.quando?.inicio || "";
  $("f_fim").value = p.quando?.fim || "";

  // onde
  $("f_nome").value = p.onde?.nome || "";
  $("f_razao").value = p.onde?.razao || "";
  $("f_endereco").value = p.onde?.endereco || "";

  // caracteristicas
  $("c_marca").value = p.caracteristicas?.marca || "";
  $("c_medida").value = p.caracteristicas?.medida || "";
  $("c_desenho").value = p.caracteristicas?.desenho || "";
  $("c_profundidade").value = p.caracteristicas?.profundidade || "";
  $("c_vida").value = p.caracteristicas?.vida || "";

  // informações
  $("i_dot").value = p.info?.dot || "";
  $("i_fogo").value = p.info?.fogo || "";
  $("i_cliente").value = p.info?.cliente || "";
  $("i_data").value = p.info?.data || "";
  $("i_mesRef").value = p.info?.mesReferencia || "";
  $("i_avaria").value = p.info?.avaria || "";
  $("i_causa").value = p.info?.causa || "";

  // fotos
  urlsFotosExistentes = Array.isArray(p.fotos) ? p.fotos : [];
  renderPreviewFotos();
}

/* =========================
   Salvar
========================= */
window.salvarFormulario = async function () {
  if (modoLeitura) {
    alert("Este pneu está finalizado e não pode ser editado.");
    return;
  }

  const mesId = getMesId();
  const pneuId = getPneuId();

  if (!mesId || !pneuId) {
    alert("Mês ou pneu não identificado.");
    return;
  }

  try {
    const refDoc = pneuDocRef(mesId, pneuId);

    // upload de fotos novas (se houver)
    const novasUrls = await uploadFotos(mesId, pneuId);

    const dados = {
      planejamento: {
        como: $("f_como").value.trim(),
        instrucoes: $("f_instrucoes").value.trim()
      },
      quando: {
        inicio: $("f_inicio").value || "",
        fim: $("f_fim").value || ""
      },
      onde: {
        nome: $("f_nome").value.trim(),
        razao: $("f_razao").value.trim(),
        endereco: $("f_endereco").value.trim()
      },
      caracteristicas: {
        marca: $("c_marca").value || "",
        medida: $("c_medida").value || "",
        desenho: $("c_desenho").value || "",
        profundidade: $("c_profundidade").value || "",
        vida: $("c_vida").value || ""
      },
      info: {
        dot: $("i_dot").value.trim(),
        fogo: $("i_fogo").value.trim(),
        cliente: $("i_cliente").value.trim(),
        data: $("i_data").value || "",
        mesReferencia: $("i_mesRef").value || "",
        avaria: $("i_avaria").value || "",
        causa: $("i_causa").value || ""
      },
      // mantém status atual se já estiver setado
      atualizadoEm: serverTimestamp()
    };

    // se tinha fotos antigas e adicionou novas, concatena
    if (novasUrls.length) {
      dados.fotos = [...urlsFotosExistentes, ...novasUrls].slice(0, 4);
    }

    await updateDoc(refDoc, dados);

    // atualiza estado e preview (limpa seleção)
    if (novasUrls.length) {
      urlsFotosExistentes = (dados.fotos || urlsFotosExistentes);
      fotosSelecionadas = [];
      const input = $("f_fotos");
      if (input) input.value = "";
      renderPreviewFotos();
    }

    alert("Salvo com sucesso!");

    // recarrega header/status
    await carregarPneu();

  } catch (e) {
    console.error("Erro ao salvar:", e);
    alert("Erro ao salvar. Veja o console (F12).");
  }
};

/* =========================
   Finalizar pneu (trava)
========================= */
window.finalizarPneu = async function () {
  if (modoLeitura) return;

  const ok = confirm("Ao finalizar, este pneu ficará somente leitura. Deseja continuar?");
  if (!ok) return;

  const mesId = getMesId();
  const pneuId = getPneuId();

  if (!mesId || !pneuId) {
    alert("Mês ou pneu não identificado.");
    return;
  }

  try {
    const refDoc = pneuDocRef(mesId, pneuId);

    // garante salvar antes de finalizar
    await window.salvarFormulario();

    await updateDoc(refDoc, {
      status: "finalizado",
      finalizadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    });

    alert("Pneu finalizado!");
    modoLeitura = true;
    setReadOnly(true);

    await carregarPneu();

  } catch (e) {
    console.error("Erro ao finalizar:", e);
    alert("Erro ao finalizar. Veja o console (F12).");
  }
};

/* =========================
   Navegação
========================= */
window.voltarMes = function () {
  // você pode trocar pra mes.html ou mês.html conforme seu arquivo
  window.location.href = "./mes.html";
};

/* =========================
   Init
========================= */
document.addEventListener("DOMContentLoaded", () => {
  bindFotosInput();
  carregarPneu();
});
