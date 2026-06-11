// Regenera engine-esm.js (modulo ES para la Edge Function) reutilizando la cabecera DATA
// existente y metiendo el cuerpo ACTUAL del motor (engine.js). Asi server == navegador.
const fs = require("fs");
const esm = fs.readFileSync("engine-esm.js", "utf8");
const marker = "const ENGINE=(function(DATA){";
const hdrEnd = esm.indexOf(marker);
if (hdrEnd < 0) throw new Error("no encuentro la cabecera DATA en engine-esm.js");
const header = esm.slice(0, hdrEnd);
const src = fs.readFileSync("engine.js", "utf8");
const startMarker = "})(this, function (DATA) {";
const si = src.indexOf(startMarker);
if (si < 0) throw new Error("no encuentro el factory en engine.js");
let body = src.slice(si + startMarker.length);
body = body.slice(0, body.lastIndexOf("});"));
const out = header + "const ENGINE=(function(DATA){\n" + body + "})(DATA);\n\nexport { DATA, ENGINE };\n";
fs.writeFileSync("engine-esm.js", out);
console.log("engine-esm.js regenerado:", out.length, "bytes");
