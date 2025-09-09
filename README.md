<img width="1869" height="1006" alt="image" src="https://github.com/user-attachments/assets/09a1b802-3b31-457e-b908-bdb599ec7c3b" />

# GDGoC Prompt Challenge

A project for the Google Developer Groups On Campus (GDGoC) prompt challenge. This React application is an AI-powered image recreation game where players compete to generate the most accurate image based on prompts and beat previous high scores.

## How to Play

1. **Select a Picture**: Choose from available reference images to recreate
2. **Enter Details**: Provide your name and faculty information
3. **Follow the Prompt**: Use the generated prompt to create an image as close as possible to the original reference
4. **Beat the Score**: Compete with other players by achieving higher accuracy scores and climb the leaderboard

The goal is to create the most accurate recreation of the reference image using AI image generation tools, with scoring based on how closely your generated image matches the original.

## Setup

1. **Clone & Install**
```bash
git clone <your-repository-url>
cd gdgoc-prompt-challenge
npm install
```

2. **Add `.env.local`**
```env
# Required
E2B_API_KEY=your_e2b_api_key  # Get from https://e2b.dev (Sandboxes)
FIRECRAWL_API_KEY=your_firecrawl_api_key  # Get from https://firecrawl.dev (Web scraping)

# Optional (need at least one AI provider)
ANTHROPIC_API_KEY=your_anthropic_api_key  # Get from https://console.anthropic.com
OPENAI_API_KEY=your_openai_api_key  # Get from https://platform.openai.com (GPT-5)
GEMINI_API_KEY=your_gemini_api_key  # Get from https://aistudio.google.com/app/apikey
GROQ_API_KEY=your_groq_api_key  # Get from https://console.groq.com (Fast inference - Kimi K2 recommended)
```

3. **Run**
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)  

## License

MIT
