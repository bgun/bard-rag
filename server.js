import express from 'express';
import cors from 'cors';
import { Pinecone } from '@pinecone-database/pinecone';
import { readFileSync } from 'fs';
import OpenAI from 'openai';
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

console.log('Initializing OpenAI...');
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
console.log('OpenAI initialized');

const INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'shakespeare-rag';
let index;

// Vector normalization utilities
function normalizeVector(vector) {
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (magnitude === 0) {
    throw new Error('Cannot normalize zero vector');
  }
  return vector.map(val => val / magnitude);
}

function vectorMagnitude(vector) {
  return Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
}

function isVectorNormalized(vector, tolerance = 1e-6) {
  const magnitude = vectorMagnitude(vector);
  return Math.abs(magnitude - 1.0) < tolerance;
}

function generateNormalizedRandomVector(dimension) {
  // Generate random vector with normal distribution
  const vector = Array.from({ length: dimension }, () => 
    Math.random() * 2 - 1 // Random between -1 and 1
  );
  
  // Normalize it
  return normalizeVector(vector);
}

// Function to generate embeddings using OpenAI
async function generateEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.trim(),
      encoding_format: 'float'
    });
    
    const embedding = response.data[0].embedding;
    
    // Verify the embedding is the expected dimension
    if (embedding.length !== 1536) {
      throw new Error(`Expected 1536 dimensions, got ${embedding.length}`);
    }
    
    // Check if it's already normalized (OpenAI embeddings are usually normalized)
    const isNormalized = isVectorNormalized(embedding);
    if (!isNormalized) {
      console.log('Normalizing embedding...');
      return normalizeVector(embedding);
    }
    
    return embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

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
        // Check for both possible field names: vectorCount or recordCount
        totalVectors += namespace.vectorCount || namespace.recordCount || 0;
      });
    }
    
    // Also check if totalVectorCount or totalRecordCount is available at the top level
    if (stats.totalVectorCount) {
      totalVectors = Math.max(totalVectors, stats.totalVectorCount);
    }
    if (stats.totalRecordCount) {
      totalVectors = Math.max(totalVectors, stats.totalRecordCount);
    }
    
    res.json({
      totalVectors: totalVectors,
      dimension: stats.dimension || 1536,
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
    
    // Generate embedding for the query using OpenAI
    const queryVector = await generateEmbedding(query);
    
    // Verify query vector is normalized
    if (!isVectorNormalized(queryVector)) {
      console.warn(`Query vector is not normalized! Magnitude: ${vectorMagnitude(queryVector)}`);
    }
    
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

app.get('/api/validate-vectors', async (req, res) => {
  console.log('Vector validation endpoint called');
  try {
    if (!index) {
      return res.status(503).json({ error: 'Database not initialized' });
    }
    
    // Query a sample of vectors to check their normalization
    const sampleSize = parseInt(req.query.sampleSize) || 10;
    const queryVector = generateNormalizedRandomVector(1536);
    
    const queryResponse = await index.query({
      vector: queryVector,
      topK: sampleSize,
      includeMetadata: true,
      includeValues: true
    });
    
    const validationResults = queryResponse.matches.map(match => {
      const magnitude = match.metadata?.vectorMagnitude ? 
        parseFloat(match.metadata.vectorMagnitude) : 
        (match.values ? vectorMagnitude(match.values) : null);
      
      return {
        id: match.id,
        magnitude: magnitude,
        isNormalized: magnitude ? Math.abs(magnitude - 1.0) < 1e-6 : null,
        work: match.metadata?.work,
        speaker: match.metadata?.speaker
      };
    });
    
    const normalizedCount = validationResults.filter(r => r.isNormalized).length;
    const totalCount = validationResults.length;
    
    res.json({
      sampleSize: totalCount,
      normalizedVectors: normalizedCount,
      normalizationRate: totalCount > 0 ? (normalizedCount / totalCount * 100).toFixed(2) : 0,
      samples: validationResults,
      status: 'Vector validation complete'
    });
  } catch (error) {
    console.error('Error validating vectors:', error);
    res.status(500).json({ error: error.message });
  }
});
console.log('Vector validation route registered');

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
  console.log('- POST /api/query');
  console.log('- GET /api/validate-vectors');
  
  // Initialize index connection on startup
  await initializeIndex();
});