# Temas e configuração online — 6.8.1

## Catálogo instalado

O JSON incluído possui schema 1, revisão 4 e 13 temas. A revisão do catálogo é independente da versão do pacote. O servidor pode publicar revisões posteriores; este documento descreve a cópia versionada no Git.

| ID | Nome | Estilo local |
|---|---|---|
| `padrao` | Padrão | simples |
| `homem-aranha` | Homem Aranha | simples |
| `got` | Game of Thrones | simples |
| `seguranca` | Segurança / Cyber | simples |
| `homem-de-ferro` | Homem de Ferro | simples |
| `dark-puro` | Dark Puro | simples |
| `caveiras` | Caveiras / Punisher | simples |
| `dark-mode` | Dark Mode | simples |
| `fullmetal-alchemist` | Fullmetal Alchemist | metal |
| `aurora` | Aurora | aurora |
| `league-of-legends` | LoL · Hextech | hextech |
| `fluminense` | Fluminense | tricolor |
| `nuvens` | Nuvens | nuvens |

Fullmetal combina bronze envelhecido, superfícies de aço, molduras e símbolos SVG locais. Nuvens usa desenho vetorial com gradientes/sombras para volume 3D, sem cena tridimensional WebGL. LoL usa os retratos locais abaixo; não busca avatares em tempo de uso.

| Analista | Campeão |
|---|---|
| Natalie | Morgana |
| Cássio | Graves |
| Evangela | Ahri |
| Gabriel | Garen |
| Kazaf | Yasuo |
| Rayla | Lux |
| Abigail | Ashe |
| Alisson | Ekko |

Arquivos e créditos: `extension/assets/lol/analistas.json` e `CREDITOS.txt`. Trocar esses PNGs ou acrescentar efeitos inexistentes exige atualizar arquivos locais.

## Preferência e isolamento

`filaPreferenciasVisuais` conserva as escolhas com mapa `porAnalista`, com compatibilidade para a preferência antiga. A escolha vale neste navegador; não é sincronização universal entre computadores. Tema fixo de equipe tem prioridade sem apagar a preferência individual. Se o tema sair do catálogo, o padrão é usado preservando o ID salvo para uma possível volta.

`afTemaNotificacoes` projeta o tema do destinatário para os avisos. Balões usam Shadow DOM e valores validados; a aparência de um evento de outro analista não troca seu tema. Estilos de conteúdo do tema não são aplicados globalmente ao site AF.

## Publicar uma paleta online

1. Obtenha o catálogo atual por acesso administrativo autorizado e preserve IDs existentes.
2. Edite apenas dados suportados; valide com o normalizador do cliente mais antigo ainda atendido.
3. Aumente `revisao`.
4. Em uma transação, grave o documento na chave `temas_catalogo_v1` de `public.fila_config` e a mesma revisão textual em `temas_catalogo_revisao`.
5. Consulte pela RPC autenticada `fila_temas_catalogo` e teste **Atualizar temas** em ambiente de desenvolvimento.
6. Verifique o tema escolhido, o cache offline e um cliente antigo antes da publicação operacional.

O painel observa a revisão na sincronização. O documento inteiro só é consultado por mudança de revisão, ausência de cópia correspondente ou atualização manual. Falhas automáticas aguardam 30 s antes de nova tentativa e não interrompem a fila. Cache é separado por contexto derivado de hash; conteúdo inválido ou antigo não substitui a última cópia válida.

### Formato aceito

- `schema=1`; revisão inteira segura e não negativa; publicação online deve crescer.
- Entre 1 e 50 temas, documento de até 98.304 caracteres serializados.
- `id` único de até 48 caracteres, minúsculas/números/hífen; `local` é reservado.
- `nome` não vazio de até 60 caracteres; `icone` limitado a 6 pontos de código; `descricao` limitada a 180 caracteres. Todos são texto, não HTML.
- `modo`: `claro` ou `escuro`; `estilo`: simples, metal, aurora, hextech, tricolor ou nuvens.
- `pulso` booleano, `energia` hexadecimal de seis dígitos e `novo` booleano.
- `cores`: somente chaves reconhecidas em `FilaAparencia.CORES`, em `#rrggbb`. Obrigatórias: fundo, cartao, texto, texto_secundario, primaria, destaque, borda e link.

CSS, JavaScript, HTML, fontes e URLs de imagem não fazem parte do catálogo. Um estilo não reconhecido cai no padrão permitido pelo cliente. Publicar dados não instala um novo renderer.

## Configuração declarativa do painel

A chave `cliente_config_v1` oferece `schema`, `revisao`, `leitura_ms` e `layout`. O cliente valida tamanho e valores em `normalizarCliente()`.

| Opção | Limite/opções |
|---|---|
| Leitura | Inteiro de 2.000 a 60.000 ms |
| Título | Texto não vazio, até 80 caracteres |
| Fonte | 11–20 px |
| Espaçamento | 4–20 px |
| Margem | 4–24 px |
| Raio | 0–20 px |
| Largura máxima | 320–1.200 px quando informada |
| Cabeçalho | linha ou coluna |
| Cartões | lista ou grade |
| Ordem | Apenas blocos conhecidos, sem duplicações |
| Cores | Apenas chaves reconhecidas e valores hexadecimais |

Blocos conhecidos: cabecalho, status, conexao, identificacao, abas, gestao, analistas, pedidos. A configuração não autoriza inserir scripts ou criar controles arbitrários. Alterar o título visual não altera o nome do manifesto no navegador.

## Animação pessoal de novo pedido

Configuração administrativa em `animacoes_pedido_v1`:

```json
{
  "schema": 1,
  "revisao": 1,
  "ativo": true,
  "duracao_ms": 3200,
  "temas": {
    "nuvens": {"efeito": "nuvens", "cor": "#277ca8", "duracao_ms": 2000}
  },
  "analistas": {
    "Gabriel": {"ativo": false}
  }
}
```

Efeito, cor e duração: opção do analista prevalece sobre tema, depois padrão. OFF em qualquer nível prevalece sobre ON. Grafia dos nomes deve ser exata, inclusive Cássio. Duração aceita: 1.200–6.000 ms; cor de seis dígitos. Efeitos instalados: pulso, nuvens, alquimia, hextech, tricolor, aurora, teia, chamas, gelo e caveira.

O worker consulta com intervalo mínimo de 2 s por contexto; superfícies visíveis disparam a consulta. O painel usa a sincronização normal e o motor de página usa cadência de 5 s. A primeira consulta estabelece baseline sem animar pedido existente. Eventos com mais de 90 s são descartados; um aviso pendente vence em 30 s. Consumo é único por evento no navegador, serializado entre superfícies; instalações distintas são independentes. Um iframe recolhido não deve consumir o efeito visível.

Não há editor dessa configuração em Gestão, som, abertura automática de pedido ou garantia de push com navegador/telas fechados. Movimento reduzido preserva texto estático. OFF remoto encerra o efeito após a próxima consulta e não reproduz eventos antigos ao reativar.

## O que pode chegar sem outro ZIP

| Alteração | Via dados online com o motor já instalado? |
|---|---|
| Cores, nome e descrição de tema suportado | Sim |
| Novo tema que combina estilos locais existentes | Sim, respeitando normalizador e versão dos clientes |
| Duração/cor/ativação de efeito instalado | Sim |
| Título, espaçamento e ordem de blocos suportados | Sim |
| Nova imagem, campeão ou animação inexistente | Não; atualizar recursos/código |
| Nova permissão ou comportamento de navegador | Não; atualizar manifesto/código |
| Nova RPC exigida pelo fluxo | Backend precisa ser implantado e cliente precisa já saber chamá-la |

A publicação no GitHub é versionamento do projeto; não instala a extensão nos computadores dos analistas.
