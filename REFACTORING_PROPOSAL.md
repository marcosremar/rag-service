# Proposta de Refatoração: LSP Service

## 🎯 Decisão Arquitetural

### Opção A: Manter Junto (Atual) - Recomendado para MVP
**Quando usar:**
- Projeto em fase inicial/MVP
- Equipe pequena
- Não precisa escalar independentemente ainda

**Estrutura:**
```
rag-service/
├── src/
│   ├── services/
│   │   ├── rag/              # Módulo RAG
│   │   │   ├── embedding.service.ts
│   │   │   └── code-retrieval.service.ts
│   │   ├── code-graph/       # Módulo Code Graph (compartilhado)
│   │   │   └── code-graph.service.ts
│   │   └── lsp/              # Módulo LSP
│   │       └── lsp.service.ts
│   └── server.ts
```

**Vantagens:**
- ✅ Simples de manter
- ✅ Menos overhead de rede
- ✅ Deploy único

### Opção B: Separar em Serviços (Recomendado para Produção)
**Quando usar:**
- Projeto em produção
- Precisa escalar independentemente
- Equipe maior ou múltiplas equipes

**Estrutura:**
```
vendor/
├── rag-service/           # Porta 3120
├── lsp-service/          # Porta 3121
└── code-graph/           # Biblioteca npm ou serviço na porta 3122
```

## 🔄 Plano de Migração

### Passo 1: Organizar Módulos Internos (Fazer Agora)
Manter no mesmo serviço, mas organizar melhor:

```typescript
// src/services/rag/index.ts
export * from './embedding.service.js';
export * from './code-retrieval.service.js';

// src/services/lsp/index.ts
export * from './lsp.service.js';

// src/services/code-graph/index.ts
export * from './code-graph.service.js';
```

### Passo 2: Extrair Code Graph (Quando necessário)
Criar `vendor/code-graph/` como biblioteca compartilhada.

### Passo 3: Separar LSP (Quando escalar)
Criar `vendor/lsp-service/` como serviço independente.

## 💡 Recomendação Imediata

**Para o seu caso atual**: Manter junto, mas organizar em módulos internos.

**Motivos:**
1. Você está em fase de desenvolvimento/MVP
2. A complexidade de múltiplos serviços não compensa ainda
3. Pode migrar depois quando necessário

**Mas organize assim:**
```
rag-service/src/
├── modules/
│   ├── rag/
│   ├── lsp/
│   └── code-graph/
└── server.ts
```

Isso facilita a separação futura sem grandes refatorações.


