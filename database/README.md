# Banco da fila

`banco-5.3.1.sql` registra as atualizações da fila até a versão 5.3.1. Ele é uma atualização sobre um banco existente, não um bootstrap completo.

## Estrutura necessária

O banco deve conter as tabelas `fila_analistas`, `fila_usuarios`, `fila_atribuicoes`, `fila_config` e `fila_historico`, seus índices e restrições de unicidade, além das funções de autorização e operações originalmente implantadas.

Entre as dependências estão `fila_check`, `fila_ator`, `fila_autoriza`, `fila_log`, `fila_anexar`, `fila_set_analista`, `fila_set_janela`, `fila_set_pref` e `fila_zerar`. Parte dessas funções é chamada pelo cliente, mas sua criação original não está contida no SQL de atualização.

Para uma instalação nova, obtenha primeiro o esquema de desenvolvimento autorizado pelo responsável pelo projeto. Não aponte uma cópia de desenvolvimento para dados operacionais da equipe.

## Atualizações incluídas

- Escolha explícita e exclusiva de nomes.
- Histórico por cursor, com filtros e retenção dos registros existentes.
- Distribuição automática, prioridade de reserva e devolução aleatória elegível.
- Conclusão e próximo pedido numa operação com ID esperado.
- Contato compartilhado com autoria auditada.

As RPCs expostas validam equipe e ator. O alocador e a gravação de auditoria não são entradas de acesso direto para clientes.

## Testes SQL

Os arquivos em `tests/` substituem os dados da fila dentro de uma transação e terminam em `ROLLBACK`. Utilize somente uma base de desenvolvimento. Esses testes são separados dos testes JavaScript, que usam simulações e não precisam de conexão com um banco.

## Funcionalidades 6.x

Os arquivos em `updates/` correspondem às mudanças recentes: catálogo online, descanso, Fullmetal/LoL/Fluminense/Nuvens, exibição do histórico, animações de recebimento e suporte. Não execute toda a pasta cegamente: `fullmetal-6.3.sql`, `temas-6.4.sql` e `temas-6.5.sql` são atualizações de dados e incrementam a revisão do catálogo; os patches de funções dependem do conteúdo atual do banco.

`descanso.sql`, `historico-6.6.sql`, `efeito-pedido-6.7.sql` e `suporte.sql` utilizam o esquema privado `af_mobile`, que deve existir antes da execução. A infraestrutura de status, escala e notificações das versões intermediárias é uma dependência já implantada no banco da equipe e não foi reconstruída como bootstrap neste repositório. O material não contém dados operacionais, códigos da equipe ou segredos de aplicação.

A operação de suporte mantém pedidos retidos em `status='contato'`, com `destino_apoio='suporte'`, para que clientes antigos também os excluam da distribuição. Só a interface atual mostra a lista separada. Remover explicitamente da lista disponibiliza o pedido para distribuição, como ocorre em contato.
