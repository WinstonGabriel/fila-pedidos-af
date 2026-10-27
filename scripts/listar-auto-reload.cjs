const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../extension'), destino = path.join(root, 'auto-reload-arquivos.json');
const arquivos = fs.readdirSync(root).filter(p => /\.(js|css|html|json)$/.test(p) && !['config.example.js', 'manifest.opera.json', 'auto-reload-arquivos.json'].includes(p));
if (!arquivos.includes('config.js')) arquivos.push('config.js');
arquivos.push('assets/lol/analistas.json');
const conteudo = JSON.stringify({schema: 1, arquivos: arquivos.sort()}, null, 2) + '\n';
if (process.argv.includes('--escrever')) fs.writeFileSync(destino, conteudo);
else assert.equal(fs.readFileSync(destino, 'utf8'), conteudo, 'Atualize o índice local: node scripts/listar-auto-reload.cjs --escrever');
