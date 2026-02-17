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

### Event Types (Confirmed)
| Event | Direction | Purpose | Status |
|-------|-----------|---------|--------|
| `session.created` | Server → Client | Session initialized | ✅ Tested |
| `session.updated` | Server → Client | Config applied | ✅ Tested |
| `session.update` | Client → Server | Configure session | ✅ Tested |

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

---

## 🔬 Still Untested

### Audio Streaming
- [ ] Sending audio via `input_audio_buffer.append`
- [ ] Receiving audio via `response.audio.delta`
- [ ] Base64 encoding/decoding correctness
- [ ] Chunk size optimization

### VAD (Voice Activity Detection)
- [ ] `input_audio_buffer.speech_started` events
- [ ] `input_audio_buffer.speech_stopped` events
- [ ] VAD sensitivity/behavior

### Response Generation
- [ ] `response.create` triggering
- [ ] `response.cancel` behavior
- [ ] `response.done` event timing
- [ ] Transcript quality (`response.audio_transcript.delta`)

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
| Audio Streaming | ⏳ Pending | - | Next test |

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
