import { NextRequest, NextResponse } from 'next/server';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';

const googleGenerativeAI = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    // Parse the multipart form data
    const formData = await request.formData();
    const originalImage = formData.get('original') as File;
    const generatedImage = formData.get('generated') as File;

    if (!originalImage || !generatedImage) {
      return NextResponse.json(
        { error: 'Both original and generated images are required' },
        { status: 400 }
      );
    }

    // Convert images to base64
    const originalBuffer = await originalImage.arrayBuffer();
    const generatedBuffer = await generatedImage.arrayBuffer();

    const originalBase64 = Buffer.from(originalBuffer).toString('base64');
    const generatedBase64 = Buffer.from(generatedBuffer).toString('base64');

    // Use Gemini to analyze similarity
    const model = googleGenerativeAI('gemini-2.5-flash');

    const prompt = `Compare these two images and provide a similarity score from 0 to 100, where:
- 100 means the images are identical or nearly identical
- 0 means the images are completely different
- Consider visual similarity, composition, colors, content, and overall appearance

Please analyze both images carefully and provide only a numerical score between 0 and 100 as your response. Do not include any additional text or explanation.`;

    const result = await generateText({
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image',
              image: `data:${originalImage.type};base64,${originalBase64}`,
            },
            {
              type: 'image',
              image: `data:${generatedImage.type};base64,${generatedBase64}`,
            },
          ],
        },
      ],
    });

    // Extract the score from the response
    const responseText = result.text.trim();
    const scoreMatch = responseText.match(/\b(\d{1,3})\b/);
    const score = scoreMatch ? Math.min(100, Math.max(0, parseInt(scoreMatch[1]))) : 0;

    return NextResponse.json({
      score,
      originalImageType: originalImage.type,
      generatedImageType: generatedImage.type,
    });

  } catch (error) {
    console.error('Error analyzing image similarity:', error);
    return NextResponse.json(
      { error: 'Failed to analyze image similarity' },
      { status: 500 }
    );
  }
}
