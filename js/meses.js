import {
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
  where,
  limit,
  getDocs,
  writeBatch,
  doc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import {
  ref as storageRef,
  deleteObject
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";

import { db, storage } from "./firebase.js";
import { authReady } from "./authGuard.js?v=20260531-2";

await authReady;

const MESES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
];

function escapeHTML(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function badgeStatus(status) {
  return status === "finalizado"
    ? `<span class="badge success">Finalizado</span>`
    : `<span class="badge warning">Em andamento</span>`;
}

function toggleHTML(mesId, status) {
  const finalizado = status === "finalizado";

  if (finalizado) {
    return `
      <button
        class="toggle-shell on"
        disabled
        title="Mês finalizado"
      >
        <span></span>
      </button>
    `;
  }

  return `
    <button
      class="toggle-shell"
      onclick="toggleStatusMes('${mesId}', '${status || "em_andamento"}')"
      title="Finalizar mês"
    >
      <span></span>
    </button>
  `;
}

function cardMesHTML(id, mes) {
  const status = mes.status || "em_andamento";
  const finalizado = status === "finalizado";
  const nome = escapeHTML(mes.nome || "—");
  const totalPneus = Number(mes.totalPneus || 0);

  return `
    <div class="app-card">
      <div class="flex justify-between items-start gap-3">
        <div>
          <h3>${nome}</h3>
          <div class="card-meta mt-3">
            ${badgeStatus(status)}
            <span>Pneus: ${totalPneus}</span>
          </div>
        </div>

        <button
          onclick="excluirMes('${id}')"
          class="app-btn danger icon-only"
          title="Excluir mês"
          aria-label="Excluir mês"
        ><i data-lucide="trash-2"></i></button>
      </div>

      <div class="card-actions">
        <div class="flex items-center gap-2">
          <span class="text-sm text-slate-500 font-semibold">Status</span>
          ${toggleHTML(id, status)}
        </div>

        <button
          onclick="abrirMes('${id}')"
          class="app-btn blue"
        >
          <i data-lucide="${finalizado ? "eye" : "folder-open"}"></i>
          ${finalizado ? "Visualizar" : "Abrir"}
        </button>
      </div>
    </div>
  `;
}

/* ========= INIT ========= */
function iniciarMeses() {
  const grid = document.getElementById("gridMeses");

  // Se não for a página app.html, não executa nada (evita erro no mobile abrindo outra página)
  if (!grid) {
    console.warn("gridMeses não encontrado — meses.js não será executado nesta página.");
    return;
  }

  // Listagem realtime
  const q = query(collection(db, "meses"), orderBy("criadoEm", "desc"));
  onSnapshot(
    q,
    (snap) => {
      grid.innerHTML = "";
      snap.forEach((d) => {
        grid.innerHTML += cardMesHTML(d.id, d.data());
      });
      if (snap.empty) {
        grid.innerHTML = `<div class="empty-state col-span-full">Nenhum mês criado ainda.</div>`;
      }
      if (window.lucide) window.lucide.createIcons();
    },
    (err) => {
      console.error("ERRO ao carregar meses:", err);
      alert("Erro ao carregar meses. Veja o console (F12).");
    }
  );

  // Modal + selects: pega aqui, depois do DOM existir
  const modal = document.getElementById("modalMes");
  const selMes = document.getElementById("selMes");
  const selAno = document.getElementById("selAno");

  function popularAnos() {
    const agora = new Date();
    const anoAtual = agora.getFullYear();
    const inicio = anoAtual - 2;
    const fim = anoAtual + 5;

    selAno.innerHTML = "";
    for (let a = inicio; a <= fim; a++) {
      const opt = document.createElement("option");
      opt.value = String(a);
      opt.textContent = String(a);
      if (a === anoAtual) opt.selected = true;
      selAno.appendChild(opt);
    }
  }

  window.abrirModalMes = function () {
    if (!modal || !selMes || !selAno) {
      alert("Modal não encontrado nesta página. Abra o app.html.");
      console.error("modalMes/selMes/selAno não encontrados", { modal, selMes, selAno });
      return;
    }

    popularAnos();
    selMes.value = String(new Date().getMonth() + 1);
    modal.classList.remove("hidden");
    if (window.lucide) window.lucide.createIcons();
  };

  window.fecharModalMes = function () {
    if (!modal) return;
    modal.classList.add("hidden");
  };

  window.confirmarCriarMes = async function () {
    if (!selMes || !selAno) return;

    const mesNumero = Number(selMes.value);
    const ano = Number(selAno.value);

    if (!mesNumero || mesNumero < 1 || mesNumero > 12 || !ano) {
      return alert("Selecione mês e ano.");
    }

    const nome = `${MESES[mesNumero - 1]} / ${ano}`;

    try {
      const existente = await getDocs(
        query(
          collection(db, "meses"),
          where("mes", "==", mesNumero),
          where("ano", "==", ano),
          limit(1)
        )
      );

      if (!existente.empty) {
        return alert("Este mês já foi criado.");
      }

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
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", iniciarMeses, { once: true });
} else {
  iniciarMeses();
}

async function excluirFotos(urls) {
  const unicas = [...new Set(urls.filter(Boolean))];
  const exclusoes = unicas.map(async (url) => {
    try {
      await deleteObject(storageRef(storage, url));
    } catch (err) {
      console.warn("Não foi possível excluir uma foto do Storage:", err);
    }
  });

  await Promise.allSettled(exclusoes);
}

async function excluirDocsEmLotes(refs) {
  const tamanhoLote = 450;

  for (let i = 0; i < refs.length; i += tamanhoLote) {
    const batch = writeBatch(db);
    refs.slice(i, i + tamanhoLote).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

/* ========= ações globais ========= */
window.toggleStatusMes = async function (mesId, statusAtual) {
  try {
    if (statusAtual === "finalizado") {
      alert("Mês finalizado não pode ser reaberto.");
      return;
    }

    if (!confirm("Finalizar este mês? Depois disso os pneus ficarão somente leitura.")) return;

    await updateDoc(doc(db, "meses", mesId), {
      status: "finalizado",
      atualizadoEm: serverTimestamp()
    });
  } catch (err) {
    console.error("ERRO ao alterar status:", err);
    alert("Erro ao alterar status. Veja o console (F12).");
  }
};

window.excluirMes = async function (mesId) {
  if (!confirm("Excluir este mês e todos os pneus vinculados?")) return;

  try {
    const pneusSnap = await getDocs(collection(db, "meses", mesId, "pneus"));
    const urlsFotos = [];
    const refsParaExcluir = [];

    pneusSnap.forEach((pneuDoc) => {
      refsParaExcluir.push(pneuDoc.ref);
      const fotos = pneuDoc.data()?.fotos;
      if (Array.isArray(fotos)) urlsFotos.push(...fotos);
    });

    await excluirFotos(urlsFotos);
    refsParaExcluir.push(doc(db, "meses", mesId));
    await excluirDocsEmLotes(refsParaExcluir);
  } catch (err) {
    console.error("ERRO ao excluir mês:", err);
    alert("Erro ao excluir mês. Veja o console (F12).");
  }
};

window.abrirMes = function (id) {
  localStorage.setItem("mesAtual", id);
  window.location.href = "./mes.html";
};

