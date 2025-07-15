import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Pinecone } from '@pinecone-database/pinecone';
import 'dotenv/config';

// Initialize Pinecone
const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY
});

const INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'shakespeare-rag';

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

// Read the Shakespeare text file
const shakespeareText = readFileSync('./data/shakespeare-complete-works.txt', 'utf-8');

// List of Shakespeare works to identify
const shakespeareWorks = [
  'THE SONNETS',
  'ALL\'S WELL THAT ENDS WELL',
  'THE TRAGEDY OF ANTONY AND CLEOPATRA',
  'AS YOU LIKE IT',
  'THE COMEDY OF ERRORS',
  'THE TRAGEDY OF CORIOLANUS',
  'CYMBELINE',
  'THE TRAGEDY OF HAMLET, PRINCE OF DENMARK',
  'THE FIRST PART OF KING HENRY THE FOURTH',
  'THE SECOND PART OF KING HENRY THE FOURTH',
  'THE LIFE OF KING HENRY THE FIFTH',
  'THE FIRST PART OF HENRY THE SIXTH',
  'THE SECOND PART OF KING HENRY THE SIXTH',
  'THE THIRD PART OF KING HENRY THE SIXTH',
  'KING HENRY THE EIGHTH',
  'THE LIFE AND DEATH OF KING JOHN',
  'THE TRAGEDY OF JULIUS CAESAR',
  'THE TRAGEDY OF KING LEAR',
  'LOVE\'S LABOUR\'S LOST',
  'THE TRAGEDY OF MACBETH',
  'MEASURE FOR MEASURE',
  'THE MERCHANT OF VENICE',
  'THE MERRY WIVES OF WINDSOR',
  'A MIDSUMMER NIGHT\'S DREAM',
  'MUCH ADO ABOUT NOTHING',
  'THE TRAGEDY OF OTHELLO, THE MOOR OF VENICE',
  'PERICLES, PRINCE OF TYRE',
  'KING RICHARD THE SECOND',
  'KING RICHARD THE THIRD',
  'THE TRAGEDY OF ROMEO AND JULIET',
  'THE TAMING OF THE SHREW',
  'THE TEMPEST',
  'THE LIFE OF TIMON OF ATHENS',
  'THE TRAGEDY OF TITUS ANDRONICUS',
  'TROILUS AND CRESSIDA',
  'TWELFTH NIGHT; OR, WHAT YOU WILL',
  'THE TWO GENTLEMEN OF VERONA',
  'THE TWO NOBLE KINSMEN',
  'THE WINTER\'S TALE',
  'A LOVER\'S COMPLAINT',
  'THE PASSIONATE PILGRIM',
  'THE PHOENIX AND THE TURTLE',
  'THE RAPE OF LUCRECE',
  'VENUS AND ADONIS'
];

// Function to identify the current work based on text position
function identifyWork(text, position) {
  // Find the most recent work title before this position
  let currentWork = 'UNKNOWN';
  let bestMatch = -1;
  
  for (const work of shakespeareWorks) {
    const workIndex = text.lastIndexOf(work, position);
    if (workIndex !== -1 && workIndex > bestMatch) {
      bestMatch = workIndex;
      currentWork = work;
    }
  }
  
  return currentWork;
}

// Function to check if a line is a speaker line
function isSpeakerLine(line) {
  const trimmedLine = line.trim();
  
  // Speaker lines are all caps, often followed by a period
  // Examples: "HAMLET.", "ROMEO.", "FIRST CITIZEN.", "BENEDICK"
  const speakerPattern = /^([A-Z][A-Z\s,'.-]+?)\.?\s*$/;
  const match = trimmedLine.match(speakerPattern);
  
  if (match) {
    const speaker = match[1].trim();
    
    // Filter out common non-speaker patterns
    const nonSpeakers = [
      'ACT', 'SCENE', 'EPILOGUE', 'PROLOGUE', 'CHORUS', 'CONTENTS',
      'THE END', 'FINIS', 'DRAMATIS PERSONAE', 'PERSONS REPRESENTED',
      'INDUCTION', 'ARGUMENT', 'ENTER', 'EXIT', 'EXEUNT', 'ALARUM',
      'FLOURISH', 'SENNET', 'HAUTBOYS', 'TRUMPETS', 'DRUMS',
      'SCENE I', 'SCENE II', 'SCENE III', 'SCENE IV', 'SCENE V',
      'ACT I', 'ACT II', 'ACT III', 'ACT IV', 'ACT V'
    ];
    
    // Additional checks for valid speakers
    const isValidSpeaker = (
      speaker.length > 1 &&
      speaker.length < 50 && // Reasonable length limit
      !nonSpeakers.some(ns => speaker.startsWith(ns)) &&
      !speaker.match(/^(ACT|SCENE|EPILOGUE|PROLOGUE|ENTER|EXIT|EXEUNT)/) &&
      !speaker.match(/^\d+$/) && // Not just numbers
      !speaker.includes('SCENE') &&
      !speaker.includes('Contents') &&
      !speaker.match(/^[IVX]+$/) // Not just roman numerals
    );
    
    if (isValidSpeaker) {
      return speaker.replace(/\.$/, ''); // Remove trailing period
    }
  }
  
  return null;
}

// Function to check if a line is a sonnet number
function isSonnetNumber(line) {
  // Sonnet numbers are typically just numbers, sometimes with spacing
  const sonnetPattern = /^\\s*([0-9]+)\\s*$/;
  return line.trim().match(sonnetPattern);
}

// Function to count words in a text
function countWords(text) {
  if (!text || typeof text !== 'string') return 0;
  
  return text
    .trim()
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .split(/\s+/)
    .filter(word => word.length > 0 && word.match(/[a-zA-Z0-9]/)) // Only count words with letters/numbers
    .length;
}

// Function to split large chunks into reasonable sizes
function splitLargeChunk(chunk, maxSize = 800) {
  if (chunk.text.length <= maxSize) {
    return [chunk];
  }
  
  const chunks = [];
  const sentences = chunk.text.split(/(?<=[.!?])\s+/);
  let currentText = '';
  let partIndex = 1;
  
  for (const sentence of sentences) {
    // If adding this sentence would exceed the limit, save current chunk
    if (currentText.length + sentence.length > maxSize && currentText.length > 0) {
      chunks.push({
        ...chunk,
        text: currentText.trim(),
        speaker: chunk.speaker ? `${chunk.speaker} (Part ${partIndex})` : chunk.speaker
      });
      currentText = sentence + ' ';
      partIndex++;
    } else {
      currentText += sentence + ' ';
    }
  }
  
  // Add the final chunk
  if (currentText.trim()) {
    chunks.push({
      ...chunk,
      text: currentText.trim(),
      speaker: chunk.speaker && partIndex > 1 ? `${chunk.speaker} (Part ${partIndex})` : chunk.speaker
    });
  }
  
  return chunks;
}

// Function to process the text and extract chunks
function processShakespeareText(text) {
  const chunks = [];
  const lines = text.split('\n');
  
  let currentWork = 'UNKNOWN';
  let currentSpeaker = null;
  let currentChunk = '';
  let chunkId = 0;
  
  // Track if we're in sonnets section
  let inSonnets = false;
  let sonnetNumber = null;
  let sonnetText = '';
  
  // Helper function to save current chunk
  function saveCurrentChunk() {
    if (currentChunk.trim()) {
      const chunk = {
        id: chunkId++,
        work: currentWork,
        speaker: currentSpeaker,
        text: currentChunk.trim()
      };
      
      // Split large chunks into smaller ones
      const splitChunks = splitLargeChunk(chunk);
      chunks.push(...splitChunks);
    }
  }
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Skip empty lines at the beginning of chunks
    if (!trimmedLine && !currentChunk) continue;
    
    // Check if this line is a work title
    const workMatch = shakespeareWorks.find(work => 
      trimmedLine === work || trimmedLine.includes(work)
    );
    
    if (workMatch) {
      // Save previous chunk if exists
      saveCurrentChunk();
      
      // Save final sonnet if in sonnets section
      if (inSonnets && sonnetText.trim()) {
        const sonnetChunk = {
          id: chunkId++,
          work: currentWork,
          speaker: `SONNET ${sonnetNumber}`,
          text: sonnetText.trim()
        };
        chunks.push(sonnetChunk);
      }
      
      currentWork = workMatch;
      inSonnets = workMatch === 'THE SONNETS';
      currentSpeaker = null;
      currentChunk = '';
      sonnetNumber = null;
      sonnetText = '';
      continue;
    }
    
    // Handle sonnets differently
    if (inSonnets) {
      // Check if this is a sonnet number
      const sonnetMatch = isSonnetNumber(trimmedLine);
      if (sonnetMatch) {
        // Save previous sonnet if exists
        if (sonnetText.trim()) {
          const sonnetChunk = {
            id: chunkId++,
            work: currentWork,
            speaker: `SONNET ${sonnetNumber}`,
            text: sonnetText.trim()
          };
          chunks.push(sonnetChunk);
        }
        
        sonnetNumber = sonnetMatch[1];
        sonnetText = '';
        continue;
      }
      
      // Add line to current sonnet
      if (sonnetNumber && trimmedLine) {
        sonnetText += line + '\n';
      }
      continue;
    }
    
    // Handle plays - check for speaker lines
    const speaker = isSpeakerLine(trimmedLine);
    if (speaker) {
      // Save previous chunk if exists
      saveCurrentChunk();
      
      currentSpeaker = speaker;
      currentChunk = '';
      continue;
    }
    
    // Skip stage directions and scene markers
    if (trimmedLine.match(/^(ACT|SCENE|EPILOGUE|PROLOGUE|ENTER|EXIT|EXEUNT|ALARUM|FLOURISH)/)) {
      continue;
    }
    
    // Skip bracketed stage directions
    if (trimmedLine.match(/^\[.*\]$/)) {
      continue;
    }
    
    // Add line to current chunk if we have a speaker and it's meaningful content
    if (currentSpeaker && trimmedLine) {
      currentChunk += line + '\n';
    }
  }
  
  // Save final chunk
  saveCurrentChunk();
  
  // Save final sonnet if in sonnets section
  if (inSonnets && sonnetText.trim()) {
    const sonnetChunk = {
      id: chunkId++,
      work: currentWork,
      speaker: `SONNET ${sonnetNumber}`,
      text: sonnetText.trim()
    };
    chunks.push(sonnetChunk);
  }
  
  return chunks;
}

// Function to clean and validate chunks
function cleanChunks(chunks) {
  return chunks.filter(chunk => {
    // Remove chunks that are too short
    if (chunk.text.length < 10) return false;
    
    // Remove chunks that are mostly stage directions
    const stageDirectionPattern = /^\\s*\\[.*\\]\\s*$/;
    if (stageDirectionPattern.test(chunk.text)) return false;
    
    // Remove chunks that are just scene headers
    if (chunk.text.match(/^(ACT|SCENE|EPILOGUE|PROLOGUE)/)) return false;
    
    // Remove chunks that are just whitespace or punctuation
    if (chunk.text.match(/^\\s*[\\.,;:!?-]*\\s*$/)) return false;
    
    // Remove chunks that are just numbers or roman numerals
    if (chunk.text.match(/^\\s*[0-9IVXivx]+\\s*$/)) return false;
    
    return true;
  }).map((chunk, index) => ({
    ...chunk,
    id: index,
    textLength: chunk.text.length,
    wordCount: countWords(chunk.text)
  }));
}

// Function to upsert vectors to Pinecone
async function upsertVectorsToPinecone(chunks) {
  try {
    console.log('Initializing Pinecone index...');
    
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
    const index = pc.index(INDEX_NAME);
    
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
    
    console.log(`Upserting ${chunks.length} vectors to Pinecone...`);
    
    // Process chunks in batches to avoid overwhelming the API
    const batchSize = 100;
    let normalizedVectorCount = 0;
    
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      
      const vectors = batch.map(chunk => {
        // Generate normalized random vector as placeholder
        const normalizedVector = generateNormalizedRandomVector(1024);
        
        // Verify it's normalized
        if (!isVectorNormalized(normalizedVector)) {
          console.warn(`Vector for chunk ${chunk.id} is not normalized! Magnitude: ${vectorMagnitude(normalizedVector)}`);
        } else {
          normalizedVectorCount++;
        }
        
        return {
          id: chunk.id.toString(),
          values: normalizedVector,
          metadata: {
            work: chunk.work,
            speaker: chunk.speaker,
            text: chunk.text,
            textLength: chunk.textLength,
            wordCount: chunk.wordCount,
            vectorMagnitude: vectorMagnitude(normalizedVector).toFixed(6)
          }
        };
      });
      
      await index.upsert(vectors);
      console.log(`Upserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)}`);
    }
    
    console.log(`Successfully upserted ${chunks.length} vectors to Pinecone`);
    console.log(`Normalized vectors: ${normalizedVectorCount}/${chunks.length}`);
    
    return { success: true, vectorsUpserted: chunks.length };
  } catch (error) {
    console.error('Error upserting vectors to Pinecone:', error);
    throw error;
  }
}

// Main processing function
async function main() {
  console.log('Starting Shakespeare text processing...');
  console.log('Reading file...');
  
  // Process the text
  console.log('Processing text into chunks...');
  const rawChunks = processShakespeareText(shakespeareText);
  console.log(`Found ${rawChunks.length} raw chunks`);
  
  // Clean and validate chunks
  console.log('Cleaning chunks...');
  const cleanedChunks = cleanChunks(rawChunks);
  console.log(`${cleanedChunks.length} chunks after cleaning`);
  
  // Generate statistics
  const stats = {
    totalChunks: cleanedChunks.length,
    works: {},
    speakers: {},
    avgTextLength: 0,
    avgWordCount: 0
  };
  
  let totalTextLength = 0;
  let totalWordCount = 0;
  
  cleanedChunks.forEach(chunk => {
    // Count by work
    if (!stats.works[chunk.work]) {
      stats.works[chunk.work] = 0;
    }
    stats.works[chunk.work]++;
    
    // Count by speaker
    if (chunk.speaker) {
      if (!stats.speakers[chunk.speaker]) {
        stats.speakers[chunk.speaker] = 0;
      }
      stats.speakers[chunk.speaker]++;
    }
    
    totalTextLength += chunk.textLength;
    totalWordCount += chunk.wordCount;
  });
  
  stats.avgTextLength = Math.round(totalTextLength / cleanedChunks.length);
  stats.avgWordCount = Math.round(totalWordCount / cleanedChunks.length);
  
  // Create output object
  const output = {
    metadata: {
      source: 'data/shakespeare-complete-works.txt',
      processedAt: new Date().toISOString(),
      totalWorks: Object.keys(stats.works).length,
      totalSpeakers: Object.keys(stats.speakers).length,
      stats: stats
    },
    chunks: cleanedChunks
  };
  
  // Write to file
  console.log('Writing to vectors.json...');
  writeFileSync('./vectors.json', JSON.stringify(output, null, 2));
  
  // Upsert vectors to Pinecone
  console.log('\\n=== UPSERTING TO PINECONE ===');
  try {
    const result = await upsertVectorsToPinecone(cleanedChunks);
    console.log(`✅ Successfully upserted ${result.vectorsUpserted} vectors to Pinecone`);
  } catch (error) {
    console.error('❌ Failed to upsert vectors to Pinecone:', error.message);
    process.exit(1);
  }
  
  // Display results
  console.log('\\n=== PROCESSING COMPLETE ===');
  console.log(`Total chunks: ${cleanedChunks.length}`);
  console.log(`Total works: ${Object.keys(stats.works).length}`);
  console.log(`Total speakers: ${Object.keys(stats.speakers).length}`);
  console.log(`Average text length: ${stats.avgTextLength} characters`);
  console.log(`Average word count: ${stats.avgWordCount} words`);
  
  console.log('\\nTop 10 works by chunk count:');
  Object.entries(stats.works)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .forEach(([work, count]) => {
      console.log(`  ${work}: ${count} chunks`);
    });
  
  console.log('\\nTop 10 speakers by chunk count:');
  Object.entries(stats.speakers)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .forEach(([speaker, count]) => {
      console.log(`  ${speaker}: ${count} chunks`);
    });
  
  console.log('\\nSample chunks:');
  cleanedChunks.slice(0, 5).forEach((chunk, index) => {
    console.log(`\\n${index + 1}. Work: ${chunk.work}`);
    console.log(`   Speaker: ${chunk.speaker || 'N/A'}`);
    console.log(`   Length: ${chunk.textLength} characters, ${chunk.wordCount} words`);
    console.log(`   Text: "${chunk.text.substring(0, 100)}${chunk.text.length > 100 ? '...' : ''}"`);
    
    // Verify word count
    const verifyCount = countWords(chunk.text);
    if (verifyCount !== chunk.wordCount) {
      console.log(`   WARNING: Word count mismatch! Expected ${verifyCount}, got ${chunk.wordCount}`);
    }
  });
  
  console.log('\\nOutput saved to vectors.json');
  console.log('✅ Vectors successfully upserted to Pinecone database');
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}