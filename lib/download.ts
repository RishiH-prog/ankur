import { Interview } from "./types";
import { formatDate, formatTimestamp } from "./format";

/**
 * Generates a single interview as a text file
 */
export function downloadSingleInterview(interview: Interview): void {
  let content = "Interview Summary\n\n";
  content += `Interviewer: ${interview.interviewer}\n`;
  content += `Date: ${formatDate(interview.date)}\n`;
  content += `Village: ${interview.village}\n`;
  content += `Farmer ID: ${interview.farmerName}\n`;
  content += `Guide: ${interview.guideName}\n\n`;

  interview.answers.forEach((answerBlock, index) => {
    content += `Question ${index + 1}: ${answerBlock.question}\n`;
    content += `Answer: ${answerBlock.answer}\n`;
    if (answerBlock.quotes && answerBlock.quotes.length > 0) {
      answerBlock.quotes.forEach((verbatimQuote, quoteIdx) => {
        content += `Quote ${quoteIdx + 1}: "${verbatimQuote.quote}"\n`;
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
export function downloadBulkInterviews(
  interviews: Interview[],
  filterInfo?: string
): void {
  let content = "Interview Summary Report\n\n";
  content += `Generated: ${formatTimestamp()}\n`;
  if (filterInfo) {
    content += `Filters Applied: ${filterInfo}\n`;
  }
  content += `Total Interviews: ${interviews.length}\n`;
  content += "=".repeat(80) + "\n\n";

  interviews.forEach((interview, index) => {
    content += `INTERVIEW ${index + 1} of ${interviews.length}\n`;
    content += "=".repeat(80) + "\n\n";
    content += `Interviewer: ${interview.interviewer}\n`;
    content += `Date: ${formatDate(interview.date)}\n`;
    content += `Village: ${interview.village}\n`;
    content += `Farmer ID: ${interview.farmerName}\n`;
    content += `Guide: ${interview.guideName}\n\n`;

    interview.answers.forEach((answerBlock, qIndex) => {
      content += `Question ${qIndex + 1}: ${answerBlock.question}\n`;
      content += `Answer: ${answerBlock.answer}\n`;
      if (answerBlock.quotes && answerBlock.quotes.length > 0) {
        answerBlock.quotes.forEach((verbatimQuote, quoteIdx) => {
          content += `Quote ${quoteIdx + 1}: "${verbatimQuote.quote}"\n`;
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

    content += "\n";
  });

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
