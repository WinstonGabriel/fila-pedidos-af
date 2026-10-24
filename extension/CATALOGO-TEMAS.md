# Catálogo de temas online — AF Operação 6.8.1

O pacote contém 13 temas, schema 1 e revisão 4. O leitor consulta dados declarativos pelo RPC autenticado `fila_temas_catalogo`; scripts, CSS, imagens e novos comportamentos continuam empacotados localmente.

A referência atual de formato, limites, preferências por analista, publicação, efeitos e configuração de layout está em [Temas e configuração online](../docs/TEMAS-E-CONFIGURACAO.md). Para uso cotidiano, veja o [Manual do analista](../docs/MANUAL-DO-ANALISTA.md).

Arquivos principais: `catalogo-temas.json`, `aparencia.js`, `catalogo-temas.js`, `temas.js` e `temas.css`. As atualizações SQL ficam em `database/updates/` na raiz do repositório; não existe a antiga pasta `backend/` nesta organização. Não execute scripts de dados antigos sobre um catálogo mais recente sem comparar a revisão e os IDs existentes.

Os estilos reconhecidos nesta versão são simples, metal, aurora, hextech, tricolor e nuvens. A escolha pessoal fica em `filaPreferenciasVisuais`; o tema fixo de equipe pode prevalecer sem apagá-la. O catálogo não aceita HTML, CSS, JavaScript, fontes ou URLs arbitrárias. A última cópia válida é mantida em falhas e na abertura offline.
