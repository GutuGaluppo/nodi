# Checklist para download público do NODI

Somente pendências, atualizadas em 19/10/2026. O que já foi feito está no histórico do git e na página ABOUT.

Já resolvido e verificado: migração de dados (teste de atualização de banco), remoção do caminho de desenvolvimento do build de produção, revisão de teclado das telas novas e `pnpm check` no branch atual.

## Bloqueios externos (você decide ou contrata)

- [ ] **Conta Apple Developer** (US$ 99/ano), assinatura com Developer ID e notarização. Sem isso, o macOS mostra alerta de segurança ao abrir o `.dmg`. Hoje só há assinatura de desenvolvimento local (`docs/INSTALACAO_E_ATUALIZACAO.md`).
- [ ] **Permissão escrita da Handwriting OCR** para revenda no plano Pro. `HANDWRITING_RESALE_APPROVED` deve ser `true` para o serviço atender clientes (o D-016 de `docs/DECISIONS.md` já registra que isso vale para o Pro).
- [ ] **Hospedagem do servidor de Handwriting** em HTTPS, com proxy reverso e variáveis de produção.
- [ ] **Provedor de identidade** (ex.: Sign in with Apple, Clerk ou Auth0). Sem ele não há login, e o `authenticate` do servidor fica sem integração real.
- [ ] **Plataforma de pagamento** (ex.: Stripe, Paddle ou Mac App Store), com produtos, webhook e preços revisados contra `landing/plans.json`.
- [ ] **Decisão sobre a OpenAI** (plano base): Zero Data Retention ou Modified Abuse Monitoring, se a política de privacidade exigir, e o DPA se houver usuários na UE.
- [ ] **Definição do plano Pro** (features e preço). Proposta registrada: Pro a €14,99 por 100 páginas, com margem por volta de 50%, a confirmar.

## Desenvolvimento (dependem dos bloqueios acima)

- [ ] **Login** integrado ao servidor de Handwriting e à interface. Hoje `setHandwritingSession` só aceita token de desenvolvimento.
- [ ] **Fluxo de assinatura** no app e na landing. Os botões de planos na landing ainda estão desabilitados ("Not available yet").
- [ ] **Entitlements do Pro** no app: o que o plano libera além da transcrição.
- [ ] **Atualização do app**: hoje é manual, via `.dmg`. O atualizador do Tauri exige chave de assinatura e teste de falha.
- [ ] **CSP de produção**: `connect-src` (`src-tauri/tauri.conf.json`) deve apontar para o domínio real do servidor.
- [ ] **Textos legais** no app e na landing: política de privacidade e termos, incluindo o uso da OpenAI e da Handwriting OCR. Os textos atuais (app e landing, 4 idiomas) citam só a OpenAI; o plano Pro envia à Handwriting OCR.

## Qualidade e validação

- [ ] **CI verde**: o workflow `.github/workflows/ci.yml` falhou no passo do Rust porque o runner `macos-15` não tem o SDK do macOS 26 (`RecognizeDocumentsRequest`). Trocado para `macos-26`; falta confirmar a execução no GitHub.
- [ ] **Merge do PR #2** em `master`, após o CI verde e a revisão dos pontos já registrados.
- [ ] **Teste em um Mac limpo** com macOS 15 ou superior (`minimumSystemVersion`), instalando pelo `.dmg`, sem o Xcode de desenvolvimento, e atualizando de uma versão anterior para confirmar que o banco `com.nodi.app` é preservado.
- [ ] **Compilação da Share Extension** (`share-extension/`) no `.dmg` final, com a assinatura correta.
- [ ] **Teste manual com VoiceOver** nas telas Plano e uso e revisão de transcrição.
- [ ] **Qualidade da transcrição**: testar documentos reais (manuscritos, recibos, PDFs de várias páginas) com a Handwriting OCR e com a OpenAI, e decidir o que fica no plano base.
- [ ] **Teste instável do OCR**: `ocr::tests::points_out_misread_words_with_suggestions` falha às vezes em paralelo (o corretor ortográfico do macOS não é thread-safe). O CI e o README usam `--test-threads=1`.

## Documentação

- [ ] **README** e `docs/HANDWRITING_SETUP.md` com o estado final, depois que os itens externos forem resolvidos.
- [ ] **ABOUT**: entrada das últimas tarefas (CI, teste de migração, teclado da tela Plano e uso), com captura feita só com notas de exemplo (conforme `AGENTS.md`).
