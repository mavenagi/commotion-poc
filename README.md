# Commotion Realtime API - Proof of Concept

A minimal proof-of-concept project to test and validate the Commotion Realtime API before integrating into the voice-server.

## Purpose

This POC aims to:
1. ✅ Verify WebSocket connection to Commotion API
2. ✅ Test authentication mechanism
3. ⏳ Test audio streaming (send PCM16 audio)
4. ⏳ Test receiving audio responses
5. ⏳ Validate event protocol compatibility with OpenAI format
6. ⏳ Measure latency and performance
7. ⏳ Document any API quirks or undocumented behaviors

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy the example environment file and add your API key:

```bash
cp .env.example .env
# Edit .env and add your COMMOTION_API_KEY
```

### 3. Run Tests

```bash
# Test basic WebSocket connection
npm run test:connect

# Test audio streaming (coming soon)
npm run test:audio
```

## Tests

### `test-connection.ts`
Tests basic WebSocket connection:
- Establishes connection with proper authentication
- Sends `session.update` configuration
- Receives and logs events
- Validates connection handshake

**Expected output:**
```
✅ WebSocket connection opened!
📥 Received event: session.created
📥 Received event: session.updated
✅ Connection test successful!
```

### `test-audio.ts` (TODO)
Tests audio streaming:
- Generates or loads test audio (PCM16, 24kHz)
- Encodes to base64
- Sends via `input_audio_buffer.append`
- Receives audio response
- Decodes and saves response audio

## API Endpoints

### WebSocket
```
wss://voice-agent-realtime.models.gocommotion.com/v1/realtime
```

### Health Check
```
https://voice-agent-realtime.models.gocommotion.com/health
```

## Configuration

### Models
- `commotion-small` - Fast, cost-effective
- `commotion-medium` - Balanced (default)
- `commotion-large` - Maximum capability

### Voices
- **Male**: brad, dan, marcus, josh
- **Female**: cassidy, tara (default), zoe, leah, luna

### Audio Format
- **Sample Rate**: 24 kHz
- **Format**: PCM16 (16-bit PCM)
- **Encoding**: Base64
- **Alternatives**: g711_ulaw, g711_alaw

## Event Protocol

### Client → Server
- `session.update` - Configure session
- `input_audio_buffer.append` - Send audio chunk
- `response.create` - Trigger response
- `response.cancel` - Cancel response

### Server → Client
- `session.created` - Session initialized
- `session.updated` - Config updated
- `input_audio_buffer.speech_started` - User speaking
- `input_audio_buffer.speech_stopped` - User stopped
- `response.audio.delta` - Audio chunk
- `response.audio_transcript.delta` - Transcript chunk
- `response.done` - Response complete
- `error` - Error occurred

## Findings & Notes

### ✅ Confirmed
- (To be filled in after testing)

### ⚠️ Issues/Quirks
- (To be filled in after testing)

### 📊 Performance
- (To be filled in after testing)

## Next Steps

1. Complete basic connection test
2. Implement audio streaming test
3. Test with various audio formats
4. Measure end-to-end latency
5. Document findings in FINDINGS.md
6. Decide on implementation approach for voice-server integration

## References

- [Commotion API Documentation](../highlander/services/voice-server/src/voiceModel/commotion/IMPLEMENTATION_PLAN.md)
- [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime) (for comparison)
