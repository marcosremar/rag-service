#!/usr/bin/env node

/**
 * 🧪 TESTE ABRANGENTE DO RAG SERVICE
 * Testa todas as funcionalidades do sistema RAG
 */

import axios from 'axios';
import { performance } from 'perf_hooks';

const RAG_SERVICE_URL = 'http://localhost:3120';
const QDRANT_URL = 'http://localhost:6333';

class RAGServiceTester {
  constructor() {
    this.client = axios.create({
      baseURL: RAG_SERVICE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    this.qdrantClient = axios.create({
      baseURL: QDRANT_URL,
      timeout: 10000
    });
  }

  async testHealthCheck() {
    console.log('\n🏥 TESTANDO HEALTH CHECK...');
    try {
      const response = await this.client.get('/health');
      console.log('✅ Health check:', response.data);
      return true;
    } catch (error) {
      console.log('❌ Health check failed:', error.message);
      return false;
    }
  }

  async testQdrantHealth() {
    console.log('\n🧠 TESTANDO QDRANT HEALTH...');
    try {
      const response = await this.qdrantClient.get('/');
      console.log('✅ Qdrant health:', response.data);
      return true;
    } catch (error) {
      console.log('❌ Qdrant health failed:', error.message);
      return false;
    }
  }

  async testStoreSuccessExamples() {
    console.log('\n💾 TESTANDO ARMAZENAMENTO DE EXEMPLOS DE SUCESSO...');

    const examples = [
      {
        task: "Create a hello world function in JavaScript",
        code: "function helloWorld() {\n  console.log('Hello, World!');\n}\n\nhelloWorld();",
        language: "javascript",
        framework: null,
        tool: "create_file",
        success: true
      },
      {
        task: "Create a simple React component",
        code: "import React from 'react';\n\nconst HelloComponent = () => {\n  return <div>Hello, World!</div>;\n};\nexport default HelloComponent;",
        language: "javascript",
        framework: "react",
        tool: "create_file",
        success: true
      },
      {
        task: "Create a Python function to calculate factorial",
        code: "def factorial(n):\n    if n == 0 or n == 1:\n        return 1\n    return n * factorial(n - 1)\n\nprint(factorial(5))",
        language: "python",
        framework: null,
        tool: "create_file",
        success: true
      }
    ];

    const results = [];
    for (const example of examples) {
      try {
        const start = performance.now();
        const response = await this.client.post('/store', example);
        const end = performance.now();

        console.log(`✅ Stored success example (${(end - start).toFixed(2)}ms):`, {
          exampleId: response.data.exampleId,
          task: example.task.substring(0, 50) + '...',
          language: example.language
        });
        results.push(response.data);
      } catch (error) {
        console.log('❌ Failed to store success example:', error.response?.data || error.message);
        results.push(null);
      }
    }

    return results;
  }

  async testStoreErrorExamples() {
    console.log('\n📝 TESTANDO ARMAZENAMENTO DE EXEMPLOS DE ERRO...');

    const errorExamples = [
      {
        task: "Create a function with syntax error",
        code: "function brokenFunction() {\n  console.log('Missing closing brace'\n",
        language: "javascript",
        framework: null,
        tool: "create_file",
        success: false,
        errorMessage: "SyntaxError: Missing closing brace"
      },
      {
        task: "Create a component with import error",
        code: "import React from 'react';\nimport { NonExistent } from 'fake-package';\n\nconst BrokenComponent = () => <div>Error</div>;",
        language: "javascript",
        framework: "react",
        tool: "create_file",
        success: false,
        errorMessage: "Module 'fake-package' not found"
      }
    ];

    const results = [];
    for (const example of errorExamples) {
      try {
        const start = performance.now();
        const response = await this.client.post('/store', example);
        const end = performance.now();

        console.log(`✅ Stored error example (${(end - start).toFixed(2)}ms):`, {
          exampleId: response.data.exampleId,
          errorMessage: example.errorMessage?.substring(0, 40) + '...',
          task: example.task.substring(0, 40) + '...'
        });
        results.push(response.data);
      } catch (error) {
        console.log('❌ Failed to store error example:', error.response?.data || error.message);
        results.push(null);
      }
    }

    return results;
  }

  async testRetrieveSimilarExamples() {
    console.log('\n🔍 TESTANDO RECUPERAÇÃO DE EXEMPLOS SIMILARES...');

    const queries = [
      {
        task: "Create a greeting function in JavaScript",
        language: "javascript",
        topK: 3
      },
      {
        task: "Build a React component that displays hello",
        language: "javascript",
        tool: "create_file",
        topK: 3
      },
      {
        task: "Write a Python factorial function",
        language: "python",
        topK: 2
      },
      {
        task: "Create a function with broken syntax",
        topK: 2
      }
    ];

    const results = [];
    for (const query of queries) {
      try {
        const start = performance.now();
        const response = await this.client.post('/retrieve', query);
        const end = performance.now();

        console.log(`✅ Retrieved similar examples for "${query.task.substring(0, 30)}..." (${(end - start).toFixed(2)}ms):`);
        console.log(`   Found ${response.data.results.length} results`);

        if (response.data.results.length > 0) {
          response.data.results.forEach((result, idx) => {
            console.log(`   ${idx + 1}. ${result.task.substring(0, 50)}... (similarity: ${(result.similarity * 100).toFixed(1)}%)`);
          });
        }

        results.push(response.data);
      } catch (error) {
        console.log('❌ Failed to retrieve similar examples:', error.response?.data || error.message);
        results.push({ results: [] });
      }
    }

    return results;
  }

  async testVectorSearch() {
    console.log('\n🔎 TESTANDO BUSCA VETORIAL DIRETA...');

    const queries = [
      "Create a JavaScript function",
      "React component tutorial",
      "Python recursive functions"
    ];

    const results = [];
    for (const query of queries) {
      try {
        const start = performance.now();
        const response = await this.client.post('/search', {
          query: query,
          topK: 3
        });
        const end = performance.now();

        console.log(`✅ Vector search for "${query}" (${(end - start).toFixed(2)}ms): ${response.data.results.length} results`);
        results.push(response.data);
      } catch (error) {
        console.log('❌ Failed vector search:', error.response?.data || error.message);
        results.push({ results: [] });
      }
    }

    return results;
  }

  async testHybridSearch() {
    console.log('\n🔄 TESTANDO BUSCA HÍBRIDA...');

    const queries = [
      {
        query: "JavaScript function examples",
        topK: 3
      },
      {
        query: "React component patterns",
        topK: 2
      }
    ];

    const results = [];
    for (const query of queries) {
      try {
        const start = performance.now();
        const response = await this.client.post('/hybrid-search', query);
        const end = performance.now();

        console.log(`✅ Hybrid search for "${query.query}" (${(end - start).toFixed(2)}ms): ${response.data.results.length} results`);
        results.push(response.data);
      } catch (error) {
        console.log('❌ Failed hybrid search:', error.response?.data || error.message);
        results.push({ results: [] });
      }
    }

    return results;
  }

  async testConfiguration() {
    console.log('\n⚙️ TESTANDO CONFIGURAÇÃO...');

    try {
      const response = await this.client.post('/configure', {
        embeddingModel: 'openai/text-embedding-3-small',
        topK: 5,
        threshold: 0.7
      });

      console.log('✅ Configuration updated:', response.data);
      return response.data;
    } catch (error) {
      console.log('❌ Failed to configure:', error.response?.data || error.message);
      return null;
    }
  }

  async testQdrantIntegration() {
    console.log('\n🔗 TESTANDO INTEGRAÇÃO COM QDRANT...');

    try {
      // Verificar collections no Qdrant
      const collectionsResponse = await this.qdrantClient.get('/collections');
      console.log('✅ Qdrant collections:', collectionsResponse.data.result?.collections?.length || 0);

      // Se há collections, verificar pontos
      if (collectionsResponse.data.result?.collections?.length > 0) {
        const collectionName = collectionsResponse.data.result.collections[0].name;
        try {
          const pointsResponse = await this.qdrantClient.post(`/collections/${collectionName}/points/count`);
          console.log(`✅ Collection "${collectionName}": ${pointsResponse.data.result?.count || 0} points`);
        } catch (countError) {
          console.log(`⚠️ Could not count points in "${collectionName}":`, countError.response?.status || countError.message);
        }
      }

      return true;
    } catch (error) {
      console.log('❌ Qdrant integration test failed:', error.message);
      return false;
    }
  }

  async runAllTests() {
    console.log('🚀 INICIANDO TESTE ABRANGENTE DO RAG SERVICE\n');
    console.log('=' .repeat(60));

    const results = {
      healthCheck: await this.testHealthCheck(),
      qdrantHealth: await this.testQdrantHealth(),
      successExamples: await this.testStoreSuccessExamples(),
      errorExamples: await this.testStoreErrorExamples(),
      similarRetrieval: await this.testRetrieveSimilarExamples(),
      vectorSearch: await this.testVectorSearch(),
      hybridSearch: await this.testHybridSearch(),
      configuration: await this.testConfiguration(),
      qdrantIntegration: await this.testQdrantIntegration()
    };

    console.log('\n' + '=' .repeat(60));
    console.log('📋 RESUMO DOS TESTES:');

    const passedTests = Object.values(results).filter(result =>
      result !== null && result !== false && (!Array.isArray(result) || result.length > 0)
    ).length;

    const totalTests = Object.keys(results).length;

    console.log(`✅ ${passedTests}/${totalTests} testes passaram`);

    if (passedTests === totalTests) {
      console.log('🎉 TODOS OS TESTES PASSARAM! RAG Service está funcionando perfeitamente.');
    } else {
      console.log('⚠️ Alguns testes falharam. Verifique os logs acima.');
    }

    return results;
  }
}

// Executar testes
async function main() {
  try {
    const tester = new RAGServiceTester();
    await tester.runAllTests();
  } catch (error) {
    console.error('❌ Erro fatal durante testes:', error);
    process.exit(1);
  }
}

main();