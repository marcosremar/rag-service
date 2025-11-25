#!/usr/bin/env node

/**
 * Test script for Code Graph in RAG Service
 */

const BASE_URL = process.env.RAG_URL || 'http://localhost:3120';

async function testCodeGraph() {
  console.log('🧪 Testing Code Graph in RAG Service...\n');

  // Test health check
  console.log('1. Testing health check...');
  try {
    const healthRes = await fetch(`${BASE_URL}/health`);
    const health = await healthRes.json();
    console.log('✅ Health:', health);
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return;
  }

  // Test get all dependencies
  console.log('\n2. Testing get all dependencies graph...');
  try {
    const graphRes = await fetch(`${BASE_URL}/code-graph/all`);
    const graph = await graphRes.json();
    console.log('✅ Code Graph:', {
      edges: graph.edges?.length || 0,
      nodeCount: graph.nodeCount || 0,
    });
  } catch (error) {
    console.error('❌ Code graph failed:', error.message);
  }

  // Test get dependencies of a file
  console.log('\n3. Testing get dependencies of a file...');
  try {
    const depsRes = await fetch(`${BASE_URL}/code-graph/dependencies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filePath: 'src/server.ts',
      }),
    });
    const deps = await depsRes.json();
    console.log('✅ Dependencies:', deps);
  } catch (error) {
    console.error('❌ Dependencies failed:', error.message);
  }

  // Test get dependents
  console.log('\n4. Testing get dependents...');
  try {
    const dependentsRes = await fetch(`${BASE_URL}/code-graph/dependents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filePath: 'src/server.ts',
      }),
    });
    const dependents = await dependentsRes.json();
    console.log('✅ Dependents:', dependents);
  } catch (error) {
    console.error('❌ Dependents failed:', error.message);
  }

  // Test get affected files
  console.log('\n5. Testing get affected files...');
  try {
    const affectedRes = await fetch(`${BASE_URL}/code-graph/affected`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filePath: 'src/server.ts',
      }),
    });
    const affected = await affectedRes.json();
    console.log('✅ Affected files:', affected);
  } catch (error) {
    console.error('❌ Affected files failed:', error.message);
  }

  console.log('\n✅ Code Graph tests completed!');
}

testCodeGraph().catch(console.error);


