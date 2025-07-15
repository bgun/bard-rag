import React, { useState } from 'react';
import QueryForm from './components/QueryForm';
import DatabaseMetrics from './components/DatabaseMetrics';

function App() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleResetSuccess = () => {
    // Trigger a refresh of the metrics
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Shakespeare RAG System
          </h1>
          <p className="text-gray-600">
            Search and analyze Shakespeare's works with vector similarity
          </p>
        </header>

        <div className="space-y-8">
          {/* Database Metrics */}
          <DatabaseMetrics refreshTrigger={refreshTrigger} />

          {/* Query Form */}
          <QueryForm onResetSuccess={handleResetSuccess} />
        </div>

        <footer className="mt-12 text-center text-gray-500 text-sm">
          <p>
            Built with React, Tailwind CSS, and Pinecone Vector Database
          </p>
          <p className="mt-1">
            Processing Shakespeare's works with semantic search capabilities
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App;