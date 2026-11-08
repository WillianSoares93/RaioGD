# Política de Privacidade — Extensão "Raio - Integração com o navegador"

Última atualização: 7 de novembro de 2026

Esta política descreve como a extensão **Raio - Integração com o navegador** (para Google Chrome e Microsoft Edge) trata
informações. A extensão é parte do **Raio Gerenciador de Downloads**, aplicativo instalado no seu computador.

## O que a extensão faz
Ela entrega ao aplicativo Raio os downloads e vídeos que você escolhe baixar no navegador. Ela só funciona em conjunto com
o aplicativo; se o Raio estiver fechado, o navegador baixa normalmente.

## Informações que a extensão trata
Quando você inicia um download, usa "Baixar com o Raio" ou escolhe uma qualidade no botão "Baixar este vídeo", a extensão
envia ao aplicativo Raio:
- o endereço (URL) do arquivo ou da página e o endereço da página de origem (referrer);
- o nome e o tipo (MIME) do arquivo, quando o navegador os informa;
- o User-Agent do navegador;
- os cookies do site de onde o arquivo vem (exceto em páginas do YouTube), para que o Raio baixe com a mesma sessão
  que você usa no navegador, como em links que exigem login;
- quais teclas modificadoras (Ctrl, Alt, Shift) estavam pressionadas no último clique, para o recurso de impedir ou
  forçar a captura. O conteúdo digitado não é lido nem enviado;
- os endereços dos vídeos presentes na página, para listar as qualidades disponíveis.

## Para onde vão os dados
**Somente para o aplicativo Raio, no seu próprio computador**, por uma conexão local (`127.0.0.1`, porta 9614). A extensão
**não envia nenhum dado** a servidores do desenvolvedor nem a terceiros, e não usa análise de uso, publicidade ou
rastreamento. Os dados **não são vendidos**, não são usados para outra finalidade além de entregar o download ao Raio e
não são usados para avaliar crédito ou empréstimos.

## O que fica salvo
No próprio navegador, a extensão guarda apenas se a captura está ligada ou desligada e a configuração do menu de clique
direito. Ela não mantém histórico de downloads, de endereços nem de cookies.

## O aplicativo Raio
O download em si é feito pelo aplicativo Raio, que se conecta aos sites dos arquivos que você escolheu. O aplicativo guarda
a lista de downloads e as configurações no seu computador, na pasta do seu usuário, e não envia esses dados a servidores
do desenvolvedor.

## Permissões do navegador e por que são necessárias
- **downloads:** detectar um download iniciado no navegador, cancelá-lo e entregá-lo ao Raio.
- **cookies** e **acesso a todos os sites:** ler os cookies do site de origem do arquivo (que pode ser qualquer site) e
  mostrar o botão de vídeo em qualquer página com vídeo.
- **contextMenus:** o item "Baixar com o Raio" no clique direito.
- **storage:** guardar as configurações locais acima.
- **alarms:** atualizar o menu de clique direito a cada minuto, conforme as opções do aplicativo.

A extensão não carrega nem executa código externo.

## Seus controles
Clique no ícone da extensão para desligar a captura, ou desinstale a extensão pelo navegador a qualquer momento. Ao
desinstalar, nenhum dado da extensão permanece.

## Contato
Dúvidas ou solicitações: https://github.com/WillianSoares93/RaioGD/issues

## Mudanças nesta política
Se a extensão passar a tratar dados de outra forma, esta política será atualizada e a data acima será alterada.
