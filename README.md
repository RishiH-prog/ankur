# Project Ankur — AI Farmer Interview Platform (v0)

A Next.js application for managing farmer interviews with AI-powered transcription and answer extraction.

## Tech Stack

- **Framework**: Next.js 15 with App Router, TypeScript
- **State Management**: Zustand
- **Styling**: Tailwind CSS with shadcn/ui components
- **Forms**: react-hook-form + zod validation
- **Tables**: @tanstack/react-table
- **Toasts**: sonner
- **Icons**: lucide-react

## Getting Started

### Prerequisites

- Node.js 18+ and pnpm (or npm/yarn)

### Installation

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Set up environment variables:**
   
   Copy `.env.local.example` to `.env.local`:
   ```bash
   cp .env.local.example .env.local
   ```
   
   Update `.env.local` with your Azure Function App URL:
   ```env
   NEXT_PUBLIC_AZURE_BASE_URL=https://interview-fge7budmd3h4bkeq.centralindia-01.azurewebsites.net
   ```

3. **Run the development server:**
   ```bash
   pnpm dev
   ```

4. **Open your browser:**
   
   Navigate to [http://localhost:3000](http://localhost:3000)

## Project Structure

```
├── app/
│   ├── layout.tsx          # Root layout with Toaster
│   ├── page.tsx            # Main page with all sections
│   └── globals.css         # Global styles and Tailwind
├── components/
│   ├── ui/                 # shadcn/ui components
│   ├── GuidesAdmin.tsx     # Admin guide management
│   ├── AddInterviewForm.tsx # Employee interview creation
│   ├── InterviewsTable.tsx  # Edit interviews table
│   ├── AllInterviewsAdmin.tsx # Admin view with filters/sort
│   └── InterviewModal.tsx   # Interview view/edit modal
├── lib/
│   ├── types.ts            # TypeScript type definitions
│   ├── storage.ts          # localStorage utilities
│   ├── azure.ts            # Azure API integration
│   ├── download.ts         # Download utilities
│   ├── format.ts           # Date/file formatting
│   ├── placeholders.ts     # GPT placeholder generation
│   ├── toastMessages.ts    # Toast message constants
│   └── utils.ts            # Utility functions
├── store/
│   ├── guides.ts           # Zustand guide store
│   └── interviews.ts       # Zustand interview store
└── package.json
```

## Features

### Admin Workflow

- **Upload Interview Guide**: Upload .txt files with questions (one per line or numbered)
- **Manage Guides**: Toggle active/inactive status, delete guides
- **All Interviews View**: Filter, sort, and bulk download interviews

### Employee Workflow

- **Add Interview**: Create interviews with audio upload to Azure
- **Edit Interviews**: View and edit interview details
- **Audio Transcription**: Automatic Hindi transcription and English translation via Azure

### Interview Management

- **Status Tracking**: Draft → AI-generated → Approved
- **Answer Editing**: Edit answers even after AI generation
- **Download**: Single or bulk download as .txt files

## Azure Integration

The app integrates with Azure Functions for audio processing:

1. **Upload**: Creates SAS URL for direct blob upload
2. **Transcription**: Automatically processes uploaded audio
3. **Polling**: Polls for Hindi transcript and English translation

See `lib/azure.ts` for implementation details.

## Adding GPT Answer Extraction

The codebase is structured to easily add GPT answer extraction:

1. **Current**: Uses `generatePlaceholderAnswers()` in `lib/placeholders.ts`
2. **Future**: Replace with real GPT function call

The placeholder function signature:
```typescript
generatePlaceholderAnswers(
  questions: string[],
  englishTranscript?: string
): AnswerBlock[]
```

To add GPT, create a similar function that calls your GPT API and replace the import in `components/AddInterviewForm.tsx`.

## Data Persistence

- **Current**: localStorage (browser storage)
- **Future**: Can be swapped to JSON files or API by updating `lib/storage.ts`

Storage keys:
- `ankur_guides`: Interview guides
- `ankur_interviews`: Interview records

## Development Commands

```bash
# Development
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Lint code
pnpm lint
```

## License

Private project - All rights reserved
