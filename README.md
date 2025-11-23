# 🧠 RAG Service - Standalone

Serviço independente de **Retrieval-Augmented Generation** para busca semântica e recuperação de código usando embeddings vetoriais.

## 🚀 Funcionalidades

- **Busca Semântica**: Encontre código similar por significado, não apenas palavras-chave
- **Armazenamento Vetorial**: Persista exemplos de código com embeddings
- **Configurável**: Suporte a múltiplos LLMs e databases vetoriais
- **OpenRouter Integration**: Use qualquer modelo de embedding disponível
- **API REST**: Interface HTTP completa para integração

## 📦 Instalação

```bash
git clone https://github.com/marcosremar/rag-service.git
cd rag-service
npm install
```

## ⚙️ Configuração

Copie o arquivo de exemplo e configure suas variáveis:

```bash
cp rag-service-config.example .env
```

### Variáveis de Ambiente

```bash
# RAG Settings
RAG_TOP_K=5                           # Número padrão de resultados
RAG_SIMILARITY_THRESHOLD=0.6          # Threshold de similaridade mínimo

# Embedding Configuration
EMBEDDING_LLM_MODEL=openai/text-embedding-3-small  # Modelo de embedding
EMBEDDING_TYPE=openai                            # Tipo: openai, voyage, etc.
EMBEDDING_BACKEND=api                            # api ou local

# Vector Database
VECTOR_DATABASE=qdrant                           # qdrant ou lancedb
QDRANT_URL=http://localhost:6333                 # URL do Qdrant
QDRANT_COLLECTION=code_examples                  # Nome da coleção

# OpenRouter (para embeddings)
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

# Servidor
PORT=3120
HOST=0.0.0.0
LOG_LEVEL=info
```

## 🏃‍♂️ Executando

### Desenvolvimento
```bash
npm run dev
```

### Produção
```bash
npm run build
npm start
```

### Teste
```bash
npm test
```

## 🤖 Modelos de Embedding Disponíveis

### OpenAI (Recomendado)
- `openai/text-embedding-3-small` - 1536 dims, rápido e bom
- `openai/text-embedding-3-large` - 3072 dims, melhor qualidade

### Voyage AI (Bom para código)
- `voyageai/voyage-code-2` - 1536 dims, especializado em código

### Cohere
- `cohere/embed-english-v3.0` - 1024 dims, boa qualidade

## 🔗 Endpoints da API

### GET `/health`
Verifica saúde do serviço

### GET `/models`
Lista modelos disponíveis

### POST `/store`
Armazena exemplo de código

### POST `/retrieve`
Recupera exemplos similares

### POST `/configure`
Configura dinamicamente o serviço

## 🐳 Docker

```yaml
version: '3.8'
services:
  rag-service:
    build: .
    ports:
      - "3120:3120"
    environment:
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
      - QDRANT_URL=http://qdrant:6333
    depends_on:
      - qdrant

  qdrant:
    image: qdrant/qdrant
    ports:
      - "6333:6333"
```

## 📊 Monitoramento

### Health Check
```bash
curl http://localhost:3120/health
```

### Logs
```bash
npm run dev  # Logs aparecem no console
```

## 🔧 Desenvolvimento

### Estrutura do Projeto
```
src/
├── server.ts              # Ponto de entrada
├── config/                # Configuração
├── services/              # Serviços principais
│   ├── embedding.service.ts
│   ├── code-retrieval.service.ts
│   └── qdrant/
├── types/                 # TypeScript types
└── utils/                 # Utilitários
```

### Testando Localmente
```bash
# Inicie o Qdrant primeiro
docker run -p 6333:6333 qdrant/qdrant

# Configure o .env
cp rag-service-config.example .env
# Edite o .env com suas chaves

# Execute os testes
npm test
```

## 🤝 Como Usar em Outros Projetos

### Via Submódulo Git
```bash
git submodule add https://github.com/marcosremar/rag-service.git rag-service
cd rag-service && npm install
```

### Via HTTP Client
```typescript
import axios from 'axios';

const ragClient = axios.create({
  baseURL: 'http://localhost:3120'
});

// Armazenar exemplo
await ragClient.post('/store', {
  task: "Create a hello world function",
  code: "function hello() { console.log('Hello!'); }",
  language: "javascript",
  tool: "code_generation",
  success: true
});

// Recuperar exemplos similares
const response = await ragClient.post('/retrieve', {
  task: "Create a greeting function",
  language: "javascript",
  topK: 3
});
```

## 📄 Licença

MIT - veja o arquivo LICENSE para detalhes.

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

---

**🎉 RAG Service: Busca semântica inteligente para todos os projetos!**
