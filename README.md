# INNEXA 3D

Gestão de impressão 3D em React Native, Expo Router e Supabase. Catálogo público em `/`, gestão protegida em `/dashboard`, com suporte a web e Android.

## Rodar no computador

Requisitos: Node.js 22.13 ou superior, npm e um projeto Supabase. Use `npm ci` para instalar as versões registradas no lockfile.

1. Copie `.env.example` para `.env`.
2. Preencha `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY` com a URL e a chave pública publishable/anon do seu projeto. **Nunca use service_role ou secret no aplicativo.**
3. Preencha `EXPO_PUBLIC_SITE_URL` com a origem da versão web, sem barra final. Para desenvolvimento: `http://localhost:8081`.
4. Configure o banco e o administrador conforme abaixo.
5. Execute `npm run web`. Para usar no Android com Expo Go compatível com SDK 57, execute `npm start` e leia o QR code.

Sem as variáveis, o aplicativo abre o catálogo com uma orientação de configuração. Não há dados fictícios nem acesso local à gestão.

Para conhecer as telas antes de conectar sua conta, execute `npm run preview:local`. Essa prévia usa PostgreSQL temporário em memória com produtos fictícios, mostra uma faixa de aviso e abre em `http://localhost:8083`. Login de teste: `teste@innexa.example`, senha `apenas-teste-local`. Os dados são descartados ao encerrar. Esse ambiente é apenas para o navegador local; não publique o servidor de teste.

## Configurar o Supabase

No SQL Editor do projeto, execute integralmente [a migração inicial](supabase/migrations/202610240001_initial.sql). Alternativamente, com Supabase CLI instalado: `supabase link --project-ref SEU_PROJECT_REF` e `supabase db push`. O arquivo `supabase/config.toml` também permite usar a CLI com Docker para um ambiente local.

Em **Authentication → Providers → Email**, desative novos cadastros públicos e mantenha o login por e-mail ativo. Não existe tela de cadastro no aplicativo. Em **Authentication → Users**, crie sua conta administrativa pelo painel e confirme o e-mail.

Depois da migração inicial, execute também [a migração de exclusão de produtos](supabase/migrations/202610270001_delete_product.sql). Em bancos já configurados, execute apenas essa nova migração. A exclusão desativa os tamanhos e retira o produto do catálogo e da gestão, preservando encomendas, fotos e arquivos armazenados.

Adicione o ID dessa conta à lista de administradores pelo SQL Editor:

```sql
insert into public.app_admins(user_id)
select id from auth.users where email = 'SEU_EMAIL';
```

Em **Authentication → URL Configuration**, defina o Site URL e adicione as URLs exatas de recuperação de senha:

- `http://localhost:8081/reset-password` durante o desenvolvimento;
- `https://SEU_DOMINIO/reset-password` na produção;
- `innexa3d://reset-password` para o APK.

Configure um provedor SMTP para a recuperação de senha em produção. Em desenvolvimento via Expo Go, o link de retorno nativo muda conforme o endereço do servidor; use a recuperação pela versão web ou o APK com scheme estável.

A migração cria os buckets `product-images` (público, JPG/PNG/WebP até 10 MB) e `print-files` (privado, STL/3MF enviados como `application/octet-stream` até 100 MB). Confira se o limite de upload do seu plano Supabase permite 100 MB; se o plano tiver limite inferior, arquivos maiores serão rejeitados pelo serviço. Somente administradores podem enviar/excluir arquivos. Downloads privados usam links de 60 segundos.

Os arquivos de imagem têm URLs públicas, mesmo quando o produto ainda não foi publicado. Dados de produtos não publicados não aparecem na consulta pública. Não envie imagens confidenciais ao bucket público.

## Como usar

Para registrar produção por unidade, execute `supabase/migrations/202610280005_produced_quantity.sql` após as anteriores. Em cada item, informe o total de unidades já produzidas e clique em “Salvar produção”. O card e os detalhes mostram a porcentagem por unidades. Ao atingir 100%, o status muda automaticamente para Pronto; produção parcial muda para Em produção. Uma correção abaixo de 100% retorna de Pronto para Em produção. Pedidos entregues mantêm o status Entregue. Alterações de quantidade preservam o produzido até o limite da nova quantidade. Marcações antigas de feito são convertidas para todas as unidades produzidas. O prazo sugerido desconta as unidades já produzidas.

Para marcar itens produzidos, execute `supabase/migrations/202610280004_item_completion.sql` após as anteriores. Nos detalhes da encomenda, marque ou desmarque cada item como feito (todas as unidades da linha). O card mostra o progresso, e itens feitos saem do tempo pendente na sugestão de entrega. Essa marcação inicial é substituída pelo controle de unidades e status automático ao aplicar a migração 202610280005. Itens antigos de encomendas prontas/entregues começam marcados como feitos.

Para ordenar o catálogo pelos produtos mais encomendados, execute `supabase/migrations/202610280003_catalog_popularity.sql` após as migrações anteriores. O ranking soma quantidades de todas as variações por produto em encomendas não canceladas, incluindo as já entregues. Alterações e cancelamentos ajustam o ranking na próxima consulta. Empates e produtos sem encomendas usam ordem alfabética. O público recebe apenas a posição no ranking, sem dados dos pedidos ou quantidades vendidas.

Para editar encomendas, execute `supabase/migrations/202610280002_edit_order.sql` após as migrações anteriores. O botão “Editar encomenda” abre o formulário com os dados atuais. Itens existentes mantêm nome, tamanho, custo e tempo registrados; itens adicionados recebem os dados atuais do produto. Pagamentos são preservados, e o total não pode ficar abaixo do recebido. Encomendas canceladas precisam ser reabertas antes de editar. Os cards permitem trocar diretamente entre A fazer, Em produção, Pronto e Entregue; entregue e integralmente pago continua indo para o histórico.

Para habilitar sugestões de entrega, execute `supabase/migrations/202610280001_production_time.sql` no SQL Editor. O tempo por unidade fica registrado em cada item da encomenda pelo servidor. Encomendas antigas recebem o tempo atualmente cadastrado na variação, pois não havia registro histórico desse tempo. A sugestão considera uma impressora funcionando todos os dias das 8h às 22h no horário de São Paulo (14h em um dia completo), a fila a fazer/em produção e as quantidades do novo pedido. Parte do horário atual do cadastro: antes das 8h começa às 8h; depois das 22h começa às 8h do dia seguinte. A prévia atualiza a cada 30 segundos e mostra a data e o horário estimado de conclusão. O campo de entrega continua sendo uma data de calendário, escolhida pelo administrador. Desconta as unidades registradas como produzidas, mas não as horas de uma unidade ainda em impressão, nem acabamento ou transporte; use o botão para aplicar a data e ajuste quando necessário. Alterar o tempo de um produto não muda o tempo registrado em encomendas existentes.

- **Produtos:** crie o produto, inclua tamanhos e salve para liberar fotos e arquivos. Para um produto sem variações, use a opção “Padrão”. A primeira foto disponível é a capa. Configure categoria e publique para aparecer no catálogo.
- **Custos e preços:** valores de embalagem e desgaste são por unidade. Energia usa a duração em minutos convertida em horas. O custo é arredondado uma vez para centavos; depois o acréscimo é aplicado e o preço sobe para o próximo valor terminado em ,90. Uma base de R$ 20,90 permanece R$ 20,90; R$ 20,91 vira R$ 21,90. Alterar o preço manualmente desativa o automático apenas naquele tamanho.
- **Encomendas:** crie com itens, quantidades, personalizações e desconto geral em R$ ou %. As informações e os custos dos itens ficam congelados na criação. Registre pagamentos e mova a produção entre etapas. Somente pedidos entregues e totalmente pagos vão automaticamente ao histórico. Os cancelados também ficam no histórico, com alerta para acerto quando houver recebimentos.
- **Fila:** urgentes primeiro, depois vencidos ou com prazo até dois dias corridos, depois os demais. Cada grupo usa a criação mais antiga primeiro. Datas são de calendário em São Paulo.
- **Catálogo:** o carrinho não cria pedidos no banco. Ele consulta novamente os produtos e preços antes de montar a mensagem para `+55 19 99520-3113`. A encomenda é combinada no WhatsApp e cadastrada por você.
- **Importação:** selecione a planilha original. Revise nomes, gramas, tempo e custos extras. Tempos seguem `horas,minutos` (8,39 = 8h39). Tempos vazios ou minutos acima de 59 impedem aquela linha de ser importada. Duplicidades exigem renomear ou autorizar explicitamente. É possível importar apenas as linhas válidas selecionadas. Produtos entram sem publicação; vendas, estoque e metas não são importados.

## Publicar a versão web

Execute `npm run build:web`; os arquivos ficam em `dist/`. Publique essa pasta em hospedagem estática com HTTPS, definindo as variáveis públicas **antes da compilação**. Elas são incorporadas no bundle e não são segredos. O arquivo `public/_redirects` atende o redirecionamento de rotas no Netlify/Cloudflare Pages; para outra hospedagem, configure todas as rotas desconhecidas para `/index.html` (status 200). Há também `vercel.json` para Vercel.

Atualize o domínio nas variáveis e nas URLs permitidas do Supabase. Verifique login e recuperação de senha no domínio final.

## Gerar e instalar Android

O perfil `preview` em `eas.json` gera um **APK instalável**, sem publicação na loja.

1. Entre na sua conta Expo: `npx eas login`.
2. Associe o projeto: `npx eas init` (preenche o project ID em `app.json`).
3. Configure `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` e `EXPO_PUBLIC_SITE_URL` no ambiente **preview** do EAS. São variáveis públicas e devem estar disponíveis no momento da compilação.
4. Execute `npm run build:android` e aceite gerar a chave de assinatura para esse aplicativo quando solicitado pelo EAS.
5. Baixe o APK pelo link retornado e instale no Android.

O build em nuvem depende de autenticação Expo e da cota da conta. Para compilar localmente no Windows: `npx expo prebuild --platform android`, configure Android SDK/JDK compatíveis e execute `android\gradlew.bat -p android assembleRelease`. A assinatura de produção deve ser configurada antes de distribuir uma versão fora de testes; a chave deve ser guardada fora do repositório.

## Verificações

```text
npm run typecheck
npm test
npm run build:web
```

Os testes de banco usam PostgreSQL em memória (PGlite), com schemas de autenticação e storage simulados. Executam a migração real, transações, RLS, permissões, snapshots e idempotência. Não substituem a verificação final de Supabase Auth, Storage e e-mail no seu projeto conectado.

Validação manual final no ambiente conectado: login/recuperação, cadastro com dois tamanhos, preço manual, mudança do custo do PLA, upload de foto e STL/3MF, download privado, importação com pendências, desconto, sinal e saldo, entrega, cancelamento, reabertura, catálogo e envio de WhatsApp. Repetir em computador, navegador móvel e Android físico. Testar também sem login e com um usuário autenticado que não esteja em `app_admins`.

## Organização e limites

`app/` contém as rotas, `src/` contém interface, regras e integração; `supabase/migrations/` contém o banco. A view pública `catalog` projeta apenas campos comerciais; tabelas internas ficam protegidas. Regras financeiras são aplicadas por funções transacionais com autenticação e identificação única para pedidos, pagamentos e importações.

Não há modo offline, estoque, pagamento online, integração com impressoras, cálculo de frete, estorno automático ou aplicativo iOS nesta versão. Lucro é uma estimativa de venda menos custo registrado, incluindo o desconto; não é contabilidade de caixa e não inclui tributos ou despesas não configuradas. Os preços de encomendas já criadas não acompanham alterações posteriores dos produtos.
