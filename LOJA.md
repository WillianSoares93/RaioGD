# Publicar a extensão do Raio e ligar ao instalador

Objetivo: o `Raio-Setup.exe` instalar a extensão no Chrome e no Edge sozinho (como o IDM). O Chrome e o Edge
sempre mostram um aviso "Extensão adicionada" e o usuário clica em **Ativar extensão** uma vez; isso é regra dos
navegadores e não dá para pular sem usar política corporativa (que deixa o navegador "gerenciado" e não é indicado).

## 1. Gerar o zip
```
python tools/empacotar_extensao.py        # saída: installer/Raio-Extensao-<versão>.zip
```
O CI também gera esse zip (artefato `Raio-Extensao`). A cada novo envio, aumente a `version` do `extension/manifest.json`.

## 2. Chrome Web Store (Developer Dashboard)
1. **Add new item** > envie o zip.
2. Aba **Store listing**: use os textos abaixo; envie capturas de tela (1280x800 ou 640x400) e o bloco promocional
   pequeno `assets/loja-bloco-promocional-440x280.png`.
3. Aba **Privacy**: preencha com os textos da seção 4 e informe a URL da política de privacidade (seção 5).
4. **Distribution**: escolha *Public*. (Item "Unlisted" também tem ID, mas teste a instalação por registro antes de
   confiar nele.)
5. Enviar para revisão. Como a extensão pede `<all_urls>` e `cookies`, espere revisão aprofundada (dias).
6. Depois de publicado, copie o **ID** (32 letras no fim da URL da extensão).

## 3. Microsoft Edge Add-ons (opcional, recomendado)
Partner Center > Edge > **Create new extension** > envie o mesmo zip. O ID no Edge é **diferente** do ID do Chrome.
Sem ele, o instalador registra no Edge o ID da Chrome Web Store (a documentação da Microsoft permite esse endereço de
atualização), mas teste num Edge limpo antes de distribuir.

## 4. Textos prontos
**Nome:** Raio - Integração com o navegador
**Descrição curta:** Envia os downloads e vídeos do navegador para o Raio Gerenciador de Downloads.
**Descrição detalhada:** Esta extensão conecta o navegador ao aplicativo Raio Gerenciador de Downloads (instalado no
computador). Ela captura os downloads, adiciona "Baixar com o Raio" ao menu de clique direito e mostra o botão "Baixar
este vídeo" sobre os vídeos das páginas. Funciona somente com o Raio aberto; sem ele, o navegador baixa normalmente.

**Finalidade única:** Enviar ao aplicativo Raio, instalado no mesmo computador, os downloads e vídeos que o usuário
escolhe baixar.

**Justificativa das permissões**
- `downloads`: detectar um download iniciado no navegador, cancelá-lo e entregá-lo ao Raio.
- `cookies`: ler os cookies do site do arquivo para o Raio baixar com a mesma sessão (links que exigem login).
- `contextMenus`: item "Baixar com o Raio" no clique direito.
- `storage`: guardar localmente se a captura está ligada e a configuração do menu.
- `alarms`: atualizar o menu de clique direito a cada minuto conforme as opções do Raio.
- Acesso a todos os sites (`<all_urls>`): ler cookies do site de onde o arquivo vem e mostrar o botão de vídeo em
  qualquer página com vídeo.
- Código remoto: **não** usa.

**Dados (aba Privacy):** a extensão trata o endereço dos downloads/páginas e cookies, e os envia **somente** ao Raio,
em `127.0.0.1` (o próprio computador). Nada é enviado a servidores do desenvolvedor nem a terceiros. Marque as
categorias que o formulário pedir para esses dados (atividade na web / informações de autenticação) e declare que
não são vendidos, não são usados para outra finalidade e não são usados para crédito ou publicidade.

## 5. Política de privacidade (modelo; publique numa URL, por exemplo uma página do GitHub Pages)
> **Política de privacidade da extensão Raio**
> A extensão Raio envia o endereço do arquivo ou da página, o endereço de origem (referrer), o User-Agent e os cookies
> do site correspondente exclusivamente ao aplicativo Raio instalado no seu computador, por conexão local
> (127.0.0.1, porta 9614), para que ele baixe o arquivo ou vídeo que você escolheu. A extensão não envia dados para
> servidores do desenvolvedor nem para terceiros, não usa análise de uso, publicidade ou rastreamento e não vende
> dados. As configurações (captura ligada/desligada e menu) ficam salvas apenas no seu navegador. Contato: SEU-EMAIL.

## 6. Ligar ao instalador
1. Em `installer.iss`, preencha `#define ChromeExtId "..."` (e `EdgeExtId`, se publicou no Edge Add-ons).
2. Em `raio.py`, preencha `CHROME_EXT_ID` / `EDGE_EXT_ID` com os mesmos IDs (habilita os botões da loja no diálogo
   "Instalar extensão").
3. Gere o instalador (`build.bat` ou GitHub Actions).

## 7. Testar (obrigatório antes de distribuir)
Num Windows limpo (máquina virtual): instale o Raio, abra o Chrome, confirme o aviso "Ativar extensão", baixe um
arquivo `.zip` de um site e veja se o Raio captura. Repita no Edge. Desinstale o Raio e abra o navegador: a extensão
deve sumir. Se o usuário remover a extensão pela interface do navegador, ela entra numa lista de bloqueio e o
instalador não consegue reinstalá-la sozinho; nesse caso use o botão da loja no diálogo do app.
