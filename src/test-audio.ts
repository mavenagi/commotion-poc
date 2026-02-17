#!/usr/bin/env ts-node
import WebSocket from 'ws';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

const COMMOTION_API_KEY = process.env.COMMOTION_API_KEY;
const COMMOTION_MODEL = process.env.COMMOTION_MODEL || 'commotion-medium';
const COMMOTION_VOICE = process.env.COMMOTION_VOICE || 'tara';

if (!COMMOTION_API_KEY) {
  console.error('❌ COMMOTION_API_KEY not found in environment');
  process.exit(1);
}

const ENDPOINT = 'wss://voice-agent-realtime.models.gocommotion.com/v1/realtime';
const AUDIO_FILE = path.join(__dirname, '../test-audio/test-speech.pcm');
const OUTPUT_DIR = path.join(__dirname, '../test-audio/responses');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

interface AudioChunk {
  base64: string;
  size: number;
}

function loadAudioFile(): Buffer {
  console.log(`📂 Loading audio file: ${AUDIO_FILE}`);
  if (!fs.existsSync(AUDIO_FILE)) {
    throw new Error(`Audio file not found: ${AUDIO_FILE}`);
  }
  
  const buffer = fs.readFileSync(AUDIO_FILE);
  console.log(`   ✅ Loaded ${buffer.length} bytes (${(buffer.length / 1024).toFixed(1)} KB)`);
  return buffer;
}

function chunkAudio(buffer: Buffer, chunkSize: number = 4800): AudioChunk[] {
  // 4800 bytes = 0.1 seconds at 24kHz mono PCM16 (24000 samples/sec * 2 bytes/sample * 0.1 sec)
  const chunks: AudioChunk[] = [];
  
  for (let i = 0; i < buffer.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, buffer.length);
    const chunk = buffer.slice(i, end);
    chunks.push({
      base64: chunk.toString('base64'),
      size: chunk.length,
    });
  }
  
  console.log(`📦 Created ${chunks.length} chunks of ~${chunkSize} bytes each`);
  return chunks;
}

async function testAudioStreaming() {
  console.log('🎤 Testing Commotion Realtime API - Audio Streaming');
  console.log('━'.repeat(60));
  console.log(`📍 Endpoint: ${ENDPOINT}`);
  console.log(`🤖 Model: ${COMMOTION_MODEL}`);
  console.log(`🗣️  Voice: ${COMMOTION_VOICE}`);
  console.log('━'.repeat(60));
  console.log();

  // Load and chunk audio
  const audioBuffer = loadAudioFile();
  const chunks = chunkAudio(audioBuffer);
  console.log();

  // Build connection URL
  const url = new URL(ENDPOINT);
  url.searchParams.append('model', COMMOTION_MODEL);

  console.log(`🔗 Connecting to: ${url.toString()}\n`);

  const ws = new WebSocket(url.toString(), {
    headers: {
      'Authorization': `Bearer ${COMMOTION_API_KEY}`,
    },
  });

  // Track received audio
  const receivedAudioChunks: Buffer[] = [];
  let sessionId: string | null = null;
  let responseStartTime: number | null = null;

  ws.on('open', () => {
    console.log('✅ WebSocket connection opened!\n');

    // Configure session
    const sessionUpdate = {
      type: 'session.update',
      session: {
        instructions: 'Please respond to the audio message you receive.',
        voice: COMMOTION_VOICE,
        temperature: 0.7,
        audio: {
          input: { format: 'pcm16' },
          output: { format: 'pcm16' },
        },
      },
    };

    console.log('📤 Sending session.update');
    ws.send(JSON.stringify(sessionUpdate));
  });

  ws.on('message', async (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'session.created':
          sessionId = message.session?.id;
          console.log(`📥 Session created: ${sessionId}\n`);
          break;

        case 'session.updated':
          console.log('📥 Session updated - ready to stream audio\n');
          
          // Start streaming audio chunks
          console.log(`🎵 Streaming ${chunks.length} audio chunks...`);
          const startTime = Date.now();
          
          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            
            const appendEvent = {
              type: 'input_audio_buffer.append',
              audio: chunk.base64,
            };
            
            ws.send(JSON.stringify(appendEvent));
            
            // Show progress
            if ((i + 1) % 10 === 0 || i === chunks.length - 1) {
              process.stdout.write(`   Progress: ${i + 1}/${chunks.length} chunks\r`);
            }
            
            // Small delay to simulate real-time streaming (optional)
            await new Promise(resolve => setTimeout(resolve, 20));
          }
          
          const duration = Date.now() - startTime;
          console.log(`\n   ✅ Sent all chunks in ${duration}ms\n`);
          
          // Commit the audio buffer and request response
          console.log('📤 Committing audio buffer...');
          ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
          
          console.log('📤 Requesting response...');
          ws.send(JSON.stringify({ type: 'response.create' }));
          break;

        case 'input_audio_buffer.speech_started':
          console.log('📥 🎤 Speech detected (VAD: speech started)');
          break;

        case 'input_audio_buffer.speech_stopped':
          console.log('📥 🛑 Speech ended (VAD: speech stopped)');
          break;

        case 'input_audio_buffer.committed':
          console.log('📥 ✅ Audio buffer committed\n');
          break;

        case 'response.audio.delta':
          if (!responseStartTime) {
            responseStartTime = Date.now();
            console.log('📥 🔊 Receiving audio response...');
          }
          
          // Decode base64 audio chunk
          if (message.delta) {
            const audioChunk = Buffer.from(message.delta, 'base64');
            receivedAudioChunks.push(audioChunk);
            process.stdout.write(`   Received: ${(receivedAudioChunks.reduce((sum, c) => sum + c.length, 0) / 1024).toFixed(1)} KB\r`);
          }
          break;

        case 'response.audio_transcript.delta':
          if (message.delta) {
            process.stdout.write(message.delta);
          }
          break;

        case 'response.audio_transcript.done':
          console.log('\n\n📝 Transcript complete');
          break;

        case 'response.done':
          console.log('\n📥 ✅ Response complete!\n');
          
          if (receivedAudioChunks.length > 0) {
            // Save received audio
            const audioBuffer = Buffer.concat(receivedAudioChunks);
            const timestamp = Date.now();
            const pcmPath = path.join(OUTPUT_DIR, `response-${timestamp}.pcm`);
            const wavPath = path.join(OUTPUT_DIR, `response-${timestamp}.wav`);
            
            fs.writeFileSync(pcmPath, audioBuffer);
            console.log(`💾 Saved response audio (PCM): ${pcmPath}`);
            console.log(`   Size: ${(audioBuffer.length / 1024).toFixed(1)} KB`);
            
            if (responseStartTime) {
              const latency = Date.now() - responseStartTime;
              console.log(`   Latency: ${latency}ms\n`);
            }
            
            // Convert to WAV for easier playback
            const { execSync } = require('child_process');
            try {
              execSync(`ffmpeg -f s16le -ar 24000 -ac 1 -i "${pcmPath}" "${wavPath}" -y`, { stdio: 'ignore' });
              console.log(`💾 Converted to WAV: ${wavPath}\n`);
            } catch (err) {
              console.log('   (WAV conversion skipped - ffmpeg not available)\n');
            }
          }
          
          console.log('✨ Audio streaming test complete!\n');
          ws.close();
          break;

        case 'error':
          console.error('📥 ❌ Error:', JSON.stringify(message.error, null, 2));
          break;

        default:
          console.log(`📥 ${message.type}`);
          break;
      }
    } catch (err) {
      console.error('❌ Failed to parse message:', err);
    }
  });

  ws.on('error', (err: Error) => {
    console.error('❌ WebSocket error:', err.message);
  });

  ws.on('close', (code: number, reason: Buffer) => {
    console.log(`🔌 Connection closed (code: ${code})`);
    if (reason.length > 0) {
      console.log(`   Reason: ${reason.toString()}`);
    }
  });

  // Timeout after 30 seconds
  setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log('⏱️  Timeout - closing connection...');
      ws.close();
    }
  }, 30000);
}

// Run the test
testAudioStreaming().catch((err) => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
