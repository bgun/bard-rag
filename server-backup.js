import express from 'express';
import cors from 'cors';
import { Pinecone } from '@pinecone-database/pinecone';
import 'dotenv/config';

const app = express();
const port = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Pinecone
console.log('Initializing Pinecone...');
let pc;
try {
  pc = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY
  });
  console.log('Pinecone initialized successfully');
} catch (error) {
  console.error('Error initializing Pinecone:', error);
  console.error('Please check your PINECONE_API_KEY in .env file');
  process.exit(1);
}

const indexName = 'shakespeare-rag';

// Helper function to chunk text by speakers (for plays)
function chunkBySpeak(text) {
  const chunks = [];
  const lines = text.split('\n');
  let currentChunk = '';
  let currentSpeaker = '';
  
  for (const line of lines) {
    // Check if line contains a speaker (usually all caps followed by a period)
    const speakerMatch = line.match(/^([A-Z][A-Z\s]+)\./);
    
    if (speakerMatch && speakerMatch[1].trim().length > 1) {
      // If we have a current chunk, save it
      if (currentChunk.trim()) {
        chunks.push({
          speaker: currentSpeaker,
          text: currentChunk.trim()
        });
      }
      
      // Start new chunk
      currentSpeaker = speakerMatch[1].trim();
      currentChunk = line + '\n';
    } else if (currentChunk) {
      // Add line to current chunk
      currentChunk += line + '\n';
    }
  }
  
  // Add final chunk
  if (currentChunk.trim()) {
    chunks.push({
      speaker: currentSpeaker,
      text: currentChunk.trim()
    });
  }
  
  return chunks;
}

// Helper function to chunk text normally (for sonnets)
function chunkNormally(text, maxSize = 800, overlap = 100) {
  const chunks = [];
  let start = 0;
  
  while (start < text.length) {
    let end = start + maxSize;
    
    if (end < text.length) {
      const sentenceEnd = text.lastIndexOf('.', end);
      const wordEnd = text.lastIndexOf(' ', end);
      
      if (sentenceEnd > start + maxSize / 2) {
        end = sentenceEnd + 1;
      } else if (wordEnd > start + maxSize / 2) {
        end = wordEnd;
      }
    }
    
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push({
        text: chunk,
        speaker: null
      });
    }
    
    start = end - overlap;
  }
  
  return chunks;
}

// Helper function to generate embeddings using Pinecone
async function generateEmbedding(text) {
  try {
    console.log('Generating embedding for text length:', text.length);
    const embedResponse = await pc.inference.embed({
      model: 'multilingual-e5-large',
      inputs: [text]
    });
    console.log('Embedding generated successfully');
    return embedResponse.data[0].values;
  } catch (error) {
    console.error('Error generating embedding:', error);
    console.error('Error details:', error.message);
    throw error;
  }
}

// API Routes
console.log('Setting up API routes...');

// Get database metrics
app.get('/api/metrics', async (req, res) => {
  console.log('Metrics endpoint called');
  
  if (!pc) {
    return res.status(500).json({ error: 'Pinecone not initialized' });
  }
  
  try {
    console.log('Fetching metrics...');
    
    // Check if index exists first
    console.log('Listing indexes...');
    const indexes = await pc.listIndexes();
    console.log('Indexes response:', indexes);
    
    const indexExists = indexes.indexes?.some(i => i.name === indexName);
    console.log(`Index ${indexName} exists:`, indexExists);
    
    if (!indexExists) {
      console.log(`Index ${indexName} does not exist. Creating it...`);
      await pc.createIndex({
        name: indexName,
        dimension: 1024,
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1'
          }
        },
        waitUntilReady: true,
      });
      console.log(`Index ${indexName} created successfully`);
    }
    
    console.log('Getting index reference...');
    const index = pc.index(indexName);
    
    console.log('Describing index stats...');
    const stats = await index.describeIndexStats();
    console.log('Stats response:', stats);
    
    const response = {
      totalVectors: stats.totalVectorCount || 0,
      dimension: stats.dimension || 1024,
      indexFullness: stats.indexFullness || 0,
      namespaces: stats.namespaces || {}
    };
    
    console.log('Sending response:', response);
    res.json(response);
  } catch (error) {
    console.error('Error getting metrics:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: `Failed to get database metrics: ${error.message}` });
  }
});

// Upsert new document
app.post('/api/upsert', async (req, res) => {
  try {
    const { documentName, text, category } = req.body;
    
    if (!documentName || !text || !category) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const index = pc.index(indexName);
    
    // Chunk the text based on category
    let chunks;
    if (category === 'Play') {
      chunks = chunkBySpeak(text);
    } else {
      chunks = chunkNormally(text);
    }
    
    console.log(`Processing ${chunks.length} chunks for ${documentName}`);
    
    // Process chunks in batches
    const vectors = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await generateEmbedding(chunk.text);
      
      vectors.push({
        id: `${documentName.replace(/[^a-zA-Z0-9]/g, '_')}_chunk_${i}`,
        values: embedding,
        metadata: {
          document: documentName,
          category: category,
          text: chunk.text,
          speaker: chunk.speaker,
          chunkIndex: i,
          textLength: chunk.text.length
        }
      });
    }
    
    // Upsert to Pinecone
    await index.upsert(vectors);
    
    res.json({
      success: true,
      message: `Successfully processed ${chunks.length} chunks for ${documentName}`,
      chunksProcessed: chunks.length
    });
    
  } catch (error) {
    console.error('Error upserting document:', error);
    res.status(500).json({ error: 'Failed to upsert document' });
  }
});

// Query the database
app.post('/api/query', async (req, res) => {
  try {
    const { query, topK = 5 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    const index = pc.index(indexName);
    
    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query);
    
    // Search Pinecone
    const searchResponse = await index.query({
      vector: queryEmbedding,
      topK: parseInt(topK),
      includeMetadata: true
    });
    
    // Format results
    const results = searchResponse.matches?.map(match => ({
      id: match.id,
      score: match.score,
      document: match.metadata?.document,
      category: match.metadata?.category,
      speaker: match.metadata?.speaker,
      text: match.metadata?.text,
      chunkIndex: match.metadata?.chunkIndex
    })) || [];
    
    res.json({
      query,
      results,
      totalResults: results.length
    });
    
  } catch (error) {
    console.error('Error querying database:', error);
    res.status(500).json({ error: 'Failed to query database' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  console.log('Health endpoint called');
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

console.log('Routes registered successfully');
console.log('Starting server...');
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log('Available routes:');
  console.log('- GET /api/health');
  console.log('- GET /api/metrics');
  console.log('- POST /api/upsert');
  console.log('- POST /api/query');
});