import {
  doc,
  getDoc,
  updateDoc,
  writeBatch,
  collection,
  collectionGroup,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  runTransaction,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import {
  ref as storageRef,
  deleteObject
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";

import { db, storage } from "./firebase.js";
import { authReady } from "./authGuard.js?v=20260531-2";

const mesId = localStorage.getItem("mesAtual");
const grid = document.getElementById("gridPneus");
const mesTitulo = document.getElementById("mesTitulo");
const btnNovoPneu = document.getElementById("btnNovoPneu");
const btnFinalizarMes = document.getElementById("btnFinalizarMes");

function agoraBR() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function limparCSV(v) {
  if (v === null || v === undefined) return "";
  // remove quebras e evita quebrar CSV
  return String(v).replace(/\r?\n/g, " ").replace(/;/g, ",").trim();
}

function baixarArquivo(texto, nomeArquivo, mime = "text/csv;charset=utf-8;") {
  const blob = new Blob([texto], { type: mime });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function escapeHTML(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

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

function pneuInicial(numero) {
  return {
    numero,
    status: "em_andamento",
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
    planejamento: { como: "", instrucoes: "" },
    quando: { inicio: "", fim: "" },
    onde: { nome: "", razao: "", endereco: "" },
    responsaveis: [],
    caracteristicas: { marca: "", medida: "", desenho: "", profundidade: "", vida: "" },
    info: {
      dot: "",
      fogo: "",
      cliente: "",
      data: "",
      mesReferencia: "",
      avaria: "",
      causa: ""
    },
    fotos: []
  };
}

async function excluirFotos(urls) {
  const unicas = [...new Set((urls || []).filter(Boolean))];
  const exclusoes = unicas.map(async (url) => {
    try {
      await deleteObject(storageRef(storage, url));
    } catch (err) {
      console.warn("Não foi possível excluir uma foto do Storage:", err);
    }
  });

  await Promise.allSettled(exclusoes);
}

async function fotosSemOutrasReferencias(mesId, urls) {
  const urlsCandidatas = [...new Set((urls || []).filter(Boolean))];
  if (!urlsCandidatas.length) return [];

  const usadasEmOutrosPneus = new Set();
  const snap = await getDocs(collection(db, "meses", mesId, "pneus"));

  snap.forEach((pneuDoc) => {
    const fotos = pneuDoc.data()?.fotos;
    if (!Array.isArray(fotos)) return;
    fotos.forEach((url) => usadasEmOutrosPneus.add(url));
  });

  return urlsCandidatas.filter((url) => !usadasEmOutrosPneus.has(url));
}

if (!mesId) {
  alert("Nenhum mês selecionado.");
  window.location.href = "./app.html";
}

let mesStatus = "em_andamento";

/* =========================
   Mes header + bloqueios
========================= */
async function carregarMes() {
  const mesRef = doc(db, "meses", mesId);
  const snap = await getDoc(mesRef);

  if (!snap.exists()) {
    mesTitulo.textContent = "Mês não encontrado";
    mesStatus = "finalizado";
    aplicarBloqueioMes();
    return null;
  }

  const mes = snap.data();
  mesStatus = mes.status || "em_andamento";

  mesTitulo.textContent = `${mes.nome || "Mês"} • Status: ${mesStatus} • Pneus: ${mes.totalPneus || 0}`;
  aplicarBloqueioMes();
  return mes;
}

function aplicarBloqueioMes() {
  const bloqueado = mesStatus === "finalizado";

  if (btnNovoPneu) {
    btnNovoPneu.disabled = bloqueado;
    btnNovoPneu.style.opacity = bloqueado ? "0.5" : "1";
    btnNovoPneu.style.pointerEvents = bloqueado ? "none" : "auto";
  }

  if (btnFinalizarMes) {
    btnFinalizarMes.disabled = bloqueado;
    btnFinalizarMes.innerHTML = bloqueado
      ? `<i data-lucide="lock-keyhole"></i>Mês finalizado`
      : `<i data-lucide="lock"></i>Finalizar mês`;
    btnFinalizarMes.style.opacity = bloqueado ? "0.5" : "1";
    btnFinalizarMes.style.pointerEvents = bloqueado ? "none" : "auto";
  }

  if (window.lucide) window.lucide.createIcons();
}

/* =========================
   Numeração global única
========================= */
function formatarNumeroPneu(indice) {
  return String(indice).padStart(6, "0");
}

function numeroParaInteiro(numero) {
  const valor = Number(String(numero || "").replace(/\D/g, ""));
  return Number.isFinite(valor) ? valor : 0;
}

async function buscarMaiorNumeroPneuGlobal() {
  const snap = await getDocs(collectionGroup(db, "pneus"));
  let maior = 0;

  snap.forEach((pneuDoc) => {
    maior = Math.max(maior, numeroParaInteiro(pneuDoc.data()?.numero));
  });

  return maior;
}

async function gerarNumeroPneu() {
  const maiorNumeroExistente = await buscarMaiorNumeroPneuGlobal();
  const contadorRef = doc(db, "config", "contadorPneus");

  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(contadorRef);
    const contadorAtual = snap.exists() ? Number(snap.data().total || 0) : 0;
    const proximo = Math.max(contadorAtual, maiorNumeroExistente) + 1;

    tx.set(contadorRef, {
      total: proximo,
      atualizadoEm: serverTimestamp()
    }, { merge: true });

    return formatarNumeroPneu(proximo);
  });
}

async function atualizarTotalPneusDoMes(mesId) {
  const snap = await getDocs(collection(db, "meses", mesId, "pneus"));
  await updateDoc(doc(db, "meses", mesId), {
    totalPneus: snap.size,
    atualizadoEm: serverTimestamp()
  });

  return snap.size;
}

/* =========================
   Criar pneu
========================= */
window.criarPneuUI = async function () {
  try {
    await authReady;
    await carregarMes();

    if (mesStatus === "finalizado") {
      alert("Mês finalizado. Não é possível criar novos pneus.");
      return;
    }

    const numero = await gerarNumeroPneu();

    await addDoc(collection(db, "meses", mesId, "pneus"), pneuInicial(numero));

    await atualizarTotalPneusDoMes(mesId);

    alert(`Pneu ${numero} criado!`);
    await carregarMes();
  } catch (e) {
    console.error(e);
    alert("Erro ao criar pneu. Veja o console (F12).");
  }
};

/* =========================
   Listar pneus (realtime)
========================= */
function iniciarListaRealtime() {
  const q = query(collection(db, "meses", mesId, "pneus"), orderBy("criadoEm", "desc"));

  onSnapshot(q, async (snap) => {
    await carregarMes();
    grid.innerHTML = "";

    if (snap.empty) {
      grid.innerHTML = `
        <div class="empty-state col-span-full">
          Nenhum pneu criado ainda.
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    snap.forEach((d) => {
      const pneu = d.data();
      const id = d.id;
      const status = pneu.status || "em_andamento";
      const caracteristicas = pneu.caracteristicas || {};
      const numero = escapeHTML(pneu.numero || "—");
      const marca = escapeHTML(caracteristicas.marca || "Sem marca");
      const medida = escapeHTML(caracteristicas.medida || "");
      const desenho = escapeHTML(caracteristicas.desenho || "-");
      const vida = escapeHTML(caracteristicas.vida || "-");
      const profundidade = escapeHTML(caracteristicas.profundidade || "-");

      const badge = status === "finalizado"
        ? `<span class="badge success">Finalizado</span>`
        : `<span class="badge warning">Em andamento</span>`;

      const bloqueadoMes = mesStatus === "finalizado";

      grid.innerHTML += `
        <div class="app-card">
          <div class="flex items-center justify-between mb-3">
            <div>
              <p class="text-sm text-slate-400 font-semibold">#${numero}</p>
              <h3>${marca} ${medida}</h3>
            </div>
            ${badge}
          </div>

          <div class="card-meta">
            ${desenho} • ${vida} • ${profundidade}
          </div>

          <div class="card-actions">
            <button
              onclick="abrirPneu('${id}')"
              class="app-btn blue">
              <i data-lucide="${bloqueadoMes ? "eye" : "folder-open"}"></i>
              ${bloqueadoMes ? "Visualizar" : "Abrir"}
            </button>

            <button
              onclick="duplicarPneu('${id}')"
              class="app-btn dark"
              ${bloqueadoMes ? "disabled" : ""}>
              <i data-lucide="copy"></i>
              Duplicar
            </button>

            <button
              onclick="excluirPneu('${id}')"
              class="app-btn danger icon-only"
              ${bloqueadoMes ? "disabled" : ""}
              title="Excluir pneu"
              aria-label="Excluir pneu">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </div>
      `;
    });

    // O título/contador já foi atualizado antes da renderização.
    if (window.lucide) window.lucide.createIcons();
  });
}

/* =========================
   Abrir pneu (form)
========================= */
window.abrirPneu = function(pneuId){
  localStorage.setItem("pneuAtual", pneuId);
  window.location.href = "./pneu.html";
};


/* =========================
   Duplicar
========================= */
window.duplicarPneu = async function (pneuId) {
  try {
    await authReady;
    await carregarMes();

    if (mesStatus === "finalizado") {
      alert("Mês finalizado. Não é possível duplicar.");
      return;
    }

    const origemRef = doc(db, "meses", mesId, "pneus", pneuId);
    const snap = await getDoc(origemRef);
    if (!snap.exists()) return alert("Pneu não encontrado.");

    const origem = snap.data();
    const novoNumero = await gerarNumeroPneu();
    const { info, informacoesPneu, onde, ...restante } = origem;

    await addDoc(collection(db, "meses", mesId, "pneus"), {
      ...restante,
      numero: novoNumero,
      status: "em_andamento",
      onde: dadosOnde(origem),
      info: dadosInfo(origem),
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    });

    await atualizarTotalPneusDoMes(mesId);

    alert(`Duplicado: ${novoNumero}`);
  } catch (e) {
    console.error(e);
    alert("Erro ao duplicar.");
  }
};

/* =========================
   Excluir
========================= */
window.excluirPneu = async function(pneuId){
  await authReady;

  const ok = confirm("Deseja realmente excluir este pneu?");
  if(!ok) return;

  const mesId = localStorage.getItem("mesAtual");
  if(!mesId){
    alert("Mês atual não identificado.");
    return;
  }

  const mesRef = doc(db, "meses", mesId);
  const pneuRef = doc(db, "meses", mesId, "pneus", pneuId);
  let fotosParaExcluir = [];

  try{
    const mesSnap = await getDoc(mesRef);
    const pneuSnap = await getDoc(pneuRef);

    if (!mesSnap.exists()) {
      throw new Error("Mês não encontrado.");
    }

    if ((mesSnap.data().status || "em_andamento") === "finalizado") {
      throw new Error("Mês finalizado. Não é possível excluir pneus.");
    }

    if (!pneuSnap.exists()) {
      throw new Error("Pneu não encontrado ou já excluído.");
    }

    const fotos = pneuSnap.data().fotos;
    fotosParaExcluir = Array.isArray(fotos) ? fotos : [];

    const batch = writeBatch(db);
    batch.delete(pneuRef);
    await batch.commit();

    await excluirFotos(await fotosSemOutrasReferencias(mesId, fotosParaExcluir));
    await atualizarTotalPneusDoMes(mesId);
    alert("Pneu excluído.");
    await carregarMes();

  }catch(err){
    console.error("Erro ao excluir pneu:", err);
    alert(err?.message || "Erro ao excluir pneu.");
  }
};
/* =========================
   Finalizar mês
========================= */
window.finalizarMes = async function () {
  try {
    await authReady;
    await carregarMes();

    if (mesStatus === "finalizado") return;

    if (!confirm("Ao finalizar o mês, não será mais possível criar/editar/duplicar/excluir pneus. Continuar?")) return;

    await updateDoc(doc(db, "meses", mesId), {
      status: "finalizado",
      finalizadoEm: serverTimestamp()
    });

    mesStatus = "finalizado";
    aplicarBloqueioMes();
    alert("Mês finalizado!");
    carregarMes();
  } catch (e) {
    console.error(e);
    alert("Erro ao finalizar mês.");
  }
};

/* =========================
   Exportar CSV do mês
========================= */
function escapeCSV(v) {
  const s = (v ?? "").toString().replaceAll('"', '""');
  return `"${s}"`;
}

window.exportarCSV = async function () {
  try {
    await authReady;
    const mesId = localStorage.getItem("mesAtual");
    const usuario = sessionStorage.getItem("usuario") || "—";

    if (!mesId) {
      alert("Mês atual não encontrado.");
      return;
    }

    // 1) Buscar o mês
    const mesRef = doc(db, "meses", mesId);
    const mesSnap = await getDoc(mesRef);

    if (!mesSnap.exists()) {
      alert("Mês não encontrado no Firestore.");
      return;
    }

    const mes = mesSnap.data();

    // 2) Buscar pneus do mês (ordenado por número)
    const pneusRef = collection(db, "meses", mesId, "pneus");
    const pneusSnap = await getDocs(query(pneusRef, orderBy("numero", "asc")));
    const pneus = pneusSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // 3) Montar “CSV relatório”
    const linhas = [];

    linhas.push("RELATORIO DE AVALIACAO DE PNEUS");
    linhas.push(`Mes;${limparCSV(mes.nome || "—")}`);
    linhas.push(`Status do Mes;${limparCSV(mes.status || "—")}`);
    linhas.push(`Total de Pneus;${pneus.length}`);
    linhas.push(`Gerado em;${agoraBR()}`);
    linhas.push(`Responsavel;${limparCSV(usuario)}`);
    linhas.push("");

    linhas.push(";;;;;;;;;;;;;;;;;;;;;;;;;;;;;;");
    linhas.push("");

    pneus.forEach((p) => {
      const onde = dadosOnde(p);
      const info = dadosInfo(p);

      linhas.push(`PNEU Nº;${limparCSV(p.numero || "—")}`);
      linhas.push(`Status;${limparCSV(p.status || "—")}`);
      linhas.push("");

      linhas.push("--- PLANEJAMENTO ---");
      linhas.push(`Como sera realizado;${limparCSV(p.planejamento?.como || "")}`);
      linhas.push(`Instrucoes;${limparCSV(p.planejamento?.instrucoes || "")}`);
      linhas.push("");

      linhas.push("--- QUANDO ---");
      linhas.push(`Inicio;${limparCSV(p.quando?.inicio || "")}`);
      linhas.push(`Fim;${limparCSV(p.quando?.fim || "")}`);
      linhas.push("");

      linhas.push("--- ONDE ---");
      linhas.push(`Nome;${limparCSV(onde.nome)}`);
      linhas.push(`Razao social;${limparCSV(onde.razao)}`);
      linhas.push(`Endereco;${limparCSV(onde.endereco)}`);
      linhas.push("");

      linhas.push("--- CARACTERISTICAS DO PNEU ---");
      linhas.push(`Marca;${limparCSV(p.caracteristicas?.marca || "")}`);
      linhas.push(`Medida;${limparCSV(p.caracteristicas?.medida || "")}`);
      linhas.push(`Desenho;${limparCSV(p.caracteristicas?.desenho || "")}`);
      linhas.push(`Profundidade;${limparCSV(p.caracteristicas?.profundidade || "")}`);
      linhas.push(`Vida;${limparCSV(p.caracteristicas?.vida || "")}`);
      linhas.push("");

      linhas.push("--- INFORMACOES DO PNEU ---");
      linhas.push(`DOT;${limparCSV(info.dot)}`);
      linhas.push(`Numero de fogo;${limparCSV(info.fogo)}`);
      linhas.push(`Cliente;${limparCSV(info.cliente)}`);
      linhas.push(`Data;${limparCSV(info.data)}`);
      linhas.push(`Mes de referencia;${limparCSV(info.mesReferencia)}`);
      linhas.push(`Avaria;${limparCSV(info.avaria)}`);
      linhas.push(`Causa;${limparCSV(info.causa)}`);
      linhas.push("");

      // Fotos (links)
      const fotos = Array.isArray(p.fotos) ? p.fotos : [];
      linhas.push("--- FOTOS (LINKS) ---");
      if (fotos.length) {
        fotos.slice(0, 4).forEach((url, idx) => {
          linhas.push(`Foto ${idx + 1};${limparCSV(url)}`);
        });
      } else {
        linhas.push("Sem fotos;");
      }
      linhas.push("");

      linhas.push(";;;;;;;;;;;;;;;;;;;;;;;;;;;;;;");
      linhas.push("");
    });

    const csv = linhas.join("\n");

    // Nome do arquivo
    const safeMes = (mes.nome || "mes")
      .replace(/[^\w\- ]+/g, "")
      .replace(/\s+/g, "_");

    baixarArquivo(csv, `relatorio_${safeMes}.csv`);

  } catch (e) {
    console.error("Erro ao exportar CSV:", e);
    alert("Erro ao exportar CSV. Veja o console (F12).");
  }
};

/* =========================
   Voltar
========================= */
window.voltarMeses = function () {
  window.location.href = "./app.html";
};

async function iniciarPagina() {
  await authReady;
  await carregarMes();
  await atualizarTotalPneusDoMes(mesId);
  await carregarMes();
  iniciarListaRealtime();
}

iniciarPagina();

