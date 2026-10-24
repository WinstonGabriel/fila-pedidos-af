# Documentação — AF Operação 6.8.1

Referência do código publicado na série 6.8.1. Revisão documental: 24/10/2026. Exemplos fictícios; nenhuma credencial ou dado operacional é necessário para ler estes documentos.

A organização técnica segue a [documentação anterior de extração e apresentação](ARQUITETURA-5.3.1.md), preservada como referência histórica. A documentação atual substitui suas descrições de comportamento quando houver diferença.

| Documento | Público e finalidade |
|---|---|
| [Manual do analista](MANUAL-DO-ANALISTA.md) | Conexão, pedidos, status, descanso, temas, avisos e ocultação |
| [Manual de gestão](MANUAL-DE-GESTAO.md) | Sessão de gestão, direcionamento, escala, importação e relatórios |
| [Instalação e manutenção](INSTALACAO-E-MANUTENCAO.md) | Instalar, atualizar, diagnosticar e preparar uma entrega |
| [Arquitetura](ARQUITETURA.md) | Extração, consolidação, distribuição, apresentação e ciclo de vida |
| [Banco e RPCs](BANCO-E-RPCS.md) | Modelo lógico, contratos, concorrência, migrações e compatibilidade |
| [Temas e configuração online](TEMAS-E-CONFIGURACAO.md) | Catálogo, preferências, layout e animações declarativas |
| [Segurança e privacidade](SEGURANCA-E-PRIVACIDADE.md) | Identidades, permissões, isolamento e dados locais |
| [Testes e validação](TESTES-E-VALIDACAO.md) | Suítes, cobertura, testes manuais e limites da evidência |
| [Histórico de versões](HISTORICO-DE-VERSOES.md) | Evolução documentada até 6.8.1 |
| [Publicação e colaboração](PUBLICAR_NO_GITHUB.md) | Repositório existente, branches, revisão e entrega |

## Escopo e limites

O repositório contém a extensão, seus recursos locais, testes e atualizações SQL incrementais. Não é um instalador autossuficiente de um banco novo: faltam definições originais de parte das RPCs e da infraestrutura intermediária de gestão, escala e notificações.

Os portais pessoais para celular são uma aplicação separada, hospedada em Cloudflare Workers e integrada ao mesmo backend. Esta documentação explica a relação, mas não inclui o código dos Workers nem os links pessoais de acesso. Não se deve usar esta pasta para reconstruir ou republicar os portais.

## Glossário

| Termo | Significado |
|---|---|
| AF | Sistema de origem dos pedidos |
| Pedido candidato | Pedido lido da lista e enviado ao banco para avaliação de elegibilidade |
| Atribuição | Estado compartilhado de um pedido e do analista relacionado |
| Reserva de nome | Vínculo exclusivo entre um nome e o token da instalação |
| Reserva de pedido | Pedido separado para um analista; não é reserva de identidade |
| RPC | Função do banco chamada por HTTP pela extensão |
| Cache | Última leitura local; não confirma disponibilidade atual no banco |
| Coordenação/Gestão | Acesso privilegiado validado pelo backend |
| Intervalo (aba) | Divisão dos pedidos por faixas de horário |
| Intervalo (status) | Indisponibilidade operacional; distinto da aba e do descanso limitado |
