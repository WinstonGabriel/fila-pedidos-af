# Documentação — AF Operação 6.11.0

Referência da base 6.11.0 e das revisões até 6.12.3, com pino de feriado, nomenclatura de pausa, indicadores LED dos status e preferência para folgar no feriado. Revisão documental: 27/10/2026. Exemplos fictícios; nenhuma credencial ou dado operacional é necessário para ler estes documentos.

A organização técnica segue a [documentação anterior de extração e apresentação](ARQUITETURA-5.3.1.md), preservada como referência histórica. A documentação atual substitui suas descrições de comportamento quando houver diferença.

| Documento | Público e finalidade |
|---|---|
| [Dados e estado compartilhados](DADOS-COMPARTILHADOS.md) | Versão de referência, fontes dos dados, configuração da equipe e regras que devem ser preservadas |
| [Manual do analista](MANUAL-DO-ANALISTA.md) | Conexão, pedidos, status, descanso, temas, avisos e ocultação |
| [Manual de gestão](MANUAL-DE-GESTAO.md) | Sessão de gestão, direcionamento, escala, importação e relatórios |
| [Feriados na escala](FERIADOS-NA-ESCALA.md) | Referência online de texto e pino no cabeçalho a partir da 6.11.1, com atualização dos arquivos |
| [Instalação e manutenção](INSTALACAO-E-MANUTENCAO.md) | Instalar, atualizar, diagnosticar e preparar uma entrega |
| [Arquitetura](ARQUITETURA.md) | Extração, consolidação, distribuição, apresentação e ciclo de vida |
| [Banco e RPCs](BANCO-E-RPCS.md) | Modelo lógico, contratos, concorrência, migrações e compatibilidade |
| [Temas e configuração online](TEMAS-E-CONFIGURACAO.md) | Catálogo, preferências, layout e animações declarativas |
| [Segurança e privacidade](SEGURANCA-E-PRIVACIDADE.md) | Identidades, permissões, isolamento e dados locais |
| [Testes e validação](TESTES-E-VALIDACAO.md) | Suítes, cobertura, testes manuais e limites da evidência |
| [Captura e aprovação automática](CAPTURA-E-APROVACAO-AUTOMATICA.md) | Captura de passagens rápidas, recuperação, origem e contabilização |
| [Triagem online](TRIAGEM-ONLINE.md) | Espera antes da distribuição, verificação de autorizações e compatibilidade sem outro ZIP |
| [Economia de transferência](ECONOMIA-DE-TRANSFERENCIA.md) | Sincronização por blocos, cache por instalação e compatibilidade |
| [Liberação diária](LIBERACAO-DIARIA.md) | Liberação das reservas de nome às 00:00 em America/Fortaleza |
| [Alquimia das Chamas](ALQUIMIA-DAS-CHAMAS.md) | Animação pessoal do Roy Mustang e controle do estalo |
| [Histórico de versões](HISTORICO-DE-VERSOES.md) | Evolução documentada até 6.12.3 e atualizações do banco |
| [Publicação e colaboração](PUBLICAR_NO_GITHUB.md) | Repositório existente, branches, revisão e entrega |

## Escopo e limites

O repositório contém a extensão, seus recursos locais, testes e atualizações SQL incrementais. Não é um instalador autossuficiente de um banco novo: faltam definições originais de parte das RPCs e da infraestrutura intermediária de gestão, escala e notificações.

## Glossário

| Termo | Significado |
|---|---|
| AF | Sistema de origem dos pedidos |
| Pedido candidato | Pedido lido da lista e enviado ao banco para avaliação de elegibilidade |
| Atribuição | Estado compartilhado de um pedido e do analista relacionado |
| Reserva de nome | Vínculo exclusivo entre um nome e o token da instalação |
| Reserva de pedido | Pedido separado para um analista; não é reserva de identidade |
| Aprovação automática confirmada | Decisão explícita no histórico do próprio pedido AF; não equivale a desaparecer da lista |
| Conclusão humana declarada | Conclusão registrada na extensão, sujeita à conciliação posterior com o AF |
| Bloco de sincronização | Estado, descansos ou avisos, reenviado somente quando sua versão muda |
| RPC | Função do banco chamada por HTTP pela extensão |
| Cache | Última leitura local; não confirma disponibilidade atual no banco |
| Coordenação/Gestão | Acesso privilegiado validado pelo backend |
| Intervalo (aba) | Divisão dos pedidos por faixas de horário |
| Intervalo (status) | Indisponibilidade operacional; distinto da aba e do descanso limitado |
