export function abrirMes(mesId) {
  localStorage.setItem("mesAtual", mesId);
  window.location.href = "./mes.html";
}

export function renderMain() {
  console.warn("js/ui.js é legado. A listagem principal é renderizada por js/meses.js.");
}

window.uiAbrirMes = abrirMes;
