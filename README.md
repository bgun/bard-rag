# bard-rag

`node ingest.js`
Parses data/shakespeare-complete-works and generates chunked vectors in vectors.json

`node server.js`
Runs the backend server on port 3001 with the following endpoints:
- GET `/api/health` - Returns server health status
- GET `/api/metrics` - Returns database metrics including total vectors and index stats
- POST `/api/reset` - Resets the vector database by clearing existing vectors and reloading from vectors.json
- POST `/api/query` - Accepts a text query and returns relevant Shakespeare passages based on semantic similarity

`npm start`
Runs the React frontend at http://localhost:3000