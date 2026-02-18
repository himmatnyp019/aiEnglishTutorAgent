
import ConversationLog from '../../models/AI/ConversationLog.js';
import UserProfile from '../../models/AI/UserProfile.js';
import PerformanceMetric from '../../models/AI/PerformanceMetric.js';
import { generateTutorResponse } from '../../services/AI/tutorService.js';
import { analyzeAndTrack } from '../../services/AI/analystService.js';
import { HumanMessage, AIMessage } from "@langchain/core/messages";

export const handleChat = async (req, res) => {
  try {
    const { userId, message, fullTranscript } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    // 1. Handling Full Session Completion (From the new Frontend Sync)
    if (message === "SESSION_COMPLETE_TRANSCRIPT" && fullTranscript) {
      const conversation = await ConversationLog.create({
        userId,
        messages: fullTranscript,
        topic: 'Level 1 Interview'
      });
      
      // Trigger evaluation logic in background
      // This will parse the full transcript to find the "FINAL PROGRESS REPORT"
      // and update PerformanceMetric and UserProfile XP
      analyzeAndTrack(userId, conversation._id, fullTranscript[fullTranscript.length - 1].text);
      
      return res.json({ success: true, conversationId: conversation._id });
    }

    // 2. Default logic for text-based fallback or incremental updates
    let userProfile = await UserProfile.findOne({ userId });
    if (!userProfile) {
      userProfile = await UserProfile.create({ userId, currentLevel: 'Beginner' });
    }

    let conversation = await ConversationLog.findOne({ userId }).sort({ createdAt: -1 });
    if (!conversation) {
      conversation = await ConversationLog.create({ userId, messages: [] });
    }

    const history = conversation.messages.slice(-6).map(msg => 
      msg.role === 'user' ? new HumanMessage(msg.content) : new AIMessage(msg.content)
    );

    const aiResponse = await generateTutorResponse(message, history, userProfile.currentLevel);

    conversation.messages.push({ role: 'user', content: message });
    conversation.messages.push({ role: 'assistant', content: aiResponse });
    await conversation.save();

    res.json({
      reply: aiResponse,
      conversationId: conversation._id
    });

    analyzeAndTrack(userId, conversation._id, message);

  } catch (error) {
    console.error("Chat Controller Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// New Controller Method: Get User Profile
export const getUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    let profile = await UserProfile.findOne({ userId });
    if (!profile) {
      profile = await UserProfile.create({ userId, currentLevel: 'Beginner' });
    }
    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: "Profile fetch error" });
  }
};
