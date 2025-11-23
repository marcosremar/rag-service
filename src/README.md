# 🧠 RAG Service - Retrieval-Augmented Generation

Serviço centralizado para busca semântica e recuperação de código usando embeddings vetoriais.

## 🎯 Funcionalidades

- **Busca Semântica**: Encontre código similar por significado, não apenas palavras-chave
- **Armazenamento Vetorial**: Persista exemplos de código com embeddings
- **Configurável**: Suporte a múltiplos LLMs e databases vetoriais
- **OpenRouter Integration**: Use qualquer modelo de embedding disponível

## 🚀 Configuração

### Variáveis de Ambiente

```bash
# RAG Settings
RAG_TOP_K=5                           # Número padrão de resultados
RAG_SIMILARITY_THRESHOLD=0.6          # Threshold de similaridade mínimo

# Embedding Configuration
EMBEDDING_LLM_MODEL=openai/text-embedding-3-small  # Modelo de embedding
EMBEDDING_TYPE=openai                            # Tipo: openai, voyage, cohere
EMBEDDING_BACKEND=api                            # api ou local

# Vector Database
VECTOR_DATABASE=qdrant                           # qdrant ou lancedb
QDRANT_URL=http://54.37.225.188:6333             # URL do Qdrant
QDRANT_COLLECTION=code_examples                  # Nome da coleção

# OpenRouter (para embeddings)
OPENROUTER_API_KEY=your_api_key_here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

## 🤖 Modelos de Embedding Disponíveis

### OpenAI (Recomendado)
- `openai/text-embedding-3-small` - 1536 dims, rápido e bom
- `openai/text-embedding-3-large` - 3072 dims, melhor qualidade
- `openai/text-embedding-ada-002` - 1536 dims, legado

### Voyage AI (Bom para código)
- `voyageai/voyage-3-large` - 1024 dims, bom geral
- `voyageai/voyage-code-2` - 1536 dims, especializado em código

### Cohere
- `cohere/embed-english-v3.0` - 1024 dims, boa qualidade
- `cohere/embed-multilingual-v3.0` - 1024 dims, multilíngue

## 🔗 Endpoints da API

### GET `/health`
Verifica saúde do serviço
```json
{
  "status": "healthy",
  "service": "rag-service",
  "config": {
    "embeddingModel": "openai/text-embedding-3-small",
    "embeddingType": "openai",
    "vectorDatabase": "qdrant",
    "topK": 5,
    "threshold": 0.6
  }
}
```

### GET `/models`
Lista modelos disponíveis
```json
{
  "availableModels": [
    "openai/text-embedding-3-small",
    "openai/text-embedding-3-large",
    "voyageai/voyage-code-2"
  ],
  "currentModel": "openai/text-embedding-3-small",
  "embeddingType": "openai",
  "vectorDatabase": "qdrant"
}
```

### POST `/store`
Armazena exemplo de código
```json
{
  "task": "Create a hello world function",
  "code": "function hello() { console.log('Hello!'); }",
  "language": "javascript",
  "tool": "code_generation",
  "success": true
}
```

### POST `/retrieve`
Recupera exemplos similares
```json
{
  "task": "Create a greeting function",
  "language": "javascript",
  "tool": "code_generation",
  "topK": 3,
  "threshold": 0.7
}
```

### POST `/configure`
Configura dinamicamente o serviço
```json
{
  "llmModel": "voyageai/voyage-code-2",
  "embeddingType": "voyage",
  "database": "qdrant",
  "topK": 5,
  "threshold": 0.6
}
```

## 🏗️ Arquitetura

```
┌─────────────────┐    ┌──────────────────┐
│   Services      │────│   RAG Client     │
│ • DAG Replanning│    │   (HTTP)        │
│ • Replanning    │    └─────────┬────────┘
│ • Search        │              │
└─────────────────┘              ▼
                       ┌──────────────────┐
                       │   RAG Service    │
                       │   (Porta 3120)   │
                       └─────────┬────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
           ┌────────▼────────┐      ┌────────▼────────┐
           │ Embedding      │      │ Vector DB       │
           │ Service        │      │ (Qdrant)        │
           │ (OpenRouter)   │      │                 │
           └────────────────┘      └─────────────────┘
```

## 🎛️ Configuração Dinâmica

O RAG service permite mudanças de configuração em runtime:

```bash
# Mudar para Voyage AI (melhor para código)
curl -X POST http://localhost:3120/configure \
  -H "Content-Type: application/json" \
  -d '{"llmModel": "voyageai/voyage-code-2", "embeddingType": "voyage"}'

# Verificar mudança
curl http://localhost:3120/health
```

## 📊 Monitoramento

### Logs
```bash
# Ver logs do container
docker logs rag-service

# Ou via script
./rag-service-manager.sh logs
```

### Métricas
```bash
# Ver estatísticas do Qdrant
curl http://54.37.225.188:6333/collections/code_examples

# Ver saúde do RAG service
curl http://localhost:3120/health
```

## 🔧 Troubleshooting

### Problema: Embeddings falhando
```bash
# Verificar API key
echo $OPENROUTER_API_KEY

# Testar conectividade
curl -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  https://openrouter.ai/api/v1/models
```

### Problema: Qdrant não responde
```bash
# Verificar se está rodando
./qdrant-manager.sh status

# Reiniciar Qdrant
./qdrant-manager.sh restart
```

### Problema: Resultados ruins
```bash
# Ajustar threshold
curl -X POST http://localhost:3120/configure \
  -H "Content-Type: application/json" \
  -d '{"threshold": 0.8}'

# Ou mudar modelo
curl -X POST http://localhost:3120/configure \
  -H "Content-Type: application/json" \
  -d '{"llmModel": "openai/text-embedding-3-large"}'
```

## 🚀 Próximos Passos

1. **Modelo de Roteamento**: Roteamento automático baseado no tipo de tarefa
2. **Cache de Embeddings**: Cache local para reduzir custos
3. **Híbrido Local/API**: Fallback para modelos locais
4. **Fine-tuning**: Modelos customizados para código
5. **Multi-modal**: Suporte a imagens/código

---

**🎉 RAG Service: Busca semântica inteligente para todos os serviços!**
