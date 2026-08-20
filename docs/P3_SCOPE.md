# P3 — Integration + Deployment + Final Hardening

## Estado

**IMPLEMENTADA E CERTIFICADA LOCALMENTE; PUBLICAÇÃO EXTERNA PENDENTE.**

## Entregas implementadas

- baseline de segurança com auditoria de produção zerada;
- upgrades controlados e regressão P1/P2;
- build Vinext com timeout portátil (`timeout`/`gtimeout`);
- importação CSV por uma Assessment;
- preview com erros, unchanged e conflitos;
- preview em lote por turma/Assessment, sem consultas por linha;
- validação defensiva do Service e bloqueio CSV × edição manual;
- resolução manter/substituir e confirmação global explícita;
- `source = "csv"` e batch atômico Grade + Audit;
- atualização incremental do snapshot;
- modelo CSV sem dados pessoais desnecessários;
- export estático separado em `out/`;
- base path dinâmico e assets públicos compatíveis;
- rotas estáticas derivadas da política central de capabilities;
- workflow moderno do GitHub Pages com security/quality gates;
- jobs separados de build e deploy;
- smoke HTTP local de rotas, refresh direto e assets sob base path;
- hero institucional com a foto real do campus como background;
- testes do domínio CSV, rotas e artifact.

## Não implementado

- backend, Supabase, autenticação ou RLS;
- DED, PWA, comunicação real ou IA;
- importação de outras entidades ou múltiplas avaliações;
- novas regras acadêmicas;
- publicação automática fora do workflow autorizado.

## Verificações externas pendentes

- execução do workflow em um repositório GitHub com Pages habilitado;
- smoke test na URL pública (o smoke HTTP local já está automatizado);
- persistência IndexedDB e compartilhamento entre perfis nessa origem pública;
- Safari/iPhone real e matriz manual completa de navegadores;
- inspeção manual de console e network no deploy público.

Essas pendências não são mascaradas como sucesso local. Consulte
`docs/ARCHITECTURE_P3.md` para detalhes técnicos e classificação dos advisories.
