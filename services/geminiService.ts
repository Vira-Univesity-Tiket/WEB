
import { ChatMessage } from "../types";

// AI Logic has been completely removed as per project requirements.
// This service now returns a static standard response.

export const getSmartSupportResponse = async (history: ChatMessage[], newMessage: string): Promise<string> => {
  // Simulate a small network delay for realistic UI behavior
  await new Promise(resolve => setTimeout(resolve, 800));
  
  return "پیام شما ثبت شد. کارشناسان ما در اسرع وقت پاسخگو خواهند بود. (سیستم هوشمند غیرفعال است)";
};
