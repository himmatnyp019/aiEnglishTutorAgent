# LinguaLive AI Tutor: Integration Guide

This project provides a real-time, voice-first English Tutor powered by the Gemini 2.5 Live API. Below is the blueprint for integrating this functionality into your existing **React Native** (mobile) and **Node.js/Express/MongoDB** (backend) architecture.

## 1. Backend Integration (Node.js + Express)

Your existing models are excellent. The only requirement is to ensure your routes and controllers match the payload sent by the frontend.

### Routes Configuration
Add this to your `routes/aiRoutes.js`:
```javascript
import express from 'express';
import { handleChat, getUserProfile } from '../controllers/AI/controller.js';

const router = express.Router();

// GET user profile for level-aware tutoring
router.get('/profile/:userId', getUserProfile);

// POST chat messages and session transcripts
router.post('/message', handleChat);

export default router;
```

### Model Check
The provided `ConversationLog`, `PerformanceMetric`, and `UserProfile` models are **good to go**. The frontend has been updated to use the `assistant` role (instead of `tutor`) and `content` property (instead of `text`) to match your Mongoose `MessageSchema` perfectly.

### Recommended Logic for `analyzeAndTrack`
In your `analystService.js`, ensure you parse the "FINAL PROGRESS REPORT" string from the tutor's final message. This allows you to update the `PerformanceMetric` collection automatically.

---

## 2. React Native Integration (Mobile)

Integrating this into React Native requires a shift in how audio is handled compared to the Web version.

### Key Differences:
1. **Audio I/O**: Instead of `window.AudioContext`, use libraries like `react-native-live-audio-stream` for recording and `react-native-sound` or `expo-av` for playback.
2. **WebSocket**: React Native supports standard WebSockets, so the `ai.live.connect` logic remains almost identical.
3. **Permissions**: Ensure you add `NSMicrophoneUsageDescription` (iOS) and `RECORD_AUDIO` (Android) to your mobile project.

### Implementation Strategy:
* **The Logic (Portable)**: Keep the state management (ConnectionStatus, Transcription History, Question Counting) in a custom hook or Redux slice.
* **The Audio (Platform Specific)**: Replace the `AudioContext` references in `App.tsx` with your React Native audio library of choice. You will still send the same `audio/pcm;rate=16000` blobs to Gemini.

---

## 3. Training & "Level-Aware" Tutoring

The AI doesn't need traditional "training" in the machine learning sense. Instead, we use **In-Context Learning** via the `systemInstruction`:

1. **Profile Injection**: Every time a session starts, we fetch the `currentLevel` from your `UserProfile` collection.
2. **Dynamic Prompting**: We inject that level into the System Instruction.
   - *Beginner*: "Use only basic vocabulary and present tense."
   - *Advanced*: "Use complex idioms and workplace scenarios."
3. **Historical Context**: In your backend controller, we pass the last 6 messages from `ConversationLog` back to the model so it remembers the immediate context of the current conversation.

---

## 4. Operational Flowchart

1. **User Login**: Mobile app retrieves `userId`.
2. **Setup**: Mobile app calls `GET /api/ai/profile/:userId`.
3. **Start Session**: App connects to Gemini Live API with a `systemInstruction` customized for that user's level.
4. **Practice**: Real-time audio exchange. The UI displays live transcription.
5. **Evaluation**: Once 10 questions are answered, the AI generates a "Final Report".
6. **Sync**: On `stopSession`, the frontend pushes the full transcript to `POST /api/ai/message`.
7. **Grading**: Backend triggers `analyzeAndTrack`, calculates scores, updates `PerformanceMetric`, and adds XP to `UserProfile`.

## 5. Environment Variables
Ensure your `.env` on the backend includes:
- `API_KEY`: Your Google Gemini API Key.
- `MONGODB_URI`: Your database connection string.
