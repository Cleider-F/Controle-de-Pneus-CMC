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
  // trava inputs/textarea/select/file, mas não trava botões de navegação
  const inputs = document.querySelectorAll("input, textarea, select");
  inputs.forEach((el) => {
    el.disabled = isReadOnly;
    el.classList.toggle("bg-slate-100", isReadOnly);
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
   Modal imagem (preview)
   Requer no pneu.html:
   - div#modalImagem
   - img#imagemExpandida
========================= */
window.abrirImagem = function (src) {
  const modal = $("modalImagem");
  const img = $("imagemExpandida");
  if (!modal || !img) {
    console.warn("Modal de imagem não encontrado no HTML (modalImagem/imagemExpandida).");
    return;
  }

  img.src = src;
  modal.classList.remove("hidden");
};

window.fecharImagem = function () {
  const modal = $("modalImagem");
  const img = $("imagemExpandida");
  if (!modal || !img) return;

  img.src = "";
  modal.classList.add("hidden");
};

// Fecha clicando fora da imagem
document.addEventListener("DOMContentLoaded", () => {
  const modal = $("modalImagem");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target && e.target.id === "modalImagem") {
        window.fecharImagem();
      }
    });
  }
});

/* =========================
   Estado local
========================= */
let modoLeitura = false;
let fotosSelecionadas = [];     // File[]
let urlsFotosExistentes = [];   // string[] (download URLs)

/* =========================
   Preview de fotos (com clique)
========================= */
function criarThumb(src) {
  const wrap = document.createElement("div");
  wrap.className = "bg-slate-50 border rounded-xl overflow-hidden";

  const img = document.createElement("img");
  img.src = src;
  img.className = "w-full h-28 object-cover cursor-pointer hover:opacity-80";
  img.addEventListener("click", () => window.abrirImagem(src));

  wrap.appendChild(img);
  return wrap;
}

function renderPreviewFotos() {
  const box = $("previewFotos");
  if (!box) return;

  box.innerHTML = "";

  // 1) fotos já salvas no firestore (URL)
  urlsFotosExistentes.forEach((url) => {
    box.appendChild(criarThumb(url));
  });

  // 2) novas fotos selecionadas (local File)
  fotosSelecionadas.forEach((file) => {
    const urlLocal = URL.createObjectURL(file);
    box.appendChild(criarThumb(urlLocal));
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

  const refDoc = pneuDocRef(mesId, pneuId);
  const snap = await getDoc(refDoc);

  if (!snap.exists()) {
    // cria doc mínimo se ainda não existir
    await setDoc(refDoc, {
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
  if ($("f_como")) $("f_como").value = p.planejamento?.como || "";
  if ($("f_instrucoes")) $("f_instrucoes").value = p.planejamento?.instrucoes || "";

  // quando
  if ($("f_inicio")) $("f_inicio").value = p.quando?.inicio || "";
  if ($("f_fim")) $("f_fim").value = p.quando?.fim || "";

  // onde
  if ($("f_nome")) $("f_nome").value = p.onde?.nome || "";
  if ($("f_razao")) $("f_razao").value = p.onde?.razao || "";
  if ($("f_endereco")) $("f_endereco").value = p.onde?.endereco || "";

  // caracteristicas (se existir no HTML)
  if ($("c_marca")) $("c_marca").value = p.caracteristicas?.marca || "";
  if ($("c_medida")) $("c_medida").value = p.caracteristicas?.medida || "";
  if ($("c_desenho")) $("c_desenho").value = p.caracteristicas?.desenho || "";
  if ($("c_profundidade")) $("c_profundidade").value = p.caracteristicas?.profundidade || "";
  if ($("c_vida")) $("c_vida").value = p.caracteristicas?.vida || "";

  // informações (se existir no HTML)
  if ($("i_dot")) $("i_dot").value = p.info?.dot || "";
  if ($("i_fogo")) $("i_fogo").value = p.info?.fogo || "";
  if ($("i_cliente")) $("i_cliente").value = p.info?.cliente || "";
  if ($("i_data")) $("i_data").value = p.info?.data || "";
  if ($("i_mesRef")) $("i_mesRef").value = p.info?.mesReferencia || "";
  if ($("i_avaria")) $("i_avaria").value = p.info?.avaria || "";
  if ($("i_causa")) $("i_causa").value = p.info?.causa || "";

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

    // upload de fotos novas
    const novasUrls = await uploadFotos(mesId, pneuId);

    const dados = {
      planejamento: {
        como: ($("f_como")?.value || "").trim(),
        instrucoes: ($("f_instrucoes")?.value || "").trim()
      },
      quando: {
        inicio: $("f_inicio")?.value || "",
        fim: $("f_fim")?.value || ""
      },
      onde: {
        nome: ($("f_nome")?.value || "").trim(),
        razao: ($("f_razao")?.value || "").trim(),
        endereco: ($("f_endereco")?.value || "").trim()
      },
      caracteristicas: {
        marca: $("c_marca")?.value || "",
        medida: $("c_medida")?.value || "",
        desenho: $("c_desenho")?.value || "",
        profundidade: $("c_profundidade")?.value || "",
        vida: $("c_vida")?.value || ""
      },
      info: {
        dot: ($("i_dot")?.value || "").trim(),
        fogo: ($("i_fogo")?.value || "").trim(),
        cliente: ($("i_cliente")?.value || "").trim(),
        data: $("i_data")?.value || "",
        mesReferencia: $("i_mesRef")?.value || "",
        avaria: $("i_avaria")?.value || "",
        causa: $("i_causa")?.value || ""
      },
      atualizadoEm: serverTimestamp()
    };

    // concatena fotos antigas + novas (limite 4)
    if (novasUrls.length) {
      dados.fotos = [...urlsFotosExistentes, ...novasUrls].slice(0, 4);
    }

    await updateDoc(refDoc, dados);

    // atualiza estado/preview
    if (novasUrls.length) {
      urlsFotosExistentes = (dados.fotos || urlsFotosExistentes);
      fotosSelecionadas = [];
      const input = $("f_fotos");
      if (input) input.value = "";
      renderPreviewFotos();
    }

    alert("Salvo com sucesso!");
    await carregarPneu();

  } catch (e) {
    console.error("Erro ao salvar:", e);
    alert("Erro ao salvar. Veja o console (F12).");
  }
};

/* =========================
   Finalizar pneu
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

    // salva antes de finalizar
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
  window.location.href = "./mes.html";
};

/* =========================
   Init
========================= */
document.addEventListener("DOMContentLoaded", () => {
  bindFotosInput();
  carregarPneu();
});
