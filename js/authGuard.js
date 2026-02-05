if(localStorage.getItem("logado") !== "true"){
    window.location.href = "./index.html";
}

window.logout = function () {
  localStorage.clear();
  window.location.href = "./index.html";
};