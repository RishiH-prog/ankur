import { Interview, AnswerBlock } from "./types";
import { formatDate, formatTimestamp } from "./format";
import { getAnalysis, getQuestionnaire } from "./azure";

/**
 * Fetches prompts from analysis if available
 */
async function fetchPrompts(interview: Interview): Promise<Array<{ index: number; promptText: string; response: string }>> {
  if (!interview.audioId || !interview.guideId) {
    return [];
  }

  try {
    const analysis = await getAnalysis(interview.audioId, interview.guideId, { latest: true });
    const result = analysis?.payload?.result || analysis?.result || {};
    const resultPrompts: Array<any> = result.prompts || [];
    
    if (Array.isArray(resultPrompts) && resultPrompts.length > 0) {
      return resultPrompts.map((p: any) => ({
        index: p.index ?? 0,
        promptText: p.promptText || "",
        response: p.response || "",
      }));
    }
  } catch (error) {
    console.error("Error fetching prompts for download:", error);
  }

  return [];
}

/**
 * Fetches answers for an interview if they're missing
 */
async function ensureInterviewAnswers(interview: Interview, guides: Array<{ id: string; questions: string[] }>): Promise<AnswerBlock[]> {
  // If answers already exist and are populated, return them
  if (interview.answers && Array.isArray(interview.answers) && interview.answers.length > 0) {
    return interview.answers;
  }

  // If we don't have audioId or guideId, can't fetch answers
  if (!interview.audioId || !interview.guideId) {
    return [];
  }

  try {
    // Fetch the analysis
    const analysis = await getAnalysis(interview.audioId, interview.guideId, { latest: true });
    const resultQs: Array<any> = analysis?.payload?.result?.questions || analysis?.result?.questions || [];
    
    // Find the guide to get questions
    let guide = guides.find((g) => g.id === interview.guideId);
    
    // If guide not found in store, fetch it from Azure
    if (!guide) {
      try {
        const questionnaire = await getQuestionnaire(interview.guideId);
        const text = questionnaire?.text || "";
        const questions = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        guide = { id: interview.guideId, questions };
      } catch (e) {
        console.warn("Failed to fetch questionnaire for download:", e);
        return [];
      }
    }

    if (guide && Array.isArray(resultQs) && resultQs.length > 0) {
      // Filter out invalid entries (strings, null, undefined) and ensure we have objects
      const validQuestions = resultQs.filter((q: any) => 
        q && typeof q === "object" && !Array.isArray(q) && (q.answerSummary !== undefined || q.index !== undefined)
      );
      
      // Filter out invalid question text from guide (like "{", "questions": [", etc.)
      const isValidQuestionText = (text: string): boolean => {
        if (!text || typeof text !== "string") return false;
        const trimmed = text.trim();
        // Reject JSON structure elements
        return !(
          trimmed === "{" ||
          trimmed === "}" ||
          trimmed === "[" ||
          trimmed === "]" ||
          trimmed === "]," ||
          trimmed === "}," ||
          trimmed === '"questions": [' ||
          trimmed === '"prompts": [' ||
          trimmed.startsWith('"questions":') ||
          trimmed.startsWith('"prompts":') ||
          /^\s*[\[\]{}]\s*,?\s*$/.test(trimmed) ||
          /^\s*[\[\]{}]\s*$/.test(trimmed)
        );
      };
      
      // Filter guide questions to only valid ones
      const validGuideQuestions = guide.questions.filter(isValidQuestionText);
      
      const mapped: AnswerBlock[] = validGuideQuestions.map((qText, i) => {
        // First try to find by index match
        let found = validQuestions.find((q: any) => q.index === i);
        
        // If not found by index, try by array position (but only if it's a valid object)
        if (!found && validQuestions[i]) {
          found = validQuestions[i];
        }
        
        // If still not found, use empty object
        if (!found) {
          found = {};
        }
        
        // Extract all verbatim quotes with notes
        const allQuotes = Array.isArray(found?.verbatimQuotes) 
          ? found.verbatimQuotes.map((vq: any) => ({
              quote: vq.quote || "",
              note: vq.note || undefined,
            }))
          : undefined;
        return {
          question: qText,
          answer: found?.answerSummary || "",
          quotes: allQuotes && allQuotes.length > 0 ? allQuotes : undefined,
          reasoning: found?.reasoning || undefined,
        } as AnswerBlock;
      });
      return mapped;
    }
  } catch (error) {
    console.error("Error fetching answers for download:", error);
  }

  return [];
}

/**
 * Generates a single interview as a text file
 */
export async function downloadSingleInterview(
  interview: Interview,
  guides: Array<{ id: string; questions: string[] }> = []
): Promise<void> {
  // Fetch answers if missing
  const answers = await ensureInterviewAnswers(interview, guides);
  // Fetch prompts
  const prompts = await fetchPrompts(interview);

  let content = "Interview Summary\n\n";
  content += `Interviewer: ${interview.interviewer}\n`;
  content += `Date: ${formatDate(interview.date)}\n`;
  content += `Village: ${interview.village}\n`;
  content += `Farmer ID: ${interview.farmerName}\n`;
  content += `Guide: ${interview.guideName}\n\n`;

  // Add prompts section
  if (prompts && prompts.length > 0) {
    content += "Prompts & Responses\n";
    content += "=".repeat(80) + "\n\n";
    prompts.forEach((prompt, index) => {
      content += `Prompt ${prompt.index + 1}: ${prompt.promptText}\n`;
      content += `Response: ${prompt.response || "(No response)"}\n\n`;
    });
    content += "\n";
  }

  // Add questions section
  content += "Questions & Answers\n";
  content += "=".repeat(80) + "\n\n";

  // Ensure answers array exists and iterate through it
  if (answers && Array.isArray(answers) && answers.length > 0) {
    answers.forEach((answerBlock, index) => {
      content += `Question ${index + 1}: ${answerBlock.question || ""}\n`;
      content += `Answer: ${answerBlock.answer || ""}\n`;
      if (answerBlock.quotes && Array.isArray(answerBlock.quotes) && answerBlock.quotes.length > 0) {
        answerBlock.quotes.forEach((verbatimQuote, quoteIdx) => {
          content += `Quote ${quoteIdx + 1}: "${verbatimQuote.quote || ""}"\n`;
          if (verbatimQuote.note) {
            content += `  Note: ${verbatimQuote.note}\n`;
          }
        });
      }
      if (answerBlock.reasoning) {
        content += `Reasoning: ${answerBlock.reasoning}\n`;
      }
      content += "\n";
    });
  } else {
    content += "No questions and answers available.\n\n";
  }

  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `interview_${interview.id}_${interview.farmerName}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generates a bulk download of multiple interviews
 */
export async function downloadBulkInterviews(
  interviews: Interview[],
  filterInfo?: string,
  guides: Array<{ id: string; questions: string[] }> = []
): Promise<void> {
  let content = "Interview Summary Report\n\n";
  content += `Generated: ${formatTimestamp()}\n`;
  if (filterInfo) {
    content += `Filters Applied: ${filterInfo}\n`;
  }
  content += `Total Interviews: ${interviews.length}\n`;
  content += "=".repeat(80) + "\n\n";

  // Fetch answers for all interviews
  for (let index = 0; index < interviews.length; index++) {
    const interview = interviews[index];
    const answers = await ensureInterviewAnswers(interview, guides);
    const prompts = await fetchPrompts(interview);

    content += `INTERVIEW ${index + 1} of ${interviews.length}\n`;
    content += "=".repeat(80) + "\n\n";
    content += `Interviewer: ${interview.interviewer}\n`;
    content += `Date: ${formatDate(interview.date)}\n`;
    content += `Village: ${interview.village}\n`;
    content += `Farmer ID: ${interview.farmerName}\n`;
    content += `Guide: ${interview.guideName}\n\n`;

    // Add prompts section
    if (prompts && prompts.length > 0) {
      content += "Prompts & Responses\n";
      content += "-".repeat(80) + "\n\n";
      prompts.forEach((prompt, pIndex) => {
        content += `Prompt ${prompt.index + 1}: ${prompt.promptText}\n`;
        content += `Response: ${prompt.response || "(No response)"}\n\n`;
      });
      content += "\n";
    }

    // Add questions section
    content += "Questions & Answers\n";
    content += "-".repeat(80) + "\n\n";

    // Ensure answers array exists and iterate through it
    if (answers && Array.isArray(answers) && answers.length > 0) {
      answers.forEach((answerBlock, qIndex) => {
        content += `Question ${qIndex + 1}: ${answerBlock.question || ""}\n`;
        content += `Answer: ${answerBlock.answer || ""}\n`;
        if (answerBlock.quotes && Array.isArray(answerBlock.quotes) && answerBlock.quotes.length > 0) {
          answerBlock.quotes.forEach((verbatimQuote, quoteIdx) => {
            content += `Quote ${quoteIdx + 1}: "${verbatimQuote.quote || ""}"\n`;
            if (verbatimQuote.note) {
              content += `  Note: ${verbatimQuote.note}\n`;
            }
          });
        }
        if (answerBlock.reasoning) {
          content += `Reasoning: ${answerBlock.reasoning}\n`;
        }
        content += "\n";
      });
    } else {
      content += "No questions and answers available.\n\n";
    }

    content += "\n";
  }

  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `interviews_bulk_${formatTimestamp(new Date()).replace(/[^a-zA-Z0-9]/g, "_")}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
