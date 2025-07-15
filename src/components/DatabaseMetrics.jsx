import React, { useState, useEffect } from 'react';

const DatabaseMetrics = ({ refreshTrigger }) => {
  const [metrics, setMetrics] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchMetrics = async () => {
    try {
      setIsLoading(true);
      setError('');
      
      console.log('Fetching metrics from /api/metrics');
      const response = await fetch('/api/metrics');
      console.log('Response status:', response.status);
      console.log('Response headers:', response.headers.get('content-type'));
      
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Received data:', data);
      
      setMetrics(data);
    } catch (error) {
      console.error('Fetch error:', error);
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        setError('Backend server not available. Please start the server with "npm run server"');
      } else {
        setError(`Error: ${error.message}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [refreshTrigger]);

  const formatNumber = (num) => {
    return new Intl.NumberFormat().format(num);
  };

  const formatPercentage = (num) => {
    return (num * 100).toFixed(1);
  };

  if (isLoading) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">Database Metrics</h2>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-2 text-gray-600">Loading metrics...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">Database Metrics</h2>
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-600 text-sm">❌ {error}</p>
          <button
            onClick={fetchMetrics}
            className="mt-2 text-sm text-blue-600 hover:text-blue-800 underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-800">Database Metrics</h2>
        <button
          onClick={fetchMetrics}
          className="text-sm text-blue-600 hover:text-blue-800 underline"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-blue-600">
            {formatNumber(metrics.totalVectors)}
          </div>
          <div className="text-sm text-gray-600">Total Vectors</div>
        </div>

        <div className="bg-green-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-green-600">
            {metrics.dimension}
          </div>
          <div className="text-sm text-gray-600">Dimensions</div>
        </div>

        <div className="bg-purple-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-purple-600">
            {formatPercentage(metrics.indexFullness)}%
          </div>
          <div className="text-sm text-gray-600">Index Fullness</div>
        </div>

        <div className="bg-orange-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-orange-600">
            {Object.keys(metrics.namespaces || {}).length}
          </div>
          <div className="text-sm text-gray-600">Namespaces</div>
        </div>
      </div>

      {metrics.namespaces && Object.keys(metrics.namespaces).length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">Namespace Details</h3>
          <div className="space-y-2">
            {Object.entries(metrics.namespaces).map(([namespace, data]) => (
              <div key={namespace} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                <span className="font-medium text-gray-700">
                  {namespace === '' ? 'Default' : namespace}
                </span>
                <span className="text-sm text-gray-600">
                  {formatNumber(data.vectorCount || 0)} vectors
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 text-xs text-gray-500">
        <p>Last updated: {new Date().toLocaleString()}</p>
      </div>
    </div>
  );
};

export default DatabaseMetrics;