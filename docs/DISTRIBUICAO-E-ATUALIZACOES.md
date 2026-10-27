# Distribuição e atualizações automáticas

Para distribuir AF Operação no Chrome, a recomendação é publicar um item estável na Chrome Web Store e, quando os computadores forem gerenciados, usar a política de instalação da TI. Esse processo substitui a distribuição manual de pastas a cada versão.

## Publicação pela Chrome Web Store

1. Criar/configurar a conta de desenvolvedor e cadastrar a extensão.
2. Definir a visibilidade: não listada permite instalar por link; privada restringe a contas/grupos autorizados.
3. Enviar o ZIP completo, aumentar a versão do manifesto a cada atualização e submeter à revisão.
4. Depois da publicação, o navegador verifica, baixa e aplica a atualização conforme seu ciclo. A revisão e a atualização não são instantâneas.

Sem gerenciamento da TI, cada analista faz uma instalação inicial da versão da loja; as próximas versões chegam pelo mecanismo do Chrome. Com Chrome gerenciado, a TI pode aplicar `ExtensionSettings` com `normal_installed` ou `force_installed` e o ID definitivo do item para instalar sem interação do usuário. A segunda opção também impede desativação/remoção pelo usuário.

## Hospedagem própria

Em Windows e macOS, a distribuição fora da loja exige políticas empresariais. Um servidor de atualização trabalha com pacote CRX assinado, ID/chave estáveis e manifesto de atualização; não basta colocar um ZIP no Drive, GitHub ou em um servidor. Essa alternativa depende da TI e exige manter assinatura e infraestrutura.

## Instalações atuais e identidade

As instalações atuais sem compactação precisam de uma migração inicial para o canal escolhido. O auto-reload local da 6.14 só recarrega arquivos já presentes no disco: não baixa ZIPs, não instala a própria atualização e não migra instalações antigas para a loja.

Antes de migrar, inventarie o ID das instalações e planeje a preservação de identidade, preferências e configuração. Instalações com IDs diferentes não compartilham automaticamente seu armazenamento local. Evite manter duas cópias operacionais coletando pedidos em paralelo. Não inclua código de equipe, PIN ou token de instalação no pacote.

Este documento não configura uma conta da loja, política empresarial ou canal de atualização por si só. O item da loja e o gerenciamento corporativo ainda precisam ser definidos.

Referências oficiais:
- [Distribuir uma extensão](https://developer.chrome.com/docs/extensions/how-to/distribute)
- [Visibilidade da publicação](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution)
- [Atualizar um item da loja](https://developer.chrome.com/docs/webstore/update)
- [ExtensionSettings](https://support.google.com/chrome/a/answer/9867568?hl=pt-br)
- [Ciclo de atualização](https://developer.chrome.com/docs/extensions/develop/concepts/extensions-update-lifecycle)
