# 🐾 VETRA DISTRIBUIDORA — Arquivo de Memória do Projeto

> Este arquivo serve como cache de contexto. Sempre que uma nova sessão de trabalho
> começar neste projeto, leia este arquivo primeiro para recuperar o estado atual,
> decisões tomadas e o que ainda falta fazer.

---

## 1. O que é o projeto

Sistema web para a **VETRA Distribuidora**, empresa de medicamentos veterinários
em São Luís — MA. Conecta petshops/veterinários (que enviam prescrições) à
distribuidora (que analisa e atende com produtos).

**Dados reais da empresa:**
- Nome: VETRA Distribuidora
- Endereço: Rua Imperatriz, S/N - Parque Pindorama, São Luís - MA, 65041-178
- CNPJ: 63.185.159/0001-48
- Telefone: (98) 8583-5611
- WhatsApp: (98) 3301-6886 → usado como `5598330168861` nos links `wa.me`
- Instagram: @vetra.distribuidora
- E-mail: vetra@vetradistribuidora.com.br
- Logo: "V" duotone — metade verde-petróleo claro (`#4FA89C`), metade escuro (`#0E3B3E`), recriado em SVG inline (ver `index.html` e `gerencia.html`)

**Paleta de cores da marca:**
```
--green:#0E3B3E      (verde petróleo escuro - principal)
--green-mid:#1B5E5E
--green-light:#4FA89C
--green-pale:#E5F2F0
--orange:#E8630A     (cor secundária, CTAs de destaque)
```

---

## 2. Arquitetura

- **Frontend**: HTML/CSS/JS puro (sem framework), 3 páginas principais
- **Backend**: Supabase (Postgres + Auth + Storage)
- **IA de visão**: Groq (`meta-llama/llama-4-scout-17b-16e-instruct`) via Netlify Function
- **Hospedagem**: Netlify, deploy automático via **GitHub** (push → build → deploy)
  - ⚠️ Drag-and-drop NÃO funciona para Functions — só Git ou Netlify CLI processam `netlify.toml` e a pasta `netlify/functions/`
- **Repositório**: público no GitHub (necessário ficar público para o plano free do Netlify puxar automaticamente sem fricção)

### Credenciais Supabase (já embutidas nos HTMLs, são chaves "anon" públicas, OK expor no client)
```
SUPABASE_URL = https://xiwkosnranwsudjkdlli.supabase.co
SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tvc25yYW53c3VkamtkbGxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5Nzc0NTQsImV4cCI6MjA5NjU1MzQ1NH0.72dWtHQZfaluwvvecsL_D6jFBY-Ah_x7KPTObaNRMec
```

### Variável de ambiente privada no Netlify (NÃO vai no código)
```
GROQ_API_KEY = (configurada direto no painel Netlify > Environment variables, escopo Functions)
```

---

## 3. Páginas do sistema

| Arquivo | Rota | Quem acessa |
|---|---|---|
| `index.html` | `/` | Público — petshops/vets enviam prescrição |
| `gerencia.html` | `/gerencia` | Admin da VETRA (login Supabase Auth) |
| `vet.html` | `/vet` | Veterinário individual vê só suas próprias prescrições |

**Importante sobre `/gerencia`**: rota intencionalmente não linkada em nenhum lugar
do site público — é "secreta por obscuridade" + login obrigatório. Não há botão
"Admin" visível.

**Importante sobre `/vet`**: precisa estar configurada no `netlify.toml` como redirect.

---

## 4. Modelo de dados (Supabase)

### Tabelas principais
- `bairros` — 22 bairros da Grande São Luís pré-cadastrados (Turu, Cohama, Calhau, etc.)
- `medicamentos` — catálogo fixo (não é texto livre) para permitir ranking exato. Tem `nome`, `apresentacao`, `categoria`, `ativo`
- `locais` — petshops/clínicas. Tem `nome`, `telefone`, `cnpj`, `email`, `endereco`, `bairro_id`, `ativo`
- `veterinarios` — vets cadastrados. Tem `nome`, `email`, `crmv` (unique), `especialidade`, `telefone`, `bairro_id`, `ativo`, `categoria` (`fixo`/`volante`), `local_id` (legado, mantido para compatibilidade = primeiro petshop vinculado)
- `veterinario_locais` — tabela N:N entre veterinarios e locais (permite vet "volante" atuar em vários petshops)
- `prescricoes` — campo `origem` (`publico`/`admin`), `status` (`pendente`/`analisado`), `analisado_por` (uuid → auth.users), `analisado_em`, `foto_url`
- `prescricao_medicamentos` — itens da prescrição. Tem `medicamento_id` (FK opcional pro catálogo) OU `nome_livre` (fallback texto), `dosagem`, `origem` (`manual`/`ia` — diferencia o que foi digitado de que foi extraído por IA)

### Views analíticas (security_invoker = true, RLS-safe)
- `vw_ranking_bairros`, `vw_ranking_petshops`, `vw_ranking_veterinarios`, `vw_ranking_medicamentos`
- `vw_prescricoes_com_analista` — join seguro com auth.users só pro e-mail de quem analisou
- `vw_veterinarios_locais` — agrega petshops vinculados a cada vet em uma string

### Removido do projeto (mudança de escopo no meio do caminho)
- ❌ Conceito de "regiões" (São Luís, Ribamar, Paço do Lumiar, Timon) → substituído por **bairros da Grande São Luís**
- ❌ Sistema de "ofertas" (admin enviar proposta pro petshop) → não existe mais, o foco é 100% analítico (saber quem mais prescreve)
- ❌ Dark mode → foi implementado e depois removido a pedido do usuário (manter só modo claro)

---

## 5. Funcionalidades já implementadas

- Formulário público de prescrição (texto OU foto)
- Catálogo de medicamentos com dropdown (não é texto livre)
- Upload de foto comprimida (resize automático no browser antes de enviar)
- Dashboard analítico com 4 rankings clicáveis (bairro/petshop/vet/medicamento) — clicar filtra a lista de prescrições
- Gráficos Chart.js na aba "Análise Detalhada" com gradientes, clicáveis também
- CRUD completo: petshops, veterinários, medicamentos, bairros
- Registro manual de prescrição pelo admin (telefone/WhatsApp/presencial)
- Campo "analisado por" (rastreabilidade de quem no time analisou)
- Análise automática de foto por IA (Groq Vision) quando não há medicamento digitado manualmente
- Botão manual "Identificar medicamentos com IA" no modal de foto (pra fotos antigas ou retry)
- Indicador visual 🤖 vs 💊 pra diferenciar medicamento extraído por IA vs digitado
- Cache de imagem (Cache Storage API) pra economizar egress do Supabase Storage
- Correção de segurança: views recriadas com `security_invoker` (linter do Supabase apontou `security_definer_view` e `auth_users_exposed` — corrigido)
- Header `Cache-Control: no-cache` no netlify.toml pra evitar cache de HTML antigo travando updates
- **Veterinário "volante"**: campo `categoria` (fixo/volante) + tabela N:N `veterinario_locais` + modal com checklist de múltiplos petshops
- **Importar/Exportar CSV** na aba Análise Detalhada (prescrições e ranking de medicamentos, com modelo de planilha pra download)
- **Portal do veterinário (`vet.html`)**: login próprio, busca prescrições do vet logado por `veterinario_id` ou nome/CRMV em texto livre, mostra stats e lista filtrada

---

## 6. Status da sessão atual

✅ Rota `/vet` adicionada ao `netlify.toml` (+ `X-Robots-Tag: noindex` igual ao `/gerencia`)
✅ `doLogin()` do `index.html` corrigido para redirecionar a `/vet` após login
✅ Sintaxe JS de `index.html`, `gerencia.html` e `vet.html` validada com `node --check`
✅ HTML balanceado (divs) validado nos 3 arquivos
✅ Confirmado: nenhuma referência órfã a `vet-local` (select único antigo) sobrou em `gerencia.html` — migração para checklist múltiplo está completa

### Pendente para o usuário executar
1. Rodar `migracao_veterinario_volante.sql` no Supabase
2. Rodar `correcao_seguranca_views.sql` no Supabase (se ainda não rodou)
3. Testar o fluxo do veterinário ponta a ponta:
   - Criar um usuário no Supabase Auth com e-mail X
   - Cadastrar um veterinário em `/gerencia` com esse mesmo e-mail X
   - Logar em `/vet` e confirmar que aparecem as prescrições certas
4. Fazer commit + push pro GitHub pra disparar o deploy automático no Netlify

### Ideia futura (não pedida ainda)
- Permitir o próprio veterinário logado em `/vet` enviar uma nova prescrição direto por ali, sem precisar ir no site público — hoje `/vet` é só visualização.

---

## 7. Decisões de produto / por que as coisas são como são

- **Bairros em vez de regiões**: granularidade no nível de bairro da Grande São Luís porque o foco analítico é entender exatamente onde a demanda está concentrada.
- **Catálogo fixo de medicamentos**: decisão consciente pra permitir ranking exato. Texto livre permitiria "Doxiciclina" e "doxiciclina 100mg" contarem como itens diferentes.
- **Sem sistema de ofertas**: o produto não é sobre "vender" pelo site, é sobre entender o mercado (quem prescreve mais, o quê, onde) pra decisão comercial manual depois.
- **IA só dispara quando não há medicamento digitado**: evita custo/chamada desnecessária. Roda automático no envio, tem botão manual de retry no admin.
- **`/gerencia` sem link público**: só o dono sabe a URL — somado ao login, bloqueia acesso indevido.
- **Dark mode removido**: foi implementado a pedido, depois revertido a pedido (queria simplicidade). Não reintroduzir sem pedido explícito.

---

## 8. Pontos de atenção técnica / armadilhas já encontradas

- Deploy via **drag-and-drop não funciona pra Functions**. Sempre usar Git push ou `netlify deploy --prod` via CLI.
- Foto em formato **HEIC** (câmera iPhone) não é decodificável pelo `<canvas>` do browser — `compressImage()` detecta a falha (`file._naoComprimido = true`), e o código valida o tamanho final antes do upload pra dar mensagem de erro clara em vez do erro genérico de RLS do Supabase Storage.
- Bucket `prescricoes`: `file_size_limit` = 10MB, `public: false`. Política de **INSERT é pública** (qualquer um envia foto sem login), **SELECT é só autenticado** (só admin/vet logado vê).
- Cache de HTML no browser/Netlify já causou um "bug fantasma" — resolvido com `Cache-Control: no-cache, must-revalidate` pra `/*.html`.
- Netlify free tier: variável "Secret" funciona normal no free. "Specific scopes" (Builds/Functions/Runtime) já resolve sem precisar de "All scopes" nem upgrade pago.
- Consumo de créditos Netlify pela Function de IA é desprezível (<0.5% dos 300 créditos/mês grátis) mesmo em volume alto (300 prescrições/mês com foto).

---

## 9. Arquivos do projeto (mapa geral)

```
/
├── index.html                          → site público
├── gerencia.html                       → painel admin (/gerencia)
├── vet.html                            → portal do veterinário (/vet)
├── netlify.toml                        → redirects + headers + functions dir
├── package.json                        → dependência @supabase/supabase-js p/ Functions
├── netlify/functions/analisar-foto.js  → Function de IA (Groq Vision)
├── supabase_schema.sql                 → schema completo original (v2, com bairros)
├── migracao_analisado_por.sql          → add colunas analisado_por/analisado_em
├── migracao_origem_ia.sql              → add coluna origem em prescricao_medicamentos
├── migracao_veterinario_volante.sql    → add categoria + tabela N:N vet-petshop
├── correcao_seguranca_views.sql        → fix linter (security_definer + auth exposed)
├── seed_dados_ficticios.sql            → dados de teste (10 prescrições fictícias)
├── diagnostico_rls_storage.sql         → queries de debug pra RLS do storage
├── diagnostico_rls_storage_2.sql       → queries de debug pra file_size_limit/mime
├── DEPLOY_COM_CLI.md                   → guia de deploy via Netlify CLI
├── README.md                           → documentação geral + setup Groq
└── dados.md                            → este arquivo (memória do projeto)
```

**Ordem de execução das migrações no Supabase** (se for um banco do zero):
1. `supabase_schema.sql`
2. `migracao_analisado_por.sql`
3. `migracao_origem_ia.sql`
4. `migracao_veterinario_volante.sql`
5. `correcao_seguranca_views.sql`
6. (opcional) `seed_dados_ficticios.sql` pra ver dados de teste

---

## 10. Convenções de código usadas no projeto

- Sem framework — HTML/CSS/JS puro em arquivos únicos por página
- CSS via custom properties (`:root { --green: ... }`)
- IDs em kebab-case (`#presc-form`, `#vet-modal-title`)
- Funções JS em camelCase (`loadVets`, `salvarVet`, `openVetModal`)
- Toasts de feedback (`showToast('mensagem')`) em vez de `alert()`
- Modais via `.modal-overlay.open` (classe toggle, não display inline)
- Todo CRUD segue o padrão: `openXModal(item)` (sem item = criar, com item = editar) → `salvarX()` → `excluirX()`
- Emojis usados como ícones visuais inline (sem biblioteca de ícones)
