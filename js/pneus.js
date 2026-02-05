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
    const snap = await getDocs(collection(db, "meses", mesId, "pneus"));

    if (snap.empty) {
      alert("Não há pneus para exportar.");
      return;
    }

    const header = [
      "numero",
      "status",
      "planejamento_como",
      "planejamento_instrucoes",
      "quando_inicio",
      "quando_fim",
      "onde_nome",
      "onde_razaoSocial",
      "onde_endereco",
      "caracteristicas_marca",
      "caracteristicas_medida",
      "caracteristicas_desenho",
      "caracteristicas_profundidade",
      "caracteristicas_vida",
      "info_dot",
      "info_numeroFogo",
      "info_cliente",
      "info_data",
      "info_mesReferencia",
      "info_avaria",
      "info_causa",
      "fotos_urls"
    ];

    const linhas = [header.join(";")];

    snap.forEach((d) => {
      const p = d.data();

      const row = [
        p.numero,
        p.status,
        p.planejamento?.como,
        p.planejamento?.instrucoes,
        p.quando?.inicio,
        p.quando?.fim,
        p.onde?.nome,
        p.onde?.razaoSocial,
        p.onde?.endereco,
        p.caracteristicas?.marca,
        p.caracteristicas?.medida,
        p.caracteristicas?.desenho,
        p.caracteristicas?.profundidade,
        p.caracteristicas?.vida,
        p.informacoesPneu?.dot,
        p.informacoesPneu?.numeroFogo,
        p.informacoesPneu?.cliente,
        p.informacoesPneu?.data,
        p.informacoesPneu?.mesReferencia,
        p.informacoesPneu?.avaria,
        p.informacoesPneu?.causa,
        (p.fotos || []).join(" | ")
      ].map(escapeCSV);

      linhas.push(row.join(";"));
    });

    const csv = "\uFEFF" + linhas.join("\n"); // BOM p/ Excel pt-br
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `mes_${mesId}_pneus.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error(e);
    alert("Erro ao exportar CSV.");
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
