export function save(data) {
  if (data === undefined) {
    console.warn("save(data) chamado sem dados. Nada foi salvo.");
    return;
  }

  localStorage.setItem("tire_app_v2", JSON.stringify(data));
}
