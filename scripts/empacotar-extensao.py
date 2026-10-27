"""Cria ZIP operacional e verifica a inicialização dos arquivos realmente empacotados."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--navegador', choices=['chrome', 'opera'], default='chrome')
parser.add_argument('--saida', required=True, type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
ext = root / 'extension'
if not (ext / 'config.js').is_file():
    parser.error('Configure extension/config.js com a URL e chave pública anon antes de gerar um pacote operacional.')
manifest_name = 'manifest.json' if args.navegador == 'chrome' else 'manifest.opera.json'
manifest = json.loads((ext / manifest_name).read_text())
if args.navegador == 'chrome':
    assert 'sidebar_action' not in manifest, 'Configuração Opera não pode entrar no manifesto Chrome'
files = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z', 'extension'], cwd=root).decode().split('\0')
files = sorted({p for p in files if p and Path(p).name not in ['config.js', 'manifest.json', 'manifest.opera.json']})
out = args.saida.resolve()
out.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for p in files:
        z.write(root / p, Path(p).relative_to('extension').as_posix())
    z.write(ext / manifest_name, 'manifest.json')
    z.write(ext / 'config.js', 'config.js')
with zipfile.ZipFile(out) as z, tempfile.TemporaryDirectory(prefix='af-pacote-') as temp:
    assert z.testzip() is None, 'ZIP corrompido'
    z.extractall(temp)
    subprocess.run(['node', str(root / 'tests/background-bootstrap.cjs'), temp], check=True)
print(json.dumps({'arquivo':str(out), 'bytes':out.stat().st_size, 'versao':manifest['version'], 'navegador':args.navegador, 'configuracao_incluida':True}))
