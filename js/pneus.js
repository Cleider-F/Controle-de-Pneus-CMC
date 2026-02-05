import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  runTransaction,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  getDocs,
  serverTimestamp,
  increment
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import { db } from "./firebase.js";

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

if (!mesId) {
  alert("Nenhum mês selecionado.");
  window.location.href = "./app.html";
}

let mesStatus = "aberto";

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
    return;
  }

  const mes = snap.data();
  mesStatus = mes.status || "aberto";

  mesTitulo.textContent = `${mes.nome || "Mês"} • Status: ${mesStatus} • Pneus: ${mes.totalPneus || 0}`;
  aplicarBloqueioMes();
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
    btnFinalizarMes.textContent = bloqueado ? "Mês finalizado" : "Finalizar mês";
    btnFinalizarMes.style.opacity = bloqueado ? "0.5" : "1";
    btnFinalizarMes.style.pointerEvents = bloqueado ? "none" : "auto";
  }
}

/* =========================
   Contador global seguro
========================= */
async function gerarNumeroPneu() {
  const ref = doc(db, "config", "contadorPneus");

  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);

    if (!snap.exists()) {
      tx.set(ref, { total: 1 });
      return "000001";
    }

    const atual = snap.data().total || 0;
    const proximo = atual + 1;

    tx.update(ref, { total: increment(1) });
    return String(proximo).padStart(6, "0");
  });
}

/* =========================
   Criar pneu
========================= */
window.criarPneuUI = async function () {
  try {
    if (mesStatus === "finalizado") {
      alert("Mês finalizado. Não é possível criar novos pneus.");
      return;
    }

    const numero = await gerarNumeroPneu();

    await addDoc(collection(db, "meses", mesId, "pneus"), {
      numero,
      status: "em_andamento",
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),

      planejamento: { como: "", instrucoes: "" },
      quando: { inicio: "", fim: "" },
      onde: { nome: "", razaoSocial: "", endereco: "" },
      responsaveis: [],
      caracteristicas: { marca: "", medida: "", desenho: "", profundidade: "", vida: "" },
      informacoesPneu: {
        dot: "",
        numeroFogo: "",
        cliente: "",
        data: "",
        mesReferencia: "",
        avaria: "",
        causa: ""
      },
      fotos: []
    });

    await updateDoc(doc(db, "meses", mesId), { totalPneus: increment(1) });

    alert(`Pneu ${numero} criado!`);
    carregarMes();
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

  onSnapshot(q, (snap) => {
    grid.innerHTML = "";

    if (snap.empty) {
      grid.innerHTML = `
        <div class="col-span-full bg-white p-6 rounded-xl shadow text-slate-600">
          Nenhum pneu criado ainda.
        </div>
      `;
      return;
    }

    snap.forEach((d) => {
      const pneu = d.data();
      const id = d.id;
      const status = pneu.status || "em_andamento";

      const badge = status === "finalizado"
        ? `<span class="text-xs px-2 py-1 rounded bg-green-100 text-green-700">Finalizado</span>`
        : `<span class="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-700">Em andamento</span>`;

      const bloqueadoMes = mesStatus === "finalizado";

      grid.innerHTML += `
        <div class="bg-white p-5 rounded-2xl shadow">
          <div class="flex items-center justify-between mb-3">
            <div>
              <p class="text-sm text-slate-400">#${pneu.numero || "—"}</p>
              <p class="font-bold text-lg">${pneu.caracteristicas?.marca || "Sem marca"} ${pneu.caracteristicas?.medida || ""}</p>
            </div>
            ${badge}
          </div>

          <div class="text-sm text-slate-600 mb-4">
            ${pneu.caracteristicas?.desenho || "-"} • ${pneu.caracteristicas?.vida || "-"} • ${pneu.caracteristicas?.profundidade || "-"}
          </div>

          <div class="flex gap-2">
            <button
              onclick="abrirPneu('${id}')"
              class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-xl">
              ${bloqueadoMes ? "Visualizar" : "Abrir"}
            </button>

            <button
              onclick="duplicarPneu('${id}')"
              class="flex-1 bg-slate-800 hover:bg-slate-900 text-white py-2 rounded-xl"
              ${bloqueadoMes ? "disabled style='opacity:.5;pointer-events:none'" : ""}>
              Duplicar
            </button>

            <button
              onclick="excluirPneu('${id}')"
              class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl"
              ${bloqueadoMes ? "disabled style='opacity:.5;pointer-events:none'" : ""}>
              🗑️
            </button>
          </div>
        </div>
      `;
    });

    // Atualiza título/contador também
    carregarMes();
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
    if (mesStatus === "finalizado") {
      alert("Mês finalizado. Não é possível duplicar.");
      return;
    }

    const origemRef = doc(db, "meses", mesId, "pneus", pneuId);
    const snap = await getDoc(origemRef);
    if (!snap.exists()) return alert("Pneu não encontrado.");

    const origem = snap.data();
    const novoNumero = await gerarNumeroPneu();

    await addDoc(collection(db, "meses", mesId, "pneus"), {
      ...origem,
      numero: novoNumero,
      status: "em_andamento",
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    });

    await updateDoc(doc(db, "meses", mesId), { totalPneus: increment(1) });

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
  const ok = confirm("Deseja realmente excluir este pneu?");
  if(!ok) return;

  const mesId = localStorage.getItem("mesAtual");
  if(!mesId){
    alert("Mês atual não identificado.");
    return;
  }

  const mesRef      = doc(db, "meses", mesId);
  const pneuRef     = doc(db, "meses", mesId, "pneus", pneuId);
  const contadorRef = doc(db, "config", "contadorPneus"); // ajuste se seu caminho for outro

  try{
    await runTransaction(db, async (tx) => {
      // (opcional mas recomendado) garantir que o contador existe
      const contadorSnap = await tx.get(contadorRef);
      if(!contadorSnap.exists()){
        throw new Error("Crie config/contadorPneus!");
      }

      // apaga o pneu
      tx.delete(pneuRef);

      // decrementa contador do mês
      tx.update(mesRef, { totalPneus: increment(-1) });

      // decrementa contador global
      tx.update(contadorRef, { total: increment(-1) });
    });

    alert("Pneu excluído e contador atualizado.");

    // recarrega a lista (precisa existir no seu arquivo)
    if(typeof carregarPneus === "function") carregarPneus();

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
    const mesId = localStorage.getItem("mesAtual");
    const usuario = localStorage.getItem("usuario") || "—";

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
      linhas.push(`Nome;${limparCSV(p.onde?.nome || "")}`);
      linhas.push(`Razao social;${limparCSV(p.onde?.razao || "")}`);
      linhas.push(`Endereco;${limparCSV(p.onde?.endereco || "")}`);
      linhas.push("");

      linhas.push("--- CARACTERISTICAS DO PNEU ---");
      linhas.push(`Marca;${limparCSV(p.caracteristicas?.marca || "")}`);
      linhas.push(`Medida;${limparCSV(p.caracteristicas?.medida || "")}`);
      linhas.push(`Desenho;${limparCSV(p.caracteristicas?.desenho || "")}`);
      linhas.push(`Profundidade;${limparCSV(p.caracteristicas?.profundidade || "")}`);
      linhas.push(`Vida;${limparCSV(p.caracteristicas?.vida || "")}`);
      linhas.push("");

      linhas.push("--- INFORMACOES DO PNEU ---");
      linhas.push(`DOT;${limparCSV(p.info?.dot || "")}`);
      linhas.push(`Numero de fogo;${limparCSV(p.info?.fogo || "")}`);
      linhas.push(`Cliente;${limparCSV(p.info?.cliente || "")}`);
      linhas.push(`Data;${limparCSV(p.info?.data || "")}`);
      linhas.push(`Mes de referencia;${limparCSV(p.info?.mesReferencia || "")}`);
      linhas.push(`Avaria;${limparCSV(p.info?.avaria || "")}`);
      linhas.push(`Causa;${limparCSV(p.info?.causa || "")}`);
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

/* =========================
   Render Cards
========================= */

function renderCardPneu(pneuId, p) {
  const c = p.caracteristicas || {};

  const marca = c.marca || "—";
  const medida = c.medida || "";
  const desenho = c.desenho || "—";
  const profundidade = c.profundidade || "—";
  const vida = c.vida || "—";

  const status = p.status || "em_andamento";
  const badge =
    status === "finalizado"
      ? `<span class="text-xs px-2 py-1 rounded bg-green-100 text-green-700">Finalizado</span>`
      : `<span class="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-700">Em andamento</span>`;

  return `
    <div class="bg-white p-5 rounded-2xl shadow">
      <div class="flex justify-between items-start gap-3">
        <div>
          <div class="flex items-center gap-2">
            <p class="text-sm text-slate-500">#${p.numero || "—"}</p>
            ${badge}
          </div>

          <p class="font-bold text-lg mt-1">
            ${marca} ${medida}
          </p>

          <p class="text-sm text-slate-600 mt-1">
            ${desenho} • ${profundidade} • ${vida}
          </p>
        </div>

        <button
          onclick="excluirPneu('${pneuId}')"
          class="text-red-600 hover:text-red-700 text-xl leading-none"
          title="Excluir"
        >
          🗑️
        </button>
      </div>

      <div class="flex gap-2 mt-4">
        <button
          onclick="abrirPneu('${pneuId}')"
          class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-xl"
        >
          Abrir
        </button>

        <button
          onclick="duplicarPneu('${pneuId}')"
          class="flex-1 bg-slate-700 hover:bg-slate-800 text-white py-2 rounded-xl"
        >
          Duplicar
        </button>
      </div>
    </div>
  `;
}


carregarMes();
iniciarListaRealtime();
