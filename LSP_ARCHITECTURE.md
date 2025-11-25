# Arquitetura Recomendada: LSP como Serviço Separado

## 📐 Estrutura Proposta

```
vendor/
├── rag-service/              # Serviço de RAG (busca semântica)
│   ├── src/
│   │   ├── services/
│   │   │   ├── embedding.service.ts
│   │   │   ├── code-retrieval.service.ts
│   │   │   └── codebase-indexer.service.ts
│   │   └── server.ts
│   └── package.json
│
├── lsp-service/               # Serviço LSP (análise de código)
│   ├── src/
│   │   ├── services/
│   │   │   ├── lsp.service.ts
│   │   │   ├── diagnostics.service.ts
│   │   │   └── navigation.service.ts
│   │   └── server.ts
│   └── package.json
│
└── code-graph/                # Biblioteca compartilhada (Code Graph)
    ├── src/
    │   ├── code-graph.service.ts
    │   └── index.ts
    └── package.json
```

## 🔄 Alternativa: Code Graph como Serviço

Se o Code Graph for muito usado ou precisar de estado compartilhado:

```
vendor/
├── rag-service/
├── lsp-service/
└── code-graph-service/         # Serviço dedicado para Code Graph
    ├── src/
    │   ├── code-graph.service.ts
    │   └── server.ts
    └── package.json
```

## ✅ Vantagens da Separação

1. **Separação de Responsabilidades**
   - Cada serviço tem uma responsabilidade clara
   - Facilita manutenção e testes

2. **Escalabilidade Independente**
   - LSP pode escalar separadamente se precisar de mais recursos
   - RAG pode otimizar para embeddings sem afetar LSP

3. **Deploy Independente**
   - Atualizações no LSP não afetam RAG
   - Pode desligar LSP se não for necessário

4. **Reutilização**
   - LSP pode ser usado em outros projetos
   - Code Graph pode ser biblioteca npm

5. **Performance**
   - LSP pode manter cache de arquivos abertos
   - RAG pode otimizar para batch processing

## 🔗 Comunicação entre Serviços

### Opção 1: HTTP REST (Recomendado)
```typescript
// lsp-service chama code-graph-service
const response = await fetch('http://code-graph-service:3121/dependencies', {
  method: 'POST',
  body: JSON.stringify({ filePath })
});
```

### Opção 2: Biblioteca Compartilhada
```typescript
// Ambos importam code-graph como npm package
import { CodeGraphService } from '@lightweight-code-agent/code-graph';
```

### Opção 3: Message Queue (Para alta escala)
```typescript
// Usar Redis/RabbitMQ para comunicação assíncrona
```

## 📊 Comparação: LSP no RAG vs Separado

| Aspecto | LSP no RAG | LSP Separado |
|---------|------------|--------------|
| **Simplicidade** | ✅ Mais simples inicialmente | ❌ Mais complexo |
| **Escalabilidade** | ❌ Escalam juntos | ✅ Escalam independentemente |
| **Manutenção** | ❌ Acoplado | ✅ Desacoplado |
| **Performance** | ✅ Menos latência | ❌ Latência de rede |
| **Reutilização** | ❌ Difícil | ✅ Fácil |
| **Deploy** | ✅ Um serviço | ❌ Múltiplos serviços |

## 🎯 Recomendação Final

**Para projetos pequenos/médios**: Manter junto é aceitável, mas com separação clara de módulos internos.

**Para projetos grandes/produção**: Separar em serviços distintos, com Code Graph como biblioteca compartilhada ou serviço separado.

## 🚀 Migração Gradual

1. **Fase 1**: Manter junto, mas organizar em módulos internos
2. **Fase 2**: Extrair Code Graph para biblioteca compartilhada
3. **Fase 3**: Separar LSP em serviço próprio quando necessário


