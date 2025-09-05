import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    console.log('[scrape-screenshot] Scraping URL:', url);

    // Use ScreenshotOne API to capture screenshot
    const screenshotResponse = await fetch(`https://api.screenshotone.com/take?access_key=${process.env.SCREENSHOTONE_API_KEY}&url=${encodeURIComponent(url)}&format=jpg&block_ads=true&block_cookie_banners=true&block_banners_by_heuristics=false&block_trackers=true&delay=0&timeout=60&response_type=by_format&image_quality=80`, {
      method: 'GET',
    });

    if (!screenshotResponse.ok) {
      const errorText = await screenshotResponse.text();
      let errorMessage = 'ScreenshotOne API error';

      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error?.message) {
          errorMessage = errorData.error.message;
        }
      } catch {
        errorMessage = errorText || errorMessage;
      }

      throw new Error(`ScreenshotOne API error: ${errorMessage}`);
    }

    // Get the binary image data
    const imageBuffer = await screenshotResponse.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString('base64');

    console.log('[scrape-screenshot-v2] Screenshot captured successfully');

    return NextResponse.json({
      success: true,
      screenshot: `data:image/jpeg;base64,${base64Image}`,
      metadata: {
        format: 'jpg',
        quality: 80,
        url: url
      }
    });

  } catch (error: any) {
    console.error('Screenshot capture error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to capture screenshot' 
    }, { status: 500 });
  }
}