const container = document.createElement("div");
container.id = "fila-pedidos-container";

const iframe = document.createElement("iframe");
iframe.id = "fila-pedidos-frame";
// Carrega o seu popup.html existente para dentro da página atual
iframe.src = chrome.runtime.getURL("popup.html");

container.appendChild(iframe);
document.body.appendChild(container);
