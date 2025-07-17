import React, { useState } from 'react';

const QueryForm = () => {
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(5);
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setResults([]);

    try {
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, topK }),
      });

      const result = await response.json();

      if (response.ok) {
        setResults(result.results || []);
      } else {
        setError(result.error || 'Failed to search');
      }
    } catch (error) {
      setError(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const formatScore = (score) => {
    return (score * 100).toFixed(1);
  };

  const highlightQuery = (text, query) => {
    if (!query) return text;
    
    const words = query.toLowerCase().split(' ');
    let highlightedText = text;
    
    words.forEach(word => {
      if (word.length > 2) {
        const regex = new RegExp(`(${word})`, 'gi');
        highlightedText = highlightedText.replace(regex, '<mark class="bg-yellow-200">$1</mark>');
      }
    });
    
    return highlightedText;
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Search Database</h2>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-4 mb-6">
        <div>
          <label htmlFor="query" className="block text-sm font-medium text-gray-700 mb-1">
            Search Query
          </label>
          <input
            type="text"
            id="query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            required
            placeholder="e.g., 'to be or not to be', 'love sonnets', 'Hamlet soliloquy'"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
          />
        </div>

        <div className="flex items-center space-x-4">
          <div>
            <label htmlFor="topK" className="block text-sm font-medium text-gray-700 mb-1">
              Number of Results
            </label>
            <select
              id="topK"
              value={topK}
              onChange={(e) => setTopK(parseInt(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
            >
              <option value={3}>3</option>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={15}>15</option>
            </select>
          </div>

          <div className="flex-1">
            <button
              type="submit"
              disabled={isLoading}
              className="bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200"
            >
              {isLoading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>
      </form>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-600 text-sm">❌ {error}</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-800">
              Search Results ({results.length})
            </h3>
            <div className="text-sm text-gray-500">
              Query: "{query}"
            </div>
          </div>

          <div className="space-y-4">
            {results.map((result, index) => (
              <div key={result.id} className="border border-gray-200 rounded-md p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-3">
                    <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded">
                      #{index + 1}
                    </span>
                    <span className="font-medium text-gray-800 text-sm">
                      {result.work}
                    </span>
                    {result.speaker && (
                      <span className="bg-purple-100 text-purple-800 text-xs font-medium px-2 py-1 rounded">
                        {result.speaker}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-green-600">
                      {formatScore(result.score)}% match
                    </div>
                    <div className="text-xs text-gray-500">
                      {result.wordCount} words
                    </div>
                  </div>
                </div>
                
                <div className="mt-2">
                  <div 
                    className="text-gray-700 text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{
                      __html: highlightQuery(result.text, query)
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isLoading && results.length === 0 && query && !error && (
        <div className="text-center py-8 text-gray-500">
          <p>No results found for "{query}"</p>
          <p className="text-sm mt-1">Try different keywords or phrases</p>
        </div>
      )}
    </div>
  );
};

export default QueryForm;