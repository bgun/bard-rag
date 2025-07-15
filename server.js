import express from 'express';
import cors from 'cors';
import { Pinecone } from '@pinecone-database/pinecone';
import { readFileSync } from 'fs';
import 'dotenv/config';

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

// Log all incoming requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

console.log('Initializing Pinecone...');
const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY
});
console.log('Pinecone initialized');

const INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'shakespeare-rag';
let index;

async function initializeIndex() {
  try {
    console.log('Checking if Pinecone index exists...');
    
    // Check if index exists
    const indexList = await pc.listIndexes();
    const indexExists = indexList.indexes?.some(idx => idx.name === INDEX_NAME);
    
    if (!indexExists) {
      console.log(`Creating Pinecone index: ${INDEX_NAME}`);
      await pc.createIndex({
        name: INDEX_NAME,
        dimension: 1024,
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1'
          }
        }
      });
      
      // Wait for index to be ready
      console.log('Waiting for index to be ready...');
      let indexReady = false;
      while (!indexReady) {
        const indexDescription = await pc.describeIndex(INDEX_NAME);
        if (indexDescription.status?.ready) {
          indexReady = true;
          console.log('Index is ready');
        } else {
          console.log('Index not ready yet, waiting...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } else {
      console.log('Index already exists');
    }
    
    console.log('Getting Pinecone index...');
    index = pc.index(INDEX_NAME);
    console.log('Index connection established');
  } catch (error) {
    console.error('Error initializing index:', error);
    process.exit(1);
  }
}

async function resetDatabase() {
  try {
    if (!index) {
      throw new Error('Index not initialized');
    }
    
    console.log('Clearing existing vectors...');
    try {
      await index.deleteAll();
      console.log('Vector database cleared');
    } catch (error) {
      if (error.message.includes('404')) {
        console.log('Index appears to be empty, skipping clear operation');
      } else {
        throw error;
      }
    }
    
    console.log('Loading vectors from vectors.json...');
    const vectorsData = JSON.parse(readFileSync('./vectors.json', 'utf-8'));
    const chunks = vectorsData.chunks;
    
    console.log(`Found ${chunks.length} chunks to upsert`);
    
    // Process chunks in batches to avoid overwhelming the API
    const batchSize = 100;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      
      const vectors = batch.map(chunk => ({
        id: chunk.id.toString(),
        values: new Array(1024).fill(0).map(() => Math.random() - 0.5), // Placeholder embeddings
        metadata: {
          work: chunk.work,
          speaker: chunk.speaker,
          text: chunk.text,
          textLength: chunk.textLength,
          wordCount: chunk.wordCount
        }
      }));
      
      await index.upsert(vectors);
      console.log(`Upserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)}`);
    }
    
    console.log('Database reset complete');
    return { success: true, message: 'Database reset successfully', chunksLoaded: chunks.length };
  } catch (error) {
    console.error('Error resetting database:', error);
    throw error;
  }
}

console.log('Setting up routes...');

app.get('/api/health', (req, res) => {
  console.log('Health endpoint called');
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});
console.log('Health route registered');

app.get('/api/metrics', async (req, res) => {
  console.log('Metrics endpoint called');
  try {
    if (!index) {
      return res.status(503).json({ error: 'Database not initialized' });
    }
    
    const stats = await index.describeIndexStats();
    console.log('Raw Pinecone stats:', JSON.stringify(stats, null, 2));
    
    // Calculate total vectors across all namespaces
    let totalVectors = 0;
    if (stats.namespaces) {
      Object.values(stats.namespaces).forEach(namespace => {
        totalVectors += namespace.vectorCount || 0;
      });
    }
    
    // Also check if totalVectorCount is available at the top level
    if (stats.totalVectorCount) {
      totalVectors = Math.max(totalVectors, stats.totalVectorCount);
    }
    
    res.json({
      totalVectors: totalVectors,
      dimension: stats.dimension || 1024,
      indexFullness: stats.indexFullness || 0,
      namespaces: stats.namespaces || {},
      rawStats: stats,
      status: 'Server running'
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ error: error.message });
  }
});
console.log('Metrics route registered');

app.post('/api/reset', async (req, res) => {
  console.log('Reset endpoint called');
  try {
    const result = await resetDatabase();
    res.json(result);
  } catch (error) {
    console.error('Error resetting database:', error);
    res.status(500).json({ error: error.message });
  }
});
console.log('Reset route registered');

app.post('/api/query', async (req, res) => {
  console.log('Query endpoint called');
  try {
    const { query, topK = 5 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    if (!index) {
      return res.status(503).json({ error: 'Database not initialized' });
    }
    
    // Generate a placeholder query vector (same dimension as stored vectors)
    const queryVector = new Array(1024).fill(0).map(() => Math.random() - 0.5);
    
    const queryResponse = await index.query({
      vector: queryVector,
      topK: Math.min(topK, 100), // Limit to max 100 results
      includeMetadata: true
    });
    
    const results = queryResponse.matches.map(match => ({
      id: match.id,
      score: match.score,
      work: match.metadata.work,
      speaker: match.metadata.speaker,
      text: match.metadata.text,
      textLength: match.metadata.textLength,
      wordCount: match.metadata.wordCount
    }));
    
    res.json({
      query,
      results,
      totalResults: results.length
    });
  } catch (error) {
    console.error('Error querying database:', error);
    res.status(500).json({ error: error.message });
  }
});
console.log('Query route registered');

// Catch-all route to see what requests are coming in
app.use('*', (req, res) => {
  console.log(`Unhandled request: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

console.log('Routes registered');
console.log('Starting server...');

app.listen(port, async () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log('Available routes:');
  console.log('- GET /api/health');
  console.log('- GET /api/metrics');
  console.log('- POST /api/reset');
  console.log('- POST /api/query');
  
  // Initialize index connection on startup
  await initializeIndex();
});