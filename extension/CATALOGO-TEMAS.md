# Catálogo de temas online — versão 6.2.0

Esta versão instala o leitor do catálogo uma única vez. As próximas paletas e opções chegam pelo servidor; o código da extensão, os ícones da barra, componentes novos e efeitos que ainda não existem continuam exigindo uma atualização de código.

O catálogo inicial contém os sete temas anteriores e três opções novas: **Dark Mode**, **Fullmetal Alchemist** e **Aurora**. A cópia incluída em `aparencia.js` garante que todas as opções iniciais funcionem sem rede. O JSON legível está em `catalogo-temas.json`.

## Fluxo de publicação

1. Parta do catálogo atual do servidor e preserve os identificadores existentes.
2. Adicione ou altere temas seguindo o formato do JSON incluído no pacote.
3. Aumente `revisao` para um número inteiro maior do que o publicado.
4. Em uma única transação administrativa, grave o JSON em `public.fila_config`, na chave `temas_catalogo_v1`, e o mesmo número de revisão, como texto, na chave `temas_catalogo_revisao`.

O painel consulta a revisão durante a sincronização normal. O catálogo completo é obtido pelo RPC `fila_temas_catalogo` somente quando há uma alteração, quando não existe cópia local correspondente ou quando a pessoa clica em **Atualizar temas**. Uma falha nessa consulta não interrompe a fila nem a distribuição de pedidos. Falhas repetidas aguardam trinta segundos antes de uma nova tentativa automática.

`backend/catalogo-temas.sql` registra a consulta autenticada e a revisão inicial. O script é idempotente e não substitui um catálogo já cadastrado por uma versão antiga. Ele já foi aplicado ao sistema conectado nesta entrega; não é necessário executar novamente para usar a extensão.

## Formato aceito

- `schema`: `1`.
- `revisao`: inteiro não negativo. Para uma publicação online, use um inteiro positivo e crescente.
- `temas`: entre 1 e 50 itens; limite total de 98.304 caracteres.
- Cada item tem `id` único de até 48 caracteres, com letras minúsculas, números e hífen. `local` é reservado.
- `nome`, `icone` e `descricao` são texto. Nunca são interpretados como HTML.
- `modo`: `claro` ou `escuro`.
- `estilo`: `simples`, `metal` ou `aurora`. Novos temas podem combinar as paletas e os efeitos já suportados.
- `pulso`: booleano; habilita o pulso suave dos cartões de atenção. A preferência de redução de movimento do sistema desativa a animação.
- `energia`: cor hexadecimal de seis dígitos para o brilho, por exemplo `#e63946`.
- `novo`: booleano para mostrar a etiqueta **Novo**.
- `cores`: mapa com as chaves declaradas em `FilaAparencia.CORES`, sempre em `#rrggbb`. Os campos `fundo`, `cartao`, `texto`, `texto_secundario`, `primaria`, `destaque`, `borda` e `link` são obrigatórios; os demais usam padrões conforme o modo.

O catálogo não aceita CSS, URLs de imagens, fontes remotas, HTML nem scripts. As texturas e animações estão no código instalado. O servidor publica somente dados declarativos. A consulta usa a mesma validação de código da equipe já adotada pela fila; nenhuma credencial administrativa foi adicionada ao cliente.

## Preferências e disponibilidade

A escolha pessoal permanece em `filaPreferenciasVisuais`. O catálogo tem uma chave de armazenamento separada e contexto identificado por SHA-256. Uma mudança de equipe ou instalação não reaproveita a cópia de outra equipe.

Ao receber um catálogo inválido, incompatível ou de revisão anterior, a extensão mantém a última cópia válida. Se um tema escolhido sair temporariamente do catálogo, o painel usa o tema padrão e preserva o identificador salvo; quando o tema voltar, a escolha é restaurada.

O tema definido para a equipe tem prioridade visual, mas não apaga a escolha individual. As cores e o catálogo se aplicam apenas ao documento do painel da extensão. Nenhum estilo é inserido na página do AF.

## Validação

`node tests/catalogo-integration.cjs` executa os testes de integração simulados com os módulos reais do painel e um RPC controlado. Inclui publicação de tema novo durante o uso, atualização da paleta selecionada, persistência, abertura offline, rejeição de dados inválidos, revisão antiga, texto com marcação, falha ao salvar e preservação da escolha pessoal sob tema da equipe.

As três novas paletas foram verificadas por cálculo de contraste para texto principal, texto secundário e texto dos botões: todas atingem ao menos 4,5:1. A comparação visual em um navegador real ficou pendente neste ambiente. A imagem apresentada na conversa é uma prévia conceitual gerada a partir das referências.
