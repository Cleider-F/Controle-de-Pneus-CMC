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

const MESES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
];

function badgeStatus(status) {
  return status === "finalizado"
    ? `<span class="text-xs px-2 py-1 rounded bg-green-100 text-green-700">Finalizado</span>`
    : `<span class="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-700">Em andamento</span>`;
}

function toggleStatusHTML(mesId, status) {
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
          ${toggleStatusHTML(id, status)}
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

/* ========= LISTAR MESES (REALTIME) ========= */
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
      console.error("ERRO onSnapshot meses:", err);
      alert("Erro ao carregar meses. Veja o console (F12).");
    }
  );
}

/* ========= CRIAR MÊS (SELETOR MÊS/ANO) ========= */
window.criarMesUI = function () {
  // input month invisível (abre seletor do browser)
  const input = document.createElement("input");
  input.type = "month";
  input.style.position = "fixed";
  input.style.left = "-9999px";
  input.style.top = "0";
  document.body.appendChild(input);

  const cleanup = () => {
    try { document.body.removeChild(input); } catch {}
  };

  input.addEventListener("change", async (e) => {
    const valor = e.target.value; // "2026-02"
    if (!valor) return cleanup();

    const [anoStr, mesStr] = valor.split("-");
    const ano = Number(anoStr);
    const mesNumero = Number(mesStr); // 1..12
    const nome = `${MESES[mesNumero - 1]} / ${ano}`;

    try {
      console.log("Criando mês:", nome, { ano, mes: mesNumero });

      await addDoc(collection(db, "meses"), {
        nome,
        ano,
        mes: mesNumero,
        criadoEm: serverTimestamp(),
        totalPneus: 0,
        status: "em_andamento"
      });

      alert("Mês criado: " + nome);
    } catch (err) {
      console.error("ERRO ao criar mês:", err);
      alert("Não foi possível criar o mês. Veja o console (F12).");
    } finally {
      cleanup();
    }
  });

  // fallback se o browser bloquear o month-picker
  input.addEventListener("cancel", cleanup);
  input.click();
};

/* ========= TOGGLE STATUS ========= */
window.toggleStatusMes = async function (mesId, statusAtual) {
  try {
    const novo = statusAtual === "finalizado" ? "em_andamento" : "finalizado";
    await updateDoc(doc(db, "meses", mesId), {
      status: novo,
      atualizadoEm: serverTimestamp()
    });
  } catch (err) {
    console.error("ERRO ao alternar status:", err);
    alert("Erro ao alterar status. Veja o console (F12).");
  }
};

/* ========= EXCLUIR MÊS ========= */
window.excluirMes = async function (mesId) {
  if (!confirm("Excluir este mês? (o documento do mês será removido)")) return;

  try {
    await deleteDoc(doc(db, "meses", mesId));
  } catch (err) {
    console.error("ERRO ao excluir mês:", err);
    alert("Erro ao excluir mês. Veja o console (F12).");
  }
};

/* ========= ABRIR ========= */
window.abrirMes = function (id) {
  localStorage.setItem("mesAtual", id);
  window.location.href = "./mes.html";
};
