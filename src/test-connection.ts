#!/usr/bin/env ts-node
import WebSocket from 'ws';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const COMMOTION_API_KEY = process.env.COMMOTION_API_KEY;
const COMMOTION_MODEL = process.env.COMMOTION_MODEL || 'commotion-medium';
const COMMOTION_VOICE = process.env.COMMOTION_VOICE || 'tara';
const COMMOTION_TEMPERATURE = parseFloat(process.env.COMMOTION_TEMPERATURE || '0.7');

if (!COMMOTION_API_KEY) {
  console.error('❌ COMMOTION_API_KEY not found in environment');
  console.error('   Copy .env.example to .env and add your API key');
  process.exit(1);
}

const ENDPOINT = 'wss://voice-agent-realtime.models.gocommotion.com/v1/realtime';

async function testConnection() {
  console.log('🔌 Testing Commotion Realtime API Connection');
  console.log('━'.repeat(60));
  console.log(`📍 Endpoint: ${ENDPOINT}`);
  console.log(`🤖 Model: ${COMMOTION_MODEL}`);
  console.log(`🗣️  Voice: ${COMMOTION_VOICE}`);
  console.log(`🌡️  Temperature: ${COMMOTION_TEMPERATURE}`);
  console.log('━'.repeat(60));

  // Build connection URL with query parameters
  const url = new URL(ENDPOINT);
  url.searchParams.append('model', COMMOTION_MODEL);

  console.log(`\n🔗 Connecting to: ${url.toString()}`);

  const ws = new WebSocket(url.toString(), {
    headers: {
      'Authorization': `Bearer ${COMMOTION_API_KEY}`,
    },
  });

  ws.on('open', () => {
    console.log('✅ WebSocket connection opened!\n');

    // Send session.update to configure the session
    const sessionUpdate = {
      type: 'session.update',
      session: {
        instructions: 'You are a friendly test assistant. Say hello and introduce yourself briefly.',
        voice: COMMOTION_VOICE,
        temperature: COMMOTION_TEMPERATURE,
        audio: {
          input: { format: 'pcm16' },
          output: { format: 'pcm16' },
        },
      },
    };

    console.log('📤 Sending session.update:');
    console.log(JSON.stringify(sessionUpdate, null, 2));
    console.log();

    ws.send(JSON.stringify(sessionUpdate));
  });

  ws.on('message', (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`📥 Received event: ${message.type}`);
      
      // Pretty print important events
      if (message.type === 'session.created') {
        console.log('   Session created:');
        console.log(`   - ID: ${message.session?.id}`);
        console.log(`   - Model: ${message.session?.model}`);
        console.log(`   - Voice: ${message.session?.voice}`);
      } else if (message.type === 'session.updated') {
        console.log('   Session updated successfully');
      } else if (message.type === 'error') {
        console.log('   ❌ Error:', message.error);
      } else {
        // For other events, show compact JSON
        console.log('   Data:', JSON.stringify(message, null, 2).split('\n').slice(0, 5).join('\n'), '...');
      }
      console.log();

      // Close connection after receiving a few events
      if (message.type === 'session.updated') {
        console.log('✅ Connection test successful!');
        console.log('🔌 Closing connection...\n');
        ws.close();
      }
    } catch (err) {
      console.error('❌ Failed to parse message:', err);
      console.error('   Raw data:', data.toString());
    }
  });

  ws.on('error', (err: Error) => {
    console.error('❌ WebSocket error:', err.message);
    console.error('   Full error:', err);
  });

  ws.on('close', (code: number, reason: Buffer) => {
    console.log(`🔌 Connection closed`);
    console.log(`   Code: ${code}`);
    console.log(`   Reason: ${reason.toString() || '(none)'}`);
    console.log('\n✨ Test complete\n');
  });

  // Set timeout to close if nothing happens
  setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log('⏱️  Timeout reached, closing connection...');
      ws.close();
    }
  }, 10000);
}

// Run the test
testConnection().catch((err) => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
