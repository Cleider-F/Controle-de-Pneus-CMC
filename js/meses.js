import {
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
  doc,
  updateDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import { db } from "./firebase.js";

const grid = document.getElementById("gridMeses");

const modal = document.getElementById("modalMes");
const mesPicker = document.getElementById("mesPicker");

const MESES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
];

function badgeStatus(status) {
  return status === "finalizado"
    ? `<span class="text-xs px-2 py-1 rounded bg-green-100 text-green-700">Finalizado</span>`
    : `<span class="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-700">Em andamento</span>`;
}

function toggleHTML(mesId, status) {
  const finalizado = status === "finalizado";
  return `
    <button
      class="relative w-14 h-8 rounded-full transition ${finalizado ? "bg-green-600" : "bg-slate-300 opacity-80"}"
      onclick="toggleStatusMes('${mesId}', '${status || "em_andamento"}')"
      title="Alternar status"
    >
      <span
        class="absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-all shadow
        ${finalizado ? "translate-x-6" : "translate-x-0"}"
      ></span>
    </button>
  `;
}

function cardMesHTML(id, mes) {
  const status = mes.status || "em_andamento";
  const finalizado = status === "finalizado";

  return `
    <div class="bg-white p-6 rounded-2xl shadow flex flex-col gap-4">
      <div class="flex justify-between items-start gap-3">
        <div>
          <h2 class="text-xl font-bold">${mes.nome || "—"}</h2>
          <div class="mt-2 flex items-center gap-2">
            ${badgeStatus(status)}
            <span class="text-sm text-slate-500">• Pneus: ${mes.totalPneus || 0}</span>
          </div>
        </div>

        <button
          onclick="excluirMes('${id}')"
          class="text-red-600 hover:text-red-700 text-xl leading-none"
          title="Excluir mês"
        >🗑️</button>
      </div>

      <div class="flex justify-between items-center">
        <div class="flex items-center gap-2">
          <span class="text-sm text-slate-500">Status</span>
          ${toggleHTML(id, status)}
        </div>

        <button
          onclick="abrirMes('${id}')"
          class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl"
        >
          ${finalizado ? "Visualizar" : "Abrir"}
        </button>
      </div>
    </div>
  `;
}

/* ===== LISTAGEM realtime ===== */
if (grid) {
  const q = query(collection(db, "meses"), orderBy("criadoEm", "desc"));

  onSnapshot(
    q,
    (snap) => {
      grid.innerHTML = "";
      snap.forEach((d) => {
        grid.innerHTML += cardMesHTML(d.id, d.data());
      });
    },
    (err) => {
      console.error("ERRO ao carregar meses:", err);
      alert("Erro ao carregar meses. Veja o console (F12).");
    }
  );
}

/* ===== MODAL ===== */
window.abrirModalMes = function () {
  if (!modal || !mesPicker) return alert("Modal não encontrado.");
  mesPicker.value = ""; // limpa
  modal.classList.remove("hidden");
  mesPicker.focus();
};

window.fecharModalMes = function () {
  if (!modal) return;
  modal.classList.add("hidden");
};

window.confirmarCriarMes = async function () {
  const valor = (mesPicker?.value || "").trim(); // "2026-02"
  if (!valor) return alert("Selecione (ou digite) mês/ano.");

  // valida formato básico
  const ok = /^\d{4}-\d{2}$/.test(valor);
  if (!ok) return alert("Formato inválido. Use: 2026-02");

  const [anoStr, mesStr] = valor.split("-");
  const ano = Number(anoStr);
  const mesNumero = Number(mesStr);

  if (!ano || mesNumero < 1 || mesNumero > 12) {
    return alert("Mês/ano inválido.");
  }

  const nome = `${MESES[mesNumero - 1]} / ${ano}`;

  try {
    await addDoc(collection(db, "meses"), {
      nome,
      ano,
      mes: mesNumero,
      criadoEm: serverTimestamp(),
      totalPneus: 0,
      status: "em_andamento"
    });

    window.fecharModalMes();
  } catch (err) {
    console.error("ERRO ao criar mês:", err);
    alert("Não foi possível criar o mês. Veja o console (F12).");
  }
};

/* ===== TOGGLE STATUS ===== */
window.toggleStatusMes = async function (mesId, statusAtual) {
  try {
    const novo = statusAtual === "finalizado" ? "em_andamento" : "finalizado";
    await updateDoc(doc(db, "meses", mesId), {
      status: novo,
      atualizadoEm: serverTimestamp()
    });
  } catch (err) {
    console.error("ERRO ao alterar status:", err);
    alert("Erro ao alterar status. Veja o console (F12).");
  }
};

/* ===== EXCLUIR MÊS ===== */
window.excluirMes = async function (mesId) {
  if (!confirm("Excluir este mês? (o documento do mês será removido)")) return;

  try {
    await deleteDoc(doc(db, "meses", mesId));
  } catch (err) {
    console.error("ERRO ao excluir mês:", err);
    alert("Erro ao excluir mês. Veja o console (F12).");
  }
};

/* ===== ABRIR ===== */
window.abrirMes = function (id) {
  localStorage.setItem("mesAtual", id);
  window.location.href = "./mes.html";
};
