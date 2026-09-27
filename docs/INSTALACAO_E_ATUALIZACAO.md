# Instalação e atualização do NODI no macOS

Este guia explica como executar o NODI durante o desenvolvimento, gerar um aplicativo instalável e substituir uma instalação existente por uma versão mais recente.

## Pré-requisitos

Antes da primeira compilação, confirme que a máquina possui:

- Node.js;
- pnpm;
- Rust e Cargo;
- Xcode Command Line Tools;
- CMake (necessário para compilar o `whisper.cpp` usado na transcrição de voz).

Verifique o ambiente com:

```bash
node --version
pnpm --version
rustc --version
cargo --version
xcode-select -p
cmake --version
```

Se o CMake não estiver instalado:

```bash
brew install cmake
```

> **macOS 15 (Sequoia) é a versão mínima exigida pelo NODI a partir da
> transcrição de voz local.** `src-tauri/.cargo/config.toml` fixa
> `MACOSX_DEPLOYMENT_TARGET=15.0`: abaixo disso, o build de release falha ao
> linkar o `ggml-metal` (símbolo `__isPlatformVersionAtLeast` ausente, porque
> um trecho do código só compila sem verificação em tempo de execução a
> partir dessa versão). Isso não é uma preferência — é uma consequência
> direta de usar Metal para acelerar o Whisper localmente.

## Preparar o projeto

No Terminal, entre na pasta do projeto e instale as dependências:

```bash
cd /Users/augustogaluppo/development/Desktop-Projects/Nodi
pnpm install
```

Essa instalação precisa ser repetida quando as dependências declaradas em `package.json` ou `pnpm-lock.yaml` forem alteradas.

## Executar a versão de desenvolvimento

Para testar as mudanças sem reinstalar o aplicativo:

```bash
pnpm tauri dev
```

O Tauri abrirá uma janela nativa usando o código atual. Mudanças na interface normalmente são recarregadas durante o desenvolvimento.

## Gerar o aplicativo instalável

Para compilar uma versão de produção:

```bash
pnpm tauri build
```

Ao final, os artefatos para macOS ficam em:

```text
src-tauri/target/release/bundle/
├── dmg/       # imagem de instalação .dmg
└── macos/     # aplicativo NODI.app
```

A primeira compilação pode demorar alguns minutos porque o Rust precisa compilar as dependências nativas.

## Extensão de Compartilhar e integração com o macOS

`pnpm tauri build` também compila a extensão de Compartilhar do NODI
(`scripts/build-share-extension.sh`) e a coloca em
`NODI.app/Contents/PlugIns/`. Para isso é preciso o Xcode (o `swiftc` das
Command Line Tools também serve).

- A extensão é assinada com a primeira identidade "Apple Development" do
  Keychain; sem nenhuma, é assinada ad hoc. Para escolher outra, defina
  `SIGNING_IDENTITY` antes do build.
- Na primeira vez, ative-a em **Ajustes do Sistema → Geral → Itens de Início e
  Extensões → Compartilhar** (ou no menu Compartilhar → **Editar Extensões…**).
  Depois disso, "NODI" aparece no menu Compartilhar do Safari e de outros apps.
- O atalho global **⌥⌘N** e o item "NODI" na barra de menus criam uma nota
  nova. Se outro app já usar ⌥⌘N, o item da barra de menus continua
  funcionando.
- Links `nodi://new?title=…&text=…&url=…` criam notas; servem para o app
  Atalhos.
- Notas no Spotlight ficam desligadas até você ativá-las em **Configurações →
  Your data**.

## Fazer a primeira instalação

1. Abra o arquivo `.dmg` criado em `src-tauri/target/release/bundle/dmg/`.
2. Arraste **NODI** para a pasta **Applications**.
3. Abra o NODI pela pasta Applications ou pelo Launchpad.
4. Se o macOS bloquear a primeira abertura, clique com o botão direito no aplicativo, selecione **Abrir** e confirme.

Uma compilação local não precisa de assinatura ou notarização para uso pessoal. Esses mecanismos serão necessários para distribuir o aplicativo a outras pessoas sem os alertas de segurança do macOS.

## Atualizar uma instalação existente

Depois de fazer mudanças no projeto:

1. Encerre completamente o NODI instalado.
2. Atualize a versão do aplicativo antes de preparar um lançamento.
3. Gere um novo pacote com `pnpm tauri build`.
4. Abra o novo `.dmg`.
5. Arraste **NODI** para **Applications**.
6. Quando o Finder perguntar, selecione **Substituir**.
7. Abra o aplicativo e confira a nova versão.

Substituir `NODI.app` não remove o banco de dados local. Os dados do usuário ficam no diretório de dados do macOS, separado do pacote do aplicativo.

> **Importante:** mantenha o identificador `com.nodi.app` em `src-tauri/tauri.conf.json`. Alterá-lo pode fazer o macOS tratar a compilação como outro aplicativo e usar outro diretório de dados.

## Atualizar o número da versão

A versão atual está em `src-tauri/tauri.conf.json`:

```json
{
  "version": "0.1.0"
}
```

Use versionamento semântico:

- correção sem novos recursos: `0.1.0` → `0.1.1`;
- novo recurso compatível: `0.1.0` → `0.2.0`;
- mudança incompatível após a versão estável: `1.0.0` → `2.0.0`.

Mantenha também o campo `version` de `package.json` sincronizado para evitar versões divergentes no projeto.

## Checklist de uma atualização manual

Antes de substituir a instalação:

```bash
pnpm check
pnpm tauri build
```

Depois da instalação, confirme que:

- o NODI abre normalmente;
- as notas existentes continuam disponíveis;
- a criação e a edição de uma nota funcionam;
- a versão instalada corresponde à versão preparada.

Faça backup dos dados importantes antes de testar mudanças que incluam novas migrações do banco de dados. Migrações já publicadas não devem ser alteradas.

## Sugestão futura: atualização automática

Quando o NODI começar a ser distribuído, o atualizador do Tauri poderá eliminar a substituição manual. Essa evolução deve ser implementada como uma tarefa própria e exigirá:

1. configurar o plugin oficial de atualização do Tauri;
2. assinar os pacotes de atualização;
3. publicar cada release e seu manifesto em um endpoint HTTPS;
4. configurar a chave pública e o endpoint no aplicativo;
5. oferecer uma ação acessível para verificar, baixar e instalar atualizações;
6. testar atualização, falha de rede, pacote inválido e preservação dos dados.

Para distribuição pública no macOS, também será necessário usar uma conta Apple Developer, assinar o aplicativo com Developer ID e enviá-lo para notarização da Apple.

Como o NODI V1 não depende de serviços de nuvem, nenhuma infraestrutura de atualização automática deve ser adicionada sem aprovação explícita. Até lá, o fluxo com `.dmg` é o procedimento oficial.
