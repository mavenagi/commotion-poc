# Commotion Realtime API - Findings & Observations

This document captures learnings, quirks, and observations from testing the Commotion Realtime API.

Last updated: 2026-02-17

---

## ✅ Connection & Authentication (Completed 2026-02-17)

### API Key Format
- **Format**: `sk-realtime-` prefix followed by hex string
- **Method**: Bearer token in `Authorization` header
- **Status**: ✅ Working

### WebSocket Endpoint
```
wss://voice-agent-realtime.models.gocommotion.com/v1/realtime?model={model_name}
```

**Observations:**
- Model is specified as a **query parameter**, not in the path
- Connection establishes immediately with valid credentials
- Clean connection close with status code 1005

---

## 📡 Event Protocol

### Session Lifecycle
```
1. Client connects → WebSocket opens
2. Server sends: session.created
3. Client sends: session.update
4. Server sends: session.updated
```

**Key Observations:**
- Session ID format: `sess_` + 24-char hex string (e.g., `sess_9a6b2e10955b49b7af131716`)
- Voice field is `null` in `session.created`, gets populated after `session.update`
- Events follow OpenAI-compatible structure with `type` field

### Full Event Flow (Audio Streaming)
```
Client                          Server
  |                               |
  |------- audio chunks --------->|
  |                               |---> input_audio_buffer.speech_started
  |                               |---> input_audio_buffer.speech_stopped
  |                               |---> input_audio_buffer.committed
  |                               |---> conversation.item.created
  |                               |---> conversation.item.input_audio_transcription.completed
  |                               |
  |--- input_audio_buffer.commit ->|
  |--- response.create ----------->|
  |                               |---> response.created
  |                               |---> response.output_item.added
  |                               |---> response.content_part.added
  |                               |---> response.audio.delta (streaming)
  |                               |---> response.audio_transcript.delta (streaming)
  |                               |---> response.audio_transcript.done
  |                               |---> response.audio.done
  |                               |---> response.content_part.done
  |                               |---> response.output_item.done
  |                               |---> response.done
```

### Event Types (Confirmed)
| Event | Direction | Purpose | Status |
|-------|-----------|---------|--------|
| `session.created` | Server → Client | Session initialized | ✅ Tested |
| `session.updated` | Server → Client | Config applied | ✅ Tested |
| `session.update` | Client → Server | Configure session | ✅ Tested |
| `input_audio_buffer.append` | Client → Server | Send audio chunk | ✅ Tested |
| `input_audio_buffer.commit` | Client → Server | Finalize audio buffer | ✅ Tested |
| `input_audio_buffer.speech_started` | Server → Client | VAD: speech detected | ✅ Tested |
| `input_audio_buffer.speech_stopped` | Server → Client | VAD: silence detected | ✅ Tested |
| `input_audio_buffer.committed` | Server → Client | Buffer finalized | ✅ Tested |
| `conversation.item.created` | Server → Client | Item added to history | ✅ Tested |
| `conversation.item.input_audio_transcription.completed` | Server → Client | Transcript ready | ✅ Tested |
| `response.create` | Client → Server | Request response | ✅ Tested |
| `response.created` | Server → Client | Response started | ✅ Tested |
| `response.output_item.added` | Server → Client | Output item created | ✅ Tested |
| `response.content_part.added` | Server → Client | Content part added | ✅ Tested |
| `response.audio.delta` | Server → Client | Audio chunk | ✅ Tested |
| `response.audio_transcript.delta` | Server → Client | Transcript chunk | ✅ Tested |
| `response.audio_transcript.done` | Server → Client | Transcript complete | ✅ Tested |
| `response.audio.done` | Server → Client | Audio complete | ✅ Tested |
| `response.content_part.done` | Server → Client | Content complete | ✅ Tested |
| `response.output_item.done` | Server → Client | Output complete | ✅ Tested |
| `response.done` | Server → Client | Response complete | ✅ Tested |

---

## 🎤 Audio Configuration

### Supported Formats
- **PCM16**: 16-bit PCM at 24 kHz ✅ Confirmed
- **G.711 μ-law**: Listed in docs, untested
- **G.711 A-law**: Listed in docs, untested

### Session Audio Config (Tested)
```json
{
  "audio": {
    "input": { "format": "pcm16" },
    "output": { "format": "pcm16" }
  }
}
```

**Status**: ✅ Accepted by API (streaming not yet tested)

---

## 🗣️ Voice Configuration

### Available Voices (from docs)
**Male**: brad, dan, marcus, josh  
**Female**: cassidy, tara (default), zoe, leah, luna

### Tested Voices
- **tara**: ✅ Configuration accepted (audio output not yet tested)

**Observations:**
- Voice is set via `session.update`, not during connection
- Default voice (when unspecified) appears to be `tara`

---

## 🤖 Models

### Available Models
- `commotion-small` - Fast, cost-effective
- `commotion-medium` - Balanced (default) ✅ Tested
- `commotion-large` - Maximum capability

**Tested**: `commotion-medium` - connection and configuration successful

---

## 🎛️ Parameters

### Temperature
- **Range**: Presumably 0.0-2.0 (following OpenAI convention)
- **Tested**: 0.7 ✅ Accepted
- **Default**: Unknown

### Instructions
- **Format**: Plain text string
- **Tested**: System prompt successfully accepted in `session.update`

---

## ⚠️ Known Quirks & Differences from OpenAI

### 1. Voice Field Behavior
- **Observation**: Voice is `null` in `session.created`, even if specified in connection
- **Workaround**: Set voice in `session.update` (intended behavior)

### 2. Model Selection
- **Observation**: Model is a query parameter, not part of the path
- **Comparison**: OpenAI uses path: `/v1/realtime?model=...` (same actually)
- **Status**: Standard WebSocket query param pattern

### 3. Duplicate Events (2026-02-17)
- **Observation**: Some events fire multiple times during response generation:
  - `response.created` (2x)
  - `response.output_item.added` (2x)
  - `response.content_part.added` (2x)
- **Hypothesis**: Multi-part response or internal retry mechanism
- **Impact**: None - doesn't affect functionality, just need to handle gracefully
- **Recommendation**: Deduplicate by event ID if available, or treat as idempotent

### 4. Late Audio Chunks (2026-02-17)
- **Observation**: ~3KB of audio chunks arrived after `response.done` event
- **Impact**: Minimal - audio file still complete and valid
- **Recommendation**: Continue buffering audio.delta events until connection closes or timeout
- **Possible cause**: Network buffering or timing issue

### 5. Audio Buffer Commit Required
- **Observation**: Must explicitly send `input_audio_buffer.commit` before `response.create`
- **Comparison**: OpenAI may handle this automatically or differently
- **Status**: Required step in Commotion protocol

---

## ✅ Audio Streaming (Completed 2026-02-17)

### Sending Audio
- ✅ `input_audio_buffer.append` - Chunks sent successfully
- ✅ Base64 encoding - Working correctly
- ✅ Chunk size - 4800 bytes (~0.1 sec at 24kHz PCM16) works well
- ✅ Streaming timing - 20ms delay between chunks simulates real-time

### Receiving Audio
- ✅ `response.audio.delta` - Receives audio chunks progressively
- ✅ Base64 decoding - Audio reconstructed correctly
- ✅ Output format - PCM16 24kHz mono as configured
- ✅ Audio quality - Good (saved as WAV for verification)

### VAD (Voice Activity Detection)
- ✅ `input_audio_buffer.speech_started` - Fires during streaming
- ✅ `input_audio_buffer.speech_stopped` - Fires after silence
- ✅ Real-time detection - Works during active streaming
- ✅ Sensitivity - Appropriate for speech detection

### Response Generation
- ✅ `response.create` - Triggers response successfully
- ✅ `response.done` - Fires when complete
- ✅ Transcript quality - Automatic transcription working
- ✅ Latency - ~4.8 seconds for 4.47-second response (reasonable)

### Transcription
- ✅ Automatic input transcription via `conversation.item.input_audio_transcription.completed`
- ✅ Streaming transcript during response via `response.audio_transcript.delta`
- ✅ Transcript complete event via `response.audio_transcript.done`

## 🔬 Still Untested

### Response Control
- [ ] `response.cancel` behavior
- [ ] Interrupting ongoing responses

### Error Handling
- [ ] Invalid API key behavior
- [ ] Malformed message handling
- [ ] Rate limiting behavior
- [ ] Connection drop recovery

### Performance
- [ ] End-to-end latency
- [ ] Time-to-first-byte (TTFB)
- [ ] Audio quality at different formats
- [ ] Concurrent connection limits

---

## 📊 Test Results Summary

| Test | Status | Date | Notes |
|------|--------|------|-------|
| WebSocket Connection | ✅ Pass | 2026-02-17 | Clean connection & close |
| Authentication | ✅ Pass | 2026-02-17 | Bearer token works |
| Session Creation | ✅ Pass | 2026-02-17 | Session ID received |
| Session Configuration | ✅ Pass | 2026-02-17 | Voice, temp, audio format accepted |
| Audio Upload (Send) | ✅ Pass | 2026-02-17 | 104 chunks, 484.9 KB in 2.15s |
| Audio Download (Receive) | ✅ Pass | 2026-02-17 | 209.5 KB, 4.47s duration |
| VAD (Speech Detection) | ✅ Pass | 2026-02-17 | Detected speech start/stop |
| Transcription | ✅ Pass | 2026-02-17 | Auto transcription working |
| Response Generation | ✅ Pass | 2026-02-17 | End-to-end ~4.8s latency |
| Audio Quality | ✅ Pass | 2026-02-17 | PCM16 24kHz verified |

---

## 🎯 Recommendations for Integration

### Ready for Use
1. ✅ Connection & authentication flow
2. ✅ Session configuration
3. ✅ Event protocol structure

### Needs Testing Before Production
1. ⏳ Audio streaming reliability
2. ⏳ Latency measurements
3. ⏳ Error handling edge cases
4. ⏳ Long-running session stability

### Integration Notes
- Follow same pattern as OpenAI implementation
- Voice should be configurable per session
- Model selection works via query param
- PCM16 24kHz appears to be the standard format

---

## 🔗 References

- API Endpoint: `wss://voice-agent-realtime.models.gocommotion.com/v1/realtime`
- Health Check: `https://voice-agent-realtime.models.gocommotion.com/health`
- Test Artifacts: `./test-artifacts/`

---

_This document will be updated as we complete additional tests and discover new behaviors._
