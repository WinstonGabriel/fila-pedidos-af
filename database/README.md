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
