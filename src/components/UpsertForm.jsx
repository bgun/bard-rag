import React, { useState } from 'react';

const UpsertForm = ({ onSuccess }) => {
  const [formData, setFormData] = useState({
    documentName: '',
    text: '',
    category: 'Sonnet'
  });
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');

    try {
      const response = await fetch('/api/upsert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (response.ok) {
        setMessage(`✅ ${result.message}`);
        setFormData({
          documentName: '',
          text: '',
          category: 'Sonnet'
        });
        if (onSuccess) onSuccess();
      } else {
        setMessage(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      setMessage(`❌ Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Add New Document</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="documentName" className="block text-sm font-medium text-gray-700 mb-1">
            Document Name (Shakespeare Work)
          </label>
          <input
            type="text"
            id="documentName"
            name="documentName"
            value={formData.documentName}
            onChange={handleChange}
            required
            placeholder="e.g., Hamlet, Sonnet 18, Romeo and Juliet"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
            Category
          </label>
          <select
            id="category"
            name="category"
            value={formData.category}
            onChange={handleChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="Sonnet">Sonnet</option>
            <option value="Play">Play</option>
          </select>
        </div>

        <div>
          <label htmlFor="text" className="block text-sm font-medium text-gray-700 mb-1">
            Text Content
          </label>
          <textarea
            id="text"
            name="text"
            value={formData.text}
            onChange={handleChange}
            required
            rows={12}
            placeholder={
              formData.category === 'Play' 
                ? "Paste the play text here. It will be automatically chunked by speaker.\n\nExample:\nHAMLET.\nTo be, or not to be, that is the question:\nWhether 'tis nobler in the mind to suffer..."
                : "Paste the sonnet text here. It will be chunked normally.\n\nExample:\nShall I compare thee to a summer's day?\nThou art more lovely and more temperate..."
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-vertical"
          />
        </div>

        <div className="flex items-center justify-between">
          <button
            type="submit"
            disabled={isLoading}
            className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200"
          >
            {isLoading ? 'Processing...' : 'Add Document'}
          </button>
          
          <div className="text-sm text-gray-500">
            {formData.category === 'Play' ? 'Will be chunked by speaker' : 'Will be chunked normally'}
          </div>
        </div>
      </form>

      {message && (
        <div className="mt-4 p-3 rounded-md bg-gray-50 border">
          <p className="text-sm">{message}</p>
        </div>
      )}
    </div>
  );
};

export default UpsertForm;