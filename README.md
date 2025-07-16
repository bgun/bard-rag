# bard-rag
### Shakespeare RAG Search

A semantic search engine for exploring Shakespeare's complete works using RAG (Retrieval Augmented Generation) and vector embeddings.

This project allows users to search through Shakespeare's plays and sonnets using natural language queries, finding relevant passages based on semantic meaning rather than just keyword matching. It uses vector embeddings to encode the text and Pinecone as a vector database for efficient similarity search.

## Features

- Semantic search across Shakespeare's complete works
- Vector embeddings for capturing meaning and context
- Fast similarity search using Pinecone vector database
- React frontend for easy exploration
- REST API backend with Express

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Create a `.env` file with your Pinecone and OpenAI API keys


## How to use

`node ingest.js`
Parses data/shakespeare-complete-works and generates chunked vectors in vectors.json, then clears the Pinecone database and reloads with chunks from vectors.json

`node server.js`
Runs the backend server on port 3001 with the following endpoints:
- GET `/api/health` - Returns server health status
- GET `/api/metrics` - Returns database metrics including total vectors and index stats
- POST `/api/query` - Accepts a text query and returns relevant Shakespeare passages based on semantic similarity

`npm start`
Runs the React frontend at http://localhost:3000