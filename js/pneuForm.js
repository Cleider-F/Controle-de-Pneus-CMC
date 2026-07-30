import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";

import { db, storage } from "./firebase.js";
import { authReady } from "./authGuard.js?v=20260531-2";

await authReady;

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

const MAX_FOTOS = 4;
const MAX_FOTO_MB = 20;
const OUTRO_SELECT_IDS = ["c_marca", "c_medida", "c_vida"];

function dadosOnde(pneu) {
  const onde = pneu?.onde || {};
  return {
    nome: onde.nome || "",
    razao: onde.razao ?? onde.razaoSocial ?? "",
    endereco: onde.endereco || ""
  };
}

function dadosInfo(pneu) {
  const info = pneu?.info || pneu?.informacoesPneu || {};
  return {
    dot: info.dot || "",
    fogo: info.fogo ?? info.numeroFogo ?? "",
    cliente: info.cliente || "",
    data: info.data || "",
    mesReferencia: info.mesReferencia || "",
    avaria: info.avaria || "",
    causa: info.causa || ""
  };
}

function isOutroText(valor) {
  return ["Outro", "Outros"].includes(String(valor || "").trim());
}

function getSelectedOptionText(select) {
  return select?.options?.[select.selectedIndex]?.textContent?.trim() || "";
}

function findOutroOption(select) {
  return Array.from(select?.options || []).find((option) => isOutroText(option.textContent || option.value));
}

function getOutroInputId(selectId) {
  return `${selectId}_outro`;
}

function toggleOutroInput(select) {
  const input = $(getOutroInputId(select.id));
  if (!input) return;

  const show = isOutroText(getSelectedOptionText(select));
  input.classList.toggle("hidden", !show);
  if (show) {
    input.disabled = select.disabled;
  } else {
    input.value = "";
    input.disabled = true;
  }
}

function bindOutroSelects() {
  OUTRO_SELECT_IDS.forEach((selectId) => {
    const select = $(selectId);
    if (!select || !findOutroOption(select) || $(getOutroInputId(selectId))) return;

    const input = document.createElement("input");
    input.id = getOutroInputId(selectId);
    input.placeholder = "Digite a opção";
    input.className = "hidden mt-2 border p-3 rounded w-full";
    input.autocomplete = "off";

    select.insertAdjacentElement("afterend", input);
    select.addEventListener("change", () => toggleOutroInput(select));
    toggleOutroInput(select);
  });
}

function setSelectValueWithOutro(selectId, valor) {
  const select = $(selectId);
  if (!select) return;

  const input = $(getOutroInputId(selectId));
  const value = String(valor || "");
  const matchingOption = Array.from(select.options).find((option) => option.value === value || option.textContent.trim() === value);

  if (!value) {
    select.value = "";
    if (input) input.value = "";
    toggleOutroInput(select);
    return;
  }

  if (matchingOption) {
    select.value = matchingOption.value;
    if (input) input.value = "";
    toggleOutroInput(select);
    return;
  }

  const outroOption = findOutroOption(select);
  if (outroOption) {
    select.value = outroOption.value;
    if (input) input.value = value;
    toggleOutroInput(select);
  }
}

function getSelectValueWithOutro(selectId) {
  const select = $(selectId);
  if (!select) return "";

  const selectedText = getSelectedOptionText(select);
  if (!isOutroText(selectedText)) return select.value || "";

  const manual = ($(getOutroInputId(selectId))?.value || "").trim();
  return manual || selectedText;
}

function setReadOnly(isReadOnly) {
  // trava inputs/textarea/select/file, mas não trava botões de navegação
  const inputs = document.querySelectorAll("input, textarea, select");
  inputs.forEach((el) => {
    el.disabled = isReadOnly;
    el.classList.toggle("bg-slate-100", isReadOnly);
  });

  OUTRO_SELECT_IDS.forEach((selectId) => {
    const select = $(selectId);
    if (select) toggleOutroInput(select);
  });

  // esconde botões salvar/finalizar em modo leitura
  const btnSalvar = $("btnSalvar");
  const btnFinal = $("btnFinalizarPneu");
  if (btnSalvar) btnSalvar.style.display = isReadOnly ? "none" : "";
  if (btnFinal) btnFinal.style.display = isReadOnly ? "none" : "";
}

function setHeader({ numero, status, mesNome, mesStatus }) {
  $("tituloPneu").textContent = `Pneu #${numero || "—"}`;
  $("subtituloPneu").textContent = `Mês: ${mesNome || "—"} • Status do mês: ${mesStatus || "—"} • Status do pneu: ${status || "—"}`;
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
  wrap.className = "photo-card";

  const img = document.createElement("img");
  img.src = src;
  img.className = "photo-thumb";
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

    if (urlsFotosExistentes.length + files.length > MAX_FOTOS) {
      alert(`O pneu pode ter no máximo ${MAX_FOTOS} fotos no total.`);
      input.value = "";
      return;
    }

    const arquivoInvalido = files.find((file) => !file.type.startsWith("image/"));
    if (arquivoInvalido) {
      alert("Selecione apenas arquivos de imagem.");
      input.value = "";
      return;
    }

    const arquivoGrande = files.find((file) => file.size > MAX_FOTO_MB * 1024 * 1024);
    if (arquivoGrande) {
      alert(`Cada foto deve ter no máximo ${MAX_FOTO_MB} MB.`);
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

  const files = fotosSelecionadas.slice(0, MAX_FOTOS);

  const uploads = files.map(async (file, idx) => {
    const extArquivo = (file.name.split(".").pop() || "jpg").toLowerCase();
    const ext = /^[a-z0-9]+$/.test(extArquivo) ? extArquivo : "jpg";
    const path = `pneus/${mesId}/${pneuId}/${Date.now()}_${idx}.${ext}`;
    const ref = storageRef(storage, path);

    await uploadBytes(ref, file, { contentType: file.type });
    return await getDownloadURL(ref);
  });

  return await Promise.all(uploads);
}

/* =========================
   Carregar mês (nome)
========================= */
async function carregarMesInfo(mesId) {
  try {
    const mesRef = doc(db, "meses", mesId);
    const snap = await getDoc(mesRef);
    if (!snap.exists()) return null;
    return snap.data();
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

  const mes = await carregarMesInfo(mesId);

  if (!mes) {
    alert("Mês não encontrado. Volte e selecione novamente.");
    window.location.href = "./app.html";
    return;
  }

  const mesNome = mes.nome || null;
  const mesStatus = mes.status || "em_andamento";
  const mesFinalizado = mesStatus === "finalizado";

  const refDoc = pneuDocRef(mesId, pneuId);
  const snap = await getDoc(refDoc);

  if (!snap.exists()) {
    alert("Pneu não encontrado. Volte e selecione novamente.");
    window.location.href = "./mes.html";
    return;
  }

  const p = snap.data();
  const onde = dadosOnde(p);
  const info = dadosInfo(p);

  // header
  setHeader({
    numero: p.numero || "—",
    status: p.status || "—",
    mesNome,
    mesStatus
  });

  // modo leitura
  modoLeitura = mesFinalizado || (p.status === "finalizado");
  setReadOnly(modoLeitura);

  // planejamento
  if ($("f_como")) $("f_como").value = p.planejamento?.como || "";
  if ($("f_instrucoes")) $("f_instrucoes").value = p.planejamento?.instrucoes || "";

  // quando
  if ($("f_inicio")) $("f_inicio").value = p.quando?.inicio || "";
  if ($("f_fim")) $("f_fim").value = p.quando?.fim || "";

  // onde
  if ($("f_nome")) $("f_nome").value = onde.nome;
  if ($("f_razao")) $("f_razao").value = onde.razao;
  if ($("f_endereco")) $("f_endereco").value = onde.endereco;

  // caracteristicas (se existir no HTML)
  setSelectValueWithOutro("c_marca", p.caracteristicas?.marca || "");
  setSelectValueWithOutro("c_medida", p.caracteristicas?.medida || "");
  if ($("c_desenho")) $("c_desenho").value = p.caracteristicas?.desenho || "";
  if ($("c_profundidade")) $("c_profundidade").value = p.caracteristicas?.profundidade || "";
  setSelectValueWithOutro("c_vida", p.caracteristicas?.vida || "");

  // informações (se existir no HTML)
  if ($("i_dot")) $("i_dot").value = info.dot;
  if ($("i_fogo")) $("i_fogo").value = info.fogo;
  if ($("i_cliente")) $("i_cliente").value = info.cliente;
  if ($("i_data")) $("i_data").value = info.data;
  if ($("i_mesRef")) $("i_mesRef").value = info.mesReferencia;
  if ($("i_avaria")) $("i_avaria").value = info.avaria;
  if ($("i_causa")) $("i_causa").value = info.causa;

  // fotos
  urlsFotosExistentes = Array.isArray(p.fotos) ? p.fotos : [];
  renderPreviewFotos();
}

/* =========================
   Salvar
========================= */
window.salvarFormulario = async function ({ silencioso = false } = {}) {
  if (modoLeitura) {
    alert("Este pneu está finalizado e não pode ser editado.");
    return false;
  }

  const mesId = getMesId();
  const pneuId = getPneuId();

  if (!mesId || !pneuId) {
    alert("Mês ou pneu não identificado.");
    return false;
  }

  try {
    const mes = await carregarMesInfo(mesId);
    if (!mes || (mes.status || "em_andamento") === "finalizado") {
      modoLeitura = true;
      setReadOnly(true);
      alert("Mês finalizado. Não é possível editar este pneu.");
      return false;
    }

    const refDoc = pneuDocRef(mesId, pneuId);
    const snap = await getDoc(refDoc);

    if (!snap.exists()) {
      alert("Pneu não encontrado.");
      return false;
    }

    if (urlsFotosExistentes.length + fotosSelecionadas.length > MAX_FOTOS) {
      alert(`O pneu pode ter no máximo ${MAX_FOTOS} fotos no total.`);
      return false;
    }

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
        marca: getSelectValueWithOutro("c_marca"),
        medida: getSelectValueWithOutro("c_medida"),
        desenho: $("c_desenho")?.value || "",
        profundidade: $("c_profundidade")?.value || "",
        vida: getSelectValueWithOutro("c_vida")
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
      dados.fotos = [...urlsFotosExistentes, ...novasUrls].slice(0, MAX_FOTOS);
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

    if (!silencioso) alert("Salvo com sucesso!");
    await carregarPneu();
    return true;

  } catch (e) {
    console.error("Erro ao salvar:", e);
    alert("Erro ao salvar. Veja o console (F12).");
    return false;
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
    const salvo = await window.salvarFormulario({ silencioso: true });
    if (!salvo) return;

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
function iniciarFormularioPneu() {
  bindOutroSelects();
  bindFotosInput();
  carregarPneu();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", iniciarFormularioPneu, { once: true });
} else {
  iniciarFormularioPneu();
}

