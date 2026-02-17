#!/usr/bin/env ts-node
import WebSocket from 'ws';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

const COMMOTION_API_KEY = process.env.COMMOTION_API_KEY;
const COMMOTION_MODEL = process.env.COMMOTION_MODEL || 'commotion-medium';

if (!COMMOTION_API_KEY) {
  console.error('❌ COMMOTION_API_KEY not found in environment');
  process.exit(1);
}

const ENDPOINT = 'wss://voice-agent-realtime.models.gocommotion.com/v1/realtime';
const TEST_DIR = path.join(__dirname, '../test-audio/noise-tests');

interface TestResult {
  filename: string;
  noiseType: string;
  snrLevel: string;
  transcription: string;
  vadEvents: {
    speechStarted: number;
    speechStopped: number;
  };
  success: boolean;
  error?: string;
}

const TEST_SAMPLES = [
  { file: 'clean-speech.pcm', type: 'Clean', snr: 'N/A' },
  { file: 'white-noise-5db.pcm', type: 'White Noise', snr: '+5dB (easy)' },
  { file: 'white-noise-0db.pcm', type: 'White Noise', snr: '0dB (moderate)' },
  { file: 'white-noise-neg5db.pcm', type: 'White Noise', snr: '-5dB (hard)' },
  { file: 'pink-noise-0db.pcm', type: 'Pink Noise', snr: '0dB (crowd/traffic)' },
  { file: 'brown-noise-0db.pcm', type: 'Brown Noise', snr: '0dB (wind/engines)' },
];

function chunkAudio(buffer: Buffer, chunkSize: number = 4800) {
  const chunks: string[] = [];
  for (let i = 0; i < buffer.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, buffer.length);
    const chunk = buffer.slice(i, end);
    chunks.push(chunk.toString('base64'));
  }
  return chunks;
}

async function testAudioSample(filename: string, noiseType: string, snrLevel: string): Promise<TestResult> {
  const result: TestResult = {
    filename,
    noiseType,
    snrLevel,
    transcription: '',
    vadEvents: { speechStarted: 0, speechStopped: 0 },
    success: false,
  };

  return new Promise((resolve) => {
    const audioPath = path.join(TEST_DIR, filename);
    
    if (!fs.existsSync(audioPath)) {
      result.error = 'File not found';
      resolve(result);
      return;
    }

    const audioBuffer = fs.readFileSync(audioPath);
    const chunks = chunkAudio(audioBuffer);

    const url = new URL(ENDPOINT);
    url.searchParams.append('model', COMMOTION_MODEL);

    const ws = new WebSocket(url.toString(), {
      headers: { 'Authorization': `Bearer ${COMMOTION_API_KEY}` },
    });

    let transcriptParts: string[] = [];
    let timeout: NodeJS.Timeout;

    ws.on('open', () => {
      // Configure session
      ws.send(JSON.stringify({
        type: 'session.update',
        session: {
          instructions: 'Transcribe the audio accurately.',
          voice: 'tara',
          temperature: 0.7,
          audio: {
            input: { format: 'pcm16' },
            output: { format: 'pcm16' },
          },
        },
      }));
    });

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case 'session.updated':
            // Stream audio chunks
            for (const chunk of chunks) {
              ws.send(JSON.stringify({
                type: 'input_audio_buffer.append',
                audio: chunk,
              }));
              await new Promise(resolve => setTimeout(resolve, 20));
            }
            
            // Commit and request response
            ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
            ws.send(JSON.stringify({ type: 'response.create' }));
            break;

          case 'input_audio_buffer.speech_started':
            result.vadEvents.speechStarted++;
            break;

          case 'input_audio_buffer.speech_stopped':
            result.vadEvents.speechStopped++;
            break;

          case 'conversation.item.input_audio_transcription.completed':
            if (message.transcript) {
              result.transcription = message.transcript;
            }
            break;

          case 'response.audio_transcript.delta':
            if (message.delta) {
              transcriptParts.push(message.delta);
            }
            break;

          case 'response.done':
            result.success = true;
            if (!result.transcription && transcriptParts.length > 0) {
              result.transcription = transcriptParts.join('');
            }
            ws.close();
            break;

          case 'error':
            result.error = JSON.stringify(message.error);
            ws.close();
            break;
        }
      } catch (err) {
        result.error = `Parse error: ${err}`;
      }
    });

    ws.on('error', (err: Error) => {
      result.error = err.message;
      resolve(result);
    });

    ws.on('close', () => {
      clearTimeout(timeout);
      resolve(result);
    });

    // Timeout after 20 seconds
    timeout = setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        result.error = 'Timeout';
        ws.close();
      }
    }, 20000);
  });
}

async function runAllTests() {
  console.log('🎤 Commotion API - Background Noise Handling Test');
  console.log('━'.repeat(70));
  console.log(`Expected transcription: "The quick brown fox jumps over the lazy dog.`);
  console.log(`This is a test of speech recognition with background noise."`);
  console.log('━'.repeat(70));
  console.log();

  const results: TestResult[] = [];

  for (let i = 0; i < TEST_SAMPLES.length; i++) {
    const sample = TEST_SAMPLES[i];
    console.log(`[${i + 1}/${TEST_SAMPLES.length}] Testing: ${sample.type} (${sample.snr})...`);
    
    const result = await testAudioSample(sample.file, sample.type, sample.snr);
    results.push(result);

    if (result.success) {
      console.log(`   ✅ Success`);
      console.log(`   📝 Transcript: "${result.transcription}"`);
      console.log(`   🎤 VAD: ${result.vadEvents.speechStarted} starts, ${result.vadEvents.speechStopped} stops`);
    } else {
      console.log(`   ❌ Failed: ${result.error || 'Unknown error'}`);
    }
    console.log();

    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Summary
  console.log('━'.repeat(70));
  console.log('📊 SUMMARY');
  console.log('━'.repeat(70));
  console.log();

  const expectedText = "the quick brown fox jumps over the lazy dog this is a test of speech recognition with background noise";
  
  results.forEach((result, i) => {
    const sample = TEST_SAMPLES[i];
    console.log(`${sample.type.padEnd(20)} ${sample.snr.padEnd(20)}`);
    
    if (result.success) {
      const transcriptNorm = result.transcription.toLowerCase().replace(/[.,!?]/g, '').trim();
      const similarity = calculateSimilarity(expectedText, transcriptNorm);
      console.log(`   Accuracy: ~${similarity.toFixed(0)}%`);
      console.log(`   VAD Events: ${result.vadEvents.speechStarted} starts / ${result.vadEvents.speechStopped} stops`);
    } else {
      console.log(`   ❌ ${result.error}`);
    }
    console.log();
  });

  // Save results
  const outputPath = path.join(__dirname, '../test-artifacts/noise-handling-results.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    model: COMMOTION_MODEL,
    expectedTranscription: expectedText,
    results,
  }, null, 2));
  
  console.log(`💾 Results saved to: ${outputPath}`);
}

function calculateSimilarity(expected: string, actual: string): number {
  // Simple word-based similarity
  const expectedWords = expected.split(/\s+/);
  const actualWords = actual.split(/\s+/);
  
  let matches = 0;
  for (const word of expectedWords) {
    if (actualWords.includes(word)) {
      matches++;
    }
  }
  
  return (matches / expectedWords.length) * 100;
}

// Run tests
runAllTests().catch((err) => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
