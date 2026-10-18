# Checklist para download público do NODI

Pendências para finalizar as funções do NODI e disponibilizar o download. Os itens marcados como **Bloqueio externo** dependem de contas, contratos ou decisões suas. Os demais podem ser feitos no repositório.

## Bloqueios externos (você decide ou contrata)

- [ ] **Conta Apple Developer** (US$ 99/ano), assinatura com Developer ID e notarização. Sem isso, o macOS mostra alerta de segurança ao abrir o `.dmg`. Hoje só há assinatura de desenvolvimento local, conforme `docs/INSTALACAO_E_ATUALIZACAO.md`.
- [ ] **Permissão escrita da Handwriting OCR** para revenda no plano Pro. `HANDWRITING_RESALE_APPROVED` deve ser `true` para o serviço atender clientes. O D-016 em `docs/DECISIONS.md` diz que essa permissão não é mais bloqueio; isso está desatualizado, porque o plano Pro usa a Handwriting OCR.
- [ ] **Hospedagem do servidor de Handwriting** em HTTPS, com proxy reverso e variáveis de produção.
- [ ] **Provedor de identidade** (ex.: Sign in with Apple, Clerk ou Auth0). Sem ele não há login, e o `authenticate` do servidor fica sem integração real.
- [ ] **Plataforma de pagamento** (ex.: Stripe, Paddle ou Mac App Store), com produtos, webhook e preços revisados contra `landing/plans.json`.
- [ ] **Decisão sobre a OpenAI** (plano base): Zero Data Retention ou Modified Abuse Monitoring, se a política de privacidade exigir, e o DPA se houver usuários na UE.
- [ ] **Definição do plano Pro** (features e preço). Proposta registrada: Pro a €14,99 por 100 páginas, com margem por volta de 50%, a confirmar.

## Desenvolvimento

- [ ] **Login** integrado ao servidor de Handwriting e à interface. Hoje `setHandwritingSession` só aceita token de desenvolvimento.
- [ ] **Fluxo de assinatura** no app e na landing. Os botões de planos na landing ainda estão desabilitados ("Not available yet").
- [ ] **Entitlements do Pro** no app: o que o plano libera além da transcrição.
- [ ] **Atualização do app**: hoje é manual, via `.dmg`. O atualizador do Tauri exige chave de assinatura e teste de falha.
- [x] **Remover o caminho de desenvolvimento** do cliente antes do build de produção. O token local e o endereço 127.0.0.1 só existem em `import.meta.env.DEV`; confirmar no build. Verificado: o `dist` de produção não contém o token de desenvolvimento nem o endereço 127.0.0.1.
- [ ] **CSP de produção**: `connect-src` deve apontar para o domínio real do servidor.
- [ ] **Textos legais** no app e na landing: política de privacidade e termos, incluindo o uso da OpenAI e da Handwriting OCR.

## Qualidade e validação

- [ ] **Merge do PR #2** em `master`, após a revisão dos pontos já registrados.
- [x] **CI de validação**: hoje só existe o workflow de Pages. Falta um workflow que rode `pnpm check` e os testes de Rust a cada PR. Feito: `.github/workflows/ci.yml` roda `pnpm check`, `pnpm build` e `cargo test --lib` (em série, porque o corretor ortográfico do macOS não é thread-safe).
- [ ] **`pnpm check` no branch final** (passou em 18/10/2026 neste branch; `cargo test --lib` passa com `--test-threads=1`, e o teste `ocr::tests::points_out_misread_words_with_suggestions` falha às vezes em paralelo), e `cargo test --lib`, depois das últimas mudanças no servidor.
- [ ] **Teste em um Mac limpo** com macOS 15 ou superior (`minimumSystemVersion`), instalando pelo `.dmg`, sem o Xcode de desenvolvimento.
- [ ] **Compilação da Share Extension** (`share-extension/`) no `.dmg` final, com a assinatura correta.
- [x] **Migração dos dados**: confirmar que atualizar o app preserva o banco `com.nodi.app`. Feito: o teste `upgrading_an_existing_database_keeps_its_notes` atualiza um banco da versão anterior e confirma que as notas sobrevivem. Falta só o teste manual no Mac limpo.
- [ ] **Acessibilidade**: revisar a navegação por teclado nas telas novas (Pro, planos, revisão de transcrição).
- [ ] **Qualidade da transcrição**: testar documentos reais (manuscritos, recibos, PDFs de várias páginas) com a Handwriting OCR e com a OpenAI, e decidir o que fica no plano base.

## Documentação

- [ ] **README** e `docs/HANDWRITING_SETUP.md` atualizados com o estado final.
- [ ] **ABOUT**: uma entrada por tarefa concluída, com capturas de exemplo (conforme `AGENTS.md`).
